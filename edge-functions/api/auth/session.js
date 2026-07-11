const AUTH_COOKIE = "daka_auth"

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...init.headers },
  })
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("cookie") || ""
  const cookie = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : ""
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

export async function onRequestGet(context) {
  const password = context.env?.APP_PASSWORD
  const secret = context.env?.AUTH_SECRET
  if (!password || !secret) return json({ authenticated: false, configured: false }, { status: 500 })

  const expectedToken = await sha256(`${password}:${secret}`)
  const authenticated = getCookie(context.request, AUTH_COOKIE) === expectedToken
  return json({ authenticated, configured: true }, { status: authenticated ? 200 : 401 })
}
