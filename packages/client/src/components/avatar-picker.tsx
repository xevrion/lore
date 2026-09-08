import {useRef, useState} from "react"
import {toast} from "sonner"

import {UserAvatar} from "@/components/added-by"
import {prepareAvatar} from "@/lib/image"

export function AvatarPicker({
  name,
  color,
  currentUrl,
  onChange,
}: {
  name: string
  color: string
  currentUrl: string | null
  onChange: (blob: Blob | null) => void
}) {
  const [preview, setPreview] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  async function pick(file: File | undefined) {
    if (!file) return
    try {
      const blob = await prepareAvatar(file)
      if (preview) URL.revokeObjectURL(preview)
      setPreview(URL.createObjectURL(blob))
      onChange(blob)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that image")
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          void pick(e.dataTransfer.files[0])
        }}
        aria-label="Choose avatar"
        className="pressable rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <UserAvatar
          user={{name: name || "?", color, avatarUrl: preview ?? currentUrl}}
          size="lg"
        />
      </button>
      <div className="grid gap-0.5 text-sm">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="text-left font-medium underline-offset-4 hover:underline"
        >
          {preview || currentUrl ? "Change avatar" : "Add an avatar"}
        </button>
        <span className="text-xs text-muted-foreground">Square crop, resized to 128px</span>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={(e) => {
          void pick(e.target.files?.[0])
          e.target.value = ""
        }}
      />
    </div>
  )
}
