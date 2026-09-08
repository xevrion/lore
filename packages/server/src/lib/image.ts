import type {Ext} from "./types"

export interface ImageType {
  ext: Ext
  mime: string
}

export interface Dimensions {
  width: number
  height: number
}

const startsWith = (bytes: Uint8Array, prefix: number[], offset = 0) =>
  prefix.every((b, i) => bytes[offset + i] === b)

// The client's declared Content-Type and file extension are ignored entirely.
// Only these signatures decide what a file is, and therefore how it is served.
export function sniff(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return {ext: "png", mime: "image/png"}
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return {ext: "jpg", mime: "image/jpeg"}
  }
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) && (bytes[4] === 0x37 || bytes[4] === 0x39)) {
    return {ext: "gif", mime: "image/gif"}
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return {ext: "webp", mime: "image/webp"}
  }
  return null
}

const u16be = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0)
const u16le = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8)
const u24le = (b: Uint8Array, i: number) => u16le(b, i) | ((b[i + 2] ?? 0) << 16)
const u32be = (b: Uint8Array, i: number) => (u16be(b, i) * 0x10000 + u16be(b, i + 2)) >>> 0

function pngSize(b: Uint8Array): Dimensions | null {
  if (b.length < 24 || !startsWith(b, [0x49, 0x48, 0x44, 0x52], 12)) return null
  return {width: u32be(b, 16), height: u32be(b, 20)}
}

function jpegSize(b: Uint8Array): Dimensions | null {
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1] ?? 0
    if (marker === 0xff) {
      i += 1
      continue
    }
    // Standalone markers carry no length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof) {
      return {height: u16be(b, i + 5), width: u16be(b, i + 7)}
    }
    if (marker === 0xd9 || marker === 0xda) return null
    i += 2 + u16be(b, i + 2)
  }
  return null
}

function gifSize(b: Uint8Array): Dimensions | null {
  if (b.length < 10) return null
  return {width: u16le(b, 6), height: u16le(b, 8)}
}

function webpSize(b: Uint8Array): Dimensions | null {
  if (b.length < 30) return null
  const chunk = String.fromCharCode(...b.subarray(12, 16))
  if (chunk === "VP8 ") {
    return {width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff}
  }
  if (chunk === "VP8L") {
    const b0 = b[21] ?? 0
    const b1 = b[22] ?? 0
    const b2 = b[23] ?? 0
    const b3 = b[24] ?? 0
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    }
  }
  if (chunk === "VP8X") {
    return {width: 1 + u24le(b, 24), height: 1 + u24le(b, 27)}
  }
  return null
}

export function dimensions(bytes: Uint8Array, ext: Ext): Dimensions | null {
  const size =
    ext === "png"
      ? pngSize(bytes)
      : ext === "jpg"
        ? jpegSize(bytes)
        : ext === "gif"
          ? gifSize(bytes)
          : webpSize(bytes)
  if (!size || size.width <= 0 || size.height <= 0) return null
  return size
}
