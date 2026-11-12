const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const shim=fs.readFileSync(require.resolve('../shim.js'),'utf8');
const fonte=shim.slice(shim.indexOf('  const idb ='),shim.indexOf('  async function passarChaveSW()'));
const semana=fs.readFileSync(require.resolve('../build/semana.js'),'utf8');
const rec=fs.readFileSync(require.resolve('../build/recuperacao.js'),'utf8');
// Transações controladas: request success precede commit, abort não altera o banco.
async function ambiente({ls=new Map(),banco=new Map(),falha='',chaveFalha=null,cheio=false,antesConfirma=null}={}){
  const eventos=[],estado={falha,cheio},storage={get length(){return ls.size},key:i=>[...ls.keys()][i],getItem:k=>ls.get(k)??null,
    setItem(k,v){if(estado.cheio)throw Object.assign(Error('cheio'),{name:'QuotaExceededError'});ls.set(k,String(v))},removeItem(k){eventos.push(['remove',k]);ls.delete(k)}};
  const db={transaction(store,modo){assert.equal(store,'kv');const t={};t.objectStore=()=>({
    put(v,k){eventos.push(['put',k]);setImmediate(()=>{if(estado.falha==='pendura')return;if(estado.falha==='put'&&(!chaveFalha||chaveFalha===k)){t.error=Error('abort');t.onabort?.();return}banco.set(k,v);eventos.push(['commit',k]);t.oncomplete?.()})},
    get(k){const r={};setImmediate(()=>{eventos.push(['read',k]);antesConfirma?.(k,ls,eventos);if(estado.falha==='read'&&(!chaveFalha||chaveFalha===k)){r.error=Error('read');r.onerror?.();return}r.result=estado.falha==='compare'?'diferente':banco.get(k);r.onsuccess?.()});return r}
  });return t}};
  const c=vm.createContext({BCBR:{},addEventListener(){},navigator:{},localStorage:storage,indexedDB:{open(){if(estado.falha==='open')throw Error('indisponível');const r={};setImmediate(()=>{r.result=db;r.onsuccess()});return r}},console});c.window=c; // como no navegador: window é o objeto global
  vm.runInContext(fonte,c);await c.window.BCBR.grandes.pronto;
  return {a:c.window.BCBR.grandes,c,ls,banco,eventos,estado,storage};
}
test('1.46: migra com LS cheio sem apagar do LS (1.45 offline continua lendo); cota libera só cópia confirmada',async()=>{
  const ls=new Map([['sm_cache2','x'.repeat(700000)],['sm_base2','base'],['bcbr_notas_base_v143','nova'],['bcbr_notas_base','antiga'],['bcbr_notasdoc_pendente:um','pendente'],['bcbr_notasdoc_pendente','legado']]);
  const a=await ambiente({ls,cheio:true});
  for(const k of ['sm_cache2','sm_base2','bcbr_notas_base_v143']){
    assert.equal(a.banco.get(k),ls.get(k),'cópia idêntica no IDB e mantida no LS');
    const e=a.eventos.filter(e=>e[1]===k).map(e=>e[0]);assert.deepEqual(e,['read','put','commit','read']);
  }
  assert.equal(a.eventos.some(e=>e[0]==='remove'),false,'abertura não remove nada');
  assert.equal(a.banco.get('bcbr_notas_base'),'antiga');
  ls.set('bcbr_notas_base_v143','reescrita por aba antiga');      // valor diferente do confirmado: fica
  assert.equal(a.a.liberar(),2);
  assert.deepEqual(['sm_cache2','sm_base2'].map(k=>ls.has(k)),[false,false]);
  assert.equal(ls.get('bcbr_notas_base_v143'),'reescrita por aba antiga');
  assert.equal(ls.get('bcbr_notas_base'),'antiga');assert.equal(ls.get('bcbr_notasdoc_pendente:um'),'pendente');assert.equal(ls.get('bcbr_notasdoc_pendente'),'legado');
  assert.equal(a.a.getItem('sm_cache2'),'x'.repeat(700000),'liberado do LS, lido do espelho/IDB');
  await a.a.setItem('sm_cache2','novo');assert.equal(a.banco.get('sm_cache2'),'novo');assert.equal(ls.has('sm_cache2'),false);assert.equal(a.a.getItem('sm_cache2'),'novo');
});
test('1.46: cópia LS velha que não coube nunca é apagada (não está no IDB); leitura usa o espelho novo',async()=>{
  const a=await ambiente();a.ls.set('sm_cache2','velho');a.estado.cheio=true; // escrito por aba 1.45 depois da hidratação: sem cópia no IDB
  const p=a.a.setItem('sm_cache2','novo');assert.equal(a.a.getItem('sm_cache2'),'novo');
  await p;assert.equal(a.banco.get('sm_cache2'),'novo');assert.equal(a.ls.get('sm_cache2'),'velho');assert.equal(a.a.getItem('sm_cache2'),'novo');
  assert.equal(a.a.liberar(),0,'liberar também não apaga valor sem cópia idêntica no IDB');
});
test('P1-1: 1.45 grava no LS durante a confirmação do IDB; o texto dela não é apagado',async()=>{
  let corrida=false;
  const a=await ambiente({antesConfirma:(k,ls)=>{if(corrida&&k==='sm_cache2'){ls.set(k,'TEXTO DA 1.45');corrida=false}}});
  a.ls.set('sm_cache2','velho');a.estado.cheio=true;const p=a.a.setItem('sm_cache2','novo 1.46');a.estado.cheio=false;corrida=true;await p;
  assert.equal(a.ls.get('sm_cache2'),'TEXTO DA 1.45');assert.equal(a.eventos.some(e=>e[0]==='remove'),false);
  assert.equal(a.a.getItem('sm_cache2'),'TEXTO DA 1.45');assert.equal(a.a.liberar(),0);assert.equal(a.ls.get('sm_cache2'),'TEXTO DA 1.45');
});
test('1.46: cota no setItem libera só cópia idêntica à confirmada no IDB e grava a nova no LS',async()=>{
  const a=await ambiente({ls:new Map([['sm_cache2','plano'],['sm_base2','base'],['bcbr_notas_base','antiga']])});
  a.ls.set('sm_base2','base reescrita pela 1.45');a.estado.cheio=true;const rm=a.storage.removeItem;a.storage.removeItem=k=>{rm(k);a.estado.cheio=false};
  await a.a.setItem('bcbr_notas_base_v143','nova base');
  assert.equal(a.ls.get('bcbr_notas_base_v143'),'nova base');assert.equal(a.ls.has('sm_cache2'),false);assert.equal(a.banco.get('sm_cache2'),'plano');
  assert.equal(a.ls.get('sm_base2'),'base reescrita pela 1.45');assert.equal(a.ls.get('bcbr_notas_base'),'antiga');
});
test('1.46: fila sob cota real libera cópias confirmadas e grava; bases 1.42 e pendentes ficam',async()=>{
  const ls=new Map([['sm_cache2','plano'],['bcbr_notas_base_v143','b'],['bcbr_notas_base','antiga'],['bcbr_notasdoc_pendente:um','pendente']]);
  const a=await ambiente({ls});vm.runInContext(semana.slice(0,semana.indexOf('// ---------- tipo do dia')),a.c);
  a.estado.cheio=true;const rm=a.storage.removeItem;a.storage.removeItem=k=>{rm(k);a.estado.cheio=false};
  a.c.smLsGrava('bcbr_notasdoc_pendente:dois','nova edição');
  assert.equal(ls.get('bcbr_notasdoc_pendente:dois'),'nova edição');assert.equal(ls.get('bcbr_notasdoc_pendente:um'),'pendente');assert.equal(ls.get('bcbr_notas_base'),'antiga');
  assert.equal(ls.has('sm_cache2'),false);assert.equal(a.banco.get('sm_cache2'),'plano');
  const b=await ambiente({ls:new Map(),cheio:true});vm.runInContext(semana.slice(0,semana.indexOf('// ---------- tipo do dia')),b.c);
  assert.throws(()=>b.c.smLsGrava('bcbr_notasdoc_pendente:x','y'),e=>e.name==='QuotaExceededError','nada a liberar: erro de cota chega ao chamador');
});
for(const falha of ['open','put','read','compare'])test('1.46: IDB falha em '+falha+' mantém original e fallback funciona',async()=>{
  const ls=new Map([['sm_cache2','original'],['bcbr_notas_base_v143','base']]);const a=await ambiente({ls,falha});
  assert.equal(a.eventos.some(e=>e[0]==='remove'),false);assert.equal(a.a.getItem('sm_cache2'),'original');
  await a.a.setItem('sm_cache2','editado');assert.equal(ls.get('sm_cache2'),'editado');assert.equal(ls.get('bcbr_notas_base_v143'),'base');
});
test('1.46: escrita de aba antiga durante confirmação fica intacta e prevalece na leitura',async()=>{
  const ls=new Map([['sm_cache2','antes']]);const a=await ambiente({ls,antesConfirma:k=>{if(k==='sm_cache2')ls.set(k,'edição antiga concorrente')}});
  assert.equal(a.banco.get('sm_cache2'),'antes');assert.equal(ls.get('sm_cache2'),'edição antiga concorrente');assert.equal(a.a.getItem('sm_cache2'),'edição antiga concorrente');
});
test('1.46: reabertura hidrata plano e bases sem LS nem rede; chave recriada pela 1.45 prevalece',async()=>{
  const raw=JSON.stringify({sha:'off',d:{v:2,notasDoc:{v:1,blocos:[{id:'nota',texto:'offline'}]}}});
  const a=await ambiente({ls:new Map([['sm_cache2',raw],['bcbr_notas_base_v143','[]']])});
  assert.equal(a.a.liberar(),2);assert.equal(a.ls.size,0); // simula cota já liberada antes de reabrir
  const b=await ambiente({ls:a.ls,banco:a.banco});vm.runInContext(semana.slice(0,semana.indexOf('// ---------- tipo do dia')),b.c);
  assert.equal(vm.runInContext('SM.d.notasDoc.blocos[0].texto',b.c),'offline');assert.equal(b.a.getItem('bcbr_notas_base_v143'),'[]');
  b.ls.set('sm_cache2','antiga depois');assert.equal(b.a.getItem('sm_cache2'),'antiga depois');
});

const plano=(texto,atualizado)=>JSON.stringify({sha:'s',d:{v:2,notasDoc:{v:1,blocos:[{id:'b',atualizado,conteudo:{type:'paragraph',content:[{type:'text',text:texto}]}}]}}});
test('P1-2: reabertura com 1.45 que recriou cache mais velho não sobrescreve o IDB mais novo',async()=>{
  const novo=plano('EDIÇÃO OFFLINE NOVA','2026-11-11T10:00:00Z'),velho=plano('cache antigo da 1.45','2026-11-10T08:00:00Z');
  const a=await ambiente({ls:new Map([['sm_cache2',velho]]),banco:new Map([['sm_cache2',novo]])});
  assert.equal(a.banco.get('sm_cache2'),novo);assert.equal(a.ls.get('sm_cache2'),velho,'cópia velha também fica');
  assert.equal(a.a.getItem('sm_cache2'),novo);vm.runInContext(semana.slice(0,semana.indexOf('// ---------- tipo do dia')),a.c);
  assert.match(vm.runInContext('JSON.stringify(SM.d)',a.c),/EDIÇÃO OFFLINE NOVA/);
  const b=await ambiente({ls:new Map([['sm_cache2',plano('LS mais nova','2026-11-12')]]),banco:new Map([['sm_cache2',novo]])});
  assert.match(b.banco.get('sm_cache2'),/LS mais nova/);assert.equal(b.banco.get('anterior:sm_cache2'),novo,'IDB substituído fica guardado');
  const c=await ambiente({ls:new Map([['sm_base2','sem data A']]),banco:new Map([['sm_base2','sem data B']])});
  assert.equal(c.banco.get('anterior:sm_base2'),'sem data B','sem ordem: preserva os dois');assert.equal(c.ls.get('sm_base2'),'sem data A');
});
test('P1-3: IDB lento não adia PUT nem marcador; fechar e reabrir mantém a edição offline',async()=>{
  const a=await ambiente();a.estado.falha='pendura';
  Object.assign(a.c,{smAgendaPuxar(){},smAuto(){},smNativoTarefas(){},smRender(){},tela:'tarefas',render(){}});
  Object.assign(a.c.BCBR,{REPO:'ficticio/teste',api:async()=>{throw new TypeError('Failed to fetch')},b64:x=>Buffer.from(x).toString('base64')});
  vm.runInContext(semana.slice(0,semana.indexOf('// ---------- tipo do dia')),a.c);
  vm.runInContext("SM.d={v:2,dias:{},tarefas:[{id:'t',texto:'antes'}]};SM.ok=true;SM.base=JSON.stringify(SM.d)",a.c);
  a.c.smMudar(d=>{d.tarefas[0].texto='EDIÇÃO OFFLINE'});
  assert.match(a.ls.get('sm_cache2'),/EDIÇÃO OFFLINE/,'cópia síncrona antes de qualquer await');
  for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));
  assert.ok(a.ls.get('sm_sujo'),'marcador gravado mesmo com IDB pendurado');assert.match(a.ls.get('sm_base2'),/antes/);
  assert.equal(a.banco.has('sm_cache2'),false,'IDB realmente não confirmou');
  const b=await ambiente({ls:a.ls,banco:a.banco});vm.runInContext(semana.slice(0,semana.indexOf('// ---------- tipo do dia')),b.c);
  assert.equal(vm.runInContext('SM.sujo',b.c),true);assert.match(vm.runInContext('JSON.stringify(SM.d)',b.c),/EDIÇÃO OFFLINE/);
});
test('1.46: falha isolada na migração não esconde base já migrada no IDB',async()=>{
  const a=await ambiente({ls:new Map([['sm_cache2','original']]),banco:new Map([['bcbr_notas_base_v143','base IDB']]),falha:'put',chaveFalha:'sm_cache2'});
  assert.equal(a.ls.get('sm_cache2'),'original');assert.equal(a.a.getItem('bcbr_notas_base_v143'),'base IDB');
  assert.equal(a.eventos.some(e=>e[0]==='remove'),false);
});

test('1.46: falha tardia no IDB usa LS; se ambos falham mantém memória, pendente e cópia anterior',async()=>{
  const a=await ambiente({ls:new Map([['sm_cache2','anterior'],['bcbr_notasdoc_pendente:um','nota durável']])});
  a.estado.falha='put';a.estado.cheio=true;
  await assert.rejects(a.a.setItem('sm_cache2','nova'),e=>e.name==='QuotaExceededError');
  assert.equal(a.a.getItem('sm_cache2'),'nova');assert.equal(a.banco.get('sm_cache2'),'anterior');
  assert.equal(a.ls.get('bcbr_notasdoc_pendente:um'),'nota durável');
  a.estado.cheio=false;await a.a.setItem('sm_cache2','nova');assert.equal(a.ls.get('sm_cache2'),'nova');
});
function recuperacao(){
  const ls=new Map(),avisos=[];
  const c=vm.createContext({window:{addEventListener(){}},navigator:{},document:{getElementById(){return null}},setTimeout(){},setInterval(){},console,toast:s=>avisos.push(s),
    localStorage:{get length(){return ls.size},key:i=>[...ls.keys()][i],getItem:k=>ls.get(k)??null,setItem:(k,v)=>ls.set(k,v)},});
  vm.runInContext(semana.slice(0,semana.indexOf('// ---------- tipo do dia'))+'\n'+rec,c);return {c,ls,avisos};
}
test('1.46: diário limita bytes UTF-16 inclusive metadados e poda mais antigos, sem tocar fila',()=>{
  const a=recuperacao();a.ls.set('bcbr_notasdoc_pendente:um','preservada');
  a.c.rdGuardar(Array.from({length:40},(_,i)=>({uid:i,hora:Date.now()-40+i,texto:'á😀'.repeat(5000),anterior:'x'.repeat(2000),conteudo:{text:'z'.repeat(5000)},enviada:true})));
  const raw=a.ls.get('bcbr_edicoes_v144'),l=JSON.parse(raw);assert.ok(2*(raw.length+'bcbr_edicoes_v144'.length)<=512*1024);assert.ok(l.length>0&&l.length<40);assert.equal(l.at(-1).uid,39);assert.equal(a.ls.get('bcbr_notasdoc_pendente:um'),'preservada');
  a.c.rdGuardar([{hora:Date.now(),texto:'x'.repeat(300000)}]);assert.equal(JSON.parse(a.ls.get('bcbr_edicoes_v144')).length,1,'a mais recente nunca é podada');
});
test('P1-3b: limite de bytes do diário nunca descarta entradas não confirmadas nem a mais recente',()=>{
  const a=recuperacao(),h=Date.now()-100;
  const l=[{uid:'conf-velha',hora:h,texto:'c'.repeat(150000),enviada:true},{uid:'nao-conf-velha',hora:h+1,texto:'n'.repeat(150000),enviada:false},{uid:'conf-nova',hora:h+2,texto:'d'.repeat(10),enviada:true},{uid:'recente',hora:h+3,texto:'r'.repeat(150000),enviada:false}];
  a.c.rdGuardar(l);const uids=JSON.parse(a.ls.get('bcbr_edicoes_v144')).map(e=>e.uid);
  assert.deepEqual(uids,['nao-conf-velha','recente'],'só confirmadas e anteriores à mais recente saem');
});
test('1.46: QuotaExceededError informa KB e Baixar cópia; outra exceção tem diagnóstico distinto',()=>{
  const a=recuperacao();a.ls.set('ficticio','x'.repeat(1024));
  const msg=a.c.smErroLocal({name:'QuotaExceededError'});assert.match(msg,/Sem espaço.*localStorage: 3 KB.*Baixar cópia/);
  const outro=a.c.smErroLocal({name:'SecurityError'});assert.match(outro,/SecurityError/);assert.doesNotMatch(outro,/Sem espaço/);
});
