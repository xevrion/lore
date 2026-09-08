import type {UserSummary} from "@lore/server/types"

import {initials} from "@/lib/format"
import {cn} from "@/lib/utils"

const sizes = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-16 text-xl",
  xl: "size-24 text-3xl",
} as const

export function UserAvatar({
  user,
  size = "sm",
  className,
}: {
  user: Pick<UserSummary, "name" | "color" | "avatarUrl">
  size?: keyof typeof sizes
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white select-none",
        sizes[size],
        className,
      )}
      style={{backgroundColor: user.color}}
    >
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="size-full object-cover" draggable={false} />
      ) : (
        initials(user.name)
      )}
    </span>
  )
}

export function AddedBy({user, className}: {user: UserSummary; className?: string}) {
  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs", className)}
      title={`Added by ${user.name}`}
    >
      <UserAvatar user={user} size="xs" />
      <span className="truncate">{user.name}</span>
    </span>
  )
}
