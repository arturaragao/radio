// 1.49.1 no Chrome: tela Versões estilo Notion pelo menu real (dia/hora, gravações agrupadas, resumo, página renderizada
// com verde/vermelho, Copiar bloco, histórico anterior à 1.48 vindo do plano, Restaurar) e reabertura na última página.
// Servidor local com dados fictícios. Faz parte do teste rápido (interface).
const {test}=require('node:test'),assert=require('node:assert/strict');
const {iniciar}=require('./chrome-util');
test('1.49.1 Chrome: Versões estilo Notion, histórico antes da 1.48, Restaurar e última página',{timeout:60000},async t=>{
  const C=await iniciar({porta:8797,env:{BCBR_QS:'10'}});t.after(()=>C.fim());const {ev,ate,click}=C;
  await C.abre('notas');await ate("!!NT.ed&&NT.pagina==='notas'");
  const id=await ev('ntPaginaCria()');await ev(`ntPainelAbre('${id}')`);await ate(`NT.pagina==='${id}'&&!NT.carregando&&!!NT.ed`);
  const grava=async txt=>{await ev(`NT.ed.commands.setContent({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:${JSON.stringify(txt)}}]}]});ntSalvaDoc();0`);assert.equal(await C.confirmado(),true,'confirmou '+txt)};
  await grava('versão um fictícia');await grava('versão dois fictícia');
  // Histórico anterior à 1.48: um commit do plano com a página em notasPaginas, depois o plano volta ao normal.
  await ev(`(async()=>{const u='/repos/'+BCBR.REPO+'/contents/semana/plano.json',b64=s=>btoa(unescape(encodeURIComponent(s)));
    const f=await BCBR.api(u),d=JSON.parse(decodeURIComponent(escape(atob(f.content.replace(/\\n/g,'')))));
    const velho={...d,notasPaginas:{...(d.notasPaginas||{}),paginas:[{id:'${id}',titulo:'Título antigo',doc:{v:1,blocos:[{id:'bplano',atualizado:'2026-11-01T10:00:00Z',conteudo:{type:'paragraph',attrs:{id:'bplano'},content:[{type:'text',text:'texto de antes da 1.48'}]}}]}}]}};
    const r=await BCBR.api(u,{method:'PUT',body:JSON.stringify({message:'plano antigo',content:b64(JSON.stringify(velho)),sha:f.sha})});
    await BCBR.api(u,{method:'PUT',body:JSON.stringify({message:'plano atual',content:b64(JSON.stringify(d)),sha:r.content.sha})});return 1})()`);
  // Caminho real: botão ⋯ do topo > Versões.
  await click('.nt-topo [aria-label="Opções da página"]');await click('#nt_pg_menu [data-versoes]');
  await ate("document.querySelectorAll('.nt-hist-it').length>=1&&!!document.querySelector('.nt-hist-ptit')");
  assert.equal(await ev("document.querySelector('.nt-hist-dia').textContent"),'Hoje');
  const primeiro=await ev("document.querySelector('.nt-hist-it').textContent");
  assert.match(primeiro,/^\d{2}:\d{2}/,'hora legível: '+primeiro);assert.match(primeiro,/\(\d+ gravações\)/,'gravações seguidas do mesmo aparelho juntas: '+primeiro);
  assert.match(primeiro,/editou|bloco|inicial/,'resumo do que mudou: '+primeiro);
  assert.equal(await ev("document.querySelector('.nt-hist-it').classList.contains('on')"),true,'a mais recente já aparece');
  assert.match(await ev("document.querySelector('.nt-hist-prev').textContent"),/versão dois fictícia/,'página renderizada, não JSON');
  assert.doesNotMatch(await ev("document.querySelector('.nt-hist-prev').textContent"),/"type"|conteudo/);
  assert.match(await ev("document.querySelector('.nt-hist-msg').textContent"),/Igual à versão atual/);
  // Versões mais antigas (plano, antes da 1.48), sob demanda
  await ate("[...document.querySelectorAll('.nt-hist-it')].some(b=>/antes da 1.48/.test(b.textContent))||(!document.querySelector('[data-mais]').hidden&&(document.querySelector('[data-mais]').click(),false))",20000);
  await ev("[...document.querySelectorAll('.nt-hist-it')].find(b=>/antes da 1.48/.test(b.textContent)).click();0");
  await ate("/texto de antes da 1.48/.test(document.querySelector('.nt-hist-prev').textContent)");
  assert.match(await ev("document.querySelector('.nt-hist-bloco.adicionado').textContent"),/texto de antes da 1.48/,'o que volta em verde');
  assert.match(await ev("document.querySelector('.nt-hist-bloco.removido').textContent"),/versão dois fictícia/,'o que sai em vermelho');
  assert.equal(await ev("getComputedStyle(document.querySelector('.nt-hist-bloco.removido .nt-hist-bloco-c')).textDecorationLine"),'line-through');
  assert.equal(await ev("document.querySelector('.nt-hist-ptit').textContent"),'Título antigo');
  assert.equal(await ev("!!document.querySelector('.nt-hist-bloco.adicionado .nt-hist-copia')&&!document.querySelector('.nt-hist-bloco.removido .nt-hist-copia')"),true,'Copiar bloco no trecho recuperável');
  // celular: lista em cima, sem rolagem horizontal
  await C.call('Emulation.setDeviceMetricsOverride',{width:375,height:800,deviceScaleFactor:1,mobile:false});
  assert.equal(await ev("document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('.nt-hist-l').getBoundingClientRect().top<document.querySelector('.nt-hist-prev').getBoundingClientRect().top"),true);
  await C.call('Emulation.setDeviceMetricsOverride',{width:1000,height:900,deviceScaleFactor:1,mobile:false});
  await click('[data-restaurar]');await ate("!document.querySelector('.nt-hist')");
  assert.equal(await C.confirmado(),true);await ate("/texto de antes da 1.48/.test(NT.ed.getText())");
  const atual=await ev(`SyncNotas.abrirPagina('${id}')`);assert.match(JSON.stringify(atual.doc),/texto de antes da 1.48/,'restaurada no arquivo');
  assert.ok((await ev(`SyncNotas.versoes('${id}')`)).length>=3,'restaurar é gravação nova; anteriores continuam no histórico');
  // Última página: recarregar o app sem ?pagina abre a mesma página.
  assert.equal(await ev("localStorage.getItem('bcbr_ultima_pagina')"),id);
  await C.abre('notas');await ate(`NT.pagina==='${id}'&&!NT.carregando&&!!NT.ed`);
  assert.match(await ev('NT.ed.getText()'),/texto de antes da 1.48/);assert.match(await ev('location.search'),new RegExp('pagina='+id));
  assert.deepEqual(C.erros,[]);
});
