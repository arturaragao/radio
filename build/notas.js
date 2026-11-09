// Aba Notas (1.39.0): UMA página estilo Notion, editada direto (Tiptap/ProseMirror, vendor/tiptap.js, exposto em window.TT).
// Armazenamento: SM.d.notasDoc = {v:1, blocos:[{id, atualizado, conteudo}]} em semana/plano.json (mesmo salvamento da Semana: smMudar).
// Cada bloco de TOPO tem id estável e data de alteração própria; ntBlocos/ntDocumento são as funções puras de ida e volta.
// 1.40: ntFunde junta as mudanças de dois aparelhos bloco a bloco (três vias: base = última versão sincronizada, guardada em
// bcbr_notas_base); o editor recebe só os blocos de topo que mudaram (ntAplicaNoEditor). Cópia do formato antigo em plano.json: notas_v138.
// NT.shown = blocos que o editor mostra/já salvou: é o ponto de comparação para saber o que FOI DIGITADO aqui.
const NT={ed:null,el:null,timer:null,shown:null,sujo:false,sync:null,posImg:null,alvo:null};
const NT_PEND='bcbr_notasdoc_pendente',NT_ABERTOS='bcbr_nt_abertos',NT_COR='bcbr_nt_cor',NT_BASE='bcbr_notas_base',NT_MAX_CONFLITOS=20;

// ===== Funções puras: documento <-> blocos, migração das notas antigas =====
const ntNovoId=()=>'b'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
// Tira atributos nulos para comparar conteúdo sem falsos "alterados" (o editor preenche atributos padrão).
function ntCanon(n){
  if(Array.isArray(n))return n.map(ntCanon);
  if(!n||typeof n!=='object')return n;
  const o={};for(const k of Object.keys(n).sort()){
    const v=n[k];if(v===null||v===undefined)continue;
    if(k==='attrs'){const a=ntCanon(v);if(Object.keys(a).length)o.attrs=a;continue}
    if(k==='marks'&&!v.length)continue;
    o[k]=ntCanon(v);
  }return o;
}
const ntIgual=(a,b)=>JSON.stringify(ntCanon(a))===JSON.stringify(ntCanon(b));
// doc do editor -> blocos. `anteriores` = blocos já salvos: bloco igual ao anterior mantém `atualizado` (e a forma salva).
function ntBlocos(doc,anteriores,agora=new Date().toISOString()){
  const ant=new Map((anteriores||[]).map(b=>[b.id,b])),vistos=new Set();
  return (doc?.content||[]).map(n=>{
    let id=n.attrs?.id;if(!id||vistos.has(id)){id=ntNovoId();n={...n,attrs:{...n.attrs,id}}}
    vistos.add(id);const a=ant.get(id);
    return a&&ntIgual(a.conteudo,n)?a:{id,atualizado:agora,conteudo:n};
  });
}
// blocos -> doc do editor (sempre com pelo menos um parágrafo).
function ntDocumento(blocos){return {type:'doc',content:(blocos||[]).length?blocos.map(b=>b.conteudo):[{type:'paragraph'}]}}

// ===== Fusão por bloco, três vias =====
// base = última versão sincronizada com o GitHub (ou null se desconhecida: nada é apagado), local = o que este aparelho tem, remoto = o do GitHub.
// Bloco só mudou de um lado: fica essa versão. Mudou dos dois (e diferem): vence o `atualizado` maior (empate: o remoto) e o outro vai para `conflitos`.
// Apagado de um lado e intacto do outro: apaga (se foi editado do outro lado, a edição fica). Ordem: a do lado que mudou a ordem (o remoto, se ambos).
function ntFunde(base,local,remoto,agora=new Date().toISOString()){
  const lim=l=>(Array.isArray(l)?l:[]).filter(b=>b&&typeof b==='object'&&typeof b.id==='string');   // plano remoto malformado não quebra a fusão
  base=lim(base);local=lim(local);remoto=lim(remoto);
  const mapa=l=>new Map(l.map(b=>[b.id,b])),B=mapa(base),L=mapa(local),R=mapa(remoto),res=new Map(),conflitos=[];
  const igual=(x,y)=>ntIgual(x.conteudo,y.conteudo);
  for(const id of new Set([...B.keys(),...L.keys(),...R.keys()])){
    const b=B.get(id),l=L.get(id),r=R.get(id);let v=null;
    if(l&&r){
      if(igual(l,r))v=r;
      else{
        const lm=!b||!igual(b,l),rm=!b||!igual(b,r);
        if(lm&&!rm)v=l;else if(rm&&!lm)v=r;
        else{const localVence=String(l.atualizado||'')>String(r.atualizado||''),perde=localVence?r:l;v=localVence?l:r;conflitos.push({id,em:agora,atualizado:perde.atualizado,conteudo:perde.conteudo})}
      }
    }else if(l||r){const x=l||r;if(!b||!igual(b,x))v=x}   // novo, ou apagado do outro lado mas editado aqui
    if(v)res.set(id,v);
  }
  const ids=x=>(x||[]).map(b=>b.id);
  const mudouOrdem=lado=>{const nb=new Set(ids(base)),nl=new Set(ids(lado)),c=x=>ids(x).filter(i=>nb.has(i)&&nl.has(i));return JSON.stringify(c(base))!==JSON.stringify(c(lado))};
  const usaLocal=mudouOrdem(local)&&!mudouOrdem(remoto),ordem=ids(usaLocal?local:remoto).filter(i=>res.has(i));
  let ant=-1;   // blocos que só o outro lado tem entram logo depois do vizinho que eles tinham lá
  for(const i of ids(usaLocal?remoto:local)){
    if(!res.has(i))continue;
    const k=ordem.indexOf(i);if(k>=0){ant=k;continue}
    ordem.splice(++ant,0,i);
  }
  return {blocos:ordem.map(i=>res.get(i)),conflitos};
}
// Lista de conflitos do plano (SM.d.notas_conflitos): sem repetir (id+data), só os 20 mais recentes.
function ntJuntaConflitos(a,b){
  const vistos=new Set(),out=[];
  for(const c of [...(a||[]),...(b||[])]){const k=c.id+'|'+c.em;if(!vistos.has(k)){vistos.add(k);out.push(c)}}
  return out.slice(-NT_MAX_CONFLITOS);
}
function ntBaseLer(){try{const b=JSON.parse(localStorage.getItem(NT_BASE)||'null');return Array.isArray(b)?b:null}catch(e){return null}}
function ntBaseSalva(blocos){if(!Array.isArray(blocos))return;try{localStorage.setItem(NT_BASE,JSON.stringify(blocos))}catch(e){}}

// Texto antigo (1.37/1.38) -> blocos do editor: "- "/"• " listas, "> " toggles (recuo = dentro), "[img:arquivo]" imagem, resto parágrafos.
const ntRecuo=l=>/^[ \t]*/.exec(l)[0].replace(/\t/g,'  ').length;
const ntTxt=s=>s?[{type:'text',text:s}]:undefined;
const ntPar=s=>({type:'paragraph',...(s?{content:ntTxt(s)}:{})});
function ntParse(lin){
  const out=[];let i=0;
  while(i<lin.length){
    const l=lin[i];if(!l.trim()){i++;continue}
    const base=ntRecuo(l);let m;
    const filhos=()=>{let j=i+1;while(j<lin.length&&(!lin[j].trim()||ntRecuo(lin[j])>base))j++;while(j>i+1&&!lin[j-1].trim())j--;const f=lin.slice(i+1,j);i=j;return f};
    if((m=/^\s*>(?: (.*))?$/.exec(l))){
      const f=ntParse(filhos());
      out.push({type:'details',content:[{type:'detailsSummary',...(m[1]?.trim()?{content:ntTxt(m[1].trim())}:{})},{type:'detailsContent',content:f.length?f:[ntPar('')]}]});continue;
    }
    if((m=/^\s*[-•](?:\s+(.*))?$/.exec(l))){
      const item={type:'listItem',content:[ntPar((m[1]||'').trim()),...ntParse(filhos())]},u=out[out.length-1];
      if(u?.type==='bulletList')u.content.push(item);else out.push({type:'bulletList',content:[item]});continue;
    }
    if((m=/^\s*\[img:([\w.-]+)\]\s*$/.exec(l))){out.push({type:'image',attrs:{src:'./img/'+m[1]}});i++;continue}
    out.push(ntPar(l.trim()));const f=filhos();if(f.length)out.push(...ntParse(f));
  }return out;
}
const ntTextoParaBlocos=texto=>ntParse(String(texto||'').split(/\r?\n/));
const ntChave=n=>Number.isFinite(n.ordem)?n.ordem:-(Date.parse(n.em||n.atualizado||'')||0);
const ntOrdenadas=notas=>[...(notas||[])].sort((a,b)=>Number(!!b.fixa)-Number(!!a.fixa)||ntChave(a)-ntChave(b)||String(a.id).localeCompare(String(b.id)));
// Cada nota antiga vira um toggle de topo com o título; ids derivados do id da nota (migração igual em qualquer aparelho).
function ntNotaParaBloco(n){
  const id='b'+n.id,cont=ntTextoParaBlocos(n.texto);
  return {id,atualizado:n.atualizado||n.em||new Date().toISOString(),conteudo:{type:'details',attrs:{id},content:[
    {type:'detailsSummary',...(String(n.titulo||'').trim()?{content:ntTxt(String(n.titulo).trim())}:{})},
    {type:'detailsContent',content:cont.length?cont:[ntPar('')]}]}};
}
// Migra uma vez: guarda cópia em notas_v138 e cria notasDoc. Idempotente (não faz nada se notasDoc já existe).
function ntMigra(d){
  if(!d||d.notasDoc)return false;
  const velhas=d.notas||[];
  if(velhas.length&&!d.notas_v138)d.notas_v138=JSON.parse(JSON.stringify(velhas));
  d.notasDoc={v:1,blocos:[...ntOrdenadas(velhas).map(ntNotaParaBloco),{id:'b-fim',atualizado:'2026-11-09T00:00:00.000Z',conteudo:{type:'paragraph',attrs:{id:'b-fim'}}}]};   // parágrafo final: lugar para digitar depois do último toggle
  d.notas=velhas.filter(n=>n.fraco);   // "tema fraco" da Semana continua lendo d.notas
  return true;
}

// ===== Fila de salvamento: o documento pendente fica no aparelho até o GitHub confirmar =====
function ntPendentes(){
  try{const p=JSON.parse(localStorage.getItem(NT_PEND)||'null');return p&&Array.isArray(p.blocos)?[p]:[]}catch(e){return []}
}
function ntTemPendentes(){return ntPendentes().length>0}
// Põe o documento pendente em `d`. Se `d` veio do GitHub com outro conteúdo, funde por bloco (a fusão vira o novo pendente).
function ntAplica(d,ops){
  if(!ops||!ops.length){ntMigra(d);return}
  const p=ops[ops.length-1],r=d.notasDoc?.blocos;
  if(Array.isArray(r)&&JSON.stringify(r)!==JSON.stringify(p.blocos)){
    const f=ntFunde(ntBaseLer(),p.blocos,r);
    p.blocos=f.blocos;p.conflitos=ntJuntaConflitos(p.conflitos,f.conflitos);
    try{localStorage.setItem(NT_PEND,JSON.stringify(p))}catch(e){}
    if(f.conflitos.length&&typeof toast==='function')toast('Nota editada nos dois aparelhos: guardei a versão mais antiga em notas_conflitos.');
  }
  d.notasDoc={v:1,blocos:p.blocos};
  if(p.conflitos?.length)d.notas_conflitos=ntJuntaConflitos(d.notas_conflitos,p.conflitos);
}
// O que está sendo digitado entra na fila (e no plano local) ANTES de qualquer plano do GitHub ser aplicado.
function ntAntes(){if(NT.ed&&NT.sujo)ntSalvaDoc()}
// `d` = plano recém-baixado do GitHub, já em SM.d: funde o pendente, guarda a base e mostra no editor só o que mudou.
function ntRecebe(d){
  const r=d.notasDoc?.blocos;ntAplica(d,ntPendentes());
  if(Array.isArray(r))ntBaseSalva(r);
  ntSincroniza();
}
const ntConfirmada=(salvo,op)=>JSON.stringify(salvo.notasDoc?.blocos)===JSON.stringify(op.blocos);
function ntSync(){
  if(NT.sync)return NT.sync;
  const ops=ntPendentes();if(!ops.length||!SM.d)return Promise.resolve(!ops.length);
  NT.sync=smMudar(d=>ntAplica(d,ntPendentes()),'notas',salvo=>{
    // Só limpa se o que subiu é o mesmo documento que estava pendente (edição nova durante o envio continua na fila).
    const atual=ntPendentes()[0];if(atual&&atual.em===ops[0].em&&ntConfirmada(salvo,atual))localStorage.removeItem(NT_PEND);
  }).finally(()=>{NT.sync=null;if(ntTemPendentes()&&!SM.erro){clearTimeout(NT.timer);NT.timer=setTimeout(ntSync,700)}});
  return NT.sync;
}
// Chamado ~1 s depois da última digitação.
function ntSalvaDoc(){
  clearTimeout(NT.timer);if(!NT.ed||!SM.d)return;
  const ant=NT.shown||SM.d.notasDoc?.blocos||[],blocos=ntBlocos(NT.ed.getJSON(),ant);NT.sujo=false;   // compara com o que o editor mostrava, não com o plano (que pode ter vindo de outro aparelho)
  if(JSON.stringify(blocos)===JSON.stringify(ant))return;
  try{localStorage.setItem(NT_PEND,JSON.stringify({blocos,em:Date.now(),conflitos:ntPendentes()[0]?.conflitos||[]}))}catch(e){toast('Sem espaço para salvar as notas neste aparelho.');return}
  NT.shown=blocos;SM.d.notasDoc={v:1,blocos};smGuardaCache();ntSync();
}

// ===== Estado aberto/fechado dos toggles: por aparelho (localStorage), fora do documento =====
function ntAbertosLer(){try{return new Set(JSON.parse(localStorage.getItem(NT_ABERTOS)||'[]'))}catch(e){return new Set()}}
function ntAbertosGrava(s){try{localStorage.setItem(NT_ABERTOS,JSON.stringify([...s]))}catch(e){}}
function ntAberto(id){return !!id&&ntAbertosLer().has(id)}
function ntAbertoSalva(id,aberto){if(!id)return;const s=ntAbertosLer();aberto?s.add(id):s.delete(id);ntAbertosGrava(s)}
function ntPoeAberto(dom,aberto){dom.classList.toggle('is-open',aberto);dom.querySelector(':scope>button')?.setAttribute('aria-expanded',String(aberto))}
function ntRotuloTodos(){
  const b=document.getElementById('nt_todos');if(!b||!NT.el)return;
  const ds=[...NT.el.querySelectorAll('[data-type="details"]')];
  b.textContent=ds.length&&ds.every(d=>d.classList.contains('is-open'))?'Fechar todos':'Abrir todos';
}
function ntTodos(){
  if(!NT.el)return;const ds=[...NT.el.querySelectorAll('[data-type="details"]')];
  const abrir=!(ds.length&&ds.every(d=>d.classList.contains('is-open')));
  ds.forEach(d=>ntPoeAberto(d,abrir));
  ntAbertosGrava(abrir?new Set(ds.map(d=>d.dataset.id).filter(Boolean)):new Set());ntRotuloTodos();
}

// ===== Paleta de cores (Notion); o documento guarda var(--ntc-…)/var(--ntb-…), definidas no CSS por tema =====
const NT_CORES=[['cinza','Cinza'],['marrom','Marrom'],['laranja','Laranja'],['amarelo','Amarelo'],['verde','Verde'],['azul','Azul'],['roxo','Roxo'],['rosa','Rosa'],['vermelho','Vermelho']];
function ntUltimaCor(){try{const c=JSON.parse(localStorage.getItem(NT_COR)||'null');if(c&&['texto','fundo'].includes(c.tipo)&&NT_CORES.some(x=>x[0]===c.cor))return c}catch(e){}return {tipo:'fundo',cor:'amarelo'}}
function ntAplicaCor(ed,tipo,cor){
  const css=`var(--nt${tipo==='texto'?'c':'b'}-${cor})`,atual=ed.getAttributes('textStyle')[tipo==='texto'?'color':'backgroundColor'];
  try{localStorage.setItem(NT_COR,JSON.stringify({tipo,cor}))}catch(e){}
  const ch=ed.chain().focus();
  if(atual===css)return (tipo==='texto'?ch.unsetColor():ch.unsetBackgroundColor()).run();
  return (tipo==='texto'?ch.setColor(css):ch.setBackgroundColor(css)).run();
}
function ntSemCor(ed){return ed.chain().focus().unsetColor().unsetBackgroundColor().run()}

// ===== Movimento de blocos (Tab/Shift+Tab, menu da alça) =====
// Bloco "movível" no ponto: item de lista, ou filho direto de documento/toggle/destaque/citação (parágrafo, título, toggle, imagem…).
const NT_PAIS=new Set(['doc','detailsContent','callout','blockquote']);
function ntBlocoEm(doc,pos){
  const $p=doc.resolve(Math.max(0,Math.min(pos,doc.content.size)));
  for(let d=$p.depth;d>=1;d--){
    const n=$p.node(d),pai=$p.node(d-1);
    if(n.type.name==='listItem'||n.type.name==='taskItem'||(NT_PAIS.has(pai.type.name)&&!['bulletList','orderedList','taskList'].includes(n.type.name)))
      return {pos:$p.before(d),node:n,pai,idx:$p.index(d-1),depth:d};
  }return null;
}
// Bloco logo "à frente" de p (imagem, divisória) ou o que contém p.
function ntBlocoPos(doc,p){
  const n=doc.nodeAt(p);
  if(n&&n.isBlock&&n.isLeaf){const $=doc.resolve(p);return {pos:p,node:n,pai:$.parent,idx:$.index(),depth:$.depth+1}}
  return ntBlocoEm(doc,p+1);
}
// Move o bloco para `destino` (posição no doc ANTES da mudança), mantendo a seleção dentro dele.
function ntMovePara(ed,b,destino,selDeslocada=true){
  const {state,view}=ed,tr=state.tr,tam=b.node.nodeSize,off=state.selection.from-b.pos;
  const dentro=state.selection.from>=b.pos&&state.selection.from<=b.pos+tam;
  let novo;
  if(destino<=b.pos){tr.delete(b.pos,b.pos+tam);tr.insert(destino,b.node);novo=destino}
  else{tr.insert(destino,b.node);tr.delete(b.pos,b.pos+tam);novo=destino-tam}
  const S=TT.pm.state;
  try{tr.setSelection(dentro&&selDeslocada?S.TextSelection.create(tr.doc,novo+Math.min(off,tam-1)):S.Selection.near(tr.doc.resolve(novo+1)))}catch(e){}
  view.dispatch(tr.scrollIntoView());return novo;
}
function ntSobeDesce(ed,b,dir){
  const {pai,idx}=b;if(dir<0&&idx===0||dir>0&&idx>=pai.childCount-1)return false;
  if(dir<0){ntMovePara(ed,b,b.pos-pai.child(idx-1).nodeSize);return true}
  ntMovePara(ed,b,b.pos+b.node.nodeSize+pai.child(idx+1).nodeSize);return true;
}
// Tab: entra no toggle anterior (vira o último filho dele). Shift+Tab: sai do toggle atual (vira irmão logo depois dele).
function ntAninha(ed,b,sai){
  if(b.node.type.name==='listItem'||b.node.type.name==='taskItem'){
    const t=b.node.type.name;ed.chain().focus().setTextSelection(b.pos+2)[sai?'liftListItem':'sinkListItem'](t).run();return true;
  }
  const {state}=ed,doc=state.doc;
  if(!sai){
    if(b.idx===0)return false;const ant=b.pai.child(b.idx-1);if(ant.type.name!=='details')return false;
    const ini=b.pos-ant.nodeSize,fimConteudo=ini+ant.nodeSize-2,conteudo=ant.lastChild;
    const soVazio=conteudo.childCount===1&&conteudo.firstChild.type.name==='paragraph'&&!conteudo.firstChild.content.size;
    if(soVazio){   // o parágrafo vazio que o toggle novo traz é substituído
      const {view}=ed,tr=state.tr,tam=b.node.nodeSize,off=state.selection.from-b.pos,S=TT.pm.state;
      tr.delete(b.pos,b.pos+tam);tr.replaceWith(fimConteudo-conteudo.firstChild.nodeSize,fimConteudo,b.node);
      try{tr.setSelection(S.TextSelection.create(tr.doc,fimConteudo-conteudo.firstChild.nodeSize+Math.min(off,tam-1)))}catch(e){}
      view.dispatch(tr.scrollIntoView());
    }else ntMovePara(ed,b,fimConteudo);
    ntAbertoSalva(ant.attrs.id,true);const dom=ed.view.nodeDOM(ini);if(dom)ntPoeAberto(dom,true);
    return true;
  }
  if(b.pai.type.name!=='detailsContent')return false;
  const $p=doc.resolve(b.pos),det=$p.before($p.depth-1),detNode=doc.nodeAt(det);
  if(b.pai.childCount===1){   // único filho: o toggle fica com um parágrafo vazio
    const {view}=ed,tr=state.tr,tam=b.node.nodeSize,off=state.selection.from-b.pos,S=TT.pm.state,destino=det+detNode.nodeSize;
    tr.insert(destino,b.node);tr.replaceWith(b.pos,b.pos+tam,state.schema.nodes.paragraph.create());
    try{tr.setSelection(S.TextSelection.create(tr.doc,destino+Math.min(off,tam-1)))}catch(e){}
    view.dispatch(tr.scrollIntoView());return true;
  }
  ntMovePara(ed,b,det+detNode.nodeSize);return true;
}
function ntTab(ed,sai){
  const sel=ed.state.selection,b=sel.node?ntBlocoPos(ed.state.doc,sel.from):ntBlocoEm(ed.state.doc,sel.from);   // na linha do toggle, o bloco é o toggle inteiro
  if(b)ntAninha(ed,b,sai);return true;   // sempre consome Tab: não sai do editor
}

// ===== Envio de imagem: reduz (1600 px, JPEG 0,82), grava em imagens/nota-<id>.jpg no repositório privado =====
const NT_IMG_MAX=1600;
async function ntImgComprime(blob){
  const b=await createImageBitmap(blob),k=Math.min(1,NT_IMG_MAX/Math.max(b.width,b.height));
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(b.width*k));c.height=Math.max(1,Math.round(b.height*k));
  const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(b,0,0,c.width,c.height);b.close?.();
  return new Promise((ok,no)=>c.toBlob(r=>r?ok(r):no(new Error('imagem')),'image/jpeg',0.82));
}
async function ntImgEnvia(blob){
  const nome='nota-'+smId()+'.jpg';
  const b64=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.onerror=no;r.readAsDataURL(blob)});
  await BCBR.api(`/repos/${BCBR.REPO}/contents/imagens/${nome}`,{method:'PUT',body:JSON.stringify({message:'nota: imagem',content:b64,branch:'main'})});
  try{(await caches.open('bcbr-img')).put('./img/'+nome,new Response(blob,{headers:{'Content-Type':'image/jpeg'}}))}catch(e){}   // aparece já, sem baixar de novo
  return nome;
}
function ntNomeImg(src){const m=/(?:^|\/)img\/([^/?#]+)$/.exec(String(src||''));return m?decodeURIComponent(m[1]):''}

// ===== Editor =====
const NT_PH=()=>NT.phKey||(NT.phKey=new TT.pm.state.PluginKey('ntImagemEnviando'));
// Marcador "Enviando imagem…" (decoração, fora do documento): acompanha o texto digitado enquanto a imagem sobe.
function ntPluginEnvio(){
  const {Plugin}=TT.pm.state,{Decoration,DecorationSet}=TT.pm.view;
  return new Plugin({key:NT_PH(),state:{init:()=>DecorationSet.empty,apply(tr,set){
    set=set.map(tr.mapping,tr.doc);const m=tr.getMeta(NT_PH());
    if(m?.add){const el=document.createElement('div');el.className='nt-img-ph';el.contentEditable='false';el.innerHTML='<span class="nt-giro"></span>Enviando imagem…';set=set.add(tr.doc,[Decoration.widget(m.add.pos,el,{id:m.add.id,side:-1})])}
    if(m?.remove)set=set.remove(set.find(undefined,undefined,s=>s.id===m.remove));
    return set}},props:{decorations(s){return NT_PH().getState(s)}}});
}
const ntPhPos=(state,id)=>NT_PH().getState(state).find(undefined,undefined,s=>s.id===id)[0]?.from??null;
// Onde entra a imagem: depois do bloco do cursor (ou no lugar dele, se for um parágrafo vazio).
function ntPontoImagem(state,pos){
  const $p=state.doc.resolve(Math.max(0,Math.min(pos,state.doc.content.size))),tipo=state.schema.nodes.image;
  for(let d=$p.depth;d>=1;d--){const pai=$p.node(d-1),i=$p.indexAfter(d-1);if(pai.canReplaceWith(i,i,tipo))return $p.after(d)}
  return state.doc.content.size;
}
async function ntInsereImagem(arquivo,pos){
  const ed=NT.ed;if(!ed||!arquivo)return;
  const id=smId(),ponto=ntPontoImagem(ed.state,pos??ed.state.selection.from);
  ed.view.dispatch(ed.state.tr.setMeta(NT_PH(),{add:{id,pos:ponto}}));toast('Enviando imagem…');
  const tira=()=>ed.view.dispatch(ed.state.tr.setMeta(NT_PH(),{remove:id}));
  let nome;
  try{nome=await ntImgEnvia(await ntImgComprime(arquivo))}
  catch(e){tira();toast(e?.chave?'A chave do GitHub foi recusada (401).':e?.status?`Não consegui enviar a imagem (GitHub ${e.status}).`:'Não consegui enviar a imagem (precisa de conexão).');return}
  const p=ntPhPos(ed.state,id);if(p==null){toast('A imagem subiu, mas o lugar dela foi apagado.');return}
  const tr=ed.state.tr.setMeta(NT_PH(),{remove:id}),no=ed.state.schema.nodes.image.create({src:'./img/'+nome}),antes=tr.doc.resolve(p).nodeBefore;
  if(antes?.type.name==='paragraph'&&!antes.content.size)tr.replaceWith(p-antes.nodeSize,p,no);else tr.insert(p,no);
  ed.view.dispatch(tr.scrollIntoView());toast('Imagem anexada.');
}
function ntEscolheImagem(){
  NT.posImg=NT.ed.state.selection.from;
  let i=NT.el.querySelector('.nt-arquivo');
  if(!i){i=document.createElement('input');i.type='file';i.accept='image/*';i.className='nt-arquivo';i.hidden=true;
    i.onchange=()=>{const f=i.files[0];i.value='';if(f)ntInsereImagem(f,NT.posImg)};NT.el.appendChild(i)}
  i.click();
}
// Imagem: nó próprio (largura em %, arquivo vem do repositório privado via ./img/…, com o plano B do shim se o service worker falhar).
function ntImagem(){
  return TT.ext.Image.extend({
    parseHTML(){return [{tag:'img[src^="./img/"]'}]},   // imagens de fora (Word, páginas) não entram
    addAttributes(){return {...this.parent?.(),largura:{default:null,parseHTML:el=>el.getAttribute('data-largura')||null,renderHTML:a=>a.largura?{'data-largura':a.largura}:{}}}},
    addNodeView(){return ({node})=>{
      const img=document.createElement('img');img.className='nt-img';img.alt='Imagem da nota';img.draggable=false;
      const pinta=n=>{const nome=ntNomeImg(n.attrs.src);img.src=(nome&&window.BCBR?.imgPronta?.(nome))||n.attrs.src||'';img.style.width=n.attrs.largura?n.attrs.largura+'%':''};
      pinta(node);let atual=node;
      return {dom:img,ignoreMutation:()=>true,update(n){if(n.type!==atual.type)return false;if(n.attrs.src!==atual.attrs.src||n.attrs.largura!==atual.attrs.largura)pinta(n);atual=n;return true}};
    }},
  }).configure({inline:false,allowBase64:false});
}

function ntDestaque(){
  return TT.Node.create({name:'callout',group:'block',content:'block+',defining:true,
    addAttributes(){return {icone:{default:'💡',parseHTML:el=>el.getAttribute('data-icone')||'💡',renderHTML:a=>({'data-icone':a.icone})}}},
    parseHTML(){return [{tag:'div[data-type="callout"]',contentElement:'.nt-callout-c'}]},
    renderHTML({node,HTMLAttributes}){return ['div',TT.mergeAttributes(HTMLAttributes,{'data-type':'callout',class:'nt-callout'}),['span',{class:'nt-callout-i',contenteditable:'false'},node.attrs.icone],['div',{class:'nt-callout-c'},0]]},
  });
}
// Toggle: aberto/fechado fica no DOM (classe is-open) e no aparelho; nunca no documento.
function ntToggle(){
  return TT.ext.Details.extend({
    addNodeView(){return ({node})=>{
      const dom=document.createElement('div');dom.setAttribute('data-type','details');
      const tg=document.createElement('button');tg.type='button';tg.className='nt-seta';tg.setAttribute('aria-label','Abrir ou fechar o toggle');tg.textContent='▶';
      const conteudo=document.createElement('div');conteudo.className='nt-tgl-c';dom.append(tg,conteudo);
      let id=node.attrs.id;const poe=()=>{if(id)dom.dataset.id=id;ntPoeAberto(dom,ntAberto(id))};poe();
      tg.addEventListener('mousedown',e=>e.preventDefault());   // não rouba o foco do editor (teclado do celular não aparece)
      tg.addEventListener('click',()=>{const a=!dom.classList.contains('is-open');ntPoeAberto(dom,a);ntAbertoSalva(id,a);ntRotuloTodos()});
      return {dom,contentDOM:conteudo,
        ignoreMutation:m=>m.type==='selection'?false:tg.contains(m.target)||!dom.contains(m.target)||dom===m.target,
        update(n){if(n.type!==node.type)return false;if(n.attrs.id!==id){id=n.attrs.id;poe()}return true}};
    }},
  });
}
// Identificação: todo bloco de TOPO e todo toggle (em qualquer nível) tem `id`; repetido (cópia/divisão) ganha id novo.
const NT_COM_ID=['paragraph','heading','details','bulletList','orderedList','taskList','blockquote','callout','image','horizontalRule'];
function ntIds(){
  const {Plugin,PluginKey}=TT.pm.state;
  return TT.Extension.create({name:'idBloco',
    addGlobalAttributes(){return [{types:NT_COM_ID,attributes:{id:{default:null,parseHTML:el=>el.getAttribute('data-id'),renderHTML:a=>a.id?{'data-id':a.id}:{}}}}]},
    addProseMirrorPlugins(){return [new Plugin({key:new PluginKey('idBloco'),appendTransaction(trs,antes,depois){
      if(!trs.some(t=>t.docChanged))return null;
      const vistos=new Set(),tr=depois.tr;let mudou=false;
      depois.doc.descendants((n,pos,pai)=>{
        if(!NT_COM_ID.includes(n.type.name))return;
        const precisa=pai===depois.doc||n.type.name==='details';let id=n.attrs.id;
        if(id&&vistos.has(id))id=null;
        if(!id&&precisa){id=ntNovoId();tr.setNodeMarkup(pos,undefined,{...n.attrs,id});mudou=true;if(n.type.name==='details')ntAbertoSalva(id,true)}
        if(id)vistos.add(id);
      });
      return mudou?tr.setMeta('addToHistory',false):null}})]},
  });
}

// "> " no começo da linha vira toggle (citação fica no menu "/")
function ntRegraToggle(){
  return TT.Extension.create({name:'regraToggle',addInputRules(){return [new TT.InputRule({find:/^\s*>\s$/,handler:({range,chain})=>{chain().deleteRange(range).setDetails().run()}})]}});
}
function ntAtalhos(){
  return TT.Extension.create({name:'atalhosNotas',priority:1000,addKeyboardShortcuts(){return {
    'Mod-Shift-h':()=>{const c=ntUltimaCor();ntAplicaCor(this.editor,c.tipo,c.cor);return true},
    'Mod-k':()=>{ntLink(this.editor);return true},
    'Tab':()=>ntTab(this.editor,false),'Shift-Tab':()=>ntTab(this.editor,true)}}});
}
// Link (Ctrl+K ou botão da barrinha): campo dentro da barrinha flutuante (prompt() não existe no WebView do APK).
function ntLink(ed){
  const {from,to,empty}=ed.state.selection;
  if(empty&&!ed.isActive('link')){toast('Selecione o texto que vai virar link.');return}
  NT.linkSel={from,to};NT.linkAberto=true;
  const i=NT.bolha.querySelector('.nt-link-in');i.value=ed.getAttributes('link').href||'';
  ntBolhaPos();i.focus();i.select();
}
function ntLinkAplica(url){
  const ed=NT.ed,u=String(url||'').trim();NT.linkAberto=false;
  const c=ed.chain().focus().setTextSelection(NT.linkSel).extendMarkRange('link');
  if(!u||u==='https://')c.unsetLink().run();else c.setLink({href:/^[a-z][a-z0-9+.-]*:/i.test(u)?u:'https://'+u}).run();
  ntBolhaPos();
}

// ----- Menu "/" -----
const NT_SLASH=[
  ['Título 1','Título grande','h1 titulo 1 #',ed=>ed.setNode('heading',{level:1})],
  ['Título 2','Título médio','h2 titulo 2 ##',ed=>ed.setNode('heading',{level:2})],
  ['Título 3','Título pequeno','h3 titulo 3 ###',ed=>ed.setNode('heading',{level:3})],
  ['Texto','Parágrafo simples','texto paragrafo',ed=>ed.setParagraph()],
  ['Toggle','Bloco que abre e fecha','toggle >',ed=>ed.setDetails()],
  ['Lista','Lista com bolinhas','lista bolinhas -',ed=>ed.toggleBulletList()],
  ['Lista numerada','1, 2, 3…','lista numerada 1.',ed=>ed.toggleOrderedList()],
  ['Checklist','Lista de tarefas','checklist tarefas []',ed=>ed.toggleTaskList()],
  ['Citação','Trecho em destaque lateral','citacao quote',ed=>ed.toggleBlockquote()],
  ['Destaque','Caixa com ícone e fundo','destaque callout aviso',ed=>ed.wrapIn('callout')],
  ['Divisória','Linha horizontal','divisoria linha ---',ed=>ed.setHorizontalRule()],
  ['Imagem','Enviar uma imagem','imagem foto',null],
];
const ntSemAcento=s=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
function ntSlash(){
  return TT.Extension.create({name:'slashNotas',addProseMirrorPlugins(){
    let menu=null,itens=[],sel=0,props=null;
    const pinta=()=>{
      menu.innerHTML=itens.length?itens.map((it,i)=>`<button type="button" class="nt-slash-it${i===sel?' sel':''}" data-i="${i}"><b>${esc(it[0])}</b><small>${esc(it[1])}</small></button>`).join(''):'<div class="nt-slash-vazio">Nada encontrado</div>';
      const r=props.clientRect?.();if(r){menu.style.left=Math.max(8,Math.min(r.left,innerWidth-250))+'px';const abaixo=r.bottom+6;menu.style.top=(abaixo+260>innerHeight&&r.top>270?r.top-Math.min(260,menu.offsetHeight||260)-6:abaixo)+'px'}
      menu.querySelector('.sel')?.scrollIntoView({block:'nearest'});
    };
    const fecha=()=>{menu?.remove();menu=null};
    return [TT.Suggestion({editor:this.editor,char:'/',pluginKey:new TT.pm.state.PluginKey('slashNotas'),
      allow:({state,range})=>state.doc.resolve(range.from).parent.type.name!=='detailsSummary',
      items:({query})=>{const q=ntSemAcento(query);return NT_SLASH.filter(it=>!q||ntSemAcento(it[0]+' '+it[2]).includes(q))},
      command:({editor,range,props:it})=>{
        const c=editor.chain().focus().deleteRange(range);
        if(it[3]){it[3](c).run();return}
        c.run();ntEscolheImagem();
      },
      render:()=>({
        onStart:p=>{props=p;itens=p.items;sel=0;menu=document.createElement('div');menu.className='nt-slash';menu.setAttribute('role','listbox');
          menu.addEventListener('mousedown',e=>e.preventDefault());
          menu.addEventListener('click',e=>{const b=e.target.closest('[data-i]');if(b)props.command(itens[+b.dataset.i])});
          NT.el.appendChild(menu);pinta()},
        onUpdate:p=>{props=p;itens=p.items;sel=Math.min(sel,Math.max(0,itens.length-1));pinta()},
        onKeyDown:({event:e})=>{
          if(e.key==='Escape'){fecha();return true}
          if(!itens.length)return false;
          if(e.key==='ArrowDown'){sel=(sel+1)%itens.length;pinta();return true}
          if(e.key==='ArrowUp'){sel=(sel-1+itens.length)%itens.length;pinta();return true}
          if(e.key==='Enter'||e.key==='Tab'){props.command(itens[sel]);return true}
          return false},
        onExit:fecha,
      })})];
  }});
}

// ----- Barrinha flutuante ao selecionar texto + barra da imagem -----
function ntBolha(){
  const b=document.createElement('div');b.className='nt-bolha';b.hidden=true;b.setAttribute('role','toolbar');
  b.addEventListener('mousedown',e=>{if(!e.target.closest('input'))e.preventDefault()});
  const ed=()=>NT.ed;
  const swatches=tipo=>NT_CORES.map(([k,n])=>`<button type="button" class="nt-sw nt-sw-${tipo}" data-cor="${tipo}:${k}" title="${n}" style="${tipo==='texto'?`color:var(--ntc-${k})`:`background:var(--ntb-${k})`}">${tipo==='texto'?'A':''}</button>`).join('');
  b.innerHTML=`<div class="nt-bolha-texto"><button type="button" data-m="bold" title="Negrito (Ctrl+B)"><b>B</b></button><button type="button" data-m="italic" title="Itálico (Ctrl+I)"><i>I</i></button><button type="button" data-m="underline" title="Sublinhado (Ctrl+U)"><u>U</u></button><button type="button" data-m="strike" title="Tachado (Ctrl+Shift+S)"><s>S</s></button><button type="button" data-m="link" title="Link (Ctrl+K)">🔗</button><button type="button" data-m="cor" title="Cor">A▾</button></div>
    <div class="nt-link" hidden><input type="text" class="nt-link-in" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="Endereço do link (vazio remove)" aria-label="Endereço do link"><button type="button" data-m="link-ok" title="Aplicar">OK</button><button type="button" data-m="link-x" title="Cancelar">✕</button></div>
    <div class="nt-paleta" hidden><div class="nt-paleta-t">Texto</div><div class="nt-paleta-l">${swatches('texto')}</div><div class="nt-paleta-t">Fundo</div><div class="nt-paleta-l">${swatches('fundo')}</div><button type="button" class="nt-sem-cor" data-cor="nenhuma">Sem cor</button></div>
    <div class="nt-bolha-img" hidden><button type="button" data-l="25">25%</button><button type="button" data-l="50">50%</button><button type="button" data-l="75">75%</button><button type="button" data-l="100">100%</button><button type="button" data-l="apagar" title="Apagar imagem">🗑</button></div>`;
  b.querySelector('.nt-link-in').addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();ntLinkAplica(e.target.value)}
    else if(e.key==='Escape'){e.preventDefault();NT.linkAberto=false;ed().chain().focus().setTextSelection(NT.linkSel).run();ntBolhaPos()}
  });
  b.addEventListener('click',e=>{
    const bt=e.target.closest('button');if(!bt||!ed())return;
    if(bt.dataset.m==='link-ok'){ntLinkAplica(b.querySelector('.nt-link-in').value);return}
    if(bt.dataset.m==='link-x'){NT.linkAberto=false;ed().chain().focus().setTextSelection(NT.linkSel).run();ntBolhaPos();return}
    if(bt.dataset.m){const m=bt.dataset.m,c=ed().chain().focus();
      if(m==='bold')c.toggleBold().run();else if(m==='italic')c.toggleItalic().run();else if(m==='underline')c.toggleUnderline().run();else if(m==='strike')c.toggleStrike().run();
      else if(m==='link'){ntLink(ed());return}else if(m==='cor')b.querySelector('.nt-paleta').hidden=!b.querySelector('.nt-paleta').hidden;
      ntBolhaPos();return}
    if(bt.dataset.cor){if(bt.dataset.cor==='nenhuma')ntSemCor(ed());else{const[t,k]=bt.dataset.cor.split(':');ntAplicaCor(ed(),t,k)}b.querySelector('.nt-paleta').hidden=true;ntBolhaPos();return}
    if(bt.dataset.l){const s=ed().state.selection,n=s.node;if(n?.type.name!=='image')return;
      if(bt.dataset.l==='apagar')ed().chain().focus().deleteSelection().run();
      else ed().chain().focus().command(({tr})=>{tr.setNodeMarkup(s.from,undefined,{...n.attrs,largura:+bt.dataset.l===100?null:+bt.dataset.l});return true}).run();
    }
  });
  NT.bolha=b;NT.el.appendChild(b);
}
function ntBolhaPos(){
  const b=NT.bolha,e=NT.ed;if(!b||!e)return;
  const s=e.state.selection,img=s.node?.type.name==='image',texto=!s.empty&&!s.node&&e.state.doc.textBetween(s.from,s.to,' ').trim().length>0;
  if(NT.linkAberto&&!e.isFocused&&!b.contains(document.activeElement))NT.linkAberto=false;   // clicou fora: fecha o campo do link
  if(!e.isFocused&&!b.contains(document.activeElement)||!(img||texto||NT.linkAberto)){b.hidden=true;b.querySelector('.nt-paleta').hidden=true;NT.linkAberto=false;return}
  const lk=!!NT.linkAberto&&!img;
  b.querySelector('.nt-link').hidden=!lk;b.querySelector('.nt-bolha-texto').hidden=img||lk;b.querySelector('.nt-bolha-img').hidden=!img;if(lk)b.querySelector('.nt-paleta').hidden=true;
  if(img)b.querySelector('.nt-paleta').hidden=true;
  if(!img)for(const bt of b.querySelectorAll('.nt-bolha-texto [data-m]'))bt.classList.toggle('on',bt.dataset.m!=='cor'&&bt.dataset.m!=='link'?e.isActive(bt.dataset.m):bt.dataset.m==='link'&&e.isActive('link'));
  b.hidden=false;
  const a=e.view.coordsAtPos(s.from),z=e.view.coordsAtPos(s.to),h=b.offsetHeight||40,w=b.offsetWidth||220,toque=matchMedia('(pointer:coarse)').matches;
  const topo=toque?Math.max(z.bottom,a.bottom)+10:a.top-h-8;
  b.style.top=Math.max(8,Math.min(topo<8?Math.max(z.bottom,a.bottom)+10:topo,innerHeight-h-8))+'px';
  b.style.left=Math.max(8,Math.min((a.left+z.left)/2-w/2,innerWidth-w-8))+'px';
}

// ----- Alça ⋮⋮ (arrastar com mouse; clicar/tocar abre o menu Subir/Descer/Aninhar/Apagar) -----
function ntAlca(){
  const al=document.createElement('div');al.className='nt-alca';al.contentEditable='false';al.draggable=true;al.hidden=true;al.title='Arrastar (clique para o menu)';al.textContent='⋮⋮';
  const menu=document.createElement('div');menu.className='nt-menu-bloco';menu.hidden=true;
  menu.innerHTML=[['subir','↑ Subir'],['descer','↓ Descer'],['aninhar','⇥ Entrar no anterior'],['sair','⇤ Sair do nível'],['apagar','🗑 Apagar']].map(([k,t])=>`<button type="button" data-a="${k}">${t}</button>`).join('');
  NT.el.append(al,menu);NT.alcaEl=al;NT.menuEl=menu;
  const bloco=()=>NT.alvo!=null&&NT.ed.state.doc.content.size>NT.alvo?ntBlocoPos(NT.ed.state.doc,NT.alvo):null;
  const mostra=b=>{
    if(!b){al.hidden=true;return}
    NT.alvo=b.pos;const dom=NT.ed.view.nodeDOM(b.pos);if(!(dom instanceof Element)){al.hidden=true;return}
    const r=dom.getBoundingClientRect(),c=NT.el.getBoundingClientRect(),lh=parseFloat(getComputedStyle(dom).lineHeight)||24,lista=/^(listItem|taskItem)$/.test(b.node.type.name)&&dom.parentElement?dom.parentElement.getBoundingClientRect().left:r.left;   // item de lista: alça fica à esquerda da bolinha
    al.hidden=false;al.style.top=(r.top-c.top+Math.max(0,(lh-24)/2)+1)+'px';al.style.left=(lista-c.left-24)+'px';
  };
  NT.alcaMostra=mostra;
  NT.el.addEventListener('mousemove',e=>{
    if(!NT.ed||e.target.closest('.nt-alca,.nt-menu-bloco'))return;
    const v=NT.ed.view,pm=v.dom.getBoundingClientRect(),x=Math.min(Math.max(e.clientX,pm.left+40),pm.right-2);
    const r=v.posAtCoords({left:x,top:e.clientY});if(!r)return;
    mostra(r.inside>=0?ntBlocoPos(NT.ed.state.doc,r.inside):ntBlocoEm(NT.ed.state.doc,r.pos));
  });
  al.addEventListener('dragstart',e=>{
    const b=bloco();if(!b){e.preventDefault();return}
    const S=TT.pm.state,v=NT.ed.view,sel=S.NodeSelection.create(v.state.doc,b.pos);
    v.dispatch(v.state.tr.setSelection(sel));v.dragging={slice:sel.content(),move:true};
    const dom=v.nodeDOM(b.pos);if(dom instanceof Element)e.dataTransfer.setDragImage(dom,0,0);
    e.dataTransfer.effectAllowed='copyMove';e.dataTransfer.setData('text/plain','');
  });
  al.addEventListener('dragend',()=>{NT.ed.view.dragging=null});
  al.addEventListener('click',()=>{
    const b=bloco();if(!b)return;
    if(!menu.hidden){menu.hidden=true;return}
    menu.hidden=false;menu.style.top=al.offsetTop+26+'px';menu.style.left=al.offsetLeft+'px';
  });
  menu.addEventListener('mousedown',e=>e.preventDefault());
  menu.addEventListener('click',e=>{
    const k=e.target.closest('[data-a]')?.dataset.a,b=bloco();menu.hidden=true;if(!k||!b)return;
    const ed=NT.ed;ed.chain().focus().setTextSelection(Math.min(b.pos+1,ed.state.doc.content.size)).run();
    if(k==='subir')ntSobeDesce(ed,b,-1);else if(k==='descer')ntSobeDesce(ed,b,1);
    else if(k==='aninhar')ntAninha(ed,b,false);else if(k==='sair')ntAninha(ed,b,true);
    else if(k==='apagar')ed.view.dispatch(ed.state.tr.delete(b.pos,b.pos+b.node.nodeSize).scrollIntoView());
    NT.alvo=null;al.hidden=true;
  });
}

function ntExtensoes(){
  const E=TT.ext;
  return [E.Document,E.Paragraph,E.Text,E.Heading.configure({levels:[1,2,3]}),E.Bold,E.Italic,E.Underline,E.Strike,
    E.Link.configure({openOnClick:false,autolink:true}),
    E.BulletList,E.OrderedList,E.ListItem,E.TaskList,E.TaskItem.configure({nested:true}),
    E.Blockquote.extend({addInputRules(){return []}}),   // "> " é toggle; citação só pelo menu "/"
    E.HorizontalRule,ntToggle(),E.DetailsSummary,E.DetailsContent,ntDestaque(),ntImagem(),
    E.TextStyle,E.Color,E.BackgroundColor,E.UndoRedo,E.Dropcursor.configure({color:'#5687be',width:2}),E.Gapcursor,E.TrailingNode,
    E.Placeholder.configure({placeholder:({node})=>node.type.name==='detailsSummary'?'Toggle':node.type.name==='heading'?'Título':"Digite '/' para ver os comandos"}),
    ntIds(),ntRegraToggle(),ntAtalhos(),ntSlash(),
    TT.Extension.create({name:'envioImagem',addProseMirrorPlugins(){return [ntPluginEnvio()]}})];
}
// Separa os blocos que o editor aceita dos inválidos (plano corrompido): um bloco ruim não derruba a aba nem apaga as outras notas.
function ntValidos(blocos){
  const bons=[],ruins=[];
  if(!Array.isArray(blocos))return {bons,ruins,corrompido:true};
  let t;
  try{t=new TT.Editor({extensions:ntExtensoes()});
    for(const b of blocos){try{if(!b||typeof b.id!=='string')throw 0;t.schema.nodeFromJSON(b.conteudo).check();bons.push(b)}catch(e){ruins.push(b)}}
  }catch(e){return {bons:[],ruins:blocos,corrompido:true}}finally{try{t?.destroy()}catch(e){}}
  return {bons,ruins,corrompido:false};
}
function ntCria(){
  const lista=SM.d.notasDoc?.blocos,v=ntValidos(lista);
  if(v.ruins.length){   // guarda os inválidos em notas_conflitos (uma vez só: id+data fixos)
    const novos=v.ruins.map((b,i)=>({id:String(b?.id||'sem-id-'+i),em:String(b?.atualizado||'invalido'),motivo:'bloco inválido',conteudo:b?.conteudo??null}));
    const todos=ntJuntaConflitos(SM.d.notas_conflitos,novos);
    if(JSON.stringify(todos)!==JSON.stringify(SM.d.notas_conflitos||[]))smMudar(d=>{d.notas_conflitos=ntJuntaConflitos(d.notas_conflitos,novos)},'notas: bloco inválido guardado');
  }
  if(v.corrompido||(v.ruins.length&&!v.bons.length)){ntFalha();return false}   // nada aproveitável: oferece restaurar
  NT.el=document.createElement('div');NT.el.className='nt-ed';
  const doc=ntDocumento(v.bons);NT.shown=lista;
  NT.ed=new TT.Editor({element:NT.el,extensions:ntExtensoes(),content:doc,
    editorProps:{attributes:{class:'nt-pm','aria-label':'Notas',spellcheck:'true'},
      transformPastedHTML:h=>h.replace(/<img\b(?![^>]*\bsrc="\.\/img\/)[^>]*>/gi,''),
      handlePaste:(v,e)=>{
        const cd=e.clipboardData;if(!cd)return false;
        const texto=cd.getData('text/plain'),arq=[...(cd.items||[])].find(i=>i.kind==='file'&&/^image\//.test(i.type))?.getAsFile();
        if(arq&&texto){e.preventDefault();v.pasteText(texto);return true}   // Excel/Word trazem imagem + texto: cola o texto
        if(arq){e.preventDefault();ntInsereImagem(arq);return true}
        return false},
      handleDrop:(v,e,slice,moved)=>{
        const arq=!moved&&[...(e.dataTransfer?.files||[])].find(f=>/^image\//.test(f.type));if(!arq)return false;
        e.preventDefault();ntInsereImagem(arq,v.posAtCoords({left:e.clientX,top:e.clientY})?.pos);return true},
      handleClick:(v,pos,e)=>{if((e.ctrlKey||e.metaKey)&&e.target.closest?.('a[href]')){window.open(e.target.closest('a').href,'_blank','noopener');return true}return false}}});
  NT.ed.on('update',({transaction:t})=>{if(t.getMeta('ntRemoto'))return;NT.sujo=true;clearTimeout(NT.timer);NT.timer=setTimeout(ntSalvaDoc,1000)});
  NT.ed.on('transaction',({transaction:t})=>{if(NT.posImg!=null)NT.posImg=t.mapping.map(NT.posImg);ntRotuloTodos()});
  for(const ev of ['selectionUpdate','update','focus','blur'])NT.ed.on(ev,()=>setTimeout(()=>{ntBolhaPos();if(ev==='selectionUpdate'&&matchMedia('(pointer:coarse)').matches)NT.alcaMostra?.(ntBlocoEm(NT.ed.state.doc,NT.ed.state.selection.from))},ev==='blur'?150:0));
  NT.el.addEventListener('keydown',e=>{if(e.key==='Tab')e.stopPropagation()});   // depois do ProseMirror: Tab não troca de aba
  ntBolha();ntAlca();
  document.addEventListener('pointerdown',e=>{if(NT.menuEl&&!NT.menuEl.hidden&&!e.target.closest?.('.nt-menu-bloco,.nt-alca'))NT.menuEl.hidden=true});
  return true;
}
// Plano de notas sem nenhum bloco aproveitável: não abre o editor (um documento vazio apagaria tudo ao salvar); oferece a cópia da 1.38.
function ntFalha(){
  const raiz=document.getElementById('nt_raiz');if(!raiz)return;
  const tem=Array.isArray(SM.d?.notas_v138)&&SM.d.notas_v138.length;
  raiz.innerHTML=`<div class="card"><p>Não consegui abrir as notas: o documento salvo está corrompido. Os blocos ficaram guardados em notas_conflitos.</p>${tem?'<button type="button" class="b" id="nt_restaura" onclick="ntRestaura()">Restaurar das notas antigas (cópia da 1.38)</button>':'<p class="mut">Não há cópia das notas antigas neste plano.</p>'}</div>`;
}
function ntRestaura(){
  const v=SM.d?.notas_v138;if(!Array.isArray(v)||!v.length)return;
  try{localStorage.removeItem(NT_PEND)}catch(e){}
  NT.ed?.destroy();NT.ed=null;NT.el=null;NT.shown=null;
  smMudar(d=>{delete d.notasDoc;d.notas=JSON.parse(JSON.stringify(d.notas_v138));ntMigra(d)},'notas: restauradas da cópia 1.38');
}
// Aplica no editor SÓ os blocos de topo que mudaram (transação do ProseMirror, fora do histórico do Ctrl+Z): cursor, seleção e o
// que está sendo digitado nos outros blocos não são tocados. Nunca setContent no documento inteiro.
function ntAplicaNoEditor(alvo){
  const ed=NT.ed,nos=new Map();
  for(const b of alvo)try{const n=ed.state.schema.nodeFromJSON(b.conteudo);n.check();nos.set(b.id,n)}catch(e){}   // bloco inválido fica de fora (já está em notas_conflitos)
  alvo=alvo.filter(b=>nos.has(b.id));if(!alvo.length)return;
  const ids=new Set(alvo.map(b=>b.id)),tr=ed.state.tr,topo=()=>{const a=[];tr.doc.forEach((n,pos)=>a.push({id:n.attrs.id,n,pos}));return a};
  let p=0;
  for(const b of alvo){
    const cur=topo(),no=nos.get(b.id);
    while(cur[p]&&!ids.has(cur[p].id))p++;   // os que sumiram são apagados no fim
    const at=cur[p];
    if(at&&at.id===b.id){if(!at.n.eq(no))tr.replaceWith(at.pos,at.pos+at.n.nodeSize,no);p++;continue}
    const j=cur.findIndex((c,x)=>x>p&&c.id===b.id);
    if(j>=0)tr.delete(cur[j].pos,cur[j].pos+cur[j].n.nodeSize);   // o bloco veio de mais adiante (mudou de lugar)
    tr.insert(at?at.pos:tr.doc.content.size,no);p++;
  }
  for(const c of topo().reverse())if(!ids.has(c.id))tr.delete(c.pos,c.pos+c.n.nodeSize);
  if(tr.docChanged)ed.view.dispatch(tr.setMeta('addToHistory',false).setMeta('ntRemoto',true));
}
// Mostra no editor o documento do plano (outro aparelho mudou), sem atropelar o que está sendo digitado.
function ntSincroniza(){
  if(!NT.ed||!SM.d?.notasDoc||NT.sujo)return;
  const alvo=SM.d.notasDoc.blocos;
  if(JSON.stringify(alvo)===JSON.stringify(NT.shown))return;
  try{ntAplicaNoEditor(alvo);NT.shown=alvo;ntRotuloTodos()}
  catch(e){console.warn('notas: não consegui atualizar o editor; recriando',e);try{NT.ed.destroy()}catch(e2){}NT.ed=null;NT.el=null;NT.shown=null;smRender()}   // sem digitação pendente (sujo=false): recriar do plano é seguro
}
function ntMonta(){
  if(!document.getElementById('nt_raiz')||!SM.d)return;
  if(!window.TT){document.getElementById('nt_raiz').innerHTML='<p class="mut">O editor não carregou (vendor/tiptap.js). Atualize o app.</p>';return}
  if(!SM.d.notasDoc)smMudar(d=>ntMigra(d),'notas: migração para página única');   // redesenha a aba: pega o contêiner de novo
  const raiz=document.getElementById('nt_raiz');if(!raiz)return;
  if(!NT.ed&&!ntCria())return;
  if(NT.el.parentNode!==raiz)raiz.appendChild(NT.el);
  ntSincroniza();ntRotuloTodos();
  if(NT.eraFoco){NT.eraFoco=false;NT.ed.commands.focus(null,{scrollIntoView:false})}
}
// Botão + e Alt+A: novo toggle no topo da página, já com o cursor no título.
function ntAbre(){
  if(!NT.ed)return;
  NT.ed.chain().insertContentAt(0,{type:'details',content:[{type:'detailsSummary'},{type:'detailsContent',content:[{type:'paragraph'}]}]}).setTextSelection(2).focus().run();
  scrollTo({top:0});
}
function vNotas(){
  if(!SM.d)return '<div class="card"><p class="mut">As notas ainda não estão disponíveis neste aparelho. Tente novamente com conexão.</p></div>';
  NT.eraFoco=!!NT.ed&&!!NT.el&&NT.el.contains(document.activeElement);   // a aba é redesenhada: devolve o foco ao editor
  setTimeout(ntMonta,0);
  return `<div class="nt"><div class="nt-topo"><h2>Notas</h2><button type="button" class="b s" id="nt_todos" onclick="ntTodos()">Abrir todos</button></div>${SM.erro?'<p class="sm-err">Alterações salvas neste aparelho; sincronização pendente.</p>':''}<div id="nt_raiz"></div></div>`;
}
if(SM.d){if(!ntBaseLer()&&!ntTemPendentes())ntBaseSalva(SM.d.notasDoc?.blocos);ntAplica(SM.d,ntPendentes());smGuardaCache()}
window.addEventListener('online',()=>{ntSync().then(()=>smPuxar())});
window.addEventListener('storage',e=>{if(e.key===NT_PEND){if(SM.d){ntAntes();ntAplica(SM.d,ntPendentes());ntSincroniza()}smRender()}});
window.addEventListener('beforeunload',()=>{if(NT.sujo)ntSalvaDoc()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&NT.sujo)ntSalvaDoc()});
