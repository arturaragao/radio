// ===== Reordenar cartões arrastando (pedido do Artur, 22/10/2026) =====
// Segurar ~400 ms num cartão (mouse ou toque) e arrastar para onde quiser; a ordem fica em cfg.ordemCartoes[aba]
// e sincroniza entre aparelhos junto com o resto do cfg (persist('_est')). Só mexe nos .card irmãos (mesmo pai).
const LY_HOLD=400;
let lyEngole=0;   // 1 = o próximo clique (logo após soltar o cartão) é engolido
const lyNorm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[0-9]+/g,'').replace(/[^a-z]+/g,' ').trim().slice(0,40);
// pais que têm 2+ cartões .card como filhos diretos (e os cartões deles)
function lyGrupos(){
  const app=document.getElementById('app'),ps=new Set(),gs=[];
  if(!app)return gs;
  app.querySelectorAll('.card').forEach(c=>{const p=c.parentElement;if(p&&!ps.has(p)){ps.add(p);const cs=[...p.children].filter(x=>x.classList.contains('card'));if(cs.length>1)gs.push({p,cs})}});
  return gs;
}
// chave estável de cada cartão (data-ordem > id > 1º título/.kick sem números > índice); repetidas ganham sufixo
function lyChaves(gs){
  const m=new Map(),vistas={};let i=0;
  gs.forEach(g=>g.cs.forEach(c=>{
    let k=c.dataset.ordem||c.id||'';
    if(!k){const t=c.querySelector('h2,h3,.kick,h4');k=lyNorm(t&&t.textContent)}
    if(!k)k='i'+i;i++;
    vistas[k]=(vistas[k]||0)+1;if(vistas[k]>1)k+='#'+vistas[k];
    m.set(c,k)}));
  return m;
}
// reaplica a ordem salva da aba atual (chamado depois de cada render, via MutationObserver)
function lyAplica(){
  if(tela==='quiz'||tela==='fim')return;
  const ord=cfg.ordemCartoes&&cfg.ordemCartoes[tela];if(!ord||!ord.length)return;
  const gs=lyGrupos(),ch=lyChaves(gs);
  gs.forEach(g=>{
    const pos=c=>ord.indexOf(ch.get(c)),conhecidos=g.cs.filter(c=>pos(c)>=0).sort((a,b)=>pos(a)-pos(b));
    const alvo=g.cs.map(c=>pos(c)>=0?conhecidos.shift():c);   // cartões novos ficam na posição natural
    if(alvo.every((c,i)=>c===g.cs[i]))return;
    const marcas=g.cs.map(c=>{const m=document.createComment('');c.before(m);return m});
    alvo.forEach((c,i)=>marcas[i].replaceWith(c));
  });
}
function lySalva(){
  const gs=lyGrupos(),ch=lyChaves(gs);cfg.ordemCartoes=cfg.ordemCartoes||{};
  cfg.ordemCartoes[tela]=gs.flatMap(g=>g.cs.map(c=>ch.get(c)));persist('_est');
}
function lyRestaura(aba){
  if(aba==='tudo')cfg.ordemCartoes={};else if(cfg.ordemCartoes)delete cfg.ordemCartoes[aba];
  persist('_est');render();toast(aba==='tudo'?'Ordem de todos os cartões restaurada':'Ordem restaurada');
}
function ordemUI(){
  const oc=cfg.ordemCartoes||{},com=TABS.filter(t=>oc[t[0]]&&oc[t[0]].length);
  return `<h3>Ordem dos cartões</h3><p class="mut">Em qualquer aba, segure um cartão por meio segundo e arraste para onde quiser. A ordem fica salva e vale nos seus aparelhos.</p>
  <div class="row" style="margin-bottom:12px">${com.map(t=>`<button class="b s" onclick="lyRestaura('${t[0]}')">Restaurar ${t[1]}</button>`).join('')}<button class="b s" ${com.length?'':'disabled'} onclick="lyRestaura('tudo')">Restaurar ordem dos cartões (tudo)</button></div>`;
}

// ---- arrastar ----
let lyD=null;   // {c,p,x0,y0,sy0,pid,ativo,timer,alvo,antes,mk,auto,cx,cy}
const lyIgnora='input,button,select,textarea,a,label,summary,.sm-row,[contenteditable],[onclick],.gal,.bar';
function lyFim(cancela){
  const d=lyD;if(!d)return;clearTimeout(d.timer);clearInterval(d.auto);lyD=null;
  document.body.classList.remove('ly-on');
  if(d.mk)d.mk.remove();
  if(!d.ativo)return;
  d.c.classList.remove('ly-drag');d.c.style.transform='';
  lyEngole=1;setTimeout(()=>{lyEngole=0},60);
  if(!cancela&&d.moveu&&d.alvo){if(d.antes)d.alvo.before(d.c);else d.alvo.after(d.c);lySalva();if(navigator.vibrate)try{navigator.vibrate(12)}catch(e){}}
}
function lyAlvo(x,y){
  const d=lyD,cs=[...d.p.children].filter(c=>c.classList.contains('card')&&c!==d.c);let best=null,bd=1e9;
  cs.forEach(c=>{const r=c.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dd=Math.hypot(x-cx,(y-cy)*1.4);if(dd<bd){bd=dd;best=c}});
  if(!best){d.alvo=null;return}
  const r=best.getBoundingClientRect(),pr=d.p.getBoundingClientRect(),vert=r.width<pr.width*.8;
  d.alvo=best;d.antes=vert&&y>=r.top&&y<=r.bottom?x<r.left+r.width/2:y<r.top+r.height/2;
  d.mk.style.cssText=vert?`left:${(d.antes?r.left:r.right)-2}px;top:${r.top}px;width:4px;height:${r.height}px`
    :`left:${r.left}px;top:${(d.antes?r.top:r.bottom)-2}px;width:${r.width}px;height:4px`;
}
function lyPos(){
  const d=lyD;if(!d||!d.ativo)return;
  d.c.style.transform=`translate(${d.cx-d.x0}px,${d.cy-d.y0+(window.scrollY-d.sy0)}px) scale(1.02)`;
  lyAlvo(d.cx,d.cy);
}
function lyMove(e){
  const d=lyD;if(!d||e.pointerId!==d.pid)return;
  if(!d.ativo){if(Math.hypot(e.clientX-d.x0,e.clientY-d.y0)>8)lyFim(true);return}   // mexeu antes do tempo = rolagem/seleção normal
  e.preventDefault();if(Math.hypot(e.clientX-d.x0,e.clientY-d.y0)>8)d.moveu=true;d.cx=e.clientX;d.cy=e.clientY;lyPos();
}
function lyComeca(){
  const d=lyD;if(!d)return;d.ativo=true;
  d.mk=document.createElement('div');d.mk.className='ly-mk';document.body.appendChild(d.mk);
  d.c.classList.add('ly-drag');document.body.classList.add('ly-on');
  try{d.c.setPointerCapture(d.pid)}catch(e){}
  if(navigator.vibrate)try{navigator.vibrate(25)}catch(e){}
  d.cx=d.x0;d.cy=d.y0;lyPos();
  d.auto=setInterval(()=>{const h=innerHeight;if(d.cy<70)scrollBy(0,-14);else if(d.cy>h-70)scrollBy(0,14);else return;lyPos()},16);
}
function lyIni(){
  const app=document.getElementById('app');if(!app||app._ly)return;app._ly=1;
  app.addEventListener('pointerdown',e=>{
    if(lyD||tela==='quiz'||tela==='fim'||(e.pointerType==='mouse'&&e.button!==0))return;
    const c=e.target.closest&&e.target.closest('.card');if(!c||e.target.closest(lyIgnora))return;
    const p=c.parentElement;if(!p||[...p.children].filter(x=>x.classList.contains('card')).length<2)return;
    lyD={c,p,x0:e.clientX,y0:e.clientY,sy0:window.scrollY,pid:e.pointerId,ativo:false};
    lyD.timer=setTimeout(lyComeca,LY_HOLD);
  });
  document.addEventListener('pointermove',lyMove,{passive:false});
  document.addEventListener('pointerup',e=>{if(lyD&&e.pointerId===lyD.pid)lyFim(false)});
  document.addEventListener('pointercancel',e=>{if(lyD&&e.pointerId===lyD.pid&&!lyD.ativo)lyFim(true)});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&lyD)lyFim(true)});
  // enquanto arrasta: sem rolagem do toque, sem seleção de texto, sem menu de contexto
  document.addEventListener('touchmove',e=>{if(lyD&&lyD.ativo)e.preventDefault()},{passive:false});
  document.addEventListener('selectstart',e=>{if(lyD&&lyD.ativo)e.preventDefault()});
  app.addEventListener('contextmenu',e=>{if(lyD)e.preventDefault()});
  // o clique que vem logo depois de soltar o cartão não deve acionar nada dentro dele
  document.addEventListener('click',e=>{if(lyEngole){lyEngole=0;e.stopPropagation();e.preventDefault()}},true);
  new MutationObserver(()=>lyAplica()).observe(app,{childList:true});
  lyAplica();
}
// Mantém a chave interna e a ordem salva das abas; só o rótulo muda.
const lyCalendario=TABS.find(t=>t[0]==='semana');if(lyCalendario)lyCalendario[1]='Calendário';
delete KEYLAB.smurg;KG.sem=KG.sem.filter(k=>k!=='smurg');
lyIni();
// 1.49: a cor da barra de status/aba do navegador acompanha o tema escolhido no app (as duas metas theme-color recebem a mesma cor).
function lyTemaCor(){
  const cor=getComputedStyle(document.documentElement).getPropertyValue('--band').trim();
  if(cor)document.querySelectorAll('meta[name="theme-color"]').forEach(m=>m.setAttribute('content',cor));
}
lyTemaCor();
new MutationObserver(lyTemaCor).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
if(typeof matchMedia==='function')matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',lyTemaCor);
render();
