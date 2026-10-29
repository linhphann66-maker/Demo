/** Keep the existing Vite/Pixi editor. Package it with a same-origin Sites Worker. */
import { readFile,mkdir,readdir,stat,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
const root=process.cwd(),dist=path.join(root,'dist'),assets={};
async function collect(dir){for(const entry of await readdir(dir)){if(entry==='server'||entry==='.openai')continue;const file=path.join(dir,entry);if((await stat(file)).isDirectory())await collect(file);else{const relative='/'+path.relative(dist,file).split(path.sep).join('/'),ext=path.extname(file);assets[relative]={body:(await readFile(file)).toString('base64'),mime:({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'}[ext]??'application/octet-stream')};}}}
await collect(dist);
await mkdir(path.join(dist,'server'),{recursive:true});
await build({entryPoints:['apps/worker/index.ts'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,conditions:['browser','worker'],plugins:[{name:'site-assets',setup(b){b.onResolve({filter:/^site-assets$/},()=>({path:'site-assets',namespace:'inline-assets'}));b.onLoad({filter:/.*/,namespace:'inline-assets'},()=>({contents:'export default '+JSON.stringify(assets),loader:'js'}));}}]});
await mkdir(path.join(dist,'.openai'),{recursive:true});
const hosting=JSON.parse(await readFile('.openai/hosting.json','utf8'));
if(hosting.static)throw Error('Worker hosting manifest must not declare static output');
await writeFile(path.join(dist,'.openai/hosting.json'),JSON.stringify(hosting,null,2)+'\n');
console.log('Packaged same-origin Worker + '+Object.keys(assets).length+' Vite assets; no browser credentials.');
