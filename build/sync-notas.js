/* Radio 1.48 — sincronização de páginas; sem dependência do editor/layout.
 * criarSyncNotas({api, repo, storage?, cache?, alterou?, aparelhoId?, atraso?})
 * listarPaginas(): Promise<metadados[]> — GET condicional do índice, nunca documentos.
 * abrirPagina(id): Promise<página> — GET apenas se o SHA mudou; registra a página aberta.
 * salvarPagina(páginaOuPatch): boolean — enfileira imediatamente; debounce 1500 ms.
 *   Sem doc, hidrata antes de aplicar os campos. {id, excluida:true} retira do índice.
 * versoes(id, {pagina?, ref?}): commits paginados ou página naquela revisão.
 * restaurar(id, ref): nova gravação da revisão, com data/aparelho atuais.
 * estado(): {paginas, abertas, pendentes, volatil, erro, ultima, enviando} (cópias).
 * Infraestrutura (só semana.js): enviar() drena a fila; integrarPlano(d,sha) migra
 * com CAS e devolve {d,sha}; receberLegado(storage) importa pendências antigas.
 * Cache é opcional, assíncrono, nunca bloqueia a fila ou emite avisos de quota.
 * Confirmação = PUT da página + PUT do índice. Falha deixa a entrada pendente.
 */
function criarSyncNotas(o){
  const clone=x=>x==null?x:JSON.parse(JSON.stringify(x)),prefixo='bcbr_paginas_pendentes_v2:',
    api=(p,opt)=>o.api(`/repos/${o.repo}/${p}`,opt), b64=s=>btoa(unescape(encodeURIComponent(s))),
    dec=s=>JSON.parse(decodeURIComponent(escape(atob(String(s).replace(/\n/g,''))))),
    chaveId=id=>{if(!/^[\w-]+$/.test(id))throw Error('Identificador de página inválido');return id},
    caminho=id=>'notas/paginas/'+chaveId(id)+'.json',indicePath='notas/indice.json';
  let aparelho=o.aparelhoId;
  try{aparelho||=o.storage?.getItem('bcbr_aparelhoId')}catch(e){}
  aparelho||='a'+Date.now().toString(36)+Math.random().toString(36).slice(2);
  try{o.storage?.setItem('bcbr_aparelhoId',aparelho)}catch(e){}
  let indice=[],etag='',indiceSha=null,timer=null,voo=null,leitura=null,migrando=null,erro='',ultima=0,seq=0;
  const pend=new Map(),abertas=new Map(),shas=new Map(),revisoes=new Map();
  const mudou=()=>o.alterou?.();
  const metadados=p=>({id:p.id,titulo:p.titulo||'',pasta:p.pasta||'',ordem:p.ordem||0,atualizado:p.atualizado||'',sha:p.sha,...(p.fixada?{fixada:true}:{})});
  const lista=()=>{const m=new Map(indice.map(p=>[p.id,p]));for(const {p} of pend.values()){if(p.excluida)m.delete(p.id);else m.set(p.id,metadados({...m.get(p.id),...p}))}return [...m.values()]};
  function cache(k,v){try{Promise.resolve(o.cache?.set(k,clone(v))).catch(()=>{})}catch(e){}}
  async function cacheLer(k){try{return await o.cache?.get(k)}catch(e){return null}}
  function persistir(e){try{o.storage.setItem(e.k,JSON.stringify(e));e.volatil=false;return true}catch(x){e.volatil=true;return false}}
  function carregarFila(){
    try{for(const [k,e] of pend)if(!e.volatil&&!o.storage.getItem(k))pend.delete(k);
      for(let i=0;i<o.storage.length;i++){const k=o.storage.key(i);if(!k?.startsWith(prefixo))continue;
      try{const e=JSON.parse(o.storage.getItem(k));if(e?.p?.id&&e.rev&&!pend.get(k)?.volatil){chaveId(e.p.id);e.k=k;pend.set(k,e)}}catch(e){erro='Uma página pendente não pôde ser lida; a cópia local foi preservada.'}
    }}catch(e){}
  }
  carregarFila();
  async function ler(path,opt={}){
    try{let f=await api('contents/'+path,opt);if(f.naoMudou)return f;
      if(f.encoding==='none'||(!f.content&&f.size>0)){const b=await api('git/blobs/'+encodeURIComponent(f.sha));f={...f,content:b.content}}
      return {...f,d:dec(f.content)};
    }catch(e){if(e.status===404)return {d:null,sha:null};throw e}
  }
  async function put(path,d,sha){const body={message:'notas: '+path,branch:'main',content:b64(JSON.stringify(d))};if(sha)body.sha=sha;return (await api('contents/'+path,{method:'PUT',body:JSON.stringify(body)})).content.sha}
  const conflito=e=>e.status===409||e.status===422;
  async function listarPaginas(){
    if(leitura)return leitura;
    leitura=(async()=>{try{const f=await ler(indicePath,{etag:etag||undefined});if(!f.naoMudou){if(f.d!==null&&!Array.isArray(f.d))throw Error('Índice de páginas inválido');indice=f.d||[];indiceSha=f.sha;etag=f.etag||'';cache('notas:indice',indice)}erro='';mudou();return clone(lista())}
      catch(e){if(!indice.length)indice=await cacheLer('notas:indice')||[];erro=e.message;mudou();return clone(lista())}
      finally{leitura=null}})();return leitura;
  }
  function pendente(id){return [...pend.values()].filter(e=>e.p.id===id).sort((a,b)=>a.em-b.em||a.rev.localeCompare(b.rev)).at(-1)}
  async function abrirPagina(id){
    chaveId(id);const e=pendente(id);if(e?.p.doc){abertas.clear();abertas.set(id,clone(e.p));return clone(e.p)}
    const meta=lista().find(p=>p.id===id),atual=abertas.get(id),rev=revisoes.get(id)||0;
    if(atual&&meta?.sha&&shas.get(id)===meta.sha&&!e)return clone(atual);
    let p;
    try{const f=await ler(caminho(id));if(!f.d||f.d.excluida)throw Object.assign(Error('Página não encontrada'),{status:404});p=f.d;shas.set(id,f.sha);cache('notas:pagina:'+id,{sha:f.sha,p})}
    catch(x){const c=await cacheLer('notas:pagina:'+id);if(!c?.p)throw x;p=c.p}
    const novo=pendente(id);if((revisoes.get(id)||0)!==rev&&novo?.p.doc)p=novo.p;else if(e)p={...p,...e.p};
    abertas.clear();abertas.set(id,clone(p));return clone(p);
  }
  function salvarPagina(p){
    chaveId(p.id);const anterior=pendente(p.id)?.p||abertas.get(p.id)||{},em=Date.now(),
      novo={...clone(anterior),...clone(p),atualizado:p.atualizado||new Date().toISOString(),aparelhoId:aparelho},
      k=prefixo+aparelho+':'+p.id,e={k,p:novo,em,rev:em.toString(36)+'-'+(++seq)+'-'+Math.random().toString(36).slice(2)};
    pend.set(k,e);revisoes.set(p.id,(revisoes.get(p.id)||0)+1);if(abertas.has(p.id))abertas.set(p.id,clone(novo));
    const duravel=persistir(e);clearTimeout(timer);timer=setTimeout(()=>enviar(),duravel?(o.atraso??1500):0);mudou();return true;
  }
  async function atualizarIndice(id){
    for(let t=0;t<8;t++){
      const pagina=await ler(caminho(id)),f=await ler(indicePath);if(!pagina.d)throw Error('Página ainda não confirmada');
      if(f.d!==null&&!Array.isArray(f.d))throw Error('Índice de páginas inválido');
      const l=(f.d||[]).filter(p=>p.id!==id);if(!pagina.d.excluida)l.push(metadados({...pagina.d,sha:pagina.sha}));
      try{const sha=await put(indicePath,l,f.sha);indice=l;indiceSha=sha;etag='';cache('notas:indice',l);
        // Um PUT concorrente pode ter ocorrido entre o GET da página e o PUT do índice.
        const conf=await ler(caminho(id));if(conf.sha!==pagina.sha)continue;return pagina;
      }catch(e){if(!conflito(e))throw e}
    }throw Error('Índice ocupado; a página permanece na fila.');
  }
  async function gravar(p,soMaisNovo=false){
    let f=null,sha=shas.get(p.id);if(soMaisNovo||!p.doc||!sha){f=await ler(caminho(p.id));sha=f.sha}
    for(let t=0;t<8;t++){
      if(soMaisNovo&&f?.d&&String(f.d.atualizado||'')>=String(p.atualizado||''))return atualizarIndice(p.id);
      const completo={...(f?.d||{}),...p};delete completo.sha;if(!completo.doc)throw Error('Conteúdo da página indisponível; alteração preservada.');
      try{sha=await put(caminho(p.id),completo,sha);shas.set(p.id,sha);return await atualizarIndice(p.id)}
      catch(e){if(!conflito(e))throw e;f=await ler(caminho(p.id));sha=f.sha}
    }throw Error('Página ocupada; alteração permanece na fila.');
  }
  async function enviar(){
    clearTimeout(timer);if(voo)return voo;
    const executar=async()=>{carregarFila();try{
      // Snapshot: edição durante PUT tem outro rev e nunca é retirada por esta confirmação.
      for(const e of [...pend.values()].sort((a,b)=>a.em-b.em||a.rev.localeCompare(b.rev))){
        const confirmado=await gravar(clone(e.p));ultima=Date.now();erro='';
        if(pend.get(e.k)?.rev===e.rev){pend.delete(e.k);try{if(JSON.parse(o.storage.getItem(e.k)||'null')?.rev===e.rev)o.storage.removeItem(e.k)}catch(x){}
          if(abertas.has(e.p.id))abertas.set(e.p.id,clone(confirmado.d));cache('notas:pagina:'+e.p.id,{sha:confirmado.sha,p:confirmado.d});}
      }return true;
    }catch(e){erro=e.message;return false}};
    voo=(o.trava?o.trava(executar):executar()).finally(()=>{voo=null;mudou();if(pend.size&&!erro){clearTimeout(timer);timer=setTimeout(enviar,0)}});return voo;
  }
  async function versoes(id,opt={}){if(opt.ref)return (await ler(caminho(id)+'?ref='+encodeURIComponent(opt.ref))).d;return api('commits?path='+encodeURIComponent(caminho(id))+'&per_page=30&page='+(opt.pagina||1))}
  async function restaurar(id,ref){const p=await versoes(id,{ref});if(!p?.doc)throw Error('Versão não encontrada');salvarPagina({...p,id,excluida:false,atualizado:new Date().toISOString()});return enviar()}
  const carimbo=doc=>(doc?.blocos||[]).reduce((a,b)=>String(b.atualizado||'')>a?String(b.atualizado):a,'');
  function paginasLegadas(d){if(!d)return [];const l=(d.notasPaginas?.paginas||[]).filter(p=>p.doc).map(clone);
    if(d.notasDoc)l.push({id:'notas',titulo:'Notas',pasta:'',ordem:0,atualizado:d.notasDoc.atualizado||carimbo(d.notasDoc),doc:clone(d.notasDoc)});
    else if(d.notas?.length&&o.converterAntigas)l.push(o.converterAntigas(d.notas));
    if(d.notas_v138?.length&&o.converterAntigas)l.push({...o.converterAntigas(d.notas_v138),id:'notas-legado-v138',titulo:'Notas — cópia anterior'});
    if(d.notas_conflitos?.length){const blocos=d.notas_conflitos.filter(c=>c.conteudo).map((c,i)=>({id:'recuperado-'+i,atualizado:c.atualizado||c.em||'',conteudo:clone(c.conteudo)}));
      l.push({id:'notas-recuperadas',titulo:'Notas — cópias recuperadas',doc:{v:1,blocos},atualizado:carimbo({blocos})})}
    return l;
  }
  async function integrarPlano(d,sha){
    if(migrando){await migrando;const f=await ler('semana/plano.json');return integrarPlano(f.d,f.sha)}
    if(!paginasLegadas(d).length)return {d,sha};
    migrando=(async()=>{for(let t=0;t<8;t++){
      for(const p of paginasLegadas(d))await gravar({...p,aparelhoId:p.aparelhoId||aparelho},true);
      const limpo=clone(d);delete limpo.notasDoc;delete limpo.notas;delete limpo.notas_v138;delete limpo.notas_conflitos;
      if(limpo.notasPaginas){delete limpo.notasPaginas.paginas;if(!Object.keys(limpo.notasPaginas).some(k=>k!=='v'))delete limpo.notasPaginas}
      limpo.paginasEmArquivos=2;
      try{const nova=await put('semana/plano.json',limpo,sha);return {d:limpo,sha:nova}}
      catch(e){if(!conflito(e))throw e;const f=await ler('semana/plano.json');d=f.d;sha=f.sha}
    }throw Error('Plano ocupado; migração será retomada.');})().finally(()=>{migrando=null});return migrando;
  }
  // Só lê chaves antigas. Sua remoção não é necessária: recibo local impede replay após confirmação.
  async function receberLegado(){
    const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),v=>v.toString(16).padStart(2,'0')).join('');
    const ops=[];try{for(let i=0;i<o.storage.length;i++){const k=o.storage.key(i);if(k==='bcbr_notasdoc_pendente'||k?.startsWith('bcbr_notasdoc_pendente:')){const raw=o.storage.getItem(k),h=await hash(raw);if(o.storage.getItem('bcbr_migrada_v2:'+k)===h)continue;const x=JSON.parse(raw);ops.push({k,raw,x,h})}}}catch(e){erro='Pendência antiga ilegível; preservada no aparelho.';return}
    for(const {k,x,h} of ops.sort((a,b)=>(a.x.em||0)-(b.x.em||0))){
      const pags=(x.paginas||[]).filter(p=>p.doc&&JSON.stringify(p)!==JSON.stringify(x.base?.find?.(b=>b.id===p.id)));
      if(Array.isArray(x.blocos))pags.push({id:'notas',titulo:'Notas',doc:{v:1,blocos:x.blocos},atualizado:carimbo({blocos:x.blocos})});
      for(const p of pags)await gravar({...p,aparelhoId:aparelho},true);
      try{o.storage.setItem('bcbr_migrada_v2:'+k,h)}catch(e){}
    }
  }
  return {listarPaginas,abrirPagina,salvarPagina,versoes,restaurar,enviar,integrarPlano,receberLegado,
    estado:()=>({paginas:clone(lista()),abertas:clone(Object.fromEntries(abertas)),pendentes:pend.size,volatil:[...pend.values()].some(e=>e.volatil),erro,ultima,enviando:!!voo})};
}
if(typeof module!=='undefined'&&module.exports)module.exports={criarSyncNotas};

// Adaptador do app. IndexedDB usa o store já compartilhado pelo shim; falhar é normal.
const SyncNotas=typeof BCBR==='undefined'?null:criarSyncNotas({
  api:(p,o)=>BCBR.api(p,o),repo:BCBR.REPO,
  trava:fn=>typeof navigator!=='undefined'&&navigator.locks?.request?navigator.locks.request('radio-paginas-v2',fn):fn(),
  storage:(()=>{try{return localStorage}catch(e){return null}})(),
  cache:(()=>{
    let db;
    const abrir=()=>db||(db=new Promise((ok,no)=>{
      try{const r=indexedDB.open('bcbr',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('kv'))r.result.createObjectStore('kv')};
        r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);r.onblocked=()=>no(Error('cache indisponível'));
      }catch(e){no(e)}
    }));
    const op=async(k,v,grava)=>{const d=await abrir();return new Promise((ok,no)=>{
      const t=d.transaction('kv',grava?'readwrite':'readonly'),r=grava?t.objectStore('kv').put(v,k):t.objectStore('kv').get(k);
      t.oncomplete=()=>ok(r.result);t.onerror=t.onabort=()=>no(t.error);
    })};
    return {get:k=>op(k,null,false),set:(k,v)=>op(k,v,true)};
  })(),
  converterAntigas:notas=>{const blocos=ntOrdenadas(notas).map(ntNotaParaBloco);return {id:'notas',titulo:'Notas',doc:{v:1,blocos},atualizado:blocos.reduce((s,b)=>b.atualizado>s?b.atualizado:s,'')}},
  alterou:()=>{if(typeof rdPinta==='function')rdPinta();if(typeof ntLateralPinta==='function')ntLateralPinta()}
});
if(typeof window!=='undefined'){
  window.addEventListener('online',()=>{SyncNotas?.enviar().then(()=>smPuxar())});
  window.addEventListener('storage',e=>{if(e.key?.startsWith('bcbr_paginas_pendentes_v2:'))SyncNotas?.enviar().then(()=>smPuxar())});
}
