// JSON shapes shared with the client. The client imports this file as
// `@lore/server/types`, so anything exported here is part of the API contract.

export type Role = "owner" | "admin"

export type Ext = "png" | "jpg" | "gif" | "webp"

export interface UserSummary {
  id: string
  name: string
  color: string
  avatarUrl: string | null
}

export interface Me extends UserSummary {
  role: Role
}

export interface Meme {
  id: string
  url: string
  thumbUrl: string
  ext: Ext
  mime: string
  width: number
  height: number
  size: number
  title: string
  tags: string[]
  createdAt: string
  copies: number
  views: number
  uploader: UserSummary
}

export interface MemeList {
  items: Meme[]
  nextCursor: string | null
}

export type Sort = "new" | "top"

export interface AdminUser extends UserSummary {
  role: Role
  uploadCount: number
  createdAt: string
  revokedAt: string | null
  lastSeenAt: string | null
}

export interface PendingInvite {
  tokenHash: string
  createdAt: string
  expiresAt: string
}

export interface CreatedInvite {
  url: string
  expiresAt: string
}

export interface AdminStats {
  memes: number
  storageBytes: number
  copiesTotal: number
  viewsTotal: number
  uploadsLast7d: number
  topMemes: Meme[]
  topUploaders: {user: UserSummary; count: number}[]
}

export interface ApiError {
  error: string
}

export const LIMITS = {
  fileBytes: 25 * 1024 * 1024,
  gifInlineHintBytes: 8 * 1024 * 1024,
  avatarBytes: 200 * 1024,
  batchFiles: 30,
  nameChars: 32,
  titleChars: 120,
  tagCount: 10,
  tagChars: 32,
} as const
