// ===== aba Questões (pedido do Artur, 22/10/2026) =====
// Abre o último bloco em andamento (revisão do dia ou estudo salvo) já na próxima questão a fazer;
// no topo da questão, um seletor troca para outro bloco em aberto.
function qChave(){if(!sess||sess.fim)return null;return sess.estId||(sess.modo==='hoje'?'ri':'atual')}
function qBlocos(){
  const L=[];
  try{const ids=riHoje(),h=hoje0(),f=new Set();let u=0;
    log.forEach(l=>{if(l.t>=h&&l.modo==='hoje'&&ids.includes(l.q)){f.add(l.q);u=Math.max(u,l.t)}});
    if(ids.length&&f.size<ids.length)L.push({k:'ri',nome:'Revisão do dia',feitas:f.size,n:ids.length,u})}catch(e){}
  (cfg.ests||[]).forEach(e=>{const ids=e.ids.filter(i=>QID[i]&&QID[i].gab),f=ids.filter(i=>(e.resp||{})[i]).length;
    if(ids.length&&f<ids.length)L.push({k:e.id,nome:'Estudo',feitas:f,n:ids.length,u:e.u||e.t0||0})});
  return L.sort((a,b)=>b.u-a.u);
}
// índice da próxima questão sem resposta, a partir da atual (dá a volta)
function qProxIdx(){const n=sess.ids.length;for(let j=0;j<n;j++){const i=(sess.i+j)%n;if(!sess.resp[sess.ids[i]])return i}return sess.i}
function qCarrega(k){
  if(sess&&!sess.fim&&sess.modo==='estudo')salvaEst();
  if(k==='ri'){iniciaRI();return}
  retomaEst(k);if(!sess||sess.estId!==k)return;
  const nx=qProxIdx();if(nx!==sess.i){sess.i=nx;sess.tq=Date.now();salvaEst();render();scrollTo(0,0)}
}
// chamado por go('questoes'): devolve true quando já levou para a questão
function qAbre(){
  if(sess&&sess.modo==='hoje'){iniciaRI();return tela==='quiz'}
  if(sess&&!sess.fim){go('quiz');return true}
  const L=qBlocos();if(!L.length)return false;
  qCarrega(L[0].k);return tela==='quiz';
}
function qTroca(k){if(k)qCarrega(k)}
function vQuestoes(){
  return `<div class="card"><h2>Questões</h2><p class="mut">Nenhum bloco de questões em aberto agora.</p>
  <div class="row"><button class="b" onclick="go('estudar')">Montar um estudo</button><button class="b s" onclick="go('hoje')">Ir para Hoje</button></div></div>`;
}
const qDt=u=>u?' · '+new Date(u).toLocaleString('pt-BR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
function qBarra(){
  if(!sess||sess.sim||sess.fim)return'';
  const at=qChave(),L=qBlocos(),outros=L.filter(b=>b.k!==at);if(!outros.length)return'';
  const eu=L.find(b=>b.k===at),nome=eu?`${eu.nome} · ${eu.feitas}/${eu.n}`:'Bloco atual';
  return `<div class="qblocos"><span class="mut">Bloco:</span><select aria-label="Trocar de bloco de questões" onchange="qTroca(this.value);this.blur()"><option value="">${esc(nome)}</option>${outros.map(b=>`<option value="${b.k}">→ ${b.nome} · ${b.feitas}/${b.n}${qDt(b.u)}</option>`).join('')}</select></div>`;
}
const Q_ATALHOS='bcbr_q_atalhos';
let qAtalhosVisiveis=(()=>{try{return localStorage.getItem(Q_ATALHOS)==='1'}catch(e){return false}})();
function qAtalhosAlterna(bt){
  qAtalhosVisiveis=!qAtalhosVisiveis;
  try{localStorage.setItem(Q_ATALHOS,qAtalhosVisiveis?'1':'0')}catch(e){}
  bt.setAttribute('aria-expanded',String(qAtalhosVisiveis));
  document.getElementById('q_atalhos').hidden=!qAtalhosVisiveis;
}
function qAtalhos(){
  if(!sess||sess.qEdit)return'';
  const K=n=>`<kbd>${esc(keyLab(n))}</kbd>`,it=(k,t)=>`<span>${k} ${t}</span>`;
  const alts=['a1','a2','a3','a4','a5'].map(K).join('');
  return `<div class="qatalhos-rodape"><button type="button" class="qatalhos-bt" aria-expanded="${qAtalhosVisiveis}" aria-controls="q_atalhos" onclick="qAtalhosAlterna(this)">Atalhos</button><div class="qatalhos" id="q_atalhos" aria-label="Atalhos do teclado"${qAtalhosVisiveis?'':' hidden'}>
  ${it('<kbd>←</kbd><kbd>→</kbd>','questão anterior/próxima')}
  ${it('<kbd>↑</kbd><kbd>↓</kbd>','alternativas (dá a volta; ↑ na A vai para a imagem) · depois de responder: rola a página')}
  ${it(alts,'alternativas A–E')}
  ${it(K('cert')+K('duv')+K('chu'),'certeza / dúvida / chute (<kbd>Enter</kbd> = certeza)')}
  ${it(K('cut'),'riscar alternativa')}
  ${it(K('next')+'<kbd>Espaço</kbd>','próxima (depois de responder)')}
  ${it(K('edit'),'editar resposta')}
  ${it(K('ia'),'CCQ e resumo com IA')}
  ${it(K('img'),'seleciona a 1ª imagem › de novo abre › de novo fecha')}
  ${it('<kbd>←</kbd><kbd>→</kbd>','com imagem selecionada: troca a imagem (<kbd>↓</kbd> ou <kbd>Esc</kbd> volta)')}
  ${it(K('zin')+K('zout')+K('zfit'),'imagem aberta: aumenta / diminui / ajusta')}
  ${it('<kbd>Tab</kbd><kbd>Shift+Tab</kbd>','próxima / aba anterior')}
  </div></div>`;
}
function vQuizQ(){const h=vQuiz();if(tela!=='quiz'||!sess||sess.qEdit)return h;return qBarra()+h+qAtalhos()}

// ===== imagens: teclado (G + setas) — 22/10/2026 =====
// G seleciona a 1ª imagem › G abre › G fecha. Com imagem selecionada, ←/→ trocam a imagem e ↓ volta à alternativa A.
// Sem imagem selecionada: ↑ na alternativa A sobe para a 1ª imagem (se houver; senão vai para a última alternativa); ↓ na última volta à A.
const GS={id:null,on:false,t:'q'};
function qGalTipo(q){const fb=!!sess.resp[q.id]&&!sess.sim;return galLista(q,'q').length?'q':fb&&galLista(q,'c').length?'c':null}
function qMarcaGal(){const q=tela==='quiz'&&sess&&!sess.fim?cur():null;
  document.querySelectorAll('#app .gal').forEach(el=>el.classList.toggle('gsel',!!q&&GS.on&&GS.id===q.id&&el.id==='gal_'+q.id+'_'+GS.t))}
function qSelImg(q,tp){GS.on=true;GS.t=tp;galVai(q.id,tp,0,0);qMarcaGal();const el=document.getElementById('gal_'+q.id+'_'+tp);el&&el.scrollIntoView({block:'nearest',behavior:'smooth'})}
window.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  const t=e.target;if(t&&(/INPUT|SELECT|TEXTAREA/.test(t.tagName)||t.isContentEditable))return;
  if(typeof capKey!=='undefined'&&capKey)return;
  if(typeof QA!=='undefined'&&QA.on)return;
  const isG=keyIs(e,'img'),z=document.getElementById('zoom'),k=e.key;
  if(z&&!z.hidden){if(isG){e.preventDefault();e.stopImmediatePropagation();zClose()}return}
  if(tela!=='quiz'||!sess||sess.fim||sess.qEdit)return;
  const q=cur();if(!q)return;
  if(GS.id!==q.id){GS.id=q.id;GS.on=false}
  const fb=!!sess.resp[q.id]&&!sess.sim,tp=qGalTipo(q);
  const para=()=>{e.preventDefault();e.stopImmediatePropagation()};
  if(isG){if(!tp)return;para();
    if(!GS.on)qSelImg(q,tp);else{const x=galLista(q,GS.t)[gIdx[q.id+'_'+GS.t]||0];if(x)zoom(x.u)}
    return}
  if(GS.on&&(k==='ArrowLeft'||k==='ArrowRight')){para();galVai(q.id,GS.t,k==='ArrowRight'?1:-1);qMarcaGal();return}
  if(GS.on&&k==='Escape'){GS.on=false;qMarcaGal();return}
  if(fb||(k!=='ArrowUp'&&k!=='ArrowDown'))return;   // depois de responder ↑/↓ rolam a página (handler do app)
  para();const L=Object.keys(q.alts),n=L.length,c=L.indexOf(selAtual());
  if(GS.on){if(k==='ArrowDown'){GS.on=false;qMarcaGal();escolher(L[0])}return}
  if(k==='ArrowDown'){escolher(L[(c+1)%n]);return}
  if(c===0&&tp){qSelImg(q,tp);return}
  escolher(L[c<=0?n-1:c-1]);
},true);

// ===== rolagem pelas setas: suave como a roda do mouse; passo em Config › Atalhos (cfg.passoSeta, padrão 120 px) =====
const QR={alvo:null,raf:0};
function qRola(dir){
  const passo=+cfg.passoSeta||120,max=document.documentElement.scrollHeight-innerHeight;
  if(QR.alvo==null||!QR.raf)QR.alvo=scrollY;
  QR.alvo=Math.max(0,Math.min(max,QR.alvo+dir*passo));
  if(!QR.raf){const anda=()=>{const d=QR.alvo-scrollY;if(Math.abs(d)<1){scrollTo(0,QR.alvo);QR.raf=0;return}
    scrollTo(0,scrollY+d*0.2);QR.raf=requestAnimationFrame(anda)};QR.raf=requestAnimationFrame(anda)}
}
addEventListener('wheel',()=>{if(QR.raf){cancelAnimationFrame(QR.raf);QR.raf=0}},{passive:true});

// ===== imagens sem piscar: a cada redesenho reaproveita as <img> já carregadas (mesma imagem = mesmo elemento) =====
function qGuarda(root){const v={};root.querySelectorAll('img[data-u]').forEach(im=>{if(im.complete&&im.naturalWidth)(v[im.dataset.u]??=[]).push(im)});return v}
function qReusa(root,v){root.querySelectorAll('img[data-u]').forEach(im=>{const o=(v[im.dataset.u]||[]).shift();if(!o)return;
  [...o.attributes].forEach(a=>{if(a.name!=='src'&&!im.hasAttribute(a.name))o.removeAttribute(a.name)});
  [...im.attributes].forEach(a=>{if(a.name!=='src')o.setAttribute(a.name,a.value)});im.replaceWith(o)})}
function qPinta(html){const app=$('#app'),v=qGuarda(app);app.innerHTML=html;qReusa(app,v);qMarcaGal();qPreCarrega();if(typeof smkPinta==='function')smkPinta()}
// pré-carrega as imagens da questão atual e das 3 seguintes (ficam prontas na memória)
const qPre=new Map();
function qPreCarrega(){
  if(tela!=='quiz'||!sess||!window.BCBR||!BCBR.imgDireto)return;
  for(let d=0;d<=3;d++){const q=QID[sess.ids[sess.i+d]];if(!q)continue;
    [...(q.imgs||[]),...(q.imgsCom||[])].forEach(u=>{u=String(u);if(!u.startsWith('gh:'))return;const n=u.slice(3);if(qPre.has(n))return;
      qPre.set(n,null);BCBR.imgDireto(n).then(src=>{const im=new Image();im.src=src;qPre.set(n,im);if(im.decode)im.decode().catch(()=>{})}).catch(()=>qPre.delete(n))})}
}

// ===== deslizar o dedo na questão (1.17.0): ← próxima, → anterior (mesmas funções das teclas ←/→) =====
// Só gesto horizontal claro (|dx|>60 px e |dx|>1.5·|dy|). Ignora: rolagem vertical, zoom de imagem aberto, galeria/miniaturas,
// campos de texto, áreas que rolam na horizontal, seleção de texto e a tela Nova tarefa.
const QSW={x:0,y:0,t:0,ok:false};
function qSwOk(el){
  if(!el||!el.closest||el.closest('input,textarea,select,[contenteditable],.gal,.galt,.galm,#zoom,#qa,#nav,button'))return false;
  for(let e=el;e&&e!==document.body;e=e.parentElement){const o=getComputedStyle(e).overflowX;if((o==='auto'||o==='scroll')&&e.scrollWidth>e.clientWidth+2)return false}
  return true;
}
document.addEventListener('touchstart',e=>{
  QSW.ok=false;
  if(e.touches.length!==1||tela!=='quiz'||!sess||sess.fim||sess.qEdit||(typeof QA!=='undefined'&&QA.on))return;
  const z=document.getElementById('zoom');if(z&&!z.hidden)return;
  if(!qSwOk(e.target))return;
  QSW.x=e.touches[0].clientX;QSW.y=e.touches[0].clientY;QSW.t=Date.now();QSW.ok=true;
},{passive:true});
document.addEventListener('touchmove',e=>{if(e.touches.length>1)QSW.ok=false},{passive:true});
document.addEventListener('touchcancel',()=>{QSW.ok=false},{passive:true});
document.addEventListener('touchend',e=>{
  if(!QSW.ok)return;QSW.ok=false;
  if(tela!=='quiz'||!sess||sess.fim)return;
  const t=e.changedTouches[0];if(!t)return;
  const dx=t.clientX-QSW.x,dy=t.clientY-QSW.y;
  if(Math.abs(dx)<=60||Math.abs(dx)<=1.5*Math.abs(dy)||Date.now()-QSW.t>1200)return;
  try{const s=getSelection();if(s&&!s.isCollapsed&&String(s).trim())return}catch(x){}
  if(dx<0){if(sess.i>=sess.ids.length-1)toast('Última questão');else{irPara(sess.i+1);qPulaGrade()}}
  else{irPara(sess.i-1);qPulaGrade()}
},{passive:true});

// depois de deslizar, a página já abre na questão: a grade com os números fica acima, fora da tela (pedido do Artur, 24/10/2026)
// o cabeçalho encolhe ao rolar: rola, e corrige uma vez depois que ele mudou de altura
function qPulaGrade(){qPulaGrade1();setTimeout(qPulaGrade1,60)}
function qPulaGrade1(){   // topo do cartão da questão logo abaixo da barra fixa (título + abas); a grade fica acima, é só subir
  const c=document.querySelector('#app .qlay .card');if(!c)return;let off=0;
  document.querySelectorAll('body>*,body>*>*').forEach(e=>{if(e.id==='app')return;const p=getComputedStyle(e).position;if(p!=='sticky'&&p!=='fixed')return;const r=e.getBoundingClientRect();if(r.top<=0.5&&r.bottom>0&&r.bottom<innerHeight/2&&r.width>innerWidth/2)off=Math.max(off,r.bottom)});
  scrollTo(0,Math.max(0,c.getBoundingClientRect().top+scrollY-off-8))}
// Corpo compartilhado pelo quiz e pela consulta no Banco (sem sessão artificial).
function qDificuldade(q){return difTag(q)}
function qEnunciado(q,imgs){return `<div class="enun" style="margin-top:10px">${esc(q.enunciado)}</div><div class="imgs">${imgs}</div>`}
function qAlternativas(q,{r=null,fb=false,sel=null,cut=[],leitura=false}={}){
  return Object.entries(q.alts||{}).map(([l,tx])=>{
    let c='';if(fb){if(l===q.gab)c='ok';else if(l===(r?.esc??r?.e))c='bad'}else if(sel===l)c='sel';
    return `<div class="alt ${c} ${cut.includes(l)?'cutd':''} ${tx.length<60?'curta':''} ${tx.length<28?'curtinha':''}"${leitura?'':' tabindex="0" onclick="escolher(\''+l+'\')"'}><b>${l})</b><div style="flex:1;min-width:0"><span class="at">${esc(tx.replace(/\s*·\s*(?:✓\s*)?(?:[\d.,]+%\s*)?$/,''))}</span>${prAlternativa(q,l,fb)}${fb&&verCom(q)?comentAlt(q,l):''}</div>${leitura?'':`<button class="cut ${cut.includes(l)?'on':''}" title="Riscar alternativa (F)" aria-label="Riscar alternativa ${l}" onclick="event.stopPropagation();riscar('${l}')">${TES}</button>`}</div>`;
  }).join('');
}

// ===== 1.37.0 (pedido do Artur, 06/11/2026): responder/escolher/riscar não mexe no scroll da página =====
// Guarda a posição antes do redesenho e repõe depois (inclusive após o setTimeout do layout). Trocar de questão segue indo ao topo.
function qFixaScroll(fn){return function(...a){const y=scrollY,q0=sess&&sess.i;const r=fn.apply(this,a);
  if(tela==='quiz'&&sess&&sess.i===q0){const volta=()=>{if(sess&&sess.i===q0&&Math.abs(scrollY-y)>1)scrollTo(0,y)};volta();setTimeout(volta,0)}
  return r}}
if(typeof responder==='function'){responder=qFixaScroll(responder);escolher=qFixaScroll(escolher);riscar=qFixaScroll(riscar);editar=qFixaScroll(editar)}
