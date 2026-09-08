export interface Bindings {
  DB: D1Database
  BUCKET: R2Bucket
  ASSETS: Fetcher
  RATELIMIT_API: RateLimit
  RATELIMIT_AUTH: RateLimit
  RATELIMIT_COPY: RateLimit
  TOTP_SECRET: string
  OWNER_NAME?: string
  WEB_ANALYTICS_TOKEN?: string
  STORAGE_CAP_BYTES?: string
  DISCORD_CLIENT_ID?: string
  DISCORD_CLIENT_SECRET?: string
  DISCORD_GUILD_ID?: string
  MEMBER_SIGNUP?: string
  MEMBER_QUOTA_BYTES?: string
  MEMBER_DAILY_UPLOADS?: string
}
