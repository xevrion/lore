import type {Context} from "./app"
import {memberDailyUploads, memberQuotaBytes, origin} from "./app"
import type {MemeRow} from "./meme"
import {sql} from "./sql"
import type {Quota} from "./types"

const DAY_MS = 24 * 60 * 60 * 1000

// Pending memes count against a member's quota too, otherwise a queue full of
// unreviewed uploads would be free storage.
export async function quotaFor(c: Context, userId: string): Promise<Quota> {
  const since = new Date(Date.now() - DAY_MS).toISOString()
  const row = await sql(c.env.DB)`
    select coalesce(sum(size + thumb_size), 0) as bytes,
      coalesce(sum(case when created_at > ${since} then 1 else 0 end), 0) as today
    from meme where uploader_id = ${userId}
  `.first<{bytes: number; today: number}>()
  return {
    bytesUsed: row?.bytes ?? 0,
    bytesLimit: memberQuotaBytes(c.env),
    uploadsToday: row?.today ?? 0,
    uploadsLimit: memberDailyUploads(c.env),
  }
}

export const fileUrls = (c: Context, row: Pick<MemeRow, "id" | "ext">) => [
  `${origin(c)}/i/${row.id}.${row.ext}`,
  `${origin(c)}/t/${row.id}.webp`,
]

// The Cache API only purges this colo; other colos age out on their own. Each
// caller pairs this with a status change or a delete so the URL stops serving.
export const purgeMeme = (c: Context, row: Pick<MemeRow, "id" | "ext">) =>
  Promise.all(fileUrls(c, row).map((url) => caches.default.delete(url)))

export async function deleteMemes(
  c: Context,
  rows: Pick<MemeRow, "id" | "ext" | "key" | "thumb_key">[],
) {
  if (rows.length === 0) return
  const keys = rows.flatMap((r) => (r.thumb_key ? [r.key, r.thumb_key] : [r.key]))
  await Promise.all([
    c.env.BUCKET.delete(keys),
    c.env.DB.prepare(`delete from meme where id in (${rows.map(() => "?").join(",")})`)
      .bind(...rows.map((r) => r.id))
      .run(),
    ...rows.map((row) => purgeMeme(c, row)),
  ])
}
