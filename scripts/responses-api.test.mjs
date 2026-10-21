import test from 'node:test';
import assert from 'node:assert/strict';
import { callResponsesApi } from './responses-api.mjs';

const config = { apiKey: 'fixture-secret', responsesUrl: 'https://fixture.example/responses' };
for (const status of [400, 429, 503]) {
  test(`retries transient HTTP ${status} without changing search request`, async () => {
    const audit = { apiCalls: [] }, requests = [], delays = [];
    const result = await callResponsesApi(config, { tools: [{ type: 'web_search' }] }, audit, {
      sleep: async ms => delays.push(ms),
      fetchImpl: async (url, options) => {
        requests.push(options);
        return requests.length === 1 ? Response.json({ error: { message: 'upstream temporarily unavailable fixture-secret' } }, { status, headers: { 'retry-after': '3' } }) : Response.json({ status: 'completed' });
      }
    });
    assert.equal(result.status, 'completed');
    assert.equal(requests[0].body, requests[1].body);
    assert.equal(requests[0].signal, requests[1].signal);
    assert.deepEqual(delays, [3000]);
    assert.equal(audit.apiCalls.length, 2);
    assert.equal(JSON.stringify(audit).includes(config.apiKey), false);
  });
}
test('permanent schema, quota, authentication and unsupported errors fail immediately', async () => {
  for (const [status, error] of [
    [400, { code: 'invalid_json_schema' }], [400, { message: 'insufficient quota' }],
    [401, { code: 'invalid_api_key' }], [400, { message: 'unsupported parameter' }]
  ]) {
    const audit = { apiCalls: [] };
    await assert.rejects(callResponsesApi(config, {}, audit, { fetchImpl: async () => Response.json({ error }, { status }), sleep: async () => assert.fail('must not retry') }));
    assert.equal(audit.apiCalls.length, 1);
  }
});
test('gateway failures stop after two attempts and redact response bodies', async () => {
  const audit = { apiCalls: [] };
  await assert.rejects(callResponsesApi(config, {}, audit, { fetchImpl: async () => Response.json({ error: { message: config.apiKey } }, { status: 400 }), sleep: async () => {} }), error => !error.message.includes(config.apiKey));
  assert.equal(audit.apiCalls.length, 2);
});
test('network failures can recover on the second attempt', async () => {
  let calls = 0;
  const audit = { apiCalls: [] };
  const result = await callResponsesApi(config, {}, audit, { fetchImpl: async () => { if (++calls === 1) throw Error('fetch failed'); return Response.json({ status: 'completed' }); }, sleep: async () => {} });
  assert.equal(result.status, 'completed');
  assert.equal(audit.apiCalls[0].classification, 'network_error');
});
