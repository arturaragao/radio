// Busca global (1.42): Ctrl+P (e Ctrl+K fora do texto das Notas) em qualquer aba. Procura em blocos das Notas, páginas, tarefas, eventos do calendário,
// questões e, se o app tiver, Resumos (função global resumosBusca() -> [{id,titulo,texto,abre}]). Busca própria: sem acento, minúsculas, por palavras.
// Ranking = relevância x frecência. A frecência vem de contadores LOCAIS (localStorage bcbr_busca_freq): só quantas vezes e quando, nunca o conteúdo.
const BG_FREQ='bcbr_busca_freq',BG_POR_TIPO=8;
const BG_TIPOS=[['nota','Notas'],['pagina','Páginas'],['tarefa','Tarefas'],['evento','Calendário'],['questao','Questões'],['resumo','Resumos']];
function bgFreqLer(){try{const o=JSON.parse(localStorage.getItem(BG_FREQ)||'{}');return o&&typeof o==='object'&&!Array.isArray(o)?o:{}}catch(e){return {}}}
function bgFreqConta(chave){
  const f=bgFreqLer(),x=f[chave]||{n:0,t:0};f[chave]={n:x.n+1,t:Date.now()};
  const ks=Object.keys(f);if(ks.length>300)ks.sort((a,b)=>f[a].t-f[b].t).slice(0,ks.length-300).forEach(k=>delete f[k]);
  try{localStorage.setItem(BG_FREQ,JSON.stringify(f))}catch(e){}
}
// 1 sem uso; cresce com o log do número de usos e cai pela metade a cada 14 dias sem uso.
const bgFrecencia=(x,agora)=>x?1+Math.log2(1+(x.n||0))*Math.pow(.5,Math.max(0,agora-(x.t||0))/(14*864e5)):1;
const bgTokens=q=>ntNorma(q).split(/\s+/).filter(Boolean);
// Cada palavra digitada precisa aparecer (no título vale mais; começo de palavra vale mais). 0 = não casa.
function bgPontua(tokens,d){
  let s=0;
  for(const t of tokens){
    if(d.tn.includes(t))s+=(d.tn.startsWith(t)||d.tn.includes(' '+t))?5:3;
    else if(d.cn.includes(t))s+=d.cn.includes(' '+t)?2:1;
    else return 0;
  }
  return s;
}
// Resultados: [{d,s}] por tipo na ordem de BG_TIPOS, até BG_POR_TIPO cada. Sem texto: os usados recentemente.
function bgBusca(q,docs,freq,agora=Date.now()){
  const tokens=bgTokens(q);
  if(!tokens.length)return docs.filter(d=>freq[d.chave]).sort((a,b)=>freq[b.chave].t-freq[a.chave].t).slice(0,10).map(d=>({d,s:0}));
  const por={};
  for(const d of docs){const s=bgPontua(tokens,d);if(s)(por[d.tipo]??=[]).push({d,s:s*bgFrecencia(freq[d.chave],agora)})}
  return BG_TIPOS.flatMap(([t])=>(por[t]||[]).sort((a,b)=>b.s-a.s).slice(0,BG_POR_TIPO));
}
// Texto corrido de um nó do ProseMirror (JSON).
function bgTextoNo(n){
  if(!n)return '';if(typeof n.text==='string')return n.text;
  const f=n.content||[];return f.map(bgTextoNo).join(f.some(x=>x.text!==undefined)?'':' ');
}
const bgEsc=s=>esc(String(s));
const bgArea=q=>typeof AREA_BY!=='undefined'?AREA_BY[q._a]?.nome:'';
function bgDocs(){
  const docs=[],add=(tipo,id,titulo,corpo,abre,sub)=>{titulo=String(titulo||'').trim();corpo=String(corpo||'');docs.push({tipo,id,chave:tipo+':'+id,titulo,sub:sub||'',corpo,tn:ntNorma(titulo),cn:ntNorma(corpo),abre})};
  const d=SM.d;
  for(const b of d?.notasDoc?.blocos||[]){
    const txt=bgTextoNo(b.conteudo).trim();if(!txt)continue;
    const sum=b.conteudo?.type==='details'?bgTextoNo(b.conteudo.content?.find(x=>x.type==='detailsSummary')).trim():'';
    add('nota',b.id,sum||txt.slice(0,70),txt,()=>bgIrNota(b.id));
  }
  for(const p of d?.notasPaginas?.paginas||[])add('pagina',p.id,p.titulo||'Sem título',(p.doc?.blocos||[]).map(b=>bgTextoNo(b.conteudo)).join(' '),()=>bgIrPagina(p.id),d.notasPaginas.pastas?.find(f=>f.id===p.pasta)?.titulo);
  for(const t of d?.tarefas||[])add('tarefa',t.id,t.texto,[t.det,...(t.subtarefas||[]).map(s=>s.texto)].filter(Boolean).join(' '),()=>bgIrTarefa(t.id),(t.dia&&t.dia.length===10?t.dia.slice(8)+'/'+t.dia.slice(5,7):'')+(t.feito?' · feita':''));
  for(const [iso,x] of Object.entries(d?.dias||{})){
    const rot=iso.slice(8)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4);
    for(const e of x.ev||[])add('evento','m'+e.id,e.t,'',()=>bgIrDia(iso),rot);
    if(x.agenda&&String(x.agenda).trim())add('evento','a'+iso,String(x.agenda).split('\n')[0],x.agenda,()=>bgIrDia(iso),rot);
  }
  for(const e of (typeof SM!=='undefined'&&SM.agenda)||[]){const iso=String(e.inicio||'').slice(0,10);if(iso.length===10)add('evento','g'+iso+(e.titulo||''),e.titulo,e.local||'',()=>bgIrDia(iso),iso.slice(8)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4))}
  if(typeof Q!=='undefined'){
    if(bgQ.n!==Q.length||bgQ.ref!==Q[0]){bgQ.n=Q.length;bgQ.ref=Q[0];bgQ.docs=Q.map(q=>({tipo:'questao',id:q.id,chave:'questao:'+q.id,titulo:'Questão '+(q.n??'—'),sub:[bgArea(q),...(q.cl||[]).slice(0,2)].filter(Boolean).join(' › '),corpo:String(q.enunciado||''),tn:ntNorma('Questão '+(q.n??'')),
      cn:ntNorma(String(q.enunciado||'')+' '+[bgArea(q),...(q.cl||[]),...(q.tags||[])].filter(Boolean).join(' ')),abre:()=>bgIrQuestao(q.id)}))}
    docs.push(...bgQ.docs);
  }
  if(typeof resumosBusca==='function'){try{for(const r of resumosBusca()||[])add('resumo',r.id,r.titulo,r.texto,r.abre)}catch(e){}}
  return docs;
}
const bgQ={n:-1,ref:null,docs:[]};   // índice das questões: montado uma vez por sessão (5.700 questões) e reaproveitado

// ----- navegação -----
function bgEspera(fn,t=40){if(typeof NT!=='undefined'&&tela==='notas'&&NT.ed&&NT.el?.isConnected)fn();else if(t>0)setTimeout(()=>bgEspera(fn,t-1),50)}
function bgIrNota(id){
  go('notas');
  bgEspera(()=>{
    const ed=NT.ed;let pos=null;ed.state.doc.forEach((n,off)=>{if(pos==null&&n.attrs.id===id)pos=off});
    if(pos==null){toast('Esse bloco não existe mais.');return}
    const n=ed.state.doc.nodeAt(pos);
    if(n.type.name==='details'){const dom=ed.view.nodeDOM(pos);if(dom instanceof Element){ntPoeAberto(dom,true);ntAbertoSalva(id,true)}}
    try{ed.view.dispatch(ed.state.tr.setSelection(TT.pm.state.Selection.near(ed.state.doc.resolve(pos+1))))}catch(e){}
    const dom=ed.view.nodeDOM(pos);if(dom instanceof Element){dom.scrollIntoView({block:'center'});dom.classList.add('nt-flash');setTimeout(()=>dom.classList.remove('nt-flash'),1500)}
    ed.view.focus();
  });
}
function bgIrPagina(id){go('notas');bgEspera(()=>ntPainelAbre(id))}
function bgIrTarefa(id){
  go('tarefas');
  setTimeout(()=>{const r=document.querySelector(`.sm-row[data-tid="${id}"]`);if(r){r.scrollIntoView({block:'center'});r.classList.add('nt-flash');setTimeout(()=>r.classList.remove('nt-flash'),1500)}else if(smTar(id))smEdita(id)},60);
}
function bgIrDia(iso){go('semana');SM.mes=iso.slice(0,7);SM.semana=smDom(iso);smSel(iso)}
function bgIrQuestao(id){
  const q=QID[id];if(!q)return;
  bf={a:'',d:'',s:'',c:'',p:''};bq=q.n!=null?String(q.n):q.enunciado.slice(0,40);bLim=1e9;bAbertos.add(id);go('banco');
  setTimeout(()=>{const el=document.querySelector(`details.bq[data-qid="${id}"]`);if(el){el.scrollIntoView({block:'start'});el.classList.add('nt-flash');setTimeout(()=>el.classList.remove('nt-flash'),1500)}},60);
}

// ----- janela -----
function bgSnippet(d,tokens){
  const t=tokens.find(x=>d.cn.includes(x)),i=t?d.cn.indexOf(t):-1;
  if(i<0||i>=d.corpo.length)return bgEsc(d.sub);
  const a=Math.max(0,i-30);
  return (d.sub?bgEsc(d.sub)+' · ':'')+(a>0?'…':'')+bgEsc(d.corpo.slice(a,i))+'<mark>'+bgEsc(d.corpo.slice(i,i+t.length))+'</mark>'+bgEsc(d.corpo.slice(i+t.length,i+t.length+60));
}
function bgAbre(){
  const aberta=document.querySelector('.bg-m');if(aberta){ntModalFecha(aberta.closest('.nt-modal'));return}
  const ov=ntModal('bg-modal',`<input type="text" class="bg-in" placeholder="Buscar em notas, páginas, tarefas, calendário e questões" aria-label="Busca global" autocomplete="off" spellcheck="false"><div class="bg-l" role="listbox"></div>`);
  ov.firstElementChild.classList.add('bg-m');
  const q=ov.querySelector('.bg-in'),l=ov.querySelector('.bg-l'),docs=bgDocs(),freq=bgFreqLer();let res=[],sel=0;
  const pinta=()=>{
    const t0=performance.now();res=bgBusca(q.value,docs,freq);sel=Math.min(sel,Math.max(0,res.length-1));
    const tokens=bgTokens(q.value);let h='',ult='';
    if(!tokens.length&&res.length)h='<div class="bg-h">Recentes</div>';
    res.forEach((r,i)=>{
      if(tokens.length&&r.d.tipo!==ult){ult=r.d.tipo;h+=`<div class="bg-h">${BG_TIPOS.find(x=>x[0]===ult)[1]}</div>`}
      h+=`<button type="button" role="option" class="bg-it${i===sel?' sel':''}" data-i="${i}"><b>${bgEsc(r.d.titulo||'(sem título)')}</b><small>${bgSnippet(r.d,tokens)}</small></button>`;
    });
    if(!res.length)h=`<p class="bg-v">${tokens.length?'Nada encontrado.':'Digite para buscar. O que você abrir aparece aqui como recente.'}</p>`;
    l.innerHTML=h;l.querySelector('.sel')?.scrollIntoView({block:'nearest'});ov.dataset.ms=String(Math.round(performance.now()-t0));
  };
  const vai=r=>{if(!r)return;ntModalFecha(ov);bgFreqConta(r.d.chave);r.d.abre()};
  q.addEventListener('input',()=>{sel=0;pinta()});
  q.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(res.length){sel=(sel+(e.key==='ArrowDown'?1:-1)+res.length)%res.length;pinta()}}
    else if(e.key==='Enter'){e.preventDefault();vai(res[sel])}
  });
  l.addEventListener('click',e=>{const b=e.target.closest('[data-i]');if(b)vai(res[+b.dataset.i])});
  pinta();q.focus();
}
document.addEventListener('keydown',e=>{
  if(!(e.ctrlKey||e.metaKey)||e.altKey||e.shiftKey||typeof SM==='undefined'||document.body.classList.contains('nt-aba-pg'))return;   // (na aba de uma página não há outras abas do app para ir)
  const k=String(e.key).toLowerCase();if(k!=='p'&&k!=='k')return;
  if(k==='k'&&e.target.closest?.('.ProseMirror'))return;   // dentro do texto das Notas, Ctrl+K continua sendo link
  e.preventDefault();e.stopImmediatePropagation();bgAbre();
},true);
