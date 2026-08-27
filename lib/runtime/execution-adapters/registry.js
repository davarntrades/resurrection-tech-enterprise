"use strict";

const { UnknownAdapterError } = require("./errors");

function createRegistry(gate) {
  const adapters = new Map();
  return Object.freeze({
    register(adapter) {
      const guarded = gate.guard(adapter);
      if (adapters.has(guarded.id)) throw new Error(`execution adapter already registered: ${guarded.id}`);
      adapters.set(guarded.id, guarded);
      return guarded;
    },
    get(id) {
      const adapter = adapters.get(String(id || ""));
      if (!adapter) throw new UnknownAdapterError(id);
      return adapter;
    },
    has(id) { return adapters.has(String(id || "")); },
    list() { return [...adapters.values()]; },
  });
}

module.exports = { createRegistry };
