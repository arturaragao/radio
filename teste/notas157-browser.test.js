// Notas 1.57 no Chrome: (1) retângulo de seleção por células folha em qualquer profundidade (começando na margem em branco); (2) Tab/Shift+Tab recuam o bloco
// (atributo `indent`, máx. 1 nível abaixo do anterior), com várias células, e o recuo persiste/copia/cola. Dados fictícios.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {iniciar}=require('./chrome-util.js');

test('Radio 1.57: Notas (retângulo por células em qualquer nível; Tab recua o bloco)',{timeout:300000},async t=>{
  const C=await iniciar({porta:8804,env:{BCBR_QS:'10'}});t.after(()=>C.fim());
  const {ev,call,espera,par,tg,reset,arrasta,especial,ate}=C;await C.abre('notas');
  const img=src=>({type:'image',attrs:{src}});
  const lista=(...itens)=>({type:'bulletList',content:itens.map(([t,...f])=>({type:'listItem',content:[par(t),...f]}))});
  const poeImagens=async()=>{await ev(`(()=>{const c=document.createElement('canvas');c.width=60;c.height=30;const x=c.getContext('2d');x.fillStyle='#c33';x.fillRect(0,0,60,30);window.__png=c.toDataURL('image/png');BCBR.imgPronta=()=>window.__png})()`)};
  const abre=async()=>{await ev("document.querySelectorAll('.nt-seta').forEach(b=>b.getAttribute('aria-expanded')==='false'&&b.click())");await espera(300)};
  const base=async(...blocos)=>{await poeImagens();await reset(...blocos);await abre();await espera(300)};
  const rot=n=>n.type.name==='image'?n.attrs.src.split('/').pop():n.type.name==='details'?n.firstChild.textContent:n.type.name==='listItem'?'li:'+n.firstChild.textContent:n.textContent;
  const sel=async()=>JSON.parse(await ev(`JSON.stringify(ntBselPos(NT.ed.state).map(p=>(${rot})(NT.ed.state.doc.nodeAt(p))))`));
  // retângulo de (x,y) da margem até o meio de um elemento; as linhas são achadas por texto (p, summary, li>p) ou pelo src (imagem)
  const alvo=x=>ev(`(()=>{const q=${JSON.stringify(x)};const e=q.startsWith('img:')?[...document.querySelectorAll('.nt-pm img.nt-img')].find(i=>(i.getAttribute('src')||'').length&&i.dataset.k===q.slice(4)):[...document.querySelectorAll('.nt-pm p,.nt-pm summary')].find(e=>e.textContent===q);const r=e.getBoundingClientRect();return {l:r.left,r:r.right,y:r.top+r.height/2}})()`);
  const marcaImgs=()=>ev("(()=>{const o=[];NT.ed.state.doc.descendants((n,p)=>{if(n.type.name==='image')o.push([p,n.attrs.src.split('/').pop()])});o.forEach(([p,k])=>{const d=NT.ed.view.nodeDOM(p);if(d)d.dataset.k=k});0})()");
  const pm=()=>ev("(()=>{const r=document.querySelector('.nt-pm').getBoundingClientRect();return {l:r.left,r:r.right}})()");
  const arrastaPor=async(de,ate,lado='esq')=>{   // começa FORA do texto (margem em branco, à esquerda ou direita da coluna), termina dentro do texto
    const a=await alvo(de),b=await alvo(ate),m=await pm();
    const x0=lado==='esq'?m.l-34:m.r+12;
    await arrasta([x0,a.y],[lado==='esq'?b.l+60:b.r-60,b.y],6);await espera(150);
  };
  const doc157=()=>[par('antes'),tg('T1',img('./img/a.png'),par('f1'),par('f2'),tg('T2',img('./img/b.png'),par('g1'),par('g2')),par('f3')),par('fora')];

  await t.test('1: margem à esquerda, sobre imagem e frases dentro do toggle: seleciona só as células (não o toggle pai)',async()=>{
    await base(...doc157());await marcaImgs();
    await arrastaPor('img:a.png','f2');
    assert.deepEqual(await sel(),['a.png','f1','f2']);
  });
  await t.test('1b: dois níveis (toggle dentro de toggle): imagem + frases do toggle interno, sem o título',async()=>{
    await base(...doc157());await marcaImgs();
    await arrastaPor('img:b.png','g1');
    assert.deepEqual(await sel(),['b.png','g1']);
    await arrastaPor('g1','g2','dir');   // começando na margem da direita
    assert.deepEqual(await sel(),['g1','g2']);
  });
  await t.test('1c: passando pela linha do título do toggle interno seleciona o toggle inteiro; níveis misturados somam',async()=>{
    await base(...doc157());await marcaImgs();
    await arrastaPor('f2','g1');
    assert.deepEqual(await sel(),['f2','T2']);
    await arrastaPor('g2','f3');   // fim do toggle interno + frase do nível de cima
    assert.deepEqual(await sel(),['g2','f3']);
    await arrastaPor('antes','T1');
    assert.deepEqual(await sel(),['antes','T1']);
  });
  await t.test('1d: itens de lista (com filhos) em dois níveis: só o que o retângulo cruza; a linha do item leva o item inteiro',async()=>{
    await base(par('antes'),tg('L',lista(['i1',lista(['i1a'],['i1b'])],['i2'])),par('fora'));
    await arrastaPor('i1a','i1b');
    assert.deepEqual(await sel(),['li:i1a','li:i1b']);
    await arrastaPor('i1a','i2');
    assert.deepEqual(await sel(),['li:i1a','li:i1b','li:i2']);
    await arrastaPor('i1','i1a');
    assert.deepEqual(await sel(),['li:i1']);
  });
  await t.test('1e: ações em grupo multi-nível: Delete, Tab/Shift+Tab, copiar',async()=>{
    await base(...doc157());await marcaImgs();
    const forma=()=>ev("(()=>{const t=n=>n.text||(n.content||[]).map(t).join('');const r=n=>n.type==='details'?'d('+t(n.content[0])+'|'+n.content[1].content.map(r).join(',')+')':n.type==='image'?'#'+n.attrs.src.split('/').pop():t(n)+(n.attrs?.indent?'^'+n.attrs.indent:'');return NT.ed.getJSON().content.map(r).join(' ; ')})()");
    await arrastaPor('g2','f3');
    await especial('Delete');await espera(200);
    assert.equal(await forma(),'antes ; d(T1|#a.png,f1,f2,d(T2|#b.png,g1)) ; fora');
    await base(...doc157());await marcaImgs();
    const porTexto=ts=>ev(`(()=>{const o=[];NT.ed.state.doc.descendants((n,p)=>{if(n.type.name==='paragraph'&&${JSON.stringify(ts)}.includes(n.textContent))o.push(p)});NT.ed.view.dispatch(ntBselMeta(NT.ed.state.tr,o));return o.length})()`);
    await porTexto(['f1','g2']);   // níveis misturados (T1 e T2), nenhum bloco anterior é toggle/lista: recuo em cada trecho, seleção continua
    await especial('Tab');await espera(200);
    assert.equal(await forma(),'antes ; d(T1|#a.png,f1^1,f2,d(T2|#b.png,g1,g2^1),f3) ; fora');
    assert.deepEqual(await sel(),['f1','g2'],'a seleção continua depois do recuo');
    await especial('Tab',8);await espera(200);
    assert.equal(await forma(),'antes ; d(T1|#a.png,f1,f2,d(T2|#b.png,g1,g2),f3) ; fora');
    await arrastaPor('g2','f3');   // g2 (dentro de T2) e f3 (logo depois de T2): bloco a bloco, f3 entra no toggle de cima
    assert.deepEqual(await sel(),['g2','f3']);
    await especial('Tab');await espera(200);
    assert.equal(await forma(),'antes ; d(T1|#a.png,f1,f2,d(T2|#b.png,g1,g2^1,f3)) ; fora');
    // copiar com imagens em dois níveis
    await ev(`(()=>{window.__cb=null;const W=window.ClipboardItem;window.ClipboardItem=function(m){this.m=m;this.types=Object.keys(m)};navigator.clipboard.write=async it=>{const o={};for(const k of Object.keys(it[0].m)){const v=await it[0].m[k];o[k]=v instanceof Blob?(k==='image/png'?'png:'+v.size:await v.text()):v}window.__cb=o}})()`);
    await base(par('antes'),tg('T1',tg('T2',par('g1'),img('./img/b.png')),img('./img/a.png'),par('f1')),par('fora'));await marcaImgs();
    await arrastaPor('img:b.png','img:a.png');
    assert.deepEqual(await sel(),['b.png','a.png'],'imagens de níveis diferentes');
    await ev("window.__cb=null;NT.ed.view.dom.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true}))");await ate('!!window.__cb',8000);
    const cb=await ev('window.__cb');
    assert.equal([...cb['text/html'].matchAll(/<img/g)].length,2,'as duas imagens vão no html');
    assert.ok(cb['text/html'].indexOf('data-nt-src="./img/b.png"')<cb['text/html'].indexOf('data-nt-src="./img/a.png"'));
    assert.deepEqual(C.erros,[]);
  });

  // ---- 2: Tab recua ----
  const forma2=()=>ev("NT.ed.getJSON().content.map(n=>(n.content?.map(x=>x.text).join('')||n.type)+'^'+(n.attrs.indent||0)).join(' | ')");
  const cursor=(texto,off=0)=>ev(`(()=>{let p;NT.ed.state.doc.descendants((n,pos)=>{if(n.isText&&n.text===${JSON.stringify(texto)})p=pos});NT.ed.chain().focus().setTextSelection(p+${off}).run()})()`);
  await t.test('2: Tab numa frase em célula própria entra na de cima (recuo); Shift+Tab desfaz; limite de 1 nível abaixo do anterior',async()=>{
    await reset(par('Placas de ateroma com irregularidade parietal difusa.'),par('Ateromatose difusa.'),par('Outra.'));
    await cursor('Ateromatose difusa.',3);await especial('Tab');await espera(200);
    assert.equal(await forma2(),'Placas de ateroma com irregularidade parietal difusa.^0 | Ateromatose difusa.^1 | Outra.^0');
    assert.equal(await ev("NT.ed.state.selection.$from.parent.textContent"),'Ateromatose difusa.','o cursor continua na frase');
    assert.equal(await ev("(()=>{const e=[...document.querySelectorAll('.nt-pm p')].find(p=>p.textContent==='Ateromatose difusa.');return getComputedStyle(e).marginLeft})()"),'28px','recuo visual');
    await especial('Tab');await espera(150);
    assert.equal(await forma2(),'Placas de ateroma com irregularidade parietal difusa.^0 | Ateromatose difusa.^1 | Outra.^0','já está 1 nível abaixo do anterior: não passa');
    await cursor('Outra.',2);await especial('Tab');await especial('Tab');await especial('Tab');await espera(200);
    assert.equal(await forma2(),'Placas de ateroma com irregularidade parietal difusa.^0 | Ateromatose difusa.^1 | Outra.^2','no máximo 1 abaixo da anterior (2 = 1+1)');
    await cursor('Ateromatose difusa.',1);await especial('Tab',8);await espera(200);
    assert.equal(await forma2(),'Placas de ateroma com irregularidade parietal difusa.^0 | Ateromatose difusa.^0 | Outra.^1','Shift+Tab leva junto o que estava recuado sob ela');
    await cursor('Placas de ateroma com irregularidade parietal difusa.',0);await especial('Tab');await espera(150);
    assert.equal(await forma2(),'Placas de ateroma com irregularidade parietal difusa.^0 | Ateromatose difusa.^0 | Outra.^1','o 1º bloco não recua');
    await cursor('Outra.',1);await especial('Tab',8);await espera(150);
    assert.equal(await forma2(),'Placas de ateroma com irregularidade parietal difusa.^0 | Ateromatose difusa.^0 | Outra.^0');
  });
  await t.test('2b: Enter mantém o recuo; apagar a de cima não deixa salto; vários blocos selecionados recuam juntos',async()=>{
    await reset(par('A'),par('B'),par('C'),par('D'));
    await cursor('B',1);await especial('Tab');await especial('Enter');await ev("NT.ed.commands.insertContent('B2')");await espera(150);
    assert.equal(await forma2(),'A^0 | B^1 | B2^1 | C^0 | D^0');
    await ev("NT.ed.view.dispatch(ntBselMeta(NT.ed.state.tr,[2,3].map(i=>{let p=0;for(let k=0;k<i;k++)p+=NT.ed.state.doc.child(k).nodeSize;return p})))");
    await especial('Tab');await espera(200);
    assert.equal(await forma2(),'A^0 | B^1 | B2^2 | C^1 | D^0','grupo B2+C recua 1 (B2 sob B; C sob o anterior)');
    await ev("NT.ed.view.dispatch(ntBselMeta(NT.ed.state.tr,[0]))");await especial('Delete');await espera(200);
    assert.equal(await forma2(),'B^0 | B2^1 | C^1 | D^0','sem o pai, o 1º volta ao nível 0 e o resto não salta');
  });
  await t.test('2c: recuo vai para o plano salvo ({id,atualizado,conteudo}), volta ao reabrir, e sobrevive a copiar/colar nas Notas',async()=>{
    await reset(par('Achado.'),par('Conclusão.'),par('Outro.'));
    await cursor('Conclusão.',2);await especial('Tab');await espera(200);
    const blocos=await ev("JSON.stringify(ntBlocos(NT.ed.getJSON(),[]))");
    const b=JSON.parse(blocos);
    assert.deepEqual(b.map(x=>Object.keys(x).sort().join()),['atualizado,conteudo,id','atualizado,conteudo,id','atualizado,conteudo,id']);
    assert.equal(b[1].conteudo.attrs.indent,1);assert.equal(b[0].conteudo.attrs.indent??null,null,'sem recuo, sem atributo novo (páginas antigas iguais)');
    await ev(`NT.ed.commands.setContent(ntDocumento(${blocos}),{emitUpdate:false})`);await espera(200);
    assert.equal(await forma2(),'Achado.^0 | Conclusão.^1 | Outro.^0');
    // copia a faixa toda e cola no fim de um documento vazio
    const html=await ev("(()=>{const {dom}=NT.ed.view.serializeForClipboard(NT.ed.state.doc.slice(0,NT.ed.state.doc.content.size));return dom.innerHTML})()");
    assert.match(html,/data-indent="1"/);
    await reset(par(''));await ev("NT.ed.commands.focus()");
    await ev(`(()=>{const dt=new DataTransfer();dt.setData('text/html',${JSON.stringify(html)});NT.ed.view.dom.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))})()`);await espera(300);
    assert.match(await forma2(),/Achado\.\^0 \| Conclusão\.\^1 \| Outro\.\^0/);
    assert.deepEqual(C.erros,[]);
  });
  await t.test('2d: Tab continua entrando no toggle de cima e na lista de cima; imagem e título também recuam',async()=>{
    await reset(tg('T',par('x')),par('dentro'));
    await cursor('dentro',1);await especial('Tab');await espera(200);
    assert.equal(await ev("NT.ed.getJSON().content[0].content[1].content.map(n=>n.content[0].text).join()"),'x,dentro','entrou no toggle (não recuou)');
    await reset(par('Título'),img('./img/c.png'),{type:'heading',attrs:{level:2},content:[{type:'text',text:'Sub'}]});
    await ev("NT.ed.chain().focus().setNodeSelection(NT.ed.state.doc.child(0).nodeSize).run()");await especial('Tab');await espera(200);
    await cursor('Sub',1);await especial('Tab');await especial('Tab');await espera(200);
    assert.equal(await ev("NT.ed.getJSON().content.slice(0,3).map(n=>n.attrs.indent||0).join()"),'0,1,2','imagem e título também recuam');
    assert.deepEqual(C.erros,[]);
  });
});
