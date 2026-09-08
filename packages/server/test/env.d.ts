/// <reference types="@cloudflare/vitest-pool-workers/types" />
import type {D1Migration} from "cloudflare:test"

import type {Bindings} from "../src/env"

// The generated Env only knows about bindings in wrangler.jsonc and .dev.vars,
// so tests type it against the Worker's own Bindings instead.
declare global {
  namespace Cloudflare {
    interface Env extends Bindings {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}
