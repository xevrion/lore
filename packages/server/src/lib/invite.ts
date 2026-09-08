import {HTTPException} from "hono/http-exception"

import {now} from "./app"
import {sql} from "./sql"

export interface InviteRow {
  used_at: string | null
  expires_at: string
}

export const findInvite = (db: D1Database, tokenHash: string) =>
  sql(
    db,
  )`select used_at, expires_at from invite where token_hash = ${tokenHash}`.first<InviteRow>()

export function checkInvite(invite: InviteRow | null) {
  if (!invite) throw new HTTPException(404, {message: "This invite link is not valid"})
  if (invite.used_at)
    throw new HTTPException(410, {message: "This invite has already been used"})
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    throw new HTTPException(410, {message: "This invite has expired"})
  }
}

// Consuming first, with the `used_at is null` guard, means two people racing on
// the same link cannot both get in.
export async function consumeInvite(db: D1Database, tokenHash: string) {
  const consumed = await sql(db)`
    update invite set used_at = ${now()} where token_hash = ${tokenHash} and used_at is null
  `.run()
  if (consumed.meta.changes !== 1) {
    throw new HTTPException(410, {message: "This invite has already been used"})
  }
}

export const markInviteUsedBy = (db: D1Database, tokenHash: string, userId: string) =>
  sql(db)`update invite set used_by = ${userId} where token_hash = ${tokenHash}`.run()
