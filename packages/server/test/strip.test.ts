import {describe, expect, it} from "vitest"

import {dimensions, sniff} from "../src/lib/image"
import {stripMetadata} from "../src/lib/strip"
import {TINY_PNG} from "./helpers"

const be16 = (n: number) => [n >> 8, n & 0xff]
const ascii = (text: string) => [...new TextEncoder().encode(text)]
const contains = (haystack: Uint8Array, needle: string) =>
  String.fromCharCode(...haystack).includes(needle)

function segment(marker: number, body: number[]) {
  return [0xff, marker, ...be16(body.length + 2), ...body]
}

// SOI, APP0 JFIF, APP1 with an Exif header, COM, SOF0 for a 3x2 image, SOS, EOI.
const jpegWithExif = Uint8Array.from([
  0xff,
  0xd8,
  ...segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
  ...segment(0xe1, [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x49, 0x49, 42, 0, 8, 0, 0, 0]),
  ...segment(0xfe, ascii("shot on a phone")),
  ...segment(0xc0, [8, ...be16(2), ...be16(3), 1, 1, 0x11, 0]),
  ...segment(0xda, [1, 1, 0, 0, 63, 0]),
  0x12,
  0x34,
  0xff,
  0xd9,
])

function pngChunk(type: string, body: Uint8Array) {
  const out = new Uint8Array(12 + body.length)
  new DataView(out.buffer).setUint32(0, body.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(body, 8)
  return out
}

describe("stripMetadata", () => {
  it("drops EXIF and comments from a JPEG but keeps JFIF, the frame and the scan", () => {
    const out = stripMetadata(jpegWithExif, "jpg")
    expect(out.length).toBeLessThan(jpegWithExif.length)
    expect(contains(out, "Exif")).toBe(false)
    expect(contains(out, "shot on a phone")).toBe(false)
    expect(contains(out, "JFIF")).toBe(true)
    expect(sniff(out)?.ext).toBe("jpg")
    expect(dimensions(out, "jpg")).toEqual({width: 3, height: 2})
    expect([...out.subarray(-4)]).toEqual([0x12, 0x34, 0xff, 0xd9])
  })

  it("drops text and time chunks from a PNG and leaves the pixels alone", () => {
    const iend = TINY_PNG.subarray(TINY_PNG.length - 12)
    const withText = new Uint8Array([
      ...TINY_PNG.subarray(0, TINY_PNG.length - 12),
      ...pngChunk("tEXt", new TextEncoder().encode("Comment\0taken at home")),
      ...pngChunk("eXIf", new TextEncoder().encode("II*\0")),
      ...iend,
    ])
    const out = stripMetadata(withText, "png")
    expect([...out]).toEqual([...TINY_PNG])
    expect(dimensions(out, "png")).toEqual({width: 1, height: 1})
  })

  it("passes GIF and WebP through untouched", () => {
    const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2, 3])
    expect(stripMetadata(gif, "gif")).toBe(gif)
  })
})
