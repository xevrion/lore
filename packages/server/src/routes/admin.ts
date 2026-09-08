import {HTTPException} from "hono/http-exception"
import {z} from "zod"

import {deleteUserSessions, hashToken, newToken, requireOwner, requireStaff} from "../auth"
import {app, now, origin, storageCap, type Context} from "../lib/app"
import {decodeCursor, encodeCursor} from "../lib/cursor"
import {MEME_SELECT, toMeme, toUser, type MemeRow} from "../lib/meme"
import {deleteMemes, purgeMeme} from "../lib/moderation"
import {sql} from "../lib/sql"
import {
  LIMITS,
  type AdminStats,
  type AdminUser,
  type CreatedInvite,
  type MemeList,
  type PendingInvite,
  type Role,
} from "../lib/types"
import {validate} from "../lib/validate"
import {findMeme} from "./memes"

const INVITE_TTL_MS = 24 * 60 * 60 * 1000

interface UserRow {
  id: string
  name: string
  role: Role
  color: string
  avatar_key: string | null
  created_at: string
  revoked_at: string | null
  banned_at: string | null
  trusted: number
  upload_count: number
  bytes_used: number
  pending_count: number
  last_seen_at: string | null
  discord_id: string | null
}

interface Totals {
  memes: number
  pending: number
  hidden: number
  storage_bytes: number
  copies_total: number
  views_total: number
}

const reviewSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
})

async function findUser(c: Context, id: string) {
  const user = await sql(c.env.DB)`
    select id, role, avatar_key from user where id = ${id}
  `.first<{id: string; role: Role; avatar_key: string | null}>()
  if (!user) throw new HTTPException(404, {message: "User not found"})
  return user
}

// Ten approved memes is enough to know a member is not here to cause trouble.
async function maybeTrust(c: Context, uploaderId: string) {
  const live = await sql(c.env.DB)`
    select count(*) as n from meme where uploader_id = ${uploaderId} and status = 'live'
  `.first<{n: number}>()
  if ((live?.n ?? 0) >= LIMITS.trustAfterApprovals) {
    await sql(c.env.DB)`
      update user set trusted = 1 where id = ${uploaderId} and role = 'member'
    `.run()
  }
}

export default app()
  .get("/admin/stats", async (c) => {
    await requireStaff(c)
    // Expired sessions are otherwise only removed when their token shows up again.
    c.executionCtx.waitUntil(
      sql(c.env.DB)`delete from session where expires_at < ${now()}`.run(),
    )
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    // Storage counts everything on disk; the other numbers describe the public wall.
    const [totals, recent, top, uploaders] = await c.env.DB.batch([
      c.env.DB.prepare(`
        select sum(case when status = 'live' then 1 else 0 end) as memes,
          sum(case when status = 'pending' then 1 else 0 end) as pending,
          sum(case when status = 'hidden' then 1 else 0 end) as hidden,
          coalesce(sum(size + thumb_size), 0) as storage_bytes,
          coalesce(sum(copies), 0) as copies_total, coalesce(sum(views), 0) as views_total
        from meme`),
      c.env.DB.prepare("select count(*) as n from meme where created_at > ?").bind(weekAgo),
      c.env.DB.prepare(
        `${MEME_SELECT} where m.status = 'live' order by m.copies desc, m.id desc limit 10`,
      ),
      c.env.DB.prepare(`
        select u.id, u.name, u.color, u.avatar_key, count(m.id) as n
        from user u join meme m on m.uploader_id = u.id and m.status = 'live'
        group by u.id order by n desc, u.created_at asc limit 10`),
    ])
    const t = (totals?.results[0] ?? {}) as Partial<Totals>
    const stats: AdminStats = {
      memes: t.memes ?? 0,
      storageBytes: t.storage_bytes ?? 0,
      storageCap: storageCap(c.env),
      copiesTotal: t.copies_total ?? 0,
      viewsTotal: t.views_total ?? 0,
      uploadsLast7d: (recent?.results[0] as {n: number} | undefined)?.n ?? 0,
      pendingCount: t.pending ?? 0,
      hiddenCount: t.hidden ?? 0,
      topMemes: ((top?.results ?? []) as MemeRow[]).map((row) => toMeme(origin(c), row)),
      topUploaders: (
        (uploaders?.results ?? []) as {
          id: string
          name: string
          color: string
          avatar_key: string | null
          n: number
        }[]
      ).map((u) => ({
        user: toUser(origin(c), {
          id: u.id,
          name: u.name,
          color: u.color,
          avatarKey: u.avatar_key,
        }),
        count: u.n,
      })),
    }
    return c.json(stats)
  })

  .get("/admin/users", async (c) => {
    await requireStaff(c)
    const {results} = await sql(c.env.DB)`
      select u.id, u.name, u.role, u.color, u.avatar_key, u.created_at, u.revoked_at,
        u.banned_at, u.trusted, u.discord_id,
        (select count(*) from meme where uploader_id = u.id) as upload_count,
        (select coalesce(sum(size + thumb_size), 0) from meme where uploader_id = u.id) as bytes_used,
        (select count(*) from meme where uploader_id = u.id and status = 'pending') as pending_count,
        (select max(last_seen_at) from session where user_id = u.id) as last_seen_at
      from user u order by u.created_at asc
    `.all<UserRow>()
    const users: AdminUser[] = results.map((u) => ({
      ...toUser(origin(c), {id: u.id, name: u.name, color: u.color, avatarKey: u.avatar_key}),
      role: u.role,
      uploadCount: u.upload_count,
      createdAt: u.created_at,
      revokedAt: u.revoked_at,
      lastSeenAt: u.last_seen_at,
      discordLinked: u.discord_id !== null,
      trusted: u.trusted === 1,
      bannedAt: u.banned_at,
      bytesUsed: u.bytes_used,
      pendingCount: u.pending_count,
    }))
    return c.json(users)
  })

  // Oldest first, so the longest wait is dealt with first. Same keyset cursor
  // as the wall, walked in the other direction.
  .get("/admin/review", validate("query", reviewSchema), async (c) => {
    await requireStaff(c)
    const q = c.req.valid("query")
    const clauses = ["m.status != 'live'"]
    const params: unknown[] = []
    if (q.cursor) {
      const cursor = decodeCursor(q.cursor, "new")
      if (!cursor || cursor.sort !== "new")
        throw new HTTPException(400, {message: "Bad cursor"})
      clauses.push("(m.created_at > ? or (m.created_at = ? and m.id > ?))")
      params.push(cursor.createdAt, cursor.createdAt, cursor.id)
    }
    const {results} = await c.env.DB.prepare(
      `${MEME_SELECT} where ${clauses.join(" and ")} order by m.created_at asc, m.id asc limit ?`,
    )
      .bind(...params, q.limit + 1)
      .all<MemeRow>()
    const page = results.slice(0, q.limit)
    const last = results.length > q.limit ? page[page.length - 1] : undefined
    const list: MemeList = {
      items: page.map((row) => toMeme(origin(c), row)),
      nextCursor: last
        ? encodeCursor({sort: "new", createdAt: last.created_at, id: last.id})
        : null,
    }
    return c.json(list)
  })

  // Files under review are 404 in public, so the queue reads them through here.
  // Always the original: the thumbnail came from the uploader's browser and may
  // show something else entirely.
  .get("/admin/memes/:id/file", async (c) => {
    await requireStaff(c)
    const row = await findMeme(c, c.req.param("id"))
    const object = await c.env.BUCKET.get(row.key)
    if (!object) throw new HTTPException(404, {message: "File missing"})
    return new Response(object.body, {
      headers: {
        "content-type": row.mime,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    })
  })

  .post("/admin/memes/:id/approve", async (c) => {
    await requireStaff(c)
    const row = await findMeme(c, c.req.param("id"))
    await sql(c.env.DB)`
      update meme set status = 'live', reports = 0 where id = ${row.id}
    `.run()
    await purgeMeme(c, row)
    await maybeTrust(c, row.uploader_id)
    return c.json(toMeme(origin(c), await findMeme(c, row.id)))
  })

  .post("/admin/memes/:id/hide", async (c) => {
    await requireStaff(c)
    const row = await findMeme(c, c.req.param("id"))
    await sql(c.env.DB)`update meme set status = 'hidden' where id = ${row.id}`.run()
    await purgeMeme(c, row)
    return c.json(toMeme(origin(c), await findMeme(c, row.id)))
  })

  .post(
    "/admin/users/:id/trust",
    validate("json", z.object({trusted: z.boolean()})),
    async (c) => {
      await requireStaff(c)
      const target = await findUser(c, c.req.param("id"))
      if (target.role !== "member") {
        throw new HTTPException(400, {message: "Only members have a trust setting"})
      }
      await sql(c.env.DB)`
      update user set trusted = ${c.req.valid("json").trusted ? 1 : 0} where id = ${target.id}
    `.run()
      return c.body(null, 204)
    },
  )

  // Ban is revoke plus erasure: every meme they uploaded goes, links and all.
  .post("/admin/users/:id/ban", async (c) => {
    const actor = await requireStaff(c)
    const target = await findUser(c, c.req.param("id"))
    if (target.role === "owner") {
      throw new HTTPException(400, {message: "The owner cannot be banned"})
    }
    if (target.role === "admin" && actor.role !== "owner") {
      throw new HTTPException(403, {message: "Only the owner can ban an admin"})
    }
    const {results} = await sql(c.env.DB)`
      select id, ext, key, thumb_key from meme where uploader_id = ${target.id}
    `.all<Pick<MemeRow, "id" | "ext" | "key" | "thumb_key">>()
    await deleteMemes(c, results)
    await sql(c.env.DB)`
      update user set banned_at = ${now()}, revoked_at = coalesce(revoked_at, ${now()}),
        avatar_key = null
      where id = ${target.id}
    `.run()
    await deleteUserSessions(c.env.DB, target.id)
    if (target.avatar_key) await c.env.BUCKET.delete(target.avatar_key)
    return c.json({deleted: results.length})
  })

  .post("/admin/invites", async (c) => {
    const owner = await requireOwner(c)
    // Only the hash is stored, so this response is the one time the link exists.
    const token = newToken()
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString()
    await sql(c.env.DB)`
      insert into invite (token_hash, created_by, created_at, expires_at)
      values (${await hashToken(token)}, ${owner.id}, ${now()}, ${expiresAt})
    `.run()
    const invite: CreatedInvite = {url: `${origin(c)}/join/${token}`, expiresAt}
    return c.json(invite, 201)
  })

  .get("/admin/invites", async (c) => {
    await requireOwner(c)
    const {results} = await sql(c.env.DB)`
      select token_hash, created_at, expires_at from invite
      where used_at is null and expires_at > ${now()}
      order by created_at desc
    `.all<{token_hash: string; created_at: string; expires_at: string}>()
    const invites: PendingInvite[] = results.map((i) => ({
      tokenHash: i.token_hash,
      createdAt: i.created_at,
      expiresAt: i.expires_at,
    }))
    return c.json(invites)
  })

  .delete("/admin/invites/:tokenHash", async (c) => {
    await requireOwner(c)
    const result = await sql(c.env.DB)`
      delete from invite where token_hash = ${c.req.param("tokenHash")} and used_at is null
    `.run()
    if (result.meta.changes === 0) throw new HTTPException(404, {message: "Invite not found"})
    return c.body(null, 204)
  })

  .post("/admin/users/:id/revoke", async (c) => {
    await requireOwner(c)
    const target = await findUser(c, c.req.param("id"))
    if (target.role === "owner")
      throw new HTTPException(400, {message: "The owner cannot be revoked"})
    await sql(c.env.DB)`
      update user set revoked_at = ${now()} where id = ${target.id} and revoked_at is null
    `.run()
    await deleteUserSessions(c.env.DB, target.id)
    return c.body(null, 204)
  })
