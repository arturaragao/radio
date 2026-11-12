// Chrome real, API local e dados exclusivamente fictícios. Nada acessa o repo de dados.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {iniciar}=require('./chrome-util.js');
test('Radio 1.44 parcial no Chrome',{timeout:120000},async t=>{
  const C=await iniciar({porta:8778});t.after(()=>C.fim());const {ev,click,ate}=C;
  await C.abre('notas');assert.ok(await C.confirmado());
  await t.test('indicador muda; detalhes mostram hora e sincronização manual; eventos retornam pela trava existente',async()=>{
    await ev('smPuxar().then(()=>rdPinta())');assert.equal(await ev("document.getElementById('rd_sync').textContent"),'Salvo ✓');
    await click('#rd_sync');assert.match(await ev("document.querySelector('.rd-modal').textContent"),/Última sincronização:.*\d/);
    await click('[data-sync]');await ate("!!document.querySelector('[data-sync]:not(:disabled)')");await click('.rd-modal .nt-x');
    await ev("window.rdApiTeste=BCBR.api;window.rdGets=0;BCBR.api=async(p,o)=>{if(p.includes('/contents/semana/plano.json')&&o?.method!=='PUT')rdGets++;return rdApiTeste(p,o)}");
    for(const evento of ['focus','pageshow','online','visibilitychange']){
      await ev('SM.fila.then(()=>1)');await ate('!SM.puxando');
      const n=await ev('rdGets');await ev(evento==='visibilitychange'?"document.dispatchEvent(new Event('visibilitychange'))":`window.dispatchEvent(new Event('${evento}'))`);await ate(`rdGets>${n}`);
    }
    await ev("Object.defineProperty(navigator,'onLine',{configurable:true,value:false});window.dispatchEvent(new Event('offline'))");assert.equal(await ev("document.getElementById('rd_sync').textContent"),'Pendente — sem conexão');
    await ate('!SM.puxando');
    await ev("Object.defineProperty(navigator,'onLine',{configurable:true,value:true});BCBR.api=async()=>{throw Object.assign(Error('recusado'),{status:401})};smPuxar()");assert.match(await ev("document.getElementById('rd_sync').textContent"),/recusou a chave/);
    await ev('BCBR.api=rdApiTeste');
    await ev('smPuxar().then(()=>rdPinta())');await ate("document.getElementById('rd_sync').textContent==='Salvo ✓'");
    await ev('BCBR.api=rdApiTeste');
  });
  await t.test('digitação real entra no diário antes do debounce; PUT confirma; plano antigo alerta e Restaurar recupera',async()=>{
    await ev("NT.ed.commands.setContent({type:'doc',content:[{type:'paragraph',attrs:{id:'perda-browser'},content:[{type:'text',text:'Texto antigo'}]}]});ntSalvaDoc()");assert.ok(await C.confirmado());
    await ev('window.rdPlanoAntigo=JSON.parse(JSON.stringify(SM.d))');
    await ev("NT.ed.chain().focus('end').insertContent(' TEXTO CONFIRMADO').run()");
    assert.equal(await ev("rdLer().some(e=>e.id==='perda-browser'&&e.texto.includes('TEXTO CONFIRMADO')&&e.rascunho&&!e.enviada)"),true);
    assert.equal(await ev('rdEstado()'),'Enviando…');await ev('ntSalvaDoc()');assert.ok(await C.confirmado());
    assert.equal(await ev("rdLer().some(e=>e.id==='perda-browser'&&e.texto.includes('TEXTO CONFIRMADO')&&e.enviada&&!e.rascunho)"),true);
    await ev("rdGuardar(rdLer().map(e=>({...e,hora:e.hora-6000})));BCBR.api('/repos/'+BCBR.REPO+'/contents/semana/plano.json',{method:'PUT',body:JSON.stringify({message:'teste: plano antigo',content:BCBR.b64(JSON.stringify(rdPlanoAntigo)),sha:SM.sha,branch:'main'})})");
    await ev('smPuxar()');await ate("!document.getElementById('rd_aviso').hidden");
    assert.equal(await ev('NT.ed.state.doc.textContent'),'Texto antigo');
    await click('#rd_aviso');assert.match(await ev("document.querySelector('.rd-modal').textContent"),/Texto da edição confirmada.*TEXTO CONFIRMADO.*Texto atual.*Texto antigo/s);
    await click('[data-restaura]');await ate("NT.ed.state.doc.textContent.includes('TEXTO CONFIRMADO')");assert.ok(await C.confirmado());
    assert.equal(await ev('rdAlertas().length'),0);await click('.rd-modal .nt-x');
  });
  await t.test('Conflitos lista 25, copia, cancela descarte e só exclui após confirmação',async()=>{
    await ev("smMudar(d=>{d.notas_conflitos=Array.from({length:25},(_,i)=>({id:'conflito'+i,em:'2026-11-11',conteudo:{type:'paragraph',content:[{type:'text',text:'Versão preservada '+i}]}}))})");
    await click('#rd_conflitos');assert.equal(await ev("document.querySelectorAll('.rd-modal section').length"),25);
    await click('[data-copia="0"]');await ate("document.getElementById('toast').textContent.includes('copiado')||getSelection().toString()==='Versão preservada 0'");
    await click('[data-descarta="0"]');assert.equal(await ev('SM.d.notas_conflitos.length'),25);await click('[data-nao="0"]');assert.equal(await ev('SM.d.notas_conflitos.length'),25);
    await click('[data-descarta="0"]');await click('[data-sim="0"]');await ate('SM.d.notas_conflitos.length===24');await ate("document.querySelectorAll('.rd-modal section').length===24");
    assert.equal(await ev("SM.d.notas_conflitos.some(c=>c.id==='conflito0')"),false);await click('.rd-modal .nt-x');
    await ev('smPuxar()');assert.equal(await ev('SM.d.notas_conflitos.length'),24);
  });
  await t.test('Backup e recuperação: link correto e download JSON do plano local sem nova requisição',async()=>{
    await ev("go('config');cfgTab='sync';render()");assert.equal(await ev("[...document.querySelectorAll('a')].find(a=>a.textContent==='Abrir backup diário').href"),await ev("'https://github.com/'+BCBR.REPO+'/tree/backups'"));
    await ev("window.rdBlob=null;window.rdURL=URL.createObjectURL;window.rdRevoga=URL.revokeObjectURL;URL.createObjectURL=b=>{rdBlob=b;return 'blob:teste'};URL.revokeObjectURL=()=>{};window.rdClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){window.rdNome=this.download};window.rdApiBackup=BCBR.api;window.rdReq=0;BCBR.api=(...a)=>{rdReq++;return rdApiBackup(...a)}");
    await ev("[...document.querySelectorAll('button')].find(b=>b.textContent==='Baixar cópia agora').click()");
    assert.deepEqual(await ev('rdBlob.text().then(JSON.parse)'),await ev('JSON.parse(JSON.stringify(SM.d))'));assert.match(await ev('rdNome'),/^radio-plano-.*\.json$/);assert.equal(await ev('rdReq'),0);
    await ev('URL.createObjectURL=rdURL;URL.revokeObjectURL=rdRevoga;HTMLAnchorElement.prototype.click=rdClick;BCBR.api=rdApiBackup');
  });
  await t.test('1.46: uso em Ajustes e quota real do Chrome preservam armazenamento e mostram orientação',async()=>{
    await ate("document.getElementById('rd_estimativa').textContent.includes('Armazenamento da origem')");
    assert.equal(await ev("document.querySelectorAll('#rd_estimativa').length"),1);
    const uso=await ev('rdUsoLocal()');assert.ok(uso.bytes>0);assert.ok(uso.chaves.length<=8&&uso.chaves.length>0);
    assert.equal(await ev("document.getElementById('rd_estimativa').previousElementSibling.children.length"),uso.chaves.length);
    const antes=await ev('JSON.stringify(Object.entries(localStorage).sort())');
    assert.equal(await ev("ntFilaGrava('blocos',[],[{id:'quota-ficticia',conteudo:'x'.repeat(12*1024*1024)}])"),false);
    assert.match(await ev("document.getElementById('toast').textContent"),/^Pouco espaco neste aparelho \(localStorage [\d.]+ KB usados\)\. Suas notas continuam na fila; baixe uma copia em Ajustes > Backup\.$/);
    assert.equal(await ev('JSON.stringify(Object.entries(localStorage).sort())'),antes);
  });
  await t.test('375 px: indicador visível e sem estouro horizontal',async()=>{
    await C.call('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});await ev("go('notas');rdPinta()");
    const r=await ev("(()=>{const r=document.getElementById('rd_sync').getBoundingClientRect();return {l:r.left,r:r.right,w:r.width,scroll:document.documentElement.scrollWidth,v:innerWidth}})()");assert.ok(r.w>0&&r.l>=0&&r.r<=r.v);assert.ok(r.scroll<=r.v);
  });
  assert.deepEqual(C.erros,[],'nenhuma exceção no Chrome');
});
