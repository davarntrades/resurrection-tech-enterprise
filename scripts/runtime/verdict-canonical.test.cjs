const assert = require('node:assert/strict');
process.env.RUNTIME_DATA_DIR = require('node:fs').mkdtempSync('/tmp/verdict-test-');
const engine = require('../../lib/runtime/engine');
const gateway = require('../../lib/runtime/gateway');
const malformed = ['NOT_ALLOWED', 'DISALLOW', 'ALLOW BLOCK', 'permit', ' ALLOW', '', null, {}, ['ALLOW'], 'PERMIT\n'];
(async () => {
 for (const value of malformed) {
  assert.equal(gateway.normVerdict(value), 'INVALID_VERDICT');
  for (const mode of ['shadow', 'enforce']) {
   engine.govern = async () => ({ok:true,json:{verdict:value}});
   const result = await gateway.govern({auth:{org:{id:'test'},environment:{id:'env',mode,kind:'sandbox'}},trajectory:[{tool:'read_account',args:{}}]});
   assert.equal(result.verdict,'BLOCK',JSON.stringify(value));
  }
 }
 for (const response of [{verdict:'BLOCK',strictest_verdict:'ALLOW'},{verdict:'ALLOW',strictest_verdict:'NOT_ALLOWED'}]) {
  engine.govern=async()=>({ok:true,json:response});
  const result=await gateway.govern({auth:{org:{id:'test'},environment:{id:'env',mode:'enforce'}},trajectory:[{tool:"read_account",args:{}}]});
  assert.equal(result.verdict,'BLOCK');
 }
 assert.equal(gateway.normVerdict('PERMIT'),'ALLOW');
 console.log('Canonical verdict and gateway veto regressions passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
