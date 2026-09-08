import type {Meme} from "@lore/server/types"
import {LIMITS} from "@lore/server/types"
import {useState} from "react"
import {toast} from "sonner"

import {api} from "@/api"
import {TagInput} from "@/components/tag-input"
import {Button} from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {Input} from "@/components/ui/input"

export default function EditMemeDialog({
  meme,
  onClose,
  onSaved,
}: {
  meme: Meme
  onClose: () => void
  onSaved: (meme: Meme) => void
}) {
  const [title, setTitle] = useState(meme.title)
  const [tags, setTags] = useState(meme.tags.join(" "))
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      onSaved(await api.updateMeme(meme.id, {title: title.trim(), tags: tags.trim()}))
      toast.success("Saved")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit meme</DialogTitle>
          <DialogDescription>Titles and tags are what search looks at.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="flex gap-3">
            <img
              src={meme.thumbUrl}
              alt=""
              className="size-20 shrink-0 rounded-md object-cover"
              width={80}
              height={80}
            />
            <div className="grid flex-1 gap-3">
              <div className="grid gap-1.5">
                <label htmlFor="edit-title" className="text-xs text-muted-foreground">
                  Title
                </label>
                <Input
                  id="edit-title"
                  value={title}
                  maxLength={LIMITS.titleChars}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="edit-tags" className="text-xs text-muted-foreground">
                  Tags
                </label>
                <TagInput id="edit-tags" value={tags} onChange={setTags} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
