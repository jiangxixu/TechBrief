import {mkdir,rm,copyFile,cp,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {root,readContent} from './validate.mjs';
const catalog=await readContent();
const serialized=JSON.stringify(catalog,null,2)+'\n';
await writeFile(resolve(root,'data/catalog.json'),serialized);
await writeFile(resolve(root,'data/daily/index.json'),JSON.stringify({schemaVersion:1,latest:catalog.days[0]?.date||null,days:catalog.days},null,2)+'\n');
const dist=resolve(root,'dist');await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
for(const f of ['index.html','styles.css','core.js','app.js','manifest.webmanifest'])await copyFile(resolve(root,f),resolve(dist,f));
for(const d of ['data','assets'])await cp(resolve(root,d),resolve(dist,d),{recursive:true});
await writeFile(resolve(dist,'.nojekyll'),'');
const hash=createHash('sha256');for(const f of ['index.html','styles.css','core.js','app.js','sw.js','manifest.webmanifest'])hash.update(await readFile(resolve(root,f)));hash.update(serialized);
const sw=(await readFile(resolve(root,'sw.js'),'utf8')).replace('__BUILD_VERSION__',hash.digest('hex').slice(0,16));await writeFile(resolve(dist,'sw.js'),sw);
// Dependency-free PNG favicon renderer. All artwork is the site's geometric T mark.
function crc32(buf){let c=0xffffffff;for(const b of buf){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type),n=Buffer.alloc(4),c=Buffer.alloc(4);n.writeUInt32BE(data.length);c.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([n,t,data,c]);}
function icon(size){const raw=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++){for(let x=0;x<size;x++){const xx=x/size*192,yy=y/size*192,white=(xx>=46&&xx<146&&yy>=48&&yy<72)||(xx>=83&&xx<109&&yy>=72&&yy<144),dot=(xx-145)**2+(yy-139)**2<11**2;const col=white?[255,255,255]:dot?[168,202,255]:[40,88,235];const i=y*(size*4+1)+1+x*4;raw.set([...col,255],i);}}const h=Buffer.alloc(13);h.writeUInt32BE(size);h.writeUInt32BE(size,4);h[8]=8;h[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
for(const size of [192,512])await writeFile(resolve(dist,`assets/icon-${size}.png`),icon(size));
console.log(`Built dist/: ${catalog.news.length} news, ${catalog.papers.length} papers, ${catalog.topics.length} topics. No API keys or npm dependencies required.`);
