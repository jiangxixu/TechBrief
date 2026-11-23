import test from 'node:test';
import assert from 'node:assert/strict';
import { callResponsesApi } from './responses-api.mjs';
import { messagesSearchEvidence } from './messages-api.mjs';
import { getApiConfig } from './api-config.mjs';
import { searchEvidence, assembleEdition } from './news-policy.mjs';
import { responseSchema } from './daily-schema.mjs';

const config = { apiKey: 'fixture-secret', model: 'claude-sonnet-4-6', protocol: 'anthropic', messagesUrl: 'https://fixture.example/v1/messages' };
const message = content => ({ type:'message', id:'msg-fixture', stop_reason:'end_turn', content });
const result = { type:'web_search_tool_result', tool_use_id:'search-1', content:[{ type:'web_search_result', url:'https://nvidia.com/news/article', title:'A real source', page_age:'2026-11-15' }] };
const call = { type:'server_tool_use', name:'web_search', id:'search-1', input:{query:'official release'} };

test('Claude search results are normalized and synthesized without inventing provenance', async () => {
  const requests = [], audit = { apiCalls:[] };
  const output = await callResponsesApi(config, { model:config.model, max_output_tokens:5000, tools:[{type:'web_search'}],
    instructions:'Today is 2026-11-16. Return candidate JSON.', input:'Search Agent: AI agents official release. Return dated primary articles, not homepages.' }, audit, {
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body); requests.push(body);
      assert.equal(url, config.messagesUrl);
      assert.equal(options.headers['x-api-key'], config.apiKey);
      assert.equal(options.headers.Authorization, undefined);
      return Response.json(requests.length === 1 ? message([{type:'text',text:'I will search.'},call,result]) : message([{type:'text',text:'{"candidates":[]}'}]));
    }
  });
  assert.equal(requests.length,2);
  assert.equal(requests[0].tools[0].type,'web_search_20250305');
  assert.match(requests[0].messages[0].content,/after:2026-11-09 before:2026-11-17/);
  assert.equal(requests[1].tools,undefined);
  assert.match(requests[1].messages[0].content,/nvidia.com\/news\/article/);
  assert.ok(searchEvidence(output).urls.has('https://nvidia.com/news/article'));
  assert.equal(output.output.at(-1).content[0].text,'{"candidates":[]}');
  assert.equal(audit.discoverySynthesisCalls,1);
});

test('Claude search accepts direct JSON with associated server results', async () => {
  const audit={apiCalls:[]};
  const output=await callResponsesApi(config,{input:'Search',tools:[{}]},audit,{ fetchImpl:async()=>Response.json(message([call,result,{type:'text',text:'{"candidates":[]}'}])) });
  assert.equal(audit.apiCalls.length,1);
  assert.equal(searchEvidence(output).calls.length,1);
});

test('search errors, ordinary text and mismatched tool results do not establish retrieval', () => {
  assert.throws(()=>messagesSearchEvidence(message([{type:'text',text:'I searched.'}])));
  assert.throws(()=>messagesSearchEvidence(message([call,{...result,tool_use_id:'unrelated'}])));
  assert.throws(()=>messagesSearchEvidence(message([call,{...result,content:{type:'web_search_tool_result_error',error_code:'unavailable'}}])));
  assert.equal(messagesSearchEvidence(message([call,{...result,tool_use_id:undefined}])).length,1);
  assert.throws(()=>messagesSearchEvidence(message([call,{...call,id:'search-2'},{...result,tool_use_id:undefined}])));
});

test('truncated Claude responses fail and writer uses the verified-source schema', async () => {
  const audit={apiCalls:[]};
  await assert.rejects(callResponsesApi(config,{input:'write'},audit,{fetchImpl:async()=>Response.json({...message([]),stop_reason:'max_tokens'})}),/incomplete/);
  const output=await callResponsesApi(config,{input:'verified source facts',text:{format:{schema:responseSchema('2026-11-16',1,'Claude')}}},audit,{
    fetchImpl:async(url,options)=>{
      const body=JSON.parse(options.body);
      assert.equal(body.tools,undefined); assert.match(body.system,/Claude/);
      return Response.json(message([{type:'text',text:'{"news":[]}'}]));
    }
  });
  assert.equal(output.status,'completed');
  assert.equal(assembleEdition({news:[]},'2026-11-16',[],'Claude').generatedBy,'Claude');
});

test('API protocol inference preserves old integrations and selects Messages for Claude', () => {
  const names=['OPENAI_API_KEY','OPENAI_MODEL','OPENAI_BASE_URL','AI_API_PROTOCOL'];
  const prior=Object.fromEntries(names.map(k=>[k,process.env[k]]));
  try {
    process.env.OPENAI_API_KEY='fixture'; process.env.OPENAI_MODEL='claude-sonnet-4-6'; process.env.OPENAI_BASE_URL='https://fixture.example/v1'; delete process.env.AI_API_PROTOCOL;
    assert.equal(getApiConfig().messagesUrl,'https://fixture.example/v1/messages');
    process.env.OPENAI_MODEL='fixture';
    assert.equal(getApiConfig().responsesUrl,'https://fixture.example/v1/responses');
    process.env.AI_API_PROTOCOL='anthropic'; process.env.OPENAI_BASE_URL='https://fixture.example/v1/responses';
    assert.throws(getApiConfig,/protocol/);
  } finally { for(const name of names) if(prior[name]===undefined) delete process.env[name]; else process.env[name]=prior[name]; }
});

test('Chinese gateway quota errors are classified without exposing provider payloads', async () => {
  const audit={apiCalls:[]};
  await assert.rejects(callResponsesApi(config,{input:'write'},audit,{
    fetchImpl:async()=>Response.json({error:{type:'new_api_error',message:'令牌额度不足 fixture-secret'}},{status:403})
  }),error=>error.classification==='quota' && error.code==='quota' && !error.message.includes(config.apiKey));
  assert.equal(audit.apiCalls.length,1);
  assert.equal(JSON.stringify(audit).includes(config.apiKey),false);
});
