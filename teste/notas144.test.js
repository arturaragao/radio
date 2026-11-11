const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const copy=x=>JSON.parse(JSON.stringify(x)),b64=x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64');
const bloco=(id,texto,data='2026-11-11T12:00:00Z')=>({id,atualizado:data,conteudo:{type:'paragraph',attrs:{id},content:[{type:'text',text:texto}]}});
const inicial=()=>({v:2,dias:{},tarefas:[],notasDoc:{v:1,blocos:[]},notasPaginas:{v:1,paginas:[{id:'p',titulo:'Página',atualizado:'2026-11-11T12:00:00Z',doc:{v:1,blocos:[bloco('a','Original A'),bloco('b','Original B')]}}]}});
const semana=fs.readFileSync(require.resolve('../build/semana.js'),'utf8');
const fonte=semana.slice(0,semana.indexOf('// ---------- tipo do dia'))+'\n'+['notas','notas2'].map(n=>fs.readFileSync(require.resolve('../build/'+n+'.js'),'utf8')).join('\n');
function servidor(d=inicial()){
  const arquivos=new Map(),blobs=new Map(),calls=[];
  function grava(path,d){const raw=JSON.stringify(d),sha=crypto.createHash('sha1').update(raw).digest('hex');arquivos.set(path,{sha,d:copy(d)});blobs.set(sha,raw);return sha}
  grava('semana/plano.json',d);
  const s={arquivos,blobs,calls,grava,hook:null,offline:false,api:async(path,opt={})=>{
    const rel=path.split('/contents/')[1],method=opt.method||'GET';calls.push({rel,path,method,etag:opt.etag});
    if(s.offline)throw new TypeError('Failed to fetch');
    await s.hook?.(rel,method,'antes');
    if(path.includes('/git/blobs/')){const sha=path.split('/git/blobs/')[1],raw=blobs.get(sha);if(!raw)throw Object.assign(Error('blob ausente'),{status:404});return {encoding:'base64',content:b64(raw),sha}}
    if(rel==='semana/paginas/'&&method==='GET'){
      const lista=[...arquivos].filter(([p])=>p.startsWith(rel)).map(([path,f])=>({type:'file',name:path.slice(rel.length),path,sha:f.sha}));
      const etag='"'+crypto.createHash('sha1').update(JSON.stringify(lista)).digest('hex')+'"';
      if(opt.etag===etag)return {naoMudou:true};lista.etag=etag;return lista;
    }
    const atual=arquivos.get(rel);
    if(method==='PUT'||method==='DELETE'){
      const body=JSON.parse(opt.body);if((atual?.sha||undefined)!==body.sha)throw Object.assign(Error('conflito'),{status:409});
      if(method==='DELETE'){arquivos.delete(rel);return {commit:{sha:'delete'}}}
      const sha=grava(rel,JSON.parse(Buffer.from(body.content,'base64').toString()));await s.hook?.(rel,method,'depois');return {content:{sha}};
    }
    if(!atual)throw Object.assign(Error('ausente'),{status:404});
    if(opt.etag==='"'+atual.sha+'"')return {naoMudou:true};
    const raw=blobs.get(atual.sha),size=Buffer.byteLength(raw);
    return {sha:atual.sha,etag:'"'+atual.sha+'"',size,encoding:size>1000000?'none':'base64',content:size>1000000?'':b64(raw)};
  }};return s;
}
async function app(s,mem=new Map(),locks=true){
  const timers=[],avisos=[],listeners={},d=copy(s.arquivos.get('semana/plano.json').d);
  if(!mem.has('sm_cache2'))mem.set('sm_cache2',JSON.stringify({d,sha:s.arquivos.get('semana/plano.json').sha}));
  const document={hidden:false,visibilityState:'visible',querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,addEventListener:(k,f)=>(listeners[k]??=[]).push(f)};
  const c=vm.createContext({console,document,window:{addEventListener:(k,f)=>(listeners[k]??=[]).push(f)},navigator:{onLine:true,...(locks?{locks:{request:async(n,o,f)=>f()}}:{})},
    localStorage:{get length(){return mem.size},key:i=>[...mem.keys()][i],getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)},
    setTimeout:(fn,ms)=>(timers.push({fn,ms}),timers.length),clearTimeout(){},setInterval(){},clearInterval(){},Blob,URL,Uint8Array,
    atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64'),
    BCBR:{REPO:'ficticio/teste',b64,api:s.api},smAgendaPuxar(){},smAuto(){},smNativoTarefas(){},render(){},tela:'tarefas',toast:m=>avisos.push(m),esc:String});
  vm.runInContext(fonte,c);await c.ntMigraLegado();await new Promise(r=>setImmediate(r));
  const run=expr=>vm.runInContext(expr,c);return {c,mem,timers,avisos,listeners,run,sm:()=>run('SM'),fila:()=>run('SM.fila')};
}
const texto=x=>JSON.stringify(x);
const plano=s=>s.arquivos.get('semana/plano.json').d;
const pagina=s=>s.arquivos.get('semana/paginas/p.json')?.d;
async function migra(a){return a.c.smMudar(()=>{},'migração fictícia')}

test('rodada3 P0: duas edições da mesma tarefa durante hidratação e reload após primeiro PUT',async()=>{
  const d=inicial();d.tarefas=[{id:'t',texto:'Antes'}];const s=servidor(d),origem=await app(s);await migra(origem);
  const a=await app(s);let chegou,libera,segundo;const hidratando=new Promise(r=>chegou=r),espera=new Promise(r=>libera=r),proximo=new Promise(r=>segundo=r);
  let leituras=0;const nunca=new Promise(()=>{});
  s.hook=async(rel,method,fase)=>{if(rel==='semana/paginas/p.json'&&method==='GET'&&fase==='antes'&&++leituras===1){chegou();await espera}};
  const primeiro=a.c.smMudar(d=>d.tarefas[0].texto='Primeira');await hidratando;
  a.c.smMudar(d=>d.tarefas[0].texto='SEGUNDA_NUNCA_ENVIADA');
  const hidrata=a.c.ntArquivosHidratar;let chamadas=0;
  a.c.ntArquivosHidratar=async d=>{if(++chamadas===1){segundo();await nunca}return hidrata(d)};
  libera();assert.equal(await primeiro,true);await proximo;
  assert.equal(plano(s).tarefas[0].texto,'Primeira','primeiro PUT não contém a segunda edição');
  assert.equal(a.sm().d.tarefas[0].texto,'SEGUNDA_NUNCA_ENVIADA','memória não regride');
  const pendentes=[...a.mem].filter(([k])=>k.startsWith('sm_operacao144:'));
  assert.equal(pendentes.length,1,'somente a operação enviada foi confirmada');assert.match(pendentes[0][1],/SEGUNDA_NUNCA_ENVIADA/);
  s.hook=null;const b=await app(s,new Map(a.mem));assert.equal(b.sm().d.tarefas[0].texto,'SEGUNDA_NUNCA_ENVIADA');
  await b.c.smPuxar();await b.fila();assert.equal(plano(s).tarefas[0].texto,'SEGUNDA_NUNCA_ENVIADA');
});

test('rodada3 P1: sem locks, exclusão de bloco ou página contra edição concorrente',async()=>{
  for(const alvo of ['bloco','página'])for(const apagarPrimeiro of [false,true]){
    const s=servidor(),origem=await app(s);await migra(origem);
    const a=await app(s,new Map(),false),b=await app(s,new Map(),false);
    for(const x of [a,b]){await x.c.smPuxar();x.c.ntBaseSalva([],copy(x.sm().d.notasPaginas.paginas))}
    a.c.pgMuda(ps=>{if(alvo==='bloco')ps[0].doc.blocos.splice(0,1);else ps.splice(0)},false);
    b.c.pgMuda(ps=>{ps[0].doc.blocos[0]=bloco('a','TEXTO_NOVO_CONCORRENTE','2026-11-11T15:00:00Z');ps[0].atualizado='2026-11-11T15:00:00Z'},false);
    for(const x of apagarPrimeiro?[a,b]:[b,a])assert.equal(await x.c.ntSync(),true);
    const c=await app(s,new Map(),false);await c.c.smPuxar();
    assert.match(texto(c.sm().d.notasPaginas.paginas),/TEXTO_NOVO_CONCORRENTE/,alvo+' mantém edição visível');
    assert.match(texto(c.sm().d.notas_conflitos),/TEXTO_NOVO_CONCORRENTE/,alvo+' arquiva edição concorrente');
    assert.match(texto(c.sm().d.notas_conflitos),/apagado em .+, editado em /);
    c.c.pgMuda(ps=>{if(alvo==='bloco')ps[0].doc.blocos=ps[0].doc.blocos.filter(b=>b.id!=='a');else ps.splice(0)},false);
    assert.equal(await c.c.ntSync(),true);const visto=await app(s,new Map(),false);await visto.c.smPuxar();
    assert.doesNotMatch(texto(visto.sm().d.notasPaginas.paginas),/TEXTO_NOVO_CONCORRENTE/,'exclusão posterior da versão vista é respeitada');
    assert.match(texto(visto.sm().d.notas_conflitos),/TEXTO_NOVO_CONCORRENTE/,'histórico continua preservado');
  }
});

test('rodada3 órfã: outro aparelho descobre PUT de página sem confirmação de metadados',async()=>{
  for(const variante of ['existente','nova','migração']){
  const nova=variante==='nova',s=servidor(),a=await app(s);if(variante!=='migração')await migra(a);const b=await app(s);
  if(variante!=='migração'){await b.c.smPuxar();await b.fila();}
  const id=nova?'nova':'p',path='semana/paginas/'+id+'.json';
  const rev=plano(s).notasPaginas.paginas[0].rev;let chegou;const interrompido=new Promise(r=>chegou=r);
  s.hook=async(rel,method,fase)=>{if(rel==='semana/plano.json'&&method==='PUT'&&fase==='antes'){chegou();await new Promise(()=>{})}};
  a.c.pgMuda(ps=>{if(nova)ps.push({id,titulo:'Título órfão',doc:{v:1,blocos:[bloco('a','REVISAO_ORFA')]}});else ps[0].doc.blocos[0]=bloco('a','REVISAO_ORFA','2026-11-11T16:00:00Z')});await interrompido;
  assert.equal(plano(s).notasPaginas.paginas[0].rev,rev);assert.match(texto(s.arquivos.get(path).d.doc),/REVISAO_ORFA/);
  s.hook=null;s.calls.length=0;await b.c.smPuxar();await b.fila();
  assert.match(texto(b.sm().d.notasPaginas.paginas.find(p=>p.id===id)?.doc||{}),/REVISAO_ORFA/,'aparelho sem fila da origem descobre arquivo');
  if(nova)assert.equal(b.sm().d.notasPaginas.paginas.find(p=>p.id===id).titulo,'Título órfão');
  assert.equal(plano(s).notasPaginas.paginas.find(p=>p.id===id).rev,s.arquivos.get(path).sha);
  await b.c.smPuxar();await b.fila();s.calls.length=0;await b.c.smPuxar();await b.fila();
  assert.ok(s.calls.some(c=>c.rel==='semana/paginas/'&&c.etag),'listagem condicional mesmo com plano 304');
  assert.equal(s.calls.filter(c=>c.rel?.startsWith('semana/paginas/')&&c.rel.endsWith('.json')).length,0,'304 não baixa página conhecida');
  }
});

test('revisão: 409 e fechamento durante próximo envio preservam tarefa já no cache',async()=>{
  const d=inicial();d.tarefas=[{id:'t',texto:'Antes'}];const s=servidor(d),a=await app(s);await migra(a);
  let libera,atingiu;const chegou=new Promise(r=>atingiu=r),espera=new Promise(r=>libera=r);let puts=0;
  s.hook=async(rel,method,fase)=>{if(rel==='semana/plano.json'&&method==='PUT'&&fase==='antes'){
    if(++puts===1){const r=copy(plano(s));r.subtitulo='Mudança remota';s.grava(rel,r)}
    else{atingiu();await espera}
  }};
  const voo=a.c.smMudar(d=>d.tarefas[0].texto='Texto que não pode sumir','tarefa');await chegou;
  const disco=new Map(a.mem);s.hook=null;const b=await app(s,disco);await b.c.smPuxar();await b.fila();
  assert.equal(plano(s).tarefas[0].texto,'Texto que não pode sumir');assert.equal(plano(s).subtitulo,'Mudança remota');
  libera();await voo;
});

test('revisão: cache sem documentos com nota pendente hidrata e entrega',async()=>{
  for(const baseConhecida of [false,true]){
  const s=servidor(),a=await app(s);await migra(a);const b=await app(s);
  assert.equal(b.sm().d.notasPaginas.paginas[0].doc,undefined);
  if(baseConhecida)b.c.pgBaseSalva(copy(a.sm().d.notasPaginas.paginas));
  b.c.ntFilaGrava('blocos',[],[bloco('pendente','Nota aguardando página')]);
  if(baseConhecida)assert.equal(await b.c.ntSync(),true);
  await b.c.smPuxar();await b.fila();await b.c.ntSync();
  assert.equal(b.run('ntTemPendentes()'),false);assert.match(texto(plano(s).notasDoc),/Nota aguardando página/);
  assert.match(texto(pagina(s)),/Original A/);
  assert.match(texto(b.sm().d.notasPaginas.paginas[0].doc),/Original A/);
  }
});

test('revisão: cliente 1.43 sem conteúdo não apaga e exclusão explícita sem locks não ressuscita',async()=>{
  const s=servidor(),a=await app(s);await migra(a);const legado=copy(plano(s));
  legado.notasPaginas.paginas[0].doc={v:1,blocos:[]};s.grava('semana/plano.json',legado);
  const b=await app(s,new Map(),false);await b.c.smPuxar();
  assert.match(texto(b.sm().d.notasPaginas.paginas[0].doc),/Original A/);
  b.c.pgMuda(ps=>ps[0].doc.blocos=[]);await b.fila();
  const c=await app(s);c.sm().sha=null;await c.c.smPuxar();await c.fila();
  assert.deepEqual(copy(c.sm().d.notasPaginas.paginas[0].doc.blocos),[]);
  assert.deepEqual(pagina(s).doc.blocos,[]);
});

test('revisão: migração com metadados não confirmados reenvia sozinha ao reabrir',async()=>{
  const s=servidor(),a=await app(s);await migra(a);
  let libera,atingiu;const chegou=new Promise(r=>atingiu=r),espera=new Promise(r=>libera=r);
  s.hook=async(rel,method)=>{if(rel==='semana/plano.json'&&method==='PUT'){atingiu();await espera;throw Object.assign(Error('metadados indisponíveis'),{status:503})}};
  const voo=a.c.smMudar(d=>{const bs=d.notasPaginas.paginas[0].doc.blocos;if(!bs.some(b=>b.id==='meta'))bs.push(bloco('meta','Edição antes dos metadados'))},'preparação');
  await chegou;assert.match(texto(pagina(s)),/Edição antes dos metadados/);
  const disco=new Map(a.mem);s.hook=null;const b=await app(s,disco);await b.c.smPuxar();await b.fila();
  assert.equal(plano(s).notasPaginas.paginas[0].rev,s.arquivos.get('semana/paginas/p.json').sha);
  assert.equal(b.run('ntTemPendentes()'),false);
  libera();await voo;
});

test('revisão: confirmação ignora ordem das propriedades, mas conserva edição nova',async()=>{
  const s=servidor(),a=await app(s),p=copy(inicial().notasPaginas.paginas[0]);
  const salvo={notasDoc:{blocos:[]},notasPaginas:{paginas:[p]}};
  const op={blocos:[],paginas:[Object.fromEntries(Object.entries(p).reverse())]};
  assert.equal(a.run('ntConfirmada')(salvo,op),true);
  op.paginas[0].titulo='Nova edição';assert.equal(a.run('ntConfirmada')(salvo,op),false);
});

test('revisão: operações no mesmo milissegundo mantêm ordem no reload e exclusão preserva tarefa remota',async()=>{
  const d=inicial();d.tarefas=[{id:'t',texto:'Antes'}];const s=servidor(d),a=await app(s);s.offline=true;
  a.run('Date.now=()=>1234');await a.c.smMudar(d=>d.tarefas[0].texto='Primeira');await a.c.smMudar(d=>d.tarefas[0].texto='Última');
  const b=await app(s,new Map(a.mem));assert.equal(b.sm().d.tarefas[0].texto,'Última');
  await b.c.smMudar(d=>d.tarefas=[]);const remoto=copy(plano(s));remoto.tarefas.push({id:'remota',texto:'Remota'});s.grava('semana/plano.json',remoto);s.offline=false;
  const c=await app(s,new Map(b.mem));await c.c.smPuxar();await c.fila();assert.deepEqual(plano(s).tarefas,[{id:'remota',texto:'Remota'}]);
});

test('revisão: desfazer exclusão de conteúdo sem locks retira a marca explícita',async()=>{
  const s=servidor(),a=await app(s);await migra(a);const b=await app(s,new Map(),false);await b.c.smPuxar();
  const blocos=copy(b.sm().d.notasPaginas.paginas[0].doc.blocos);
  b.c.pgMuda(ps=>ps[0].doc.blocos=[]);await b.fila();b.c.pgMuda(ps=>ps[0].doc.blocos=blocos);await b.fila();
  const c=await app(s);await c.c.smPuxar();await c.fila();assert.match(texto(c.sm().d.notasPaginas.paginas[0].doc),/Original A/);
});

test('revisão: operação de outra aba entre reaplicação e captura não é confirmada sem envio',async()=>{
  const s=servidor(),a=await app(s),aplica=a.c.ntAplica,k='sm_operacao144:outra-aba';let entrou=false;
  a.c.ntAplica=(d,ops)=>{aplica(d,ops);if(!entrou){entrou=true;const base={v:2,dias:{},tarefas:[]},local={...base,tarefas:[{id:'outra',texto:'Tarefa de outra aba'}]};a.mem.set(k,JSON.stringify({em:Date.now(),base,local}))}};
  assert.equal(await migra(a),true);
  assert.equal(plano(s).tarefas.length,0,'a operação chegou depois da reaplicação');
  assert.ok(a.mem.has(k),'só o lote efetivamente capturado pode ser confirmado');
  await a.c.smPuxar();await a.fila();assert.match(texto(plano(s).tarefas),/Tarefa de outra aba/);assert.equal(a.mem.has(k),false);
});

test('1.44: página primeiro, releitura, metadados depois; idempotência e download só da rev alterada',async()=>{
  const s=servidor(),a=await app(s);assert.equal(await migra(a),true);
  assert.equal(plano(s).notasPaginas.paginas[0].doc,undefined);assert.match(texto(pagina(s)),/Original A/);
  const puts=s.calls.filter(x=>x.method==='PUT');assert.deepEqual(puts.map(x=>x.rel),['semana/paginas/p.json','semana/plano.json']);
  assert.ok(s.calls.findIndex(x=>x.rel==='semana/paginas/p.json'&&x.method==='PUT')<s.calls.findLastIndex(x=>x.rel==='semana/paginas/p.json'&&x.method==='GET'));
  assert.equal([...a.mem.keys()].filter(k=>k.startsWith('bcbr_paginas_pre144:')).length,0);
  s.calls.length=0;await migra(a);assert.equal(s.calls.filter(x=>x.method==='PUT'&&x.rel.includes('paginas/')).length,0);
  const b=await app(s);await b.c.ntArquivosLer(b.sm().d);assert.match(texto(b.sm().d),/Original A/);s.calls.length=0;
  await b.c.ntArquivosLer(copy(plano(s)));assert.equal(s.calls.length,0,'rev conhecida usa cache');
});

for(const etapa of ['backup','antes página','depois página','releitura','antes plano','depois plano'])test('1.44: interrupção '+etapa+' preserva texto e permite retomar',async()=>{
  const s=servidor(),a=await app(s),orig=copy(plano(s));let escreveu=false,quebrou=false;
  if(etapa==='backup'){const set=a.c.localStorage.setItem;a.c.localStorage.setItem=(k,v)=>{set(k,v);if(k.startsWith('bcbr_paginas_pre144:'))throw Error('fechou após backup')}}
  s.hook=(rel,met,fase)=>{
    if(rel==='semana/paginas/p.json'&&met==='PUT'&&fase==='depois')escreveu=true;
    const atinge=etapa==='antes página'&&rel?.includes('/paginas/')&&met==='PUT'&&fase==='antes'||etapa==='depois página'&&escreveu&&met==='PUT'&&fase==='depois'||etapa==='releitura'&&escreveu&&met==='GET'&&rel?.includes('/paginas/')||etapa==='antes plano'&&rel==='semana/plano.json'&&met==='PUT'&&fase==='antes'||etapa==='depois plano'&&rel==='semana/plano.json'&&met==='PUT'&&fase==='depois';
    if(atinge&&!quebrou){quebrou=true;throw Error('interrompido em '+etapa)}
  };
  assert.equal(await migra(a),false);assert.match(texto(a.sm().d),/Original A/);
  const backup=[...a.mem.entries()].find(([k])=>k.startsWith('bcbr_paginas_pre144:'));assert.ok(backup);assert.match(backup[1],/Original A/);
  if(etapa!=='depois plano')assert.deepEqual(plano(s),orig,'plano ainda contém texto');else assert.match(texto(pagina(s)),/Original A/);
  s.hook=null;const b=await app(s,a.mem);assert.equal(await migra(b),true);assert.match(texto(pagina(s)),/Original A/);assert.match(texto(pagina(s)),/Original B/);
});

test('1.44: sem locks não migra, avisa uma vez e preserva inline',async()=>{
  const s=servidor(),a=await app(s,new Map(),false);await migra(a);await migra(a);
  assert.match(texto(plano(s)),/Original A/);assert.equal(pagina(s),undefined);assert.equal(a.avisos.filter(x=>x.includes('Web Locks')).length,1);
});

for(const comRev of [true,false])test('1.44: aba 1.43 devolve inline depois da migração (com rev '+comRev+'); ambos textos sobrevivem',async()=>{
  const original=inicial(),s=servidor(original),a=await app(s);await migra(a);
  const legado=copy(plano(s));legado.notasPaginas.paginas[0].doc=copy(original.notasPaginas.paginas[0].doc);legado.notasPaginas.paginas[0].doc.blocos[0]=bloco('a','Texto aba antiga','2026-11-11T13:00:00Z');
  if(!comRev)delete legado.notasPaginas.paginas[0].rev;
  s.grava('semana/plano.json',legado);await a.c.smPuxar1();await a.fila();
  assert.match(texto(pagina(s)),/Texto aba antiga/);assert.match(texto(pagina(s)),/Original A/);assert.equal(plano(s).notasPaginas.paginas[0].doc,undefined);
});

test('1.44: dois aparelhos offline editam mesma página e mesmo bloco; fila falha mantém bytes',async()=>{
  const s=servidor(),a=await app(s);await migra(a);const b=await app(s);await b.c.ntArquivosLer(b.sm().d);b.c.ntBaseSalva([],b.sm().d.notasPaginas.paginas);
  s.offline=true;
  for(const [x,t,data] of [[a,'Texto PC','2026-11-11T13:00:00Z'],[b,'Texto celular','2026-11-11T14:00:00Z']]){
    x.c.pgMuda(ps=>{ps[0].doc.blocos[0]=bloco('a',t,data);ps[0].atualizado=data});await x.fila();assert.equal(x.run('ntTemPendentes()'),true);assert.match([...x.mem.values()].join(''),new RegExp(t));
  }
  const raw=[...b.mem.entries()].filter(([k])=>k.startsWith('bcbr_notasdoc_pendente:'));await b.c.ntSync();for(const [k,v] of raw)assert.equal(b.mem.get(k),v);
  s.offline=false;assert.equal(await a.c.ntSync(),true);assert.equal(await b.c.ntSync(),true);
  assert.match(texto(pagina(s)),/Texto PC/);assert.match(texto(pagina(s)),/Texto celular/);assert.equal(b.run('ntTemPendentes()'),false);
});

test('1.44: apagar em um aparelho e editar no outro preserva texto e arquiva exclusão',async()=>{
  const s=servidor(),a=await app(s);await migra(a);const b=await app(s);await b.c.ntArquivosLer(b.sm().d);b.c.ntBaseSalva([],b.sm().d.notasPaginas.paginas);
  s.offline=true;b.c.pgMuda(ps=>{ps[0].doc.blocos.push(bloco('novo','Edição offline'));ps[0].atualizado='2026-11-11T15:00:00Z'});await b.fila();
  s.offline=false;a.c.pgMuda(ps=>ps.splice(0));await a.fila();await new Promise(r=>setImmediate(r));
  assert.equal(plano(s).notasPaginas.paginas.length,0);assert.match(texto(plano(s).notas_conflitos),/Original A/);
  assert.equal(await b.c.ntSync(),true);assert.match(texto(pagina(s)),/Edição offline/);assert.match(texto(pagina(s)),/Original A/);
});

test('1.44: plano 1,7 MB usa blob e migra página grande, sem alterar tarefas',async()=>{
  const d=inicial();d.notasPaginas.paginas[0].doc.blocos=[bloco('grande','ç'.repeat(850000))];
  const s=servidor(d),a=await app(s);a.sm().sha=null;await a.c.smPuxar1();await a.fila();
  assert.ok(s.calls.some(c=>c.path.includes('/git/blobs/')));assert.equal(plano(s).notasPaginas.paginas[0].doc,undefined);
  assert.equal(pagina(s).doc.blocos[0].conteudo.content[0].text.length,850000);assert.deepEqual(plano(s).tarefas,[]);
});

test('1.44: rascunho síncrono antes do debounce sobrevive ao fechamento e reload',async()=>{
  const s=servidor(),a=await app(s);a.run("NT.shown=[];NT.sujo=true;NT.ed={getJSON:()=>({type:'doc',content:[{type:'paragraph',attrs:{id:'r'},content:[{type:'text',text:'Digitado antes de fechar'}]}]})};ntRascunhoGrava(NT)");
  const b=await app(s,a.mem);assert.equal(b.run('ntTemPendentes()'),true);assert.equal(await b.c.ntSync(),true);assert.match(texto(plano(s).notasDoc),/Digitado antes de fechar/);
});

test('1.44: mais de 20 conflitos ficam; descarte explícito passa pela fila',async()=>{
  const s=servidor(),a=await app(s),cs=Array.from({length:35},(_,i)=>({...bloco('c'+i,'Conflito '+i),em:'agora'}));
  a.sm().d.notas_conflitos=cs;a.c.ntConflitosProtege(a.sm().d);assert.equal(a.c.ntJuntaConflitos(cs,[]).length,35);
  s.offline=true;assert.equal(a.c.ntConflitoDescarta(cs[0]),true);await a.fila();assert.equal(a.run('ntConflitosLista().length'),34);assert.equal(a.run('ntTemPendentes()'),true);
  s.offline=false;await a.c.ntSync();assert.equal(plano(s).notas_conflitos.length,34);
});

test('1.44: sem data:image não envia imagem; com base64 usa compressão/envio existentes',async()=>{
  const s=servidor(),a=await app(s);let enviou=0,comprimiu=0;
  a.c.ntImgComprime=async b=>{comprimiu++;assert.ok(b.size);return b};a.c.ntImgEnvia=async()=>{enviou++;return 'ficticia.jpg'};
  await migra(a);assert.equal(enviou,0);
  a.c.pgMuda(ps=>ps[0].doc.blocos.push({id:'img',conteudo:{type:'image',attrs:{src:'data:image/png;base64,YQ=='}}}));await a.fila();
  assert.equal(enviou,1);assert.equal(comprimiu,1);assert.match(texto(pagina(s)),/\.\/img\/ficticia.jpg/);assert.doesNotMatch(texto(pagina(s).doc),/data:image/);
});

test('1.44: cache da aba antiga só com metadados hidrata mesmo SHA; página ausente não reinicia plano',async()=>{
  const s=servidor(),a=await app(s);await migra(a);
  const b=await app(s);await b.c.smPuxar1();assert.match(texto(b.sm().d),/Original A/);
  const anterior=copy(b.sm().d),d=copy(plano(s));d.notasPaginas.paginas[0].rev='inexistente';s.grava('semana/plano.json',d);
  s.calls.length=0;await b.c.smPuxar1();
  assert.deepEqual(copy(b.sm().d),anterior);assert.match(b.sm().erro,/404/);
  assert.equal(s.calls.some(c=>c.method==='PUT'),false,'falha de página não cria plano vazio');
});

test('1.44: releitura diferente do PUT mantém inline e backup, sem publicar metadados',async()=>{
  const s=servidor(),a=await app(s);s.hook=(rel,method,fase)=>{if(rel==='semana/paginas/p.json'&&method==='PUT'&&fase==='depois'){const d=copy(pagina(s));d.doc.blocos.push(bloco('outro','Edição no intervalo'));s.grava(rel,d)}};
  assert.equal(await migra(a),false);assert.ok(plano(s).notasPaginas.paginas[0].doc);assert.match(a.sm().erro,/releitura/);
  assert.ok([...a.mem.keys()].some(k=>k.startsWith('bcbr_paginas_pre144:')));
  s.hook=null;assert.equal(await migra(a),true);assert.match(texto(pagina(s)),/Edição no intervalo/);assert.match(texto(pagina(s)),/Original A/);
});

test('1.44: metadados falham após PUT da edição; reload preserva fila até confirmação',async()=>{
  const s=servidor(),a=await app(s);await migra(a);
  s.hook=(rel,method)=>{if(rel==='semana/plano.json'&&method==='PUT')throw Object.assign(Error('falha de plano'),{status:503})};
  a.c.pgMuda(ps=>{ps[0].doc.blocos.push(bloco('t','Edição salva só no arquivo'));ps[0].atualizado='2026-11-11T17:00:00Z'});await a.fila();
  assert.equal(a.run('ntTemPendentes()'),true);assert.match(texto(pagina(s)),/Edição salva só no arquivo/);
  s.hook=null;const b=await app(s,a.mem);assert.equal(await b.c.ntSync(),true);assert.equal(b.run('ntTemPendentes()'),false);
  const rev=plano(s).notasPaginas.paginas[0].rev;assert.match(s.blobs.get(rev),/Edição salva só no arquivo/);
});

test('1.44: DELETE só depois dos metadados; edição tardia impede exclusão por SHA',async()=>{
  const s=servidor(),a=await app(s);await migra(a);
  s.hook=(rel,method,fase)=>{if(method==='DELETE'&&fase==='antes'){assert.equal(plano(s).notasPaginas.paginas.length,0);const d=copy(pagina(s));d.doc.blocos.push(bloco('tarde','Texto durante exclusão'));s.grava(rel,d)}};
  a.c.pgMuda(ps=>ps.splice(0));await a.fila();await new Promise(r=>setImmediate(r));
  assert.ok(s.calls.some(c=>c.method==='DELETE'));assert.match(texto(pagina(s)),/Texto durante exclusão/);assert.match(texto(plano(s).notas_conflitos),/Original A/);
});

test('1.44: retry cresce e poll não o antecipa; pagehide persiste antes da tentativa',async()=>{
  const s=servidor(),a=await app(s);s.offline=true;
  a.run("NT.shown=[];NT.sujo=true;NT.ed={getJSON:()=>({type:'doc',content:[{type:'paragraph',attrs:{id:'sair'},content:[{type:'text',text:'Texto ao sair'}]}]})}");
  a.listeners.pagehide[0]();await a.fila();assert.equal(a.run('ntTemPendentes()'),true);
  assert.match([...a.mem.values()].join(''),/Texto ao sair/);assert.equal(a.timers.at(-1).ms,1000);
  const n=s.calls.filter(c=>c.method==='PUT').length;await a.c.smPuxar1();assert.equal(s.calls.filter(c=>c.method==='PUT').length,n,'pull permitido; PUT respeita espera');
  await a.c.ntSync();assert.equal(a.timers.at(-1).ms,2000);await a.c.ntSync();assert.equal(a.timers.at(-1).ms,4000);
  s.offline=false;await a.c.ntSync();assert.equal(a.run('ntTemPendentes()'),false);assert.match(texto(plano(s)),/Texto ao sair/);
});

test('1.44: duas páginas baixam só a revisão alterada; plano grande avisa em 700 KB',async()=>{
  const d=inicial();d.notasPaginas.paginas.push({...copy(d.notasPaginas.paginas[0]),id:'q'});
  const s=servidor(d),a=await app(s);await migra(a);const b=await app(s);await b.c.smPuxar1();s.calls.length=0;
  a.c.pgMuda(ps=>ps[0].doc.blocos.push(bloco('novo','Só página P')));await a.fila();s.calls.length=0;
  await b.c.smPuxar1();assert.ok(s.calls.some(c=>c.rel==='semana/paginas/p.json'));assert.equal(s.calls.some(c=>c.rel==='semana/paginas/q.json'),false);
  a.sm().d.notasDoc={v:1,blocos:[bloco('grande','z'.repeat(710000))]};assert.equal(await migra(a),true);assert.match(a.sm().avisoTamanho,/Dados grandes/);
});
