import {LIMITS} from "./types"

const MAX_TERMS = 8
const MIN_TERM_CHARS = 2

export interface SearchClause {
  where: string
  params: string[]
}

// Each term becomes a quoted FTS5 phrase, so operators like AND, NOT, `-` and
// `*` inside a word are matched literally instead of parsed. Only the closing
// quote needs escaping, by doubling it.
const phrase = (term: string) => `"${term.replaceAll('"', '""')}"`

// Every term must match the title or the tags (FTS5 ANDs adjacent phrases), and
// the last one is a prefix so results update while a word is still being typed.
// One-letter terms are dropped: they match nearly everything and cost the most.
export function buildSearch(query: string): SearchClause {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return {where: "1 = 1", params: []}
  const terms = words.filter((w) => w.length >= MIN_TERM_CHARS).slice(0, MAX_TERMS)
  if (terms.length === 0) return {where: "0 = 1", params: []}
  const match = terms.map((t, i) => phrase(t) + (i === terms.length - 1 ? "*" : "")).join(" ")
  return {where: "m.id in (select id from meme_fts where meme_fts match ?)", params: [match]}
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
