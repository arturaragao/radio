// Aba Notas 1.39 (página única, Tiptap) no Chrome headless: digitação, atalhos, menu "/", imagem, migração e recarga.
// Só usa o servidor local com dados fictícios (--simulado + BCBR_MEM=1: PUT guardado em memória do servidor, nada vai ao GitHub).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const espera=ms=>new Promise(r=>setTimeout(r,ms));
const PORTA=8767,URL_=`http://127.0.0.1:${PORTA}/`;
test('Notas 1.39: página única estilo Notion no Chrome', {timeout:180000},async t=>{
  const chrome=process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  assert.ok(fs.existsSync(chrome),'Chrome disponível');
  const raiz=path.resolve(__dirname,'..'),perfil=fs.mkdtempSync(path.join(os.tmpdir(),'bcbr-notas-'));
  const servidor=spawn(process.execPath,['teste/servidor.js','--simulado',String(PORTA)],{cwd:raiz,windowsHide:true,stdio:'pipe',env:{...process.env,BCBR_MEM:'1'}});
  const proc=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${perfil}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let ws; t.after(async()=>{ws?.close();proc.kill();servidor.kill();await espera(500);fs.rmSync(perfil,{recursive:true,force:true,maxRetries:5,retryDelay:200})});
  const portaArquivo=path.join(perfil,'DevToolsActivePort');
  for(let i=0;i<120&&!fs.existsSync(portaArquivo);i++)await espera(100);
  assert.ok(fs.existsSync(portaArquivo),'Chrome iniciou o protocolo de depuração');
  const porta=fs.readFileSync(portaArquivo,'utf8').split('\n')[0];
  const alvo=await(await fetch(`http://127.0.0.1:${porta}/json/new?about:blank`,{method:'PUT'})).json();
  ws=new WebSocket(alvo.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
  let seq=0;const pendentes=new Map(),erros=[],consoleErros=[];
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pendentes.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
  const local=u=>u.startsWith(`http://127.0.0.1:${PORTA}/`);
  ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id){const p=pendentes.get(r.id);pendentes.delete(r.id);if(p)r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result)}
    if(r.method==='Runtime.exceptionThrown')erros.push(r.params.exceptionDetails.exception?.description||r.params.exceptionDetails.text);
    if(r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')consoleErros.push(r.params.args.map(x=>x.value||x.description).join(' '));
    if(r.method==='Fetch.requestPaused'){const p=r.params;call(local(p.request.url)?'Fetch.continueRequest':'Fetch.failRequest',{requestId:p.requestId,...(local(p.request.url)?{}:{errorReason:'BlockedByClient'})}).catch(()=>{})}
  };
  const ev=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
  await call('Page.enable');await call('Runtime.enable');await call('Fetch.enable',{patterns:[{urlPattern:'*'}]});
  await call('Emulation.setDeviceMetricsOverride',{width:1000,height:900,deviceScaleFactor:1,mobile:false});
  for(let i=0;i<50;i++){try{if((await fetch(URL_)).ok)break}catch{}await espera(100)}
  const abre=async()=>{
    await call('Page.navigate',{url:URL_});
    for(let i=0;i<100;i++){if(await ev("typeof SM!=='undefined'&&SM.ok&&typeof TABS!=='undefined'&&!!document.querySelector('.sm')").catch(()=>false))break;await espera(100)}
    await ev("go('notas')");
    for(let i=0;i<100;i++){if(await ev("typeof NT!=='undefined'&&!!NT.ed&&!!document.querySelector('.nt-pm')").catch(()=>false))break;await espera(100)}
    await espera(700);await ev("SM.fila.then(()=>1)");   // deixa a carga/sincronização inicial terminar (ela redesenha a aba)
  };
  await abre();
  // ---- auxiliares ----
  const tecla=async(key,extra={})=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key,...extra});await call('Input.dispatchKeyEvent',{type:'keyUp',key,...extra})};
  const digita=async txt=>{for(const ch of txt){await call('Input.dispatchKeyEvent',{type:'keyDown',key:ch,text:ch,unmodifiedText:ch});await call('Input.dispatchKeyEvent',{type:'keyUp',key:ch})}};
  const enter=()=>tecla('Enter',{code:'Enter',windowsVirtualKeyCode:13}),tab=(shift=false)=>tecla('Tab',{code:'Tab',windowsVirtualKeyCode:9,modifiers:shift?8:0});
  const ctrl=(letra,shift=false)=>tecla(letra,{code:'Key'+letra.toUpperCase(),windowsVirtualKeyCode:letra.toUpperCase().charCodeAt(0),modifiers:2|(shift?8:0)});
  const par=t=>({type:'paragraph',...(t?{content:[{type:'text',text:t}]}:{})});
  const tg=(titulo,...filhos)=>({type:'details',content:[{type:'detailsSummary',...(titulo?{content:[{type:'text',text:titulo}]}:{})},{type:'detailsContent',content:filhos.length?filhos:[par('')]}]});
  const reset=async(...blocos)=>{await ev(`NT.ed.commands.setContent({type:'doc',content:${JSON.stringify(blocos)}},{emitUpdate:false});NT.ed.commands.focus();0`)};
  const irFim=async texto=>{await ev(`(()=>{let p=null;NT.ed.state.doc.descendants((n,pos)=>{if(n.isText&&n.text===${JSON.stringify(texto)})p=pos+n.nodeSize});if(p==null)throw Error('texto ausente: '+${JSON.stringify(texto)});NT.ed.chain().focus().setTextSelection(p).run();return p})()`)};
  const json=()=>ev('NT.ed.getJSON()');
  const topo=async()=>(await json()).content;
  const tipos=async()=>(await topo()).map(n=>n.type);
  const click=async s=>{const p=await ev(`(()=>{const el=document.querySelector(${JSON.stringify(s)});if(!el)throw Error('Ausente: '+${JSON.stringify(s)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p})};
  const confirmado=async()=>{for(let i=0;i<80;i++){if(await ev("!ntTemPendentes()&&!NT.sync&&!NT.sujo"))return true;await espera(100)}return false};
  const resumo=n=>n.content?.map(c=>c.text||resumo(c)).join('|')||'';

  await t.test('página única: sem cartões, sem painel flutuante, tecla Tab não troca de aba',async()=>{
    assert.equal(await ev("tela"),'notas');
    assert.equal(await ev("document.querySelectorAll('.nt-nota,.nt-caixa,#nt_painel,textarea').length"),0);
    assert.equal(await ev("!!document.querySelector('.nt .nt-ed .nt-pm[contenteditable=\"true\"]')"),true);
    await reset(par('x'));await irFim('x');await tab();assert.equal(await ev('tela'),'notas','Tab fica no editor');
  });

  await t.test('"> " cria toggle; ▶ abre e fecha sem mudar o documento; estado vai para o aparelho',async()=>{
    await reset(par(''));await digita('> ');
    assert.equal(await ev("document.querySelectorAll('.nt-pm [data-type=\"details\"]').length"),1,'toggle criado');
    await digita('CRANIO');
    assert.equal(await ev("document.querySelector('.nt-pm summary').textContent"),'CRANIO','cursor foi para o título');
    assert.equal(await ev("document.querySelector('[data-type=\"details\"]').classList.contains('is-open')"),true,'novo toggle nasce aberto');
    const antes=JSON.stringify(await json());
    assert.notEqual(await ev("getComputedStyle(document.querySelector('.nt-seta')).transform"),'none','aberto: seta gira (▼)');
    await click('.nt-seta');await espera(250);
    assert.equal(await ev("getComputedStyle(document.querySelector('[data-type=\"detailsContent\"]')).display"),'none','fechou');
    assert.equal(await ev("getComputedStyle(document.querySelector('.nt-seta')).transform"),'none','fechado: seta ▶');
    await click('.nt-seta');
    assert.notEqual(await ev("getComputedStyle(document.querySelector('[data-type=\"detailsContent\"]')).display"),'none','abriu');
    assert.equal(JSON.stringify(await json()),antes,'abrir/fechar não mexe no documento');
    assert.doesNotMatch(antes,/"open"/);
    const id=await ev("document.querySelector('[data-type=\"details\"]').dataset.id");
    assert.ok(id);assert.equal(await ev(`ntAberto(${JSON.stringify(id)})`),true);
    await click('.nt-seta');assert.equal(await ev(`ntAberto(${JSON.stringify(id)})`),false,'fechado fica lembrado no aparelho');
  });

  await t.test('botão + / Alt+A: novo toggle no topo, com o cursor no título',async()=>{
    await reset(tg('Existente',par('x')));await ev("ntAbre()");
    const c=await topo();assert.equal(c[0].type,'details');assert.equal(resumo(c[0].content[0]),'','novo toggle vazio no topo');assert.equal(resumo(c[1].content[0]),'Existente');
    assert.equal(await ev("NT.ed.state.selection.$from.parent.type.name"),'detailsSummary','cursor no título');
    await digita('Novo');assert.equal(await ev("document.querySelector('.nt-pm summary').textContent"),'Novo');
  });

  await t.test('Tab / Shift+Tab aninham em toggles e em listas',async()=>{
    await reset(tg('A',par('a1')),tg('B',par('b1')),par('fim'));
    await ev("document.querySelectorAll('.nt-seta').forEach(b=>b.getAttribute('aria-expanded')==='false'&&b.click())");
    await irFim('B');await tab();
    let c=await topo();assert.deepEqual(c.map(n=>n.type),['details','paragraph'],'B entrou em A');
    assert.match(resumo(c[0]),/A\|.*a1.*B.*b1/,'B é o último filho de A: '+resumo(c[0]));
    assert.equal(await ev("document.querySelectorAll('.nt-pm [data-type=\"details\"] [data-type=\"details\"]').length"),1,'toggle aninhado no DOM');
    await tab(true);
    c=await topo();assert.deepEqual(c.map(n=>n.type),['details','details','paragraph'],'Shift+Tab devolve B ao topo');
    // lista
    await reset({type:'bulletList',content:[{type:'listItem',content:[par('um')]},{type:'listItem',content:[par('dois')]}]});
    await irFim('dois');await tab();
    assert.equal(await ev("document.querySelectorAll('.nt-pm ul ul').length"),1,'item aninhado na lista');
    await tab(true);assert.equal(await ev("document.querySelectorAll('.nt-pm ul ul').length"),0);
  });

  await t.test('Ctrl+B / Ctrl+I / Ctrl+U / Ctrl+Shift+S e Ctrl+Shift+H (última cor, padrão fundo amarelo)',async()=>{
    await reset(par('marcas'));await ev("NT.ed.commands.selectAll()");
    const marcas=async()=>((await topo())[0].content[0].marks||[]).map(m=>m.type+(m.attrs?.backgroundColor?':'+m.attrs.backgroundColor:'')+(m.attrs?.color?':'+m.attrs.color:'')).sort();
    await ctrl('b');await ctrl('i');await ctrl('u');await ctrl('s',true);
    assert.deepEqual(await marcas(),['bold','italic','strike','underline']);
    await espera(150);assert.equal(await ev("!document.querySelector('.nt-bolha').hidden"),true,'barrinha aparece ao selecionar');
    await ev("localStorage.removeItem('bcbr_nt_cor')");
    await reset(par('cor'));await ev("NT.ed.commands.selectAll()");
    await ctrl('h',true);assert.ok((await marcas()).some(m=>/textStyle:var\(--ntb-amarelo\)/.test(m)),'padrão: fundo amarelo '+await marcas());
    await ev("ntAplicaCor(NT.ed,'texto','azul')");
    await reset(par('outra'));await ev("NT.ed.commands.selectAll()");await ctrl('h',true);
    assert.ok((await marcas()).some(m=>/var\(--ntc-azul\)/.test(m)),'aplica a última cor usada: '+await marcas());
    // pela barrinha: paleta
    await ev("NT.bolha.querySelector('[data-m=\"cor\"]').click()");
    assert.equal(await ev("!NT.bolha.querySelector('.nt-paleta').hidden&&NT.bolha.querySelectorAll('.nt-sw').length"),18,'9 cores de texto + 9 de fundo');
  });

  await t.test('menu "/": filtra, setas + Enter, Esc fecha; Título, Checklist, Toggle, Destaque, Divisória',async()=>{
    await reset(par(''));await digita('/tit');
    assert.equal(await ev("document.querySelectorAll('.nt-slash-it').length"),3,'filtrou: 3 títulos');
    await tecla('ArrowDown',{code:'ArrowDown',windowsVirtualKeyCode:40});await enter();
    let n=(await topo())[0];assert.equal(n.type,'heading');assert.equal(n.attrs.level,2,'seta para baixo escolheu o Título 2');
    assert.equal(await ev("!document.querySelector('.nt-slash')"),true,'menu fecha ao escolher');
    await reset(par(''));await digita('/titulo');await enter();
    n=(await topo())[0];assert.equal(n.type,'heading');assert.equal(n.attrs.level,1);
    await reset(par(''));await digita('/check');await enter();assert.equal((await tipos())[0],'taskList');
    await reset(par(''));await digita('/toggle');await enter();assert.equal((await tipos())[0],'details');
    await reset(par(''));await digita('/destaque');await enter();assert.equal((await tipos())[0],'callout');
    await reset(par(''));await digita('/divis');await enter();assert.equal((await tipos())[0],'horizontalRule');
    await reset(par(''));await digita('/lista');await enter();assert.equal((await tipos())[0],'bulletList');
    await reset(par(''));await digita('/numer');await enter();assert.equal((await tipos())[0],'orderedList');
    await reset(par(''));await digita('/cita');await enter();assert.equal((await tipos())[0],'blockquote');
    await reset({type:'heading',attrs:{level:1},content:[{type:'text',text:'t'}]});await ev("NT.ed.chain().focus('end').run()");
    await reset(par(''));await digita('/xyz');assert.equal(await ev("!!document.querySelector('.nt-slash-vazio')"),true,'sem resultado');
    await tecla('Escape',{code:'Escape',windowsVirtualKeyCode:27});assert.equal(await ev("!document.querySelector('.nt-slash')"),true,'Esc fecha');
    assert.equal(await ev("NT.ed.getText()"),'/xyz','Esc mantém o texto digitado');
    await reset(par('x'));await irFim('x');await digita(' /');assert.equal(await ev("!!document.querySelector('.nt-slash')"),true,'também depois de um espaço');
    await tecla('Escape',{code:'Escape',windowsVirtualKeyCode:27});
  });

  await t.test('atalhos markdown: # ## ### - 1. [] --- **x** *x* e "> " (toggle, não citação)',async()=>{
    const casos=[['# ','heading',1],['## ','heading',2],['### ','heading',3],['- ','bulletList'],['1. ','orderedList'],['[] ','taskList'],['> ','details']];
    for(const [entrada,tipo,nivel] of casos){
      await reset(par(''));await digita(entrada+'x');const n=(await topo())[0];
      assert.equal(n.type,tipo,`"${entrada}" vira ${tipo}`);if(nivel)assert.equal(n.attrs.level,nivel);
    }
    assert.ok(!(await tipos()).includes('blockquote'),'"> " nunca vira citação');
    await reset(par(''));await digita('---');assert.equal((await tipos())[0],'horizontalRule');
    await reset(par(''));await digita('**forte** ');assert.ok((await topo())[0].content[0].marks.some(m=>m.type==='bold'),'**x** negrito');
    await reset(par(''));await digita('*ital* ');assert.ok((await topo())[0].content[0].marks.some(m=>m.type==='italic'),'*x* itálico');
  });

  await t.test('Ctrl+Z desfaz e Ctrl+Y refaz',async()=>{
    await reset(par(''));await ev("NT.ed.chain().focus().run()");await digita('um dois');
    assert.equal(await ev("NT.ed.getText()"),'um dois');
    await ctrl('z');assert.notEqual(await ev("NT.ed.getText()"),'um dois');
    await ctrl('y');assert.equal(await ev("NT.ed.getText()"),'um dois');
  });

  await t.test('alça ⋮⋮, menu do bloco (toque) e Abrir todos / Fechar todos',async()=>{
    await reset(tg('Um',par('u1')),tg('Dois',par('d1')),par('fim'));
    await ev("document.querySelectorAll('.nt-seta').forEach(b=>b.getAttribute('aria-expanded')==='true'&&b.click());ntRotuloTodos()");
    assert.equal(await ev("document.getElementById('nt_todos').textContent"),'Abrir todos');
    await click('#nt_todos');
    assert.equal(await ev("[...document.querySelectorAll('[data-type=\"details\"]')].every(d=>d.classList.contains('is-open'))"),true);
    assert.equal(await ev("document.getElementById('nt_todos').textContent"),'Fechar todos');
    await click('#nt_todos');
    assert.equal(await ev("[...document.querySelectorAll('[data-type=\"details\"]')].some(d=>d.classList.contains('is-open'))"),false);
    // mouse sobre o segundo toggle mostra a alça; clicar abre o menu; Subir troca a ordem
    const p=await ev("(()=>{const r=document.querySelectorAll('.nt-pm [data-type=\"details\"] summary')[1].getBoundingClientRect();return {x:r.x+20,y:r.y+r.height/2}})()");
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await espera(100);
    assert.equal(await ev("!document.querySelector('.nt-alca').hidden"),true,'alça aparece ao passar o mouse');
    await click('.nt-alca');assert.equal(await ev("!document.querySelector('.nt-menu-bloco').hidden"),true,'menu da alça');
    await click('.nt-menu-bloco [data-a="subir"]');
    assert.deepEqual((await topo()).slice(0,2).map(n=>n.content[0].content[0].text),['Dois','Um'],'Subir reordena');
    // arrastar de verdade (eventos de arrasto HTML5)
    await ev(`(()=>{const dt=new DataTransfer(),al=document.querySelector('.nt-alca'),ss=[...document.querySelectorAll('.nt-pm summary')];
      const a=ss[0].getBoundingClientRect(),d=ss[1].getBoundingClientRect(),fim=document.querySelector('.nt-pm > p:last-child').getBoundingClientRect();
      NT.alcaMostra(ntBlocoEm(NT.ed.state.doc,NT.ed.state.doc.firstChild.nodeSize*0+3));
      al.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:dt}));
      const alvo=document.querySelector('.nt-pm');
      alvo.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:fim.x+40,clientY:fim.y+fim.height-2}));
      alvo.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:fim.x+40,clientY:fim.y+fim.height-2}));
      al.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:dt}));return 1})()`);
    assert.deepEqual((await topo()).map(n=>n.type==='details'?n.content[0].content[0].text:n.type),['Um','paragraph','Dois','paragraph'],'arrastar a alça do 1º bloco até o fim move o toggle (e nada se perde)');
  });

  await t.test('colar imagem insere o nó no cursor (com marcador), persiste e aparece depois de recarregar',async()=>{
    await reset(par('antes'),par(''),par('depois'));await ev("NT.ed.commands.focus()");
    await ev(`(()=>{let p=null;NT.ed.state.doc.forEach((n,o,i)=>{if(i===1)p=o+1});NT.ed.commands.setTextSelection(p)})()`);
    // Excel/Word: imagem + texto => cola só o texto
    await ev(`(async()=>{const c=document.createElement('canvas');c.width=40;c.height=30;const png=await new Promise(ok=>c.toBlob(ok,'image/png'));const dt=new DataTransfer();dt.items.add(new File([png],'p.png',{type:'image/png'}));dt.setData('text/plain','celula A1');
      document.querySelector('.nt-pm').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))})()`);
    await espera(200);assert.equal(await ev("NT.ed.getText().includes('celula A1')&&document.querySelectorAll('.nt-img').length"),0,'texto colado, imagem não');
    await reset(par('antes'),par(''),par('depois'));
    await ev(`(()=>{let p=null;NT.ed.state.doc.forEach((n,o,i)=>{if(i===1)p=o+1});NT.ed.commands.setTextSelection(p)})()`);
    // imagem grande: marcador "Enviando…" enquanto sobe (envio lento) e nó no lugar do cursor
    await ev(`window.__api=BCBR.api;BCBR.api=(p,o)=>new Promise(r=>setTimeout(()=>r(window.__api(p,o)),700))`);
    await ev(`(async()=>{const c=document.createElement('canvas');c.width=3200;c.height=2000;const x=c.getContext('2d');x.fillStyle='#c33';x.fillRect(0,0,3200,2000);const png=await new Promise(ok=>c.toBlob(ok,'image/png'));
      const dt=new DataTransfer();dt.items.add(new File([png],'p.png',{type:'image/png'}));
      document.querySelector('.nt-pm').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))})()`);
    await espera(200);assert.equal(await ev("!!document.querySelector('.nt-img-ph')"),true,'marcador enquanto envia');
    for(let i=0;i<60&&!await ev("!!document.querySelector('img.nt-img')");i++)await espera(100);
    await ev("BCBR.api=window.__api");
    assert.equal(await ev("!document.querySelector('.nt-img-ph')"),true,'marcador some');
    const t1=await topo();assert.deepEqual(t1.map(n=>n.type).slice(0,3),['paragraph','image','paragraph'],'imagem no lugar do cursor (parágrafo vazio substituído)');
    assert.equal(resumo(t1[0]),'antes');assert.equal(resumo(t1[2]),'depois');
    assert.match(t1[1].attrs.src,/^\.\/img\/nota-x\w+\.jpg$/);
    assert.equal(await ev("NT.ed.getText().includes('[img:')"),false,'nada de [img:] em texto');
    // largura ajustável pela barra da imagem
    await ev(`(()=>{let p=null;NT.ed.state.doc.forEach((n,o)=>{if(n.type.name==='image')p=o});NT.ed.chain().focus().setNodeSelection(p).run()})()`);
    await espera(100);assert.equal(await ev("!NT.bolha.hidden&&!NT.bolha.querySelector('.nt-bolha-img').hidden"),true,'barra da imagem');
    await ev("NT.bolha.querySelector('[data-l=\"50\"]').click()");assert.equal((await topo())[1].attrs.largura,50);
    assert.equal(await ev("document.querySelector('img.nt-img').style.width"),'50%');
    // abre um toggle para provar que o estado também volta
    await ev("NT.ed.commands.insertContentAt(0,{type:'details',content:[{type:'detailsSummary',content:[{type:'text',text:'Persistente'}]},{type:'detailsContent',content:[{type:'paragraph'}]}]})");
    assert.ok(await confirmado(),'salvou no (servidor de teste)');
    const idTg=await ev("document.querySelector('[data-type=\"details\"]').dataset.id");
    // recarrega de verdade, sem o cache local da imagem: ela vem do repositório (servidor de teste)
    await ev("caches.delete('bcbr-img')");
    await abre();
    const t2=await topo();
    assert.deepEqual(t2.map(n=>n.type).slice(0,4),['details','paragraph','image','paragraph'],'mesma ordem depois de recarregar: '+t2.map(n=>n.type));
    for(let i=0;i<60&&!await ev("(document.querySelector('img.nt-img')||{}).naturalWidth>0");i++)await espera(100);
    assert.equal(await ev("(()=>{const i=document.querySelector('img.nt-img');return i.complete&&i.naturalWidth>0&&i.naturalWidth<=1600})()"),true,'imagem carregou depois de recarregar');
    assert.equal(await ev(`document.querySelector('[data-type="details"]').dataset.id===${JSON.stringify(idTg)}&&document.querySelector('[data-type="details"]').classList.contains('is-open')`),true,'toggle continua aberto');
    assert.equal(await ev("ntBlocos(NT.ed.getJSON(),SM.d.notasDoc.blocos).every((b,i)=>b.id===SM.d.notasDoc.blocos[i].id&&b.atualizado===SM.d.notasDoc.blocos[i].atualizado)"),true,'ids e datas estáveis');
    // imagem é selecionável e apagável pelo teclado
    await click('img.nt-img');assert.equal(await ev("NT.ed.state.selection.node?.type.name"),'image','clique seleciona a imagem');
    await tecla('Backspace',{code:'Backspace',windowsVirtualKeyCode:8});
    assert.equal(await ev("document.querySelectorAll('img.nt-img').length"),0,'Backspace apaga a imagem selecionada');
  });

  await t.test('data de alteração por bloco: só o bloco editado muda',async()=>{
    await reset(par('a'),par('b'),par('c'));await ev("NT.ed.commands.focus()");
    await ev("ntSalvaDoc()");assert.ok(await confirmado());
    const antes=await ev("SM.d.notasDoc.blocos.map(b=>b.atualizado)");
    await espera(30);await irFim('b');await digita('!');await ev("ntSalvaDoc()");assert.ok(await confirmado());
    const depois=await ev("SM.d.notasDoc.blocos.map(b=>b.atualizado)");
    const ids=await ev("SM.d.notasDoc.blocos.map(b=>b.id)");assert.equal(new Set(ids).size,ids.length,'ids únicos');
    assert.equal(antes[0],depois[0]);assert.notEqual(antes[1],depois[1]);assert.equal(antes[2],depois[2]);
  });

  await t.test('migração: notas antigas (1.38) viram toggles de topo, com cópia notas_v138',async()=>{
    const antigas=[
      {id:'n1',titulo:'Laudos',texto:'- medgemma\n• mudar nome\n  • filho\n\n> Meu toggle\n  segredo\n  > Interno\n    mais fundo\nlinha solta\n[img:nota-xabc.jpg]',em:'2026-10-01T10:00:00.000Z',atualizado:'2026-11-02T10:00:00.000Z',ordem:30},
      {id:'n2',titulo:'Vazia',texto:'',em:'2026-10-02',ordem:10},
      {id:'n3',titulo:'',texto:'sem título',em:'2026-10-03',ordem:20,fixa:true}];
    await ev(`NT.ed.destroy();NT.ed=null;NT.el=null;SM.d.notas=${JSON.stringify(antigas)};delete SM.d.notasDoc;delete SM.d.notas_v138;render()`);
    for(let i=0;i<50&&!await ev("!!NT.ed&&!!document.querySelector('.nt-pm')");i++)await espera(100);
    const bl=await ev("SM.d.notasDoc.blocos");
    assert.deepEqual(bl.map(b=>b.id),['bn3','bn2','bn1','b-fim'],'fixada primeiro, depois a ordem manual');
    assert.deepEqual(await ev("SM.d.notas_v138.map(n=>n.id)"),['n1','n2','n3'],'cópia do formato antigo');
    const n1=bl[2].conteudo;assert.equal(n1.type,'details');assert.equal(n1.content[0].content[0].text,'Laudos');
    assert.equal(bl[2].atualizado,'2026-11-02T10:00:00.000Z');
    const filhos=n1.content[1].content;
    assert.deepEqual(filhos.map(f=>f.type),['bulletList','details','paragraph','image']);
    assert.deepEqual(filhos[0].content.map(i=>i.content[0].content[0].text),['medgemma','mudar nome']);
    assert.equal(filhos[0].content[1].content[1].type,'bulletList','sub-lista pelo recuo');
    assert.equal(filhos[1].content[1].content[1].type,'details','toggle dentro do toggle');
    assert.equal(filhos[3].attrs.src,'./img/nota-xabc.jpg');
    assert.equal(await ev("document.querySelectorAll('.nt-pm > [data-type=\"details\"]').length"),3);
    assert.match(await ev("document.querySelector('.nt-pm').textContent"),/sem título.*Vazia.*Laudos/s,'ordem na tela');
    // idempotente
    assert.equal(await ev("ntMigra(SM.d)"),false);
  });

  assert.deepEqual(erros,[],'nenhuma exceção JavaScript no navegador');
  assert.deepEqual(consoleErros.filter(m=>!/Failed to load resource/.test(m)),[],'nenhum console.error');
});
