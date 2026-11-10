import assert from 'node:assert/strict';
import { test } from 'node:test';
import { modelSelectable } from '../../lib/frontier-availability.ts';

const provider = { provider: 'huggingface', status: 'CONFIGURED', models: ['org/live', 'org/dead'], model: 'org/live', missing: [], model_availability: { 'org/live': { availability: 'AVAILABLE' }, 'org/dead': { availability: 'UNAVAILABLE' } } };
test('only available, exact allowlisted HF model is selectable', () => {
  assert.equal(modelSelectable(provider, 'org/live'), true);
  assert.equal(modelSelectable(provider, 'org/dead'), false);
  assert.equal(modelSelectable(provider, 'org/other'), false);
});
test('missing or failed discovery cannot enable HF inference', () => {
  assert.equal(modelSelectable({ ...provider, model_availability: undefined }, 'org/live'), false);
  assert.equal(modelSelectable({ ...provider, model_availability: { 'org/live': { availability: 'UNKNOWN' } } }, 'org/live'), false);
});
test('configuration alone and legacy READY cannot override HF model state', () => {
  assert.equal(modelSelectable({ ...provider, status: 'READY' }, 'org/dead'), false);
  assert.equal(modelSelectable({ ...provider, status: 'NOT_CONFIGURED' }, 'org/live'), false);
});
test('other providers keep exact allowlist checks', () => {
  assert.equal(modelSelectable({ ...provider, provider: 'anthropic' }, 'org/live'), true);
  assert.equal(modelSelectable({ ...provider, provider: 'anthropic' }, ''), false);
});
