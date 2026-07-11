import { NextResponse, type NextRequest } from "next/server"
import { AUTH_COOKIE, getAuthToken, isAuthConfigured } from "@/lib/auth"

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/session", "/api/config", "/manifest.json", "/favicon.ico"]

function isPublicPath(pathname: string) {
  return (
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/placeholder")
  )
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (isPublicPath(pathname) || !isAuthConfigured()) return NextResponse.next()

  const token = await getAuthToken()
  if (token && request.cookies.get(AUTH_COOKIE)?.value === token) return NextResponse.next()

  const loginUrl = new URL("/login", request.url)
  loginUrl.searchParams.set("next", pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ["/((?!.*\\..*).*)", "/api/:path*"],
}
