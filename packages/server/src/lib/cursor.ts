import type {Sort} from "./types"

export type Cursor =
  | {sort: "new"; createdAt: string; id: string}
  | {sort: "top"; copies: number; id: string}

const toBase64Url = (s: string) =>
  btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

const fromBase64Url = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"))

export function encodeCursor(cursor: Cursor): string {
  return toBase64Url(JSON.stringify(cursor))
}

export function decodeCursor(raw: string, sort: Sort): Cursor | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(fromBase64Url(raw))
  } catch {
    return null
  }
  if (typeof parsed !== "object" || parsed === null) return null
  const c = parsed as Record<string, unknown>
  if (c.sort !== sort || typeof c.id !== "string") return null
  if (sort === "new" && typeof c.createdAt === "string") {
    return {sort, createdAt: c.createdAt, id: c.id}
  }
  if (sort === "top" && typeof c.copies === "number") {
    return {sort, copies: c.copies, id: c.id}
  }
  return null
}
