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

// No includeSubDomains: the zone hosts other projects that are not lore's to pin.
export const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy": CSP,
  "strict-transport-security": "max-age=15552000",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
}

export function withSecurityHeaders(headers: Headers) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value)
  return headers
}
