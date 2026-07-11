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

function normalizeRecord(value) {
  if (!value || typeof value !== "object") return null

  const category = value.category === "锻炼" || value.category === "拉伸" ? value.category : null
  const duration = Number(value.duration)
  const timestamp = Number(value.timestamp)
  const date = typeof value.date === "string" ? value.date : ""
  const id = typeof value.id === "string" ? value.id : ""

  if (!id || !category || !date || Number.isNaN(duration) || duration <= 0 || Number.isNaN(timestamp)) {
    return null
  }

  return { id, timestamp, date, category, duration }
}

function mergeRecords(...recordLists) {
  const recordsById = new Map()

  for (const records of recordLists) {
    for (const record of records) {
      const normalized = normalizeRecord(record)
      if (normalized) recordsById.set(normalized.id, normalized)
    }
  }

  return [...recordsById.values()].sort((a, b) => b.timestamp - a.timestamp)
}

async function getWorkouts(kv) {
  const rawRecords = await kv.get(WORKOUTS_KEY, { type: "json" })
  if (!Array.isArray(rawRecords)) return []
  return mergeRecords(rawRecords)
}

async function saveWorkouts(kv, records) {
  const cleanRecords = mergeRecords(records)
  await kv.put(WORKOUTS_KEY, JSON.stringify(cleanRecords))
  return cleanRecords
}

function requireKv() {
  const kv = getKv()
  if (!kv) throw new Error("EdgeOne KV 还没有绑定，请绑定变量 WORKOUT_KV")
  return kv
}

export async function onRequestGet(context) {
  const { request } = context
  const authError = await assertAuthenticated(request, context)
  if (authError) return authError

  try {
    const kv = requireKv()
    return json({ records: await getWorkouts(kv) })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "读取失败" }, { status: 503 })
  }
}

export async function onRequestPost(context) {
  const { request } = context
  const authError = await assertAuthenticated(request, context)
  if (authError) return authError

  try {
    const kv = requireKv()
    const body = await request.json().catch(() => null)
    const recordsInput = Array.isArray(body?.records) ? body.records : [body]
    const records = recordsInput.map(normalizeRecord).filter(Boolean)

    if (records.length === 0) {
      return json({ error: "没有有效记录" }, { status: 400 })
    }

    return json({ records: await saveWorkouts(kv, mergeRecords(await getWorkouts(kv), records)) })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 500 })
  }
}

export async function onRequestDelete(context) {
  const { request } = context
  const authError = await assertAuthenticated(request, context)
  if (authError) return authError

  try {
    const kv = requireKv()
    await kv.delete(WORKOUTS_KEY)
    return json({ ok: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "清除失败" }, { status: 500 })
  }
}
