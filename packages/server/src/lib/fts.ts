// The full-text index is maintained here rather than by triggers: D1's remote
// migration runner cannot apply trigger bodies. Every write to a meme's title or
// tags, and every removal, must go through these two calls.
export async function indexMeme(
  db: D1Database,
  meme: {id: string; title: string; tags: string},
) {
  await db.batch([
    db.prepare("delete from meme_fts where id = ?").bind(meme.id),
    db
      .prepare("insert into meme_fts (id, title, tags) values (?, ?, ?)")
      .bind(meme.id, meme.title, meme.tags),
  ])
}

export async function unindexMemes(db: D1Database, ids: string[]) {
  if (ids.length === 0) return
  await db
    .prepare(`delete from meme_fts where id in (${ids.map(() => "?").join(",")})`)
    .bind(...ids)
    .run()
}

export const unindexMeme = (db: D1Database, id: string) => unindexMemes(db, [id])
