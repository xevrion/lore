import type {Me} from "@lore/server/types"
import {LIMITS} from "@lore/server/types"
import {useQueryClient} from "@tanstack/react-query"
import {useEffect, useState} from "react"
import type {ReactNode} from "react"
import {useNavigate, useSearchParams} from "react-router"
import {toast} from "sonner"

import {api, isPending as awaitingApproval, meQueryKey, useAuthConfig, useMe} from "@/api"
import {AvatarPicker} from "@/components/avatar-picker"
import {DiscordMark} from "@/components/discord-mark"
import {Header} from "@/components/header"
import {Button, buttonVariants} from "@/components/ui/button"
import {Input} from "@/components/ui/input"
import {Switch} from "@/components/ui/switch"
import {useTheme} from "@/lib/theme"

export default function Settings() {
  const {data: me, isPending} = useMe()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isPending && !me) void navigate("/login", {replace: true})
  }, [isPending, me, navigate])

  if (!me) return null

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-lg px-4 py-10 sm:px-6">
        <h1 className="mb-8 text-xl font-semibold tracking-tight">Settings</h1>
        {awaitingApproval(me) && (
          <p className="mb-8 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
            Your account is waiting for an admin to approve it. You can set your name and avatar
            in the meantime.
          </p>
        )}
        <ProfileForm key={me.id} me={me} />
        <Discord me={me} />
        <Appearance />
        <Sessions />
      </main>
    </>
  )
}

function ProfileForm({me}: {me: Me}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(me.name)
  const [avatar, setAvatar] = useState<Blob | null>(null)
  const [busy, setBusy] = useState(false)
  const dirty = name.trim() !== me.name || avatar !== null

  async function save() {
    setBusy(true)
    const form = new FormData()
    if (name.trim() !== me.name) form.set("name", name.trim())
    if (avatar) form.set("avatar", avatar, "avatar.webp")
    try {
      const updated = await api.updateMe(form)
      queryClient.setQueryData(meQueryKey, updated)
      void queryClient.invalidateQueries({queryKey: ["memes"]})
      setAvatar(null)
      toast.success("Saved")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <Section title="Profile" body="Shown on every meme you add.">
        <AvatarPicker
          name={name}
          color={me.color}
          currentUrl={me.avatarUrl}
          onChange={setAvatar}
        />
        <div className="grid gap-2">
          <label htmlFor="settings-name" className="text-sm font-medium">
            Display name
          </label>
          <Input
            id="settings-name"
            value={name}
            maxLength={LIMITS.nameChars}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Button type="submit" disabled={!dirty || busy || !name.trim()} className="pressable">
            Save
          </Button>
        </div>
      </Section>
    </form>
  )
}

function Discord({me}: {me: Me}) {
  const {data: config} = useAuthConfig()
  const [params] = useSearchParams()
  if (!config?.discord) return null
  return (
    <Section
      title="Discord"
      body="Connect your Discord account to sign in here from other devices without a new invite."
    >
      {me.discordLinked ? (
        <p className="flex items-center gap-2 text-sm">
          <DiscordMark className="size-4 text-muted-foreground" />
          Connected
        </p>
      ) : (
        <div className="grid gap-2">
          <a
            href="/api/auth/discord/start?link=1"
            className={buttonVariants({variant: "outline", className: "w-fit"})}
          >
            <DiscordMark className="size-4" />
            Connect Discord
          </a>
          {params.get("error") === "discord-taken" && (
            <p role="alert" className="text-sm text-destructive">
              That Discord account is already connected to someone else.
            </p>
          )}
        </div>
      )}
    </Section>
  )
}

function Appearance() {
  const {theme, setTheme} = useTheme()
  return (
    <Section title="Appearance">
      <label className="flex items-center justify-between gap-4 text-sm">
        <span>Light theme</span>
        <Switch
          checked={theme === "light"}
          onCheckedChange={(on) => setTheme(on ? "light" : "dark")}
        />
      </label>
    </Section>
  )
}

function Sessions() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  async function logoutAll() {
    try {
      await api.logoutAll()
    } finally {
      queryClient.setQueryData(meQueryKey, null)
      toast("Signed out everywhere")
      void navigate("/")
    }
  }

  return (
    <Section
      title="Sessions"
      body="Signs this account out on every device, including this one."
    >
      <div>
        <Button variant="outline" onClick={() => void logoutAll()}>
          Log out everywhere
        </Button>
      </div>
    </Section>
  )
}

function Section({title, body, children}: {title: string; body?: string; children: ReactNode}) {
  return (
    <section className="grid gap-4 border-t py-8 first:border-t-0 first:pt-0">
      <div>
        <h2 className="font-medium">{title}</h2>
        {body && <p className="text-sm text-muted-foreground">{body}</p>}
      </div>
      {children}
    </section>
  )
}
