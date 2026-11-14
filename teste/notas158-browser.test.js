// Notas 1.58: atalho fixo da página raiz, com cliques reais no Chrome e dados fictícios.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {iniciar}=require('./chrome-util.js');

test('Radio 1.58: botão Notas ao lado do ☰, desktop e celular',{timeout:120000},async t=>{
  const C=await iniciar({porta:8805,env:{BCBR_QS:'10'}});t.after(()=>C.fim());
  const {ev,call,click,ate,espera}=C;await C.abre('notas');
  const confere=async(ativa,aberta)=>{
    const r=await ev(`(()=>{
      const b=document.querySelector('#nt_inicio'),l=document.querySelector('#nt_lat_bt');
      const r=b.getBoundingClientRect(),s=l.getBoundingClientRect(),c=getComputedStyle(b);
      return {texto:b.textContent,aoLado:l.nextElementSibling===b,
        visivel:r.width>0&&r.height>0&&r.left>=s.right&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,
        mesmaLinha:Math.abs(r.top+r.height/2-s.top-s.height/2)<2,
        acessivel:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===b,
        ativa:b.classList.contains('on'),pressed:b.getAttribute('aria-pressed'),
        aberta:l.getAttribute('aria-expanded'),fundo:c.backgroundColor,cor:c.color,
        raizNaLateral:!!document.querySelector('#nt_lat [data-pg="notas"]')};
    })()`);
    assert.equal(r.texto,'Notas');assert.equal(r.aoLado,true);
    assert.equal(r.visivel,true);assert.equal(r.mesmaLinha,true);assert.equal(r.acessivel,true);
    assert.equal(r.ativa,ativa);assert.equal(r.pressed,String(ativa));assert.equal(r.aberta,String(aberta));
    assert.equal(r.raizNaLateral,false);
    return r;
  };
  for(const largura of [1000,375])await t.test(`${largura}px: lateral aberta e fechada, navegação e destaque`,async()=>{
    await call('Emulation.setDeviceMetricsOverride',{width:largura,height:900,deviceScaleFactor:1,mobile:false});
    await ev("ntPainelAbre('notas')");await ate("NT.pagina==='notas'&&!NT.carregando&&!!NT.ed");
    await ev("ntPaginaNova()");await ate("NT.pagina!=='notas'&&!NT.carregando&&!!NT.ed");
    const outra=await ev('NT.pagina');
    for(const aberta of [true,false]){
      if(await ev('ntLateralAberta()')!==aberta)await click('#nt_lat_bt');
      const inativa=await confere(false,aberta);
      await click('#nt_inicio');await ate("NT.pagina==='notas'&&!NT.carregando&&!!NT.ed");
      assert.equal(await ev("document.querySelector('#nt_titulo').value"),'Notas');
      assert.equal(await ev("new URLSearchParams(location.search).get('pagina')"),'notas');
      // Navegar fecha a lateral móvel; reabre para conferir o estado ativo nos dois modos.
      if(await ev('ntLateralAberta()')!==aberta)await click('#nt_lat_bt');
      const ativa=await confere(true,aberta);
      assert.notDeepEqual([ativa.fundo,ativa.cor],[inativa.fundo,inativa.cor],'destaque visual ao abrir Notas');
      await ev(`ntPainelAbre(${JSON.stringify(outra)})`);await ate('!NT.carregando&&!!NT.ed');
      assert.equal(await ev("document.querySelector('#nt_inicio').getAttribute('aria-pressed')"),'false');
    }
    await C.reset(...Array.from({length:80},(_,i)=>C.par('Linha fictícia '+i)));
    await ev('window.scrollTo(0,400)');await espera(150);
    assert.ok(await ev('scrollY')>0,'a página realmente rolou');
    await confere(false,await ev('ntLateralAberta()'));
    await ev('window.scrollTo(0,0)');
    assert.deepEqual(C.erros,[]);
  });
});
