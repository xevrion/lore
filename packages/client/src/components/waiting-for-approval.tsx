import {useQueryClient} from "@tanstack/react-query"
import {useNavigate} from "react-router"

import {api, meQueryKey} from "@/api"
import {Header} from "@/components/header"
import {Button} from "@/components/ui/button"

// What a member sees between signing in and an admin approving them.
export function WaitingForApproval() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  async function logout() {
    try {
      await api.logout()
    } finally {
      queryClient.setQueryData(meQueryKey, null)
      void queryClient.invalidateQueries()
      void navigate("/login")
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto grid min-h-[70dvh] w-full max-w-sm place-items-center px-4">
        <div className="grid gap-4 rounded-lg border bg-card p-6 text-center">
          <p className="font-medium">Waiting for approval</p>
          <p className="text-sm text-muted-foreground">
            Your account is waiting for an admin to approve it. Check back later.
          </p>
          <Button variant="outline" size="sm" onClick={() => void logout()}>
            Log out
          </Button>
        </div>
      </main>
    </>
  )
}
