import {base32} from "@otplib/plugin-base32-scure"
import {crypto as otpCrypto} from "@otplib/plugin-crypto-web"
import {getCookie} from "hono/cookie"
import {HTTPException} from "hono/http-exception"
import {TOTP} from "otplib"
import {z} from "zod"

import {
  clearSessionCookie,
  createSession,
  deleteSession,
  deleteUserSessions,
  getSession,
  hashToken,
  requireAdmin,
  setSessionCookie,
  COOKIE,
} from "../auth"
import {app, discordEnabled, now, origin, type Context, type SessionUser} from "../lib/app"
import {storeAvatar} from "../lib/avatar"
import {pickColor} from "../lib/colors"
import {newId} from "../lib/id"
import {checkInvite, consumeInvite, findInvite, markInviteUsedBy} from "../lib/invite"
import {toUser} from "../lib/meme"
import {sql} from "../lib/sql"
import {LIMITS, type Me} from "../lib/types"
import {validate} from "../lib/validate"

export const me = (c: Context, user: SessionUser): Me => ({
  ...toUser(origin(c), user),
  role: user.role,
  discordLinked: user.discordId !== null,
})

export async function signIn(c: Context, user: SessionUser) {
  const {token} = await createSession(c.env.DB, user.id, c.req.header("user-agent") ?? null)
  setSessionCookie(c, token)
  return me(c, user)
}

const nameSchema = z.string().trim().min(1, "Pick a name").max(LIMITS.nameChars)

export default app()
  .post(
    "/auth/login",
    validate("json", z.object({totp: z.string().regex(/^\d{6}$/)})),
    async (c) => {
      const {totp} = c.req.valid("json")
      const result = await new TOTP({
        secret: c.env.TOTP_SECRET,
        crypto: otpCrypto,
        base32,
      }).verify(totp, {epochTolerance: 30})
      if (!result.valid) throw new HTTPException(400, {message: "Wrong code"})
      // The owner row is created on first login so setup needs nothing but the secret.
      await sql(c.env.DB)`
      insert into user (id, name, role, color, created_at)
      values ('owner', ${c.env.OWNER_NAME || "owner"}, 'owner', ${pickColor()}, ${now()})
      on conflict (id) do nothing
    `.run()
      const owner = await sql(c.env.DB)`
      select id, name, role, color, avatar_key, discord_id from user where id = 'owner'
    `.first<{
        id: string
        name: string
        role: "owner"
        color: string
        avatar_key: string | null
        discord_id: string | null
      }>()
      if (!owner) throw new HTTPException(500, {message: "Owner account missing"})
      return c.json(
        await signIn(c, {...owner, avatarKey: owner.avatar_key, discordId: owner.discord_id}),
      )
    },
  )

  .get("/auth/invite/:token", async (c) => {
    checkInvite(await findInvite(c.env.DB, await hashToken(c.req.param("token"))))
    return c.json({ok: true})
  })

  .post("/auth/join", async (c) => {
    const form = await c.req.formData()
    const token = form.get("token")
    const avatar = form.get("avatar")
    if (typeof token !== "string" || !token) {
      throw new HTTPException(400, {message: "Missing invite token"})
    }
    // With Discord configured, an invite can only be claimed through Discord,
    // otherwise anyone holding the link could join under any name.
    if (discordEnabled(c.env)) {
      throw new HTTPException(403, {message: "This lore uses Discord sign-in"})
    }
    const name = nameSchema.safeParse(form.get("name"))
    if (!name.success)
      throw new HTTPException(400, {message: name.error.issues[0]?.message ?? "Bad name"})
    const tokenHash = await hashToken(token)
    checkInvite(await findInvite(c.env.DB, tokenHash))
    const user: SessionUser = {
      id: newId(10),
      name: name.data,
      role: "admin",
      color: pickColor(),
      avatarKey: null,
      discordId: null,
    }
    await consumeInvite(c.env.DB, tokenHash)
    if (avatar instanceof File && avatar.size > 0) {
      user.avatarKey = await storeAvatar(c.env.BUCKET, user.id, avatar)
    }
    await sql(c.env.DB)`
      insert into user (id, name, role, avatar_key, color, created_at)
      values (${user.id}, ${user.name}, 'admin', ${user.avatarKey}, ${user.color}, ${now()})
    `.run()
    await markInviteUsedBy(c.env.DB, tokenHash, user.id)
    return c.json(await signIn(c, user), 201)
  })

  .get("/auth/me", async (c) => {
    const user = await getSession(c)
    if (!user) throw new HTTPException(401, {message: "Not signed in"})
    return c.json(me(c, user))
  })

  .post("/auth/logout", async (c) => {
    const token = getCookie(c, COOKIE)
    if (token) await deleteSession(c.env.DB, token)
    clearSessionCookie(c)
    return c.body(null, 204)
  })

  .post("/auth/logout-all", async (c) => {
    const user = await requireAdmin(c)
    await deleteUserSessions(c.env.DB, user.id)
    clearSessionCookie(c)
    return c.body(null, 204)
  })
