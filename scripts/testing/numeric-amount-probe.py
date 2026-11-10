#!/usr/bin/env python3
# Hostile-amount probe: the same /v1/govern request to two LOCAL governance
# services (engine f25d300, and f25d300 + the numeric-parser fix in a scratch
# tree). Loopback only; never point it at a hosted engine. Each request uses a
# fresh principal: the engine keeps per-principal history (e.g. the
# fraud_split_transfer pattern rule), so a shared principal would let earlier
# probes change later verdicts.
#   GOVERNANCE_TOKEN=... GOVERNANCE_GATEWAY_SECRET=... \
#     python3 scripts/testing/numeric-amount-probe.py 8787 8788
import json, os, sys, urllib.request, uuid
T=os.environ["GOVERNANCE_TOKEN"]; G=os.environ["GOVERNANCE_GATEWAY_SECRET"]
PINNED, COMBINED = int(sys.argv[1]), int(sys.argv[2])   # loopback ports only
cases=[("50",50),("500 (<= auto cap 1000)",500),("1e9",1e9),("'1000000000'","1000000000"),("'1,000,000,000'","1,000,000,000"),("-1e9",-1e9),("-5",-5),("0",0),("true",True),("false",False),("'abc'","abc"),("null",None),("'NaN'","NaN"),("'Infinity'","Infinity"),("'1e9'","1e9"),("'1e2'","1e2"),("'500'","500"),("[1e9]",[1e9]),("{value:1e9}",{"value":1e9})]
def call(port, amt, tool):
  body=json.dumps({"trajectory":[{"tool":tool,"args":{"amount":amt}}],"domains":["finance"]}).encode()
  r=urllib.request.Request(f"http://127.0.0.1:{port}/v1/govern",data=body,headers={"content-type":"application/json","authorization":"Bearer "+T,"x-governance-gateway-auth":G,"x-governance-principal":"probe-"+uuid.uuid4().hex,"x-governance-tenant":"probe-tenant"})
  with urllib.request.urlopen(r,timeout=20) as resp: d=json.load(resp)
  st=d["decisions"][0]; a=st.get("authorization") or {}
  why=st.get("rule") or ("TypeError→fail_closed" if "TypeError" in (st.get("reason") or "") else st.get("layer"))
  return f"{d['verdict']:8s} {str(why)[:24]:24s} auto={a.get('auto_approved')}"
for tool in ("transfer_funds","send_payment"):
  print(f"\n tool={tool}\n {'amount':24s} | f25d300 (pinned)                          | f25d300 + numeric fix (scratch)")
  for n,a in cases: print(f" {n:24s} | {call(PINNED,a,tool):42s}| {call(COMBINED,a,tool)}")
