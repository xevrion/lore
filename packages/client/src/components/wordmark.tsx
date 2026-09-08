import {Link} from "react-router"

import {cn} from "@/lib/utils"

export function Wordmark({className, big = false}: {className?: string; big?: boolean}) {
  return (
    <Link
      to="/"
      aria-label="lore, home"
      className={cn(
        "inline-flex items-center font-semibold tracking-tight text-foreground",
        big ? "text-3xl" : "text-lg",
        className,
      )}
    >
      lore
      <span
        aria-hidden
        className={cn(
          "ml-0.5 inline-block self-end rounded-full bg-primary",
          big ? "mb-1.5 size-2" : "mb-[7px] size-1.5",
        )}
      />
    </Link>
  )
}
