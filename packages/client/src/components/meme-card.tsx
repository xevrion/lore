import type {Meme} from "@lore/server/types"
import {Check, Copy, ExternalLink, Flag, MoreHorizontal, Pencil, Trash2} from "lucide-react"
import {useCallback, useEffect, useState} from "react"
import type {ComponentProps, KeyboardEvent, MouseEvent, ReactNode} from "react"
import {toast} from "sonner"

import {recordCopy} from "@/api"
import {AddedBy} from "@/components/added-by"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {copyText} from "@/lib/clipboard"
import {formatCount} from "@/lib/format"
import {cn} from "@/lib/utils"

interface MemeCardProps {
  meme: Meme
  eager: boolean
  // Position within its page, used to stagger the entrance. Capped so a long
  // page does not keep cards invisible for seconds.
  stagger: number
  canEdit: boolean
  onCopied: (meme: Meme) => void
  onEdit: (meme: Meme) => void
  onDelete: (meme: Meme) => void
  onReport: (meme: Meme) => void
}

export async function copyMemeLink(meme: Meme, onCopied: (meme: Meme) => void) {
  const ok = await copyText(meme.url)
  if (!ok) {
    toast.error("Couldn't copy. Open the image and copy its address instead.")
    return
  }
  recordCopy(meme.id)
  onCopied(meme)
  toast.success("Link copied. Paste it in Discord.", {id: "copied"})
}

export function MemeCard({
  meme,
  eager,
  stagger,
  canEdit,
  onCopied,
  onEdit,
  onDelete,
  onReport,
}: MemeCardProps) {
  const [loaded, setLoaded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [copiedAt, setCopiedAt] = useState(0)
  const isGif = meme.ext === "gif"
  // A pending or hidden meme 404s at its URL, so copying its link would only mislead.
  const shareable = meme.status === "live"

  // A timer rather than animationend, which browsers hold back in hidden tabs.
  useEffect(() => {
    if (!copiedAt) return
    const t = setTimeout(() => setCopiedAt(0), 800)
    return () => clearTimeout(t)
  }, [copiedAt])

  // A cached image can finish before React attaches onLoad, which would leave
  // it faded out forever.
  const markLoaded = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setLoaded(true)
  }, [])

  function open() {
    window.open(meme.url, "_blank", "noopener")
  }

  function copy() {
    if (!shareable) {
      toast("Waiting for an admin to approve this one.")
      return
    }
    void copyMemeLink(meme, (m) => {
      setCopiedAt(Date.now())
      onCopied(m)
    })
  }

  function onClick(e: MouseEvent) {
    if (e.metaKey || e.ctrlKey || e.button === 1) {
      open()
      return
    }
    copy()
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault()
      copy()
    } else if (e.key === "o" || e.key === "O") {
      e.preventDefault()
      open()
    }
  }

  return (
    <article
      className={cn(
        "group relative mb-2 animate-rise break-inside-avoid overflow-hidden rounded-lg bg-card sm:mb-3",
        "ring-1 ring-transparent transition-[box-shadow] duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        "[@media(hover:hover)]:hover:ring-foreground/15",
        menuOpen && "is-open ring-foreground/15",
      )}
      style={{animationDelay: `${Math.min(stagger, 20) * 30}ms`}}
    >
      <button
        type="button"
        onClick={onClick}
        onAuxClick={(e) => e.button === 1 && open()}
        onKeyDown={onKeyDown}
        aria-label={`Copy link to ${meme.title || "meme"}`}
        title={shareable ? "Click to copy link" : "Pending review"}
        className={cn(
          "pressable block w-full outline-none",
          shareable ? "cursor-copy" : "cursor-default",
        )}
        style={{aspectRatio: `${meme.width} / ${meme.height}`}}
      >
        <img
          src={isGif ? meme.url : meme.thumbUrl}
          alt={meme.title}
          width={meme.width}
          height={meme.height}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          ref={markLoaded}
          className={cn(
            "size-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      </button>

      <div className="pointer-events-none absolute top-2 left-2 flex gap-1">
        {isGif && (
          <span className="rounded-sm bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white">
            GIF
          </span>
        )}
        {meme.status !== "live" && (
          <span className="rounded-sm bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-black">
            {meme.status === "pending" ? "Pending review" : "Hidden"}
          </span>
        )}
      </div>

      {copiedAt > 0 && (
        <span
          key={copiedAt}
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span className="flex animate-copied items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-lg ring-1 ring-foreground/10">
            <Check className="size-3.5 text-primary" aria-hidden />
            Copied
          </span>
        </span>
      )}

      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-2.5 pt-8 pb-2 text-white",
          "translate-y-1 opacity-0 transition-[opacity,transform] duration-200 ease-(--ease-out-strong)",
          "group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 group-[.is-open]:translate-y-0 group-[.is-open]:opacity-100",
          "[@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100",
        )}
      >
        {meme.title && <p className="truncate text-sm font-medium">{meme.title}</p>}
        <div className="flex items-center gap-2">
          <AddedBy user={meme.uploader} className="min-w-0 flex-1 text-white/85" />
          <span
            className="flex items-center gap-1 text-[11px] text-white/70"
            title="Times copied"
          >
            <Copy className="size-3" aria-hidden />
            {formatCount(meme.copies)}
          </span>
          <div className="pointer-events-auto flex items-center gap-0.5">
            <IconButton label="Open image in new tab" onClick={open}>
              <ExternalLink className="size-3.5" />
            </IconButton>
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <IconButton label="More actions">
                  <MoreHorizontal className="size-3.5" />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                {canEdit && (
                  <DropdownMenuItem onSelect={() => onEdit(meme)}>
                    <Pencil aria-hidden />
                    Edit
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => onReport(meme)}>
                  <Flag aria-hidden />
                  Report
                </DropdownMenuItem>
                {canEdit && (
                  <DropdownMenuItem variant="destructive" onSelect={() => onDelete(meme)}>
                    <Trash2 aria-hidden />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </article>
  )
}

function IconButton({
  label,
  onClick,
  children,
  ...rest
}: {
  label: string
  onClick?: () => void
  children: ReactNode
} & Omit<ComponentProps<"button">, "onClick" | "children">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className="inline-flex size-8 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
      {...rest}
    >
      {children}
    </button>
  )
}
