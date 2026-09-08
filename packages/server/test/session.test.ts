import {env, SELF} from "cloudflare:test"
import {beforeAll, describe, expect, it} from "vitest"

import {
  createSession,
  deleteSession,
  deleteUserSessions,
  hashToken,
  lookupSession,
  newToken,
  SESSION_TTL_MS,
} from "../src/auth"
import {sql} from "../src/lib/sql"
import {loginAsOwner, ORIGIN, totpCode} from "./helpers"

const insertUser = (id: string, role: "owner" | "admin" = "admin") =>
  sql(env.DB)`
    insert into user (id, name, role, color, created_at)
    values (${id}, ${id}, ${role}, '#7c3aed', ${new Date().toISOString()})
  `.run()

describe("sessions", () => {
  beforeAll(async () => {
    await insertUser("alice")
    await insertUser("bob")
  })

  it("stores only a hash and finds the user by the raw token", async () => {
    const {token} = await createSession(env.DB, "alice", "vitest")
    const rows = await sql(env.DB)`select token_hash from session where user_id = 'alice'`.all<{
      token_hash: string
    }>()
    expect(rows.results.map((r) => r.token_hash)).toContain(await hashToken(token))
    expect(rows.results.map((r) => r.token_hash)).not.toContain(token)
    const session = await lookupSession(env.DB, token)
    expect(session?.user.id).toBe("alice")
    expect(session?.refresh).toBe(false)
  })

  it("expires and cleans up", async () => {
    const {token} = await createSession(env.DB, "alice", null)
    await sql(env.DB)`
      update session set expires_at = ${new Date(Date.now() - 1000).toISOString()}
      where token_hash = ${await hashToken(token)}
    `.run()
    expect(await lookupSession(env.DB, token)).toBeNull()
    const left = await sql(env.DB)`
      select 1 from session where token_hash = ${await hashToken(token)}
    `.first()
    expect(left).toBeNull()
  })

  it("asks for a refresh once the session is a day old", async () => {
    const {token} = await createSession(env.DB, "alice", null)
    const aged = new Date(Date.now() + SESSION_TTL_MS - 2 * 86_400_000).toISOString()
    await sql(env.DB)`
      update session set expires_at = ${aged} where token_hash = ${await hashToken(token)}
    `.run()
    expect((await lookupSession(env.DB, token))?.refresh).toBe(true)
  })

  it("rejects unknown tokens and revoked users", async () => {
    expect(await lookupSession(env.DB, newToken())).toBeNull()
    const {token} = await createSession(env.DB, "bob", null)
    await sql(
      env.DB,
    )`update user set revoked_at = ${new Date().toISOString()} where id = 'bob'`.run()
    expect(await lookupSession(env.DB, token)).toBeNull()
  })

  it("deletes one or all sessions", async () => {
    const a = await createSession(env.DB, "alice", null)
    const b = await createSession(env.DB, "alice", null)
    await deleteSession(env.DB, a.token)
    expect(await lookupSession(env.DB, a.token)).toBeNull()
    expect(await lookupSession(env.DB, b.token)).not.toBeNull()
    await deleteUserSessions(env.DB, "alice")
    expect(await lookupSession(env.DB, b.token)).toBeNull()
  })
})

describe("login", () => {
  it("rejects a wrong code and accepts a right one", async () => {
    const bad = await SELF.fetch(`${ORIGIN}/api/auth/login`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({totp: "000000"}),
    })
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({error: "Wrong code"})

    const cookie = await loginAsOwner()
    expect(cookie).toMatch(/^lore_session=/)
    const me = await SELF.fetch(`${ORIGIN}/api/auth/me`, {headers: {cookie}})
    expect(me.status).toBe(200)
    expect(await me.json()).toMatchObject({id: "owner", role: "owner", name: "owner"})

    const out = await SELF.fetch(`${ORIGIN}/api/auth/logout`, {
      method: "POST",
      headers: {cookie},
    })
    expect(out.status).toBe(204)
    expect((await SELF.fetch(`${ORIGIN}/api/auth/me`, {headers: {cookie}})).status).toBe(401)
  })

  it("sets a hardened cookie", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/auth/login`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({totp: await (await import("./helpers")).totpCode()}),
    })
    const cookie = res.headers.get("set-cookie") ?? ""
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("Secure")
    expect(cookie).toContain("SameSite=Lax")
    expect(cookie).toContain("Path=/")
    expect(cookie).toContain("Max-Age=2592000")
  })
})

const attempt = (totp: string) =>
  SELF.fetch(`${ORIGIN}/api/auth/login`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({totp}),
  })

describe("login lockout", () => {
  it("locks after repeated wrong codes and accepts the right one once cleared", async () => {
    await sql(
      env.DB,
    )`update login_lock set failures = 0, locked_until = null where id = 1`.run()
    for (let i = 0; i < 3; i++) expect((await attempt("000000")).status).toBe(400)
    const locked = await attempt(await totpCode())
    expect(locked.status).toBe(429)
    expect(((await locked.json()) as {error: string}).error).toMatch(/Try again in 1 minute/)
    await sql(
      env.DB,
    )`update login_lock set failures = 0, locked_until = null where id = 1`.run()
    expect((await attempt(await totpCode())).status).toBe(200)
  })
})
