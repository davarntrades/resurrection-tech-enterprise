import type { NextRequest } from "next/server";
import * as rt from "@/lib/runtime";
import * as reviewerAuth from "@/lib/frontier-reviewer-auth";

export type FrontierAccess =
  | { ok: true; role: "operator"; identity: string; via: string }
  | { ok: true; role: "reviewer"; identity: string; via: "reviewer-session" }
  | { ok: false; role: null; identity: null; via: null };

export function authorizeFrontier(req: NextRequest): FrontierAccess {
  const operator = rt.adminauth.authorize({
    sessionToken: req.cookies.get(rt.adminauth.SESSION_COOKIE)?.value,
    adminKey: req.headers.get("x-admin-key") || undefined,
  });
  if (operator.ok) {
    return {
      ok: true,
      role: "operator",
      identity: operator.identity || "operator",
      via: operator.via || "session",
    };
  }

  const reviewer = reviewerAuth.verifyToken(req.cookies.get(reviewerAuth.SESSION_COOKIE)?.value);
  if (reviewer) {
    return { ok: true, role: "reviewer", identity: reviewer.sub, via: "reviewer-session" };
  }

  return { ok: false, role: null, identity: null, via: null };
}

export function reviewerGrantToken(req: NextRequest) {
  return req.cookies.get(reviewerAuth.SESSION_GRANTS_COOKIE)?.value;
}

export { reviewerAuth };
