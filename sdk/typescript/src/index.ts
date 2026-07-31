export type GuardianDecision = {
  ok: boolean;
  verdict?: "ALLOW" | "ESCALATE" | "BLOCK";
  engine_verdict?: string;
  decision_id?: string;
  evidence_id?: string;
  reason?: string;
  [key: string]: unknown;
};

export type GuardianSession = {
  id: string;
  org_id: string;
  environment_id: string;
  workflow: string;
  status: string;
  step_count: number;
  allowed_count: number;
  blocked_count: number;
  escalated_count: number;
  domains: string[];
  horizon: number;
  evidence_id?: string | null;
};

export type GuardianStep = {
  /** True only on a full permit. Never execute when false. */
  allowed: boolean;
  verdict: "allow" | "block" | "escalate";
  session_id: string | null;
  step_index: number | null;
  action_id: string;
  proposal_id: string;
  evidence_id: string | null;
  trajectory_hash: string | null;
  /** True when the accumulated trajectory, not the step itself, forced the refusal. */
  restricted_by_trajectory: boolean;
  governance_latency_ms: number;
  reason?: string | null;
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

  /**
   * Open a governed session — one workflow run. Every step evaluated inside it
   * is judged against the ACCUMULATED trajectory, so a sequence of individually
   * benign steps that together reach a forbidden state is caught.
   */
  openSession(input: { environment_id: string; workflow?: string; correlation_id?: string; domains?: string[]; horizon?: number; idempotency_key?: string }) {
    return this.request<GuardianSession>("/api/integration/v1/steps", {
      method: "POST", body: JSON.stringify({ operation: "session.open", ...input }),
    });
  }

  /**
   * Govern one workflow step. Returns BEFORE anything runs — the caller acts
   * only when `allowed` is true. A blocked or escalated step must not execute.
   *
   *   const step = await guardian.evaluateStep({
   *     session_id, action_id: "gmail.send_email", params: { ... },
   *   });
   *   if (!step.allowed) throw new Error(step.reason);
   *   await sendTheEmail();
   */
  evaluateStep(input: { session_id: string; action_id: string; params?: Record<string, unknown>; environment_id?: string }) {
    return this.request<GuardianStep>("/api/integration/v1/steps", {
      method: "POST", body: JSON.stringify({ operation: "step.evaluate", ...input }),
    });
  }

  /** Close the session and emit the immutable, replayable session evidence. */
  closeSession(sessionId: string, input: { status?: string; summary?: unknown } = {}) {
    return this.request<GuardianSession>("/api/integration/v1/steps", {
      method: "POST", body: JSON.stringify({ operation: "session.close", session_id: sessionId, ...input }),
    });
  }

  /** Re-evaluate the recorded trajectory and confirm the verdicts still hold. */
  replaySession(sessionId: string) {
    return this.request<{ session_id: string; deterministic: boolean; steps: unknown[] }>(
      `/api/integration/v1/steps?session_id=${encodeURIComponent(sessionId)}&replay=1`);
  }

  /**
   * Wrap an existing agent tool so it cannot run without a permit. This is the
   * smallest possible change to an existing agent: wrap the function once and
   * every call is governed, evidenced and replayable.
   *
   *   const send = guardian.governed(session_id, "gmail.send_email", sendEmail);
   *   await send({ to, subject, body });   // throws unless permitted
   */
  governed<A extends unknown[], R>(
    sessionId: string,
    actionId: string,
    fn: (...args: A) => Promise<R> | R,
    toParams: (...args: A) => Record<string, unknown> = () => ({}),
  ): (...args: A) => Promise<R> {
    return async (...args: A): Promise<R> => {
      const step = await this.evaluateStep({ session_id: sessionId, action_id: actionId, params: toParams(...args) });
      if (!step.allowed) {
        const error = new Error(step.reason || `${actionId} was not permitted (${step.verdict})`);
        Object.assign(error, { verdict: step.verdict, proposal_id: step.proposal_id, evidence_id: step.evidence_id, guardianStep: step });
        throw error;
      }
      return fn(...args);
    };
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
