import {describe, expect, it} from "vitest"

import {dimensions, parseDimensions, sniff} from "../src/lib/image"
import {TINY_GIF, TINY_PNG} from "./helpers"

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(
    parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)),
  )

const jpeg = bytes(
  [0xff, 0xd8],
  [0xff, 0xe0, 0x00, 0x10],
  "JFIF\0",
  [0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00],
  [0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x02, 0x58, 0x03],
  [0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01],
  [0xff, 0xd9],
)

const webpLossy = bytes(
  "RIFF",
  [0, 0, 0, 0],
  "WEBP",
  "VP8 ",
  [0, 0, 0, 0],
  [0, 0, 0, 0x9d, 0x01, 0x2a, 0x40, 0x01, 0xf0, 0x00],
)

// VP8L packs 14-bit width-1 and height-1 after a signature byte.
const webpLossless = bytes(
  "RIFF",
  [0, 0, 0, 0],
  "WEBP",
  "VP8L",
  [0, 0, 0, 0],
  [0x2f, 0x3f, 0xc0, 0x0f, 0x00, 0, 0, 0, 0, 0],
)

const webpExtended = bytes(
  "RIFF",
  [0, 0, 0, 0],
  "WEBP",
  "VP8X",
  [0, 0, 0, 0],
  [0, 0, 0, 0, 0x7f, 0x02, 0x00, 0xff, 0x00, 0x00],
)

describe("sniff", () => {
  it("recognises the four supported formats", () => {
    expect(sniff(TINY_PNG)).toEqual({ext: "png", mime: "image/png"})
    expect(sniff(TINY_GIF)).toEqual({ext: "gif", mime: "image/gif"})
    expect(sniff(jpeg)).toEqual({ext: "jpg", mime: "image/jpeg"})
    expect(sniff(webpLossy)).toEqual({ext: "webp", mime: "image/webp"})
  })

  it("rejects text renamed to .png and other junk", () => {
    expect(sniff(bytes("hello, this is not a png"))).toBeNull()
    expect(sniff(bytes("RIFF", [0, 0, 0, 0], "WAVE"))).toBeNull()
    expect(sniff(new Uint8Array(0))).toBeNull()
    expect(sniff(bytes("GIF8x"))).toBeNull()
  })
})

describe("dimensions", () => {
  it("reads png IHDR", () => {
    expect(dimensions(TINY_PNG, "png")).toEqual({width: 1, height: 1})
  })

  it("reads gif logical screen", () => {
    expect(dimensions(TINY_GIF, "gif")).toEqual({width: 1, height: 1})
  })

  it("walks jpeg segments to the SOF marker", () => {
    expect(dimensions(jpeg, "jpg")).toEqual({width: 600, height: 300})
  })

  it("reads all three webp chunk types", () => {
    expect(dimensions(webpLossy, "webp")).toEqual({width: 320, height: 240})
    expect(dimensions(webpLossless, "webp")).toEqual({width: 64, height: 64})
    expect(dimensions(webpExtended, "webp")).toEqual({width: 640, height: 256})
  })

  it("returns null for truncated files", () => {
    expect(dimensions(TINY_PNG.subarray(0, 20), "png")).toBeNull()
    expect(dimensions(jpeg.subarray(0, 12), "jpg")).toBeNull()
  })
})

// A PNG header with any width and height; the pixel data is irrelevant here.
const pngHeader = (width: number, height: number) =>
  bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13],
    "IHDR",
    [(width >>> 24) & 255, (width >>> 16) & 255, (width >>> 8) & 255, width & 255],
    [(height >>> 24) & 255, (height >>> 16) & 255, (height >>> 8) & 255, height & 255],
    [8, 6, 0, 0, 0],
  )

describe("dimension limits", () => {
  it("parses but refuses sizes no meme wall needs", () => {
    expect(parseDimensions(pngHeader(20_000, 10), "png")).toEqual({width: 20_000, height: 10})
    expect(dimensions(pngHeader(20_000, 10), "png")).toBeNull()
    expect(dimensions(pngHeader(1, 2_000_000_000), "png")).toBeNull()
    expect(dimensions(pngHeader(1, 20), "png")).toBeNull()
    expect(dimensions(pngHeader(7000, 7000), "png")).toBeNull()
    expect(dimensions(pngHeader(4000, 3000), "png")).toEqual({width: 4000, height: 3000})
  })
})
