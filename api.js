const cfg=window.ORBITAL_CONFIG;
export const configured=Boolean(cfg.supabaseUrl&&cfg.supabasePublishableKey);
let session=null;
let refreshPromise=null;
try{session=JSON.parse(sessionStorage.getItem('orbital-session')||'null');}catch{}
function save(s){session=s; if(s)sessionStorage.setItem('orbital-session',JSON.stringify(s));else sessionStorage.removeItem('orbital-session');}
async function request(path,{method='GET',body,auth=true}={}){
 if(!configured)throw Error('Supabase is not connected yet. Use the sample workspace to explore the site.');
 if(auth&&session?.expires_at<Date.now()/1000+60)await refresh();
 const r=await fetch(cfg.supabaseUrl.replace(/\/$/,'')+path,{method,headers:{apikey:cfg.supabasePublishableKey,'Content-Type':'application/json',...(auth&&session?{Authorization:`Bearer ${session.access_token}`}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const data=await r.json().catch(()=>null);if(!r.ok){if(data?.code==='PGRST205')throw Error('The workspace database needs its initial SQL setup. Ask the owner to run the supplied migration.');throw Error(data?.msg||data?.error_description||data?.message||data?.error||'The request could not be completed.');}return data;
}
async function refresh(){if(!refreshPromise)refreshPromise=(async()=>{const data=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',auth:false,body:{refresh_token:session.refresh_token}});save({...data,expires_at:Date.now()/1000+data.expires_in});})().finally(()=>{refreshPromise=null;});await refreshPromise;}
export const api={
 async restore(){const hash=new URLSearchParams(location.hash.slice(1));if(hash.has('access_token')){save({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_at:Date.now()/1000+Number(hash.get('expires_in')||3600)});history.replaceState(null,'',location.pathname+location.search);}
 if(!session)return null;try{return await request('/auth/v1/user');}catch(e){save(null);throw e;}},
 async signin(email,password){const s=await request('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:{email,password}});save({...s,expires_at:Date.now()/1000+s.expires_in});return s.user;},
 async signup(email,password,name){return request(`/auth/v1/signup?redirect_to=${encodeURIComponent(location.origin+location.pathname)}`,{method:'POST',auth:false,body:{email,password,data:{name}}});},
 async reset(email){return request(`/auth/v1/recover?redirect_to=${encodeURIComponent(location.origin+location.pathname+'?recovery=1')}`,{method:'POST',auth:false,body:{email}});},
 async password(password){return request('/auth/v1/user',{method:'PUT',body:{password}});},
 async signout(){try{await request('/auth/v1/logout',{method:'POST'});}finally{save(null);}},
 async load(){const names=['projects','profiles','memberships','subteams','tasks'];const rows=await Promise.all(names.map(n=>request(`/rest/v1/${n}?select=*`)));return Object.fromEntries(names.map((n,i)=>[n,rows[i]]));},
 async mutate(action,payload){return request('/rest/v1/rpc/orbital_mutate',{method:'POST',body:{action,payload}});},
 async files(action,payload){return request('/functions/v1/teams-files',{method:'POST',body:{action,...payload}});},
 async upload(file,payload,onProgress){const upload=await this.files('upload',{...payload,name:file.name,size:file.size});const size=3276800;for(let offset=0;offset<file.size;offset+=size){const chunk=file.slice(offset,Math.min(offset+size,file.size));const r=await fetch(upload.uploadUrl,{method:'PUT',headers:{'Content-Range':`bytes ${offset}-${offset+chunk.size-1}/${file.size}`},body:chunk});if(!r.ok)throw Error('Upload interrupted. Please retry.');onProgress?.(Math.round((offset+chunk.size)/file.size*100));}return true;}
};
