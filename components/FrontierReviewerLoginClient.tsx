"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function FrontierReviewerLoginClient() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const enter = async () => {
      setError("");
      try {
        const response = await fetch("/api/frontier/reviewer/session", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "content-type": "application/json" },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
        if (!cancelled) {
          router.replace("/lab");
          router.refresh();
        }
      } catch (reason) {
        if (!cancelled) setError((reason as Error).message);
      }
    };
    void enter();
    return () => { cancelled = true; };
  }, [attempt, router]);

  return (
    <main className="flab">
      <section className="flab-login" aria-live="polite">
        <span>Ω</span>
        <h1>Frontier Containment Lab</h1>
        <p>External reviewer access. This session is scoped to Frontier experiments and does not grant Control Room or admin access.</p>
        {!error ? (
          <div className="flab-muted">Opening reviewer lab…</div>
        ) : (
          <>
            <div className="flab-error">{error}</div>
            <button className="flab-run" onClick={() => setAttempt((value) => value + 1)}>
              RETRY REVIEWER ACCESS
            </button>
          </>
        )}
      </section>
    </main>
  );
}
