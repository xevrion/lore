import {HTTPException} from "hono/http-exception"
import {z} from "zod"

import {requireAdmin} from "../auth"
import {app} from "../lib/app"
import {storeAvatar} from "../lib/avatar"
import {sql} from "../lib/sql"
import {LIMITS} from "../lib/types"
import {me} from "./auth"

const nameSchema = z.string().trim().min(1, "Pick a name").max(LIMITS.nameChars)

export default app().patch("/users/me", async (c) => {
  const user = await requireAdmin(c)
  const form = await c.req.formData()
  const rawName = form.get("name")
  const avatar = form.get("avatar")
  let name = user.name
  if (typeof rawName === "string") {
    const parsed = nameSchema.safeParse(rawName)
    if (!parsed.success) {
      throw new HTTPException(400, {message: parsed.error.issues[0]?.message ?? "Bad name"})
    }
    name = parsed.data
  }
  let avatarKey = user.avatarKey
  if (avatar instanceof File && avatar.size > 0) {
    avatarKey = await storeAvatar(c.env.BUCKET, user.id, avatar)
    if (user.avatarKey) await c.env.BUCKET.delete(user.avatarKey)
  }
  await sql(c.env.DB)`
    update user set name = ${name}, avatar_key = ${avatarKey} where id = ${user.id}
  `.run()
  return c.json(me(c, {...user, name, avatarKey}))
})
