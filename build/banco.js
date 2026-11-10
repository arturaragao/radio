// ===== aba Banco (app): igual ao Notion — todas as questões numeradas, em toggle =====
let bq='',bf={a:'',d:'',s:'',c:'',p:''},bAbertos=new Set(),bLim=150;
const recente=q=>q.origem==='extensao'&&q.chegou&&Date.now()-Date.parse(q.chegou)<7*864e5;
// ordem do Banco: número do Notion decrescente (últimas em cima); sem número no fim
const bOrdena=L=>L.slice().sort((a,b)=>(a.n==null)-(b.n==null)||(a.n==null?0:b.n-a.n));
function comentAlt(q,l){
  const c=q.curso&&q.curso.coment&&q.curso.coment[l],k=q.coment&&q.coment[l];
  if(!c&&!k)return'';
  return `<div class="cmw">${c?`<div class="mut md cm cmc"><span class="src">Curso</span>${md(c)}</div>`:''}${k?`<div class="mut md cm cmk"><span class="src">Claude</span>${md(k)}</div>`:''}</div>`;
}
function cursoBloco(q){
  const c=q.curso;if(!c)return prDadosBloco(q)+prTagsBloco(q);
  const sec=Object.entries(c.secoes||{}).map(([k,v])=>[k,(v||[]).filter(t=>!/^\s*(?:📊|Acerto dos alunos:|Alternativas marcadas:|Tempo:|Dados do site\s*$)/i.test(t))]).filter(([k,v])=>v&&v.length&&!/alternativ/i.test(k));
  if(!c.ponto&&!sec.length)return prDadosBloco(q)+prTagsBloco(q);
  return `<div class="ponto md pcurso"><div class="kick">Ponto de ensino · Curso (PersonalRad)</div>${c.ponto?md(c.ponto):''}${sec.map(([k,v])=>`<div class="kick" style="margin-top:8px">${esc(k)}</div>${md(v.join('\n\n'))}`).join('')}</div>${prDadosBloco(q)}${prTagsBloco(q)}`;
}
function bStatus(q,ult){const l=ult[q.id];return l?(l.ok?'<span class="bok">✓</span>':'<span class="bbad">✗</span>'):'<span class="mut">·</span>'}
function prAcertoBloco(q){const ac=acertoPR(q),n=prStats(q).respostas;return ac==null?'':`<span class="mut" style="font-size:.82rem"> · acerto dos alunos ${ac.toLocaleString('pt-BR',{maximumFractionDigits:2})}%${n!=null?' ('+n+')':''}</span>`}
function bCorpo(q){
  const ult={};log.forEach(l=>ult[l.q]=l);const r=ult[q.id];
  const imgs=galeria(q,'q'),imgsC=galeria(q,'c');
  const alts=qAlternativas(q,{r,fb:true,leitura:true});
  return `<div class="bc">
    <div class="mut" style="font-size:.82rem">${esc([AREA_BY[q._a].nome,...(q.cl||[])].join(' › '))}${q.classif?'':' · <b>ainda sem classificação</b>'}${prProvaBloco(q)}${prAvisoBloco(q)}</div>
    ${q.tags.length?`<div style="margin-top:4px">${q.tags.filter(t=>!isMeta(t)).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>`:''}
    <div class="row">${qDificuldade(q)}<span class="mut">${r?'Feita · '+(r.ok?'acertou':'errou'):'Não feita'}</span></div>
    ${qEnunciado(q,imgs)}${alts}
    <p style="margin:8px 0"><b>Gabarito: ${q.gab||'—'}</b>${prAcertoBloco(q)}${r?` · <span class="mut">sua última resposta: ${r.e||'?'} (${r.ok?'acertou':'errou'}, ${r.conf||''})</span>`:''}</p>
    ${cursoBloco(q)}${claudeMdBloco(q)}${pontoDe(q)?`<div class="ponto md"><div class="kick">CCQ · Claude</div>${md(pontoDe(q))}</div>`:''}<div class="imgs">${imgsC}</div>
    <div class="row" style="margin-top:8px"><span class="mut" style="font-size:.8rem">${q.chegou?'chegou em '+new Date(q.chegou).toLocaleDateString('pt-BR'):''}${q.origem==='extensao'?' pela extensão':''}</span></div>
  </div>`;
}
function bTog(id,el){
  if(!el.isConnected)return; // ignora eventos de nós substituídos por render/sincronização
  if(el.open){if(!el.querySelector('.bc'))el.insertAdjacentHTML('beforeend',bCorpo(QID[id]));bAbertos.add(id)}
  else{bAbertos.delete(id);const c=el.querySelector('.bc');if(c)c.remove()}
}
async function bBaixar(){const el=$('#b_dl');if(el)el.disabled=true;
  const n=await BCBR.baixarTudo((i,t)=>{const e=$('#b_dl');if(e)e.textContent=`Baixando imagens… ${i}/${t}`},typeof ofImagensNotas==='function'?ofImagensNotas():[]);
  toast(`${n} imagens guardadas neste aparelho`);const e=$('#b_dl');if(e){e.disabled=false;e.textContent='Baixar imagens para offline'}}
function vBanco(){
  const n=norm(bq),ult={};log.forEach(l=>ult[l.q]=l);
  const L=bOrdena(Q.filter(q=>(!n||norm((q.n??'')+' '+q.enunciado+' '+q.tags.join(' ')+' '+(q.cl||[]).join(' ')).includes(n))
    &&(!bf.a||q._a===bf.a)&&(!bf.d||q._d===bf.d)
    &&(!bf.s||(bf.s==='nao'?!ult[q.id]:bf.s==='ok'?ult[q.id]&&ult[q.id].ok:ult[q.id]&&!ult[q.id].ok))
    &&(!bf.c||(bf.c==='sem'?!q.classif:recente(q)))&&(!bf.p||foCBR(q))));
  const sg=Q.filter(q=>!q.gab).length,semc=Q.filter(q=>!q.classif).length,nov=Q.filter(recente).length,feitas=Q.filter(q=>ult[q.id]).length;
  const sel=(id,k,ops)=>`<select id="${id}" onchange="bf.${k}=this.value;bLim=150;render()">${ops.map(([v,t])=>`<option value="${v}" ${bf[k]===v?'selected':''}>${t}</option>`).join('')}</select>`;
  const linhas=L.slice(0,bLim).map(q=>`<details class="bq" data-qid="${q.id}" ${bAbertos.has(q.id)?'open':''} ontoggle="bTog('${q.id}',this)"><summary>
      <span class="bs">${bStatus(q,ult)}</span>
      <span class="bm"><span class="be"><b>Questão ${q.n??'—'}</b> · ${esc(q.enunciado.slice(0,130))}${q.enunciado.length>130?'…':''} ${q._d?' · '+qDificuldade(q):''}</span>
      <span class="bl"><span class="ba">${AREA_BY[q._a].nome}</span>${q.classif?'':'<span class="tag">sem classificação</span>'}${q.tags.length?q.tags.filter(t=>!isMeta(t)).slice(0,4).map(t=>`<span class="tag">${esc(t)}</span>`).join(''):''}${q.imgs&&q.imgs.length?'<span class="tag">🖼 '+q.imgs.length+'</span>':''}${recente(q)?'<span class="nova">nova</span>':''}${q.gab?'':'<span class="tag">sem gabarito</span>'}</span></span>
    </summary>${bAbertos.has(q.id)?bCorpo(q):''}</details>`).join('');
  return `<div class="card"><h2>Banco (${Q.length} questões)</h2>
  <p class="mut">${feitas} feitas · ${semc} sem classificação · ${sg} sem gabarito (não entram nos estudos) · ${nov} novas nos últimos 7 dias</p>
  <div class="row bfil"><input id="b_q" placeholder="Buscar por número, texto ou tag" value="${esc(bq)}" onchange="bq=this.value;bLim=150;render()" style="flex:1;min-width:180px">
   ${sel('b_p','p',[['','Todas as provas'],['cbr','Só CBR']])}
   ${sel('b_a','a',[['','Todas as áreas'],...AREAS.map(a=>[a.id,a.nome]),['sem','Sem área']])}
   ${sel('b_d','d',[['','Todas as dificuldades'],['f','Fácil'],['m','Média'],['d','Difícil']])}
   ${sel('b_s','s',[['','Feitas e não feitas'],['nao','Não feitas'],['ok','Acertei'],['err','Errei']])}
   ${sel('b_c','c',[['','Todas'],['sem','Sem classificação'],['novas','Novas (7 dias)']])}</div>
  <p class="mut">${L.length} questões</p>
  <div class="blist">${linhas}</div>
  ${L.length>bLim?`<p><button class="b s" onclick="bLim+=300;render()">Mostrar mais (${L.length-bLim} restantes)</button> <button class="b s" onclick="bLim=1e9;render()">Mostrar todas</button></p>`:''}
  <div class="row" style="margin-top:14px"><button class="b s" id="b_dl" onclick="bBaixar()">Baixar imagens para offline</button><button class="b s" onclick="BCBR.config()">Chaves deste aparelho</button></div></div>`;
}

// ===== comentário novo do Claude (modelo "B didático", gerado pelo Gemini à noite ou pelo botão) =====
function claudeMdBloco(q){
  if(!q.claudeMd)return'';
  const P=iaParse(q.claudeMd);
  return `<div class="ponto md pclaude"><div class="kick">Comentário do Claude</div>${md(P.rest)}${P.fl?`<div class="row" style="margin-top:6px"><button class="b s" onclick="mdFlash('${q.id}')">+ virar flashcard</button></div>`:''}</div>`;
}
function mdFlash(id){const q=QID[id],P=iaParse(q.claudeMd||'');if(!P.fl)return;const f=P.fl[0],v=P.fl[1];
  if(cards.some(c=>!c.x&&c.f===f&&c.v===v)){toast('Esse flashcard já existe.');return}
  const c={id:'c'+Date.now().toString(36),f,v,tg:tagStr(q),u:Date.now()};cards.push(c);persist('c:'+hk(c.id,32));toast('Flashcard criado')}
const MODELO_COMENT=`Seções, nesta ordem (markdown, português, didático, explicando o PORQUÊ; não repetir o comentário do curso):
**🔑 Conceito-chave** (2–3 frases) · **🧩 Entenda o raciocínio** (2–4 tópicos; em questão fácil, 1–2 ou omitir) · **🖼️ Na imagem** (só se houver imagem: onde olhar e o que ver) · **🩻 Diferenciais** (só se for diagnóstico: tabela "Diagnóstico | o que separa", 2–3 linhas) · **🎯 Como acertar** · **⚠️ Pegadinha** · **⭐ Para a prova** (1 linha). Última linha: FLASH: pergunta curta :: resposta curta. ~80 palavras (fácil) a ~150 (difícil). Não invente números nem referências.`;
function promptIA(q){
  const r=sess&&sess.resp&&sess.resp[q.id];const errou=r&&!r.ok&&r.esc;
  const cur=q.curso||{};
  return `Você é professor de radiologia preparando um residente para a prova de título do CBR. Escreva o comentário desta questão.
${errou?`O aluno marcou ${r.esc} (errado). COMECE com a seção **❌ Por que você errou**: explique o raciocínio que leva à ${r.esc} e onde ele quebra (2–3 frases).\n`:''}${MODELO_COMENT}
Dificuldade: ${q._d?DIF[q._d].nome:'?'}.

Questão: ${q.enunciado.slice(0,1500)}
${Object.entries(q.alts).map(([l,t])=>l+') '+t.slice(0,300)).join('\n')}
Gabarito: ${q.gab}
Comentário do curso (não repetir): ${JSON.stringify(cur.coment||{}).slice(0,1500)}
Ponto de ensino do curso: ${String(cur.ponto||'').slice(0,600)}`;
}

// ===== minivisualizador de imagens: uma por vez, miniaturas, setas; clique abre o zoom de sempre =====
const gIdx={},gLeg={};
function galLista(q,t){const L=(t==='c'?q.imgsCom:q.imgs)||[],G=(t==='c'?q.legendasCom:q.legendas)||[];return L.map((u,i)=>({u,leg:G[i]||''})).filter(x=>imgSrc(x.u))}
function galInner(q,t){
  const L=galLista(q,t),k=q.id+'_'+t;if(!L.length)return'';
  let i=gIdx[k]||0;if(i>=L.length)i=0;const x=L[i],n=L.length;
  return `<div class="galm">${n>1?`<button class="galb" aria-label="Imagem anterior" onclick="galVai('${q.id}','${t}',-1)">‹</button>`:''}
    <img src="${imgSrc(x.u)}" data-u="${x.u}" onclick="zoom('${x.u}')" alt="Imagem ${i+1} de ${n}" fetchpriority="high">
    ${n>1?`<button class="galb dir" aria-label="Próxima imagem" onclick="galVai('${q.id}','${t}',1)">›</button><span class="galn">${i+1}/${n}</span>`:''}</div>
    ${x.leg&&gLeg[k]!==false?`<div class="gall md">${md(x.leg)}</div>`:''}
    ${n>1?`<div class="galt">${L.map((y,j)=>`<img src="${imgSrc(y.u)}" data-u="${y.u}" class="${j===i?'on':''}" onclick="galVai('${q.id}','${t}',0,${j})" alt="Miniatura ${j+1}">`).join('')}</div>`:''}`;
}
function galeria(q,t,leg=true){gLeg[q.id+'_'+t]=leg;const h=galInner(q,t);return h?`<div class="gal" id="gal_${q.id}_${t}">${h}</div>`:''}
function galVai(id,t,d,abs){const q=QID[id],n=galLista(q,t).length,k=id+'_'+t;
  gIdx[k]=abs!=null?abs:((gIdx[k]||0)+d+n)%n;
  document.querySelectorAll('#gal_'+CSS.escape(k)).forEach(el=>{const v=qGuarda(el);el.innerHTML=galInner(q,t);qReusa(el,v)})}

// ===== peso das áreas automático pela incidência do banco =====
let _inc=null,_incN=-1;
function incidencia(id){
  if(_incN!==Q.length){const c={};let tot=0;Q.forEach(q=>{if(!q.gab||q._a==='sem'||!q._a)return;c[q._a]=(c[q._a]||0)+1;tot++});
    _inc={};Object.keys(c).forEach(a=>_inc[a]=c[a]/(tot||1)*100);_incN=Q.length}
  return _inc[id]||0;
}
function pesosUI(){
  const auto=cfg.pesoAuto!==false;
  return `<h3>Peso das áreas na prova (%)</h3>
  <label class="check" style="display:block;margin:6px 0"><input type="checkbox" ${auto?'checked':''} onchange="cfg.pesoAuto=this.checked;persist('_est');render()"> <b>Automático pela incidência do banco</b> (recomendado — se atualiza sozinho quando entram questões novas)</label>
  <p class="mut">${auto?'Calculado agora com '+Q.filter(q=>q.gab&&q._a&&q._a!=='sem').length+' questões (sem contar as de fora da radiologia).':'Manual: vazio = usa a incidência do banco.'}</p>
  <div class="row">${AREAS.map(a=>`<label style="width:46%;min-width:240px">${a.nome} ${auto?`<b>${incidencia(a.id).toFixed(1)}%</b>`:`<input id="p_${a.id}" type="number" step="0.5" style="width:70px" placeholder="${incidencia(a.id).toFixed(1)}" value="${cfg.pesos[a.id]??''}" onchange="setPeso('${a.id}',this.value)">`}</label>`).join('')}</div>`;
}

// ===== layouts da tela da questão =====
const LAYOUTS=[['compacto','Compacto (padrão) — abas em cima, painel de questões em faixa acima da questão'],['compfoco','Compacto + Foco — igual, sem cabeçalho (botão ⤢ Foco na questão)'],['otimizado','Otimizado — combina os outros conforme a tela'],['lado','2 · Lado a lado — imagem fixa à esquerda (PC/tablet)'],['foco','3 · Foco — tela cheia, sem cabeçalho nem painel'],['grade','4 · Alternativas em grade — curtas em 2 colunas'],['ajustada','5 · Imagem ajustada à tela — imagem ocupa só o espaço que sobra'],['original','Original do artefato']];
function aplicaLayout(){if(typeof qaBotao==="function")qaBotao();
  const b=document.body,l=cfg.layout||'compacto';
  b.classList.toggle('emquiz',tela==='quiz');
  LAYOUTS.forEach(([k])=>b.classList.toggle('lay-'+k,k===l));
  let fb=document.getElementById('focoBtn');const foco=l==='foco'||l==='compfoco';
  if(tela==='quiz'&&l!=='original'){if(!fb){fb=document.createElement('button');fb.id='focoBtn';b.appendChild(fb)}
    fb.textContent=foco?'⤡ Sair do foco':'⤢ Foco';fb.title=foco?'Mostrar o cabeçalho e as abas':'Esconder o cabeçalho e as abas';
    fb.onclick=()=>{cfg.layout=foco?(l==='foco'?'otimizado':'compacto'):'compfoco';persist('_est');render()}}
  else if(fb)fb.remove();
  if(tela==='quiz')setTimeout(qCentraNum,0);
}
// 1.37.0: centraliza o número atual só dentro da faixa que rola na horizontal; nunca rola a página (pedido do Artur, 06/11/2026:
// ao responder a página não pode mexer — o scrollIntoView antigo subia a página até a grade de números).
function qCentraNum(){
  const c=document.querySelector('.qnav .qn.cur');if(!c)return;
  for(let e=c.parentElement;e&&e!==document.body;e=e.parentElement){
    const o=getComputedStyle(e).overflowX;
    if((o==='auto'||o==='scroll')&&e.scrollWidth>e.clientWidth+1){const cr=c.getBoundingClientRect(),er=e.getBoundingClientRect();e.scrollLeft+=(cr.left+cr.width/2)-(er.left+er.width/2);return}
  }
}
function layoutUI(){
  return `<h3>Layout da questão</h3><p class="mut">Como a questão aparece quando você está respondendo. Muda na hora.</p>
  <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:12px">${LAYOUTS.map(([k,n])=>`<label class="check"><input type="radio" name="lay" ${ (cfg.layout||'compacto')===k?'checked':''} onchange="cfg.layout='${k}';persist('_est');render()"> ${n}</label>`).join('')}</div>`;
}

// ===== MODO PRÉ-PROVA (pedido do Artur, 20/10/2026 — vale até a prova) =====
// Objetivo: ver o MÁXIMO de questões novas. Regras: só questões ainda não respondidas (nem as erradas voltam por enquanto);
// fáceis >> médias >> difíceis (quase nunca); peso maior para área/tema/subtema mais incidentes no banco e para os temas que
// ele mais erra; intercalado (poucas do mesmo subtema por pacote). Vale para RI, temas, simulados, Estudar e "novas da área".
// Parâmetros no Manual (aba Config): modo_prova, peso_facil, peso_media, peso_dificil, max_por_subtema.
const modoProva=()=>String(PARAM.modo_prova??1)!=='0';
let _pv=null,_pvN=-1;
function _pvBase(){
  if(_pvN===log.length+Q.length*1e6)return _pv;
  const C=(f)=>{const m={};Q.forEach(q=>{if(!q.gab||q._a==='sem')return;const k=f(q);if(k)m[k]=(m[k]||0)+1});const v=Object.values(m),me=v.reduce((a,b)=>a+b,0)/(v.length||1)||1;return {m,me}};
  const kA=q=>q._a,kT=q=>q.cl&&q.cl[0]?q._a+'|'+q.cl[0]:null,kS=q=>q.cl&&q.cl[1]?q._a+'|'+q.cl[0]+'|'+q.cl[1]:null;
  const iA=C(kA),iT=C(kT),iS=C(kS);
  const E=(f)=>{const m={};log.forEach(l=>{const q=QID[l.q];if(!q)return;const k=f(q);if(!k)return;const x=m[k]??={n:0,e:0};x.n++;if(!l.ok)x.e++});return m};
  const eA=E(kA),eT=E(kT),eS=E(kS);
  _pv={kA,kT,kS,iA,iT,iS,eA,eT,eS};_pvN=log.length+Q.length*1e6;return _pv;
}
function pesoVolume(q){
  const b=_pvBase(),dif={f:+(PARAM.peso_facil??6),m:+(PARAM.peso_media??3),d:+(PARAM.peso_dificil??0.15)};
  const wd=dif[q._d]??dif.m;
  const r=(I,k,ex)=>k&&I.m[k]?Math.pow(I.m[k]/I.me,ex):1;
  const wInc=Math.min(4,Math.max(.3,r(b.iA,b.kA(q),.5)*r(b.iT,b.kT(q),.5)*r(b.iS,b.kS(q),.25)));
  // erro: média bayesiana — subtema puxado para o tema, tema puxado para a área, área para 35%
  const ea=b.eA[b.kA(q)]||{n:0,e:0},pA=(ea.e+.35*4)/(ea.n+4);
  const et=b.eT[b.kT(q)]||{n:0,e:0},pT=(et.e+pA*4)/(et.n+4);
  const es=b.eS[b.kS(q)]||{n:0,e:0},pS=(es.e+pT*3)/(es.n+3);
  const wErr=0.5+2.2*pS;
  return wd*wInc*wErr*pesoPR(q);
}
function pacoteVolume(n,filtro=()=>true){
  const vistas=new Set(all.map(l=>l.q)),maxS=+(PARAM.max_por_subtema??2),b=_pvBase();
  const pool=Q.filter(q=>q.gab&&!(q.classif&&q._a==='sem')&&!vistas.has(q.id)&&filtro(q)).map(q=>({q,w:Math.max(pesoVolume(q),1e-6)}));
  const out=[],cS={},cT={};
  while(out.length<n&&pool.length){
    pool.forEach(x=>{const s=b.kS(x.q),t=b.kT(x.q);x.wa=x.w*((cS[s]||0)>=maxS?.05:1)*Math.pow(.6,cT[t]||0)});
    let tot=pool.reduce((a,x)=>a+x.wa,0),r=Math.random()*tot,i=0;
    for(;i<pool.length-1;i++){r-=pool[i].wa;if(r<=0)break}
    const x=pool.splice(i,1)[0];out.push(x.q.id);const s=b.kS(x.q),t=b.kT(x.q);cS[s]=(cS[s]||0)+1;cT[t]=(cT[t]||0)+1;
  }
  return out;
}
// texto do cartão da Revisão Inteligente = o que a lista de hoje tem de fato
function riDesc(devidas){
  if(!modoProva())return `${RI_DIARIA} questões do dia (a lista só muda à 00:00): ${devidas} vencidas no total, o restante sorteado com mais peso nos temas frequentes e fracos.`;
  const ids=riHoje(),ini=hoje0(),vistas=new Set(log.filter(l=>l.t<ini).map(l=>l.q)),rep=ids.filter(i=>vistas.has(i)).length,nov=ids.length-rep;
  const d=diasProva(),fim=+(PARAM.revisao_final_dias??14),cnt={f:0,m:0,d:0,sem:0};ids.forEach(i=>{const q=QID[i];if(q&&!vistas.has(i))cnt[q._d??'sem']++});
  const reta=emReta();
  return `Meta diária: <b>${RI_DIARIA} questões</b>. <b>${nov} questões novas</b>${rep?` + <b>${rep} errada${rep>1?'s':''} para rever</b>${reta?' (reta final: erradas fáceis e médias)':' (errou com certeza ou era fácil)'}`:''}. `+
   `${cnt.f} fáceis · ${cnt.m} médias${cnt.sem?' · '+cnt.sem+' sem dificuldade':''}${cnt.d?' · '+cnt.d+(cnt.d>1?' difíceis':' difícil'):''}, sorteadas com mais peso nas áreas e temas que mais caem e nos que você mais erra. A lista só muda à meia-noite.`;
}
// repetidas eventuais (pedido do Artur, 22/10/2026): ~1 a cada 25, no máx. 2 por RI — só erradas COM CERTEZA ou erradas FÁCEIS, última resposta errada há 5+ dias
function pacoteRepeteRaro(n){
  const ult={};log.forEach(l=>ult[l.q]=l);const lim=Date.now()-(+(PARAM.repete_dias??5))*DAY,cada=+(PARAM.repete_cada??25);
  const pool=Q.filter(q=>{const l=ult[q.id];return q.gab&&l&&!l.ok&&l.t<lim&&(l.conf==='certeza'||q._d==='f')});
  let k=Math.floor(n/cada);if(Math.random()<n/cada-k)k++;k=Math.min(2,k,pool.length);
  return k?sorteioPonderado(pool,q=>pesoVolume(q)*(ult[q.id].conf==='certeza'?2:1),k,false).map(q=>q.id):[];
}
function revisaoDoDia(){
  if(!modoProva())return revisaoDoDiaOrig(RI_DIARIA);
  const n=tamanhoRI(),d=diasProva(),fim=+(PARAM.revisao_final_dias??14);
  if(emReta()){const e=pacoteErradas(Math.round(n*.3));return embaralha([...pacoteVolume(n-e.length),...e])}
  const r=pacoteRepeteRaro(n);return r.length?embaralha([...pacoteVolume(n-r.length),...r]):pacoteVolume(n); // repetidas fazem parte das 50
}
function questoesTema(t){return modoProva()?pacoteVolume(10,q=>q._x&&(q._x.t.includes(t)||q._x.o.includes(t))):questoesTemaOrig(t)}
function simulado(et){
  if(!modoProva())return simuladoOrig(et);
  const ids=pacoteVolume(60,q=>etapaDe(q)===et||etapaDe(q)==='?');iniciar(ids,'simulado',et);
}
function novasArea(id){if(!modoProva())return novasAreaOrig(id);iniciar(pacoteVolume(cfg.diario||20,q=>q._a===id),'estudo')}
function comecaFiltro(){
  if(!modoProva()||(fl.status&&fl.status!=='novas'))return comecaFiltroOrig();
  const ok=new Set(filtrar().map(q=>q.id));let ids=pacoteVolume(fl.n,q=>ok.has(q.id));
  if(fl.modo!=='misto')ids.sort((a,b)=>QID[a]._a.localeCompare(QID[b]._a));
  iniciar(ids,'estudo');
}
function modoProvaUI(){
  const vv=new Set(all.map(l=>l.q)),n=Q.filter(q=>q.gab&&!(q.classif&&q._a==='sem')&&!vv.has(q.id)).length;
  return `<h3>Modo pré-prova</h3><label class="check" style="display:block;margin:6px 0"><input type="checkbox" ${modoProva()?'checked':''} onchange="setModoProva(this.checked)"> <b>Máximo de questões novas até a prova</b> — fáceis e médias primeiro (difíceis quase nunca), áreas/temas mais incidentes e os que você mais erra; questões já respondidas não voltam — só, de vez em quando (~1 a cada 25, máx. 2 por dia), uma errada com certeza ou errada fácil.</label>
  <p class="mut">Vale para a Revisão Inteligente, temas, simulados e pacotes do Estudar. ${n} questões novas disponíveis. Pesos no Manual: fácil ${PARAM.peso_facil??6} · média ${PARAM.peso_media??3} · difícil ${PARAM.peso_dificil??0.15}.</p>`;
}
function setModoProva(on){
  const lin='@param modo_prova='+(on?1:0);
  metodo=/^@param\s+modo_prova\s*=.*$/m.test(metodo)?metodo.replace(/^@param\s+modo_prova\s*=.*$/m,lin):metodo+'\n'+lin;
  metoU=Date.now();saveL('cbr_metodo',{t:metodo,u:metoU});lerManual(metodo);persist('m:0');cfg.ri=null;persist('_est');render();
}

// ===== sugestões 1–5 (20/10/2026) =====
// 1) erro vira flashcard automático (o conceito volta em repetição espaçada sem repetir a questão)
const limpaTxt=s=>String(s||'').replace(/<[^>]+>/g,'').replace(/\*\*/g,'').replace(/\s+/g,' ').trim();
function criaFlashErro(q){
  let f='',v='';const P=q.claudeMd?iaParse(q.claudeMd):null;
  if(P&&P.fl){[f,v]=P.fl}
  else{const R=revItens(q);if(R.length){f=limpaTxt(R[0][0]);v=limpaTxt(R[0][1])}
  else if(q.curso&&q.curso.ponto){f=`${(q.cl&&(q.cl[2]||q.cl[1]))||'Conceito'} — qual é o ponto-chave? (Q${q.n??''})`;v=limpaTxt(q.curso.ponto).slice(0,420)}}
  if(!f||!v||cards.some(c=>!c.x&&(c.f===f||c.q===q.id)))return;
  const c={id:'c'+Date.now().toString(36),f,v,tg:(tagStr(q)?tagStr(q)+'; ':'')+'erro',u:Date.now(),q:q.id};cards.push(c);persist('c:'+hk(c.id,32));
  toast('Flashcard do erro criado');
}
function posResposta(q,l){if(!l.ok&&PARAM.flash_erro!==0)criaFlashErro(q)}
// 2) errou com certeza = hipercorreção · 4) comentários recolhidos quando acertou com certeza
function verCom(q){return true}   // pedido do Artur (20/10): comentários sempre visíveis, inclusive quando acerta com certeza
function bannerResp(q,r){return r&&!r.ok&&r.conf==='certeza'?`<div class="hiper">⚠️ <b>Você errou com certeza.</b> É o tipo de erro que mais se corrige agora: leia os dois comentários com calma. Já virou flashcard.</div>`:''}
function blocoFeedback(q,r,html){
  if(verCom(q))return html;
  return `<div class="row" style="margin-top:8px"><button class="b s" onclick="(sess.verCom??={})['${q.id}']=1;render()">Ver comentários</button><span class="mut" style="font-size:.82rem">acertou com certeza — siga para a próxima</span></div>`;
}
// 5) meta diária para cobrir todas as fáceis e médias até a prova (últimos 14 dias ficam para rever os erros)
function _restantesFM(){const v=new Set(all.map(l=>l.q));return Q.filter(q=>q.gab&&!(q.classif&&q._a==='sem')&&!v.has(q.id)&&q._d!=='d').length}
function diasProva(){return Math.ceil((new Date(DATA_PROVA+'T12:00')-Date.now())/DAY)}
// questões fáceis/médias ainda não vistas no começo de hoje (a meta não cai ao longo do dia)
function _restantesInicioDia(){const hj=dKey(Date.now()),ant=new Set(),hoje=new Set();all.forEach(l=>{if(dKey(l.t)<hj)ant.add(l.q);else hoje.add(l.q)});
  return _restantesFM()+[...hoje].filter(id=>!ant.has(id)&&QID[id]&&QID[id].gab&&!(QID[id].classif&&QID[id]._a==='sem')&&QID[id]._d!=='d').length}
// RI fixa em 50; metaDia mantém apenas a estimativa de cobertura do banco no calendário.
function emReta(){const r=typeof smRetaIni==='function'?smRetaIni():null;return !!r&&smHoje()>=r}
function metaDia(){const d=diasProva();if(d==null||d<=0||emReta())return null;
  if(!(typeof smDiasEstudoRestantes==='function'&&SM.d))return null;return Math.ceil(_restantesInicioDia()/Math.max(1,smDiasEstudoRestantes()))}
function tamanhoRI(){return RI_DIARIA}
function metaHoje(){return RI_DIARIA}
function riRefaz(){return !!(cfg.ri&&!cfg.ri.cal&&modoProva()&&typeof SM!=='undefined'&&SM.d&&!log.some(l=>l.t>=hoje0()&&l.modo==='hoje'))}
function metaProvaCard(){
  if(!modoProva())return'';const d=diasProva(),r=_restantesFM(),fim=+(PARAM.revisao_final_dias??14);
  if(d==null)return `<div class="card"><span class="kick">Meta até a prova</span><p class="mut">Coloque a <b>data da prova</b> em Config para eu calcular quantas questões por dia você precisa para ver todas as fáceis e médias. Faltam ${r}.</p></div>`;
  const fase=emReta(),mh=metaHoje();
  return `<div class="card"><span class="kick">Meta até a prova</span><p><b>${d} dias</b> até a prova · <b>${r}</b> questões fáceis e médias ainda não vistas.</p>
   <p class="mut">Meta de hoje: <b>${mh} questões</b> na Revisão do dia.${fase?' <b>Reta final:</b> mistura 70% novas e 30% das fáceis e médias que você errou.':` Os últimos ${fim} dias ficam para rever os erros.`}</p>${typeof smMetaHoje==='function'?smMetaHoje():''}</div>`;
}
// 3) reta final: erradas fáceis/médias voltam (30%) nos últimos dias
function pacoteErradas(k){
  const ult={};log.forEach(l=>ult[l.q]=l);
  const pool=Q.filter(q=>q.gab&&ult[q.id]&&!ult[q.id].ok&&q._d!=='d');
  return sorteioPonderado(pool,q=>pesoVolume(q),k,false).map(q=>q.id);
}
