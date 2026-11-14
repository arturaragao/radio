// Notas 1.56 no Chrome: retângulo de seleção desce para os filhos do toggle (só a linha do título seleciona o toggle inteiro) e teclado dentro de toggle
// (espaço só insere espaço; Shift+Tab tira a linha do toggle). Dados fictícios.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {iniciar}=require('./chrome-util.js');

test('Radio 1.56: Notas (seleção por retângulo nos filhos do toggle; espaço e Shift+Tab dentro de toggle)',{timeout:240000},async t=>{
  const C=await iniciar({porta:8803,env:{BCBR_QS:'10'}});t.after(()=>C.fim());
  const {ev,call,espera,par,tg,reset,arrasta,especial,ate}=C;await C.abre('notas');
  const abre=async()=>{await ev("document.querySelectorAll('.nt-seta').forEach(b=>b.getAttribute('aria-expanded')==='false'&&b.click())");await espera(300)};
  const base=async()=>{await reset(par('antes'),tg('T',par('a'),par('b'),par('c')),par('fora'));await abre()};
  const forma=()=>ev("(()=>{const t=n=>n.text||(n.content||[]).map(t).join('');const r=n=>n.type==='details'?'d('+t(n.content[0])+'|'+n.content[1].content.map(r).join(',')+')':t(n);return NT.ed.getJSON().content.map(r).join(' ; ')})()");
  const linha=x=>ev(`(()=>{const e=[...document.querySelectorAll('.nt-pm p,.nt-pm summary')].find(e=>e.textContent===${JSON.stringify(x)});const r=e.getBoundingClientRect();return {l:r.left,y:r.top+r.height/2}})()`);
  const sel=async()=>JSON.parse(await ev("JSON.stringify(ntBselPos(NT.ed.state).map(p=>NT.ed.state.doc.nodeAt(p).textContent))"));
  const mesmoPai=()=>ev("(()=>{const p=ntBselPos(NT.ed.state);return new Set(p.map(x=>NT.ed.state.doc.resolve(x).parent.type.name+NT.ed.state.doc.resolve(x).start())).size===1})()");
  const arrastaDe=async(de,ate)=>{const x=(await linha(de)).l-36,a=await linha(de),b=await linha(ate);await arrasta([x,a.y],[b.l+60,b.y],5)};   // começa na margem (fora do texto), no nível de cima
  const esp=async()=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,text:' ',unmodifiedText:' '});await call('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32})};
  const cursor=(texto,off)=>ev(`(()=>{let p;NT.ed.state.doc.descendants((n,pos)=>{if(n.isText&&n.text===${JSON.stringify(texto)})p=pos});NT.ed.chain().focus().setTextSelection(p+${off}).run()})()`);

  await t.test('1: arrasto só pelos filhos seleciona os filhos (não o toggle); Delete e Shift+Tab agem neles',async()=>{
    await base();await arrastaDe('b','c');
    assert.deepEqual(await sel(),['b','c']);assert.equal(await mesmoPai(),true);
    await especial('Tab',8);   // Shift+Tab: o grupo sai do toggle
    assert.equal(await forma(),'antes ; d(T|a) ; b ; c ; fora');  });
  await t.test('1b: só uma linha de dentro; apagar remove só ela',async()=>{
    await base();await arrastaDe('b','b');
    const s=await sel();assert.deepEqual(s,['b']);
    await especial('Delete');
    assert.equal(await forma(),'antes ; d(T|a,c) ; fora');
  });
  await t.test('2: arrasto que passa pela linha do título seleciona o toggle inteiro',async()=>{
    await base();await arrastaDe('c','T');
    assert.deepEqual(await sel(),['Tabc']);
    await base();await arrastaDe('c','antes');
    assert.deepEqual(await sel(),['antes','Tabc']);
    await base();await arrastaDe('b','fora');   // 1.57: cruza filhos (b, c) e um bloco de fora, sem a linha do título: células soltas, níveis misturados
    assert.deepEqual(await sel(),['b','c','fora']);
  });
  await t.test('3: espaço numa linha dentro do toggle só insere espaço (início, meio, fim, linha vazia)',async()=>{
    for(const off of [0,1,3]){
      await reset(par('antes'),tg('T',par('a'),par('abc'),par('c')),par('fora'));await abre();
      await cursor('abc',off);await esp();await espera(300);
      assert.equal(await forma(),'antes ; d(T|a,'+'abc'.slice(0,off)+' '+'abc'.slice(off)+',c) ; fora','offset '+off);
      assert.equal(await ev("NT.ed.state.selection.$from.parent.type.name+':'+NT.ed.state.selection.$from.parent.textContent.length"),'paragraph:4');
    }
    await reset(par('antes'),tg('T',par('a'),par('')),par('fora'));await abre();
    await ev("(()=>{let p;NT.ed.state.doc.descendants((n,pos,pai)=>{if(n.type.name==='paragraph'&&!n.content.size&&pai.type.name==='detailsContent')p=pos});NT.ed.chain().focus().setTextSelection(p+1).run()})()");
    await esp();await esp();await espera(300);
    assert.equal(await ev("NT.ed.state.selection.$from.parent.textContent"),'  ');
    assert.equal(await ev("NT.ed.state.selection.$from.node(NT.ed.state.selection.$from.depth-1).type.name"),'detailsContent');
    assert.equal(await forma(),'antes ; d(T|a,  ) ; fora');
  });
  await t.test('4: Shift+Tab numa linha de dentro tira do toggle (irmã logo depois dele)',async()=>{
    await base();await cursor('b',1);await especial('Tab',8);await espera(200);
    assert.equal(await forma(),'antes ; d(T|a,c) ; b ; fora');
    assert.equal(await ev("NT.ed.state.selection.$from.parent.textContent"),'b');
    assert.deepEqual(C.erros,[]);
  });

  // ---- 1.56 (2): imagens ----
  const img=src=>({type:'image',attrs:{src}});
  const poeImagens=async()=>{await ev(`(()=>{const c=document.createElement('canvas');c.width=40;c.height=30;const x=c.getContext('2d');x.fillStyle='#c33';x.fillRect(0,0,40,30);window.__png=c.toDataURL('image/png');BCBR.imgPronta=()=>window.__png})()`)};
  const centro=()=>ev("(()=>{const r=document.querySelector('img.nt-img').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,dx:r.right-10,dy:r.top+10}})()");
  const mouse=(type,x,y,n=1)=>call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',clickCount:n,buttons:type==='mouseReleased'?0:1});
  const clica=async(x,y,n)=>{await mouse('mouseMoved',x,y);for(let k=1;k<=n;k++){await mouse('mousePressed',x,y,k);await mouse('mouseReleased',x,y,k)}await espera(250)};

  await t.test('5: clique simples na imagem não abre a barra nem o visualizador; duplo clique abre a imagem grande; Esc fecha; barra no canto',async()=>{
    await reset(par('antes'),img('./img/a.png'),par('depois'));await poeImagens();await reset(par('antes'),img('./img/a.png'),par('depois'));await espera(300);
    const p=await centro();
    await clica(p.x,p.y,1);
    assert.equal(await ev('NT.ed.state.selection.node?.type.name'),'image','clique seleciona o bloco');
    assert.equal(await ev('NT.bolha.hidden'),true,'sem painel de tamanho no clique simples');
    assert.equal(await ev("document.getElementById('zoom').hidden"),true);
    await clica(p.x,p.y,2);
    assert.equal(await ev("document.getElementById('zoom').hidden"),false,'duplo clique abre o visualizador');
    assert.equal(await ev("document.getElementById('zimg').src===document.querySelector('img.nt-img').src"),true);
    await especial('Escape');await espera(150);
    assert.equal(await ev("document.getElementById('zoom').hidden"),true,'Esc fecha');
    // tamanho/lixeira: só com o mouse no canto da imagem
    await mouse('mouseMoved',p.x-60,p.y);await mouse('mouseMoved',p.dx,p.dy);await espera(150);
    assert.equal(await ev('NT.bolha.hidden'),false,'barra discreta no canto');
    await ev("NT.bolha.querySelector('[data-l=\"50\"]').click()");await espera(150);
    assert.equal(await ev("NT.ed.getJSON().content[1].attrs.largura"),50);
    await ev("NT.bolha.querySelector('[data-l=\"apagar\"]').click()");await espera(150);
    assert.equal(await ev("NT.ed.getJSON().content.some(n=>n.type==='image')"),false,'lixeira apaga');
    assert.equal(await ev('NT.bolha.hidden'),true);
  });

  await t.test('6: copiar blocos com imagens leva text/html com <img> (data URL, em ordem) e text/plain só com o texto; colar nas Notas devolve blocos de imagem',async()=>{
    await ev(`(()=>{window.__cb=null;const W=window.ClipboardItem;window.ClipboardItem=function(m){this.m=m;this.types=Object.keys(m)};navigator.clipboard.write=async it=>{const o={};for(const k of Object.keys(it[0].m)){const v=await it[0].m[k];o[k]=v instanceof Blob?(k==='image/png'?'png:'+v.size:await v.text()):v}window.__cb=o}})()`);
    const copia=async()=>{await ev("window.__cb=null;NT.ed.view.dom.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true}))");await ate('!!window.__cb',8000);return ev('window.__cb')};
    await reset(par('antes'),img('./img/a.png'),tg('T',par('dentro'),img('./img/b.png')),par('fim'));await poeImagens();
    await reset(par('antes'),img('./img/a.png'),tg('T',par('dentro'),img('./img/b.png')),par('fim'));await abre();await espera(400);
    await ev("NT.ed.chain().focus().selectAll().run()");
    let cb=await copia();
    const imgs=[...cb['text/html'].matchAll(/<img\b[^>]*>/g)].map(m=>m[0]);
    assert.equal(imgs.length,2);
    assert.deepEqual(imgs.map(x=>x.match(/data-nt-src="([^"]+)"/)[1]),['./img/a.png','./img/b.png'],'ordem dos blocos');
    assert.ok(imgs.every(x=>/src="data:image\//.test(x)),'src em data URL');
    assert.ok(cb['text/html'].indexOf('antes')<cb['text/html'].indexOf('<img')&&cb['text/html'].indexOf('dentro')<cb['text/html'].lastIndexOf('<img'));
    assert.equal(cb['text/plain'].includes('data:'),false);assert.match(cb['text/plain'],/antes[\s\S]*dentro[\s\S]*fim/);
    assert.equal('image/png' in cb,false,'várias coisas: sem image/png');
    // colar nas próprias Notas: voltam como blocos de imagem
    await reset(par(''));await ev("NT.ed.commands.focus()");
    await ev(`(()=>{const dt=new DataTransfer();dt.setData('text/html',window.__cb['text/html']);dt.setData('text/plain',window.__cb['text/plain']);NT.ed.view.dom.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))})()`);await espera(400);
    assert.deepEqual(await ev("(()=>{const o=[];NT.ed.state.doc.descendants(n=>{if(n.type.name==='image')o.push(n.attrs.src)});return o})()"),['./img/a.png','./img/b.png']);
    // grupo do retângulo: só a imagem de cima
    await reset(par('antes'),img('./img/a.png'),par('fim'));await espera(300);
    await ev("NT.ed.view.dispatch(ntBselMeta(NT.ed.state.tr,[NT.ed.state.doc.firstChild.nodeSize]))");
    cb=await copia();assert.equal([...cb['text/html'].matchAll(/<img\b/g)].length,1);assert.match(cb['image/png'],/^png:\d+$/,'uma imagem sozinha também vai como image/png');
    // sem imagens: o copiar normal segue (nada escrito pela API)
    await reset(par('so texto'));await ev("NT.ed.chain().focus().selectAll().run();window.__cb=null");
    await ev("NT.ed.view.dom.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true}))");await espera(300);
    assert.equal(await ev('window.__cb'),null);
    assert.deepEqual(C.erros,[]);
  });
});
