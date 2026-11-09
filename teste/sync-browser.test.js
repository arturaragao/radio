// 1.40 no Chrome: dois "aparelhos" (origens 127.0.0.1 e localhost = localStorage separado) contra o mesmo servidor de teste
// (--simulado + BCBR_MEM=1: o plano fica em memória do servidor; nada vai ao GitHub). Cobre busca rápida, fusão por bloco com o editor
// com foco, ETag/304, cota, plano corrompido, link sem prompt() e as variáveis do tema Sépia.
// BCBR_CAPTURAS=<pasta> grava capturas de tela do tema escuro (Notas, Calendário, Tarefas).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const espera=ms=>new Promise(r=>setTimeout(r,ms));
const PORTA=8768,URL_A=`http://127.0.0.1:${PORTA}/`,URL_B=`http://localhost:${PORTA}/`;
test('Sincronização 1.40: dois aparelhos, fusão por bloco com o editor aberto, 304, cota, plano corrompido, link e tema Sépia',{timeout:240000},async t=>{
  const chrome=process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  assert.ok(fs.existsSync(chrome),'Chrome disponível');
  const raiz=path.resolve(__dirname,'..'),perfil=fs.mkdtempSync(path.join(os.tmpdir(),'bcbr-sync-'));
  const servidor=spawn(process.execPath,['teste/servidor.js','--simulado',String(PORTA)],{cwd:raiz,windowsHide:true,stdio:'pipe',env:{...process.env,BCBR_MEM:'1'}});
  const proc=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${perfil}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  const abertos=[];t.after(async()=>{abertos.forEach(w=>w.close());proc.kill();servidor.kill();await espera(500);fs.rmSync(perfil,{recursive:true,force:true,maxRetries:5,retryDelay:200})});
  const portaArquivo=path.join(perfil,'DevToolsActivePort');
  for(let i=0;i<120&&!fs.existsSync(portaArquivo);i++)await espera(100);
  assert.ok(fs.existsSync(portaArquivo),'Chrome iniciou o protocolo de depuração');
  const porta=fs.readFileSync(portaArquivo,'utf8').split('\n')[0];
  for(let i=0;i<50;i++){try{if((await fetch(URL_A)).ok)break}catch{}await espera(100)}
  const erros=[],consoleErros=[];
  // ---- um aparelho = uma aba do Chrome numa origem própria ----
  // janela própria para cada aparelho: as duas ficam "visíveis" (aba em segundo plano pararia a busca automática)
  const ver=await(await fetch(`http://127.0.0.1:${porta}/json/version`)).json();
  const bws=new WebSocket(ver.webSocketDebuggerUrl);await new Promise(r=>bws.onopen=r);abertos.push(bws);
  const pend0=new Map();let seq0=0;bws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id&&pend0.has(r.id))pend0.get(r.id)(r.result)};
  const novaJanela=()=>new Promise(r=>{const id=++seq0;pend0.set(id,r);bws.send(JSON.stringify({id,method:'Target.createTarget',params:{url:'about:blank',newWindow:true,width:1000,height:900}}))});
  async function aparelho(url){
    const {targetId}=await novaJanela(),alvo=(await(await fetch(`http://127.0.0.1:${porta}/json/list`)).json()).find(x=>x.id===targetId);
    const ws=new WebSocket(alvo.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});abertos.push(ws);
    let seq=0;const pendentes=new Map();
    const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pendentes.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
    const local=u=>u.startsWith(`http://127.0.0.1:${PORTA}/`)||u.startsWith(`http://localhost:${PORTA}/`);
    ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id){const p=pendentes.get(r.id);pendentes.delete(r.id);if(p)r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result)}
      if(r.method==='Runtime.exceptionThrown')erros.push(url+' '+(r.params.exceptionDetails.exception?.description||r.params.exceptionDetails.text));
      if(r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')consoleErros.push(r.params.args.map(x=>x.value||x.description).join(' '));
      if(r.method==='Fetch.requestPaused'){const p=r.params;call(local(p.request.url)?'Fetch.continueRequest':'Fetch.failRequest',{requestId:p.requestId,...(local(p.request.url)?{}:{errorReason:'BlockedByClient'})}).catch(()=>{})}};
    const ev=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
    await call('Page.enable');await call('Runtime.enable');await call('Fetch.enable',{patterns:[{urlPattern:'*'}]});
    await call('Emulation.setDeviceMetricsOverride',{width:1000,height:900,deviceScaleFactor:1,mobile:false});
    const tecla=async(key,extra={})=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key,...extra});await call('Input.dispatchKeyEvent',{type:'keyUp',key,...extra})};
    const d={call,ev,tecla,
      digita:async txt=>{for(const ch of txt){await call('Input.dispatchKeyEvent',{type:'keyDown',key:ch,text:ch,unmodifiedText:ch});await call('Input.dispatchKeyEvent',{type:'keyUp',key:ch})}},
      enter:()=>tecla('Enter',{code:'Enter',windowsVirtualKeyCode:13}),
      ctrl:letra=>tecla(letra,{code:'Key'+letra.toUpperCase(),windowsVirtualKeyCode:letra.toUpperCase().charCodeAt(0),modifiers:2}),
      abre:async()=>{
        await call('Page.navigate',{url});
        for(let i=0;i<100;i++){if(await ev("typeof SM!=='undefined'&&SM.ok&&typeof TABS!=='undefined'&&!!document.querySelector('.sm')").catch(()=>false))break;await espera(100)}
        await ev("go('notas')");
        for(let i=0;i<100;i++){if(await ev("typeof NT!=='undefined'&&!!NT.ed&&!!document.querySelector('.nt-pm')").catch(()=>false))break;await espera(100)}
        await espera(600);await ev("SM.fila.then(()=>1)");
      },
      // texto de cada bloco de topo
      textos:()=>ev("NT.ed.getJSON().content.map(n=>{const t=[];(function f(x){if(x.text)t.push(x.text);(x.content||[]).forEach(f)})(n);return t.join('')})"),
      reset:async(...blocos)=>{await ev(`NT.ed.commands.setContent({type:'doc',content:${JSON.stringify(blocos)}},{emitUpdate:false});NT.ed.commands.focus();0`)},
      irFim:async texto=>{await ev(`(()=>{let p=null;NT.ed.state.doc.descendants((n,pos)=>{if(n.isText&&n.text===${JSON.stringify(texto)})p=pos+n.nodeSize});if(p==null)throw Error('texto ausente: '+${JSON.stringify(texto)});NT.ed.chain().focus().setTextSelection(p).run();return p})()`)},
      confirmado:async()=>{for(let i=0;i<80;i++){if(await ev("!ntTemPendentes()&&!NT.sync&&!NT.sujo"))return true;await espera(100)}return false},
      ate:async(expr,ms=16000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(await ev(expr).catch(()=>false))return Date.now()-t0;await espera(150)}throw Error('não ocorreu a tempo: '+expr)},
    };
    return d;
  }
  const par=(id,t)=>({type:'paragraph',attrs:{id},...(t?{content:[{type:'text',text:t}]}:{})});
  const stats=async(zera)=>(await fetch(`${URL_A}__stats${zera?'?zera':''}`)).json();
  const A=await aparelho(URL_A);await A.abre();
  const B=await aparelho(URL_B);await B.abre();
  // estado inicial comum: três parágrafos nos dois aparelhos
  await A.reset(par('x','x1'),par('y','y1'),par('z','z1'),par('b-fim',''));await A.ev("ntSalvaDoc()");assert.ok(await A.confirmado());
  await B.ev("smPuxar()");await B.ate("NT.ed.getJSON().content.some(n=>n.attrs.id==='y')",4000);
  assert.deepEqual((await B.textos()).slice(0,3),['x1','y1','z1']);

  await t.test('mudança de um aparelho aparece no outro em até ~15 s (busca a cada 10 s)',async()=>{
    assert.equal(await B.ev("smIntervalo()"),10000);
    await A.ev("NT.ed.commands.focus();0");await A.irFim('x1');await A.digita('-A');
    const t0=Date.now();assert.ok(await A.confirmado());
    const ms=await B.ate("NT.ed.getJSON().content[0].content?.[0]?.text==='x1-A'",16000);
    assert.ok(Date.now()-t0<=16000,'chegou em '+(Date.now()-t0)+' ms (espera depois de salvar: '+ms+' ms)');
    await espera(400);   // a aba é redesenhada logo depois de o plano chegar; só então o próximo teste mexe no foco
  });

  await t.test('editor COM FOCO recebe o bloco remoto sem perder cursor nem o texto que está sendo digitado',async()=>{
    await B.irFim('z1');await B.digita('abc');// digitado e ainda NÃO salvo (o salvamento espera 1 s)
    assert.equal(await B.ev("NT.sujo"),true);
    await A.irFim('y1');await A.digita('-A');assert.ok(await A.confirmado());
    await B.ev("smPuxar()");
    const tx=await B.textos();
    assert.equal(tx[1],'y1-A','o bloco do outro aparelho chegou');assert.equal(tx[2],'z1abc','o texto digitado continua');
    assert.equal(await B.ev("NT.ed.isFocused"),true,'o editor continua com foco');
    assert.equal(await B.ev("(()=>{const s=NT.ed.state.selection;return s.$from.parent.textContent+'|'+s.$from.parentOffset+'|'+s.empty})()"),'z1abc|5|true','cursor no mesmo lugar');
    await B.digita('d');                                              // continua digitando depois da atualização
    assert.equal((await B.textos())[2],'z1abcd');
    assert.ok(await B.confirmado());
    await A.ev("smPuxar()");await A.ate("NT.ed.getJSON().content[2].content?.[0]?.text==='z1abcd'",4000);
    assert.deepEqual((await A.textos()).slice(0,3),['x1-A','y1-A','z1abcd'],'nenhum bloco de nenhum aparelho se perdeu');
    assert.deepEqual(await B.textos(),await A.textos(),'os dois aparelhos convergiram');
  });

  await t.test('mesmo bloco nos dois: vence o mais novo, o outro vai para notas_conflitos',async()=>{
    await A.irFim('z1abcd');await A.digita('-A');                     // A salva primeiro...
    assert.ok(await A.confirmado());await espera(40);
    await B.irFim('z1abcd');await B.digita('-B');                     // ...B edita depois, sem ter puxado (sha velho -> 409)
    assert.ok(await B.confirmado());
    assert.equal((await B.textos())[2],'z1abcd-B');
    const conflitos=await B.ev("SM.d.notas_conflitos||[]");
    assert.equal(conflitos.length,1,'uma versão guardada');assert.match(JSON.stringify(conflitos[0].conteudo),/z1abcd-A/);
    await A.ev("smPuxar()");await A.ate("NT.ed.getJSON().content[2].content?.[0]?.text==='z1abcd-B'",4000);
    assert.equal((await stats()).n409>=1,true,'houve 409 e a fusão refez a gravação');
  });

  await t.test('GET condicional: 304 não altera nada nem gasta cota; cota baixa volta a 90 s',async()=>{
    await B.ev("smPuxar()");await B.ev("smPuxar()");   // garante que o ETag da última leitura é o atual
    await B.ev("window.__d=SM.d;window.__ed=NT.ed;0");await stats(true);
    await B.ev("smPuxar()");await B.ev("smPuxar()");
    const s=await stats();assert.ok(s.n304>=2,'respostas 304: '+s.n304);
    assert.equal(await B.ev("SM.d===window.__d&&NT.ed===window.__ed"),true,'304 não re-aplicou o plano');
    await fetch(`${URL_A}__cota?rest=120`);await B.ev("smPuxar()");
    assert.equal(await B.ev("BCBR.cota.rest"),120);assert.equal(await B.ev("smIntervalo()"),90000,'pouca cota: 90 s');
    await fetch(`${URL_A}__cota?rest=4900`);await B.ev("smPuxar()");assert.equal(await B.ev("smIntervalo()"),10000);
    await fetch(`${URL_A}__cota`);
  });

  await t.test('notasDoc corrompido: a aba abre, o bloco inválido vai para notas_conflitos; se nada presta, oferece restaurar',async()=>{
    await B.ev("(()=>{NT.ed.destroy();NT.ed=null;NT.el=null;SM.d.notasDoc={v:1,blocos:[{id:'bom',atualizado:'2026-11-01T00:00:00Z',conteudo:{type:'paragraph',attrs:{id:'bom'},content:[{type:'text',text:'sobrevive'}]}},{id:'ruim',atualizado:'2026-11-01T00:00:00Z',conteudo:{type:'inexistente',content:[{type:'nada'}]}},{id:'ruim2',atualizado:'x',conteudo:null}]};render()})()");
    await B.ev("window.__tr=[];const o=window.ntCria;0");await B.ate("!!NT.ed&&!!document.querySelector('.nt-pm')",4000).catch(async e=>{throw Error(e.message+' ERROS='+JSON.stringify(erros)+' CONSOLE='+JSON.stringify(consoleErros)+' | '+await B.ev("document.getElementById('nt_raiz')?.innerHTML.slice(0,300)")+' | '+JSON.stringify(await B.ev("(()=>{try{ntMonta();window.__t=[];const o1=window.ntCria;window.ntCria=function(){try{const r=o1.apply(this,arguments);window.__t.push('ret '+r);return r}catch(e){window.__t.push('throw '+e.stack);throw e}};const o2=window.ntValidos;window.ntValidos=function(){const r=o2.apply(this,arguments);window.__t.push('val '+r.bons.length+'/'+r.ruins.length+'/'+r.corrompido);return r};render();return new Promise(r=>setTimeout(()=>r(JSON.stringify(window.__t)+'apos render: ed='+!!NT.ed+' raiz='+!!document.getElementById('nt_raiz')+' html='+document.getElementById('app').innerHTML.slice(0,200)),800))}catch(e){return String(e.stack).slice(0,600)}})()")))});
    assert.match(await B.ev("document.querySelector('.nt-pm').textContent"),/sobrevive/);
    assert.deepEqual((await B.ev("SM.d.notas_conflitos.filter(c=>c.motivo==='bloco inválido').map(c=>c.id)")).sort(),['ruim','ruim2']);
    // nada aproveitável
    await B.ev("(()=>{NT.ed.destroy();NT.ed=null;NT.el=null;SM.d.notas_v138=[{id:'n9',titulo:'Antiga',texto:'texto antigo'}];SM.d.notasDoc={v:1,blocos:[{id:'r1',atualizado:'x',conteudo:{type:'lixo'}},{id:'r2',atualizado:'x',conteudo:{type:'lixo2'}}]};render()})()");
    await B.ate("!!document.getElementById('nt_restaura')",4000);
    assert.equal(await B.ev("NT.ed"),null,'não abre um editor vazio (apagaria as notas ao salvar)');
    await B.ev("document.getElementById('nt_restaura').click()");
    await B.ate("!!NT.ed&&/Antiga/.test(document.querySelector('.nt-pm')?.textContent||'')",6000);
    assert.ok(await B.confirmado());
    // blocos que nem é lista
    await B.ev("(()=>{NT.ed.destroy();NT.ed=null;NT.el=null;SM.d.notasDoc={v:1,blocos:'quebrado'};render()})()");
    await B.ate("!!document.getElementById('nt_restaura')",4000);
    await B.ev("document.getElementById('nt_restaura').click()");await B.ate("!!NT.ed",6000);
  });

  await t.test('link: Ctrl+K abre um campo dentro da barrinha (sem prompt()) e aplica o link',async()=>{
    assert.ok(await B.confirmado());await B.ev("SM.fila.then(()=>1)");await espera(600);   // nada pendente: sem redesenho da aba no meio do teste
    await B.ev("window.__prompt=0;window.prompt=()=>{window.__prompt++;return null}");
    await B.reset(par('l1','texto do link'));await B.ev("NT.ed.commands.selectAll();0");
    await B.ctrl('k');
    assert.equal(await B.ev("!document.querySelector('.nt-link').hidden&&document.activeElement===document.querySelector('.nt-link-in')"),true,'campo do link na barrinha, com foco');
    await B.digita('exemplo.com');await B.enter();
    assert.equal(await B.ev("window.__prompt"),0,'prompt() não foi usado');
    assert.equal(await B.ev("NT.ed.getJSON().content[0].content[0].marks[0].attrs.href"),'https://exemplo.com');
    assert.equal(await B.ev("document.querySelector('.nt-link').hidden"),true,'campo fecha depois de aplicar');
    // Esc cancela sem mexer; campo vazio remove
    const todo="NT.ed.commands.focus();NT.ed.commands.setTextSelection({from:1,to:NT.ed.state.doc.content.size-1});0";
    await B.ev(todo);await espera(300);await B.ctrl('k');   // (o foco volta ao editor logo depois do Enter)
    assert.equal(await B.ev("document.querySelector('.nt-link-in').value"),'https://exemplo.com','mostra o link atual');
    await B.tecla('Escape',{code:'Escape',windowsVirtualKeyCode:27});
    assert.equal(await B.ev("NT.ed.getJSON().content[0].content[0].marks?.[0]?.attrs.href"),'https://exemplo.com');
    await B.ev(todo);await espera(300);await B.ctrl('k');await B.ev("document.querySelector('.nt-link-in').value=''");await B.enter();
    assert.equal(await B.ev("NT.ed.getJSON().content[0].content[0].marks?.length||0"),0,'campo vazio remove o link');
    assert.equal(await B.ev("window.__prompt"),0);
  });

  await t.test('tema Sépia: variáveis nos dois modos escuros, contraste legível e theme-color',async()=>{
    const SEPIA={bg:'#3a3632',band:'#45403a',card:'#45403a',card2:'#4d4740',tx:'#f3ede4',mut:'#c2b8aa',bd:'#554e46',pri:'#c98a4b','pri-tx':'#e0a96d',ok:'#8fcf7a',warn:'#e6b85c',okbg:'#45503c',badbg:'#55403b',pbg:'#4f4532',ptx:'#f3e3b0',f:'#8fcf7a',m:'#e6b85c'};
    const le=()=>B.ev(`(()=>{const s=getComputedStyle(document.documentElement),o={};for(const k of ${JSON.stringify([...Object.keys(SEPIA),'bad','d','on-pri'])})o[k]=s.getPropertyValue('--'+k).trim();o.esquema=s.colorScheme;return o})()`);
    await B.ev("document.documentElement.dataset.theme='dark'");
    let v=await le();for(const [k,c] of Object.entries(SEPIA))assert.equal(v[k],c,'--'+k);assert.equal(v.esquema,'dark');
    // preferência do sistema escura, sem tema forçado
    await B.ev("delete document.documentElement.dataset.theme");await B.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
    v=await le();for(const [k,c] of Object.entries(SEPIA))assert.equal(v[k],c,'(prefers-color-scheme) --'+k);
    await B.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
    // contraste (WCAG) do texto sobre --bg e --card
    const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.substr(i,2),16)/255).map(x=>x<=.03928?x/12.92:((x+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
    const cr=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
    for(const t of ['tx','mut','pri-tx','ok','bad','warn','d'])for(const f of ['bg','card'])assert.ok(cr(v[t],v[f])>=4.5,`--${t} sobre --${f}: ${cr(v[t],v[f]).toFixed(2)}`);
    assert.ok(cr(v['on-pri'],v.pri)>=4.5,'texto dos botões sobre --pri');
    assert.equal(await B.ev("document.querySelector('meta[name=theme-color]').content"),'#3a3632');
    assert.equal(JSON.parse(fs.readFileSync(path.join(raiz,'manifest.webmanifest'),'utf8')).theme_color,'#3a3632');
    // capturas (opcional)
    const dir=process.env.BCBR_CAPTURAS;
    if(dir){
      fs.mkdirSync(dir,{recursive:true});await B.ev("document.documentElement.dataset.theme='dark'");
      await B.ev("ntAbertoSalva('t1',true);0");await B.reset({type:'details',attrs:{id:'t1'},content:[{type:'detailsSummary',content:[{type:'text',text:'Toggle de exemplo'}]},{type:'detailsContent',content:[{type:'paragraph',content:[{type:'text',text:'Texto ',marks:[]},{type:'text',text:'marcado',marks:[{type:'textStyle',attrs:{backgroundColor:'var(--ntb-amarelo)',color:'var(--ntc-vermelho)'}}]},{type:'text',text:' e um link',marks:[{type:'link',attrs:{href:'https://exemplo.com'}}]}]}]}]},par('p2','Parágrafo comum'));
      await B.ev("render()");await espera(700);
      for(const [nome,aba] of [['notas','notas'],['calendario','semana'],['tarefas','tarefas']]){await B.ev(`go('${aba}')`);await espera(900);fs.writeFileSync(path.join(dir,`sepia-${nome}.png`),Buffer.from((await B.call('Page.captureScreenshot',{format:'png'})).data,'base64'))}
    }
  });

  assert.deepEqual(erros,[],'nenhuma exceção JavaScript no navegador');
  assert.deepEqual(consoleErros.filter(m=>!/Failed to load resource|notas: não consegui/.test(m)),[],'nenhum console.error');
});
