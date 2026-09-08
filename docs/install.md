# Set up your own lore

You need a Cloudflare account, a domain whose DNS is on Cloudflare, Node.js 22.12 or
newer, and pnpm. Nothing else. Everything runs on Cloudflare's free tier and there
is no credit card step.

The examples use `lore.example.com`. Swap in your own domain as you go.

## Get the code

Fork this repository on GitHub, then:

```sh
git clone https://github.com/YOUR_USERNAME/lore.git
cd lore
pnpm install
pnpm exec wrangler login
```

## Create the database and bucket

```sh
pnpm exec wrangler d1 create lore
pnpm exec wrangler r2 bucket create lore
```

The first command prints a `database_id`. Open `wrangler.jsonc` and paste it over
`REPLACE_WITH_YOUR_DATABASE_ID`. The bucket name is already `lore`; change it in
`wrangler.jsonc` if you picked a different one.

Then create the tables:

```sh
pnpm exec wrangler d1 migrations apply lore --remote
```

## Pick your address

Still in `wrangler.jsonc`, point `routes` at your domain:

```jsonc
"routes": [
  {
    "pattern": "lore.example.com",
    "zone_name": "example.com",
    "custom_domain": true,
  },
],
```

Wrangler creates the DNS record for you on the first deploy.

## Set up your login

There are no passwords. You sign in with a six digit code from an authenticator
app (Aegis, Ente Auth, 1Password, Google Authenticator, anything TOTP). Have it
open, then run:

```sh
node scripts/setup.ts
```

Scan the QR code it prints. The script saves the secret to `.dev.vars` for local
development and uploads it to your Worker with `wrangler secret put`. Keep
`.dev.vars` private; it is already in `.gitignore`.

If you want a different display name than `owner`, edit `OWNER_NAME` in
`wrangler.jsonc` before your first login. The owner account is created the first
time a valid code is entered.

## Deploy

```sh
pnpm run deploy
```

That builds the client and publishes the Worker. Open `https://lore.example.com/login`,
type your code, and upload the first meme.

### Or let GitHub deploy for you

In your fork, go to **Settings > Secrets and variables > Actions** and add:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`, created from the "Edit Cloudflare Workers" template with
  D1 edit added to it.

Commit your edited `wrangler.jsonc` and push to `main`. The workflow in
`.github/workflows/ci.yml` runs the checks, applies pending migrations and deploys.
Every later push to `main` does the same.

## Invite friends

Sign in, open `/admin`, click **New invite**. You get a link that works once and
expires in 24 hours. Send it to a friend over DM; they pick a name and an avatar
and can upload straight away. The same page lists everyone and lets you revoke
access, which logs them out of every device immediately.

## Optional: traffic analytics

Cloudflare Web Analytics is free and cookieless. In the Cloudflare dashboard, open
**Analytics & Logs > Web Analytics**, add your site, and copy the token from the
JavaScript snippet (the `"token"` value). Paste it into `WEB_ANALYTICS_TOKEN` in
`wrangler.jsonc` and deploy again. The beacon is only injected when the token is set.

Per meme copy and fetch counts are stored in D1 and shown in the app itself. They
need no setup.

## Local development

```sh
pnpm migrate     # apply migrations to the local D1
pnpm seed        # optional: a dozen sample memes to look at
pnpm dev         # Vite on 5173, wrangler dev on 8787
```

Open `http://localhost:5173`. The Vite dev server proxies `/api`, `/i`, `/t`, `/a`
and `/m` to the Worker, which uses local D1 and R2 emulation stored under
`.wrangler/`. Your authenticator code from setup works locally too because the
same secret is in `.dev.vars`.

Run the whole CI suite locally with:

```sh
pnpm exec oxfmt --check
pnpm exec oxlint
pnpm run check
pnpm run test
pnpm run build
```

## Limits worth knowing

Cloudflare's free tier gives you 10 GB of R2 storage, 5 GB of D1, 100,000 Worker
requests a day and a generous number of D1 reads. A friend group with a few
thousand memes sits well inside that. Memes are served through the edge cache, so
a popular GIF pasted into a busy Discord server costs one Worker request, not one
per viewer.

Discord renders GIFs inline reliably up to about 8 MB. The uploader warns you
above that, and refuses anything over 25 MB.
