const {test}=require('node:test'),assert=require('node:assert/strict');
const {criarSyncNotas}=require('../build/sync-notas.js');
const cp=x=>JSON.parse(JSON.stringify(x)),erro=status=>Object.assign(Error('HTTP '+status),{status});
function armazenamento(){const m=new Map();return {m,get length(){return m.size},key:i=>[...m.keys()][i],getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}}
function github(){
  let n=0;const files=new Map(),hist=[],calls=[];const g={files,hist,calls,offline:false,hook:null};
  g.seed=(path,d)=>{const f={sha:'s'+(++n),d:cp(d)};files.set(path,f);hist.unshift({path,...cp(f)});return f.sha};
  g.api=async(url,opt={})=>{
    const u=new URL('https://fake'+url),method=opt.method||'GET',path=decodeURIComponent(u.pathname.split('/contents/')[1]||'');
    const c={method,path,url,opt};calls.push(c);if(g.offline)throw Error('offline');if(g.hook)await g.hook(c);
    if(u.pathname.endsWith('/commits'))return hist.filter(h=>h.path===u.searchParams.get('path')).map(h=>({sha:h.sha,commit:{message:'edição',author:{date:'2026-11-11'}}}));
    if(method==='PUT'){const b=JSON.parse(opt.body),f=files.get(path);if(b.sha!==(f?.sha))throw erro(409);const sha=g.seed(path,JSON.parse(Buffer.from(b.content,'base64').toString()));return {content:{sha}}}
    const f=u.searchParams.has('ref')?hist.find(h=>h.path===path&&h.sha===u.searchParams.get('ref')):files.get(path);
    if(!f)throw erro(404);if(opt.etag==='"'+f.sha+'"')return {naoMudou:true};
    return {sha:f.sha,etag:'"'+f.sha+'"',content:Buffer.from(JSON.stringify(f.d)).toString('base64')};
  };return g;
}
const page=(id,text='texto',atualizado='2026-11-11T10:00:00Z')=>({id,titulo:id,pasta:'',ordem:10,atualizado,doc:{v:1,blocos:[{id:'bloco-'+id,atualizado,conteudo:{type:'paragraph',content:[{type:'text',text}]}}]}});
const path=id=>'notas/paginas/'+id+'.json';
function setup(g=github(),storage=armazenamento(),extra={}){return {g,storage,s:criarSyncNotas({api:g.api,repo:'fake/test',storage,atraso:100000,aparelhoId:'teste',...extra})}}
test('1.48 a: 300 páginas de 200 KB: abertura só índice e ETag/304; documento sob demanda',async()=>{
  const a=setup(),indice=[];for(let i=0;i<300;i++){const p=page('p'+i,'x'.repeat(200*1024));const sha=a.g.seed(path(p.id),p);indice.push({id:p.id,titulo:p.id,pasta:'',ordem:i,atualizado:p.atualizado,sha})}
  a.g.seed('notas/indice.json',indice);assert.equal((await a.s.listarPaginas()).length,300);
  assert.equal(a.g.calls.length,1);assert.equal(a.g.calls[0].path,'notas/indice.json');
  await a.s.listarPaginas();assert.ok(a.g.calls[1].opt.etag);assert.equal(a.g.calls.length,2);
  assert.equal((await a.s.abrirPagina('p299')).doc.blocos[0].conteudo.content[0].text.length,200*1024);
  await a.s.abrirPagina('p299');assert.equal(a.g.calls.length,3);
});
test('1.48 b: editar envia só página e índice; origem e outras entradas preservadas',async()=>{
  const a=setup();a.g.seed('notas/indice.json',[{id:'outra',sha:'antigo'}]);
  const p=page('p');p.origem={tipo:'notion-zip',imagens:{hash:'./img/a.jpg'}};a.s.salvarPagina(p);assert.equal(a.s.estado().pendentes,1);
  assert.equal(await a.s.enviar(),true);assert.equal(a.s.estado().pendentes,0);
  assert.deepEqual(a.g.calls.filter(c=>c.method==='PUT').map(c=>c.path),[path('p'),'notas/indice.json']);
  assert.equal(a.g.files.get('notas/indice.json').d.length,2);assert.deepEqual(a.g.files.get(path('p')).d.origem,p.origem);
  assert.equal(a.g.files.get(path('p')).d.aparelhoId,'teste');
});
test('1.48 c/d: 409 local vence sem fundir; versão concorrente aparece e pode ser restaurada',async()=>{
  const a=setup();a.s.salvarPagina(page('p','inicial'));await a.s.enviar();await a.s.abrirPagina('p');
  const remoto=page('p','outro aparelho'),sha=a.g.seed(path('p'),remoto);
  a.s.salvarPagina(page('p','local'));assert.equal(await a.s.enviar(),true);
  assert.equal(a.g.files.get(path('p')).d.doc.blocos[0].conteudo.content[0].text,'local');
  assert.ok((await a.s.versoes('p')).some(v=>v.sha===sha));
  assert.deepEqual((await a.s.versoes('p',{ref:sha})).doc,remoto.doc);
  assert.equal(await a.s.restaurar('p',sha),true);assert.deepEqual(a.g.files.get(path('p')).d.doc,remoto.doc);
  assert.notEqual(a.g.files.get(path('p')).sha,sha);
});
test('1.48: 409 do índice refaz somente entrada da página e conserva outra edição',async()=>{
  const a=setup();let disparou=false;a.g.hook=c=>{if(c.method==='PUT'&&c.path==='notas/indice.json'&&!disparou){disparou=true;a.g.seed(c.path,[{id:'nova-outro',sha:'outro'}])}};
  a.s.salvarPagina(page('p'));assert.equal(await a.s.enviar(),true);
  assert.deepEqual(a.g.files.get('notas/indice.json').d.map(p=>p.id),['nova-outro','p']);
});
test('1.48 e: migração interrompida preserva plano; retoma idempotente e só limpa após índice',async()=>{
  const a=setup(),plano={v:2,dias:{},tarefas:[{id:'t',texto:'tarefa'}],notasDoc:page('notas').doc,notasPaginas:{pastas:[{id:'f',titulo:'Laudos'}],paginas:[page('p'),page('q')]}};
  const sha=a.g.seed('semana/plano.json',plano);let falhou=false;a.g.hook=c=>{if(c.path===path('q')&&c.method==='PUT'&&!falhou){falhou=true;throw erro(503)}};
  await assert.rejects(a.s.integrarPlano(plano,sha));assert.deepEqual(a.g.files.get('semana/plano.json').d,plano);
  const putsP=a.g.hist.filter(h=>h.path===path('p')).length;a.g.hook=null;
  const r=await a.s.integrarPlano(plano,sha);assert.equal(r.d.paginasEmArquivos,2);assert.equal(r.d.notasDoc,undefined);assert.equal(r.d.notasPaginas.paginas,undefined);
  assert.deepEqual(r.d.tarefas,plano.tarefas);assert.deepEqual(r.d.notasPaginas.pastas,plano.notasPaginas.pastas);
  assert.equal(a.g.hist.filter(h=>h.path===path('p')).length,putsP);
  assert.deepEqual(a.g.files.get('notas/indice.json').d.map(p=>p.id).sort(),['notas','p','q']);
  const n=a.g.calls.length;await a.s.integrarPlano(r.d,r.sha);assert.equal(a.g.calls.length,n);
});
test('1.48 f: autocura cliente antigo só migra conteúdo mais novo',async()=>{
  const a=setup();a.s.salvarPagina(page('p','atual','2026-11-11T12:00:00Z'));await a.s.enviar();
  for(const [texto,data,esperado] of [['velho','2026-11-10','atual'],['cliente antigo editou','2026-11-12','cliente antigo editou']]){
    const d={v:2,tarefas:[],notasPaginas:{paginas:[page('p',texto,data)]}},sha=a.g.seed('semana/plano.json',d);
    await a.s.integrarPlano(d,sha);assert.equal(a.g.files.get(path('p')).d.doc.blocos[0].conteudo.content[0].text,esperado);
  }
});
test('1.48 g: quota local tenta PUT imediato; cache rejeitado não impede gravação nem emite toast',async()=>{
  const storage=armazenamento();storage.setItem=()=>{throw Object.assign(Error('quota'),{name:'QuotaExceededError'})};
  const a=setup(undefined,storage,{cache:{set(){throw Error('idb')},get:async()=>{throw Error('idb')}}});a.s.salvarPagina(page('p'));
  assert.equal(a.s.estado().volatil,true);await new Promise(r=>setTimeout(r,30));
  assert.equal(a.s.estado().pendentes,0);assert.ok(a.g.files.has(path('p')));
});
test('1.48 g: offline, reload, envia ao voltar e só então retira pendência',async()=>{
  const a=setup();a.g.offline=true;a.s.salvarPagina(page('p','offline'));assert.equal(await a.s.enviar(),false);
  const b=setup(a.g,a.storage);assert.equal(b.s.estado().pendentes,1);a.g.offline=false;
  assert.equal(await b.s.enviar(),true);assert.equal(b.s.estado().pendentes,0);assert.deepEqual(a.g.files.get(path('p')).d.doc,page('p','offline').doc);
  assert.equal([...a.storage.m.keys()].filter(k=>k.startsWith('bcbr_paginas_pendentes_v2:')).length,0);
});
test('1.48: edição durante PUT permanece na fila até sua própria confirmação',async()=>{
  const a=setup();let uma=true;a.g.hook=c=>{if(c.method==='PUT'&&c.path===path('p')&&uma){uma=false;a.s.salvarPagina(page('p','segunda'))}};
  a.s.salvarPagina(page('p','primeira'));await a.s.enviar();assert.equal(a.s.estado().pendentes,1);
  await a.s.enviar();assert.equal(a.s.estado().pendentes,0);assert.equal(a.g.files.get(path('p')).d.doc.blocos[0].conteudo.content[0].text,'segunda');
});
test('1.48: patch de título em página fechada hidrata só aquele arquivo e preserva documento',async()=>{
  const a=setup();a.g.seed(path('p'),page('p','conteúdo grande'));a.s.salvarPagina({id:'p',titulo:'Renomeada'});
  assert.equal(await a.s.enviar(),true);assert.equal(a.g.files.get(path('p')).d.titulo,'Renomeada');assert.deepEqual(a.g.files.get(path('p')).d.doc,page('p','conteúdo grande').doc);
});
test('1.48: SHA novo só baixa a página aberta; exclusão mantém versão recuperável',async()=>{
  const a=setup();a.s.salvarPagina(page('p'));await a.s.enviar();await a.s.abrirPagina('p');
  const p=page('p','remoto'),sha=a.g.seed(path('p'),p);a.g.seed('notas/indice.json',[{id:'p',sha}]);await a.s.listarPaginas();
  assert.deepEqual((await a.s.abrirPagina('p')).doc,p.doc);a.s.salvarPagina({id:'p',excluida:true});await a.s.enviar();
  assert.equal((await a.s.listarPaginas()).length,0);assert.ok((await a.s.versoes('p')).some(v=>v.sha===sha));await a.s.restaurar('p',sha);assert.equal((await a.s.listarPaginas()).length,1);
});
module.exports={github,armazenamento,page,setup};
