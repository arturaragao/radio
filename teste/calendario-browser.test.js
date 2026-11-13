// Aceite real no Chrome headless, usando apenas o servidor local e dados fictícios.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const espera=ms=>new Promise(r=>setTimeout(r,ms));
test('Calendário, Tarefas e Notas 1.30: aceite no Chrome, desktop e celular', {timeout:90000},async t=>{
  const chrome=process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  assert.ok(fs.existsSync(chrome),'Chrome disponível');
  const raiz=path.resolve(__dirname,'..'),perfil=fs.mkdtempSync(path.join(os.tmpdir(),'bcbr-calendario-'));
  const servidor=spawn(process.execPath,['teste/servidor.js','--simulado','8766'],{cwd:raiz,windowsHide:true,stdio:'pipe'});
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
  ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id){const p=pendentes.get(r.id);pendentes.delete(r.id);if(p)r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result)}
    if(r.method==='Runtime.exceptionThrown')erros.push(r.params.exceptionDetails.exception?.description||r.params.exceptionDetails.text);
    if(r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')consoleErros.push(r.params.args.map(x=>x.value||x.description).join(' '));
    if(r.method==='Fetch.requestPaused'){const p=r.params;call(p.request.url.startsWith('http://127.0.0.1:8766/')?'Fetch.continueRequest':'Fetch.failRequest',{requestId:p.requestId,...(p.request.url.startsWith('http://127.0.0.1:8766/')?{}:{errorReason:'BlockedByClient'})}).catch(()=>{})}
  };
  const ev=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
  await call('Page.enable');await call('Runtime.enable');await call('Fetch.enable',{patterns:[{urlPattern:'*'}]});
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:8766/')).ok)break}catch{}await espera(100)}
  await call('Page.navigate',{url:'http://127.0.0.1:8766/'});
  for(let i=0;i<100;i++){if(await ev("typeof SM!=='undefined'&&SM.ok&&typeof TABS!=='undefined'&&!!document.querySelector('.sm,.nt')"))break;await espera(100)}
  assert.equal(await ev("tela"),'notas','1.53.0: o app abre direto em Notas');
  await ev("go('tarefas')");for(let i=0;i<100;i++){if(await ev("document.querySelector('.sm.sm-tarefas')!==null"))break;await espera(100)}
  // 1.31.0: a aba Tarefas abre sem moldura/seleção na célula única
  assert.equal(await ev("tela==='tarefas'&&!!document.querySelector('.sm.sm-tarefas')"),true,'abre na aba Tarefas');
  assert.equal(await ev("(()=>{const c=document.querySelector('.sm-tarefas .sm-hoje1');if(!c)return true;c.classList.add('kbsel');const s=getComputedStyle(c);const r=s.outlineStyle==='none'&&s.boxShadow==='none';c.classList.remove('kbsel');return r})()"),true,'célula da aba Tarefas sem seleção');
  await ev("go('semana')");
  for(let i=0;i<50;i++){if(await ev("document.querySelector('.sm-cal')!==null"))break;await espera(100)}
  assert.equal(await ev("SM.ok&&!!document.querySelector('.sm-cal')"),true,'app carregou no kit');
  const click=async(s,duplo=false)=>{const p=await ev(`(()=>{const el=document.querySelector(${JSON.stringify(s)});if(!el)throw Error('Ausente: '+${JSON.stringify(s)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);for(let n=1;n<=(duplo?2:1);n++){await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:n,...p});await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:n,...p})}};
  const tecla=async(key,extra={})=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key,...extra});await call('Input.dispatchKeyEvent',{type:'keyUp',key,...extra})};
  await t.test('1: rótulo e Tab / Shift+Tab',async()=>{
    assert.equal(await ev("TABS.find(t=>t[0]==='semana')[1]"),'Calendário');
    assert.equal(await ev("document.querySelector('.sm-row')"),null);
    await ev('document.activeElement.blur()');await tecla('Tab');assert.equal(await ev('tela'),'tarefas');
    await tecla('Tab');assert.equal(await ev('tela'),'notas');await tecla('Tab',{modifiers:8});assert.equal(await ev('tela'),'tarefas');
    await tecla('Tab',{modifiers:8});assert.equal(await ev('tela'),'semana');
    await ev("go('tarefas')");
  });
  await t.test('2, 4–7: cartões, toggle, tipos, checkbox e alça',async()=>{
    assert.equal(await ev("document.querySelectorAll('.sm-hoje1 .sm-row').length"),3);
    assert.equal(await ev("document.querySelector('.sm-hoje1 [data-tid=\"teste-f\"] .sm-tg')"),null);
    assert.equal(await ev("!!document.querySelector('.sm-hoje1 [data-tid=\"teste-t\"] .sm-tg')"),true);
    assert.deepEqual(await ev("(()=>{const b=document.querySelector('.sm-hoje1 [data-tid=\"teste-t\"] .sm-tg');return [b.clientWidth,b.clientHeight,b.textContent]})()"),[18,22,'▸']);
    assert.equal(await ev("/[📚🛠✅]/u.test(document.querySelector('.sm-hoje1 .sm-gs').textContent)"),false);
    assert.equal(await ev("getComputedStyle(document.querySelector('.sm-hoje1 .sm-row')).borderRadius"),'10px');
    assert.equal(await ev("getComputedStyle(document.querySelector('.sm-hoje1 .sm-it input')).appearance"),'none');
    assert.equal(await ev("document.querySelector('.sm-hoje1 .sm-arrastar').textContent"),'⠿');
    await click('.sm-hoje1 [data-tid="teste-t"] .sm-tg');assert.equal(await ev("document.querySelector('.sm-hoje1 [data-tid=\"teste-t\"] .sm-sub').textContent.includes('Etapa fictícia')"),true);
    assert.equal(await ev("document.querySelector('.sm-hoje1 [data-tid=\"teste-t\"] .sm-tg').textContent"),'▾');
    await click('.sm-hoje1 [data-tid="teste-t"] .sm-tg');assert.equal(await ev("document.querySelector('.sm-hoje1 [data-tid=\"teste-t\"] .sm-conteudo')"),null);
    assert.equal(await ev("!!smTar('teste-t').feito"),false);assert.equal(await ev('SM.ed'),null);
    await click('.sm-hoje1 [data-tid="teste-t"] .sm-tg');
    await click('.sm-hoje1 [data-tid="teste-f"] input');await ev('SM.fila');assert.equal(await ev("smTar('teste-f').feito"),true);
    assert.match(await ev("getComputedStyle(document.querySelector('.sm-hoje1 [data-tid=\"teste-f\"] input'),'::after').transform"),/matrix/);
    await ev("smCheck('teste-f',false);SM.fila");
  });
  await t.test('3: dois cliques isolados selecionam; duplo clique abre painel sem lápis',async()=>{
    const s='.sm-hoje1 [data-tid="teste-e"] .sm-texto';await click(s);await espera(550);await click(s);
    assert.equal(await ev('SM.ed'),null);assert.equal(await ev("document.querySelector('.sm-row .sm-edb')"),null);
    await espera(550);await click(s,true);assert.equal(await ev('SM.ed.id'),'teste-e');
    assert.equal(await ev("document.querySelector('.sm-ed').getAttribute('role')"),'dialog');await ev('smEdFecha()');
  });
  await t.test('8: barra removida e lista limitada a domingo–sábado, cruzando mês',async()=>{
    await ev("go('semana')");
    assert.equal(await ev("document.querySelector('.sm-add.sm-c1')"),null);
    await click('[aria-label="Lista da semana atual"]');
    const datas=await ev("[...document.querySelectorAll('.sm-lista .sm-li')].map(x=>x.dataset.drop)");
    assert.deepEqual(datas,await ev('smSemana(smHoje())'));assert.equal(datas.length,7);
    assert.equal(await ev("document.querySelector('.sm-lista').textContent.includes('Fora da semana')"),false);
    await ev("smVis('semana')");
  });
  await t.test('9–10: clique mostra dia, vazio esconde célula e duplo clique adiciona',async()=>{
    const amanha=await ev('smMais(smHoje(),1)');await ev(`SM.semana=smDom('${amanha}');render()`);
    const s=`.sm-cel[data-drop="${amanha}"]`;await click(s);
    assert.equal(await ev('QA.on'),false);assert.equal(await ev('SM.sel'),amanha);
    assert.equal(await ev("document.querySelector('.sm-hoje1')"),null);
    await click(s,true);assert.equal(await ev('SM.diaEditor'),amanha);await click('.sm-pan button[onclick*="qaAbreDia"]');assert.equal(await ev('QA.quando'),amanha);assert.equal(await ev('QA.on'),true);await ev('qaFecha();qaLimpa()');
    const vazio=await ev('smMais(smHoje(),2)');await ev(`SM.semana=smDom('${vazio}');render()`);await click(`.sm-cel[data-drop="${vazio}"]`);
    assert.equal(await ev("document.querySelector('.sm-hoje1')"),null);await ev("SM.sel=null;SM.diaEditor=null;SM.semana=null;go('tarefas')");
  });
  await t.test('11a–f: passos, vários dias com teclado, hora, subtarefa e rascunho',async()=>{
    await ev("qaAbre();qaTxt('Aceite fictício')");await click('#qa_in',true);
    assert.equal(await ev('QA.subtarefas.length'),1);await call('Input.insertText',{text:'Subtarefa nova'});
    await ev('qaPasso(1)');assert.deepEqual(await ev("qaTipos().filter(x=>!x[0].includes('|')).slice(0,3).map(x=>x[0])"),['ferramenta','tarefas','estudo']);
    assert.equal(await ev("/Urgente/i.test(qaHtml())"),false);
    await ev("qaPasso(2);qaEscolhe('quando','sem');qaPasso(3)");assert.equal(await ev('QA.passo'),4);assert.equal(await ev("document.querySelector('#qa_hora')"),null);
    await ev("qaPasso(2);qaEscolhe('quando','varios')");assert.equal(await ev("document.querySelectorAll('[data-cal]').length"),42);
    await tecla('ArrowRight');const cursor=await ev('QA.calCursor');assert.equal(await ev('QA.dias.length'),0);
    await tecla(' ');assert.deepEqual(await ev('QA.dias'),[cursor]);await tecla('Enter');assert.equal(await ev('QA.dias.length'),0);
    await tecla(' ');await tecla('ArrowDown');await tecla('Enter');assert.equal(await ev('QA.dias.length'),2);assert.equal(await ev('QA.on'),true);
    await ev('qaPasso(3)');assert.equal(await ev("!!document.querySelector('#qa_hora')"),true);
    await tecla('ArrowDown');assert.equal(await ev('QA.passo'),4);await tecla('ArrowDown');assert.equal(await ev('QA.passo'),5);
    assert.equal(await ev("[...document.querySelectorAll('.qa-resumo span')].map(x=>x.textContent).includes('Detalhes')"),true);
    await ev('qaSalvar();SM.fila');const novas=await ev("SM.d.tarefas.filter(t=>t.texto==='Aceite fictício')");assert.equal(novas.length,2);assert.equal(novas[0].subtarefas[0].texto,'Subtarefa nova');assert.equal(novas[0].grupo,novas[1].grupo);
  });
  await t.test('11g: aviso legível nos temas claro e escuro',async()=>{
    for(const tema of ['claro','escuro']){await ev(`cfg.tema='${tema}';aplicaTema()`);const cores=await ev("(()=>{const e=document.querySelector('#sm_dz');const s=getComputedStyle(e);return [s.color,s.backgroundColor,e.textContent]})()");assert.notEqual(cores[0],cores[1]);assert.match(cores[2],/Salvei:.*Desfazer/)}
  });
  await t.test('12: B, U, cor, atalhos, sanitização, persistência e texto legado',async()=>{
    await ev("smEdita('teste-t')");assert.equal(await ev("document.querySelector('#sm_ed_txt').textContent"),'Tarefa fictícia');assert.equal(await ev("document.querySelector('#sm_ed_urg')"),null);
    const seleciona=async id=>ev(`(()=>{const e=document.getElementById('${id}');e.focus();const r=document.createRange();r.selectNodeContents(e);const s=getSelection();s.removeAllRanges();s.addRange(r)})()`);
    await seleciona('sm_ed_txt');await tecla('b',{modifiers:2});await tecla('u',{modifiers:2});await tecla('H',{modifiers:10});
    let html=await ev("smSanitiza(document.querySelector('#sm_ed_txt').innerHTML)");assert.match(html,/<(b|strong)>/);assert.match(html,/<u>/);assert.match(html,/span style="color:/);
    await seleciona('sm_ed_det');await call('Input.insertText',{text:'Detalhes formatados'});await seleciona('sm_ed_det');await click('.sm-rich-campo:has(#sm_ed_det) [aria-label="Negrito (Ctrl+B)"]');
    // Toolbar do campo de detalhes, com seleção mantida pelo mousedown.
    await seleciona('sm_ed_det');await ev("smFormata('sm_ed_det','underline')");
    const limpo=await ev("smSanitiza('<script>window.pwn=1</script><img src=x onerror=alert(1)><b onclick=alert(1)>Seguro</b><span style=\"color:#8467bc;background:url(x)\" onmouseover=alert(1)>Cor</span><a href=javascript:alert(1)>Link</a><svg onload=alert(1)>x</svg>')");
    assert.equal(limpo,'<b>Seguro</b><span style="color:rgb(132, 103, 188)">Cor</span>Link');
    assert.match(await ev("smSanitiza('<font color=\"#8467bc\" face=\"Arial\" size=\"7\"><b><u>Legado</u></b></font>')"),/^<span style="color:(?:#8467bc|rgb\(132, 103, 188\))"><b><u>Legado<\/u><\/b><\/span>$/);
    await ev('smSalvar();SM.fila');assert.equal(await ev("smTar('teste-t').urg"),true);assert.equal(await ev("smTar('teste-t').texto"),'Tarefa fictícia');
    html=await ev("smTar('teste-t').textoHtml");assert.match(html,/<u>/);assert.equal(await ev("!!document.querySelector('.sm-hoje1 [data-tid=\"teste-t\"] .sm-texto u')"),true);
    assert.match(html,/<span style="color:/);assert.doesNotMatch(html,/<font\b/);
    assert.deepEqual(await ev("(()=>{const e=document.querySelector('.sm-hoje1 [data-tid=\"teste-t\"] .sm-texto');return [!!e.querySelector('b,strong'),!!e.querySelector('u'),getComputedStyle(e.querySelector('span[style]')).color]})()"),[true,true,'rgb(54, 130, 97)']);
    assert.equal(await ev("smTar('teste-t').det"),'Detalhes formatados');
    assert.match(await ev("smTar('teste-t').detHtml"),/<u>/);
    assert.equal(await ev("smTar('teste-e').det"),'Detalhes antigos sem formatação');
    await ev("smEdita('teste-t')");assert.match(await ev("document.querySelector('#sm_ed_txt').innerHTML"),/<u>/);await ev('smEdFecha()');
  });
  await t.test('2, 7: grid responsivo e arraste real pela alça',async()=>{
    await ev("smPoe([{id:'grid-extra',dia:smHoje(),texto:'Segundo estudo',area:'estudo',feito:false}]);SM.fila");
    assert.equal(await ev("getComputedStyle(document.querySelector('.sm-hoje1 .sm-itens-tipo')).columnCount==='2'"),true);
    await call('Emulation.setDeviceMetricsOverride',{width:800,height:900,deviceScaleFactor:1,mobile:false});
    const grades=await ev("[...document.querySelectorAll('.sm-hoje1 .sm-gs,.sm-sd .sm-gs')].map(e=>({display:getComputedStyle(e).display,gap:getComputedStyle(e).rowGap,largura:e.clientWidth,colunas:getComputedStyle(e).gridTemplateColumns.split(' ').map(Number.parseFloat).filter(w=>w>0)}))");
    assert.equal(grades.length,2);
    for(const g of grades){assert.equal(g.display,'grid');assert.equal(g.gap,'10px');assert.ok(g.colunas.every(w=>w>=240));assert.ok(Math.abs(g.colunas.reduce((a,b)=>a+b,0)+(g.colunas.length-1)*14-g.largura)<2)}
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.equal(await ev("getComputedStyle(document.querySelector('.sm-hoje1 .sm-gs')).gridTemplateColumns.split(' ').length"),1);
    assert.equal(await ev("document.querySelector('.sm-hoje1').scrollWidth<=document.querySelector('.sm-hoje1').clientWidth"),true);
    await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    const p=await ev("(()=>{const r=document.querySelector('.sm-hoje1 [data-tid=\"grid-extra\"] .sm-arrastar');r.scrollIntoView({block:'center'});const b=r.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()");
    await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await call('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:p.x+15,y:p.y+5});
    assert.equal(await ev('!!SMD?.ativo'),true);
    await ev("document.querySelector('.sm-sd').scrollIntoView({block:'center'})");const alvo=await ev("(()=>{const b=document.querySelector('.sm-sd').getBoundingClientRect();return{x:b.x+20,y:b.y+20}})()");
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,...alvo});await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...alvo});await ev('SM.fila');
    assert.equal(await ev("smTar('grid-extra').dia"),'sem');
  });
  await t.test('1.30: texto selecionável, troca de tipo pela alça e grupos com espaçamento compacto',async()=>{
    await ev("go('tarefas');smPoe([{id:'drag-tipo',dia:smHoje(),texto:'Texto selecionável para arrastar só pela alça',area:'estudo'},{id:'alto',dia:smHoje(),texto:'Linha 1\\nLinha 2\\nLinha 3\\nLinha 4',area:'estudo'},{id:'curto',dia:smHoje(),texto:'Curta',area:'estudo'}]);SM.fila");
    const pontos=await ev(`(()=>{const e=document.querySelector('[data-tid="drag-tipo"] .sm-texto');e.scrollIntoView({block:'center'});const b=e.getBoundingClientRect();return {x:b.x+2,y:b.y+8}})()`);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...pontos});
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:pontos.x+90,y:pontos.y});
    assert.equal(await ev('SMD===null'),true,'texto não inicia arrasto');
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:pontos.x+90,y:pontos.y});
    assert.ok((await ev('getSelection().toString()')).length>0,'mouse seleciona texto');
    await ev('getSelection().removeAllRanges()');
    const p=await ev(`(()=>{const e=document.querySelector('[data-tid="drag-tipo"] .sm-arrastar');e.scrollIntoView({block:'center'});const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:p.x+12,y:p.y});
    assert.equal(await ev('SMD.ativo'),true);
    const alvo=await ev(`(()=>{const e=document.querySelector('.sm-hoje1 .sm-grp[data-area="ferramenta"] .sm-lbl');e.scrollIntoView({block:'center'});const b=e.getBoundingClientRect();return {x:b.x+8,y:b.y+b.height/2}})()`);
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,...alvo});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...alvo});await ev('SM.fila');
    assert.equal(await ev("smTar('drag-tipo').area"),'ferramenta');
    assert.equal(await ev("!!document.querySelector('.sm-hoje1 .sm-grp[data-area=\"ferramenta\"] [data-tid=\"drag-tipo\"]')"),true);
    assert.equal(await ev("document.querySelector('.sm-tarefas h2')?.textContent==='Tarefas'"),false);
    assert.equal(await ev("!!(document.querySelector('.sm-planejar').compareDocumentPosition(document.querySelector('[data-tid=\"drag-tipo\"]')) & Node.DOCUMENT_POSITION_PRECEDING)"),true);
    // Em cada coluna, a altura da outra coluna nunca aumenta o intervalo vertical.
    assert.equal(await ev(`(()=>{const rows=[...document.querySelectorAll('.sm-hoje1 .sm-grp[data-area="estudo"] .sm-row')].map(e=>e.getBoundingClientRect());return rows.every((b,i)=>!i||Math.abs(b.x-rows[i-1].x)>2||Math.abs(b.y-rows[i-1].bottom-6)<2)})()`),true);
    for(const tema of ['light','dark']){
      await ev(`document.documentElement.dataset.theme='${tema}'`);
      assert.equal(await ev("getComputedStyle(document.querySelector('[data-tid=\"drag-tipo\"]')).getPropertyValue('--sm-fundo').includes('10%')"),true);
      assert.notEqual(await ev("getComputedStyle(document.querySelector('[data-tid=\"drag-tipo\"]')).backgroundColor"),await ev("getComputedStyle(document.querySelector('.sm-hoje1')).backgroundColor"));
    }
    await ev("delete document.documentElement.dataset.theme");
  });
  await t.test('revisão: detalhes separados de HTML, entidades e tags literais têm round-trip idempotente',async()=>{
    const casos=[
      {det:'A & B'},
      {det:'A &amp; B'},
      {det:'Legado <b>literal</b>'},
      {det:'A & B',detHtml:'<b>A &amp; B</b>'},
    ];
    for(const [i,caso] of casos.entries()){
      const id='roundtrip-'+i;
      await ev(`smPoe([${JSON.stringify({id,dia:'sem',texto:'Regressão',...caso})}]);SM.fila`);
      let anterior;
      for(let rodada=0;rodada<3;rodada++){
        await ev(`smEdita('${id}')`);
        assert.equal(await ev("document.getElementById('sm_ed_det').innerText"),caso.det);
        assert.equal(await ev("!!document.getElementById('sm_ed_det').querySelector('b')"),!!caso.detHtml);
        const html=await ev("document.getElementById('sm_ed_det').innerHTML");
        if(anterior!==undefined)assert.equal(html,anterior,'HTML estável ao reabrir');anterior=html;
        await ev(`smRascEdSalva('${id}');render()`);
        assert.equal(await ev("document.getElementById('sm_ed_det').innerHTML"),html,'rascunho não acumula entidades');
        assert.equal(await ev(`smRascEd('${id}').det`),caso.det);
        await ev('smSalvar();SM.fila');
        assert.equal(await ev(`smTar('${id}').det`),caso.det,'texto puro preservado');
        assert.equal(await ev(`smTar('${id}').detHtml`),html,'HTML separado e estável');
        await ev(`SM.ab.add('${id}')`);
        assert.equal(await ev(`(()=>{const el=document.createElement('div');el.innerHTML=smItem(smTar('${id}'));return el.querySelector('.sm-det').textContent})()`),caso.det);
      }
    }
  });
  await t.test('revisão: Hora só com data ou vários dias; retirar data limpa campo, rascunho e tarefa',async()=>{
    await ev("smPoe([{id:'hora-revisao',dia:smHoje(),texto:'Com hora',hora:'09:30'}]);SM.fila");
    await ev("smEdita('hora-revisao')");assert.equal(await ev("document.getElementById('sm_ed_hora').value"),'09:30');
    await ev("document.getElementById('sm_ed_dia').value='';document.getElementById('sm_ed_dia').dispatchEvent(new Event('change'))");
    assert.equal(await ev("document.getElementById('sm_ed_hora')"),null);
    assert.equal(await ev("smRascEd('hora-revisao').hora"),null);
    await ev("document.getElementById('sm_ed_dia').value=smHoje();document.getElementById('sm_ed_dia').dispatchEvent(new Event('change'))");
    assert.equal(await ev("document.getElementById('sm_ed_hora').value"),'');
    await ev("document.getElementById('sm_ed_hora').value='10:45'");
    await click('.sm-ed button[onclick*="sm_ed_dia"]');
    assert.equal(await ev("document.getElementById('sm_ed_hora')"),null);
    assert.equal(await ev("smExtrasLer().hora"),null);
    await ev('smSalvar();SM.fila');assert.equal(await ev("smTar('hora-revisao').dia"),'sem');assert.equal(await ev("smTar('hora-revisao').hora"),null);
    await ev("smEdita('hora-revisao')");assert.equal(await ev("document.getElementById('sm_ed_hora')"),null);await ev('smEdFecha()');
    // Dados antigos com hora sem data também não são reaproveitados pelo editor.
    await ev("smTar('hora-revisao').hora='12:00';smEdita('hora-revisao')");
    assert.equal(await ev("document.getElementById('sm_ed_hora')"),null);await ev('smSalvar();SM.fila');assert.equal(await ev("smTar('hora-revisao').hora"),null);
    await ev("smPoe([{id:'hora-grupo-a',dia:smHoje(),texto:'Grupo',grupo:'hora-grupo',hora:'08:15'},{id:'hora-grupo-b',dia:smMais(smHoje(),1),texto:'Grupo',grupo:'hora-grupo',hora:'08:15'}]);SM.fila");
    await ev("smEdita('hora-grupo-a')");assert.equal(await ev("document.getElementById('sm_ed_dia')"),null);assert.equal(await ev("document.getElementById('sm_ed_hora').value"),'08:15');
    await ev("document.getElementById('sm_ed_hora').value='07:45';smSalvar();SM.fila");
    assert.deepEqual(await ev("smGrupo(smTar('hora-grupo-a')).map(t=>t.hora)"),['07:45','07:45']);
    await ev("smEdita('hora-grupo-a');smEdEsc('este')");await click('.sm-ed button[onclick*="sm_ed_dia"]');await ev('smSalvar();SM.fila');
    assert.deepEqual(await ev("[smTar('hora-grupo-a').dia,smTar('hora-grupo-a').hora,smTar('hora-grupo-b').hora]"),['sem',null,'07:45']);
  });
  await t.test('regressão: dia futuro limita setas, Enter e F às tarefas visíveis',async()=>{
    const antes=await ev('JSON.stringify(SM.d.tarefas)');
    try{
      await ev("SM.d.tarefas=[{id:'reg-hoje',dia:smHoje(),texto:'Hoje invisível'},{id:'reg-futuro',dia:smMais(smHoje(),1),texto:'Futuro visível'},{id:'reg-sem',dia:'sem',texto:'Sem data'}];SM.sel=smMais(smHoje(),1);go('tarefas');document.activeElement.blur();smkIni()");
      assert.equal(await ev("document.querySelector('[data-tid=\"reg-hoje\"]')"),null);
      const visiveis=await ev("[...document.querySelectorAll('#app .sm-row[data-tid]')].filter(r=>r.getClientRects().length).map(r=>r.dataset.tid)");
      assert.deepEqual(await ev('smkLista().map(t=>t.id)'),visiveis);
      for(let i=0;i<visiveis.length+2;i++){
        await tecla('ArrowDown');
        assert.equal(await ev("!!document.querySelector('#app .sm-row.kbsel')?.getClientRects().length"),true);
      }
      const selecionada=await ev('smkLista()[SMK.i].id');
      await tecla('f',{code:'KeyF'});await ev('SM.fila');
      assert.equal(await ev(`!!smTar('${selecionada}')`),false);
      assert.equal(await ev("!!smTar('reg-hoje')"),true);
      await ev("SMK.on=true;SMK.id='reg-hoje'");await tecla('Enter');await tecla('f',{code:'KeyF'});await ev('SM.fila');
      assert.equal(await ev("!!smTar('reg-hoje')&&!smTar('reg-hoje').feito"),true);
    }finally{await ev(`SM.d.tarefas=${antes};SM.sel=null;render()`)}
  });
  assert.deepEqual(erros,[],'nenhuma exceção JavaScript no navegador');assert.deepEqual(consoleErros,[],'nenhum console.error');
});
