import {HTTPException} from "hono/http-exception"
import {z} from "zod"

import {getSession, hashToken, requireUser} from "../auth"
import {app, isStaff, now, origin, storageCap, type Context, type SessionUser} from "../lib/app"
import {decodeCursor, encodeCursor} from "../lib/cursor"
import {uniqueMemeId} from "../lib/id"
import {dimensions, sniff} from "../lib/image"
import {MEME_SELECT, toMeme, type MemeRow} from "../lib/meme"
import {deleteMemes, purgeMeme, quotaFor} from "../lib/moderation"
import {buildSearch, normalizeTags} from "../lib/search"
import {sql} from "../lib/sql"
import {stripMetadata} from "../lib/strip"
import {LIMITS, type MemeList, type Sort} from "../lib/types"
import {validate} from "../lib/validate"

const listSchema = z.object({
  cursor: z.string().optional(),
  q: z.string().max(200).optional(),
  sort: z.enum(["new", "top"]).default("new"),
  limit: z.coerce.number().int().min(1).max(100).default(40),
})

const patchSchema = z.object({
  title: z.string().trim().max(LIMITS.titleChars).optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
})

const ORDER: Record<Sort, string> = {
  new: "m.created_at desc, m.id desc",
  top: "m.copies desc, m.id desc",
}

// Keyset pagination: the cursor is the sort key of the last item, so pages stay
// stable while memes are being uploaded above them. Only live memes are public;
// a signed-in user also sees their own pending ones so they know where they went.
export async function listMemes(c: Context, q: z.infer<typeof listSchema>): Promise<MemeList> {
  const viewer = await getSession(c)
  const search = buildSearch(q.q ?? "")
  const clauses = [search.where]
  const params: unknown[] = [...search.params]
  if (viewer) {
    clauses.push("(m.status = 'live' or m.uploader_id = ?)")
    params.push(viewer.id)
  } else {
    clauses.push("m.status = 'live'")
  }
  if (q.cursor) {
    const cursor = decodeCursor(q.cursor, q.sort)
    if (!cursor) throw new HTTPException(400, {message: "Bad cursor"})
    if (cursor.sort === "new") {
      clauses.push("(m.created_at < ? or (m.created_at = ? and m.id < ?))")
      params.push(cursor.createdAt, cursor.createdAt, cursor.id)
    } else {
      clauses.push("(m.copies < ? or (m.copies = ? and m.id < ?))")
      params.push(cursor.copies, cursor.copies, cursor.id)
    }
  }
  const {results} = await c.env.DB.prepare(
    `${MEME_SELECT} where ${clauses.join(" and ")} order by ${ORDER[q.sort]} limit ?`,
  )
    .bind(...params, q.limit + 1)
    .all<MemeRow>()
  const page = results.slice(0, q.limit)
  const last = results.length > q.limit ? page[page.length - 1] : undefined
  const nextCursor = last
    ? encodeCursor(
        q.sort === "new"
          ? {sort: "new", createdAt: last.created_at, id: last.id}
          : {sort: "top", copies: last.copies, id: last.id},
      )
    : null
  return {items: page.map((row) => toMeme(origin(c), row)), nextCursor}
}

export async function findMeme(c: Context, id: string) {
  const row = await c.env.DB.prepare(`${MEME_SELECT} where m.id = ?`).bind(id).first<MemeRow>()
  if (!row) throw new HTTPException(404, {message: "Meme not found"})
  return row
}

// Members only touch their own memes. Staff can touch anything.
async function findOwnOrStaff(c: Context, user: SessionUser, id: string) {
  const row = await findMeme(c, id)
  if (!isStaff(user) && row.uploader_id !== user.id) {
    throw new HTTPException(403, {message: "You can only change your own memes"})
  }
  return row
}

async function checkMemberLimits(c: Context, user: SessionUser, ext: string, bytes: number) {
  if (ext === "gif" && bytes > LIMITS.memberGifBytes) {
    throw new HTTPException(413, {message: "GIFs from members must be under 5 MB"})
  }
  const quota = await quotaFor(c, user.id)
  if (quota.uploadsToday >= quota.uploadsLimit) {
    throw new HTTPException(429, {message: "Daily upload limit reached. Try again tomorrow."})
  }
  if (quota.bytesUsed + bytes > quota.bytesLimit) {
    throw new HTTPException(413, {
      message: "This would pass your storage quota. Delete something of yours first.",
    })
  }
}

export default app()
  .get("/memes", validate("query", listSchema), async (c) => {
    return c.json(await listMemes(c, c.req.valid("query")))
  })

  .get("/memes/:id", async (c) => {
    const row = await findMeme(c, c.req.param("id"))
    if (row.status !== "live") {
      const viewer = await getSession(c)
      if (!viewer || (!isStaff(viewer) && viewer.id !== row.uploader_id)) {
        throw new HTTPException(404, {message: "Meme not found"})
      }
    }
    return c.json(toMeme(origin(c), row))
  })

  .post("/memes/:id/copy", async (c) => {
    const id = c.req.param("id")
    const ip = c.req.header("cf-connecting-ip") ?? "unknown"
    const {success} = await c.env.RATELIMIT_COPY.limit({key: `${ip}:${id}`})
    if (!success) throw new HTTPException(429, {message: "Slow down"})
    c.executionCtx.waitUntil(
      sql(c.env.DB)`update meme set copies = copies + 1 where id = ${id}`.run(),
    )
    return c.body(null, 204)
  })

  // Anyone can report. A couple of reports pull the meme until staff look, which
  // is cheap to undo and far better than leaving something up for hours. Each
  // address counts once per meme and is throttled overall, so one person cannot
  // empty the wall.
  .post("/memes/:id/report", async (c) => {
    const id = c.req.param("id")
    const ip = c.req.header("cf-connecting-ip") ?? "unknown"
    const [perMeme, perIp] = await Promise.all([
      c.env.RATELIMIT_COPY.limit({key: `report:${ip}:${id}`}),
      c.env.RATELIMIT_COPY.limit({key: `report:${ip}`}),
    ])
    if (!perMeme.success || !perIp.success) throw new HTTPException(429, {message: "Slow down"})
    const row = await findMeme(c, id)
    const fresh = await sql(c.env.DB)`
      insert or ignore into report (meme_id, ip_hash, created_at)
      values (${id}, ${await hashToken(ip)}, ${now()})
    `.run()
    if (fresh.meta.changes === 0) return c.body(null, 204)
    const reports = row.reports + 1
    const hide = row.status === "live" && reports >= LIMITS.hideAfterReports
    await sql(c.env.DB)`
      update meme set reports = ${reports}, status = ${hide ? "hidden" : row.status}
      where id = ${id}
    `.run()
    if (hide) await purgeMeme(c, row)
    return c.body(null, 204)
  })

  .post("/memes", async (c) => {
    const user = await requireUser(c)
    const form = await c.req.formData()
    const file = form.get("file")
    if (!(file instanceof File) || file.size === 0) {
      throw new HTTPException(400, {message: "No file"})
    }
    if (file.size > LIMITS.fileBytes) {
      throw new HTTPException(413, {message: "Files must be under 10 MB"})
    }
    const uploaded = new Uint8Array(await file.arrayBuffer())
    const type = sniff(uploaded)
    if (!type)
      throw new HTTPException(415, {message: "Only png, jpg, gif and webp are accepted"})
    // The client strips metadata before upload, but the client is not trusted.
    const bytes = stripMetadata(uploaded, type.ext)
    const size = dimensions(bytes, type.ext)
    if (!size) throw new HTTPException(400, {message: "Could not read the image dimensions"})

    const used = await sql(c.env.DB)`
      select coalesce(sum(size + thumb_size), 0) as total from meme
    `.first<{total: number}>()
    if ((used?.total ?? 0) + bytes.length > storageCap(c.env)) {
      throw new HTTPException(507, {message: "The archive is full. Delete something first."})
    }
    if (!isStaff(user)) await checkMemberLimits(c, user, type.ext, bytes.length)

    const title = patchSchema.shape.title.parse(form.get("title") ?? "") ?? ""
    const tags = normalizeTags(String(form.get("tags") ?? ""))
    const id = await uniqueMemeId(c.env.DB)
    const key = `${id}.${type.ext}`
    // Untrusted members' uploads wait in the review queue.
    const status = user.trusted ? "live" : "pending"

    // Animated GIFs are stored once and shown directly; a still thumbnail would
    // defeat the point of a GIF wall.
    let thumbKey: string | null = null
    let thumbSize = 0
    const thumb = form.get("thumb")
    if (type.ext !== "gif" && thumb instanceof File && thumb.size > 0) {
      const thumbBytes = new Uint8Array(await thumb.arrayBuffer())
      if (sniff(thumbBytes)?.ext === "webp" && thumbBytes.length <= 1024 * 1024) {
        thumbKey = `${id}.t.webp`
        thumbSize = thumbBytes.length
        await c.env.BUCKET.put(thumbKey, thumbBytes, {
          httpMetadata: {contentType: "image/webp"},
        })
      }
    }
    await c.env.BUCKET.put(key, bytes, {httpMetadata: {contentType: type.mime}})
    await sql(c.env.DB)`
      insert into meme (id, key, thumb_key, ext, mime, width, height, size, thumb_size, title, tags,
        uploader_id, created_at, status)
      values (${id}, ${key}, ${thumbKey}, ${type.ext}, ${type.mime}, ${size.width}, ${size.height},
        ${bytes.length}, ${thumbSize}, ${title}, ${tags}, ${user.id}, ${now()}, ${status})
    `.run()
    return c.json(toMeme(origin(c), await findMeme(c, id)), 201)
  })

  .patch("/memes/:id", validate("json", patchSchema), async (c) => {
    const user = await requireUser(c)
    const id = c.req.param("id")
    const body = c.req.valid("json")
    const current = await findOwnOrStaff(c, user, id)
    const title = body.title ?? current.title
    const tags = body.tags === undefined ? current.tags : normalizeTags(body.tags)
    await sql(c.env.DB)`update meme set title = ${title}, tags = ${tags} where id = ${id}`.run()
    return c.json(toMeme(origin(c), await findMeme(c, id)))
  })

  .delete("/memes/:id", async (c) => {
    const user = await requireUser(c)
    const row = await findOwnOrStaff(c, user, c.req.param("id"))
    // The gone placeholder at the old URL is served with a short max-age.
    await deleteMemes(c, [row])
    return c.body(null, 204)
  })
