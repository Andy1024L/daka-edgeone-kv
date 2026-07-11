const AUTH_COOKIE = "daka_auth"

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  })
}

async function sha256(value) {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function getRuntimeEnv(context) {
  return context?.env || {}
}

export async function onRequestPost(context) {
  const { request } = context
  const runtimeEnv = getRuntimeEnv(context)
  const password = runtimeEnv.APP_PASSWORD
  const secret = runtimeEnv.AUTH_SECRET

  if (!password || !secret) {
    return json({ error: "密码环境变量还没有配置" }, { status: 500 })
  }

  const body = await request.json().catch(() => null)
  if (body?.password !== password) {
    return json({ error: "密码不正确" }, { status: 401 })
  }

  const token = await sha256(`${password}:${secret}`)
  return json(
    { ok: true },
    {
      headers: {
        "set-cookie": `${AUTH_COOKIE}=${token}; Path=/; Max-Age=15552000; HttpOnly; Secure; SameSite=Lax`,
      },
    }
  )
}
