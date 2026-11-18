// Radio 1.63.0 no Chrome: Notas — depois de colar texto (Ctrl+V, simples ou rico, inclusive multi-bloco),
// o cursor fica no fim do texto colado para continuar digitando. Dados fictícios.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {iniciar,espera}=require('./chrome-util.js');

test('Radio 1.63.0: Notas — colar texto simples, rico e multi-bloco deixa o cursor no fim do colado',{timeout:120000},async t=>{
  const C=await iniciar({porta:8810,env:{BCBR_QS:'10'}});t.after(()=>C.fim());
  const {ev,call,ctrl,digita,ate,reset,par}=C;

  await C.abre('notas');
  await ate("typeof NT!=='undefined'&&!!NT.ed&&!NT.carregando");
  await call('Browser.grantPermissions',{origin:C.URL_,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});

  const cola=(plain,html='')=>ev(`(()=>{
    const dt=new DataTransfer();
    if(${JSON.stringify(plain)})dt.setData('text/plain',${JSON.stringify(plain)});
    if(${JSON.stringify(html)})dt.setData('text/html',${JSON.stringify(html)});
    NT.ed.view.dom.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));
  })()`);

  await t.test('1. colar texto simples no meio da frase deixa cursor no fim do colado',async()=>{
    await reset(par('antes depois'));
    await ev("NT.ed.chain().focus().setTextSelection(7).run();0"); // após "antes "
    await cola('colado');
    await espera(60);
    await digita('!');
    await espera(60);
    assert.equal(await ev("NT.ed.state.doc.firstChild.textContent"),'antes colado!depois');
  });

  await t.test('2. colar texto simples multi-linha antes de outro bloco deixa cursor no fim do último bloco colado',async()=>{
    await reset(par(''),par('seguinte'));
    await ev("NT.ed.chain().focus().setTextSelection(1).run();0");
    await cola('linha um\nlinha dois');
    await espera(60);
    await digita('!');
    await espera(60);
    const blocos=await ev("NT.ed.getJSON().content.map(n=>n.content?.map(c=>c.text||'').join('')||'')");
    assert.deepEqual(blocos,['linha um','linha dois!','seguinte']);
  });

  await t.test('3. colar HTML rico multi-bloco (título + parágrafos + lista) antes de outro bloco deixa cursor no fim do colado',async()=>{
    await reset(par(''),par('seguinte'));
    await ev("NT.ed.chain().focus().setTextSelection(1).run();0");
    await cola('Título\nPrimeiro\nSegundo','<h1>Título</h1><p>Primeiro</p><p><b>Segundo</b> texto</p>');
    await espera(60);
    await digita('!');
    await espera(60);
    const json=await ev("NT.ed.getJSON().content");
    assert.equal(json[0].type,'heading');
    assert.equal(json[2].content.map(x=>x.text||'').join(''),'Segundo texto!');
    assert.equal(json[3].content.map(x=>x.text||'').join(''),'seguinte');

    // Lista rica multi-bloco antes de outro bloco
    await reset(par(''),par('depois'));
    await ev("NT.ed.chain().focus().setTextSelection(1).run();0");
    await cola('Item A\nItem B','<ul><li><p>Item A</p></li><li><p>Item B</p></li></ul>');
    await espera(60);
    await digita('!');
    await espera(60);
    const listText=await ev("NT.ed.getJSON().content[0].content[1].content[0].content[0].text");
    assert.equal(listText,'Item B!');
    assert.equal(await ev("NT.ed.state.doc.lastChild.textContent"),'depois');
  });

  await t.test('4. Ctrl+V real com clipboard rico do Chrome deixa cursor no fim do último bloco colado',async()=>{
    await reset(par('inicio fim'),par('restante'));
    await ev(`(async()=>{
      const html='<p>Bloco alfa</p><p><i>Bloco beta</i></p>';
      await navigator.clipboard.write([new ClipboardItem({
        'text/html':new Blob([html],{type:'text/html'}),
        'text/plain':new Blob(['Bloco alfa\\nBloco beta'],{type:'text/plain'})
      })]);
      NT.ed.chain().focus().setTextSelection(8).run(); // "inicio |fim"
    })()`);
    await ctrl('v');
    await ate("NT.ed.getText().includes('Bloco beta')",5000);
    await espera(80);
    await digita(' OK');
    await espera(80);
    const textos=await ev("NT.ed.getJSON().content.map(n=>n.content?.map(c=>c.text||'').join('')||'')");
    assert.deepEqual(textos,['inicio Bloco alfa','Bloco beta OKfim','restante'],'cursor após Ctrl+V ficou no fim de "Bloco beta" (antes de "fim"): '+JSON.stringify(textos));

    await reset(par(''),par('restante'));
    await ev("NT.ed.chain().focus().setTextSelection(1).run();0");
    await ctrl('v');
    await ate("NT.ed.getText().includes('Bloco beta')",5000);
    await espera(80);
    await digita(' OK2');
    await espera(80);
    const textos2=await ev("NT.ed.getJSON().content.map(n=>n.content?.map(c=>c.text||'').join('')||'')");
    assert.deepEqual(textos2,['Bloco alfa','Bloco beta OK2','restante']);
  });

  assert.deepEqual(C.erros,[]);
});
