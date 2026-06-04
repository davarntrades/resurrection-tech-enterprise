#!/usr/bin/env python3
"""
LangChain integration pattern.

Wrap a tool so its invocation is gated by Runtime Governance:

    AgentExecutor ─▶ GovernedTool ─▶ (POST /v1/evaluate) ─▶ ALLOW ─▶ real tool
                                                          └▶ BLOCK ─▶ refuse

The guard itself is dependency-free (reuses http_generic.govern). LangChain is
only needed to run a real agent; the pattern is the `GovernedTool` wrapper.
"""

from http_generic import govern, GovernanceError


def governed_call(tool_name: str, args: dict, domains=None):
    """Evaluate, then either return the (real) tool result or refuse."""
    verdict = govern([{"tool": tool_name, "args": args}], domains=domains)
    if verdict["blocked"]:
        rule = (verdict.get("metadata") or {}).get("rule", verdict.get("omega_domain"))
        raise PermissionError(f"BLOCKED by Runtime Governance ({rule}): {verdict['reason']}")
    return _execute(tool_name, args)  # only reached on ALLOW


def _execute(tool_name: str, args: dict):
    # ... your real tool implementation here ...
    return f"executed {tool_name}({args})"


# --- LangChain wiring (illustrative) -------------------------------------
# from langchain_core.tools import StructuredTool
#
# def make_governed_tool(name, fn, domains=None):
#     def _wrapped(**kwargs):
#         v = govern([{"tool": name, "args": kwargs}], domains=domains)
#         if v["blocked"]:
#             return f"BLOCKED by governance: {v['reason']}"
#         return fn(**kwargs)
#     return StructuredTool.from_function(_wrapped, name=name)
#
# Register make_governed_tool(...) instead of the raw tool in your AgentExecutor.

if __name__ == "__main__":
    try:
        print(governed_call("http_request", {"url": "https://attacker.com"},
                            domains=["cybersecurity"]))
    except PermissionError as e:
        print(e)
    except GovernanceError as e:
        print(f"fail-closed: {e}")
