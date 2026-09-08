import type {Meme} from "@lore/server/types"
import {LIMITS} from "@lore/server/types"
import {useInfiniteQuery, useQueryClient, type QueryClient} from "@tanstack/react-query"
import {createContext, useContext, useMemo, useSyncExternalStore} from "react"
import type {ReactNode} from "react"
import {toast} from "sonner"

import {api, memesQueryKey} from "@/api"
import {prepareImage, type Prepared} from "@/lib/image"
import {uploadMeme} from "@/lib/upload"

export type UploadStatus = "preparing" | "ready" | "uploading" | "done" | "error" | "rejected"

export interface UploadItem {
  id: string
  name: string
  size: number
  previewUrl: string
  title: string
  tags: string
  status: UploadStatus
  progress: number
  error: string | null
  prepared: Prepared | null
}

interface State {
  items: UploadItem[]
  open: boolean
}

const CONCURRENCY = 3

function titleFromName(name: string) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .slice(0, LIMITS.titleChars)
}

type MemePages = {pages: {items: Meme[]; nextCursor: string | null}[]; pageParams: unknown[]}

// Plain store rather than React state: the upload queue outlives any one
// component (the sheet is lazy and unmounts) and pumps itself from promise
// callbacks, which is awkward to express with hooks.
class UploadStore {
  private state: State = {items: [], open: false}
  private listeners = new Set<() => void>()
  private inflight = 0

  constructor(private queryClient: QueryClient) {}

  getState = () => this.state

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private set(next: Partial<State>) {
    this.state = {...this.state, ...next}
    for (const fn of this.listeners) fn()
  }

  private patch(id: string, changes: Partial<UploadItem>) {
    this.set({items: this.state.items.map((it) => (it.id === id ? {...it, ...changes} : it))})
  }

  setOpen = (open: boolean) => this.set({open})

  add = (input: File[]) => {
    let files = input
    const room = LIMITS.batchFiles - this.state.items.filter((i) => i.status !== "done").length
    if (files.length > room) {
      toast.error(`Up to ${LIMITS.batchFiles} files at a time`)
      files = files.slice(0, Math.max(0, room))
    }
    if (files.length === 0) return
    const fresh: UploadItem[] = files.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      previewUrl: URL.createObjectURL(file),
      title: titleFromName(file.name),
      tags: "",
      status: "preparing",
      progress: 0,
      error: null,
      prepared: null,
    }))
    this.set({items: [...this.state.items, ...fresh], open: true})
    fresh.forEach((item, i) => {
      const file = files[i]!
      if (file.size > LIMITS.fileBytes) {
        this.patch(item.id, {status: "rejected", error: "Over 10 MB"})
        return
      }
      prepareImage(file)
        .then((prepared) => this.patch(item.id, {prepared, status: "ready"}))
        .catch((e: unknown) => {
          this.patch(item.id, {
            status: "rejected",
            error: e instanceof Error ? e.message : "Could not read this file",
          })
        })
    })
  }

  remove = (id: string) => {
    const gone = this.state.items.find((it) => it.id === id)
    if (gone) URL.revokeObjectURL(gone.previewUrl)
    this.set({items: this.state.items.filter((it) => it.id !== id)})
  }

  update = (id: string, changes: Partial<Pick<UploadItem, "title" | "tags">>) => {
    this.patch(id, changes)
  }

  retry = (id: string) => {
    this.patch(id, {status: "ready", error: null, progress: 0})
    this.pump()
  }

  start = () => this.pump()

  clearFinished = () => {
    for (const it of this.state.items) {
      if (it.status === "done") URL.revokeObjectURL(it.previewUrl)
    }
    this.set({items: this.state.items.filter((it) => it.status !== "done")})
  }

  private pump() {
    while (this.inflight < CONCURRENCY) {
      const next = this.state.items.find((it) => it.status === "ready" && it.prepared)
      if (!next) break
      this.inflight++
      const prepared = next.prepared!
      this.patch(next.id, {status: "uploading", progress: 0})
      const base = next.name.replace(/\.[^.]+$/, "") || "meme"
      uploadMeme({
        file: prepared.file,
        filename: `${base}.${prepared.ext}`,
        thumb: prepared.thumb,
        title: next.title.trim(),
        tags: next.tags.trim(),
        onProgress: (fraction) => this.patch(next.id, {progress: fraction}),
      })
        .then((meme) => {
          this.patch(next.id, {status: "done", progress: 1})
          this.prepend(meme)
        })
        .catch((e: unknown) => {
          this.patch(next.id, {
            status: "error",
            error: e instanceof Error ? e.message : "Upload failed",
          })
        })
        .finally(() => {
          this.inflight--
          this.pump()
        })
    }
  }

  // New uploads only belong at the top of the unfiltered "new" list. Anything
  // filtered or sorted by copies is invalidated so it refetches when shown.
  private prepend(meme: Meme) {
    this.queryClient.setQueryData(memesQueryKey("new", ""), (old: unknown) => {
      const data = old as MemePages | undefined
      const [first, ...rest] = data?.pages ?? []
      if (!data || !first) return old
      return {...data, pages: [{...first, items: [meme, ...first.items]}, ...rest]}
    })
    void this.queryClient.invalidateQueries({
      queryKey: ["memes"],
      predicate: (q) => q.queryKey[1] !== "new" || q.queryKey[2] !== "",
      refetchType: "none",
    })
  }
}

const Ctx = createContext<UploadStore | null>(null)

export function UploadsProvider({children}: {children: ReactNode}) {
  const queryClient = useQueryClient()
  const store = useMemo(() => new UploadStore(queryClient), [queryClient])
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useUploads() {
  const store = useContext(Ctx)
  if (!store) throw new Error("useUploads outside UploadsProvider")
  const {items, open} = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  const busy = items.some((it) => it.status === "uploading" || it.status === "preparing")
  return {
    items,
    open,
    busy,
    setOpen: store.setOpen,
    add: store.add,
    remove: store.remove,
    update: store.update,
    retry: store.retry,
    start: store.start,
    clearFinished: store.clearFinished,
  }
}

export function useMemeList(sort: "new" | "top", q: string) {
  return useInfiniteQuery({
    queryKey: memesQueryKey(sort, q),
    queryFn: ({pageParam}) => api.memes({cursor: pageParam, q, sort, limit: 40}),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30 * 1000,
  })
}
