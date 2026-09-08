import {HTTPException} from "hono/http-exception"
import {z} from "zod"

import {requireAdmin} from "../auth"
import {app, now, origin, storageCap, type Context} from "../lib/app"
import {decodeCursor, encodeCursor} from "../lib/cursor"
import {uniqueMemeId} from "../lib/id"
import {dimensions, sniff} from "../lib/image"
import {MEME_SELECT, toMeme, type MemeRow} from "../lib/meme"
import {buildSearch, normalizeTags} from "../lib/search"
import {sql} from "../lib/sql"
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
// stable while memes are being uploaded above them.
export async function listMemes(c: Context, q: z.infer<typeof listSchema>): Promise<MemeList> {
  const search = buildSearch(q.q ?? "")
  const clauses = [search.where]
  const params: unknown[] = [...search.params]
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

async function findMeme(c: Context, id: string) {
  const row = await c.env.DB.prepare(`${MEME_SELECT} where m.id = ?`).bind(id).first<MemeRow>()
  if (!row) throw new HTTPException(404, {message: "Meme not found"})
  return row
}

const fileUrls = (c: Context, row: MemeRow) => [
  `${origin(c)}/i/${row.id}.${row.ext}`,
  `${origin(c)}/t/${row.id}.webp`,
]

export default app()
  .get("/memes", validate("query", listSchema), async (c) => {
    return c.json(await listMemes(c, c.req.valid("query")))
  })

  .get("/memes/:id", async (c) => {
    return c.json(toMeme(origin(c), await findMeme(c, c.req.param("id"))))
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

  .post("/memes", async (c) => {
    const user = await requireAdmin(c)
    const form = await c.req.formData()
    const file = form.get("file")
    if (!(file instanceof File) || file.size === 0) {
      throw new HTTPException(400, {message: "No file"})
    }
    if (file.size > LIMITS.fileBytes) {
      throw new HTTPException(413, {message: "Files must be under 25 MB"})
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const type = sniff(bytes)
    if (!type)
      throw new HTTPException(415, {message: "Only png, jpg, gif and webp are accepted"})
    const size = dimensions(bytes, type.ext)
    if (!size) throw new HTTPException(400, {message: "Could not read the image dimensions"})

    const used = await sql(c.env.DB)`select coalesce(sum(size), 0) as total from meme`.first<{
      total: number
    }>()
    if ((used?.total ?? 0) + bytes.length > storageCap(c.env)) {
      throw new HTTPException(507, {message: "The archive is full. Delete something first."})
    }

    const title = patchSchema.shape.title.parse(form.get("title") ?? "") ?? ""
    const tags = normalizeTags(String(form.get("tags") ?? ""))
    const id = await uniqueMemeId(c.env.DB)
    const key = `${id}.${type.ext}`

    // Animated GIFs are stored once and shown directly; a still thumbnail would
    // defeat the point of a GIF wall.
    let thumbKey: string | null = null
    const thumb = form.get("thumb")
    if (type.ext !== "gif" && thumb instanceof File && thumb.size > 0) {
      const thumbBytes = new Uint8Array(await thumb.arrayBuffer())
      if (sniff(thumbBytes)?.ext === "webp" && thumbBytes.length <= 1024 * 1024) {
        thumbKey = `${id}.t.webp`
        await c.env.BUCKET.put(thumbKey, thumbBytes, {
          httpMetadata: {contentType: "image/webp"},
        })
      }
    }
    await c.env.BUCKET.put(key, bytes, {httpMetadata: {contentType: type.mime}})
    await sql(c.env.DB)`
      insert into meme (id, key, thumb_key, ext, mime, width, height, size, title, tags, uploader_id, created_at)
      values (${id}, ${key}, ${thumbKey}, ${type.ext}, ${type.mime}, ${size.width}, ${size.height},
        ${bytes.length}, ${title}, ${tags}, ${user.id}, ${now()})
    `.run()
    return c.json(toMeme(origin(c), await findMeme(c, id)), 201)
  })

  .patch("/memes/:id", validate("json", patchSchema), async (c) => {
    await requireAdmin(c)
    const id = c.req.param("id")
    const body = c.req.valid("json")
    const current = await findMeme(c, id)
    const title = body.title ?? current.title
    const tags = body.tags === undefined ? current.tags : normalizeTags(body.tags)
    await sql(c.env.DB)`update meme set title = ${title}, tags = ${tags} where id = ${id}`.run()
    return c.json(toMeme(origin(c), await findMeme(c, id)))
  })

  .delete("/memes/:id", async (c) => {
    await requireAdmin(c)
    const row = await findMeme(c, c.req.param("id"))
    const keys = row.thumb_key ? [row.key, row.thumb_key] : [row.key]
    // The Cache API only purges this colo; other colos age out on their own.
    // The gone placeholder at the old URL is served with a short max-age.
    await Promise.all([
      c.env.BUCKET.delete(keys),
      sql(c.env.DB)`delete from meme where id = ${row.id}`.run(),
      ...fileUrls(c, row).map((url) => caches.default.delete(url)),
    ])
    return c.body(null, 204)
  })
