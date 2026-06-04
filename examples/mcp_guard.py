#!/usr/bin/env python3
"""
MCP integration pattern.

Evaluate a tool call at the MCP client/host *before* forwarding it to the MCP
server:

    MCP client ─▶ governance check ──ALLOW──▶ MCP server (tool runs)
                                   └─BLOCK──▶ refuse (tool never forwarded)

`guard_mcp_call` is dependency-free (reuses http_generic.govern). Wire it into
your MCP client wherever you dispatch `tools/call`.
"""

from http_generic import govern


def guard_mcp_call(tool_name: str, arguments: dict, domains=None) -> None:
    """Raise if governance blocks; return None if the call may be forwarded."""
    verdict = govern([{"tool": tool_name, "args": arguments}], domains=domains)
    if verdict["blocked"]:
        rule = (verdict.get("metadata") or {}).get("rule", verdict.get("omega_domain"))
        raise PermissionError(f"MCP call blocked by governance ({rule}): {verdict['reason']}")


# --- MCP client wiring (illustrative) ------------------------------------
# async def call_tool(session, name, arguments, domains=None):
#     guard_mcp_call(name, arguments, domains)      # pre-execution gate
#     return await session.call_tool(name, arguments)   # only on ALLOW

if __name__ == "__main__":
    try:
        guard_mcp_call("exec", {"cmd": "sudo chmod 777 /etc/passwd"}, domains=["cybersecurity"])
        print("ALLOW → forwarding to MCP server")
    except PermissionError as e:
        print(e)
