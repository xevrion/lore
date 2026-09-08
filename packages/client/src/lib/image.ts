import type {Ext} from "@lore/server/types"

import {sniffFile} from "./sniff"

export interface Prepared {
  file: Blob
  ext: Ext
  mime: string
  width: number
  height: number
  thumb: Blob | null
  stripped: boolean
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Encoding failed"))), type, quality)
  })
}

function draw(bitmap: ImageBitmap, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas
}

// GIF and WebP go through untouched: the canvas would flatten animation. PNG
// and JPG are re-encoded so EXIF (including GPS) never leaves the browser.
export async function prepareImage(input: File): Promise<Prepared> {
  const sniffed = await sniffFile(input)
  if (!sniffed) throw new Error("Not a PNG, JPG, GIF or WebP")
  const bitmap = await createImageBitmap(input)
  try {
    const {width, height} = bitmap
    if (sniffed.ext === "gif") {
      return {file: input, ...sniffed, width, height, thumb: null, stripped: false}
    }
    const thumb = await toBlob(draw(bitmap, 640), "image/webp", 0.8)
    if (sniffed.ext === "webp") {
      return {file: input, ...sniffed, width, height, thumb, stripped: false}
    }
    const full = draw(bitmap, Number.POSITIVE_INFINITY)
    const file =
      sniffed.ext === "png"
        ? await toBlob(full, "image/png")
        : await toBlob(full, "image/jpeg", 0.92)
    return {file, ...sniffed, width, height, thumb, stripped: true}
  } finally {
    bitmap.close()
  }
}

// Avatars are a centre-cropped square, 128px webp, so they stay far under the
// server's 200 KB cap.
export async function prepareAvatar(input: Blob): Promise<Blob> {
  const sniffed = await sniffFile(input)
  if (!sniffed) throw new Error("Not a PNG, JPG, GIF or WebP")
  const bitmap = await createImageBitmap(input)
  try {
    const side = Math.min(bitmap.width, bitmap.height)
    const sx = Math.floor((bitmap.width - side) / 2)
    const sy = Math.floor((bitmap.height - side) / 2)
    const canvas = document.createElement("canvas")
    canvas.width = 128
    canvas.height = 128
    canvas.getContext("2d")!.drawImage(bitmap, sx, sy, side, side, 0, 0, 128, 128)
    return await toBlob(canvas, "image/webp", 0.85)
  } finally {
    bitmap.close()
  }
}
