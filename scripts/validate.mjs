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
export async function readContent(){
 const files=(await readdir(resolve(root,'data/daily'))).filter(f=>/^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
 const days=[];for(const f of files){const d=await json('data/daily/'+f);validateDaily(d,f);days.push(d);}
 const papers=await json('data/papers.json'),topics=await json('data/topics.json');must(Array.isArray(papers)&&Array.isArray(topics),'papers and topics must be arrays');
 const news=days.flatMap(d=>d.news.map(n=>({...n,type:'news',date:d.date})));
 for(const p of papers){validateItem(p,p.id);must(validDate(p.published)&&text(p.paperTitle),'paper title and date required');}
 for(const t of topics){validateItem(t,t.id);must(validDate(t.date),'topic date required');}
 const typedPapers=papers.map(p=>({...p,type:'paper',date:p.published})),typedTopics=topics.map(t=>({...t,type:'topic'}));
 const all=[...news,...typedPapers,...typedTopics],ids=new Set();for(const i of all){must(!ids.has(i.id),'duplicate id '+i.id);ids.add(i.id);}for(const i of all)for(const id of i.relatedIds||[])must(ids.has(id),`${i.id}: unknown related id ${id}`);
 return {schemaVersion:1,days:days.map(d=>({date:d.date,count:d.news.length,title:d.title||'每日科技简报'})),news,papers:typedPapers,topics:typedTopics};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){try{const c=await readContent();console.log(`Validated ${c.days.length} editions, ${c.news.length} news, ${c.papers.length} papers, ${c.topics.length} topics.`);}catch(e){console.error(e.message);process.exitCode=1;}}
