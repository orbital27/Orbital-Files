// Only a small, inert presentation-MathML vocabulary is accepted from documents.
const tags=new Set('math mrow mi mn mo mtext mspace mfrac msqrt mroot msup msub msubsup mover munder munderover mtable mtr mtd menclose'.split(' '));
const attrs=new Set('display mathvariant stretchy accent accentunder columnalign rowalign columnspacing rowspacing notation width height depth'.split(' '));
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function cleanMathML(source){
 if(source.length>20000||/<!DOCTYPE|<!ENTITY/i.test(source))throw Error('Equation is too large or contains unsupported XML.');
 const doc=new DOMParser().parseFromString(source,'application/xml');
 if(doc.querySelector('parsererror')||doc.documentElement.localName!=='math')throw Error('Invalid equation markup.');
 function copy(e){
  if(e.nodeType===3)return escape(e.textContent);
  if(e.nodeType!==1)return '';
  if(!tags.has(e.localName))throw Error('Unsupported equation element: '+e.localName);
  const a=[...e.attributes].filter(a=>attrs.has(a.localName)&&/^[\w .,+%−-]{0,100}$/.test(a.value)).map(a=>` ${a.localName}="${escape(a.value)}"`).join('');
  return `<${e.localName}${e.localName==='math'?' xmlns="http://www.w3.org/1998/Math/MathML"':''}${a}>${[...e.childNodes].map(copy).join('')}</${e.localName}>`;
 }
 return copy(doc.documentElement);
}
export function renderEquation(source){try{return `<div class="page-equation" aria-label="Equation">${cleanMathML(source)}</div>`;}catch{return '<p class="notice">This equation could not be displayed. Check its source in the editor.</p>';}}
export function ommlToMathML(root){
 const M='http://schemas.openxmlformats.org/officeDocument/2006/math';
 const children=e=>[...e.children].filter(c=>c.namespaceURI===M);
 const child=(e,n)=>children(e).find(c=>c.localName===n);
 const value=(e,n,fallback)=>{const prop=children(e).find(c=>c.localName.endsWith('Pr'));return child(prop||e,n)?.getAttributeNS(M,'val')??fallback;};
 const row=e=>`<mrow>${e?children(e).map(convert).join(''):''}</mrow>`;
 const part=(e,n)=>row(child(e,n));
 const op=s=>`<mo>${escape(s)}</mo>`;
 function convert(e){const n=e.localName;
  if(n.endsWith('Pr')||['ctrlPr','argPr'].includes(n))return '';
  if(['oMath','oMathPara','e','num','den','sub','sup','deg','lim','fName','mr'].includes(n))return row(e);
  if(n==='r')return children(e).map(convert).join('');
  if(n==='t'){const t=e.textContent;return `<${/^\d+(\.\d+)?$/.test(t)?'mn':'mi'}>${escape(t)}</${/^\d+(\.\d+)?$/.test(t)?'mn':'mi'}>`;}
  if(n==='f')return `<mfrac>${part(e,'num')}${part(e,'den')}</mfrac>`;
  if(n==='rad')return child(e,'deg')?.textContent.trim()?`<mroot>${part(e,'e')}${part(e,'deg')}</mroot>`:`<msqrt>${part(e,'e')}</msqrt>`;
  if(n==='sSup')return `<msup>${part(e,'e')}${part(e,'sup')}</msup>`;
  if(n==='sSub')return `<msub>${part(e,'e')}${part(e,'sub')}</msub>`;
  if(n==='sSubSup')return `<msubsup>${part(e,'e')}${part(e,'sub')}${part(e,'sup')}</msubsup>`;
  if(n==='d')return `<mrow>${op(value(e,'begChr','('))}${children(e).filter(c=>c.localName==='e').map(row).join(op(value(e,'sepChr','|')))}${op(value(e,'endChr',')'))}</mrow>`;
  if(n==='nary')return `<mrow><munderover>${op(value(e,'chr','∫'))}${part(e,'sub')}${part(e,'sup')}</munderover>${part(e,'e')}</mrow>`;
  if(n==='m')return `<mtable>${children(e).filter(c=>c.localName==='mr').map(r=>`<mtr>${children(r).filter(c=>c.localName==='e').map(c=>`<mtd>${row(c)}</mtd>`).join('')}</mtr>`).join('')}</mtable>`;
  if(n==='eqArr')return `<mtable columnalign="left">${children(e).filter(c=>c.localName==='e').map(c=>`<mtr><mtd>${row(c)}</mtd></mtr>`).join('')}</mtable>`;
  if(n==='acc')return `<mover accent="true">${part(e,'e')}${op(value(e,'chr','̂'))}</mover>`;
  if(n==='bar'){const tag=value(e,'pos','top')==='bot'?'munder':'mover';return `<${tag}>${part(e,'e')}${op('¯')}</${tag}>`;}
  if(n==='func')return `<mrow>${part(e,'fName')}${op('⁡')}${part(e,'e')}</mrow>`;
  if(n==='limLow')return `<munder>${part(e,'e')}${part(e,'lim')}</munder>`;
  if(n==='limUpp')return `<mover>${part(e,'e')}${part(e,'lim')}</mover>`;
  if(n==='box')return part(e,'e');
  if(n==='borderBox')return `<menclose notation="box">${part(e,'e')}</menclose>`;
  throw Error('Unsupported Word equation structure: '+n+'. Export this document as PDF to preserve its appearance.');
 }
 return cleanMathML(`<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">${convert(root)}</math>`);
}
