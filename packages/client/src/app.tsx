import {QueryClient, QueryClientProvider} from "@tanstack/react-query"
import {lazy, Suspense} from "react"
import type {CSSProperties, ReactNode} from "react"
import {BrowserRouter, Route, Routes, useLocation} from "react-router"
import {Toaster} from "sonner"

import {ApiError} from "@/api"
import {OfflineBanner} from "@/components/offline-banner"
import {TooltipProvider} from "@/components/ui/tooltip"
import {useTheme} from "@/lib/theme"
import {UploadsProvider} from "@/lib/uploads"
import Gallery from "@/routes/gallery"

const Login = lazy(() => import("@/routes/login"))
const Join = lazy(() => import("@/routes/join"))
const Admin = lazy(() => import("@/routes/admin"))
const Settings = lazy(() => import("@/routes/settings"))
const NotFound = lazy(() => import("@/routes/not-found"))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // One retry for flaky networks and 5xx, none for a 4xx the server meant.
      retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status < 500),
      refetchOnWindowFocus: false,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <UploadsProvider>
          <BrowserRouter>
            <OfflineBanner />
            <Suspense fallback={null}>
              <RouteFade>
                <Routes>
                  <Route path="/" element={<Gallery />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/join/:token" element={<Join />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </RouteFade>
            </Suspense>
          </BrowserRouter>
          <ThemedToaster />
        </UploadsProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

// Keyed on the path so a route change gets a short fade; search params do not
// remount the gallery.
function RouteFade({children}: {children: ReactNode}) {
  const {pathname} = useLocation()
  return (
    <div key={pathname} className="animate-in duration-150 fade-in-0">
      {children}
    </div>
  )
}

function ThemedToaster() {
  const {theme} = useTheme()
  return (
    <Toaster
      position="bottom-center"
      theme={theme}
      duration={2200}
      richColors={false}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as CSSProperties
      }
      toastOptions={{className: "font-sans shadow-lg", classNames: {icon: "text-primary"}}}
    />
  )
}
