// Remove only build artifacts that actually embed an owner password.
// Never log archive contents or credentials. Run before rotating the password.
import JSZip from 'jszip';
import {hasEmbeddedOwnerSecret} from './compiled-artifacts.mjs';
const token=process.env.GITHUB_TOKEN,repo=process.env.GITHUB_REPOSITORY;
if(!token||repo!=='caozqiu/yuri-ladder')throw Error('Artifact maintenance repository or credential missing');
const base='https://api.github.com/repos/'+repo,headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
let inspected=0,deleted=0;
for(let page=1;page<=10;page++){
 const r=await fetch(base+'/actions/artifacts?per_page=100&page='+page,{headers});if(!r.ok)throw Error('Artifact inventory failed: '+r.status);
 const {artifacts}=await r.json();
 for(const artifact of artifacts.filter(a=>a.name==='edgeone-compiled-site'&&!a.expired)){
  const archive=await fetch(base+'/actions/artifacts/'+artifact.id+'/zip',{headers});if(!archive.ok)throw Error('Artifact inspection failed: '+archive.status);
  const outer=await JSZip.loadAsync(Buffer.from(await archive.arrayBuffer())),inner=outer.file('edgeone-compiled-site.zip');if(!inner)throw Error('Unexpected compiled artifact layout');
  const zip=await JSZip.loadAsync(await inner.async('nodebuffer'));let embedded=false;inspected++;
  for(const [name,file]of Object.entries(zip.files))if(!file.dir&&/\.(js|json)$/.test(name)&&hasEmbeddedOwnerSecret(await file.async('string')))embedded=true;
  if(embedded){const removed=await fetch(base+'/actions/artifacts/'+artifact.id,{method:'DELETE',headers});if(removed.status!==204)throw Error('Credential artifact removal failed: '+removed.status);deleted++;}
 }
 if(artifacts.length<100)break;
}
console.log(JSON.stringify({compiledArtifactsInspected:inspected,credentialArtifactsRemoved:deleted}));
