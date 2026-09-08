// JSON shapes shared with the client. The client imports this file as
// `@lore/server/types`, so anything exported here is part of the API contract.

export type Role = "owner" | "admin" | "member"

// Live memes are public. Pending ones wait for a staff approval, hidden ones
// were pulled by reports and wait for a staff decision.
export type MemeStatus = "live" | "pending" | "hidden"

export type Ext = "png" | "jpg" | "gif" | "webp"

export interface UserSummary {
  id: string
  name: string
  color: string
  avatarUrl: string | null
}

export interface Quota {
  bytesUsed: number
  bytesLimit: number
  uploadsToday: number
  uploadsLimit: number
}

export interface Me extends UserSummary {
  role: Role
  discordLinked: boolean
  // False only for a member an admin has not approved yet.
  approved: boolean
  // Null for staff, who have no quota.
  quota: Quota | null
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
  status: MemeStatus
  reports: number
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
  discordLinked: boolean
  trusted: boolean
  bannedAt: string | null
  bytesUsed: number
  pendingCount: number
  approvedAt: string | null
}

export interface PendingMember extends UserSummary {
  discordLinked: boolean
  createdAt: string
}

export interface AuthConfig {
  discord: boolean
  // True when any Discord account can sign in as a member, pending approval.
  members: boolean
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
  storageCap: number
  copiesTotal: number
  viewsTotal: number
  uploadsLast7d: number
  pendingCount: number
  hiddenCount: number
  pendingMembers: number
  topMemes: Meme[]
  topUploaders: {user: UserSummary; count: number}[]
}

export interface ApiError {
  error: string
}

export const LIMITS = {
  fileBytes: 10 * 1024 * 1024,
  gifInlineHintBytes: 8 * 1024 * 1024,
  avatarBytes: 200 * 1024,
  batchFiles: 30,
  nameChars: 32,
  titleChars: 120,
  tagCount: 10,
  tagChars: 32,
  memberGifBytes: 5 * 1024 * 1024,
  trustAfterApprovals: 10,
  hideAfterReports: 2,
} as const
