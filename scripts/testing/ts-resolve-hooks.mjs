/**
 * Module resolution hooks so plain `node` test scripts can import the app's
 * TypeScript modules directly (Node strips the types; it just needs help with
 * the extensionless and `@/`-aliased specifiers Next resolves for us).
 */
export async function resolve(specifier, context, nextResolve) {
  let spec = specifier;
  if (spec.startsWith("@/")) spec = "../../" + spec.slice(2);
  try {
    return await nextResolve(spec, context);
  } catch (err) {
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      try { return await nextResolve(spec + ext, context); } catch { /* try next */ }
    }
    throw err;
  }
}
