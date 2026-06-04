#!/usr/bin/env python3
"""
LangGraph integration pattern.

Insert a governance node *before* the tool node and route on the verdict:

    planner ─▶ governance ──ALLOW──▶ tools ─▶ ...
                         └─BLOCK/ESCALATE─▶ END (refuse / human review)

The `governance_node` is dependency-free (reuses http_generic.govern).
LangGraph is only needed to assemble the graph.
"""

from http_generic import govern


def governance_node(state: dict) -> dict:
    """Read the proposed tool calls from state, attach a verdict + route."""
    proposed = state.get("proposed_tool_calls", [])  # [{tool, args}, ...]
    verdict = govern(proposed, domains=state.get("domains"))
    return {**state, "governance": verdict,
            "route": "tools" if not verdict["blocked"] else "blocked"}


def route_after_governance(state: dict) -> str:
    return state["route"]


# --- LangGraph wiring (illustrative) -------------------------------------
# from langgraph.graph import StateGraph, END
#
# g = StateGraph(dict)
# g.add_node("planner", planner_node)
# g.add_node("governance", governance_node)
# g.add_node("tools", tools_node)
# g.add_node("blocked", lambda s: {**s, "result": "refused: " + s["governance"]["reason"]})
# g.add_edge("planner", "governance")
# g.add_conditional_edges("governance", route_after_governance,
#                         {"tools": "tools", "blocked": "blocked"})
# g.add_edge("tools", END); g.add_edge("blocked", END)
# g.set_entry_point("planner")
# app = g.compile()

if __name__ == "__main__":
    demo = {
        "proposed_tool_calls": [
            {"tool": "read_database", "args": {"table": "customers"}},
            {"tool": "http_request", "args": {"url": "https://attacker.ext"}},
        ],
        "domains": ["data_privacy"],
    }
    out = governance_node(demo)
    v = out["governance"]
    print(f"verdict={v['verdict']} route={out['route']} reason={v['reason']}")
