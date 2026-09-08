import type {Meme} from "@lore/server/types"
import {Copy, ExternalLink, MoreHorizontal, Pencil, Trash2} from "lucide-react"
import {useCallback, useState} from "react"
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
  canEdit: boolean
  onCopied: (meme: Meme) => void
  onEdit: (meme: Meme) => void
  onDelete: (meme: Meme) => void
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

export function MemeCard({meme, eager, canEdit, onCopied, onEdit, onDelete}: MemeCardProps) {
  const [loaded, setLoaded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const isGif = meme.ext === "gif"

  // A cached image can finish before React attaches onLoad, which would leave
  // it faded out forever.
  const markLoaded = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setLoaded(true)
  }, [])

  function open() {
    window.open(meme.url, "_blank", "noopener")
  }

  function onClick(e: MouseEvent) {
    if (e.metaKey || e.ctrlKey || e.button === 1) {
      open()
      return
    }
    void copyMemeLink(meme, onCopied)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault()
      void copyMemeLink(meme, onCopied)
    } else if (e.key === "o" || e.key === "O") {
      e.preventDefault()
      open()
    }
  }

  return (
    <article
      className={cn(
        "group relative mb-3 break-inside-avoid overflow-hidden rounded-lg bg-card",
        "outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        menuOpen && "is-open",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        onAuxClick={(e) => e.button === 1 && open()}
        onKeyDown={onKeyDown}
        aria-label={`Copy link to ${meme.title || "meme"}`}
        title="Click to copy link"
        className="pressable block w-full cursor-copy outline-none"
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

      {isGif && (
        <span className="pointer-events-none absolute top-2 left-2 rounded-sm bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white">
          GIF
        </span>
      )}

      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-2.5 pt-8 pb-2 text-white",
          "opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100 group-[.is-open]:opacity-100 [@media(hover:none)]:opacity-100",
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
            {canEdit && (
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <IconButton label="More actions">
                    <MoreHorizontal className="size-3.5" />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem onSelect={() => onEdit(meme)}>
                    <Pencil aria-hidden />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => onDelete(meme)}>
                    <Trash2 aria-hidden />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
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
      className="rounded-md p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
      {...rest}
    >
      {children}
    </button>
  )
}
