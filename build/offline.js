// Offline (1.62.0): botão "Baixar offline" por aparelho (desligado por padrão, flag bcbr_offline='1').
// Ligar registra o service worker (sw.js), baixa app + Notas (índice + páginas + imagens) + questões, e mantém atualizado em segundo plano.
// Desligar pede confirmação, desregistra o SW e apaga os caches dele, preservando progresso, IndexedDB de dados e chaves.
const OF={prog:'',baixando:false,tamEst:null,tamUso:null,ultFundo:0},OF_LS='bcbr_offline',OF_FLAG='bcbr_baixou';
const ofAtivo=()=>{try{return localStorage.getItem(OF_LS)==='1'}catch(e){return false}};
const ofMB=b=>(Math.max(0,b)/1048576).toFixed(1).replace('.',',')+' MB';
const OF_ICO_DOWN='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>';
const OF_ICO_LOAD='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke-dasharray="40" stroke-dashoffset="12"/></svg>';
const OF_ICO_OK='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>';
function ofPendentes(){
  let n=0;
  try{if(typeof ntTemPendentes==='function'&&ntTemPendentes())n++;if(SM.sujo)n++}catch(e){}
  try{n+=dirty.size+(estDirty?1:0)}catch(e){}
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
function ofPintaBtn(){
  const b=document.getElementById('of_btn');if(!b)return;
  const on=ofAtivo(),est=OF.baixando?'baixando':on?'baixado':'off';
  b.dataset.estado=est;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));
  b.setAttribute('aria-label',est==='baixado'?'Offline neste PC (clique para remover)':est==='baixando'?'Baixando para offline…':'Baixar offline');
  const ico=est==='baixado'?OF_ICO_OK:est==='baixando'?OF_ICO_LOAD:OF_ICO_DOWN;
  if(b.innerHTML!==ico)b.innerHTML=ico;
  b.title=est==='baixando'?('Baixando offline'+(OF.prog?' · '+OF.prog:'…')):on?('Offline neste PC · '+(OF.tamUso!=null?ofMB(OF.tamUso):'calculando…')):('Baixar offline · '+(OF.tamEst!=null?'~'+ofMB(OF.tamEst):'calculando…'));
}
const ofPrazo=(p,ms)=>Promise.race([Promise.resolve(p).catch(()=>null),new Promise(r=>setTimeout(()=>r(null),ms))]);
// Soma os bytes guardados nos caches do Service Worker.
async function ofSomaCaches(){
  if(typeof caches==='undefined')return 0;
  let tot=0;
  try{
    for(const k of await ofPrazo(caches.keys(),2000)||[]){
      const c=await ofPrazo(caches.open(k),1500);if(!c)continue;
      const reqs=await ofPrazo(c.keys(),1500)||[];
      for(const req of reqs){
        try{const r=await c.match(req);if(!r)continue;const cl=+r.headers.get('content-length');tot+=Number.isFinite(cl)&&cl>0?cl:(await r.clone().arrayBuffer()).byteLength}catch(e){}
      }
    }
  }catch(e){}
  return tot;
}
async function ofCalculaTamanho(){
  if(ofAtivo()){
    let est=0;
    try{if(navigator.storage?.estimate){const e=await ofPrazo(navigator.storage.estimate(),2000);if(e&&Number.isFinite(e.usage))est=e.usage}}catch(e){}
    const cs=await ofPrazo(ofSomaCaches(),3000)||0;
    OF.tamUso=Math.max(est,cs);
    ofPintaBtn();return OF.tamUso;
  }
  if(typeof QUESTOES==='undefined'){OF.tamEst=null;ofPintaBtn();return null}
  let appBytes=1500000;
  try{
    const ent=performance.getEntriesByType?.('resource')||[];
    const soma=ent.reduce((a,r)=>a+(r.decodedBodySize||r.encodedBodySize||0),0);
    if(soma>100000)appBytes=soma+(document.documentElement?.outerHTML?.length||0);
  }catch(e){}
  let qBytes=(QUESTOES?.length||0)*1800;
  try{const q=await window.BCBR?.kvGet?.('f:questoes.json');if(q?.txt?.length)qBytes=q.txt.length}catch(e){}
  const imgsQ=new Set((QUESTOES||[]).flatMap(q=>[...(q.imgs||[]),...(q.imgsCom||[])])).size;
  let ntPagBytes=0,ntImgs=new Set();
  try{
    const metas=typeof SyncNotas?.paginasMeta==='function'?SyncNotas.paginasMeta():[];
    const ab=typeof SyncNotas?.estado==='function'?(SyncNotas.estado().abertas||{}):{};
    for(const m of metas){
      const p=ab[m.id];
      if(p?.doc){const s=JSON.stringify(p.doc);ntPagBytes+=s.length;for(const x of s.matchAll(/\.\/img\/([\w.-]+)/g))ntImgs.add(x[1])}
      else ntPagBytes+=8000;
    }
  }catch(e){}
  OF.tamEst=appBytes+qBytes+ntPagBytes+(imgsQ+ntImgs.size)*45000;
  ofPintaBtn();return OF.tamEst;
}
function ofImagensNotas(){
  const s=JSON.stringify(SyncNotas.estado().abertas),out=new Set();
  for(const m of s.matchAll(/\.\/img\/([\w.-]+)/g))out.add(m[1]);
  return [...out];
}
async function ofBaixaTudo(silencioso=false){
  if(OF.baixando||!window.BCBR?.baixarTudo||navigator.onLine===false)return;
  OF.baixando=true;if(!silencioso)ofPintaBtn();
  try{
    await ofPrazo(BCBR.carregarDados?.(true),5000);
    let imgsNotas=[];
    if(typeof SyncNotas?.baixarTodas==='function'){
      const r=await ofPrazo(SyncNotas.baixarTodas((i,t)=>{if(!silencioso){OF.prog=`notas ${i}/${t}`;ofPinta();ofPintaBtn()}}),15000);
      imgsNotas=r?.imagens||[];
    }else imgsNotas=ofImagensNotas();
    await ofPrazo(BCBR.baixarTudo((i,t)=>{if(!silencioso&&t){OF.prog=`${i}/${t}`;ofPinta();ofPintaBtn()}},imgsNotas),20000);
    try{localStorage.setItem(OF_FLAG,'1')}catch(e){}
  }catch(e){}finally{OF.baixando=false;OF.prog='';ofPinta();await ofCalculaTamanho()}
}
async function ofLigar(){
  if(OF.baixando)return;
  OF.baixando=true;OF.prog='';ofPintaBtn();ofPinta();
  try{
    try{localStorage.setItem(OF_LS,'1')}catch(e){}
    if('serviceWorker' in navigator){
      let reg=await ofPrazo(navigator.serviceWorker.getRegistration(),2000);
      if(!reg)reg=await ofPrazo(navigator.serviceWorker.register('./sw.js'),4000);
      await ofPrazo(BCBR?.passarChaveSW?.(),2000);
      await ofPrazo(navigator.serviceWorker.ready,4000);
      try{
        const v='bcbr-'+(window.BCBR_VERSAO||'1'),c=await ofPrazo(caches.open(v),2000);
        if(c){
          const urls=['./','./index.html','./shim.js','./app.js','./vendor/tiptap.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./icon-mask.png','./apple-touch-icon.png'];
          await ofPrazo(Promise.all(urls.map(async u=>{if(!(await c.match(u)))try{const r=await fetch(u,{cache:'no-cache',signal:AbortSignal.timeout?.(4000)});if(r.ok)await c.put(u,r)}catch(e){}})),5000);
        }
      }catch(e){}
    }
    OF.baixando=false;
    await ofBaixaTudo(false);
  }finally{
    OF.baixando=false;OF.prog='';ofPintaBtn();ofPinta();
  }
}
async function ofDesligar(){
  if(OF.baixando)return;
  if(!confirm('Remover a cópia offline deste computador?'))return;
  try{localStorage.removeItem(OF_LS);localStorage.removeItem(OF_FLAG)}catch(e){}
  try{
    if('serviceWorker' in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.unregister()));
    }
  }catch(e){}
  try{
    if(typeof caches!=='undefined'){
      const ks=await caches.keys();
      await Promise.all(ks.filter(k=>k.startsWith('bcbr-')).map(k=>caches.delete(k)));
    }
  }catch(e){}
  OF.tamUso=null;await ofCalculaTamanho();ofPintaBtn();ofPinta();
}
function ofAlterna(){return ofAtivo()?ofDesligar():ofLigar()}
async function ofAtualizaFundo(){
  if(!ofAtivo()||OF.baixando||navigator.onLine===false)return;
  const ag=Date.now();if(ag-OF.ultFundo<120000)return;OF.ultFundo=ag;
  try{
    if('serviceWorker' in navigator){const reg=await navigator.serviceWorker.getRegistration();await reg?.update?.().catch(()=>{})}
    await ofBaixaTudo(true);
  }catch(e){}
}
window.bcbrOfflineAtualiza=ofAtualizaFundo;
window.addEventListener('online',ofPinta);window.addEventListener('offline',ofPinta);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&ofAtivo())ofAtualizaFundo()});
setInterval(ofPinta,2000);
setTimeout(()=>{
  ofPintaBtn();ofCalculaTamanho();
  const bt=document.getElementById('of_btn');
  if(bt){bt.addEventListener('mouseenter',()=>ofCalculaTamanho());bt.addEventListener('focus',()=>ofCalculaTamanho())}
  if(ofAtivo())ofAtualizaFundo();
},1000);
