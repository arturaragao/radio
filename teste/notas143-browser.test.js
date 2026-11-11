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

  await t.test('6: links/botões, duas abas da mesma origem, edições simultâneas offline, mesma página, reload e SW com ?pagina=',async t=>{
    const abas=new Set(),fecha=async tab=>{await tab.fecha();abas.delete(tab)};
    t.after(async()=>{for(const tab of abas)await fecha(tab);await ev('if(window.__api)BCBR.api=window.__api');await call('Page.bringToFront')});
    await reset(par('principal'));await ev('NT.sujo=true;ntSalvaDoc()');assert.ok(await confirmado());
    const ids=await ev("(()=>{const a=ntPaginaCria(),b=ntPaginaCria();pgMuda(l=>{for(const [id,t] of [[a,'Alfa'],[b,'Beta']]){const p=l.find(p=>p.id===id);p.titulo=t;p.doc={v:1,blocos:['um','dois'].map((s,i)=>({id:id+i,atualizado:ntAgora(),conteudo:{type:'paragraph',attrs:{id:id+i},content:[{type:'text',text:s}]}}))}}});return [a,b]})()");
    assert.ok(await confirmado());
    if(!await ev('ntLateralAberta()'))await click('#nt_lat_bt');
    const url=id=>C.URL_+'?pagina='+id;
    const targets=async()=> (await call('Target.getTargets')).targetInfos.filter(t=>t.type==='page');
    const abriu=async acao=>{const antes=new Set((await targets()).map(t=>t.targetId));await acao();let alvo;for(let i=0;i<50;i++){alvo=(await targets()).find(t=>!antes.has(t.targetId));if(alvo)break;await espera(100)}assert.ok(alvo,'o Chrome abriu uma aba real');return alvo};
    let alvo=await abriu(()=>click(`.nt-pg-it[data-pg="${ids[0]}"] .nt-pg-aba`));assert.equal(alvo.url,url(ids[0]));
    const A=await C.novaAba(alvo.targetId);abas.add(A);
    const aguarda=async(tab,q)=>{for(let i=0;i<150;i++){if(await tab.ev(q).catch(()=>false))return;await espera(100)}assert.fail('não ocorreu: '+q)};
    await aguarda(A,'!!NP?.ed');assert.equal(await A.ev('document.title'),'Alfa');
    assert.equal(await A.ev("getComputedStyle(document.querySelector('main')).display"),'none');
    await call('Page.bringToFront');
    // Ctrl+clique e clique do meio mantêm o comportamento nativo de links.
    for(const [button,modifiers] of [['left',2],['middle',0]]){
      const r=await rect(`.nt-pg-it[data-pg="${ids[1]}"] .nt-pg-nome`);
      alvo=await abriu(async()=>{for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,x:r.x,y:r.y,button,modifiers,clickCount:1})});
      assert.equal(alvo.url,url(ids[1]));const temp=await C.novaAba(alvo.targetId);await temp.fecha();await call('Page.bringToFront');
    }
    await ev(`ntPainelAbre('${ids[1]}')`);alvo=await abriu(()=>click('#nt_pan [data-a=aba]'));assert.equal(alvo.url,url(ids[1]));
    const B=await C.novaAba(alvo.targetId);abas.add(B);await aguarda(B,'!!NP?.ed');
    assert.equal(await ev('NP===null'),true,'painel salva e fecha ao abrir a aba');
    const offline=(tab,segurar=false)=>tab.ev(`window.__api=BCBR.api;window.__putsOffline=0;
      window.__esperaPut=${segurar?"new Promise(r=>window.__liberaPut=r)":"Promise.resolve()"};
      BCBR.api=(p,o)=>{if(o?.method!=='PUT')return window.__api(p,o);window.__putsOffline++;return window.__esperaPut.then(()=>{throw new Error('offline fictício')})};0`);
    // Todas as abas ficam sem PUT; a aba principal também pode enviar a fila compartilhada.
    // Só B segura a resposta: segurar A e B juntas bloquearia a segunda no Web Lock.
    await offline(C);await offline(A);await offline(B,true);
    const edita=(tab,indice,txt)=>tab.ev(`(()=>{let pos=0;NP.ed.state.doc.forEach((n,p,i)=>{if(i===${indice})pos=p+1});NP.ed.commands.insertContentAt(pos,${JSON.stringify(txt)});pgSalvaDoc()})()`);
    await Promise.all([edita(A,0,'A1 '),edita(B,0,'B1 ')]);
    await aguarda(A,`pgAchar('${ids[1]}').doc.blocos[0].conteudo.content[0].text==='B1 um'`);
    await aguarda(B,`pgAchar('${ids[0]}').doc.blocos[0].conteudo.content[0].text==='A1 um'`);
    assert.equal(await A.ev('ntTemPendentes()'),true,'fila offline permanece');
    // storage confirma a fusão local, não a conclusão do PUT. Mantém a resposta em voo
    // até conferir a cópia persistida e só então rejeita e aguarda o tratamento do erro.
    await aguarda(B,'window.__putsOffline>0');
    const fila=()=>B.ev('ntPendentes().flatMap(op=>op.filas.map(f=>({k:f.k,raw:f.raw})))');
    const antesDaFalha=await fila();
    assert.ok(antesDaFalha.length>=2,'as duas edições estão persistidas antes da resposta');
    for(const texto of ['A1 um','B1 um'])assert.ok(antesDaFalha.some(f=>f.raw.includes(texto)),texto+' está na fila');
    assert.equal(await B.ev('window.__liberaPut();NT.sync'),false,'o envio automático terminou com falha');
    assert.equal(await B.ev('SM.sujo'),true,'falha do PUT marca sujo');
    assert.equal(await B.ev('ntTemPendentes()'),true,'falha mantém pendência');
    assert.deepEqual(await fila(),antesDaFalha,'PUT rejeitado não remove nem altera as entradas');
    // B passa a editar a MESMA página de A, sem conexão. Blocos diferentes ficam no editor das duas abas.
    await B.abre(url(ids[0]));await aguarda(B,'!!NP?.ed');await offline(B);
    await Promise.all([edita(A,0,'A2 '),edita(B,1,'B2 ')]);
    for(const tab of [A,B])await aguarda(tab,"NP.ed.state.doc.textContent==='A2 A1 umB2 dois'");
    for(const tab of [C,A,B])await tab.ev('BCBR.api=window.__api');
    await A.ev('ntSync()');await B.ev('ntSync()');
    for(const tab of [A,B])await aguarda(tab,'!ntTemPendentes()&&!NT.sync&&!SM.sujo');
    await A.ev("NP.titulo.value='Alfa editada';NP.titulo.dispatchEvent(new Event('input',{bubbles:true}));NP.titulo.blur();pgTituloSalva()");
    await aguarda(B,"document.title==='Alfa editada'");assert.equal(await A.ev('document.title'),'Alfa editada');
    await A.abre(url(ids[0]));await aguarda(A,'!!NP?.ed');assert.equal(await A.ev('NP.ed.state.doc.textContent'),'A2 A1 umB2 dois');
    const remoto=await A.ev("BCBR.api('/repos/'+BCBR.REPO+'/contents/'+SM_ARQ).then(async r=>{const d=JSON.parse(smDec(r.content));for(const p of d.notasPaginas.paginas)if(!p.doc)p.doc=(await ntArquivoRev(p.id,p.rev)).doc;return d})");
    assert.equal(remoto.notasPaginas.paginas.find(p=>p.id===ids[1]).doc.blocos[0].conteudo.content[0].text,'B1 um','outra página também subiu');
    await A.ev("navigator.serviceWorker.ready.then(()=>true)");await aguarda(A,'!!navigator.serviceWorker.controller');
    await A.call('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:false});
    for(const tema of ['light','dark']){await A.ev(`document.documentElement.dataset.theme='${tema}'`);const g=await A.ev("(()=>{const r=document.querySelector('.nt-pan-c').getBoundingClientRect();return {l:r.left,r:r.right,h:r.height,overflow:document.documentElement.scrollWidth}})()");assert.ok(g.l===0&&g.r===375&&g.h===812&&g.overflow<=375,'página inteira no celular: '+JSON.stringify(g))}
    await A.call('Network.enable');await A.call('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    await A.abre(url(ids[0]));await aguarda(A,'!!NP?.ed');assert.equal(await A.ev('NP.ed.state.doc.textContent'),'A2 A1 umB2 dois','SW serviu endereço com query offline');
    await A.call('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await fecha(A);await fecha(B);await call('Page.bringToFront');
    alvo=await abriu(()=>click('#nt_aba_bt'));assert.equal(alvo.url,url('notas'));
    const principal=await C.novaAba(alvo.targetId);abas.add(principal);await aguarda(principal,"typeof NT!=='undefined'&&!!NT.ed");
    assert.equal(await principal.ev('document.title'),'Notas');assert.equal(await principal.ev('NT.ed.state.doc.textContent'),'principal');
    assert.deepEqual(A.erros,[]);assert.deepEqual(B.erros,[]);assert.deepEqual(principal.erros,[]);await fecha(principal);
  });
  await t.test('6 mesmo bloco: duas abas antigas gravam offline sem receber storage; uma versão vence e a outra fica guardada uma única vez',async()=>{
    // Empate não garante convergência antes do pull: o terceiro argumento (remoto) vence.
    const empate=await ev(`(()=>{const b=texto=>({id:'empate',atualizado:'2026-11-10T12:00:00.000Z',conteudo:{type:'paragraph',content:[{type:'text',text:texto}]}});
      return [['A','B'],['B','A']].map(([l,r])=>{const f=ntFunde([b('Base')],[b(l)],[b(r)]);return [f.blocos[0].conteudo.content[0].text,f.conflitos[0].conteudo.content[0].text,ntJuntaConflitos(f.conflitos,f.conflitos).length]})})()`);
    assert.deepEqual(empate,[['B','A',1],['A','B',1]],'empate: remoto vence e local é arquivado uma vez');
    for(const maisNovo of ['A','B']){
    const id=await ev("(()=>{const id=ntPaginaCria();pgMuda(l=>{const p=l.find(p=>p.id===id);p.titulo='Conflito fictício';p.doc.blocos[0].conteudo.content=[{type:'text',text:'Base'}]});return id})()");assert.ok(await confirmado());
    const A=await C.novaAba(),B=await C.novaAba();
    try{
      for(const tab of [A,B]){
        await tab.abre(C.URL_+'?pagina='+id);assert.equal(await tab.ev('!!NP?.ed'),true);
        await tab.ev("window.__api=BCBR.api;BCBR.api=(p,o)=>o?.method==='PUT'?Promise.reject(new Error('offline fictício')):window.__api(p,o);window.__segura=e=>e.stopImmediatePropagation();window.addEventListener('storage',window.__segura,true)");
      }
      // Relógio do bloco controlado só durante o salvamento; Date.now da fila segue real.
      // Promise.all pode gravar no mesmo milissegundo: não inferir o vencedor da aba A.
      const datas=['A','B'].map(nome=>`2026-11-10T12:00:0${nome===maisNovo?2:1}.000Z`);
      const gravadas=await Promise.all([[A,'A'],[B,'B']].map(([tab,nome],i)=>tab.ev(`(()=>{
        NP.ed.commands.setContent({type:'doc',content:[{type:'paragraph',attrs:{id:NP.shown[0].id},content:[{type:'text',text:'VERSAO_${nome}'}]}]},{emitUpdate:false});
        const RealDate=window.Date;window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['${datas[i]}']))}};
        try{NP.sujo=true;pgSalvaDoc();return NP.shown[0].atualizado}finally{window.Date=RealDate}
      })()`)));
      assert.deepEqual(gravadas,datas,'atualizado vem do relógio controlado do bloco');
      for(const tab of [A,B])await tab.ev("Promise.resolve(NT.sync).then(()=>{ntAplica(SM.d,ntPendentes());ntSincroniza();window.removeEventListener('storage',window.__segura,true)})");
      const escolhido='VERSAO_'+maisNovo;
      for(const tab of [A,B]){
        assert.equal(await tab.ev('NP.ed.state.doc.textContent'),escolhido);
        const conflitos=await tab.ev(`(SM.d.notas_conflitos||[]).filter(c=>c.pagina==='${id}')`);
        assert.equal(conflitos.length,1,'sem duplicar a cópia');
        assert.equal(conflitos[0].atualizado,datas[maisNovo==='A'?1:0],'cópia da versão mais antiga');
        assert.match(JSON.stringify(conflitos[0].conteudo),new RegExp(escolhido==='VERSAO_A'?'VERSAO_B':'VERSAO_A'),'a outra versão não se perdeu');
        await tab.ev('BCBR.api=window.__api');
      }
      await A.ev('ntSync()');await B.ev('ntSync()');await A.abre(C.URL_+'?pagina='+id);
      assert.equal(await A.ev('NP.ed.state.doc.textContent'),escolhido,'sobrevive ao reload');
      assert.equal(await A.ev(`(SM.d.notas_conflitos||[]).filter(c=>c.pagina==='${id}').length`),1);
      assert.deepEqual(A.erros,[]);assert.deepEqual(B.erros,[]);
    }finally{await A.fecha();await B.fecha()}
    }
  });
  assert.deepEqual(C.erros,[],'sem exceções no JavaScript');
});
