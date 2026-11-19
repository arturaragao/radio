// Radio 1.65.0 no Chrome: Notas — Enter no meio de um bloco divide o texto em dois blocos mantendo tipo e formatação,
// com seleção apaga a seleção e divide, no fim cria bloco vazio, e persiste/sincroniza normalmente. Dados fictícios.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {iniciar,espera}=require('./chrome-util.js');

test('Radio 1.65.0: Notas — Enter divide bloco no meio, com seleção, no fim e persiste',{timeout:120000},async t=>{
  const C=await iniciar({porta:8811,env:{BCBR_QS:'10'}});t.after(()=>C.fim());
  const {ev,digita,especial,ate,reset,par,tg,confirmado}=C;

  await C.abre('notas');
  await ate("typeof NT!=='undefined'&&!!NT.ed&&!NT.carregando");

  await t.test('1. parágrafo: meio, fim, seleção, negrito e Shift+Enter',async()=>{
    // Meio
    await reset(par('antes depois'));
    await ev("NT.ed.chain().focus().setTextSelection(7).run();0"); // após "antes "
    await especial('Enter');
    await espera(80);
    await digita('!');
    await espera(60);
    assert.deepEqual(
      await ev("NT.ed.getJSON().content.map(n=>n.content?.map(c=>c.text||'').join('')||'')"),
      ['antes ','!depois']
    );

    // Fim
    await reset(par('linha um'));
    await ev("NT.ed.chain().focus().setTextSelection(9).run();0");
    await especial('Enter');
    await espera(80);
    await digita('linha dois');
    await espera(60);
    assert.deepEqual(
      await ev("NT.ed.getJSON().content.map(n=>n.content?.map(c=>c.text||'').join('')||'')"),
      ['linha um','linha dois']
    );

    // Com seleção
    await reset(par('abcdef'));
    await ev("NT.ed.chain().focus().setTextSelection({from:3,to:5}).run();0"); // seleciona "cd"
    await especial('Enter');
    await espera(80);
    assert.deepEqual(
      await ev("NT.ed.getJSON().content.map(n=>n.content?.map(c=>c.text||'').join('')||'')"),
      ['ab','ef']
    );

    // Mantém formatação (negrito) nos dois pedaços
    await reset({type:'paragraph',content:[{type:'text',text:'ab'},{type:'text',marks:[{type:'bold'}],text:'cdef'}]});
    await ev("NT.ed.chain().focus().setTextSelection(4).run();0"); // entre c e d
    await especial('Enter');
    await espera(80);
    const json=await ev("NT.ed.getJSON().content");
    assert.deepEqual(json[0].content,[{type:'text',text:'ab'},{type:'text',marks:[{type:'bold'}],text:'c'}]);
    assert.deepEqual(json[1].content,[{type:'text',marks:[{type:'bold'}],text:'def'}]);

    // Shift+Enter não divide em dois blocos
    await reset(par('abcdef'));
    await ev("NT.ed.chain().focus().setTextSelection(4).run();0");
    await especial('Enter',8);
    await espera(80);
    assert.equal(await ev("NT.ed.getJSON().content.length"),1);
  });

  await t.test('2. listas e checklist mantêm o tipo ao dividir no meio, no fim e com seleção',async()=>{
    // Lista com bolinhas: meio
    await reset({type:'bulletList',content:[{type:'listItem',content:[par('primeiro segundo')]}]});
    await ev("NT.ed.chain().focus().setTextSelection(12).run();0"); // após "primeiro "
    await especial('Enter');
    await espera(80);
    const ul=await ev("NT.ed.getJSON().content[0]");
    assert.equal(ul.type,'bulletList');
    assert.deepEqual(ul.content.map(i=>i.content[0].content?.map(c=>c.text||'').join('')||''),['primeiro ','segundo']);

    // Checklist: meio e seleção
    await reset({type:'taskList',content:[{type:'taskItem',attrs:{checked:false},content:[par('tarefa um dois')]}]});
    await ev("NT.ed.chain().focus().setTextSelection({from:9,to:12}).run();0"); // seleciona " um"
    await especial('Enter');
    await espera(80);
    const tl=await ev("NT.ed.getJSON().content[0]");
    assert.equal(tl.type,'taskList');
    assert.equal(tl.content[0].type,'taskItem');
    assert.equal(tl.content[1].type,'taskItem');
    assert.deepEqual(tl.content.map(i=>i.content[0].content?.map(c=>c.text||'').join('')||''),['tarefa',' dois']);
  });

  await t.test('3. toggle: dividir no meio e com seleção mantém tipo, conteúdo e negrito; no fim entra no conteúdo',async()=>{
    // Meio com negrito + conteúdo interno preservado
    await reset({
      type:'details',
      content:[
        {type:'detailsSummary',content:[{type:'text',text:'ab'},{type:'text',marks:[{type:'bold'}],text:'cdef'}]},
        {type:'detailsContent',content:[par('interno')]}
      ]
    });
    await ev("NT.ed.chain().focus().setTextSelection(5).run();0"); // entre c e d
    await especial('Enter');
    await espera(80);
    await digita('!');
    await espera(60);
    const docs=await ev("NT.ed.getJSON().content");
    assert.equal(docs[0].type,'details');
    assert.equal(docs[1].type,'details');
    assert.notEqual(docs[0].attrs.id,docs[1].attrs.id);
    assert.deepEqual(docs[0].content[0].content,[{type:'text',text:'ab'},{type:'text',marks:[{type:'bold'}],text:'c'}]);
    assert.equal(docs[0].content[1].content[0].content[0].text,'interno');
    assert.equal(docs[1].content[0].content.map(x=>x.text||'').join(''),'!def');
    assert.ok(docs[1].content[0].content.every(x=>x.marks?.some(m=>m.type==='bold')));

    // Com seleção
    await reset(tg('abcdef'));
    await ev("NT.ed.chain().focus().setTextSelection({from:4,to:6}).run();0"); // seleciona "cd"
    await especial('Enter');
    await espera(80);
    const docsSel=await ev("NT.ed.getJSON().content");
    assert.equal(docsSel[0].type,'details');
    assert.equal(docsSel[1].type,'details');
    assert.equal(docsSel[0].content[0].content.map(x=>x.text||'').join(''),'ab');
    assert.equal(docsSel[1].content[0].content.map(x=>x.text||'').join(''),'ef');

    // No fim: entra no conteúdo do toggle (como já é)
    await reset(tg('abcdef'));
    await ev("NT.ed.chain().focus().setTextSelection(8).run();0");
    await especial('Enter');
    await espera(80);
    const docsFim=await ev("NT.ed.getJSON().content");
    assert.equal(docsFim.filter(n=>n.type==='details').length,1);
    assert.equal(docsFim[0].content[0].content[0].text,'abcdef');
  });

  await t.test('4. divisão salva e sincroniza sem perder texto após recarregar',async()=>{
    await reset(par('primeira segunda'),tg('alfa beta'));
    await ev("NT.ed.chain().focus().setTextSelection(10).run();0"); // após "primeira "
    await especial('Enter');
    await espera(100);
    await ev("NT.ed.chain().focus().setTextSelection(27).run();0"); // após "alfa " em "alfa beta"
    await especial('Enter');
    await espera(100);
    await ev("ntSalvaDoc();0");
    assert.ok(await confirmado(),'alterações confirmadas no servidor');

    await C.abre('notas');
    await ate("typeof NT!=='undefined'&&!!NT.ed&&!NT.carregando");
    const recarregado=await ev("NT.ed.getJSON().content");
    assert.equal(recarregado[0].content[0].text,'primeira ');
    assert.equal(recarregado[1].content[0].text,'segunda');
    assert.equal(recarregado[2].type,'details');
    assert.equal(recarregado[3].type,'details');
    assert.equal(recarregado[2].content[0].content[0].text,'alfa ');
    assert.equal(recarregado[3].content[0].content[0].text,'beta');
  });

  assert.deepEqual(C.erros,[]);
});
