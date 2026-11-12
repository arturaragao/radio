// Chrome real, API em memória e requisições externas bloqueadas pelo chrome-util.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {iniciar,espera}=require('./chrome-util.js');

test('Radio 1.45: lateral, exclusão, listas e atalhos no Chrome',{timeout:180000},async t=>{
  const C=await iniciar({porta:8780,env:{BCBR_QS:'10'}});t.after(()=>C.fim());
  const {ev,click,mouse,ate,par,reset}=C;await C.abre('notas');
  const rect=(sel,tab=C)=>tab.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)throw Error('Ausente: '+${JSON.stringify(sel)});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width}})()`);
  const move=async(a,b)=>{for(let i=1;i<=16;i++)await mouse('mouseMoved',a.x+(b.x-a.x)*i/16,a.y+(b.y-a.y)*i/16)};
  const esperaTab=async(tab,q)=>{for(let i=0;i<100;i++){if(await tab.ev(q).catch(()=>false))return;await espera(100)}assert.fail(q)};
  const clickTab=async(tab,sel)=>{const r=await rect(sel,tab);for(const type of ['mouseMoved','mousePressed','mouseReleased'])await tab.call('Input.dispatchMouseEvent',{type,x:r.x,y:r.y,button:type==='mouseMoved'?'none':'left',clickCount:1})};

  await t.test('3: menu por clique direito e alça; cancelar, Escape, confirmar pela exclusão existente e recarregar',async()=>{
    const ids=await ev(`(()=>{const ids=[ntPaginaCria(),ntPaginaCria(),ntPaginaCria()];pgMuda(l=>ids.forEach((id,i)=>{l.find(p=>p.id===id).titulo='Página teste '+i}));return ids})()`);
    assert.equal(await C.confirmado(),true);
    const item=id=>`.nt-pg-it[data-pg="${id}"]`;
    const direito=async id=>{const r=await rect(item(id)+' .nt-pg-nome');for(const type of ['mousePressed','mouseReleased'])await C.call('Input.dispatchMouseEvent',{type,x:r.x,y:r.y,button:'right',clickCount:1})};
    await direito(ids[0]);assert.equal(await ev("document.querySelector('#nt_pg_menu button').textContent"),'Excluir');
    await click('#nt_pg_menu [data-excluir]');assert.equal(await ev(`!!pgAchar('${ids[0]}')`),true,'a primeira ação só pede confirmação');
    await click('#nt_pg_menu [data-nao]');assert.equal(await ev(`!!pgAchar('${ids[0]}')`),true);
    await click(item(ids[0])+' .nt-pg-alca');assert.equal(await ev("!!document.querySelector('#nt_pg_menu')"),true);
    await C.especial('Escape');assert.equal(await ev("!!document.querySelector('#nt_pg_menu')"),false);
    // Espiona o caminho existente sem substituir a gravação nem a fila.
    await ev("window.__exclui=ntPaginaExclui;window.__excluidos=[];ntPaginaExclui=id=>{window.__excluidos.push(id);return window.__exclui(id)}");
    for(const [i,via] of [[0,'direito'],[1,'alça']]){
      if(via==='direito')await direito(ids[i]);else await click(item(ids[i])+' .nt-pg-alca');
      await click('#nt_pg_menu [data-excluir]');await click('#nt_pg_menu [data-sim]');
      assert.equal(await ev(`!!pgAchar('${ids[i]}')`),false);assert.equal(await C.confirmado(),true);
    }
    assert.deepEqual(await ev('window.__excluidos'),ids.slice(0,2));
    await C.abre('notas');assert.deepEqual(await ev(`ntPaginas().filter(p=>${JSON.stringify(ids)}.includes(p.id)).map(p=>p.id)`),[ids[2]],'exclusão confirmada no servidor fictício, sobrevivente preservada');
  });

  await t.test('4: alça alcançável, clique seleciona item correto e menu move; listas simples/aninhadas, numeradas e checklist',async()=>{
    for(const tipo of ['bulletList','orderedList','taskList'])for(const aninhado of [false,true]){
      const item=texto=>({type:tipo==='taskList'?'taskItem':'listItem',content:[par(texto)]});
      const filhos=[item('alvo'),item('destino')],lista={type:tipo,content:aninhado?[{...item('pai'),content:[par('pai'),{type:tipo,content:filhos}]},item('irmão')]:filhos};
      await reset(par('antes'),lista,par('depois'));
      await ev('NT.menuEl.hidden=true');
      const antes=await ev('JSON.stringify(NT.ed.getJSON())');
      const seletores=aninhado?'.nt-pm li li p':'.nt-pm li p';
      const texto=await rect(seletores);await mouse('mouseMoved',texto.x,texto.y);
      const al=await rect('.nt-alca');await move(texto,al);
      assert.equal(await ev('NT.alcaEl.hidden'),false,tipo+' aninhado='+aninhado+': margem não esconde a alça');
      assert.equal(await ev(`document.elementFromPoint(${al.x},${al.y})===NT.alcaEl`),true,'alça recebe o mouse');
      await click('.nt-alca');
      assert.equal(await ev('NT.menuEl.hidden'),false);
      assert.equal(await ev('NT.ed.state.selection.node?.textContent'),'alvo','seleciona apenas o item, sem o pai/irmãos');
      await click('.nt-menu-bloco [data-a=descer]');
      assert.deepEqual(await ev(`[...document.querySelectorAll(${JSON.stringify(seletores)})].map(e=>e.textContent).slice(0,2)`),['destino','alvo']);
      await C.ctrl('z');assert.equal(await ev('JSON.stringify(NT.ed.getJSON())'),antes,'Ctrl+Z restaura movimento pelo menu');
      // Drag HTML5 pela alça, como nos testes existentes, com drop real do ProseMirror.
      const d=await ev(`(()=>{const e=[...NT.el.querySelectorAll('p')].find(e=>e.textContent==='destino'),r=e.getBoundingClientRect();return {x:r.left+30,y:r.bottom-1}})()`);
      const origem=await rect(seletores);await mouse('mouseMoved',origem.x,origem.y);await move(origem,await rect('.nt-alca'));
      await ev(`(()=>{const dt=new DataTransfer(),al=NT.alcaEl,pm=NT.ed.view.dom;al.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:dt}));for(const type of ['dragover','drop'])pm.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:dt,clientX:${d.x},clientY:${d.y}}));al.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:dt}))})()`);
      assert.deepEqual(await ev(`[...document.querySelectorAll(${JSON.stringify(seletores)})].map(e=>e.textContent).slice(0,2)`),['destino','alvo'],'arrasto move só o item no nível correto');
      assert.equal(await ev("NT.ed.state.doc.textContent.split('alvo').length-1"),1,'não duplica');
      await C.ctrl('z');assert.equal(await ev('JSON.stringify(NT.ed.getJSON())'),antes,'Ctrl+Z restaura arrasto');
    }
  });

  await t.test('1/2: ações discretas nos dois temas; página própria com hover/fixar/resize/troca e Notas completas em ?aba=notas',async()=>{
    for(const tema of ['light','dark']){
      await ev(`document.documentElement.dataset.theme='${tema}'`);await mouse('mouseMoved',900,800);
      const estilos=await ev("[...document.querySelectorAll('.nt-lat-acoes button')].map(e=>{const s=getComputedStyle(e);return {bg:s.backgroundColor,bd:s.borderTopWidth,cor:s.color,mut:getComputedStyle(document.documentElement).getPropertyValue('--mut').trim(),size:parseFloat(s.fontSize)}})");
      assert.equal(estilos.length,4);assert.ok(estilos.every(s=>s.bg==='rgba(0, 0, 0, 0)'&&s.bd==='0px'&&s.size<13));
    }
    assert.equal(await C.confirmado(),true);
    const ids=await ev('(()=>{const ids=[ntPaginaCria(),ntPaginaCria()];pgMuda(l=>ids.forEach((id,i)=>l.find(p=>p.id===id).titulo="Separada "+i));return ids})()');
    assert.equal(await C.confirmado(),true);
    await ev("localStorage.setItem(NT_LAT,'0')");
    const A=await C.novaAba();try{
      await A.abre(C.URL_+'?pagina='+ids[0]);await esperaTab(A,'!!NP?.ed');
      assert.equal(await A.ev("getComputedStyle(document.querySelector('#nt_lat_bt')).display!=='none'"),true);
      const inicio=await rect('.nt-conteudo',A),bt=await rect('#nt_lat_bt',A);
      await A.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:bt.x,y:bt.y});
      assert.equal(await A.ev("document.querySelector('.nt-corpo').classList.contains('lat-hover')"),true);
      assert.equal((await rect('.nt-conteudo',A)).l,inicio.l,'hover sobreposto');
      await clickTab(A,'#nt_lat_bt');assert.equal(await A.ev('ntLateralAberta()'),true);
      assert.ok((await rect('.nt-conteudo',A)).l>inicio.l,'fixar reserva largura');
      const rz=await rect('#nt_lat_rz',A);
      for(const [type,x] of [['mousePressed',rz.x],['mouseMoved',rz.x+70],['mouseReleased',rz.x+70]])await A.call('Input.dispatchMouseEvent',{type,x,y:rz.y,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1});
      assert.equal(await A.ev('ntLatW()'),300);
      const abas=(await C.call('Target.getTargets')).targetInfos.filter(t=>t.type==='page').length;
      await clickTab(A,`.nt-pg-it[data-pg="${ids[1]}"] .nt-pg-nome`);await esperaTab(A,`NP?.pagina==='${ids[1]}'`);
      assert.equal(await A.ev('location.search'),'?pagina='+ids[1]);assert.equal(await A.ev('document.title'),'Separada 1');
      assert.equal((await C.call('Target.getTargets')).targetInfos.filter(t=>t.type==='page').length,abas,'troca na mesma aba');
      for(const tema of ['light','dark']){
        await A.call('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:false});
        await A.ev(`document.documentElement.dataset.theme='${tema}'`);
        await esperaTab(A,"document.querySelector('.nt-corpo').classList.contains('lat-off')");
        await clickTab(A,'#nt_lat_bt');
        assert.equal(await A.ev("getComputedStyle(document.querySelector('#nt_lat')).display!=='none'"),true);
        assert.ok((await rect('#nt_lat',A)).r<=375);
        // No celular a lateral sobrepõe o botão: fecha tocando o fundo externo.
        for(const type of ['mousePressed','mouseReleased'])await A.call('Input.dispatchMouseEvent',{type,x:370,y:700,button:'left',clickCount:1});
        await esperaTab(A,"document.querySelector('.nt-corpo').classList.contains('lat-off')");
      }
      await A.abre(C.URL_+'?aba=notas');await esperaTab(A,'!!NT?.ed&&!!document.querySelector("#nt_lat")');
      assert.equal(await A.ev('document.title'),'Notas');assert.equal(await A.ev("document.querySelectorAll('.nt-lat-acoes button').length"),4);
      await A.ev('ntBuscaAbre(NT)');assert.equal(await A.ev('!!NT.buscaEl'),true);
      await A.ev('ntAtalhosAbre(NT)');assert.equal(await A.ev('!!document.querySelector("#nt_atalhos")'),true);
      assert.equal(await A.ev("!!document.querySelector('[onclick=\"ntNotionEscolhe()\"]')&&!!document.querySelector('.nt-pastas')"),true);
      assert.deepEqual(A.erros,[]);
    }finally{await A.fecha();await C.call('Page.bringToFront')}
    await C.abre('notas');
  });

  await t.test('5: Atalhos oculto inicialmente; abre/fecha, persiste após reload, funciona no celular e com storage indisponível',async()=>{
    const quiz="iniciar(Q.slice(0,2).map(q=>q.id),'estudo')";
    await ev(quiz);await ate("!!document.querySelector('.qatalhos-bt')");
    assert.equal(await ev("document.querySelector('#q_atalhos').hidden"),true);
    await click('.qatalhos-bt');assert.equal(await ev("document.querySelector('#q_atalhos').hidden"),false);
    assert.equal(await ev("document.querySelector('.qatalhos-bt').getAttribute('aria-expanded')"),'true');
    assert.equal(await ev("localStorage.getItem(Q_ATALHOS)"),'1');
    await C.abre();await ev(quiz);await ate("!!document.querySelector('.qatalhos-bt')");
    assert.equal(await ev("document.querySelector('#q_atalhos').hidden"),false,'estado sobrevive ao reload');
    await C.call('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:false});
    assert.notEqual(await ev("getComputedStyle(document.querySelector('#q_atalhos')).display"),'none','aberto também no celular');
    await click('.qatalhos-bt');assert.equal(await ev("document.querySelector('#q_atalhos').hidden"),true);assert.equal(await ev("localStorage.getItem(Q_ATALHOS)"),'0');
    await ev("window.__setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error('storage fictício indisponível')}");
    try{await click('.qatalhos-bt');assert.equal(await ev("document.querySelector('#q_atalhos').hidden"),false);await click('.qatalhos-bt');assert.equal(await ev("document.querySelector('#q_atalhos').hidden"),true)}finally{await ev('Storage.prototype.setItem=window.__setItem')}
  });
  assert.deepEqual(C.erros,[],'sem exceções de runtime');
});
