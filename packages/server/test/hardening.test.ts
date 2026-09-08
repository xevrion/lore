import {SELF} from "cloudflare:test"
import {beforeAll, describe, expect, it} from "vitest"

import type {Meme, MemeList} from "../src/lib/types"
import {loginAsOwner, ORIGIN, TINY_GIF, TINY_PNG, upload} from "./helpers"

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(
    parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)),
  )

// 64x64 lossless and 320x240 lossy WebP headers, enough for sniffing and sizing.
const squareWebp = bytes(
  "RIFF",
  [0, 0, 0, 0],
  "WEBP",
  "VP8L",
  [0, 0, 0, 0],
  [0x2f, 0x3f, 0xc0, 0x0f, 0x00, 0, 0, 0, 0, 0],
)
const wideWebp = bytes(
  "RIFF",
  [0, 0, 0, 0],
  "WEBP",
  "VP8 ",
  [0, 0, 0, 0],
  [0, 0, 0, 0x9d, 0x01, 0x2a, 0x40, 0x01, 0xf0, 0x00],
)

let owner = ""

const search = async (q: string) => {
  const res = await SELF.fetch(`${ORIGIN}/api/memes?q=${encodeURIComponent(q)}`)
  return ((await res.json()) as MemeList).items
}

describe("search index", () => {
  let exam: Meme
  beforeAll(async () => {
    owner = await loginAsOwner()
    exam = (await (
      await upload(owner, TINY_GIF, "a.gif", {
        title: "the exam timetable drop",
        tags: "college",
      })
    ).json()) as Meme
    await upload(owner, TINY_GIF, "b.gif", {title: "mess food tier list", tags: "college food"})
  })

  it("finds words and prefixes across title and tags", async () => {
    expect((await search("exam")).map((m) => m.id)).toEqual([exam.id])
    expect((await search("timet")).map((m) => m.id)).toEqual([exam.id])
    expect(await search("college")).toHaveLength(2)
  })

  it("ands terms and ignores one-letter noise", async () => {
    expect((await search("college exam")).map((m) => m.id)).toEqual([exam.id])
    expect(await search("college nothing")).toHaveLength(0)
    expect(await search("a")).toHaveLength(0)
    // Operators are words here, so this asks for a meme mentioning "or".
    expect(await search("exam OR food")).toHaveLength(0)
  })

  it("follows edits and deletes", async () => {
    await SELF.fetch(`${ORIGIN}/api/memes/${exam.id}`, {
      method: "PATCH",
      headers: {cookie: owner, "content-type": "application/json"},
      body: JSON.stringify({title: "renamed"}),
    })
    expect(await search("exam")).toHaveLength(0)
    expect((await search("renamed")).map((m) => m.id)).toEqual([exam.id])
    await SELF.fetch(`${ORIGIN}/api/memes/${exam.id}`, {
      method: "DELETE",
      headers: {cookie: owner},
    })
    expect(await search("renamed")).toHaveLength(0)
  })
})

describe("same-origin guard", () => {
  let meme: Meme
  beforeAll(async () => {
    owner = await loginAsOwner()
    meme = (await (await upload(owner, TINY_GIF, "c.gif")).json()) as Meme
  })

  const copy = (headers: Record<string, string>) =>
    SELF.fetch(`${ORIGIN}/api/memes/${meme.id}/copy`, {method: "POST", headers})

  it("refuses mutations from another origin and allows its own", async () => {
    expect((await copy({origin: "https://evil.example"})).status).toBe(403)
    expect((await copy({"sec-fetch-site": "cross-site"})).status).toBe(403)
    expect((await copy({origin: ORIGIN})).status).toBe(204)
    expect((await copy({})).status).toBe(204)
  })

  it("does not gate reads", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/memes`, {
      headers: {origin: "https://evil.example"},
    })
    expect(res.status).toBe(200)
  })
})

describe("upload shape checks", () => {
  beforeAll(async () => {
    owner = await loginAsOwner()
  })

  const withThumb = (thumb: Uint8Array) => {
    const form = new FormData()
    form.set("file", new File([TINY_PNG], "square.png"))
    form.set("thumb", new File([thumb], "t.webp"))
    return SELF.fetch(`${ORIGIN}/api/memes`, {
      method: "POST",
      headers: {cookie: owner},
      body: form,
    })
  }

  it("keeps a thumbnail only when it has the same shape as the image", async () => {
    const ok = await withThumb(squareWebp)
    expect(ok.status).toBe(201)
    expect(((await ok.json()) as Meme).thumbUrl).toContain("/t/")
    const bad = await withThumb(wideWebp)
    expect(bad.status).toBe(400)
    expect(((await bad.json()) as {error: string}).error).toMatch(/Thumbnail/)
  })

  it("refuses absurd dimensions", async () => {
    // A complete IHDR chunk (with a CRC) so metadata stripping keeps it.
    const tall = bytes(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13],
      "IHDR",
      [0, 0, 0, 1],
      [0x77, 0x35, 0x94, 0x00],
      [8, 6, 0, 0, 0],
      [0, 0, 0, 0],
    )
    const res = await upload(owner, tall, "tall.png")
    expect(res.status).toBe(400)
    expect(((await res.json()) as {error: string}).error).toMatch(/out of range/)
  })
})

describe("file cache", () => {
  it("answers a made-up id with the placeholder every time", async () => {
    for (let i = 0; i < 2; i++) {
      const res = await SELF.fetch(`${ORIGIN}/i/nope2345.gif`)
      expect(res.status).toBe(404)
      expect(res.headers.get("content-type")).toBe("image/png")
    }
  })

  it("serves a range out of the cached full object", async () => {
    owner = await loginAsOwner()
    const meme = (await (await upload(owner, TINY_GIF, "r.gif")).json()) as Meme
    expect((await SELF.fetch(meme.url)).status).toBe(200)
    const res = await SELF.fetch(meme.url, {headers: {range: "bytes=2-4"}})
    expect(res.status).toBe(206)
    expect(res.headers.get("content-range")).toBe(`bytes 2-4/${TINY_GIF.length}`)
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([...TINY_GIF.subarray(2, 5)])
  })
})
