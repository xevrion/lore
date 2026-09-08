import {useQueryClient} from "@tanstack/react-query"
import {useEffect, useRef, useState} from "react"
import {useNavigate} from "react-router"

import {api, ApiError, meQueryKey, useMe} from "@/api"
import {InputOTP, InputOTPGroup, InputOTPSlot} from "@/components/ui/input-otp"
import {Wordmark} from "@/components/wordmark"
import {cn} from "@/lib/utils"

export default function Login() {
  const {data: me} = useMe()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [code, setCode] = useState("")
  const [state, setState] = useState<"idle" | "busy" | "wrong">("idle")
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
      queryClient.setQueryData(meQueryKey, user)
      void navigate("/", {replace: true})
    } catch (e) {
      setState("wrong")
      setCode("")
      if (!(e instanceof ApiError && e.status === 400)) {
        console.error(e)
      }
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="flex w-full max-w-xs flex-col items-center gap-8">
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
            disabled={state === "busy"}
            aria-label="Six digit code"
            onChange={(v) => {
              setCode(v)
              if (state === "wrong") setState("idle")
              if (v.length === 6) void submit(v)
            }}
          >
            <InputOTPGroup className="gap-1.5 *:size-11 *:rounded-md *:border *:text-lg">
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
            {state === "wrong" ? "Wrong code" : "Enter the code from your authenticator app"}
          </p>
        </div>
      </div>
    </main>
  )
}
