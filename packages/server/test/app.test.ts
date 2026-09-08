import {createExecutionContext, env, SELF, waitOnExecutionContext} from "cloudflare:test"
import {describe, expect, it} from "vitest"

import worker from "../src/index"
import {ORIGIN} from "./helpers"

describe("app shell", () => {
  it("serves the SPA with security headers", async () => {
    const res = await SELF.fetch(`${ORIGIN}/`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/html")
    const csp = res.headers.get("content-security-policy") ?? ""
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("img-src 'self' data: blob:")
    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    expect(csp).toMatch(
      /script-src 'self' 'sha256-[A-Za-z0-9+/=]+' https:\/\/static\.cloudflareinsights\.com/,
    )
    expect(res.headers.get("x-frame-options")).toBe("DENY")
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    expect(await res.text()).not.toContain("cloudflareinsights")
  })

  // wrangler.jsonc sets the token to "", and vars win over test bindings, so the
  // Worker is invoked directly with a token to exercise the injection path.
  it("injects the analytics beacon when a token is configured", async () => {
    const ctx = createExecutionContext()
    const res = await worker.fetch(
      new Request(`${ORIGIN}/`),
      {...env, WEB_ANALYTICS_TOKEN: "test-beacon-token"},
      ctx,
    )
    await waitOnExecutionContext(ctx)
    const html = await res.text()
    expect(html).toContain('src="https://static.cloudflareinsights.com/beacon.min.js"')
    expect(html).toContain('data-cf-beacon=\'{"token":"test-beacon-token"}\'')
    expect(html.indexOf("beacon.min.js")).toBeLessThan(html.indexOf("</body>"))
  })

  it("answers unknown API paths with json, not the SPA", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/nope`)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({error: "Not found"})
  })

  it("turns validation failures into a readable error", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/auth/login`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({totp: "12"}),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as {error: string}
    expect(body.error).toMatch(/^totp: /)
  })
})
