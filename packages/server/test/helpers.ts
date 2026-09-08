import {base32} from "@otplib/plugin-base32-scure"
import {crypto as otpCrypto} from "@otplib/plugin-crypto-web"
import {env, SELF} from "cloudflare:test"
import {TOTP} from "otplib"

export const ORIGIN = "https://lore.test"

// 1x1 transparent GIF and 1x1 PNG, the smallest valid files of each type.
export const TINY_GIF = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00,
  0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00,
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
])

export const TINY_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (ch) => ch.charCodeAt(0),
)

export const totpCode = () =>
  new TOTP({secret: env.TOTP_SECRET, crypto: otpCrypto, base32}).generate()

export const cookieOf = (res: Response) => {
  const header = res.headers.get("set-cookie") ?? ""
  return header.split(";")[0] ?? ""
}

export async function loginAsOwner() {
  const res = await SELF.fetch(`${ORIGIN}/api/auth/login`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({totp: await totpCode()}),
  })
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${await res.text()}`)
  return cookieOf(res)
}

export async function upload(cookie: string, bytes: Uint8Array, name: string, fields = {}) {
  const form = new FormData()
  form.set("file", new File([bytes], name))
  for (const [k, v] of Object.entries(fields)) form.set(k, String(v))
  const res = await SELF.fetch(`${ORIGIN}/api/memes`, {
    method: "POST",
    headers: {cookie},
    body: form,
  })
  return res
}
