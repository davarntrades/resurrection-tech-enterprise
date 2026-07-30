"use strict";

const recorded = (value) => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);

module.exports = function customerSupportDashboard(rows, clock = new Date()) {
  const start = new Date(clock);
  start.setHours(0, 0, 0, 0);
  const todays = rows.filter((row) => Date.parse(row.created_at) >= start.getTime());
  const average = (field, predicate = () => true) => {
    const values = todays.filter(predicate).map((row) => recorded(row[field])).filter((value) => value != null);
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  };
  return {
    requests_today: todays.length,
    completed: todays.filter((row) => row.status === "completed").length,
    blocked: todays.filter((row) => row.status === "blocked" || row.status === "rejected").length,
    escalated: todays.filter((row) => row.status === "awaiting_approval").length,
    average_total_latency_ms: average("total_latency_ms"),
    average_governance_latency_ms: average("governance_latency_ms"),
    average_provider_latency_ms: average("provider_latency_ms", (row) => Number(row.provider_invocation_count || 0) > 0),
  };
};