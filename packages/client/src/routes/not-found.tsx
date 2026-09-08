import {Link} from "react-router"

import {Wordmark} from "@/components/wordmark"

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <Wordmark big />
        <p className="font-mono text-2xl text-muted-foreground select-none">¯\_(ツ)_/¯</p>
        <p className="text-sm text-muted-foreground">Nothing at this address.</p>
        <Link to="/" className="text-sm underline underline-offset-4">
          Back to the wall
        </Link>
      </div>
    </main>
  )
}
