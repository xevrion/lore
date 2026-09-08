import type {Meme} from "@lore/server/types"

export interface UploadRequest {
  file: Blob
  filename: string
  thumb: Blob | null
  title: string
  tags: string
  onProgress: (fraction: number) => void
  signal?: AbortSignal
}

// fetch() cannot report upload progress, so this one call uses XHR.
export function uploadMeme(req: UploadRequest): Promise<Meme> {
  return new Promise((resolve, reject) => {
    const body = new FormData()
    body.set("file", req.file, req.filename)
    if (req.thumb) body.set("thumb", req.thumb, "thumb.webp")
    body.set("title", req.title)
    body.set("tags", req.tags)
    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/api/memes")
    xhr.responseType = "json"
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) req.onProgress(e.loaded / e.total)
    })
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as Meme)
      } else {
        const message = (xhr.response as {error?: string} | null)?.error
        reject(new Error(message ?? `Upload failed (${xhr.status})`))
      }
    })
    xhr.addEventListener("error", () => reject(new Error("Network error")))
    xhr.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
    req.signal?.addEventListener("abort", () => xhr.abort())
    xhr.send(body)
  })
}
