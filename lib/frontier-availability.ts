type ProviderName = "anthropic" | "openai" | "huggingface";
export type Provider = { provider: ProviderName; status: "READY" | "CONFIGURED" | "NOT_CONFIGURED"; model: string | null; models: string[]; missing: string[]; connectivity?: string; authentication?: string; inference?: string; model_availability?: Record<string, { availability: string; reason: string; inference: string; providers: string[] }> };
export function modelSelectable(entry: Provider | undefined, model: string) {
  return !!model && !!entry && entry.status !== "NOT_CONFIGURED" && entry.models.includes(model)
    && (entry.provider !== "huggingface" || entry.model_availability?.[model]?.availability === "AVAILABLE");
}
