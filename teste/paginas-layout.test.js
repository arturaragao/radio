const {test}=require('node:test'),assert=require('node:assert/strict');
const {iniciar}=require('./chrome-util');
test('1.48 layout: página comum no editor principal, lateral, menu Versões e celular',{timeout:25000},async t=>{
  const C=await iniciar({porta:8791,env:{BCBR_QS:'10'}});t.after(()=>C.fim());
  await C.abre('notas');await C.ate("!!NT.ed&&!!document.querySelector('#nt_titulo')");
  assert.equal(await C.ev("NT.pagina"),'notas');
  assert.equal(await C.ev("!!document.querySelector('#nt_pan,#rd_conflitos')"),false);
  assert.ok((await C.ev("ntPaginas().map(p=>p.id)")).includes('notas'));
  const id=await C.ev('ntPaginaCria()');await C.ev(`ntPainelAbre('${id}')`);await C.ate("!!NT.ed");
  assert.equal(await C.ev('NT.pagina'),id);assert.equal(await C.ev("NT.el.closest('main')!==null"),true);
  await C.ev("document.getElementById('nt_titulo').value='Página no principal';ntTituloSalva()");
  assert.equal(await C.ev('document.title'),'Página no principal');
  await C.ev("ntPaginaMenu(NT.pagina,100,100)");
  assert.equal(await C.ev("document.querySelector('[data-versoes]').textContent"),'Versões');
  await C.especial('Escape');
  for(const tema of ['dark','light']){
    await C.ev(`document.documentElement.dataset.theme='${tema}'`);
    await C.call('Emulation.setDeviceMetricsOverride',{width:375,height:800,deviceScaleFactor:1,mobile:false});
    assert.equal(await C.ev('document.documentElement.scrollWidth<=innerWidth+1'),true,tema);
    await C.click('#nt_lat_bt');assert.equal(await C.ev("document.querySelector('#nt_lat').getBoundingClientRect().width>100"),true);
    await C.click('#nt_lat_bt');
  }
  assert.deepEqual(C.erros,[]);
});
