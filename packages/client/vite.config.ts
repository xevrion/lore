import {fileURLToPath} from "node:url"

import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import {defineConfig} from "vite"

// In development the API and file routes are served by `wrangler dev` on 8787.
const worker = "http://localhost:8787"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {"@": fileURLToPath(new URL("./src", import.meta.url))},
  },
  server: {
    // Anchored so `/a/` does not also capture `/admin`.
    proxy: Object.fromEntries(["api", "i", "t", "a", "m"].map((p) => [`^/${p}/`, worker])),
  },
  build: {
    target: "es2022",
    sourcemap: false,
  },
})
