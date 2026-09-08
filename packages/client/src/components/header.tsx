import type {Sort} from "@lore/server/types"
import {useQueryClient} from "@tanstack/react-query"
import {LogOut, Moon, Search, Settings, Shield, Sun, Upload, X} from "lucide-react"
import {useEffect, useRef} from "react"
import {Link, useNavigate} from "react-router"
import {toast} from "sonner"

import {api, meQueryKey, useMe} from "@/api"
import {UserAvatar} from "@/components/added-by"
import {Button} from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {Wordmark} from "@/components/wordmark"
import {useTheme} from "@/lib/theme"
import {cn} from "@/lib/utils"

interface HeaderProps {
  query?: string
  onQuery?: (q: string) => void
  sort?: Sort
  onSort?: (s: Sort) => void
  onUpload?: () => void
}

export function Header({query, onQuery, sort, onSort, onUpload}: HeaderProps) {
  const {data: me} = useMe()
  const inputRef = useRef<HTMLInputElement>(null)
  const searchable = onQuery !== undefined

  useEffect(() => {
    if (!searchable) return
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      if ((e.key === "/" && !typing) || (e.key === "k" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [searchable])

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/95">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:flex-nowrap sm:gap-x-4 sm:px-6 sm:py-2.5">
        <Wordmark className="h-8" />
        {searchable && (
          <div className="order-last flex w-full items-center gap-2 sm:order-none sm:mx-auto sm:w-auto sm:max-w-md sm:flex-1">
            <label className="relative flex-1">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    onQuery("")
                    inputRef.current?.blur()
                  }
                }}
                placeholder="Search titles and tags"
                aria-label="Search memes"
                className="h-10 w-full rounded-md border border-input bg-transparent pr-8 pl-8 text-sm transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:h-8 dark:bg-input/30 [&::-webkit-search-cancel-button]:hidden"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => onQuery("")}
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded-sm border px-1 font-sans text-[10px] text-muted-foreground sm:block">
                  /
                </kbd>
              )}
            </label>
            {sort && onSort && <SortToggle sort={sort} onSort={onSort} />}
          </div>
        )}
        <div className="ml-auto flex h-10 items-center gap-1.5 sm:ml-0 sm:h-8 sm:gap-2">
          {me && onUpload && (
            <Button
              size="sm"
              onClick={onUpload}
              aria-label="Upload"
              className="pressable h-10 w-10 sm:h-8 sm:w-auto"
            >
              <Upload aria-hidden />
              <span className="hidden sm:inline">Upload</span>
            </Button>
          )}
          {me ? (
            <UserMenu />
          ) : (
            <Link
              to="/login"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}

function SortToggle({sort, onSort}: {sort: Sort; onSort: (s: Sort) => void}) {
  return (
    <div
      role="radiogroup"
      aria-label="Sort"
      className="relative grid h-10 shrink-0 grid-cols-2 rounded-md border border-input p-0.5 text-xs sm:h-8 dark:bg-input/30"
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-[5px] bg-secondary transition-transform duration-200 ease-(--ease-out-strong)",
          sort === "top" && "translate-x-full",
        )}
      />
      {(["new", "top"] as Sort[]).map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={sort === s}
          onClick={() => onSort(s)}
          className={cn(
            "relative z-10 h-full rounded-[5px] px-2.5 font-medium capitalize transition-colors duration-150",
            sort === s ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {s}
        </button>
      ))}
    </div>
  )
}

function UserMenu() {
  const {data: me} = useMe()
  const {theme, toggle} = useTheme()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  if (!me) return null

  async function logout() {
    try {
      await api.logout()
    } finally {
      queryClient.setQueryData(meQueryKey, null)
      void queryClient.invalidateQueries()
      toast("Signed out")
      void navigate("/")
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="pressable inline-flex size-10 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:size-8"
      >
        <UserAvatar user={me} size="md" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium">{me.name}</p>
          <p className="text-xs text-muted-foreground">{me.role}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate("/settings")}>
          <Settings aria-hidden />
          Settings
        </DropdownMenuItem>
        {me.role === "owner" && (
          <DropdownMenuItem onSelect={() => void navigate("/admin")}>
            <Shield aria-hidden />
            Admin
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={toggle}>
          {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
          {theme === "dark" ? "Light theme" : "Dark theme"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut aria-hidden />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
