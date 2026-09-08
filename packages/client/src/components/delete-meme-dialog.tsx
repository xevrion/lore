import type {Meme} from "@lore/server/types"
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

export default function DeleteMemeDialog({
  meme,
  onClose,
  onDeleted,
}: {
  meme: Meme
  onClose: () => void
  onDeleted: (id: string) => void
}) {
  const [busy, setBusy] = useState(false)

  async function remove() {
    setBusy(true)
    try {
      await api.deleteMeme(meme.id)
      onDeleted(meme.id)
      toast("Deleted")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete")
      setBusy(false)
    }
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this meme?</AlertDialogTitle>
          <AlertDialogDescription>
            Links already pasted elsewhere will stop working. There is no undo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <img
          src={meme.thumbUrl}
          alt={meme.title}
          className="max-h-48 w-full rounded-md bg-muted object-contain"
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault()
              void remove()
            }}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
