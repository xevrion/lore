import {app, origin, type Context} from "../lib/app"
import {AVATAR_VERSION, avatarKey} from "../lib/avatar"
import {GONE_PNG} from "../lib/gone"
import {sql} from "../lib/sql"

const MEME_FILE = /^([0-9a-zA-Z]{5,12})\.(png|jpg|gif|webp)$/
const WEBP_FILE = /^([0-9a-zA-Z]{1,12})\.webp$/

// IDs are never reused, so a file URL can be cached forever by browsers,
// Discord's proxy and the Cloudflare edge alike.
const IMMUTABLE = "public, max-age=31536000, immutable"
const DAILY = "public, max-age=86400"

interface Resolved {
  key: string
  contentType: string | null
  onMiss?: () => Promise<unknown>
}

interface ServeOptions {
  resolve: () => Promise<Resolved | null>
  cacheControl: string
  notFound: () => Response
}

const gone = () =>
  new Response(GONE_PNG, {
    status: 404,
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=60",
      "x-content-type-options": "nosniff",
    },
  })

const plainNotFound = () => new Response("Not found", {status: 404})

function fileHeaders(object: R2Object, contentType: string | null, cacheControl: string) {
  const headers = new Headers()
  headers.set(
    "content-type",
    contentType ?? object.httpMetadata?.contentType ?? "application/octet-stream",
  )
  headers.set("content-length", String(object.size))
  headers.set("etag", object.httpEtag)
  headers.set("accept-ranges", "bytes")
  headers.set("cache-control", cacheControl)
  headers.set("x-content-type-options", "nosniff")
  return headers
}

async function serveRange(c: Context, resolved: Resolved, cacheControl: string) {
  const object = await c.env.BUCKET.get(resolved.key, {range: c.req.raw.headers})
  if (!object) return null
  const headers = fileHeaders(object, resolved.contentType, cacheControl)
  if (!object.range || !("offset" in object.range) || object.range.offset === undefined) {
    return new Response(object.body, {headers})
  }
  const start = object.range.offset
  const length = object.range.length ?? object.size - start
  headers.set("content-length", String(length))
  headers.set("content-range", `bytes ${start}-${start + length - 1}/${object.size}`)
  return new Response(object.body, {status: 206, headers})
}

// Worker responses are not cached by Cloudflare on their own. On a hit this costs
// zero D1 and zero R2 reads; on a miss the response is stored while streaming out.
async function serve(c: Context, opts: ServeOptions) {
  const isHead = c.req.method === "HEAD"
  // Keyed on the same origin the delete handler purges, not on request.url.
  const cacheKey = new Request(`${origin(c)}${new URL(c.req.url).pathname}`, {method: "GET"})
  if (c.req.header("range")) {
    const resolved = await opts.resolve()
    const partial = resolved && (await serveRange(c, resolved, opts.cacheControl))
    return partial ?? opts.notFound()
  }
  const hit = await caches.default.match(cacheKey)
  if (hit) {
    return isHead ? new Response(null, {status: hit.status, headers: hit.headers}) : hit
  }
  const resolved = await opts.resolve()
  if (!resolved) return opts.notFound()
  const object = await c.env.BUCKET.get(resolved.key)
  if (!object) return opts.notFound()
  const response = new Response(object.body, {
    headers: fileHeaders(object, resolved.contentType, opts.cacheControl),
  })
  // Unfurlers send HEAD before GET, so a HEAD miss warms the cache too. Only a
  // real GET counts as a fetch.
  c.executionCtx.waitUntil(
    Promise.all([
      caches.default.put(cacheKey, isHead ? response : response.clone()),
      isHead ? undefined : resolved.onMiss?.(),
    ]),
  )
  return isHead ? new Response(null, {headers: response.headers}) : response
}

interface FileRow {
  key: string
  thumb_key: string | null
  ext: string
  mime: string
}

const findFile = (c: Context, id: string) =>
  sql(c.env.DB)`select key, thumb_key, ext, mime from meme where id = ${id}`.first<FileRow>()

export default app()
  .on(["GET", "HEAD"], "/i/:file", (c) => {
    const match = MEME_FILE.exec(c.req.param("file"))
    if (!match) return gone()
    const [, id, ext] = match
    return serve(c, {
      cacheControl: IMMUTABLE,
      notFound: gone,
      resolve: async () => {
        const row = await findFile(c, id ?? "")
        // Serving a GIF at a .png URL confuses unfurlers, so the extension must match.
        if (!row || row.ext !== ext) return null
        return {
          key: row.key,
          contentType: row.mime,
          onMiss: () => sql(c.env.DB)`update meme set views = views + 1 where id = ${id}`.run(),
        }
      },
    })
  })

  .on(["GET", "HEAD"], "/t/:file", (c) => {
    const match = WEBP_FILE.exec(c.req.param("file"))
    if (!match) return gone()
    const id = match[1] ?? ""
    return serve(c, {
      cacheControl: IMMUTABLE,
      notFound: gone,
      resolve: async () => {
        const row = await findFile(c, id)
        if (!row) return null
        return row.thumb_key
          ? {key: row.thumb_key, contentType: "image/webp"}
          : {key: row.key, contentType: row.mime}
      },
    })
  })

  .on(["GET", "HEAD"], "/a/:file", (c) => {
    const match = WEBP_FILE.exec(c.req.param("file"))
    if (!match) return plainNotFound()
    const userId = match[1] ?? ""
    const version = c.req.query("v") ?? ""
    if (!AVATAR_VERSION.test(version)) return plainNotFound()
    return serve(c, {
      cacheControl: DAILY,
      notFound: plainNotFound,
      resolve: async () => ({key: avatarKey(userId, version), contentType: null}),
    })
  })
