import {ImagePlus} from "lucide-react"
import {useEffect, useRef, useState} from "react"

function hasFiles(e: DragEvent) {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files")
}

// Full-page target so admins can drop onto any part of the wall. Depth
// counting is needed because dragenter/dragleave fire for every child.
export function DropOverlay({
  onFiles,
  enabled,
}: {
  onFiles: (files: File[]) => void
  enabled: boolean
}) {
  const [active, setActive] = useState(false)
  const depth = useRef(0)

  useEffect(() => {
    if (!enabled) return
    function enter(e: DragEvent) {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current++
      setActive(true)
    }
    function over(e: DragEvent) {
      if (hasFiles(e)) e.preventDefault()
    }
    function leave(e: DragEvent) {
      if (!hasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setActive(false)
    }
    function drop(e: DragEvent) {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setActive(false)
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      )
      if (files.length) onFiles(files)
    }
    window.addEventListener("dragenter", enter)
    window.addEventListener("dragover", over)
    window.addEventListener("dragleave", leave)
    window.addEventListener("drop", drop)
    return () => {
      window.removeEventListener("dragenter", enter)
      window.removeEventListener("dragover", over)
      window.removeEventListener("dragleave", leave)
      window.removeEventListener("drop", drop)
    }
  }, [enabled, onFiles])

  if (!active) return null
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/85 p-6">
      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary/60 px-16 py-14 text-center">
        <ImagePlus className="size-8 text-primary" aria-hidden />
        <p className="text-lg font-medium">Drop to upload</p>
        <p className="text-sm text-muted-foreground">PNG, JPG, GIF or WebP, up to 25 MB each</p>
      </div>
    </div>
  )
}
