// Notas 1.59: cliques reais no Chrome, clipboard rico e dados inteiramente fictícios.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {iniciar}=require('./chrome-util.js');

test('Radio 1.59: imagem sem barra e menu da seleção preservada',{timeout:120000},async t=>{
  const C=await iniciar({porta:8806,env:{BCBR_QS:'10'}});t.after(()=>C.fim());
  const {ev,call,reset,par,arrasta,espera,especial,ate,click,ctrl}=C;await C.abre('notas');
  const ponto=sel=>ev(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:r.left+12,y:r.top+r.height/2}})()`);
  const direito=async(p,modifiers=0,button='right')=>{
    await call('Input.dispatchMouseEvent',{type:'mousePressed',...p,button,buttons:button==='right'?2:1,clickCount:1,modifiers});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button,buttons:0,clickCount:1,modifiers});await espera(100);
  };
  const grupo=()=>ev('ntBselPos(NT.ed.state)');
  const semBarra=async()=>assert.equal(await ev("document.querySelectorAll('.nt-bolha,.nt-bolha-img,[data-l=\"25\"]').length"),0);
  await ev(`(()=>{const c=document.createElement('canvas');c.width=80;c.height=40;c.getContext('2d').fillRect(0,0,80,40);window.__png=c.toDataURL();BCBR.imgPronta=()=>window.__png})()`);
  const img={type:'image',attrs:{src:'./img/ficticia.png'}};

  await t.test('hover, clique e toque na imagem nunca criam barra',async()=>{
    await reset(par('antes fictício'),img,par('depois fictício'));await ate("document.querySelector('img.nt-img')?.naturalWidth>0");
    const p=await ponto('img.nt-img');
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await click('img.nt-img');
    assert.equal(await ev('NT.ed.state.selection.node?.type.name'),'image');await semBarra();
    const canto=await ev("(()=>{const r=document.querySelector('img.nt-img').getBoundingClientRect();return {x:r.right-5,y:r.top+5}})()");
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',...canto});await espera(100);await semBarra();
    await call('Emulation.setEmulatedMedia',{features:[{name:'pointer',value:'coarse'}]});
    await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
    await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await espera(100);await semBarra();
    await especial('Backspace');assert.equal(await ev("NT.ed.getJSON().content.some(n=>n.type==='image')"),false);
  });
  await t.test('texto nativo sobrevive ao clique direito dentro e fora da seleção',async()=>{
    await reset(par('Texto fictício selecionado'),par('Outra linha fictícia'));
    await ev('NT.ed.chain().focus().setTextSelection({from:1,to:14}).run()');
    const antes=await ev('({texto:getSelection().toString(),from:NT.ed.state.selection.from,to:NT.ed.state.selection.to})');
    assert.ok(antes.texto.length>0);
    for(const sel of ['.nt-pm p:first-child','.nt-pm p:last-child']){
      await direito(await ponto(sel));
      assert.deepEqual(await ev('({texto:getSelection().toString(),from:NT.ed.state.selection.from,to:NT.ed.state.selection.to})'),antes);
      assert.equal(await ev("!!document.querySelector('#nt_sel_menu')"),false);assert.equal(await ev('NTR'),null);
    }
    // Simula a plataforma Mac e o Ctrl+clique com movimento: nenhum retângulo começa.
    await ev("Object.defineProperty(navigator,'platform',{configurable:true,value:'MacIntel'})");
    await direito(await ponto('.nt-pm p:last-child'),2,'left');
    assert.equal(await ev('getSelection().toString()'),antes.texto);assert.equal(await ev('NTR'),null);
  });
  await call('Browser.grantPermissions',{origin:C.URL_,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
  // Escreve e relê o clipboard real do Chrome; registra a conclusão para esperar a operação assíncrona.
  await ev(`(()=>{window.__cb=null;const escreve=navigator.clipboard.write.bind(navigator.clipboard);navigator.clipboard.write=async it=>{await escreve(it);const o={};for(const item of await navigator.clipboard.read())for(const k of item.types){const v=await item.getType(k);o[k]=k==='image/png'?'png:'+v.size:await v.text()}window.__cb=o}})()`);
  for(const imagens of [false,true])await t.test('retângulo: Copiar = Ctrl+C; Esc, fora e Recortar; imagens='+imagens,async()=>{
    await reset(par('Primeira fictícia'),...(imagens?[img]:[]),par('Segunda fictícia'),par('Preservada'));
    if(imagens)await ate("document.querySelector('img.nt-img')?.naturalWidth>0");
    const a=await ponto('.nt-pm p:first-child'),b=await ponto('.nt-pm p:nth-last-child(2)');
    await arrasta([a.x-48,a.y],[b.x+60,b.y],6);
    const antes=await grupo();assert.equal(antes.length,imagens?3:2);
    // Na margem, Ctrl+clique no Mac e movimento com o botão direito também preservam o grupo.
    const margem={x:a.x-48,y:a.y};
    await direito(margem,2,'left');assert.deepEqual(await grupo(),antes);assert.equal(await ev('NTR'),null);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',...margem,button:'right',buttons:2,clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:margem.x+10,y:b.y,button:'right',buttons:2});
    assert.equal(await ev('NTR'),null);assert.deepEqual(await grupo(),antes);
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:margem.x+10,y:b.y,button:'right',buttons:0,clickCount:1});
    if(await ev("!!document.querySelector('#nt_sel_menu')"))await especial('Escape');
    await ev('window.__cb=null');await ctrl('c');await ate('!!window.__cb');const cb=await ev('window.__cb');
    assert.match(cb['text/plain'],/Primeira fictícia[\s\S]*Segunda fictícia/);
    if(imagens)assert.match(cb['text/html'],/<img[^>]*src="data:image\//);
    await direito(b);assert.deepEqual(await grupo(),antes);assert.equal(await ev('NTR'),null);
    assert.deepEqual(await ev("[...document.querySelectorAll('#nt_sel_menu button')].map(b=>b.textContent)"),['Copiar','Recortar']);
    await especial('Escape');assert.equal(await ev("!!document.querySelector('#nt_sel_menu')"),false);assert.deepEqual(await grupo(),antes);
    await direito(b);await click('#nt_titulo');assert.equal(await ev("!!document.querySelector('#nt_sel_menu')"),false);assert.deepEqual(await grupo(),antes);
    await direito(b);await ev('window.__cb=null');await click('#nt_sel_menu [data-copia]');await ate('!!window.__cb');
    assert.deepEqual(await ev('window.__cb'),cb);assert.deepEqual(await grupo(),antes);
    await direito(b);await ev('window.__cb=null');await click('#nt_sel_menu [data-corta]');await ate('!!window.__cb');
    assert.deepEqual(await ev('window.__cb'),cb);assert.deepEqual(await grupo(),[]);
    assert.equal(await ev('NT.ed.state.doc.textContent'),'Preservada');
  });
  assert.deepEqual(C.erros,[]);
});
