import {useOnline} from "@/lib/hooks"

export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div
      role="status"
      className="bg-secondary px-4 py-1.5 text-center text-xs text-secondary-foreground"
    >
      You're offline. Links still copy, but nothing new will load.
    </div>
  )
}
