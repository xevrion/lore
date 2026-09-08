import {env} from "cloudflare:test"
import {describe, expect, it} from "vitest"

import {decodeCursor, encodeCursor} from "../src/lib/cursor"
import {ALPHABET, MEME_ID_LENGTH, newId, uniqueMemeId} from "../src/lib/id"
import {buildSearch, normalizeTags, splitTags} from "../src/lib/search"

describe("id", () => {
  it("uses only the url-safe alphabet at the expected length", () => {
    for (let i = 0; i < 200; i++) {
      const id = newId(MEME_ID_LENGTH)
      expect(id).toHaveLength(MEME_ID_LENGTH)
      expect([...id].every((ch) => ALPHABET.includes(ch))).toBe(true)
    }
    expect(ALPHABET).not.toMatch(/[-_0Oo1lI]/)
  })

  it("does not hand out an id that is already taken", async () => {
    const id = await uniqueMemeId(env.DB)
    expect(id).toHaveLength(MEME_ID_LENGTH)
    const again = await uniqueMemeId(env.DB)
    expect(again).not.toBe(id)
  })
})

describe("buildSearch", () => {
  it("matches everything for an empty query", () => {
    expect(buildSearch("   ")).toEqual({where: "1 = 1", params: []})
  })

  it("ands every term across title and tags", () => {
    const {where, params} = buildSearch("Cat  GIF")
    expect(where.split(" and ")).toHaveLength(2)
    expect(where).toContain("m.title like ?")
    expect(where).toContain("m.tags like ?")
    expect(params).toEqual(["%cat%", "%cat%", "%gif%", "%gif%"])
  })

  it("escapes like wildcards so they match literally", () => {
    expect(buildSearch("100%_a\\b").params[0]).toBe("%100\\%\\_a\\\\b%")
  })
})

describe("normalizeTags", () => {
  it("lowercases, strips hashes, dedupes and splits on commas", () => {
    expect(normalizeTags("#Cat, cat  DOG,dog")).toBe("cat dog")
    expect(normalizeTags(["A", "b", "a"])).toBe("a b")
  })

  it("caps the count and the length", () => {
    const many = Array.from({length: 15}, (_, i) => `t${i}`).join(" ")
    expect(splitTags(normalizeTags(many))).toHaveLength(10)
    expect(normalizeTags("x".repeat(50))).toHaveLength(32)
  })
})

describe("cursor", () => {
  it("round trips both sort orders", () => {
    const fresh = {sort: "new", createdAt: "2026-09-08T00:00:00.000Z", id: "abc1234"} as const
    expect(decodeCursor(encodeCursor(fresh), "new")).toEqual(fresh)
    const top = {sort: "top", copies: 42, id: "abc1234"} as const
    expect(decodeCursor(encodeCursor(top), "top")).toEqual(top)
  })

  it("rejects garbage and cursors from the other sort", () => {
    expect(decodeCursor("not-base64!", "new")).toBeNull()
    expect(decodeCursor(btoa("[]"), "new")).toBeNull()
    const top = encodeCursor({sort: "top", copies: 1, id: "x"})
    expect(decodeCursor(top, "new")).toBeNull()
  })
})
