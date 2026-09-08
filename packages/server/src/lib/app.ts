import {Hono, type Context as HonoContext} from "hono"
import {HTTPException} from "hono/http-exception"

import type {Bindings} from "../env"
import type {Role} from "./types"

export interface SessionUser {
  id: string
  name: string
  role: Role
  color: string
  avatarKey: string | null
  discordId: string | null
  trusted: boolean
  // Staff are always approved; members earn it from an admin.
  approved: boolean
}

export const isStaff = (user: SessionUser) => user.role !== "member"

export type AppEnv = {
  Bindings: Bindings
  Variables: {session?: SessionUser | null}
}

export type Context = HonoContext<AppEnv>

export const app = () => new Hono<AppEnv>()

const isLocalHost = (host: string) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)

// Absolute URLs are built from the Host header rather than request.url:
// `wrangler dev` rewrites request.url to the production route, which would hand
// the Vite dev server links to a domain it cannot reach.
export function origin(c: Context) {
  const host = c.req.header("host") ?? new URL(c.req.url).host
  const local = isLocalHost(host)
  const proto = c.req.header("x-forwarded-proto") === "http" || local ? "http" : "https"
  return `${proto}://${host}`
}

// Cache keys ignore the client-controlled proto header, otherwise a forged
// `X-Forwarded-Proto: http` mints a second key per file and forces a miss.
export function cacheOrigin(c: Context) {
  const host = c.req.header("host") ?? new URL(c.req.url).host
  return `${isLocalHost(host) ? "http" : "https"}://${host}`
}

// SameSite=Lax already keeps cookies off cross-site POSTs; this makes the
// rejection explicit instead of relying on one browser behaviour.
export function requireSameOrigin(c: Context) {
  const site = c.req.header("sec-fetch-site")
  const from = c.req.header("origin")
  if (site === "cross-site" || (from && from !== origin(c))) {
    throw new HTTPException(403, {message: "Cross-site request refused"})
  }
}

// Discord sign-in is on only when both halves of the OAuth app are configured.
export const discordEnabled = (env: Bindings) =>
  Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET)

// Open sign-up: any Discord account can become a member, pending approval.
// Without it the instance stays invite-only.
export const membersEnabled = (env: Bindings) =>
  discordEnabled(env) && env.MEMBER_SIGNUP === "open"

// Optional extra gate on top of open sign-up: the account must be in this server.
export const guildRequired = (env: Bindings) => Boolean(env.DISCORD_GUILD_ID)

export const memberQuotaBytes = (env: Bindings) =>
  Number(env.MEMBER_QUOTA_BYTES) || 200 * 1024 * 1024

export const memberDailyUploads = (env: Bindings) => Number(env.MEMBER_DAILY_UPLOADS) || 20

// R2's free tier is 10 GB counted in decimal gigabytes, so uploads stop at 8 GB
// to leave room for thumbnails, avatars and two uploads landing at once.
export const storageCap = (env: Bindings) =>
  Number(env.STORAGE_CAP_BYTES) || 8 * 1000 * 1000 * 1000

export const now = () => new Date().toISOString()
