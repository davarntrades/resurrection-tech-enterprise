import { NextResponse } from "next/server";
import * as ops from "@/lib/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Trace = {
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string | null;
    inferred_chain: string;
    stack: string;
  };
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
  };
  transport_error?: { message: string; stack: string };
};

function safeHeaders(headers: HeadersInit | undefined) {
  const out: Record<string, string> = {};
  const h = new Headers(headers || {});
  for (const [k, v] of h.entries()) {
    out[k] = /authorization|apikey|cookie/i.test(k) ? "[REDACTED]" : v;
  }
  return out;
}

function inferChain(method: string, url: string) {
  const u = new URL(url);
  const select = u.searchParams.get("select");
  const id = u.searchParams.get("id");
  if (method === "POST") return `supabase.from(\"rg_ops_runs\").insert(record)${select ? `.select(${JSON.stringify(select)})` : ""}`;
  if (method === "PATCH") return `supabase.from(\"rg_ops_runs\").update(patch)${id ? `.eq(\"id\", ${JSON.stringify(id.replace(/^eq\./, ""))})` : ""}${select ? `.select(${JSON.stringify(select)})` : ""}`;
  if (method === "GET") return `supabase.from(\"rg_ops_runs\").select(${JSON.stringify(select || "*")})`;
  return `${method} public.rg_ops_runs`;
}

export async function GET() {
  const originalFetch = globalThis.fetch;
  const traces: Trace[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const url = request ? request.url : String(input);
    const method = String(init?.method || request?.method || "GET").toUpperCase();
    const targeted = /\/rest\/v1\/rg_ops_runs(?:\?|$)/.test(url);

    if (!targeted) return originalFetch(input, init);

    const body = typeof init?.body === "string" ? init.body : null;
    const trace: Trace = {
      request: {
        method,
        url,
        headers: safeHeaders(init?.headers || request?.headers),
        body,
        inferred_chain: inferChain(method, url),
        stack: new Error("rg_ops_runs PostgREST request origin").stack || "",
      },
    };
    traces.push(trace);

    try {
      const response = await originalFetch(input, init);
      trace.response = {
        status: response.status,
        statusText: response.statusText,
        headers: safeHeaders(response.headers),
        body: await response.clone().text(),
      };
      return response;
    } catch (error: any) {
      trace.transport_error = { message: error?.message || String(error), stack: error?.stack || "" };
      throw error;
    }
  }) as typeof fetch;

  try {
    const result = await (ops.agents as any).dispatch({ trigger: "postgrest_trace" });
    return NextResponse.json({ ok: !result?.error, result, traces });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: { message: error?.message || String(error), stack: error?.stack || "" },
      traces,
    }, { status: 500 });
  } finally {
    globalThis.fetch = originalFetch;
  }
}
