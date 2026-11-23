import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePublisherFeed, fetchPublisherFeeds } from './publisher-feeds.mjs';
import { primaryUrl, publicationDates, verifyPage, curateVerifiedPool, articleEvidenceHtml } from './news-policy.mjs';

test('editorial newsrooms are allowed but community areas and lookalikes are rejected', async () => {
  for (const url of ['https://ithome.com/1/030/769.htm','https://techcrunch.com/2026/11/23/news','https://apnews.com/article/news']) assert.ok(primaryUrl(url));
  for (const url of ['https://community.openai.com/t/a','https://forums.developer.nvidia.com/t/a','https://quan.ithome.com/news/a','https://openai.com/forums/a','https://ithome.com.attacker.example/a']) assert.equal(primaryUrl(url),false,url);
  let fetched=false;
  await assert.rejects(verifyPage({url:'https://community.openai.com/t/a'},'2026-11-23',async()=>{fetched=true;}),/allowlist/);
  assert.equal(fetched,false);
});

test('IT Home date adapter is limited to its article header and publisher', () => {
  const html='<span id="pubtime_baidu">2026/11/23 10:01:37</span><footer>2026/11/22</footer>';
  assert.deepEqual(publicationDates(html,'https://www.ithome.com/1/030/769.htm'),['2026-11-23']);
  assert.deepEqual(publicationDates(html,'https://ithome.com/list/index.html'),[]);
  assert.deepEqual(publicationDates(html,'https://openai.com/news/a'),[]);
  assert.equal(publicationDates(html+'<meta property="article:published_time" content="2026-11-22">','https://ithome.com/1/030/769.htm').length,2);
});

test('publisher feed discovery filters dates, irrelevant/deal/rumor stories and unsafe URLs', () => {
  const item=(title,url='https://ithome.com/1/030/769.htm',date='Sun, 22 Nov 2026 20:00:00 GMT')=>`<item><title><![CDATA[${title}]]></title><link>${url}</link><pubDate>${date}</pubDate><description>&lt;p&gt;News &amp; details&lt;/p&gt;</description></item>`;
  const xml='<rss>'+item('服务机器人新产品发布')+item('机器人优惠')+item('消息称 AI 芯片曝光')+item('电影定档')+item('AI 新品','https://attacker.example/news/a')+item('AI 旧闻',undefined,'Fri, 20 Nov 2026 20:00:00 GMT')+'</rss>';
  const sources=parsePublisherFeed(xml,'2026-11-23');
  assert.equal(sources.length,1);assert.equal(sources[0].category,'机器人 / 具身');assert.equal(sources[0].published,'2026-11-23');assert.equal(sources[0].discoveryExcerpt,' News & details ');
});

test('Atom feed link and original publication date are used, not updated date', () => {
  const xml='<feed><entry><title>AI launch</title><link rel="alternate" href="https://theverge.com/news/launch"/><published>2026-11-22T02:00:00Z</published><updated>2026-11-23T10:00:00Z</updated><summary>Facts</summary></entry></feed>';
  assert.equal(parsePublisherFeed(xml,'2026-11-23')[0].published,'2026-11-22');
  assert.equal(parsePublisherFeed(xml.replace('2026-11-22T02','2026-11-20T02'),'2026-11-23').length,0);
});

test('failed publisher feeds remain visible in audit while other feeds survive', async () => {
  const result=await fetchPublisherFeeds('2026-11-23',async url=>{if(url.includes('ithome'))return new Response('<rss/>');throw Error('offline');});
  assert.equal(result.feeds.filter(f=>f.status==='fulfilled').length,1);
  assert.equal(result.feeds.filter(f=>f.status==='rejected').length,5);
});


test('editorial approvals require exact source evidence, fresh event date and real source URL', () => {
 const evidence='The company announced a new robot deployment on November 23.';
 const source={title:'Robot deployment',url:'https://ithome.com/1/030/769.htm',published:'2026-11-23',category:'AI / 大模型',evidence};
 const decision={url:source.url,category:'机器人 / 具身',eventDate:'2026-11-23',eventKey:'robot-deployment',eventEvidence:evidence};
 assert.equal(curateVerifiedPool([decision],[source],[],'2026-11-23').selected[0].category,'机器人 / 具身');
 for(const patch of [{eventDate:'2026-11-18'},{eventEvidence:'A fabricated new event that is absent from the source'},{url:'https://ithome.com/1/030/000.htm'},{category:'entertainment'}]) assert.equal(curateVerifiedPool([{...decision,...patch}],[source],[],'2026-11-23').selected.length,0);
 const other={...source,title:'Another report of the same deployment',url:'https://theverge.com/news/robot'};
 assert.equal(curateVerifiedPool([decision,{...decision,url:other.url}],[source,other],[],'2026-11-23').selected.length,1);
});


test('article evidence excludes recommendations and nested unrelated page sections', () => {
 const html='<nav>menu</nav><div id="paragraph"><p>Real article fact</p><div><p>nested detail</p></div></div><div>Related false event</div>';
 assert.equal(articleEvidenceHtml(html,'https://ithome.com/1/030/769.htm'),'<p>Real article fact</p><div><p>nested detail</p></div>');
 assert.throws(()=>articleEvidenceHtml('<div>Not an article</div>','https://ithome.com/1/030/769.htm'),/Missing publisher article body/);
});
