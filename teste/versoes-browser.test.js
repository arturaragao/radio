// 1.48 no Chrome: Versões/Restaurar pelo menu real da página e reabertura na última página (servidor local, dados fictícios).
const {test}=require('node:test'),assert=require('node:assert/strict');
const {iniciar}=require('./chrome-util');
test('1.48 Chrome: menu ⋯ > Versões lista commits do arquivo, pré-visualiza e Restaurar cria gravação nova; app reabre na última página',{timeout:90000},async t=>{
  const C=await iniciar({porta:8793,env:{BCBR_QS:'10'}});t.after(()=>C.fim());const {ev,ate,click}=C;
  await C.abre('notas');await ate("!!NT.ed&&NT.pagina==='notas'");
  const id=await ev('ntPaginaCria()');await ev(`ntPainelAbre('${id}')`);await ate(`NT.pagina==='${id}'&&!NT.carregando&&!!NT.ed`);
  const grava=async txt=>{await ev(`NT.ed.commands.setContent({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:${JSON.stringify(txt)}}]}]});ntSalvaDoc();0`);assert.equal(await C.confirmado(),true,'confirmou '+txt)};
  await grava('versão um fictícia');await grava('versão dois fictícia');
  assert.match(await ev(`SyncNotas.abrirPagina('${id}').then(p=>JSON.stringify(p.doc))`),/versão dois/);
  // Caminho real: botão ⋯ do topo > Versões.
  await click('.nt-topo [aria-label="Opções da página"]');await click('#nt_pg_menu [data-versoes]');
  await ate("document.querySelectorAll('.nt-hist-lista button').length>=2");
  const n=await ev("document.querySelectorAll('.nt-hist-lista button').length");
  let achou=false;
  for(let i=0;i<n&&!achou;i++){
    await ev(`document.querySelectorAll('.nt-hist-lista button')[${i}].click();0`);
    await ate("!document.querySelector('[data-restaurar]').disabled||/Nenhuma|rro/.test(document.querySelector('.nt-hist-msg').textContent)");
    achou=/versão um fictícia/.test(await ev("document.querySelector('.nt-hist-prev').textContent"));
  }
  assert.ok(achou,'a versão anterior aparece na pré-visualização');
  assert.match(await ev('NT.ed.getText()'),/versão dois/,'pré-visualizar não muda a página');
  await click('[data-restaurar]');await ate("!document.querySelector('.nt-hist')");
  assert.equal(await C.confirmado(),true);
  await ate("/versão um fictícia/.test(NT.ed.getText())");
  const atual=await ev(`SyncNotas.abrirPagina('${id}')`);assert.match(JSON.stringify(atual.doc),/versão um fictícia/,'restaurada no arquivo');
  const commits=await ev(`SyncNotas.versoes('${id}')`);assert.ok(commits.length>=3,'restaurar é gravação nova; histórico mantém as anteriores: '+commits.length);
  // Última página: recarregar o app sem ?pagina abre a mesma página.
  assert.equal(await ev("localStorage.getItem('bcbr_ultima_pagina')"),id);
  await C.abre('notas');await ate(`NT.pagina==='${id}'&&!NT.carregando&&!!NT.ed`);
  assert.match(await ev('NT.ed.getText()'),/versão um fictícia/);assert.match(await ev('location.search'),new RegExp('pagina='+id));
  assert.deepEqual(C.erros,[]);
});
