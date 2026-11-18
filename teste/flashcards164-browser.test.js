// Radio 1.64.0 no Chrome: aceitação dos itens 1–7 (Preliminares fechados + lembrança de abertos,
// botão offline com check verde e progresso %, aviso sem texto, HTML do card sanitizado/formatado,
// painel 2 de 100 compacto <= 90 px a 1280 px, imagem acentuada carrega, 403 rate limit com espera).
// Dados inteiramente fictícios.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {iniciar,espera}=require('./chrome-util.js');

test('Radio 1.64.0: itens 1–7 no navegador',{timeout:240000},async t=>{
  const C=await iniciar({porta:8810,sw:true,largura:1280,altura:900,env:{BCBR_QS:'10'}});
  t.after(()=>C.fim());
  const {ev,call,click,ate}=C;

  const PREL_ITENS=[
    {acesso:'8101',data:'2026-11-12',modalidade:'US',categoria:'Ultrassom',exame:'USG pelve',chefe:'Chefe A.',mudou:true},
    {acesso:'8102',data:'2026-11-11',modalidade:'CT',categoria:'Tomografia',exame:'TC abdome',chefe:'Chefe B.',mudou:false}
  ];
  const INST_SCRIPT=`(()=>{
    if(window.__inst164)return;window.__inst164=true;
    const origFetch=window.fetch.bind(window);
    window.__apiHits164=0;
    window.fetch=async(u,o)=>{
      const s=String(u);
      if(s.includes('/api/'))window.__apiHits164++;
      if(window.__forca403&&s.includes('/api/')){
        const rst=Math.floor(Date.now()/1000)+180;
        return new Response(JSON.stringify({message:'API rate limit exceeded'}),{
          status:403,
          headers:{'content-type':'application/json','x-ratelimit-remaining':'0','x-ratelimit-reset':String(rst)}
        });
      }
      if(s.includes('laudos-tutu-dados')){
        const p=s.split('/contents/')[1];
        const ok=j=>Promise.resolve(new Response(JSON.stringify(j),{status:200,headers:{etag:'W/"1"'}}));
        if(p==='preliminares/indice.json')return ok({versao:1,itens:${JSON.stringify(PREL_ITENS)}});
        if(p==='preliminares/lidos.json')return ok({versao:1,lidos:{}});
        return Promise.resolve(new Response('{}',{status:404}));
      }
      if(window.__atrasoOff164&&s.includes('/contents/notas/')){
        await new Promise(r=>setTimeout(r,350));
      }
      if(window.__dadosMudou164&&s.endsWith('/contents/dados')){
        return new Response(JSON.stringify([{name:'questoes.json',sha:'dados_sha_novo_164',type:'file'}]),{status:200,headers:{'content-type':'application/json'}});
      }
      if(window.__dadosMudou164&&s.endsWith('/git/blobs/dados_sha_novo_164')){
        return new Response(JSON.stringify([]),{status:200,headers:{'content-type':'application/json'}});
      }
      return origFetch(u,o);
    };
  })();`;
  await call('Page.addScriptToEvaluateOnNewDocument',{source:INST_SCRIPT});

  await C.abre('notas');
  await ate("typeof NT!=='undefined'&&!!NT.ed&&!NT.carregando");

  await t.test('1. Preliminares: dias abrem fechados por padrão; abrir manualmente salva em bcbr_prl_abertos e lembra ao recarregar',async()=>{
    await ev("go('preliminares');0");
    await ate("document.querySelectorAll('.prl-n0').length===2",10000);
    assert.deepEqual(await ev("[...document.querySelectorAll('.prl-n0')].map(d=>[d.dataset.k,d.open])"),[['d|2026-11-12',false],['d|2026-11-11',false]]);

    await ev("document.querySelector('.prl-n0[data-k=\"d|2026-11-12\"]>summary').click();0");
    await ate("document.querySelector('.prl-n0[data-k=\"d|2026-11-12\"]').open");
    assert.deepEqual(JSON.parse(await ev("localStorage.getItem('bcbr_prl_abertos')")),['2026-11-12']);

    await call('Page.navigate',{url:C.URL_});
    await ate("typeof SM!=='undefined'&&SM.ok&&typeof go==='function'",15000);
    await ev("go('preliminares');0");
    await ate("document.querySelectorAll('.prl-n0').length===2",10000);
    assert.deepEqual(await ev("[...document.querySelectorAll('.prl-n0')].map(d=>[d.dataset.k,d.open])"),[['d|2026-11-12',true],['d|2026-11-11',false]]);
  });

  await t.test('2. Botão offline: progresso discreto com anel/barra e %, sem texto poluído, check verde nítido nos dois temas',async()=>{
    await ev("go('notas');window.__atrasoOff164=true;0");
    await click('#of_btn');
    await ate("document.getElementById('of_btn').dataset.estado==='baixando'",5000);
    const dur=await ev("({pct:document.querySelector('#of_btn .of-pct')?.textContent,ring:!!document.querySelector('#of_btn .of-ring'),bar:!!document.querySelector('#of_btn .of-bar'),offPill:document.getElementById('bcbr_off')?.textContent||''})");
    assert.match(dur.pct,/^\d+%$/);
    assert.equal(dur.ring,true);
    assert.equal(dur.bar,true);
    assert.doesNotMatch(dur.offPill,/baixando para offline/i);

    await ev("window.__atrasoOff164=false;0");
    await ate("document.getElementById('of_btn').dataset.estado==='baixado'",25000);
    for(const tema of ['light','dark']){
      await ev(`document.documentElement.dataset.theme='${tema}';0`);
      const st=await ev("(()=>{const b=document.getElementById('of_btn');return {on:b.classList.contains('on'),color:getComputedStyle(b).color,svg:!!b.querySelector('svg path')}})()");
      assert.equal(st.on,true);
      assert.equal(st.svg,true);
      assert.equal(st.color,'rgb(74, 222, 128)','check verde nítido no tema '+tema);
    }
  });

  await t.test('3. Aviso de atualização sem texto: mostra apenas Atualizar e ×',async()=>{
    const mudou=await ev("(async()=>{window.__dadosMudou164=true;try{return await BCBR.carregarDados(true)}finally{window.__dadosMudou164=false}})()");
    assert.equal(mudou,true);
    await ev("navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:'bcbr-nova'}));0");
    await ate("document.getElementById('bcbr_aviso')",5000);
    const av=await ev("(()=>{const el=document.getElementById('bcbr_aviso');return {filhos:[...el.children].map(c=>c.id),span:!!el.querySelector('span'),txt:el.textContent.trim()}})()");
    assert.deepEqual(av.filhos,['bcbr_av_ok','bcbr_av_no']);
    assert.equal(av.span,false);
    assert.equal(av.txt,'Atualizar✕');
    await click('#bcbr_av_no');
    await ate("!document.getElementById('bcbr_aviso')");
  });

  await t.test('4, 5 e 6. Flashcards: HTML sanitizado/formatado, painel compacto <= 90 px a 1280 px com clique, e imagem acentuada carrega',async()=>{
    // Sobe imagem fictícia com nome acentuado e espaços no servidor simulado
    await ev(`(async()=>{
      const c=document.createElement('canvas');c.width=48;c.height=36;const x=c.getContext('2d');x.fillStyle='#16a34a';x.fillRect(0,0,48,36);
      const b64=c.toDataURL('image/jpeg').split(',')[1];
      await BCBR.api('/repos/'+BCBR.REPO+'/contents/imagens/'+encodeURIComponent('ovário e anexos (1).jpg'),{method:'PUT',body:JSON.stringify({message:'img acentuada',content:b64})});
    })()`);

    await ev(`(()=>{
      const cs=[{
        id:'fq164_0',
        f:'Qual a estrutura apontada pelas setas no US e o diagnóstico?<script>window.__xss164=1</script>',
        v:'<b>Teratoma maduro</b>.<br> • Conteúdo ecogênico com sombra acústica<br> • Nódulo de Rokitansky<br> <i>Pegadinha:</i> não confundir com endometrioma.<img src="x" onerror="window.__xss164=2">',
        fi:['imagens/ovário e anexos (1).jpg','nao-existe-164.jpg'],
        vi:[],
        tg:'Questões do banco;'
      }];
      for(let i=1;i<100;i++)cs.push({id:'fq164_'+i,f:'Frente '+i,v:'Verso '+i,tg:'Questões do banco;'});
      cards=cs;fcs={};fq=null;cfg.fcBlocos=[];cfg.fcAtivo=null;
      const ids=cs.map(c=>c.id);
      const b={id:'b164',rs:'',titulo:'Questões',ids,i:0,resp:{},fim:false,t0:Date.now(),u:Date.now()};
      fcBlocoSalvaNovo(b);fcBlocoCarrega(b);go('fcstudy');
    })()`);

    await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    await ate("document.querySelector('.qnav .qgrid')&&document.querySelector('.fcard')");

    // 5. Painel compacto <= 90 px a 1280 px e clique para pular
    const navH=await ev("document.querySelector('.qnav').getBoundingClientRect().height");
    assert.ok(navH<=90,`altura do painel a 1280 px deve ser <= 90 px (deu ${navH} px)`);
    await click('.qnav .qn:nth-child(2)');
    await ate("fq.i===1");
    await click('.qnav .qn:nth-child(1)');
    await ate("fq.i===0");

    // 6. Imagem com nome acentuado carrega; imagem inexistente fica oculta
    await ate("document.querySelector('.fc-img[data-u=\"gh:ovário e anexos (1).jpg\"]')?.naturalWidth>0",10000);
    assert.equal(await ev("document.querySelector('.fc-img[data-u=\"gh:ovário e anexos (1).jpg\"]').hidden"),false);
    await ate("document.querySelector('.fc-img[data-u=\"gh:nao-existe-164.jpg\"]')?.hidden===true",10000);

    // 4. HTML renderizado, sanitizado e formatado
    await click('#app button.b[onclick*="fq.shown=true"]');
    await ate("document.querySelector('.fcard .fc-peg')");
    const fcInfo=await ev(`(()=>{
      const f=document.querySelector('.fcard');
      const dx=f.querySelector('.fc-dx b')?.textContent||'';
      const lis=[...f.querySelectorAll('ul li')].map(li=>li.textContent.trim());
      const peg=f.querySelector('.fc-peg');
      const ul=f.querySelector('ul');
      return {
        xss:window.__xss164||null,
        txt:f.textContent,
        dx,lis,
        pegTxt:peg?.textContent.trim()||'',
        pegItalico:peg?.querySelector('i')?.textContent.trim()||'',
        pegAbaixo:peg&&ul?peg.getBoundingClientRect().top>=ul.getBoundingClientRect().bottom-2:false,
        scripts:f.querySelectorAll('script').length
      };
    })()`);
    assert.equal(fcInfo.xss,null,'XSS bloqueado');
    assert.equal(fcInfo.scripts,0);
    assert.doesNotMatch(fcInfo.txt,/<\/?(?:b|i|br|ul|li|script|img)\b/i,'nenhuma tag HTML crua visível');
    assert.equal(fcInfo.dx,'Teratoma maduro');
    assert.deepEqual(fcInfo.lis,['Conteúdo ecogênico com sombra acústica','Nódulo de Rokitansky']);
    assert.equal(fcInfo.pegItalico,'Pegadinha:');
    assert.match(fcInfo.pegTxt,/Pegadinha:\s*não confundir com endometrioma/);
    assert.equal(fcInfo.pegAbaixo,true,'pegadinha em linha separada abaixo da lista');
  });

  await t.test('7. Erro 403 com rate limit: mostra mensagem de ocupado com hora, não diz sem conexão e não martela',async()=>{
    await ev("go('notas');window.__forca403=true;BCBR.pausaAte=0;BCBR.limiteMsg='';0");
    await ev("smPuxar().catch(()=>{});persist('_est');flush().catch(()=>{});0");
    await ate("(window.BCBR.pausaAte||0)>Date.now()",5000);

    const ui=await ev("({sync:document.querySelector('#sync span').textContent,rd:document.getElementById('rd_sync').textContent,pausa:BCBR.pausaAte})");
    assert.doesNotMatch(ui.sync,/sem conexão/i);
    assert.doesNotMatch(ui.rd,/sem conexão/i);
    assert.match(ui.sync,/^GitHub ocupado, tentando às \d\d:\d\d$/);
    assert.match(ui.rd,/^GitHub ocupado, tentando às \d\d:\d\d$/);

    const hitsAntes=await ev("window.__apiHits164");
    await ev("smPuxar().catch(()=>{});SyncNotas.enviar().catch(()=>{});0");
    await espera(400);
    const hitsDepois=await ev("window.__apiHits164");
    assert.equal(hitsDepois,hitsAntes,'não martela a API durante a pausa de rate limit');

    // Recupera após limpar pausa e restaurar 200
    await ev("window.__forca403=false;BCBR.pausaAte=0;BCBR.limiteMsg='';0");
  });

  assert.deepEqual(C.erros,[]);
});
