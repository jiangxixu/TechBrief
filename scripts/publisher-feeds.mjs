import { ageDays, canonicalUrl, primaryUrl, MAX_SOURCE_AGE_DAYS } from './news-policy.mjs';

const FEEDS = ['https://www.ithome.com/rss/', 'https://techcrunch.com/feed/',
  'https://www.theverge.com/rss/index.xml', 'https://feeds.arstechnica.com/arstechnica/index',
  'https://www.therobotreport.com/feed/', 'https://dronelife.com/feed/'];
const decode = text => text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"')
  .replaceAll('&#39;', "'").replaceAll('&amp;', '&');
const value = (block, tag) => decode(block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] || '');
export function feedCategory(title) {
  if (/无人机|低空|飞行器|\b(drone|UAV|aerial)\b/i.test(title)) return '无人机';
  if (/机器人|具身|外骨骼|\b(robot\w*|embodied|humanoid)\b/i.test(title)) return '机器人 / 具身';
  if (/智能体|编程助手|\b(agent\w*|Claude Code|Copilot)\b/i.test(title)) return 'Agent';
  if (/大模型|人工智能|\b(AI|LLM|GPT|Claude|Gemini|DeepSeek|OpenAI|Anthropic)\b/i.test(title)) return 'AI / 大模型';
  if (/芯片|半导体|处理器|量子|超算|航天|火箭|智驾|自动驾驶|服务器|数据中心|漏洞|网络安全|浏览器|操作系统|主板|内存|显卡|液冷|机械键盘|\b(chip\w*|semiconductor|quantum|processor|spacecraft|GPU|CPU|Intel|NVIDIA|AMD|security|cyber\w*|browser|Linux|Windows|server\w*)\b/i.test(title)) return '科技产业';
  return '';
}
export function parsePublisherFeed(xml, date) {
  const candidates = [];
  for (const match of xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const block = match[2], title = value(block, 'title').replace(/<[^>]+>/g, '').trim();
    // No coupons, roundups, rumor headlines or entertainment filler.
    if (/优惠|补贴|好价|直降|消息称|传闻|曝光|据传|早报|日报|周报|汇总|盘点|\b(rumou?r|roundup|deals?|week in review)\b/i.test(title)) continue;
    const category = feedCategory(title);
    if (!category) continue;
    const rawDate = value(block, 'pubDate') || value(block, 'published');
    const time = Date.parse(rawDate);
    if (!Number.isFinite(time)) continue;
    const published = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(time));
    if (ageDays(published, date) < 0 || ageDays(published, date) > MAX_SOURCE_AGE_DAYS) continue;
    const rawUrl = value(block, 'link').trim() || block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i)?.[1];
    try {
      const url = canonicalUrl(rawUrl);
      if (!primaryUrl(url)) continue;
      candidates.push({title, category, published, url,
        discoveryExcerpt: (value(block, 'description') || value(block, 'summary') || value(block, 'content')).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1200)});
    } catch {}
  }
  return candidates;
}
export async function fetchPublisherFeeds(date, fetchImpl = fetch) {
  const results = await Promise.allSettled(FEEDS.map(async feedUrl => {
    const response = await fetchImpl(feedUrl, {signal:AbortSignal.timeout(20000), redirect:'error', headers:{'User-Agent':'TechBrief/1.0 (news source discovery)'}});
    if (!response.ok) throw Error('Feed HTTP ' + response.status);
    const xml = await response.text();
    if (xml.length > 2_000_000) throw Error('Feed too large');
    return {feedUrl, candidates:parsePublisherFeed(xml, date)};
  }));
  return {sources:results.flatMap(r=>r.status==='fulfilled'?r.value.candidates.map(n=>({...n,feedUrl:r.value.feedUrl})):[]),
    feeds:results.map((r,i)=>({url:FEEDS[i],status:r.status,count:r.status==='fulfilled'?r.value.candidates.length:0}))};
}
