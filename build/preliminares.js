// Página "Preliminares" (1.50.0): laudos preliminares x definitivos lidos em tempo de execução do repo PRIVADO arturaragao/laudos-tutu-dados
// (contrato: Ditado-Laudos-ui/docs/robo-pacs-novo/FORMATO-PARES.md). Nada desses dados fica no repo do app nem no cache do SW.
// Índice primeiro (preliminares/indice.json + lidos.json); cada par (preliminares/pares/<acesso>.json) só ao abrir o toggle do acesso.
const PRL_REPO='arturaragao/laudos-tutu-dados',PRL_LS='bcbr_gh_token_dados',PRL_ORDEM=['Tomografia','Ultrassom','Ressonância','Radiografia','Mamografia','Outros'];
const PRL={itens:null,lidos:{},espaco:null,pares:{},estado:{},erro:'',carregando:false,etag:'',filtro:{texto:'',de:'',ate:'',so:''},semChave:false,
  modo:(()=>{try{return localStorage.getItem('bcbr_prl_modo')==='exame'?'exame':'dia'}catch(e){return 'dia'}})(),   // 1.54.0: só a preferência da lista vai ao localStorage, nunca texto de laudo
  idx:{},nIdx:0,idxv:0,lote:{rodando:false,abort:false},bc:{q:'',v:-1,it:null,r:[]},dest:null};
const prelEsc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const prelNorm=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const prelData=d=>/^\d{4}-\d{2}-\d{2}/.test(d||'')?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):(d||'');
// ---- lógica pura (testada em teste/preliminares.test.js) ----
// Acessos do mesmo laudo (indice.json: acessos + descricoes) formam um item só; sem o campo é só o acesso (leitor antigo/índice antigo).
const prelAcessos=i=>{const l=Array.isArray(i.acessos)?i.acessos.map(String):[];return l.length>1&&l.includes(String(i.acesso))?l:[String(i.acesso)]};
const prelLido=(i,lidos)=>prelAcessos(i).some(a=>lidos&&lidos[a]);
// 1.53.0: "conferi a correção" = marcação do Artur, gravada no plano do app (SM.d.prelConf = {acesso: 'AAAA-MM-DDTHH:MM:SS'}): só número do acesso + hora, nenhum texto de laudo.
// Marcado por qualquer acesso do grupo = marcado. Laudo aguardando o definitivo não conta como pendente.
const prelConf=()=>(typeof SM!=='undefined'&&SM.d&&SM.d.prelConf)||{};
const prelConferido=(i,conf)=>prelAcessos(i).some(a=>conf&&conf[a]);
const prelPendente=(i,conf)=>i.status!=='aguardando'&&!prelConferido(i,conf);
const prelFalta=(its,conf)=>its.filter(i=>prelPendente(i,conf)).length;
const prelFaltaTxt=n=>n===1?'1 falta conferir':n+' faltam conferir';
const prelIso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const prelHoje=()=>prelIso(new Date());
const prelAgora=()=>{const d=new Date();return prelIso(d)+'T'+[d.getHours(),d.getMinutes(),d.getSeconds()].map(x=>String(x).padStart(2,'0')).join(':')};
const prelMaisDias=(iso,n)=>{const [y,m,d]=iso.split('-').map(Number);return prelIso(new Date(y,m-1,d+n,12))};
const prelPeriodo=(n,hoje=prelHoje())=>({de:prelMaisDias(hoje,1-n),ate:hoje});   // últimos n dias, contando hoje
const PRL_DOW=['dom.','seg.','ter.','qua.','qui.','sex.','sáb.'];
function prelRotuloDia(dia,hoje=prelHoje()){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dia||''))return 'Sem data';
  if(dia===hoje)return 'Hoje';if(dia===prelMaisDias(hoje,-1))return 'Ontem';
  const [y,m,d]=dia.split('-').map(Number);return PRL_DOW[new Date(y,m-1,d,12).getDay()]+' '+prelData(dia);
}
const prelDiaDe=i=>String(i.data||'').slice(0,10);
function prelFiltra(itens,f={}){
  const t=prelNorm(f.texto).trim().split(/\s+/).filter(Boolean),lidos=f.lidos||{};
  return (itens||[]).filter(i=>{
    if(f.de&&(i.data||'')<f.de)return false;
    if(f.ate&&(i.data||'')>f.ate)return false;
    if(f.so==='mudou'&&!i.mudou)return false;
    if(f.so==='naolidos'&&prelLido(i,lidos))return false;
    if(f.so==='naoconf'&&!prelPendente(i,f.conf))return false;
    if(!t.length)return true;
    const h=prelNorm([...prelAcessos(i),...(Array.isArray(i.descricoes)?i.descricoes:[]),i.exame,i.categoria,i.chefe,i.modalidade,prelData(i.data)].join(' '));
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
// Dia (mais recente primeiro; sem data por último) > itens. Dentro de cada dia vale prelAgrupa (categoria > exame).
function prelAgrupaDias(itens){
  const m=new Map();for(const i of itens){const d=prelDiaDe(i);if(!m.has(d))m.set(d,[]);m.get(d).push(i)}
  return [...m].sort((a,b)=>!a[0]?1:!b[0]?-1:b[0].localeCompare(a[0])).map(([dia,its])=>({dia,total:its.length,itens:its}));
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
// 1.53.0: o rodapé do PACS ("Este laudo foi assinado eletronicamente.<data> / Informamos que o exame…") não é parte do laudo: some do definitivo (até o fim) antes do diff e da exibição.
function prelSemRodape(html){
  const t=prelTokens(html),p=[];t.forEach((x,k)=>{if(x.k==='pal')p.push(k)});
  const alvo=['este','laudo','foi','assinado','eletronicamente'];
  for(let a=0;a+4<p.length;a++){
    if(!alvo.every((w,j)=>{const s=t[p[a+j]].s.toLowerCase();return j===4?s.startsWith(w):s===w}))continue;
    let c=p[a];while(c>0&&(t[c-1].k==='esp'||(t[c-1].k==='tag'&&!t[c-1].fecha)))c--;   // tags de abertura soltas antes do rodapé saem junto
    return prelUne(t.slice(0,c));
  }
  return html;
}
// HTML -> texto puro com quebra de linha por bloco (copiar o preliminar; texto do Corrigido copiado)
const PRL_QUEBRA=new Set('p div li h1 h2 h3 h4 h5 h6 blockquote tr'.split(' '));
function prelTextoPuro(html){
  let o='';
  for(const t of prelTokens(html)){if(t.k==='pal')o+=t.s;else if(t.k==='esp')o+=' ';else if(t.n==='br'||(t.fecha&&PRL_QUEBRA.has(t.n)))o+='\n';else if(t.fecha&&(t.n==='td'||t.n==='th'))o+=' '}
  return o.replace(/[ \t]*\n[ \t]*/g,'\n').replace(/\n{3,}/g,'\n\n').replace(/ {2,}/g,' ').trim();
}
// Corrigido copiado = texto final como no definitivo: sem o que foi apagado (<del>) e sem marcas (<ins>)
function prelCopiaLimpa(html){const h=String(html??'').replace(/<del>[\s\S]*?<\/del> ?/g,'').replace(/<\/?ins>/g,'').replace(/ {2,}/g,' ');return {html:h,texto:prelTextoPuro(h)}}
function prelCopiaCorrigido(e){
  const s=getSelection();if(!s||!s.rangeCount||s.isCollapsed)return;
  const r=s.getRangeAt(0),n=r.commonAncestorContainer,el=n.nodeType===1?n:n.parentElement;
  if(!el||!el.closest('.prl-cor'))return;
  const d=document.createElement('div');d.appendChild(r.cloneContents());
  const c=prelCopiaLimpa(d.innerHTML);
  e.clipboardData.setData('text/html',c.html);e.clipboardData.setData('text/plain',c.texto);e.preventDefault();
}
// 1.54.0: índice de busca dos laudos SÓ EM MEMÓRIA (PRL.idx; nada em localStorage, IndexedDB, cache do SW nem repo): texto puro, sem rodapé do PACS, e a versão sem acento/caixa.
// Texto do preliminar e do definitivo/corrigido. Ctrl+P (build/busca.js) baixa os pares em segundo plano (prelLaudosInicia) e pesquisa aqui.
function prelIndexa(ac,p){
  const f=h=>{const t=prelTextoPuro(h).replace(/\s+/g,' ').normalize('NFC');return {t,n:prelNorm(t)}};
  const x={pre:f(p.preliminar?.html||prelTextoHtml(p.preliminar?.texto)),def:f(prelSemRodape(p.definitivo?.html||prelTextoHtml(p.definitivo?.texto)))};   // (se lançar, nada foi gravado)
  if(!PRL.idx[ac])PRL.nIdx++;
  PRL.idx[ac]=x;
  PRL.idxv++;
}
// Laudos que têm TODAS as palavras no preliminar ou no definitivo, mais recentes primeiro. Digitar mais letras só refina a lista anterior (filtro incremental).
// -> {total, lista:[{ac,i,onde:'preliminar'|'definitivo'|'ambos',x:{t,n}}]} com até `max` itens
function prelBuscaLaudos(q,max=20){
  const tk=prelNorm(q).trim().split(/\s+/).filter(Boolean),b=PRL.bc;
  if(!tk.length||!PRL.itens)return {total:0,lista:[],tk};
  const chave=tk.join(' '),base=b.v===PRL.idxv&&b.it===PRL.itens&&b.q&&chave.startsWith(b.q)?b.r:PRL.itens.filter(i=>PRL.idx[String(i.acesso)]);
  const tem=(x,t)=>t.every(w=>x.n.includes(w));
  const r=base.filter(i=>{const x=PRL.idx[String(i.acesso)];return tem(x.def,tk)||tem(x.pre,tk)}).sort((a,b)=>(b.data||'').localeCompare(a.data||'')||String(b.acesso).localeCompare(String(a.acesso)));
  PRL.bc={q:chave,v:PRL.idxv,it:PRL.itens,r};
  return {total:r.length,tk,lista:r.slice(0,max).map(i=>{
    const ac=String(i.acesso),x=PRL.idx[ac],d=tem(x.def,tk),p=tem(x.pre,tk);
    return {ac,i,onde:d&&p?'ambos':d?'definitivo':'preliminar',x:d?x.def:x.pre};
  })};
}
// baixa em segundo plano (4 por vez) os pares ainda não baixados e indexa; os já baixados com status "aguardando" são reconferidos por ETag. Sem chave: nada.
async function prelLaudosInicia(){
  const L=PRL.lote;if(L.rodando||PRL.semChave||!prelChave())return;
  if(!PRL.itens){await prelCarrega();if(!PRL.itens)return}   // (prelCarrega chama prelLaudosInicia ao terminar; o início de lá vale)
  if(L.rodando)return;
  const fila=PRL.itens.filter(i=>{const c=PRL.pares[String(i.acesso)];return !c||(!c.carregando&&!c.fatal&&(!c.par||c.par.status==='aguardando'||i.status==='aguardando'))})
    .sort((a,b)=>(b.data||'').localeCompare(a.data||'')).map(i=>String(i.acesso));
  if(!fila.length)return;
  L.rodando=true;L.abort=false;if(typeof bgViva==='function')bgViva();
  const w=async()=>{while(fila.length&&!L.abort){const e=await prelPar(fila.shift(),true);if(prelErroGeral(e))L.abort=true}};   // sem rede real ou sem permissão: para, sem erro na tela; par corrompido/404 só é pulado
  await Promise.all([w(),w(),w(),w()]);
  L.rodando=false;if(typeof bgViva==='function')bgViva();
}
// falha que vale para o lote inteiro: sem rede (offline ou TypeError do fetch) ou chave recusada. 404 e par corrompido (parse/índice) são só daquele par.
const prelErroGeral=e=>!!e&&!e.parse&&(e.status===401||e.status===403||(!e.status&&e.name!=='SyntaxError'&&(!navigator.onLine||e.name==='TypeError')));
// Ctrl+P -> escolher um laudo: abre Preliminares com o acesso aberto (e o toggle do trecho encontrado), rola até ele e destaca a palavra
function prelIrLaudo(ac,tk,onde){
  const i=(PRL.itens||[]).find(x=>String(x.acesso)===ac);if(!i){toast('Esse laudo não está mais na lista.');return}
  const dia=prelDiaDe(i),d=PRL.modo==='exame'?'*':dia,cat=i.categoria||'Outros',ex=i.exame||'Sem nome';
  PRL.filtro={texto:'',de:'',ate:'',so:''};PRL.dest={ac,tk};
  for(const k of [...(d==='*'?[]:['d|'+dia]),'c1|'+d+'|'+cat,'c2|'+d+'|'+cat+'|'+ex,'a|'+ac])PRL.estado[k]=true;
  if(onde==='preliminar')PRL.estado['c|'+ac+'|p']=true;
  else{   // definitivo/ambos: o Corrigido tem que estar aberto; laudo grande demais para o diff não tem Corrigido, então abre o definitivo
    PRL.estado['c|'+ac+'|c']=true;
    const p=PRL.pares[ac]&&PRL.pares[ac].par;
    if(p&&p.mudou!==false&&prelCorrigidoHtml(p.preliminar?.html||prelTextoHtml(p.preliminar?.texto),prelSemRodape(p.definitivo?.html||prelTextoHtml(p.definitivo?.texto)))==null)PRL.estado['c|'+ac+'|d']=true;
  }
  ntPrelAbre();
  const t0=Date.now(),v=()=>{
    const e=[...document.querySelectorAll('.prl-n3')].find(x=>x.dataset.ac===ac);
    if(e){e.scrollIntoView({block:'center'});e.classList.add('nt-flash');setTimeout(()=>e.classList.remove('nt-flash'),1500);prelDestaca(e,tk)}
    else if(Date.now()-t0<3000)setTimeout(v,60);
  };setTimeout(v,60);
}
// destaca (<mark>) as palavras buscadas nos textos simples já desenhados; palavra partida entre tags não é marcada
function prelDestaca(raiz,tk){
  if(!raiz||!tk||!tk.length)return;
  const w=document.createTreeWalker(raiz,4),nos=[];while(w.nextNode())nos.push(w.currentNode);
  for(const n of nos){
    if(n.parentNode.nodeName==='MARK')continue;
    const s=n.nodeValue,sn=prelNorm(s);if(sn.length!==s.length)continue;
    const sp=[];for(const t of tk){let i=sn.indexOf(t);while(i>=0){sp.push([i,i+t.length]);i=sn.indexOf(t,i+t.length)}}
    if(!sp.length)continue;sp.sort((a,b)=>a[0]-b[0]);
    const f=document.createDocumentFragment();let p=0;
    for(const [a,b] of sp){if(b<=p)continue;const a2=Math.max(a,p);f.append(s.slice(p,a2));const m=document.createElement('mark');m.textContent=s.slice(a2,b);f.append(m);p=b}
    f.append(s.slice(p));n.replaceWith(f);
  }
}
const prelLimpaMemoria=()=>{PRL.lote.abort=true;PRL.lote={rodando:false,abort:false};PRL.gen=(PRL.gen||0)+1;PRL.pares={};PRL.idx={};PRL.nIdx=0;PRL.idxv++;PRL.dest=null};   // lote antigo para e não grava mais (prelPar confere PRL.gen); um novo pode começar já
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
  if(PRL.itens&&!PRL.erro)prelLaudosInicia();
}
// `forca`: reconfere (por ETag) um par já baixado; devolve o erro (ou nada) para o lote decidir se para
async function prelPar(acesso,forca){
  const c=PRL.pares[acesso];if(c&&c.par&&!forca){prelCorpoPinta(acesso);return}   // (baixado em segundo plano: só desenha)
  if(c&&c.carregando)return;
  const ant=c&&c.par?c:null,g=PRL.gen;let erro,mudou=false;
  if(!ant){PRL.pares[acesso]={carregando:true};prelCorpoPinta(acesso)}
  try{
    const r=await prelGet('preliminares/pares/'+encodeURIComponent(acesso)+'.json',ant&&ant.etag);
    if(g!==PRL.gen)return;   // a memória foi limpa (chave trocada/removida) enquanto baixava: descarta
    if(!r.naoMudou){try{prelIndexa(acesso,r.json)}catch(e){throw Object.assign(e,{parse:true})}PRL.pares[acesso]={par:r.json,etag:r.etag};mudou=true}
  }catch(e){
    if(g!==PRL.gen)return;
    erro=e;if(!ant)PRL.pares[acesso]={erro:prelMsgErro(e),fatal:e.parse||e.name==='SyntaxError'||e.status===404};   // fatal: não volta para a fila do lote nesta sessão
    mudou=!ant;
  }
  if(mudou)prelCorpoPinta(acesso);
  if(typeof bgViva==='function')bgViva();
  return erro;
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
const prelSub=(rotulo,html,k,padrao=false,cls='')=>`<details class="prl-sub" data-k="${prelEsc(k)}" ${prelAberto(k,padrao)?'open':''} ontoggle="PRL.estado[this.dataset.k]=this.open"><summary>${rotulo}</summary><div class="prl-laudo${cls}">${html}</div></details>`;
function prelCorpoHtml(ac){
  const c=PRL.pares[ac];
  if(!c||c.carregando)return `<p class="mut" role="status">Carregando o laudo…</p>`;
  if(c.erro)return `<p class="prl-erro" role="alert">${prelEsc(c.erro)} <button class="b s" onclick="PRL.pares['${prelEsc(ac)}']=null;prelPar('${prelEsc(ac)}')">Tentar de novo</button></p>`;
  const p=c.par,preH=p.preliminar?.html||prelTextoHtml(p.preliminar?.texto),defH=prelSemRodape(p.definitivo?.html||prelTextoHtml(p.definitivo?.texto));
  const def=prelSeguro(defH),cor=p.mudou===false?null:prelCorrigidoHtml(preH,defH);
  const leg='';   // 1.50.5: o Artur pediu para tirar a legenda (cores já são conhecidas)
  const corr=p.mudou===false?`<p class="mut">O chefe não mudou o texto.</p>`+def:cor==null?`<p class="mut">Laudo grande demais para comparar neste aparelho.</p>`:leg+cor;
  const k='c|'+ac+'|';
  if(p.status==='aguardando')return prelSub('Laudo preliminar',prelSeguro(preH),k+'p')+'<p class="mut">Aguardando o definitivo do chefe — o robô completa na próxima coleta.</p>';
  return prelSub('Laudo preliminar',prelSeguro(preH),k+'p')+prelSub('Laudo definitivo',def,k+'d')+prelSub('Corrigido'+(p.mudou===false?' (sem mudanças)':''),corr,k+'c',true,' prl-cor');   // 1.50.3: o corrigido já abre (é o que o Artur quer ver)
}
function prelCorpoPinta(ac){const e=document.getElementById('prl_c_'+ac);if(e){e.innerHTML=prelCorpoHtml(ac);if(PRL.dest&&PRL.dest.ac===ac)prelDestaca(e,PRL.dest.tk)}}
function prelItem(i){
  const ac=String(i.acesso),acs=prelAcessos(i),k='a|'+ac,ab=prelAberto(k,false),lido=prelLido(i,PRL.lidos),conf=prelConferido(i,prelConf()),rot=acs.join(' + ');
  // acesso: clique copia o preliminar (sem abrir/fechar); checkbox à direita: "conferi a correção" (label/input não ativam o summary)
  const cx=i.status==='aguardando'?'':`<label class="prl-conf" title="Conferi a correção"><input type="checkbox" ${conf?'checked':''} data-ac="${prelEsc(ac)}" data-acs="${prelEsc(acs.join(','))}" onchange="prelConfClique(this)"><span class="sr">conferi a correção</span></label>`;
  return `<details class="prl-n3" data-k="${prelEsc(k)}" data-ac="${prelEsc(ac)}" ${ab?'open':''} ontoggle="prelTg(this)"><summary><span class="prl-ac" role="button" title="Copiar o laudo preliminar" onclick="prelCopiaPre(event,'${prelEsc(ac)}')">${prelEsc(rot)}</span><span class="prl-meta">${prelEsc(prelData(i.data))}${i.chefe?' · '+prelEsc(i.chefe):''}</span>${i.status==='aguardando'?'<span class="prl-sem">aguardando definitivo</span>':i.mudou?'':'<span class="prl-sem">sem mudanças</span>'}${lido?'<span class="prl-ok" title="Correção já lida"><span aria-hidden="true">✓</span><span class="sr">lido</span></span>':''}${cx}</summary><div class="prl-corpo" id="prl_c_${prelEsc(ac)}">${ab?prelCorpoHtml(ac):''}</div></details>`;
}
// marca/desmarca "conferi" no plano do app (sincroniza PC <-> celular pelo mesmo caminho das tarefas: smMudar)
function prelConfClique(el){
  const ac=el.dataset.ac,acs=el.dataset.acs.split(','),on=el.checked,hora=prelAgora();
  if(typeof SM==='undefined'||!SM.d||typeof smMudar!=='function'){el.checked=!on;if(typeof toast==='function')toast('O plano ainda está carregando; tente de novo');return}
  smMudar(d=>{const c=d.prelConf=d.prelConf||{};if(on)c[ac]=hora;else acs.forEach(a=>{delete c[a]})},on?'preliminares: conferido':'preliminares: desmarcado');
  prelRepinta();   // o smRender do plano não redesenha com o foco dentro de .nt
}
// clique no número do acesso: copia o laudo PRELIMINAR (texto puro); baixa o par se ainda não estiver na memória
async function prelCopiaPre(ev,ac){
  ev.preventDefault();ev.stopPropagation();
  if(!(PRL.pares[ac]&&PRL.pares[ac].par))await prelPar(ac);
  for(let n=0;n<50&&PRL.pares[ac]&&PRL.pares[ac].carregando;n++)await new Promise(r=>setTimeout(r,100));
  const c=PRL.pares[ac],p=c&&c.par;
  if(!p){toast('Não consegui ler o laudo agora');return}
  const t=prelTextoPuro(p.preliminar?.html||prelTextoHtml(p.preliminar?.texto));
  try{await navigator.clipboard.writeText(t)}catch(e){
    const a=document.createElement('textarea');a.value=t;a.style.cssText='position:fixed;opacity:0';document.body.appendChild(a);a.select();
    let ok=false;try{ok=document.execCommand('copy')}catch(e2){}a.remove();if(!ok){toast('Não consegui copiar');return}
  }
  toast('Preliminar copiado');
}
// fechar um toggle encolhe o que está abaixo dele e, com a página rolada até o fim, o navegador sobe a rolagem e a célula sob o mouse muda.
// Antes de fechar fixamos a altura da página (espaçador temporário); solta na próxima rolagem/tecla do usuário ou ao redesenhar.
function prelFixaAltura(e){
  const s=e.target.closest&&e.target.closest('.prl summary');if(!s||!s.parentElement.open)return;
  const r=s.closest('.prl');if(!r)return;
  prelSoltaAltura();r.style.minHeight=r.offsetHeight+'px';PRL.espaco=r;
}
function prelSoltaAltura(){if(PRL.espaco){PRL.espaco.style.minHeight='';PRL.espaco=null}}
if(typeof document.addEventListener==='function'){
  document.addEventListener('click',prelFixaAltura,true);document.addEventListener('copy',prelCopiaCorrigido);
  for(const t of ['wheel','touchmove','keydown'])document.addEventListener(t,prelSoltaAltura,{passive:true});
}
const prelVis=()=>prelFiltra(PRL.itens,{...PRL.filtro,lidos:PRL.lidos,conf:prelConf()});
const prelPend=n=>n?`<span class="prl-pend">${prelFaltaTxt(n)}</span>`:'';
const prelFalta2=its=>prelFalta(its,prelConf());
function prelN2(c,dia,at,tot){
  return c.exames.map(x=>{
    const k2='c2|'+dia+'|'+c.categoria+'|'+x.exame,def=at&&tot<=60&&PRL.estado[k2]===undefined,ab2=prelAberto(k2,def);
    return `<details class="prl-n2" data-k="${prelEsc(k2)}" ${def?'data-def="1"':''} ${ab2?'open':''} ontoggle="prelTg(this)"><summary><span>${prelEsc(x.exame)}</span>${prelPend(prelFalta2(x.itens))}<span class="prl-n">${x.total}</span></summary><div class="prl-in">${ab2?x.itens.map(prelItem).join(''):''}</div></details>`}).join('');
}
// categorias de um dia
function prelN1(g,dia,at,tot){
  return g.map(c=>{
    const k1='c1|'+dia+'|'+c.categoria,def=at&&PRL.estado[k1]===undefined,ab1=prelAberto(k1,def);
    return `<details class="prl-n1" data-k="${prelEsc(k1)}" ${def?'data-def="1"':''} ${ab1?'open':''} ontoggle="prelTg(this)"><summary><span>${prelEsc(c.categoria)}</span>${prelPend(prelFalta2(c.exames.flatMap(x=>x.itens)))}<span class="prl-n">${c.total}</span></summary><div class="prl-in">${ab1?prelN2(c,dia,at,tot):''}</div></details>`;
  }).join('');
}
// filhos de um toggle de dia ('d|dia'), categoria ('c1|dia|cat') ou exame ('c2|dia|cat|exame') aberto depois da pintura inicial
function prelFilhosHtml(k){
  const its=prelVis(),[n,dia,cat,...r]=k.split('|'),g=prelAgrupa(its.filter(i=>dia==='*'||prelDiaDe(i)===dia));   // dia '*' = modo "Por exame" (sem nível de dia)
  if(n==='d')return prelN1(g,dia,prelFiltroAtivo(),its.length);
  const c=g.find(x=>x.categoria===cat);if(!c)return '';
  if(n==='c1')return prelN2(c,dia,prelFiltroAtivo(),its.length);
  const x=c.exames.find(e=>e.exame===r.join('|'));return x?x.itens.map(prelItem).join(''):'';
}
function prelListaHtml(){
  if(!PRL.itens)return '';
  const its=prelVis(),at=prelFiltroAtivo();
  if(!its.length)return `<p class="mut" role="status">${PRL.itens.length?'Nada encontrado com esse filtro.':'Ainda não há laudos preliminares gravados.'}</p>`;
  if(PRL.modo==='exame')return prelN1(prelAgrupa(its),'*',at,its.length);   // 1.54.0: Categoria > Exame > Acesso (a data aparece em cada acesso)
  return prelAgrupaDias(its).map(d=>{
    const k0='d|'+d.dia,def=at&&PRL.estado[k0]===undefined,ab0=prelAberto(k0,def);
    return `<details class="prl-n0" data-k="${prelEsc(k0)}" ${def?'data-def="1"':''} ${ab0?'open':''} ontoggle="prelTg(this)"><summary><span>${prelEsc(prelRotuloDia(d.dia))}</span>${prelPend(prelFalta2(d.itens))}<span class="prl-n">${d.total}</span></summary><div class="prl-in">${ab0?prelN1(prelAgrupa(d.itens),d.dia,at,its.length):''}</div></details>`;
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
  PRL.itens=null;prelLimpaMemoria();PRL.semChave=false;PRL.erro='';
  render();prelCfgMsg('Chave salva. Toque em Testar para conferir.');
}
function prelCfgRemove(){try{localStorage.removeItem(PRL_LS)}catch(e){}PRL.itens=null;prelLimpaMemoria();PRL.semChave=false;PRL.erro='';render();prelCfgMsg('Chave removida deste aparelho.')}
async function prelCfgTesta(){
  const digitada=(document.getElementById('prl_ck')?.value||'').trim();
  if(!digitada&&!prelChave()){prelCfgMsg('Sem chave para testar.');return}
  prelCfgMsg('Testando…');
  try{
    const r=await fetch('https://api.github.com/repos/'+PRL_REPO+'/contents/preliminares/indice.json',{cache:'no-store',headers:{Authorization:'Bearer '+(digitada||prelChave()),Accept:'application/vnd.github.raw','X-GitHub-Api-Version':'2022-11-28'}});
    prelCfgMsg(r.ok?'Chave funcionando: enxerga os laudos.':r.status===404?'A chave entra, mas não enxerga preliminares/ (confira se é do repositório laudos-tutu-dados com Contents: Read-only).':r.status===401||r.status===403?'O GitHub recusou esta chave ('+r.status+').':'Não deu para testar agora (GitHub '+r.status+').');
  }catch(e){prelCfgMsg(navigator.onLine?'Não consegui falar com o GitHub agora.':'Sem conexão. Teste de novo quando voltar.')}
}
function prelRepinta(){if(typeof tela!=='undefined'&&tela==='notas'&&NT.prel&&typeof render==='function')render()}
const prelFaltaTopo=()=>{if(!PRL.itens)return '';const v=prelVis();return v.length?(prelFalta2(v)?' · '+prelFaltaTxt(prelFalta2(v)):' · tudo conferido'):''};
const prelContagem=()=>{if(!PRL.itens)return '';const t=prelVis().length;return t+(t===1?' laudo':' laudos')+(prelFiltroAtivo()?' de '+PRL.itens.length:'')};
function prelFiltroMuda(){
  const g=id=>document.getElementById(id)?.value||'';
  PRL.filtro={texto:g('prl_q'),de:g('prl_de'),ate:g('prl_ate'),so:g('prl_so')};PRL.dest=null;
  const l=document.getElementById('prl_lista');if(l){l.innerHTML=prelListaHtml();prelPares()}
  const n=document.getElementById('prl_cont');if(n)n.textContent=prelContagem();
  const q=document.getElementById('prl_pend');if(q)q.textContent=prelFaltaTopo();
}
function prelPeriodoSet(n){PRL.filtro={...PRL.filtro,...prelPeriodo(n)};prelRepinta()}
function prelLimpa(){PRL.filtro={texto:'',de:'',ate:'',so:''};PRL.dest=null;prelRepinta()}
function prelModoSet(m){PRL.modo=m==='exame'?'exame':'dia';try{localStorage.setItem('bcbr_prl_modo',PRL.modo)}catch(e){}prelRepinta()}
function vPreliminares(){
  prelSoltaAltura();
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
    <label>Mostrar<select id="prl_so" onchange="prelFiltroMuda()"><option value="">Todos</option><option value="mudou" ${f.so==='mudou'?'selected':''}>Só com correção</option><option value="naoconf" ${f.so==='naoconf'?'selected':''}>Só não conferidos</option><option value="naolidos" ${f.so==='naolidos'?'selected':''}>Só não lidos</option></select></label>
    <button class="b s" onclick="prelLimpa()">Limpar</button>
   </div>
   <div class="prl-per" role="group" aria-label="Período rápido">${[[1,'Hoje'],[3,'Últimos 3 dias'],[7,'Últimos 7 dias'],[30,'Últimos 30 dias']].map(([n,r])=>{const p=prelPeriodo(n);return `<button class="b s" aria-pressed="${f.de===p.de&&f.ate===p.ate}" onclick="prelPeriodoSet(${n})">${r}</button>`}).join('')}</div>
   <div class="prl-modo" role="group" aria-label="Modo da lista">${[['dia','Por dia'],['exame','Por exame']].map(([m,r])=>`<button class="b s" aria-pressed="${PRL.modo===m}" onclick="prelModoSet('${m}')">${r}</button>`).join('')}</div>
   <p class="mut prl-cont" aria-live="polite"><span id="prl_cont">${prelContagem()}</span><b class="prl-pendtot" id="prl_pend">${prelFaltaTopo()}</b></p>
   <div id="prl_lista">${prelListaHtml()}</div></div>`;
}
