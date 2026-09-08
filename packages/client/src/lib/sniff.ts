import type {Ext} from "@lore/server/types"

export interface Sniffed {
  ext: Ext
  mime: string
}

// Same magic bytes the server checks. Catching a mislabelled file here saves
// an upload that would be rejected anyway.
export function sniff(bytes: Uint8Array): Sniffed | null {
  if (bytes.length < 12) return null
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return {ext: "png", mime: "image/png"}
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return {ext: "jpg", mime: "image/jpeg"}
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return {ext: "gif", mime: "image/gif"}
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return {ext: "webp", mime: "image/webp"}
  }
  return null
}

export async function sniffFile(file: Blob) {
  return sniff(new Uint8Array(await file.slice(0, 16).arrayBuffer()))
}
