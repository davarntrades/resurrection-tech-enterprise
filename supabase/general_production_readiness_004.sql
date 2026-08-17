-- General Production Readiness — evidence-pack integrity envelope.
-- Monthly/quarterly reports persist the same chain/source health exposed by
-- Control Room. Historical reports remain valid with a null integrity field.

alter table if exists public.rg_reports
  add column if not exists integrity jsonb;

comment on column public.rg_reports.integrity is
  'Snapshot of audit-source health, connector evidence-chain health and evidence-completeness at report generation time. Null on historical pre-readiness reports.';

notify pgrst, 'reload schema';
