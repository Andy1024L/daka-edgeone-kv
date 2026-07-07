import type { CheckInRecord } from "@/types"

type KvValueType = "text" | "json" | "arrayBuffer" | "stream"

interface EdgeOneKvNamespace {
  get(key: string, options?: KvValueType | { type: KvValueType }): Promise<unknown>
  put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream): Promise<void>
  delete(key: string): Promise<void>
}

const WORKOUTS_KEY = "workouts_all"
const DEFAULT_KV_BINDING_NAMES = ["WORKOUT_KV", "workout_kv", "my_kv"]

function getConfiguredBindingNames(): string[] {
  const configuredName = process.env.EDGEONE_KV_BINDING_NAME?.trim()
  return configuredName ? [configuredName, ...DEFAULT_KV_BINDING_NAMES] : DEFAULT_KV_BINDING_NAMES
}

function getKvNamespace(): EdgeOneKvNamespace | null {
  const bindings = globalThis as unknown as Record<string, unknown>

  for (const name of getConfiguredBindingNames()) {
    const binding = bindings[name]

    if (
      binding &&
      typeof binding === "object" &&
      "get" in binding &&
      "put" in binding &&
      "delete" in binding &&
      typeof binding.get === "function" &&
      typeof binding.put === "function" &&
      typeof binding.delete === "function"
    ) {
      return binding as EdgeOneKvNamespace
    }
  }

  return null
}

function normalizeRecord(value: unknown): CheckInRecord | null {
  if (!value || typeof value !== "object") return null

  const raw = value as Record<string, unknown>
  const category = raw.category === "锻炼" || raw.category === "拉伸" ? raw.category : null
  const duration = Number(raw.duration)
  const timestamp = Number(raw.timestamp)
  const date = typeof raw.date === "string" ? raw.date : ""
  const id = typeof raw.id === "string" ? raw.id : ""

  if (!id || !category || !date || Number.isNaN(duration) || duration <= 0 || Number.isNaN(timestamp)) {
    return null
  }

  return { id, timestamp, date, category, duration }
}

function mergeWorkouts(...recordLists: CheckInRecord[][]): CheckInRecord[] {
  const recordsById = new Map<string, CheckInRecord>()

  for (const records of recordLists) {
    for (const record of records) {
      const normalized = normalizeRecord(record)
      if (normalized) recordsById.set(normalized.id, normalized)
    }
  }

  return [...recordsById.values()].sort((a, b) => b.timestamp - a.timestamp)
}

async function requireKvNamespace(): Promise<EdgeOneKvNamespace> {
  const kv = getKvNamespace()

  if (!kv) {
    throw new Error("EdgeOne KV 还没有绑定，请在 Makers 中绑定 KV 命名空间变量 WORKOUT_KV")
  }

  return kv
}

export function isWorkoutStoreConfigured(): boolean {
  return Boolean(getKvNamespace())
}

export async function getWorkouts(): Promise<CheckInRecord[]> {
  const kv = await requireKvNamespace()
  const rawRecords = await kv.get(WORKOUTS_KEY, { type: "json" })

  if (!Array.isArray(rawRecords)) return []

  return mergeWorkouts(
    rawRecords.map(normalizeRecord).filter((record): record is CheckInRecord => Boolean(record))
  )
}

async function saveWorkouts(records: CheckInRecord[]): Promise<CheckInRecord[]> {
  const kv = await requireKvNamespace()
  const cleanRecords = mergeWorkouts(records)
  await kv.put(WORKOUTS_KEY, JSON.stringify(cleanRecords))
  return cleanRecords
}

export async function createWorkout(record: CheckInRecord): Promise<CheckInRecord> {
  const normalized = normalizeRecord(record)
  if (!normalized) throw new Error("没有有效记录")

  await saveWorkouts(mergeWorkouts(await getWorkouts(), [normalized]))
  return normalized
}

export async function createWorkouts(records: CheckInRecord[]): Promise<CheckInRecord[]> {
  const normalizedRecords = records
    .map(normalizeRecord)
    .filter((record): record is CheckInRecord => Boolean(record))

  if (normalizedRecords.length === 0) throw new Error("没有有效记录")

  return saveWorkouts(mergeWorkouts(await getWorkouts(), normalizedRecords))
}

export async function updateWorkout(
  id: string,
  updates: Partial<Pick<CheckInRecord, "date" | "duration">>
): Promise<CheckInRecord | null> {
  const records = await getWorkouts()
  let updatedRecord: CheckInRecord | null = null

  const nextRecords = records.map((record) => {
    if (record.id !== id) return record

    updatedRecord = {
      ...record,
      date: updates.date || record.date,
      duration: typeof updates.duration === "number" && updates.duration > 0 ? updates.duration : record.duration,
    }
    return updatedRecord
  })

  if (!updatedRecord) return null

  await saveWorkouts(nextRecords)
  return updatedRecord
}

export async function deleteWorkout(id: string): Promise<boolean> {
  const records = await getWorkouts()
  const nextRecords = records.filter((record) => record.id !== id)

  if (nextRecords.length === records.length) return false

  await saveWorkouts(nextRecords)
  return true
}

export async function clearWorkouts(): Promise<void> {
  const kv = await requireKvNamespace()
  await kv.delete(WORKOUTS_KEY)
}
