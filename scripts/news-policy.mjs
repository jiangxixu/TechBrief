import { validDate } from '../core.js';

export const CATEGORIES = ['Agent', '无人机', '机器人 / 具身', '科技产业', 'AI / 大模型'];
// Only primary publisher hosts may be fetched. Extend deliberately as needed.
const HOSTS = ['arxiv.org', 'openai.com', 'anthropic.com', 'deepmind.google',
  'blog.google', 'research.google', 'microsoft.com', 'nvidia.com', 'huggingface.co',
  'dji.com', 'px4.io', 'ardupilot.org', 'skydio.com', 'auterion.com',
  'unitree.com', 'agilityrobotics.com', 'figure.ai', 'physicalintelligence.company',
  'mit.edu', 'stanford.edu', 'berkeley.edu', 'cmu.edu', 'ethz.ch', 'langchain.com',
  'aws.amazon.com', 'developers.googleblog.com', 'intel.com', 'claude.com',
  'fortemtech.com', 'pdw.ai', 'palladyneai.com', 'github.blog', 'crewai.com',
  'minimax.io', 'deepseek.com', 'inceptionlabs.ai', 'reflection.ai',
  'sensetime.com', 'synaptics.com', 'robinsonheli.com', 'openrobotics.org',
  'mistral.ai', 'meta.ai', 'github.github.com', 'zoom.com'];

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
  return HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
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
  if (ageDays(dates[0], date) < 0 || ageDays(dates[0], date) > 7) throw Error('Source outside 7-day publication window');
  const evidence = html.replace(/<(script|style|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24000);
  return { ...candidate, url: canonicalUrl(url), published: dates[0], evidence,
    dateBasis: new URL(url).hostname === 'nvidianews.nvidia.com' ? 'NVIDIA newsroom article publication header' : 'publisher publication metadata' };
}

export function selectCandidates(pool, history, date) {
  const seenUrls = new Set(history.flatMap(n => (n.sources || []).map(s => canonicalUrl(s.url))));
  const seenTitles = new Set(history.map(n => titleKey(n.title)));
  const eligible = pool.filter(n => CATEGORIES.includes(n.category) && n.evidence &&
    ageDays(n.published, date) >= 0 && ageDays(n.published, date) <= 7)
    .sort((a, b) => ageDays(a.published, date) - ageDays(b.published, date));
  const selected = [];
  let papers = 0;
  const add = n => {
    const url = canonicalUrl(n.url), key = titleKey(n.title);
    const isPaper = new URL(url).hostname === 'arxiv.org';
    if (seenUrls.has(url) || seenTitles.has(key) || (isPaper && papers >= 2)) return;
    selected.push(n); seenUrls.add(url); seenTitles.add(key); if (isPaper) papers++;
  };
  // Prefer 0–3 days across domains; older items are clearly labelled supplements.
  for (const window of [3, 7]) {
    for (const category of CATEGORIES) {
      if (selected.some(n => n.category === category)) continue;
      for (const n of eligible.filter(n => n.category === category && ageDays(n.published, date) <= window)) {
        const before = selected.length; add(n); if (selected.length > before) break;
      }
      if (selected.length === 5) return selected;
    }
  }
  for (const n of eligible) { if (selected.length === 5) break; add(n); }
  return selected;
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
