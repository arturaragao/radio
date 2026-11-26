// Radio 1.67.0 no Chrome: Notas — colar (texto vai ao fim do colado, sem ir para a linha seguinte; imagem fica selecionada),
// Enter que repete o tipo da linha (toggle, lista) e "Padronizar achado + conclusão". Dados fictícios.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {iniciar,espera}=require('./chrome-util.js');

test('Radio 1.67.0: Notas — colar, Enter e padronizar',{timeout:150000},async t=>{
  const C=await iniciar({porta:8811,env:{BCBR_QS:'10'}});t.after(()=>C.fim());
  const {ev,digita,ate,reset,par,tg,especial}=C;
  await C.abre('notas');
  await ate("typeof NT!=='undefined'&&!!NT.ed&&!NT.carregando");

  const cola=(plain,html='')=>ev(`(()=>{
    const dt=new DataTransfer();
    if(${JSON.stringify(plain)})dt.setData('text/plain',${JSON.stringify(plain)});
    if(${JSON.stringify(html)})dt.setData('text/html',${JSON.stringify(html)});
    NT.ed.view.dom.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));
  })()`);
  const textos=()=>ev("NT.ed.getJSON().content.map(n=>n.content?.map(c=>c.text||'').join('')||n.type)");
  const foco=pos=>ev(`NT.ed.chain().focus().setTextSelection(${pos}).run();0`);
  const resumo=()=>ev("NT.ed.getJSON().content.map(n=>{const tx=x=>x.text||(x.content||[]).map(tx).join('');return n.type+':'+tx(n.type==='details'?n.content[0]:n)})");

  for(const [nome,plain,html] of [
    ['texto com CRLF final','frase colada\r\n',''],
    ['texto com LF final','frase colada\n',''],
    ['texto com várias quebras finais','frase colada\n\n\n',''],
    ['HTML com parágrafo vazio final','frase colada','<p>frase colada</p><p><br></p>'],
    ['HTML com <br> final','frase colada','<meta charset="utf-8"><p>frase colada<br></p>'],
    ['HTML de página (span + quebra de linha)','frase colada','<span>frase colada</span>\n'],
  ]) await t.test('colar '+nome+': cursor fica no fim da frase',async()=>{
    await reset(par(''),par('seguinte'));await foco(1);
    await cola(plain,html);await espera(80);await digita('!');await espera(80);
    assert.deepEqual(await textos(),['frase colada!','seguinte']);
    await reset(par('antes depois'),par('seguinte'));await foco(7);
    await cola(plain,html);await espera(80);await digita('!');await espera(80);
    assert.deepEqual(await textos(),['antes frase colada!depois','seguinte'],'no meio da frase');
  });

  await t.test('colar texto com quebra final num item de lista não cria item novo',async()=>{
    await reset({type:'bulletList',content:[{type:'listItem',content:[par('')]}]},par('seguinte'));await foco(3);
    await cola('item colado\n');await espera(80);await digita('!');await espera(80);
    assert.equal(await ev("NT.ed.getJSON().content[0].content.length"),1);
    assert.equal(await ev("NT.ed.getJSON().content[0].content[0].content[0].content[0].text"),'item colado!');
  });

  await t.test('colar texto com quebra final no título de um toggle fica no título',async()=>{
    await reset(tg(''),par('seguinte'));await foco(2);
    await cola('titulo colado\n');await espera(80);await digita('!');await espera(80);
    assert.equal(await ev("NT.ed.getJSON().content[0].content[0].content.map(c=>c.text).join('')"),'titulo colado!');
    assert.equal(await ev("NT.ed.state.selection.$from.parent.type.name"),'detailsSummary');
  });

  await t.test('colar imagem (cópia das próprias Notas) deixa a imagem selecionada',async()=>{
    await reset(par('antes'),par(''),par('depois'));await foco(8);
    await cola('',`<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-nt-src="./img/nota-teste.jpg">`);await espera(120);
    const s=await ev("({node:NT.ed.state.selection.node?.type.name||null,tipos:NT.ed.getJSON().content.map(n=>n.type)})");
    assert.equal(s.node,'image',JSON.stringify(s));
    assert.deepEqual(s.tipos.slice(0,2),['paragraph','image']);
  });

  await t.test('imagem enviada (arquivo) fica selecionada ao terminar o envio',async()=>{
    await reset(par('antes'),par('depois'));await foco(3);
    await ev(`ntImgEnvia=async()=> 'nota-teste.jpg';ntImgComprime=async b=>b;0`);
    await ev(`ntInsereImagem(new Blob(['x'],{type:'image/png'}))`);await espera(200);
    const s=await ev("({node:NT.ed.state.selection.node?.type.name||null,tipos:NT.ed.getJSON().content.map(n=>n.type)})");
    assert.equal(s.node,'image',JSON.stringify(s));
  });

  const enter=()=>especial('Enter');
  await t.test('Enter no fim do título de um toggle sem conteúdo cria outro toggle',async()=>{
    await reset(tg('Esteatose'),par('seguinte'));await foco(11);
    await enter();await espera(80);await digita('Colelitíase');await espera(80);
    assert.deepEqual(await resumo(),['details:Esteatose','details:Colelitíase','paragraph:seguinte']);
  });

  await t.test('Enter no título vazio de toggle (sem conteúdo) sai do toggle para parágrafo',async()=>{
    await reset(tg('Esteatose'),par('seguinte'));await foco(11);
    await enter();await espera(80);await enter();await espera(80);await digita('fora');await espera(80);
    assert.deepEqual(await resumo(),['details:Esteatose','paragraph:fora','paragraph:seguinte']);
  });

  await t.test('Enter no título de toggle ABERTO com conteúdo continua indo para dentro do toggle',async()=>{
    await reset(tg('Esteatose',par('achado')),par('seguinte'));await foco(11);
    await enter();await espera(80);await digita('x');await espera(80);
    assert.equal(await ev("NT.ed.state.selection.$from.node(NT.ed.state.selection.$from.depth-1).type.name"),'detailsContent');
  });

  await t.test('Enter em item de lista continua a lista; Enter em item vazio sai dela',async()=>{
    await reset({type:'bulletList',content:[{type:'listItem',content:[par('um')]}]},par('seguinte'));await foco(5);
    await enter();await espera(80);await digita('dois');await espera(80);
    assert.equal(await ev("NT.ed.getJSON().content[0].content.length"),2);
    await enter();await espera(80);await enter();await espera(80);
    assert.deepEqual(await ev("NT.ed.getJSON().content.map(n=>n.type)"),['bulletList','paragraph','paragraph']);
  });

  await t.test('padronizar: achado vira marcador e a conclusão fica dentro dele; só seções com conclusão; idempotente',async()=>{
    const ind=(t,n)=>({type:'paragraph',attrs:{indent:n},content:[{type:'text',text:t}]});
    const blocos=[
      tg('Descrições',tg('Esteatose',par('Fígado com ecogenicidade aumentada.'),ind('Sinais de esteatose.',1),par(''),par('Segundo achado.'))),
      tg('Laudo Padrão',tg('Abdome',par('ULTRASSONOGRAFIA'),ind('Conclusão normal.',1))),
      tg('Outros',par('Texto solto sem conclusão.')),
    ].map((conteudo,i)=>({id:'b'+i,atualizado:'2026-01-01T00:00:00.000Z',conteudo}));
    const r=await ev(`(()=>{const r=ntPadronizaBlocos(${JSON.stringify(blocos)});const s=ntSchema();r.blocos.forEach(b=>s.nodeFromJSON(b.conteudo).check());const r2=ntPadronizaBlocos(r.blocos);return {r,conv2:r2.convertidos}})()`);
    assert.equal(r.r.convertidos,3);assert.equal(r.r.secoes,1);assert.equal(r.conv2,0);
    const det=r.r.blocos[0].conteudo.content[1].content[0];   // toggle Esteatose
    const conteudo=det.content[1].content;
    assert.equal(conteudo.length,1);assert.equal(conteudo[0].type,'bulletList');
    assert.equal(conteudo[0].content.length,2);
    const item=conteudo[0].content[0];
    assert.equal(item.content[0].type,'paragraph');assert.equal(item.content[0].attrs,undefined);
    assert.equal(item.content[1].type,'bulletList');assert.equal(item.content[1].content[0].content[0].content[0].text,'Sinais de esteatose.');
    assert.deepEqual(r.r.blocos[1],blocos[1]);assert.deepEqual(r.r.blocos[2],blocos[2]);
  });

  assert.deepEqual(C.erros,[]);
});
