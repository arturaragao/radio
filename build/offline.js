// Offline (1.42): indicador discreto "offline · N pendentes" e download único das imagens (questões e notas) para abrir tudo sem internet.
// O resto já é local: o service worker serve o app e o vendor do cache (atualiza por trás), as questões vêm do IndexedDB (shim.js), o plano/notas/páginas/frases/agenda
// do localStorage, e toda gravação fica na fila do aparelho (notas: NT_PEND; plano: SM.sujo + fusão; progresso: dirty/estDirty) até o GitHub confirmar, sem duplicar.
const OF={prog:'',baixando:false},OF_FLAG='bcbr_baixou';
function ofPendentes(){
  let n=0;
  try{if(typeof ntTemPendentes==='function'&&ntTemPendentes())n++;if(SM.sujo)n++}catch(e){}
  try{n+=dirty.size+(estDirty?1:0)}catch(e){}   // progresso das questões (app): semanas e estado ainda não enviados
  return n;
}
function ofTexto(){
  const off=navigator.onLine===false||!!window.BCBR?.semRede,n=ofPendentes(),p=n===1?'pendente':'pendentes';
  if(OF.prog)return `baixando para offline · ${OF.prog}`;
  return off?`offline · ${n} ${p}`:n?`sincronizando · ${n} ${p}`:'';
}
function ofPinta(){
  const t=ofTexto();let el=document.getElementById('bcbr_off');
  if(!t){el?.remove();return}
  if(!el){el=document.createElement('div');el.id='bcbr_off';el.className='bcbr-off';el.setAttribute('role','status');document.body.appendChild(el)}
  if(el.textContent!==t)el.textContent=t;
}
// Nomes das imagens das notas e páginas (./img/nota-….jpg) para entrarem no "baixar tudo".
function ofImagensNotas(){
  const s=JSON.stringify(SyncNotas.estado().abertas),out=new Set();
  for(const m of s.matchAll(/\.\/img\/([\w.-]+)/g))out.add(m[1]);
  return [...out];
}
async function ofBaixaTudo(){
  if(OF.baixando||!window.BCBR?.baixarTudo||navigator.onLine===false)return;
  OF.baixando=true;
  try{await BCBR.baixarTudo((i,t)=>{OF.prog=`${i}/${t}`;ofPinta()},ofImagensNotas());try{localStorage.setItem(OF_FLAG,'1')}catch(e){}}
  catch(e){}finally{OF.baixando=false;OF.prog='';ofPinta()}
}
window.addEventListener('online',ofPinta);window.addEventListener('offline',ofPinta);
setInterval(ofPinta,2000);
// Primeira abertura neste aparelho: baixa tudo de uma vez (em segundo plano, fora de dados móveis/economia de dados); depois o service worker só busca o que for novo.
setTimeout(()=>{
  let c=null;try{c=navigator.connection}catch(e){}
  if(!localStorage.getItem(OF_FLAG)&&!(c&&(c.saveData||c.type==='cellular')))ofBaixaTudo();
},4000);
