import {SELF} from "cloudflare:test"
import {beforeAll, describe, expect, it} from "vitest"

import type {Meme, MemeList} from "../src/lib/types"
import {loginAsOwner, ORIGIN, TINY_GIF, TINY_PNG, upload} from "./helpers"

let owner = ""

describe("uploads", () => {
  beforeAll(async () => {
    owner = await loginAsOwner()
  })

  it("needs a session", async () => {
    expect((await upload("", TINY_GIF, "a.gif")).status).toBe(401)
  })

  it("rejects text renamed to png", async () => {
    const res = await upload(
      owner,
      new TextEncoder().encode("definitely not an image"),
      "x.png",
    )
    expect(res.status).toBe(415)
  })

  it("derives type and size from the bytes, not the name", async () => {
    const res = await upload(owner, TINY_GIF, "lies.png", {
      title: " Hello ",
      tags: "#Cat, cat DOG",
    })
    expect(res.status).toBe(201)
    const meme = (await res.json()) as Meme
    expect(meme).toMatchObject({
      ext: "gif",
      mime: "image/gif",
      width: 1,
      height: 1,
      size: TINY_GIF.length,
      title: "Hello",
      tags: ["cat", "dog"],
      copies: 0,
      views: 0,
    })
    expect(meme.url).toBe(`${ORIGIN}/i/${meme.id}.gif`)
    expect(meme.thumbUrl).toBe(meme.url)
    expect(meme.uploader).toMatchObject({id: "owner", name: "owner"})
  })
})

describe("/i/ header contract", () => {
  let meme: Meme

  beforeAll(async () => {
    owner = await loginAsOwner()
    meme = (await (await upload(owner, TINY_GIF, "a.gif")).json()) as Meme
  })

  it("serves the file inline with immutable caching", async () => {
    const res = await SELF.fetch(meme.url)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/gif")
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
    expect(res.headers.get("content-length")).toBe(String(TINY_GIF.length))
    expect(res.headers.get("etag")).toBeTruthy()
    expect(res.headers.get("accept-ranges")).toBe("bytes")
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    expect(res.headers.get("content-disposition")).toBeNull()
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(TINY_GIF)
  })

  it("builds urls from the Host header so the dev proxy works", async () => {
    const dev = await SELF.fetch(`${ORIGIN}/api/memes/${meme.id}`, {
      headers: {host: "localhost:5173"},
    })
    expect(((await dev.json()) as Meme).url).toBe(`http://localhost:5173/i/${meme.id}.gif`)
    const prod = await SELF.fetch(`${ORIGIN}/api/memes/${meme.id}`, {
      headers: {host: "memes.example.com"},
    })
    expect(((await prod.json()) as Meme).url).toBe(`https://memes.example.com/i/${meme.id}.gif`)
    const plain = await SELF.fetch(`${ORIGIN}/api/memes/${meme.id}`, {
      headers: {host: "memes.example.com", "x-forwarded-proto": "http"},
    })
    expect(((await plain.json()) as Meme).url).toBe(`http://memes.example.com/i/${meme.id}.gif`)
  })

  it("answers HEAD with the same headers and no body", async () => {
    const res = await SELF.fetch(meme.url, {method: "HEAD"})
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/gif")
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
    expect(res.headers.get("content-length")).toBe(String(TINY_GIF.length))
    expect(res.headers.get("content-disposition")).toBeNull()
    expect((await res.arrayBuffer()).byteLength).toBe(0)
  })

  it("honours range requests", async () => {
    const res = await SELF.fetch(meme.url, {headers: {range: "bytes=0-5"}})
    expect(res.status).toBe(206)
    expect(res.headers.get("content-range")).toBe(`bytes 0-5/${TINY_GIF.length}`)
    expect((await res.arrayBuffer()).byteLength).toBe(6)
  })

  it("refuses the wrong extension", async () => {
    const res = await SELF.fetch(`${ORIGIN}/i/${meme.id}.png`)
    expect(res.status).toBe(404)
    expect(res.headers.get("content-type")).toBe("image/png")
  })

  it("counts a fetch as a view and a copy as a copy, and throttles copy spam", async () => {
    const copy = () => SELF.fetch(`${ORIGIN}/api/memes/${meme.id}/copy`, {method: "POST"})
    expect((await copy()).status).toBe(204)
    const res = await SELF.fetch(`${ORIGIN}/api/memes/${meme.id}`)
    const fresh = (await res.json()) as Meme
    expect(fresh.copies).toBe(1)
    expect(fresh.views).toBeGreaterThanOrEqual(1)
    const statuses: number[] = []
    for (let i = 0; i < 12; i++) statuses.push((await copy()).status)
    expect(statuses).toContain(429)
  })

  it("serves a thumbnail for stills and falls back to the original", async () => {
    const png = (await (await upload(owner, TINY_PNG, "b.png")).json()) as Meme
    expect(png.thumbUrl).toBe(png.url)
    const res = await SELF.fetch(`${ORIGIN}/t/${png.id}.webp`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/png")
  })

  it("returns the placeholder image after deletion", async () => {
    const victim = (await (await upload(owner, TINY_GIF, "c.gif")).json()) as Meme
    expect((await SELF.fetch(victim.url)).status).toBe(200)
    const del = await SELF.fetch(`${ORIGIN}/api/memes/${victim.id}`, {
      method: "DELETE",
      headers: {cookie: owner},
    })
    expect(del.status).toBe(204)
    const res = await SELF.fetch(victim.url)
    expect(res.status).toBe(404)
    expect(res.headers.get("content-type")).toBe("image/png")
    expect(res.headers.get("cache-control")).toBe("public, max-age=60")
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(100)
    expect((await SELF.fetch(`${ORIGIN}/api/memes/${victim.id}`)).status).toBe(404)
  })
})

describe("listing", () => {
  beforeAll(async () => {
    owner = await loginAsOwner()
    for (let i = 0; i < 5; i++) {
      await upload(owner, TINY_GIF, `${i}.gif`, {
        title: `page ${i}`,
        tags: i % 2 ? "odd" : "even",
      })
    }
  })

  it("paginates with a cursor and filters by search", async () => {
    const first = (await (
      await SELF.fetch(`${ORIGIN}/api/memes?limit=2&q=page`)
    ).json()) as MemeList
    expect(first.items).toHaveLength(2)
    expect(first.nextCursor).toBeTruthy()
    const second = (await (
      await SELF.fetch(`${ORIGIN}/api/memes?limit=2&q=page&cursor=${first.nextCursor}`)
    ).json()) as MemeList
    expect(second.items.map((m) => m.id)).not.toContain(first.items[0]?.id)
    const odd = (await (await SELF.fetch(`${ORIGIN}/api/memes?q=odd`)).json()) as MemeList
    expect(odd.items.every((m) => m.tags.includes("odd"))).toBe(true)
    const none = (await (await SELF.fetch(`${ORIGIN}/api/memes?q=zzzz`)).json()) as MemeList
    expect(none).toEqual({items: [], nextCursor: null})
    expect((await SELF.fetch(`${ORIGIN}/api/memes?cursor=garbage`)).status).toBe(400)
  })
})
