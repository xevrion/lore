import {LIMITS} from "@lore/server/types"
import {useQuery, useQueryClient} from "@tanstack/react-query"
import {useState} from "react"
import {useNavigate, useParams} from "react-router"
import {toast} from "sonner"

import {api, ApiError, meQueryKey, useAuthConfig} from "@/api"
import {AvatarPicker} from "@/components/avatar-picker"
import {DiscordMark} from "@/components/discord-mark"
import {Button, buttonVariants} from "@/components/ui/button"
import {Input} from "@/components/ui/input"
import {Wordmark} from "@/components/wordmark"

// Only a preview colour; the server picks the real one when the account is made.
const palette = ["#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2", "#2563eb", "#ca8a04"]

export default function Join() {
  const {token = ""} = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [avatar, setAvatar] = useState<Blob | null>(null)
  const [busy, setBusy] = useState(false)
  const color = palette[(token.charCodeAt(0) || 0) % palette.length]!
  const {data: config} = useAuthConfig()
  const discord = config?.discord === true

  const invite = useQuery({
    queryKey: ["invite", token],
    queryFn: () => api.checkInvite(token),
    retry: false,
  })

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    const form = new FormData()
    form.set("token", token)
    form.set("name", trimmed)
    if (avatar) form.set("avatar", avatar, "avatar.webp")
    try {
      const me = await api.join(form)
      queryClient.setQueryData(meQueryKey, me)
      toast.success(`Welcome, ${me.name}`)
      void navigate("/", {replace: true})
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't join")
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <Wordmark big className="self-center" />
        {invite.isPending ? (
          <p className="text-center text-sm text-muted-foreground">Checking your invite</p>
        ) : invite.isError ? (
          <Card
            title={
              invite.error instanceof ApiError && invite.error.status === 410
                ? "This invite has already been used or expired"
                : "Couldn't check this invite"
            }
            body="Ask the owner for a new link. Each one works once and lasts a day."
          />
        ) : (
          <form
            className="grid gap-6"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <div className="grid gap-1">
              <h1 className="text-xl font-semibold tracking-tight">
                You've been invited to lore
              </h1>
              <p className="text-sm text-muted-foreground">
                {discord
                  ? "Sign in with Discord and you can get back in from any device."
                  : "Pick a name your friends will recognise. No password, the link is the key."}
              </p>
            </div>
            {discord ? (
              <a
                href={`/api/auth/discord/start?invite=${encodeURIComponent(token)}`}
                className={buttonVariants({className: "pressable w-full"})}
              >
                <DiscordMark className="size-4" />
                Continue with Discord
              </a>
            ) : (
              <>
                <div className="grid gap-2">
                  <label htmlFor="join-name" className="text-sm font-medium">
                    Display name
                  </label>
                  <Input
                    id="join-name"
                    value={name}
                    autoFocus
                    required
                    maxLength={LIMITS.nameChars}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Yash"
                  />
                </div>
                <AvatarPicker
                  name={name}
                  color={color}
                  currentUrl={null}
                  onChange={setAvatar}
                />
                <Button type="submit" disabled={busy || !name.trim()} className="pressable">
                  Join
                </Button>
              </>
            )}
          </form>
        )}
      </div>
    </main>
  )
}

function Card({title, body}: {title: string; body: string}) {
  return (
    <div className="grid gap-2 rounded-lg border bg-card p-6 text-center">
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  )
}
