import {app, origin} from "../lib/app"
import {MEME_SELECT, toMeme, type MemeRow} from "../lib/meme"

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

// Some platforms prefer a page with Open Graph tags over a raw image URL. The
// copy button still hands out the direct file URL; this page exists for the rest.
export default app().get("/m/:id", async (c) => {
  const row = await c.env.DB.prepare(`${MEME_SELECT} where m.id = ? and m.status = 'live'`)
    .bind(c.req.param("id"))
    .first<MemeRow>()
  if (!row) return c.text("Not found", 404)
  const meme = toMeme(origin(c), row)
  const title = escapeHtml(meme.title || "lore")
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:url" content="${escapeHtml(`${origin(c)}/m/${meme.id}`)}">
<meta property="og:image" content="${escapeHtml(meme.url)}">
<meta property="og:image:type" content="${escapeHtml(meme.mime)}">
<meta property="og:image:width" content="${meme.width}">
<meta property="og:image:height" content="${meme.height}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escapeHtml(meme.url)}">
<style>
html,body{margin:0;height:100%;background:#09090b;color:#a1a1aa;font:14px system-ui,sans-serif}
body{display:grid;place-items:center;gap:12px;padding:24px;box-sizing:border-box}
img{max-width:100%;max-height:80vh;border-radius:10px}
a{color:#c4b5fd;text-decoration:none}
</style>
</head>
<body>
<img src="${escapeHtml(meme.url)}" alt="${title}" width="${meme.width}" height="${meme.height}">
<p>${title === "lore" ? "" : `${title} &middot; `}added by ${escapeHtml(meme.uploader.name)} &middot; <a href="/">lore</a></p>
</body>
</html>`
  return c.html(html, 200, {"cache-control": "public, max-age=300"})
})
