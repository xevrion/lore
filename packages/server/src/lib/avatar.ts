import {HTTPException} from "hono/http-exception"

import {sniff} from "./image"
import {LIMITS} from "./types"

export const avatarKey = (userId: string) => `avatars/${userId}.webp`

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
  const key = avatarKey(userId)
  await bucket.put(key, bytes, {httpMetadata: {contentType: type.mime}})
  return key
}
