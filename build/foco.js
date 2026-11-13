// ===== Foco até a prova (CBR) — célula do Painel (06/11/2026) =====
// Tudo é calculado no render a partir de Q e log atuais (sem snapshot gravado): responder ou entrar questão nova muda o resultado.
// Funções puras (focoCalc, foTab, foDifCmp, foSorteia) não dependem do app; a UI (vFoco) usa os globais do app.
const foCBR=q=>[].concat((q.pr_prova&&q.pr_prova.test)||[],(q.pr_tags&&q.pr_tags.test)||[]).includes('Provas CBR');
const foDif=q=>q._d||'m';                       // sem dificuldade conta como média
const foAnos=q=>[].concat((q.pr_prova&&q.pr_prova.year)||[]).map(String);
const foBase=Q=>Q.filter(q=>q.gab&&q._a&&q._a!=='sem'&&q.cl&&q.cl[0]);
const foKT=q=>q._a+'|'+q.cl[0],foKS=q=>q._a+'|'+q.cl[0]+'|'+(q.cl[1]||'');
// agrega um conjunto de questões: contagem por dificuldade, feitas, acerto (por resposta) e fáceis+médias ainda não vistas
function foAgg(qs,R,vistas){
  const x={n:qs.length,f:0,m:0,d:0,feitas:0,resp:0,ok:0,restam:0,restamIds:[]};
  qs.forEach(q=>{const k=foDif(q);x[k]++;const r=R[q.id];if(r){x.feitas++;x.resp+=r.n;x.ok+=r.n-r.e}
    if(!vistas.has(q.id)&&k!=='d'){x.restam++;x.restamIds.push(q.id)}});
  x.acerto=x.resp?x.ok/x.resp:null;x.fac=x.n?(x.f+.6*x.m+.1*x.d)/x.n:0;return x}
const foRespostas=(log,ids)=>{const R={};log.forEach(l=>{if(!ids.has(l.q))return;const x=R[l.q]??={n:0,e:0};x.n++;if(!l.ok)x.e++});return R};
// meta: orçamento dividido pela prioridade, limitado ao que resta de fáceis+médias do tema (a sobra é redistribuída)
function foMeta(rows,orc){
  const m=rows.map(()=>0),cap=rows.map(r=>r.restam);let ativo=rows.map((_,i)=>i),sobra=Math.max(0,Math.floor(orc));
  while(ativo.length&&sobra>0){
    const soma=ativo.reduce((a,i)=>a+rows[i].prio,0);if(!(soma>0))break;
    const cheio=ativo.filter(i=>sobra*rows[i].prio/soma>=cap[i]-m[i]);
    if(cheio.length){cheio.forEach(i=>{sobra-=cap[i]-m[i];m[i]=cap[i]});ativo=ativo.filter(i=>!cheio.includes(i));continue}
    const q=ativo.map(i=>sobra*rows[i].prio/soma);let usado=0;ativo.forEach((i,k)=>{const f=Math.floor(q[k]);m[i]+=f;usado+=f});
    let resto=sobra-usado;
    ativo.map((i,k)=>[i,q[k]-Math.floor(q[k])]).sort((a,b)=>b[1]-a[1]).forEach(([i])=>{if(resto>0&&m[i]<cap[i]){m[i]++;resto--}});
    break}
  rows.forEach((r,i)=>r.meta=m[i])}
function focoCalc(Q,log,o={}){
  const topN=o.top||20,orc=o.orcamento||0,vistas=new Set((o.all||log).map(l=>l.q));
  const B=foBase(Q),ids=new Set(B.map(q=>q.id)),R=foRespostas(log,ids);
  const C=B.filter(foCBR),totC=C.length,totG=B.length;
  const E=f=>{const m={};B.forEach(q=>{const r=R[q.id];if(!r)return;const x=m[f(q)]??={n:0,e:0};x.n+=r.n;x.e+=r.e});return m};
  const eA=E(q=>q._a),eT=E(foKT),eS=E(foKS);
  const G={};B.forEach(q=>(G[foKT(q)]??=[]).push(q));
  const todos=[];
  for(const k in G){
    const qs=G[k],qc=qs.filter(foCBR),a=foAgg(qs,R,vistas),c=foAgg(qc,R,vistas);
    const incC=totC?qc.length/totC:0,incG=totG?qs.length/totG:0,inc=.75*incC+.25*incG;
    const ea=eA[qs[0]._a]||{n:0,e:0},pA=(ea.e+.35*4)/(ea.n+4),et=eT[k]||{n:0,e:0},erro=(et.e+pA*4)/(et.n+4);
    const prio=inc*(.5+1.5*erro)*(.6+.8*a.fac)*(1-.5*(a.feitas/a.n));
    const sc={};(qc.length?qc:qs).forEach(q=>{const s=q.cl[1];if(s)sc[s]=(sc[s]||0)+1});
    todos.push({k,a:qs[0]._a,t:qs[0].cl[0],n:a.n,nC:qc.length,incC,incG,inc,erro,fac:a.fac,f:a.f,m:a.m,d:a.d,fC:c.f,mC:c.m,dC:c.d,
      feitas:a.feitas,acerto:a.acerto,restam:a.restam,prio,
      subs:Object.entries(sc).sort((x,y)=>y[1]-x[1]).slice(0,3).map(([s,n])=>({s,n})),viaGeral:incG>2*incC})}
  const temas=todos.filter(r=>r.restam>0).sort((a,b)=>b.prio-a.prio),top=temas.slice(0,topN);
  foMeta(top,orc);
  const fe=C.filter(q=>R[q.id]),rc=C.reduce((a,q)=>a+(R[q.id]?R[q.id].n:0),0),oc=C.reduce((a,q)=>a+(R[q.id]?R[q.id].n-R[q.id].e:0),0);
  const rg=B.reduce((a,q)=>a+(R[q.id]?R[q.id].n:0),0),og=B.reduce((a,q)=>a+(R[q.id]?R[q.id].n-R[q.id].e:0),0);
  const anos=[...new Set(C.flatMap(foAnos))].filter(Boolean).sort();
  return {resumo:{totC,totG,pctBanco:totG?totC/totG:0,anos,feitasC:fe.length,acertoC:rc?oc/rc:null,acertoGeral:rg?og/rg:null,orcamento:orc},temas,top}}
// panorama: tabela por área/tema/subtema, base CBR ou banco inteiro, com ordenação
function foTab(Q,log,o={}){
  const nivel=o.nivel||'tema',cbr=(o.base||'cbr')==='cbr',vistas=new Set((o.all||log).map(l=>l.q));
  const B=foBase(Q),ids=new Set(B.map(q=>q.id)),R=foRespostas(log,ids),S=cbr?B.filter(foCBR):B;
  const key=nivel==='area'?q=>q._a:nivel==='sub'?foKS:foKT,G={};S.forEach(q=>(G[key(q)]??=[]).push(q));
  const rows=Object.entries(G).map(([k,qs])=>{const a=foAgg(qs,R,vistas);
    return {k,q0:qs[0],n:a.n,pct:S.length?a.n/S.length:0,f:a.f,m:a.m,d:a.d,fac:a.fac,feitas:a.feitas,acerto:a.acerto,restam:a.restam,erro:(a.resp-a.ok+.35*3)/(a.resp+3)}});
  const ord=o.ordem||'inc',cmp={inc:(a,b)=>b.n-a.n,fac:(a,b)=>b.fac-a.fac||b.n-a.n,erro:(a,b)=>b.erro-a.erro||b.n-a.n,rest:(a,b)=>b.restam-a.restam||b.n-a.n}[ord];
  rows.sort(cmp);return {total:S.length,rows:nivel==='area'?rows:rows.slice(0,o.top||30)}}
// dificuldade: % f/m/d no CBR, no banco inteiro e o acerto dele em cada nível
function foDifCmp(Q,log){
  const B=foBase(Q),ids=new Set(B.map(q=>q.id)),R=foRespostas(log,ids),C=B.filter(foCBR);
  const dist=S=>{const c={f:0,m:0,d:0};S.forEach(q=>c[foDif(q)]++);return c};
  const ac={f:[0,0],m:[0,0],d:[0,0]};B.forEach(q=>{const r=R[q.id];if(r){const a=ac[foDif(q)];a[0]+=r.n-r.e;a[1]+=r.n}});
  return {cbr:dist(C),geral:dist(B),nC:C.length,nG:B.length,acerto:Object.fromEntries(Object.entries(ac).map(([k,[o,n]])=>[k,n?o/n:null])),resp:Object.fromEntries(Object.entries(ac).map(([k,[,n]])=>[k,n]))}}
// quantas questões de cada tema entram num bloco misto (n sorteios com peso = prio, limitados ao que resta do tema)
function foSorteia(top,n,rnd=Math.random){
  const c=top.map(()=>0);
  for(let i=0;i<n;i++){
    const w=top.map((r,j)=>c[j]<r.restam?r.prio:0),t=w.reduce((a,b)=>a+b,0);if(!(t>0))break;
    let x=rnd()*t,j=0;for(;j<w.length-1;j++){x-=w[j];if(x<=0)break}
    if(!w[j])j=w.findIndex(v=>v>0);c[j]++}
  return c}

// ---- UI (usa os globais do app) ----
let foUlt=null,foBaseSel='cbr',foOrd='inc',foAbertos=new Set();
const foP=v=>v==null?'—':(v*100).toLocaleString('pt-BR',{maximumFractionDigits:v<.1?1:0})+'%';
const foFmd=(f,m,d)=>`<span style="color:var(--ok)">${f}</span>/${m}/<span style="color:var(--bad,#c0392b)">${d}</span>`;
const foNome=r=>`${esc(AREA_BY[r.a].nome)} › ${esc(r.t)}`;
// 1.52.0: resumos ligados (window.RESUMOS_IDX = resumos/indice.json: {pagina,titulo,chave:'area|Tema|Subtema',cards}); chave no formato de foKS
const foRes=()=>window.RESUMOS_IDX||[];
const foResTema=k=>foRes().filter(r=>String(r.chave||'').startsWith(k+'|'));
const foResSub=k=>foRes().filter(r=>r.chave===k);
const foResBtn=r=>`<button class="b s" style="padding:2px 8px;font-size:.74rem;margin:3px 4px 0 0" onclick="foResAbre('${esc(r.pagina)}')" title="Abrir o resumo nas Notas">📖 ${esc(r.titulo)}</button>`;
function foResAbre(id){if(typeof ntPainelAbre==='function')ntPainelAbre(id)}
function foN(){return [10,20,30].includes(+cfg.focoN)?+cfg.focoN:20}
function foSetN(v){cfg.focoN=+v;persist('_est');render()}
function foSetPref(c){cfg.focoCbr=!!c;persist('_est');render()}
function foPacote(n,filtro){
  const pref=cfg.focoCbr!==false;let ids=pref?pacoteVolume(n,q=>filtro(q)&&foCBR(q)):[];
  if(ids.length<n){const j=new Set(ids);ids=ids.concat(pacoteVolume(n-ids.length,q=>filtro(q)&&!j.has(q.id)))}
  return ids}
function foTreinar(i){const r=foUlt&&foUlt.top[i];if(!r)return;iniciar(foPacote(foN(),q=>q.gab&&q._a&&q.cl&&q.cl[0]&&foKT(q)===r.k),'estudo')}
function foMisto(){
  if(!foUlt||!foUlt.top.length)return;const c=foSorteia(foUlt.top,foN());let ids=[];
  foUlt.top.forEach((r,i)=>{if(c[i])ids=ids.concat(foPacote(c[i],q=>q.gab&&q._a&&q.cl&&q.cl[0]&&foKT(q)===r.k))});
  iniciar(embaralha(ids),'estudo')}
function foTog(k,el){const a=foAbertos.has(k);if(el.open===a)return;el.open?foAbertos.add(k):foAbertos.delete(k);render()}
function foSet(k,v){if(k==='b')foBaseSel=v;else foOrd=v;render()}
function foTabHtml(nivel){
  const T=foTab(Q,log,{nivel,base:foBaseSel,ordem:foOrd,all});
  const nm=r=>nivel==='area'?esc(AREA_BY[r.q0._a].nome):nivel==='tema'?foNome({a:r.q0._a,t:r.q0.cl[0]}):`${esc(AREA_BY[r.q0._a].nome)} › ${esc(r.q0.cl[0])} › ${esc(r.q0.cl[1]||'—')}`;
  return `<div class="tw"><table><tr><th>${nivel==='area'?'Área':nivel==='tema'?'Tema':'Subtema'}</th><th>n</th><th>%</th><th>f/m/d</th><th>Feitas</th><th>Acerto</th><th>Restam f+m</th></tr>${T.rows.map(r=>`<tr><td>${nm(r)}${nivel==='sub'&&foResSub(r.k).length?`<div>${foResSub(r.k).map(foResBtn).join('')}</div>`:''}</td><td>${r.n}</td><td>${foP(r.pct)}</td><td>${foFmd(r.f,r.m,r.d)}</td><td>${r.feitas}</td><td>${r.acerto==null?'—':foP(r.acerto)}</td><td>${r.restam}</td></tr>`).join('')}</table></div>`}
function vFoco(){
  const orc=Math.max(0,diasProva())*RI_DIARIA,F=focoCalc(Q,log,{orcamento:orc,all}),r=F.resumo;foUlt=F;
  const sel=(k,v,ops)=>`<select onchange="foSet('${k}',this.value)">${ops.map(([x,t])=>`<option value="${x}" ${v===x?'selected':''}>${t}</option>`).join('')}</select>`;
  const linhas=F.top.map((t,i)=>`<tr><td>${i+1}</td><td style="min-width:150px"><b>${foNome(t)}</b>${t.viaGeral?' <span class="tag">pelo banco geral</span>':''}${t.subs.length?`<div class="mut" style="font-size:.76rem">${t.subs.map(s=>esc(s.s)+' ('+s.n+')'+(foResSub(t.k+'|'+s.s).length?' 📖':'')).join(' · ')}</div>`:''}${foResTema(t.k).length?`<div>${foResTema(t.k).map(foResBtn).join('')}</div>`:''}</td>
    <td>${foP(t.incC)} (${t.nC})</td><td>${foP(t.incG)}</td><td>${t.nC?foFmd(t.fC,t.mC,t.dC):'—'}</td><td>${t.feitas}/${t.n}</td><td>${t.acerto==null?'—':foP(t.acerto)}</td><td>${t.restam}</td>
    <td><button class="b s" style="padding:4px 10px" onclick="foTreinar(${i})">Treinar</button></td></tr>`).join('');
  const D=foDifCmp(Q,log),dp=(c,n)=>['f','m','d'].map(k=>foP(n?c[k]/n:0)).join(' / '),da=['f','m','d'].map(k=>D.acerto[k]==null?'—':foP(D.acerto[k])).join(' / ');
  const pan=(k,nome)=>`<details ${foAbertos.has(k)?'open':''} ontoggle="foTog('${k}',this)" style="margin-top:6px"><summary><b>${nome}</b></summary>${foAbertos.has(k)?foTabHtml(k):''}</details>`;
  return `<div class="card"><h2>Foco até a prova (CBR)</h2>
  <p><b>${r.totC}</b> questões do CBR no banco (${foP(r.pctBanco)} das ${r.totG} válidas) · anos: ${r.anos.length?r.anos.join(', '):'—'}<br>
  Você fez <b>${r.feitasC}</b> do CBR${r.acertoC==null?'':` (acerto ${foP(r.acertoC)})`} · acerto geral ${foP(r.acertoGeral)}<br>
  <b>${diasProva()}</b> dias até a prova · orçamento <b>${orc}</b> questões (${RI_DIARIA}/dia)</p>
  <h3>Top ${F.top.length} prioridades (tema)</h3>
  <p class="mut">Incidência no CBR (75%) e no banco (25%) × seu erro × facilidade × o que ainda não fez.</p>
  ${F.top.length?`<div class="tw"><table><tr><th>#</th><th>Área › Tema</th><th>Incid. CBR</th><th>Incid. geral</th><th>f/m/d CBR</th><th>Feitas</th><th>Acerto</th><th>Restam f+m</th><th></th></tr>${linhas}</table></div>`:'<p class="mut">Nenhum tema com fáceis ou médias pendentes.</p>'}
  <div class="row" style="margin-top:10px"><label>Bloco ${sel('n',String(foN()),[['10','10'],['20','20'],['30','30']]).replace("foSet('n',this.value)","foSetN(this.value)")}</label>
   <label class="row"><input type="checkbox" ${cfg.focoCbr!==false?'checked':''} onchange="foSetPref(this.checked)"> preferir questões do CBR</label>
   <button class="b" ${F.top.length?'':'disabled'} onclick="foMisto()">Bloco misto dos ${F.top.length} temas</button></div>
  <h3 style="margin-top:14px">Panorama</h3>
  <div class="row">Base: ${sel('b',foBaseSel,[['cbr','CBR'],['geral','Banco inteiro']])} Ordenar por: ${sel('o',foOrd,[['inc','incidência'],['fac','facilidade (mais fáceis)'],['erro','erro (seu)'],['rest','restantes']])}</div>
  ${pan('area','Por área')}${pan('tema','Por tema (top 30)')}${pan('sub','Por subtema (top 30)')}
  <p class="mut" style="margin-top:8px">Dificuldade (fácil / média / difícil; sem dado conta como média): CBR ${dp(D.cbr,D.nC)} · banco inteiro ${dp(D.geral,D.nG)} · seu acerto ${da}</p></div>`}
