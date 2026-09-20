import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {root,validateDaily} from './validate.mjs';
const input=process.argv[2];if(!input){console.error('Usage: node scripts/add-daily.mjs /path/to/YYYY-MM-DD.json');process.exit(1);}
const data=JSON.parse(await readFile(resolve(input),'utf8'));
validateDaily(data,data.date+'.json');
try{await writeFile(resolve(root,'data/daily',data.date+'.json'),JSON.stringify(data,null,2)+'\n',{flag:'wx'});console.log('Added '+data.date+'. Run npm run build, review, then commit.');}catch(e){if(e.code==='EEXIST')throw new Error('This edition already exists. Existing daily editions are never overwritten by this tool.');throw e;}
