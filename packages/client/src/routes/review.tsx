import type {Meme, PendingMember} from "@lore/server/types"
import {LIMITS} from "@lore/server/types"
import {useInfiniteQuery, useMutation, useQuery, useQueryClient} from "@tanstack/react-query"
import {ArrowLeft, Flag} from "lucide-react"
import {useEffect, useRef, useState} from "react"
import {Link, useNavigate} from "react-router"
import {toast} from "sonner"

import {api, isStaff, useMe} from "@/api"
import {AddedBy, UserAvatar} from "@/components/added-by"
import {Header} from "@/components/header"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {Badge} from "@/components/ui/badge"
import {Button} from "@/components/ui/button"
import {Skeleton} from "@/components/ui/skeleton"
import {formatBytes, formatRelative} from "@/lib/format"

export default function Review() {
  const {data: me, isPending} = useMe()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isPending && !isStaff(me)) void navigate("/", {replace: true})
  }, [isPending, me, navigate])

  if (!me || !isStaff(me)) return null

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <Link
          to="/admin"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Admin
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">Review</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          New members wait here for approval, then their uploads wait here until approved.
          Anything with {LIMITS.hideAfterReports} reports lands here too. Oldest first.
        </p>
        <PendingMembers />
        <Queue />
      </main>
    </>
  )
}

function PendingMembers() {
  const queryClient = useQueryClient()
  const members = useQuery({
    queryKey: ["admin", "members", "pending"],
    queryFn: api.pendingMembers,
  })
  const [rejecting, setRejecting] = useState<PendingMember | null>(null)
  const refresh = () => void queryClient.invalidateQueries({queryKey: ["admin"]})
  const approve = useMutation({
    mutationFn: api.approveUser,
    onSuccess: () => {
      toast("Approved")
      refresh()
    },
    onError: (e) => toast.error(e.message),
  })
  const reject = useMutation({
    mutationFn: api.rejectUser,
    onSuccess: () => {
      toast("Rejected")
      setRejecting(null)
      refresh()
    },
    onError: (e) => toast.error(e.message),
  })

  if (!members.data || members.data.length === 0) return null

  return (
    <section className="mb-8 grid gap-3">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Members waiting
      </h2>
      <ul className="divide-y rounded-lg border">
        {members.data.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
            <UserAvatar user={m} size="md" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2">
                <span className="truncate font-medium">{m.name}</span>
                {m.discordLinked && <Badge variant="outline">Discord</Badge>}
              </p>
              <p className="text-xs text-muted-foreground" title={m.createdAt}>
                signed up {formatRelative(m.createdAt)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="pressable"
                disabled={approve.isPending}
                onClick={() => approve.mutate(m.id)}
              >
                Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRejecting(m)}>
                Reject
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <AlertDialog
        open={rejecting !== null}
        onOpenChange={(open) => !open && setRejecting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject {rejecting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their account is removed and they are signed out. They can sign in again to ask
              once more.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={reject.isPending}
              onClick={(e) => {
                e.preventDefault()
                if (rejecting) reject.mutate(rejecting.id)
              }}
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function Queue() {
  const queryClient = useQueryClient()
  const queue = useInfiniteQuery({
    queryKey: ["admin", "review"],
    queryFn: ({pageParam}) => api.review(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  })
  const sentinel = useRef<HTMLDivElement>(null)
  const {fetchNextPage, hasNextPage, isFetchingNextPage} = queue
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage()
      },
      {rootMargin: "600px 0px"},
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const refresh = () => {
    void queryClient.invalidateQueries({queryKey: ["admin"]})
    void queryClient.invalidateQueries({queryKey: ["memes"]})
  }
  const approve = useMutation({
    mutationFn: api.approveMeme,
    onSuccess: () => {
      toast("Approved")
      refresh()
    },
    onError: (e) => toast.error(e.message),
  })
  const remove = useMutation({
    mutationFn: api.deleteMeme,
    onSuccess: () => {
      toast("Deleted")
      refresh()
    },
    onError: (e) => toast.error(e.message),
  })
  const [banning, setBanning] = useState<Meme | null>(null)
  const ban = useMutation({
    mutationFn: api.banUser,
    onSuccess: ({deleted}) => {
      toast(`Banned. ${deleted} ${deleted === 1 ? "meme" : "memes"} removed.`)
      setBanning(null)
      refresh()
    },
    onError: (e) => toast.error(e.message),
  })

  if (queue.isPending) return <Skeleton className="h-32 rounded-lg" />
  if (queue.isError) return <p className="text-sm text-destructive">{queue.error.message}</p>
  const items = queue.data.pages.flatMap((p) => p.items)
  if (items.length === 0) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Nothing to review.</p>
  }

  return (
    <>
      <ul className="grid gap-3">
        {items.map((m) => (
          <li
            key={m.id}
            className="grid grid-cols-[6rem_1fr] gap-3 rounded-lg border p-3 sm:grid-cols-[10rem_1fr_auto]"
          >
            <a
              href={api.reviewFileUrl(m.id)}
              target="_blank"
              rel="noreferrer"
              className="row-span-2 overflow-hidden rounded-md bg-muted sm:row-span-1"
            >
              <img
                src={api.reviewFileUrl(m.id)}
                alt={m.title}
                className="aspect-square size-full object-cover"
                loading="lazy"
              />
            </a>
            <div className="grid min-w-0 content-start gap-1 text-sm">
              <p className="truncate font-medium">{m.title || "Untitled"}</p>
              <AddedBy user={m.uploader} className="text-muted-foreground" />
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={m.status === "hidden" ? "destructive" : "secondary"}>
                  {m.status === "hidden" ? "hidden by reports" : "pending"}
                </Badge>
                {m.reports > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Flag className="size-3" aria-hidden />
                    {m.reports} {m.reports === 1 ? "report" : "reports"}
                  </span>
                )}
                <span>
                  {m.ext.toUpperCase()}, {formatBytes(m.size)}
                </span>
                <span title={m.createdAt}>uploaded {formatRelative(m.createdAt)}</span>
              </p>
            </div>
            <div className="col-start-2 flex flex-wrap gap-2 sm:col-auto sm:flex-col">
              <Button
                size="sm"
                onClick={() => approve.mutate(m.id)}
                disabled={approve.isPending}
                className="pressable"
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => remove.mutate(m.id)}
                disabled={remove.isPending}
              >
                Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setBanning(m)}>
                Ban uploader
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <div ref={sentinel} aria-hidden className="h-px" />
      {isFetchingNextPage && (
        <p className="py-6 text-center text-xs text-muted-foreground">Loading more</p>
      )}

      <AlertDialog open={banning !== null} onOpenChange={(open) => !open && setBanning(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ban {banning?.uploader.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every meme they uploaded is deleted, their links stop working, and they cannot
              sign in again. There is no undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={ban.isPending}
              onClick={(e) => {
                e.preventDefault()
                if (banning) ban.mutate(banning.uploader.id)
              }}
            >
              Ban
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
