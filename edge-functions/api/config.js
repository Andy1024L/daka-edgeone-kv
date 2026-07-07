function getRuntimeEnv() {
  return typeof env === "undefined" ? {} : env
}

export function onRequestGet() {
  const runtimeEnv = getRuntimeEnv()

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
