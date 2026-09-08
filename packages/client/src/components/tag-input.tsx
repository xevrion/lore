import {LIMITS} from "@lore/server/types"
import {X} from "lucide-react"
import {useState} from "react"
import type {KeyboardEvent} from "react"

import {cn} from "@/lib/utils"

export function parseTags(value: string) {
  const seen = new Set<string>()
  for (const raw of value.toLowerCase().split(/[\s,]+/)) {
    const tag = raw.replace(/^#/, "").slice(0, LIMITS.tagChars)
    if (tag) seen.add(tag)
  }
  return Array.from(seen).slice(0, LIMITS.tagCount)
}

// Tags live as one space-separated string (that is what the API takes); the
// chips are just a view over it.
export function TagInput({
  value,
  onChange,
  id,
  className,
  autoFocus,
}: {
  value: string
  onChange: (next: string) => void
  id?: string
  className?: string
  autoFocus?: boolean
}) {
  const [draft, setDraft] = useState("")
  const tags = parseTags(value)
  const full = tags.length >= LIMITS.tagCount

  function commit() {
    const next = parseTags(`${value} ${draft}`)
    onChange(next.join(" "))
    setDraft("")
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === " " || e.key === ",") && draft.trim()) {
      e.preventDefault()
      commit()
    } else if (e.key === "Backspace" && !draft && tags.length) {
      onChange(tags.slice(0, -1).join(" "))
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1 text-sm dark:bg-input/30",
        "has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50",
        className,
      )}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex h-6 items-center gap-0.5 rounded-sm bg-secondary pr-0.5 pl-2 text-xs text-secondary-foreground"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            className="rounded-xs p-0.5 text-muted-foreground hover:text-foreground"
            onClick={() => onChange(tags.filter((t) => t !== tag).join(" "))}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        autoFocus={autoFocus}
        value={draft}
        disabled={full}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => draft.trim() && commit()}
        placeholder={tags.length ? "" : "tags, space separated"}
        className="min-w-16 flex-1 bg-transparent py-0.5 outline-none placeholder:text-muted-foreground disabled:opacity-50"
      />
    </div>
  )
}
