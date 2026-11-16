// Flashcards 1.61: painel superior, setas ←/→, persistência com recarga da página e retomada nos resumos.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {iniciar}=require('./chrome-util.js');

test('Radio 1.61: Flashcards painel do bloco, setas, retomada após recarga e resumos',{timeout:120000},async t=>{
  const C=await iniciar({porta:8807,env:{BCBR_QS:'10'}});t.after(()=>C.fim());
  const {ev,call,click,tecla,especial,ate,espera}=C;
  const seta=dir=>tecla(dir,{code:dir,windowsVirtualKeyCode:dir==='ArrowLeft'?37:39});
  await C.abre('fc');

  // Semeia 3 cartões fictícios persistidos
  const resumos=[{pagina:'notas',titulo:'Resumo Teste',chave:'tor|Tórax|Teste',cards:[{id:'rz-notas-01',f:'Resumo F1',v:'Resumo V1'},{id:'rz-notas-02',f:'Resumo F2',v:'Resumo V2'}]}];
  await ev(`(()=>{
    cards=[
      {id:'fc_t1',f:'Frente 1',v:'Verso 1',tg:'Tórax',u:1},
      {id:'fc_t2',f:'Frente 2',v:'Verso 2',tg:'Tórax',u:2},
      {id:'fc_t3',f:'Frente 3',v:'Verso 3',tg:'Abdome',u:3}
    ];
    persist();render();
  })()`);

  await t.test('bloco normal: painel superior, chips verde/vermelho, setas ←/→ e SRS sem duplicar',async()=>{
    await click('#app button.b'); // "Estudar agora"
    await ate("document.querySelector('.qnav .qgrid')");

    // Painel fica ACIMA do cartão
    const pos=await ev("(()=>{const p=document.querySelector('.qnav').getBoundingClientRect(),c=document.querySelector('.fcard').getBoundingClientRect();return {pBottom:p.bottom,cTop:c.top}})()");
    assert.ok(pos.pBottom<=pos.cTop+4,'painel deve aparecer em cima do card');

    // Contagens iniciais
    assert.match(await ev("document.querySelector('.qnav').textContent"),/1 de 3/);
    assert.match(await ev("document.querySelector('.qnav').textContent"),/0\/3 feitos/);
    assert.equal(await ev("document.querySelectorAll('.qnav .qn').length"),3);
    assert.equal(await ev("document.querySelector('.fcprev').disabled"),true);
    assert.equal(await ev("document.querySelector('.fcnext').disabled"),false);

    // Mostra e responde cartão 1 como Bom (acerto)
    await click('#app button.b[onclick*="fq.shown=true"]');
    await click('.fcg .g3');
    await ate("document.querySelector('.qnav .qn:nth-child(1) i.ok')");
    assert.match(await ev("document.querySelector('.fcard').textContent"),/Frente 2/);

    // Mostra e responde cartão 2 como Errei (erro)
    await click('#app button.b[onclick*="fq.shown=true"]');
    await click('.fcg .g1');
    await ate("document.querySelector('.qnav .qn:nth-child(2) i.bad')");
    assert.match(await ev("document.querySelector('.fcard').textContent"),/Frente 3/);
    assert.match(await ev("document.querySelector('.qnav').textContent"),/2\/3 feitos/);
    assert.match(await ev("document.querySelector('.qnav').textContent"),/✓ 1/);
    assert.match(await ev("document.querySelector('.qnav').textContent"),/✗ 1/);

    // Navega com seta ← (botão e teclado) para rever cartão 1 já respondido
    await click('.fcprev'); // vai para 2
    assert.match(await ev("document.querySelector('.fcard').textContent"),/Frente 2/);
    await seta('ArrowLeft');await espera(80); // vai para 1
    assert.match(await ev("document.querySelector('.fcard').textContent"),/Frente 1/);
    assert.match(await ev("document.querySelector('.fcresp').textContent"),/Resposta dada: Bom/);

    // Responder de novo no cartão 1 não duplica revisão de SRS
    const repsAntes=await ev("fcs['fc_t1'][2]");
    assert.equal(repsAntes,1);
    await click('.fcg .g4'); // muda para Fácil
    await espera(80);
    assert.equal(await ev("fcs['fc_t1'][2]"),1,'reps não duplicou ao responder de novo');
    assert.match(await ev("document.querySelector('.fcresp').textContent"),/Resposta dada: Fácil/);

    // Clicar no chip 3 do painel vai direto para o cartão 3
    await click('.qnav .qn:nth-child(3)');
    assert.match(await ev("document.querySelector('.fcard').textContent"),/Frente 3/);

    // Testa seta → no teclado voltando antes para 2
    await seta('ArrowLeft');await espera(80);
    assert.match(await ev("document.querySelector('.fcard').textContent"),/Frente 2/);
    await seta('ArrowRight');await espera(80);
    assert.match(await ev("document.querySelector('.fcard').textContent"),/Frente 3/);

    // Layout em 375 px e nos dois temas sem estouro horizontal
    for(const tema of ['light','dark']){
      await ev(`document.documentElement.dataset.theme='${tema}'`);
      await call('Emulation.setDeviceMetricsOverride',{width:375,height:800,deviceScaleFactor:1,mobile:false});
      assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth+1'),true,tema);
    }
    await call('Emulation.setDeviceMetricsOverride',{width:1000,height:900,deviceScaleFactor:1,mobile:false});
  });

  await t.test('recarga da página no meio do bloco retoma na aba Flashcards onde parou',async()=>{
    await call('Page.reload',{});
    await C.esperaApp();
    // Reabre a aba Flashcards clicando no botão do menu
    await click('#nav button[data-k="fc"]');
    await ate("document.querySelector('.qnav .qgrid')");
    assert.match(await ev("document.querySelector('.fcard').textContent"),/Frente 3/,'retomou no cartão 3 após recarga');
    assert.equal(await ev("document.querySelectorAll('.qnav .qn i.ok').length"),1);
    assert.equal(await ev("document.querySelectorAll('.qnav .qn i.bad').length"),1);

    // Conclui o cartão 3 -> resumo do bloco
    await click('#app button.b[onclick*="fq.shown=true"]');
    await click('.fcg .g3');
    await ate("document.querySelector('#app h2')?.textContent==='Bloco concluído'");
    assert.match(await ev("document.querySelector('#app').textContent"),/Só os errados \(1\)/);
  });

  await t.test('resumos: botão 🃏 salva bloco, retoma onde parou e oferece recomeçar / só os errados ao terminar',async()=>{
    await ev(`window.RESUMOS_IDX=${JSON.stringify(resumos)};rsSemeia();go('notas');`);
    await ate("document.querySelector('.nt-pm')&&document.querySelector('.nt-rs button')");
    await click('.nt-rs button');
    await ate("document.querySelector('.qnav .qgrid')");
    assert.match(await ev("document.querySelector('.fcard').textContent"),/Resumo F1/);

    // Responde 1º card do resumo como Errei -> avança para o 2º
    await click('#app button.b[onclick*="fq.shown=true"]');
    await click('.fcg .g1');
    await ate("document.querySelector('.qnav .qn:nth-child(1) i.bad')");
    assert.match(await ev("document.querySelector('.fcard').textContent"),/Resumo F2/);

    // Volta para Notas, recarrega a página e clica de novo no botão do resumo -> retoma no 2º card
    await call('Page.reload',{});
    await C.esperaApp('notas');
    await ev(`window.RESUMOS_IDX=${JSON.stringify(resumos)};rsSemeia();render();`);
    await ate("document.querySelector('.nt-pm')&&document.querySelector('.nt-rs button')");
    assert.match(await ev("document.querySelector('.nt-rs button').textContent"),/1\/2 no bloco/);
    await click('.nt-rs button');
    await ate("document.querySelector('.fcard')");
    assert.match(await ev("document.querySelector('.fcard').textContent"),/Resumo F2/,'resumo retomou onde parou');

    // Conclui o resumo -> ao clicar de novo no botão do resumo oferece Recomeçar tudo e Só os errados
    await click('#app button.b[onclick*="fq.shown=true"]');
    await click('.fcg .g3');
    await ate("document.querySelector('#app h2')?.textContent==='Bloco concluído'");
    await ev(`go('notas');`);
    await ate("document.querySelector('.nt-pm')&&document.querySelector('.nt-rs button')");
    await click('.nt-rs button');
    await ate("document.querySelector('#app h2')?.textContent==='Bloco concluído'");
    assert.match(await ev("document.querySelector('#app').textContent"),/Recomeçar tudo \(2\)/);
    assert.match(await ev("document.querySelector('#app').textContent"),/Só os errados \(1\)/);

    // Escolhe Só os errados
    await click('#app button[onclick*="fcSoErrados"]');
    await ate("document.querySelector('.fcard')");
    assert.equal(await ev("document.querySelectorAll('.qnav .qn').length"),1);
    assert.match(await ev("document.querySelector('.fcard').textContent"),/Resumo F1/);
  });

  await t.test('Esc sai para gerenciar sem perder o bloco e campo de texto não dispara ←/→',async()=>{
    await especial('Escape');
    await ate("document.querySelector('#fc_q')");
    assert.match(await ev("document.querySelector('#app').textContent"),/Continuar/);
    await ev("document.getElementById('fc_q').focus()");
    await seta('ArrowLeft');await espera(60);
    assert.equal(await ev("tela"),'fc');
  });

  await t.test('parte 1: imagens fi/vi nos flashcards de resumo, zoom e imagem quebrada',async()=>{
    // Envia 2 imagens JPEG válidas para a pasta imagens/ do servidor simulado
    await ev(`(async()=>{
      const mk=cor=>{const c=document.createElement('canvas');c.width=40;c.height=30;const x=c.getContext('2d');x.fillStyle=cor;x.fillRect(0,0,40,30);return c.toDataURL('image/jpeg').split(',')[1]};
      await BCBR.api('/repos/'+BCBR.REPO+'/contents/imagens/fc-frente-teste.jpg',{method:'PUT',body:JSON.stringify({message:'img f',content:mk('#c0392b')})});
      await BCBR.api('/repos/'+BCBR.REPO+'/contents/imagens/fc-verso-teste.jpg',{method:'PUT',body:JSON.stringify({message:'img v',content:mk('#2980b9')})});
    })()`);
    const resImg=[{pagina:'notas',titulo:'Resumo Imagens',chave:'tor|Tórax|Img',cards:[
      {id:'rz-img-01',f:'Frente com imagem',v:'Verso com imagem',fi:['fc-frente-teste.jpg','fc-quebrada-404.jpg'],vi:['fc-verso-teste.jpg']},
      {id:'rz-img-02',f:'Card sem imagem',v:'Verso sem imagem'}
    ]}];
    await ev(`(()=>{
      cards=[];fcs={};cfg.fcBlocos=[];cfg.fcAtivo=null;
      window.RESUMOS_IDX=${JSON.stringify(resImg)};
      rsSemeia();persist();fcResumoStart('notas','hoje');
    })()`);
    await ate("document.querySelector('.fc-img[data-u=\"gh:fc-frente-teste.jpg\"]')?.naturalWidth>0");
    // Verso ainda oculto; imagem 404 oculta sem quebrar o card
    assert.equal(await ev("!!document.querySelector('.fc-img[data-u=\"gh:fc-verso-teste.jpg\"]')"),false);
    await ate("document.querySelector('.fc-img[data-u=\"gh:fc-quebrada-404.jpg\"]')?.hidden===true");

    // Clique amplia no visualizador #zoom
    await click('.fc-img[data-u="gh:fc-frente-teste.jpg"]');
    await ate("document.getElementById('zoom').hidden===false");
    assert.ok(await ev("document.getElementById('zimg').src.length>0"));
    await especial('Escape');
    await ate("document.getElementById('zoom').hidden===true");

    // Virar mostra vi carregada
    await click('#app button.b[onclick*="fq.shown=true"]');
    await ate("document.querySelector('.fc-img[data-u=\"gh:fc-verso-teste.jpg\"]')?.naturalWidth>0");

    // 375 px sem rolagem horizontal
    await call('Emulation.setDeviceMetricsOverride',{width:375,height:800,deviceScaleFactor:1,mobile:false});
    assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth+1'),true);
    await call('Emulation.setDeviceMetricsOverride',{width:1000,height:900,deviceScaleFactor:1,mobile:false});

    // Card sem imagem segue igual
    await click('.fcnext');
    assert.equal(await ev("document.querySelectorAll('.fc-img').length"),0);
    assert.match(await ev("document.querySelector('.fcard').textContent"),/Card sem imagem/);
  });

  await t.test('parte 2: joinha 👍/👎 com motivo, sem mexer no SRS e mantido após recarregar',async()=>{
    await ev("fcIr(0)");
    await ate("document.querySelector('.fc-av button.ok')");
    const srsAntes=await ev("JSON.stringify(fcs)");

    // Vota 👍, desfaz clicando de novo, vota 👍 novamente
    await click('.fc-av button.ok');
    assert.equal(await ev("!!document.querySelector('.fc-av button.ok.on')"),true);
    assert.equal(await ev("JSON.stringify(fcs)"),srsAntes,'voto 👍 não altera SRS');
    await click('.fc-av button.ok');
    assert.equal(await ev("!!document.querySelector('.fc-av button.ok.on')"),false);
    await click('.fc-av button.ok');
    assert.equal(await ev("!!document.querySelector('.fc-av button.ok.on')"),true);

    // Card 2: sem voto normal, depois vota 👎 com motivo e edita
    await click('.fcnext');
    assert.equal(await ev("document.querySelectorAll('.fc-av button.on').length"),0);
    await click('.fc-av button.bad');
    await ate("document.activeElement?.id==='fc_av_txt'");
    await C.digita('Pouco contexto');
    await click('.fc-av-box button.b');
    await ate("document.querySelector('.fc-av button.bad.on')");
    assert.match(await ev("document.querySelector('.fc-av-mot').textContent"),/Pouco contexto/);
    assert.equal(await ev("JSON.stringify(fcs)"),srsAntes,'voto 👎 não altera SRS');

    await click('.fc-av-ed');
    await ate("document.activeElement?.id==='fc_av_txt'");
    await ev("document.getElementById('fc_av_txt').value='Falta seta';document.getElementById('fc_av_txt').dispatchEvent(new Event('input'))");
    await click('.fc-av-box button.b');
    await ate("document.querySelector('.fc-av-mot')?.textContent.includes('Falta seta')");

    // Recarrega e confere voto/motivo mantidos
    const resImg=[{pagina:'notas',titulo:'Resumo Imagens',chave:'tor|Tórax|Img',cards:[
      {id:'rz-img-01',f:'Frente com imagem',v:'Verso com imagem',fi:['fc-frente-teste.jpg','fc-quebrada-404.jpg'],vi:['fc-verso-teste.jpg']},
      {id:'rz-img-02',f:'Card sem imagem',v:'Verso sem imagem'}
    ]}];
    await call('Page.reload',{});
    await C.esperaApp();
    await ev(`window.RESUMOS_IDX=${JSON.stringify(resImg)};rsSemeia();`);
    await click('#nav button[data-k="fc"]');
    await ate("document.querySelector('.fc-av')");
    assert.equal(await ev("!!document.querySelector('.fc-av button.bad.on')"),true);
    assert.match(await ev("document.querySelector('.fc-av-mot').textContent"),/Falta seta/);
    await click('.fcprev');
    assert.equal(await ev("!!document.querySelector('.fc-av button.ok.on')"),true);
  });

  await t.test('parte 3: novos primeiro por padrão, erro não repete no bloco e desligar restaura comportamento antigo',async()=>{
    await ev(`(()=>{
      const now=Date.now(),DAY=864e5;
      window.RESUMOS_IDX=null;fq=null;fcTags.clear();cfg.fcBlocos=[];cfg.fcAtivo=null;cfg.fcNovos=1;cfg.fcNovosPrimeiro=true;
      cards=[
        {id:'p3_v',f:'Vencido P3',v:'RV',u:1},
        {id:'p3_n1',f:'Novo P3 1',v:'RN1',u:2},
        {id:'p3_n2',f:'Novo P3 2',v:'RN2',u:3}
      ];
      fcs={p3_v:[2.5,2,2,now-DAY,0,now-3*DAY,0]};
      persist();go('fc','lista');
    })()`);
    await ate("document.getElementById('fc_novos_pri')");
    assert.equal(await ev("document.getElementById('fc_novos_pri').checked"),true);

    // Inicia bloco: só os 2 novos (sem limite diário=1 e sem o vencido antes)
    await click('#app button.b[onclick*="fcStart"]');
    await ate("document.querySelector('.qnav .qgrid')");
    assert.deepEqual(await ev("[...fq.ids]"),['p3_n1','p3_n2']);

    // Errar p3_n1: marca vermelho e vai para p3_n2 sem voltar para a fila
    await click('#app button.b[onclick*="fq.shown=true"]');
    await click('.fcg .g1');
    await ate("document.querySelector('.qnav .qn:nth-child(1) i.bad')");
    assert.match(await ev("document.querySelector('.fcard').textContent"),/Novo P3 2/);
    assert.deepEqual(await ev("[...fq.ids]"),['p3_n1','p3_n2']);
    assert.ok(await ev("fcs.p3_n1[3]>=Date.now()+80000000"));

    // Conclui p3_n2 e inicia novo bloco -> agora vem p3_v
    await click('#app button.b[onclick*="fq.shown=true"]');
    await click('.fcg .g3');
    await ate("document.querySelector('#app h2')?.textContent==='Bloco concluído'");
    await click('#app button.b[onclick*="fcStart"]');
    await ate("document.querySelector('.fcard')");
    assert.deepEqual(await ev("[...fq.ids]"),['p3_v']);

    // Desliga o modo: restaura ordem antiga (vencidos antes, limite diário) e reinserção do erro
    await especial('Escape');
    await ate("document.getElementById('fc_novos_pri')");
    await click('#fc_novos_pri');
    assert.equal(await ev("cfg.fcNovosPrimeiro"),false);
    await ev(`(()=>{
      const now=Date.now(),DAY=864e5;
      fq=null;cfg.fcBlocos=[];cfg.fcAtivo=null;cfg.fcNovos=1;
      cards=[{id:'o_v',f:'Vencido Old',v:'R',u:1},{id:'o_n1',f:'Novo Old 1',v:'R',u:2},{id:'o_n2',f:'Novo Old 2',v:'R',u:3}];
      fcs={o_v:[2.5,2,2,now-DAY,0,now-3*DAY,0]};
      persist();render();
    })()`);
    await click('#app button.b[onclick*="fcStart"]');
    await ate("document.querySelector('.qnav .qgrid')");
    assert.deepEqual(await ev("[...fq.ids]"),['o_v','o_n1']);
    await click('#app button.b[onclick*="fq.shown=true"]');
    await click('.fcg .g1');
    await ate("document.querySelector('.fcard')?.textContent.includes('Novo Old 1')");
    assert.equal(await ev("fq.resp.o_v"),undefined,'errado volta para a fila quando modo está desligado');
    assert.deepEqual(await ev("[...fq.ids]"),['o_n1','o_v']);
  });

  assert.deepEqual(C.erros,[]);
});
