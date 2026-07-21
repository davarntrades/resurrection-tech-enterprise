/** Secret-safe deployment diagnostic for the Operations Control Room.
 * Reports only which environment-variable names are selected, the parsed
 * Supabase host/project ref, runtime schema, and Vercel deployment identity.
 * Never returns keys, tokens, or complete environment-variable values. */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function firstPresent(names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return { name, value };
  }
  return { name: null, value: null };
}

function safeSupabaseIdentity(raw: string | null) {
  if (!raw) return { host: null, project_ref: null, valid_url: false };
  try {
    const host = new URL(raw).hostname;
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return { host, project_ref: match?.[1] || null, valid_url: true };
  } catch {
    return { host: null, project_ref: null, valid_url: false };
  }
}

export async function GET() {
  // Mirrors the current runtime-store implementation exactly.
  const runtimeUrl = firstPresent(["NEXT_PUBLIC_SUPABASE_URL"]);
  const runtimeKey = firstPresent(["SUPABASE_SERVICE_ROLE_KEY"]);

  // Also report whether supported aliases exist, without exposing values.
  const available = {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SECRET_KEY: !!process.env.SUPABASE_SECRET_KEY,
  };

  return NextResponse.json({
    ok: true,
    supabase: {
      ...safeSupabaseIdentity(runtimeUrl.value),
      schema: "public",
      url_variable_selected: runtimeUrl.name,
      key_variable_selected: runtimeKey.name,
      available_variables: available,
    },
    deployment: {
      environment: process.env.VERCEL_ENV || null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
      project: process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || null,
    },
  });
}
