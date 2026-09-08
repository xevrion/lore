import {HTTPException} from "hono/http-exception"

import {app, requireSameOrigin, type Context} from "./lib/app"
import {withSecurityHeaders} from "./lib/headers"
import admin from "./routes/admin"
import auth from "./routes/auth"
import discord from "./routes/discord"
import files from "./routes/files"
import memes from "./routes/memes"
import page from "./routes/page"
import users from "./routes/users"

const GUESSABLE = /^\/api\/auth\/(login|join)$/
const MUTATING = new Set(["POST", "PATCH", "DELETE"])

async function rateLimit(c: Context, next: () => Promise<void>) {
  const ip = c.req.header("cf-connecting-ip") ?? "unknown"
  // Code and invite guessing is throttled globally: there is one account to
  // guess. The per-IP check runs first so one address cannot spend the shared
  // budget and lock everyone else out. Everything else gets the per-IP budget.
  if (GUESSABLE.test(c.req.path) && c.req.method === "POST") {
    const own = await c.env.RATELIMIT_AUTH.limit({key: `login:${ip}`})
    if (!own.success) throw new HTTPException(429, {message: "Too many requests"})
    const shared = await c.env.RATELIMIT_AUTH.limit({key: "auth"})
    if (!shared.success) throw new HTTPException(429, {message: "Too many requests"})
  } else {
    const outcome = await c.env.RATELIMIT_API.limit({key: ip})
    if (!outcome.success) throw new HTTPException(429, {message: "Too many requests"})
  }
  if (MUTATING.has(c.req.method)) requireSameOrigin(c)
  await next()
}

// The SPA comes from Workers Static Assets. Passing it through here adds the
// security headers and, when configured, the Cloudflare Web Analytics beacon.
async function serveAsset(c: Context) {
  const upstream = await c.env.ASSETS.fetch(c.req.raw)
  const headers = withSecurityHeaders(new Headers(upstream.headers))
  const isHtml = (upstream.headers.get("content-type") ?? "").includes("text/html")
  // The beacon reports the page path, and an invite link is a live credential
  // until it is used, so join pages go unmeasured.
  const token = c.req.path.startsWith("/join/") ? "" : c.env.WEB_ANALYTICS_TOKEN
  if (!isHtml || !token) {
    return new Response(upstream.body, {status: upstream.status, headers})
  }
  const beacon = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${JSON.stringify({token})}'></script>`
  const rewritten = new HTMLRewriter()
    .on("body", {
      element(el) {
        el.append(beacon, {html: true})
      },
    })
    .transform(upstream)
  return new Response(rewritten.body, {status: upstream.status, headers})
}

export default app()
  .onError((err, c) => {
    if (err instanceof HTTPException) {
      const res = err.getResponse()
      // Hono's redirect and rate-limit responses carry headers worth keeping.
      const body = err.message || res.statusText || "Request failed"
      return c.json({error: body}, res.status as 400, Object.fromEntries(res.headers))
    }
    const requestId = c.req.header("cf-ray") ?? crypto.randomUUID()
    console.error(
      JSON.stringify({requestId, path: c.req.path, error: String(err), stack: err.stack}),
    )
    return c.json({error: "Something went wrong", requestId}, 500)
  })
  .use("/api/*", rateLimit)
  .route("/api", auth)
  .route("/api", discord)
  .route("/api", memes)
  .route("/api", admin)
  .route("/api", users)
  .all("/api/*", (c) => c.json({error: "Not found"}, 404))
  .route("/", files)
  .route("/", page)
  .all("*", serveAsset)
