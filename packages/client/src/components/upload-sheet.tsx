import {LIMITS} from "@lore/server/types"
import {AlertTriangle, RotateCcw, X} from "lucide-react"
import {useEffect, useRef} from "react"

import {TagInput} from "@/components/tag-input"
import {Button} from "@/components/ui/button"
import {Input} from "@/components/ui/input"
import {Progress} from "@/components/ui/progress"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {formatBytes} from "@/lib/format"
import {useUploads, type UploadItem} from "@/lib/uploads"
import {cn} from "@/lib/utils"

export default function UploadSheet() {
  const {items, open, setOpen, add, remove, update, retry, start, clearFinished, busy} =
    useUploads()
  const fileInput = useRef<HTMLInputElement>(null)

  const ready = items.filter((i) => i.status === "ready").length
  const failed = items.filter((i) => i.status === "error").length
  const allDone = items.length > 0 && items.every((i) => i.status === "done")

  // Close on its own once everything landed. Failures keep it open for Retry.
  useEffect(() => {
    if (!allDone) return
    const t = setTimeout(() => {
      setOpen(false)
      clearFinished()
    }, 600)
    return () => clearTimeout(t)
  }, [allDone, setOpen, clearFinished])

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return
        setOpen(next)
        if (!next) clearFinished()
      }}
    >
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Upload</SheetTitle>
          <SheetDescription>
            PNG, JPG, GIF or WebP up to 10 MB. GIFs under 8 MB preview reliably in Discord.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="m-4 flex w-[calc(100%-2rem)] flex-col items-center gap-1 rounded-lg border border-dashed py-14 text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
            >
              <span className="font-medium text-foreground">Choose files</span>
              <span>or drop them anywhere, or paste</span>
            </button>
          ) : (
            <ul className="divide-y">
              {items.map((item) => (
                <UploadRow
                  key={item.id}
                  item={item}
                  onRemove={remove}
                  onUpdate={update}
                  onRetry={retry}
                />
              ))}
            </ul>
          )}
        </div>

        <SheetFooter className="flex-row items-center justify-between border-t pb-[max(1rem,env(safe-area-inset-bottom))]">
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            hidden
            onChange={(e) => {
              add(Array.from(e.target.files ?? []))
              e.target.value = ""
            }}
          />
          <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
            Add more
          </Button>
          <div className="flex items-center gap-2">
            {failed > 0 && <span className="text-xs text-destructive">{failed} failed</span>}
            <Button size="sm" onClick={start} disabled={ready === 0} className="pressable">
              {ready > 0 ? `Upload ${ready}` : "Upload"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function UploadRow({
  item,
  onRemove,
  onUpdate,
  onRetry,
}: {
  item: UploadItem
  onRemove: (id: string) => void
  onUpdate: (id: string, patch: {title?: string; tags?: string}) => void
  onRetry: (id: string) => void
}) {
  const locked = item.status === "uploading" || item.status === "done"
  const gifWarning = item.prepared?.ext === "gif" && item.size > LIMITS.gifInlineHintBytes
  return (
    <li className={cn("flex gap-3 px-4 py-3", item.status === "done" && "opacity-60")}>
      <img
        src={item.previewUrl}
        alt=""
        className="size-16 shrink-0 rounded-md bg-muted object-cover"
        width={64}
        height={64}
      />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{item.name}</span>
          <span className="shrink-0">{formatBytes(item.size)}</span>
          {item.prepared && (
            <span className="shrink-0 rounded-sm bg-secondary px-1 py-px text-[10px] font-semibold text-secondary-foreground uppercase">
              {item.prepared.ext}
            </span>
          )}
          <button
            type="button"
            aria-label={`Remove ${item.name}`}
            disabled={item.status === "uploading"}
            onClick={() => onRemove(item.id)}
            className="ml-auto shrink-0 rounded-sm p-0.5 hover:text-foreground disabled:opacity-40"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {item.status === "rejected" ? (
          <p className="text-xs text-destructive">{item.error}</p>
        ) : (
          <>
            <Input
              value={item.title}
              maxLength={LIMITS.titleChars}
              disabled={locked}
              placeholder="Title (optional)"
              className="h-8 text-sm"
              onChange={(e) => onUpdate(item.id, {title: e.target.value})}
            />
            {!locked && (
              <TagInput
                value={item.tags}
                onChange={(tags) => onUpdate(item.id, {tags})}
                className="min-h-8"
              />
            )}
          </>
        )}

        {item.status === "uploading" && (
          <Progress value={item.progress * 100} className="h-1" />
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {item.status === "preparing" && <span>Reading</span>}
          {item.prepared?.stripped && <span>Metadata removed</span>}
          {gifWarning && (
            <span className="inline-flex items-center gap-1 text-amber-500">
              <AlertTriangle className="size-3" aria-hidden />
              May not preview inline on Discord
            </span>
          )}
          {item.status === "done" && <span>Uploaded</span>}
          {item.status === "error" && (
            <>
              <span className="text-destructive">{item.error}</span>
              <button
                type="button"
                onClick={() => onRetry(item.id)}
                className="inline-flex items-center gap-1 text-foreground underline-offset-2 hover:underline"
              >
                <RotateCcw className="size-3" aria-hidden />
                Retry
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  )
}
