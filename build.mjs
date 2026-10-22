import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {readFile,writeFile,mkdir,copyFile,cp} from 'node:fs/promises';
import {writePublication} from './src/publication.mjs';
const root=dirname(fileURLToPath(import.meta.url));process.chdir(root);
const option=process.argv.indexOf('--toolchain');
const require=createRequire(option>=0?join(resolve(process.argv[option+1]),'../package.json'):join(root,'package.json'));
const {build:bundle}=await import(pathToFileURL(require.resolve('esbuild')).href);
const {build:viteBuild}=await import(pathToFileURL(require.resolve('vite')).href);
const {default:react}=await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href);
const styles=(await readFile('shared/app/globals.css','utf8')).replace('@import "tailwindcss";','');
await writeFile('web/site.css',await readFile('vendor/tailwind-preflight.css','utf8')+'\n'+styles);
await viteBuild({configFile:false,root:join(root,'web'),publicDir:false,plugins:[react()],resolve:{alias:{'@':join(root,'shared'),'react':dirname(require.resolve('react/package.json')),'react-dom':dirname(require.resolve('react-dom/package.json')),'lucide-react':dirname(require.resolve('lucide-react/package.json'))}},css:{postcss:{plugins:[]}},build:{outDir:join(root,'dist'),emptyOutDir:true}});
await copyFile('web/favicon.svg','dist/favicon.svg');
const configuration=JSON.parse(await readFile('edgeone.json','utf8'));
await writeFile('dist/edgeone.json',JSON.stringify({outputDirectory:'.',headers:configuration.headers},null,2)+'\n');
await writeFile('dist/package.json',JSON.stringify({name:'yuri-ladder-public',private:true,type:'module'})+'\n');
await mkdir('dist/edge-functions/api',{recursive:true});
// EdgeOne's function compiler detects the onRequest identifier in its bundle.
// Keep handler names intact through this intermediate bundle.
for(const endpoint of ['stats','matches','history'])await bundle({entryPoints:['src/edge-api.mjs'],outfile:'dist/edge-functions/api/'+endpoint+'.js',bundle:true,platform:'browser',target:'es2022',format:'esm',minifyWhitespace:true,minifySyntax:true,minifyIdentifiers:false});
for(const endpoint of ['sponsors','events'])await bundle({entryPoints:['src/sponsors-edge.mjs'],outfile:'dist/edge-functions/api/'+endpoint+'.js',bundle:true,platform:'browser',target:'es2022',format:'esm',minifyWhitespace:true,minifySyntax:true,minifyIdentifiers:false});
await bundle({entryPoints:['src/accounts-edge.mjs'],outfile:'dist/edge-functions/api/account.js',bundle:true,platform:'browser',target:'es2022',format:'esm',minifyWhitespace:true,minifySyntax:true,minifyIdentifiers:false});
const source=process.env.YURI_PUBLIC_DATA_DIR||'.checkpoint/public';
let index;
try{index=JSON.parse(await readFile(join(source,'index.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(index){
  await mkdir('dist/data/snapshots',{recursive:true});
  for(const entry of [...index.snapshots,...(index.previous||[])]){
    const name=entry.file.split('/').at(-1);await copyFile(join(source,'snapshots',name),join('dist/data/snapshots',name));
    if(entry.history){await mkdir('dist/data/history',{recursive:true});const history=entry.history.file.split('/').at(-1);await copyFile(join(source,'history',history),join('dist/data/history',history));}
  }
  await copyFile(join(source,'index.json'),'dist/data/index.json');
}else{
 const seeds=await Promise.all([31,30].map(async id=>JSON.parse(await readFile('shared/data/season-'+id+'.json','utf8'))));
 await writePublication(join(root,'dist/data'),seeds);
}
await mkdir('collector/migrations',{recursive:true});
await cp('migrations','collector/migrations',{recursive:true});
await bundle({entryPoints:['src/collector.ts'],outfile:'collector/collector.mjs',bundle:true,platform:'node',target:'node22',format:'esm',alias:{'@':join(root,'shared'),'cloudflare:workers':join(root,'src/environment.mjs')},logLevel:'info'});
await bundle({entryPoints:['src/baseline.ts'],outfile:'collector/baseline.mjs',bundle:true,platform:'node',target:'node22',format:'esm',alias:{'@':join(root,'shared'),'cloudflare:workers':join(root,'src/environment.mjs')}});
console.log('EdgeOne artifact: dist/. Collector is private CI code and is excluded from dist/.');
