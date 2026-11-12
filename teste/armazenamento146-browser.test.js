const {test}=require('node:test'),assert=require('node:assert/strict');
const {iniciar}=require('./chrome-util.js');
test('1.46 Chrome: cota real, cópia IDB sem apagar LS, edição sob cota libera espaço, reabertura offline e aba antiga',{timeout:120000},async t=>{
  const C=await iniciar({porta:8783});t.after(()=>C.fim());await C.abre('notas');
  await C.ev('BCBR.grandes.flush()');
  // Só dados fictícios. O banco de questões já está no IDB; todas as APIs ficam offline.
  await C.call('Page.addScriptToEvaluateOnNewDocument',{source:`
    const fetch146=window.fetch;window.fetch=(u,o)=>String(u).includes('/api/')||String(u).includes('api.github.com')?Promise.reject(new TypeError('Failed to fetch')):fetch146(u,o);
    if(!sessionStorage.getItem('quota146')){
      sessionStorage.setItem('quota146','1');
      const d={v:2,dias:{},tarefas:[],notasDoc:{v:1,blocos:[{id:'off146',atualizado:'2026-11-11',conteudo:{type:'paragraph',attrs:{id:'off146'},content:[{type:'text',text:'NOTA OFFLINE 146'}]}}]},enchimento:'x'.repeat(700000)};
      localStorage.setItem('sm_cache2',JSON.stringify({sha:'offline146',d}));
      localStorage.setItem('sm_base2',JSON.stringify(d));
      localStorage.setItem('bcbr_notas_base',JSON.stringify(d.notasDoc.blocos));
      localStorage.setItem('bcbr_notas_base_v143',JSON.stringify(d.notasDoc.blocos));
      let n=0;try{for(;n<100;n++)localStorage.setItem('enchimento146:'+n,'z'.repeat(64000))}catch(e){sessionStorage.setItem('cota146',e.name)}
    }`});
  await C.abre('notas');
  assert.equal(await C.ev("sessionStorage.getItem('cota146')"),'QuotaExceededError');
  // Abrir não apaga nada do LS: uma 1.45 aberta offline ainda lê estas cópias.
  for(const k of ['sm_cache2','sm_base2','bcbr_notas_base_v143','bcbr_notas_base'])assert.match(await C.ev(`localStorage.getItem('${k}')`),/NOTA OFFLINE 146/,k);
  assert.match(await C.ev("document.querySelector('.nt-pm').innerText"),/NOTA OFFLINE 146/);
  await C.ev('BCBR.grandes.flush()');
  const idb=k=>`new Promise((ok,no)=>{const r=indexedDB.open('bcbr',1);r.onsuccess=()=>{const q=r.result.transaction('kv').objectStore('kv').get('${k}');q.onsuccess=()=>{ok(q.result??null);r.result.close()};q.onerror=()=>no(q.error)}})`;
  assert.equal(await C.ev(`${idb('sm_cache2')}.then(v=>JSON.parse(v).d.enchimento.length)`),700000);
  // Edição com o LS cheio: a fila precisa de espaço; só cópias idênticas às do IDB saem.
  assert.equal(await C.ev("(()=>{try{localStorage.setItem('teste146','x'.repeat(64000));localStorage.removeItem('teste146');return 'coube'}catch(e){return e.name}})()"),'QuotaExceededError');
  await C.ev("NT.ed.commands.insertContentAt(NT.ed.state.doc.content.size,{type:'paragraph',content:[{type:'text',text:'EDIÇÃO SOB COTA 146'}]});ntSalvaDoc();0");
  assert.equal(await C.ev('NT.sujo'),false,'edição entrou na fila apesar da cota');
  assert.ok(await C.ev("ntPendentes().some(p=>JSON.stringify(p).includes('EDIÇÃO SOB COTA 146'))"));
  assert.match(await C.ev("localStorage.getItem('bcbr_notas_base')"),/NOTA OFFLINE 146/,'base 1.42 intacta');
  await C.ev('BCBR.grandes.flush()');
  assert.match(await C.ev(idb('sm_cache2')),/EDIÇÃO SOB COTA 146/);
  const lsCache=await C.ev("localStorage.getItem('sm_cache2')");
  if(lsCache!==null)assert.equal(lsCache,await C.ev(idb('sm_cache2')),'cópia LS nunca fica velha');
  await C.abre('notas');const tela=await C.ev("document.querySelector('.nt-pm').innerText");assert.match(tela,/NOTA OFFLINE 146/);assert.match(tela,/EDIÇÃO SOB COTA 146/);
  // Aba com acesso localStorage usado pela 1.45, aberta DEPOIS da migração.
  const antiga=await C.novaAba();await antiga.call('Page.navigate',{url:C.URL_+'icon.svg'});
  let origem=false;
  for(let i=0;i<100&&!origem;i++){origem=await antiga.ev("location.pathname.endsWith('/icon.svg')&&document.readyState==='complete'").catch(()=>false);if(!origem)await C.espera(50)}
  assert.equal(origem,true,'documento da mesma origem carregado antes de acessar localStorage');
  // Só o enchimento fictício do teste sai, para a escrita da aba antiga caber (a 1.45 real engole erro de cota).
  await antiga.ev("for(let n=0;n<100;n++)localStorage.removeItem('enchimento146:'+n);localStorage.setItem('bcbr_notas_base_v143','[\"base da aba antiga\"]')");
  // O Chrome propaga o localStorage entre processos de aba de forma assíncrona: espera chegar.
  await C.ate("localStorage.getItem('bcbr_notas_base_v143')!==null");
  assert.equal(await C.ev("BCBR.grandes.getItem('bcbr_notas_base_v143')"),'["base da aba antiga"]');
  await C.ev("document.getElementById('app').insertAdjacentHTML('beforeend',rdBackupHtml())");
  await C.ate("document.getElementById('rd_uso').textContent.includes('IDB')");
  assert.match(await C.ev("document.getElementById('rd_uso').textContent"),/localStorage: \d+ KB.*IDB/);
  assert.deepEqual(C.erros,[]);
});
test('1.46 Chrome: IDB indisponível conserva LS e app continua funcionando',{timeout:60000},async t=>{
  const C=await iniciar({porta:8784});t.after(()=>C.fim());
  await C.call('Page.addScriptToEvaluateOnNewDocument',{source:"indexedDB.open=()=>{throw new DOMException('negado','SecurityError')};localStorage.setItem('bcbr_notas_base_v143','[]');localStorage.setItem('bcbr_notas_base','[]');"});
  await C.abre('notas');
  assert.equal(await C.ev("!!NT.ed&&!!SM.d"),true);assert.equal(await C.ev("localStorage.getItem('bcbr_notas_base')"),'[]');
  await C.ev("BCBR.grandes.setItem('sm_base2','fallback146')");assert.equal(await C.ev("localStorage.getItem('sm_base2')"),'fallback146');
  assert.deepEqual(C.erros,[]);
});

test('1.46 Chrome: cota oferece download com texto ainda sujo e persistência chama navegador',{timeout:60000},async t=>{
  const C=await iniciar({porta:8785});t.after(()=>C.fim());await C.abre('notas');assert.ok(await C.confirmado());
  await C.ev(`
    window.api146=BCBR.api;BCBR.api=()=>Promise.reject(new TypeError('offline'));
    window.blob146=null;URL.createObjectURL=b=>{window.blob146=b;return 'blob:teste146'};HTMLAnchorElement.prototype.click=function(){};
    let n=0;try{for(;n<200;n++)localStorage.setItem('cheio146:'+n,'x'.repeat(64000))}catch(e){window.quota146=e.name}
    NT.ed.commands.insertContentAt(NT.ed.state.doc.content.size,{type:'paragraph',content:[{type:'text',text:'RASCUNHO NÃO PERSISTIDO '+ 'á'.repeat(100000)}]});
    ntSalvaDoc();0`);
  assert.equal(await C.ev('quota146'),'QuotaExceededError');
  assert.equal(await C.ev('NT.sujo'),true);
  assert.match(await C.ev("document.querySelector('.rd-modal').textContent"),/localStorage: \d+ KB.*Baixar cópia/);
  await C.click('#rd_copia_cota');
  const backup=await C.ev('blob146.text()');assert.match(backup,/RASCUNHO NÃO PERSISTIDO/);assert.ok(backup.includes('á'.repeat(100000)));
  assert.equal(await C.ev('NT.sujo'),true,'download não confirma a fila');
  assert.equal(await C.ev("JSON.stringify(SM.d).includes('RASCUNHO NÃO PERSISTIDO')"),false,'exportar não altera o plano');
  await C.ev(`document.querySelector('.rd-modal .nt-x').click();document.getElementById('app').insertAdjacentHTML('beforeend',rdBackupHtml());window.persist146=0;navigator.storage.persist=async()=>{persist146++;return true}`);
  await C.click('button[onclick="rdPersistir(this)"]');
  await C.ate("document.getElementById('rd_persist').textContent.includes('concedido')");assert.equal(await C.ev('persist146'),1);
  assert.deepEqual(C.erros,[]);
});

test('1.46 Chrome: binário 1.45 antes e depois da migração preserva edições pela fila existente',{timeout:90000},async t=>{
  const C=await iniciar({porta:8786,env:{BCBR_LEGADO146:'1'}});t.after(()=>C.fim());await C.abre('notas');assert.ok(await C.confirmado());
  // A 1.45 pode recarregar sozinha (vê versao.txt 1.46.0); só repete a chamada se a página navegou no meio.
  async function ev(aba,expr){for(let i=0;;i++){try{return await aba.ev(expr)}catch(e){if(i>=30||!/navigated or closed|context|is not defined/i.test(e.message))throw e;await C.espera(150)}}}
  async function espera(aba,expr){for(let i=0;i<150;i++){if(await aba.ev(expr).catch(()=>false))return;await C.espera(100)}assert.fail('não ocorreu: '+expr)}
  const antes=await C.novaAba();await antes.abre(C.URL_+'legado145.html');await ev(antes,"go('notas')");await espera(antes,'!!NT.ed&&!ntTemPendentes()');
  assert.equal(await ev(antes,'BCBR_VERSAO'),'1.45.0');assert.equal(await ev(antes,'typeof BCBR.grandes'),'undefined');
  await C.abre('notas');await C.ev('BCBR.grandes.flush()');
  assert.notEqual(await C.ev("localStorage.getItem('sm_cache2')"),null,'1.46 mantém a cópia LS para a 1.45');
  const depois=await C.novaAba();await depois.abre(C.URL_+'legado145.html');await ev(depois,"go('notas')");await espera(depois,'!!NT.ed&&!ntTemPendentes()');
  assert.equal(await ev(depois,'BCBR_VERSAO'),'1.45.0');assert.equal(await ev(depois,'typeof BCBR.grandes'),'undefined');
  await C.ev("window.api146=BCBR.api;BCBR.api=()=>Promise.reject(new TypeError('offline'))");
  for(const [aba,texto] of [[antes,'EDIÇÃO DA 145 ABERTA ANTES'],[depois,'EDIÇÃO DA 145 ABERTA DEPOIS']]){
    await aba.traz();await ev(aba,"go('notas')");await espera(aba,'!!NT.ed');
    await aba.ev(`BCBR.api=()=>Promise.reject(new TypeError('offline'));NT.ed.commands.insertContentAt(NT.ed.state.doc.content.size,{type:'paragraph',content:[{type:'text',text:${JSON.stringify(texto)}}]});ntSalvaDoc();SM.fila`);
    assert.equal(await aba.ev('NT.sujo'),false,'edição entrou na fila durável');
  }
  assert.equal(await C.ev("BCBR.grandes.getItem('sm_cache2')===localStorage.getItem('sm_cache2')"),true);
  await C.ev('BCBR.api=api146;ntSync()');await C.ate('!ntTemPendentes()');
  const r=await(await fetch(C.URL_+'api/repos/arturaragao/banco-cbr-app/contents/semana/plano.json')).json();
  const texto=Buffer.from(r.content,'base64').toString('utf8');assert.match(texto,/EDIÇÃO DA 145 ABERTA ANTES/);assert.match(texto,/EDIÇÃO DA 145 ABERTA DEPOIS/);
  // 1.45 aberta totalmente offline depois da 1.46: lê o cache LS mantido e mostra as notas.
  const off=await C.novaAba();await off.call('Page.addScriptToEvaluateOnNewDocument',{source:"const f145=window.fetch;window.fetch=(u,o)=>String(u).includes('/api/')||String(u).includes('api.github.com')?Promise.reject(new TypeError('Failed to fetch')):f145(u,o);"});
  await off.abre(C.URL_+'legado145.html');assert.equal(await ev(off,'BCBR_VERSAO'),'1.45.0');
  const offD=await off.ev('JSON.stringify(SM.d||null)');assert.match(offD,/EDIÇÃO DA 145 ABERTA ANTES/);assert.match(offD,/EDIÇÃO DA 145 ABERTA DEPOIS/);
  assert.deepEqual(off.erros,[]);await off.fecha();
  await antes.fecha();await depois.fecha();await C.abre('notas');
  const recarregado=await C.ev('JSON.stringify(SM.d)');assert.match(recarregado,/EDIÇÃO DA 145 ABERTA ANTES/);assert.match(recarregado,/EDIÇÃO DA 145 ABERTA DEPOIS/);
  assert.deepEqual(C.erros,[]);
});
