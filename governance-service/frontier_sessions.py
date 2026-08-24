"""Server-owned lifecycle and persistence for governed frontier sessions."""

from __future__ import annotations

import json
import os
import sqlite3
import threading
from pathlib import Path

from runtime_eval.frontier.evidence import scrub_secrets
from runtime_eval.frontier.governed_result import project_session_snapshot
from runtime_eval.frontier.session import (
    FINAL_STATUSES, GovernedSessionOrchestrator, SessionStatus,
    verify_session_evidence,
)


DB_PATH = Path(os.getenv("FRONTIER_SESSION_DB_PATH",
                         "/tmp/frontier_sessions.sqlite3"))
MAX_CONCURRENT = max(1, min(int(os.getenv(
    "FRONTIER_MAX_CONCURRENT_SESSIONS", "2")), 10))


class SessionStore:
    def __init__(self, path: Path = DB_PATH):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        with self._connect() as db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS frontier_sessions (
                    session_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    snapshot TEXT NOT NULL
                )
            """)

    def _connect(self):
        return sqlite3.connect(self.path, timeout=10)

    def save(self, snapshot: dict) -> None:
        clean = scrub_secrets(snapshot)
        with self._lock, self._connect() as db:
            db.execute(
                """INSERT INTO frontier_sessions(session_id,status,snapshot)
                   VALUES(?,?,?) ON CONFLICT(session_id) DO UPDATE SET
                   status=excluded.status, snapshot=excluded.snapshot,
                   updated_at=CURRENT_TIMESTAMP""",
                (clean["session_id"], clean["status"],
                 json.dumps(clean, sort_keys=True, ensure_ascii=False)),
            )

    def get(self, session_id: str) -> dict | None:
        with self._lock, self._connect() as db:
            row = db.execute(
                "SELECT snapshot FROM frontier_sessions WHERE session_id=?",
                (session_id,),
            ).fetchone()
        return json.loads(row[0]) if row else None

    def recent(self, limit: int = 20) -> list[dict]:
        with self._lock, self._connect() as db:
            rows = db.execute(
                """SELECT snapshot FROM frontier_sessions
                   ORDER BY updated_at DESC LIMIT ?""", (limit,)).fetchall()
        return [json.loads(row[0]) for row in rows]

    def durability(self) -> dict:
        configured = "FRONTIER_SESSION_DB_PATH" in os.environ
        return {
            "backend": "sqlite",
            "configured_path": configured,
            "restart_durable": configured and str(self.path).startswith("/data/"),
            "volume_required": not (configured and str(self.path).startswith("/data/")),
        }


class SessionManager:
    def __init__(self, store: SessionStore | None = None):
        self.store = store or SessionStore()
        self.active: dict[str, GovernedSessionOrchestrator] = {}
        self.workers: dict[str, threading.Thread] = {}
        self._lock = threading.RLock()

    def _save(self, session: GovernedSessionOrchestrator) -> dict:
        snapshot = session.snapshot()
        snapshot["evidence_verified"] = (
            verify_session_evidence(snapshot) if session.is_final else None)
        try:
            cached = getattr(session, "governed_result_projection", None)
            if cached is None or not session.is_final:
                cached = project_session_snapshot(
                    snapshot,
                    boundary_mutation=getattr(
                        session, "safety_boundary_mutation", "none"),
                )
                if session.is_final:
                    session.governed_result_projection = cached
            snapshot["governed_result"] = cached
        except Exception as exc:  # evidence projection is never authoritative
            snapshot["governed_result"] = {
                "authority": "NON_AUTHORITATIVE_POST_GOVERNANCE_EVIDENCE",
                "canonical_governance": {
                    "verdict": ((snapshot.get("steps") or [{}])[-1].get(
                        "morrison_decision") or {}).get("verdict", "NOT_EXERCISED"),
                    "changed_by_projection": False,
                },
                "causal_analysis": {"status": "UNAVAILABLE"},
                "safety_envelope": {
                    "status": "UNAVAILABLE",
                    "error": f"{type(exc).__name__}: {exc}",
                    "warning": (
                        "This claim applies only to the declared tested envelope. "
                        "No safety claim is inherited outside that envelope."),
                },
            }
        self.store.save(snapshot)
        return snapshot

    def create(self, session: GovernedSessionOrchestrator) -> dict:
        with self._lock:
            running = sum(not item.is_final for item in self.active.values())
            if running >= MAX_CONCURRENT:
                raise RuntimeError("maximum concurrent frontier sessions reached")
            self.active[session.session_id] = session
            session.start()
            snapshot = self._save(session)
            self._start_worker(session)
            return snapshot

    def _start_worker(self, session: GovernedSessionOrchestrator) -> None:
        current = self.workers.get(session.session_id)
        if current and current.is_alive():
            return
        worker = threading.Thread(
            target=self._run, args=(session,), daemon=True,
            name=f"frontier-{session.session_id}")
        self.workers[session.session_id] = worker
        worker.start()

    def _run(self, session: GovernedSessionOrchestrator) -> None:
        try:
            while session.status == SessionStatus.RUNNING and session.advance():
                self._save(session)
            self._save(session)
        except Exception as exc:  # fail closed and retain a sanitized reason
            session.stop_reason = f"orchestrator_error:{type(exc).__name__}"
            session.status = SessionStatus.FAILED
            session.ended_at = session.ended_at or session.started_at
            session._seal_session()  # pylint: disable=protected-access
            self._save(session)

    def get(self, session_id: str) -> dict | None:
        with self._lock:
            session = self.active.get(session_id)
        return self._save(session) if session else self.store.get(session_id)

    def control(self, session_id: str, action: str, operator="operator") -> dict:
        with self._lock:
            session = self.active.get(session_id)
        if not session:
            raise KeyError(session_id)
        if action == "pause":
            session.pause()
        elif action == "resume":
            session.resume()
            self._start_worker(session)
        elif action == "stop":
            session.stop()
        elif action == "terminate":
            session.stop("operator_terminate", terminate=True)
        elif action in {"deny", "continue_without_action", "approve"}:
            session.review(action, operator=operator)
            if session.status == SessionStatus.RUNNING:
                self._start_worker(session)
        else:
            raise ValueError("unknown session action")
        return self._save(session)

    def recent(self, limit: int = 20) -> list[dict]:
        return self.store.recent(limit)


MANAGER = SessionManager()
