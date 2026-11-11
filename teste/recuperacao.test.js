const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const semana=fs.readFileSync(require.resolve('../build/semana.js'),'utf8'),rec=fs.readFileSync(require.resolve('../build/recuperacao.js'),'utf8');
const copia=x=>JSON.parse(JSON.stringify(x)),b64=x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64');
const bloco=(texto,data='2026-11-11T10:00:00Z')=>({id:'b',atualizado:data,conteudo:{type:'paragraph',attrs:{id:'b'},content:[{type:'text',text:texto}]}});
const plano=()=>({v:2,dias:{},tarefas:[{id:'t',texto:'Antes',det:'Detalhe antigo',dia:'sem'}],notasDoc:{v:1,blocos:[bloco('Antes')]},notasPaginas:{v:1,paginas:[{id:'p',titulo:'Página',doc:{v:1,blocos:[bloco('Antes')]}}]}});
function app(mem=new Map()){
  let tempo=Date.parse('2026-11-11T11:00:00Z'),remoto=plano(),sha=1,puts=0,gets=0,falha=null,trava=null;
  const eventos={},avisos=[],c=vm.createContext({console,navigator:{onLine:true},window:{addEventListener:(n,f)=>(eventos[n]??=[]).push(f)},document:{getElementById:()=>null,addEventListener:(n,f)=>(eventos[n]??=[]).push(f),visibilityState:'visible'},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,
    Date:class extends Date{constructor(...a){super(...(a.length?a:[tempo]))}static now(){return tempo}},
    localStorage:{getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)},atob:s=>Buffer.from(s,'base64').toString('binary'),
    BCBR:{REPO:'ficticio/teste',b64,api:async(path,opt)=>{assert.ok(path.endsWith('semana/plano.json'));if(falha)throw falha;if(opt?.method==='PUT'){puts++;const enviado=JSON.parse(Buffer.from(JSON.parse(opt.body).content,'base64').toString());if(trava)await trava;remoto=enviado;return {content:{sha:String(++sha)}}}gets++;return {sha:String(sha),content:b64(remoto)}}},smAgendaPuxar(){},smAuto(){},smNativoTarefas(){},tela:'tarefas',render(){},toast:s=>avisos.push(s)});
  vm.runInContext(semana.slice(0,semana.indexOf('// ---------- tipo do dia'))+'\n'+rec,c);
  // Eventos de retorno reais da Semana, sem carregar as funções de calendário.
  vm.runInContext(semana.slice(semana.indexOf("document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){smPuxar();smAuto()}});"),semana.indexOf("window.addEventListener('focus',()=>smPuxar());")+"window.addEventListener('focus',()=>smPuxar());".length),c);
  const sm=vm.runInContext('SM',c);sm.d=plano();sm.base=JSON.stringify(sm.d);sm.sha='1';
  return {c,sm,mem,eventos,avisos,agora:()=>tempo,avanca:(n=6000)=>tempo+=n,remoto:d=>{remoto=copia(d);sha++},salvo:()=>copia(remoto),conta:()=>({puts,gets}),falha:e=>falha=e,trava:p=>trava=p};
}
test('P0: edição de tarefa confirmada é sobrescrita por plano antigo; alerta e Restaurar usa PUT normal',async()=>{
  const a=app(),antigo=plano();
  assert.equal(await a.c.smMudar(d=>{d.tarefas[0].texto='CONFIRMADO';d.tarefas[0].det='Detalhes confirmados'}),true);
  assert.equal(a.c.rdAlertas().length,0);assert.equal(a.c.rdLer().filter(e=>e.enviada).length,2);
  a.avanca();a.remoto(antigo);await a.c.smPuxar();
  assert.equal(a.sm.d.tarefas[0].texto,'Antes');assert.equal(a.c.rdAlertas().length,2);
  const perda=a.c.rdAlertas().find(e=>e.campo==='texto');assert.equal(perda.texto,'CONFIRMADO');assert.equal(perda.perda.atual,'Antes');
  assert.equal(await a.c.rdRestaurar(perda.uid),true);assert.equal(a.salvo().tarefas[0].texto,'CONFIRMADO');assert.equal(a.c.rdAlertas().length,1);assert.equal(a.conta().puts,2);
});
for(const pagina of [false,true])test('bloco '+(pagina?'da página':'principal')+': data antiga alerta, data nova legítima não alerta; restaura conteúdo',async()=>{
  for(const novo of [false,true]){
    const a=app(),get=d=>pagina?d.notasPaginas.paginas[0].doc:d.notasDoc;
    await a.c.smMudar(d=>{get(d).blocos=[bloco('CONFIRMADO','2026-11-11T11:00:00Z')]});a.avanca();
    const r=plano();get(r).blocos=[bloco(novo?'Edição legítima':'Antes',novo?'2026-11-11T12:00:00Z':'2026-11-11T10:00:00Z')];a.remoto(r);await a.c.smPuxar();
    assert.equal(a.c.rdAlertas().length,novo?0:1);
    if(!novo){assert.equal(await a.c.rdRestaurar(a.c.rdAlertas()[0].uid),true);assert.equal(get(a.salvo()).blocos[0].conteudo.content[0].text,'CONFIRMADO')}
  }
});
test('sem carimbo: texto remoto desconhecido não é regressão; texto que contém a edição também não',async()=>{
  for(const texto of ['Outro aparelho escreveu algo novo','prefixo CONFIRMADO sufixo']){
    const a=app();await a.c.smMudar(d=>{d.tarefas[0].texto='CONFIRMADO'});a.avanca();const r=plano();r.tarefas[0].texto=texto;a.remoto(r);await a.c.smPuxar();assert.equal(a.c.rdAlertas().length,0);
  }
});
test('tarefa com carimbo remoto mais novo e texto antigo conhecido é edição legítima',async()=>{
  const a=app();await a.c.smMudar(d=>{d.tarefas[0].texto='CONFIRMADO'});a.avanca();const r=plano();r.tarefas[0].atualizado='2026-11-11T12:00:00Z';a.remoto(r);await a.c.smPuxar();assert.equal(a.c.rdAlertas().length,0);
});
test('exclusões locais de tarefa, bloco e página ficam no diário e não geram alerta nem ressuscitam',async()=>{
  const a=app();await a.c.smMudar(d=>{d.tarefas[0].texto='novo';d.notasDoc.blocos=[bloco('novo')];d.notasPaginas.paginas[0].doc.blocos=[bloco('novo')]});
  await a.c.smMudar(d=>{d.tarefas=[];d.notasDoc.blocos=[];d.notasPaginas.paginas=[]});a.avanca();a.remoto(plano());await a.c.smPuxar();
  assert.equal(a.c.rdAlertas().length,0);assert.ok(a.c.rdLer().filter(e=>e.excluido).length>=4);
  const b=app();await b.c.smMudar(d=>{d.tarefas[0].texto='novo'});b.avanca();const r=plano();r.tarefas=[];b.remoto(r);await b.c.smPuxar();assert.equal(b.c.rdAlertas().length,0);
});
test('edição durante PUT não é confirmada pelo PUT anterior, nem alerta com edição local posterior',async()=>{
  const a=app();let libera;a.trava(new Promise(r=>libera=r));
  const p=a.c.smMudar(d=>{d.tarefas[0].texto='Primeira'});await Promise.resolve();
  const p2=a.c.smMudar(d=>{d.tarefas[0].texto='SEGUNDA_NAO_ENVIADA'});
  a.avanca();libera();await p;a.trava(null);
  const primeira=a.c.rdLer().find(e=>e.texto==='Primeira'),segunda=a.c.rdLer().find(e=>e.texto==='SEGUNDA_NAO_ENVIADA');
  assert.equal(primeira.enviada,true);assert.equal(segunda.enviada,false);a.c.rdVerifica(plano());assert.equal(a.c.rdAlertas().length,0);await p2;
});
test('diário sobrevive reload, respeita 5 s, Ignorar é persistente e poda 200/14 dias',async()=>{
  const a=app();await a.c.smMudar(d=>{d.tarefas[0].texto='Confirmado'});a.c.rdVerifica(plano());assert.equal(a.c.rdAlertas().length,0);
  const b=app(a.mem);b.avanca();b.c.rdVerifica(plano());assert.equal(b.c.rdAlertas().length,1);b.c.rdIgnorar(b.c.rdAlertas()[0].uid);b.c.rdVerifica(plano());assert.equal(b.c.rdAlertas().length,0);
  b.c.rdGuardar(Array.from({length:210},(_,i)=>({id:String(i),texto:'x',hora:b.agora(),uid:String(i)})));assert.equal(b.c.rdLer().length,200);assert.equal(b.c.rdLer()[0].id,'10');b.avanca(15*86400000);b.c.rdGuardar(b.c.rdLer());assert.equal(b.c.rdLer().length,0);assert.equal([...b.mem.values()].includes('[]'),true);
});
test('indicador: aguardando, enviando, salvo, offline e motivo real de erro (401/cota/JSON)',async()=>{
  const a=app();assert.equal(a.c.rdEstado(),'Aguardando sincronização');let libera;a.trava(new Promise(r=>libera=r));const p=a.c.smMudar(d=>{d.tarefas[0].texto='novo'});assert.equal(a.c.rdEstado(),'Enviando…');await Promise.resolve();libera();await p;assert.equal(a.c.rdEstado(),'Salvo ✓');
  a.c.navigator.onLine=false;assert.equal(a.c.rdEstado(),'Pendente — sem conexão');a.c.navigator.onLine=true;
  for(const [erro,rx] of [[Object.assign(Error('401'),{status:401}),/recusou a chave/],[Object.assign(Error('limite'),{status:429}),/Limite de uso/],[Object.assign(Error('inválido'),{name:'SyntaxError'}),/JSON inválido/]]){a.falha(erro);await a.c.smPuxar();assert.match(a.c.rdEstado(),rx)}
  a.falha(null);await a.c.smPuxar();assert.equal(a.c.rdEstado(),'Salvo ✓');
});
test('focus/visível/pageshow puxam imediatamente, SM.puxando impede busca concorrente',async()=>{
  for(const nome of ['focus','visibilitychange','pageshow']){const a=app();for(const f of a.eventos[nome])await f();assert.equal(a.conta().gets,1,nome)}
  const a=app();let libera;a.c.BCBR.api=async()=>{a.conta;await new Promise(r=>libera=r);return {sha:'2',content:b64(plano())}};
  const p=a.c.smPuxar();const t=a.sm.puxando;await a.c.smPuxar();assert.equal(a.sm.puxando,t);libera();await p;assert.equal(a.sm.puxando,0);
});
test('PUT falho não confirma edição e quota do diário não interrompe o PUT',async()=>{
  const a=app();a.falha(new TypeError('Failed to fetch'));assert.equal(await a.c.smMudar(d=>{d.tarefas[0].texto='não enviado'}),false);a.avanca();a.c.rdVerifica(plano());assert.equal(a.c.rdAlertas().length,0);assert.equal(a.c.rdLer()[0].enviada,false);
  const b=app(),set=b.c.localStorage.setItem;b.c.localStorage.setItem=(k,v)=>{if(k==='bcbr_edicoes_v144')throw Error('Quota');set(k,v)};assert.equal(await b.c.smMudar(d=>{d.tarefas[0].texto='salvo apesar da quota'}),true);assert.equal(b.salvo().tarefas[0].texto,'salvo apesar da quota');assert.match(vm.runInContext('RD.localErro',b.c),/sem espaço/);
});
test('Conflitos: descarta só a cópia escolhida pela fila existente',async()=>{
  const a=app(),c={id:'c',em:'hoje',conteudo:bloco('versão antiga').conteudo},outro={...c,em:'amanhã'};a.sm.d.notas_conflitos=[c,outro];assert.equal(await a.c.rdConflitoDescarta(c),true);assert.deepEqual(a.salvo().notas_conflitos,[outro]);assert.equal(a.conta().puts,1);
});
