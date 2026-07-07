export function onRequestPost() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "set-cookie": "daka_auth=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    },
  })
}
