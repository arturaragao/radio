/* Radio 1.48 — sincronização de páginas; sem dependência do editor/layout.
 * criarSyncNotas({api, repo, storage?, cache?, alterou?, aparelhoId?, atraso?})
 * listarPaginas(): Promise<metadados[]> — GET condicional do índice, nunca documentos.
 * abrirPagina(id): Promise<página> — GET apenas se o SHA mudou; registra a página aberta.
 * salvarPagina(páginaOuPatch): boolean — enfileira imediatamente; debounce 1500 ms.
 *   Sem doc, hidrata antes de aplicar os campos. {id, excluida:true} retira do índice.
 * versoes(id, {pagina?, ref?, plano?}): commits paginados ou página naquela revisão (plano: histórico antes da 1.48).
 * restaurar(id, ref, plano?): nova gravação da revisão, com data/aparelho atuais.
 * estado(): {paginas, abertas, pendentes, volatil, erro, ultima, enviando} (cópias).
 * Infraestrutura (só semana.js): enviar() drena a fila; integrarPlano(d,sha) migra
 * com CAS e devolve {d,sha}; receberLegado(storage) importa pendências antigas.
 * Cache é opcional, assíncrono, nunca bloqueia a fila ou emite avisos de quota.
 * Confirmação = PUT da página + PUT do índice. Falha deixa a entrada pendente.
 * 1.49.1 (perda real 12/11): nunca descartar texto. Com base desconhecida/≠ remoto, após 409, na migração e na fila
 *   antiga, os blocos são UNIDOS por id (mesmo id → o mais novo; bloco só do remoto fica). Página vazia não apaga remoto
 *   com conteúdo. Migração só limpa o plano após reler cada arquivo e achar todos os ids. PUT que reduziria >50% do texto
 *   sem o usuário ter reduzido nesta sessão guarda antes a versão remota em "notas-recuperadas".
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
  let indice=[],etag='',indiceSha=null,indiceConhecido=false,timer=null,voo=null,leitura=null,migrando=null,erro='',ultima=0,seq=0;
  const pend=new Map(),abertas=new Map(),shas=new Map(),revisoes=new Map(),legadoPreservado=[];
  const mudou=()=>o.alterou?.();
  const metadados=p=>({id:p.id,titulo:p.titulo||'',pasta:p.pasta||'',ordem:p.ordem||0,atualizado:p.atualizado||'',sha:p.sha,...(p.fixada?{fixada:true}:{}),...(p.copiaDe?{copiaDe:p.copiaDe}:{}),...(p.origem?{origem:clone(p.origem)}:{})});
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
    leitura=(async()=>{try{const f=await ler(indicePath,{etag:etag||undefined});if(!f.naoMudou){if(f.d!==null&&!Array.isArray(f.d))throw Error('Índice de páginas inválido');indice=f.d||[];indiceSha=f.sha;etag=f.etag||'';cache('notas:indice',indice)}indiceConhecido=true;erro='';mudou();return clone(lista())}
      catch(e){if(!indice.length){const c=await cacheLer('notas:indice');if(Array.isArray(c)){indice=c;indiceConhecido=true}}erro=e.message;mudou();return clone(lista())}
      finally{leitura=null}})();return leitura;
  }
  function pendente(id){return [...pend.values()].filter(e=>e.p.id===id).sort((a,b)=>a.em-b.em||a.rev.localeCompare(b.rev)).at(-1)}
  async function abrirPagina(id){
    chaveId(id);const e=pendente(id);if(e?.p.doc){abertas.set(id,clone(e.p));return clone(e.p)}
    const meta=lista().find(p=>p.id===id),atual=abertas.get(id),rev=revisoes.get(id)||0;
    if(atual&&meta?.sha&&shas.get(id)===meta.sha&&!e)return clone(atual);
    let p,f=null;
    try{f=await ler(caminho(id));if(!f.d||f.d.excluida)throw Object.assign(Error('Página não encontrada'),{status:404});p=f.d;shas.set(id,f.sha);tamanhos.set(id,textoDe(f.d.doc));cache('notas:pagina:'+id,{sha:f.sha,p})}
    catch(x){const c=await cacheLer('notas:pagina:'+id);if(!c?.p)throw x;p=c.p}
    if(f?.d){
      const noIndice=indice.find(x=>x.id===id);
      if(!noIndice||(noIndice.sha!==f.sha&&String(f.d.atualizado||'')>=String(noIndice.atualizado||''))){
        indice=[...indice.filter(x=>x.id!==id),metadados({...f.d,sha:f.sha})];mudou();
        await atualizarIndice(id).catch(()=>{});
      }
    }
    const novo=pendente(id);if((revisoes.get(id)||0)!==rev&&novo?.p.doc)p=novo.p;else if(e)p={...p,...e.p};
    if(p.origem===null)delete p.origem;
    abertas.set(id,clone(p));return clone(p);
  }
  function salvarPagina(p){
    chaveId(p.id);const anterior=pendente(p.id)?.p||abertas.get(p.id)||{},em=Date.now(),
      novo={...clone(anterior),...clone(p),atualizado:p.atualizado||new Date().toISOString(),aparelhoId:aparelho};
    if(novo.origem===null)delete novo.origem;
    const k=prefixo+aparelho+':'+p.id,e={k,p:novo,em,rev:em.toString(36)+'-'+(++seq)+'-'+Math.random().toString(36).slice(2)};
    if(p.doc&&anterior.doc&&textoDe(p.doc)<textoDe(anterior.doc))apagou.add(p.id);
    pend.set(k,e);revisoes.set(p.id,(revisoes.get(p.id)||0)+1);
    if(novo.excluida)abertas.delete(p.id);else if(abertas.has(p.id)||novo.doc)abertas.set(p.id,clone(novo));
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
  // 1.49.1: nunca descartar texto. União por id: bloco só do remoto fica; mesmo id → o de `atualizado` mais novo.
  const textoDe=x=>{let n=0;const v=y=>{if(Array.isArray(y))y.forEach(v);else if(y&&typeof y==='object'){if(typeof y.text==='string')n+=y.text.length;if(y.type==='image')n+=50;Object.values(y).forEach(v)}};v(x);return n};
  const blocosDe=d=>Array.isArray(d?.blocos)?d.blocos:[];
  const docVazio=d=>blocosDe(d).every(b=>b?.conteudo?.type==='paragraph'&&!textoDe(b.conteudo));
  const chaveB=b=>b?.id||JSON.stringify(b?.conteudo);
  function unirBlocos(local,remoto){
    if(docVazio({blocos:local}))return clone(remoto);if(docVazio({blocos:remoto}))return clone(local);
    const R=new Map(remoto.map(b=>[chaveB(b),b])),res=local.map(b=>{const r=R.get(chaveB(b));return clone(r&&String(r.atualizado||'')>String(b.atualizado||'')?r:b)});
    let ant=null;for(const r of remoto){const k=chaveB(r),i=res.findIndex(b=>chaveB(b)===k);
      if(i>=0){ant=k;continue}const a=ant===null?-1:res.findIndex(b=>chaveB(b)===ant);res.splice(a+1,0,clone(r));ant=k}
    return res;
  }
  const apagou=new Set(),tamanhos=new Map();   // apagou: o usuário reduziu o texto nesta sessão (intencional); tamanhos: texto do último remoto conhecido
  async function guardarCopia(id,f){   // rede de segurança: versão remota inteira vai para "Notas — cópias recuperadas"
    const tag=String(f.sha||Date.now()).slice(0,8),blocos=blocosDe(f.d.doc).map(b=>({...clone(b),id:'rec-'+tag+'-'+(b.id||Math.random().toString(36).slice(2))}));
    blocos.unshift({id:'rec-'+tag,atualizado:new Date().toISOString(),conteudo:{type:'paragraph',content:[{type:'text',text:'Cópia automática de “'+(f.d.titulo||id)+'” antes de uma gravação que reduziria o texto ('+new Date().toLocaleString('pt-BR')+')'}]}});
    await gravar({id:'notas-recuperadas',titulo:'Notas — cópias recuperadas',pasta:'',ordem:0,atualizado:new Date().toISOString(),doc:{v:1,blocos},aparelhoId:aparelho},true);
  }
  async function gravar(p,uniao=false){
    let f=null,sha=shas.get(p.id);if(uniao||!p.doc||!sha){f=await ler(caminho(p.id));sha=f.sha}
    let unir=uniao||(!!f&&shas.get(p.id)!==f.sha);   // base desconhecida/diferente do remoto
    for(let t=0;t<8;t++){
      let completo={...(f?.d||{}),...p};
      if(f?.d&&uniao&&String(f.d.atualizado||'')>=String(p.atualizado||''))completo={...p,...f.d};   // metadados: o mais novo
      delete completo.sha;if(completo.origem===null||(p.doc&&!('origem' in p)&&!(uniao&&completo===f?.d)))delete completo.origem;
      if(p.doc&&f?.d?.doc&&unir)completo.doc={...p.doc,blocos:unirBlocos(blocosDe(p.doc),blocosDe(f.d.doc))};
      if(!completo.doc)throw Error('Conteúdo da página indisponível; alteração preservada.');
      if(f?.d&&!f.d.excluida&&(uniao||docVazio(completo.doc))&&JSON.stringify(completo.doc)===JSON.stringify(f.d.doc))return atualizarIndice(p.id);   // nada a acrescentar
      if(f?.d&&!f.d.excluida&&docVazio(completo.doc)&&!docVazio(f.d.doc))completo.doc=clone(f.d.doc);   // página vazia nunca apaga remoto com conteúdo
      try{
        if(!f&&!apagou.has(p.id)&&p.id!=='notas-recuperadas'&&textoDe(completo.doc)<(tamanhos.get(p.id)||0)*0.5){f=await ler(caminho(p.id));if(f.sha!==sha){unir=true;continue}}
        const antes=f?.d?.doc?textoDe(f.d.doc):0;
        if(antes>0&&textoDe(completo.doc)<antes*0.5&&!apagou.has(p.id)&&p.id!=='notas-recuperadas'&&!f.d.excluida)await guardarCopia(p.id,f);
        sha=await put(caminho(p.id),completo,sha);shas.set(p.id,sha);tamanhos.set(p.id,textoDe(completo.doc));return await atualizarIndice(p.id);
      }catch(e){if(!conflito(e))throw e;f=await ler(caminho(p.id));sha=f.sha;unir=true}
    }throw Error('Página ocupada; alteração permanece na fila.');
  }
  // Remove legado só depois de reler cada arquivo e achar todos os ids de bloco.
  async function confirmaBlocos(p){const f=await ler(caminho(p.id)),ids=new Set(blocosDe(f.d?.doc).map(chaveB));
    if(!blocosDe(p.doc).every(b=>docVazio({blocos:[b]})||ids.has(chaveB(b))))throw Error('Migração incompleta; plano preservado.')}
  async function enviar(){
    clearTimeout(timer);if(voo)return voo;
    const executar=async()=>{carregarFila();try{
      // Snapshot: edição durante PUT tem outro rev e nunca é retirada por esta confirmação.
      for(const e of [...pend.values()].sort((a,b)=>a.em-b.em||a.rev.localeCompare(b.rev))){
        const confirmado=await gravar(clone(e.p));ultima=Date.now();erro='';
        if(pend.get(e.k)?.rev===e.rev){pend.delete(e.k);try{if(JSON.parse(o.storage.getItem(e.k)||'null')?.rev===e.rev)o.storage.removeItem(e.k)}catch(x){}
          if(e.p.excluida)abertas.delete(e.p.id);else if((abertas.has(e.p.id)||e.p.doc)&&confirmado?.d)abertas.set(e.p.id,clone(confirmado.d));
          if(confirmado?.d)cache('notas:pagina:'+e.p.id,{sha:confirmado.sha,p:confirmado.d});}
      }return true;
    }catch(e){erro=e.message;return false}};
    voo=(o.trava?o.trava(executar):executar()).finally(()=>{voo=null;mudou();if(pend.size&&!erro){clearTimeout(timer);timer=setTimeout(enviar,0)}});return voo;
  }
  // Versões: commits do arquivo da página; {plano:true} lê o histórico anterior à 1.48 (notasDoc / notasPaginas em semana/plano.json).
  async function versoes(id,opt={}){
    const arq=opt.plano?'semana/plano.json':caminho(id);
    if(!opt.ref)return api('commits?path='+encodeURIComponent(arq)+'&per_page='+(opt.porPagina||30)+'&page='+(opt.pagina||1));
    const d=(await ler(arq+'?ref='+encodeURIComponent(opt.ref))).d;if(!opt.plano)return d;
    if(id==='notas')return d?.notasDoc?{id,titulo:'Notas',doc:d.notasDoc,atualizado:d.notasDoc.atualizado||carimbo(d.notasDoc)}:null;
    const p=(d?.notasPaginas?.paginas||[]).find(x=>x?.id===id);return p?.doc?p:null;
  }
  async function restaurar(id,ref,plano=false){const p=await versoes(id,{ref,plano});if(!p?.doc)throw Error('Versão não encontrada');salvarPagina({...p,id,excluida:false,atualizado:new Date().toISOString()});return enviar()}
  const carimbo=doc=>(doc?.blocos||[]).reduce((a,b)=>String(b.atualizado||'')>a?String(b.atualizado):a,'');
  const maiorData=(...ds)=>ds.filter(Boolean).map(String).sort().at(-1)||'';   // sem data: o arquivo remoto, se existir, vence
  const lerLista=k=>{try{const v=JSON.parse(o.storage?.getItem(k)||'null');return Array.isArray(v)?v:null}catch(e){return null}};
  const fnv64=s=>{let h=14695981039346656037n;for(let i=0;i<s.length;i++)h=BigInt.asUintN(64,(h^BigInt(s.charCodeAt(i)))*1099511628211n);return h.toString(16)};
  function paginasLegadas(d){if(!d)return [];const l=(d.notasPaginas?.paginas||[]).filter(p=>p.doc).map(clone);
    if(d.notasDoc)l.push({id:'notas',titulo:'Notas',pasta:'',ordem:0,atualizado:d.notasDoc.atualizado||carimbo(d.notasDoc),doc:clone(d.notasDoc)});
    else if(d.notas?.length&&o.converterAntigas)l.push(o.converterAntigas(d.notas));
    if(d.notas_v138?.length&&o.converterAntigas)l.push({...o.converterAntigas(d.notas_v138),id:'notas-legado-v138',titulo:'Notas — cópia anterior'});
    if(d.notas_conflitos?.length){const blocos=d.notas_conflitos.filter(c=>c.conteudo).map((c,i)=>({id:'recuperado-'+i,atualizado:c.atualizado||c.em||'',conteudo:typeof c.conteudo==='string'?{type:'paragraph',content:[{type:'text',text:c.conteudo}]}:clone(c.conteudo)}));
      l.push({id:'notas-recuperadas',titulo:'Notas — cópias recuperadas',doc:{v:1,blocos},atualizado:carimbo({blocos})})}
    return l;
  }
  async function integrarPlano(d,sha){
    if(migrando){await migrando;const f=await ler('semana/plano.json');return integrarPlano(f.d,f.sha)}
    if(!paginasLegadas(d).length)return {d,sha};
    migrando=(async()=>{for(let t=0;t<8;t++){
      for(const p of paginasLegadas(d)){await gravar({...p,aparelhoId:p.aparelhoId||aparelho},true);await confirmaBlocos(p)}
      const limpo=clone(d);delete limpo.notasDoc;delete limpo.notas;delete limpo.notas_v138;delete limpo.notas_conflitos;
      if(limpo.notasPaginas){delete limpo.notasPaginas.paginas;if(!Object.keys(limpo.notasPaginas).some(k=>k!=='v'))delete limpo.notasPaginas}
      limpo.paginasEmArquivos=2;
      try{const nova=await put('semana/plano.json',limpo,sha);return {d:limpo,sha:nova}}
      catch(e){if(!conflito(e))throw e;const f=await ler('semana/plano.json');d=f.d;sha=f.sha}
    }throw Error('Plano ocupado; migração será retomada.');})().finally(()=>{migrando=null});return migrando;
  }
  // Frases/pastas antigas: sem fusão. Item alterado no aparelho (≠ base) entra por id se for mais novo que o do plano; exclusões não são aplicadas.
  async function aplicarLegadoPlano(x,emIso){
    const alterados=(l,base)=>(Array.isArray(l)?l:[]).filter(i=>i&&typeof i.id==='string'&&JSON.stringify(i)!==JSON.stringify((base||[]).find(b=>b?.id===i.id)));
    const fr=alterados(x.frases,x.baseFrases||x.base||lerLista('bcbr_notasfrases_base_v143')||lerLista('bcbr_notasfrases_base')),
      pt=alterados(x.pastas,x.basePastas||x.base||lerLista('bcbr_notaspastas_base_v143')||lerLista('bcbr_notaspastas_base'));
    if(!fr.length&&!pt.length)return;
    const aplica=(lista,itens)=>{const l=Array.isArray(lista)?clone(lista):[];for(const i of itens){const k=l.findIndex(r=>r?.id===i.id);
      if(k<0)l.push(clone(i));else if(String(i.atualizado||emIso)>String(l[k].atualizado||''))l[k]=clone(i)}return l};
    for(let t=0;t<8;t++){
      const f=await ler('semana/plano.json');if(!f.d)throw Error('Plano indisponível; pendência antiga preservada.');const d=clone(f.d);
      if(fr.length)d.notasFrases=aplica(d.notasFrases,fr);
      if(pt.length)d.notasPaginas={...(d.notasPaginas||{}),pastas:aplica(d.notasPaginas?.pastas,pt)};
      try{await put('semana/plano.json',d,f.sha);return}catch(e){if(!conflito(e))throw e}
    }throw Error('Plano ocupado; pendência antiga será retomada.');
  }
  // Só lê chaves antigas. Sua remoção não é necessária: recibo local impede replay após confirmação.
  async function receberLegado(){
    if(!o.storage)return;
    const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),v=>v.toString(16).padStart(2,'0')).join('');
    const ok143=new Set(lerLista('bcbr_notasdoc_pendente_v143_legado_ok')||[]),ops=[];
    legadoPreservado.length=0;
    for(let i=0;i<o.storage.length;i++){
      const k=o.storage.key(i);if(k!=='bcbr_notasdoc_pendente'&&!k?.startsWith('bcbr_notasdoc_pendente:'))continue;
      const raw=o.storage.getItem(k);if(raw===null)continue;
      const h=await hash(raw);if(o.storage.getItem('bcbr_migrada_v2:'+k)===h)continue;
      try{
        const x=JSON.parse(raw);
        if(!x||typeof x!=='object'||!['blocos','paginas','frases','pastas','conflitos'].some(c=>Array.isArray(x[c])))throw Error('formato');
        ops.push({k,raw,x,h});
      }catch(e){legadoPreservado.push(k);erro='Pendência antiga ilegível; preservada no aparelho.'}
    }
    try{
      for(const {k,raw,x,h} of ops.sort((a,b)=>(Number(a.x.em)||0)-(Number(b.x.em)||0)||a.k.localeCompare(b.k))){
        if((k==='bcbr_notasdoc_pendente'&&(ok143.has(fnv64(raw))||ops.some(y=>y.k==='bcbr_notasdoc_pendente:legado:'+fnv64(raw))))||(typeof x.legadoRaw==='string'&&ok143.has(fnv64(x.legadoRaw)))){
          try{o.storage.setItem('bcbr_migrada_v2:'+k,h)}catch(e){}continue;
        }
        const emIso=Number.isFinite(x.em)&&x.em>0?new Date(x.em).toISOString():'';
        const basePag=Array.isArray(x.basePaginas)?x.basePaginas:(!Array.isArray(x.blocos)&&Array.isArray(x.base)?x.base:lerLista('bcbr_notaspag_base_v143')||lerLista('bcbr_notaspag_base')||[]);
        const pags=[];
        if(Array.isArray(x.paginas)){
          for(const p of x.paginas)if(p?.id&&p.doc){const b=basePag.find(y=>y?.id===p.id);if(!b||JSON.stringify(p)!==JSON.stringify(b))pags.push({...p,atualizado:maiorData(p.atualizado,emIso,carimbo(p.doc))})}
        }
        if(Array.isArray(x.blocos))pags.push({id:'notas',titulo:'Notas',pasta:'',ordem:0,doc:{v:1,blocos:x.blocos},atualizado:maiorData(emIso,carimbo({blocos:x.blocos}))});
        if(Array.isArray(x.conflitos)&&x.conflitos.length){
          const blocos=x.conflitos.filter(c=>c?.conteudo).map((c,i)=>({id:'recuperado-'+i,atualizado:c.atualizado||c.em||emIso,conteudo:typeof c.conteudo==='string'?{type:'paragraph',content:[{type:'text',text:c.conteudo}]}:clone(c.conteudo)}));
          if(blocos.length)pags.push({id:'notas-recuperadas-'+fnv64(k),titulo:'Notas — cópias recuperadas',doc:{v:1,blocos},atualizado:maiorData(emIso,carimbo({blocos}))});
        }
        for(const p of pags)await gravar({...p,aparelhoId:aparelho},true);
        await aplicarLegadoPlano(x,emIso);
        try{o.storage.setItem('bcbr_migrada_v2:'+k,h)}catch(e){}
      }
    }catch(e){erro=e.message}
  }
  return {listarPaginas,abrirPagina,salvarPagina,versoes,restaurar,enviar,integrarPlano,receberLegado,
    estado:()=>({paginas:clone(lista()),abertas:clone(Object.fromEntries(abertas)),pendentes:pend.size,volatil:[...pend.values()].some(e=>e.volatil),erro,ultima,enviando:!!voo,indiceConhecido,legado:clone(legadoPreservado)})};
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
