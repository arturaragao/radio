// Tabelas nas Notas (1.51) no Chrome real: /Tabela, digitar, Tab, minibarra de linhas/colunas, dentro de toggle, JSON do importador
// (ida e volta pelo servidor fictício), busca global, Versões, tema escuro e 375 px. Dados fictícios.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {iniciar,espera}=require('./chrome-util.js');

const cel=(tipo,t,bold)=>({type:tipo,attrs:{colspan:1,rowspan:1,colwidth:null},content:[{type:'paragraph',content:[{type:'text',...(bold?{marks:[{type:'bold'}]}:{}),text:t}]}]});
const tabela=()=>({type:'table',content:[
  {type:'tableRow',content:[cel('tableHeader','Achado'),cel('tableHeader','Causa'),cel('tableHeader','Conduta')]},
  {type:'tableRow',content:[cel('tableCell','Megabexiga',true),cel('tableCell','Obstrução'),cel('tableCell','Sondagem')]},
  {type:'tableRow',content:[cel('tableCell','Hidronefrose'),cel('tableCell','Cálculo'),cel('tableCell','Urgência')]}]});
const largaTab=n=>({type:'table',content:[{type:'tableRow',content:Array.from({length:n},(_,i)=>cel('tableHeader','Coluna '+i))},{type:'tableRow',content:Array.from({length:n},(_,i)=>cel('tableCell','valor '+i))}]});
const canon=n=>Array.isArray(n)?n.map(canon):n&&typeof n==='object'?Object.fromEntries(Object.entries(n).filter(([,v])=>v!==null&&v!==undefined).map(([k,v])=>[k,canon(v)]).filter(([k,v])=>!(k==='attrs'&&!Object.keys(v).length))):n;   // como ntCanon: atributos nulos não contam
const semId=n=>{const c=JSON.parse(JSON.stringify(n));const v=x=>{if(x.attrs&&x.type==='table'){delete x.attrs.id;if(!Object.keys(x.attrs).length)delete x.attrs}(x.content||[]).forEach(v)};v(c);return c};

test('Radio 1.51: tabelas nas Notas no Chrome',{timeout:240000},async t=>{
  const C=await iniciar({porta:8783,env:{BCBR_QS:'10'}});t.after(()=>C.fim());
  const {ev,call,click,ate,par,tg,reset,digita,especial}=C;await C.abre('notas');
  const json=()=>ev('NT.ed.getJSON()');
  const tabs=d=>{const o=[];const v=n=>{if(n.type==='table')o.push(n);(n.content||[]).forEach(v)};v(d);return o};
  const textos=tb=>tb.content.map(r=>r.content.map(c=>c.content.map(p=>(p.content||[]).map(x=>x.text).join('')).join('')));
  const cursorEm=texto=>ev(`(()=>{let p=null;NT.ed.state.doc.descendants((n,pos)=>{if(n.isText&&n.text===${JSON.stringify(texto)})p=pos+1});NT.ed.chain().focus().setTextSelection(p).run()})()`);

  await t.test('/Tabela cria 3x3 com cabeçalho; digitar e Tab entre células',async()=>{
    await reset(par(''));
    await digita('/tabela');await ate("!!document.querySelector('.nt-slash .nt-slash-it')");
    assert.match(await ev("document.querySelector('.nt-slash .nt-slash-it b').textContent"),/Tabela/);
    await especial('Enter');await ate("!!document.querySelector('.nt-pm table')");
    const tb=tabs(await json())[0];
    assert.equal(tb.content.length,3);assert.ok(tb.content.every(r=>r.content.length===3));
    assert.deepEqual(tb.content[0].content.map(c=>c.type),['tableHeader','tableHeader','tableHeader']);
    assert.ok(tb.content.slice(1).every(r=>r.content.every(c=>c.type==='tableCell')));
    assert.ok(tb.attrs.id,'a tabela de topo ganha id de bloco');
    await digita('Achado');await especial('Tab');await digita('Causa');await especial('Tab');await digita('Conduta');await especial('Tab');await digita('Megabexiga');
    assert.deepEqual(textos(tabs(await json())[0])[0],['Achado','Causa','Conduta']);
    assert.equal(textos(tabs(await json())[0])[1][0],'Megabexiga');
    await especial('Tab',8);await digita('!');   // Shift+Tab volta uma célula
    assert.equal(textos(tabs(await json())[0])[0][2],'!','Shift+Tab seleciona o conteúdo da célula anterior (padrão do Tiptap)');
  });

  await t.test('Tab/Shift+Tab de lista fora da tabela continuam funcionando',async()=>{
    const item=x=>({type:'listItem',content:[par(x)]});
    await reset({type:'bulletList',content:[item('a'),item('b')]},tabela(),par('fim'));
    await cursorEm('b');
    await especial('Tab');
    const l=(await json()).content[0];assert.equal(l.content.length,1,'b entrou em a');assert.equal(l.content[0].content[1].type,'bulletList');
    await especial('Tab',8);assert.equal((await json()).content[0].content.length,2);
  });

  await t.test('minibarra: linha/coluna e apagar tabela',async()=>{
    await reset(tabela(),par('depois'));
    await cursorEm('Cálculo');
    await ate("!document.querySelector('.nt-tabbar').hidden");
    const n=async()=>{const tb=tabs(await json())[0];return [tb.content.length,tb.content[0].content.length]};
    await click('.nt-tabbar [data-a="linha+"]');assert.deepEqual(await n(),[4,3]);
    await click('.nt-tabbar [data-a="linha-"]');assert.deepEqual(await n(),[3,3]);
    await click('.nt-tabbar [data-a="col+"]');assert.deepEqual(await n(),[3,4]);
    await click('.nt-tabbar [data-a="col-"]');assert.deepEqual(await n(),[3,3]);
    assert.equal(await ev('NT.ed.isFocused'),true,'a minibarra não rouba o foco');
    await click('.nt-tabbar [data-a="apagar"]');assert.equal(tabs(await json()).length,0);
    await ate("document.querySelector('.nt-tabbar').hidden");
  });

  await t.test('tabela dentro de toggle: criar por /Tabela e carregar JSON',async()=>{
    await reset(tg('Comparativo',par('')));
    await ev(`(()=>{const d=document.querySelector('.nt-pm [data-type=details]');if(!d.classList.contains('is-open'))d.querySelector('.nt-seta').click()})()`);
    await ev(`(()=>{let p=null;NT.ed.state.doc.descendants((n,pos)=>{if(n.type.name==='detailsContent'&&p==null)p=pos+2});NT.ed.chain().focus().setTextSelection(p).run()})()`);
    await digita('/tabela');await ate("!!document.querySelector('.nt-slash .nt-slash-it')");await especial('Enter');
    await ate("!!document.querySelector('.nt-pm [data-type=detailsContent] table')");
    await digita('X');await especial('Tab');await digita('Y');
    const tb=tabs(await json())[0];assert.deepEqual(textos(tb)[0].slice(0,2),['X','Y']);
    await reset(tg('Resumo',tabela(),par('nota')));
    assert.equal(await ev("document.querySelectorAll('.nt-pm [data-type=detailsContent] table').length"),1);
    assert.equal(await ev("document.querySelectorAll('.nt-pm [data-type=detailsContent] td, .nt-pm [data-type=detailsContent] th').length"),9);
  });

  await t.test('documento JSON do importador abre, edita e volta igual depois de salvar e recarregar',async()=>{
    const orig=tabela();
    await ev(`NT.ed.commands.setContent(ntDocumento([{id:'btab1',atualizado:'2026-11-13T10:00:00.000Z',conteudo:{...${JSON.stringify(orig)},attrs:{id:'btab1'}}}]),{emitUpdate:true})`);
    await ate("!!document.querySelector('.nt-pm table')");
    assert.equal(await ev("document.querySelectorAll('.nt-pm th').length"),3);
    assert.equal(await ev("document.querySelector('.nt-pm td strong')?.textContent"),'Megabexiga');
    assert.deepEqual(canon(semId(tabs(await json())[0])),canon(orig),'o editor devolve exatamente o formato aceito');
    assert.equal(await C.confirmado(),true);
    await C.abre('notas');
    const salvo=await ev('NT.paginaDados.doc.blocos.map(b=>b.conteudo)');
    assert.deepEqual(canon(semId(salvo.find(x=>x.type==='table'))),canon(orig));
    assert.equal(await ev("document.querySelectorAll('.nt-pm td').length"),6);
  });

  await t.test('busca global e Versões enxergam o texto das células',async()=>{
    const r=await ev(`(()=>{SM.d.notasPaginas=SM.d.notasPaginas||{pastas:[]};const d=bgDocs().filter(d=>d.tipo==='pagina'&&d.corpo.includes('Megabexiga'));
      const s=ntSchema(),no=s.nodeFromJSON(${JSON.stringify(tabela())}),el=TT.pm.model.DOMSerializer.fromSchema(s).serializeNode(no);
      return {achou:d.length,tx:bgTextoNo(${JSON.stringify(tabela())}),dom:el.querySelectorAll('td,th').length,t:el.textContent}})()`);
    assert.ok(r.achou>=1);assert.match(r.tx,/Achado.*Megabexiga.*Obstrução/);assert.equal(r.dom,9);assert.match(r.t,/Hidronefrose/);
  });

  await t.test('importação do Notion gera nó de tabela',async()=>{
    const r=await ev(`(()=>{const h='<html><body><article><div class="page-body"><table class="simple-table"><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td><strong>1</strong> x</td><td>2</td></tr><tr><td>3</td></tr></tbody></table></div></article></body></html>';
      const r=ntNotionConverte(h,'P 0123456789abcdef0123456789abcdef.html');NT.ed.state.schema.nodeFromJSON(r.doc).check();return {d:r.doc,s:r.simplificados}})()`);
    const tb=r.d.content[0];assert.equal(tb.type,'table');assert.equal(r.s,0);
    assert.deepEqual(tb.content.map(l=>l.content.map(c=>c.type)),[['tableHeader','tableHeader'],['tableCell','tableCell'],['tableCell','tableCell']]);
    assert.deepEqual(textos(tb),[['A','B'],['1 x','2'],['3','']]);
    assert.deepEqual(tb.content[1].content[0].content[0].content[0].marks,[{type:'bold'}]);
  });

  await t.test('tema escuro: bordas e cabeçalho por variáveis do tema',async()=>{
    await reset(tabela(),par('fim'));
    const cores=()=>ev(`(()=>{const c=s=>getComputedStyle(document.querySelector(s));return {thBg:c('.nt-pm th').backgroundColor,tdBg:c('.nt-pm td').backgroundColor,bd:c('.nt-pm td').borderTopColor,tx:c('.nt-pm td').color,fs:c('.nt-pm td').fontSize}})()`);
    await ev("document.documentElement.dataset.theme='light'");const cl=await cores();
    await ev("document.documentElement.dataset.theme='dark'");const es=await cores();
    assert.equal(cl.fs,'14px');assert.notEqual(cl.thBg,cl.tdBg);assert.notEqual(es.thBg,es.tdBg);
    assert.notEqual(cl.bd,es.bd);assert.notEqual(cl.tx,es.tx);assert.notEqual(cl.thBg,es.thBg);
    await ev("document.documentElement.dataset.theme='light'");
  });

  await t.test('375 px: tabela larga rola dentro do próprio quadro sem alargar a página',async()=>{
    await call('Emulation.setDeviceMetricsOverride',{width:375,height:800,deviceScaleFactor:1,mobile:false});
    await reset(largaTab(7),par('fim'));await espera(300);
    const m=await ev(`(()=>{const w=document.querySelector('.nt-pm .tableWrapper');return {pg:document.documentElement.scrollWidth,iw:innerWidth,sw:w.scrollWidth,cw:w.clientWidth,ov:getComputedStyle(w).overflowX}})()`);
    assert.ok(m.pg<=m.iw,'a página não rola na horizontal: '+JSON.stringify(m));assert.ok(m.sw>m.cw);assert.equal(m.ov,'auto');
    await call('Emulation.setDeviceMetricsOverride',{width:1000,height:900,deviceScaleFactor:1,mobile:false});
  });

  assert.deepEqual(C.erros,[]);
});
