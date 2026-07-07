import type { AppConfig, CheckInRecord } from "@/types"
import {
  formatLocalDate,
  getPendingSyncRecords,
  getRecords,
  mergeRecordLists,
  queuePendingSyncRecord,
  removePendingSyncRecords,
  savePendingSyncRecords,
  saveRecords,
} from "@/lib/storage"

function mergeRecords(records: CheckInRecord[], nextRecord: CheckInRecord): CheckInRecord[] {
  const nextRecords = records.filter((record) => record.id !== nextRecord.id)
  return [nextRecord, ...nextRecords]
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "请求失败")
  }

  return data as T
}

export async function getAppConfig(): Promise<AppConfig> {
  return requestJson<AppConfig>("/api/config")
}

export async function syncPendingWorkouts(): Promise<CheckInRecord[]> {
  const pendingRecords = getPendingSyncRecords()
  if (pendingRecords.length === 0) return []

  const data = await requestJson<{ records: CheckInRecord[] }>("/api/records", {
    method: "POST",
    body: JSON.stringify({ records: pendingRecords }),
  })

  const savedRecords = data.records.length > 0 ? data.records : pendingRecords
  removePendingSyncRecords(savedRecords.map((record) => record.id))
  saveRecords(mergeRecordLists(getRecords(), savedRecords))

  return savedRecords
}

export async function getWorkouts(): Promise<CheckInRecord[]> {
  await syncPendingWorkouts().catch(() => undefined)

  const data = await requestJson<{ records: CheckInRecord[] }>("/api/records")
  const localRecords = getRecords()
  const pendingRecords = getPendingSyncRecords()
  const remoteRecordIds = new Set(data.records.map((record) => record.id))
  const localOnlyRecords = mergeRecordLists(localRecords, pendingRecords).filter((record) => !remoteRecordIds.has(record.id))
  let savedLocalRecords: CheckInRecord[] = []

  if (localOnlyRecords.length > 0) {
    const syncedData = await requestJson<{ records: CheckInRecord[] }>("/api/records", {
      method: "POST",
      body: JSON.stringify({ records: localOnlyRecords }),
    }).catch(() => {
      savePendingSyncRecords(mergeRecordLists(pendingRecords, localOnlyRecords))
      return { records: [] }
    })

    savedLocalRecords = syncedData.records.length > 0 ? syncedData.records : []
    removePendingSyncRecords(savedLocalRecords.map((record) => record.id))
  }

  const records = mergeRecordLists(data.records, localRecords, pendingRecords, savedLocalRecords)
  saveRecords(records)
  return records
}

export function createOptimisticWorkout(category: CheckInRecord["category"], duration: number): CheckInRecord {
  const now = new Date()
  const date = formatLocalDate(now)

  return {
    id: `${date.replace(/-/g, "")}-${crypto.randomUUID()}`,
    timestamp: now.getTime(),
    date,
    category,
    duration,
  }
}

export async function createWorkout(record: CheckInRecord): Promise<CheckInRecord> {
  saveRecords(mergeRecords(getRecords(), record))
  queuePendingSyncRecord(record)

  const data = await requestJson<{ records: CheckInRecord[] }>("/api/records", {
    method: "POST",
    body: JSON.stringify(record),
  })

  const savedRecord = data.records.find((item) => item.id === record.id) ?? data.records[0] ?? record
  removePendingSyncRecords([savedRecord.id])
  saveRecords(mergeRecords(getRecords(), savedRecord))
  return savedRecord
}

export async function importWorkouts(records: CheckInRecord[]): Promise<CheckInRecord[]> {
  saveRecords(records)

  const data = await requestJson<{ records: CheckInRecord[] }>("/api/records", {
    method: "POST",
    body: JSON.stringify({ records }),
  })

  saveRecords(data.records)
  return data.records
}

export async function updateWorkout(
  id: string,
  updates: Partial<Pick<CheckInRecord, "date" | "duration">>
): Promise<CheckInRecord> {
  const previousRecords = getRecords()
  const optimisticRecords = previousRecords.map((record) =>
    record.id === id
      ? {
          ...record,
          date: updates.date ?? record.date,
          duration: updates.duration ?? record.duration,
        }
      : record
  )
  saveRecords(optimisticRecords)

  const data = await requestJson<{ record: CheckInRecord }>(`/api/records/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  })

  saveRecords(mergeRecords(getRecords(), data.record))
  return data.record
}

export async function deleteWorkout(id: string): Promise<void> {
  const previousRecords = getRecords()
  saveRecords(previousRecords.filter((record) => record.id !== id))

  await requestJson(`/api/records/${encodeURIComponent(id)}`, {
    method: "DELETE",
  }).catch((error) => {
    saveRecords(previousRecords)
    throw error
  })
}

export async function clearWorkouts(): Promise<void> {
  const previousRecords = getRecords()
  saveRecords([])

  await requestJson("/api/records", {
    method: "DELETE",
  }).catch((error) => {
    saveRecords(previousRecords)
    throw error
  })
}
