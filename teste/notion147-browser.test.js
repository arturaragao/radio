const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {iniciar}=require('./chrome-util.js'),{exemplo,id:notionId}=require('./notion147-ficticio.js');
test('Notion 1.47 Chrome: ZIPs v1/v2, diff, decisão parcial, backup, fila, imagem e isolamento',{timeout:120000},async t=>{
  const C=await iniciar({porta:8781,sw:true,env:{BCBR_QS:'10'}});t.after(()=>C.fim());const {ev,click,ate,call}=C;await C.abre('notas');
  const importa=(v,id='')=>ev(`ntNotionImporta(new File([new Uint8Array(${JSON.stringify([...exemplo(v)])})],'exemplo-v${v}.zip'),${JSON.stringify(id)})`);
  const r=await importa(1);assert.equal(r.paginas,1);assert.equal(r.enviadas,1);assert.equal(r.falhas,0);
  const inicial=await ev('pgAchar(NT.pagina)'),id=inicial.id;assert.equal(inicial.origem.tipo,'notion-zip');assert.equal(inicial.origem.titulo,'Página fictícia');assert.equal(inicial.origem.notionId,notionId);assert.ok(Date.parse(inicial.origem.importadoEm));assert.equal(Object.keys(inicial.origem.imagens).length,1);
  assert.deepEqual(await ev("[...NT.el.querySelectorAll('[data-type=details]')].map(n=>n.classList.contains('is-open'))"),[false]);
  await ate("NT.el.querySelector('img')?.complete&&NT.el.querySelector('img').naturalWidth===1");
  await ev("document.querySelector('.nt-importa-acoes button').click()");
  // Uma edição local ainda sem debounce deve fazer parte do Antes e da cópia de segurança.
  await ev(`(()=>{const blocos=ntBlocos(NT.ed.getJSON(),NT.shown),b=blocos.find(b=>ntNotionTexto(b.conteudo)==='Texto antigo');b.conteudo.content[0].text='Texto antigo com edição local';ntAplicaNoEditor(NT,blocos,true);ntSalvaDoc();pgMuda(l=>l.push({id:'outra-ficticia',titulo:'Outra página',fixada:true,ordem:999,criado:ntAgora(),atualizado:ntAgora(),doc:{v:1,blocos:ntBlocos({content:[ntPar('Não alterar esta página')]},[])}}));return true})()`);
  assert.equal(await C.confirmado(),true);const antes=await ev(`pgAchar('${id}')`),outra=await ev("pgAchar('outra-ficticia')");
  await ev('window.envia147=ntImgEnvia;window.uploads147=0;ntImgEnvia=async b=>{window.uploads147++;return window.envia147(b)}');
  // Caminho real pelo menu de contexto e seletor de ZIP.
  await ev(`document.querySelector('[data-pg="${id}"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:100,clientY:150}))`);
  assert.match(await ev("document.querySelector('#nt_pg_menu [data-notion]').textContent"),/Atualizar do Notion/);
  await call('Page.setInterceptFileChooserDialog',{enabled:true});await click('#nt_pg_menu [data-notion]');
  assert.equal(await ev("document.querySelector('.nt-notion-arquivo').accept"),'.zip');
  const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'radio147-')),arquivo=path.join(pasta,'notion147-v2.zip');t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));fs.writeFileSync(arquivo,exemplo(2));
  const dom=await call('DOM.getDocument'),q=await call('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'.nt-notion-arquivo'});assert.ok(q.nodeId);await call('DOM.setFileInputFiles',{nodeId:q.nodeId,files:[arquivo]});
  await ate("!!document.querySelector('.nt-notion-diff')");
  assert.equal(await ev('window.uploads147'),0);assert.match(await ev("document.querySelector('.nt-notion-diff [role=status]').textContent"),/1 reutilizadas; 0 falhas/);
  const tipos=await ev("[...document.querySelectorAll('.nt-diff-bloco')].map(n=>n.className)");
  assert.equal(tipos.filter(t=>t.includes('adicionado')).length,1);assert.equal(tipos.filter(t=>t.includes('removido')).length,1);assert.equal(tipos.filter(t=>t.includes('alterado')).length,1);
  assert.match(await ev("document.querySelector('.nt-diff-bloco.alterado .nt-diff-antes').textContent"),/edição local/);assert.match(await ev("document.querySelector('.nt-diff-bloco.alterado .nt-diff-depois').textContent"),/Texto atualizado/);
  assert.equal(await ev("getComputedStyle(document.querySelector('.removido .nt-diff-conteudo')).textDecorationLine"),'line-through');
  assert.deepEqual(await ev(`pgAchar('${id}')`),antes,'revisão não grava a página');assert.deepEqual(await ev("pgAchar('outra-ficticia')"),outra);
  await click('.removido [data-ignorar]');assert.equal(await ev("document.querySelector('.removido [data-ignorar]').getAttribute('aria-pressed')"),'true');
  await click('[data-selecao]');await ate("!document.querySelector('.nt-notion-diff')");assert.equal(await C.confirmado(),true);
  const atual=await ev(`pgAchar('${id}')`),copias=await ev(`Promise.all(ntPaginas().filter(p=>p.titulo.includes('(antes de atualizar')).map(p=>SyncNotas.abrirPagina(p.id)))`);assert.equal(copias.length,1);assert.match(copias[0].titulo,/antes de atualizar \d{2}\/\d{2}/);assert.deepEqual(copias[0].doc,antes.doc);assert.equal(copias[0].origem,undefined);
  const textos=atual.doc.blocos.map(b=>b.conteudo.content?.[0]?.text).filter(Boolean);assert.ok(textos.includes('Remover este bloco'));assert.ok(textos.includes('Bloco adicionado'));assert.ok(textos.includes('Texto atualizado'));assert.ok(!textos.includes('Texto antigo com edição local'));
  const antigo=antes.doc.blocos.find(b=>b.conteudo.content?.[0]?.text==='Texto antigo com edição local'),novo=atual.doc.blocos.find(b=>b.conteudo.content?.[0]?.text==='Texto atualizado');assert.equal(novo.id,antigo.id);
  assert.deepEqual(atual.doc.blocos.find(b=>b.conteudo.type==='details'),antes.doc.blocos.find(b=>b.conteudo.type==='details'));assert.deepEqual(atual.doc.blocos.find(b=>b.conteudo.type==='image'),antes.doc.blocos.find(b=>b.conteudo.type==='image'));assert.deepEqual(await ev("pgAchar('outra-ficticia')"),outra);
  assert.equal(await ev("ntPaginas().filter(p=>p.id!=='notas').length"),3,'1.48: Notas é página; além dela, importada, outra e a cópia');
  // Recarregar prova PUT da página e do backup; a imagem volta do servidor simulado após tirar o cache.
  await ev("caches.delete('bcbr-img')");await C.abre('notas');await ev(`ntPainelAbre('${id}')`);await ate("NT.el.querySelector('img')?.complete&&NT.el.querySelector('img').naturalWidth===1");assert.deepEqual(await ev(`SyncNotas.abrirPagina(ntPaginas().find(p=>p.copiaDe==='${id}').id).then(p=>p.doc)`),antes.doc);
  // Caminho aberto usa edição com Ctrl+Z e continua salvando pela fila normal.
  const revisao=await importa(2,id);assert.ok(revisao.diferencas.includes('removido'));await click('[data-tudo]');await ate("!document.querySelector('.nt-notion-diff')");assert.equal(await C.confirmado(),true);
  assert.ok(!(await ev('NT.ed.state.doc.textContent')).includes('Remover este bloco'));
  const igual=await importa(2,id);assert.ok(igual.diferencas.every(t=>t==='igual'));const semMudanca=await ev('JSON.stringify(ntPaginas())');await click('[data-tudo]');assert.match(await ev("document.querySelector('.nt-notion-diff [role=status]').textContent"),/Nenhuma alteração/);assert.equal(await ev('JSON.stringify(ntPaginas())'),semMudanca);await click('[data-cancelar]');
  await ev('NT.ed.commands.undo();ntSalvaDoc();true');assert.equal(await C.confirmado(),true);assert.ok((await ev('NT.ed.state.doc.textContent')).includes('Remover este bloco'));
  const antesCancelar=await ev('JSON.stringify(ntPaginas())');await importa(1,id);await click('[data-cancelar]');assert.equal(await ev('JSON.stringify(ntPaginas())'),antesCancelar);
  // Edição enquanto a revisão está aberta não pode ser sobrescrita por uma decisão antiga.
  await importa(2,id);await ev("NT.ed.commands.insertContent('Edição durante revisão');ntSalvaDoc();true");const qtd=await ev('ntPaginas().length');await click('[data-tudo]');assert.match(await ev("document.querySelector('.nt-notion-diff [role=status]').textContent"),/mudou durante a revisão/);assert.equal(await ev('ntPaginas().length'),qtd);assert.ok((await ev('NT.ed.state.doc.textContent')).includes('Edição durante revisão'));await click('[data-cancelar]');
  // Página legada sem origem/hashes: compara os bytes JPEG existentes e continua sem novo upload.
  assert.equal(await C.confirmado(),true);await ev(`pgMuda(l=>{delete l.find(p=>p.id==='${id}').origem});true`);assert.equal(await C.confirmado(),true);
  await ev('window.envia147=ntImgEnvia;window.uploads147=0;ntImgEnvia=async b=>{window.uploads147++;return window.envia147(b)}');
  const legada=await importa(2,id);assert.equal(legada.reutilizadas,1);assert.equal(legada.enviadas,0);assert.equal(await ev('window.uploads147'),0);
  // Falta de espaço dispara PUT imediato da atualização e da cópia.
  const antesQuota=await ev('ntPaginas().length');
  await ev("window.set147=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('bcbr_paginas_pendentes_v2:'))throw new DOMException('Quota fictícia','QuotaExceededError');return window.set147.call(this,k,v)}");
  await click('[data-tudo]');assert.equal(await C.confirmado(),true);assert.equal(await ev('ntPaginas().length'),antesQuota+1);
  await ev('Storage.prototype.setItem=window.set147');
  const atributo=await ev("ntNotionConverte('<article id=\"fedcba98-7654-3210-fedc-ba9876543210\"><p>x</p></article>','sem-id.html').notionId");assert.equal(atributo,'fedcba9876543210fedcba9876543210');
  assert.deepEqual(C.erros,[]);
});
