export const statuses = ['Not started','In progress','Blocked','Complete'];
export const priorities = ['Low','Medium','High','Critical'];
export const progress = tasks => tasks.length ? Math.round(tasks.filter(t=>t.status==='Complete').length/tasks.length*100) : 0;
export function descendants(teams,id){const found=new Set([id]);let changed=true;while(changed){changed=false;for(const t of teams)if(found.has(t.parent_id)&&!found.has(t.id)){found.add(t.id);changed=true;}}return found;}
export function validateTask(task,tasks,members,teams){
 if(!task.name?.trim())throw Error('Give this task a name.');
 if(!task.start_date||!task.end_date||task.end_date<task.start_date)throw Error('End date must be on or after start date.');
 if(!priorities.includes(task.importance))throw Error('Choose a valid importance.');
 if(task.subteam_id&&!teams.some(t=>t.id===task.subteam_id&&t.project_id===task.project_id))throw Error('Choose a subteam in this project.');
 for(const id of task.assignees||[])if(!members.some(m=>m.user_id===id&&m.project_id===task.project_id))throw Error('Assignees must belong to this project.');
 const byId=new Map(tasks.map(t=>[t.id,t]));byId.set(task.id,task);
 for(const id of task.dependencies||[]){if(!byId.has(id)||byId.get(id).project_id!==task.project_id)throw Error('Dependencies must be in the same project.');}
 const visiting=new Set(),visited=new Set();function visit(id){if(visiting.has(id))throw Error('This dependency would create a cycle.');if(visited.has(id))return;visiting.add(id);for(const d of byId.get(id)?.dependencies||[])visit(d);visiting.delete(id);visited.add(id);}visit(task.id);
 return task;
}
export function graphLayout(tasks){const map=new Map(tasks.map(t=>[t.id,t])),depth=new Map();function level(t,seen=new Set()){if(depth.has(t.id))return depth.get(t.id);if(seen.has(t.id))return 0;seen.add(t.id);const deps=(t.dependencies||[]).map(id=>map.get(id)).filter(Boolean);const n=deps.length?1+Math.max(...deps.map(d=>level(d,new Set(seen)))):0;depth.set(t.id,n);return n;}const rows={};return tasks.map(t=>{const col=level(t),row=rows[col]||0;rows[col]=row+1;return {...t,x:col*290+24,y:row*140+24};});}
export function demoData(){
 const projects=[{id:'spaceshot',name:'Spaceshot',description:'Student-built. Space-bound.',code:'SP'},{id:'hapsis',name:'HAPSIS',description:'High-altitude platform systems.',code:'HA'},{id:'payloads',name:'Payloads',description:'Science beyond the ground.',code:'PL'}];
 const profiles=[{id:'owner',name:'Alex Morgan',email:'alex@example.edu',role:'owner'},{id:'maya',name:'Maya Chen',email:'maya@example.edu',role:'admin'},{id:'jordan',name:'Jordan Patel',email:'jordan@example.edu',role:'member'},{id:'riley',name:'Riley Thompson',email:'riley@example.edu',role:'member'}];
 const memberships=projects.flatMap(p=>profiles.map(u=>({project_id:p.id,user_id:u.id})));
 const subteams=projects.flatMap(p=>['Propulsion','Avionics','Structures','Recovery'].map((name,i)=>({id:`${p.id}-${i}`,project_id:p.id,parent_id:null,name,description:['Engine design and testing','Flight electronics and telemetry','Airframe and integration','Safe descent and retrieval'][i]})));
 subteams.push({id:'spaceshot-firmware',project_id:'spaceshot',parent_id:'spaceshot-1',name:'Flight software',description:'Guidance, navigation, and control'});
 const tasks=projects.flatMap(p=>[
 {name:'Propellant characterization',sub:0,start:'2026-09-21',end:'2026-10-02',status:'Complete',importance:'High',assignees:['maya','jordan'],description:'Characterize candidate propellants and document the test results.'},
 {name:'Injector design review',sub:0,start:'2026-10-03',end:'2026-10-12',status:'In progress',importance:'Critical',assignees:['jordan'],description:'Review the injector geometry, manufacturing tolerances, and test plan.',deps:[0]},
 {name:'Flight computer bring-up',sub:1,start:'2026-09-25',end:'2026-10-08',status:'In progress',importance:'High',assignees:['riley','owner'],description:'Validate power rails and sensor interfaces on the flight computer.'},
 {name:'Telemetry integration',sub:1,start:'2026-10-09',end:'2026-10-18',status:'Not started',importance:'Medium',assignees:['riley'],description:'Integrate and test the telemetry link.',deps:[2]},
 {name:'Airframe load analysis',sub:2,start:'2026-09-23',end:'2026-10-05',status:'Complete',importance:'High',assignees:['maya'],description:'Review load cases and publish the structural analysis.'},
 {name:'Recovery deployment test',sub:3,start:'2026-10-06',end:'2026-10-15',status:'Blocked',importance:'Critical',assignees:['owner','jordan'],description:'Complete the deployment test after structural interfaces are approved.',deps:[4]},
 {name:'Integrated ground test',sub:2,start:'2026-10-19',end:'2026-10-28',status:'Not started',importance:'High',assignees:['owner','maya'],description:'Execute the full-system ground test checklist.',deps:[1,3,5]}
 ].map((t,i)=>({id:`${p.id}-t${i}`,project_id:p.id,subteam_id:`${p.id}-${t.sub}`,name:t.name,description:t.description,start_date:t.start,end_date:t.end,status:t.status,importance:t.importance,assignees:t.assignees,dependencies:(t.deps||[]).map(d=>`${p.id}-t${d}`)})));
 return {projects,profiles,memberships,subteams,tasks};
}
