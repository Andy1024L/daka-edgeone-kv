import { NextResponse } from "next/server"
import { clearWorkouts, createWorkouts, getWorkouts, isWorkoutStoreConfigured } from "@/lib/db/workout-store"
import type { CheckInRecord } from "@/types"

export const dynamic = "force-dynamic"
export const runtime = "edge"

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

function assertConfigured() {
  if (!isWorkoutStoreConfigured()) {
    return NextResponse.json({ error: "EdgeOne KV 还没有绑定" }, { status: 503 })
  }

  return null
}

export async function GET() {
  const setupError = assertConfigured()
  if (setupError) return setupError

  try {
    return NextResponse.json({ records: await getWorkouts() })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取失败" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const setupError = assertConfigured()
  if (setupError) return setupError

  const body = await request.json().catch(() => null)
  const recordsInput = Array.isArray(body?.records) ? body.records : [body]
  const records = recordsInput
    .map(normalizeRecord)
    .filter((record: CheckInRecord | null): record is CheckInRecord => Boolean(record))

  if (records.length === 0) {
    return NextResponse.json({ error: "没有有效记录" }, { status: 400 })
  }

  try {
    return NextResponse.json({ records: await createWorkouts(records) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 500 })
  }
}

export async function DELETE() {
  const setupError = assertConfigured()
  if (setupError) return setupError

  try {
    await clearWorkouts()
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "清除失败" }, { status: 500 })
  }
}
