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
expires in 24 hours. Send it to a friend over DM; they pick a name and an avatar (or,
with Discord login set up, they sign in with Discord instead)
and can upload straight away. The same page lists everyone and lets you revoke
access, which logs them out of every device immediately.

## Optional: traffic analytics

Cloudflare Web Analytics is free and cookieless. In the Cloudflare dashboard, open
**Analytics & Logs > Web Analytics**, add your site, and copy the token from the
JavaScript snippet (the `"token"` value). Paste it into `WEB_ANALYTICS_TOKEN` in
`wrangler.jsonc` and deploy again. The beacon is only injected when the token is set.

Per meme copy and fetch counts are stored in D1 and shown in the app itself. They
need no setup.

## Optional: Discord login

Out of the box an invite link is the whole login: a friend opens it, picks a name,
and gets a cookie that lasts 30 days on that device. If they want in from their phone
too, they need a second invite. Discord login removes that step. Friends claim the
invite with their Discord account and can sign in again on any device from the
login page, and you can see which Discord account each admin is in `/admin`.

1. Go to the [Discord developer portal](https://discord.com/developers/applications),
   create an application, open its **OAuth2** tab.
2. Add `https://lore.example.com/api/auth/discord/callback` as a redirect URL.
3. Copy the **Client ID** into `wrangler.jsonc` under `vars`:

   ```jsonc
   "vars": {
     "DISCORD_CLIENT_ID": "123456789012345678",
   },
   ```

4. Reset and copy the **Client Secret**, then run:

   ```sh
   pnpm exec wrangler secret put DISCORD_CLIENT_SECRET
   ```

5. Deploy again.

The login and join pages now show a "Continue with Discord" button, and the name-only
join form disappears: once Discord is configured, an invite link alone is not enough
to get in, the friend has to sign in with Discord too. Existing admins can connect
their Discord account from `/settings`. Invites still come from `/admin` as described
above; Discord only changes how a friend proves it is them.

For local development put both values in `.dev.vars` instead.

## Local development

```sh
pnpm migrate     # apply migrations to the local D1
pnpm seed        # optional: a dozen sample memes to look at
pnpm dev         # Vite on 5173, wrangler dev on 8787
```

Open `http://localhost:5173`. The Vite dev server proxies `/api`, `/i`, `/t`, `/a`
and `/m` to the Worker, which uses local D1 and R2 emulation stored under
`.wrangler/`. The Worker is told its public host is `localhost:5173`, so every URL it
hands out stays on the Vite origin and the browser never talks to port 8787 directly. Your authenticator code from setup works locally too because the
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
