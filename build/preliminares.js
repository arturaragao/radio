// Página "Preliminares" (1.50.0): laudos preliminares x definitivos lidos em tempo de execução do repo PRIVADO arturaragao/laudos-tutu-dados
// (contrato: Ditado-Laudos-ui/docs/robo-pacs-novo/FORMATO-PARES.md). Nada desses dados fica no repo do app nem no cache do SW.
// Índice primeiro (preliminares/indice.json + lidos.json); cada par (preliminares/pares/<acesso>.json) só ao abrir o toggle do acesso.
const PRL_REPO='arturaragao/laudos-tutu-dados',PRL_LS='bcbr_gh_token_dados',PRL_ORDEM=['Tomografia','Ultrassom','Ressonância','Radiografia','Mamografia','Outros'];
const PRL={itens:null,lidos:{},pares:{},estado:{},erro:'',carregando:false,etag:'',filtro:{texto:'',de:'',ate:'',so:''},semChave:false};
const prelEsc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const prelNorm=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const prelData=d=>/^\d{4}-\d{2}-\d{2}/.test(d||'')?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):(d||'');
// ---- lógica pura (testada em teste/preliminares.test.js) ----
function prelFiltra(itens,f={}){
  const t=prelNorm(f.texto).trim().split(/\s+/).filter(Boolean),lidos=f.lidos||{};
  return (itens||[]).filter(i=>{
    if(f.de&&(i.data||'')<f.de)return false;
    if(f.ate&&(i.data||'')>f.ate)return false;
    if(f.so==='mudou'&&!i.mudou)return false;
    if(f.so==='naolidos'&&lidos[i.acesso])return false;
    if(!t.length)return true;
    const h=prelNorm([i.acesso,i.exame,i.categoria,i.chefe,i.modalidade,prelData(i.data)].join(' '));
    return t.every(p=>h.includes(p));
  });
}
// Categoria > exame > itens (mais recente primeiro). Categorias na ordem do contrato; desconhecidas por último, em ordem alfabética.
function prelAgrupa(itens){
  const cats=new Map();
  for(const i of itens){
    const c=i.categoria||'Outros',e=i.exame||'Sem nome';
    if(!cats.has(c))cats.set(c,new Map());
    const m=cats.get(c);if(!m.has(e))m.set(e,[]);m.get(e).push(i);
  }
  const pos=c=>{const p=PRL_ORDEM.indexOf(c);return p<0?99:p};
  return [...cats].sort((a,b)=>pos(a[0])-pos(b[0])||a[0].localeCompare(b[0],'pt-BR')).map(([categoria,m])=>{
    const exames=[...m].sort((a,b)=>a[0].localeCompare(b[0],'pt-BR')).map(([exame,its])=>({exame,total:its.length,itens:its.slice().sort((a,b)=>(b.data||'').localeCompare(a.data||'')||String(b.acesso).localeCompare(String(a.acesso)))}));
    return {categoria,total:exames.reduce((s,x)=>s+x.total,0),exames};
  });
}
const PRL_OK_TAGS=new Set('p br b strong i em u s strike del ins sub sup ul ol li h1 h2 h3 h4 h5 h6 div span blockquote table thead tbody tr td th'.split(' '));
const PRL_BLOCO=new Set('p br ul ol li h1 h2 h3 h4 h5 h6 div blockquote table tr td th'.split(' '));
const prelDecod=s=>s.replace(/&(nbsp|amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi,(m,e)=>{
  e=e.toLowerCase();if(e==='nbsp')return ' ';if(e==='amp')return '&';if(e==='lt')return '<';if(e==='gt')return '>';if(e==='quot')return '"';if(e==='apos')return "'";
  const n=e[1]==='x'?parseInt(e.slice(2),16):+e.slice(1);return n>0&&n<0x110000?String.fromCodePoint(n):m});
// HTML do PACS -> lista de tokens seguros: {k:'tag',s:'<b>'} | {k:'esp'} | {k:'pal',s:'texto decodificado'}. Só tags da lista, sem atributos; script/style/comentários somem.
function prelTokens(html){
  html=String(html??'').replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi,'');
  const out=[],re=/<(\/?)([a-zA-Z][a-zA-Z0-9]*)[^>]*?(\/?)>|<|[^<\s]+|\s+/g;let m;
  while((m=re.exec(html))){
    if(m[2]){const n=m[2].toLowerCase();if(!PRL_OK_TAGS.has(n))continue;out.push({k:'tag',s:n==='br'?'<br>':m[1]?'</'+n+'>':'<'+n+'>',n,fecha:!!m[1]})}
    else if(m[0]==='<')out.push({k:'pal',s:'<'});
    else if(/^\s+$/.test(m[0]))out.push({k:'esp'});
    else{
      // palavra pode misturar entidades (&nbsp; vira espaço e a divide)
      const d=prelDecod(m[0]);d.split(/\s+/).forEach((p,j)=>{if(j)out.push({k:'esp'});if(p)out.push({k:'pal',s:p})});
    }
  }
  return out;
}
const prelUne=toks=>toks.map(t=>t.k==='tag'?t.s:t.k==='esp'?' ':prelEsc(t.s)).join('');
const prelSeguro=html=>prelUne(prelTokens(html));
function prelTextoHtml(t){return String(t??'').split(/\n+/).filter(l=>l.trim()).map(l=>'<p>'+prelEsc(l)+'</p>').join('')}
// palavras do preliminar (texto puro; blocos separam palavras)
function prelPalavras(html){const o=[];for(const t of prelTokens(html))if(t.k==='pal')o.push(t.s);return o}
// LCS por palavras entre antes (preliminar) e depois (definitivo). Devolve [['=',pal],['-',pal],['+',pal]] ou null se grande demais.
function prelDiffPalavras(a,b){
  let i0=0;while(i0<a.length&&i0<b.length&&a[i0]===b[i0])i0++;
  let fa=a.length,fb=b.length;while(fa>i0&&fb>i0&&a[fa-1]===b[fb-1]){fa--;fb--}
  const A=a.slice(i0,fa),B=b.slice(i0,fb),n=A.length,m=B.length;
  if((n+1)*(m+1)>9e6)return null;
  const l=Array.from({length:n+1},()=>new Uint16Array(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)l[i][j]=A[i]===B[j]?l[i+1][j+1]+1:Math.max(l[i+1][j],l[i][j+1]);
  const out=a.slice(0,i0).map(p=>['=',p]);let i=0,j=0;
  while(i<n&&j<m){if(A[i]===B[j]){out.push(['=',A[i]]);i++;j++}else if(l[i+1][j]>=l[i][j+1])out.push(['-',A[i++]]);else out.push(['+',B[j++]])}
  while(i<n)out.push(['-',A[i++]]);while(j<m)out.push(['+',B[j++]]);
  for(let k=fa;k<a.length;k++)out.push(['=',a[k]]);
  return out;
}
// "Corrigido": o HTML do definitivo (formatação preservada) com o que o chefe tirou (<del>) e pôs (<ins>) marcados por palavra.
// Palavra tirada aparece logo antes da próxima palavra do definitivo (ou no fim). null = laudo grande demais para comparar.
function prelCorrigidoHtml(preHtml,defHtml){
  const dt=prelTokens(defHtml),dif=prelDiffPalavras(prelPalavras(preHtml),dt.filter(t=>t.k==='pal').map(t=>t.s));
  if(!dif)return null;
  const antes=[],marca=[];let fila=[];
  for(const [t,w] of dif){if(t==='-')fila.push(w);else{antes.push(fila);fila=[];marca.push(t)}}
  const out=[],del=l=>l.length?'<del>'+l.map(prelEsc).join(' ')+'</del> ':'';let d=0,fim=0;
  for(const t of dt){
    if(t.k==='tag')out.push(t.s);
    else if(t.k==='esp')out.push(' ');
    else{out.push(del(antes[d]),marca[d]==='+'?'<ins>'+prelEsc(t.s)+'</ins>':prelEsc(t.s));d++;fim=out.length}
  }
  if(fila.length)out.splice(fim,0,' '+del(fila).trim());   // o que sobrou no fim fica junto da última palavra, dentro do último bloco
  return out.join('').replace(/<\/ins> <ins>/g,' ').replace(/<\/del> <del>/g,' ');
}
// ---- leitura no GitHub (repo privado de dados; chave própria, senão a do app) ----
const prelChave=()=>{try{return localStorage.getItem(PRL_LS)||localStorage.getItem('bcbr_gh_token')||''}catch(e){return ''}};
async function prelGet(caminho,etag){
  const r=await fetch('https://api.github.com/repos/'+PRL_REPO+'/contents/'+caminho,{cache:'no-store',headers:{Authorization:'Bearer '+prelChave(),Accept:'application/vnd.github.raw','X-GitHub-Api-Version':'2022-11-28',...(etag?{'If-None-Match':etag}:{})}});
  if(r.status===304)return {naoMudou:true};
  if(!r.ok)throw Object.assign(new Error('GitHub '+r.status),{status:r.status});
  return {json:JSON.parse(await r.text()),etag:r.headers.get('etag')||''};
}
function prelMsgErro(e){
  if(!navigator.onLine)return 'Sem conexão. Tente de novo quando voltar.';
  if(e&&(e.status===401||e.status===403||e.status===404))return 'Esta chave não enxerga o repositório de dados dos laudos (laudos-tutu-dados).';
  return 'Não consegui ler agora ('+(e&&e.message||'erro')+').';
}
async function prelCarrega(forca){
  if(PRL.carregando||(PRL.itens&&!forca))return;
  if(!prelChave()){PRL.semChave=true;PRL.erro='';return prelRepinta()}
  PRL.carregando=true;PRL.erro='';PRL.semChave=false;prelRepinta();
  try{
    const [ix,ld]=await Promise.all([prelGet('preliminares/indice.json',forca?PRL.etag:''),prelGet('preliminares/lidos.json').catch(e=>e.status===404?{json:{lidos:{}}}:Promise.reject(e))]);
    if(!ix.naoMudou){PRL.itens=Array.isArray(ix.json?.itens)?ix.json.itens:[];PRL.etag=ix.etag}
    PRL.lidos=(ld.json&&ld.json.lidos)||{};
  }catch(e){PRL.erro=prelMsgErro(e);PRL.semChave=!!(e&&(e.status===401||e.status===403||e.status===404))&&!PRL.itens}
  PRL.carregando=false;prelRepinta();
}
async function prelPar(acesso){
  const c=PRL.pares[acesso];if(c&&(c.par||c.carregando))return;
  PRL.pares[acesso]={carregando:true};prelCorpoPinta(acesso);
  try{const r=await prelGet('preliminares/pares/'+encodeURIComponent(acesso)+'.json');PRL.pares[acesso]={par:r.json}}
  catch(e){PRL.pares[acesso]={erro:prelMsgErro(e)}}
  prelCorpoPinta(acesso);
}
// ---- tela ----
// acessos que ficaram abertos (estado) sem o par na memória: baixa só esses
const prelPares=()=>{for(const k in PRL.estado)if(k.startsWith('a|')&&PRL.estado[k]&&!PRL.pares[k.slice(2)])prelPar(k.slice(2))};
const prelAberto=(k,padrao)=>PRL.estado[k]!==undefined?PRL.estado[k]:padrao;
const prelFiltroAtivo=()=>!!(PRL.filtro.texto.trim()||PRL.filtro.de||PRL.filtro.ate||PRL.filtro.so);
function prelTg(el){
  const k=el.dataset.k;
  if(el.dataset.def&&el.open&&PRL.estado[k]===undefined)return;   // abriu sozinho por causa do filtro: não vira escolha do usuário
  if(PRL.estado[k]===el.open)return;PRL.estado[k]=el.open;
  if(!el.open)return;
  if(el.dataset.ac)prelPar(el.dataset.ac);
  else{const d=el.querySelector(':scope>.prl-in');if(d&&!d.firstChild){d.innerHTML=prelFilhosHtml(k);prelPares()}}   // níveis 1 e 2 geram os filhos só quando abertos
}
const prelSub=(rotulo,html,k,padrao=false)=>`<details class="prl-sub" data-k="${prelEsc(k)}" ${prelAberto(k,padrao)?'open':''} ontoggle="PRL.estado[this.dataset.k]=this.open"><summary>${rotulo}</summary><div class="prl-laudo">${html}</div></details>`;
function prelCorpoHtml(ac){
  const c=PRL.pares[ac];
  if(!c||c.carregando)return `<p class="mut" role="status">Carregando o laudo…</p>`;
  if(c.erro)return `<p class="prl-erro" role="alert">${prelEsc(c.erro)} <button class="b s" onclick="PRL.pares['${prelEsc(ac)}']=null;prelPar('${prelEsc(ac)}')">Tentar de novo</button></p>`;
  const p=c.par,preH=p.preliminar?.html||prelTextoHtml(p.preliminar?.texto),defH=p.definitivo?.html||prelTextoHtml(p.definitivo?.texto);
  const def=prelSeguro(defH),cor=p.mudou===false?null:prelCorrigidoHtml(preH,defH);
  const leg=`<p class="mut prl-leg"><del>Vermelho riscado</del> = o que o chefe tirou; <ins>verde sublinhado</ins> = o que ele pôs.</p>`;
  const corr=p.mudou===false?`<p class="mut">O chefe não mudou o texto.</p>`+def:cor==null?`<p class="mut">Laudo grande demais para comparar neste aparelho.</p>`:leg+cor;
  const k='c|'+ac+'|';
  if(p.status==='aguardando')return prelSub('Laudo preliminar',prelSeguro(preH),k+'p')+'<p class="mut">Aguardando o definitivo do chefe — o robô completa na próxima coleta.</p>';
  return prelSub('Laudo preliminar',prelSeguro(preH),k+'p')+prelSub('Laudo definitivo',def,k+'d')+prelSub('Corrigido'+(p.mudou===false?' (sem mudanças)':''),corr,k+'c',true);   // 1.50.3: o corrigido já abre (é o que o Artur quer ver)
}
function prelCorpoPinta(ac){const e=document.getElementById('prl_c_'+ac);if(e)e.innerHTML=prelCorpoHtml(ac)}
function prelItem(i){
  const ac=String(i.acesso),k='a|'+ac,ab=prelAberto(k,false),lido=!!PRL.lidos[ac];
  return `<details class="prl-n3" data-k="${prelEsc(k)}" data-ac="${prelEsc(ac)}" ${ab?'open':''} ontoggle="prelTg(this)"><summary><span class="prl-ac">${prelEsc(ac)}</span><span class="prl-meta">${prelEsc(prelData(i.data))}${i.chefe?' · '+prelEsc(i.chefe):''}</span>${i.status==='aguardando'?'<span class="prl-sem">aguardando definitivo</span>':i.mudou?'':'<span class="prl-sem">sem correção</span>'}${lido?'<span class="prl-ok" title="Correção já lida"><span aria-hidden="true">✓</span><span class="sr">lido</span></span>':''}</summary><div class="prl-corpo" id="prl_c_${prelEsc(ac)}">${ab?prelCorpoHtml(ac):''}</div></details>`;
}
const prelVis=()=>prelFiltra(PRL.itens,{...PRL.filtro,lidos:PRL.lidos});
function prelN2(c,at,tot){
  return c.exames.map(x=>{
    const k2='c2|'+c.categoria+'|'+x.exame,def=at&&tot<=60&&PRL.estado[k2]===undefined,ab2=prelAberto(k2,def);
    return `<details class="prl-n2" data-k="${prelEsc(k2)}" ${def?'data-def="1"':''} ${ab2?'open':''} ontoggle="prelTg(this)"><summary><span>${prelEsc(x.exame)}</span><span class="prl-n">${x.total}</span></summary><div class="prl-in">${ab2?x.itens.map(prelItem).join(''):''}</div></details>`}).join('');
}
// filhos de um toggle de nível 1 ('c1|cat') ou 2 ('c2|cat|exame') aberto depois da pintura inicial
function prelFilhosHtml(k){
  const its=prelVis(),g=prelAgrupa(its),[n,cat,...r]=k.split('|'),c=g.find(x=>x.categoria===cat);if(!c)return '';
  if(n==='c1')return prelN2(c,prelFiltroAtivo(),its.length);
  const x=c.exames.find(e=>e.exame===r.join('|'));return x?x.itens.map(prelItem).join(''):'';
}
function prelListaHtml(){
  if(!PRL.itens)return '';
  const its=prelVis(),g=prelAgrupa(its),at=prelFiltroAtivo();
  if(!its.length)return `<p class="mut" role="status">${PRL.itens.length?'Nada encontrado com esse filtro.':'Ainda não há laudos preliminares gravados.'}</p>`;
  return g.map(c=>{
    const k1='c1|'+c.categoria,def=at&&PRL.estado[k1]===undefined,ab1=prelAberto(k1,def);
    return `<details class="prl-n1" data-k="${prelEsc(k1)}" ${def?'data-def="1"':''} ${ab1?'open':''} ontoggle="prelTg(this)"><summary><span>${prelEsc(c.categoria)}</span><span class="prl-n">${c.total}</span></summary><div class="prl-in">${ab1?prelN2(c,at,its.length):''}</div></details>`;
  }).join('');
}
function prelFormChave(){
  return `<div class="card prl-chave"><p>${prelEsc(PRL.erro||'Para ler os laudos preciso de uma chave do GitHub com acesso ao repositório privado de dados dos laudos.')}</p>
   <label>Chave do repositório <b>laudos-tutu-dados</b> (fine-grained, só esse repositório, Contents: Read-only)<input id="prl_k" type="password" autocomplete="off"></label>
   <div class="row"><button class="b" onclick="prelSalvaChave()">Salvar e abrir</button></div></div>`;
}
function prelSalvaChave(){
  const v=(document.getElementById('prl_k')?.value||'').trim();if(!v)return;
  try{localStorage.setItem(PRL_LS,v)}catch(e){}
  PRL.itens=null;PRL.semChave=false;prelCarrega(true);
}
// ---- aba Config > Geral: "Chave dos laudos" (1.50.1) — a mesma chave da tela de configuração inicial, sem precisar apagar nada ----
function prelCfgHtml(){
  const tem=!!(()=>{try{return localStorage.getItem(PRL_LS)}catch(e){return ''}})();
  return `<div class="card prl-chave prl-cfg"><h2>Chave dos laudos</h2>
   <p class="mut">A mesma chave do Laudos (GitHub fine-grained, só o repositório <b>laudos-tutu-dados</b>, Contents: Read-only). Serve só para a página Preliminares e fica neste aparelho.</p>
   <p class="mut" id="prl_cs">${tem?'Há uma chave salva neste aparelho.':'Nenhuma chave salva.'}</p>
   <label>Chave <input id="prl_ck" type="password" autocomplete="off" placeholder="${tem?'cole outra para trocar':'cole a chave aqui'}"></label>
   <div class="row"><button class="b" onclick="prelCfgSalva()">Salvar</button><button class="b s" onclick="prelCfgTesta()">Testar</button>${tem?'<button class="b s" onclick="prelCfgRemove()">Remover</button>':''}</div>
   <p class="mut" id="prl_cm" role="status" aria-live="polite"></p></div>`;
}
const prelCfgMsg=t=>{const m=document.getElementById('prl_cm');if(m)m.textContent=t};
function prelCfgSalva(){
  const v=(document.getElementById('prl_ck')?.value||'').trim();if(!v){prelCfgMsg('Cole a chave primeiro.');return}
  try{localStorage.setItem(PRL_LS,v)}catch(e){prelCfgMsg('Não consegui guardar neste aparelho.');return}
  PRL.itens=null;PRL.pares={};PRL.semChave=false;PRL.erro='';
  render();prelCfgMsg('Chave salva. Toque em Testar para conferir.');
}
function prelCfgRemove(){try{localStorage.removeItem(PRL_LS)}catch(e){}PRL.itens=null;PRL.pares={};PRL.semChave=false;PRL.erro='';render();prelCfgMsg('Chave removida deste aparelho.')}
async function prelCfgTesta(){
  const digitada=(document.getElementById('prl_ck')?.value||'').trim();
  if(!digitada&&!prelChave()){prelCfgMsg('Sem chave para testar.');return}
  prelCfgMsg('Testando…');
  try{
    const r=await fetch('https://api.github.com/repos/'+PRL_REPO+'/contents/preliminares/indice.json',{cache:'no-store',headers:{Authorization:'Bearer '+(digitada||prelChave()),Accept:'application/vnd.github.raw','X-GitHub-Api-Version':'2022-11-28'}});
    prelCfgMsg(r.ok?'Chave funcionando: enxerga os laudos.':r.status===404?'A chave entra, mas não enxerga preliminares/ (confira se é do repositório laudos-tutu-dados com Contents: Read-only).':r.status===401||r.status===403?'O GitHub recusou esta chave ('+r.status+').':'Não deu para testar agora (GitHub '+r.status+').');
  }catch(e){prelCfgMsg(navigator.onLine?'Não consegui falar com o GitHub agora.':'Sem conexão. Teste de novo quando voltar.')}
}
function prelRepinta(){if(typeof tela!=='undefined'&&tela==='preliminares'&&typeof render==='function')render()}
const prelContagem=()=>{if(!PRL.itens)return '';const t=prelFiltra(PRL.itens,{...PRL.filtro,lidos:PRL.lidos}).length;return t+(t===1?' laudo':' laudos')+(prelFiltroAtivo()?' de '+PRL.itens.length:'')};
function prelFiltroMuda(){
  const g=id=>document.getElementById(id)?.value||'';
  PRL.filtro={texto:g('prl_q'),de:g('prl_de'),ate:g('prl_ate'),so:g('prl_so')};
  const l=document.getElementById('prl_lista');if(l){l.innerHTML=prelListaHtml();prelPares()}
  const n=document.getElementById('prl_cont');if(n)n.textContent=prelContagem();
}
function prelLimpa(){PRL.filtro={texto:'',de:'',ate:'',so:''};prelRepinta()}
function vPreliminares(){
  setTimeout(prelPares,0);
  if(!PRL.itens&&!PRL.carregando&&!PRL.semChave&&!PRL.erro)setTimeout(()=>prelCarrega(),0);
  const f=PRL.filtro,topo=`<div class="prl-topo"><h1>Preliminares</h1><button class="b s" onclick="prelCarrega(true)" ${PRL.carregando?'disabled':''}>${PRL.carregando?'Atualizando…':'Atualizar'}</button></div>`;
  if(PRL.semChave&&!PRL.itens)return `<div class="prl">${topo}${prelFormChave()}</div>`;
  if(!PRL.itens)return `<div class="prl">${topo}${PRL.erro?`<p class="prl-erro" role="alert">${prelEsc(PRL.erro)}</p>`:`<p class="mut" role="status">Carregando o índice…</p>`}</div>`;
  return `<div class="prl">${topo}${PRL.erro?`<p class="prl-erro" role="alert">${prelEsc(PRL.erro)}</p>`:''}
   <div class="prl-filtros" role="search">
    <label class="prl-busca">Buscar<input id="prl_q" type="search" value="${prelEsc(f.texto)}" placeholder="acesso, exame, chefe…" oninput="prelFiltroMuda()"></label>
    <label>De<input id="prl_de" type="date" value="${prelEsc(f.de)}" onchange="prelFiltroMuda()"></label>
    <label>Até<input id="prl_ate" type="date" value="${prelEsc(f.ate)}" onchange="prelFiltroMuda()"></label>
    <label>Mostrar<select id="prl_so" onchange="prelFiltroMuda()"><option value="">Todos</option><option value="mudou" ${f.so==='mudou'?'selected':''}>Só com correção</option><option value="naolidos" ${f.so==='naolidos'?'selected':''}>Só não lidos</option></select></label>
    <button class="b s" onclick="prelLimpa()">Limpar</button>
   </div>
   <p class="mut prl-cont" id="prl_cont" aria-live="polite">${prelContagem()}</p>
   <div id="prl_lista">${prelListaHtml()}</div></div>`;
}
