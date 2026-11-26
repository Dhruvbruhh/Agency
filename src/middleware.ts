import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const authMiddleware = convexAuthNextjsMiddleware();

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;

  if (pathname === "/api/auth" || pathname === "/api/auth/") {
    return authMiddleware(request, event);
  }

  // Was a host rewrite in vercel.json: the ventriee.in apex serves the /ventriee pages.
  if (request.headers.get("host") === "ventriee.in") {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/ventriee" : `/ventriee${pathname}`;
    return NextResponse.rewrite(url);
  }
}

export const config = {
  // /api/auth for Convex auth; page paths (no _next, api or file extensions) for the host rewrite.
  matcher: ["/api/auth", "/((?!api|_next|.*\\..*).*)"],
};
