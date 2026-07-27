"use strict";

const store = require("./store");
const governed = require("./customer-support-governed-workflow");
const dashboard = require("./customer-support-dashboard");

async function createExecution(input) {
  const run = await governed.createExecution(input);
  if (run && (run.aws_called == null || run.provider_invocation_count == null)) {
    await store.update("customer_support_workflow_runs", run.id, {
      aws_called: false,
      provider_invocation_count: Number(run.provider_invocation_count || 0),
      updated_at: store.nowISO(),
    });
    return governed.safe(await store.findOne("customer_support_workflow_runs", { id: run.id }));
  }
  return run;
}

module.exports = { ...governed, createExecution, dashboard };