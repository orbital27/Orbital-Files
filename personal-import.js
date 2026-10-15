import {api} from './api.js?v=personal-1';
import {loadZip,checkZipSize} from './document-import.js?v=personal-1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validatePersonalBundle(data){
 if(data.format!=='orbital-personal-import-v1'||!Array.isArray(data.spaces)||!Array.isArray(data.pages)||data.spaces.length>100||data.pages.length>500)throw Error('Not a supported personal-page backup.');
 const ids=new Set();for(const s of data.spaces){if(!uuid.test(s.id)||ids.has(s.id)||typeof s.name!=='string'||!s.name.trim()||s.name.length>80||!s.source_url?.startsWith('https://sites.google.com/view/orbluence/peoples-personal-spaces/'))throw Error('Invalid personal space in backup.');ids.add(s.id);}
 const pages=new Set();for(const p of data.pages){if(!uuid.test(p.id)||pages.has(p.id)||!ids.has(p.space_id)||typeof p.title!=='string'||p.title.length>160||!p.title.trim()||!p.source_url?.startsWith('https://sites.google.com/view/orbluence/peoples-personal-spaces/')||!Array.isArray(p.content)||p.content.length>200||JSON.stringify(p.content).length>450000)throw Error('Invalid personal page in backup.');pages.add(p.id);
  for(const b of p.content){if(!['heading','text','list','link','image'].includes(b.type)||(b.text||'').length>20000)throw Error('Invalid content block.');if(b.type==='image'&&!/^images\/[0-9a-f-]{36}\.webp$/.test(b.asset))throw Error('Invalid image path.');if(b.type==='link'&&!/^https?:\/\//.test(b.url))throw Error('Invalid link.');}
 }return data;
}
export async function runPersonalImport(data,readAsset,progress=()=>{},service=api){
 const spaces=new Map();let completed=0,skipped=0;
 for(const s of data.spaces){const saved=await service.personal('import_space',s);spaces.set(s.id,saved.id);}
 for(const p of data.pages){progress(`Importing ${p.title} (${completed+skipped+1}/${data.pages.length})…`);const sid=spaces.get(p.space_id);const saved=await service.personal('import_page',{space_id:sid,id:p.id,title:p.title,source_url:p.source_url});if(saved.import_complete){skipped++;continue;}
  const content=[];for(const b of p.content){if(b.type!=='image'){content.push(b);continue;}const path=`${sid}/${saved.id}/${b.asset.split('/').pop()}`;const blob=await readAsset(b.asset);try{await service.imageUpload(path,blob);}catch(e){try{await service.imageUrl(path);}catch{throw e;}}content.push({type:'image',path,text:b.text||''});}
  await service.personal('finish_import',{space_id:sid,id:saved.id,expected_version:saved.version,title:p.title,content});completed++;
 }return {completed,skipped};
}
export async function reviewPersonalImport(root,file,c){
 if(file.size>30*1024*1024)throw Error('Choose an import backup smaller than 30 MB.');const buffer=await file.arrayBuffer();checkZipSize(buffer);const Zip=await loadZip();const zip=await Zip.loadAsync(buffer);const entry=zip.file('manifest.json');if(!entry)throw Error('Backup is missing manifest.json.');const data=validatePersonalBundle(JSON.parse(await entry.async('string')));
 const assets=[...new Set(data.pages.flatMap(p=>p.content.filter(b=>b.type==='image').map(b=>b.asset)))];for(const path of assets)if(!zip.file(path))throw Error('Backup is missing an image: '+path);
 root.innerHTML=`<section class="panel"><div class="panel-header"><h2>Import personal spaces</h2><button id="personal-import-back">Cancel</button></div><div class="page-editor"><p><strong>${data.spaces.length} spaces · ${data.pages.length} pages · ${assets.length} images</strong></p><p>Imported spaces share published pages with club members. Editing remains restricted to the owner until an author account is assigned. Existing completed imports are skipped, so retrying will not overwrite edits. Assign the correct member account in each space’s settings after import.</p><ul>${data.spaces.map(s=>`<li>${esc(s.name)}</li>`).join('')}</ul><p>External documents and videos remain links. This imports the personal pages and their images into your existing Supabase project.</p><button class="primary" id="personal-import-start">Import personal spaces</button><p id="personal-import-status" role="status"></p><p id="personal-error" class="form-error" role="alert"></p></div></section>`;
 root.querySelector('#personal-import-back').onclick=c.back;
 root.querySelector('#personal-import-start').onclick=async()=>{const start=root.querySelector('#personal-import-start'),back=root.querySelector('#personal-import-back'),status=root.querySelector('#personal-import-status');start.disabled=back.disabled=true;root.querySelector('#personal-error').textContent='';const prevent=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',prevent);
  // Keep the shared page navigation guard active during the migration.
  const {setPersonalImportBusy}=await import('./pages.js?v=personal-1');setPersonalImportBusy(true);
  try{const result=await runPersonalImport(data,async path=>{const bytes=await zip.file(path).async('uint8array');if(bytes.length>5*1024*1024)throw Error('An image exceeds 5 MB.');return new Blob([bytes],{type:'image/webp'});},s=>status.textContent=s);status.textContent=`Import complete: ${result.completed} pages imported, ${result.skipped} previously imported pages skipped.`;c.toast(status.textContent);back.textContent='View personal spaces';back.onclick=()=>c.reload();}
  catch(e){root.querySelector('#personal-error').textContent=e.message+' Retry this same backup to continue. Completed pages will be skipped.';start.disabled=false;start.textContent='Retry import';}
  finally{back.disabled=false;window.removeEventListener('beforeunload',prevent);setPersonalImportBusy(false);}
 };
}
