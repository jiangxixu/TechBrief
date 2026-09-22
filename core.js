export const VIEWS = ['today','history','papers','saved','search'];
export const CATEGORIES = ['AI / 大模型','Agent','机器人 / 具身','无人机','科技产业'];
export function beijingDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function validDate(s) {
  return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
}
export function safeUrl(value) {
  if(typeof value!=='string') return '';
  try { const u=new URL(value); return u.protocol==='https:' ? u.href : ''; } catch { return ''; }
}
export function escapeHtml(value='') { return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
export function normalize(value='') { return String(value).normalize('NFKC').toLowerCase().replace(/[\s_\-·/]+/g,''); }
const aliases=[['worldmodel','世界模型'],['uav','无人机'],['fastslow','快慢脑','双过程','dualprocess'],['embodied','具身'],['rag','检索增强'],['vla','视觉语言动作']];
function oneEdit(a,b){if(Math.abs(a.length-b.length)>1)return false;let i=0,j=0,n=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++n>1)return false;if(a.length<=b.length)j++;if(a.length>=b.length)i++;}return n+(i<a.length||j<b.length?1:0)<=1;}
export function searchScore(item,query) {
  if(!query.trim())return 1;
  const fields=[item.title,item.paperTitle,item.summary,item.why,item.relevance,item.caveat,item.category,...(item.tags||[]),...(item.authors||[]),...(item.sources||[]).map(s=>s.name),...(item.sections||[]).map(s=>s.title+' '+s.text)];
  const title=normalize(item.title+' '+(item.paperTitle||'')); const hay=normalize(fields.join(' '));
  const tokens=query.normalize('NFKC').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if(hay.includes(normalize(query))) return title.includes(normalize(query))?12:8;
  const phraseAlias=aliases.find(g=>g.includes(normalize(query)));
  if(phraseAlias?.some(a=>hay.includes(a)))return 7;
  let score=0;
  for(const token of tokens){const n=normalize(token),group=aliases.find(g=>g.includes(n))||[n];
    if(group.some(a=>hay.includes(a))){score+=title.includes(n)?6:3;continue;}
    if(/^[a-z]{5,}$/.test(n)&&fields.join(' ').toLowerCase().split(/[^a-z]+/).some(w=>oneEdit(n,w))){score+=1;continue;}
    return 0;
  }
  return score;
}
export function filterItems(items, {query='',category='',type='',days=0,now=beijingDate(),sort='newest'}={}) {
  const cutoff=Date.parse(now+'T00:00:00Z')-(Math.max(1,Number(days))-1)*86400000;
  return items.map(item=>({item,score:searchScore(item,query)})).filter(({item,score})=>score>0&&(!category||item.category===category)&&(!type||item.type===type)&&(!days||(Date.parse((item.published||item.date)+'T00:00:00Z')>=cutoff&&(item.published||item.date)<=now)))
    .sort((a,b)=>sort==='relevance'&&query&&a.score!==b.score?b.score-a.score:sort==='oldest'?(a.item.published||a.item.date).localeCompare(b.item.published||b.item.date):(b.item.published||b.item.date).localeCompare(a.item.published||a.item.date)).map(x=>x.item);
}
export function routeFromHash(hash){const [v,q='']=hash.replace(/^#/,'').split('?');return {view:VIEWS.includes(v)?v:'today',params:new URLSearchParams(q)};}
export function validateBackup(input){if(!input||input.version!==1||!Array.isArray(input.saved)||!input.notes||typeof input.notes!=='object'||Array.isArray(input.notes))throw new Error('请选择 TechBrief 导出的收藏备份文件');if(input.saved.length>100000||Object.keys(input.notes).length>100000)throw new Error('备份内容过大');const saved=input.saved.filter(x=>typeof x==='string'&&/^[a-zA-Z0-9-]+$/.test(x));const notes=Object.fromEntries(Object.entries(input.notes).filter(([k,v])=>/^[a-zA-Z0-9-]+$/.test(k)&&typeof v==='string').map(([k,v])=>[k,v.slice(0,20000)]));return {saved,notes};}
