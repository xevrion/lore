import {customAlphabet} from "nanoid"

// No `-` or `_` (some unfurlers stop the link at them) and none of 0/O/o or
// 1/l/I, which are identical in most fonts once someone retypes a link.
export const ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"

export const MEME_ID_LENGTH = 7

export const newId = (size: number) => customAlphabet(ALPHABET, size)()

export async function uniqueMemeId(db: D1Database) {
  for (;;) {
    const id = newId(MEME_ID_LENGTH)
    const taken = await db.prepare("select 1 from meme where id = ?").bind(id).first()
    if (!taken) return id
  }
}
