const WORKOUTS_KEY = "workouts_all"

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

export async function onRequestPatch({ request, params }) {
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

export async function onRequestDelete({ params }) {
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
