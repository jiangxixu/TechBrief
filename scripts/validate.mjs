import {readFile,readdir} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validDate,safeUrl,CATEGORIES} from '../core.js';
export const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
export async function json(path){return JSON.parse(await readFile(resolve(root,path),'utf8'));}
function must(ok,message){if(!ok)throw new Error(message);}
function text(s){return typeof s==='string'&&s.trim().length>0;}
export function validateItem(item,label){
 must(item&&/^[a-z0-9-]+$/.test(item.id),`${label}: invalid id`);
 for(const key of ['title','summary','category'])must(text(item[key]),`${label}: missing ${key}`);
 must(CATEGORIES.includes(item.category),`${label}: unknown category`);
 must(Array.isArray(item.tags)&&item.tags.length>0&&item.tags.every(text),`${label}: tags required`);
 must(Array.isArray(item.sources)&&item.sources.length>0&&item.sources.every(s=>text(s.name)&&safeUrl(s.url)),`${label}: HTTPS sources required`);
 if(item.published)must(validDate(item.published),`${label}: invalid published date`);
 if(item.image)must(safeUrl(item.image.url)&&safeUrl(item.image.sourceUrl)&&text(item.image.alt)&&text(item.image.credit),`${label}: image needs URL, alt, credit and sourceUrl`);
 if(item.sections)must(Array.isArray(item.sections)&&item.sections.every(s=>text(s.title)&&text(s.text)),`${label}: invalid sections`);
 if(item.relatedIds)must(Array.isArray(item.relatedIds)&&item.relatedIds.every(text),`${label}: invalid relatedIds`);
}
export function validateDaily(day,filename){
 must(day.schemaVersion===1,`${filename}: schemaVersion must be 1`);
 must(validDate(day.date)&&basename(filename)===day.date+'.json',`${filename}: date must match filename`);
 must(day.timezone==='Asia/Shanghai',`${filename}: timezone must be Asia/Shanghai`);
 must(day.generatedBy==='ChatGPT',`${filename}: generatedBy must be ChatGPT`);
 must(Array.isArray(day.news)&&day.news.length>0&&day.news.length<=10,`${filename}: require 1–10 news items; prefer 5 verified stories`);
 const seen=new Set();
 for(const n of day.news){validateItem(n,filename+'/'+n.id);must(!seen.has(n.id),`${filename}: duplicate id ${n.id}`);seen.add(n.id);must(validDate(n.published)&&n.published<=day.date,`${filename}: source date must not be later than edition date`);for(const k of ['why','relevance','caveat'])must(text(n[k]),`${filename}: missing ${k}`);}
}
function arxivId(item){
 const source=(item.sources||[]).find(s=>{try{return new URL(s.url).hostname==='arxiv.org';}catch{return false;}});
 if(!source)return '';
 try{return new URL(source.url).pathname.replace(/^\/(?:abs|pdf|html)\//,'').replace(/\.pdf$/,'').replace(/v\d+$/,'');}catch{return '';}
}
function paperFromNews(news){
 return {
  id:`p-daily-${news.id.replace(/^n-/,'')}`,
  title:news.title,
  category:news.category,
  published:news.published,
  paperTitle:news.paperTitle||news.title,
  authors:news.authors||[],
  venue:news.venue||'arXiv 预印本',
  summary:news.summary||'该论文来自过去30天科技简报的历史记录。',
  why:news.why||'该内容曾被收录进科技简报，保留在论文库中便于后续检索和阅读。',
  relevance:news.relevance||'可通过原论文进一步核对方法、实验与结论。',
  caveat:news.caveat||'历史对话未保留完整分析，具体结论以原论文为准。',
  tags:news.tags?.length?news.tags:['历史论文'],
  sources:news.sources,
  ...(news.image?{image:news.image}:{}),
  relatedIds:[news.id]
 };
}
export async function readContent(){
 const files=(await readdir(resolve(root,'data/daily'))).filter(f=>/^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
 const days=[];for(const f of files){const d=await json('data/daily/'+f);validateDaily(d,f);days.push(d);}
 const curatedPapers=await json('data/papers.json'),topics=await json('data/topics.json'),history=await json('data/history.json');must(Array.isArray(curatedPapers)&&Array.isArray(topics)&&Array.isArray(history),'papers, topics and history must be arrays');
 for(const item of history){must(item&&/^h-[a-z0-9-]+$/.test(item.id),'history: invalid id');must(text(item.title),'history: missing title');must(CATEGORIES.includes(item.category),'history: unknown category');must(validDate(item.date),'history: invalid date');must(Array.isArray(item.sources)&&item.sources.every(s=>text(s.name)&&safeUrl(s.url)),'history: invalid sources');}
 const dailyNews=days.flatMap(d=>d.news.map(n=>({...n,type:'news',date:d.date})));
 const recovered=history.map(n=>({...n,kind:'历史简报',published:n.published||n.date,summary:n.summary||'',why:n.why||'',relevance:n.relevance||'',caveat:n.caveat||'',tags:n.tags||[],type:'news',archived:true}));
 const news=[],seenTitles=new Set(),seenSources=new Set();
 for(const item of [...dailyNews,...recovered]){const titleKey=item.title.normalize('NFKC').toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g,'');const sourceKeys=(item.sources||[]).map(s=>s.url.replace(/v\d+(?=$|[?#])/,'').replace(/[?#].*$/,''));if(seenTitles.has(titleKey)||sourceKeys.some(k=>seenSources.has(k)))continue;news.push(item);seenTitles.add(titleKey);sourceKeys.forEach(k=>seenSources.add(k));}
 const representedNews=new Set(curatedPapers.flatMap(p=>p.relatedIds||[]));
 const representedArxiv=new Set(curatedPapers.map(arxivId).filter(Boolean));
 const dailyPapers=news.filter(n=>{const id=arxivId(n);return id&&!representedNews.has(n.id)&&!representedArxiv.has(id);}).map(paperFromNews);
 const papers=[...dailyPapers,...curatedPapers];
 for(const p of papers){validateItem(p,p.id);must(validDate(p.published)&&text(p.paperTitle),'paper title and date required');}
 for(const t of topics){validateItem(t,t.id);must(validDate(t.date),'topic date required');}
 const typedPapers=papers.map(p=>({...p,type:'paper',date:p.published})),typedTopics=topics.map(t=>({...t,type:'topic'}));
 const all=[...news,...typedPapers,...typedTopics],ids=new Set();for(const i of all){must(!ids.has(i.id),'duplicate id '+i.id);ids.add(i.id);}for(const i of all)for(const id of i.relatedIds||[])must(ids.has(id),`${i.id}: unknown related id ${id}`);
 return {schemaVersion:1,days:days.map(d=>({date:d.date,count:d.news.length,title:d.title||'每日科技简报'})),news,papers:typedPapers,topics:typedTopics};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){try{const c=await readContent();console.log(`Validated ${c.days.length} editions, ${c.news.length} news, ${c.papers.length} papers, ${c.topics.length} topics.`);}catch(e){console.error(e.message);process.exitCode=1;}}
