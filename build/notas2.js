// Notas 1.42 (depois de notas.js, mesmo escopo): busca na página (Ctrl+F), seleção de blocos por retângulo, lembretes "@", histórico de versões
// pelo GitHub e frases-padrão. Tudo que é só de tela (retângulo, busca, janelas) fica fora do documento, do histórico do editor e do sync.

// ===== Janela simples (histórico, frases, busca global): Esc ou clique fora fecha, foco volta para quem estava =====
function ntModal(classe,html){
  const ov=document.createElement('div'),ant=document.activeElement;ov.className='nt-modal '+classe;ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');
  ov.innerHTML=`<div class="nt-modal-c">${html}</div>`;ov._ant=ant;
  ov.addEventListener('mousedown',e=>{if(e.target===ov)ntModalFecha(ov)});
  ov.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();ntModalFecha(ov)}});
  document.body.appendChild(ov);return ov;
}
function ntModalFecha(ov){if(!ov||!ov.isConnected)return;ov.remove();ov.aoFechar?.();try{ov._ant?.focus?.()}catch(e){}}

// ===== Ctrl+F nas Notas: busca própria. Destaque por Decoration.inline, contador n/total, Enter/Shift+Enter, ocorrência em toggle fechado o abre =====
const NT_BUSCA_PK=()=>NT.buscaPK||(NT.buscaPK=new TT.pm.state.PluginKey('ntBusca'));
// Sem acento e minúsculas, sempre com o MESMO comprimento do texto (cada caractere vira um só): os índices valem no original.
const ntNorma=s=>String(s).split('').map(ch=>{const r=ch.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();return r.length===1?r:ch.toLowerCase().length===1?ch.toLowerCase():ch}).join('');
// Ocorrências de q no documento: [{from,to}] (posições do ProseMirror), por bloco de texto; átomos inline contam como 1 caractere.
function ntAchaTexto(doc,q){
  const nq=ntNorma(q),out=[];if(!nq)return out;
  doc.descendants((n,pos)=>{
    if(!n.isTextblock)return;
    let txt='';const mapa=[];
    n.forEach((ch,off)=>{const base=pos+1+off;if(ch.isText){for(let i=0;i<ch.text.length;i++)mapa.push(base+i);txt+=ch.text}else{mapa.push(base);txt+='￼'}});
    const h=ntNorma(txt);let i=h.indexOf(nq);
    while(i>=0){out.push({from:mapa[i],to:mapa[i+nq.length-1]+1});i=h.indexOf(nq,i+nq.length)}
    return false;
  });
  return out;
}
function ntBuscaExt(){
  return TT.Extension.create({name:'buscaNotas',addProseMirrorPlugins(){
    const {Plugin}=TT.pm.state,{Decoration,DecorationSet}=TT.pm.view,K=NT_BUSCA_PK();
    return [new Plugin({key:K,
      state:{init:()=>({q:'',sel:0,ms:[],deco:DecorationSet.empty}),apply(tr,v,_a,nw){
        const m=tr.getMeta(K);if(!m&&!tr.docChanged)return v;
        const q=m&&m.q!=null?m.q:v.q;let sel=m&&m.sel!=null?m.sel:v.sel;
        if(!q)return v.q?{q:'',sel:0,ms:[],deco:DecorationSet.empty}:v;
        const ms=ntAchaTexto(nw.doc,q);if(sel>=ms.length||sel<0)sel=0;
        return {q,sel,ms,deco:DecorationSet.create(nw.doc,ms.map((x,i)=>Decoration.inline(x.from,x.to,{class:i===sel?'nt-busca-hit atual':'nt-busca-hit'})))};
      }},
      props:{decorations:s=>K.getState(s).deco}})];
  }});
}
const ntBuscaEstado=c=>c.ed?NT_BUSCA_PK().getState(c.ed.state):null;
function ntBuscaSet(c,q,sel){c.ed.view.dispatch(c.ed.state.tr.setMeta(NT_BUSCA_PK(),{q,sel}))}
function ntBuscaPinta(c){
  const e=ntBuscaEstado(c),n=c.buscaEl?.querySelector('.nt-busca-n');if(!e||!n)return;
  n.textContent=e.q?(e.ms.length?`${e.sel+1}/${e.ms.length}`:'0/0'):'';
}
// Abre os toggles fechados em volta da ocorrência atual (só estado de tela) e rola até ela.
function ntBuscaMostra(c){
  const e=ntBuscaEstado(c),m=e?.ms[e.sel];if(!m)return;
  const $=c.ed.state.doc.resolve(m.from);
  for(let d=$.depth;d>=1;d--)if($.node(d).type.name==='details'){
    const dom=c.ed.view.nodeDOM($.before(d));
    if(dom instanceof Element&&!dom.classList.contains('is-open')){ntPoeAberto(dom,true);ntAbertoSalva($.node(d).attrs.id,true)}
  }
  const el=c.el.querySelector('.nt-busca-hit.atual');if(el)el.scrollIntoView({block:'center',inline:'nearest'});
}
function ntBuscaVai(c,dir){
  const e=ntBuscaEstado(c);if(!e||!e.ms.length)return;
  ntBuscaSet(c,e.q,(e.sel+dir+e.ms.length)%e.ms.length);ntBuscaPinta(c);ntBuscaMostra(c);
}
function ntBuscaAbre(c){
  if(!c?.ed)return;
  if(!c.buscaEl){
    const b=document.createElement('div');b.className='nt-busca';b.setAttribute('role','search');
    b.innerHTML=`<div class="nt-busca-c"><input type="text" class="nt-busca-in" placeholder="Buscar na página" aria-label="Buscar nas notas" autocomplete="off" spellcheck="false"><span class="nt-busca-n" aria-live="polite"></span><button type="button" data-b="-1" title="Anterior (Shift+Enter)" aria-label="Ocorrência anterior">↑</button><button type="button" data-b="1" title="Próxima (Enter)" aria-label="Próxima ocorrência">↓</button><button type="button" data-b="x" title="Fechar (Esc)" aria-label="Fechar busca">✕</button></div>`;
    const i=b.querySelector('input');
    i.addEventListener('input',()=>{ntBuscaSet(c,i.value,0);ntBuscaPinta(c);ntBuscaMostra(c)});
    i.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();ntBuscaVai(c,e.shiftKey?-1:1)}});
    b.addEventListener('click',e=>{const bt=e.target.closest('[data-b]');if(!bt)return;if(bt.dataset.b==='x')ntBuscaFecha(c);else ntBuscaVai(c,+bt.dataset.b);if(bt.dataset.b!=='x')i.focus()});
    c.el.insertBefore(b,c.el.firstChild);c.buscaEl=b;
  }
  const i=c.buscaEl.querySelector('input'),s=c.ed.state.selection;
  if(!s.empty&&s.to-s.from<=80){const t=c.ed.state.doc.textBetween(s.from,s.to,' ');if(t.trim()){i.value=t;ntBuscaSet(c,t,0);ntBuscaPinta(c);ntBuscaMostra(c)}}
  i.focus();i.select();
}
function ntBuscaFecha(c){
  if(!c?.buscaEl)return;
  const b=c.buscaEl;c.buscaEl=null;b.remove();
  if(c.ed){try{ntBuscaSet(c,'',0);c.ed.commands.focus(null,{scrollIntoView:false})}catch(e){}}
}
document.addEventListener('keydown',e=>{
  if(!((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&String(e.key).toLowerCase()==='f'))return;
  const c=NP?.ed?NP:(tela==='notas'&&NT.ed&&NT.el?.isConnected?NT:null);if(!c)return;   // fora da aba Notas o Ctrl+F continua do navegador
  e.preventDefault();e.stopPropagation();ntBuscaAbre(c);
},true);

// ===== Seleção de blocos arrastando por fora do texto (como no Notion) =====
// Plugin com estado próprio (posições dos blocos de UM nível: o topo ou o conteúdo de um toggle) + Decoration.node `nt-bsel`. Não usa NodeSelection.
// Editar o documento limpa a seleção (a menos que a própria ação a refaça). Só mouse: no toque não há retângulo (não atrapalha a rolagem).
const NT_BSEL_PK=()=>NT.bselPK||(NT.bselPK=new TT.pm.state.PluginKey('ntBsel'));
const ntBselPos=s=>NT_BSEL_PK().getState(s).pos;
const ntBselMeta=(tr,pos)=>tr.setMeta(NT_BSEL_PK(),{pos});
let NT_BSEL_OBS=null;   // 1.57: quem quiser acompanhar as posições durante uma sequência de transações (Tab bloco a bloco)
const ntBselIntervalos=(doc,pos)=>pos.slice().sort((a,b)=>a-b).map(p=>{const node=doc.nodeAt(p);return {from:p,to:p+node.nodeSize,node}});
function ntBselExt(c){
  return TT.Extension.create({name:'selBlocos',addProseMirrorPlugins(){
    const {Plugin}=TT.pm.state,{Decoration,DecorationSet}=TT.pm.view,K=NT_BSEL_PK();
    const limpa=v=>{if(K.getState(v.state).pos.length)v.dispatch(ntBselMeta(v.state.tr,[]))};
    return [new Plugin({key:K,
      state:{init:()=>({pos:[]}),apply(tr,v){if(NT_BSEL_OBS)NT_BSEL_OBS(tr);const m=tr.getMeta(K);if(m)return {pos:m.pos};if(!tr.docChanged||!v.pos.length)return v;return tr.getMeta('appendedTransaction')?{pos:v.pos.map(p=>tr.mapping.map(p))}:{pos:[]}}},   // (ids e nó final entram como transações anexadas: só acompanham)
      props:{
        decorations(s){const p=K.getState(s).pos;return p.length?DecorationSet.create(s.doc,p.map(x=>Decoration.node(x,x+s.doc.nodeAt(x).nodeSize,{class:'nt-bsel'}))):null},
        handleKeyDown(v,e){
          const p=K.getState(v.state).pos;if(!p.length)return false;
          if(e.key==='Escape'){limpa(v);return true}
          if(e.key==='Delete'||e.key==='Backspace'){ntBselApaga(v,p);return true}
          if(e.key==='Tab'){ntBselTab(c.ed,p,e.shiftKey);return true}
          if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key.length===1)limpa(v);   // digitar volta ao texto normal
          return false;
        },
        handleDOMEvents:{
          copy(v,e){const p=K.getState(v.state).pos;if(!p.length)return false;ntBselCopia(v,p,e);return true},
          cut(v,e){const p=K.getState(v.state).pos;if(!p.length)return false;ntBselCopia(v,p,e);ntBselApaga(v,p);return true},
          mousedown(v,e){
            limpa(v);
            // 1.43 (bug): com um bloco que contém texto (toggle, destaque, citação) selecionado como NÓ, o ProseMirror trata qualquer clique dentro dele como
            // "arrastar o nó selecionado": não dava para selecionar nem arrastar o texto de uma linha de dentro (arrastava o toggle inteiro). Clicar dentro
            // volta a seleção para texto; o bloco inteiro continua arrastável pela alça ⋮⋮.
            const s=v.state.selection;
            if(e.button===0&&s.node&&!s.node.isAtom&&!e.target.closest?.('.nt-seta,.nt-alca')){
              const r=v.posAtCoords({left:e.clientX,top:e.clientY});
              if(r)try{v.dispatch(v.state.tr.setSelection(TT.pm.state.Selection.near(v.state.doc.resolve(r.pos))))}catch(x){}
            }
            return false;
          },
        },
        handleDrop(v,e,_s,moved){
          if(!c.grupoArrasto||!moved)return false;
          const g=c.grupoArrasto;c.grupoArrasto=null;ntBselSolta(v,e,g);return true;
        },
      }})];
  }});
}
// 1.57: os nós do grupo prontos para copiar/mover: item de lista (que só existe dentro de uma lista) vai embrulhado na lista do pai; itens seguidos da mesma lista, na mesma.
function ntBselNos(doc,rs){
  const out=[];let ult=null;
  for(const r of rs){
    if(!ntEhItem(r.node)){out.push(r.node);ult=null;continue}
    const $=doc.resolve(r.from),lista=$.parent,ini=$.before();
    if(ult&&ult.ini===ini){ult.itens.push(r.node);continue}
    ult={ini,lista,itens:[r.node]};out.push(ult);
  }
  return out.map(x=>x.itens?x.lista.type.create('id' in x.lista.attrs?{...x.lista.attrs,id:null}:x.lista.attrs,x.itens):x);
}
function ntBselCopia(v,pos,e){
  const {Slice,Fragment}=TT.pm.model,nodes=ntBselNos(v.state.doc,ntBselIntervalos(v.state.doc,pos));
  const {dom,text}=v.serializeForClipboard(new Slice(Fragment.from(nodes),0,0));
  e.clipboardData.setData('text/html',dom.innerHTML);e.clipboardData.setData('text/plain',text);e.preventDefault();
}
// Tira o nó de `p`; se o pai ficaria vazio: lista some junto (e a vez do pai dela), toggle/destaque/topo ficam com um parágrafo vazio.
function ntBselRemove(tr,p){
  const doc=tr.doc,n=doc.nodeAt(p),$=doc.resolve(p),pai=$.parent;
  if(pai.childCount>1||pai.type.name==='listItem'||pai.type.name==='taskItem')return void tr.delete(p,p+n.nodeSize);
  if(NT_LISTAS.includes(pai.type.name))return ntBselRemove(tr,$.before());
  tr.replaceWith(p,p+n.nodeSize,doc.type.schema.nodes.paragraph.create());
}
// Apaga o grupo (qualquer nível, de trás para frente para as posições não se mexerem) numa transação só.
function ntBselApaga(v,pos){
  const {state}=v,rs=ntBselIntervalos(state.doc,pos),tr=state.tr;
  for(const r of rs.slice().reverse())ntBselRemove(tr,r.from);
  try{tr.setSelection(TT.pm.state.Selection.near(tr.doc.resolve(Math.min(rs[0].from,tr.doc.content.size)),-1))}catch(e){}
  v.dispatch(ntBselMeta(tr,[]).scrollIntoView());
}
const ntBselPosicoes=(ini,nodes)=>{let p=ini;return nodes.map(n=>{const x=p;p+=n.nodeSize;return x})};
// Tab: o grupo entra no toggle logo acima (vira os últimos filhos dele); sem toggle em cima ganha recuo (1.57, `indent`: no máximo 1 nível abaixo do bloco anterior).
// Shift+Tab: tira o recuo; sem recuo, sai do toggle em que está (vira irmão logo depois dele). Grupo que não é um trecho seguido de blocos do mesmo pai
// (níveis misturados, itens de lista) vai bloco a bloco, com a mesma regra do cursor (`ntAninha`).
function ntBselTab(ed,pos,sai){
  const v=ed.view,{state}=v,doc=state.doc,rs=ntBselIntervalos(doc,pos),$=doc.resolve(rs[0].from),pai=$.parent,idx=$.index();
  const partes=[];   // trechos seguidos de irmãos
  for(const r of rs){const pp=doc.resolve(r.from).parent,u=partes[partes.length-1];if(u&&u.pai===pp&&u.rs[u.rs.length-1].to===r.from)u.rs.push(r);else partes.push({pai:pp,rs:[r]})}
  if(rs.some(r=>ntEhItem(r.node)))return ntBselPorBloco(ed,rs,sai);
  if(partes.length>1){   // níveis misturados: o recuo vale em cada trecho, e a seleção continua
    const ok=sai?rs.some(r=>(r.node.attrs.indent||0)>0):partes.every(u=>{const i=doc.resolve(u.rs[0].from).index(),a=i?u.pai.child(i-1):null;return a&&a.type.name!=='details'&&!NT_LISTAS.includes(a.type.name)});
    if(!ok)return ntBselPorBloco(ed,rs,sai);
    for(const u of partes.slice().reverse())ntBselRecuo(v,u.rs,sai?-1:1,pos);
    return;
  }
  const tr=state.tr,ini=rs[0].from,fim=rs[rs.length-1].to,nodes=rs.map(r=>r.node);let novo,abre=null;
  if(!sai){
    const ant=idx>0?pai.child(idx-1):null;if(!ant)return;
    if(NT_LISTAS.includes(ant.type.name))return ntBselPorBloco(ed,rs,sai);
    if(ant.type.name!=='details')return void ntBselRecuo(v,rs,1,pos);
    const antPos=ini-ant.nodeSize,cont=ant.lastChild,fimC=antPos+ant.nodeSize-2,vazio=cont.childCount===1&&cont.firstChild.type.name==='paragraph'&&!cont.firstChild.content.size;
    tr.delete(ini,fim);   // (depois do ponto de entrada: não o desloca)
    novo=vazio?fimC-cont.firstChild.nodeSize:fimC;
    if(vazio)tr.replaceWith(novo,fimC,nodes);else tr.insert(novo,nodes);
    ntAbertoSalva(ant.attrs.id,true);abre=antPos;
  }else{
    if(rs.some(r=>(r.node.attrs.indent||0)>0))return void ntBselRecuo(v,rs,-1,pos);
    if(pai.type.name!=='detailsContent')return;
    const d1=$.depth-1,detPos=$.before(d1),destino=detPos+$.node(d1).nodeSize,todos=rs.length===pai.childCount;
    tr.insert(destino,nodes);
    if(todos)tr.replaceWith(ini,fim,state.schema.nodes.paragraph.create());else tr.delete(ini,fim);
    novo=destino-(fim-ini)+(todos?2:0);
  }
  try{tr.setSelection(TT.pm.state.Selection.near(tr.doc.resolve(novo+1)))}catch(e){}
  v.dispatch(ntBselMeta(tr,ntBselPosicoes(novo,nodes)).scrollIntoView());
  if(abre!=null){const dom=v.nodeDOM(abre);if(dom instanceof Element)ntPoeAberto(dom,true)}
}
// 1.57: soma `d` (+1/-1) ao recuo dos blocos seguidos `rs` (de um mesmo pai) e dos blocos mais recuados que vêm logo depois deles (os "filhos"); depois
// nenhum bloco fica mais de 1 nível abaixo do anterior (o 1º do pai fica sem recuo). `manter`: posições da seleção que continuam. false = nada mudou.
function ntBselRecuo(v,rs,d,manter){
  const {state}=v,doc=state.doc,$=doc.resolve(rs[0].from),pai=$.parent,i0=$.index(),ini=$.start();
  if(!NT_PAIS.has(pai.type.name))return false;
  const niv=[];pai.forEach(n=>niv.push(n.attrs.indent||0));
  if(d>0&&(!i0||niv[i0]>niv[i0-1]))return false;
  let i1=i0+rs.length-1;const base=niv[i1];while(i1+1<niv.length&&niv[i1+1]>base)i1++;
  const novo=niv.map((x,i)=>i>=i0&&i<=i1?Math.max(0,x+d):x);
  novo[0]=0;for(let i=1;i<novo.length;i++)novo[i]=Math.min(novo[i],novo[i-1]+1);
  const tr=state.tr;let mudou=false;
  pai.forEach((n,off,i)=>{if(novo[i]!==niv[i]){tr.setNodeMarkup(ini+off,undefined,{...n.attrs,indent:novo[i]||null});mudou=true}});
  if(!mudou)return false;
  if(manter)tr.setMeta(NT_BSEL_PK(),{pos:manter});
  v.dispatch(tr.scrollIntoView());return true;
}
function ntBselPorBloco(ed,rs,sai){
  let ps=rs.map(r=>r.from);NT_BSEL_OBS=tr=>{ps=ps.map(p=>tr.mapping.map(p))};
  try{for(let i=0;i<ps.length;i++){const doc=ed.state.doc;if(!doc.nodeAt(ps[i]))continue;const b=ntBlocoPos(doc,ps[i]);if(b&&b.pos===ps[i])ntAninha(ed,b,sai)}}
  finally{NT_BSEL_OBS=null}
}
// Soltar o grupo arrastado pela alça: vai para a fronteira entre blocos do nível onde caiu (topo ou conteúdo de toggle).
function ntBselSolta(v,e,pos){
  const r=v.posAtCoords({left:e.clientX,top:e.clientY});if(!r)return;
  const {state}=v,doc=state.doc,rs=ntBselIntervalos(doc,pos),$=doc.resolve(r.pos);
  let d=$.depth;while(d>0&&$.node(d).type.name!=='detailsContent')d--;
  const cont=$.node(d),inicio=d?$.start(d):0;let dest=inicio+cont.content.size,achou=false;
  cont.forEach((n,off)=>{
    if(achou)return;const dom=v.nodeDOM(inicio+off);if(!(dom instanceof Element))return;
    const b=dom.getBoundingClientRect();if(e.clientY<b.top+b.height/2){dest=inicio+off;achou=true}
  });
  const ini=rs[0].from,fim=rs[rs.length-1].to;if(dest>=ini&&dest<=fim)return;   // soltou em cima de si mesmo
  for(const x of rs)if(dest>x.from&&dest<x.to)return;
  const nodes=ntBselNos(doc,rs),$d=doc.resolve(dest),{Fragment}=TT.pm.model;
  if(!$d.parent.canReplace($d.index(),$d.index(),Fragment.from(nodes)))return;
  const tr=state.tr;
  for(const x of rs.slice().reverse())ntBselRemove(tr,x.from);
  const at=tr.mapping.map(dest);tr.insert(at,nodes);
  try{tr.setSelection(TT.pm.state.Selection.near(tr.doc.resolve(at+1)))}catch(x){}
  v.dispatch(ntBselMeta(tr,ntBselPosicoes(at,nodes)).scrollIntoView());
}
// Retângulo de arrasto. mousedown em margem/fundo (fora de qualquer bloco de texto) começa; as células que ele cruza (ntRubberPos, qualquer nível) ficam selecionadas.
let ntUltPonteiro='mouse',NTR=null;
document.addEventListener('pointerdown',e=>{ntUltPonteiro=e.pointerType},true);
const NT_TEXTO_SEL='p,h1,h2,h3,li,summary,blockquote,hr,img,a,button,input,select,textarea,label,[data-type="detailsSummary"],.nt-plink,.nt-callout-c,.nt-lemb,.nt-alca,.nt-menu-bloco,.nt-barra,.nt-slash,.nt-pop,.nt-busca,.nt-bolha,.nt-modal,.nt-topo,.nt-lat,.nt-pan-topo,.nt-pan-titulo,.nt-atalhos,.nt-seta';
function ntBselCtx(t){
  if(!(t instanceof Element))return null;
  if(NP?.ed)return t.closest('#nt_pan')?NP:null;
  if(tela==='notas'&&NT.ed&&NT.el?.isConnected&&t.closest('main'))return NT;
  return null;
}
document.addEventListener('mousedown',e=>{
  if(e.button!==0||ntUltPonteiro!=='mouse'||NTR)return;
  const t=e.target,c=ntBselCtx(t);if(!c||t.closest(NT_TEXTO_SEL))return;
  const pm=c.el.querySelector('.ProseMirror');if(!pm||t.closest('.nt-ed')&&!pm.contains(t)&&t!==pm&&t.closest('.nt-ed')!==c.el)return;
  e.preventDefault();
  const sc=()=>c===NP?c.el.closest('.nt-pan-corpo'):null,off=()=>({x:sc()?sc().scrollLeft:scrollX,y:sc()?sc().scrollTop:scrollY});
  NTR={c,x0:e.clientX+off().x,y0:e.clientY+off().y,x:e.clientX,y:e.clientY,ativo:false,box:null,raf:0,pos:null,off,sc};
},true);
document.addEventListener('mousemove',e=>{
  const r=NTR;if(!r)return;r.x=e.clientX;r.y=e.clientY;
  if(!r.ativo){const o=r.off();if(Math.hypot(e.clientX-(r.x0-o.x),e.clientY-(r.y0-o.y))<4)return;
    r.ativo=true;r.box=document.createElement('div');r.box.className='nt-rubber';document.body.appendChild(r.box);try{getSelection().removeAllRanges()}catch(x){}}
  e.preventDefault();ntRubberQuadro();
},true);
// Células que o retângulo cruza, em qualquer nível, na ordem do documento (1.57): parágrafo, título, imagem, tabela etc. valem por si; toggle e item
// de lista só entram inteiros (com o que têm dentro) quando o retângulo passa pela linha própria (título / texto do item); senão, cada filho que o
// retângulo cruza entra por si, no nível dele. Toggle fechado não tem filhos visíveis. Nunca entram pai e filho juntos.
function ntRubberPos(v,node,ini,q){
  const out=[],cruza=dom=>{if(!(dom instanceof Element))return false;const b=dom.getBoundingClientRect();return b.width+b.height>0&&b.bottom>=q.T&&b.top<=q.B&&b.right>=q.L&&b.left<=q.R};
  const anda=(no,i0,desde)=>no.forEach((n,off,idx)=>{
    if(idx<desde)return;const p=i0+off,nome=n.type.name;
    if(NT_LISTAS.includes(nome))return anda(n,p+1,0);
    if(nome==='details'){
      if(n.childCount!==2)return;
      if(cruza(v.nodeDOM(p+1)))return void out.push(p);
      const dom=v.nodeDOM(p);if(dom instanceof Element&&dom.classList.contains('is-open'))anda(n.lastChild,p+1+n.firstChild.nodeSize+1,0);
      return;
    }
    if(ntEhItem(n)){
      if(cruza(v.nodeDOM(p+1)))return void out.push(p);
      return anda(n,p+1,1);
    }
    if(cruza(v.nodeDOM(p)))out.push(p);
  });
  anda(node,ini,0);return out;
}
function ntRubberQuadro(){
  const r=NTR;if(!r||r.raf)return;
  r.raf=requestAnimationFrame(()=>{
    r.raf=0;if(NTR!==r||!r.box)return;
    const s=r.sc(),o=r.off();
    if(r.y<50)(s||window).scrollBy(0,-14);else if(r.y>innerHeight-50)(s||window).scrollBy(0,14);   // rolagem automática perto das bordas
    const o2=r.off(),x0=r.x0-o2.x,y0=r.y0-o2.y,L=Math.min(x0,r.x),T=Math.min(y0,r.y),R=Math.max(x0,r.x),B=Math.max(y0,r.y);
    Object.assign(r.box.style,{left:L+'px',top:T+'px',width:(R-L)+'px',height:(B-T)+'px'});
    const v=r.c.ed.view,pos=ntRubberPos(v,v.state.doc,0,{L,T,R,B});
    if(JSON.stringify(pos)!==JSON.stringify(r.pos)){r.pos=pos;v.dispatch(ntBselMeta(v.state.tr,pos))}
    if(r.y<50||r.y>innerHeight-50)ntRubberQuadro();
  });
}
document.addEventListener('mouseup',()=>{
  const r=NTR;if(!r)return;NTR=null;cancelAnimationFrame(r.raf);r.box?.remove();
  if(r.c.ed){if(!r.ativo)r.c.ed.view.dispatch(ntBselMeta(r.c.ed.view.state.tr,[]));r.c.ed.view.focus()}   // foco no editor: Delete, Ctrl+C e Tab chegam ao plugin
},true);
// Alça ⋮⋮ de um bloco do grupo arrasta o grupo inteiro (chamado pelo dragstart da alça).
function ntBselArrasta(c,e,bloco){
  const p=ntBselPos(c.ed.state);if(!p.length||!bloco||!p.includes(bloco.pos))return false;
  const {Slice,Fragment}=TT.pm.model,v=c.ed.view,nodes=ntBselNos(v.state.doc,ntBselIntervalos(v.state.doc,p));
  c.grupoArrasto=p.slice();v.dragging={slice:new Slice(Fragment.from(nodes),0,0),move:true};
  const dom=v.nodeDOM(p[0]);if(dom instanceof Element)e.dataTransfer.setDragImage(dom,0,0);
  e.dataTransfer.effectAllowed='copyMove';e.dataTransfer.setData('text/plain','');return true;
}

// ===== @lembrete: "@" abre sugestões; o nó inline dataLembrete {iso,hora,tarefaId} é um chip e vira uma tarefa do plano (mesmo id do nó) =====
const NT_DIAS_SEM=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
const ntLembRot=a=>{
  const h=typeof smHoje==='function'?smHoje():'',am=h?smMais(h,1):'';
  const d=!a.iso?'':a.iso===h?'Hoje':a.iso===am?'Amanhã':a.iso.slice(8,10)+'/'+a.iso.slice(5,7);
  return '🔔 '+d+(a.hora?' '+a.hora:'');
};
// Itens do menu para o que foi digitado depois do "@": [rótulo, subtítulo, iso, hora]. Puro (hoje = AAAA-MM-DD).
function ntLembreteItens(query,hoje){
  let q=ntSemAcento(query).trim(),hora=null;
  const mh=/(?:^|\s)(\d{1,2})(?::(\d{2})|h(\d{2})?)\s*$/.exec(q);
  if(mh){const h=+mh[1],m=+(mh[2]||mh[3]||0);if(h<24&&m<60){hora=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');q=q.slice(0,mh.index).trim()}}
  const com=(rot,sub,iso)=>[rot+(hora?' '+hora:''),sub,iso,hora];
  const md=/^(\d{1,2})\/(\d{1,2})$/.exec(q);
  if(md){
    const dia=+md[1],mes=+md[2];let ano=+hoje.slice(0,4);
    const iso=a=>String(a).padStart(4,'0')+'-'+String(mes).padStart(2,'0')+'-'+String(dia).padStart(2,'0');
    const valido=a=>{const x=new Date(a,mes-1,dia);return x.getMonth()===mes-1&&x.getDate()===dia};
    if(mes>=1&&mes<=12&&dia>=1&&valido(ano)){if(iso(ano)<hoje&&valido(ano+1))ano++;return [com(String(dia).padStart(2,'0')+'/'+String(mes).padStart(2,'0'),'Data',iso(ano))]}
    return [];
  }
  const out=[];
  if(!q||'hoje'.startsWith(q))out.push(com('Hoje','Hoje',hoje));
  if(!q||'amanha'.startsWith(q))out.push(com('Amanhã','Amanhã',smMais(hoje,1)));
  for(let i=1;i<=7;i++){
    const iso=smMais(hoje,i),nome=NT_DIAS_SEM[smDt(iso).getDay()],n=ntSemAcento(nome);
    if(!q||n.startsWith(q)||(q.length>1&&n.includes(q)))out.push(com(nome[0].toUpperCase()+nome.slice(1),iso.slice(8,10)+'/'+iso.slice(5,7),iso));
  }
  return out;
}
function ntLembrete(){
  const atr=(k,def=null)=>({default:def,parseHTML:el=>el.getAttribute('data-'+k),renderHTML:a=>a[k]?{['data-'+k]:a[k]}:{}});
  return TT.Node.create({name:'dataLembrete',group:'inline',inline:true,atom:true,selectable:true,
    addAttributes(){return {iso:atr('iso'),hora:atr('hora'),tarefaId:atr('tarefaId')}},
    parseHTML(){return [{tag:'span[data-type="data-lembrete"]'}]},
    renderHTML({node,HTMLAttributes}){return ['span',TT.mergeAttributes(HTMLAttributes,{'data-type':'data-lembrete',class:'nt-lemb',role:'button',title:'Mudar a data do lembrete'}),ntLembRot(node.attrs)]},
  });
}
// Chips {tarefaId:'iso|hora'} de uma lista de blocos (JSON do ProseMirror).
function ntLembDe(blocos){
  const m={},v=n=>{if(!n||typeof n!=='object')return;if(n.type==='dataLembrete'&&n.attrs?.tarefaId)m[n.attrs.tarefaId]=(n.attrs.iso||'')+'|'+(n.attrs.hora||'');(n.content||[]).forEach(v)};
  (blocos||[]).forEach(b=>v(b.conteudo));return m;
}
// Ao salvar o documento: chip cuja data/hora mudou desde a versão anterior (inclusive por Ctrl+Z/Ctrl+Y) leva a tarefa junto. Só tarefa que ainda existe; chip sem mudança não mexe (outro aparelho pode ter mudado a tarefa).
function ntLembSincroniza(antes,depois){
  if(!SM.d)return;const a=ntLembDe(antes),d=ntLembDe(depois);
  for(const [id,v] of Object.entries(d)){
    if(a[id]===undefined||a[id]===v)continue;
    const [iso,hora]=v.split('|'),t=SM.d.tarefas.find(x=>x.id===id);
    if(t&&((t.dia!==iso)||((t.hora||'')!==hora)))ntLembTarefa({tarefaId:id,iso,hora:hora||null},'');
  }
}
// Cria ou atualiza a tarefa do lembrete (idempotente: smMudar reaplica no 409). Apagar o chip nunca chama isto.
function ntLembTarefa(a,texto){
  smMudar(d=>{
    let t=d.tarefas.find(x=>x.id===a.tarefaId);
    if(!t){t={id:a.tarefaId,dia:a.iso,texto:texto||'Lembrete',area:'tarefas',feito:false,ordem:100+d.tarefas.filter(x=>x.dia===a.iso).length};d.tarefas.push(t)}
    t.dia=a.iso;
    if(a.hora){t.hora=a.hora;t.lembrete=0}   // mesmo campo "Lembrete: na hora" da aba Tarefas (o app Android lê daí)
    else{delete t.hora;if(t.lembrete===0)t.lembrete=null}
  },'lembrete da nota');
}
function ntLembretePlugin(c){
  return ntSugestao(c,{nome:'lembreteNotas',char:'@',allowSpaces:true,semVazio:true,
    itens:q=>ntLembreteItens(q,smHoje()),
    comando:(editor,range,it)=>{
      const a={iso:it[2],hora:it[3],tarefaId:smId()};
      editor.chain().focus().deleteRange(range).insertContent([{type:'dataLembrete',attrs:a},{type:'text',text:' '}]).run();
      ntLembTarefa(a,editor.state.selection.$from.parent.textContent.trim());   // texto = a linha da nota (sem o chip)
    }});
}
function ntLembreteEdita(c,dom,pos){
  const no=c.ed.state.doc.nodeAt(pos);if(no?.type.name!=='dataLembrete')return;
  document.querySelector('.nt-lemb-pop')?.remove();
  const pop=document.createElement('div');pop.className='nt-pop nt-lemb-pop';
  pop.innerHTML=`<input type="date" aria-label="Data do lembrete" value="${esc(no.attrs.iso||'')}"><input type="time" aria-label="Hora (opcional)" value="${esc(no.attrs.hora||'')}"><button type="button" data-l="ok">OK</button><button type="button" data-l="x" aria-label="Cancelar">✕</button>`;
  document.body.appendChild(pop);const r=dom.getBoundingClientRect();
  pop.style.top=Math.min(r.bottom+6,innerHeight-pop.offsetHeight-8)+'px';pop.style.left=Math.max(8,Math.min(r.left,innerWidth-pop.offsetWidth-8))+'px';
  const fecha=()=>pop.remove(),[di,hi]=pop.querySelectorAll('input');
  pop.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();fecha();c.ed.commands.focus()}if(e.key==='Enter')pop.querySelector('[data-l="ok"]').click()});
  pop.addEventListener('click',e=>{
    const b=e.target.closest('[data-l]');if(!b)return;
    if(b.dataset.l==='ok'&&/^\d{4}-\d{2}-\d{2}$/.test(di.value)){
      const a={...no.attrs,iso:di.value,hora:hi.value||null};
      c.ed.view.dispatch(c.ed.state.tr.setNodeMarkup(pos,undefined,a));
      ntLembTarefa(a,c.ed.state.doc.resolve(pos).parent.textContent.trim());
    }
    fecha();c.ed.commands.focus();
  });
  di.focus();
}
document.addEventListener('pointerdown',e=>{if(!e.target.closest?.('.nt-lemb-pop,.nt-lemb'))document.querySelector('.nt-lemb-pop')?.remove()});

// ===== Versões (1.49.1, estilo Notion): lista por dia à direita, gravações seguidas do mesmo aparelho juntas (~10 min),
// página renderizada com o que muda em relação à atual (verde = volta ao restaurar; vermelho riscado = sai). Restaurar = gravação nova.
// Depois dos commits do arquivo da página, "Versões mais antigas" lê o histórico anterior à 1.48 (semana/plano.json), sob demanda.
const ntHistTexto=b=>ntNotionTexto(b?.conteudo||b).replace(/\s+/g,' ').trim();
function ntHistResumo(novo,antigo){
  if(!antigo)return 'versão inicial';
  const A=new Map((antigo.doc?.blocos||[]).map(b=>[b.id,b])),N=new Map((novo.doc?.blocos||[]).map(b=>[b.id,b]));
  const mais=[...N.keys()].filter(k=>!A.has(k)).length,menos=[...A.keys()].filter(k=>!N.has(k)).length,
    edit=[...N.values()].filter(b=>A.has(b.id)&&JSON.stringify(A.get(b.id).conteudo)!==JSON.stringify(b.conteudo)),r=[];
  if(mais)r.push('+'+mais+(mais>1?' blocos':' bloco'));if(menos)r.push('−'+menos+(menos>1?' blocos':' bloco'));
  if(edit.length===1)r.push('editou “'+(ntHistTexto(edit[0]).slice(0,28)||'bloco')+'”');else if(edit.length)r.push('editou '+edit.length+' blocos');
  if(!r.length&&(novo.titulo||'')!==(antigo.titulo||''))r.push('título: “'+(novo.titulo||'Sem título').slice(0,28)+'”');
  return r.join(' · ')||'sem mudança no texto';
}
// Ordem da versão; blocos que só existem na atual entram riscados logo após o vizinho anterior.
function ntHistComparar(versao,atual){
  const V=versao||[],C=atual||[],cv=new Map(C.map(b=>[b.id,b])),vv=new Set(V.map(b=>b.id));
  const out=V.map(b=>({b,tipo:!cv.has(b.id)?'adicionado':JSON.stringify(cv.get(b.id).conteudo)===JSON.stringify(b.conteudo)?'igual':'alterado',atual:cv.get(b.id)}));
  let ant=null;
  for(const b of C){
    if(vv.has(b.id)){ant=b.id;continue}
    let k=ant===null?0:out.findIndex(x=>x.b.id===ant&&x.tipo!=='removido')+1;while(out[k]?.tipo==='removido')k++;
    out.splice(k,0,{b,tipo:'removido'});
  }
  return out;
}
const ntHistDia=d=>{const h=new Date(),o=new Date(h);o.setDate(h.getDate()-1);const ig=(a,b)=>a.toDateString()===b.toDateString();
  return ig(d,h)?'Hoje':ig(d,o)?'Ontem':d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',...(d.getFullYear()!==h.getFullYear()?{year:'numeric'}:{})})};
const ntHistHora=d=>d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
function ntHistAbre(c=NT){
  const id=c.pagina||'notas';
  const ov=ntModal('nt-hist',`<div class="nt-modal-t"><b>Versões</b><button type="button" class="nt-x" aria-label="Fechar">✕</button></div><div class="nt-hist-g"><div class="nt-hist-ver"><div class="nt-hist-bar"><b class="nt-hist-tit">Escolha uma versão</b><span class="nt-hist-leg"><span class="adicionado">volta</span> <span class="removido">sai</span></span><button type="button" class="b" data-restaurar disabled>Restaurar esta versão</button></div><p class="nt-hist-msg" role="status"></p><div class="nt-hist-prev"></div></div><div class="nt-hist-l" aria-label="Lista de versões"><div class="nt-hist-lista"></div><button type="button" class="b s" data-mais>Versões mais antigas</button></div></div>`);
  const lista=ov.querySelector('.nt-hist-lista'),msg=ov.querySelector('.nt-hist-msg'),prev=ov.querySelector('.nt-hist-prev'),rest=ov.querySelector('[data-restaurar]'),mais=ov.querySelector('[data-mais]'),tit=ov.querySelector('.nt-hist-tit');
  const schema=ntSchema(),ser=schema&&TT.pm.model.DOMSerializer.fromSchema(schema);
  let fonte='pagina',pag=0,fim=false,ocupado=false,escolhida=null,visita=0;const itens=[];   // {sha,data,plano,p}
  ov.querySelector('.nt-x').onclick=()=>ntModalFecha(ov);
  const atual=()=>NT.pagina===id&&NT.ed?ntBlocos(NT.ed.getJSON(),NT.shown||[]):(pgAchar(id)?.doc?.blocos||[]);
  const render=b=>{const el=document.createElement('div');el.className='nt-ed nt-hist-bloco-c';
    try{el.appendChild(ser.serializeNode(schema.nodeFromJSON(b.conteudo)))}catch(e){el.textContent=ntHistTexto(b)}return el};
  const copiar=async(el,t)=>{
    try{if(window.ClipboardItem&&navigator.clipboard?.write)await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([el.innerHTML],{type:'text/html'}),'text/plain':new Blob([t],{type:'text/plain'})})]);else await navigator.clipboard.writeText(t);msg.textContent='Bloco copiado. Cole na página com Ctrl+V.'}
    catch(e){msg.textContent='Não consegui copiar; selecione o texto e use Ctrl+C.'}
  };
  const mostra=it=>{
    ++visita;escolhida=it;lista.querySelectorAll('.on').forEach(x=>x.classList.remove('on'));it.el?.classList.add('on');
    tit.textContent=it.rotulo||'';prev.replaceChildren();
    const comp=ntHistComparar(it.p.doc?.blocos,atual()),muda=comp.filter(x=>x.tipo!=='igual').length;
    const h=document.createElement('h2');h.className='nt-hist-ptit';h.textContent=it.p.titulo||'Sem título';prev.appendChild(h);
    for(const x of comp){
      const sec=document.createElement('section');sec.className='nt-hist-bloco '+x.tipo;
      if(x.tipo==='alterado'){const r=render(x.atual);r.classList.add('antes');sec.appendChild(r)}
      const el=render(x.b);sec.appendChild(el);
      if(x.tipo!=='removido'&&ntHistTexto(x.b)){const bt=document.createElement('button');bt.type='button';bt.className='b s nt-hist-copia';bt.textContent='Copiar bloco';bt.onclick=()=>copiar(el,el.innerText||ntHistTexto(x.b));sec.appendChild(bt)}
      prev.appendChild(sec);
    }
    msg.textContent=muda?muda+(muda>1?' blocos diferentes':' bloco diferente')+' da versão atual.':'Igual à versão atual.';
    rest.disabled=false;
  };
  const pinta=()=>{   // grupo = mesmo aparelho e mesma fonte, intervalo ≤10 min entre gravações seguidas
    const grupos=[];
    for(const it of itens){const g=grupos.at(-1),u=g?.at(-1);
      if(g&&u.plano===it.plano&&(u.p.aparelhoId||'')===(it.p.aparelhoId||'')&&u.data-it.data<=600000)g.push(it);else grupos.push([it])}
    lista.replaceChildren();let dia='';
    grupos.forEach((g,k)=>{
      const top=g[0],d=ntHistDia(top.data),ant=grupos[k+1]?.[0];
      if(d!==dia){dia=d;const h=document.createElement('div');h.className='nt-hist-dia';h.textContent=d;lista.appendChild(h)}
      top.rotulo=d+' · '+ntHistHora(top.data);
      const resumo=ant?ntHistResumo(top.p,ant.p):fim?'versão inicial':(g.length>1?ntHistResumo(top.p,g.at(-1).p):'');
      const bt=document.createElement('button');bt.type='button';bt.className='nt-hist-it'+(escolhida===top?' on':'');
      bt.innerHTML=`<b>${ntHistHora(top.data)}${g.length>1?` <small>(${g.length} gravações)</small>`:''}</b><small>${esc(resumo)}${top.plano?' · antes da 1.48':''}</small>`;
      bt.onclick=()=>mostra(top);top.el=bt;lista.appendChild(bt);
    });
    mais.hidden=fim;if(!itens.length&&fim)msg.textContent='Nenhuma versão gravada.';
  };
  const carregar=async()=>{
    if(ocupado||fim||!ov.isConnected)return;ocupado=true;mais.disabled=true;msg.textContent='Carregando versões…';let denovo=false;
    try{
      const plano=fonte==='plano',l=await SyncNotas.versoes(id,{pagina:pag+1,plano,porPagina:plano?10:30});pag++;
      if(!plano&&l.length<30){fonte='plano';pag=0;denovo=!l.length}else if(plano&&l.length<10)fim=true;
      const fila=[...l];
      await Promise.all(Array.from({length:4},async()=>{for(let cm;(cm=fila.shift());){
        try{const p=await SyncNotas.versoes(id,{ref:cm.sha,plano});if(p?.doc)itens.push({sha:cm.sha,plano,data:new Date(cm.commit?.author?.date||cm.commit?.committer?.date||0),p})}catch(e){}
      }}));
      itens.sort((a,b)=>(a.plano-b.plano)||(b.data-a.data));
      // o plano mudava a cada tarefa: só fica a versão em que o documento da página mudou
      for(let k=itens.length-1;k>0;k--)if(itens[k].plano&&itens[k-1].plano&&JSON.stringify(itens[k].p.doc)===JSON.stringify(itens[k-1].p.doc))itens.splice(k-1,1);
      msg.textContent='';pinta();
    }catch(e){msg.textContent=e.message}finally{ocupado=false;mais.disabled=false}
    if(denovo)return carregar();
  };
  mais.onclick=carregar;
  ov.querySelector('.nt-hist-l').addEventListener('scroll',e=>{const l=e.currentTarget;if(l.scrollTop+l.clientHeight>=l.scrollHeight-40)carregar()});
  rest.onclick=async()=>{if(!escolhida)return;rest.disabled=true;try{ntAntes();const ok=await SyncNotas.restaurar(id,escolhida.sha,escolhida.plano);if(!ok){msg.textContent='Restauração na fila; aguardando conexão.';return}if(NT.pagina===id)await ntSincroniza();ntModalFecha(ov)}catch(e){msg.textContent=e.message}finally{rest.disabled=false}};
  carregar().then(()=>{if(itens[0]&&ov.isConnected&&!escolhida)mostra(itens[0])});return ov;
}
const ntFrases=()=>Array.isArray(SM.d?.notasFrases)?SM.d.notasFrases:[];
function frGrava(l){
  if(!SM.d)return false;smMudar(d=>{d.notasFrases=l},'frases');return true;
}
const frMuda=fn=>{if(!SM.d)return false;const l=JSON.parse(JSON.stringify(ntFrases()));fn(l);return frGrava(l)};
function frSalva(titulo,texto){
  const t=String(texto||'').trim();if(!t){toast('Selecione o texto da frase.');return false}
  const id=ntNovoId().replace(/^b/,'f');
  return frMuda(l=>l.push({id,titulo:String(titulo||'').trim()||t.slice(0,40),texto:t,atualizado:ntAgora()}));
}
// Texto da frase no cursor: uma linha entra como texto; várias viram parágrafos.
function frInsere(c,f){
  const linhas=String(f.texto).split('\n');
  c.ed.chain().focus().insertContent(linhas.length===1?{type:'text',text:linhas[0]}:linhas.map(l=>({type:'paragraph',...(l?{content:[{type:'text',text:l}]}:{})}))).run();
}
function ntFrasesEscolhe(c){
  const ov=ntModal('nt-frases',`<div class="nt-modal-t"><b>Frases-padrão</b><button type="button" class="nt-x" aria-label="Fechar">✕</button></div><input type="text" class="nt-fr-q" placeholder="Filtrar frases" aria-label="Filtrar frases" autocomplete="off"><div class="nt-fr-l" role="listbox"></div>`);
  const q=ov.querySelector('.nt-fr-q'),l=ov.querySelector('.nt-fr-l');let sel=0,it=[];
  const pinta=()=>{
    const n=ntSemAcento(q.value);it=ntFrases().filter(f=>!n||ntSemAcento(f.titulo+' '+f.texto).includes(n));sel=Math.min(sel,Math.max(0,it.length-1));
    l.innerHTML=it.length?it.map((f,i)=>`<button type="button" role="option" class="nt-fr-it${i===sel?' sel':''}" data-i="${i}"><b>${esc(f.titulo)}</b><small>${esc(f.texto.slice(0,120))}</small></button>`).join(''):'<p class="mut">Nenhuma frase. Selecione um texto e use "Frase" na barra para salvar.</p>';
  };
  const poe=f=>{ntModalFecha(ov);frInsere(c,f)};
  q.addEventListener('input',()=>{sel=0;pinta()});
  q.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(it.length){sel=(sel+(e.key==='ArrowDown'?1:-1)+it.length)%it.length;pinta()}}
    else if(e.key==='Enter'&&it[sel]){e.preventDefault();poe(it[sel])}
  });
  l.addEventListener('click',e=>{const b=e.target.closest('[data-i]');if(b)poe(it[+b.dataset.i])});
  ov.querySelector('.nt-x').onclick=()=>ntModalFecha(ov);pinta();q.focus();
}
// Selecionou texto e clicou "Frase" na barra: pede o título e salva.
function ntFraseSalvaSel(c){
  const s=c.ed.state.selection,texto=s.empty?'':c.ed.state.doc.textBetween(s.from,s.to,'\n','\n').trim();
  if(!texto){toast('Selecione o texto que vai virar frase.');return}
  const ov=ntModal('nt-frases',`<div class="nt-modal-t"><b>Salvar como frase</b><button type="button" class="nt-x" aria-label="Fechar">✕</button></div><input type="text" class="nt-fr-q" placeholder="Título da frase" aria-label="Título da frase" maxlength="80" autocomplete="off" value="${esc(texto.slice(0,40))}"><p class="mut nt-fr-prev">${esc(texto.slice(0,300))}</p><div class="row"><button type="button" class="b" data-f="ok">Salvar</button><button type="button" class="b s" data-f="x">Cancelar</button></div>`);
  const q=ov.querySelector('input'),ok=()=>{if(frSalva(q.value,texto)){ntModalFecha(ov);toast('Frase salva. Insira com /Frase.')}};
  q.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();ok()}});
  ov.addEventListener('click',e=>{const b=e.target.closest('[data-f]');if(b)b.dataset.f==='ok'?ok():ntModalFecha(ov)});
  ov.querySelector('.nt-x').onclick=()=>ntModalFecha(ov);q.focus();q.select();
}
function ntFrasesGerencia(){
  const ov=ntModal('nt-frases',`<div class="nt-modal-t"><b>Gerenciar frases</b><button type="button" class="nt-x" aria-label="Fechar">✕</button></div><div class="nt-fr-l"></div>`),l=ov.querySelector('.nt-fr-l');
  const pinta=()=>{l.innerHTML=ntFrases().length?ntFrases().map(f=>`<div class="nt-fr-g" data-id="${esc(f.id)}"><input type="text" value="${esc(f.titulo)}" maxlength="80" aria-label="Título"><small>${esc(f.texto.slice(0,100))}</small><button type="button" class="b s" data-f="apaga" aria-label="Apagar frase ${esc(f.titulo)}">🗑</button></div>`).join(''):'<p class="mut">Nenhuma frase salva ainda.</p>'};
  l.addEventListener('change',e=>{const g=e.target.closest('.nt-fr-g');if(!g||e.target.tagName!=='INPUT')return;const t=e.target.value.trim();if(!t){pinta();return}frMuda(a=>{const f=a.find(x=>x.id===g.dataset.id);if(f){f.titulo=t;f.atualizado=ntAgora()}})});
  l.addEventListener('click',e=>{const b=e.target.closest('[data-f="apaga"]');if(!b)return;const id=b.closest('.nt-fr-g').dataset.id;frMuda(a=>{const i=a.findIndex(x=>x.id===id);if(i>=0)a.splice(i,1)});pinta()});
  ov.querySelector('.nt-x').onclick=()=>ntModalFecha(ov);pinta();
}

// ===== Importação HTML do Notion: ZIP local, documento inerte e construção explícita do JSON =====
const NT_ZIP_MAX=200*1024*1024,NT_IMG_LIM=25*1024*1024,NT_ZIP_ARQS=2000;
function ntZipCrc(b){let c=0xffffffff;for(const v of b){c^=v;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0}
function ntZipCaminho(s){
  if(/^[a-z][\w+.-]*:|^[\\/]|\0/i.test(s))throw Error('Caminho inválido no ZIP.');
  const p=[];for(const x of s.replaceAll('\\','/').split('/')){if(x==='..'){if(!p.length)throw Error('Caminho fora do ZIP.');p.pop()}else if(x&&x!=='.')p.push(x)}return p.join('/');
}
// Expansão limitada também DURANTE o deflate: tamanho declarado falso não permite uma bomba ZIP.
async function ntZipLer(bytes,estado={n:0,total:0},prefixo='',nivel=0,cancelado=()=>false){
  if(nivel>5)throw Error('ZIP com muitos níveis de arquivos compactados.');
  const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),d=new DataView(b.buffer,b.byteOffset,b.byteLength),erro=()=>Error('ZIP corrompido ou incompleto.');
  if(b.length>NT_ZIP_MAX)throw Error('O ZIP deve ter no máximo 200 MB.');
  const u16=p=>d.getUint16(p,true),u32=p=>d.getUint32(p,true);let e=-1;
  for(let p=b.length-22;p>=Math.max(0,b.length-65557);p--)if(u32(p)===0x06054b50&&p+22+u16(p+20)===b.length){e=p;break}
  if(e<0)throw erro();
  const n=u16(e+10),tam=u32(e+12),ini=u32(e+16);
  if(n===65535||tam===0xffffffff||ini===0xffffffff||(e>=20&&u32(e-20)===0x07064b50))throw Error('ZIP64 não é suportado. Exporte um ZIP menor.');
  if(u16(e+4)||u16(e+6)||u16(e+8)!==n)throw Error('ZIP dividido em volumes não é suportado.');
  if(ini+tam!==e)throw erro();
  if((estado.n+=n)>NT_ZIP_ARQS)throw Error('O ZIP deve conter no máximo 2.000 arquivos.');
  const entradas=[],nomes=new Set();let p=ini;
  for(let i=0;i<n;i++){
    if(p+46>e||u32(p)!==0x02014b50)throw erro();
    const flags=u16(p+8),metodo=u16(p+10),crc=u32(p+16),comp=u32(p+20),tamanho=u32(p+24),nl=u16(p+28),xl=u16(p+30),cl=u16(p+32),offset=u32(p+42),fim=p+46+nl+xl+cl;
    if(flags&0x2041)throw Error('ZIP cifrado não é suportado. Exporte sem senha.');
    if(![0,8].includes(metodo))throw Error('Método de compactação do ZIP não suportado (use 0 ou 8).');
    if([comp,tamanho,offset].includes(0xffffffff)||u16(p+34)===65535)throw Error('ZIP64 não é suportado.');
    if(fim>e||u16(p+34))throw erro();
    for(let x=p+46+nl;x<p+46+nl+xl;){if(x+4>p+46+nl+xl)throw erro();const tag=u16(x),len=u16(x+2);if(tag===1)throw Error('ZIP64 não é suportado.');x+=4+len;if(x>p+46+nl+xl)throw erro()}
    let nome;try{nome=new TextDecoder('utf-8',{fatal:true}).decode(b.subarray(p+46,p+46+nl))}catch(e){throw Error('Nome de arquivo do ZIP não está em UTF-8.')}
    const caminho=ntZipCaminho(nome);if(!caminho||nomes.has(caminho))throw Error('ZIP contém caminhos vazios ou repetidos.');nomes.add(caminho);
    if(tamanho>NT_IMG_LIM&&/\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(nome))throw Error('Cada imagem deve ter no máximo 25 MB.');
    if((estado.total+=tamanho)>NT_ZIP_MAX)throw Error('O conteúdo descompactado deve ter no máximo 200 MB.');
    if(offset+30>ini||u32(offset)!==0x04034b50)throw erro();
    if(u16(offset+6)!==flags||u16(offset+8)!==metodo||u16(offset+26)!==nl)throw erro();
    if(!(flags&8)&&(u32(offset+14)!==crc||u32(offset+18)!==comp||u32(offset+22)!==tamanho))throw erro();
    const inicio=offset+30+u16(offset+26)+u16(offset+28);
    if(inicio+comp>ini||!b.subarray(offset+30,offset+30+nl).every((v,j)=>v===b[p+46+j]))throw erro();
    for(let x=offset+30+nl;x<inicio;){if(x+4>inicio)throw erro();const tag=u16(x),len=u16(x+2);if(tag===1)throw Error('ZIP64 não é suportado.');x+=4+len;if(x>inicio)throw erro()}
    entradas.push({caminho:prefixo+caminho,diretorio:nome.endsWith('/'),metodo,crc,tamanho,inicio,comp});p=fim;
  }
  if(p!==e)throw erro();
  const out=new Map();
  for(const a of entradas){
    if(cancelado())throw Error('Importação cancelada.');
    let raw=b.subarray(a.inicio,a.inicio+a.comp);
    if(a.metodo===8){
      let leitor;try{leitor=new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()}catch(e){throw Error('Este navegador não suporta descompactação deflate-raw.')}
      const partes=[];let l=0;
      try{while(true){const r=await leitor.read();if(r.done)break;if(cancelado())throw Error('Importação cancelada.');l+=r.value.length;if(l>a.tamanho||l>NT_ZIP_MAX)throw erro();partes.push(r.value)}}catch(e){await leitor.cancel().catch(()=>{});throw Error(cancelado()?'Importação cancelada.':'ZIP corrompido durante a descompactação.')}
      raw=new Uint8Array(l);let off=0;for(const x of partes){raw.set(x,off);off+=x.length}
    }
    if(raw.length!==a.tamanho||ntZipCrc(raw)!==a.crc)throw erro();
    if(a.diretorio)continue;
    if(/\.zip$/i.test(a.caminho)){
      const interno=await ntZipLer(raw,estado,a.caminho.replace(/\.zip$/i,'')+'/',nivel+1,cancelado);for(const [k,v] of interno){if(out.has(k))throw erro();out.set(k,v)}
    }else{if(out.has(a.caminho))throw erro();out.set(a.caminho,raw)}
  }
  return out;
}
function ntNotionRef(base,ref){
  if(!ref||/^[a-z][\w+.-]*:|^[\\/]/i.test(ref))return '';
  try{return ntZipCaminho(base.slice(0,base.lastIndexOf('/')+1)+decodeURIComponent(ref.split(/[?#]/)[0]))}catch(e){return ''}
}
const ntNotionNome=s=>s.split('/').pop().replace(/\.html?$/i,'').replace(/[ _-]?[a-f0-9]{32}$/i,'').trim()||'Página importada';
const ntNotionId=s=>{const m=String(s||'').match(/(?:^|[^a-f0-9])([a-f0-9]{8}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{12})(?=$|[^a-f0-9])/i);return m?m[1].replaceAll('-','').toLowerCase():''};
const ntNotionHash=async raw=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(x=>x.toString(16).padStart(2,'0')).join('');
// Importações anteriores à 1.47 não têm hashes: comparar o JPEG já guardado após a mesma compressão.
async function ntNotionImagensAnteriores(id,checa){
  const fontes=new Set(),mapa=new Map(),visita=n=>{if(n?.type==='image'&&/^\.\/img\/[\w.-]+$/.test(n.attrs?.src||''))fontes.add(n.attrs.src);for(const f of n?.content||[])visita(f)};
  for(const b of pgAchar(id)?.doc?.blocos||[])visita(b.conteudo);
  for(const src of fontes){
    checa();try{
      let r;try{r=await(await caches.open('bcbr-img')).match(src)}catch(e){}
      if(!r)r=await fetch(src,{signal:AbortSignal.timeout(10000)});
      if(r.ok){const raw=await r.arrayBuffer();if(raw.byteLength<=NT_IMG_LIM)mapa.set(await ntNotionHash(raw),src)}
    }catch(e){}checa();
  }return mapa;
}
function ntNotionConverte(html,caminho,paginas=new Map()){
  // DOMParser não injeta nada na página ativa. Nenhum elemento deste documento é adotado no DOM vivo.
  const d=new DOMParser().parseFromString(html,'text/html');
  d.querySelectorAll('script,style,link,meta,base').forEach(e=>e.remove());
  const titulo=(d.querySelector('title')?.textContent||d.querySelector('h1')?.textContent||ntNotionNome(caminho)).trim().replace(/[ _-][a-f0-9]{32}$/i,'').slice(0,200)||ntNotionNome(caminho);
  const imagens=[],cores={gray:'cinza',brown:'marrom',orange:'laranja',yellow:'amarelo',green:'verde',blue:'azul',purple:'roxo',pink:'rosa',red:'vermelho'};let simplificados=0;
  const marcas=(e,ant)=>{
    let ms=[...ant];const add=(type,attrs)=>{ms=ms.filter(m=>m.type!==type);ms.push({type,...(attrs?{attrs}:{})})},tag=e.tagName;
    const tipo={B:'bold',STRONG:'bold',I:'italic',EM:'italic',U:'underline',S:'strike',DEL:'strike',STRIKE:'strike'}[tag];if(tipo)add(tipo);
    let attrs={...(ms.find(m=>m.type==='textStyle')?.attrs||{})};
    if(tag==='CODE')attrs.codigo=true;
    for(const c of e.classList){const m=/^(?:highlight-|block-color-)(gray|brown|orange|yellow|green|blue|purple|pink|red)(_background)?$/.exec(c);if(m)attrs[m[2]?'backgroundColor':'color']=`var(--nt${m[2]?'b':'c'}-${cores[m[1]]})`}
    if(Object.keys(attrs).length)add('textStyle',attrs);
    if(tag==='A'){const href=e.getAttribute('href')?.trim();if(/^(https?:\/\/|mailto:)/i.test(href||'')){try{const u=new URL(href);if(['http:','https:','mailto:'].includes(u.protocol))add('link',{href:u.href,target:'_blank',rel:'noopener noreferrer nofollow'})}catch(e){}}}
    return ms;
  };
  const inline=(n,ms=[])=>{
    if(n.nodeType===3){const text=n.textContent.replace(/[\r\n\t]+/g,' ');return text?[{type:'text',text,...(ms.length?{marks:ms}:{})}]:[]}
    if(n.nodeType!==1||['SCRIPT','STYLE','IFRAME','IMG','INPUT'].includes(n.tagName))return [];
    if(n.classList.contains('equation')){simplificados++;return n.textContent?[{type:'text',text:n.textContent}]:[]}
    const m=marcas(n,ms);if(n.tagName==='BR')return [{type:'text',text:'\n',...(m.length?{marks:m}:{})}];
    return [...n.childNodes].flatMap(c=>inline(c,m));
  };
  const par=(e,ms)=>({type:'paragraph',content:inline(e,ms)}),naoVazio=a=>a.length?a:[ntPar('')];
  const blocos=(pai,ms=[])=>{
    const out=[];let linha=[];const flush=()=>{if(linha.some(n=>n.text?.trim()))out.push({type:'paragraph',content:linha});linha=[]};
    for(const e of pai.childNodes){
      if(e.nodeType===3){linha.push(...inline(e,ms));continue}if(e.nodeType!==1)continue;
      const tag=e.tagName,m=marcas(e,ms);if(['SCRIPT','STYLE','INPUT'].includes(tag))continue;
      if(['SPAN','STRONG','B','EM','I','U','S','DEL','CODE','BR','A'].includes(tag)){
        if(e.querySelector('img')){flush();out.push(...blocos(e,m));continue} // exportação real: figure > a > img
        const pg=tag==='A'&&paginas.get(ntNotionRef(caminho,e.getAttribute('href')));if(pg){flush();out.push({type:'paginaLink',attrs:{pagina:pg}})}else linha.push(...inline(e,ms));continue;
      }
      flush();
      if(tag==='H1'&&e.classList.contains('page-title'))continue;
      if(tag==='DETAILS'){
        const sum=[...e.children].find(c=>c.tagName==='SUMMARY'),content=blocos(e,m);
        out.push({type:'details',attrs:{id:ntNovoId()},content:[{type:'detailsSummary',content:sum?inline(sum,m):[]},{type:'detailsContent',content:naoVazio(content)}]});continue;
      }
      if(tag==='SUMMARY')continue;
      if(tag==='UL'&&e.classList.contains('toggle')){
        for(const li of e.children){if(li.tagName!=='LI')continue;
          if(li.children.length===1&&li.firstElementChild.tagName==='DETAILS'){out.push(...blocos(li,m));continue}
          const f=blocos(li,m),primeiro=f[0]?.type==='paragraph'?f.shift():ntPar('');
          out.push({type:'details',attrs:{id:ntNovoId()},content:[{type:'detailsSummary',content:primeiro.content||[]},{type:'detailsContent',content:naoVazio(f)}]});
        }continue;
      }
      if(tag==='UL'||tag==='OL'){
        const tarefa=e.classList.contains('to-do-list'),items=[...e.children].filter(c=>c.tagName==='LI').map(li=>{
          const cont=blocos(li,marcas(li,m));if(cont[0]?.type!=='paragraph')cont.unshift(ntPar(''));
          return {type:tarefa?'taskItem':'listItem',...(tarefa?{attrs:{checked:!!li.querySelector('input[checked],.checkbox-on')}}:{}),content:cont};
        });if(items.length)out.push({type:tarefa?'taskList':tag==='OL'?'orderedList':'bulletList',...(tag==='OL'?{attrs:{start:Math.max(1,Number(e.getAttribute('start'))||1)}}:{}),content:items});continue;
      }
      if(tag==='IMG'){
        const src=e.getAttribute('src')||'',ref=ntNotionRef(caminho,src),no=ntPar('[imagem não importada: '+(ref?.split('/').pop()||'externa')+']');
        out.push(no);if(ref)imagens.push({no,caminho:ref});else simplificados++;continue;
      }
      if(tag==='TABLE'){   // vira nó de tabela (th = cabeçalho); linhas completadas com células vazias até a largura da maior
        const linhas=[...e.querySelectorAll('tr')].filter(tr=>tr.closest('table')===e).map(tr=>[...tr.children].filter(c=>/^T[DH]$/.test(c.tagName)));
        const larg=Math.max(0,...linhas.map(l=>l.reduce((n,c)=>n+(Math.max(1,parseInt(c.getAttribute('colspan'))||1)),0)));
        if(!larg){continue}
        const cel=(c,hd)=>({type:hd?'tableHeader':'tableCell',attrs:{colspan:1,rowspan:1,colwidth:null},content:[{type:'paragraph',content:inline(c,m).map((n,i,a)=>n.text&&(i===0||i===a.length-1)?{...n,text:i===0?n.text.replace(/^\s+/,''):n.text.replace(/\s+$/,'')}:n).filter(n=>n.text!=='')}]});
        out.push({type:'table',content:linhas.filter(l=>l.length).map(l=>{
          const cs=l.flatMap(c=>{const n=Math.max(1,parseInt(c.getAttribute('colspan'))||1);return [cel(c,c.tagName==='TH'),...Array.from({length:n-1},()=>cel({childNodes:[]},c.tagName==='TH'))]});
          while(cs.length<larg)cs.push(cel({childNodes:[]},false));
          return {type:'tableRow',content:cs}})});continue}
      if(e.classList.contains('column-list')||e.classList.contains('equation')||e.classList.contains('collection-content')||e.classList.contains('source')||['IFRAME','OBJECT','EMBED'].includes(tag)){
        simplificados++;const texto=e.classList.contains('column-list')?[...e.children].map(c=>c.textContent.trim()).join('\n'):e.textContent.trim();out.push(ntPar(texto||e.getAttribute('title')||'[conteúdo incorporado simplificado]'));continue;
      }
      if(tag==='HR'){out.push({type:'horizontalRule'});continue}
      if(/^H[1-3]$/.test(tag)){out.push({type:'heading',attrs:{level:Number(tag[1])},content:inline(e,ms)});continue}
      if(tag==='P'){const a=e.children.length===1&&e.firstElementChild.tagName==='A'?e.firstElementChild:null,pg=a&&paginas.get(ntNotionRef(caminho,a.getAttribute('href')));out.push(pg?{type:'paginaLink',attrs:{pagina:pg}}:par(e,ms));continue}
      if(tag==='BLOCKQUOTE'||e.classList.contains('callout')){const content=blocos(e,m);out.push({type:tag==='BLOCKQUOTE'?'blockquote':'callout',content:naoVazio(content)});continue}
      out.push(...blocos(e,m));
    }flush();return out;
  };
  const raiz=d.querySelector('.page-body')||d.querySelector('article')||d.body;
  const notionId=ntNotionId(caminho.split('/').pop())||ntNotionId(d.querySelector('article[id],.page[id],body[id]')?.id);
  return {titulo,notionId,doc:{type:'doc',content:naoVazio(blocos(raiz))},imagens,simplificados};
}
function ntNotionEscolhe(alvo=''){
  const i=document.createElement('input');i.type='file';i.accept=alvo?'.zip':'.zip,.html,.htm';i.className='nt-notion-arquivo';i.hidden=true;i.onchange=()=>{const f=i.files[0];i.remove();if(f)ntNotionImporta(f,alvo)};i.oncancel=()=>i.remove();document.body.appendChild(i);i.click();
}
// A origem serve para reconhecer o export e reaproveitar bytes já enviados; não é uma base de sincronização.
// LCS por bloco de topo: âncoras por texto normalizado; entre âncoras, casar pela posição e pelo tipo.
function ntNotionTexto(n){return n?.text||((n?.content||[]).map(ntNotionTexto).join(' '))}
function ntNotionChave(n){
  const texto=ntNotionTexto(n).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  return n.type+'|'+(texto||n.attrs?.src||JSON.stringify(ntNotionSemIds(n)));
}
function ntNotionSemIds(n){
  if(Array.isArray(n))return n.map(ntNotionSemIds);
  if(!n||typeof n!=='object')return n;
  const o={};for(const [k,v] of Object.entries(n))if(k!=='id'&&k!=='indent')o[k]=ntNotionSemIds(v);return ntCanon(o);   // (1.57: o recuo é das Notas, não vem do Notion)
}
function ntNotionDiff(antes,depois){
  const a=antes.map(b=>ntNotionChave(b.conteudo)),b=depois.map(ntNotionChave),n=a.length,m=b.length;
  if((n+1)*(m+1)>16000000)throw Error('Página grande demais para comparar neste aparelho (limite de 16 milhões de pares de blocos).');
  const l=Array.from({length:n+1},()=>new Uint32Array(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)l[i][j]=a[i]===b[j]?1+l[i+1][j+1]:Math.max(l[i+1][j],l[i][j+1]);
  const pares=[];let i=0,j=0;
  while(i<n&&j<m){if(a[i]===b[j]){pares.push([i++,j++])}else if(l[i+1][j]>=l[i][j+1])i++;else j++}
  pares.push([n,m]);const out=[];i=0;j=0;
  const poe=(ant,dep)=>out.push({tipo:!ant?'adicionado':!dep?'removido':ntIgual(ntNotionSemIds(ant.conteudo),ntNotionSemIds(dep))?'igual':'alterado',antes:ant||null,depois:dep||null,aplicar:true});
  for(const [ai,bj] of pares){
    while(i<ai||j<bj){
      if(i<ai&&j<bj&&antes[i].conteudo.type===depois[j].type)poe(antes[i++],depois[j++]);
      else if(i<ai)poe(antes[i++],null);else poe(null,depois[j++]);
    }
    if(ai<n){poe(antes[i++],depois[j++])}
  }
  return out;
}
// Preserva IDs do bloco e dos filhos reconhecidos (inclusive toggles); IDs do export nunca entram na fila como novas identidades do mesmo bloco.
function ntNotionMantemIds(antes,depois){
  const n=JSON.parse(JSON.stringify(depois));
  if(antes?.attrs?.id)n.attrs={...n.attrs,id:antes.attrs.id};
  if(antes?.attrs?.indent&&!n.attrs?.indent)n.attrs={...n.attrs,indent:antes.attrs.indent};   // 1.57: atualizar do Notion não perde o recuo feito aqui
  const usados=new Set(),filhos=antes?.content||[];
  if(n.content)n.content=n.content.map((f,i)=>{
    let j=filhos.findIndex((a,j)=>!usados.has(j)&&ntNotionChave(a)===ntNotionChave(f));
    if(j<0&&filhos[i]?.type===f.type&&!usados.has(i))j=i;
    if(j>=0)usados.add(j);return ntNotionMantemIds(j>=0?filhos[j]:null,f);
  });
  return n;
}
function ntNotionCombina(diff,agora=ntAgora()){
  return diff.flatMap(r=>{
    if(r.tipo==='igual'||!r.aplicar)return r.antes?[r.antes]:[];
    if(!r.depois)return [];
    const conteudo=ntNotionMantemIds(r.antes?.conteudo,r.depois),id=r.antes?.id||ntNovoId();
    conteudo.attrs={...conteudo.attrs,id};return [{id,atualizado:agora,conteudo}];
  });
}
const ntSchema=()=>{if(NT.ed?.state?.schema)return NT.ed.state.schema;if(typeof TT==='undefined')return null;if(!NT._schema){const t=new TT.Editor({extensions:ntExtensoes(NT)});NT._schema=t.schema;t.destroy()}return NT._schema};
function ntNotionAplicar(id,base,diff,origem){
  if(NT.pagina===id&&NT.sujo)ntSalvaDoc();
  const p=pgAchar(id);if(!p||NT.pagina===id&&NT.sujo)throw Error('Não consegui salvar a edição atual. A atualização não foi aplicada.');
  if(!ntIgual(p.doc,base))throw Error('A página mudou durante a revisão. Cancele e compare novamente para incluir essa edição.');
  if(!diff.some(r=>r.tipo!=='igual'&&r.aplicar))return false;
  const agora=ntAgora(),blocos=ntNotionCombina(diff,agora);
  if(!blocos.length)blocos.push(...ntBlocos({content:[ntPar('')]},[],agora));
  const ctx=NT.pagina===id?NT:null,schema=(ctx?.ed||NT.ed)?.state.schema||ntSchema();
  if(!schema)throw Error('Abra as Notas antes de aplicar.');schema.nodeFromJSON(ntDocumento(blocos)).check();
  const copia={...JSON.parse(JSON.stringify(p)),id:ntNovoId().replace(/^b/,'p'),titulo:(p.titulo||'Sem título')+' (antes de atualizar '+new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+')',fixada:false,criado:agora,atualizado:agora,ordem:Math.max(0,...ntPaginas().map(p=>+p.ordem||0))+10,copiaDe:id};
  delete copia.origem;
  // Cada página entra na fila própria; o histórico do GitHub também preserva a versão anterior.
  if(!pgMuda(l=>{l.push(copia);const x=l.find(p=>p.id===id);x.doc={v:1,blocos};x.origem={...origem,imagens:{...p.origem?.imagens,...origem.imagens}};x.atualizado=agora}))throw Error('Sem espaço para guardar a cópia de segurança. A atualização não foi aplicada.');
  if(ctx?.ed){ntAplicaNoEditor(ctx,blocos,true);ctx.shown=blocos;ctx.sujo=false;clearTimeout(ctx.timer)}
  return copia.id;
}
function ntNotionRevisa(id,p,resumo){
  if(NT.pagina===id&&NT.sujo)ntSalvaDoc();
  if(NT.pagina===id&&NT.sujo)throw Error('Não consegui salvar a edição atual. Libere espaço antes de comparar.');
  const atual=pgAchar(id);if(!atual)throw Error('Página não encontrada.');
  const base=JSON.parse(JSON.stringify(atual.doc||{v:1,blocos:[]})),conteudo=[...p.doc.content];
  // TrailingNode mantém um parágrafo vazio de edição após imagens/toggles. Não é uma remoção no export.
  const fim=base.blocos?.at(-1)?.conteudo,vazio=n=>n?.type==='paragraph'&&!n.content?.length;
  if(vazio(fim)&&!vazio(conteudo.at(-1)))conteudo.push(fim);
  const diff=ntNotionDiff(base.blocos||[],conteudo);
  const ov=ntModal('nt-notion-diff',`<div class="nt-modal-t"><b>Atualizar do Notion: ${esc(atual.titulo)}</b><button type="button" class="nt-x" aria-label="Fechar">✕</button></div><p>Compare com suas edições atuais. Aplicar cria uma cópia da página para desfazer.</p><p role="status">${resumo.enviadas} imagens enviadas; ${resumo.reutilizadas} reutilizadas; ${resumo.falhas} falhas; ${resumo.simplificados} itens simplificados.</p><div class="nt-diff-lista"></div><div class="nt-diff-acoes"><button type="button" class="b" data-tudo>Aplicar tudo</button><button type="button" class="b" data-selecao>Aplicar selecionados</button><button type="button" class="b s" data-cancelar>Cancelar</button></div>`);
  const lista=ov.querySelector('.nt-diff-lista'),schema=ntSchema(),serializer=TT.pm.model.DOMSerializer.fromSchema(schema);
  const mostra=(pai,no,classe,rotulo)=>{
    if(!no)return;const area=document.createElement('div');area.className='nt-diff-versao '+classe;
    const label=document.createElement('b');label.textContent=rotulo;area.appendChild(label);
    const el=document.createElement('div');el.className='nt-ed nt-diff-conteudo';el.appendChild(serializer.serializeNode(schema.nodeFromJSON(no)));area.appendChild(el);pai.appendChild(area);
  };
  diff.forEach((r,i)=>{
    const row=document.createElement('section');row.className='nt-diff-bloco '+r.tipo;row.dataset.i=i;
    const tit=document.createElement('b');tit.textContent={igual:'Sem alteração',adicionado:'Adicionado',removido:'Removido',alterado:'Alterado'}[r.tipo];row.appendChild(tit);
    if(r.tipo!=='adicionado')mostra(row,r.antes.conteudo,r.tipo==='igual'?'':'nt-diff-antes',r.tipo==='igual'?'Atual':'Antes');
    if(r.tipo==='adicionado'||r.tipo==='alterado')mostra(row,r.depois,'nt-diff-depois','Depois');
    if(r.tipo!=='igual'){
      const botoes=document.createElement('div');botoes.innerHTML='<button type="button" class="b s" data-aplicar aria-pressed="true">Aplicar bloco</button> <button type="button" class="b s" data-ignorar aria-pressed="false">Ignorar bloco</button>';row.appendChild(botoes);
    }lista.appendChild(row);
  });
  const fecha=()=>ntModalFecha(ov);ov.querySelector('.nt-x').onclick=fecha;ov.querySelector('[data-cancelar]').onclick=fecha;
  lista.onclick=e=>{
    const b=e.target.closest('[data-aplicar],[data-ignorar]');if(!b)return;
    const row=b.closest('[data-i]'),r=diff[+row.dataset.i];r.aplicar=b.hasAttribute('data-aplicar');row.classList.toggle('ignorado',!r.aplicar);
    row.querySelector('[data-aplicar]').setAttribute('aria-pressed',String(r.aplicar));row.querySelector('[data-ignorar]').setAttribute('aria-pressed',String(!r.aplicar));
  };
  const aplica=tudo=>{try{if(tudo)diff.forEach(r=>r.aplicar=true);const copia=ntNotionAplicar(id,base,diff,p.origem);if(copia){fecha();toast('Página atualizada. A cópia “antes de atualizar” está na lateral.')}else ov.querySelector('[role=status]').textContent='Nenhuma alteração selecionada.'}catch(e){ov.querySelector('[role=status]').textContent=e.message}};
  ov.querySelector('[data-tudo]').onclick=()=>aplica(true);ov.querySelector('[data-selecao]').onclick=()=>aplica(false);
  return {...resumo,diferencas:diff.map(r=>r.tipo)};
}
async function ntNotionImporta(arquivo,alvo=''){
  if(NT.importando){toast('Já existe uma importação em andamento.');return}
  NT.importando=true;let cancelado=false;
  const ov=ntModal('nt-importa','<h3>Importar do Notion</h3><p class="nt-importa-status" role="status">Lendo arquivo…</p><div class="nt-importa-acoes"><button type="button" class="b">Cancelar</button></div>'),status=ov.querySelector('[role=status]'),acoes=ov.querySelector('.nt-importa-acoes');
  ov.aoFechar=()=>{cancelado=true};acoes.querySelector('button').onclick=()=>{cancelado=true;status.textContent='Cancelando…'};
  const checa=()=>{if(cancelado)throw Error('Importação cancelada.')};
  let enviadas=0,falhas=0,simplificados=0,reutilizadas=0;
  try{
    if(alvo){if(!pgAchar(alvo)?.doc){try{const p=await SyncNotas.abrirPagina(alvo);if(NT.pagina===alvo&&!NT.sujo)NT.paginaDados=p}catch(e){}}if(!pgAchar(alvo))throw Error('Página não encontrada.')}
    if(alvo&&!/\.zip$/i.test(arquivo.name))throw Error('Escolha um arquivo .zip para atualizar.');
    if(arquivo.size>NT_ZIP_MAX)throw Error('O arquivo deve ter no máximo 200 MB.');
    const zip=/\.zip$/i.test(arquivo.name),arqs=zip?await ntZipLer(new Uint8Array(await arquivo.arrayBuffer()),undefined,'',0,()=>cancelado):new Map([[arquivo.name,new Uint8Array(await arquivo.arrayBuffer())]]);
    if(!zip&&!/\.html?$/i.test(arquivo.name))throw Error('Escolha um arquivo .zip ou .html.');
    const htmls=[...arqs].filter(([k])=>/\.html?$/i.test(k)).sort(([a],[b])=>a.split('/').length-b.split('/').length||a.localeCompare(b));
    if(!htmls.length)throw Error('Nenhuma página HTML encontrada no arquivo.');
    const ids=new Map(htmls.map(([k])=>[k,ntNovoId().replace(/^b/,'p')]));
    if(alvo){
      ids.clear();
      for(const [k,v] of htmls){const r=ntNotionConverte(new TextDecoder().decode(v),k),p=ntPaginas().filter(p=>p.origem?.tipo==='notion-zip'&&(r.notionId?p.origem.notionId===r.notionId:p.origem.titulo===r.titulo));if(p.length===1)ids.set(k,p[0].id)}
    }
    let pags=htmls.map(([k,v])=>({...ntNotionConverte(new TextDecoder().decode(v),k,ids),id:ids.get(k),caminho:k}));
    if(alvo){
      const atual=pgAchar(alvo),id=atual.origem?.notionId,candidatas=pags.filter(p=>id?p.notionId===id:ntNorma(p.titulo)===ntNorma(atual.origem?.titulo||atual.titulo));
      let escolhida=candidatas.length===1?candidatas[0]:null;
      if(!escolhida){
        status.textContent='Escolha a página do ZIP que deve atualizar esta página.';
        escolhida=await new Promise(resolve=>{
          const sel=document.createElement('select');sel.setAttribute('aria-label','Página do ZIP');
          pags.forEach((p,i)=>{const op=document.createElement('option');op.value=i;op.textContent=p.titulo+' — '+p.caminho;sel.appendChild(op)});
          const b=document.createElement('button');b.type='button';b.className='b';b.textContent='Comparar página';b.onclick=()=>resolve(pags[+sel.value]);acoes.append(sel,b);
          const cancela=()=>{cancelado=true;resolve(null)};acoes.querySelector('button').onclick=cancela;ov.aoFechar=cancela;
        });checa();acoes.querySelectorAll('select,button:not(:first-child)').forEach(e=>e.remove());
      }
      ids.set(escolhida.caminho,alvo);
      const entrada=htmls.find(([k])=>k===escolhida.caminho);
      pags=[{...ntNotionConverte(new TextDecoder().decode(entrada[1]),entrada[0],ids),id:alvo}];
    }
    for(const p of pags)for(const img of p.imagens){const b=arqs.get(img.caminho);if(b?.length>NT_IMG_LIM)throw Error('Cada imagem deve ter no máximo 25 MB.')}
    let soTexto=false;
    if((navigator.onLine===false||BCBR.semRede)&&pags.some(p=>p.imagens.length)){
      status.textContent='As imagens precisam de conexão. Deseja importar só o texto?';
      soTexto=await new Promise(resolve=>{const b=document.createElement('button');b.type='button';b.className='b';b.textContent='Importar só o texto';b.onclick=()=>{b.remove();resolve(true)};acoes.appendChild(b);const cancela=()=>{cancelado=true;resolve(false)};acoes.querySelector('button').onclick=cancela;ov.aoFechar=cancela});checa();
    }
    const cache=new Map(Object.entries(alvo?pgAchar(alvo).origem?.imagens||{}:{}));let anteriores=null;
    for(let i=0;i<pags.length;i++){
      const p=pags[i];simplificados+=p.simplificados;checa();status.textContent=`Importando… página ${i+1}/${pags.length}, imagem 0/${p.imagens.length}`;
      p.hashes={};
      for(let j=0;j<p.imagens.length;j++){
        checa();status.textContent=`Importando… página ${i+1}/${pags.length}, imagem ${j+1}/${p.imagens.length}`;
        const img=p.imagens[j],raw=arqs.get(img.caminho);
        if(!raw){falhas++;continue}
        try{
          const hash=await ntNotionHash(raw);checa();let src=cache.get(hash);
          if(src&&!/^\.\/img\/[\w.-]+$/.test(src))src=null;
          if(!src&&!soTexto){
            const blob=await ntImgComprime(new Blob([raw]));checa();
            if(alvo){anteriores??=await ntNotionImagensAnteriores(alvo,checa);src=anteriores.get(await ntNotionHash(await blob.arrayBuffer()))}
            if(!src){checa();src='./img/'+await ntImgEnvia(blob);enviadas++}else reutilizadas++;
            cache.set(hash,src);
          }else if(src)reutilizadas++;
          else{falhas++;continue}
          p.hashes[hash]=src;Object.keys(img.no).forEach(k=>delete img.no[k]);Object.assign(img.no,{type:'image',attrs:{src}});
        }catch(e){checa();falhas++}
      }
    }
    checa();
    const agora=ntAgora(),pasta=pags.length>1?{id:ntNovoId().replace(/^b/,'f'),titulo:pags[0].titulo,ordem:Math.max(0,...ntPastas().map(f=>+f.ordem||0))+10,criado:agora,atualizado:agora}:null;
    // Validar tudo antes de gravar: sem página parcialmente importada por HTML/ZIP inválido.
    const schema=ntSchema();if(!schema)throw Error('Abra as Notas antes de importar.');
    for(const p of pags){const no=schema.nodeFromJSON(p.doc);no.check();p.doc=no.toJSON();p.origem={tipo:'notion-zip',titulo:p.titulo,importadoEm:agora,...(p.notionId?{notionId:p.notionId}:{}),imagens:p.hashes}}
    if(alvo){const r=ntNotionRevisa(alvo,pags[0],{enviadas,falhas,simplificados,reutilizadas});ov.aoFechar=null;ntModalFecha(ov);return r}
    const novas=pags.map((p,i)=>({id:p.id,titulo:p.titulo,origem:p.origem,pasta:pasta?.id||'',fixada:false,ordem:Math.max(0,...ntPaginas().map(p=>+p.ordem||0))+(i+1)*10,criado:agora,atualizado:agora,doc:{v:1,blocos:ntBlocos(p.doc,[],agora)}}));
    if(!pgGrava([...ntPaginas(),...novas],pasta?[...ntPastas(),pasta]:undefined))throw Error('Sem espaço para salvar a importação neste aparelho.');
    status.textContent=`${novas.length} páginas criadas; ${enviadas} imagens enviadas, ${falhas} falhas; ${simplificados} itens simplificados.`;
    acoes.replaceChildren();const fim=document.createElement('button');fim.type='button';fim.className='b';fim.textContent='Concluir';fim.onclick=()=>ntModalFecha(ov);acoes.appendChild(fim);ov.aoFechar=null;await ntPainelAbre(novas[0].id);
    return {paginas:novas.length,enviadas,falhas,simplificados};
  }catch(e){if(ov.isConnected){status.textContent=(cancelado?'Importação cancelada. Nenhuma página criada.':e.message||'Não consegui importar este arquivo.')+(enviadas?` ${enviadas} imagens já foram enviadas.`:'');acoes.replaceChildren();const b=document.createElement('button');b.type='button';b.textContent='Fechar';b.onclick=()=>ntModalFecha(ov);acoes.appendChild(b)}return null}
  finally{NT.importando=false}
}

// ===== Quick Switcher de páginas (Ctrl+Shift+K): salto rápido estilo Notion =====
function ntQuickSwitcher(){
  if(document.querySelector('.nt-qs'))return;
  const ov=ntModal('nt-frases nt-qs',`<div class="nt-modal-t"><b>Ir para página</b><button type="button" class="nt-x" aria-label="Fechar">✕</button></div><input type="text" class="nt-fr-q" placeholder="Buscar página ou pasta… (Alt+K)" aria-label="Buscar página ou pasta" autocomplete="off"><div class="nt-fr-l" role="listbox"></div>`);
  const q=ov.querySelector('.nt-fr-q'),l=ov.querySelector('.nt-fr-l');let sel=0,it=[];
  const pastas=new Map(ntPastas().map(f=>[f.id,f.titulo]));
  const todas=()=>{
    const ps=[...ntPaginas()].sort((a,b)=>(NT.pagina===b.id)-(NT.pagina===a.id)||Number(!!b.fixada)-Number(!!a.fixada)||ntPgOrdem(a,b));
    return ps.map(p=>({...p,pastaNome:pastas.get(ntPastaDa(p))||''}));
  };
  const pinta=()=>{
    const raw=q.value.trim(),n=ntSemAcento(raw);
    const lista=todas().filter(p=>!n||ntSemAcento((p.titulo||'Sem título')+' '+p.pastaNome).includes(n));
    it=lista.map(p=>({tipo:'pg',p}));
    if(raw&&!lista.some(p=>ntSemAcento(p.titulo)===n))it.push({tipo:'cria',titulo:raw});
    sel=Math.min(sel,Math.max(0,it.length-1));
    l.innerHTML=it.length?it.map((x,i)=>{
      if(x.tipo==='cria')return `<button type="button" role="option" class="nt-fr-it${i===sel?' sel':''}" data-i="${i}"><b>＋ Criar página "${esc(x.titulo)}"</b><small>Nova página nas Notas</small></button>`;
      const p=x.p,sub=[p.pastaNome?`📁 ${p.pastaNome}`:'',p.fixada?'📌 Fixada':'',NT.pagina===p.id?'● Aberta':''].filter(Boolean).join(' · ');
      return `<button type="button" role="option" class="nt-fr-it${i===sel?' sel':''}" data-i="${i}"><b>📄 ${esc(p.titulo||'Sem título')}</b>${sub?`<small>${esc(sub)}</small>`:''}</button>`;
    }).join(''):'<p class="mut">Nenhuma página encontrada.</p>';
  };
  const abre=x=>{
    ntModalFecha(ov);
    if(x.tipo==='cria'){
      const id=ntPaginaCria();
      if(id){pgMuda(ls=>{const p=ls.find(u=>u.id===id);if(p)p.titulo=x.titulo});if(typeof ir==='function'&&tela!=='notas')ir('notas');ntPainelAbre(id)}
      return;
    }
    if(typeof ir==='function'&&tela!=='notas')ir('notas');
    ntPainelAbre(x.p.id);
  };
  q.addEventListener('input',()=>{sel=0;pinta()});
  q.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(it.length){sel=(sel+(e.key==='ArrowDown'?1:-1)+it.length)%it.length;pinta();l.querySelector('.sel')?.scrollIntoView({block:'nearest'})}}
    else if(e.key==='Enter'&&it[sel]){e.preventDefault();abre(it[sel])}
  });
  l.addEventListener('click',e=>{const b=e.target.closest('[data-i]');if(b&&it[+b.dataset.i])abre(it[+b.dataset.i])});
  ov.querySelector('.nt-x').onclick=()=>ntModalFecha(ov);pinta();q.focus();
}
document.addEventListener('keydown',e=>{
  if(e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&String(e.key).toLowerCase()==='k'){
    e.preventDefault();ntQuickSwitcher();
  }
});
