import { NextResponse } from "next/server"
import { isAuthConfigured } from "@/lib/auth"
import { isWorkoutStoreConfigured } from "@/lib/db/workout-store"

export const dynamic = "force-dynamic"
export const runtime = "edge"

export async function GET() {
  return NextResponse.json({
    cloudEnabled: isWorkoutStoreConfigured(),
    authEnabled: isAuthConfigured(),
  })
}
