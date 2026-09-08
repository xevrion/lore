import {env, SELF} from "cloudflare:test"
import {beforeAll, describe, expect, it} from "vitest"

import {hashToken} from "../src/auth"
import {sql} from "../src/lib/sql"
import type {CreatedInvite, Me} from "../src/lib/types"
import {cookieOf, loginAsOwner, ORIGIN} from "./helpers"

let owner = ""

const createInvite = async () => {
  const res = await SELF.fetch(`${ORIGIN}/api/admin/invites`, {
    method: "POST",
    headers: {cookie: owner},
  })
  expect(res.status).toBe(201)
  const invite = (await res.json()) as CreatedInvite
  return invite.url.split("/join/")[1] ?? ""
}

const join = (token: string, name = "friend") => {
  const form = new FormData()
  form.set("token", token)
  form.set("name", name)
  return SELF.fetch(`${ORIGIN}/api/auth/join`, {method: "POST", body: form})
}

describe("invites", () => {
  beforeAll(async () => {
    owner = await loginAsOwner()
  })

  it("requires the owner", async () => {
    expect((await SELF.fetch(`${ORIGIN}/api/admin/invites`, {method: "POST"})).status).toBe(401)
  })

  it("is valid once, then gone", async () => {
    const token = await createInvite()
    expect((await SELF.fetch(`${ORIGIN}/api/auth/invite/${token}`)).status).toBe(200)

    const pending = (await (
      await SELF.fetch(`${ORIGIN}/api/admin/invites`, {headers: {cookie: owner}})
    ).json()) as {tokenHash: string}[]
    expect(pending.map((p) => p.tokenHash)).toContain(await hashToken(token))

    const joined = await join(token, "  Priya ")
    expect(joined.status).toBe(201)
    const me = (await joined.json()) as Me
    expect(me).toMatchObject({name: "Priya", role: "admin", avatarUrl: null})
    expect(cookieOf(joined)).toMatch(/^lore_session=/)

    const again = await join(token)
    expect(again.status).toBe(410)
    expect(((await again.json()) as {error: string}).error).toMatch(/already been used/)
    expect((await SELF.fetch(`${ORIGIN}/api/auth/invite/${token}`)).status).toBe(410)
  })

  it("expires after 24 hours", async () => {
    const token = await createInvite()
    await sql(env.DB)`
      update invite set expires_at = ${new Date(Date.now() - 1).toISOString()}
      where token_hash = ${await hashToken(token)}
    `.run()
    const res = await join(token)
    expect(res.status).toBe(410)
    expect(((await res.json()) as {error: string}).error).toMatch(/expired/)
  })

  it("can be cancelled and rejects unknown tokens", async () => {
    const token = await createInvite()
    const del = await SELF.fetch(`${ORIGIN}/api/admin/invites/${await hashToken(token)}`, {
      method: "DELETE",
      headers: {cookie: owner},
    })
    expect(del.status).toBe(204)
    expect((await SELF.fetch(`${ORIGIN}/api/auth/invite/${token}`)).status).toBe(404)
    expect((await join("nonsense")).status).toBe(404)
  })

  it("revoking an admin kills their session immediately", async () => {
    const joined = await join(await createInvite(), "Sam")
    const sam = cookieOf(joined)
    const {id} = (await joined.json()) as Me
    expect((await SELF.fetch(`${ORIGIN}/api/auth/me`, {headers: {cookie: sam}})).status).toBe(
      200,
    )
    expect(
      (await SELF.fetch(`${ORIGIN}/api/admin/users`, {headers: {cookie: sam}})).status,
    ).toBe(403)

    const revoke = await SELF.fetch(`${ORIGIN}/api/admin/users/${id}/revoke`, {
      method: "POST",
      headers: {cookie: owner},
    })
    expect(revoke.status).toBe(204)
    expect((await SELF.fetch(`${ORIGIN}/api/auth/me`, {headers: {cookie: sam}})).status).toBe(
      401,
    )

    const users = (await (
      await SELF.fetch(`${ORIGIN}/api/admin/users`, {headers: {cookie: owner}})
    ).json()) as {id: string; revokedAt: string | null}[]
    expect(users.find((u) => u.id === id)?.revokedAt).toBeTruthy()

    const self = await SELF.fetch(`${ORIGIN}/api/admin/users/owner/revoke`, {
      method: "POST",
      headers: {cookie: owner},
    })
    expect(self.status).toBe(400)
  })
})
