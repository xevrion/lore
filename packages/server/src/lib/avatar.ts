import {HTTPException} from "hono/http-exception"

import {newId} from "./id"
import {sniff} from "./image"
import {LIMITS} from "./types"

// Each upload gets a fresh key so the URL changes too. Avatars are served with a
// day-long cache, and a new URL is the only reliable way past that.
export const avatarKey = (userId: string, version: string) =>
  `avatars/${userId}-${version}.webp`

export const AVATAR_VERSION = /^[0-9a-zA-Z]{1,16}$/

// The client resizes to 128px webp, but the file is sniffed again here because
// the client is not trusted. PNG and JPEG are accepted too and served as-is.
export async function storeAvatar(bucket: R2Bucket, userId: string, file: File) {
  if (file.size > LIMITS.avatarBytes) {
    throw new HTTPException(413, {message: "Avatar must be under 200 KB"})
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = sniff(bytes)
  if (!type || type.ext === "gif") {
    throw new HTTPException(415, {message: "Avatar must be a webp, png or jpg image"})
  }
  const key = avatarKey(userId, newId(6))
  await bucket.put(key, bytes, {httpMetadata: {contentType: type.mime}})
  return key
}
