import type {
  AdminStats,
  AdminUser,
  AuthConfig,
  CreatedInvite,
  Me,
  Meme,
  MemeList,
  PendingInvite,
  PendingMember,
  Sort,
} from "@lore/server/types"
import {useQuery} from "@tanstack/react-query"

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {credentials: "same-origin", ...init})
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed (${res.status})`
    throw new ApiError(res.status, message)
  }
  return data as T
}

function json(method: string, body: unknown): RequestInit {
  return {method, headers: {"content-type": "application/json"}, body: JSON.stringify(body)}
}

export const api = {
  me: () => request<Me>("/auth/me"),
  authConfig: () => request<AuthConfig>("/auth/config"),
  login: (totp: string) => request<Me>("/auth/login", json("POST", {totp})),
  logout: () => request<void>("/auth/logout", {method: "POST"}),
  logoutAll: () => request<void>("/auth/logout-all", {method: "POST"}),
  checkInvite: (token: string) =>
    request<{ok: true}>(`/auth/invite/${encodeURIComponent(token)}`),
  join: (form: FormData) => request<Me>("/auth/join", {method: "POST", body: form}),

  memes: (params: {cursor?: string | null; q?: string; sort?: Sort; limit?: number}) => {
    const search = new URLSearchParams()
    if (params.cursor) search.set("cursor", params.cursor)
    if (params.q) search.set("q", params.q)
    if (params.sort) search.set("sort", params.sort)
    if (params.limit) search.set("limit", String(params.limit))
    const qs = search.toString()
    return request<MemeList>(`/memes${qs ? `?${qs}` : ""}`)
  },
  meme: (id: string) => request<Meme>(`/memes/${id}`),
  updateMeme: (id: string, patch: {title?: string; tags?: string}) =>
    request<Meme>(`/memes/${id}`, json("PATCH", patch)),
  deleteMeme: (id: string) => request<void>(`/memes/${id}`, {method: "DELETE"}),

  updateMe: (form: FormData) => request<Me>("/users/me", {method: "PATCH", body: form}),

  adminStats: () => request<AdminStats>("/admin/stats"),
  adminUsers: () => request<AdminUser[]>("/admin/users"),
  invites: () => request<PendingInvite[]>("/admin/invites"),
  createInvite: () => request<CreatedInvite>("/admin/invites", {method: "POST"}),
  cancelInvite: (tokenHash: string) =>
    request<void>(`/admin/invites/${tokenHash}`, {method: "DELETE"}),
  revokeUser: (id: string) => request<void>(`/admin/users/${id}/revoke`, {method: "POST"}),

  reportMeme: (id: string) => request<void>(`/memes/${id}/report`, {method: "POST"}),
  review: (cursor?: string | null) =>
    request<MemeList>(`/admin/review${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
  reviewFileUrl: (id: string) => `/api/admin/memes/${id}/file`,
  approveMeme: (id: string) => request<Meme>(`/admin/memes/${id}/approve`, {method: "POST"}),
  hideMeme: (id: string) => request<Meme>(`/admin/memes/${id}/hide`, {method: "POST"}),
  trustUser: (id: string, trusted: boolean) =>
    request<void>(`/admin/users/${id}/trust`, json("POST", {trusted})),
  banUser: (id: string) =>
    request<{deleted: number}>(`/admin/users/${id}/ban`, {method: "POST"}),
  pendingMembers: () => request<PendingMember[]>("/admin/members/pending"),
  approveUser: (id: string) => request<void>(`/admin/users/${id}/approve`, {method: "POST"}),
  rejectUser: (id: string) => request<void>(`/admin/users/${id}/reject`, {method: "POST"}),
}

// Staff are owners and admins. Members upload within a quota and only touch their own memes.
export const isStaff = (me: Me | null | undefined) => Boolean(me && me.role !== "member")

// A member an admin has not approved yet can sign in but do nothing else.
export const isPending = (me: Me | null | undefined) => Boolean(me && !me.approved)

// How many members and memes are waiting on staff. Polled on focus so the menu
// badge stays honest without a websocket.
export function useReviewCount() {
  const {data: me} = useMe()
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: api.adminStats,
    enabled: isStaff(me),
    refetchOnWindowFocus: true,
    staleTime: 60 * 1000,
    select: (s) => s.pendingMembers + s.pendingCount + s.hiddenCount,
  })
}

// Fire and forget. sendBeacon survives navigation and never blocks the copy toast.
export function recordCopy(id: string) {
  const url = `/api/memes/${id}/copy`
  if (!navigator.sendBeacon || !navigator.sendBeacon(url)) {
    void fetch(url, {method: "POST", keepalive: true}).catch(() => {})
  }
}

export const meQueryKey = ["me"] as const

export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: async () => {
      try {
        return await api.me()
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

// Which sign-in methods this instance offers. Static per deploy, so cache hard.
export function useAuthConfig() {
  return useQuery({
    queryKey: ["auth-config"],
    queryFn: api.authConfig,
    staleTime: Infinity,
    retry: false,
  })
}

export function memesQueryKey(sort: Sort, q: string) {
  return ["memes", sort, q] as const
}
