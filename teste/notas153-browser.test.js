// Notas 1.53 no Chrome: "> " numa linha com texto vira toggle (texto = título), Tab/Shift+Tab com imagem e em linha comum, fechar toggle no fim da
// rolagem sem a página pular e página aberta que não se redesenha quando o remoto traz o mesmo conteúdo. Dados fictícios.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {iniciar,espera}=require('./chrome-util.js');

const img=id=>({type:'image',attrs:{src:'./img/ficticia.png',...(id?{id}:{})}});
const item=(x,...f)=>({type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:x}]},...f]});
const lista=(...it)=>({type:'bulletList',content:it});

test('Radio 1.53: Notas (toggle por ">", Tab em imagem e linha comum, fechar toggle, sem redesenho)',{timeout:240000},async t=>{
  const C=await iniciar({porta:8802,env:{BCBR_QS:'10'}});t.after(()=>C.fim());
  const {ev,ate,par,tg,reset,digita,especial}=C;await C.abre('notas');
  const json=()=>ev('NT.ed.getJSON()');
  const txt=n=>(n.content||[]).map(x=>x.text||txt(x)).join('');
  const cursorEm=texto=>ev(`(()=>{let p=null;NT.ed.state.doc.descendants((n,pos)=>{if(n.isText&&n.text===${JSON.stringify(texto)})p=pos});NT.ed.chain().focus().setTextSelection(p+1).run()})()`);
  const cursorIni=texto=>ev(`(()=>{let p=null;NT.ed.state.doc.descendants((n,pos)=>{if(n.isText&&n.text===${JSON.stringify(texto)})p=pos});NT.ed.chain().focus().setTextSelection(p).run()})()`);
  const selImagem=()=>ev(`(()=>{let p=null;NT.ed.state.doc.descendants((n,pos)=>{if(n.type.name==='image'&&p==null)p=pos});NT.ed.chain().focus().setNodeSelection(p).run();return NT.ed.state.selection.node?.type.name})()`);
  const tipos=d=>d.content.map(n=>n.type);

  await t.test('1: "> " numa linha com texto (ou vazia) vira toggle com o texto no título; também em toggle e em lista',async()=>{
    await reset(par('texto existente'),par('outra'));
    await cursorIni('texto existente');await digita('> ');
    let d=await json();assert.deepEqual(tipos(d).slice(0,2),['details','paragraph']);
    assert.equal(txt(d.content[0].content[0]),'texto existente');assert.equal(txt(d.content[0].content[1]),'','conteúdo do toggle vazio');
    assert.equal(await ev('NT.ed.state.selection.$from.parent.type.name'),'detailsSummary','cursor no título');
    assert.equal(await ev("document.querySelectorAll('.nt-pm [data-type=details]').length"),1);
    // linha vazia
    await reset(par('antes'),par(''));
    await ev("NT.ed.chain().focus('end').run()");await digita('> ');
    d=await json();assert.equal(d.content[1].type,'details');assert.equal(txt(d.content[1]),'');
    // dentro de um toggle
    await reset(tg('pai',par('filho um'),par('filho dois')));
    await ev(`(()=>{const d=document.querySelector('.nt-pm [data-type=details]');if(!d.classList.contains('is-open'))d.querySelector('.nt-seta').click()})()`);
    await cursorIni('filho dois');await digita('> ');
    d=await json();const cont=d.content[0].content[1].content;
    assert.deepEqual(cont.map(n=>n.type),['paragraph','details']);assert.equal(txt(cont[1].content[0]),'filho dois');
    // em item de lista (1º parágrafo do item): a linha sai da lista e vira toggle; os outros itens ficam
    await reset(lista(item('a1'),item('a2'),item('a3')));
    await cursorIni('a2');await digita('> ');
    d=await json();assert.ok(d.content.some(n=>n.type==='details'&&txt(n.content[0])==='a2'),'a2 virou toggle');
    const todo=JSON.stringify(d);for(const x of ['a1','a2','a3'])assert.ok(todo.includes(x),'texto '+x+' preservado');
    // lista aninhada
    await reset(lista(item('pai',lista(item('f1'),item('f2')))));
    await cursorIni('f2');await digita('> ');
    d=await json();const s=JSON.stringify(d);for(const x of ['pai','f1','f2'])assert.ok(s.includes(x));assert.ok(s.includes('"detailsSummary"'));
    assert.deepEqual(C.erros,[]);
  });

  await t.test('3: Tab com imagem selecionada entra no bloco anterior; Shift+Tab tira',async()=>{
    await reset(tg('Toggle',par('x')),img(),par('fim'));
    assert.equal(await selImagem(),'image');
    await especial('Tab');
    let d=await json();assert.deepEqual(tipos(d).filter(x=>x!=='paragraph'),['details'],'imagem saiu do topo');
    assert.ok(d.content[0].content[1].content.some(n=>n.type==='image'),'imagem dentro do conteúdo do toggle');
    assert.equal(await ev('NT.ed.state.selection.node?.type.name'),'image','continua selecionada');
    await especial('Tab',8);
    d=await json();assert.deepEqual(tipos(d).slice(0,2),['details','image'],'Shift+Tab: depois do toggle');
    // lista antes da imagem: vira filho do último item
    await reset(lista(item('um'),item('dois')),img(),par('fim'));
    await selImagem();await especial('Tab');
    d=await json();assert.equal(d.content[0].content[1].content.length,2,'item "dois" ganhou a imagem');assert.equal(d.content[0].content[1].content[1].type,'image');
    assert.ok(!tipos(d).includes('image'));
    await especial('Tab',8);d=await json();assert.deepEqual(tipos(d).slice(0,2),['bulletList','image']);
    assert.equal(d.content[0].content.length,2);
    assert.deepEqual(C.erros,[]);
  });

  await t.test('4: Tab/Shift+Tab em linha comum (depois de toggle, lista, parágrafo) e sem quebrar lista/tabela',async()=>{
    // anterior toggle
    await reset(tg('T',par('x')),par('linha'));
    await cursorEm('linha');await especial('Tab');
    let d=await json();assert.equal(d.content[0].content[1].content.at(-1).content[0].text,'linha');
    await especial('Tab',8);d=await json();assert.deepEqual(tipos(d).slice(0,2),['details','paragraph']);assert.equal(txt(d.content[1]),'linha');
    // anterior item de lista
    await reset(lista(item('um'),item('dois')),par('solta'),par('fim'));
    await cursorEm('solta');await especial('Tab');
    d=await json();const it=d.content[0].content[1];
    assert.equal(it.content.length,2);assert.equal(txt(it.content[1]),'solta');assert.equal(txt(d.content[1]),'fim');
    await especial('Tab',8);d=await json();
    assert.deepEqual(tipos(d).slice(0,3),['bulletList','paragraph','paragraph']);assert.equal(txt(d.content[1]),'solta');assert.equal(d.content[0].content[1].content.length,1);
    // Shift+Tab num filho de item que NÃO é o último item: a lista se divide e nada se perde
    await reset(lista(item('um',{type:'paragraph',content:[{type:'text',text:'filho'}]}),item('dois'),item('tres')),par('fim'));
    await cursorEm('filho');await especial('Tab',8);
    d=await json();assert.deepEqual(tipos(d).slice(0,4),['bulletList','paragraph','bulletList','paragraph']);
    assert.equal(txt(d.content[1]),'filho');assert.equal(d.content[2].content.length,2);assert.equal(d.content[0].content.length,1);
    // anterior parágrafo comum: ele vira o título de um toggle e a linha, o conteúdo
    await reset(par('pai comum','id-pai'),par('filha'),par('fim'));
    await cursorEm('filha');await especial('Tab');
    d=await json();assert.equal(d.content[0].type,'details');assert.equal(d.content[0].attrs.id,'id-pai','mantém o id do bloco');
    assert.equal(txt(d.content[0].content[0]),'pai comum');assert.equal(txt(d.content[0].content[1]),'filha');assert.equal(txt(d.content[1]),'fim');
    assert.equal(await ev('NT.ed.state.selection.$from.parent.textContent'),'filha','cursor na linha movida');
    await especial('Tab',8);d=await json();assert.equal(txt(d.content[1]),'filha');
    // Tab de lista continua aninhando (1.41)
    await reset(lista(item('a'),item('b')));
    await cursorEm('b');await especial('Tab');d=await json();assert.equal(d.content[0].content.length,1);assert.equal(d.content[0].content[0].content[1].type,'bulletList');
    assert.deepEqual(C.erros,[]);
  });

  await t.test('5: fechar o toggle no fim da rolagem mantém o toggle na mesma posição da tela',async()=>{
    const pos=()=>ev("(()=>{const b=document.querySelector('.nt-pm .nt-seta').getBoundingClientRect();return {y:b.top,x:b.left,sy:scrollY}})()");
    let antes;   // toggle com linhas suficientes para rolar, mas ainda com o título visível (abaixo da barra do topo) com a página no fim
    for(const n of [16,17,18,19,20,22]){   // (a página tem uma altura mínima: só rola mais que ela com toggle grande o bastante para fechar encolhê-la)
      await reset(par('começo'),tg('Grande',...Array.from({length:n},(_,i)=>par('linha '+i))));
      await ev("document.querySelectorAll('.nt-seta').forEach(b=>b.getAttribute('aria-expanded')!=='true'&&b.click())");
      await ev("window.scrollTo(0,document.documentElement.scrollHeight)");await espera(200);
      antes=await pos();if(antes.sy>190&&antes.y>100)break;
    }
    assert.ok(antes.sy>190&&antes.y>100,'preparo: página rolada com o título visível '+JSON.stringify(antes));
    await C.mouse('mouseMoved',antes.x+5,antes.y+5);await C.mouse('mousePressed',antes.x+5,antes.y+5);await C.mouse('mouseReleased',antes.x+5,antes.y+5);await espera(300);
    assert.equal(await ev("document.querySelector('.nt-pm [data-type=details]').classList.contains('is-open')"),false,'fechou');
    const depois=await pos();assert.ok(Math.abs(depois.y-antes.y)<=2,`toggle ficou em ${depois.y} e estava em ${antes.y}`);
    // abre de novo no mesmo ponto; Ctrl+Enter também mantém
    await C.mouse('mouseMoved',antes.x+5,antes.y+5);await C.mouse('mousePressed',antes.x+5,antes.y+5);await C.mouse('mouseReleased',antes.x+5,antes.y+5);await espera(300);
    const aberto=await pos();assert.ok(Math.abs(aberto.y-antes.y)<=2);
    await ev("NT.ed.commands.setTextSelection(NT.ed.state.doc.content.size-3)");await ev("NT.ed.chain().focus().setTextSelection(4).run()");
    await ev("window.scrollTo(0,document.documentElement.scrollHeight)");await espera(150);
    const a2=await pos();await C.ctrl('Enter',2);await espera(300);const d2=await pos();
    assert.ok(Math.abs(d2.y-a2.y)<=2,'Ctrl+Enter também mantém a posição');
    await ev("NT.ed.commands.insertContent('x')");assert.equal(await ev("NT.el.style.minHeight"),'','a altura reservada some ao editar');
  });

  await t.test('2: remoto com o mesmo conteúdo não redesenha nem mexe no cursor; mudança do plano não refaz a aba Notas; ids repetidos não duplicam',async()=>{
    await reset(par('um','b1'),par('dois','b2'),tg('tog',par('dentro')),par('tres','b3'));
    await cursorEm('dois');await ev("NT.ed.commands.insertContent(' meio')");
    assert.equal(await C.confirmado(),true);
    // "outro aparelho": regrava a página e o índice direto no GitHub fictício (sha novo)
    await ev(`window.__outro=async fn=>{const base='/repos/'+BCBR.REPO+'/contents/',dec=f=>JSON.parse(decodeURIComponent(escape(atob(f.content.split(String.fromCharCode(10)).join(''))))),pg=base+'notas/paginas/notas.json',ix=base+'notas/indice.json';
      const f=await BCBR.api(pg),p=dec(f);fn(p);
      const r=await BCBR.api(pg,{method:'PUT',body:JSON.stringify({message:'outro',branch:'main',sha:f.sha,content:BCBR.b64(JSON.stringify(p))})});
      const fi=await BCBR.api(ix),ind=dec(fi),e=ind.find(x=>x.id==='notas');e.sha=r.content.sha;e.atualizado=p.atualizado;
      await BCBR.api(ix,{method:'PUT',body:JSON.stringify({message:'outro',branch:'main',sha:fi.sha,content:BCBR.b64(JSON.stringify(ind))})});return 1};0`);
    const sel0=await ev('NT.ed.state.selection.from');
    await ev("window.__tr=0;NT.ed.on('transaction',()=>window.__tr++);0");
    await ev("__outro(p=>{p.atualizado=new Date(Date.now()+5000).toISOString();p.aparelhoId='outro';p.doc.blocos.forEach(b=>b.atualizado=p.atualizado)})");
    await ev("(async()=>{await SyncNotas.listarPaginas();await ntSincroniza();return 1})()");await espera(400);
    assert.equal(await ev('window.__tr'),0,'nenhuma transação no editor: conteúdo igual não redesenha');assert.equal(await ev('NT.ed.state.selection.from'),sel0,'cursor não pulou');
    // mudança do plano com a Notas montada e foco fora: a tela não é refeita (o mesmo elemento continua lá)
    await ev("document.activeElement.blur();document.querySelector('.nt').dataset.marca='1';smRender();0");await espera(200);
    assert.equal(await ev("document.querySelector('.nt').dataset.marca"),'1','a aba Notas não foi redesenhada');
    assert.equal(await ev("document.querySelectorAll('.nt-pm').length"),1);
    // remoto realmente diferente é aplicado (só o bloco que mudou), sem duplicar
    await ev("__outro(p=>{const b=p.doc.blocos.find(x=>x.id==='b3');b.conteudo.content[0].text='tres remoto';b.atualizado=new Date(Date.now()+9000).toISOString();p.atualizado=b.atualizado})");
    await ev("(async()=>{await SyncNotas.listarPaginas();await ntSincroniza();return 1})()");await espera(400);
    const tx=await ev('NT.ed.getText()');assert.match(tx,/tres remoto/);assert.match(tx,/d meioois/);
    const topo=(await json()).content;assert.deepEqual([topo[0],topo[1],topo[3]].map(n=>n.attrs.id),['b1','b2','b3']);
    assert.equal(topo.filter(n=>txt(n)==='um').length,1);assert.equal(topo.filter(n=>/tres/.test(txt(n))).length,1,'sem cópia do bloco');
  });
});
