// Offline 1.42 no Chrome (service worker de verdade, 5.700 questões fictícias): abre sem servidor, edita (tarefa, nota, resposta), mostra "offline · N pendentes",
// religa o servidor e confere que tudo sobe uma vez só. Mede o tempo até a aba Tarefas aparecer com o cache quente.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {iniciar,espera}=require('./chrome-util.js');
const PORTA=8772;
test('Offline 1.42: app abre do aparelho sem internet, enfileira e envia ao voltar sem duplicar',{timeout:300000},async t=>{
  const C=await iniciar({porta:PORTA,sw:true,env:{BCBR_QS:'5700'}});
  t.after(()=>C.fim());
  const {ev,call,ate,abre,reset,par,confirmado}=C;
  await call('Page.addScriptToEvaluateOnNewDocument',{source:"window.__tt=null;new MutationObserver(()=>{if(window.__tt===null&&document.querySelector('.sm-row[data-tid]'))window.__tt=performance.now()}).observe(document,{childList:true,subtree:true});"});
  await abre('tarefas');
  await ate("!!navigator.serviceWorker.controller||false",1000).catch(()=>{});
  await ev("navigator.serviceWorker.ready.then(()=>1)");await espera(2500);   // instala e guarda o app
  const tempos=[];
  for(let i=0;i<4;i++){
    await C.call('Page.navigate',{url:C.URL_});await C.esperaApp();
    tempos.push(await ev("window.__tt"));
  }
  assert.equal(await ev("!!navigator.serviceWorker.controller"),true,'o service worker controla a página');
  assert.equal(await ev("Q.length"),5700);
  const quente=tempos.slice(1);   // a 1ª ainda pode baixar a versão nova por trás
  console.log('  aba Tarefas com cache quente (ms até a 1ª tarefa na tela):',tempos.map(x=>Math.round(x)).join(', '));
  assert.ok(Math.min(...quente)<1000&&Math.max(...quente)<1500,'meta < 1 s: '+quente.join(','));
  assert.equal(await ev("document.title"),'Radio');

  // ---- servidor desligado ----
  await C.paraServidor();
  await C.call('Page.navigate',{url:C.URL_});await C.esperaApp();
  const off=await ev("window.__tt");console.log('  mesma abertura SEM servidor:',Math.round(off),'ms');
  assert.ok(off<1500,'abre sem internet em '+off);
  assert.equal(await ev("tela"),'tarefas');assert.equal(await ev("document.title"),'Radio');
  assert.equal(await ev("Q.length"),5700,'banco de questões vem do IndexedDB');
  assert.equal(await ev("document.querySelectorAll('.sm-row[data-tid]').length>0"),true,'tarefas do cache');
  assert.equal(await ev("!!document.querySelector('script[src*=\"vendor\"]')||!!window.TT"),true,'vendor do cache');
  // gravações: tarefa, nota, resposta de questão
  await ev("smMudar(d=>{if(!d.tarefas.some(t=>t.id==='off1'))d.tarefas.push({id:'off1',dia:'sem',texto:'Criada sem internet',area:'tarefas',feito:false})},'offline')");
  await ev("go('notas')");await ate("!!NT.ed&&!!document.querySelector('.nt-pm')");await espera(800);
  await reset(par('Nota escrita sem internet','offn'),par('','b-fim'));await ev("ntSalvaDoc()");
  await ev("(()=>{const l={q:'q0',t:Date.now(),ok:true,conf:'certeza',ms:1500,e:'A',modo:'treino'};all.push(l);log.push(l);aplicaSrs(l);persist(wkKey(l.t))})()");
  await ev("smPuxar().catch(()=>0)");await ev("flush().catch(()=>0)");await espera(2500);
  const badge=await ev("document.getElementById('bcbr_off')?.textContent");
  console.log('  indicador:',badge);
  assert.match(badge,/^offline · [1-9]\d* pendentes?$/,'indicador discreto offline · N pendentes');
  assert.equal(await ev("SM.sujo"),true);assert.equal(await ev("ntTemPendentes()"),true);

  // ---- volta a conexão ----
  C.sobeServidor();
  for(let i=0;i<60;i++){try{if((await fetch(C.URL_)).ok)break}catch{}await espera(100)}
  await ate("typeof SM!=='undefined'&&!SM.sujo&&!ntTemPendentes()&&dirty.size===0&&!estDirty",60000);
  await ate("!document.getElementById('bcbr_off')",8000);   // o indicador some
  const lerJson=async p=>{const r=await(await fetch(C.URL_+'api/repos/arturaragao/banco-cbr-app/contents/'+p)).json();if(!r.content)throw new Error('sem '+p+': '+JSON.stringify(r).slice(0,100));return JSON.parse(Buffer.from(r.content,'base64').toString())};
  const plano=await lerJson('semana/plano.json');
  assert.equal(plano.tarefas.filter(x=>x.id==='off1').length,1,'tarefa enviada uma vez');
  const nota=await ev("SyncNotas.abrirPagina('notas')");assert.equal(nota.doc.blocos.filter(b=>JSON.stringify(b.conteudo).includes('Nota escrita sem internet')).length,1,'nota enviada uma vez');
  const wk=await ev("wkKey(Date.now())");const logs=await lerJson('progresso/log_'+wk+'.json');
  assert.equal(logs.items.filter(a=>a[0]==='q0').length,1,'resposta enviada uma vez');
  // mais um ciclo: nada novo, nada duplicado
  await espera(11000);
  const plano2=await lerJson('semana/plano.json');assert.equal(plano2.tarefas.filter(x=>x.id==='off1').length,1);
  assert.deepEqual(C.erros,[]);
});
