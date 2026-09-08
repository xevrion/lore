import type {Ext} from "./types"

// Metadata is removed by dropping whole chunks and segments rather than
// re-encoding. The pixels and their compression stay byte for byte identical,
// which keeps files small and avoids canvas PNGs that come out several times
// larger than the original.

const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME", "dSIG"])

function stripPng(bytes: Uint8Array<ArrayBuffer>) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const kept: Uint8Array<ArrayBuffer>[] = [bytes.subarray(0, 8)]
  let at = 8
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at)
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    const end = at + 12 + length
    if (end > bytes.length) break
    if (!PNG_DROP.has(type)) kept.push(bytes.subarray(at, end))
    at = end
    if (type === "IEND") break
  }
  return concat(kept)
}

// APP0 (JFIF), APP2 (ICC colour profile) and APP14 (Adobe colour transform)
// affect how the image is displayed, so they stay. Everything else in the
// header, including EXIF, XMP and comments, goes.
const JPEG_KEEP_APP = new Set([0xe0, 0xe2, 0xee])

function stripJpeg(bytes: Uint8Array<ArrayBuffer>) {
  const kept: Uint8Array<ArrayBuffer>[] = [bytes.subarray(0, 2)]
  let at = 2
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1] ?? 0
    // Start of scan: the rest is entropy-coded data and trailing markers.
    if (marker === 0xda) {
      kept.push(bytes.subarray(at))
      return concat(kept)
    }
    const length = ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0)
    const end = at + 2 + length
    if (length < 2 || end > bytes.length) break
    const isApp = marker >= 0xe0 && marker <= 0xef
    const drop = (isApp && !JPEG_KEEP_APP.has(marker)) || marker === 0xfe
    if (!drop) kept.push(bytes.subarray(at, end))
    at = end
  }
  kept.push(bytes.subarray(at))
  return concat(kept)
}

function concat(parts: Uint8Array<ArrayBuffer>[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

// GIF and WebP pass through untouched: GIF has no metadata block worth
// stripping and rewriting a WebP container risks breaking animation.
export function stripMetadata(
  bytes: Uint8Array<ArrayBuffer>,
  ext: Ext,
): Uint8Array<ArrayBuffer> {
  if (ext === "png") return stripPng(bytes)
  if (ext === "jpg") return stripJpeg(bytes)
  return bytes
}
