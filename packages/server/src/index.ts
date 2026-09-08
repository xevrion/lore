import {HTTPException} from "hono/http-exception"

import {app, type Context} from "./lib/app"
import admin from "./routes/admin"
import auth from "./routes/auth"
import discord from "./routes/discord"
import files from "./routes/files"
import memes from "./routes/memes"
import page from "./routes/page"
import users from "./routes/users"

// Hash of the inline theme script in packages/client/index.html. If that script
// changes, recompute with: sha256 of the text between <script> and </script>.
const THEME_SCRIPT_HASH = "'sha256-+MhaSb7ZBUZppFXgeJSziTAA9mQue/2pPZYMlJxRK9E='"

const CSP = [
  "default-src 'self'",
  `script-src 'self' ${THEME_SCRIPT_HASH} https://static.cloudflareinsights.com`,
  "connect-src 'self' https://cloudflareinsights.com",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ")

const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy": CSP,
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
}

const GUESSABLE = /^\/api\/auth\/(login|join|invite|discord)/

async function rateLimit(c: Context, next: () => Promise<void>) {
  // Code and invite guessing is throttled globally: there is one account to
  // guess. Everything else, /auth/me included, gets the per-IP budget.
  const outcome = GUESSABLE.test(c.req.path)
    ? await c.env.RATELIMIT_AUTH.limit({key: "auth"})
    : await c.env.RATELIMIT_API.limit({key: c.req.header("cf-connecting-ip") ?? "unknown"})
  if (!outcome.success) throw new HTTPException(429, {message: "Too many requests"})
  await next()
}

// The SPA comes from Workers Static Assets. Passing it through here adds the
// security headers and, when configured, the Cloudflare Web Analytics beacon.
async function serveAsset(c: Context) {
  const upstream = await c.env.ASSETS.fetch(c.req.raw)
  const headers = new Headers(upstream.headers)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value)
  const isHtml = (upstream.headers.get("content-type") ?? "").includes("text/html")
  const token = c.env.WEB_ANALYTICS_TOKEN
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
