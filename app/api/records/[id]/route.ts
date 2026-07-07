import { NextResponse } from "next/server"
import { deleteWorkout, isWorkoutStoreConfigured, updateWorkout } from "@/lib/db/workout-store"

export const dynamic = "force-dynamic"
export const runtime = "edge"

interface Params {
  params: Promise<{ id: string }>
}

function assertConfigured() {
  if (!isWorkoutStoreConfigured()) {
    return NextResponse.json({ error: "EdgeOne KV 还没有绑定" }, { status: 503 })
  }

  return null
}

export async function PATCH(request: Request, { params }: Params) {
  const setupError = assertConfigured()
  if (setupError) return setupError

  const { id } = await params
  const body = await request.json().catch(() => null)
  const updates: Record<string, unknown> = {}

  if (typeof body?.date === "string") updates.date = body.date
  if (typeof body?.duration === "number" && body.duration > 0) updates.duration = body.duration

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "没有有效更新" }, { status: 400 })
  }

  try {
    const record = await updateWorkout(id, updates)
    if (!record) return NextResponse.json({ error: "记录不存在" }, { status: 404 })

    return NextResponse.json({ record })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新失败" }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const setupError = assertConfigured()
  if (setupError) return setupError

  const { id } = await params
  try {
    await deleteWorkout(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除失败" }, { status: 500 })
  }
}
