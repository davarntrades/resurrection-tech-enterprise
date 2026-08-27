"use strict";

class ExecutionAdapterError extends Error {
  constructor(message, { code = "ADAPTER_ERROR", status = 400, executionMayHaveOccurred = false, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "ExecutionAdapterError";
    this.code = code;
    this.status = status;
    this.executionMayHaveOccurred = executionMayHaveOccurred;
  }
}

class AuthorizationInvariantError extends ExecutionAdapterError {
  constructor(message = "NO_EXTERNAL_EXECUTION_WITHOUT_A_VALID_MORRISON_ALLOW_DECISION") {
    super(message, { code: "MORRISON_AUTHORIZATION_REQUIRED", status: 403 });
    this.name = "AuthorizationInvariantError";
  }
}

class UnknownAdapterError extends ExecutionAdapterError {
  constructor(id) { super(`unknown execution adapter: ${id}`, { code: "UNKNOWN_ADAPTER", status: 400 }); }
}

class InvalidAdapterConfigurationError extends ExecutionAdapterError {
  constructor(errors) {
    const list = Array.isArray(errors) ? errors : [String(errors || "invalid adapter configuration")];
    super(list.join("; "), { code: "INVALID_ADAPTER_CONFIGURATION", status: 400 });
    this.validationErrors = list;
  }
}

module.exports = { ExecutionAdapterError, AuthorizationInvariantError, UnknownAdapterError, InvalidAdapterConfigurationError };
