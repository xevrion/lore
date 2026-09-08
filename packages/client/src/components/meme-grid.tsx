import type {Meme, Sort} from "@lore/server/types"
import {useQueryClient} from "@tanstack/react-query"
import {lazy, Suspense, useCallback, useEffect, useRef, useState} from "react"
import type {ReactNode} from "react"

import {memesQueryKey, useMe} from "@/api"
import {MemeCard} from "@/components/meme-card"
import {Button} from "@/components/ui/button"
import {Skeleton} from "@/components/ui/skeleton"
import {useMemeList} from "@/lib/uploads"

const EditMemeDialog = lazy(() => import("@/components/edit-meme-dialog"))
const DeleteMemeDialog = lazy(() => import("@/components/delete-meme-dialog"))

const EAGER = 12

type MemePages = {pages: {items: Meme[]; nextCursor: string | null}[]; pageParams: unknown[]}

export function MemeGrid({
  sort,
  q,
  onUploadClick,
}: {
  sort: Sort
  q: string
  onUploadClick?: () => void
}) {
  const {data: me} = useMe()
  const queryClient = useQueryClient()
  const list = useMemeList(sort, q)
  const [editing, setEditing] = useState<Meme | null>(null)
  const [deleting, setDeleting] = useState<Meme | null>(null)
  const sentinel = useRef<HTMLDivElement>(null)

  const {fetchNextPage, hasNextPage, isFetchingNextPage} = list
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage()
      },
      {rootMargin: "1200px 0px"},
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Bump the count locally so the Top sort and the chip agree right away.
  const onCopied = useCallback(
    (meme: Meme) => {
      queryClient.setQueriesData({queryKey: ["memes"]}, (old: unknown) => {
        const data = old as MemePages | undefined
        if (!data?.pages) return old
        return {
          ...data,
          pages: data.pages.map((p) => ({
            ...p,
            items: p.items.map((m) => (m.id === meme.id ? {...m, copies: m.copies + 1} : m)),
          })),
        }
      })
    },
    [queryClient],
  )

  const replaceMeme = useCallback(
    (updated: Meme) => {
      queryClient.setQueriesData({queryKey: ["memes"]}, (old: unknown) => {
        const data = old as MemePages | undefined
        if (!data?.pages) return old
        return {
          ...data,
          pages: data.pages.map((p) => ({
            ...p,
            items: p.items.map((m) => (m.id === updated.id ? updated : m)),
          })),
        }
      })
    },
    [queryClient],
  )

  const removeMeme = useCallback(
    (id: string) => {
      queryClient.setQueriesData({queryKey: ["memes"]}, (old: unknown) => {
        const data = old as MemePages | undefined
        if (!data?.pages) return old
        return {
          ...data,
          pages: data.pages.map((p) => ({...p, items: p.items.filter((m) => m.id !== id)})),
        }
      })
    },
    [queryClient],
  )

  const items = list.data?.pages.flatMap((p) => p.items) ?? []
  const staggers = list.data?.pages.flatMap((p) => p.items.map((_, i) => i)) ?? []

  if (list.isPending) return <GridSkeleton />

  if (list.isError) {
    return (
      <EmptyState title="Couldn't load the wall" body={list.error.message}>
        <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
          Try again
        </Button>
      </EmptyState>
    )
  }

  if (items.length === 0) {
    if (q) {
      return <EmptyState title="No memes match" body="Try another word, or fewer of them." />
    }
    return (
      <EmptyState
        title="Nothing here yet"
        body={me ? "Upload the first meme. Drag it anywhere on this page." : "Check back soon."}
      >
        {me && onUploadClick && (
          <Button size="sm" onClick={onUploadClick}>
            Upload
          </Button>
        )}
      </EmptyState>
    )
  }

  return (
    <>
      <div className="masonry">
        {items.map((meme, i) => (
          <MemeCard
            key={meme.id}
            meme={meme}
            eager={i < EAGER}
            stagger={staggers[i] ?? 0}
            canEdit={Boolean(me)}
            onCopied={onCopied}
            onEdit={setEditing}
            onDelete={setDeleting}
          />
        ))}
      </div>
      <div ref={sentinel} aria-hidden className="h-px" />
      {isFetchingNextPage && (
        <p className="py-6 text-center text-xs text-muted-foreground">Loading more</p>
      )}
      {!hasNextPage && items.length > EAGER && (
        <p className="py-8 text-center text-xs text-muted-foreground">That's all of them.</p>
      )}
      <Suspense>
        {editing && (
          <EditMemeDialog
            meme={editing}
            onClose={() => setEditing(null)}
            onSaved={(m) => {
              replaceMeme(m)
              setEditing(null)
            }}
          />
        )}
        {deleting && (
          <DeleteMemeDialog
            meme={deleting}
            onClose={() => setDeleting(null)}
            onDeleted={(id) => {
              removeMeme(id)
              setDeleting(null)
              void queryClient.invalidateQueries({
                queryKey: memesQueryKey(sort, q),
                refetchType: "none",
              })
            }}
          />
        )}
      </Suspense>
    </>
  )
}

const skeletonRatios = [1, 1.4, 0.8, 1.2, 0.7, 1, 1.6, 0.9, 1.1, 1.3, 0.75, 1]

function GridSkeleton() {
  return (
    <div className="masonry" aria-busy aria-label="Loading memes">
      {skeletonRatios.map((ratio, i) => (
        <Skeleton
          key={i}
          className="mb-3 w-full rounded-lg"
          style={{aspectRatio: `1 / ${ratio}`}}
        />
      ))}
    </div>
  )
}

function EmptyState({
  title,
  body,
  children,
}: {
  title: string
  body?: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-32 text-center">
      <p className="text-lg font-medium">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted-foreground">{body}</p>}
      {children && <div className="pt-2">{children}</div>}
    </div>
  )
}
