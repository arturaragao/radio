const {test}=require('node:test'),assert=require('node:assert/strict');
const {iniciar}=require('./chrome-util');
test('1.44 no Chrome: indicador, conflitos, rascunho e páginas separadas',{timeout:90000},async t=>{
  const C=await iniciar({porta:8775});t.after(()=>C.fim());
  try{await C.abre('notas')}catch(e){assert.fail(e.message+'\n'+C.erros.join('\n')+'\n'+C.consoleErros.join('\n')+'\n'+await C.ev('document.body.innerText'))}
  assert.deepEqual(C.erros,[]);
  assert.equal(await C.ev('!!NT.ed'),true);
  await C.ate("!!document.getElementById('nt_sync')");
  await C.ev("ntPaginaNova();0");await C.ate('!!NP?.ed');
  await C.ev("NP.ed.commands.insertContent('Texto fictício da página 144');0");
  assert.equal(await C.ev("[...Array(localStorage.length)].map((_,i)=>localStorage.key(i)).some(k=>k.startsWith('bcbr_rascunho144:'))"),true);
  await C.ev('pgSalvaDoc();NT.sync');assert.equal(await C.confirmado(),true);
  assert.equal(await C.ev("(async()=>{const f=await smLerArquivo();const p=JSON.parse(smDec(f.content)).notasPaginas.paginas.find(p=>p.id===NP.pagina);return !!p.rev&&!p.doc})()"),true);
  await C.ev("ntPainelFecha();SM.d.notas_conflitos=[{id:'ficticio',em:'2026-11-11',conteudo:{type:'paragraph',content:[{type:'text',text:'Texto para recuperar'}]}}];ntLateralPinta();ntConflitosAbre();0");
  assert.equal(await C.ev("document.querySelector('.nt-conflito textarea').value"),'Texto para recuperar');
  await C.click('[data-descartar]');assert.equal(await C.ev('ntConflitosLista().length'),1);
  await C.click('[data-nao]');assert.equal(await C.ev('ntConflitosLista().length'),1);
  await C.click('[data-descartar]');await C.click('[data-sim]');assert.equal(await C.ev('ntConflitosLista().length'),0);
  await C.ev("ntModalFecha(document.querySelector('.nt-conflitos'));ntSyncPinta();0");await C.click('#nt_sync');
  assert.match(await C.ev("document.querySelector('.nt-sync-detalhes').textContent"),/Última sincronização.*Sincronizar agora/);
  await C.click('.nt-sync-detalhes button');await C.ate("!document.querySelector('.nt-sync-detalhes')");
  assert.equal(await C.confirmado(),true);await C.ev('ntSyncPinta()');assert.equal(await C.ev("document.getElementById('nt_sync').textContent"),'Salvo ✓');
  await C.ev("window.__onLine=Object.getOwnPropertyDescriptor(navigator,'onLine');Object.defineProperty(navigator,'onLine',{value:false,configurable:true});ntSyncPinta()");
  assert.match(await C.ev("document.getElementById('nt_sync').textContent"),/Pendente \(\d+\) — sem conexão/);
  await C.ev("delete navigator.onLine;SM.erro='GitHub recusou a chave (401/403)';ntSyncPinta()");
  assert.match(await C.ev("document.getElementById('nt_sync').textContent"),/401\/403/);
  await C.ev("SM.erro='';window.__paginas=SM.d.notasPaginas;SM.d.notasPaginas={paginas:[{id:'grande',titulo:'Grande',doc:{texto:'ç'.repeat(150001)}}]};ntSyncPinta()");
  assert.match(await C.ev("document.getElementById('nt_tamanho').textContent"),/300 KB/);
  await C.ev("SM.d.notasPaginas=window.__paginas;ntSyncPinta();window.__puxar=smPuxar;window.__eventos=0;smPuxar=async()=>{window.__eventos++}");
  for(const evento of ['focus','online','pageshow']){
    const antes=await C.ev('window.__eventos');await C.ev(`window.dispatchEvent(new Event('${evento}'))`);await C.ate('window.__eventos>'+antes);
  }
  const antes=await C.ev('window.__eventos');await C.ev("Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'))");await C.ate('window.__eventos>'+antes);
  await C.ev("smPuxar=window.__puxar;delete document.visibilityState");
  assert.deepEqual(C.erros,[]);
});
