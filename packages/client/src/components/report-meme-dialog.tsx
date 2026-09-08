import type {Meme} from "@lore/server/types"
import {LIMITS} from "@lore/server/types"
import {useState} from "react"
import {toast} from "sonner"

import {api} from "@/api"
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

export default function ReportMemeDialog({meme, onClose}: {meme: Meme; onClose: () => void}) {
  const [busy, setBusy] = useState(false)

  async function report() {
    setBusy(true)
    try {
      await api.reportMeme(meme.id)
      toast("Reported. Thanks for keeping the wall clean.")
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't report")
      setBusy(false)
    }
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Report this meme?</AlertDialogTitle>
          <AlertDialogDescription>
            {LIMITS.hideAfterReports} reports hide it from everyone until an admin has a look.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault()
              void report()
            }}
          >
            Report
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
