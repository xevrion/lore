#!/usr/bin/env node
// Creates the owner's authenticator secret. It is the only secret lore needs.
import {spawnSync} from "node:child_process"
import {chmod, open, readFile} from "node:fs/promises"
import {fileURLToPath} from "node:url"
import {parseArgs, parseEnv} from "node:util"

import {parse} from "jsonc-parser"
import {generateSecret, generateURI} from "otplib"
import QRCode from "qrcode"

const root = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))

interface WranglerConfig {
  name?: string
  routes?: (string | {pattern: string; custom_domain?: boolean})[]
}

async function readDomain() {
  const config = parse(await readFile(root("wrangler.jsonc"), "utf8")) as WranglerConfig | null
  const route = config?.routes?.find((r) => typeof r === "object" && r.custom_domain)
  return typeof route === "object" ? route.pattern : (config?.name ?? "lore")
}

async function ensureSecret(path: string) {
  const file = await open(path, "a+", 0o600)
  try {
    const contents = await file.readFile("utf8")
    const existing = parseEnv(contents).TOTP_SECRET?.trim()
    if (existing) return {secret: existing, created: false}
    const secret = generateSecret()
    const newline = contents.length && !contents.endsWith("\n") ? "\n" : ""
    await file.writeFile(`${newline}TOTP_SECRET=${secret}\n`)
    return {secret, created: true}
  } finally {
    await chmod(path, 0o600)
    await file.close()
  }
}

function uploadSecret(secret: string) {
  const result = spawnSync(
    process.execPath,
    [root("node_modules/wrangler/bin/wrangler.js"), "secret", "put", "TOTP_SECRET"],
    {cwd: root(""), input: secret, stdio: ["pipe", "inherit", "inherit"]},
  )
  if (result.status !== 0) {
    throw new Error(
      "Could not upload the secret. Run `pnpm exec wrangler login` and try again.",
    )
  }
}

async function main() {
  const {values} = parseArgs({
    options: {
      "local-only": {type: "boolean", default: false},
      help: {type: "boolean", short: "h", default: false},
    },
  })
  if (values.help) {
    console.log("Usage: node scripts/setup.ts [--local-only]")
    console.log("Generates TOTP_SECRET into .dev.vars and uploads it to your Worker.")
    console.log("--local-only skips the upload, for development without a Cloudflare login.")
    return
  }
  const domain = await readDomain()
  const {secret, created} = await ensureSecret(root(".dev.vars"))
  const uri = generateURI({issuer: "lore", label: domain, secret})
  console.log(
    created ? "New secret written to .dev.vars." : "Using the secret already in .dev.vars.",
  )
  console.log("\nAdd an account in your authenticator app by scanning this:\n")
  console.log(await QRCode.toString(uri, {type: "terminal", small: true}))
  console.log(`Or type the key by hand: ${secret}\n`)
  if (values["local-only"]) {
    console.log("Skipped the upload. Run without --local-only to push it to Cloudflare.")
    return
  }
  console.log("Uploading TOTP_SECRET to your Worker...")
  uploadSecret(secret)
  console.log("\nDone. Deploy, open /login and enter the code from your app.")
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
