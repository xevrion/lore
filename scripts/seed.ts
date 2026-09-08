#!/usr/bin/env node
// Fills the local D1 and R2 with an owner and some sample memes for UI work.
// Images are generated here so nothing is fetched from the network.
import {spawnSync} from "node:child_process"
import {mkdtempSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {deflateSync} from "node:zlib"

const root = fileURLToPath(new URL("..", import.meta.url))
const wrangler = join(root, "node_modules/wrangler/bin/wrangler.js")

function run(args: string[]) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {cwd: root, encoding: "utf8"})
  if (result.status !== 0) {
    throw new Error(
      `wrangler ${args.slice(0, 3).join(" ")} failed:\n${result.stderr || result.stdout}`,
    )
  }
}

const crcTable = Uint32Array.from({length: 256}, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff
  for (const b of bytes) c = (crcTable[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(
    [...type].map((ch) => ch.charCodeAt(0)),
    4,
  )
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

type Rgb = [number, number, number]

function png(width: number, height: number, top: Rgb, bottom: Rgb) {
  const stride = width * 3 + 1
  const raw = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const t = y / Math.max(1, height - 1)
    const [r, g, b] = top.map((c, i) => Math.round(c + ((bottom[i] ?? 0) - c) * t))
    for (let x = 0; x < width; x++) {
      const o = y * stride + 1 + x * 3
      raw[o] = r ?? 0
      raw[o + 1] = g ?? 0
      raw[o + 2] = b ?? 0
    }
  }
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", new Uint8Array(deflateSync(raw))),
    pngChunk("IEND", new Uint8Array(0)),
  ])
}

// Uncompressed LZW: with a minimum code size of 7, every literal fits in one
// byte, and a clear code before the table would widen keeps it that way.
function gifImageData(pixels: Uint8Array) {
  const codes: number[] = [128]
  for (let i = 0; i < pixels.length; i++) {
    if (i > 0 && i % 120 === 0) codes.push(128)
    codes.push(pixels[i] ?? 0)
  }
  codes.push(129)
  const blocks: number[] = [7]
  for (let i = 0; i < codes.length; i += 255) {
    const chunk = codes.slice(i, i + 255)
    blocks.push(chunk.length, ...chunk)
  }
  blocks.push(0)
  return blocks
}

const le16 = (n: number) => [n & 0xff, n >> 8]

function gif(size: number, colors: Rgb[], frames: number) {
  const bytes: number[] = [
    ...[..."GIF89a"].map((ch) => ch.charCodeAt(0)),
    ...le16(size),
    ...le16(size),
    0xf1,
    0,
    0,
    ...colors.flat(),
    ...Array(3 * (4 - colors.length)).fill(0),
    0x21,
    0xff,
    0x0b,
    ...[..."NETSCAPE2.0"].map((ch) => ch.charCodeAt(0)),
    3,
    1,
    0,
    0,
    0,
  ]
  const tile = Math.max(4, size / 6)
  for (let f = 0; f < frames; f++) {
    const pixels = new Uint8Array(size * size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cell = Math.floor((x + f * tile) / tile) + Math.floor(y / tile)
        pixels[y * size + x] = (cell + f) % colors.length
      }
    }
    bytes.push(0x21, 0xf9, 4, 0, ...le16(12), 0, 0)
    bytes.push(0x2c, 0, 0, 0, 0, ...le16(size), ...le16(size), 0)
    bytes.push(...gifImageData(pixels))
  }
  bytes.push(0x3b)
  return Buffer.from(bytes)
}

interface Sample {
  id: string
  ext: "png" | "gif"
  title: string
  tags: string
  bytes: Buffer
  width: number
  height: number
  copies: number
  daysAgo: number
}

const violet: Rgb = [124, 58, 237]
const rose: Rgb = [225, 29, 72]
const amber: Rgb = [245, 158, 11]
const emerald: Rgb = [16, 185, 129]
const sky: Rgb = [14, 165, 233]
const zinc: Rgb = [39, 39, 42]
const ink: Rgb = [9, 9, 11]

const still = (
  id: string,
  title: string,
  tags: string,
  w: number,
  h: number,
  a: Rgb,
  b: Rgb,
  copies: number,
  daysAgo: number,
): Sample => ({
  id,
  ext: "png",
  title,
  tags,
  bytes: png(w, h, a, b),
  width: w,
  height: h,
  copies,
  daysAgo,
})

const anim = (
  id: string,
  title: string,
  tags: string,
  size: number,
  colors: Rgb[],
  copies: number,
  daysAgo: number,
): Sample => ({
  id,
  ext: "gif",
  title,
  tags,
  bytes: gif(size, colors, 6),
  width: size,
  height: size,
  copies,
  daysAgo,
})

const samples: Sample[] = [
  still(
    "s33dAa1",
    "when the build passes first try",
    "programming rare wholesome",
    640,
    480,
    violet,
    ink,
    41,
    1,
  ),
  anim(
    "s33dGf1",
    "aryan discovering the group chat at 3am",
    "aryan late night chaos",
    240,
    [violet, rose, amber],
    88,
    2,
  ),
  still("s33dAa2", "", "food canteen sunday", 480, 640, amber, rose, 5, 2),
  still("s33dAa3", "the exam timetable drop", "exams pain iitj", 800, 450, rose, zinc, 23, 3),
  anim("s33dGf2", "reaction: no", "reaction no nope", 200, [emerald, ink], 130, 4),
  still(
    "s33dAa4",
    "riya's cat judging the code review",
    "cat riya judging",
    600,
    600,
    sky,
    violet,
    17,
    5,
  ),
  still(
    "s33dAa5",
    "hostel wifi at 11:59pm",
    "wifi hostel suffering",
    900,
    300,
    zinc,
    ink,
    9,
    6,
  ),
  still("s33dAa6", "", "reaction confused", 512, 768, emerald, sky, 2, 7),
  anim(
    "s33dGf3",
    "celebration but tired",
    "celebration tired reaction",
    256,
    [amber, violet, emerald, rose],
    64,
    8,
  ),
  still("s33dAa7", "mess food tier list", "food mess tierlist", 1000, 700, rose, amber, 12, 10),
  still(
    "s33dAa8",
    "dev's face when the demo works",
    "dev presentation relief",
    720,
    720,
    violet,
    sky,
    31,
    12,
  ),
  still(
    "s33dAa9",
    "merge conflict, colourised",
    "git programming pain",
    640,
    360,
    ink,
    rose,
    7,
    15,
  ),
]

const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`

function main() {
  const dir = mkdtempSync(join(tmpdir(), "lore-seed-"))
  const now = Date.now()
  const statements = [
    `insert into user (id, name, role, color, created_at) values ('owner', 'owner', 'owner', '#7c3aed', '${new Date(now - 30 * 86_400_000).toISOString()}') on conflict (id) do nothing`,
  ]
  for (const s of samples) {
    const file = join(dir, `${s.id}.${s.ext}`)
    writeFileSync(file, s.bytes)
    const mime = s.ext === "gif" ? "image/gif" : "image/png"
    console.log(`putting ${s.id}.${s.ext} (${s.bytes.length} bytes)`)
    run([
      "r2",
      "object",
      "put",
      `lore/${s.id}.${s.ext}`,
      "--file",
      file,
      "--content-type",
      mime,
      "--local",
    ])
    const createdAt = new Date(now - s.daysAgo * 86_400_000).toISOString()
    statements.push(
      `insert into meme (id, key, thumb_key, ext, mime, width, height, size, title, tags, uploader_id, created_at, copies, views)
       values (${sqlString(s.id)}, ${sqlString(`${s.id}.${s.ext}`)}, null, '${s.ext}', '${mime}', ${s.width}, ${s.height}, ${s.bytes.length}, ${sqlString(s.title)}, ${sqlString(s.tags)}, 'owner', '${createdAt}', ${s.copies}, ${s.copies * 3})
       on conflict (id) do nothing`,
    )
  }
  console.log("inserting rows")
  run(["d1", "execute", "lore", "--local", "--command", statements.join(";\n")])
  console.log(`seeded ${samples.length} memes`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
