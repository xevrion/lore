import type {AdminUser, CreatedInvite, Meme} from "@lore/server/types"
import {LIMITS} from "@lore/server/types"
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query"
import {Check, Copy, ExternalLink, Flag} from "lucide-react"
import {useEffect, useState} from "react"
import type {ReactNode} from "react"
import {Link, useNavigate} from "react-router"
import {toast} from "sonner"

import {api, isStaff, useMe} from "@/api"
import {UserAvatar} from "@/components/added-by"
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
import {Button, buttonVariants} from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {Skeleton} from "@/components/ui/skeleton"
import {copyText} from "@/lib/clipboard"
import {formatBytes, formatCount, formatDate, formatRelative} from "@/lib/format"
import {cn} from "@/lib/utils"

export default function Admin() {
  const {data: me, isPending} = useMe()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isPending && !isStaff(me)) void navigate("/", {replace: true})
  }, [isPending, me, navigate])

  if (!me || !isStaff(me)) return null
  const owner = me.role === "owner"

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="mb-8 text-xl font-semibold tracking-tight">Admin</h1>
        <ReviewCard />
        <Overview />
        {owner && <Invites />}
        <People ownerId={me.id} isOwner={owner} />
      </main>
    </>
  )
}

// Just the count. The queue itself lives on its own page so a long backlog
// never weighs this one down.
function ReviewCard() {
  const stats = useQuery({queryKey: ["admin", "stats"], queryFn: api.adminStats})
  if (!stats.data) return null
  const {pendingMembers, pendingCount, hiddenCount} = stats.data
  if (pendingMembers === 0 && pendingCount === 0 && hiddenCount === 0) return null
  const parts = [
    pendingMembers > 0 &&
      `${pendingMembers} ${pendingMembers === 1 ? "member" : "members"} waiting`,
    pendingCount > 0 &&
      `${pendingCount} ${pendingCount === 1 ? "meme" : "memes"} waiting for review`,
    hiddenCount > 0 && `${hiddenCount} hidden by reports`,
  ].filter((p): p is string => Boolean(p))
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
      <p className="inline-flex items-center gap-2">
        <Flag className="size-4 text-amber-500" aria-hidden />
        <span>{parts.join(", ")}</span>
      </p>
      <Link to="/admin/review" className={buttonVariants({size: "sm", className: "pressable"})}>
        Review
      </Link>
    </div>
  )
}

function Section({
  title,
  body,
  action,
  children,
}: {
  title: string
  body?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="grid gap-5 border-t py-8 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-medium">{title}</h2>
          {body && <p className="text-sm text-muted-foreground">{body}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function Overview() {
  const stats = useQuery({queryKey: ["admin", "stats"], queryFn: api.adminStats})

  if (stats.isPending) {
    return (
      <Section title="Overview">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      </Section>
    )
  }
  if (stats.isError) {
    return (
      <Section title="Overview">
        <p className="text-sm text-destructive">{stats.error.message}</p>
      </Section>
    )
  }
  const s = stats.data
  const pct = Math.min(100, (s.storageBytes / s.storageCap) * 100)

  return (
    <Section
      title="Overview"
      action={
        <a
          href="https://dash.cloudflare.com/?to=/:account/web-analytics"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          Traffic in Cloudflare
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      }
    >
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Memes" value={formatCount(s.memes)} />
        <Stat
          label="Storage"
          value={formatBytes(s.storageBytes)}
          hint={`${pct < 1 ? "<1" : pct.toFixed(0)}% of the ${formatBytes(s.storageCap)} cap`}
        />
        <Stat
          label="Copies"
          value={formatCount(s.copiesTotal)}
          hint={`${formatCount(s.viewsTotal)} fetches`}
        />
        <Stat label="This week" value={formatCount(s.uploadsLast7d)} hint="uploads" />
      </dl>

      <div className="grid gap-6 sm:grid-cols-[1fr_16rem]">
        <div className="grid gap-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Most copied
          </h3>
          {s.topMemes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing copied yet.</p>
          ) : (
            <ol className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {s.topMemes.map((m: Meme) => (
                <li
                  key={m.id}
                  className="relative aspect-square overflow-hidden rounded-md bg-muted"
                >
                  <a href={m.url} target="_blank" rel="noreferrer" title={m.title || m.id}>
                    <img
                      src={m.thumbUrl}
                      alt={m.title}
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  </a>
                  <span className="absolute right-1 bottom-1 rounded-sm bg-black/70 px-1 text-[10px] font-medium text-white">
                    {formatCount(m.copies)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="grid content-start gap-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Top uploaders
          </h3>
          {s.topUploaders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No uploads yet.</p>
          ) : (
            <ul className="grid gap-1.5">
              {s.topUploaders.map(({user, count}) => (
                <li key={user.id} className="flex items-center gap-2 text-sm">
                  <UserAvatar user={user} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{user.name}</span>
                  <span className="text-muted-foreground tabular-nums">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  )
}

function Stat({label, value, hint}: {label: string; value: string; hint?: string}) {
  return (
    <div className="rounded-lg bg-card px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  )
}

function Invites() {
  const queryClient = useQueryClient()
  const invites = useQuery({queryKey: ["admin", "invites"], queryFn: api.invites})
  const [created, setCreated] = useState<CreatedInvite | null>(null)

  const create = useMutation({
    mutationFn: api.createInvite,
    onSuccess: (inv) => {
      setCreated(inv)
      void queryClient.invalidateQueries({queryKey: ["admin", "invites"]})
    },
    onError: (e) => toast.error(e.message),
  })
  const cancel = useMutation({
    mutationFn: api.cancelInvite,
    onSuccess: () => void queryClient.invalidateQueries({queryKey: ["admin", "invites"]}),
    onError: (e) => toast.error(e.message),
  })

  return (
    <Section
      title="Invites"
      body="Each link works once and expires after 24 hours."
      action={
        <Button
          size="sm"
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className="pressable"
        >
          New invite
        </Button>
      }
    >
      {invites.isPending ? (
        <Skeleton className="h-10 rounded-md" />
      ) : invites.isError ? (
        <p className="text-sm text-destructive">{invites.error.message}</p>
      ) : invites.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending invites.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {invites.data.map((inv) => (
            <li
              key={inv.tokenHash}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
            >
              <span className="font-mono text-xs text-muted-foreground">
                {inv.tokenHash.slice(0, 8)}
              </span>
              <span className="text-muted-foreground">
                created {formatRelative(inv.createdAt)}, expires {formatRelative(inv.expiresAt)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate(inv.tokenHash)}
              >
                Cancel
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={created !== null} onOpenChange={(open) => !open && setCreated(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite link</DialogTitle>
            <DialogDescription>
              Send this to one friend. It works once and expires in 24 hours. You won't see it
              again after closing this.
            </DialogDescription>
          </DialogHeader>
          {created && <CopyField value={created.url} />}
        </DialogContent>
      </Dialog>
    </Section>
  )
}

function CopyField({value}: {value: string}) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    if (await copyText(value)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } else {
      toast.error("Couldn't copy")
    }
  }
  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="h-9 min-w-0 flex-1 rounded-md border bg-transparent px-2.5 font-mono text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
      />
      <Button size="sm" onClick={() => void copy()} className="w-24">
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  )
}

function People({ownerId, isOwner}: {ownerId: string; isOwner: boolean}) {
  const queryClient = useQueryClient()
  const users = useQuery({queryKey: ["admin", "users"], queryFn: api.adminUsers})
  const [revoking, setRevoking] = useState<AdminUser | null>(null)
  const [banning, setBanning] = useState<AdminUser | null>(null)
  const refresh = () => void queryClient.invalidateQueries({queryKey: ["admin"]})

  const revoke = useMutation({
    mutationFn: api.revokeUser,
    onSuccess: () => {
      toast("Revoked")
      setRevoking(null)
      refresh()
    },
    onError: (e) => toast.error(e.message),
  })
  const ban = useMutation({
    mutationFn: api.banUser,
    onSuccess: ({deleted}) => {
      toast(`Banned. ${deleted} ${deleted === 1 ? "meme" : "memes"} removed.`)
      setBanning(null)
      refresh()
    },
    onError: (e) => toast.error(e.message),
  })
  const trust = useMutation({
    mutationFn: ({id, trusted}: {id: string; trusted: boolean}) => api.trustUser(id, trusted),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  })

  if (users.isPending) {
    return (
      <Section title="Admins">
        <Skeleton className="h-24 rounded-md" />
      </Section>
    )
  }
  if (users.isError) {
    return (
      <Section title="Admins">
        <p className="text-sm text-destructive">{users.error.message}</p>
      </Section>
    )
  }
  const staff = users.data.filter((u) => u.role !== "member")
  const members = users.data.filter((u) => u.role === "member")

  const row = (u: AdminUser) => (
    <li
      key={u.id}
      className={cn(
        "grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-0.5 px-3 py-2.5 text-sm sm:grid-cols-[auto_1fr_7rem_7rem_auto]",
        (u.revokedAt || u.bannedAt) && "opacity-50",
      )}
    >
      <UserAvatar user={u} size="md" className="row-span-2 sm:row-span-1" />
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="truncate font-medium">{u.name}</span>
        <Badge variant={u.role === "owner" ? "default" : "secondary"} className="capitalize">
          {u.role}
        </Badge>
        {u.discordLinked && <Badge variant="outline">Discord</Badge>}
        {u.role === "member" && !u.bannedAt && (
          <Badge variant={u.trusted ? "outline" : "secondary"}>
            {u.trusted ? "trusted" : "reviewed"}
          </Badge>
        )}
        {u.bannedAt ? (
          <Badge variant="destructive">banned</Badge>
        ) : (
          u.revokedAt && <Badge variant="outline">revoked</Badge>
        )}
      </div>
      <span className="col-start-2 truncate text-xs text-muted-foreground sm:hidden">
        {u.uploadCount} {u.uploadCount === 1 ? "upload" : "uploads"}
        {u.role === "member" && `, ${formatBytes(u.bytesUsed)}`}
        {u.pendingCount > 0 && `, ${u.pendingCount} pending`}, joined {formatDate(u.createdAt)}
      </span>
      <span className="hidden text-muted-foreground tabular-nums sm:block">
        {u.uploadCount} {u.uploadCount === 1 ? "upload" : "uploads"}
        {u.pendingCount > 0 && (
          <span className="text-amber-500"> ({u.pendingCount} pending)</span>
        )}
      </span>
      <span className="hidden text-muted-foreground sm:block" title={u.createdAt}>
        {u.role === "member" ? formatBytes(u.bytesUsed) : `joined ${formatDate(u.createdAt)}`}
      </span>
      <div className="col-start-3 row-start-1 flex gap-1 justify-self-end sm:col-auto sm:row-auto">
        {u.role === "member" && !u.bannedAt && (
          <Button
            variant="ghost"
            size="sm"
            disabled={trust.isPending}
            onClick={() => trust.mutate({id: u.id, trusted: !u.trusted})}
          >
            {u.trusted ? "Review again" : "Trust"}
          </Button>
        )}
        {u.id !== ownerId && !u.revokedAt && isOwner && (
          <Button variant="ghost" size="sm" onClick={() => setRevoking(u)}>
            Revoke
          </Button>
        )}
        {u.id !== ownerId && !u.bannedAt && (isOwner || u.role === "member") && (
          <Button variant="ghost" size="sm" onClick={() => setBanning(u)}>
            Ban
          </Button>
        )}
      </div>
    </li>
  )

  return (
    <>
      <Section title="Admins" body="Everyone here can upload, edit and delete any meme.">
        <ul className="divide-y rounded-lg border">{staff.map(row)}</ul>
      </Section>
      <Section
        title="Members"
        body={`Signed in with Discord and approved by an admin. Their first ${LIMITS.trustAfterApprovals} approved uploads are reviewed, then they are trusted automatically.`}
      >
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">{members.map(row)}</ul>
        )}
      </Section>

      <AlertDialog open={revoking !== null} onOpenChange={(open) => !open && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {revoking?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They are signed out everywhere right away and can't sign back in. Their memes
              stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={revoke.isPending}
              onClick={(e) => {
                e.preventDefault()
                if (revoking) revoke.mutate(revoking.id)
              }}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={banning !== null} onOpenChange={(open) => !open && setBanning(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ban {banning?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {banning?.uploadCount ?? 0} {banning?.uploadCount === 1 ? "meme" : "memes"} they
              uploaded will be deleted and every pasted link to them stops working. They are
              signed out and cannot come back. There is no undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={ban.isPending}
              onClick={(e) => {
                e.preventDefault()
                if (banning) ban.mutate(banning.id)
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
