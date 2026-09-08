import {customAlphabet} from "nanoid"

// No `-` or `_`: they look ambiguous in chat apps and some unfurlers stop the
// link at them.
export const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

export const MEME_ID_LENGTH = 7

export const newId = (size: number) => customAlphabet(ALPHABET, size)()

export async function uniqueMemeId(db: D1Database) {
  for (;;) {
    const id = newId(MEME_ID_LENGTH)
    const taken = await db.prepare("select 1 from meme where id = ?").bind(id).first()
    if (!taken) return id
  }
}
