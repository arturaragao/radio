const {test}=require('node:test');
const assert=require('node:assert/strict');
const {iniciar,espera}=require('./chrome-util.js');
test('Pastas 1.43: criar, renomear, mover, recolher, arrastar, excluir; desktop e 375 px',{timeout:120000},async t=>{
  const C=await iniciar({porta:8775});t.after(()=>C.fim());const {ev,click,ate}=C;await C.abre('notas');
  const rect=sel=>ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+8,r.y+r.height/2]})()`);
  const arrastaToque=async(de,para)=>{await C.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:de[0],y:de[1],id:1}]});for(let i=1;i<=6;i++){await C.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:de[0]+(para[0]-de[0])*i/6,y:de[1]+(para[1]-de[1])*i/6,id:1}]});await espera(35)}await C.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await espera(120)};
  for(const largura of [1000,375]){
    await C.call('Emulation.setDeviceMetricsOverride',{width:largura,height:900,deviceScaleFactor:1,mobile:false});
    if(largura===375){await espera(250);await click('#nt_lat_bt');await ate("!document.querySelector('.nt-corpo').classList.contains('lat-off')")}
    await click('[onclick="ntPastaForm(\'\',\'criar\')"]');await ate("!!document.querySelector('.nt-pt-titulo')");await ev(`document.querySelector('.nt-pt-titulo').value='Pasta fictícia ${largura}'`);await click('.nt-pt-form [type=submit]');
    assert.equal(await C.confirmado(),true);const id=await ev('ntPastas().at(-1).id');assert.equal(await ev(`document.querySelector('[data-pasta="${id}"] .nt-pt-nome').textContent.includes('Pasta fictícia')`),true);
    await click(`[data-pasta="${id}"] [title="Renomear pasta"]`);await ate("!!document.querySelector('.nt-pt-titulo')");await ev("document.querySelector('.nt-pt-titulo').value='Renomeada'");await click('.nt-pt-form [type=submit]');
    await ate(`ntPastas().find(p=>p.id==='${id}').titulo==='Renomeada'`);assert.equal(await C.confirmado(),true);
    const pg=await ev('ntPaginaNova()');await ev('ntPainelFecha()');if(largura===375)await click('#nt_lat_bt');
    await click(`[data-pg="${pg}"] .nt-pg-mover`);await ate("!!document.querySelector('.nt-mover select')");await ev(`document.querySelector('.nt-mover select').value='${id}'`);await click('.nt-mover button');
    assert.equal(await ev(`pgAchar('${pg}').pasta`),id);
    assert.equal(await ev(`bgDocs().find(p=>p.id==='${pg}').sub`),'Renomeada');assert.match(await ev(`document.querySelector('[data-pg="${pg}"] a').href`),new RegExp('pagina='+pg));
    await click(`[data-pasta="${id}"] .nt-pt-nome`);assert.equal(await ev(`document.querySelector('[data-pasta="${id}"] .nt-pg-lista').hidden`),true);
    await ev('ntLateralPinta()');assert.equal(await ev(`document.querySelector('[data-pasta="${id}"] .nt-pt-nome').getAttribute('aria-expanded')`),'false');
    await click(`[data-pasta="${id}"] .nt-pt-nome`);
    if(largura===1000){
      const pg2=await ev('ntPaginaNova()');await ev('ntPainelFecha()');assert.equal(await C.confirmado(),true);
      await C.arrasta(await rect(`[data-pg="${pg2}"] .nt-pg-alca`),await rect(`[data-pasta="${id}"] .nt-pt-cab`));
      assert.equal(await ev(`pgAchar('${pg2}').pasta`),id,'mouse move para pasta');
      assert.equal(await C.confirmado(),true);
      const alvo=await rect(`[data-pg="${pg}"]`);alvo[1]-=12;await C.arrasta(await rect(`[data-pg="${pg2}"] .nt-pg-alca`),alvo);
      assert.equal(await ev(`pgAchar('${pg2}').ordem<pgAchar('${pg}').ordem`),true,'ordena dentro da pasta');assert.equal(await C.confirmado(),true);
      await C.arrasta(await rect(`[data-pg="${pg2}"] .nt-pg-alca`),await rect('.nt-pg-lista[data-pasta=""]'));
      assert.equal(await ev(`pgAchar('${pg2}').pasta`),'','mouse move para fora');
    }
    assert.equal(await C.confirmado(),true);await click('[onclick="ntPastaForm(\'\',\'criar\')"]');await ev("document.querySelector('.nt-pt-titulo').value='Segunda pasta'");await click('.nt-pt-form [type=submit]');assert.equal(await C.confirmado(),true);
    const outra=await ev('ntPastas().find(p=>p.titulo===\'Segunda pasta\').id');
    const alvo=await rect(`[data-pasta="${id}"] .nt-pt-cab`);alvo[1]-=10;
    if(largura===375){await C.call('Emulation.setTouchEmulationEnabled',{enabled:true});await arrastaToque(await rect(`[data-pasta="${outra}"] .nt-pt-cab .nt-pg-alca`),alvo);await C.call('Emulation.setTouchEmulationEnabled',{enabled:false})}
    else await C.arrasta(await rect(`[data-pasta="${outra}"] .nt-pt-cab .nt-pg-alca`),alvo);
    assert.equal(await ev(`ntPastas().find(p=>p.id==='${outra}').ordem<ntPastas().find(p=>p.id==='${id}').ordem`),true,'ordena pastas por mouse/toque');assert.equal(await C.confirmado(),true);
    await click(`[data-pasta="${outra}"] [title="Excluir pasta"]`);await click(`[data-pasta="${outra}"] .nt-pt-form button`);assert.equal(await C.confirmado(),true);
    await click(`[data-pasta="${id}"] [title="Excluir pasta"]`);assert.equal(await ev(`ntPastas().some(p=>p.id==='${id}')`),true,'confirmação inline');
    await click(`[data-pasta="${id}"] .nt-pt-form button`);assert.equal(await ev(`ntPastas().some(p=>p.id==='${id}')`),false);assert.equal(await ev(`!!pgAchar('${pg}')`),true);
    assert.equal(await ev(`!!document.querySelector('.nt-pg-lista[data-pasta=""] [data-pg="${pg}"]')`),true,'página fora da pasta');
    assert.equal(await C.confirmado(),true);
  }
  assert.equal(await C.confirmado(),true);assert.deepEqual(C.erros,[]);
});
