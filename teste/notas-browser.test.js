// Aba Notas 1.39 (página única, Tiptap) no Chrome headless: digitação, atalhos, menu "/", imagem, migração e recarga.
// 1.41: barra fixa (sem bolha), painel de atalhos, Tab/Shift+Tab lista<->toggle, páginas (painel, "/Página", barra lateral, arrastar, excluir, celular 375 px).
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

  await t.test('Ctrl+B / Ctrl+I / Ctrl+U / Ctrl+Shift+S e Ctrl+Shift+H (cor padrão, sem escolha fundo amarelo)',async()=>{
    await reset(par('marcas'));await ev("NT.ed.commands.selectAll()");
    const marcas=async()=>((await topo())[0].content[0].marks||[]).map(m=>m.type+(m.attrs?.backgroundColor?':'+m.attrs.backgroundColor:'')+(m.attrs?.color?':'+m.attrs.color:'')).sort();
    await ctrl('b');await ctrl('i');await ctrl('u');await ctrl('s',true);
    assert.deepEqual(await marcas(),['bold','italic','strike','underline']);
    await espera(150);assert.equal(await ev("getComputedStyle(NT.bolha).display"),'none','1.41: sem bolha ao selecionar texto');
    await ev("localStorage.removeItem('bcbr_nt_cor');localStorage.removeItem('bcbr_nt_cor_padrao')");
    await reset(par('cor'));await ev("NT.ed.commands.selectAll()");
    await ctrl('h',true);assert.ok((await marcas()).some(m=>/textStyle:var\(--ntb-amarelo\)/.test(m)),'padrão: fundo amarelo '+await marcas());
    await ev("ntAplicaCor(NT.ed,'texto','azul')");
    await ev("ntCorPadraoSet('texto','azul')");
    await reset(par('outra'));await ev("NT.ed.commands.selectAll()");await ctrl('h',true);
    assert.ok((await marcas()).some(m=>/var\(--ntc-azul\)/.test(m)),'aplica a cor definida como padrão: '+await marcas());
    // pela barrinha: paleta
    await ev("NT.barra.querySelector('[data-m=\"cor\"]').click()");
    assert.equal(await ev("!NT.barra.querySelector('.nt-paleta').hidden&&NT.barra.querySelectorAll('.nt-sw').length"),18,'9 cores de texto + 9 de fundo (paleta da barra fixa)');
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

  await t.test('alça ⋮⋮, menu do bloco (toque); o botão Abrir/Fechar todos saiu (1.42: Ctrl+Alt+T)',async()=>{
    await reset(tg('Um',par('u1')),tg('Dois',par('d1')),par('fim'));
    assert.equal(await ev("document.getElementById('nt_todos')"),null,'sem o botão Abrir/Fechar todos');
    await tecla('Escape');   // (fecha a paleta de cores que o teste anterior deixou aberta)
    await ev("document.querySelectorAll('.nt-seta').forEach(b=>b.getAttribute('aria-expanded')==='true'&&b.click())");
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


  // ===== 1.41 =====
  const barra=(ctx,m)=>`${ctx} [data-m="${m}"]`;
  const mouse=async(type,x,y)=>call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',clickCount:1,buttons:type==='mouseReleased'?0:1});
  const aguarda=async(expr,ms=6000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(await ev(expr).catch(()=>false))return true;await espera(80)}throw Error('não ocorreu: '+expr)};
  const item=(t,...filhos)=>({type:'listItem',content:[par(t),...filhos]});
  const lista=(tipo,...itens)=>({type:tipo,content:itens});
  const tarefa=t=>({type:'taskItem',attrs:{checked:false},content:[par(t)]});
  const irItem=async texto=>{await ev(`(()=>{let p=null;NT.ed.state.doc.descendants((n,pos)=>{if(p==null&&n.isText&&n.text===${JSON.stringify(texto)})p=pos+n.nodeSize});if(p==null)throw Error('texto ausente');NT.ed.chain().focus().setTextSelection(p).run()})()`)};
  const slashCtrl=()=>tecla('/',{code:'Slash',windowsVirtualKeyCode:191,modifiers:2});
  const esc=()=>tecla('Escape',{code:'Escape',windowsVirtualKeyCode:27});
  const ids=n=>(n.content||[]).map(c=>c.type);

  await t.test('1.41 sem bolha ao selecionar texto: a formatação fica na barra fixa do topo, ao lado do título',async()=>{
    await reset(par('selecionar isto'));await ev("NT.ed.commands.selectAll()");await espera(250);
    assert.equal(await ev("getComputedStyle(NT.bolha).display"),'none','a bolha não aparece');
    assert.equal(await ev("document.querySelectorAll('.nt-bolha-texto').length"),0,'a bolha de texto foi removida');
    const g=await ev("(()=>{const h=document.querySelector('.nt-topo h2').getBoundingClientRect(),b=document.querySelector('.nt-barra').getBoundingClientRect(),t=document.querySelector('.nt-topo').getBoundingClientRect();return {hx:h.right,hy:h.top+h.height/2,bx:b.left,by:b.top,bh:b.height,tt:t.top,esq:h.left}})()");
    assert.ok(g.bx>=g.hx-1&&g.by<g.hy&&g.by+g.bh>g.hy,'a barra está na mesma fileira do título "Notas", à direita dele: '+JSON.stringify(g));
    assert.ok(g.esq<80,'no canto superior esquerdo');
    for(const m of ['bold','italic','underline','strike','cor','frase','frases','hist','atalhos'])assert.equal(await ev(`!!document.querySelector('.nt-barra [data-m="${m}"]')`),true,'botão '+m);
    for(const m of ['link','h1','h2','h3','bullet','ordered','task','tgl'])assert.equal(await ev(`!!document.querySelector('.nt-barra [data-m="${m}"]')`),false,'1.43: o botão '+m+' saiu da barra');
    assert.equal(await ev("document.querySelectorAll('.nt-barra-l [data-m]').length"),9,'ficam B I U S, cor, frase, frases, histórico e atalhos');
  });

  await t.test('1.41 a barra formata a seleção sem tirar o foco nem a seleção do editor; botões acesos mostram o estado',async()=>{
    await reset(par('formatar isto'));await ev("NT.ed.commands.selectAll()");
    await click(barra('.nt-barra','bold'));
    const marcas=async()=>((await topo())[0].content[0].marks||[]).map(m=>m.type+(m.attrs?.backgroundColor?':'+m.attrs.backgroundColor:'')).sort();
    assert.deepEqual(await marcas(),['bold']);
    assert.equal(await ev("NT.ed.isFocused&&document.activeElement.classList.contains('nt-pm')"),true,'o foco continua no editor');
    assert.equal(await ev("!NT.ed.state.selection.empty"),true,'a seleção continua');
    assert.equal(await ev("document.querySelector('.nt-barra [data-m=\"bold\"]').classList.contains('on')"),true,'botão negrito aceso');
    await click(barra('.nt-barra','italic'));await click(barra('.nt-barra','underline'));await click(barra('.nt-barra','strike'));
    assert.deepEqual(await marcas(),['bold','italic','strike','underline']);
    await click(barra('.nt-barra','bold'));assert.ok(!(await marcas()).includes('bold'),'clicar de novo tira');
    assert.equal(await ev("document.querySelector('.nt-barra [data-m=\"bold\"]').classList.contains('on')"),false);
    // cor/realce pela paleta da barra
    await click(barra('.nt-barra','cor'));
    assert.equal(await ev("!document.querySelector('.nt-paleta').hidden"),true,'paleta aberta');
    await click('.nt-paleta [data-cor="fundo:amarelo"]');
    assert.ok((await marcas()).includes('textStyle:var(--ntb-amarelo)'),'realce aplicado: '+await marcas());
    assert.equal(await ev("document.querySelector('.nt-paleta').hidden&&NT.ed.isFocused"),true,'paleta fecha e o foco fica no editor');
    // 1.43: títulos, link, listas, checklist e toggle saíram da barra; os atalhos de teclado e o menu "/" continuam
    // link: Ctrl+K abre o campo ao lado da paleta (prompt() não existe no WebView)
    await reset(par('texto do link'));await ev("NT.ed.commands.selectAll()");await ctrl('k');
    assert.equal(await ev("!document.querySelector('.nt-link').hidden&&document.activeElement===document.querySelector('.nt-link-in')"),true,'campo do link com foco (Ctrl+K)');
    await digita('exemplo.com');await enter();await aguarda("NT.ed.isFocused");
    assert.equal((await topo())[0].content[0].marks[0].attrs.href,'https://exemplo.com');assert.equal(await ev("NT.ed.isFocused"),true,'foco volta ao editor depois do link');
    // botão sem seleção: nada quebra, e o foco volta
    await reset(par('cursor'));await irFim('cursor');await click(barra('.nt-barra','bold'));await digita('N');
    assert.equal((await topo())[0].content.map(c=>c.text+':'+(c.marks||[]).length).join('|'),'cursor:0|N:1','digita em negrito depois do clique');
  });

  await t.test('1.41 painel de atalhos: Ctrl+/ abre, Ctrl+/ ou Esc fecham, botão abre; lista só o que existe',async()=>{
    await reset(par('x'));await irFim('x');
    await slashCtrl();assert.equal(await ev("!!document.getElementById('nt_atalhos')"),true,'Ctrl+/ abre');
    assert.equal(await ev("NT.ed.getText()"),'x','a barra não foi digitada');
    const txt=await ev("document.getElementById('nt_atalhos').textContent");
    for(const k of ['Ctrl+B','Ctrl+I','Ctrl+U','Ctrl+Shift+S','Ctrl+K','Ctrl+Shift+H','Tab','Shift+Tab','Alt+A','Ctrl+V','Ctrl+/','Ctrl+Z','> ','Toggle','Lista numerada','Checklist','Nova página'])assert.ok(txt.includes(k),'lista '+k);
    await esc();assert.equal(await ev("!document.getElementById('nt_atalhos')"),true,'Esc fecha');
    assert.equal(await ev("NT.ed.isFocused"),true,'o foco volta ao editor');
    await click(barra('.nt-barra','atalhos'));assert.equal(await ev("!!document.getElementById('nt_atalhos')"),true,'botão abre');
    await slashCtrl();assert.equal(await ev("!document.getElementById('nt_atalhos')"),true,'Ctrl+/ fecha');
    await click(barra('.nt-barra','atalhos'));await click('.nt-atalhos-t button');assert.equal(await ev("!document.getElementById('nt_atalhos')"),true,'✕ fecha');
  });

  await t.test('1.41 Tab em item de lista logo depois de um toggle entra no toggle; Shift+Tab sai (lista, numerada e checklist)',async()=>{
    // o caso da foto: toggle e, logo abaixo, uma lista com um item vazio
    await reset(tg('Corretor de Laudos',par('conteudo')),lista('bulletList',item('')));
    await ev("(()=>{let p=null;NT.ed.state.doc.descendants((n,pos)=>{if(p==null&&n.type.name==='listItem')p=pos+2});NT.ed.chain().focus().setTextSelection(p).run()})()");
    await tab();
    let c=await topo();assert.equal(c[0].type,'details');assert.notEqual(c[1]?.type,'bulletList','a lista saiu do topo');
    assert.deepEqual(ids(c[0].content[1]),['paragraph','bulletList'],'o item é o último filho do toggle, ainda item de lista');
    assert.equal(await ev("document.querySelector('[data-type=\"details\"]').classList.contains('is-open')"),true,'o toggle abre para mostrar o item');
    await digita('novo');
    assert.equal(await ev("document.querySelector('.nt-pm [data-type=\"detailsContent\"] li').textContent"),'novo','o cursor ficou no item');
    await tab(true);
    c=await topo();assert.equal(c[1].type,'bulletList','Shift+Tab leva o item para logo depois do toggle');assert.equal(resumo(c[1]),'novo');
    assert.deepEqual(ids(c[0].content[1]),['paragraph'],'o toggle ficou só com o parágrafo');
    assert.equal(await ev("NT.ed.state.selection.$from.parent.textContent"),'novo','cursor no item');
    // numerada e checklist
    for(const [tipo,mk] of [['orderedList',item],['taskList',tarefa]]){
      await reset(tg('T',par('c')),lista(tipo,mk('um')));await irItem('um');await tab();
      c=await topo();assert.deepEqual(ids(c[0].content[1]),['paragraph',tipo],tipo+' entra no toggle');
      await tab(true);c=await topo();assert.equal(c[1].type,tipo,tipo+' sai do toggle');
    }
    // item com filhos leva os filhos; os irmãos de baixo ficam fora do toggle; o 2º item aninha normalmente
    await reset(tg('T',par('c')),lista('bulletList',item('a',lista('bulletList',item('a1'))),item('b')));
    await irItem('a');await tab();
    c=await topo();assert.deepEqual(c.slice(0,2).map(n=>n.type),['details','bulletList'],'o resto da lista (b) fica depois do toggle');
    assert.equal(resumo(c[1]),'b');assert.match(resumo(c[0].content[1]),/c\|a\|a1/,'a e o filho a1 foram juntos');
    await irItem('b');await tab();  // b é o 1º (único) item da lista que ainda vem logo após o toggle: entra na MESMA lista do toggle
    c=await topo();assert.equal(c[1]?.type==='bulletList',false);assert.deepEqual(ids(c[0].content[1]),['paragraph','bulletList']);
    assert.equal(c[0].content[1].content[1].content.length,2,'a e b na mesma lista');
    await irItem('b');await tab();   // agora b não é o 1º: aninha dentro de a
    assert.equal(await ev("document.querySelectorAll('.nt-pm [data-type=\"detailsContent\"] li li').length"),2,'b aninhou (a1 e b)');
    await tab(true);   // desaninha: continua DENTRO do toggle
    c=await topo();assert.equal(c[0].type,'details');assert.equal(c[1]?.type==='bulletList',false,'Shift+Tab em item aninhado só desaninha');
    await tab(true);   // item de nível mais alto dentro do toggle: sai
    c=await topo();assert.equal(c[1].type,'bulletList');assert.equal(resumo(c[1]),'b');
    // 1º item de uma lista que NÃO vem depois de um toggle: Tab não faz nada
    await reset(par('antes'),lista('bulletList',item('só')));await irItem('só');await tab();
    assert.deepEqual((await tipos()).slice(0,2),['paragraph','bulletList']);
    // dentro da lista (sem toggle) Tab/Shift+Tab seguem aninhando/desaninhando (teste anterior) e o toggle sem lista continua entrando no anterior
    await reset(tg('A',par('a1')),tg('B',par('b1')),par('fim'));await ev("document.querySelectorAll('.nt-seta').forEach(b=>b.getAttribute('aria-expanded')==='false'&&b.click())");await irFim('B');await tab();
    assert.deepEqual((await tipos()).slice(0,2),['details','paragraph'],'toggle em toggle segue igual');
  });

  await t.test('1.41 páginas: criar pelo botão da barra lateral, abrir no painel grande, editar com a barra, fechar (Esc, ✕, clique fora) e reabrir',async()=>{
    await ev("pgMuda(l=>{l.length=0})");await ev("localStorage.removeItem('bcbr_nt_lat')");await ev("ntLateralPinta()");
    assert.equal(await ev("!document.querySelector('.nt-corpo').classList.contains('lat-off')&&getComputedStyle(document.getElementById('nt_lat')).display!=='none'"),true,'barra lateral visível no PC');
    await click('.nt-pg-novo');await aguarda("!!document.getElementById('nt_pan')");
    const g=await ev("(()=>{const r=document.querySelector('.nt-pan-c').getBoundingClientRect();return {w:r.width,h:r.height,cx:r.left+r.width/2,cy:r.top+r.height/2}})()");
    assert.ok(g.w>=850&&g.w<=920&&g.h>=760&&g.h<=830,'painel grande (~90% de 1000x900): '+JSON.stringify(g));
    assert.ok(Math.abs(g.cx-500)<4&&Math.abs(g.cy-450)<4,'centralizado');
    assert.equal(await ev("document.activeElement.classList.contains('nt-pan-titulo')"),true,'cursor no título da página nova');
    await digita('Página fictícia');await enter();
    await aguarda("NP.ed.isFocused");
    assert.equal(await ev("NP.ed.isFocused"),true,'Enter leva ao texto');
    await digita('> ');await digita('Titulo T');
    assert.equal(await ev("document.querySelectorAll('#nt_pan [data-type=\"details\"]').length"),1,'toggle dentro do painel (mesmo editor)');
    await ev("NP.ed.commands.selectAll()");await click(barra('#nt_pan','bold'));
    assert.match(JSON.stringify(await ev("NP.ed.getJSON()")),/"type":"bold"/,'a barra do painel formata o editor do painel');
    assert.equal(await ev("NP.ed.isFocused"),true);
    assert.equal(await ev("NT.ed.getText().includes('Titulo T')"),false,'o texto não vazou para a página principal');
    await esc();assert.equal(await ev("!document.getElementById('nt_pan')"),true,'Esc fecha');
    assert.ok(await confirmado(),'salvou');
    const pg=await ev("SM.d.notasPaginas.paginas");assert.equal(pg.length,1);assert.equal(pg[0].titulo,'Página fictícia');assert.equal(pg[0].fixada,false);
    assert.match(JSON.stringify(pg[0].doc.blocos),/Titulo T/);assert.ok(pg[0].doc.blocos.every(b=>b.id&&b.atualizado));
    assert.match(await ev("document.getElementById('nt_lat').textContent"),/Página fictícia/,'aparece na barra lateral');
    assert.equal(await ev("NT.ed.getText().includes('Titulo T')"),false);
    // reabrir pela barra lateral; fechar pelo ✕; reabrir; fechar clicando fora
    await click('.nt-pg-nome');await aguarda("!!document.getElementById('nt_pan')");
    assert.equal(await ev("document.querySelector('.nt-pan-titulo').value"),'Página fictícia');assert.match(await ev("NP.ed.getText()"),/Titulo T/);
    await click('#nt_pan [data-a="fecha"]');assert.equal(await ev("!document.getElementById('nt_pan')"),true,'✕ fecha');
    await click('.nt-pg-nome');await aguarda("!!document.getElementById('nt_pan')");
    await mouse('mousePressed',5,5);await mouse('mouseReleased',5,5);assert.equal(await ev("!document.getElementById('nt_pan')"),true,'clique fora fecha');
    // editar o título e o texto e fechar: salva
    await click('.nt-pg-nome');await aguarda("!!document.getElementById('nt_pan')");await aguarda("NP.ed.isFocused");
    await ev("(()=>{const i=document.querySelector('.nt-pan-titulo');i.focus();i.select();0})()");await digita('Outro nome');
    await ev("NP.ed.commands.focus('end')");await aguarda("NP.ed.isFocused");await enter();await digita('linha nova');await esc();assert.ok(await confirmado());
    const p2=await ev("SM.d.notasPaginas.paginas[0]");assert.equal(p2.titulo,'Outro nome');assert.match(JSON.stringify(p2.doc.blocos),/linha nova/);
    assert.match(await ev("document.getElementById('nt_lat').textContent"),/Outro nome/);
  });

  await t.test('1.41 "/Página" cria a página, põe o bloco-link no cursor e abre; clicar no bloco abre; dentro de uma página não há "/Página"',async()=>{
        await reset(par(''));await ev("NT.ed.commands.focus()");await aguarda("NT.ed.isFocused");const antes=await ev("SM.d.notasPaginas.paginas.length");
    await digita('/pag');assert.equal(await ev("document.querySelector('.nt-slash-it b').textContent"),'Página');await enter();
    await aguarda("!!document.getElementById('nt_pan')");
    assert.equal(await ev("SM.d.notasPaginas.paginas.length"),antes+1,'página criada');
    const id=await ev("NP.pagina");assert.equal((await tipos()).includes('paginaLink'),true,'bloco-link no ponto do cursor');
    assert.equal(await ev("document.activeElement.classList.contains('nt-pan-titulo')"),true);
    await digita('Filha');assert.equal(await ev("document.querySelector('.nt-pan-titulo').value"),'Filha','digitou no título');await esc();assert.ok(await confirmado());
    assert.equal(await ev("document.querySelector('.nt-plink').textContent"),'📄 Filha','o bloco mostra o título');
    await click('.nt-plink');await aguarda("!!document.getElementById('nt_pan')");assert.equal(await ev("NP.pagina"),id,'clicar no bloco abre a mesma página');
    await ev("NP.ed.commands.focus('end')");await aguarda("NP.ed.isFocused");await digita('/pag');await espera(150);
    assert.equal(await ev("!!document.querySelector('.nt-slash-vazio')"),true,'sem "Página" dentro de uma página');
    await esc();assert.equal(await ev("!!document.getElementById('nt_pan')"),true,'Esc fecha só o menu "/"');
    await esc();assert.equal(await ev("!document.getElementById('nt_pan')"),true);
    // apagar o bloco-link não apaga a página
    await ev("(()=>{let p=null;NT.ed.state.doc.forEach((n,o)=>{if(n.type.name==='paginaLink')p=o});NT.ed.view.dispatch(NT.ed.state.tr.delete(p,p+1))})()");
    assert.equal(await ev("SM.d.notasPaginas.paginas.length"),antes+1);
  });

  await t.test('1.41 fixar, desafixar e reordenar na barra lateral (arrastando com o mouse); fixadas em cima',async()=>{
    await ev("pgMuda(l=>{l.length=0})");
    const nomes=['Alfa','Beta','Gama'],id={};
    for(const n of nomes){id[n]=await ev("ntPaginaCria()");await ev(`pgMuda(l=>{l.find(p=>p.id===${JSON.stringify(id[n])}).titulo=${JSON.stringify(n)}})`)}
    const secao=async s=>ev(`[...document.querySelectorAll('.nt-pg-lista[data-sec="${s}"] .nt-pg-nome')].map(b=>b.textContent.replace('📄 ',''))`);
    assert.deepEqual(await secao('pg'),nomes,'ordem de criação');assert.equal(await ev("!document.querySelector('.nt-pg-lista[data-sec=\"fix\"]')"),true,'sem fixadas, sem seção');
    await click(`.nt-pg-it[data-pg="${id.Beta}"] .nt-pg-pin`);
    assert.deepEqual(await secao('fix'),['Beta'],'Beta foi para Fixadas');assert.deepEqual(await secao('pg'),['Alfa','Gama']);
    assert.ok(await ev("document.querySelector('.nt-lat-s').textContent")==='Fixadas'&&await ev("document.querySelector('.nt-pg-lista').dataset.sec")==='fix','Fixadas vem em cima');
    // arrastar Gama para cima de Alfa
    const centro=async sel=>ev(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,t:r.top,h:r.height}})()`);
    const g=await centro(`.nt-pg-it[data-pg="${id.Gama}"] .nt-pg-nome`),a=await centro(`.nt-pg-it[data-pg="${id.Alfa}"] .nt-pg-nome`);
    await mouse('mouseMoved',g.x,g.y);await mouse('mousePressed',g.x,g.y);
    for(let k=1;k<=6;k++)await mouse('mouseMoved',g.x,g.y+(a.t+3-g.y)*k/6);
    assert.equal(await ev("!!document.querySelector('.nt-pg-it.arrastando')&&!!document.querySelector('.alvo-antes')"),true,'indicador de destino durante o arrasto');
    await mouse('mouseReleased',g.x,a.t+3);
    assert.deepEqual(await secao('pg'),['Gama','Alfa'],'Gama passou para antes de Alfa');
    assert.equal(await ev("!document.getElementById('nt_pan')"),true,'arrastar não abre a página');
    assert.deepEqual(await secao('fix'),['Beta'],'a seção de fixadas não mudou');
    assert.ok(await confirmado());
    const ord=await ev("Object.fromEntries(SM.d.notasPaginas.paginas.map(p=>[p.titulo,p.ordem]))");assert.ok(ord.Gama<ord.Alfa,'a ordem foi gravada: '+JSON.stringify(ord));
    // desafixar pelo painel (alfinete) volta para a lista de baixo
    await click(`.nt-pg-it[data-pg="${id.Beta}"] .nt-pg-nome`);await aguarda("!!document.getElementById('nt_pan')");
    assert.equal(await ev("document.querySelector('#nt_pan [data-a=\"pin\"]').classList.contains('on')"),true,'alfinete aceso no painel');
    await click('#nt_pan [data-a="pin"]');await esc();
    assert.deepEqual(await secao('pg'),['Gama','Alfa','Beta'],'desafixada vai para o fim de Páginas');assert.equal(await ev("!document.querySelector('.nt-pg-lista[data-sec=\"fix\"]')"),true);
    // recolher e expandir (estado por aparelho)
    await click('#nt_lat_bt');assert.equal(await ev("getComputedStyle(document.getElementById('nt_lat')).display"),'none');assert.equal(await ev("localStorage.getItem('bcbr_nt_lat')"),'0');
    await aguarda("!!document.querySelector('.nt-pm')");   // (a aba é redesenhada depois de fechar o painel: espera o editor voltar)
    const larg=await ev("document.querySelector('.nt-pm').getBoundingClientRect().width");assert.ok(larg>=930,'com a barra lateral recolhida o texto usa quase toda a largura (1000 px): '+larg);
    await click('#nt_lat_bt');assert.equal(await ev("getComputedStyle(document.getElementById('nt_lat')).display!=='none'&&localStorage.getItem('bcbr_nt_lat')"),'1');
  });

  await t.test('1.41 excluir página pede confirmação (Cancelar mantém, Excluir apaga e fecha o painel)',async()=>{
    const n=await ev("SM.d.notasPaginas.paginas.length");
    await click('.nt-pg-nome');await aguarda("!!document.getElementById('nt_pan')");
    await click('#nt_pan [data-a="exc"]');assert.equal(await ev("!document.querySelector('.nt-pan-conf').hidden"),true,'pergunta antes de excluir');
    await click('#nt_pan [data-a="exc-nao"]');assert.equal(await ev("SM.d.notasPaginas.paginas.length"),n);assert.equal(await ev("document.querySelector('.nt-pan-conf').hidden"),true);
    await click('#nt_pan [data-a="exc"]');await click('#nt_pan [data-a="exc-sim"]');
    assert.equal(await ev("!document.getElementById('nt_pan')"),true,'painel fechou');assert.equal(await ev("SM.d.notasPaginas.paginas.length"),n-1,'página excluída');
    assert.ok(await confirmado());
  });

  await t.test('1.41 celular de 375 px: sem rolagem horizontal, barra lateral recolhida abre por cima, painel em tela cheia',async()=>{
    if(!await ev("SM.d.notasPaginas.paginas.length"))await ev("ntPaginaCria()");assert.ok(await confirmado());
    await call('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});
    await abre();
    assert.equal(await ev("document.documentElement.scrollWidth<=375&&document.body.scrollWidth<=375"),true,'sem rolagem horizontal');
    assert.equal(await ev("document.querySelector('.nt-corpo').classList.contains('lat-off')&&getComputedStyle(document.getElementById('nt_lat')).display==='none'"),true,'barra lateral começa recolhida');
    const w=await ev("document.querySelector('.nt-pm').getBoundingClientRect().width");assert.ok(w>=330,'texto usa a largura do celular: '+w);
    assert.equal(await ev("(()=>{const l=document.querySelector('.nt-barra-l');return l.scrollWidth>l.clientWidth&&getComputedStyle(l).overflowX==='auto'})()"),true,'a barra rola dentro de si mesma');
    assert.equal(await ev("document.querySelector('.nt-barra').getBoundingClientRect().right<=375"),true);
    await click('#nt_lat_bt');
    assert.equal(await ev("(()=>{const r=document.getElementById('nt_lat').getBoundingClientRect();return getComputedStyle(document.getElementById('nt_lat')).position==='fixed'&&r.left>=0&&r.right<=375&&r.height>=700})()"),true,'abre por cima');
    await click('.nt-pg-nome');await aguarda("!!document.getElementById('nt_pan')");
    const r=await ev("(()=>{const r=document.querySelector('.nt-pan-c').getBoundingClientRect();return [r.left,r.top,r.width,r.height]})()");
    assert.deepEqual(r,[0,0,375,812],'painel em tela cheia');
    assert.equal(await ev("document.querySelector('#nt_pan .nt-barra').getBoundingClientRect().right<=375&&document.getElementById('nt_pan').scrollWidth<=375"),true);
    assert.equal(await ev("document.querySelector('.nt-corpo').classList.contains('lat-off')"),true,'a barra lateral fechou ao abrir a página');
    await ev("NP.ed.commands.focus('end')");await aguarda("NP.ed.isFocused");await digita('texto');await ev("NP.ed.commands.selectAll()");await click(barra('#nt_pan','italic'));
    assert.match(JSON.stringify(await ev("NP.ed.getJSON()")),/"type":"italic"/,'barra funciona no celular');
    await click('#nt_pan [data-a="fecha"]');assert.ok(await confirmado());
    await call('Emulation.setDeviceMetricsOverride',{width:1000,height:900,deviceScaleFactor:1,mobile:false});await abre();
  });

  assert.deepEqual(erros,[],'nenhuma exceção JavaScript no navegador');
  assert.deepEqual(consoleErros.filter(m=>!/Failed to load resource/.test(m)),[],'nenhum console.error');
});
