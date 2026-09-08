import {useQueryClient} from "@tanstack/react-query"
import {useEffect, useRef, useState} from "react"
import {useNavigate, useSearchParams} from "react-router"

import {api, ApiError, meQueryKey, useAuthConfig, useMe} from "@/api"
import {DiscordMark} from "@/components/discord-mark"
import {buttonVariants} from "@/components/ui/button"
import {InputOTP, InputOTPGroup, InputOTPSlot} from "@/components/ui/input-otp"
import {Wordmark} from "@/components/wordmark"
import {cn} from "@/lib/utils"

const oauthErrors: Record<string, string> = {
  revoked: "Your access was revoked. Ask the owner for a new invite.",
  "not-invited": "That Discord account hasn't been invited yet.",
  oauth: "Discord sign-in didn't complete. Try again.",
}

export default function Login() {
  const {data: me} = useMe()
  const {data: config} = useAuthConfig()
  const [params] = useSearchParams()
  const oauthError = oauthErrors[params.get("error") ?? ""]
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [code, setCode] = useState("")
  const [state, setState] = useState<"idle" | "busy" | "wrong" | "ok">("idle")
  const [problem, setProblem] = useState("Wrong code")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (me) void navigate("/", {replace: true})
  }, [me, navigate])

  // The input is disabled while the request runs, which drops focus.
  useEffect(() => {
    if (state === "wrong") inputRef.current?.focus()
  }, [state])

  async function submit(value: string) {
    setState("busy")
    try {
      const user = await api.login(value)
      setState("ok")
      // A beat of green-lit boxes so the success registers before the wall appears.
      await new Promise((r) => setTimeout(r, 220))
      queryClient.setQueryData(meQueryKey, user)
      void navigate("/", {replace: true})
    } catch (e) {
      setState("wrong")
      setCode("")
      setProblem(e instanceof ApiError && e.status !== 400 ? e.message : "Wrong code")
      if (!(e instanceof ApiError)) console.error(e)
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="flex w-full max-w-xs animate-in flex-col items-center gap-8 duration-300 ease-(--ease-out-strong) fade-in-0 slide-in-from-bottom-2">
        <Wordmark big />
        <div
          className={cn(
            "flex flex-col items-center gap-4",
            state === "wrong" && "animate-shake",
          )}
        >
          <InputOTP
            ref={inputRef}
            maxLength={6}
            value={code}
            autoFocus
            inputMode="numeric"
            pattern="[0-9]*"
            disabled={state === "busy" || state === "ok"}
            aria-label="Six digit code"
            onChange={(v) => {
              setCode(v)
              if (state === "wrong") setState("idle")
              if (v.length === 6) void submit(v)
            }}
          >
            <InputOTPGroup
              className={cn(
                "gap-1.5 *:size-11 *:rounded-md *:border *:text-lg *:transition-[border-color,background-color,color] *:duration-200",
                state === "ok" && "*:border-primary *:bg-primary/10 *:text-primary",
              )}
            >
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} aria-invalid={state === "wrong"} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <p
            role="status"
            className={cn(
              "text-sm",
              state === "wrong" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {state === "wrong" ? problem : "Enter the code from your authenticator app"}
          </p>
        </div>
        {config?.discord && (
          <div className="grid w-full gap-4">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <a
              href="/api/auth/discord/start"
              className={buttonVariants({variant: "outline", className: "pressable w-full"})}
            >
              <DiscordMark className="size-4" />
              Continue with Discord
            </a>
            {config.members && !oauthError && (
              <p className="text-center text-xs text-muted-foreground">
                Members of the Discord server can sign in directly.
              </p>
            )}
            {oauthError && (
              <p role="alert" className="text-center text-sm text-destructive">
                {oauthError}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
