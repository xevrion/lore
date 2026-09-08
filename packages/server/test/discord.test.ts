import {createExecutionContext, env, SELF} from "cloudflare:test"
import {afterEach, beforeAll, describe, expect, it} from "vitest"

import {hashToken} from "../src/auth"
import app from "../src/index"
import {sql} from "../src/lib/sql"
import type {AuthConfig, CreatedInvite, Me} from "../src/lib/types"
import {discordHttp} from "../src/routes/discord"
import {cookieOf, loginAsOwner, ORIGIN} from "./helpers"

let owner = ""

const createInvite = async () => {
  const res = await SELF.fetch(`${ORIGIN}/api/admin/invites`, {
    method: "POST",
    headers: {cookie: owner},
  })
  const invite = (await res.json()) as CreatedInvite
  return invite.url.split("/join/")[1] ?? ""
}

// Runs the start step and returns the state cookie plus the state Discord would echo back.
async function start(query = "", cookie = "") {
  const res = await SELF.fetch(`${ORIGIN}/api/auth/discord/start${query}`, {
    redirect: "manual",
    headers: cookie ? {cookie} : {},
  })
  expect(res.status).toBe(302)
  const location = new URL(res.headers.get("location") ?? "")
  return {oauthCookie: cookieOf(res), state: location.searchParams.get("state") ?? "", location}
}

// The worker and this test share an isolate, so swapping the fetch used for
// Discord calls is enough to fake the whole OAuth exchange.
const calls: string[] = []
function mockDiscord(user: {
  id: string
  username: string
  global_name?: string
  avatar?: string
}) {
  discordHttp.fetch = async (input, init) => {
    calls.push(`${init?.method ?? "GET"} ${input}`)
    if (input === "https://discord.com/api/oauth2/token") {
      const body = new URLSearchParams(String(init?.body))
      expect(body.get("client_id")).toBe("test-client")
      expect(body.get("client_secret")).toBe("test-secret")
      expect(body.get("code")).toBe("abc")
      return Response.json({access_token: "tok", token_type: "Bearer"})
    }
    if (input === "https://discord.com/api/users/@me") {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer tok")
      return Response.json({global_name: null, avatar: null, ...user})
    }
    throw new Error(`unexpected fetch ${input}`)
  }
}

async function callback(state: string, oauthCookie: string, extraCookie = "") {
  const cookie = [oauthCookie, extraCookie].filter(Boolean).join("; ")
  return SELF.fetch(`${ORIGIN}/api/auth/discord/callback?code=abc&state=${state}`, {
    redirect: "manual",
    headers: {cookie},
  })
}

const sessionCookieOf = (res: Response) =>
  (res.headers.getSetCookie?.() ?? [])
    .find((c) => c.startsWith("lore_session="))
    ?.split(";")[0] ?? ""

describe("discord login", () => {
  const realFetch = discordHttp.fetch

  beforeAll(async () => {
    owner = await loginAsOwner()
  })

  afterEach(() => {
    discordHttp.fetch = realFetch
    calls.length = 0
  })

  it("reports whether it is configured", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/auth/config`)
    expect((await res.json()) as AuthConfig).toEqual({discord: true})

    const off = await app.request(
      `${ORIGIN}/api/auth/config`,
      {},
      {...env, DISCORD_CLIENT_ID: ""},
      createExecutionContext(),
    )
    expect((await off.json()) as AuthConfig).toEqual({discord: false})
  })

  it("sends the browser to Discord with a state cookie", async () => {
    const {oauthCookie, state, location} = await start("?invite=abc")
    expect(oauthCookie).toMatch(/^lore_oauth=/)
    expect(location.origin + location.pathname).toBe("https://discord.com/oauth2/authorize")
    expect(location.searchParams.get("client_id")).toBe("test-client")
    expect(location.searchParams.get("scope")).toBe("identify")
    expect(location.searchParams.get("redirect_uri")).toBe(
      `${ORIGIN}/api/auth/discord/callback`,
    )
    expect(state).toHaveLength(43)
  })

  it("rejects a callback whose state does not match", async () => {
    const {oauthCookie} = await start()
    const res = await callback("wrong", oauthCookie)
    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toBe("/login?error=oauth")
  })

  it("claims an invite, then signs in again without one", async () => {
    const token = await createInvite()
    const first = await start(`?invite=${token}`)
    mockDiscord({id: "1001", username: "riya", global_name: "Riya S"})
    const joined = await callback(first.state, first.oauthCookie)
    expect(joined.status).toBe(302)
    expect(joined.headers.get("location")).toBe("/")
    expect(calls).toEqual([
      "POST https://discord.com/api/oauth2/token",
      "GET https://discord.com/api/users/@me",
    ])
    const session = sessionCookieOf(joined)
    expect(session).toMatch(/^lore_session=/)

    const me = (await (
      await SELF.fetch(`${ORIGIN}/api/auth/me`, {headers: {cookie: session}})
    ).json()) as Me
    expect(me).toMatchObject({name: "Riya S", role: "admin", discordLinked: true})

    const invite = await sql(env.DB)`
      select used_at, used_by from invite where token_hash = ${await hashToken(token)}
    `.first<{used_at: string | null; used_by: string | null}>()
    expect(invite?.used_at).not.toBeNull()
    expect(invite?.used_by).toBe(me.id)

    const again = await start()
    mockDiscord({id: "1001", username: "riya"})
    const back = await callback(again.state, again.oauthCookie)
    expect(back.headers.get("location")).toBe("/")
    expect(sessionCookieOf(back)).toMatch(/^lore_session=/)
  })

  it("turns away revoked and uninvited accounts", async () => {
    const token = await createInvite()
    const first = await start(`?invite=${token}`)
    mockDiscord({id: "2002", username: "dev"})
    const joined = await callback(first.state, first.oauthCookie)
    const me = (await (
      await SELF.fetch(`${ORIGIN}/api/auth/me`, {headers: {cookie: sessionCookieOf(joined)}})
    ).json()) as Me
    await SELF.fetch(`${ORIGIN}/api/admin/users/${me.id}/revoke`, {
      method: "POST",
      headers: {cookie: owner},
    })

    const revoked = await start()
    mockDiscord({id: "2002", username: "dev"})
    expect((await callback(revoked.state, revoked.oauthCookie)).headers.get("location")).toBe(
      "/login?error=revoked",
    )

    const stranger = await start()
    mockDiscord({id: "3003", username: "who"})
    expect((await callback(stranger.state, stranger.oauthCookie)).headers.get("location")).toBe(
      "/login?error=not-invited",
    )
  })

  it("links Discord to the signed-in account", async () => {
    const {oauthCookie, state} = await start("?link=1", owner)
    mockDiscord({id: "4004", username: "yash"})
    const res = await callback(state, oauthCookie, owner)
    expect(res.headers.get("location")).toBe("/settings")
    const me = (await (
      await SELF.fetch(`${ORIGIN}/api/auth/me`, {headers: {cookie: owner}})
    ).json()) as Me
    expect(me.discordLinked).toBe(true)
  })
})
