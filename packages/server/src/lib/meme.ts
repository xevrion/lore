import {splitTags} from "./search"
import type {Ext, Meme, UserSummary} from "./types"

export interface MemeRow {
  id: string
  key: string
  thumb_key: string | null
  ext: Ext
  mime: string
  width: number
  height: number
  size: number
  title: string
  tags: string
  uploader_id: string
  created_at: string
  copies: number
  views: number
  uploader_name: string
  uploader_color: string
  uploader_avatar_key: string | null
}

// Selects a meme row joined with what the client needs to render the uploader chip.
export const MEME_SELECT = `
  select m.*, u.name as uploader_name, u.color as uploader_color,
    u.avatar_key as uploader_avatar_key
  from meme m join user u on u.id = m.uploader_id`

export const avatarUrl = (origin: string, userId: string, avatarKey: string | null) =>
  avatarKey ? `${origin}/a/${userId}.webp` : null

export function toUser(
  origin: string,
  u: {id: string; name: string; color: string; avatarKey: string | null},
): UserSummary {
  return {
    id: u.id,
    name: u.name,
    color: u.color,
    avatarUrl: avatarUrl(origin, u.id, u.avatarKey),
  }
}

export function toMeme(origin: string, row: MemeRow): Meme {
  const url = `${origin}/i/${row.id}.${row.ext}`
  return {
    id: row.id,
    url,
    thumbUrl: row.thumb_key ? `${origin}/t/${row.id}.webp` : url,
    ext: row.ext,
    mime: row.mime,
    width: row.width,
    height: row.height,
    size: row.size,
    title: row.title,
    tags: splitTags(row.tags),
    createdAt: row.created_at,
    copies: row.copies,
    views: row.views,
    uploader: toUser(origin, {
      id: row.uploader_id,
      name: row.uploader_name,
      color: row.uploader_color,
      avatarKey: row.uploader_avatar_key,
    }),
  }
}
