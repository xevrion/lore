import {QueryClient, QueryClientProvider} from "@tanstack/react-query"
import {lazy, Suspense} from "react"
import {BrowserRouter, Route, Routes} from "react-router"
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
              <Routes>
                <Route path="/" element={<Gallery />} />
                <Route path="/login" element={<Login />} />
                <Route path="/join/:token" element={<Join />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          <ThemedToaster />
        </UploadsProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

function ThemedToaster() {
  const {theme} = useTheme()
  return (
    <Toaster
      position="bottom-center"
      theme={theme}
      duration={2200}
      toastOptions={{className: "font-sans"}}
    />
  )
}
