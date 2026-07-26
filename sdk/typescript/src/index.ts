export type GuardianDecision = {
  ok: boolean;
  verdict?: "ALLOW" | "ESCALATE" | "BLOCK";
  engine_verdict?: string;
  decision_id?: string;
  evidence_id?: string;
  reason?: string;
  [key: string]: unknown;
};

export type GuardianClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
};

export type BedrockActionInput = {
  connector_id: string;
  environment_id: string;
  event: Record<string, unknown>;
};

export type BedrockInvocationInput = {
  connector_id: string;
  environment_id: string;
  request: {
    model_id?: string;
    inference_profile?: string;
    mode?: "converse" | "invoke";
    messages?: unknown[];
    body?: unknown;
    system?: unknown[];
    inference_config?: Record<string, unknown>;
    tool_config?: Record<string, unknown>;
    stream?: boolean;
  };
};

export class GuardianOS {
  readonly baseUrl: string;
  readonly integrations: {
    bedrock: {
      evaluateAction: (input: BedrockActionInput) => Promise<any>;
      invokeModel: (input: BedrockInvocationInput) => Promise<any>;
      handleActionGroup: (input: BedrockActionInput) => Promise<any>;
      getHealth: (connectorId?: string) => Promise<any>;
    };
  };
  private readonly apiKey: string;
  private readonly fetcher: typeof globalThis.fetch;

  constructor(options: GuardianClientOptions) {
    if (!options.apiKey) throw new Error("GuardianOS apiKey is required");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || "https://resurrection-tech.com").replace(/\/$/, "");
    this.fetcher = options.fetch || globalThis.fetch;
    const actionGroup = (input: BedrockActionInput) => this.request("/api/integration/v1/bedrock", {
      method: "POST", body: JSON.stringify({ operation: "action_group", ...input }),
    });
    this.integrations = {
      bedrock: {
        evaluateAction: actionGroup,
        invokeModel: (input: BedrockInvocationInput) => this.request("/api/integration/v1/bedrock", {
          method: "POST", body: JSON.stringify({ operation: "invoke", ...input }),
        }),
        handleActionGroup: actionGroup,
        getHealth: (connectorId?: string) => this.request(
          `/api/integration/v1/bedrock${connectorId ? `?connector_id=${encodeURIComponent(connectorId)}` : ""}`),
      },
    };
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "authorization": `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        "x-guardian-sdk": "typescript/0.1.0",
        ...(init.headers || {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || `GuardianOS request failed (${response.status})`);
      Object.assign(error, { status: response.status, body });
      throw error;
    }
    return body as T;
  }

  evaluate(input: { trajectory: unknown[]; domains?: string[]; horizon?: number; label?: string; agent?: string; correlation_id?: string }) {
    return this.request<GuardianDecision>("/api/runtime/evaluate", { method: "POST", body: JSON.stringify(input) });
  }

  propose(action: string, args: Record<string, unknown> = {}, options: { domains?: string[]; correlation_id?: string } = {}) {
    return this.evaluate({
      trajectory: [{ tool: action, args }],
      domains: options.domains,
      correlation_id: options.correlation_id,
      label: `proposal:${action}`,
    });
  }

  submitEvidence(environmentId: string, evidence: unknown, type = "customer.evidence") {
    return this.request("/api/integration/v1/evidence", {
      method: "POST", body: JSON.stringify({ environment_id: environmentId, evidence, type }),
    });
  }

  getDecision(decisionId: string) {
    return this.request<{ decision: GuardianDecision }>(`/api/integration/v1/decisions/${encodeURIComponent(decisionId)}`);
  }

  getOrganisation() {
    return this.request("/api/integration/v1/organisation");
  }

  createDeployment(input: { environment_id: string; name?: string; target?: string; model?: string; version?: string }) {
    return this.request("/api/integration/v1/deployments", { method: "POST", body: JSON.stringify(input) });
  }

  submitRuntimeEvent(input: { type: string; data?: Record<string, unknown>; domains?: string[]; correlation_id?: string }) {
    return this.evaluate({
      trajectory: [{ tool: input.type, args: input.data || {} }],
      domains: input.domains, correlation_id: input.correlation_id, label: `runtime-event:${input.type}`,
    });
  }

  retrieveAuditTrail(limit = 100) {
    return this.request(`/api/integration/v1/evidence?limit=${Math.max(1, Math.min(500, limit))}`);
  }
}

export default GuardianOS;
