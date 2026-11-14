// 1.49: copiar imagem, /Imagem no celular, barra lateral mais rápida, título estilo Notion e botões de frase ocultos.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {iniciar,espera}=require('./chrome-util.js');
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
test('Radio 1.49: layout e imagens nas notas',{timeout:90000},async t=>{
  const C=await iniciar({porta:8793,env:{BCBR_QS:'10'}});t.after(()=>C.fim());
  const {ev,ate}=C;await C.abre('notas');await ate("!!NT.ed&&!!document.querySelector('#nt_titulo')");
  await t.test('6: botões de frase ocultos, dados e /Frase mantidos',async()=>{
    assert.equal(await ev("!!document.querySelector('.nt-barra [data-m=frase],.nt-barra [data-m=frases]')"),false);
    assert.equal(await ev("NT_SLASH.some(i=>i[0]==='Frase')&&typeof ntFrasesGerencia==='function'&&Array.isArray(ntFrases())"),true);
  });
  await t.test('3: título grande abaixo, texto de 708 px centralizado; celular com 32 px',async()=>{
    const g=await ev("(()=>{const t=document.getElementById('nt_titulo'),r=t.getBoundingClientRect(),e=document.getElementById('nt_raiz').getBoundingClientRect(),b=document.querySelector('.nt-topo').getBoundingClientRect();return {fs:getComputedStyle(t).fontSize,fw:getComputedStyle(t).fontWeight,gap:r.top-b.bottom,w:e.width,t:r.top}})()");
    assert.equal(g.fs,'40px');assert.equal(g.fw,'700');assert.ok(g.gap>=80&&g.gap<=100,JSON.stringify(g));assert.ok(g.w<=708.5,JSON.stringify(g));
    await C.call('Emulation.setDeviceMetricsOverride',{width:375,height:800,deviceScaleFactor:1,mobile:false});
    const m=await ev("(()=>{const t=document.getElementById('nt_titulo').getBoundingClientRect(),b=document.querySelector('.nt-topo').getBoundingClientRect();return t.top-b.bottom})()");
    assert.ok(m>=28&&m<=40,String(m));
    await C.call('Emulation.clearDeviceMetricsOverride');
  });
  await t.test('4: html com o mesmo fundo do tema e theme-color igual à faixa',async()=>{
    assert.equal(await ev("getComputedStyle(document.documentElement).backgroundColor===getComputedStyle(document.body).backgroundColor"),true);
    await ev("document.documentElement.dataset.theme='light'");await espera(100);
    assert.equal(await ev("[...document.querySelectorAll('meta[name=theme-color]')].every(m=>m.content===getComputedStyle(document.documentElement).getPropertyValue('--band').trim())"),true);
  });
  await t.test('2: Ctrl+C na imagem selecionada copia a imagem (PNG)',async()=>{
    await ev("window.__itens=[];navigator.clipboard.write=async it=>{window.__itens=await Promise.all(it.map(async i=>({tipos:i.types,blob:await i.getType('image/png').then(b=>b.type+':'+b.size)})))};0");
    await ev(`NT.ed.chain().focus().insertContent({type:'image',attrs:{src:'${PNG}'}}).run();0`);
    await ev("(()=>{let p=-1;NT.ed.state.doc.descendants((n,pos)=>{if(n.type.name==='image')p=pos});NT.ed.commands.setNodeSelection(p)})()");
    await ate("NT.ed.state.selection.node?.type.name==='image'&&document.querySelector('.nt-img')?.complete");
    await C.ctrl('c');await ate("window.__itens.length===1");
    const r=await ev('window.__itens[0]');assert.ok(r.tipos.includes('image/png'),'1.56: além do PNG, vão text/html e text/plain');assert.match(r.blob,/^image\/png:\d+$/);
  });
  await t.test('5: /Imagem abre o seletor de arquivo (image/*) e insere pela rotina do colar',async()=>{
    await ev("window.__cliques=0;HTMLInputElement.prototype.click=function(){if(this.type==='file')window.__cliques++};window.__ins=[];ntInsereImagem=(f,p,c)=>{window.__ins.push(f.name)};0");
    await ev("ntEscolheImagem(NT);0");
    assert.equal(await ev("window.__cliques"),1);
    assert.equal(await ev("(()=>{const i=document.getElementById('nt_arquivo');return i.parentNode===document.body&&i.accept==='image/*'&&i.type==='file'})()"),true);
    await ev("(()=>{const i=document.getElementById('nt_arquivo'),d=new DataTransfer();d.items.add(new File(['x'],'foto.png',{type:'image/png'}));i.files=d.files;i.dispatchEvent(new Event('change'))})()");
    assert.deepEqual(await ev("window.__ins"),['foto.png']);
  });
  await t.test('1: barra lateral some em ~150 ms depois que o mouse sai',async()=>{
    assert.equal(await ev("NT_LAT_ATRASO"),150);
  });
  assert.deepEqual(C.erros,[]);
});
