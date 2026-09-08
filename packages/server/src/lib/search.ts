import {LIMITS} from "./types"

const MAX_TERMS = 8

const escapeLike = (term: string) => term.replace(/[\\%_]/g, (ch) => `\\${ch}`)

export interface SearchClause {
  where: string
  params: string[]
}

// Every term must match either the title or the tags. Terms are ANDed so
// "cat gif" narrows rather than widens.
export function buildSearch(query: string): SearchClause {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, MAX_TERMS)
  if (terms.length === 0) return {where: "1 = 1", params: []}
  const where = terms
    .map(() => "(m.title like ? escape '\\' or m.tags like ? escape '\\')")
    .join(" and ")
  const params = terms.flatMap((t) => {
    const pattern = `%${escapeLike(t)}%`
    return [pattern, pattern]
  })
  return {where, params}
}

export function normalizeTags(input: string | string[]): string {
  const raw = Array.isArray(input) ? input.join(" ") : input
  const seen = new Set<string>()
  for (const piece of raw.toLowerCase().split(/[\s,]+/)) {
    const tag = piece.replace(/^#+/, "").slice(0, LIMITS.tagChars)
    if (tag) seen.add(tag)
    if (seen.size === LIMITS.tagCount) break
  }
  return [...seen].join(" ")
}

export const splitTags = (tags: string) => tags.split(" ").filter(Boolean)
