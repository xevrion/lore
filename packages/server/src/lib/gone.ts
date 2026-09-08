// 64x64 PNG, dark grey with a lighter X. Served with a 404 so a deleted meme
// pasted in a chat shows a placeholder instead of a broken image.
const GONE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAuElEQVR42u3YTQqAIABE4W4jdDu3nb5Fu4hKm1EmHrgV3gf511LKGj0WAAAAAAAAAAAAAAAAAAAAYAKg1u0YU6YrAR0RX+ZaAE0d3RP1a6AjRVivWcRNQdp62S70Mkter9xGH+Mc9eJz4CbRVK8/yC5DffWWk/iUa613XSWG1RvvQmPqAfzyE8pexNnbaPZBln2VyL7MZV+nsx808U/K/zzqU3+r8GcOAAAAAAAAAAAAAAAAAAAEjx2x1EDZ4sJ0DQAAAABJRU5ErkJggg=="

export const GONE_PNG = Uint8Array.from(atob(GONE_BASE64), (ch) => ch.charCodeAt(0))
