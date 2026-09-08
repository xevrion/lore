import {deleteCookie, getCookie, setCookie} from "hono/cookie"

import {getSession, hashToken, newToken} from "../auth"
import {app, now, origin, type Context, type SessionUser} from "../lib/app"
import {storeAvatar} from "../lib/avatar"
import {pickColor} from "../lib/colors"
import {newId} from "../lib/id"
import {consumeInvite, findInvite, markInviteUsedBy} from "../lib/invite"
import {sql} from "../lib/sql"
import {LIMITS, type AuthConfig} from "../lib/types"
import {signIn} from "./auth"

const OAUTH_COOKIE = "lore_oauth"
const OAUTH_TTL_S = 600

// Outbound calls go through this object so tests can swap in a fake Discord.
export const discordHttp = {
  fetch: (input: string, init?: RequestInit) => fetch(input, init),
}

const enabled = (c: Context) => Boolean(c.env.DISCORD_CLIENT_ID && c.env.DISCORD_CLIENT_SECRET)

const redirectUri = (c: Context) => `${origin(c)}/api/auth/discord/callback`

interface OAuthState {
  state: string
  invite?: string
  link?: boolean
}

interface DiscordUser {
  id: string
  username: string
  global_name: string | null
  avatar: string | null
}

interface UserRow {
  id: string
  name: string
  role: "owner" | "admin"
  color: string
  avatar_key: string | null
  discord_id: string | null
  revoked_at: string | null
}

const toSessionUser = (row: UserRow): SessionUser => ({
  id: row.id,
  name: row.name,
  role: row.role,
  color: row.color,
  avatarKey: row.avatar_key,
  discordId: row.discord_id,
})

// The token never touches storage. It is used for exactly one profile read.
async function fetchDiscordUser(c: Context, code: string): Promise<DiscordUser | null> {
  const token = await discordHttp.fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {"content-type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({
      client_id: c.env.DISCORD_CLIENT_ID ?? "",
      client_secret: c.env.DISCORD_CLIENT_SECRET ?? "",
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(c),
    }),
  })
  if (!token.ok) return null
  const {access_token} = (await token.json()) as {access_token?: string}
  if (!access_token) return null
  const profile = await discordHttp.fetch("https://discord.com/api/users/@me", {
    headers: {authorization: `Bearer ${access_token}`},
  })
  if (!profile.ok) return null
  const user = (await profile.json()) as Partial<DiscordUser>
  if (typeof user.id !== "string" || typeof user.username !== "string") return null
  return {
    id: user.id,
    username: user.username,
    global_name: user.global_name ?? null,
    avatar: user.avatar ?? null,
  }
}

// Best effort: a friend without a Discord avatar, or a CDN hiccup, still gets in.
async function copyAvatar(c: Context, userId: string, discord: DiscordUser) {
  if (!discord.avatar) return null
  try {
    const res = await discordHttp.fetch(
      `https://cdn.discordapp.com/avatars/${discord.id}/${discord.avatar}.png?size=128`,
    )
    if (!res.ok) return null
    const file = new File([await res.arrayBuffer()], "avatar.png")
    return await storeAvatar(c.env.BUCKET, userId, file)
  } catch {
    return null
  }
}

const readState = (c: Context): OAuthState | null => {
  const raw = getCookie(c, OAUTH_COOKIE)
  deleteCookie(c, OAUTH_COOKIE, {path: "/", secure: true})
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<OAuthState>
    return typeof parsed.state === "string" ? (parsed as OAuthState) : null
  } catch {
    return null
  }
}

export default app()
  .get("/auth/config", (c) => {
    const config: AuthConfig = {discord: enabled(c)}
    return c.json(config)
  })

  .get("/auth/discord/start", (c) => {
    if (!enabled(c)) return c.redirect("/login?error=oauth")
    const state: OAuthState = {state: newToken()}
    const invite = c.req.query("invite")
    if (invite) state.invite = invite
    if (c.req.query("link") === "1") state.link = true
    setCookie(c, OAUTH_COOKIE, JSON.stringify(state), {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: OAUTH_TTL_S,
    })
    const params = new URLSearchParams({
      client_id: c.env.DISCORD_CLIENT_ID ?? "",
      response_type: "code",
      scope: "identify",
      redirect_uri: redirectUri(c),
      state: state.state,
      prompt: "none",
    })
    return c.redirect(`https://discord.com/oauth2/authorize?${params}`)
  })

  .get("/auth/discord/callback", async (c) => {
    const saved = readState(c)
    const code = c.req.query("code")
    if (!enabled(c) || !saved || !code || c.req.query("state") !== saved.state) {
      return c.redirect("/login?error=oauth")
    }
    const discord = await fetchDiscordUser(c, code)
    if (!discord) return c.redirect("/login?error=oauth")

    const existing = await sql(c.env.DB)`
      select id, name, role, color, avatar_key, discord_id, revoked_at
      from user where discord_id = ${discord.id}
    `.first<UserRow>()

    if (saved.link) {
      const current = await getSession(c)
      if (!current) return c.redirect("/login?error=oauth")
      if (existing && existing.id !== current.id) {
        return c.redirect("/settings?error=discord-taken")
      }
      await sql(c.env.DB)`
        update user set discord_id = ${discord.id} where id = ${current.id}
      `.run()
      return c.redirect("/settings")
    }

    if (existing) {
      if (existing.revoked_at) return c.redirect("/login?error=revoked")
      await signIn(c, toSessionUser(existing))
      return c.redirect("/")
    }

    if (!saved.invite) return c.redirect("/login?error=not-invited")
    const tokenHash = await hashToken(saved.invite)
    const invite = await findInvite(c.env.DB, tokenHash)
    const usable =
      invite && !invite.used_at && new Date(invite.expires_at).getTime() > Date.now()
    if (!usable) return c.redirect("/login?error=not-invited")
    await consumeInvite(c.env.DB, tokenHash)

    const user: SessionUser = {
      id: newId(10),
      name: (discord.global_name || discord.username).trim().slice(0, LIMITS.nameChars),
      role: "admin",
      color: pickColor(),
      avatarKey: null,
      discordId: discord.id,
    }
    user.avatarKey = await copyAvatar(c, user.id, discord)
    await sql(c.env.DB)`
      insert into user (id, name, role, avatar_key, color, created_at, discord_id)
      values (${user.id}, ${user.name}, 'admin', ${user.avatarKey}, ${user.color}, ${now()}, ${user.discordId})
    `.run()
    await markInviteUsedBy(c.env.DB, tokenHash, user.id)
    await signIn(c, user)
    return c.redirect("/")
  })
