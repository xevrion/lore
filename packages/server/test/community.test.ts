import {createExecutionContext, env, SELF} from "cloudflare:test"
import {afterEach, beforeAll, describe, expect, it} from "vitest"

import {createSession} from "../src/auth"
import app from "../src/index"
import {sql} from "../src/lib/sql"
import type {AdminUser, Me, Meme, MemeList} from "../src/lib/types"
import {discordHttp} from "../src/routes/discord"
import {cookieOf, loginAsOwner, ORIGIN, TINY_GIF, TINY_PNG, upload} from "./helpers"

let owner = ""
let counter = 0

// A member row plus a session, without going through Discord each time.
async function memberSession(trusted = 0) {
  const id = `m${++counter}${Date.now().toString(36)}`
  await sql(env.DB)`
    insert into user (id, name, role, color, created_at, discord_id, trusted)
    values (${id}, ${`member ${id}`}, 'member', '#8b5cf6', ${new Date().toISOString()},
      ${`d-${id}`}, ${trusted})
  `.run()
  const {token} = await createSession(env.DB, id, null)
  return {id, cookie: `lore_session=${token}`}
}

const publicList = async () =>
  (await (await SELF.fetch(`${ORIGIN}/api/memes`)).json()) as MemeList

const fileStatus = async (meme: Meme) => (await SELF.fetch(meme.url)).status

async function start(query = "") {
  const res = await SELF.fetch(`${ORIGIN}/api/auth/discord/start${query}`, {redirect: "manual"})
  const location = new URL(res.headers.get("location") ?? "")
  return {oauthCookie: cookieOf(res), state: location.searchParams.get("state") ?? ""}
}

function mockDiscord(id: string, guilds: string[]) {
  discordHttp.fetch = async (input) => {
    if (input === "https://discord.com/api/oauth2/token") {
      return Response.json({access_token: "tok", token_type: "Bearer"})
    }
    if (input === "https://discord.com/api/users/@me") {
      return Response.json({id, username: `user${id}`, global_name: null, avatar: null})
    }
    if (input === "https://discord.com/api/users/@me/guilds") {
      return Response.json(guilds.map((g) => ({id: g})))
    }
    throw new Error(`unexpected fetch ${input}`)
  }
}

const sessionCookieOf = (res: Response) =>
  (res.headers.getSetCookie?.() ?? [])
    .find((c) => c.startsWith("lore_session="))
    ?.split(";")[0] ?? ""

describe("members", () => {
  const realFetch = discordHttp.fetch

  beforeAll(async () => {
    owner = await loginAsOwner()
  })

  afterEach(() => {
    discordHttp.fetch = realFetch
  })

  it("keeps existing sessions valid across the user table rebuild", async () => {
    const me = await SELF.fetch(`${ORIGIN}/api/auth/me`, {headers: {cookie: owner}})
    expect(me.status).toBe(200)
    expect(((await me.json()) as Me).quota).toBeNull()
  })

  it("signs a Discord server member in as an untrusted member", async () => {
    const {state, oauthCookie} = await start()
    mockDiscord("5001", ["other", "guild-1"])
    const res = await SELF.fetch(
      `${ORIGIN}/api/auth/discord/callback?code=abc&state=${state}`,
      {
        redirect: "manual",
        headers: {cookie: oauthCookie},
      },
    )
    expect(res.headers.get("location")).toBe("/")
    const me = (await (
      await SELF.fetch(`${ORIGIN}/api/auth/me`, {headers: {cookie: sessionCookieOf(res)}})
    ).json()) as Me
    expect(me.role).toBe("member")
    expect(me.quota).toMatchObject({bytesUsed: 0, bytesLimit: 4096, uploadsLimit: 3})
    const row = await sql(env.DB)`select trusted from user where id = ${me.id}`.first<{
      trusted: number
    }>()
    expect(row?.trusted).toBe(0)
  })

  it("turns away Discord users outside the server, and everyone when no server is set", async () => {
    const outside = await start()
    mockDiscord("5002", ["other"])
    const res = await SELF.fetch(
      `${ORIGIN}/api/auth/discord/callback?code=abc&state=${outside.state}`,
      {redirect: "manual", headers: {cookie: outside.oauthCookie}},
    )
    expect(res.headers.get("location")).toBe("/login?error=not-invited")

    const off = await start()
    mockDiscord("5003", ["guild-1"])
    const refused = await app.request(
      `${ORIGIN}/api/auth/discord/callback?code=abc&state=${off.state}`,
      {redirect: "manual", headers: {cookie: off.oauthCookie}},
      {...env, DISCORD_GUILD_ID: ""},
      createExecutionContext(),
    )
    expect(refused.headers.get("location")).toBe("/login?error=not-invited")
  })
})

describe("review queue", () => {
  beforeAll(async () => {
    owner = await loginAsOwner()
  })

  it("holds an untrusted member's upload until staff approve it", async () => {
    const member = await memberSession(0)
    const res = await upload(member.cookie, TINY_GIF, "new.gif")
    expect(res.status).toBe(201)
    const meme = (await res.json()) as Meme
    expect(meme.status).toBe("pending")

    expect((await publicList()).items.some((m) => m.id === meme.id)).toBe(false)
    const own = (await (
      await SELF.fetch(`${ORIGIN}/api/memes`, {headers: {cookie: member.cookie}})
    ).json()) as MemeList
    expect(own.items.find((m) => m.id === meme.id)?.status).toBe("pending")
    expect(await fileStatus(meme)).toBe(404)
    expect((await SELF.fetch(`${ORIGIN}/api/memes/${meme.id}`)).status).toBe(404)

    const queue = (await (
      await SELF.fetch(`${ORIGIN}/api/admin/review`, {headers: {cookie: owner}})
    ).json()) as MemeList
    expect(queue.items.map((m) => m.id)).toContain(meme.id)
    const paged = (await (
      await SELF.fetch(`${ORIGIN}/api/admin/review?limit=1`, {headers: {cookie: owner}})
    ).json()) as MemeList
    expect(paged.items).toHaveLength(1)
    const preview = await SELF.fetch(`${ORIGIN}/api/admin/memes/${meme.id}/file`, {
      headers: {cookie: owner},
    })
    expect(preview.status).toBe(200)
    expect(preview.headers.get("cache-control")).toBe("no-store")

    const approved = await SELF.fetch(`${ORIGIN}/api/admin/memes/${meme.id}/approve`, {
      method: "POST",
      headers: {cookie: owner},
    })
    expect(((await approved.json()) as Meme).status).toBe("live")
    expect(await fileStatus(meme)).toBe(200)
    expect((await publicList()).items.some((m) => m.id === meme.id)).toBe(true)
  })

  it("keeps a member inside the quota and the daily cap", async () => {
    const member = await memberSession(1)
    // 4096 bytes of quota and three uploads a day in the test config.
    const big = new Uint8Array(4200)
    big.set(TINY_GIF)
    expect((await upload(member.cookie, big, "big.gif")).status).toBe(413)
    for (let i = 0; i < 3; i++) {
      expect((await upload(member.cookie, TINY_GIF, `${i}.gif`)).status).toBe(201)
    }
    const fourth = await upload(member.cookie, TINY_GIF, "4.gif")
    expect(fourth.status).toBe(429)
    const me = (await (
      await SELF.fetch(`${ORIGIN}/api/auth/me`, {headers: {cookie: member.cookie}})
    ).json()) as Me
    expect(me.quota).toMatchObject({uploadsToday: 3, bytesUsed: TINY_GIF.length * 3})
  })

  it("lets members change only their own memes", async () => {
    const member = await memberSession(1)
    const theirs = (await (await upload(owner, TINY_PNG, "staff.png")).json()) as Meme
    const mine = (await (await upload(member.cookie, TINY_PNG, "mine.png")).json()) as Meme
    const forbidden = await SELF.fetch(`${ORIGIN}/api/memes/${theirs.id}`, {
      method: "DELETE",
      headers: {cookie: member.cookie},
    })
    expect(forbidden.status).toBe(403)
    const allowed = await SELF.fetch(`${ORIGIN}/api/memes/${mine.id}`, {
      method: "DELETE",
      headers: {cookie: member.cookie},
    })
    expect(allowed.status).toBe(204)
  })

  it("hides a meme after two reports and lets staff restore it", async () => {
    const meme = (await (await upload(owner, TINY_PNG, "reported.png")).json()) as Meme
    const report = () =>
      SELF.fetch(`${ORIGIN}/api/memes/${meme.id}/report`, {
        method: "POST",
        headers: {"cf-connecting-ip": `10.0.0.${++counter}`},
      })
    expect((await report()).status).toBe(204)
    expect(await fileStatus(meme)).toBe(200)
    const repeat = await SELF.fetch(`${ORIGIN}/api/memes/${meme.id}/report`, {
      method: "POST",
      headers: {"cf-connecting-ip": `10.0.0.${counter}`},
    })
    expect(repeat.status).toBe(204)
    expect(await fileStatus(meme)).toBe(200)
    expect((await report()).status).toBe(204)
    expect(await fileStatus(meme)).toBe(404)
    const queue = (await (
      await SELF.fetch(`${ORIGIN}/api/admin/review`, {headers: {cookie: owner}})
    ).json()) as MemeList
    expect(queue.items.find((m) => m.id === meme.id)).toMatchObject({
      status: "hidden",
      reports: 2,
    })
    await SELF.fetch(`${ORIGIN}/api/admin/memes/${meme.id}/approve`, {
      method: "POST",
      headers: {cookie: owner},
    })
    expect(await fileStatus(meme)).toBe(200)
  })

  it("bans a member, erasing their memes and blocking a return", async () => {
    const member = await memberSession(1)
    const meme = (await (await upload(member.cookie, TINY_GIF, "bye.gif")).json()) as Meme
    expect(await fileStatus(meme)).toBe(200)
    const banned = await SELF.fetch(`${ORIGIN}/api/admin/users/${member.id}/ban`, {
      method: "POST",
      headers: {cookie: owner},
    })
    expect(await banned.json()).toEqual({deleted: 1})
    expect(await fileStatus(meme)).toBe(404)
    expect(await env.BUCKET.head(`${meme.id}.gif`)).toBeNull()
    expect(
      (await SELF.fetch(`${ORIGIN}/api/auth/me`, {headers: {cookie: member.cookie}})).status,
    ).toBe(401)
    const users = (await (
      await SELF.fetch(`${ORIGIN}/api/admin/users`, {headers: {cookie: owner}})
    ).json()) as AdminUser[]
    expect(users.find((u) => u.id === member.id)?.bannedAt).not.toBeNull()

    const {state, oauthCookie} = await start()
    mockDiscord(`d-${member.id}`.replace("d-", ""), ["guild-1"])
    discordHttp.fetch = ((orig) => async (input: string, init?: RequestInit) => {
      if (input === "https://discord.com/api/users/@me") {
        return Response.json({
          id: `d-${member.id}`,
          username: "back",
          global_name: null,
          avatar: null,
        })
      }
      return orig(input, init)
    })(discordHttp.fetch)
    const res = await SELF.fetch(
      `${ORIGIN}/api/auth/discord/callback?code=abc&state=${state}`,
      {
        redirect: "manual",
        headers: {cookie: oauthCookie},
      },
    )
    expect(res.headers.get("location")).toBe("/login?error=revoked")
  })
})
