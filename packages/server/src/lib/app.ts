import {Hono, type Context as HonoContext} from "hono"

import type {Bindings} from "../env"

export interface SessionUser {
  id: string
  name: string
  role: "owner" | "admin"
  color: string
  avatarKey: string | null
  discordId: string | null
}

export type AppEnv = {
  Bindings: Bindings
  Variables: {session?: SessionUser | null}
}

export type Context = HonoContext<AppEnv>

export const app = () => new Hono<AppEnv>()

// Absolute URLs are built from the Host header rather than request.url:
// `wrangler dev` rewrites request.url to the production route, which would hand
// the Vite dev server links to a domain it cannot reach.
export function origin(c: Context) {
  const host = c.req.header("host") ?? new URL(c.req.url).host
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)
  const proto = c.req.header("x-forwarded-proto") === "http" || local ? "http" : "https"
  return `${proto}://${host}`
}

// Discord sign-in is on only when both halves of the OAuth app are configured.
export const discordEnabled = (env: Bindings) =>
  Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET)

export const now = () => new Date().toISOString()
