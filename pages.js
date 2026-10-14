import {api} from './api.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>[...root.querySelectorAll(s)];
let active=null;
const samples=new Map(),sampleHistory=new Map(),sampleImages=new Map();
export function resetDemoPages(){for(const url of sampleImages.values())URL.revokeObjectURL(url);samples.clear();sampleHistory.clear();sampleImages.clear();}
const clone=x=>structuredClone(x);
export function leavePages(){if(active?.busy){alert('Wait for the current save or upload to finish.');return false;}if(active?.dirty&&!confirm('Leave without saving? Download your draft first if you want to keep it.'))return false;active=null;return true;}
window.addEventListener('beforeunload',e=>{if(active?.dirty||active?.busy){e.preventDefault();e.returnValue='';}});
const stamp=p=>new Date(p.updated_at).toLocaleString();
const canManage=(c,p)=>c.manager||p.created_by===c.userId;
const readable=(c,p)=>p.project_id===c.projectId&&((p.status==='published'&&!p.deleted_at)||canManage(c,p));
function download(name,data,type='application/json'){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function setError(c,error){if(!c.root.isConnected)return;const el=$('#page-error',c.root);if(el)el.textContent=error.message||String(error);else c.toast(error.message||String(error));}
async function save(c,action,payload){
 if(!c.demo)return api.pageSave(action,payload);
 const rows=samples.get(c.projectId),old=rows.find(x=>x.id===payload.id);
 if(old&&old.version!==payload.expected_version)throw Error('Someone changed this page. Download your draft and reopen the latest version.');
 if(old&&!readable(c,old))throw Error('Page access denied.');
 let p=clone(old||{id:payload.id,project_id:c.projectId,created_by:c.userId,version:0,deleted_at:null});
 if(action==='save')Object.assign(p,{title:payload.title,content:clone(payload.content),status:payload.status,subteam_id:payload.subteam_id});
 if(action==='trash'||action==='restore'){if(!canManage(c,p))throw Error('Only the author or an admin can do this.');p.deleted_at=action==='trash'?new Date().toISOString():null;}
 if(action==='revision'){const r=sampleHistory.get(p.id).find(x=>x.version===payload.revision);Object.assign(p,{title:r.title,content:clone(r.content),subteam_id:r.subteam_id});}
 p.version++;p.updated_at=new Date().toISOString();p.updated_by=c.userId;
 if(old)rows[rows.indexOf(old)]=p;else rows.push(p);
 sampleHistory.set(p.id,[clone(p),...(sampleHistory.get(p.id)||[])]);return clone(p);
}
async function getPage(c,id){if(!c.demo)return api.page(id);const p=samples.get(c.projectId).find(x=>x.id===id&&readable(c,x));if(!p)throw Error('Page unavailable.');return clone(p);}
async function history(c,id){return c.demo?clone(sampleHistory.get(id)||[]):api.revisions(id);}
export function mountPages(root,context){
 active={...context,root,dirty:false,busy:false,offset:0,search:'',team:'',trash:false};
 if(context.demo&&!samples.has(context.projectId)){
  const p={id:crypto.randomUUID(),project_id:context.projectId,title:'Welcome to the project handbook',subteam_id:null,status:'published',version:1,created_by:context.userId,updated_by:context.userId,updated_at:new Date().toISOString(),deleted_at:null,content:[{type:'heading',text:'A home for shared knowledge'},{type:'text',text:'Keep meeting notes, engineering procedures, and progress reports here. Every published page belongs to the project workspace.'},{type:'list',text:'Create a page and save a private draft\nAdd headings, notes, links, and images\nPublish when it is ready for the team'},{type:'text',text:'This is sample content. Sample changes reset when the browser reloads.'}]};
  samples.set(context.projectId,[p]);sampleHistory.set(p.id,[clone(p)]);
 }
 list(active);
}
function shell(c,body){c.root.innerHTML=`<section class="panel pages-panel">${body}<p class="form-error page-error" id="page-error" role="alert"></p></section>`;}
async function list(c){
 if(active!==c)return;c.dirty=false;
 shell(c,`<div class="panel-header"><div><h2>${c.trash?'Page trash':'Project handbook'}</h2><p>${c.trash?'Pages stay here until restored.':'Write, illustrate, and share what your team knows.'}</p></div><div class="toolbar"><button id="page-trash">${c.trash?'Back to pages':'Trash'}</button>${c.manager?'<button id="page-export">Export backup</button>':''}<button class="primary" id="page-new">New page</button></div></div><div class="page-filters"><label>Search titles<input id="page-search" value="${esc(c.search)}" placeholder="Find a page…"></label><label>Subteam<select id="page-team"><option value="">All subteams</option>${c.teams.map(t=>`<option value="${esc(t.id)}" ${c.team===t.id?'selected':''}>${esc('— '.repeat(t.depth)+t.name)}</option>`).join('')}</select></label><button id="page-find">Search</button></div><div id="page-results" class="page-grid"><p>Loading pages…</p></div><div class="page-pagination"><button id="page-prev" ${c.offset===0?'disabled':''}>Previous</button><span>Page ${Math.floor(c.offset/24)+1}</span><button id="page-next" disabled>Next</button></div>`);
 $('#page-new',c.root).onclick=()=>edit(c,{id:crypto.randomUUID(),project_id:c.projectId,created_by:c.userId,version:0,title:'',status:'draft',subteam_id:null,content:[{type:'text',text:''}]});
 $('#page-trash',c.root).onclick=()=>{c.trash=!c.trash;c.offset=0;list(c);};
 $('#page-export',c.root)?.addEventListener('click',()=>backup(c));
 $('#page-find',c.root).onclick=()=>{c.search=$('#page-search',c.root).value.trim();c.team=$('#page-team',c.root).value;c.offset=0;list(c);};
 $('#page-search',c.root).onkeydown=e=>{if(e.key==='Enter')$('#page-find',c.root).click();};
 $('#page-prev',c.root).onclick=()=>{c.offset=Math.max(0,c.offset-24);list(c);};
 $('#page-next',c.root).onclick=()=>{c.offset+=24;list(c);};
 const target=$('#page-results',c.root);
 try{
  const rows=c.demo?samples.get(c.projectId).filter(p=>readable(c,p)&&Boolean(p.deleted_at)===c.trash&&(!c.team||p.subteam_id===c.team)&&p.title.toLowerCase().includes(c.search.toLowerCase())).slice(c.offset,c.offset+24):await api.pageList(c.projectId,c);
  if(!target.isConnected)return;
  target.innerHTML=rows.map(p=>`<button class="page-card" data-page="${esc(p.id)}"><span class="eyebrow muted">${esc(c.teams.find(t=>t.id===p.subteam_id)?.name||'Project-wide')}</span><h3>${esc(p.title)}</h3><span class="badge">${esc(p.deleted_at?'In trash':p.status)}</span><p class="small muted">Updated ${esc(stamp(p))} · v${p.version}</p></button>`).join('')||'<div class="empty"><h3>No pages here yet</h3><p>Create a page or adjust your search.</p></div>';
  $('#page-next',c.root).disabled=rows.length<24;
  $$('[data-page]',c.root).forEach(b=>b.onclick=async()=>{try{await view(c,await getPage(c,b.dataset.page));}catch(e){setError(c,e);}});
 }catch(e){if(target.isConnected){target.innerHTML='<div class="empty">Pages could not be loaded. Your existing tasks are still available.</div>';setError(c,e);}}
}
export function renderBlocks(blocks){return blocks.map(b=>{
 if(b.type==='heading')return `<h2>${esc(b.text)}</h2>`;
 if(b.type==='list')return `<ul>${(b.text||'').split('\n').filter(Boolean).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
 if(b.type==='link'){try{const u=new URL(b.url);if(!['https:','http:'].includes(u.protocol))throw Error();return `<p><a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(b.text||u.href)}</a></p>`;}catch{return '<p>Invalid link</p>';}}
 if(b.type==='image')return `<figure><img data-page-image="${esc(b.path)}" alt="${esc(b.text||'')}" loading="lazy"><figcaption>${esc(b.text||'')}</figcaption></figure>`;
 return `<p class="page-text">${esc(b.text)}</p>`;
}).join('');}
async function loadImages(c,root){for(const img of $$('[data-page-image]',root)){try{const url=c.demo?sampleImages.get(img.dataset.pageImage):await api.imageUrl(img.dataset.pageImage);if(!url)throw Error('Image unavailable');if(root.isConnected)img.src=url;}catch{if(root.isConnected){const msg=document.createElement('span');msg.textContent='Image unavailable. Reopen this page to retry.';img.replaceWith(msg);}}}}
async function view(c,p){
 if(active!==c)return;c.dirty=false;
 shell(c,`<div class="panel-header"><button id="page-back">← All pages</button><div class="toolbar">${p.deleted_at?'<button class="primary" id="page-restore">Restore page</button>':'<button id="page-history">History</button><button class="primary" id="page-edit">Edit page</button>'}${!p.deleted_at&&canManage(c,p)?'<button class="danger" id="page-delete">Move to trash</button>':''}</div></div><article class="page-article"><div class="eyebrow muted">${esc(c.teams.find(t=>t.id===p.subteam_id)?.name||'Project-wide')} / ${esc(p.status)}</div><h1>${esc(p.title)}</h1><p class="small muted">Version ${p.version} · Updated ${esc(stamp(p))}</p><div class="page-body">${renderBlocks(p.content)}</div></article>`);
 $('#page-back',c.root).onclick=()=>list(c);$('#page-edit',c.root)?.addEventListener('click',()=>edit(c,p));
 $('#page-history',c.root)?.addEventListener('click',()=>revisions(c,p));
 $('#page-delete',c.root)?.addEventListener('click',async()=>{if(confirm('Move this page to trash? It can be restored later.'))await change(c,p,'trash');});
 $('#page-restore',c.root)?.addEventListener('click',()=>change(c,p,'restore'));
 await loadImages(c,$('.page-body',c.root));
}
async function change(c,p,action,extra={}){if(c.busy)return;c.busy=true;try{await save(c,action,{id:p.id,expected_version:p.version,...extra});c.toast(action==='trash'?'Page moved to trash.':'Page restored as a new version.');await list(c);}catch(e){setError(c,e);}finally{c.busy=false;}}
async function revisions(c,p){
 shell(c,'<div class="panel-header"><h2>Revision history</h2><button id="history-back">Back to page</button></div><div id="history-list" class="page-history">Loading history…</div>');
 $('#history-back',c.root).onclick=()=>view(c,p);const target=$('#history-list',c.root);
 try{const rows=await history(c,p.id);if(!target.isConnected)return;
 target.innerHTML=rows.map((r,i)=>`<details><summary>Version ${r.version} · ${esc(r.title)} · ${esc(new Date(r.saved_at||r.updated_at).toLocaleString())}${i===0?' (current)':''}</summary><div class="page-body">${renderBlocks(r.content)}</div>${r.version!==p.version?`<button data-revision="${r.version}">Restore this content</button>`:''}</details>`).join('');
 $$('details',target).forEach(d=>d.ontoggle=()=>{if(d.open)loadImages(c,d);});
 $$('[data-revision]',target).forEach(b=>b.onclick=()=>{if(confirm('Restore this content? Your current content will remain in history.'))change(c,p,'revision',{revision:Number(b.dataset.revision)});});
 }catch(e){setError(c,e);}
}
function edit(c,page){
 if(active!==c)return;const p=clone(page);c.dirty=false;
 shell(c,`<div class="panel-header"><div><h2>${p.version?'Edit page':'Create a page'}</h2><p id="page-save-state">${p.version?'Editing version '+p.version:'Not saved yet'} · Changes save when you choose Save or Publish.</p></div><div class="toolbar"><button id="edit-cancel">Cancel</button><button id="draft-download">Download draft</button>${canManage(c,p)?'<button id="save-draft">Save draft</button>':''}<button class="primary" id="page-publish">${p.status==='published'?'Save changes':'Publish page'}</button></div></div><div class="page-editor"><label>Page title<input id="edit-title" maxlength="160" value="${esc(p.title)}" placeholder="e.g. Flight readiness checklist" required></label><label>Subteam<select id="edit-team"><option value="">Project-wide</option>${c.teams.map(t=>`<option value="${esc(t.id)}" ${p.subteam_id===t.id?'selected':''}>${esc('— '.repeat(t.depth)+t.name)}</option>`).join('')}</select></label><div class="notice">Drafts are visible to the original author and admins. Published pages can be edited by project members. Save a draft before uploading your first image.</div><div id="edit-blocks"></div><div class="page-add toolbar"><span>Add content:</span>${['text','heading','list','link'].map(t=>`<button data-add="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}<button id="add-image">Image</button><input id="image-file" type="file" accept="image/png,image/jpeg,image/webp" hidden></div><p class="small muted">Up to 200 blocks per page. PNG, JPG, or WebP images up to 10 MB before resizing; stored images up to 5 MB. Images are resized to a maximum of 1920 pixels.</p><details id="edit-preview"><summary>Preview page</summary><div class="page-body" id="preview-body"></div></details></div>`);
 const dirty=()=>{c.dirty=true;$('#page-save-state',c.root).textContent='Unsaved changes';};
 $('#edit-title',c.root).oninput=e=>{p.title=e.target.value;dirty();};$('#edit-team',c.root).onchange=e=>{p.subteam_id=e.target.value||null;dirty();};
 const blocks=$('#edit-blocks',c.root);
 function draw(){blocks.innerHTML=p.content.map((b,i)=>`<section class="edit-block"><div class="edit-block-head"><strong>${esc(b.type[0].toUpperCase()+b.type.slice(1))}</strong><div><button data-up="${i}" aria-label="Move block ${i+1} up" ${i===0?'disabled':''}>↑</button><button data-down="${i}" aria-label="Move block ${i+1} down" ${i===p.content.length-1?'disabled':''}>↓</button><button data-remove="${i}" aria-label="Remove block ${i+1}">Remove</button></div></div>${b.type==='image'?`<img class="editor-image" data-page-image="${esc(b.path)}" alt="${esc(b.text||'')}"><label>Image description / caption<input data-text="${i}" maxlength="2000" value="${esc(b.text)}"></label>`:`<label>${b.type==='list'?'One item per line':b.type==='link'?'Link label':'Content'}<textarea data-text="${i}" maxlength="20000" rows="${b.type==='heading'?2:4}">${esc(b.text)}</textarea></label>${b.type==='link'?`<label>URL<input data-url="${i}" type="url" value="${esc(b.url||'')}" placeholder="https://…"></label>`:''}`}</section>`).join('');
  $$('[data-text]',blocks).forEach(e=>e.oninput=()=>{p.content[+e.dataset.text].text=e.value;dirty();});$$('[data-url]',blocks).forEach(e=>e.oninput=()=>{p.content[+e.dataset.url].url=e.value;dirty();});
  $$('[data-remove]',blocks).forEach(e=>e.onclick=()=>{if(confirm('Remove this block from the draft?')){p.content.splice(+e.dataset.remove,1);dirty();draw();}});
  for(const [key,delta] of [['up',-1],['down',1]])$$(`[data-${key}]`,blocks).forEach(e=>e.onclick=()=>{const i=+e.dataset[key];[p.content[i],p.content[i+delta]]=[p.content[i+delta],p.content[i]];dirty();draw();});
  loadImages(c,blocks);
 }
 draw();
 $$('[data-add]',c.root).forEach(b=>b.onclick=()=>{if(p.content.length>=200){setError(c,Error('This page already has 200 blocks.'));return;}p.content.push({type:b.dataset.add,text:'',...(b.dataset.add==='link'?{url:''}:{})});dirty();draw();blocks.lastElementChild?.scrollIntoView({block:'nearest'});});
 $('#edit-cancel',c.root).onclick=()=>{if(c.busy)return;if(!c.dirty||confirm('Discard unsaved changes?'))list(c);};
 $('#draft-download',c.root).onclick=()=>download('orbital-page-draft.json',JSON.stringify(p,null,2));
 $('#edit-preview',c.root).ontoggle=()=>{const target=$('#preview-body',c.root);target.innerHTML=renderBlocks(p.content);loadImages(c,target);};
 const lock=flag=>{c.busy=flag;$$('button,input,textarea,select',c.root).forEach(e=>{if(flag){e.dataset.wasDisabled=String(e.disabled);e.disabled=true;}else if(e.dataset.wasDisabled!==undefined){e.disabled=e.dataset.wasDisabled==='true';delete e.dataset.wasDisabled;}});};
 async function commit(status){if(c.busy)return;try{
   if(!p.title.trim())throw Error('Give this page a title.');
   for(const b of p.content)if(b.type==='link'){const url=new URL(b.url);if(!['https:','http:'].includes(url.protocol))throw Error('Links must use http:// or https://.');}
   lock(true);const saved=await save(c,'save',{...p,title:p.title.trim(),status,expected_version:p.version});c.dirty=false;c.toast(status==='draft'?'Draft saved.':'Page published.');
   if(status==='draft')edit(c,saved);else await view(c,saved);
  }catch(e){setError(c,e);}finally{lock(false);}}
 $('#save-draft',c.root)?.addEventListener('click',()=>commit('draft'));$('#page-publish',c.root).onclick=()=>commit('published');
 $('#add-image',c.root).onclick=()=>{if(!p.version){setError(c,Error('Save a draft first, then upload an image.'));return;}if(p.content.length>=200){setError(c,Error('This page already has 200 blocks.'));return;}$('#image-file',c.root).click();};
 $('#image-file',c.root).onchange=async e=>{const file=e.target.files[0];if(!file)return;lock(true);try{const blob=await compressImage(file);const path=`${c.projectId}/${p.id}/${crypto.randomUUID()}.webp`;if(c.demo)sampleImages.set(path,URL.createObjectURL(blob));else await api.imageUpload(path,blob);p.content.push({type:'image',path,text:file.name.replace(/\.[^.]+$/,'')});dirty();draw();c.toast('Image uploaded. Save the page to keep it in the content.');}catch(error){setError(c,error);}finally{lock(false);}};
}
async function compressImage(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a PNG, JPG, or WebP image.');
 if(file.size>10*1024*1024)throw Error('Choose an image smaller than 10 MB.');
 const bitmap=await createImageBitmap(file);try{if(bitmap.width*bitmap.height>40000000)throw Error('Image dimensions are too large. Resize it first.');
 const scale=Math.min(1,1920/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.85));if(!blob||blob.type!=='image/webp'||blob.size>5*1024*1024)throw Error('Could not prepare this image. Try a smaller one.');return blob;}finally{bitmap.close();}
}
async function backup(c){
 if(c.busy)return;c.busy=true;const b=$('#page-export',c.root);b.disabled=true;
 try{b.textContent='Collecting pages…';const data=c.demo?{pages:clone(samples.get(c.projectId)),revisions:[...sampleHistory.values()].flat().filter(p=>p.project_id===c.projectId)}:await api.pageExport(c.projectId);
  const paths=[...new Set([...data.pages,...data.revisions].flatMap(p=>p.content.filter(b=>b.type==='image').map(b=>b.path)))];
  // Keep backups bounded in browser memory: metadata and each image are separate downloads.
  const manifest={format:'orbital-pages-backup-v1',project_id:c.projectId,exported_at:new Date().toISOString(),...data,images:paths};
  download(`orbital-pages-${c.projectId}.json`,JSON.stringify(manifest,null,2));
  b.textContent='Preparing image downloads…';
  const links=[];for(const path of paths){const url=c.demo?sampleImages.get(path):await api.imageUrl(path);links.push({path,url});}
  const panel=document.createElement('div');panel.className='notice';panel.innerHTML=`<strong>Page and revision backup downloaded.</strong><p>${paths.length?'Download each original image below into the same backup folder. Image links expire in five minutes; export again to refresh them. Keep the JSON manifest with these images.':'This project has no images to download.'}</p>${links.map(x=>`<p><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer" download="${esc(x.path.split('/').pop())}">${esc(x.path)}</a></p>`).join('')}<p>A backup is complete only after all listed images have been saved. Keep a copy outside this website.</p>`;c.root.prepend(panel);c.toast('Backup export ready.');
 }catch(e){setError(c,e);}finally{c.busy=false;if(b.isConnected){b.disabled=false;b.textContent='Export backup';}}
}
