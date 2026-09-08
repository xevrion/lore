import {mkdirSync} from "node:fs"
import {fileURLToPath} from "node:url"

import {cloudflareTest, readD1Migrations} from "@cloudflare/vitest-pool-workers"
import {defineConfig} from "vitest/config"

const root = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url))

export default defineConfig(async () => {
  // The Worker config points at the client build, which a fresh clone does not have.
  mkdirSync(root("packages/client/dist"), {recursive: true})
  const migrations = await readD1Migrations(root("migrations"))
  return {
    plugins: [
      cloudflareTest({
        wrangler: {configPath: root("wrangler.jsonc")},
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            TOTP_SECRET: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
            DISCORD_CLIENT_ID: "test-client",
            DISCORD_CLIENT_SECRET: "test-secret",
          },
          // The real login limit is 10 a minute, which the suite would exhaust.
          ratelimits: {
            RATELIMIT_AUTH: {namespace_id: "1002", simple: {limit: 10_000, period: 60}},
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/setup.ts"],
      include: ["test/**/*.test.ts"],
    },
  }
})
