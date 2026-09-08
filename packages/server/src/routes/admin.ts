import {HTTPException} from "hono/http-exception"

import {deleteUserSessions, hashToken, newToken, requireOwner} from "../auth"
import {app, now, origin} from "../lib/app"
import {MEME_SELECT, toMeme, toUser, type MemeRow} from "../lib/meme"
import {sql} from "../lib/sql"
import type {AdminStats, AdminUser, CreatedInvite, PendingInvite} from "../lib/types"

const INVITE_TTL_MS = 24 * 60 * 60 * 1000

interface UserRow {
  id: string
  name: string
  role: "owner" | "admin"
  color: string
  avatar_key: string | null
  created_at: string
  revoked_at: string | null
  upload_count: number
  last_seen_at: string | null
}

interface Totals {
  memes: number
  storage_bytes: number
  copies_total: number
  views_total: number
}

export default app()
  .get("/admin/stats", async (c) => {
    await requireOwner(c)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const [totals, recent, top, uploaders] = await c.env.DB.batch([
      c.env.DB.prepare(`
        select count(*) as memes, coalesce(sum(size), 0) as storage_bytes,
          coalesce(sum(copies), 0) as copies_total, coalesce(sum(views), 0) as views_total
        from meme`),
      c.env.DB.prepare("select count(*) as n from meme where created_at > ?").bind(weekAgo),
      c.env.DB.prepare(`${MEME_SELECT} order by m.copies desc, m.id desc limit 10`),
      c.env.DB.prepare(`
        select u.id, u.name, u.color, u.avatar_key, count(m.id) as n
        from user u join meme m on m.uploader_id = u.id
        group by u.id order by n desc, u.created_at asc limit 10`),
    ])
    const t = (totals?.results[0] ?? {}) as Partial<Totals>
    const stats: AdminStats = {
      memes: t.memes ?? 0,
      storageBytes: t.storage_bytes ?? 0,
      copiesTotal: t.copies_total ?? 0,
      viewsTotal: t.views_total ?? 0,
      uploadsLast7d: (recent?.results[0] as {n: number} | undefined)?.n ?? 0,
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
    await requireOwner(c)
    const {results} = await sql(c.env.DB)`
      select u.id, u.name, u.role, u.color, u.avatar_key, u.created_at, u.revoked_at,
        (select count(*) from meme where uploader_id = u.id) as upload_count,
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
    }))
    return c.json(users)
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
    const id = c.req.param("id")
    const user = await sql(c.env.DB)`select role from user where id = ${id}`.first<{
      role: string
    }>()
    if (!user) throw new HTTPException(404, {message: "User not found"})
    if (user.role === "owner")
      throw new HTTPException(400, {message: "The owner cannot be revoked"})
    await sql(c.env.DB)`
      update user set revoked_at = ${now()} where id = ${id} and revoked_at is null
    `.run()
    await deleteUserSessions(c.env.DB, id)
    return c.body(null, 204)
  })
