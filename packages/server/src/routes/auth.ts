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
import {app, now, origin, type Context, type SessionUser} from "../lib/app"
import {storeAvatar} from "../lib/avatar"
import {pickColor} from "../lib/colors"
import {newId} from "../lib/id"
import {toUser} from "../lib/meme"
import {sql} from "../lib/sql"
import {LIMITS, type Me} from "../lib/types"
import {validate} from "../lib/validate"

const me = (c: Context, user: SessionUser): Me => ({
  ...toUser(origin(c), user),
  role: user.role,
})

async function signIn(c: Context, user: SessionUser) {
  const {token} = await createSession(c.env.DB, user.id, c.req.header("user-agent") ?? null)
  setSessionCookie(c, token)
  return me(c, user)
}

interface InviteRow {
  used_at: string | null
  expires_at: string
}

function checkInvite(invite: InviteRow | null) {
  if (!invite) throw new HTTPException(404, {message: "This invite link is not valid"})
  if (invite.used_at)
    throw new HTTPException(410, {message: "This invite has already been used"})
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    throw new HTTPException(410, {message: "This invite has expired"})
  }
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
      select id, name, role, color, avatar_key from user where id = 'owner'
    `.first<{
        id: string
        name: string
        role: "owner"
        color: string
        avatar_key: string | null
      }>()
      if (!owner) throw new HTTPException(500, {message: "Owner account missing"})
      return c.json(await signIn(c, {...owner, avatarKey: owner.avatar_key}))
    },
  )

  .get("/auth/invite/:token", async (c) => {
    const invite = await sql(c.env.DB)`
      select used_at, expires_at from invite where token_hash = ${await hashToken(c.req.param("token"))}
    `.first<InviteRow>()
    checkInvite(invite)
    return c.json({ok: true})
  })

  .post("/auth/join", async (c) => {
    const form = await c.req.formData()
    const token = form.get("token")
    const avatar = form.get("avatar")
    if (typeof token !== "string" || !token) {
      throw new HTTPException(400, {message: "Missing invite token"})
    }
    const name = nameSchema.safeParse(form.get("name"))
    if (!name.success)
      throw new HTTPException(400, {message: name.error.issues[0]?.message ?? "Bad name"})
    const tokenHash = await hashToken(token)
    const invite = await sql(c.env.DB)`
      select used_at, expires_at from invite where token_hash = ${tokenHash}
    `.first<InviteRow>()
    checkInvite(invite)
    const user: SessionUser = {
      id: newId(10),
      name: name.data,
      role: "admin",
      color: pickColor(),
      avatarKey: null,
    }
    // Consuming the invite first, with the `used_at is null` guard, means two
    // people racing on the same link cannot both get in.
    const consumed = await sql(c.env.DB)`
      update invite set used_at = ${now()} where token_hash = ${tokenHash} and used_at is null
    `.run()
    if (consumed.meta.changes !== 1) {
      throw new HTTPException(410, {message: "This invite has already been used"})
    }
    if (avatar instanceof File && avatar.size > 0) {
      user.avatarKey = await storeAvatar(c.env.BUCKET, user.id, avatar)
    }
    await sql(c.env.DB)`
      insert into user (id, name, role, avatar_key, color, created_at)
      values (${user.id}, ${user.name}, 'admin', ${user.avatarKey}, ${user.color}, ${now()})
    `.run()
    await sql(
      c.env.DB,
    )`update invite set used_by = ${user.id} where token_hash = ${tokenHash}`.run()
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
