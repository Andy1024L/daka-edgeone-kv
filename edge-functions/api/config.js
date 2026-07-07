export function onRequestGet({ env }) {
  return new Response(
    JSON.stringify({
      cloudEnabled: Boolean(globalThis.WORKOUT_KV || globalThis.workout_kv || globalThis.my_kv),
      authEnabled: Boolean(env.APP_PASSWORD && env.AUTH_SECRET),
    }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    }
  )
}
