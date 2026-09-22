import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getApiConfig } from './api-config.mjs';
import { root, validateDaily } from './validate.mjs';

const dailyDir = resolve(root, 'data/daily');
const force = process.env.FORCE_REGENERATE === 'true';

function shanghaiDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function recentTitles(limit = 40) {
  const files = (await readdir(dailyDir))
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort()
    .reverse();
  const titles = [];
  for (const filename of files) {
    const day = JSON.parse(await readFile(resolve(dailyDir, filename), 'utf8'));
    for (const item of day.news || []) titles.push(item.title);
    if (titles.length >= limit) break;
  }
  return titles.slice(0, limit);
}

const itemSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'title', 'category', 'kind', 'published', 'summary', 'why', 'relevance', 'caveat', 'tags', 'sources'],
  properties: {
    id: { type: 'string', pattern: '^n-[0-9]{8}-[a-z0-9-]+$' },
    title: { type: 'string', minLength: 1 },
    category: { enum: ['AI / 大模型', 'Agent', '机器人 / 具身', '无人机', '科技产业'] },
    kind: { type: 'string', minLength: 1 },
    published: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    summary: { type: 'string', minLength: 1 },
    why: { type: 'string', minLength: 1 },
    relevance: { type: 'string', minLength: 1 },
    caveat: { type: 'string', minLength: 1 },
    tags: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
    sources: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'url'],
        properties: {
          name: { type: 'string', minLength: 1 },
          url: { type: 'string', pattern: '^https://.+' }
        }
      }
    }
  }
};

function responseSchema(date) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['schemaVersion', 'date', 'timezone', 'generatedBy', 'title', 'editorialNote', 'news'],
    properties: {
      schemaVersion: { const: 1 },
      date: { const: date },
      timezone: { const: 'Asia/Shanghai' },
      generatedBy: { const: 'ChatGPT' },
      title: { type: 'string', minLength: 1 },
      editorialNote: { type: 'string', minLength: 1 },
      news: { type: 'array', minItems: 5, maxItems: 5, items: itemSchema }
    }
  };
}

function extractOutputText(payload) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text;
  const chunks = [];
  for (const output of payload.output || []) {
    for (const content of output.content || []) {
      if (typeof content.text === 'string') chunks.push(content.text);
    }
  }
  if (!chunks.length) throw new Error('API response did not contain output text');
  return chunks.join('');
}

function parseJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {}
    }
    throw new Error(`Model output was not valid JSON: ${error.message}`);
  }
}

function assertFreshEdition(edition, date, allowedSourceUrls = null) {
  const editionTime = Date.parse(`${date}T00:00:00Z`);
  const recent = edition.news.filter((item) => {
    const ageDays = (editionTime - Date.parse(`${item.published}T00:00:00Z`)) / 86_400_000;
    return ageDays >= 0 && ageDays <= 14;
  });
  if (recent.length < 4) {
    throw new Error(`Freshness check failed: only ${recent.length}/5 items are from the last 14 days`);
  }
  if (/无法.{0,6}(联网|核验)|禁止联网|不应视为今日|历史进展/.test(edition.editorialNote || '')) {
    throw new Error('Freshness check failed: the model reported that current information was unavailable');
  }
  if (allowedSourceUrls) {
    for (const item of edition.news) {
      if (!(item.sources || []).some((source) => allowedSourceUrls.has(source.url))) {
        throw new Error(`Source-grounding check failed for ${item.id}`);
      }
    }
  }
}

function decodeXml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function xmlText(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) : '';
}

async function fetchArxivSources() {
  const query = new URL('https://export.arxiv.org/api/query');
  query.searchParams.set('search_query', 'cat:cs.AI OR cat:cs.RO OR cat:cs.CL OR cat:cs.LG');
  query.searchParams.set('start', '0');
  query.searchParams.set('max_results', '30');
  query.searchParams.set('sortBy', 'submittedDate');
  query.searchParams.set('sortOrder', 'descending');

  const response = await fetch(query, {
    headers: { 'User-Agent': 'TechBrief/1.0 (daily research digest)' },
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`arXiv source fetch returned HTTP ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((match) => {
    const block = match[1];
    const id = xmlText(block, 'id').replace('http://', 'https://');
    return {
      title: xmlText(block, 'title'),
      published: xmlText(block, 'published').slice(0, 10),
      updated: xmlText(block, 'updated').slice(0, 10),
      summary: xmlText(block, 'summary').slice(0, 1800),
      authors: [...block.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi)]
        .map((author) => decodeXml(author[1].trim())),
      url: id
    };
  }).filter((item) => item.title && item.published && item.url.startsWith('https://'));
}

async function callResponsesApi({ apiKey, model, responsesUrl }, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8 * 60 * 1000);
  try {
    const response = await fetch(responsesUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const raw = await response.text();
    if (!response.ok) {
      const safeMessage = raw.slice(0, 1500).replaceAll(apiKey, '[REDACTED]');
      const error = new Error(`Responses API returned HTTP ${response.status}: ${safeMessage}`);
      error.status = response.status;
      throw error;
    }
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error('Responses API returned a non-JSON response');
    }
  } finally {
    clearTimeout(timer);
  }
}

await mkdir(dailyDir, { recursive: true });
const date = shanghaiDate();
const filename = `${date}.json`;
const outputPath = resolve(dailyDir, filename);

if (!force) {
  try {
    await readFile(outputPath, 'utf8');
    console.log(`${filename} already exists; nothing to do.`);
    process.exit(0);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

const config = getApiConfig();
const oldTitles = await recentTitles();
let sourcePool = [];
try {
  sourcePool = await fetchArxivSources();
  console.log(`Fetched ${sourcePool.length} current primary-source records from arXiv.`);
} catch (error) {
  console.warn(`Primary-source fetch failed: ${error.message}`);
}
const instructions = `你是 TechBrief 的事实核查编辑。当前简报日期为 ${date}（Asia/Shanghai）。\n\n请使用联网搜索，并参考下方已从 arXiv 实时抓取的一手来源候选，生成恰好 5 条中文科技简报，覆盖 AI/大模型、Agent、机器人/具身智能、无人机或计算机科研中最值得关注的最新进展。\n\n硬性要求：\n1. 只写能够由一手来源核验的事实，优先官方公告、原始论文、官方仓库；每条至少一个真实可访问的 HTTPS 一手来源。\n2. published 必须是来源实际公开日期，不能晚于 ${date}；至少 4 条必须来自最近 14 天。\n3. 不得把预印本写成已通过同行评审，不得把仿真结果写成实机结果，不得根据摘要补造数字。\n4. summary 写事实；why 写重要性；relevance 明确写对学习或研究的启发；caveat 写证据边界。\n5. 不添加无法核验的图片，不输出 image 字段。\n6. ID 格式为 n-${date.replaceAll('-', '')}-英文短名，且全小写。\n7. 避免与下列近期标题重复：${JSON.stringify(oldTitles)}。\n8. 不得用旧知识填充数量；如果搜索不可用，必须从下面的实时来源候选中选择。\n9. 仅输出符合给定 JSON Schema 的对象，不要输出 Markdown 或额外说明。\n\n实时 arXiv 一手来源候选：${JSON.stringify(sourcePool)}`;

const sourceUrls = new Set(sourcePool.map((item) => item.url));
const template = {
  schemaVersion: 1,
  date,
  timezone: 'Asia/Shanghai',
  generatedBy: 'ChatGPT',
  title: '当天主题概括',
  editorialNote: '来源范围及日期说明',
  news: [{
    id: `n-${date.replaceAll('-', '')}-english-slug`,
    title: '中文标题',
    category: 'AI / 大模型',
    kind: '论文',
    published: date,
    summary: '核心事实',
    why: '为什么重要',
    relevance: '对学习或研究的启发',
    caveat: '证据边界',
    tags: ['标签'],
    sources: [{ name: 'arXiv 原论文', url: 'https://arxiv.org/abs/...' }]
  }]
};

async function generateCompatibilityEdition() {
  if (sourcePool.length < 5) throw new Error('Fewer than 5 current primary sources were available');
  console.warn('Generating in source-grounded compatibility mode.');
  const compatibilityPrompt = `${instructions.replace('请使用联网搜索，并参考', '请只依据')}\n\n你必须从候选中选择恰好 5 条，不得加入候选之外的事实、数字或链接。sources.url 必须逐字复制对应候选的 url。\n输出结构示例：${JSON.stringify(template)}`;
  const result = await callResponsesApi(config, { model: config.model, input: compatibilityPrompt });
  const parsed = parseJson(extractOutputText(result));
  validateDaily(parsed, filename);
  assertFreshEdition(parsed, date, sourceUrls);
  return parsed;
}

let payload;
let edition;
try {
  payload = await callResponsesApi(config, {
    model: config.model,
    instructions,
    input: '检索并撰写今天的 TechBrief 日报。',
    tools: [{ type: 'web_search' }],
    tool_choice: 'auto',
    text: {
      format: {
        type: 'json_schema',
        name: 'techbrief_daily',
        strict: true,
        schema: responseSchema(date)
      }
    },
    max_output_tokens: 12000
  });
  console.log('Generated with Responses API web search and JSON Schema.');
  edition = parseJson(extractOutputText(payload));
  validateDaily(edition, filename);
  assertFreshEdition(edition, date);
} catch (error) {
  if (error.status && ![400, 422].includes(error.status)) throw error;
  console.warn(`Advanced generation was rejected by the API or quality gate: ${error.message}`);
  edition = await generateCompatibilityEdition();
  console.log('Generated in source-grounded compatibility mode.');
}

validateDaily(edition, filename);
assertFreshEdition(edition, date);
await writeFile(outputPath, `${JSON.stringify(edition, null, 2)}\n`, 'utf8');
console.log(`Generated and validated ${filename} with ${edition.news.length} items.`);
