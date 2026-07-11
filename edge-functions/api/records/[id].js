const WORKOUTS_KEY = "workouts_all"
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

function getKv() {
  return globalThis.WORKOUT_KV || globalThis.workout_kv || globalThis.my_kv || null
}

function getRuntimeEnv(context) {
  return context?.env || {}
}

async function sha256(value) {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("cookie") || ""
  const cookies = cookieHeader.split(";").map((item) => item.trim())
  const cookie = cookies.find((item) => item.startsWith(`${name}=`))
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : ""
}

async function assertAuthenticated(request, context) {
  const runtimeEnv = getRuntimeEnv(context)
  const password = runtimeEnv.APP_PASSWORD
  const secret = runtimeEnv.AUTH_SECRET

  if (!password || !secret) {
    return json({ error: "密码环境变量还没有配置" }, { status: 500 })
  }

  const expectedToken = await sha256(`${password}:${secret}`)
  if (getCookie(request, AUTH_COOKIE) !== expectedToken) {
    return json({ error: "请先登录" }, { status: 401 })
  }

  return null
}

function requireKv() {
  const kv = getKv()
  if (!kv) throw new Error("EdgeOne KV 还没有绑定，请绑定变量 WORKOUT_KV")
  return kv
}

function mergeRecords(records) {
  return [...new Map(records.map((record) => [record.id, record])).values()].sort((a, b) => b.timestamp - a.timestamp)
}

async function getWorkouts(kv) {
  const rawRecords = await kv.get(WORKOUTS_KEY, { type: "json" })
  return Array.isArray(rawRecords) ? mergeRecords(rawRecords) : []
}

async function saveWorkouts(kv, records) {
  const cleanRecords = mergeRecords(records)
  await kv.put(WORKOUTS_KEY, JSON.stringify(cleanRecords))
  return cleanRecords
}

export async function onRequestPatch(context) {
  const { request, params } = context
  const authError = await assertAuthenticated(request, context)
  if (authError) return authError

  try {
    const kv = requireKv()
    const id = params.id
    const body = await request.json().catch(() => null)
    const records = await getWorkouts(kv)
    let updatedRecord = null
    const nextRecords = records.map((record) => {
      if (record.id !== id) return record
      updatedRecord = {
        ...record,
        date: typeof body?.date === "string" ? body.date : record.date,
        duration: typeof body?.duration === "number" && body.duration > 0 ? body.duration : record.duration,
      }
      return updatedRecord
    })

    if (!updatedRecord) return json({ error: "记录不存在" }, { status: 404 })

    await saveWorkouts(kv, nextRecords)
    return json({ record: updatedRecord })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "更新失败" }, { status: 500 })
  }
}

export async function onRequestDelete(context) {
  const { request, params } = context
  const authError = await assertAuthenticated(request, context)
  if (authError) return authError

  try {
    const kv = requireKv()
    const records = await getWorkouts(kv)
    await saveWorkouts(
      kv,
      records.filter((record) => record.id !== params.id)
    )
    return json({ ok: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "删除失败" }, { status: 500 })
  }
}
