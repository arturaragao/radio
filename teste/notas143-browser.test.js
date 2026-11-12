// Chrome real, perfil descartável, mesma origem em todas as abas e só dados fictícios.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {iniciar,espera}=require('./chrome-util.js');
test('Notas 1.43 no Chrome',{timeout:600000},async t=>{
  const C=await iniciar({porta:8773,sw:true});t.after(()=>C.fim());
  const {ev,call,ctrl,especial,click,mouse,arrasta,ate,par,tg,reset,confirmado}=C;
  await C.abre('notas');
  const abre=()=>ev("document.querySelectorAll('.nt-seta').forEach(b=>b.getAttribute('aria-expanded')==='false'&&b.click())");
  const doc=()=>ev("JSON.stringify(NT.ed.getJSON().content.map(function r(n){return n.text||[n.type,(n.content||[]).map(r)]}))");
  const texto=()=>ev('NT.ed.state.doc.textContent');
  const pos=txt=>ev(`(()=>{let p;NT.ed.state.doc.descendants((n,o)=>{if(p==null&&n.isText&&n.text===${JSON.stringify(txt)})p=o});if(p==null)throw Error('Texto ausente');return p})()`);
  const cursor=async(txt,off=0)=>ev(`NT.ed.chain().focus().setTextSelection(${await pos(txt)}+${off}).run()`);
  const pausa=()=>espera(550);
  const rect=sel=>ev(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)throw Error('Ausente: '+${JSON.stringify(sel)});const r=el.getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom,x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height}})()`);
  const linha=txt=>ev(`(()=>{const e=[...document.querySelectorAll('.nt-pm p,.nt-pm summary')].find(e=>e.textContent===${JSON.stringify(txt)});const r=e.getBoundingClientRect();return {l:r.left,t:r.top,b:r.bottom,y:r.top+r.height/2}})()`);
  const base=async()=>{await reset(par('antes'),tg('T1',par('aaa'),par('bbb'),par('ccc')),par('fora'));await abre();await pausa();return doc()};
  const no=()=>ev('NT.ed.chain().focus().setNodeSelection(NT.ed.state.doc.firstChild.nodeSize).run()');
  const retangulo=async()=>{const g=await ev("(()=>{const pm=NT.ed.view.dom.getBoundingClientRect(),b=[...NT.ed.view.dom.children].map(e=>e.getBoundingClientRect());return {x:pm.left+10,b:b.map(r=>({l:r.left,t:r.top,b:r.bottom}))}})()");await arrasta([g.x,g.b[2].b+25],[g.b[1].l+60,g.b[1].t+6],5);assert.equal(await ev('ntBselPos(NT.ed.state).length'),2)};
  const desfaz=async antes=>{await ctrl('z');assert.equal(await doc(),antes,'um Ctrl+Z restaura o documento')};

  await t.test('1a: texto dentro do toggle selecionado por nó/retângulo; arrasto para dentro, para fora e entre linhas, com Ctrl+Z',async()=>{
    for(const via of ['nó','retângulo']){
      const antes=await base();if(via==='nó')await no();else await retangulo();
      let r=await linha('bbb');await arrasta([r.l+2,r.y],[r.l+26,r.y],4);
      assert.equal(await ev('NT.ed.state.selection instanceof TT.pm.state.TextSelection'),true,via+': seleção de texto');
      assert.match(await ev('NT.ed.state.doc.textBetween(NT.ed.state.selection.from,NT.ed.state.selection.to)'),/^b+$/);
      for(const [origem,destino] of [['bbb','fora'],['fora','ccc'],['bbb','aaa']]){
        await cursor(origem);await ev(`NT.ed.chain().setTextSelection({from:NT.ed.state.selection.from,to:NT.ed.state.selection.from+${origem.length}}).run()`);
        await pausa();r=await linha(origem);const d=await linha(destino);
        await arrasta([r.l+14,r.y],[d.l+35,d.y],6);
        const linhas=await ev("[...document.querySelectorAll('.nt-pm p')].map(e=>e.textContent)");
        assert.ok(linhas.some(s=>s.includes(origem)&&s.includes(destino)),via+': texto movido '+JSON.stringify(linhas));
        assert.equal(linhas.filter(s=>s.includes(origem)).length,1,'texto não duplicou');
        assert.equal(await ev("document.querySelectorAll('.nt-pm [data-type=details]').length"),1,'toggle preservado');
        await desfaz(antes);
      }
    }
  });

  await t.test('1b: apagar pela alça/nó, retângulo, seleção parcial, Backspace no título e menu; Ctrl+Z restaura',async()=>{
    for(const via of ['nó','alça','retângulo'])for(const k of ['Delete','Backspace']){
      const antes=await base();
      if(via==='nó')await no();else if(via==='retângulo')await retangulo();
      else{await ev('NT.alcaMostra(ntBlocoPos(NT.ed.state.doc,NT.ed.state.doc.firstChild.nodeSize))');await click('.nt-alca')}
      await especial(k);
      assert.equal(await ev("document.querySelectorAll('.nt-pm [data-type=details]').length"),0,via+'+'+k);
      assert.match(await texto(),/antes/);await desfaz(antes);
    }
    let antes=await base();await cursor('fora');await especial('Backspace');
    assert.equal(await ev('NT.ed.state.selection instanceof TT.pm.state.NodeSelection'),true);
    await especial('Backspace');assert.equal(await texto(),'antesfora');await desfaz(antes);
    antes=await base();await cursor('bbb');await ctrl('a');
    assert.equal(await ev('NT.ed.state.selection.to-NT.ed.state.selection.from<NT.ed.state.doc.content.size'),true,'Ctrl+A parcial');
    await especial('Delete');assert.ok(!(await texto()).includes('bbb'));await desfaz(antes);
    antes=await base();await ev('(()=>{const p=NT.ed.state.doc.firstChild.nodeSize,n=NT.ed.state.doc.nodeAt(p);NT.ed.chain().focus().setTextSelection({from:p,to:p+n.nodeSize}).run()})()');
    await especial('Delete');assert.equal(await texto(),'antesfora');await desfaz(antes);
    for(const [titulo,conteudo] of [['',''],['Título',''],['','conteúdo'],['Título','conteúdo']]){
      await reset(par('antes'),tg(titulo,par(conteudo)),par('fora'));await abre();await pausa();antes=await doc();
      await ev('NT.ed.chain().focus().setTextSelection(NT.ed.state.doc.firstChild.nodeSize+2).run()');await especial('Backspace');
      assert.equal(await ev("document.querySelectorAll('.nt-pm [data-type=details]').length"),0,'Backspace no início do título');
      assert.ok((await texto()).includes(titulo+conteudo),'título e conteúdo preservados');await desfaz(antes);
    }
    antes=await base();await ev('NT.alcaMostra(ntBlocoPos(NT.ed.state.doc,NT.ed.state.doc.firstChild.nodeSize))');await click('.nt-alca');await click('.nt-menu-bloco [data-a=apagar]');
    assert.equal(await texto(),'antesfora');await desfaz(antes);
  });

  await t.test('1a blocos: alça move uma linha de dentro para fora, de fora para dentro e entre linhas do toggle; Ctrl+Z',async()=>{
    for(const [origem,destino] of [['bbb','fora'],['fora','ccc'],['aaa','ccc']]){
      const antes=await base(),p=await pos(origem),r=await linha(destino);
      await ev(`(()=>{const dt=new DataTransfer();NT.alcaMostra(ntBlocoEm(NT.ed.state.doc,${p}));const al=NT.alcaEl,pm=NT.ed.view.dom;
        al.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:dt}));
        for(const type of ['dragover','drop'])pm.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:dt,clientX:${r.l+40},clientY:${r.b-1}}));
        al.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:dt}))})()`);
      const dentro=await ev("[...NT.el.querySelectorAll('[data-type=detailsContent] p')].map(e=>e.textContent)");
      assert.equal(dentro.includes(origem),origem==='bbb'&&destino==='fora'?false:true,'linha no nível de destino');
      assert.notEqual(await doc(),antes,'o bloco mudou de posição');assert.equal((await texto()).split(origem).length-1,1,'não duplicou');await desfaz(antes);
    }
  });

  await t.test('2/3: paleta nos dois temas e 375 px; padrão de texto/fundo persistente, amarelo sem escolha; barra e atalhos',async()=>{
    await reset(par('amostra'));await ev("NT.ed.commands.selectAll();localStorage.removeItem(NT_COR_PAD)");
    await ctrl('h',10);assert.equal(await ev("NT.ed.getAttributes('textStyle').backgroundColor"),'var(--ntb-amarelo)');await ctrl('h',10);
    for(const tema of ['light','dark']){
      await ev(`document.documentElement.dataset.theme='${tema}'`);await click('.nt-barra [data-m=cor]');
      const am=await ev("[...document.querySelectorAll('.nt-amo')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {cor:s.color,fundo:s.backgroundColor,w:r.width,h:r.height,nome:e.nextElementSibling.textContent,borda:s.borderTopWidth}})");
      assert.equal(am.length,18);assert.ok(am.every(a=>a.w>=36&&a.h>=30&&a.nome&&a.borda==='2px'));
      assert.equal(new Set(am.slice(0,9).map(a=>a.cor)).size,9,'nove cores reais de texto');assert.equal(new Set(am.slice(9).map(a=>a.fundo)).size,9,'nove cores reais de fundo');
      for(const tipo of ['texto','fundo']){
        await click(`.nt-star[data-padrao="${tipo}:azul"]`);
        assert.equal(await ev(`document.querySelector('.nt-star[data-padrao="${tipo}:azul"]').getAttribute('aria-pressed')`),'true');
        await especial('Escape');await ctrl('h',10);
        assert.equal(await ev(`NT.ed.getAttributes('textStyle').${tipo==='texto'?'color':'backgroundColor'}`),`var(--nt${tipo==='texto'?'c':'b'}-azul)`);
        await ctrl('h',10);await click('.nt-barra [data-m=cor]');
      }
      await especial('Escape');
    }
    await ev('NT.sujo=true;ntSalvaDoc()');assert.ok(await confirmado());
    await C.abre('notas');assert.deepEqual(await ev('ntCorPadrao()'),{tipo:'fundo',cor:'azul'},'padrão sobrevive recarga');
    assert.deepEqual(await ev("[...NT.barra.querySelectorAll('.nt-barra-l button')].map(e=>e.dataset.m)"),['bold','italic','underline','strike','cor','frase','frases','hist','atalhos']);
    await reset(par('titulo'));await ctrl('2',3);assert.equal(await ev('NT.ed.state.doc.firstChild.type.name'),'heading');
    await ctrl('/');assert.match(await ev("document.querySelector('#nt_atalhos').textContent"),/Ctrl\+K/);await especial('Escape');
    await call('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:false});
    for(const tema of ['light','dark']){await ev(`document.documentElement.dataset.theme='${tema}'`);await click('.nt-barra [data-m=cor]');const r=await rect('.nt-paleta');assert.ok(r.l>=0&&r.r<=375&&r.b<=812,'paleta cabe a 375 px');await especial('Escape')}
    await call('Emulation.setDeviceMetricsOverride',{width:1000,height:900,deviceScaleFactor:1,mobile:false});
  });

  await t.test('4/5: hover temporário sem deslocar editor, clique fixa, tolerância, resize/limites/reset; sem Recentes',async()=>{
    await ev("localStorage.setItem(NT_LAT,'0');go('notas')");await ate('NT.el.isConnected');
    await mouse('mouseMoved',900,800);const ant=await rect('.nt-conteudo'),bt=await rect('#nt_lat_bt');
    await mouse('mouseMoved',bt.x,bt.y);assert.equal(await ev("document.querySelector('.nt-corpo').classList.contains('lat-hover')"),true);
    assert.equal((await rect('.nt-conteudo')).l,ant.l,'hover não desloca conteúdo');
    const lat=await rect('#nt_lat');await mouse('mouseMoved',lat.x,lat.y);await espera(400);
    assert.equal(await ev("getComputedStyle(document.querySelector('#nt_lat')).display!=='none'"),true);
    await mouse('mouseMoved',900,800);await espera(100);assert.equal(await ev("document.querySelector('.nt-corpo').classList.contains('lat-hover')"),true,'tolerância');
    await espera(300);assert.equal(await ev("getComputedStyle(document.querySelector('#nt_lat')).display"),'none');
    await click('#nt_lat_bt');await mouse('mouseMoved',900,800);await espera(400);
    assert.equal(await ev('ntLateralAberta()'),true);assert.ok((await rect('.nt-conteudo')).l>ant.l);
    for(const [delta,w] of [[100,330],[500,480],[-600,180]]){const r=await rect('#nt_lat_rz');await arrasta([r.x,r.y],[r.x+delta,r.y]);assert.equal(await ev('ntLatW()'),w);assert.ok(Math.abs((await rect('#nt_lat')).w-w)<2)}
    await C.abre('notas');assert.equal(await ev('ntLatW()'),180);
    let r=await rect('#nt_lat_rz');for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,x:r.x,y:r.y,button:'left',clickCount:2});assert.equal(await ev('ntLatW()'),230);
    await click('#nt_lat_bt');assert.equal(await ev('ntLateralAberta()'),false);
    assert.equal(await ev("typeof ntRecentes+typeof ntRecentePoe+typeof NT_REC"),'undefinedundefinedundefined');
    assert.ok(!(await ev("document.querySelector('#nt_lat').textContent")).includes('Recentes'));
    await call('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});
    await call('Emulation.setTouchEmulationEnabled',{enabled:true});await ev("go('notas')");await ate('NT.el.isConnected');
    const tap=async()=>{const r=await rect('#nt_lat_bt');await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x,y:r.y}]});await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await espera(150)};
    assert.equal(await ev('ntLateralAberta()'),false);await tap();assert.equal(await ev('ntLateralAberta()'),true,'toque abre');
    await ev('ntLateralAlterna()');assert.equal(await ev('ntLateralAberta()'),false);
    await call('Emulation.setTouchEmulationEnabled',{enabled:false});await call('Emulation.setDeviceMetricsOverride',{width:1000,height:900,deviceScaleFactor:1,mobile:false});
  });


  assert.deepEqual(C.erros,[],'sem exceções no JavaScript');
});
