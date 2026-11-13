const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {iniciar}=require('./chrome-util.js'),{zip}=require('./zip-ficticio.js');
const raizNome='Raiz fictícia 0123456789abcdef0123456789abcdef.html',filhaNome='Raiz fictícia/Filha fedcba9876543210fedcba9876543210.html';
const html=`<!DOCTYPE html><html><head><title>Raiz fictícia</title><style>.nada{color:red}</style></head><body><article><h1 class="page-title">Raiz fictícia</h1><div class="page-body">
<details open><summary>Toggle externo</summary><p>Dentro</p><ul class="toggle"><li><details open><summary>Toggle interno</summary><p>Fundo</p></details></li></ul></details>
<ul class="toggle"><li>Outro toggle<div class="indented"><p>Conteúdo</p></div></li></ul>
<h1>Título 1</h1><h2>Título 2</h2><h3>Título 3</h3><p><strong>negrito</strong> <em>itálico</em> <u>sublinhado</u> <s>tachado</s> <code>código</code> <a href="https://example.org/">link seguro</a> <a href="javascript:alert(1)" onclick="window.ntAtaque=1">link malicioso</a></p>
<p class="block-color-blue_background"><span class="highlight-red">cor vermelha</span> fundo azul</p>
<ul class="bulleted-list"><li>Item A<ul><li>Item aninhado</li></ul></li></ul><ol start="3"><li>Numerada</li></ol>
<ul class="to-do-list"><li><div class="checkbox checkbox-on"></div><span class="to-do-children-checked">Feita</span></li><li><input type="checkbox">Pendente</li></ul>
<blockquote><p>Citação</p></blockquote><figure class="callout"><div>💡</div><div>Destaque</div></figure><hr>
<figure class="image"><a href="Raiz%20fict%C3%ADcia/pixel%20azul.png"><img src="Raiz%20fict%C3%ADcia/pixel%20azul.png" onerror="window.ntAtaque=1"></a></figure>
<figure class="image"><img src="https://example.org/externa.png"></figure><img src="data:image/png;base64,AAAA">
<p><a href="Raiz%20fict%C3%ADcia/Filha%20fedcba9876543210fedcba9876543210.html">Subpágina</a></p>
<table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></tbody></table><div class="column-list"><div class="column">Coluna A</div><div class="column">Coluna B</div></div><div class="equation">x = 2</div><iframe title="Incorporado" src="https://example.org/"></iframe><div class="collection-content">Banco fictício</div>
<script>window.ntAtaque=1</script></div></article></body></html>`;
test('Notion 1.43 no Chrome: conversor e importação com imagem persistida',{timeout:120000},async t=>{
  const C=await iniciar({porta:8776,sw:true});t.after(()=>C.fim());const {ev,call,click,ate}=C;await C.abre('notas');
  await t.test('unidade do conversor: nós, marcas, cores, tarefas, aninhamento e HTML hostil',async()=>{
    const r=await ev(`(()=>{const r=ntNotionConverte(${JSON.stringify(html)},${JSON.stringify(raizNome)},new Map([[${JSON.stringify(filhaNome)},'pfilha']]));NT.ed.state.schema.nodeFromJSON(r.doc).check();return r})()`);
    assert.equal(r.titulo,'Raiz fictícia');assert.equal(r.imagens.length,1);assert.equal(r.imagens[0].caminho,'Raiz fictícia/pixel azul.png');
    const c=r.doc.content;assert.equal(c[0].type,'details');assert.equal(c[0].content[1].content[1].type,'details');assert.equal(c[0].content[1].content[1].content[0].content[0].text,'Toggle interno');assert.equal(c[1].content[0].content[0].text,'Outro toggle');
    const flat=[];const visita=n=>{flat.push(n);for(const c of n.content||[])visita(c)};visita(r.doc);
    for(const type of ['heading','bulletList','orderedList','taskList','taskItem','blockquote','callout','horizontalRule','paginaLink'])assert.ok(flat.some(n=>n.type===type),type);
    assert.deepEqual(flat.filter(n=>n.type==='heading').map(n=>n.attrs.level),[1,2,3]);assert.equal(flat.find(n=>n.type==='orderedList').attrs.start,3);
    assert.deepEqual(flat.filter(n=>n.type==='taskItem').map(n=>n.attrs.checked),[true,false]);
    for(const mark of ['bold','italic','underline','strike','link'])assert.ok(flat.some(n=>n.marks?.some(m=>m.type===mark)),mark);
    assert.ok(flat.some(n=>n.marks?.some(m=>m.attrs?.codigo)));assert.ok(flat.some(n=>n.marks?.some(m=>m.attrs?.color==='var(--ntc-vermelho)'&&m.attrs.backgroundColor==='var(--ntb-azul)')));
    assert.equal(flat.find(n=>n.type==='paginaLink').attrs.pagina,'pfilha');assert.ok(flat.some(n=>n.type==='table'&&n.content.length===2));assert.equal(r.simplificados,6);
    const serial=JSON.stringify(r.doc);assert.doesNotMatch(serial,/javascript:|onclick|onerror|window.ntAtaque|externa.png|data:image/);assert.equal(await ev('window.ntAtaque'),undefined);
    assert.equal(await ev(`ntNotionConverte('<h1>Sem title</h1><p>Texto</p>','Sem title 0123456789abcdef0123456789abcdef.html').titulo`),'Sem title');
  });
  await t.test('seletor ZIP: duas páginas, pasta raiz, toggles fechados, upload real no servidor e reload',async()=>{
    const png=Buffer.from(await ev("(()=>{const c=document.createElement('canvas');c.width=3;c.height=3;c.getContext('2d').fillRect(0,0,3,3);return c.toDataURL('image/png').split(',')[1]})()"),'base64');
    const dados=zip([{nome:raizNome,dados:html,metodo:8},{nome:filhaNome,dados:'<title>Filha fictícia</title><article><div class="page-body"><p>Conteúdo da filha</p></div></article>',metodo:0},{nome:'Raiz fictícia/pixel azul.png',dados:png}]);
    const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'radio-notion-')),arquivo=path.join(pasta,'ExportBlock-ficticio.zip');t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));fs.writeFileSync(arquivo,zip([{nome:'Part-1.zip',dados}]));
    await call('Page.setInterceptFileChooserDialog',{enabled:true});await click('[onclick="ntNotionEscolhe()"]');
    const dom=await call('DOM.getDocument'),q=await call('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'.nt-notion-arquivo'});assert.ok(q.nodeId);await call('DOM.setFileInputFiles',{nodeId:q.nodeId,files:[arquivo]});
    await ate("document.querySelector('.nt-importa-status')?.textContent.includes('2 páginas criadas')");
    assert.match(await ev("document.querySelector('.nt-importa-status').textContent"),/1 imagens enviadas, 0 falhas/);assert.equal(await C.confirmado(),true);
    const pags=await ev('ntPaginas()'),f=await ev('ntPastas().at(-1)');assert.equal(f.titulo,'Raiz fictícia');assert.equal(pags.filter(p=>p.pasta===f.id).length,2);
    const primeira=pags.find(p=>p.titulo==='Raiz fictícia');assert.ok(primeira);assert.equal(await ev('NT.pagina'),primeira.id);
    assert.deepEqual(await ev("[...NT.el.querySelectorAll('[data-type=details]')].map(e=>e.classList.contains('is-open'))"),[false,false,false]);
    await ate("NT.el.querySelector('img.nt-img')?.complete&&NT.el.querySelector('img.nt-img').naturalWidth===3");
    await click('.nt-importa-acoes button');
    // Retira cache da imagem: reload precisa buscá-la do servidor simulado, provando o PUT.
    await ev("caches.delete('bcbr-img')");await C.abre('notas');await ev(`ntPainelAbre('${primeira.id}')`);
    await ate("NT.el.querySelector('img.nt-img')?.complete&&NT.el.querySelector('img.nt-img').naturalWidth===3");assert.equal(await ev(`ntPastas().find(p=>p.id==='${f.id}').titulo`),'Raiz fictícia');
    assert.equal(await ev("NT.ed.getJSON().content.filter(n=>n.type==='details').length"),2);
  });
  await t.test('HTML solto, falha de imagem, offline só texto, cancelamento e ZIP inválido sem importação parcial',async()=>{
    const n=await ev('ntPaginas().length');
    const r=await ev(`ntNotionImporta(new File(['<title>Solta</title><p>Texto sem imagens</p>'],'solta.html',{type:'text/html'}))`);assert.equal(r.paginas,1);assert.equal(r.enviadas,0);await ev("document.querySelector('.nt-importa-acoes button').click()");assert.equal(await C.confirmado(),true);
    const png=Buffer.from(await ev("(()=>{const c=document.createElement('canvas');c.width=3;c.height=3;return c.toDataURL('image/png').split(',')[1]})()"),'base64');
    const comImagem=zip([{nome:'Com imagem.html',dados:'<title>Com imagem</title><img src="foto.png">'},{nome:'foto.png',dados:png}]);
    await ev("window.ntEnviaOriginal=ntImgEnvia;window.ntChamadas=0;ntImgEnvia=async()=>{window.ntChamadas++;throw Error('falha fictícia de upload')}");
    const falha=await ev(`ntNotionImporta(new File([new Uint8Array(${JSON.stringify([...comImagem])})],'falha.zip'))`);assert.equal(falha.falhas,1);assert.equal(await ev('window.ntChamadas'),1);assert.match(await ev('NT.ed.state.doc.textContent'),/imagem não importada: foto.png/);await ev("ntImgEnvia=window.ntEnviaOriginal;window.ntChamadas=0;document.querySelector('.nt-importa-acoes button').click()");
    const ruim=zip([{nome:'boa.html',dados:'boa'},{nome:'cifrada.html',flags:1}]);assert.equal(await ev(`ntNotionImporta(new File([new Uint8Array(${JSON.stringify([...ruim])})],'ruim.zip'))`),null);assert.match(await ev("document.querySelector('.nt-importa-status').textContent"),/cifrado/);assert.equal(await ev('ntPaginas().length'),n+2);await click('.nt-importa-acoes button');
    await ev(`Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});ntImgEnvia=async b=>{window.ntChamadas++;return window.ntEnviaOriginal(b)};window.ntResultado=undefined;ntNotionImporta(new File([new Uint8Array(${JSON.stringify([...comImagem])})],'offline.zip')).then(r=>window.ntResultado=r);0`);
    await ate("document.querySelector('.nt-importa-status')?.textContent.includes('precisam de conexão')");await click('.nt-importa-acoes button:last-child');await ate('window.ntResultado!==undefined');assert.equal(await ev('window.ntResultado.falhas'),1);assert.equal(await ev('window.ntChamadas'),0,'offline só texto não tenta upload');await ev("document.querySelector('.nt-importa-acoes button').click()");
    await ev(`BCBR.semRede=true;window.ntResultado=undefined;ntNotionImporta(new File([new Uint8Array(${JSON.stringify([...comImagem])})],'cancelar.zip')).then(r=>window.ntResultado=r);0`);
    await ate("document.querySelector('.nt-importa-status')?.textContent.includes('precisam de conexão')");await click('.nt-importa-acoes button');await ate('window.ntResultado===null');assert.equal(await ev('ntPaginas().length'),n+3);await ev("delete navigator.onLine;BCBR.semRede=false;ntImgEnvia=window.ntEnviaOriginal;document.querySelector('.nt-importa-acoes button').click()");
  });
  await t.test('cancelar durante upload: uma imagem em voo, nenhuma página criada nem segundo upload',async()=>{
    const png=Buffer.from(await ev("(()=>{const c=document.createElement('canvas');c.width=3;c.height=3;return c.toDataURL('image/png').split(',')[1]})()"),'base64'),dados=zip([{nome:'Cancelar.html',dados:'<title>Cancelar</title><img src="a.png"><img src="b.png">'},{nome:'a.png',dados:png},{nome:'b.png',dados:png}]);
    const n=await ev('ntPaginas().length');
    await ev(`window.ntChamadas=0;window.ntResultado=undefined;window.ntLibera=null;ntImgEnvia=async b=>{window.ntChamadas++;await new Promise(r=>window.ntLibera=r);return window.ntEnviaOriginal(b)};ntNotionImporta(new File([new Uint8Array(${JSON.stringify([...dados])})],'cancelar.zip')).then(r=>window.ntResultado=r);0`);
    await ate("!!window.ntLibera");assert.match(await ev("document.querySelector('.nt-importa-status').textContent"),/página 1\/1, imagem 1\/2/);await click('.nt-importa-acoes button');await ev('window.ntLibera();0');await ate('window.ntResultado===null');assert.equal(await ev('ntPaginas().length'),n);assert.equal(await ev('window.ntChamadas'),1);assert.match(await ev("document.querySelector('.nt-importa-status').textContent"),/Nenhuma página criada.*1 imagens já foram enviadas/);await ev('ntImgEnvia=window.ntEnviaOriginal');
  });
  assert.deepEqual(C.erros,[]);
});
