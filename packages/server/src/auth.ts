import {deleteCookie, getCookie, setCookie} from "hono/cookie"
import {HTTPException} from "hono/http-exception"

import type {Context, SessionUser} from "./lib/app"
import {now} from "./lib/app"
import {sql} from "./lib/sql"

export const COOKIE = "lore_session"

const DAY_MS = 86_400_000
export const SESSION_TTL_MS = 30 * DAY_MS
// Refreshing on every request would be a D1 write per page load. Refreshing
// once the session has aged a day keeps it sliding at a fraction of the cost.
const REFRESH_AFTER_MS = DAY_MS

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

export const newToken = () => toBase64Url(crypto.getRandomValues(new Uint8Array(32)))

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

export async function createSession(db: D1Database, userId: string, userAgent: string | null) {
  const token = newToken()
  const createdAt = now()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  await sql(db)`
    insert into session (token_hash, user_id, created_at, expires_at, last_seen_at, user_agent)
    values (${await hashToken(token)}, ${userId}, ${createdAt}, ${expiresAt}, ${createdAt}, ${userAgent})
  `.run()
  return {token, expiresAt}
}

interface SessionRow {
  token_hash: string
  expires_at: string
  id: string
  name: string
  role: "owner" | "admin"
  color: string
  avatar_key: string | null
}

export interface Session {
  user: SessionUser
  expiresAt: string
  refresh: boolean
}

// Revoked users are filtered in the join, so a revoke takes effect on their
// very next request even though their cookie is still technically valid.
export async function lookupSession(db: D1Database, token: string): Promise<Session | null> {
  const tokenHash = await hashToken(token)
  const row = await sql(db)`
    select s.token_hash, s.expires_at, u.id, u.name, u.role, u.color, u.avatar_key
    from session s join user u on u.id = s.user_id
    where s.token_hash = ${tokenHash} and u.revoked_at is null
  `.first<SessionRow>()
  if (!row) return null
  const expires = new Date(row.expires_at).getTime()
  if (expires <= Date.now()) {
    await sql(db)`delete from session where token_hash = ${tokenHash}`.run()
    return null
  }
  return {
    user: {
      id: row.id,
      name: row.name,
      role: row.role,
      color: row.color,
      avatarKey: row.avatar_key,
    },
    expiresAt: row.expires_at,
    refresh: expires - Date.now() < SESSION_TTL_MS - REFRESH_AFTER_MS,
  }
}

export async function refreshSession(db: D1Database, token: string) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  await sql(db)`
    update session set expires_at = ${expiresAt}, last_seen_at = ${now()}
    where token_hash = ${await hashToken(token)}
  `.run()
  return expiresAt
}

export async function deleteSession(db: D1Database, token: string) {
  await sql(db)`delete from session where token_hash = ${await hashToken(token)}`.run()
}

export async function deleteUserSessions(db: D1Database, userId: string) {
  await sql(db)`delete from session where user_id = ${userId}`.run()
}

// Lax rather than Strict: friends tap links to this site from Discord, and a
// Strict cookie would not be sent on that top-level navigation.
export function setSessionCookie(c: Context, token: string) {
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  })
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, COOKIE, {path: "/", secure: true})
}

export async function getSession(c: Context): Promise<SessionUser | null> {
  const cached = c.get("session")
  if (cached !== undefined) return cached
  const token = getCookie(c, COOKIE)
  const session = token ? await lookupSession(c.env.DB, token) : null
  if (!session) {
    if (token) clearSessionCookie(c)
    c.set("session", null)
    return null
  }
  if (session.refresh && token) {
    c.executionCtx.waitUntil(refreshSession(c.env.DB, token))
    setSessionCookie(c, token)
  }
  c.set("session", session.user)
  return session.user
}

export async function requireAdmin(c: Context): Promise<SessionUser> {
  const user = await getSession(c)
  if (!user) throw new HTTPException(401, {message: "Sign in to do that"})
  return user
}

export async function requireOwner(c: Context): Promise<SessionUser> {
  const user = await requireAdmin(c)
  if (user.role !== "owner") throw new HTTPException(403, {message: "Owner only"})
  return user
}
