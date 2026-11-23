import { validDate } from '../core.js';

export const CATEGORIES = ['Agent', '无人机', '机器人 / 具身', '科技产业', 'AI / 大模型'];
export const TARGET_STORIES = 10;
// Calendar publication dates: edition day or the previous day, never a stale fallback.
export const MAX_SOURCE_AGE_DAYS = 1;
export const MAX_ARXIV_STORIES = 6;
export const DISCOVERY_CANDIDATES = 12;
export const NEWSROOM_HOSTS = ['techcrunch.com', 'theverge.com', 'arstechnica.com',
  'techradar.com', 'tomshardware.com', 'technologyreview.com', 'wired.com',
  'reuters.com', 'apnews.com', 'axios.com', 'ithome.com', 'ithome.com.tw',
  'jiqizhixin.com', 'qbitai.com', 'scmp.com', 'roboticsandautomationnews.com',
  'therobotreport.com', 'dronelife.com', 'dronedj.com', 'technode.com'];
// Publisher allowlist is not enough: user-generated areas are excluded below.
const HOSTS = ['arxiv.org', 'openai.com', 'anthropic.com', 'deepmind.google',
  'blog.google', 'research.google', 'microsoft.com', 'nvidia.com', 'huggingface.co',
  'dji.com', 'px4.io', 'ardupilot.org', 'skydio.com', 'auterion.com',
  'unitree.com', 'agilityrobotics.com', 'figure.ai', 'physicalintelligence.company',
  'mit.edu', 'stanford.edu', 'berkeley.edu', 'cmu.edu', 'ethz.ch', 'langchain.com',
  'aws.amazon.com', 'developers.googleblog.com', 'intel.com', 'claude.com',
  'fortemtech.com', 'pdw.ai', 'palladyneai.com', 'github.blog', 'crewai.com',
  'minimax.io', 'deepseek.com', 'inceptionlabs.ai', 'reflection.ai',
  'sensetime.com', 'synaptics.com', 'robinsonheli.com', 'openrobotics.org',
  'mistral.ai', 'meta.ai', 'github.github.com', 'zoom.com',
  'vercel.com', 'wpi.edu', 'amd.com', 'ibm.com', 'apple.com', 'replit.com'];

export function canonicalUrl(raw) {
  const u = new URL(raw);
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) throw Error('Unsafe source URL');
  u.hash = ''; u.search = '';
  u.hostname = u.hostname.replace(/^www\./, '');
  if (u.hostname === 'arxiv.org') u.pathname = u.pathname.replace(/^\/(pdf|html)\//, '/abs/').replace(/\.pdf$/, '').replace(/v\d+$/, '');
  u.pathname = u.pathname.replace(/\/$/, '');
  return u.toString();
}

export function primaryUrl(raw) {
  const u = new URL(canonicalUrl(raw));
  if (/(^|\.)(community|communities|techcommunity|forum|forums|discuss|discussion|discourse|quan|lapin|dyn)\./i.test(u.hostname)
    || /\/(community|forum|forums|discuss|comments|replies|civis)(\/|$)/i.test(u.pathname)) return false;
  return [...HOSTS, ...NEWSROOM_HOSTS].some(h => u.hostname === h || u.hostname.endsWith('.' + h));
}

export function sourceType(raw) {
  const host = new URL(canonicalUrl(raw)).hostname;
  return NEWSROOM_HOSTS.some(h => host === h || host.endsWith('.' + h)) ? 'newsroom reporting' : 'official publisher';
}

export function ageDays(published, date) {
  if (!validDate(published) || !validDate(date)) return Infinity;
  return (Date.parse(date + 'T00:00:00Z') - Date.parse(published + 'T00:00:00Z')) / 86400000;
}

export const titleKey = title => String(title).normalize('NFKC').toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]/g, '');

export function searchEvidence(payload) {
  if (payload.status !== 'completed') throw Error('Search response not completed');
  const calls = (payload.output || []).filter(o => o.type === 'web_search_call' && o.status === 'completed');
  if (!calls.some(o => o.action?.type === 'search')) throw Error('No completed web search action; provider capability unverified');
  const urls = new Set();
  for (const call of calls) {
    // Opened article links are direct tool provenance too, even when JSON text
    // carries no URL citation and the article was not itself a search result.
    if (['open_page', 'find_in_page'].includes(call.action?.type) && call.action.url) urls.add(canonicalUrl(call.action.url));
    for (const source of call.action?.sources || []) if (source.url) urls.add(canonicalUrl(source.url));
  }
  for (const output of payload.output || []) for (const part of output.content || []) {
    for (const a of part.annotations || []) if (a.type === 'url_citation' && a.url) urls.add(canonicalUrl(a.url));
  }
  if (!urls.size) throw Error('Search returned no source provenance');
  // Some gateways replace every tool URL with an opaque, temporary media URL.
  // Those URLs cannot establish the identity of the original publisher article.
  const opaqueUrls = [...urls].every(raw => {
    const u = new URL(raw);
    return u.hostname === 'api.shep-api.com' && u.pathname.startsWith('/v1/media/assets/');
  });
  return { urls, opaqueUrls, calls: calls.map(c => ({ id: c.id, action: c.action?.type, queries: c.action?.queries || [], ...(c.action?.url ? { url: c.action.url } : {}) })) };
}

export async function verifyDiscoveredPage(candidate, date, provenance, fetchImpl = fetch) {
  const linked = provenance.urls.has(canonicalUrl(candidate.url));
  if (!linked && !provenance.opaqueUrls) throw Error('Candidate URL absent from search provenance');
  // A completed search is still mandatory. In opaque mode the original URL is
  // a discovery hint only: independently fetch the allowlisted publisher and
  // verify its publication date before giving any content to the writer.
  const verified = await verifyPage(candidate, date, fetchImpl);
  return { ...verified, provenanceBasis: linked ? 'search tool URL' : 'independent publisher fetch after opaque search' };
}

// Accept publication metadata only, never dateModified or a date anywhere in page text.
export function publicationDates(html, publisherUrl = '') {
  const dates = new Set();
  const add = value => {
    const m = String(value).match(/^(\d{4}-\d{2}-\d{2})(?:T|\s|$)/);
    if (m && validDate(m[1])) dates.add(m[1]);
  };
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = Object.fromEntries([...m[0].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(a => [a[1].toLowerCase(), a[2]]));
    if (/^(article:published_time|datepublished|citation_publication_date)$/i.test(attrs.property || attrs.name || '')) add(attrs.content);
  }
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (Object.hasOwn(node, 'datePublished')) add(node.datePublished);
    for (const value of Object.values(node)) if (typeof value === 'object') {
      if (Array.isArray(value)) value.forEach(walk); else walk(value);
    }
  };
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1])); } catch {}
  }
  // NVIDIA's newsroom publishes its date in this dedicated article header,
  // not JSON-LD. Scope the adapter to this publisher and this exact element;
  // dates in related links, copyright notices and scripts are not evidence.
  if (publisherUrl && new URL(publisherUrl).hostname === 'nvidianews.nvidia.com') {
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    for (const match of html.matchAll(/<div\b[^>]*class=["']article-date["'][^>]*>\s*([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})\s*<\/div>/g)) {
      const month = months.indexOf(match[1]) + 1;
      if (month) add(`${match[3]}-${String(month).padStart(2, '0')}-${match[2].padStart(2, '0')}`);
    }
  }
  // IT Home's article publication header, never its footer or related links.
  if (publisherUrl && /^(www\.)?ithome\.com$/.test(new URL(publisherUrl).hostname)
    && /^\/\d+\/\d+\/\d+\.htm$/.test(new URL(publisherUrl).pathname)) {
    for (const m of html.matchAll(/<span\b[^>]*id=["']pubtime_baidu["'][^>]*>\s*(\d{4})\/(\d{2})\/(\d{2})\s+\d{1,2}:\d{2}:\d{2}\s*<\/span>/gi)) add(`${m[1]}-${m[2]}-${m[3]}`);
  }
  return [...dates];
}

export async function verifyPage(candidate, date, fetchImpl = fetch, deriveDate = false) {
  if (!primaryUrl(candidate.url)) throw Error('Source host not in primary publisher allowlist');
  let url = candidate.url;
  let response;
  for (let redirects = 0; redirects < 5; redirects++) {
    response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    if (!location) throw Error('Redirect without location');
    url = new URL(location, url).toString();
    if (!primaryUrl(url)) throw Error('Redirect outside primary publisher allowlist');
  }
  if (!response.ok) throw Error('Source page HTTP ' + response.status);
  if (!/text\/html/i.test(response.headers.get('content-type') || '')) throw Error('Source is not an HTML article');
  let html = '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 2000000) throw Error('Source page too large');
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();
  } finally { await reader.cancel(); }
  const dates = publicationDates(html, url);
  if (dates.length !== 1) throw Error('Missing or conflicting publication metadata');
  if (!deriveDate && candidate.published !== dates[0]) throw Error('Model date does not match source publication metadata');
  if (ageDays(dates[0], date) < 0 || ageDays(dates[0], date) > MAX_SOURCE_AGE_DAYS) throw Error('Source outside today-or-yesterday publication window');
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    || html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || html;
  const evidence = article.replace(/<(script|style|nav|footer|dialog|form)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24000);
  const title = candidate.title || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!title) throw Error('Source page has no article title');
  return { ...candidate, title, url: canonicalUrl(url), published: dates[0], evidence, sourceType: sourceType(url),
    dateBasis: /^(www\.)?ithome\.com$/.test(new URL(url).hostname) ? 'IT Home article publication header' : new URL(url).hostname === 'nvidianews.nvidia.com' ? 'NVIDIA newsroom article publication header' : 'publisher publication metadata' };
}

export function selectCandidates(pool, history, date) {
  const seenUrls = new Set(history.flatMap(n => (n.sources || []).map(s => canonicalUrl(s.url))));
  const seenTitles = new Set(history.map(n => titleKey(n.title)));
  const seenEvents = new Set(history.map(n => n.eventKey).filter(Boolean));
  const eligible = pool.filter(n => CATEGORIES.includes(n.category) && n.evidence &&
    ageDays(n.published, date) >= 0 && ageDays(n.published, date) <= MAX_SOURCE_AGE_DAYS)
    .sort((a, b) => ageDays(a.published, date) - ageDays(b.published, date));
  const selected = [];
  let papers = 0;
  const add = n => {
    const url = canonicalUrl(n.url), key = titleKey(n.title);
    const isPaper = new URL(url).hostname === 'arxiv.org';
    if (selected.length >= TARGET_STORIES || seenUrls.has(url) || seenTitles.has(key) || (n.eventKey && seenEvents.has(n.eventKey)) || (isPaper && papers >= MAX_ARXIV_STORIES)) return;
    selected.push(n); seenUrls.add(url); seenTitles.add(key); if (isPaper) papers++;
    if (n.eventKey) seenEvents.add(n.eventKey);
  };
  const isPaper = n => new URL(canonicalUrl(n.url)).hostname === 'arxiv.org';
  const balanced = predicate => {
    for (const limit of [1, 2]) for (const category of CATEGORIES) {
      if (selected.filter(n => n.category === category).length >= limit) continue;
      for (const n of eligible.filter(n => n.category === category && predicate(n))) {
        const before = selected.length;
        add(n);
        if (selected.length > before) break;
      }
      if (selected.length === TARGET_STORIES) return;
    }
  };
  // Freshness outranks publisher type and domain balance. Never relax dates
  // to fill ten; use other domains when one domain has no fresh news.
  for (const age of [0, 1]) {
    for (const paper of [false, true]) balanced(n => isPaper(n) === paper && ageDays(n.published, date) === age);
    for (const paper of [false, true]) for (const n of eligible) {
      if (selected.length === TARGET_STORIES) break;
      if (isPaper(n) === paper && ageDays(n.published, date) === age) add(n);
    }
  }
  return selected;
}

// The editor may approve only independently fetched evidence. A fresh article
// about an old event is not a fresh event; require an in-window development
// and an exact quote supporting that development before the writer sees it.
export function curateVerifiedPool(decisions, pool, history, date) {
  if (!Array.isArray(decisions) || decisions.length > 40) throw Error('Invalid editorial review');
  const byUrl = new Map(pool.map(n=>[canonicalUrl(n.url),n]));
  const accepted=[], rejected=[];
  for (const decision of decisions) {
    let source;
    try { source=byUrl.get(canonicalUrl(decision.url)); } catch {}
    const quote=String(decision.eventEvidence||'').trim();
    if (!source || !primaryUrl(source.url) || !CATEGORIES.includes(decision.category)
      || ageDays(decision.eventDate,date)<0 || ageDays(decision.eventDate,date)>MAX_SOURCE_AGE_DAYS
      || quote.length<12 || quote.length>600 || !source.evidence.includes(quote)
      || !/^[a-z0-9-]{3,100}$/.test(decision.eventKey||'')) {
      rejected.push({url:decision.url,reason:'Editorial review lacks a fresh, relevant, grounded development'});continue;
    }
    accepted.push({...source,category:decision.category,eventDate:decision.eventDate,eventEvidence:quote,eventKey:decision.eventKey});
  }
  return {selected:selectCandidates(accepted,history,date),rejected};
}

// Tool-returned publisher URLs can be verified directly without another model
// request. Never treat a URL from model prose as equivalent tool provenance.
export function sourceBackfillCandidates(searches, history, attempted = new Set(), perCategory = DISCOVERY_CANDIDATES) {
  const seen = new Set([...attempted, ...history.flatMap(n => (n.sources || []).map(s => canonicalUrl(s.url)))]);
  const candidates = [];
  for (const search of searches) {
    if (!CATEGORIES.includes(search.category) || !search.calls?.some(c => c.action === 'search')) continue;
    const urls = [];
    for (const raw of search.sourceUrls || []) {
      try {
        const url = canonicalUrl(raw), u = new URL(url);
        if (seen.has(url) || !primaryUrl(url) || u.hostname === 'arxiv.org' || /\.(pdf|png|jpe?g|gif|svg|zip)$/i.test(u.pathname)) continue;
        if (u.pathname.split('/').filter(Boolean).length < 2) continue;
        urls.push(url);
      } catch {}
    }
    urls.sort((a, b) => Number(/news|blog|release|announcement/.test(b)) - Number(/news|blog|release|announcement/.test(a)));
    let added = 0;
    for (const url of urls) {
      if (seen.has(url)) continue;
      seen.add(url); candidates.push({ category: search.category, url });
      if (++added >= perCategory) break;
    }
  }
  return candidates;
}

export function assertGroundedEdition(edition, selected) {
  if (edition.news?.length !== selected.length) throw Error('Writer changed verified story count');
  const unused = new Map(selected.map(n => [canonicalUrl(n.url), n]));
  for (const n of edition.news) {
    if (n.image) throw Error('Writer must not add unverified images');
    if (n.sources?.length !== 1) throw Error('Writer must use exactly the supplied primary source');
    const key = canonicalUrl(n.sources[0].url), candidate = unused.get(key);
    if (!candidate || n.published !== candidate.published || n.category !== candidate.category) throw Error('Writer changed verified source/date/category');
    unused.delete(key);
  }
}

// Provider proxies may accept text.format but return their own envelope.
// Edition metadata and display source labels are application-owned, not facts
// for the model to invent. News facts/dates/categories/URLs stay untouched.
export function assembleEdition(candidate, date, selected) {
  const byUrl = new Map(selected.map(n => [canonicalUrl(n.url), n]));
  const news = (candidate.news || []).map(n => ({ ...n, sources: (n.sources || []).map(s => {
    const verified = byUrl.get(canonicalUrl(s.url));
    return { url: s.url, name: s.name || (verified ? new URL(verified.url).hostname : '') };
  }) }));
  return { schemaVersion: 1, date, timezone: 'Asia/Shanghai', generatedBy: 'ChatGPT',
    title: candidate.title || `${date}科技简报：${news.length}条核验来源`,
    editorialNote: candidate.editorialNote || '来源及覆盖度见核验记录。', news };
}
