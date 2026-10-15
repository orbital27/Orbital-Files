const cfg=window.ORBITAL_CONFIG;
export const configured=Boolean(cfg.supabaseUrl&&cfg.supabasePublishableKey);
let session=null;
let refreshPromise=null;
try{session=JSON.parse(sessionStorage.getItem('orbital-session')||'null');}catch{}
function save(s){session=s; if(s)sessionStorage.setItem('orbital-session',JSON.stringify(s));else sessionStorage.removeItem('orbital-session');}
async function request(path,{method='GET',body,auth=true,raw=false}={}){
 if(!configured)throw Error('Supabase is not connected yet. Use the sample workspace to explore the site.');
 if(auth&&session?.expires_at<Date.now()/1000+60)await refresh();
 const r=await fetch(cfg.supabaseUrl.replace(/\/$/,'')+path,{method,headers:{apikey:cfg.supabasePublishableKey,'Content-Type':raw?body.type:'application/json',...(auth&&session?{Authorization:`Bearer ${session.access_token}`}:{})},...(body!==undefined?{body:raw?body:JSON.stringify(body)}:{})});
 const data=await r.json().catch(()=>null);if(!r.ok){if(data?.code==='PGRST202'&&path.includes('orbital_personal_mutate'))throw Error('Run 004_personal_spaces.sql in Supabase SQL Editor to enable personal pages.');if(data?.code==='PGRST202'&&path.includes('orbital_project_lifecycle'))throw Error('Run 003_project_lifecycle.sql in Supabase SQL Editor to enable project archive and deletion.');if(data?.code==='PGRST202'||(data?.code==='PGRST205'&&/pages|revisions/.test(path)))throw Error('Pages needs its database update. Run 002_pages.sql in Supabase SQL Editor.');if(data?.code==='PGRST205')throw Error('The workspace database needs its initial SQL setup. Ask the owner to run the supplied migration.');throw Error(data?.msg||data?.error_description||data?.message||data?.error||'The request could not be completed.');}return data;
}
async function refresh(){if(!refreshPromise)refreshPromise=(async()=>{const data=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',auth:false,body:{refresh_token:session.refresh_token}});save({...data,expires_at:Date.now()/1000+data.expires_in});})().finally(()=>{refreshPromise=null;});await refreshPromise;}
export async function allRows(table,query='',order='id.asc'){
 const result=[];let offset=0;while(true){const chunk=await request(`/rest/v1/${table}?select=*&order=${order}&limit=100&offset=${offset}${query}`);result.push(...chunk);if(chunk.length<100)return result;offset+=chunk.length;}
}
export const api={
 async restore(){const hash=new URLSearchParams(location.hash.slice(1));if(hash.has('access_token')){save({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_at:Date.now()/1000+Number(hash.get('expires_in')||3600)});history.replaceState(null,'',location.pathname+location.search);}
 if(!session)return null;try{return await request('/auth/v1/user');}catch(e){save(null);throw e;}},
 async signin(email,password){const s=await request('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:{email,password}});save({...s,expires_at:Date.now()/1000+s.expires_in});return s.user;},
 async signup(email,password,name){return request(`/auth/v1/signup?redirect_to=${encodeURIComponent(location.origin+location.pathname)}`,{method:'POST',auth:false,body:{email,password,data:{name}}});},
 async reset(email){return request(`/auth/v1/recover?redirect_to=${encodeURIComponent(location.origin+location.pathname+'?recovery=1')}`,{method:'POST',auth:false,body:{email}});},
 async password(password){return request('/auth/v1/user',{method:'PUT',body:{password}});},
 async signout(){try{await request('/auth/v1/logout',{method:'POST'});}finally{save(null);}},
 async load(){const names=['projects','profiles','memberships','subteams','tasks'];const rows=await Promise.all(names.map(n=>allRows(n,'',n==='memberships'?'project_id.asc,user_id.asc':'id.asc')));return Object.fromEntries(names.map((n,i)=>[n,rows[i]]));},
 async mutate(action,payload){return request('/rest/v1/rpc/orbital_mutate',{method:'POST',body:{action,payload}});},
 async personal(action,payload){return request('/rest/v1/rpc/orbital_personal_mutate',{method:'POST',body:{action,payload}});},
 async projectLifecycle(action,payload){return request('/rest/v1/rpc/orbital_project_lifecycle',{method:'POST',body:{action,payload}});},
 async deleteProject(id,confirmation,onProgress=()=>{}){
  await this.projectLifecycle('begin_delete',{id,confirmation});
  let removed=0,previous='';
  while(true){
   const paths=await this.projectLifecycle('delete_assets',{id});
   if(!paths.length)break;
   const signature=JSON.stringify(paths);if(signature===previous)throw Error('Image cleanup did not advance. Retry permanent deletion from Manage projects.');previous=signature;
   await request('/storage/v1/object/orbital-pages',{method:'DELETE',body:{prefixes:paths}});
   removed+=paths.length;onProgress(removed);
  }
  await this.projectLifecycle('finish_delete',{id});
 },
 async pageList(projectId,{offset=0,trash=false,search='',team=''}={}){
  return request(`/rest/v1/pages?select=id,project_id,subteam_id,title,status,version,created_by,updated_at,deleted_at&project_id=eq.${projectId}&deleted_at=${trash?'not.is.null':'is.null'}&order=updated_at.desc,id.asc&limit=24&offset=${offset}${team?'&subteam_id=eq.'+team:''}${search?'&title=ilike.'+encodeURIComponent('*'+search.replace(/[%*_]/g,'')+'*'):''}`);
 },
 async page(id){const rows=await request(`/rest/v1/pages?id=eq.${id}&select=*`);if(!rows.length)throw Error('Page unavailable. It may be private or your access has changed.');return rows[0];},
 async pageSave(action,payload){return request('/rest/v1/rpc/orbital_page_mutate',{method:'POST',body:{action,payload}});},
 async revisions(id){return allRows('page_revisions',`&page_id=eq.${id}`,'version.desc');},
 async imageUpload(path,file){return request('/storage/v1/object/orbital-pages/'+path,{method:'POST',body:file,raw:true});},
 async imageUrl(path){const r=await request('/storage/v1/object/sign/orbital-pages/'+path,{method:'POST',body:{expiresIn:300}});return cfg.supabaseUrl.replace(/\/$/,'')+'/storage/v1'+r.signedURL;},
 async pageExport(projectId){const pages=await allRows('pages',`&project_id=eq.${projectId}`);const revisions=[];for(const p of pages)revisions.push(...await this.revisions(p.id));return {pages,revisions};}
};
