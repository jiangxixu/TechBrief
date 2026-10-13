import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { responseSchema } from './daily-schema.mjs';
import { canonicalUrl, primaryUrl, ageDays, searchEvidence, publicationDates, verifyPage, selectCandidates, assertGroundedEdition, CATEGORIES } from './news-policy.mjs';

test('all Schema properties explicitly declare type; count may be below five', () => {
  const walk = schema => {
    assert.ok(schema.type);
    for (const child of Object.values(schema.properties || {})) walk(child);
    if (schema.items) walk(schema.items);
  };
  walk(responseSchema('2026-10-13', 2));
  assert.equal(responseSchema('2026-10-13', 2).properties.news.maxItems, 2);
});
test('source identity removes arXiv version/path variants and tracking', () => {
  assert.equal(canonicalUrl('https://arxiv.org/pdf/2610.12345v2.pdf?download=1'), canonicalUrl('https://arxiv.org/abs/2610.12345v1'));
  assert.equal(primaryUrl('https://openai.com.attacker.example/news'), false);
  assert.equal(primaryUrl('https://192.168.1.1/news'), false);
  assert.throws(() => canonicalUrl('https://user:pass@openai.com/'));
});
test('no search or failed search cannot be treated as successful retrieval', () => {
  assert.throws(() => searchEvidence({ status: 'completed', output: [] }), /No completed/);
  assert.throws(() => searchEvidence({ status: 'incomplete', output: [] }));
  assert.throws(() => searchEvidence({ status: 'completed', output: [{ type: 'web_search_call', status: 'completed', action: { type: 'search' } }] }), /provenance/);
  const result = searchEvidence({ status: 'completed', output: [{ type: 'web_search_call', status: 'completed', action: { type: 'search', sources: [{ url: 'https://openai.com/news/a' }] } }] });
  assert.equal(result.urls.size, 1);
});
test('publication metadata excludes modification dates and detects conflicts', () => {
  assert.deepEqual(publicationDates('<script type="application/ld+json">{"dateModified":"2026-10-13"}</script>'), []);
  assert.deepEqual(publicationDates('<meta content="2026-10-12T10:00:00Z" property="article:published_time">'), ['2026-10-12']);
  assert.equal(publicationDates('<script type="application/ld+json">[{"datePublished":"2026-10-12"},{"datePublished":"2026-10-11"}]</script>').length, 2);
  assert.equal(ageDays('2026-02-30', '2026-10-13'), Infinity);
});
test('page verification rejects date mismatch, missing metadata and unsafe redirects', async () => {
  const candidate = { title: 'Example', url: 'https://openai.com/news/a', published: '2026-10-12', category: 'Agent' };
  const page = date => async () => new Response(`<meta property="article:published_time" content="${date}"><article>Source fact</article>`, { headers: { 'content-type': 'text/html' } });
  assert.equal((await verifyPage(candidate, '2026-10-13', page('2026-10-12'))).published, '2026-10-12');
  await assert.rejects(verifyPage(candidate, '2026-10-13', page('2026-10-11')), /does not match/);
  await assert.rejects(verifyPage(candidate, '2026-10-13', page('')), /Missing/);
  await assert.rejects(verifyPage(candidate, '2026-10-13', async () => new Response('', { status: 302, headers: { location: 'http://127.0.0.1' } })));
});
const candidate = (category, id, published = '2026-10-12', paper = false) => ({ category, title: id, published, evidence: 'Supported source fact', url: paper ? `https://arxiv.org/abs/2610.${id}` : `https://openai.com/news/${id}` });
test('selection balances priority domains and limits arXiv to two without padding', () => {
  const pool = CATEGORIES.map((c, i) => candidate(c, String(i)));
  assert.deepEqual(selectCandidates(pool, [], '2026-10-13').map(n => n.category), CATEGORIES);
  assert.equal(selectCandidates([1,2,3,4,5].map(i => candidate('Agent', String(i), '2026-10-12', true)), [], '2026-10-13').length, 2);
});
test('selection rejects stale/future/duplicate stories and prefers recent over supplements', () => {
  const fresh = candidate('Agent', 'fresh'), older = candidate('Agent', 'older', '2026-10-09');
  const history = [{ title: '历史中文标题', sources: [{ url: fresh.url + '?tracking=1' }] }];
  const pool = [older, fresh, candidate('无人机', 'future', '2026-10-14'), candidate('无人机', 'stale', '2026-10-01')];
  assert.equal(selectCandidates(pool, [], '2026-10-13')[0].title, 'fresh');
  assert.deepEqual(selectCandidates(pool, history, '2026-10-13').map(n => n.title), ['older']);
});
test('writer cannot introduce sources, dates, categories or duplicate events', () => {
  const c = candidate('Agent', 'x');
  const n = { sources: [{ url: c.url }], published: c.published, category: c.category };
  assertGroundedEdition({ news: [n] }, [c]);
  assert.throws(() => assertGroundedEdition({ news: [{ ...n, published: '2026-10-13' }] }, [c]));
  assert.throws(() => assertGroundedEdition({ news: [{ ...n, sources: [{ url: 'https://openai.com/invented' }] }] }, [c]));
  assert.throws(() => assertGroundedEdition({ news: [n, n] }, [c, candidate('无人机', 'y')]));
});

// Full script in an isolated fixture repo: no network, credentials, or real daily writes.
for (const scenario of ['normal', 'no_search', 'wrong_date', 'format_retry', 'existing', 'dry_run']) {
  test(`generation integration: ${scenario}`, async () => {
    const dir = await mkdtemp(resolve('.generation-test-'));
    try {
      await mkdir(resolve(dir, 'scripts')); await mkdir(resolve(dir, 'data/daily'), { recursive: true });
      for (const file of ['core.js', 'package.json', ...['generate-daily.mjs', 'api-config.mjs', 'validate.mjs', 'news-policy.mjs', 'daily-schema.mjs'].map(n => 'scripts/' + n)]) await copyFile(file, resolve(dir, file));
      const mock = `
import { readFile } from 'node:fs/promises';
const categories = ${JSON.stringify(CATEGORIES)};
const scenario = ${JSON.stringify(scenario)};
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
const date = parts.year+'-'+parts.month+'-'+parts.day;
let searches=0, writers=0;
const output = value => ({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
globalThis.fetch = async (url, options={}) => {
 if (String(url).includes('export.arxiv.org')) throw Error('fixture unavailable');
 if (options.method==='POST') {
  const body=JSON.parse(options.body);
  if(body.tools) {
   if(body.text || body.tool_choice!=='required') throw Error('Discovery must require search independently of schema');
   const category=categories[searches++], source='https://openai.com/news/item-'+searches;
   const result=output({candidates: searches>2 ? [] : [{title:'story-'+searches,category,published:date,url:source}]});
   if(scenario!=='no_search') result.output.unshift({type:'web_search_call',status:'completed',action:{type:'search',sources:[{url:source}]}});
   return Response.json(result);
  }
  writers++;
  if(scenario==='format_retry' && writers===1) return Response.json({error:{code:'invalid_json_schema'}},{status:400});
  const selected=JSON.parse(body.input.split('\\nJSON结构：')[0]).sources;
  return Response.json(output({schemaVersion:1,date,timezone:'Asia/Shanghai',generatedBy:'ChatGPT',title:'Fixture',editorialNote:'Fixture',news:selected.map((s,i)=>({id:'n-'+date.replaceAll('-','')+'-item-'+i,title:s.title,category:s.category,kind:'动态',published:s.published,summary:'Source fact',why:'Analysis',relevance:'Analysis',caveat:'Limit',tags:['test'],sources:[{name:'Official',url:s.url}]}))}));
 }
 return new Response('<meta property="article:published_time" content="'+(scenario==='wrong_date'?'2000-01-01':date)+'"><article>Source fact</article>',{headers:{'content-type':'text/html'}});
};
`;
      await writeFile(resolve(dir, 'mock.mjs'), mock);
      if (scenario === 'existing') {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(x=>[x.type,x.value]));
        const date = `${parts.year}-${parts.month}-${parts.day}`;
        await writeFile(resolve(dir, `data/daily/${date}.json`), JSON.stringify({ schemaVersion:1, date, timezone:'Asia/Shanghai', generatedBy:'ChatGPT', news:[{id:'n-fixture',title:'test',category:'Agent',summary:'fact',published:date,why:'analysis',relevance:'analysis',caveat:'limit',tags:['t'],sources:[{name:'Official',url:'https://openai.com/a'}]}] }));
      }
      const run = spawnSync(process.execPath, ['--import', './mock.mjs', 'scripts/generate-daily.mjs'], { cwd: dir, env: { ...process.env, OPENAI_API_KEY: 'fixture-not-secret', OPENAI_BASE_URL: 'https://fixture.example/v1', OPENAI_MODEL: 'fixture', FORCE_REGENERATE: 'false', DRY_RUN: String(scenario === 'dry_run'), GITHUB_STEP_SUMMARY: '' }, encoding: 'utf8' });
      const audit = JSON.parse(await readFile(resolve(dir, 'reports/generation.json')));
      if (['no_search', 'wrong_date'].includes(scenario)) { assert.equal(run.status, 1); assert.equal(audit.status, 'failed'); }
      else if (scenario === 'existing') { assert.equal(run.status, 0); assert.equal(audit.status, 'skipped_existing'); assert.equal(audit.apiCalls.length, 0); }
      else { assert.equal(run.status, 0, run.stderr); assert.equal(audit.status, scenario === 'dry_run' ? 'validated_partial' : 'published_partial'); assert.equal(audit.selected.length, 2); assert.equal(audit.searches.length, 5); if (scenario==='format_retry') assert.equal(audit.formatRetry, 'invalid_json_schema'); if(scenario==='dry_run') { const preview = JSON.parse(await readFile(resolve(dir, 'reports/edition.preview.json'))); assert.equal(preview.news.length, 2); const { readdir } = await import('node:fs/promises'); assert.deepEqual(await readdir(resolve(dir,'data/daily')), []); } }
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}
