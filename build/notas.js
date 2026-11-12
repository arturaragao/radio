// Aba Notas (1.39.0): UMA página estilo Notion, editada direto (Tiptap/ProseMirror, vendor/tiptap.js, exposto em window.TT).
// Armazenamento: SM.d.notasDoc = {v:1, blocos:[{id, atualizado, conteudo}]} em semana/plano.json (mesmo salvamento da Semana: smMudar).
// Cada bloco de TOPO tem id estável e data de alteração própria; ntBlocos/ntDocumento são as funções puras de ida e volta.
// 1.40: ntFunde junta as mudanças de dois aparelhos bloco a bloco (três vias: base = última versão sincronizada, guardada em
// bcbr_notas_base); o editor recebe só os blocos de topo que mudaram (ntAplicaNoEditor). Cópia do formato antigo em plano.json: notas_v138.
// NT.shown = blocos que o editor mostra/já salvou: é o ponto de comparação para saber o que FOI DIGITADO aqui.
// 1.41: barra fixa de formatação (sem bolha ao selecionar), painel de atalhos (Ctrl+/), Tab/Shift+Tab entre lista e toggle e PÁGINAS:
// SM.d.notasPaginas={v:1,paginas:[{id,titulo,fixada,ordem,criado,atualizado,doc:{v:1,blocos}}]} no mesmo plano, mesma fila (NT_PEND leva
// `paginas` ao lado de `blocos`), mesma fusão por bloco (ntFunde) e fusão por campo (título/fixada/ordem: o mais recente) em ntFundePaginas.
// Cada editor tem um contexto (NT = página principal, NP = painel de uma página, aberto só enquanto o painel existe).
// 1.43: barra fixa só com B I U S, cor/realce (com cor padrão do Ctrl+Shift+H), frases, histórico e Atalhos; barra lateral por hover e com largura ajustável;
// sem "Recentes"; página/Notas em aba própria do navegador (?pagina=<id>), várias abas dividindo o mesmo localStorage (base de fusão por aba, ver NTB).
const ntCtx=()=>({ed:null,el:null,timer:null,shown:null,sujo:false,posImg:null,alvo:null,barra:null,bolha:null,buscaEl:null,grupoArrasto:null});
const NT={...ntCtx(),sync:null};
let NP=null;
const NT_PEND='bcbr_notasdoc_pendente',NT_ABERTOS='bcbr_nt_abertos',NT_COR='bcbr_nt_cor',NT_BASE='bcbr_notas_base_v143',NT_BASE_P='bcbr_notaspag_base_v143',NT_LAT='bcbr_nt_lat',NT_BASE_F='bcbr_notasfrases_base_v143',NT_COR_PAD='bcbr_nt_cor_padrao',NT_LATW='bcbr_nt_latw',NT_MAX_CONFLITOS=20;

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
// Lista de conflitos do plano: sem repetir. 1.44 parcial: só o usuário descarta cópias.
function ntJuntaConflitos(a,b){
  const vistos=new Set(),versoes=new Set(),out=[];
  for(const c of [...(a||[]),...(b||[])]){const k=c.id+'|'+c.em,v=c.conteudo===undefined?k:JSON.stringify([c.id,c.pagina,c.motivo,c.atualizado,ntCanon(c.conteudo)]);if(!vistos.has(k)&&!versoes.has(v)){vistos.add(k);versoes.add(v);out.push(c)}}
  return out;
}
// 1.43: a base de CADA aba fica na memória (NTB); o localStorage só dá a partida ao abrir a aba. Com várias abas abertas, outra aba que sobe ao GitHub
// regrava a chave compartilhada: se esta aba lesse a base de lá, o que ela ainda não viu pareceria "alteração local" e reverteria o texto da outra.
const NT_BASE_PT='bcbr_notaspastas_base_v143',NT_PT_FECHADAS='bcbr_nt_pastas_fechadas';
// 1.43 nunca altera/remove as bases da 1.42: abas antigas ainda podem usá-las e atualizá-las.
const NT_BASES_ANTIGAS=['bcbr_notas_base','bcbr_notaspag_base','bcbr_notasfrases_base','bcbr_notaspastas_base'];
function ntBasesInicia(){
  for(const antiga of NT_BASES_ANTIGAS){const nova=antiga+'_v143';if(smArmazem.getItem(nova)===null){const raw=smArmazem.getItem(antiga);if(raw!==null){if(smArmazem===localStorage)localStorage.setItem(nova,raw);else smGravaGrande(nova,raw)}}}
  NT.basesProntas=true;
}
const NTB={b:undefined,p:undefined,f:undefined,pt:undefined};
const ntLsLista=k=>{try{const b=JSON.parse(smArmazem.getItem(k)||'null');return Array.isArray(b)?b:null}catch(e){return null}};
function ntBaseLer(){if(NTB.b===undefined)NTB.b=ntLsLista(NT_BASE);return NTB.b}
// Base = última versão sincronizada (blocos da página principal e lista de páginas). Sem `paginas`, vale o plano atual (chamada de smMudar após o PUT).
function ntBaseSalva(blocos,paginas=SM.d?.notasPaginas?.paginas||[],frases=SM.d?.notasFrases||[],pastas=SM.d?.notasPaginas?.pastas){
  if(NT.legado)return;
  if(Array.isArray(blocos)){NTB.b=blocos;smGravaGrande(NT_BASE,JSON.stringify(blocos))}
  pgBaseSalva(paginas);frBaseSalva(frases);ptBaseSalva(pastas);
}
function ptBaseLer(){if(NTB.pt===undefined)NTB.pt=ntLsLista(NT_BASE_PT);return NTB.pt}
function ptBaseSalva(l){if(Array.isArray(l)){NTB.pt=l;smGravaGrande(NT_BASE_PT,JSON.stringify(l))}}
function frBaseLer(){if(NTB.f===undefined)NTB.f=ntLsLista(NT_BASE_F);return NTB.f}
function frBaseSalva(l){if(Array.isArray(l)){NTB.f=l;smGravaGrande(NT_BASE_F,JSON.stringify(l))}}
function pgBaseLer(){if(NTB.p===undefined)NTB.p=ntLsLista(NT_BASE_P);return NTB.p}

// ===== Páginas: fusão três vias da lista (página nova/apagada/editada) e por campo (título, fixada, ordem) =====
// Campo que mudou só de um lado: fica essa mudança. Dos dois e diferente: vale o de `atualizado` maior (empate: o remoto). Os blocos da página
// passam por ntFunde (mesma regra das notas). Página apagada de um lado e intacta do outro: apaga; se foi editada do outro lado, a edição fica.
// Campos desconhecidos (de versões futuras) são preservados: o objeto da página é copiado inteiro, só os campos conhecidos são decididos.
const NT_PG_CAMPOS=['titulo','fixada','ordem','pasta'];
function ntFundePaginas(base,local,remoto,agora=new Date().toISOString(),pastas=false){
  const lim=l=>(Array.isArray(l)?l:[]).filter(p=>p&&typeof p==='object'&&typeof p.id==='string');
  base=lim(base);local=lim(local);remoto=lim(remoto);
  const mapa=l=>new Map(l.map(p=>[p.id,p])),B=mapa(base),L=mapa(local),R=mapa(remoto),res=[],conflitos=[];
  const blocos=p=>p?.doc?.blocos;
  for(const id of new Set([...R.keys(),...L.keys(),...B.keys()])){   // ordem do remoto primeiro: sem mudança local o resultado é idêntico ao remoto
    const b=B.get(id),l=L.get(id),r=R.get(id);let v=null;
    if(l&&r){
      if(ntIgual(l,r))v=r;
      else{
        const localNovo=String(l.atualizado||'')>String(r.atualizado||'');v={...l,...r};
        for(const k of pastas?['titulo','ordem']:NT_PG_CAMPOS){
          if(k==='pasta'&&(l[k]===undefined||r[k]===undefined)){v[k]=l[k]??r[k]??b?.[k]??'';continue} // aparelho antigo não apaga a classificação
          const lm=!b||!ntIgual(b[k],l[k]),rm=!b||!ntIgual(b[k],r[k]);
          v[k]=lm&&!rm?l[k]:rm&&!lm?r[k]:localNovo?l[k]:r[k];
        }
        if(!pastas){const f=ntFunde(blocos(b),blocos(l),blocos(r),agora);
          v.doc={v:1,blocos:f.blocos};conflitos.push(...f.conflitos.map(c=>({...c,pagina:id})));}
        v.atualizado=localNovo?l.atualizado:r.atualizado;
      }
    }else if(l||r){const x=l||r;if(!b||!ntIgual(b,x))v=x}
    if(v)res.push(v);
  }
  return {paginas:res,conflitos};
}
// Frases-padrão (1.42): lista de {id,titulo,texto,atualizado}. Mesmo id nos dois lados e diferente: vale o `atualizado` maior (empate: o remoto).
// Frase só de um lado: nova -> fica; apagada do outro lado (estava na base) -> some, a não ser que tenha sido editada aqui. Aparelho antigo (sem o campo) não apaga: remoto ausente = lista vazia sem base.
function ntFundeFrases(base,local,remoto){
  const lim=l=>(Array.isArray(l)?l:[]).filter(f=>f&&typeof f==='object'&&typeof f.id==='string');
  base=lim(base);local=lim(local);remoto=lim(remoto);
  const mapa=l=>new Map(l.map(f=>[f.id,f])),B=mapa(base),L=mapa(local),R=mapa(remoto),res=[];
  for(const id of new Set([...R.keys(),...L.keys()])){
    const b=B.get(id),l=L.get(id),r=R.get(id);let v=null;
    if(l&&r)v=ntIgual(l,r)||String(l.atualizado||'')<=String(r.atualizado||'')?r:l;
    else{const x=l||r;if(!b||!ntIgual(b,x))v=x}
    if(v)res.push(v);
  }
  return res;
}
function pgBaseSalva(paginas){if(Array.isArray(paginas)){NTB.p=paginas;smGravaGrande(NT_BASE_P,JSON.stringify(paginas))}}
const ntPaginas=()=>Array.isArray(SM.d?.notasPaginas?.paginas)?SM.d.notasPaginas.paginas:[];
const ntPastas=()=>Array.isArray(SM.d?.notasPaginas?.pastas)?SM.d.notasPaginas.pastas:[];
const ntPastaDa=p=>ntPastas().some(f=>f.id===p.pasta)?p.pasta:'';
const pgAchar=id=>ntPaginas().find(p=>p.id===id);
const ntPgOrdem=(a,b)=>(Number(a.ordem)||0)-(Number(b.ordem)||0)||String(a.criado).localeCompare(String(b.criado))||String(a.id).localeCompare(String(b.id));

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
function ntFilaInvalida(k,raw){
  if(!NT.filaRuim){NT.filaRuim=true;toast('Uma alteração local está corrompida. A cópia vai para notas_conflitos; as demais continuam salvas.')}
  return {base:[],em:0,conflitos:[{id:k,em:new Date(0).toISOString(),conteudo:raw,motivo:'entrada da fila inválida ou corrompida'}]};
}
// Único caminho do legado: releitura e cópia das bases do disco DENTRO da trava, nunca das bases em memória da aba.
// Sem Web Locks, o legado fica intacto e apenas a fila nova funciona.
const NT_LEGADO_OK=NT_PEND+'_v143_legado_ok';
function ntLegadoChave(raw){
  let h=14695981039346656037n;
  for(let i=0;i<raw.length;i++)h=BigInt.asUintN(64,(h^BigInt(raw.charCodeAt(i)))*1099511628211n);
  return NT_PEND+':legado:'+h.toString(16);
}
function ntMigraLegado(){
  if(NT.migrando)return NT.migrando;
  const migra=()=>{
    try{
      ntBasesInicia();
      const raw=localStorage.getItem(NT_PEND);
      if(raw===null){NT.legado=false;return}
      const k=ntLegadoChave(raw);
      const confirmada=(ntLsLista(NT_LEGADO_OK)||[]).includes(k.split(':').pop());
      if(!confirmada&&localStorage.getItem(k)===null){
        let op;
        try{op=JSON.parse(raw);if(!Array.isArray(op?.blocos))throw Error('formato')}
        catch(e){op=ntFilaInvalida(NT_PEND,raw)}
        const [base,basePaginas,baseFrases,basePastas]=NT_BASES_ANTIGAS.map(k=>ntLsLista(k)||[]);
        op={...op,base,basePaginas,baseFrases,basePastas,legadoRaw:raw,em:Number.isFinite(op.em)?op.em:0};
        localStorage.setItem(k,JSON.stringify(op));
      }
      if(!confirmada&&JSON.parse(localStorage.getItem(k)).legadoRaw!==raw)throw Error('colisão de revisão');
      // A 1.43 nunca escreve nem apaga o legado; só registra os hashes confirmados pelo PUT.
      NT.legadoRaw=raw;NT.legadoChave=k;NT.legado=false;
    }catch(e){NT.legado=true;if(!NT.filaCheia){NT.filaCheia=true;toast(smErroLocal(e,'migrar as notas')+' A fila antiga foi mantida.')}}
  };
  // Fora da trava só detecta mudança; os bytes e bases usados na cópia são relidos dentro dela.
  const visto=localStorage.getItem(NT_PEND),pendente=visto!==null&&(visto!==NT.legadoRaw||(localStorage.getItem(NT.legadoChave)===null&&!(ntLsLista(NT_LEGADO_OK)||[]).includes(NT.legadoChave?.split(':').pop())));
  if(NT.basesProntas&&!pendente){NT.legado=false;return}
  if(typeof navigator.locks?.request!=='function'){
    try{if(!NT.basesProntas)ntBasesInicia()}catch(e){}   // apenas copia bases congeladas; nunca migra sem locks
    NT.legado=false;
    if(pendente&&!NT.avisoLegado){NT.avisoLegado=true;toast('Há uma edição antiga das Notas guardada neste aparelho. Abra o Radio no Chrome atualizado para recuperá-la.')}
    return;
  }
  NT.migrando=navigator.locks.request('radio-notas-migra-legado',{mode:'exclusive'},migra)
    .catch(()=>{NT.legado=true;toast('Não foi possível migrar as notas neste aparelho. Tente novamente.')})
    .finally(()=>{NT.migrando=null});
  return NT.migrando;
}
function ntPendentes(){
  try{
    if(ntMigraLegado()||NT.legado)return [];
    const filas=[];
    const chaves=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(NT_PEND+':'))chaves.push(k)}
    for(const k of chaves){const raw=localStorage.getItem(k);if(raw===null)continue;try{const op=JSON.parse(raw);if(!Array.isArray(op?.base)||!Number.isFinite(op.em)||!Number.isFinite(new Date(op.em).getTime())||!['blocos','paginas','frases','pastas','conflitos'].some(c=>Array.isArray(op[c])))throw Error('formato');filas.push({k,raw,op})}catch(e){filas.push({k,raw,op:ntFilaInvalida(k,raw)})}}
    filas.sort((a,b)=>a.op.em-b.op.em||a.k.localeCompare(b.k));
    if(!filas.length)return [];
    const res={blocos:ntBaseLer()||SM.d?.notasDoc?.blocos||[],paginas:pgBaseLer()||ntPaginas(),frases:frBaseLer()||SM.d?.notasFrases||[],pastas:ptBaseLer()||ntPastas(),filas};
    for(const {op} of filas){
      const em=new Date(op.em).toISOString();let f;
      res.conflitos=ntJuntaConflitos(res.conflitos,op.conflitos);
      if(op.blocos) {f=ntFunde(op.base,op.blocos,res.blocos,em);res.blocos=f.blocos;res.conflitos=ntJuntaConflitos(res.conflitos,f.conflitos)}
      if(op.paginas){f=ntFundePaginas(op.basePaginas||op.base,op.paginas,res.paginas,em);res.paginas=f.paginas;res.conflitos=ntJuntaConflitos(res.conflitos,f.conflitos)}
      if(op.frases)res.frases=ntFundeFrases(op.baseFrases||op.base,op.frases,res.frases);
      if(op.pastas)res.pastas=ntFundePaginas(op.basePastas||op.base,op.pastas,res.pastas,em,true).paginas;
      res.em=op.em;
    }
    return [res];
  }catch(e){return []}
}
// Cada edição tem uma entrada imutável, com sua própria base. Duas abas nunca escrevem/apagam a entrada uma da outra.
// NT_PEND antigo continua legível; as entradas novas usam o mesmo prefixo. Só as entradas confirmadas pelo PUT são retiradas.
function ntFilaGrava(campo,base,valor,extra={}){
  if(ntMigraLegado()||NT.legado)return false;
  const em=Math.max(Date.now(),(ntPendentes()[0]?.em||0)+1);
  try{smLsGrava(NT_PEND+':'+ntNovoId(),JSON.stringify({base,[campo]:valor,...extra,em}));return true}
  catch(e){toast(smErroLocal(e));return false}
}
function ntTemPendentes(){return ntPendentes().length>0||!!NT.migrando||!!NT.legado}
// Põe o documento pendente em `d`. Se `d` veio do GitHub com outro conteúdo, funde por bloco; as entradas originais ficam até o PUT confirmar.
function ntAplica(d,ops){
  if(!ops||!ops.length){ntMigra(d);return}
  const p=ops[ops.length-1],r=d.notasDoc?.blocos,rp=d.notasPaginas?.paginas;let confl=0;
  if(Array.isArray(r)&&JSON.stringify(r)!==JSON.stringify(p.blocos)){
    const f=ntFunde(ntBaseLer(),p.blocos,r);
    p.blocos=f.blocos;p.conflitos=ntJuntaConflitos(p.conflitos,f.conflitos);confl+=f.conflitos.length;
  }
  if(Array.isArray(p.paginas)){   // páginas pendentes: funde com as do GitHub (se outro aparelho mexeu) e ficam no plano
    if(Array.isArray(rp)&&JSON.stringify(rp)!==JSON.stringify(p.paginas)){
      const f=ntFundePaginas(pgBaseLer(),p.paginas,rp);
      p.paginas=f.paginas;p.conflitos=ntJuntaConflitos(p.conflitos,f.conflitos);confl+=f.conflitos.length;
    }
    d.notasPaginas={...d.notasPaginas,v:1,paginas:p.paginas};
  }
  if(Array.isArray(p.frases)){   // frases-padrão pendentes: funde com as do GitHub
    if(Array.isArray(d.notasFrases)&&JSON.stringify(d.notasFrases)!==JSON.stringify(p.frases))p.frases=ntFundeFrases(frBaseLer(),p.frases,d.notasFrases);
    d.notasFrases=p.frases;
  }
  if(Array.isArray(p.pastas)){
    if(Array.isArray(d.notasPaginas?.pastas))p.pastas=ntFundePaginas(ptBaseLer(),p.pastas,d.notasPaginas.pastas,undefined,true).paginas;
    d.notasPaginas={...d.notasPaginas,v:1,pastas:p.pastas};
  }
  if(confl&&typeof toast==='function')toast('Nota editada nos dois aparelhos: guardei a versão mais antiga em notas_conflitos.');
  d.notasDoc={v:1,blocos:p.blocos};
  if(p.conflitos?.length)d.notas_conflitos=ntJuntaConflitos(d.notas_conflitos,p.conflitos);
}
// O que está sendo digitado entra na fila (e no plano local) ANTES de qualquer plano do GitHub ser aplicado.
function ntAntes(){if(NT.ed&&NT.sujo)ntSalvaDoc();if(NP?.ed&&NP.sujo)pgSalvaDoc()}
// `d` = plano recém-baixado do GitHub, já em SM.d: funde o pendente, guarda a base e mostra no editor só o que mudou.
function ntRecebe(d){
  const espera=ntMigraLegado();if(espera)return espera.then(()=>{if(!NT.legado)ntRecebe(d)});if(NT.legado)return;
  const r=d.notasDoc?.blocos,rp=d.notasPaginas?.paginas||[],rf=d.notasFrases||[],pt=d.notasPaginas?.pastas;ntAplica(d,ntPendentes());
  ntBaseSalva(r,rp,rf,pt||null);
  ntSincroniza();
}
const ntConfirmada=(salvo,op)=>JSON.stringify(salvo.notasDoc?.blocos)===JSON.stringify(op.blocos)&&(!Array.isArray(op.paginas)||JSON.stringify(salvo.notasPaginas?.paginas)===JSON.stringify(op.paginas))&&(!Array.isArray(op.frases)||JSON.stringify(salvo.notasFrases)===JSON.stringify(op.frases))&&(!Array.isArray(op.pastas)||JSON.stringify(salvo.notasPaginas?.pastas)===JSON.stringify(op.pastas))&&(op.conflitos||[]).every(c=>(salvo.notas_conflitos||[]).some(s=>ntIgual({...s,em:null},{...c,em:null})));
function ntSync(){
  const espera=ntMigraLegado();if(espera)return espera.then(()=>NT.legado?false:ntSync());if(NT.legado)return Promise.resolve(false);
  if(NT.sync)return NT.sync;
  const ops=ntPendentes();if(!ops.length||!SM.d)return Promise.resolve(!ops.length);
  NT.sync=smMudar(d=>ntAplica(d,ntPendentes()),'notas',salvo=>{
    // Só limpa se o que subiu é o mesmo documento que estava pendente (edição nova durante o envio continua na fila).
    const atual=ntPendentes()[0];if(atual&&ntConfirmada(salvo,atual)){
      for(const f of atual.filas||[])if(localStorage.getItem(f.k)===f.raw){
        if(typeof f.op.legadoRaw==='string'){
          const hash=ntLegadoChave(f.op.legadoRaw).split(':').pop();
          localStorage.setItem(NT_LEGADO_OK,JSON.stringify([...(ntLsLista(NT_LEGADO_OK)||[]).filter(h=>h!==hash),hash].slice(-20)));
        }
        localStorage.removeItem(f.k);
      }
    }
  }).finally(()=>{NT.sync=null;if(ntTemPendentes()&&!SM.erro){clearTimeout(NT.retry);NT.retry=setTimeout(ntSync,700)}});
  return NT.sync;
}
// Chamado ~1 s depois da última digitação.
function ntSalvaDoc(){
  clearTimeout(NT.timer);if(!NT.ed||!SM.d)return;
  const ant=NT.shown||SM.d.notasDoc?.blocos||[],blocos=ntBlocos(NT.ed.getJSON(),ant);NT.sujo=false;   // compara com o que o editor mostrava, não com o plano (que pode ter vindo de outro aparelho)
  if(JSON.stringify(blocos)===JSON.stringify(ant))return;
  ntLembSincroniza(ant,blocos);
  if(typeof rdGancho==='function')rdGancho('edicao',rdGancho('antes',{notasDoc:{blocos:ant}}),{notasDoc:{blocos}});
  if(!ntFilaGrava('blocos',ant,blocos)){NT.sujo=true;return}
  NT.shown=blocos;SM.d.notasDoc={v:1,blocos};smGuardaCache();ntSync();
}

// ===== Estado aberto/fechado dos toggles: por aparelho (localStorage), fora do documento =====
function ntAbertosLer(){try{return new Set(JSON.parse(localStorage.getItem(NT_ABERTOS)||'[]'))}catch(e){return new Set()}}
function ntAbertosGrava(s){try{localStorage.setItem(NT_ABERTOS,JSON.stringify([...s]))}catch(e){}}
function ntAberto(id){return !!id&&ntAbertosLer().has(id)}
function ntAbertoSalva(id,aberto){if(!id)return;const s=ntAbertosLer();aberto?s.add(id):s.delete(id);ntAbertosGrava(s)}
function ntPoeAberto(dom,aberto){dom.classList.toggle('is-open',aberto);dom.querySelector(':scope>button')?.setAttribute('aria-expanded',String(aberto))}
// Ctrl+Alt+T abre/fecha todos os toggles da página do editor `c`; Ctrl+Enter, o toggle do cursor. Só estado de tela (classe + localStorage): fora do documento, do histórico e do sync.
function ntTodosNo(c){
  const ds=[...c.el.querySelectorAll('[data-type="details"]')];
  const abrir=!(ds.length&&ds.every(d=>d.classList.contains('is-open')));
  ds.forEach(d=>ntPoeAberto(d,abrir));
  const s=ntAbertosLer();ds.forEach(d=>{if(d.dataset.id)abrir?s.add(d.dataset.id):s.delete(d.dataset.id)});ntAbertosGrava(s);   // (só os desta página: os das outras guardam o seu)
  return true;
}
function ntToggleCursor(c){
  const sel=c.ed.state.selection,$=sel.$from,n=sel.node;
  const abre=(pos,no)=>{const dom=c.ed.view.nodeDOM(pos);if(dom instanceof Element){const a=!dom.classList.contains('is-open');ntPoeAberto(dom,a);ntAbertoSalva(no.attrs.id,a)}return true};
  if(n?.type.name==='details')return abre(sel.from,n);
  for(let d=$.depth;d>=1;d--)if($.node(d).type.name==='details')return abre($.before(d),$.node(d));
  return false;
}

// ===== Paleta de cores (Notion); o documento guarda var(--ntc-…)/var(--ntb-…), definidas no CSS por tema =====
const NT_CORES=[['cinza','Cinza'],['marrom','Marrom'],['laranja','Laranja'],['amarelo','Amarelo'],['verde','Verde'],['azul','Azul'],['roxo','Roxo'],['rosa','Rosa'],['vermelho','Vermelho']];
// Cor padrão do Ctrl+Shift+H (por aparelho): qualquer cor de texto ou de fundo marcada com ★ na paleta. Sem padrão, fundo amarelo.
function ntCorPadrao(){try{const c=JSON.parse(localStorage.getItem(NT_COR_PAD)||'null');if(c&&['texto','fundo'].includes(c.tipo)&&NT_CORES.some(x=>x[0]===c.cor))return c}catch(e){}return null}
function ntCorPadraoSet(tipo,cor){   // marcar de novo a mesma cor desmarca
  const a=ntCorPadrao();try{a&&a.tipo===tipo&&a.cor===cor?localStorage.removeItem(NT_COR_PAD):localStorage.setItem(NT_COR_PAD,JSON.stringify({tipo,cor}))}catch(e){}
  return ntCorPadrao();
}
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
// Item de lista (1.41): Tab aninha na lista; se não dá (1º item) e a lista vem logo depois de um toggle, o item (com os filhos) vira o último
// filho do toggle, ainda como item de lista. Shift+Tab: item de nível mais alto dentro de um toggle sai para depois dele; senão desaninha.
const NT_LISTAS=['bulletList','orderedList','taskList'],NT_ITENS=['listItem','taskItem'];
function ntItemParaToggle(ed,b){
  const {state,view}=ed,doc=state.doc,$=doc.resolve(b.pos),lista=$.parent,listaPos=$.before(),avo=$.node($.depth-1),iL=$.index($.depth-1);
  if(b.idx!==0||!iL)return false;
  const ant=avo.child(iL-1);if(ant.type.name!=='details')return false;
  const ini=listaPos-ant.nodeSize,fimConteudo=ini+ant.nodeSize-2,conteudo=ant.lastChild,ult=conteudo.lastChild,S=TT.pm.state,off=state.selection.from-b.pos;
  const tr=state.tr,tam=b.node.nodeSize;let itemPos;
  if(lista.childCount===1)tr.delete(listaPos,listaPos+lista.nodeSize);else tr.delete(b.pos,b.pos+tam);   // (depois do toggle: não mexe nas posições dele)
  if(ult.type===lista.type){tr.insert(fimConteudo-1,b.node);itemPos=fimConteudo-1}   // já termina numa lista do mesmo tipo: entra nela
  else if(conteudo.childCount===1&&ult.type.name==='paragraph'&&!ult.content.size){tr.replaceWith(fimConteudo-ult.nodeSize,fimConteudo,lista.type.create(null,b.node));itemPos=fimConteudo-ult.nodeSize+1}   // o parágrafo vazio do toggle novo é substituído
  else{tr.insert(fimConteudo,lista.type.create(null,b.node));itemPos=fimConteudo+1}
  try{tr.setSelection(S.TextSelection.create(tr.doc,itemPos+Math.min(off,tam-1)))}catch(e){}
  view.dispatch(tr.scrollIntoView());ntAbertoSalva(ant.attrs.id,true);const dom=view.nodeDOM(ini);if(dom)ntPoeAberto(dom,true);
  return true;
}
function ntItemSaiToggle(ed,b){
  const {state,view}=ed,doc=state.doc,$=doc.resolve(b.pos),lista=$.parent,listaPos=$.before(),avo=$.node($.depth-1);
  if(avo.type.name!=='detailsContent')return false;   // aninhado em outro item, ou fora de toggle: segue o desaninhar normal
  const det=$.node($.depth-2),destino=$.before($.depth-2)+det.nodeSize,seg=doc.resolve(destino).nodeAfter,S=TT.pm.state,off=state.selection.from-b.pos,tam=b.node.nodeSize;
  const tr=state.tr,junta=seg&&seg.type===lista.type;
  if(junta)tr.insert(destino+1,b.node);else tr.insert(destino,lista.type.create(null,b.node));   // (depois do toggle: não mexe nas posições de antes)
  const passos=tr.steps.length;
  if(lista.childCount>1)tr.delete(b.pos,b.pos+tam);
  else if(avo.childCount===1)tr.replaceWith(listaPos,listaPos+lista.nodeSize,state.schema.nodes.paragraph.create());   // único filho: o toggle fica com um parágrafo vazio
  else tr.delete(listaPos,listaPos+lista.nodeSize);
  try{tr.setSelection(S.TextSelection.create(tr.doc,tr.mapping.slice(passos).map(destino+1)+Math.min(off,tam-1)))}catch(e){}
  view.dispatch(tr.scrollIntoView());return true;
}
function ntAninha(ed,b,sai){
  if(NT_ITENS.includes(b.node.type.name)){
    const t=b.node.type.name;ed.chain().focus().setTextSelection(b.pos+2).run();
    if(sai)return ntItemSaiToggle(ed,b)||ed.chain().focus().liftListItem(t).run()||true;
    return ed.can().sinkListItem(t)?ed.chain().focus().sinkListItem(t).run()||true:ntItemParaToggle(ed,b)||true;
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
  const grupo=ntBselPos(ed.state);if(grupo.length){ntBselTab(ed.view,grupo,sai);return true}   // blocos selecionados por retângulo: o grupo todo
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
async function ntInsereImagem(arquivo,pos,c=NT){
  const ed=c.ed;if(!ed||!arquivo)return;
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
function ntEscolheImagem(c=NT){
  c.posImg=c.ed.state.selection.from;
  let i=c.el.querySelector('.nt-arquivo');
  if(!i){i=document.createElement('input');i.type='file';i.accept='image/*';i.className='nt-arquivo';i.hidden=true;
    i.onchange=()=>{const f=i.files[0];i.value='';if(f)ntInsereImagem(f,c.posImg,c)};c.el.appendChild(i)}
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
      tg.addEventListener('click',()=>{const a=!dom.classList.contains('is-open');ntPoeAberto(dom,a);ntAbertoSalva(id,a)});
      return {dom,contentDOM:conteudo,
        ignoreMutation:m=>m.type==='selection'?false:tg.contains(m.target)||!dom.contains(m.target)||dom===m.target,
        update(n){if(n.type!==node.type)return false;if(n.attrs.id!==id){id=n.attrs.id;poe()}return true}};
    }},
  });
}
// Identificação: todo bloco de TOPO e todo toggle (em qualquer nível) tem `id`; repetido (cópia/divisão) ganha id novo.
const NT_COM_ID=['paragraph','heading','details','bulletList','orderedList','taskList','blockquote','callout','image','horizontalRule','paginaLink'];
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
function ntAtalhos(c){
  return TT.Extension.create({name:'atalhosNotas',priority:1000,addKeyboardShortcuts(){return {
    'Mod-Shift-h':()=>{const u=ntCorPadrao()||{tipo:'fundo',cor:'amarelo'};ntAplicaCor(this.editor,u.tipo,u.cor);return true},
    'Mod-k':()=>{ntLink(c);return true},
    'Mod-a':()=>{   // dentro de um toggle: primeiro seleciona só esse bloco; repetir seleciona a página inteira
      const s=this.editor.state.selection;if(s.node)return false;
      for(let d=s.$from.depth;d>0;d--)if(s.$from.node(d).type.name==='details')return this.editor.commands.setNodeSelection(s.$from.before(d));
      return false;
    },
    'Backspace':()=>ntApagaToggleVazio(this.editor),
    'Mod-Alt-t':()=>ntTodosNo(c),'Mod-Enter':()=>ntToggleCursor(c),
    'Tab':()=>ntTab(this.editor,false),'Shift-Tab':()=>ntTab(this.editor,true)}}});
}
// Backspace no início do título de um toggle VAZIO (sem título e só parágrafos vazios dentro) apaga o toggle numa transação (Ctrl+Z traz de volta) e põe o
// cursor no fim do bloco anterior. Com conteúdo, vale o comportamento do Tiptap: o título vira parágrafo e o conteúdo sobe (também um passo só no Ctrl+Z).
function ntApagaToggleVazio(ed){
  const {state,view}=ed,s=state.selection,$=s.$from;
  if(!s.empty||$.parent.type.name!=='detailsSummary'||$.parent.content.size||$.parentOffset!==0)return false;
  const det=$.node($.depth-1);let vazio=true;
  det.lastChild.forEach(n=>{if(n.type.name!=='paragraph'||n.content.size)vazio=false});
  if(!vazio)return false;
  const ini=$.before($.depth-1),tr=state.tr;
  if($.node($.depth-2).childCount===1)tr.replaceWith(ini,ini+det.nodeSize,state.schema.nodes.paragraph.create());else tr.delete(ini,ini+det.nodeSize);
  try{tr.setSelection(TT.pm.state.Selection.near(tr.doc.resolve(Math.min(ini,tr.doc.content.size)),-1))}catch(e){}
  view.dispatch(tr.scrollIntoView());return true;
}
// Link (Ctrl+K ou botão da barra): campo ao lado do botão (prompt() não existe no WebView do APK).
function ntLink(c){
  const ed=c.ed,{from,to,empty}=ed.state.selection;
  if(empty&&!ed.isActive('link')){toast('Selecione o texto que vai virar link.');return}
  c.linkSel={from,to};
  const pop=c.barra.querySelector('.nt-link'),i=pop.querySelector('.nt-link-in');i.value=ed.getAttributes('link').href||'';
  c.barra.querySelector('.nt-paleta').hidden=true;
  ntPopPos(pop,c.barra.querySelector('[data-m="cor"]'));i.focus();i.select();
}
function ntLinkAplica(c,url){
  const u=String(url||'').trim();c.barra.querySelector('.nt-link').hidden=true;
  const ch=c.ed.chain().focus().setTextSelection(c.linkSel).extendMarkRange('link');
  if(!u||u==='https://')ch.unsetLink().run();else ch.setLink({href:/^[a-z][a-z0-9+.-]*:/i.test(u)?u:'https://'+u}).run();
}
function ntLinkCancela(c){c.barra.querySelector('.nt-link').hidden=true;c.ed.chain().focus().setTextSelection(c.linkSel).run()}
// Janelinha (link, cores) fixa na tela, logo abaixo do botão: a barra rola na horizontal no celular e cortaria uma janelinha absoluta.
function ntPopPos(pop,bt){
  pop.hidden=false;const r=bt.getBoundingClientRect();
  pop.style.top=Math.max(8,Math.min(r.bottom+6,innerHeight-pop.offsetHeight-8))+'px';
  pop.style.left=Math.max(8,Math.min(r.left,innerWidth-pop.offsetWidth-8))+'px';
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
  ['Página','Nova página, aberta num painel','pagina page subpagina',null],
  ['Frase','Inserir uma frase-padrão salva','frase laudo modelo padrao',null],
  ['Importar do Notion','Escolher exportação HTML (.zip ou .html)','importar notion zip html',null],
];
const ntSemAcento=s=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
// Menu flutuante de sugestões ("/" blocos, "@" lembretes). itens(query) -> [[título, subtítulo, ...]]; comando(editor,range,item).
function ntSugestao(c,{nome,char,itens,comando,allow,allowSpaces=false,semVazio=false}){
  return TT.Extension.create({name:nome,addProseMirrorPlugins(){
    let menu=null,lista=[],sel=0,props=null;
    const pinta=()=>{
      if(semVazio&&!lista.length){menu.hidden=true;return}
      menu.hidden=false;
      menu.innerHTML=lista.length?lista.map((it,i)=>`<button type="button" class="nt-slash-it${i===sel?' sel':''}" data-i="${i}"><b>${esc(it[0])}</b><small>${esc(it[1])}</small></button>`).join(''):'<div class="nt-slash-vazio">Nada encontrado</div>';
      const r=props.clientRect?.();if(r){menu.style.left=Math.max(8,Math.min(r.left,innerWidth-250))+'px';const abaixo=r.bottom+6;menu.style.top=(abaixo+260>innerHeight&&r.top>270?r.top-Math.min(260,menu.offsetHeight||260)-6:abaixo)+'px'}
      menu.querySelector('.sel')?.scrollIntoView({block:'nearest'});
    };
    const fecha=()=>{menu?.remove();menu=null};
    return [TT.Suggestion({editor:this.editor,char,allowSpaces,pluginKey:new TT.pm.state.PluginKey(nome),allow,
      items:({query})=>itens(query),
      command:({editor,range,props:it})=>comando(editor,range,it),
      render:()=>({
        onStart:p=>{props=p;lista=p.items;sel=0;menu=document.createElement('div');menu.className='nt-slash';menu.setAttribute('role','listbox');
          menu.addEventListener('mousedown',e=>e.preventDefault());
          menu.addEventListener('click',e=>{const b=e.target.closest('[data-i]');if(b)props.command(lista[+b.dataset.i])});
          c.el.appendChild(menu);pinta()},
        onUpdate:p=>{props=p;lista=p.items;sel=Math.min(sel,Math.max(0,lista.length-1));pinta()},
        onKeyDown:({event:e})=>{
          if(e.key==='Escape'){fecha();return true}
          if(!lista.length)return false;
          if(e.key==='ArrowDown'){sel=(sel+1)%lista.length;pinta();return true}
          if(e.key==='ArrowUp'){sel=(sel-1+lista.length)%lista.length;pinta();return true}
          if(e.key==='Enter'||e.key==='Tab'){props.command(lista[sel]);return true}
          return false},
        onExit:fecha,
      })})];
  }});
}
const ntSlash=c=>ntSugestao(c,{nome:'slashNotas',char:'/',
  allow:({state,range})=>state.doc.resolve(range.from).parent.type.name!=='detailsSummary',
  itens:query=>{const q=ntSemAcento(query);return NT_SLASH.filter(it=>!(c.pagina&&['Página','Importar do Notion'].includes(it[0]))&&(!q||ntSemAcento(it[0]+' '+it[2]).includes(q)))},   // criar/importar páginas pela principal
  comando:(editor,range,it)=>{
    const ch=editor.chain().focus().deleteRange(range);
    if(it[3]){it[3](ch).run();return}
    ch.run();if(it[0]==='Página')ntPaginaDoSlash(c);else if(it[0]==='Frase')ntFrasesEscolhe(c);else if(it[0]==='Importar do Notion')ntNotionEscolhe();else ntEscolheImagem(c);
  }});

// ----- Barra fixa de formatação (no topo da página e no painel de cada página) + barra da imagem -----
// Os botões não roubam o foco: mousedown é cancelado (só o campo do link recebe foco). Sem bolha ao selecionar texto (1.41).
const NT_BARRA=[
  ['bold','<b>B</b>','Negrito (Ctrl+B)'],['italic','<i>I</i>','Itálico (Ctrl+I)'],['underline','<u>U</u>','Sublinhado (Ctrl+U)'],['strike','<s>S</s>','Tachado (Ctrl+Shift+S)'],
  ['cor','A▾','Cor do texto e realce (Ctrl+Shift+H aplica a cor padrão)'],null,
  ['frase','✚<span class="nt-bt-t"> Frase</span>','Salvar o texto selecionado como frase-padrão (insira com /Frase)'],['frases','📋','Gerenciar frases-padrão'],['hist','🕘<span class="nt-bt-t"> Histórico</span>','Histórico de versões das notas'],null,
  ['atalhos','⌨<span class="nt-bt-t"> Atalhos</span>','Atalhos e funções (Ctrl+/)']];
const NT_BARRA_ATIVO={bold:'bold',italic:'italic',underline:'underline',strike:'strike'};   // (1.43: títulos, link, listas, checklist e toggle saíram da barra; ficam os atalhos, o menu "/" e o painel de Atalhos)
// Paleta: cada cor é uma linha com amostra grande na cor de verdade (A para texto, quadrado cheio para fundo), o nome e a estrela que a faz padrão do Ctrl+Shift+H.
// (As variáveis --ntc-/--ntb- valem também em .nt-barra no CSS: a paleta fica fora do .nt-ed.)
const ntPaletaHtml=tipo=>NT_CORES.map(([k,n])=>`<div class="nt-cor"><button type="button" class="nt-sw" data-cor="${tipo}:${k}" title="${n}" aria-label="${tipo==='texto'?'Texto':'Fundo'} ${n}"><span class="nt-amo ${tipo}" style="${tipo==='texto'?`color:var(--ntc-${k})`:`background:var(--ntb-${k})`}">${tipo==='texto'?'A':''}</span><span class="nt-nome">${n}</span></button><button type="button" class="nt-star" data-padrao="${tipo}:${k}" title="Definir como cor padrão do Ctrl+Shift+H" aria-label="Definir ${tipo==='texto'?'texto':'fundo'} ${n} como padrão do Ctrl+Shift+H" aria-pressed="false">☆</button></div>`).join('');
function ntPaletaPinta(c){
  const pad=ntCorPadrao();
  for(const st of c.barra?.querySelectorAll('.nt-star')||[]){const on=!!pad&&st.dataset.padrao===pad.tipo+':'+pad.cor;st.classList.toggle('on',on);st.textContent=on?'★':'☆';st.setAttribute('aria-pressed',String(on))}
}
function ntBarra(c){
  const b=document.createElement('div'),sw=ntPaletaHtml;
  b.className='nt-barra';
  b.innerHTML=`<div class="nt-barra-l" role="toolbar" aria-label="Formatação">${NT_BARRA.map(x=>x?`<button type="button" data-m="${x[0]}" title="${x[2]}" aria-label="${x[2]}">${x[1]}</button>`:'<i class="nt-sep"></i>').join('')}</div>
    <div class="nt-pop nt-link" hidden><input type="text" class="nt-link-in" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="Endereço do link (vazio remove)" aria-label="Endereço do link"><button type="button" data-m="link-ok" title="Aplicar">OK</button><button type="button" data-m="link-x" title="Cancelar">✕</button></div>
    <div class="nt-pop nt-paleta" hidden><div class="nt-paleta-t">Cor do texto</div><div class="nt-paleta-l">${sw('texto')}</div><div class="nt-paleta-t">Cor de fundo (realce)</div><div class="nt-paleta-l">${sw('fundo')}</div><div class="nt-paleta-dica">☆ marca a cor padrão do Ctrl+Shift+H (clique de novo para desmarcar)</div><button type="button" class="nt-sem-cor" data-cor="nenhuma">Sem cor</button></div>`;
  b.addEventListener('mousedown',e=>{if(!e.target.closest('input'))e.preventDefault()});
  const inp=b.querySelector('.nt-link-in'),pop=b.querySelector('.nt-link'),pal=b.querySelector('.nt-paleta');
  inp.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();ntLinkAplica(c,e.target.value)}
    else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();ntLinkCancela(c)}
  });
  inp.addEventListener('blur',()=>setTimeout(()=>{if(!pop.contains(document.activeElement))pop.hidden=true},150));   // clicou fora: fecha
  b.addEventListener('click',e=>{
    const bt=e.target.closest('button');if(!bt||!c.ed)return;const m=bt.dataset.m,ch=()=>c.ed.chain().focus();
    if(m==='link-ok'){ntLinkAplica(c,inp.value);return}
    if(m==='link-x'){ntLinkCancela(c);return}
    if(bt.dataset.padrao){const[t,k]=bt.dataset.padrao.split(':'),p=ntCorPadraoSet(t,k);ntPaletaPinta(c);toast(p?`Ctrl+Shift+H agora aplica ${t==='texto'?'a cor de texto':'o fundo'} ${NT_CORES.find(x=>x[0]===k)[1].toLowerCase()}.`:'Cor padrão removida: Ctrl+Shift+H volta ao fundo amarelo.');return}
    if(bt.dataset.cor){if(bt.dataset.cor==='nenhuma')ntSemCor(c.ed);else{const[t,k]=bt.dataset.cor.split(':');ntAplicaCor(c.ed,t,k)}pal.hidden=true;ntBarraPinta(c);return}
    if(!m)return;
    if(m==='bold')ch().toggleBold().run();else if(m==='italic')ch().toggleItalic().run();else if(m==='underline')ch().toggleUnderline().run();else if(m==='strike')ch().toggleStrike().run();
    else if(m==='cor'){if(pal.hidden){pop.hidden=true;ntPaletaPinta(c);ntPopPos(pal,bt)}else pal.hidden=true;return}
    else if(m==='atalhos'){ntAtalhosAbre();return}
    else if(m==='frase'){ntFraseSalvaSel(c);return}
    else if(m==='frases'){ntFrasesGerencia();return}
    else if(m==='hist'){ntHistAbre(c);return}
    ntBarraPinta(c);
  });
  c.barra=b;return b;
}
// Estado ativo dos botões (negrito, título, lista…) conforme o cursor/seleção.
function ntBarraPinta(c){
  const e=c.ed,b=c.barra;if(!e||!b)return;
  for(const bt of b.querySelectorAll('.nt-barra-l [data-m]')){
    const m=bt.dataset.m;let on=false;
    try{on=m==='cor'?!!(e.getAttributes('textStyle').color||e.getAttributes('textStyle').backgroundColor):NT_BARRA_ATIVO[m]?e.isActive(NT_BARRA_ATIVO[m]):false}catch(x){}
    bt.classList.toggle('on',on);if(m!=='atalhos'&&m!=='frase'&&m!=='frases'&&m!=='hist')bt.setAttribute('aria-pressed',String(on));
  }
}
// Barra da imagem (largura 25/50/75/100 % e apagar): só aparece com uma imagem selecionada.
function ntBolha(c){
  const b=document.createElement('div');b.className='nt-bolha';b.hidden=true;b.setAttribute('role','toolbar');b.setAttribute('aria-label','Imagem');
  b.addEventListener('mousedown',e=>e.preventDefault());
  b.innerHTML=`<div class="nt-bolha-img"><button type="button" data-l="25">25%</button><button type="button" data-l="50">50%</button><button type="button" data-l="75">75%</button><button type="button" data-l="100">100%</button><button type="button" data-l="apagar" title="Apagar imagem">🗑</button></div>`;
  b.addEventListener('click',e=>{
    const bt=e.target.closest('button[data-l]');if(!bt||!c.ed)return;
    const s=c.ed.state.selection,n=s.node;if(n?.type.name!=='image')return;
    if(bt.dataset.l==='apagar')c.ed.chain().focus().deleteSelection().run();
    else c.ed.chain().focus().command(({tr})=>{tr.setNodeMarkup(s.from,undefined,{...n.attrs,largura:+bt.dataset.l===100?null:+bt.dataset.l});return true}).run();
  });
  c.bolha=b;c.el.appendChild(b);
}
function ntBolhaPos(c){
  const b=c.bolha,e=c.ed;if(!b||!e)return;
  const s=e.state.selection;
  if(s.node?.type.name!=='image'||(!e.isFocused&&!b.contains(document.activeElement))){b.hidden=true;return}
  b.hidden=false;
  const a=e.view.coordsAtPos(s.from),z=e.view.coordsAtPos(s.to),h=b.offsetHeight||40,w=b.offsetWidth||220,toque=matchMedia('(pointer:coarse)').matches;
  const topo=toque?Math.max(z.bottom,a.bottom)+10:a.top-h-8;
  b.style.top=Math.max(8,Math.min(topo<8?Math.max(z.bottom,a.bottom)+10:topo,innerHeight-h-8))+'px';
  b.style.left=Math.max(8,Math.min((a.left+z.left)/2-w/2,innerWidth-w-8))+'px';
}

// ----- Alça ⋮⋮ (arrastar com mouse; clicar/tocar abre o menu Subir/Descer/Aninhar/Apagar) -----
function ntAlca(c){
  const al=document.createElement('div');al.className='nt-alca';al.contentEditable='false';al.draggable=true;al.hidden=true;al.title='Arrastar (clique para o menu)';al.textContent='⋮⋮';
  const menu=document.createElement('div');menu.className='nt-menu-bloco';menu.hidden=true;
  menu.innerHTML=[['subir','↑ Subir'],['descer','↓ Descer'],['aninhar','⇥ Entrar no anterior'],['sair','⇤ Sair do nível'],['apagar','🗑 Apagar']].map(([k,t])=>`<button type="button" data-a="${k}">${t}</button>`).join('');
  c.el.append(al,menu);c.alcaEl=al;c.menuEl=menu;
  const bloco=()=>c.alvo!=null&&c.ed.state.doc.content.size>c.alvo?ntBlocoPos(c.ed.state.doc,c.alvo):null;
  const mostra=b=>{
    if(!b){al.hidden=true;return}
    c.alvo=b.pos;const dom=c.ed.view.nodeDOM(b.pos);if(!(dom instanceof Element)){al.hidden=true;return}
    const r=dom.getBoundingClientRect(),rc=c.el.getBoundingClientRect(),lh=parseFloat(getComputedStyle(dom).lineHeight)||24,lista=/^(listItem|taskItem)$/.test(b.node.type.name)&&dom.parentElement?dom.parentElement.getBoundingClientRect().left:r.left;   // item de lista: alça fica à esquerda da bolinha
    al.hidden=false;al.style.top=(r.top-rc.top+Math.max(0,(lh-24)/2)+1)+'px';al.style.left=(lista-rc.left-24)+'px';
  };
  c.alcaMostra=mostra;
  c.el.addEventListener('mousemove',e=>{
    if(!c.ed||e.target.closest('.nt-alca,.nt-menu-bloco'))return;
    // A margem da lista não é um bloco do ProseMirror. Preserve o alvo no
    // caminho entre o texto e a alça, inclusive nos níveis aninhados.
    if(!al.hidden){
      const a=al.getBoundingClientRect(),dom=c.ed.view.nodeDOM(c.alvo);
      if(dom instanceof Element&&e.clientY>=a.top&&e.clientY<=a.bottom&&e.clientX>=a.left&&e.clientX<=Math.max(a.right,dom.getBoundingClientRect().left+4))return;
    }
    const v=c.ed.view,pm=v.dom.getBoundingClientRect(),x=Math.min(Math.max(e.clientX,pm.left+40),pm.right-2);
    const r=v.posAtCoords({left:x,top:e.clientY});if(!r)return;
    mostra(r.inside>=0?ntBlocoPos(c.ed.state.doc,r.inside):ntBlocoEm(c.ed.state.doc,r.pos));
  });
  al.addEventListener('dragstart',e=>{
    const b=bloco();if(!b){e.preventDefault();return}
    if(ntBselArrasta(c,e,b))return;   // bloco do grupo selecionado: arrasta o grupo
    const S=TT.pm.state,v=c.ed.view,sel=S.NodeSelection.create(v.state.doc,b.pos);
    v.dispatch(v.state.tr.setSelection(sel));v.dragging={slice:sel.content(),move:true};
    const dom=v.nodeDOM(b.pos);if(dom instanceof Element)e.dataTransfer.setDragImage(dom,0,0);
    e.dataTransfer.effectAllowed='copyMove';e.dataTransfer.setData('text/plain','');
  });
  al.addEventListener('dragend',()=>{c.ed.view.dragging=null;c.grupoArrasto=null});
  al.addEventListener('click',()=>{
    const b=bloco();if(!b)return;
    if(!ntBselPos(c.ed.state).includes(b.pos))c.ed.commands.setNodeSelection(b.pos);
    c.ed.view.focus();   // a alça está fora do contenteditable: Delete/Backspace precisam voltar ao editor já neste clique
    if(!menu.hidden){menu.hidden=true;return}
    menu.hidden=false;menu.style.top=al.offsetTop+26+'px';menu.style.left=al.offsetLeft+'px';
  });
  menu.addEventListener('mousedown',e=>e.preventDefault());
  menu.addEventListener('click',e=>{
    const k=e.target.closest('[data-a]')?.dataset.a,b=bloco();menu.hidden=true;if(!k||!b)return;
    const ed=c.ed;ed.chain().focus().setTextSelection(Math.min(b.pos+1,ed.state.doc.content.size)).run();
    if(k==='subir')ntSobeDesce(ed,b,-1);else if(k==='descer')ntSobeDesce(ed,b,1);
    else if(k==='aninhar')ntAninha(ed,b,false);else if(k==='sair')ntAninha(ed,b,true);
    else if(k==='apagar')ed.view.dispatch(ed.state.tr.delete(b.pos,b.pos+b.node.nodeSize).scrollIntoView());
    c.alvo=null;al.hidden=true;
  });
}

function ntExtensoes(c){
  const E=TT.ext;
  return [E.Document,E.Paragraph,E.Text,E.Heading.configure({levels:[1,2,3]}),E.Bold,E.Italic,E.Underline,E.Strike,
    E.Link.configure({openOnClick:false,autolink:true}),
    E.BulletList,E.OrderedList,E.ListItem,E.TaskList,E.TaskItem.configure({nested:true}),
    E.Blockquote.extend({addInputRules(){return []}}),   // "> " é toggle; citação só pelo menu "/"
    E.HorizontalRule,ntToggle(),E.DetailsSummary,E.DetailsContent,ntDestaque(),ntImagem(),ntPaginaLink(),
    E.TextStyle.extend({addAttributes(){return {...this.parent?.(),codigo:{default:null,parseHTML:el=>el.hasAttribute('data-codigo')?true:null,renderHTML:a=>a.codigo?{'data-codigo':'true',class:'nt-code'}:{}}}}}),E.Color,E.BackgroundColor,E.UndoRedo,E.Dropcursor.configure({color:'#5687be',width:2}),E.Gapcursor,E.TrailingNode,
    E.Placeholder.configure({placeholder:({node})=>node.type.name==='detailsSummary'?'Toggle':node.type.name==='heading'?'Título':"Digite '/' para ver os comandos"}),
    ntIds(),ntRegraToggle(),ntAtalhos(c),ntSlash(c),ntLembrete(),ntLembretePlugin(c),ntBuscaExt(),ntBselExt(c),
    TT.Extension.create({name:'envioImagem',addProseMirrorPlugins(){return [ntPluginEnvio()]}})];
}
// Separa os blocos que o editor aceita dos inválidos (plano corrompido): um bloco ruim não derruba a aba nem apaga as outras notas.
function ntValidos(blocos){
  const bons=[],ruins=[];
  if(!Array.isArray(blocos))return {bons,ruins,corrompido:true};
  let t;
  try{t=new TT.Editor({extensions:ntExtensoes(NT)});
    for(const b of blocos){try{if(!b||typeof b.id!=='string')throw 0;t.schema.nodeFromJSON(b.conteudo).check();bons.push(b)}catch(e){ruins.push(b)}}
  }catch(e){return {bons:[],ruins:blocos,corrompido:true}}finally{try{t?.destroy()}catch(e){}}
  return {bons,ruins,corrompido:false};
}
// Guarda os blocos inválidos em notas_conflitos (uma vez só: id+data fixos).
function ntGuardaRuins(ruins,motivo='bloco inválido',pagina){
  if(!ruins.length)return;
  const novos=ruins.map((b,i)=>({id:String(b?.id||'sem-id-'+i),em:String(b?.atualizado||'invalido'),motivo,...(pagina?{pagina}:{}),conteudo:b?.conteudo??null}));
  const todos=ntJuntaConflitos(SM.d.notas_conflitos,novos);
  if(JSON.stringify(todos)!==JSON.stringify(SM.d.notas_conflitos||[]))smMudar(d=>{d.notas_conflitos=ntJuntaConflitos(d.notas_conflitos,novos)},'notas: '+motivo+' guardado');
}
// Cria o editor do contexto `c` (página principal ou painel) com os `blocos`; `aoMudar` roda ~1 s depois da última digitação.
function ntEditor(c,blocos,aoMudar){
  c.el=document.createElement('div');c.el.className='nt-ed';
  c.ed=new TT.Editor({element:c.el,extensions:ntExtensoes(c),content:ntDocumento(blocos),
    editorProps:{attributes:{class:'nt-pm','aria-label':c.pagina?'Página':'Notas',spellcheck:'true'},
      transformPastedHTML:h=>h.replace(/<img\b(?![^>]*\bsrc="\.\/img\/)[^>]*>/gi,''),
      handlePaste:(v,e)=>{
        const cd=e.clipboardData;if(!cd)return false;
        const texto=cd.getData('text/plain'),arq=[...(cd.items||[])].find(i=>i.kind==='file'&&/^image\//.test(i.type))?.getAsFile();
        if(arq&&texto){e.preventDefault();v.pasteText(texto);return true}   // Excel/Word trazem imagem + texto: cola o texto
        if(arq){e.preventDefault();ntInsereImagem(arq,undefined,c);return true}
        return false},
      handleDrop:(v,e,slice,moved)=>{
        const arq=!moved&&[...(e.dataTransfer?.files||[])].find(f=>/^image\//.test(f.type));if(!arq)return false;
        e.preventDefault();ntInsereImagem(arq,v.posAtCoords({left:e.clientX,top:e.clientY})?.pos,c);return true},
      handleClick:(v,pos,e)=>{const lb=e.target.closest?.('.nt-lemb');if(lb){ntLembreteEdita(c,lb,v.posAtDOM(lb,0));return true}if((e.ctrlKey||e.metaKey)&&e.target.closest?.('a[href]')){window.open(e.target.closest('a').href,'_blank','noopener');return true}return false}}});
  c.ed.on('update',({transaction:t})=>{if(t.getMeta('ntRemoto')){c.rdMostrado=null;return}c.sujo=true;if(typeof rdGancho==='function')rdGancho('editor',c);clearTimeout(c.timer);c.timer=setTimeout(aoMudar,1000)});
  c.ed.on('transaction',({transaction:t})=>{if(c.posImg!=null)c.posImg=t.mapping.map(c.posImg);if(c.buscaEl)ntBuscaPinta(c)});
  for(const ev of ['selectionUpdate','update','focus','blur'])c.ed.on(ev,()=>setTimeout(()=>{if(!c.ed)return;ntBolhaPos(c);ntBarraPinta(c);if(ev==='selectionUpdate'&&matchMedia('(pointer:coarse)').matches)c.alcaMostra?.(ntBlocoEm(c.ed.state.doc,c.ed.state.selection.from))},ev==='blur'?150:0));
  c.el.addEventListener('keydown',e=>{if(e.key==='Tab')e.stopPropagation()});   // depois do ProseMirror: Tab não troca de aba
  ntBolha(c);ntAlca(c);
}
function ntCria(){
  const lista=SM.d.notasDoc?.blocos,v=ntValidos(lista);
  ntGuardaRuins(v.ruins);
  if(v.corrompido||(v.ruins.length&&!v.bons.length)){ntFalha();return false}   // nada aproveitável: oferece restaurar
  NT.shown=lista;ntEditor(NT,v.bons,ntSalvaDoc);ntBarra(NT);ntBarraPinta(NT);
  return true;
}
// Plano de notas sem nenhum bloco aproveitável: não abre o editor (um documento vazio apagaria tudo ao salvar); oferece a cópia da 1.38.
function ntFalha(){
  const raiz=document.getElementById('nt_raiz');if(!raiz)return;
  const tem=Array.isArray(SM.d?.notas_v138)&&SM.d.notas_v138.length;
  raiz.innerHTML=`<div class="card"><p>Não consegui abrir as notas: o documento salvo está corrompido. Os blocos ficaram guardados em notas_conflitos.</p>${tem?'<button type="button" class="b" id="nt_restaura" onclick="ntRestaura()">Restaurar das notas antigas (cópia da 1.38)</button>':'<p class="mut">Não há cópia das notas antigas neste plano.</p>'}</div>`;
}
async function ntRestaura(){
  const v=SM.d?.notas_v138;if(!Array.isArray(v)||!v.length)return;
  await ntMigraLegado();
  const d={notas:JSON.parse(JSON.stringify(v))};ntMigra(d);
  if(!ntFilaGrava('blocos',ntBaseLer()||[],d.notasDoc.blocos))return;
  NT.ed?.destroy();NT.ed=null;NT.el=null;NT.shown=null;
  ntAplica(SM.d,ntPendentes());smGuardaCache();return ntSync();
}
// Aplica no editor do contexto `c` SÓ os blocos de topo que mudaram (transação do ProseMirror, fora do histórico do Ctrl+Z): cursor, seleção e o
// que está sendo digitado nos outros blocos não são tocados. Nunca setContent no documento inteiro.
function ntAplicaNoEditor(c,alvo,local=false){   // local: restauração do histórico = edição nova (entra no Ctrl+Z e é salva pela fila normal)
  const ed=c.ed,nos=new Map();
  for(const b of alvo)try{const n=ed.state.schema.nodeFromJSON(b.conteudo);n.check();nos.set(b.id,n)}catch(e){}   // bloco inválido fica de fora (já está em notas_conflitos)
  alvo=alvo.filter(b=>nos.has(b.id));if(!alvo.length)return;
  const ids=new Set(alvo.map(b=>b.id)),tr=ed.state.tr,topo=()=>{const a=[];tr.doc.forEach((n,pos)=>a.push({id:n.attrs.id,n,pos}));return a};
  let p=0;
  for(const b of alvo){
    const cur=topo(),no=nos.get(b.id);
    while(cur[p]&&!ids.has(cur[p].id))p++;   // os que sumiram são apagados no fim
    const at=cur[p];
    if(at&&at.id===b.id){if(!at.n.eq(no))tr.replaceWith(at.pos,at.pos+at.n.nodeSize,no);p++;continue}
    const j=cur.findIndex((x,i)=>i>p&&x.id===b.id);
    if(j>=0)tr.delete(cur[j].pos,cur[j].pos+cur[j].n.nodeSize);   // o bloco veio de mais adiante (mudou de lugar)
    tr.insert(at?at.pos:tr.doc.content.size,no);p++;
  }
  for(const x of topo().reverse())if(!ids.has(x.id))tr.delete(x.pos,x.pos+x.n.nodeSize);
  if(tr.docChanged)ed.view.dispatch(local?tr:tr.setMeta('addToHistory',false).setMeta('ntRemoto',true));
}
// Mostra no editor o documento do plano (outro aparelho mudou), sem atropelar o que está sendo digitado.
function ntSincroniza(){ntSincMain();pgSincroniza();ntLateralPinta()}
function ntSincMain(){
  if(!NT.ed||!SM.d?.notasDoc||NT.sujo)return;
  const alvo=SM.d.notasDoc.blocos;
  if(JSON.stringify(alvo)===JSON.stringify(NT.shown))return;
  try{ntAplicaNoEditor(NT,alvo);NT.shown=alvo}
  catch(e){console.warn('notas: não consegui atualizar o editor; recriando',e);try{NT.ed.destroy()}catch(e2){}NT.ed=null;NT.el=null;NT.shown=null;smRender()}   // sem digitação pendente (sujo=false): recriar do plano é seguro
}
function ntMonta(){
  if(!document.getElementById('nt_raiz')||!SM.d)return;
  if(!window.TT){document.getElementById('nt_raiz').innerHTML='<p class="mut">O editor não carregou (vendor/tiptap.js). Atualize o app.</p>';return}
  if(!SM.d.notasDoc)smMudar(d=>ntMigra(d),'notas: migração para página única');   // redesenha a aba: pega o contêiner de novo
  const raiz=document.getElementById('nt_raiz');if(!raiz)return;
  if(!NT.ed&&!ntCria())return;
  if(NT.el.parentNode!==raiz)raiz.appendChild(NT.el);
  const slot=document.getElementById('nt_barra');if(slot&&NT.barra&&NT.barra.parentNode!==slot)slot.appendChild(NT.barra);
  const h=document.querySelector('header');if(h)raiz.closest('.nt')?.style.setProperty('--nt-top',Math.round(h.getBoundingClientRect().height)+'px');   // a barra gruda logo abaixo do cabeçalho do app
  ntSincroniza();
  if(NT.eraFoco){NT.eraFoco=false;NT.ed.commands.focus(null,{scrollIntoView:false})}
}
// Botão + e Alt+A: novo toggle no topo da página (ou da página aberta no painel), já com o cursor no título.
function ntAbre(){
  const c=NP?.ed?NP:NT;if(!c.ed)return;
  c.ed.chain().insertContentAt(0,{type:'details',content:[{type:'detailsSummary'},{type:'detailsContent',content:[{type:'paragraph'}]}]}).setTextSelection(2).focus().run();
  (c===NT?window:c.el.closest('.nt-pan-corpo')).scrollTo({top:0});
}
function vNotas(){
  if(!SM.d)return '<div class="card"><p class="mut">As notas ainda não estão disponíveis neste aparelho. Tente novamente com conexão.</p></div>';
  NT.eraFoco=!!NT.ed&&!!NT.el&&NT.el.contains(document.activeElement);   // a aba é redesenhada: devolve o foco ao editor
  setTimeout(ntMonta,0);
  const lat=ntLateralAberta();
  return `<div class="nt"><div class="nt-topo"><button type="button" class="b s nt-lat-bt" id="nt_lat_bt" onclick="ntLateralAlterna()" title="Passe o mouse para ver a lista de páginas; clique para fixar ou soltar" aria-label="Páginas" aria-expanded="${lat}">☰</button><h2>Notas</h2><div class="nt-barra-slot" id="nt_barra"></div><button type="button" class="b s nt-aba-bt" id="nt_aba_bt" onclick="ntAbaAbre('notas')" title="Abrir as Notas em outra aba do navegador" aria-label="Abrir as Notas em nova aba">↗</button></div>${SM.erro?'<p class="sm-err">Alterações salvas neste aparelho; sincronização pendente.</p>':''}<div class="nt-corpo${lat?'':' lat-off'}" style="--nt-lat-w:${ntLatW()}px"><aside class="nt-lat" id="nt_lat" aria-label="Páginas">${ntLateralHtml()}</aside><div class="nt-lat-rz" id="nt_lat_rz" role="separator" aria-orientation="vertical" aria-label="Largura da barra de páginas" title="Arraste para mudar a largura (duplo clique volta ao padrão)"></div><div class="nt-lat-fundo" onclick="ntLateralAlterna()"></div><div class="nt-conteudo" id="nt_raiz"></div></div></div>`;
}

// ===== Páginas (1.41): bloco-link, dados, painel flutuante, barra lateral =====
// Bloco-link para uma página (comando "/Página"): clicar abre o painel. Apagar o bloco NÃO apaga a página.
function ntPlinkTexto(el){const p=pgAchar(el.dataset.pagina);el.classList.toggle('sem',!p);el.textContent='📄 '+(p?(p.titulo||'Sem título'):'Página excluída')}
const ntPaginaLinks=()=>{for(const c of [NT,NP])c?.el?.querySelectorAll('.nt-plink').forEach(ntPlinkTexto)};   // (pelo editor, não pelo document: a aba é redesenhada e o editor fica solto por instantes)
function ntPaginaLink(){
  return TT.Node.create({name:'paginaLink',group:'block',atom:true,selectable:true,
    addAttributes(){return {pagina:{default:null,parseHTML:el=>el.getAttribute('data-pagina'),renderHTML:a=>({'data-pagina':a.pagina})}}},
    parseHTML(){return [{tag:'div[data-type="pagina-link"]'}]},
    renderHTML({HTMLAttributes}){return ['div',TT.mergeAttributes(HTMLAttributes,{'data-type':'pagina-link'})]},
    addNodeView(){return ({node})=>{
      const dom=document.createElement('div');dom.className='nt-plink';dom.contentEditable='false';dom.setAttribute('role','button');dom.title='Abrir a página';
      let atual=node;const pinta=()=>{dom.dataset.pagina=atual.attrs.pagina||'';ntPlinkTexto(dom)};pinta();
      dom.addEventListener('click',e=>{e.preventDefault();const p=pgAchar(atual.attrs.pagina);if(p)ntPainelAbre(p.id);else toast('Esta página foi excluída.')});
      return {dom,ignoreMutation:()=>true,update(n){if(n.type!==atual.type)return false;atual=n;pinta();return true}};
    }},
  });
}
// Toda mudança nas páginas entra na fila (NT_PEND.paginas), no plano local e sobe pelo mesmo ntSync das notas.
function pgGrava(l,pastas){
  if(typeof rdGancho==='function')rdGancho('edicao',rdGancho('antes',{notasPaginas:{paginas:ntPaginas()}}),{notasPaginas:{paginas:l}});
  if(!ntFilaGrava('paginas',ntPaginas(),l,pastas?{pastas,basePastas:ntPastas()}:{}))return false;
  SM.d.notasPaginas={...SM.d.notasPaginas,v:1,paginas:l,...(pastas?{pastas}:{})};smGuardaCache();ntSync();ntLateralPinta();ntPaginaLinks();return true;
}
function pgMuda(fn){if(!SM.d)return false;const l=JSON.parse(JSON.stringify(ntPaginas()));fn(l);return pgGrava(l)}
function ntPastasMuda(fn){
  if(!SM.d)return false;const l=JSON.parse(JSON.stringify(ntPastas()));fn(l);
  if(!ntFilaGrava('pastas',ntPastas(),l))return false;
  SM.d.notasPaginas={...SM.d.notasPaginas,v:1,pastas:l};smGuardaCache();ntSync();ntLateralPinta();return true;
}
function ntPastaForm(id,a){NT.pastaForm={id,a};ntLateralPinta();const i=document.querySelector('#nt_lat .nt-pt-titulo');i?.focus();i?.select()}
function ntPastaSalva(){
  const f=NT.pastaForm,titulo=document.querySelector('#nt_lat .nt-pt-titulo')?.value.trim();if(!f||!titulo)return;
  const agora=ntAgora();
  if(ntPastasMuda(l=>{if(f.id){const p=l.find(p=>p.id===f.id);if(p){p.titulo=titulo;p.atualizado=agora}}else l.push({id:ntNovoId().replace(/^b/,'f'),titulo,ordem:Math.max(0,...l.map(p=>+p.ordem||0))+10,criado:agora,atualizado:agora})}))NT.pastaForm=null;
  ntLateralPinta();
}
function ntPastaExclui(id){if(ntPastasMuda(l=>{const i=l.findIndex(p=>p.id===id);if(i>=0)l.splice(i,1)}))NT.pastaForm=null;ntLateralPinta()}
function ntPastaAlterna(id){const l=ntLsLista(NT_PT_FECHADAS)||[],i=l.indexOf(id);if(i<0)l.push(id);else l.splice(i,1);try{localStorage.setItem(NT_PT_FECHADAS,JSON.stringify(l))}catch(e){}ntLateralPinta()}
function ntPastaMove(id,ref,depois){ntPastasMuda(l=>{const a=l.find(p=>p.id===id);if(!a)return;const sec=l.filter(p=>p.id!==id).sort(ntPgOrdem);let i=sec.findIndex(p=>p.id===ref);if(i<0)i=sec.length;else if(depois)i++;sec.splice(i,0,a);sec.forEach((p,n)=>{if(p.ordem!==(n+1)*10){p.ordem=(n+1)*10;p.atualizado=ntAgora()}})})}
function ntPaginaPasta(id,pasta){
  if(pasta&&!ntPastas().some(p=>p.id===pasta))return false;
  return pgMuda(l=>{const p=l.find(p=>p.id===id);if(p){p.pasta=pasta;p.ordem=Math.max(0,...l.filter(x=>x.id!==id&&ntPastaDa(x)===pasta).map(x=>+x.ordem||0))+10;p.atualizado=ntAgora()}});
}
function ntPaginaMoverMenu(id){
  const p=pgAchar(id);if(!p)return;
  const ov=ntModal('nt-mover','<h3>Mover para…</h3><select aria-label="Pasta de destino"><option value="">Fora de pasta</option></select><button type="button" class="b">Mover</button>');
  const sel=ov.querySelector('select');for(const f of [...ntPastas()].sort(ntPgOrdem)){const o=document.createElement('option');o.value=f.id;o.textContent=f.titulo;sel.appendChild(o)}sel.value=ntPastaDa(p);
  ov.querySelector('button').onclick=()=>{if(ntPaginaPasta(id,sel.value))ntModalFecha(ov)};sel.focus();
}
const ntAgora=()=>new Date().toISOString();
function ntPaginaCria(){
  const agora=ntAgora(),id=ntNovoId().replace(/^b/,'p'),bid=ntNovoId(),ordem=Math.max(0,...ntPaginas().map(p=>Number(p.ordem)||0))+10;
  if(!pgMuda(l=>l.push({id,titulo:'',fixada:false,pasta:'',ordem,criado:agora,atualizado:agora,doc:{v:1,blocos:[{id:bid,atualizado:agora,conteudo:{type:'paragraph',attrs:{id:bid}}}]}})))return null;
  return id;
}
function ntPaginaNova(){const id=ntPaginaCria();if(id)ntPainelAbre(id);return id}   // botão "+ Nova página"
function ntPaginaDoSlash(c){const id=ntPaginaCria();c.ed.chain().focus().insertContent({type:'paginaLink',attrs:{pagina:id}}).run();ntPainelAbre(id)}   // "/Página"
function ntPaginaFixa(id){
  const p=pgAchar(id);if(!p)return;
  pgMuda(l=>{const x=l.find(y=>y.id===id),fixa=!x.fixada;x.fixada=fixa;x.atualizado=ntAgora();   // vai para o fim da seção de destino
    x.ordem=Math.max(0,...l.filter(y=>y.id!==id&&!!y.fixada===fixa).map(y=>Number(y.ordem)||0))+10});
  ntPainelPinta();
}
function ntPaginaExclui(id){
  if(NP?.pagina===id)ntPainelFecha(true);
  pgMuda(l=>{const i=l.findIndex(y=>y.id===id);if(i>=0)l.splice(i,1)});toast('Página excluída.');
}
// Reordena dentro da seção (fixadas / páginas): `id` passa para antes (ou depois) de `ref`; só quem mudou de ordem é regravado.
function ntPaginaMove(id,ref,depois,pasta){
  pgMuda(l=>{
    const a=l.find(p=>p.id===id);if(!a)return;
    const alvo=ref&&l.find(p=>p.id===ref);
    if(pasta!==undefined||alvo&&!a.fixada){const dest=pasta??ntPastaDa(alvo);if(a.pasta!==dest){a.pasta=dest;a.atualizado=ntAgora()}}
    const sec=l.filter(p=>!!p.fixada===!!a.fixada&&(a.fixada||ntPastaDa(p)===ntPastaDa(a))&&p.id!==id).sort(ntPgOrdem);
    let i=ref?sec.findIndex(p=>p.id===ref):sec.length;if(i<0)i=sec.length;else if(depois)i++;
    sec.splice(i,0,a);const agora=ntAgora();
    sec.forEach((p,n)=>{const o=(n+1)*10;if(p.ordem!==o){p.ordem=o;p.atualizado=agora}});
  });
}
// Salva o texto do painel (1 s depois de parar de digitar, ao fechar ou antes de entrar um plano remoto).
function pgSalvaDoc(){
  const c=NP;if(!c?.ed||!SM.d)return;clearTimeout(c.timer);
  const p=pgAchar(c.pagina);
  if(!p){   // página apagada em outro aparelho enquanto se digitava nela: o que foi digitado vai para notas_conflitos
    const novos=ntBlocos(c.ed.getJSON(),c.shown||[]).filter(b=>!(c.shown||[]).includes(b));c.sujo=false;
    if(novos.length){c.resgatou=true;ntGuardaRuins(novos,'página apagada em outro aparelho',c.pagina);toast('A página foi apagada em outro aparelho; guardei o que você digitou em notas_conflitos.')}
    return;
  }
  const ant=c.shown||p.doc?.blocos||[],blocos=ntBlocos(c.ed.getJSON(),ant);c.sujo=false;
  if(JSON.stringify(blocos)===JSON.stringify(ant))return;
  ntLembSincroniza(ant,blocos);
  const agora=ntAgora();
  if(pgMuda(l=>{const x=l.find(y=>y.id===c.pagina);if(x){x.doc={v:1,blocos};x.atualizado=agora}}))c.shown=blocos;else c.sujo=true;
}
function pgTituloSalva(){
  const c=NP;if(!c?.titulo)return;clearTimeout(c.tituloTimer);
  const p=pgAchar(c.pagina),v=c.titulo.value;if(!p||(p.titulo||'')===v)return;
  const agora=ntAgora();pgMuda(l=>{const x=l.find(y=>y.id===c.pagina);if(x){x.titulo=v;x.atualizado=agora}});
}
// Chega plano de outro aparelho: o painel aberto recebe só os blocos que mudaram (ou fecha, se a página foi excluída lá).
function pgSincroniza(){
  const c=NP;if(!c?.ed)return;
  const p=pgAchar(c.pagina);
  if(!p){const resgatou=c.sujo||c.resgatou;if(c.sujo)pgSalvaDoc();ntPainelFecha(true);if(!resgatou)toast('A página foi excluída em outro aparelho.');return}   // (com texto digitado, o aviso do resgate já diz o que houve)
  if(c.titulo&&document.activeElement!==c.titulo&&c.titulo.value!==(p.titulo||''))c.titulo.value=p.titulo||'';
  ntPainelPinta();if(c.sujo)return;
  const alvo=Array.isArray(p.doc?.blocos)?p.doc.blocos:[];if(JSON.stringify(alvo)===JSON.stringify(c.shown))return;
  try{ntAplicaNoEditor(c,alvo);c.shown=alvo}
  catch(e){console.warn('notas: não consegui atualizar a página; reabrindo',e);const id=c.pagina;ntPainelFecha(true);ntPainelAbre(id)}
}
function ntPainelPinta(){
  const c=NP,p=c&&pgAchar(c.pagina),b=document.querySelector('#nt_pan [data-a="pin"]');if(!b||!p)return;
  if(c.aba&&document.activeElement!==c.titulo)document.title=p.titulo||'Sem título';   // título da aba do navegador = título da página
  b.classList.toggle('on',!!p.fixada);b.title=b.ariaLabel=p.fixada?'Desafixar página':'Fixar página';b.setAttribute('aria-pressed',String(!!p.fixada));
}
function ntPainelAbre(id,aba=false){
  if(!SM.d||!window.TT)return;const p=pgAchar(id);if(!p){toast('Página não encontrada.');return}
  if(NP?.aba)aba=true;   // a lateral troca a página nesta mesma aba
  if(NP){if(NP.pagina===id)return;ntPainelFecha()}
  ntAntes();if(matchMedia('(max-width:700px)').matches&&NT.latMov)ntLateralAlterna();
  const v=ntValidos(p.doc?.blocos);ntGuardaRuins(v.ruins);
  const c=NP=ntCtx(),ov=document.createElement('div');c.pagina=id;c.aba=aba;c.shown=Array.isArray(p.doc?.blocos)?p.doc.blocos:[];
  ov.id='nt_pan';ov.className='nt-pan'+(aba?' aba':'');ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-label','Página');
  ov.innerHTML=`<div class="nt-pan-c"><div class="nt-pan-topo"><div class="nt-pan-barra"></div><button type="button" class="nt-pan-b" data-a="aba" title="Abrir em nova aba do navegador" aria-label="Abrir em nova aba">↗</button><button type="button" class="nt-pan-b" data-a="pin" aria-label="Fixar página">📌</button><span class="nt-pan-exc"><button type="button" class="nt-pan-b" data-a="exc" title="Excluir página" aria-label="Excluir página">🗑</button><span class="nt-pan-conf" hidden>Excluir esta página? <button type="button" class="nt-pan-b ruim" data-a="exc-sim">Excluir</button><button type="button" class="nt-pan-b" data-a="exc-nao">Cancelar</button></span></span><button type="button" class="nt-pan-b" data-a="fecha" title="Fechar (Esc)" aria-label="Fechar página">✕</button></div><div class="nt-pan-corpo"><input type="text" class="nt-pan-titulo" placeholder="Sem título" aria-label="Título da página" maxlength="200" autocomplete="off"><div class="nt-pan-ed"></div></div></div>`;
  document.body.appendChild(ov);document.body.style.overflow='hidden';
  if(aba){
    document.getElementById('nt_aba_fim')?.remove();
    const corpo=ov.querySelector('.nt-pan-corpo');corpo.classList.add('nt-conteudo');
    corpo.outerHTML=ntLateralEstrutura(corpo.outerHTML);
    ov.querySelector('.nt-pan-topo').insertAdjacentHTML('afterbegin',ntLateralBotao());
    history.replaceState(null,'',ntAbaUrl(id));
  }
  c.titulo=ov.querySelector('.nt-pan-titulo');c.titulo.value=p.titulo||'';
  ntEditor(c,v.bons,pgSalvaDoc);ov.querySelector('.nt-pan-ed').appendChild(c.el);ov.querySelector('.nt-pan-barra').appendChild(ntBarra(c));ntBarraPinta(c);
  let abaixo=false;
  ov.addEventListener('pointerdown',e=>{abaixo=e.target===ov});
  ov.addEventListener('click',e=>{
    if(e.target===ov&&abaixo&&!c.aba){ntPainelFecha();return}
    const a=e.target.closest('.nt-pan-topo [data-a]')?.dataset.a,conf=ov.querySelector('.nt-pan-conf'),exc=ov.querySelector('[data-a="exc"]');
    if(a==='fecha')ntPainelFecha();else if(a==='pin')ntPaginaFixa(c.pagina);
    else if(a==='aba'){ntAbaAbre(c.pagina);ntPainelFecha()}
    else if(a==='exc'){conf.hidden=false;exc.hidden=true}
    else if(a==='exc-nao'){conf.hidden=true;exc.hidden=false}
    else if(a==='exc-sim')ntPaginaExclui(c.pagina);
  });
  c.titulo.addEventListener('input',()=>{if(c.aba)document.title=c.titulo.value||'Sem título';clearTimeout(c.tituloTimer);c.tituloTimer=setTimeout(pgTituloSalva,600)});
  c.titulo.addEventListener('blur',pgTituloSalva);
  c.titulo.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();c.ed.commands.focus('start')}});
  ntPainelPinta();ntLateralPinta();
  setTimeout(()=>{if(NP!==c)return;if(p.titulo)c.ed.commands.focus('end');else c.titulo.focus()},0);
}
// `sem`: fecha sem salvar (página excluída).
function ntPainelFecha(sem){
  const c=NP;if(!c)return;
  if(!sem){pgTituloSalva();pgSalvaDoc()}
  clearTimeout(c.timer);clearTimeout(c.tituloTimer);NP=null;c.buscaEl?.remove();
  try{c.ed.destroy()}catch(e){}
  c.ed=null;document.getElementById('nt_pan')?.remove();document.body.style.overflow='';
  ntLateralPinta();ntPaginaLinks();
  if(c.aba)ntAbaMsg(sem?'Esta página foi excluída.':'Página fechada.');
}
// ===== Abas do navegador (1.43): ./?pagina=<id> abre o app direto numa página, em tela inteira; ./?pagina=notas, a página principal =====
// Várias abas dividem o localStorage (fila NT_PEND): o evento `storage` (abaixo) funde o que a outra aba gravou, a base de fusão é por aba (NTB).
const NTA=(()=>{try{const q=new URLSearchParams(location.search);return q.get('pagina')||(q.get('aba')==='notas'?'notas':'')}catch(e){return ''}})();
const ntAbaUrl=id=>new URL(id==='notas'?'./?aba=notas':'./?pagina='+encodeURIComponent(id),location.href).href;
function ntAbaAbre(id){ntAntes();if(NP)pgTituloSalva();window.open(ntAbaUrl(id),'_blank','noopener')}   // (o que está sendo digitado entra na fila antes: a aba nova abre com ele)
function ntPgClique(e,id){if(e.ctrlKey||e.metaKey||e.shiftKey||e.button){ntAntes();if(NP)pgTituloSalva();return true}ntPainelAbre(id);return false}   // Ctrl+clique e clique do meio: o navegador abre o endereço da página numa aba
function ntAbaMsg(txt){
  document.getElementById('nt_aba_fim')?.remove();
  const d=document.createElement('div');d.id='nt_aba_fim';d.className='nt-aba-fim';d.innerHTML=`<p>${esc(txt)}</p><a href="./">Abrir o Radio</a>`;document.body.appendChild(d);
}
function ntAbaIni(){
  if(!NTA)return;
  document.body.classList.add('nt-aba');
  if(NTA==='notas'){document.title='Notas';go('notas');return}
  document.body.classList.add('nt-aba-pg');document.title='Página';
  let n=0,puxou=false;
  const tenta=()=>{
    if(!SM.d||!window.TT){if(++n<100)setTimeout(tenta,200);else ntAbaMsg('Não consegui abrir: este aparelho ainda não tem as notas. Abra o app uma vez com conexão.');return}
    if(!pgAchar(NTA)){   // página criada em outro aparelho e ainda não baixada: busca uma vez
      if(!puxou){puxou=true;smPuxar().then(tenta,tenta);return}
      ntAbaMsg('Página não encontrada (foi excluída ou ainda não chegou a este aparelho).');return;
    }
    ntPainelAbre(NTA,true);
  };
  tenta();
}
setTimeout(ntAbaIni,0);

// ===== Barra lateral retrátil: Fixadas / Páginas, arrastar para ordenar =====
const ntMovel=()=>matchMedia('(max-width:700px)').matches;
function ntLateralAberta(){if(ntMovel())return !!NT.latMov;try{return localStorage.getItem(NT_LAT)!=='0'}catch(e){return true}}   // celular: sempre começa recolhida
// Largura (por aparelho, 180 a 480 px; duplo clique na margem volta a 230) e abertura temporária ao passar o mouse sobre o ☰ (só mouse, só no PC).
const ntLatClamp=w=>Math.max(180,Math.min(480,Math.round(w)||230));
const ntLatW=()=>{try{return ntLatClamp(+localStorage.getItem(NT_LATW)||230)}catch(e){return 230}};
function ntLateralAlterna(){
  const corpo=document.querySelector('.nt-corpo');if(!corpo)return;
  corpo.classList.remove('lat-hover');   // clicar no botão fixa (ou solta) a barra
  const off=corpo.classList.toggle('lat-off');
  if(ntMovel())NT.latMov=!off;else try{localStorage.setItem(NT_LAT,off?'0':'1')}catch(e){}
  document.getElementById('nt_lat_bt')?.setAttribute('aria-expanded',String(!off));
}
// Ao cruzar o breakpoint, aplique a preferência do modo de destino. Uma
// lateral de desktop aberta não pode cobrir o botão de abertura no celular.
if(typeof matchMedia==='function')matchMedia('(max-width:700px)').addEventListener?.('change',()=>{
  const corpo=document.querySelector('.nt-corpo');if(!corpo)return;
  const aberta=ntLateralAberta();corpo.classList.toggle('lat-off',!aberta);corpo.classList.remove('lat-hover');
  document.getElementById('nt_lat_bt')?.setAttribute('aria-expanded',String(aberta));
});
let ntLatT=0;
document.addEventListener('pointerover',e=>{
  if(e.pointerType!=='mouse')return;
  const corpo=document.querySelector('.nt-corpo');if(!corpo)return;
  const em=e.target.closest?.('#nt_lat_bt,#nt_lat,#nt_lat_rz');
  if(em){
    clearTimeout(ntLatT);
    if(em.id==='nt_lat_bt'&&corpo.classList.contains('lat-off')&&!corpo.classList.contains('lat-hover')&&!ntMovel()){
      corpo.style.setProperty('--nt-lat-x',corpo.getBoundingClientRect().left+'px');corpo.classList.add('lat-hover');
    }
    return;
  }
  if(corpo.classList.contains('lat-hover')){clearTimeout(ntLatT);ntLatT=setTimeout(()=>corpo.classList.remove('lat-hover'),300)}   // tolerância: não pisca no caminho do botão até a barra
});
document.documentElement?.addEventListener('mouseleave',()=>{const c=document.querySelector('.nt-corpo.lat-hover');if(c){clearTimeout(ntLatT);ntLatT=setTimeout(()=>c.classList.remove('lat-hover'),300)}});
document.addEventListener('pointerdown',e=>{   // arrastar a margem direita da barra muda a largura
  const rz=e.target.closest?.('#nt_lat_rz');if(!rz||e.button!==0)return;
  const corpo=rz.closest('.nt-corpo'),x0=e.clientX,w0=document.getElementById('nt_lat').offsetWidth;let w=w0;e.preventDefault();
  try{rz.setPointerCapture(e.pointerId)}catch(x){}rz.classList.add('arrasta');
  const mv=ev=>{w=ntLatClamp(w0+ev.clientX-x0);corpo.style.setProperty('--nt-lat-w',w+'px')},
    fim=()=>{rz.removeEventListener('pointermove',mv);rz.removeEventListener('pointerup',fim);rz.removeEventListener('pointercancel',fim);rz.classList.remove('arrasta');try{localStorage.setItem(NT_LATW,String(w))}catch(x){}};
  rz.addEventListener('pointermove',mv);rz.addEventListener('pointerup',fim);rz.addEventListener('pointercancel',fim);
});
document.addEventListener('dblclick',e=>{if(!e.target.closest?.('#nt_lat_rz'))return;try{localStorage.removeItem(NT_LATW)}catch(x){}document.querySelector('.nt-corpo')?.style.setProperty('--nt-lat-w','230px')});
function ntLateralBotao(){return `<button type="button" class="nt-pan-b nt-lat-bt" id="nt_lat_bt" onclick="ntLateralAlterna()" title="Passe o mouse para ver a lista de páginas; clique para fixar ou soltar" aria-label="Páginas" aria-expanded="${ntLateralAberta()}">☰</button>`}
function ntLateralEstrutura(conteudo){return `<div class="nt-corpo${ntLateralAberta()?'':' lat-off'}" style="--nt-lat-w:${ntLatW()}px"><aside class="nt-lat" id="nt_lat" aria-label="Páginas">${ntLateralHtml()}</aside><div class="nt-lat-rz" id="nt_lat_rz" role="separator" aria-orientation="vertical" aria-label="Largura da barra de páginas" title="Arraste para mudar a largura (duplo clique volta ao padrão)"></div><div class="nt-lat-fundo" onclick="ntLateralAlterna()"></div>${conteudo}</div>`}
let ntPgMenuFecha=null;
function ntPaginaMenu(id,x,y){
  if(!pgAchar(id))return;
  ntPgMenuFecha?.();
  const m=document.createElement('div');m.id='nt_pg_menu';m.className='nt-menu-bloco nt-pg-menu';m.setAttribute('role','menu');m.setAttribute('aria-label','Página');
  m.innerHTML='<button type="button" role="menuitem" data-excluir>Excluir</button>';
  document.body.appendChild(m);
  const fecha=()=>{m.remove();document.removeEventListener('pointerdown',fora,true);document.removeEventListener('keydown',tecla,true);ntPgMenuFecha=null};ntPgMenuFecha=fecha;
  const fora=e=>{if(!m.contains(e.target))fecha()},tecla=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();fecha()}};
  document.addEventListener('pointerdown',fora,true);document.addEventListener('keydown',tecla,true);
  const posiciona=()=>{m.style.left=Math.max(4,Math.min(x,innerWidth-m.offsetWidth-4))+'px';m.style.top=Math.max(4,Math.min(y,innerHeight-m.offsetHeight-4))+'px'};
  m.onclick=e=>{
    if(e.target.closest('[data-excluir]')){m.innerHTML='<span>Excluir esta página?</span><button type="button" data-sim>Excluir</button><button type="button" data-nao>Cancelar</button>';posiciona();m.querySelector('[data-nao]').focus()}
    else if(e.target.closest('[data-sim]')){fecha();ntPaginaExclui(id)}
    else if(e.target.closest('[data-nao]'))fecha();
  };
  posiciona();m.querySelector('button').focus();
}
document.addEventListener('contextmenu',e=>{const it=e.target.closest?.('#nt_lat .nt-pg-it');if(!it)return;e.preventDefault();ntPaginaMenu(it.dataset.pg,e.clientX,e.clientY)});
document.addEventListener('click',e=>{const al=e.target.closest?.('.nt-pg-it .nt-pg-alca');if(!al||ntEngole)return;e.preventDefault();const r=al.getBoundingClientRect();ntPaginaMenu(al.closest('.nt-pg-it').dataset.pg,r.left,r.bottom)});
document.addEventListener('keydown',e=>{if(!['Enter',' '].includes(e.key)||!e.target.matches?.('.nt-pg-it .nt-pg-alca'))return;e.preventDefault();e.target.click()});
function ntLateralHtml(){
  const l=[...ntPaginas()].sort(ntPgOrdem),fix=l.filter(p=>p.fixada),res=l.filter(p=>!p.fixada);
  const item=p=>`<div class="nt-pg-it${NP?.pagina===p.id?' on':''}" data-pg="${esc(p.id)}"><span class="nt-pg-alca" role="button" tabindex="0" title="Arrastar para mudar a ordem; clique para opções" aria-label="Opções da página">⋮⋮</span><a class="nt-pg-nome" href="${esc(ntAbaUrl(p.id))}" draggable="false" onclick="return ntPgClique(event,'${esc(p.id)}')">📄 ${esc(p.titulo||'Sem título')}</a><button type="button" class="nt-pg-mover" title="Mover para…" aria-label="Mover ${esc(p.titulo||'Sem título')} para…" onclick="ntPaginaMoverMenu('${esc(p.id)}')">↪</button><button type="button" class="nt-pg-aba" title="Abrir em nova aba" aria-label="Abrir ${esc(p.titulo||'Sem título')} em nova aba" onclick="ntAbaAbre('${esc(p.id)}')">↗</button><button type="button" class="nt-pg-pin${p.fixada?' on':''}" title="${p.fixada?'Desafixar':'Fixar'}" aria-label="${p.fixada?'Desafixar':'Fixar'} ${esc(p.titulo||'Sem título')}" onclick="ntPaginaFixa('${esc(p.id)}')">📌</button></div>`;
  const f=NT.pastaForm,form=id=>{
    if(!f||f.id!==id)return '';
    if(f.a==='excluir')return `<div class="nt-pt-form">Excluir pasta? As páginas ficam fora dela. <button type="button" onclick="ntPastaExclui('${esc(id)}')">Excluir</button><button type="button" onclick="NT.pastaForm=null;ntLateralPinta()">Cancelar</button></div>`;
    return `<form class="nt-pt-form" onsubmit="event.preventDefault();ntPastaSalva()"><input class="nt-pt-titulo" data-form-pasta="${esc(id)}" aria-label="Nome da pasta" maxlength="200" required value="${esc(f.rascunho??ntPastas().find(p=>p.id===id)?.titulo??'')}"><button type="submit">Salvar</button><button type="button" onclick="NT.pastaForm=null;ntLateralPinta()">Cancelar</button></form>`;
  };
  const fechadas=ntLsLista(NT_PT_FECHADAS)||[];
  const pastas=[...ntPastas()].sort(ntPgOrdem).map(p=>`<section class="nt-pt" data-pasta="${esc(p.id)}"><div class="nt-pt-cab"><span class="nt-pg-alca" title="Arrastar pasta">⋮⋮</span><button type="button" class="nt-pt-nome" aria-expanded="${!fechadas.includes(p.id)}" onclick="ntPastaAlterna('${esc(p.id)}')">${fechadas.includes(p.id)?'▶':'▼'} 📁 ${esc(p.titulo)}</button><button type="button" title="Renomear pasta" onclick="ntPastaForm('${esc(p.id)}','renomear')">✎</button><button type="button" title="Excluir pasta" onclick="ntPastaForm('${esc(p.id)}','excluir')">🗑</button></div>${form(p.id)}<div class="nt-pg-lista" data-sec="pg" data-pasta="${esc(p.id)}"${fechadas.includes(p.id)?' hidden':''}>${res.filter(x=>ntPastaDa(x)===p.id).map(item).join('')||'<p class="mut nt-pg-vazio">Pasta vazia</p>'}</div></section>`).join('');
  return `<div class="nt-lat-acoes"><button type="button" onclick="ntAbre()" title="Nova nota">＋ Nota</button><button type="button" class="nt-pg-novo" onclick="ntPaginaNova()" title="Nova página">▤ Página</button><button type="button" class="nt-pg-novo" onclick="ntPastaForm('','criar')" title="Nova pasta">▱ Pasta</button><button type="button" class="nt-pg-novo" onclick="ntNotionEscolhe()" title="Importar do Notion" aria-label="Importar do Notion">↧ Notion</button></div>${form('')}${fix.length?`<div class="nt-lat-s">Fixadas</div><div class="nt-pg-lista" data-sec="fix">${fix.map(item).join('')}</div>`:''}<div class="nt-lat-s">Páginas</div><div class="nt-pg-lista" data-sec="pg" data-pasta="">${res.filter(p=>!ntPastaDa(p)).map(item).join('')||'<p class="mut nt-pg-vazio">Nenhuma página fora de pasta.</p>'}</div><div class="nt-pastas">${pastas}</div><button type="button" class="b nt-pg-novo" id="rd_conflitos" onclick="rdConflitosAbre()">Conflitos (${(SM.d.notas_conflitos||[]).length})</button>`;
}
function ntLateralPinta(){
  if(NTD)return;const el=document.getElementById('nt_lat');if(!el)return;
  const i=el.querySelector('.nt-pt-titulo'),foco=i&&document.activeElement===i,pos=foco?[i.selectionStart,i.selectionEnd]:null;
  if(i&&NT.pastaForm?.id===i.dataset.formPasta)NT.pastaForm.rascunho=i.value;
  el.innerHTML=ntLateralHtml();if(foco){const novo=el.querySelector('.nt-pt-titulo');novo?.focus();novo?.setSelectionRange(...pos)}
}
// Arrastar (mouse: segurando o item e movendo; toque: pela alça ⋮⋮). O alvo é decidido pelo meio das linhas da mesma seção.
let NTD=null,ntEngole=false;
function ntArrastoMarca(){
  const d=NTD;if(!d)return null;
  document.querySelectorAll('#nt_lat .alvo-antes,#nt_lat .alvo-depois,#nt_lat .alvo-pasta').forEach(x=>x.classList.remove('alvo-antes','alvo-depois','alvo-pasta'));
  if(!d.pasta){
    const el=document.elementFromPoint(d.x,d.y),cab=el?.closest('.nt-pt-cab'),lista=el?.closest('.nt-pg-lista');
    if(cab){const pasta=cab.parentElement.dataset.pasta;cab.classList.add('alvo-pasta');return {pasta}}
    if(lista&&lista.dataset.sec===d.lista.dataset.sec)d.destino=lista;else d.destino=d.lista;
  }
  const dest=d.pasta?d.lista:d.destino||d.lista,outros=[...dest.children].filter(x=>x!==d.it&&x.matches(d.pasta?'.nt-pt':'.nt-pg-it'));
  if(!outros.length){dest.classList.add('alvo-pasta');return d.pasta?null:{pasta:dest.dataset.pasta}}
  const ref=outros.find(x=>{const r=x.getBoundingClientRect();return d.y<r.top+r.height/2}),alvo=ref||outros[outros.length-1];
  alvo.classList.add(ref?'alvo-antes':'alvo-depois');return {ref:d.pasta?alvo.dataset.pasta:alvo.dataset.pg,depois:!ref,...(!d.pasta&&dest.dataset.sec!=='fix'?{pasta:dest.dataset.pasta}:{})};
}
function ntArrastoFim(aplica){
  const d=NTD;if(!d)return;NTD=null;
  d.it.classList.remove('arrastando');document.querySelectorAll('#nt_lat .alvo-antes,#nt_lat .alvo-depois,#nt_lat .alvo-pasta').forEach(x=>x.classList.remove('alvo-antes','alvo-depois','alvo-pasta'));
  if(d.ativo){ntEngole=true;setTimeout(()=>{ntEngole=false},100);if(aplica&&d.alvo){if(d.pasta)ntPastaMove(d.id,d.alvo.ref,d.alvo.depois);else ntPaginaMove(d.id,d.alvo.ref,d.alvo.depois,d.alvo.pasta)}else ntLateralPinta()}
}
document.addEventListener('pointerdown',e=>{
  const it=e.target.closest?.('.nt-pg-it,.nt-pt-cab');if(!it||(e.pointerType==='mouse'&&e.button!==0)||e.target.closest('button,input,select'))return;
  if(e.pointerType!=='mouse'&&!e.target.closest('.nt-pg-alca'))return;   // toque: só pela alça (o resto da lista rola)
  const pasta=it.matches('.nt-pt-cab'),linha=pasta?it.parentElement:it;
  NTD={it:linha,pasta,id:pasta?linha.dataset.pasta:it.dataset.pg,lista:linha.parentElement,x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY,pid:e.pointerId,ativo:false,alvo:null};
});
document.addEventListener('pointermove',e=>{
  const d=NTD;if(!d||e.pointerId!==d.pid)return;
  if(!d.it.isConnected){NTD=null;return}
  if(!d.ativo){if(Math.hypot(e.clientX-d.x0,e.clientY-d.y0)<5)return;d.ativo=true;d.it.classList.add('arrastando');try{getSelection().removeAllRanges()}catch(x){}}
  e.preventDefault();d.x=e.clientX;d.y=e.clientY;d.alvo=ntArrastoMarca();
},{passive:false});
document.addEventListener('pointerup',e=>{if(NTD&&e.pointerId===NTD.pid)ntArrastoFim(true)});
document.addEventListener('pointercancel',e=>{if(NTD&&e.pointerId===NTD.pid)ntArrastoFim(false)});
document.addEventListener('click',e=>{if(ntEngole){ntEngole=false;e.stopPropagation();e.preventDefault()}},true);
document.addEventListener('selectstart',e=>{if(NTD?.ativo)e.preventDefault()});

// ===== Painel de atalhos (Ctrl+/): só o que existe de fato na aba =====
const NT_ATALHOS=[
  ['Formatar o texto selecionado (ou o que for digitado)',[[['Ctrl+B'],'Negrito'],[['Ctrl+I'],'Itálico'],[['Ctrl+U'],'Sublinhado'],[['Ctrl+Shift+S'],'Tachado'],
    [['Ctrl+K'],'Link: abre um campo (Enter aplica, Esc cancela, vazio remove)'],[['Ctrl+Shift+H'],'Aplica a cor padrão (★ na paleta de cores); sem padrão, fundo amarelo; de novo, remove'],
    [['**texto**','*texto*','~~texto~~'],'Digitar assim vira negrito, itálico, tachado'],[['Ctrl+clique'],'Abre o link do texto'],[['Barra de cima'],'B I U S, cor/realce (★ marca a cor padrão do Ctrl+Shift+H), frases, histórico e Atalhos (botões acesos = ativo)']]],
  ['Criar blocos',[[['/'],'Menu de blocos: Título 1/2/3, Texto, Toggle, Lista, Lista numerada, Checklist, Citação, Destaque, Divisória, Imagem, Página (↑ ↓ escolhem, Enter aplica, Esc fecha)'],
    [['> '],'Toggle'],[['# ','## ','### '],'Título 1, 2, 3'],[['- ','* ','+ '],'Lista com marcadores'],[['1. '],'Lista numerada'],[['[] '],'Checklist'],[['---'],'Divisória'],
    [['Ctrl+Alt+1/2/3'],'Título 1, 2, 3'],[['Ctrl+Alt+0'],'Texto comum'],[['Ctrl+Shift+8'],'Lista com marcadores'],[['Ctrl+Shift+7'],'Lista numerada'],[['Ctrl+Shift+9'],'Checklist'],[['Ctrl+Shift+B'],'Citação'],[['Alt+A'],'Novo toggle no topo (também o botão +)']]],
  ['Mover e aninhar',[[['Tab'],'Entra no toggle anterior; em lista, aninha o item. O 1º item de uma lista logo depois de um toggle entra no toggle'],
    [['Shift+Tab'],'Sai do toggle; em lista, desaninha. Item de lista de nível mais alto dentro de um toggle sai para depois dele'],
    [['⋮⋮'],'Alça à esquerda do bloco: arrastar muda a ordem; clicar/tocar abre Subir, Descer, Entrar, Sair, Apagar'],[['▶'],'Abre/fecha o toggle (o estado fica neste aparelho)'],[['Ctrl+Alt+T'],'Abre/fecha todos os toggles da página'],[['Ctrl+Enter'],'Abre/fecha o toggle onde está o cursor']]],
  ['Selecionar blocos',[[['Arrastar por fora do texto'],'Desenha um retângulo: os blocos que ele cruza ficam selecionados (no toque não há retângulo)'],[['Delete','Backspace'],'Apaga o grupo de uma vez'],[['Ctrl+C','Ctrl+X'],'Copia ou recorta o grupo'],[['Tab','Shift+Tab'],'O grupo entra no toggle de cima ou sai do toggle'],[['⋮⋮'],'Arrastar a alça de um bloco do grupo move o grupo todo'],[['Esc','clique'],'Limpa a seleção']]],
  ['Buscar',[[['Ctrl+F'],'Busca nesta página (na aba Notas): destaca tudo, mostra n/total; Enter e Shift+Enter navegam, Esc fecha; abre os toggles fechados'],[['Ctrl+P'],'Busca global em qualquer aba: notas, páginas, tarefas, calendário, questões'],[['Ctrl+K'],'Busca global (dentro do texto das Notas, Ctrl+K continua sendo link)']]],
  ['Lembretes, frases e histórico',[[['@'],'Lembrete: Hoje, Amanhã, dia da semana, dd/mm, dd/mm hh:mm. Vira um chip e uma tarefa do plano; clique no chip para mudar a data; apagar o chip não apaga a tarefa'],[['/ Frase'],'Insere uma frase-padrão salva (filtre digitando, Enter insere)'],[['✚ Frase'],'Salva o texto selecionado como frase-padrão'],[['📋'],'Renomear e apagar frases'],[['🕘 Histórico'],'Versões anteriores (precisa de internet): ver, restaurar a página ou um bloco como edição nova']]],
  ['Imagem',[[['Ctrl+V'],'Cola a imagem no cursor (reduz e envia)'],[['Arrastar arquivo'],'Solta a imagem no texto'],[['/ Imagem'],'Escolhe um arquivo'],[['Clicar na imagem'],'Largura 25/50/75/100 % ou apagar; Backspace/Delete também apaga']]],
  ['Páginas',[[['☰'],'Passar o mouse mostra a lista de páginas por cima do texto (some ao sair); clicar fixa, clicar de novo solta. Arrastar a margem direita da lista muda a largura (duplo clique volta ao padrão)'],[['+ Nova página'],'Cria e abre uma página'],[['/ Página'],'Cria uma página e coloca um link para ela no ponto do cursor'],
    [['Clicar na página'],'Abre no painel grande, com o mesmo editor e a mesma barra'],[['Arrastar o item'],'Muda a ordem dentro da seção (no toque, pela alça ⋮⋮)'],[['📌'],'Fixa ou desafixa'],[['Esc','✕','clique fora'],'Fecha o painel e salva'],[['↗','Ctrl+clique','clique do meio'],'Abre a página (ou as Notas) em outra aba do navegador: várias páginas ao mesmo tempo, o que se escreve numa aparece na outra'],[['🗑'],'Exclui a página (pede confirmação)']]],
  ['Geral',[[['Ctrl+Z'],'Desfazer'],[['Ctrl+Y','Ctrl+Shift+Z'],'Refazer'],[['Ctrl+/'],'Abre/fecha este painel'],[['Esc'],'Fecha este painel']]],
];
const ntAtalhosAberto=()=>!!document.getElementById('nt_atalhos');
function ntAtalhosAbre(){
  if(ntAtalhosAberto())return;
  const ov=document.createElement('div'),ant=document.activeElement;ov.id='nt_atalhos';ov.className='nt-atalhos';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-label','Atalhos das Notas');
  ov.innerHTML=`<div class="nt-atalhos-c"><div class="nt-atalhos-t"><b>Atalhos e funções das Notas</b><button type="button" aria-label="Fechar">✕</button></div><div class="nt-atalhos-l">${NT_ATALHOS.map(([g,l])=>`<h3>${esc(g)}</h3>${l.map(([k,d])=>`<div class="nt-at-r"><span class="nt-at-k">${k.map(x=>`<kbd>${esc(x)}</kbd>`).join(' ')}</span><span>${esc(d)}</span></div>`).join('')}`).join('')}</div></div>`;
  ov.addEventListener('click',e=>{if(e.target===ov||e.target.closest('.nt-atalhos-t button'))ntAtalhosFecha()});
  ov._ant=ant;document.body.appendChild(ov);ov.querySelector('.nt-atalhos-t button').focus();
}
function ntAtalhosFecha(){const ov=document.getElementById('nt_atalhos');if(!ov)return;ov.remove();try{ov._ant?.focus?.()}catch(e){}}
document.addEventListener('keydown',e=>{
  if(tela!=='notas'&&!NP)return;
  if((e.ctrlKey||e.metaKey)&&(e.key==='/'||e.code==='Slash'||e.code==='IntlRo')){e.preventDefault();e.stopPropagation();ntAtalhosAberto()?ntAtalhosFecha():ntAtalhosAbre();return}
  if(e.key!=='Escape')return;
  if(ntAtalhosAberto()){e.preventDefault();e.stopPropagation();ntAtalhosFecha();return}
  const modal=[...document.querySelectorAll('.nt-modal')].pop();if(modal){e.preventDefault();e.stopPropagation();ntModalFecha(modal);return}   // histórico, frases e busca global: Esc fecha a de cima
  if(document.querySelector('.nt-lemb-pop'))return;
  const bs=[NP,NT].find(x=>x?.ed&&x.el?.isConnected&&ntBselPos(x.ed.state).length);if(bs){e.preventDefault();e.stopPropagation();bs.ed.view.dispatch(ntBselMeta(bs.ed.state.tr,[]));return}   // Esc limpa a seleção de blocos
  const bb=[NP,NT].find(x=>x?.buscaEl);if(bb){e.preventDefault();e.stopPropagation();ntBuscaFecha(bb);return}   // Esc fecha a busca da página
  if(e.target.closest?.('.nt-link'))return;   // o campo do link trata o próprio Esc
  if(document.querySelector('.nt-slash'))return;   // o menu "/" trata o Esc
  const pal=document.querySelector('.nt-paleta:not([hidden])');if(pal){e.preventDefault();e.stopPropagation();pal.hidden=true;return}
  if(NTD){e.stopPropagation();ntArrastoFim(false);return}
  if(NP&&!NP.aba){e.preventDefault();e.stopPropagation();ntPainelFecha()}   // (na aba da página, Esc não fecha nada)
},true);
// Clicar fora fecha o menu da alça e a paleta de cores.
document.addEventListener('pointerdown',e=>{
  for(const c of [NT,NP]){
    if(c?.menuEl&&!c.menuEl.hidden&&!e.target.closest?.('.nt-menu-bloco,.nt-alca'))c.menuEl.hidden=true;
    const pal=c?.barra?.querySelector('.nt-paleta');if(pal&&!pal.hidden&&!e.target.closest?.('.nt-paleta,[data-m="cor"]'))pal.hidden=true;
  }
});
function ntFilaInicia(){
  if(NT.legado)return;
  if(SM.d){if(!ntBaseLer()&&!ntTemPendentes())ntBaseSalva(SM.d.notasDoc?.blocos);else if(!pgBaseLer()&&!ntTemPendentes())pgBaseSalva(ntPaginas());if(!frBaseLer()&&!ntTemPendentes())frBaseSalva(SM.d.notasFrases||[]);ntAplica(SM.d,ntPendentes());smGuardaCache()}
}
// smCarga já capturou smPuxar; seu corpo chama smPuxar1 dinamicamente. A barreira fica aqui para não alterar a Semana.
// Também protege salvamentos disparados durante a inicialização, inclusive quando ainda não há SM.d.
const ntPuxar1=smPuxar1,ntMudar=smMudar;
smPuxar1=async function(...args){await ntMigraLegado();if(NT.legado)return false;return ntPuxar1(...args)};
smMudar=function(...args){const espera=ntMigraLegado();if(espera)return espera.then(()=>NT.legado?false:ntMudar(...args));if(NT.legado)return Promise.resolve(false);return ntMudar(...args)};
const ntFilaInicio=ntMigraLegado();if(ntFilaInicio)ntFilaInicio.then(ntFilaInicia);else ntFilaInicia();
window.addEventListener('online',()=>{ntSync().then(()=>smPuxar())});
// Outra aba do navegador gravou (ou terminou de enviar) a fila: funde com o que esta aba tem e mostra no editor sem recarregar.
window.addEventListener('storage',async e=>{
  if(e.key!==NT_PEND&&!e.key?.startsWith(NT_PEND+':'))return;
  await ntMigraLegado();if(NT.legado)return;
  if(SM.d){ntAntes();ntAplica(SM.d,ntPendentes());ntSincroniza()}
  smRender();
  if(e.newValue==null&&SM.d&&!ntTemPendentes())Promise.resolve(NT.sync).then(()=>smPuxar()).catch(()=>{});   // busca depois do PUT local; também resolve SM.sujo desta aba
});
window.addEventListener('beforeunload',()=>{if(NT.sujo)ntSalvaDoc();if(NP?.sujo)pgSalvaDoc();if(NP)pgTituloSalva()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(NT.sujo)ntSalvaDoc();if(NP?.sujo)pgSalvaDoc();if(NP)pgTituloSalva()}});
