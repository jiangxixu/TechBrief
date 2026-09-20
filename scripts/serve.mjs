import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {root} from './validate.mjs';
const base=resolve(root,'dist'),port=Number(process.env.PORT)||4173;
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
http.createServer(async(req,res)=>{try{let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname==='/TechBrief')pathname='/TechBrief/';pathname=pathname.replace(/^\/TechBrief\//,'/');const file=resolve(base,'.'+pathname+(pathname.endsWith('/')?'index.html':''));if(file!==base&&!file.startsWith(base+sep))throw new Error('invalid path');if(!(await stat(file)).isFile())throw new Error('not a file');res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(file));}catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}}).listen(port,'0.0.0.0',()=>console.log(`TechBrief preview: http://localhost:${port}/TechBrief/`));
