"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function FrontierReviewerLoginClient() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/runtime/admin/login", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      if (data?.role !== "reviewer") {
        throw new Error("This entry point only accepts the scoped reviewer credential.");
      }
      router.replace("/lab");
      router.refresh();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flab">
      <form className="flab-login" onSubmit={submit}>
        <span>Ω</span>
        <h1>Frontier Containment Lab</h1>
        <p>External reviewer access. This credential is scoped to Frontier experiments and does not grant Control Room or admin access.</p>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Reviewer password"
          autoFocus
          autoComplete="current-password"
        />
        {error && <div className="flab-error">{error}</div>}
        <button className="flab-run" disabled={busy || !password}>
          {busy ? "SIGNING IN…" : "ENTER REVIEWER LAB"}
        </button>
      </form>
    </main>
  );
}
