import {beijingDate,CATEGORIES,escapeHtml as esc,filterItems,routeFromHash,safeUrl,validateBackup,validDate} from './core.js';
const $=s=>document.querySelector(s);
const STORAGE='techbrief-v1';
let saved=new Set(),notes={},storageAvailable=true,catalog=null,loadId=0,activeReader='',returnFocus=null,toastTimer,searchTimer,promptInstall=null;
try{const raw=JSON.parse(localStorage.getItem(STORAGE)||'null');if(raw){const b=validateBackup(raw);saved=new Set(b.saved);notes=b.notes;}}catch{storageAvailable=false;}
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify({version:1,saved:[...saved],notes}));return true;}catch{storageAvailable=false;toast('浏览器无法保存，请导出收藏备份');return false;}}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3300);}
function theme(value){document.documentElement.dataset.theme=value;$('#theme').setAttribute('aria-label',value==='dark'?'切换浅色模式':'切换深色模式');}
try{theme(localStorage.getItem('techbrief-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));}catch{theme('light');}
function allItems(){return catalog?[...catalog.news,...catalog.papers]:[];}
function route(){return routeFromHash(location.hash);}
function go(view,params={}){const p=new URLSearchParams(Object.entries(params).filter(([,v])=>v!==''&&v!==null&&v!==undefined));const h='#'+view+(p.size?'?'+p:'');if(location.hash===h)render();else location.hash=h;}
function patchRoute(key,value){const r=route(),p=Object.fromEntries(r.params);p[key]=value;go(r.view,p);}
function saveButton(item){return `<button class="save" data-save="${esc(item.id)}" aria-label="${saved.has(item.id)?'取消收藏':'收藏'}：${esc(item.title)}" aria-pressed="${saved.has(item.id)}">${saved.has(item.id)?'★':'☆'}</button>`;}
function tags(item){return `<div class="tags">${(item.tags||[]).map(t=>`<button class="tag" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;}
function imageUrl(item){return item.image?safeUrl(item.image.url):'';}
function badgeClass(item){return item.category==='机器人 / 具身'?'robot':item.category==='无人机'?'uav':'';}
function dateMeta(item){
 if(item.type==='paper')return `<span>论文发布</span><time datetime="${esc(item.published)}">${esc(item.published)}</time>`;
 if(item.archived)return `<span>历史简报</span><time datetime="${esc(item.date)}">${esc(item.date)}</time>`;
 const collected=item.date?`<span>简报收录</span><time datetime="${esc(item.date)}">${esc(item.date)}</time>`:'';
 const published=item.published?`<span>来源发布</span><time datetime="${esc(item.published)}">${esc(item.published)}</time>`:'';
 return collected+published;
}
function card(item,index=0,featured=false){const image=imageUrl(item);
return `<article class="card ${featured?'featured':''}"><div class="card-top"><span class="badge ${badgeClass(item)}">${esc(item.category)}</span><span>${item.type==='paper'?'论文 · '+esc(item.venue||'arXiv 预印本'):esc(item.kind||'研究动态')}</span>${dateMeta(item)}${saveButton(item)}</div><div class="card-detail"><div class="card-text"><h2><button data-read="${esc(item.id)}">${esc(item.title)}</button></h2>${item.type==='paper'&&item.paperTitle!==item.title?`<p class="paper-title">${esc(item.paperTitle||'')}</p>`:''}${item.summary?`<p class="summary">${esc(item.summary)}</p>`:''}</div>${image?`<img class="thumb" src="${esc(image)}" alt="${esc(item.image.alt)}" loading="lazy" referrerpolicy="no-referrer">`:''}</div>${featured?`<div class="highlight"><b>为什么值得关注</b>${esc(item.why)}</div>`:''}${tags(item)}<div class="card-foot"><span class="source">${(item.sources||[]).map(s=>esc(s.name)).join(' · ')||'历史对话归档'}</span><button class="text-button" data-read="${esc(item.id)}">阅读全文 ↗</button></div></article>`;}
function archiveCard(item){const source=(item.sources||[])[0];return `<article class="history-item"><div><span class="badge ${badgeClass(item)}">${esc(item.category)}</span><time datetime="${esc(item.date)}">${esc(item.date)}</time></div><h3><button data-read="${esc(item.id)}">${esc(item.title)}</button></h3><div class="history-actions">${source?`<a href="${esc(safeUrl(source.url))}" target="_blank" rel="noopener noreferrer">原始来源 ↗</a>`:'<span>从历史对话恢复</span>'}${saveButton(item)}</div></article>`;}
function related(item){const explicit=new Set(item.relatedIds||[]);return allItems().filter(x=>x.id!==item.id&&(explicit.has(x.id)||(x.relatedIds||[]).includes(item.id))).slice(0,12);}
function empty(title,text,action=true){return `<div class="empty"><div class="symbol">⌕</div><strong>${esc(title)}</strong><p>${esc(text)}</p>${action?'<button data-reset>清除筛选</button>':''}</div>`;}
function filterBar(r){const cat=r.params.get('category')||'';const searchType=r.params.get('type')||'';return `<div class="filters" aria-label="内容筛选">${['',...CATEGORIES].map(c=>`<button class="filter ${cat===c?'active':''}" data-category="${esc(c)}" aria-pressed="${cat===c}">${esc(c||'全部')}</button>`).join('')}<div class="select-group">${r.view==='search'?`<label for="type-filter">内容</label><select id="type-filter"><option value="">全部内容</option>${[['news','新闻'],['paper','论文']].map(([v,t])=>`<option value="${v}" ${searchType===v?'selected':''}>${t}</option>`).join('')}</select><label for="days-filter">时间</label><select id="days-filter">${[['0','全部时间'],['1','最近 1 天'],['3','最近 3 天'],['7','最近 7 天'],['30','最近 30 天']].map(([v,t])=>`<option value="${v}" ${(r.params.get('days')||'0')===v?'selected':''}>${t}</option>`).join('')}</select>`:''}${r.view!=='today'?`<label for="sort-filter">排序</label><select id="sort-filter">${[['newest','最新发布'],['oldest','最早发布'],...(r.view==='search'?[['relevance','相关程度']]:[])].map(([v,t])=>`<option value="${v}" ${(r.params.get('sort')||(r.view==='search'?'relevance':'newest'))===v?'selected':''}>${t}</option>`).join('')}</select>`:''}</div></div>`;}
function updateNotice(extra=''){let parts=[];if(!navigator.onLine)parts.push('当前离线，显示上次保存的内容。');if(!storageAvailable)parts.push('浏览器本地存储不可用，请导出备份以保留收藏和笔记。');if(extra)parts.push(extra);$('#notice').textContent=parts.join(' ');$('#notice').hidden=!parts.length;}
function render(){if(!catalog)return;const r=route(),now=beijingDate(),latest=catalog.days[0]?.date||'',requested=r.params.get('date')||'',day=validDate(requested)?requested:latest;
const titles={today:'今日科技简报',history:'历史新闻',papers:'论文库',saved:'我的收藏',search:'搜索新闻与论文'};
const desc={today:latest===now?'本期日期是简报收录日期；卡片中的来源发布日期可能早一天。':`今天尚未收录新简报 · 最近一期 ${latest||'暂无'}`,history:'新闻按研究方向分组，并默认按最新发布时间排列。',papers:'每日简报涉及的 arXiv 论文会自动归入这里。',saved:'收藏与笔记保存在当前浏览器，可导出备份。',search:'搜索全部历史新闻、论文和原始来源。'};
$('#page-title').textContent=titles[r.view];$('#page-description').textContent=desc[r.view];$('#eyebrow').textContent=r.view==='today'?'DAILY INTELLIGENCE':'YOUR RESEARCH LIBRARY';$('#date-stamp').innerHTML=`<strong>${esc(r.view==='today'?latest:now)}</strong><span>${r.view==='today'?'简报日期 · 北京时间':'北京时间'}</span>`;
document.querySelectorAll('[data-view]').forEach(a=>{const selected=a.dataset.view===r.view;a.classList.toggle('active',selected);if(selected)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});$('#saved-count').textContent=saved.size;
const q=r.params.get('q')||'';if(document.activeElement!==$('#search'))$('#search').value=q;
let controls=filterBar(r),items=[],prefix='',layout='feed';
if(r.view==='today')items=catalog.news.filter(n=>n.date===latest);
if(r.view==='papers'){items=catalog.papers;layout='grid';}
if(r.view==='saved'){items=allItems().filter(x=>saved.has(x.id));controls=`<div class="backup-controls"><button data-export>导出收藏与笔记</button><button data-import>导入备份</button><p>换设备前记得备份</p></div>`+controls;}
if(r.view==='search')items=allItems();
if(r.view==='history'){
 items=catalog.news;
}
const filtered=filterItems(items,{query:q,category:r.params.get('category')||'',type:r.params.get('type')||'',days:Number(r.params.get('days'))||0,sort:r.params.get('sort')||(r.view==='search'?'relevance':'newest'),now});
if(r.view==='search'){const counts=['news','paper'].map((t,i)=>`${['新闻','论文'][i]} ${filtered.filter(x=>x.type===t).length}`).join(' · ');prefix=`<p class="result-caption">${q?'“'+esc(q)+'” · ':''}${filtered.length} 条结果 · ${counts}</p>`;}
if(r.view==='papers')prefix=`<div class="section-label">收录 ${filtered.length} 篇论文<span>按原始发表日期排序</span></div>`;
let list=filtered.map((item,i)=>card(item,i,r.view==='today'&&i===0)).join('');
if(r.view==='history'){const selected=r.params.get('category')||'';const groups=(selected?[selected]:CATEGORIES).map(category=>{const group=filtered.filter(item=>item.category===category);return group.length?`<section class="history-group"><div class="section-label"><span class="history-title">${esc(category)}</span><span>${group.length} 条</span></div><div class="history-list">${group.map(archiveCard).join('')}</div></section>`:'';}).join('');prefix=`<p class="result-caption">共 ${filtered.length} 条历史新闻 · 默认按最新发布排序</p>`;list=groups||empty('没有找到相关历史新闻','请选择其他分类。');layout='history-groups';}
if(!list&&r.view!=='history')list=empty(r.view==='saved'?'还没有收藏内容':'没有找到相关内容',r.view==='saved'?'点击文章右上角的星标，把值得读的内容留在这里。':'试试更短的关键词，或调整分类与时间范围。',r.view!=='saved');
$('#view-controls').innerHTML=controls;
$('#results').innerHTML=r.view==='today'?`<div class="section-label">本期精选<span>${filtered.length} 条 · 按类别筛选</span></div><div class="feed">${list}</div>`:`${prefix}<div class="${layout}">${list}</div>`;
$('#results').setAttribute('aria-busy','false');$('#foot-status').textContent=`TechBrief · 由 ChatGPT 整理 · 最新收录 ${latest||'暂无'}`;updateNotice();
document.querySelectorAll('.thumb').forEach(img=>img.addEventListener('error',()=>img.remove(),{once:true}));
}
function openReader(id){const item=allItems().find(x=>x.id===id);if(!item)return;activeReader=id;returnFocus=document.activeElement;const image=imageUrl(item),linked=related(item);let body=`<div class="card-top"><span class="badge ${badgeClass(item)}">${esc(item.category)}</span>${dateMeta(item)}${saveButton(item)}</div><h2 id="reader-title">${esc(item.title)}</h2>${item.paperTitle&&item.paperTitle!==item.title?`<p class="reader-meta">${esc(item.paperTitle)}</p>`:''}${item.authors?.length?`<p class="reader-meta">${esc(item.authors.join('、'))}</p>`:''}${item.summary?`<p>${esc(item.summary)}</p>`:`<p class="reader-meta">该条目从过去30天的聊天简报中恢复；原对话没有保留下可核验的完整摘要。</p>`}`;
if(image)body+=`<img class="reader-image" src="${esc(image)}" alt="${esc(item.image.alt)}" referrerpolicy="no-referrer"><p class="image-credit">图片：${esc(item.image.credit||'原始来源')} · <a href="${esc(safeUrl(item.image.sourceUrl))}" target="_blank" rel="noopener noreferrer">查看出处 ↗</a></p>`;
for(const [title,text] of [['为什么值得关注',item.why],['与你的学习与研究的关系',item.relevance],['证据边界',item.caveat],...(item.sections||[]).map(s=>[s.title,s.text])])if(text)body+=`<h3>${esc(title)}</h3><p>${esc(text)}</p>`;
const sourceLinks=(item.sources||[]).filter(s=>safeUrl(s.url)).map(s=>`<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗</a>`).join('');body+=`<h3>原始来源</h3><div class="source-links">${sourceLinks||'<span class="reader-meta">原对话中的完整来源链接未保留，因此没有补写未经确认的链接。</span>'}</div><div style="margin-top:20px">${tags(item)}</div>`;
if(linked.length)body+=`<h3>继续阅读</h3><div class="related">${linked.map(x=>`<button data-read="${esc(x.id)}">${esc(x.title)} ↗</button>`).join('')}</div>`;
body+=`<label class="note-label" for="note">我的阅读笔记</label><textarea id="note" maxlength="20000" placeholder="记下一个想法、一处疑问，或下一步想做的实验…">${esc(notes[id]||'')}</textarea><div class="note-status" id="note-status">修改后自动保存在当前浏览器</div>`;
$('#reader-content').innerHTML=body;$('#reader-content .reader-image')?.addEventListener('error',e=>{e.target.remove();$('#reader-content .image-credit')?.remove();},{once:true});if(!$('#reader').open)$('#reader').showModal();$('#reader').scrollTop=0;$('#reader-close').focus();
}
function closeReader(){if($('#reader').open)$('#reader').close();activeReader='';if(returnFocus?.isConnected)returnFocus.focus();}
async function load(manual=false){const request=++loadId;$('#refresh').disabled=true;try{const response=await fetch('./data/catalog.json',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(`HTTP ${response.status}`);const data=await response.json();if(data.schemaVersion!==1||!['days','news','papers','topics'].every(k=>Array.isArray(data[k])))throw new Error('数据格式不正确');if(request!==loadId)return;catalog=data;render();if(manual)toast('已读取最新收录内容');}catch(error){if(request!==loadId)return;if(catalog){updateNotice('刷新失败，仍显示已加载内容。');if(manual)toast('暂时无法获取更新');}else{$('#page-description').textContent='暂时无法读取简报';$('#results').innerHTML=empty('内容加载失败','请检查网络后重试。')+'<p style="text-align:center"><button data-retry>重新加载</button></p>';$('#results').setAttribute('aria-busy','false');}console.error('TechBrief load:',error.message);}finally{if(request===loadId)$('#refresh').disabled=false;}}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.read){openReader(b.dataset.read);return;}
 if(b.dataset.save){const id=b.dataset.save;saved.has(id)?saved.delete(id):saved.add(id);persist();render();if($('#reader').open){const item=allItems().find(x=>x.id===id);const current=$('#reader-content .save');if(current&&item)current.outerHTML=saveButton(item);}toast(saved.has(id)?'已加入收藏':'已取消收藏');return;}
 if(b.hasAttribute('data-category'))patchRoute('category',b.dataset.category);
 if(b.hasAttribute('data-reset'))go(route().view);
 if(b.dataset.tag){closeReader();go('search',{q:b.dataset.tag});}
 if(b.dataset.day)patchRoute('date',b.dataset.day);
 if(b.dataset.go)go(b.dataset.go);
 if(b.hasAttribute('data-retry'))load(true);
 if(b.hasAttribute('data-export')){const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),saved:[...saved],notes},null,2)],{type:'application/json'});const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=`techbrief-bookmarks-${beijingDate()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
 if(b.hasAttribute('data-import'))$('#import-file').click();
});
document.addEventListener('change',e=>{const mapping={'days-filter':'days','sort-filter':'sort','type-filter':'type','month-filter':'month'};if(mapping[e.target.id])patchRoute(mapping[e.target.id],e.target.value);});
$('#import-file').addEventListener('change',async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>5000000)throw new Error('备份文件不能超过 5 MB');const data=validateBackup(JSON.parse(await f.text()));data.saved.forEach(x=>saved.add(x));notes={...data.notes,...notes};persist();render();toast('已合并收藏，保留已有笔记');}catch(error){toast(error.message||'备份文件无法读取');}finally{e.target.value='';}});
$('#reader-content').addEventListener('input',e=>{if(e.target.id==='note'){notes[activeReader]=e.target.value;const ok=persist();$('#note-status').textContent=ok?'已保存在当前浏览器':'未能持久保存，请导出备份';}});
$('#search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>go('search',{q:$('#search').value.trim()}),180);});
$('#search-form').addEventListener('submit',e=>{e.preventDefault();clearTimeout(searchTimer);go('search',{q:$('#search').value.trim()});});
$('#refresh').addEventListener('click',()=>load(true));$('#theme').addEventListener('click',()=>{const v=document.documentElement.dataset.theme==='dark'?'light':'dark';theme(v);try{localStorage.setItem('techbrief-theme',v);}catch{}});$('#reader-close').addEventListener('click',closeReader);$('#reader').addEventListener('click',e=>{if(e.target===$('#reader')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeReader();}});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$('#reader').open){e.preventDefault();$('#search').focus();}});
window.addEventListener('hashchange',()=>{closeReader();render();window.scrollTo({top:0});});window.addEventListener('online',()=>load());window.addEventListener('offline',()=>updateNotice());window.addEventListener('storage',e=>{if(e.key===STORAGE){try{const v=validateBackup(JSON.parse(e.newValue));saved=new Set(v.saved);notes=v.notes;render();}catch{}}});
let lastCheck=Date.now();document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastCheck>300000){lastCheck=Date.now();load();}});
$('#install-help').addEventListener('click',()=>toast('iPhone：Safari 分享 → 添加到主屏幕；安卓：浏览器菜单 → 安装应用或添加到桌面。'));
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();promptInstall=e;$('#install').hidden=false;});$('#install').addEventListener('click',async()=>{if(!promptInstall)return;await promptInstall.prompt();promptInstall=null;$('#install').hidden=true;});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
load();
