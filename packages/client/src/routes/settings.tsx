import type {Me} from "@lore/server/types"
import {LIMITS} from "@lore/server/types"
import {useQueryClient} from "@tanstack/react-query"
import {useEffect, useState} from "react"
import type {ReactNode} from "react"
import {useNavigate} from "react-router"
import {toast} from "sonner"

import {api, meQueryKey, useMe} from "@/api"
import {AvatarPicker} from "@/components/avatar-picker"
import {Header} from "@/components/header"
import {Button} from "@/components/ui/button"
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
        <ProfileForm key={me.id} me={me} />
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
