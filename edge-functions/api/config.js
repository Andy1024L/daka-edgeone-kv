function getRuntimeEnv(context) {
  return context?.env || {}
}

export function onRequestGet(context) {
  const runtimeEnv = getRuntimeEnv(context)

  return new Response(
    JSON.stringify({
      cloudEnabled: Boolean(globalThis.WORKOUT_KV || globalThis.workout_kv || globalThis.my_kv),
      authEnabled: Boolean(runtimeEnv.APP_PASSWORD && runtimeEnv.AUTH_SECRET),
    }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    }
  )
}
