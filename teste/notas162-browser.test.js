// Radio 1.62.0 no Chrome: Notas rápidas (página grande ~300 blocos + imagens, debounce, cache IndexedDB),
// botão "Baixar offline" (SW + caches + tooltip + confirmação) e Preliminares com dias abertos/lembrança. Dados fictícios.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {iniciar,espera}=require('./chrome-util.js');

test('Radio 1.62.0: Notas rápidas, Baixar offline e Preliminares com dias abertos',{timeout:240000},async t=>{
  const C=await iniciar({porta:8808,sw:true,env:{BCBR_QS:'10'}});t.after(()=>C.fim());
  const {ev,call,click,ate,par,tg}=C;

  // Fictício: 1x1 PNG em data URL e mock opcional para laudos-tutu-dados + atraso em notas/ para testar abertura do cache.
  const PREL_ITENS=[
    {acesso:'8001',data:'2026-11-12',modalidade:'CT',categoria:'Tomografia',exame:'TC crânio',chefe:'Chefe A.',mudou:true},
    {acesso:'8002',data:'2026-11-11',modalidade:'US',categoria:'Ultrassom',exame:'USG abdome',chefe:'Chefe B.',mudou:false},
    {acesso:'8003',data:'2026-11-10',modalidade:'MR',categoria:'Ressonância',exame:'RM coluna',chefe:'Chefe C.',mudou:true}];
  const INST_SCRIPT=`(()=>{
    if(window.__inst162)return;window.__inst162=true;
    const origFetch=window.fetch.bind(window);
    window.fetch=(u,o)=>{
      const s=String(u);
      if(s.includes('laudos-tutu-dados')){
        const p=s.split('/contents/')[1];
        const ok=j=>Promise.resolve(new Response(JSON.stringify(j),{status:200,headers:{etag:'W/"1"'}}));
        if(p==='preliminares/indice.json')return ok({versao:1,itens:${JSON.stringify(PREL_ITENS)}});
        if(p==='preliminares/lidos.json')return ok({versao:1,lidos:{}});
        return Promise.resolve(new Response('{}',{status:404}));
      }
      if(localStorage.getItem('__atraso_notas')==='1'&&(s.includes('/contents/notas/')||s.includes('/git/blobs/'))){
        return new Promise(res=>setTimeout(()=>origFetch(u,o).then(res),3500));
      }
      return origFetch(u,o);
    };
  })();`;
  await call('Page.addScriptToEvaluateOnNewDocument',{source:INST_SCRIPT});

  await C.abre('notas');
  await ate("typeof NT!=='undefined'&&!!NT.ed&&!NT.carregando");

  await t.test('1. Botão Baixar offline: desligado por padrão, ligar registra SW/caches + tooltip MB, confirmar antes de remover',async()=>{
    const ini=await ev(`(async()=>{
      const b=document.getElementById('of_btn'),s=document.getElementById('sync');
      const regs=await navigator.serviceWorker.getRegistrations();
      const cs=await caches.keys();
      return {aoLado:s.nextElementSibling===b,estado:b.dataset.estado,pressed:b.getAttribute('aria-pressed'),flag:localStorage.getItem('bcbr_offline'),regs:regs.length,cs,title:b.title};
    })()`);
    assert.equal(ini.aoLado,true,'botão ao lado do indicador sincronizado');
    assert.equal(ini.estado,'off');assert.equal(ini.pressed,'false');
    assert.equal(ini.flag,null,'desligado por padrão');
    assert.equal(ini.regs,0,'sem SW registrado antes de ligar');
    assert.equal(ini.cs.length,0,'sem caches de SW antes de ligar');
    assert.match(ini.title,/^Baixar offline · (~[\d,]+ MB|calculando…)$/);

    await ate("/~[\\d,]+ MB/.test(document.getElementById('of_btn').title)",5000);
    assert.match(await ev("document.getElementById('of_btn').title"),/^Baixar offline · ~[\d,]+ MB$/);

    // Ligar: registra SW, cria caches e muda para "baixado"
    assert.equal(await ev("(()=>{const b=document.getElementById('of_btn'),r=b.getBoundingClientRect(),e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !!e&&e.closest('#of_btn')===b})()"),true,'botão visível e clicável');
    await click('#of_btn');
    await ate("localStorage.getItem('bcbr_offline')==='1'&&document.getElementById('of_btn').dataset.estado==='baixado'",25000).catch(async err=>{
      const st=await ev("({flag:localStorage.getItem('bcbr_offline'),estado:document.getElementById('of_btn')?.dataset.estado,baixando:OF.baixando,prog:OF.prog,title:document.getElementById('of_btn')?.title})");
      throw new Error(err.message+' · estado='+JSON.stringify(st));
    });
    const ligado=await ev(`(async()=>{
      const b=document.getElementById('of_btn');
      const regs=await navigator.serviceWorker.getRegistrations();
      const cs=await caches.keys();
      return {estado:b.dataset.estado,pressed:b.getAttribute('aria-pressed'),on:b.classList.contains('on'),title:b.title,regs:regs.length,cs};
    })()`);
    assert.equal(ligado.estado,'baixado');assert.equal(ligado.pressed,'true');assert.equal(ligado.on,true);
    assert.ok(ligado.regs>=1,'SW registrado');
    assert.ok(ligado.cs.some(k=>k.startsWith('bcbr-')),'caches criados: '+JSON.stringify(ligado.cs));
    assert.match(ligado.title,/^Offline neste PC · [\d,]+ MB$/);

    // Clicar de novo com confirm=false: NÃO remove SW nem caches
    await ev("window.__confMsg=null;window.confirm=m=>{window.__confMsg=m;return false};0");
    await click('#of_btn');await espera(300);
    assert.equal(await ev("window.__confMsg"),'Remover a cópia offline deste computador?');
    assert.equal(await ev("localStorage.getItem('bcbr_offline')"),'1');
    assert.ok(await ev("navigator.serviceWorker.getRegistrations().then(r=>r.length>=1)"));
    assert.ok(await ev("caches.keys().then(k=>k.some(x=>x.startsWith('bcbr-')))"));

    // Clicar de novo com confirm=true: remove SW e caches, preserva token e IndexedDB
    await ev("window.confirm=m=>{window.__confMsg=m;return true};0");
    await click('#of_btn');
    await ate("localStorage.getItem('bcbr_offline')===null&&document.getElementById('of_btn').dataset.estado==='off'",15000);
    const desligado=await ev(`(async()=>{
      const regs=await navigator.serviceWorker.getRegistrations();
      const cs=await caches.keys();
      const dbs=await indexedDB.databases();
      return {regs:regs.length,cs,tk:localStorage.getItem('bcbr_gh_token'),temIdb:dbs.some(d=>d.name==='bcbr'),title:document.getElementById('of_btn').title};
    })()`);
    assert.equal(desligado.regs,0,'SW desregistrado');
    assert.equal(desligado.cs.filter(k=>k.startsWith('bcbr-')).length,0,'caches do SW apagados');
    assert.equal(desligado.tk,'token-falso','chave preservada');
    assert.equal(desligado.temIdb,true,'IndexedDB de dados preservado');
    assert.match(desligado.title,/^Baixar offline · ~[\d,]+ MB$/);
  });

  await t.test('2. Notas rápidas: 300 blocos + imagens, digitação <16ms/tecla sem save por tecla, 1 save após debounce e abertura pelo cache',async()=>{
    await ev(`(()=>{
      const c=document.createElement('canvas');c.width=40;c.height=30;c.getContext('2d').fillRect(0,0,40,30);
      window.__png162=c.toDataURL();BCBR.imgPronta=()=>window.__png162;
    })()`);
    // Monta 300 blocos fictícios (280 parágrafos + 20 imagens) e salva no servidor simulado + cache IndexedDB.
    await ev(`(async()=>{
      const ag=new Date().toISOString(),blocos=[{id:'b-alvo',atualizado:ag,conteudo:{type:'paragraph',attrs:{id:'b-alvo'},content:[{type:'text',text:'Início: '}]}}];
      for(let i=1;i<300;i++){
        const id='b'+i;
        if(i%15===0)blocos.push({id,atualizado:ag,conteudo:{type:'image',attrs:{id,src:'./img/ficticia-'+i+'.jpg'}}});
        else blocos.push({id,atualizado:ag,conteudo:{type:'paragraph',attrs:{id},content:[{type:'text',text:'Bloco fictício número '+i+' com conteúdo médico simulado para medir desempenho.'}]}});
      }
      SyncNotas.salvarPagina({id:'notas',titulo:'Notas',pasta:'',ordem:0,doc:{v:1,blocos},atualizado:ag});
      await SyncNotas.enviar();
    })()`);
    await C.abre('notas');
    await ate("typeof NT!=='undefined'&&!!NT.ed&&NT.ed.state.doc.childCount>=300",15000);
    // Confere lazy/async nas imagens
    const imgAttrs=await ev("(()=>{const im=document.querySelector('img.nt-img');return im?{loading:im.getAttribute('loading')||im.loading,decoding:im.getAttribute('decoding')||im.decoding}:null})()");
    assert.deepEqual(imgAttrs,{loading:'lazy',decoding:'async'});

    // Instrumenta contagem de saves e posiciona o cursor no primeiro bloco
    await ev(`(()=>{
      window.__saveDocCalls=0;window.__salvarPagCalls=0;
      const origSalva=window.ntSalvaDoc;
      window.ntSalvaDoc=function(){window.__saveDocCalls++;return origSalva.apply(this,arguments)};
      const origSync=SyncNotas.salvarPagina;
      SyncNotas.salvarPagina=function(){window.__salvarPagCalls++;return origSync.apply(this,arguments)};
      // Recria o editor passando o wrapper para contar também chamadas via debounce
      NT.ed.destroy();NT.ed=null;ntMonta();
      return true;
    })()`);
    await ate("!!NT.ed&&NT.ed.state.doc.childCount>=300",10000);
    await ev("NT.ed.chain().focus().setTextSelection(9).run();0");

    // Digita 50 caracteres medindo tempo real no navegador (keydown -> mutação no DOM via performance.now)
    await ev(`(()=>{
      window.__kTempos=[];window.__k0=0;
      const pm=NT.el.querySelector('.nt-pm');
      window.__kObs=new MutationObserver(()=>{if(window.__k0){window.__kTempos.push(performance.now()-window.__k0);window.__k0=0}});
      window.__kObs.observe(pm,{characterData:true,childList:true,subtree:true});
      pm.addEventListener('keydown',()=>{window.__k0=performance.now()},true);
    })()`);
    const texto='abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMN';
    for(const ch of texto){
      await call('Input.dispatchKeyEvent',{type:'keyDown',key:ch,text:ch,unmodifiedText:ch});
      await call('Input.dispatchKeyEvent',{type:'keyUp',key:ch});
    }
    await espera(50);
    const med=await ev("(()=>{window.__kObs?.disconnect();const t=window.__kTempos;return {n:t.length,media:t.reduce((a,b)=>a+b,0)/Math.max(1,t.length),max:Math.max(0,...t)}})()");
    console.log('  média por tecla (300 blocos + 20 imagens):',med.media.toFixed(2),'ms (n:',med.n,', máx:',med.max.toFixed(2),'ms)');
    assert.equal(med.n,50,'todas as 50 teclas medidas no DOM');
    assert.ok(med.media<16,`média por tecla deve ser <16 ms, deu ${med.media.toFixed(2)} ms`);
    assert.match(await ev("NT.ed.state.doc.firstChild.textContent"),new RegExp(texto+'$'));

    // Imediatamente após digitar: ZERO saves!
    assert.equal(await ev("window.__saveDocCalls"),0,'não salvou durante a digitação');
    assert.equal(await ev("window.__salvarPagCalls"),0,'não gravou no SyncNotas durante a digitação');

    // Após o debounce (~800 ms + idle): exatamente 1 save!
    await ate("window.__salvarPagCalls===1",5000);
    await espera(300);
    assert.equal(await ev("window.__saveDocCalls"),1,'exatamente 1 save após debounce');
    assert.equal(await ev("window.__salvarPagCalls"),1,'exatamente 1 chamada a SyncNotas.salvarPagina');
    assert.ok(await C.confirmado(),'enviado ao servidor em segundo plano');

    // Abertura pelo cache IndexedDB sem esperar fetch (atraso artificial de 3500 ms nos fetches de notas/)
    await ev("localStorage.setItem('__atraso_notas','1');0");
    const tNav=Date.now();
    await call('Page.navigate',{url:C.URL_});
    await ate("typeof NT!=='undefined'&&!!NT.ed&&!NT.carregando&&NT.ed.state.doc.childCount>=60",2800);
    const msAbertura=Date.now()-tNav;
    console.log('  abertura da página grande pelo cache (com fetch atrasado em 3500 ms):',msAbertura,'ms');
    assert.ok(msAbertura<3000,'abriu do cache antes de o fetch de 3500 ms responder: '+msAbertura+' ms');
    await ate("NT.ed.state.doc.childCount>=300",5000);
    assert.match(await ev("NT.ed.state.doc.firstChild.textContent"),new RegExp(texto),'texto salvo presente após reabrir');
    await ev("localStorage.removeItem('__atraso_notas');0");
  });

  await t.test('3. Preliminares: dias abertos ao carregar; fechar um dia e recarregar continua fechado',async()=>{
    await ev("go('preliminares');0");
    await ate("document.querySelectorAll('.prl-n0').length===3",10000);
    const abertosIni=await ev("[...document.querySelectorAll('.prl-n0')].map(d=>[d.dataset.k,d.open])");
    assert.deepEqual(abertosIni,[['d|2026-11-12',true],['d|2026-11-11',true],['d|2026-11-10',true]],'todos os dias abertos ao carregar');

    // Fecha o dia 2026-11-11 manualmente
    await ev("document.querySelector('.prl-n0[data-k=\"d|2026-11-11\"]>summary').click();0");
    await ate("!document.querySelector('.prl-n0[data-k=\"d|2026-11-11\"]').open");
    assert.deepEqual(JSON.parse(await ev("localStorage.getItem('bcbr_prl_fechados')")),['2026-11-11']);

    // Recarrega a página de verdade e reabre Preliminares
    await call('Page.navigate',{url:C.URL_});
    await ate("typeof SM!=='undefined'&&SM.ok&&typeof go==='function'",15000);
    await ev("go('preliminares');0");
    await ate("document.querySelectorAll('.prl-n0').length===3",10000);
    const abertosDep=await ev("[...document.querySelectorAll('.prl-n0')].map(d=>[d.dataset.k,d.open])");
    assert.deepEqual(abertosDep,[['d|2026-11-12',true],['d|2026-11-11',false],['d|2026-11-10',true]],'dia fechado continua fechado após recarregar');
  });

  assert.deepEqual(C.erros,[]);
});
