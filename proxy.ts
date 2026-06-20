import { NextResponse, type NextRequest } from "next/server";

/**
 * HTTP Basic Auth for /admin/* (internal lead dashboard). Next 16 "proxy" convention.
 * Credentials come from ADMIN_USER / ADMIN_PASSWORD. If they are not set the
 * admin area is hidden entirely (404) rather than left open.
 */
export const config = { matcher: ["/admin/:path*"] };

export function proxy(req: NextRequest) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;

  // Not configured → do not expose the admin area at all.
  if (!user || !pass) {
    return new NextResponse("Not found", { status: 404 });
  }

  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    let decoded = "";
    try { decoded = atob(encoded); } catch { decoded = ""; }
    const idx = decoded.indexOf(":");
    const u = decoded.slice(0, idx);
    const p = decoded.slice(idx + 1);
    if (idx > -1 && u === user && p === pass) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Resurrection Tech Admin", charset="UTF-8"' },
  });
}
