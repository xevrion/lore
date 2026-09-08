import type {Sort} from "@lore/server/types"
import {lazy, Suspense, useCallback, useEffect, useState} from "react"
import {useSearchParams} from "react-router"

import {isPending, useMe} from "@/api"
import {DropOverlay} from "@/components/drop-overlay"
import {Header} from "@/components/header"
import {MemeGrid} from "@/components/meme-grid"
import {WaitingForApproval} from "@/components/waiting-for-approval"
import {useDebounced} from "@/lib/hooks"
import {useUploads} from "@/lib/uploads"

const UploadSheet = lazy(() => import("@/components/upload-sheet"))

export default function Gallery() {
  const {data: me} = useMe()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get("q") ?? "")
  const debounced = useDebounced(query.trim(), 250)
  const sort: Sort = params.get("sort") === "top" ? "top" : "new"
  const uploads = useUploads()

  useEffect(() => {
    setParams(
      (prev) => {
        if (debounced) prev.set("q", debounced)
        else prev.delete("q")
        return prev
      },
      {replace: true},
    )
  }, [debounced, setParams])

  const setSort = useCallback(
    (s: Sort) => {
      setParams((prev) => {
        if (s === "top") prev.set("sort", "top")
        else prev.delete("sort")
        return prev
      })
    },
    [setParams],
  )

  const pending = isPending(me)
  const canUpload = Boolean(me) && !pending
  const {add, setOpen} = uploads

  useEffect(() => {
    if (!canUpload) return
    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      )
      if (files.length) {
        e.preventDefault()
        add(files)
      }
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [canUpload, add])

  if (pending) return <WaitingForApproval />

  return (
    <>
      <Header
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
        onUpload={canUpload ? () => setOpen(true) : undefined}
      />
      <main className="mx-auto max-w-[1800px] px-3 py-3 sm:px-6 sm:py-4">
        <MemeGrid
          sort={sort}
          q={debounced}
          onUploadClick={canUpload ? () => setOpen(true) : undefined}
        />
      </main>
      {canUpload && (
        <>
          <DropOverlay enabled onFiles={add} />
          <Suspense>{(uploads.open || uploads.items.length > 0) && <UploadSheet />}</Suspense>
        </>
      )}
    </>
  )
}
