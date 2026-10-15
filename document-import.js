import {ommlToMathML} from './equations.js';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const M='http://schemas.openxmlformats.org/officeDocument/2006/math';
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const MAX=20*1024*1024;
let zipReady;
let fontMaps;
// Bundle the many PDF character maps into one file for a manageable GitHub upload.
export class LocalCMapReaderFactory {
 async fetch({name}){if(!/^[\w-]+$/.test(name))throw Error('Invalid character map.');if(!fontMaps)fontMaps=(async()=>{const Zip=await loadZip();const r=await fetch(new URL('./vendor/cmaps.zip',import.meta.url));if(!r.ok)throw Error('PDF character maps are missing.');return Zip.loadAsync(await r.arrayBuffer());})().catch(e=>{fontMaps=null;throw e;});const zip=await fontMaps,entry=zip.file(name+'.bcmap');if(!entry)throw Error('Unsupported PDF character map.');return {cMapData:await entry.async('uint8array'),isCompressed:true};}
}
export class LocalFontDataFactory {
 async fetch({filename}){if(!/^[\w.-]+$/.test(filename)||filename.includes('..'))throw Error('Invalid font filename.');const r=await fetch(new URL('./vendor/standard_fonts/'+filename,import.meta.url));if(!r.ok)throw Error('PDF font files are missing.');return new Uint8Array(await r.arrayBuffer());}
}
export function loadZip(){if(window.JSZip)return Promise.resolve(window.JSZip);return zipReady??=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=new URL('./vendor/jszip.min.js',import.meta.url).href;s.onload=()=>resolve(window.JSZip);s.onerror=()=>{zipReady=null;reject(Error('Word importer could not load. Check that the vendor folder was uploaded.'));};document.head.append(s);});}
function xml(text){if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('Unsupported XML declarations in document.');const d=new DOMParser().parseFromString(text,'application/xml');if(d.querySelector('parsererror'))throw Error('The Word document contains invalid XML.');return d;}
// Read central-directory sizes before decompressing, bounding ZIP expansion.
export function checkZipSize(buffer){const v=new DataView(buffer);let end=-1;for(let i=v.byteLength-22;i>=Math.max(0,v.byteLength-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}if(end<0)throw Error('Not a supported Word document.');const count=v.getUint16(end+10,true);let p=v.getUint32(end+16,true),total=0;if(count>3000)throw Error('Document contains too many embedded files.');for(let i=0;i<count;i++){if(p+46>v.byteLength||v.getUint32(p,true)!==0x02014b50)throw Error('Invalid Word archive.');total+=v.getUint32(p+24,true);if(total>80*1024*1024)throw Error('Expanded document exceeds 80 MB. Split the document first.');p+=46+v.getUint16(p+28,true)+v.getUint16(p+30,true)+v.getUint16(p+32,true);}return total;}
export async function compactImage(file,maxSide=1920){
 if(file.size>MAX)throw Error('An embedded image exceeds 20 MB.');
 const bitmap=await createImageBitmap(file);
 try{if(bitmap.width*bitmap.height>40000000)throw Error('An image exceeds 40 megapixels. Resize it first.');const scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(bitmap.width*scale));c.height=Math.max(1,Math.round(bitmap.height*scale));c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);const b=await new Promise(r=>c.toBlob(r,'image/webp',0.86));if(!b||b.type!=='image/webp'||b.size>5*1024*1024)throw Error('Could not compress an image below 5 MB.');return b;}finally{bitmap.close();}
}
export function validateImport(result){if(!result.blocks.length)throw Error('No readable content was found.');if(result.blocks.length>200)throw Error('Conversion exceeds 200 blocks. Split the document into smaller files.');if(new TextEncoder().encode(JSON.stringify(result.blocks)).length>450000)throw Error('Converted text is too large for one page. Split the document.');if(result.blocks.some(b=>(b.text||'').length>20000))throw Error('A text section is too long. Split the document.');if([...result.assets.values()].reduce((s,b)=>s+b.size,0)>30*1024*1024)throw Error('Converted images exceed 30 MB. Split the document.');return result;}
export async function convertDocument(file,progress=()=>{}){
 if(!file||file.size>MAX)throw Error('Choose a document no larger than 20 MB.');
 const extension=file.name.split('.').pop().toLowerCase();if(!['docx','pdf'].includes(extension))throw Error('Choose .docx or .pdf. Save older .doc files as .docx first.');
 progress('Reading document locally…');
 const result=extension==='docx'?await word(file,progress):await pdf(file,progress);
 result.title=file.name.replace(/\.(docx|pdf)$/i,'').slice(0,160);result.originalBytes=file.size;result.imageBytes=[...result.assets.values()].reduce((s,b)=>s+b.size,0);return validateImport(result);
}
async function word(file,progress){
 const data=await file.arrayBuffer();checkZipSize(data);const Zip=await loadZip();const zip=await Zip.loadAsync(data);const main=zip.file('word/document.xml');if(!main)throw Error('This file is not a Word .docx document.');
 const doc=xml(await main.async('string')),relsFile=zip.file('word/_rels/document.xml.rels');
 const rels=relsFile?xml(await relsFile.async('string')):null;const relationships=new Map(Array.from(rels?.getElementsByTagName('Relationship')||[]).map(e=>[e.getAttribute('Id'),{target:e.getAttribute('Target'),external:e.getAttribute('TargetMode')==='External'}]));
 const result={blocks:[],assets:new Map(),warnings:['Review equations, tables, and image placement before saving. Inline equations become separate equation blocks. Complex layouts, fonts, headers, footers, tracked changes, and comments are not reproduced. For exact visual appearance, import a PDF instead.']};
 const imageIds=new Map();let imageNo=0;
 function text(value,type='text'){if(!value.trim())return;const previous=result.blocks.at(-1);if(type==='text'&&previous?.type==='text'&&!previous.format&&(previous.text.length+value.length)<12000){previous.text+='\n\n'+value;return;}for(let i=0;i<value.length;i+=18000)result.blocks.push({type,text:value.slice(i,i+18000)});}
 async function image(rid){const rel=relationships.get(rid);if(!rel||rel.external){result.warnings.push('An externally linked image was omitted. Embed it in Word or import a PDF.');return;}
  const base=new URL(rel.target,'https://document.invalid/word/document.xml');if(base.origin!=='https://document.invalid'||!base.pathname.startsWith('/word/media/'))throw Error('Unsupported embedded-image path.');const path=decodeURIComponent(base.pathname.slice(1));let key=imageIds.get(path);if(!key){const entry=zip.file(path);if(!entry){result.warnings.push('An embedded image could not be found.');return;}const ext=path.split('.').pop().toLowerCase();const mime={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',bmp:'image/bmp',webp:'image/webp'}[ext];if(!mime){throw Error('An image uses '+ext+' format. Export the document as PDF to preserve it.');}progress('Compressing image '+(++imageNo)+'…');const bytes=await entry.async('uint8array');const blob=await compactImage(new Blob([bytes],{type:mime}));key='asset-'+imageNo;imageIds.set(path,key);result.assets.set(key,blob);}result.blocks.push({type:'image',asset:key,text:'Imported image '+imageNo});
 }
 async function paragraph(p){let buffer='';const style=p.getElementsByTagNameNS(W,'pStyle')[0]?.getAttributeNS(W,'val')||'';const type=/^heading[1-6]$/i.test(style)?'heading':p.getElementsByTagNameNS(W,'numPr').length?'list':'text';const flush=()=>{text(buffer,type);buffer='';};
  async function walk(e){if(e.nodeType!==1)return;if(e.namespaceURI===M&&(e.localName==='oMath'||e.localName==='oMathPara')){flush();result.blocks.push({type:'text',format:'mathml',text:ommlToMathML(e)});return;}
   if(e.namespaceURI===W){if(['pPr','rPr','del'].includes(e.localName))return;if(e.localName==='t'){buffer+=e.textContent;return;}if(['br','cr'].includes(e.localName)){buffer+='\n';return;}if(e.localName==='tab'){buffer+='\t';return;}}
   if(e.localName==='blip'){flush();await image(e.getAttributeNS(R,'embed')||e.getAttributeNS(R,'link'));return;}
   if(e.localName==='imagedata'){flush();await image(e.getAttributeNS(R,'id'));return;}
   for(const c of e.children)await walk(c);
  }await walk(p);flush();
 }
 async function walkBody(e){if(e.namespaceURI===W&&e.localName==='p'){await paragraph(e);return;}if(e.namespaceURI===W&&e.localName==='tbl'){result.warnings.push('Tables were converted in row/cell reading order; review their layout.');}for(const c of e.children)await walkBody(c);}
 await walkBody(doc.getElementsByTagNameNS(W,'body')[0]);result.warnings=[...new Set(result.warnings)];return result;
}
async function pdf(file,progress){
 const lib=await import('./vendor/pdf.mjs');lib.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
 const task=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,enableXfa:false,useWorkerFetch:false,CMapReaderFactory:LocalCMapReaderFactory,StandardFontDataFactory:LocalFontDataFactory});
 task.onPassword=()=>task.destroy();
 let doc;const result={blocks:[],assets:new Map(),warnings:['PDF pages are compressed images to preserve equations, diagrams, and layout. Their text and equations are not directly editable. Extracted text is included separately when available; check it for reading-order and equation errors. Scanned PDFs are preserved visually; OCR is not included.']};
 try{doc=await task.promise;if(doc.numPages>20)throw Error('PDFs are limited to 20 pages per import. Split this PDF first.');for(let n=1;n<=doc.numPages;n++){progress('Converting PDF page '+n+' of '+doc.numPages+'…');const page=await doc.getPage(n),base=page.getViewport({scale:1});const viewport=page.getViewport({scale:Math.min(3,1920/Math.max(base.width,base.height))});const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'white'}).promise;const blob=await new Promise(r=>canvas.toBlob(r,'image/webp',0.9));if(!blob||blob.type!=='image/webp'||blob.size>5*1024*1024)throw Error('A PDF page is too large to store. Split or simplify this PDF.');const key='pdf-'+n;result.assets.set(key,blob);result.blocks.push({type:'image',asset:key,text:'Document page '+n});const content=await page.getTextContent();const text=content.items.map(t=>t.str+(t.hasEOL?'\n':' ')).join('').trim();for(let i=0;i<text.length;i+=18000)result.blocks.push({type:'text',format:'transcript',text:text.slice(i,i+18000)});canvas.width=canvas.height=1;page.cleanup();}return result;}catch(e){throw Error('PDF conversion failed. Use an unlocked PDF. '+e.message);}finally{await task.destroy();}
}


