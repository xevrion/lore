# lore

A self-hosted meme host for you and your friends. Upload images and GIFs, click one
to copy its link, paste it anywhere and it shows up as the real image, the way Tenor
GIFs do in Discord. Runs free on Cloudflare. [**Install**](docs/install.md)

One person hosts it and signs in with an authenticator code. Friends get in through
single-use invite links, no passwords anywhere. Everyone else can browse, search and
copy links without an account.

Memes are served from `/i/<id>.<ext>` with the right `Content-Type`, a year-long
immutable cache header and no `Content-Disposition`, so Discord, WhatsApp, Slack and
friends unfurl them inline instead of showing a link card. Responses are cached at
Cloudflare's edge; a link pasted into a busy server costs one Worker request.

The whole thing is one Cloudflare Worker with D1 for metadata, R2 for files, and the
React client served as static assets from the same deploy. Nothing else to sign up
for. Inspired by [aspizu/dcim](https://github.com/aspizu/dcim).

![gallery](docs/assets/gallery.webp)

## What you get

- A masonry wall of memes, GIFs animating, infinite scroll, live search by title and tag.
- Click to copy the direct link. New and Top (most copied) sorting.
- Drag and drop, paste from clipboard, or pick files to upload up to 30 at a time. JPG
  and PNG are re-encoded in the browser first so EXIF (including GPS) never leaves your
  machine. GIFs are stored byte for byte.
- Every meme shows who added it. Any admin can edit titles and tags or delete anything.
- Owner dashboard with storage used, copy counts, top memes, top uploaders, invite
  management and one-click revoke.
- Magic-byte sniffing on every upload, rate limits, hashed sessions with sliding
  expiry, security headers, forward-only migrations, tests on the tricky bits, CI that
  deploys on push.

## Development

```sh
pnpm install
pnpm migrate
pnpm seed
pnpm dev
```

See [docs/install.md](docs/install.md) for the full setup, including local development
details and how to run the checks CI runs.

## License

MIT
