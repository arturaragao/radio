// Radio 1.63.0 no Chrome: Flashcards — atalhos (Espaço vira/volta, Enter avança, G abre/fecha imagem, Esc fecha),
// filtros tema/imagem com contagens, flashcards/questoes.json ("Questões do banco"), e bloco diário de 100. Dados fictícios.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {iniciar}=require('./chrome-util.js');

test('Radio 1.63.0: Flashcards atalhos, filtros tema/imagem, questoes.json e bloco de 100',{timeout:180000},async t=>{
  const C=await iniciar({porta:8809,env:{BCBR_QS:'10'}});t.after(()=>C.fim());
  const {ev,call,click,tecla,especial,ate,espera}=C;
  const espaco=()=>tecla(' ',{code:'Space',windowsVirtualKeyCode:32});
  const teclaG=()=>tecla('g',{code:'KeyG',windowsVirtualKeyCode:71});

  // 1) Tolerância à ausência de flashcards/questoes.json (404 no servidor simulado padrão)
  await t.test('abre normalmente quando flashcards/questoes.json está ausente (404)',async()=>{
    await C.abre('fc');
    await ate("typeof fcHojeStart==='function'&&document.getElementById('fc_tema')");
    assert.equal(await ev("window.FC_QUESTOES??null"),null);
    assert.equal(await ev("!!document.getElementById('fc_hoje_btn')"),true);
  });

  // 2) Prepara dados fictícios para flashcards/questoes.json e resumos/indice.json + imagens JPEG no servidor simulado
  const fqDados={
    v:1,
    cards:[
      {id:'fq_tor_img',q:'q_cbr1',chave:'tor|Infecções|Pneumonia',tema:'Pneumonia',comImagem:true,incid:20,f:'Frente Pneumonia (img)',v:'Verso Pneumonia',fi:['fc163-frente.jpg'],vi:['fc163-verso.jpg'],fonte:'CBR'},
      {id:'fq_tor_txt',q:'q_cbr2',chave:'tor|Infecções|Tuberculose',tema:'Tuberculose',comImagem:false,incid:45,f:'Frente Tuberculose (texto)',v:'Verso Tuberculose',fi:[],vi:[]},
      {id:'fq_dig_img',q:'q_ger1',chave:'dig|Fígado|Esteatose',tema:'Esteatose',comImagem:true,incid:80,f:'Frente Esteatose (img)',v:'Verso Esteatose',fi:['fc163-frente.jpg'],vi:[]}
    ]
  };
  const rsDados=[
    {pagina:'notas',titulo:'Resumo Abdome',chave:'dig|Pâncreas|Pancreatite',cards:[
      {id:'rz_pan_01',f:'Frente Pancreatite',v:'Verso Pancreatite'}
    ]}
  ];

  await ev(`(async()=>{
    const mk=cor=>{const c=document.createElement('canvas');c.width=40;c.height=30;const x=c.getContext('2d');x.fillStyle=cor;x.fillRect(0,0,40,30);return c.toDataURL('image/jpeg').split(',')[1]};
    await BCBR.api('/repos/'+BCBR.REPO+'/contents/imagens/fc163-frente.jpg',{method:'PUT',body:JSON.stringify({message:'img f',content:mk('#27ae60')})});
    await BCBR.api('/repos/'+BCBR.REPO+'/contents/imagens/fc163-verso.jpg',{method:'PUT',body:JSON.stringify({message:'img v',content:mk('#8e44ad')})});
  })()`);

  // Mock de flashcards/questoes.json e resumos/indice.json na API interceptada pelo shim.js
  const MOCK_API=`(()=>{
    if(window.__mock163fc)return;window.__mock163fc=true;
    const orig=window.fetch.bind(window);
    const fq=${JSON.stringify(fqDados)},rs=${JSON.stringify(rsDados)};
    window.fetch=(u,o)=>{
      const s=String(u);
      if(s.endsWith('/contents/flashcards'))return Promise.resolve(new Response(JSON.stringify([{name:'questoes.json',sha:'blob_fq_163',type:'file'}]),{status:200}));
      if(s.endsWith('/git/blobs/blob_fq_163'))return Promise.resolve(new Response(JSON.stringify(fq),{status:200}));
      if(s.endsWith('/contents/resumos'))return Promise.resolve(new Response(JSON.stringify([{name:'indice.json',sha:'blob_rs_163',type:'file'}]),{status:200}));
      if(s.endsWith('/git/blobs/blob_rs_163'))return Promise.resolve(new Response(JSON.stringify(rs),{status:200}));
      return orig(u,o);
    };
  })();`;
  await call('Page.addScriptToEvaluateOnNewDocument',{source:MOCK_API});

  // Limpa IndexedDB 'bcbr' para forçar carregarDados() via shim.js nesta nova carga
  await ev(`new Promise(r=>{const req=indexedDB.deleteDatabase('bcbr');req.onsuccess=req.onerror=req.onblocked=()=>r()})`);
  await C.abre('fc');
  await ate("!!window.FC_QUESTOES&&cards.some(c=>c.id==='fq_tor_img')&&cards.some(c=>c.id==='rz_pan_01')",10000);

  await t.test('carregamento de flashcards/questoes.json ("Questões do banco") + filtros tema/imagem com contagens',async()=>{
    // Contagens no filtro de imagem (Todos=4, Com imagem=2, Sem imagem=2) e tag Questões do banco
    const txt=await ev("document.querySelector('#app').textContent");
    assert.match(txt,/Questões do banco · 3/);
    assert.match(txt,/Resumo Abdome · 1/);
    assert.match(await ev("document.querySelector('.fc-img-seg').textContent"),/Todos \(4\)[\s\S]*Com imagem \(2\)[\s\S]*Sem imagem \(2\)/);

    // Opções do Tema ▾ com contagens (área|tema|subtema)
    const opts=await ev("[...document.querySelectorAll('#fc_tema option')].map(o=>({v:o.value,t:o.textContent.trim()}))");
    assert.ok(opts.some(o=>o.v===''&&o.t.includes('Todos os temas (4)')));
    assert.ok(opts.some(o=>o.v==='tor|'&&o.t.includes('(2)')));
    assert.ok(opts.some(o=>o.v==='tor|Infecções|Pneumonia'&&o.t.includes('(1)')));
    assert.ok(opts.some(o=>o.v==='dig|Fígado|Esteatose'&&o.t.includes('(1)')));

    // Seleciona tema Tórax -> contagens atualizam para 2 (1 com img, 1 sem img)
    await ev("document.getElementById('fc_tema').value='tor|';document.getElementById('fc_tema').dispatchEvent(new Event('change'))");
    await ate("document.querySelector('.fc-img-seg').textContent.includes('Todos (2)')");
    assert.match(await ev("document.querySelector('.fc-img-seg').textContent"),/Com imagem \(1\)[\s\S]*Sem imagem \(1\)/);
    assert.match(await ev("document.querySelector('#app').textContent"),/Navegar \(2 de 4\)/);

    // Filtra por "Com imagem"
    await click('.fc-img-seg button:nth-child(2)');
    await ate("document.querySelector('#app').textContent.includes('Navegar (1 de 4)')");
    assert.match(await ev("document.querySelector('#app .tw').textContent"),/Frente Pneumonia/);
    assert.doesNotMatch(await ev("document.querySelector('#app .tw').textContent"),/Frente Tuberculose/);

    // Filtra por "Sem imagem"
    await click('.fc-img-seg button:nth-child(3)');
    await ate("document.querySelector('#app .tw')?.textContent.includes('Frente Tuberculose')");
    assert.doesNotMatch(await ev("document.querySelector('#app .tw').textContent"),/Frente Pneumonia/);

    // Limpar filtros restaura os 4
    await ev("fcTags.clear();fcTema='';fcImg='todos';render();0");
    await ate("document.querySelector('.fc-img-seg').textContent.includes('Todos (4)')");
  });

  await t.test('atalhos: Espaço vira e volta para frente, Enter avança, G abre/fecha imagem e Esc fecha zoom',async()=>{
    await ev("fcTema='tor|';fcImg='todos';fcStart();0");
    await ate("document.querySelector('.fcard')");
    assert.equal(await ev("fq.i"),0);
    assert.equal(await ev("fq.shown"),false);

    // Espaço vira (mostra verso)
    await espaco();await espera(80);
    assert.equal(await ev("fq.shown"),true);
    assert.match(await ev("document.querySelector('.fcard').textContent"),/Verso Pneumonia/);

    // Espaço de novo volta para a FRENTE
    await espaco();await espera(80);
    assert.equal(await ev("fq.shown"),false);
    assert.doesNotMatch(await ev("document.querySelector('.fcard').textContent"),/Verso Pneumonia/);

    // Responde o card 1 (vira -> Bom) e volta para o card 1: já vem virado, Espaço volta para a frente!
    await espaco();await espera(60);
    await click('.fcg .g3');
    await ate("fq.i===1");
    await espera(60);
    await tecla('ArrowLeft',{code:'ArrowLeft',windowsVirtualKeyCode:37});
    await ate("fq.i===0");
    assert.equal(await ev("fq.shown"),true,'card já respondido abre virado');
    assert.match(await ev("document.querySelector('.fcresp').textContent"),/Resposta dada: Bom/);
    await espaco();await espera(80);
    assert.equal(await ev("fq.shown"),false,'Espaço no card já respondido volta para a frente');
    assert.doesNotMatch(await ev("document.querySelector('.fcard').textContent"),/Verso Pneumonia/);

    // Enter = próximo card
    await especial('Enter');
    await ate("fq.i===1");
    assert.match(await ev("document.querySelector('.fcard').textContent"),/Frente Tuberculose/);

    // Volta para o card 1 (com imagem) e testa G abrir / G fechar / G abrir / Esc fechar
    await tecla('ArrowLeft',{code:'ArrowLeft',windowsVirtualKeyCode:37});
    await ate("fq.i===0");
    await ate("document.querySelector('.fc-img[data-u=\"gh:fc163-frente.jpg\"]')?.naturalWidth>0");

    await teclaG();
    await ate("document.getElementById('zoom').hidden===false");
    assert.ok(await ev("document.getElementById('zimg').src.length>0"));

    // G de novo fecha o visualizador
    await teclaG();
    await ate("document.getElementById('zoom').hidden===true");
    assert.equal(await ev("tela"),'fcstudy');

    // G abre de novo e Esc fecha só o visualizador (continua em fcstudy)
    await teclaG();
    await ate("document.getElementById('zoom').hidden===false");
    await especial('Escape');
    await ate("document.getElementById('zoom').hidden===true");
    assert.equal(await ev("tela"),'fcstudy');

    // Esc com zoom fechado sai para a lista
    await especial('Escape');
    await ate("tela==='fc'");
  });

  await t.test('bloco diário de 100: ordenado por incidência (peso CBR) + imagem primeiro, sem repetidos, x/100 e virada do dia',async()=>{
    await ev(`(()=>{
      const now=Date.now();
      window.RESUMOS_IDX=null;window.FC_QUESTOES=null;
      fq=null;fcTags.clear();fcTema='';fcImg='todos';cfg.fcBlocos=[];cfg.fcAtivo=null;cfg.fcHoje=null;fcs={};
      // Injeta questões fictícias no banco Q com pesos CBR vs não-CBR para testar incidência real
      Q=[
        {id:'qb1',n:1,gab:'A',_a:'tor',cl:['Infecção','CBR Alta'],tags:['Provas CBR'],pr_prova:{test:['Provas CBR']},pr_tags:{}},
        {id:'qb2',n:2,gab:'A',_a:'tor',cl:['Infecção','CBR Alta'],tags:['Provas CBR'],pr_prova:{test:['Provas CBR']},pr_tags:{}},
        {id:'qb3',n:3,gab:'A',_a:'dig',cl:['Fígado','Geral'],tags:[],pr_prova:{},pr_tags:{}}
      ];
      QID=Object.fromEntries(Q.map(q=>[q.id,q]));
      // Cria 110 cartões novos (60 com imagem, 50 sem imagem) + 2 já vistos (não devem entrar)
      const L=[
        {id:'visto_1',chave:'tor|Infecção|CBR Alta',comImagem:true,incid:999,f:'Já visto 1',v:'V',u:1},
        {id:'visto_2',chave:'dig|Fígado|Geral',comImagem:false,incid:999,f:'Já visto 2',v:'V',u:2},
        {id:'novo_sem_alta',chave:'tor|Infecção|CBR Alta',comImagem:false,incid:10,f:'Sem img CBR alta',v:'V',u:3},
        {id:'novo_img_alta',chave:'tor|Infecção|CBR Alta',comImagem:true,incid:10,f:'Img CBR alta',v:'V',u:4},
        {id:'novo_img_baixa',chave:'dig|Fígado|Geral',comImagem:true,incid:5,f:'Img Geral baixa',v:'V',u:5}
      ];
      for(let i=0;i<58;i++)L.push({id:'ni_'+String(i).padStart(3,'0'),chave:'sem|X|Y',comImagem:true,incid:1+i*0.01,f:'Img extra '+i,v:'V',u:10+i});
      for(let i=0;i<49;i++)L.push({id:'nt_'+String(i).padStart(3,'0'),chave:'sem|X|Z',comImagem:false,incid:1+i*0.01,f:'Txt extra '+i,v:'V',u:100+i});
      cards=L;
      fcs={visto_1:[2.5,1,1,now+864e5,0,now-864e5,0],visto_2:[2.5,1,1,now+864e5,0,now-864e5,0]};
      persist();render();
    })()`);
    await ate("document.getElementById('fc_hoje_btn')");

    const fila0=await ev("fcHojeFila()");
    assert.equal(fila0.length,100,'bloco limitado a 100 cards');
    assert.equal(new Set(fila0).size,100,'sem repetidos');
    assert.equal(fila0.includes('visto_1'),false,'não repete já visto 1');
    assert.equal(fila0.includes('visto_2'),false,'não repete já visto 2');
    // Imagem primeiro e CBR alta antes de Geral baixa
    assert.equal(fila0[0],'novo_img_alta');
    assert.equal(fila0[1],'novo_img_baixa');
    // Sem imagem de CBR alta vem depois das 60 com imagem e antes das sem imagem de menor incidência
    const idxSemAlta=fila0.indexOf('novo_sem_alta');
    assert.equal(idxSemAlta,60,'60 com imagem vêm antes dos sem imagem');

    // Inicia "Hoje: 100 cards" e confere contador 0/100 -> 1/100 -> 2/100 no painel
    await click('#fc_hoje_btn');
    await ate("document.querySelector('.qnav .fc-hcnt')");
    assert.equal(await ev("document.querySelector('.qnav .fc-hcnt').textContent"),'0/100');

    await espaco();await espera(50);
    await click('.fcg .g3');
    await ate("document.querySelector('.qnav .fc-hcnt')?.textContent==='1/100'");

    await espaco();await espera(50);
    await click('.fcg .g3');
    await ate("document.querySelector('.qnav .fc-hcnt')?.textContent==='2/100'");

    // Sai para a lista: contador 2/100 e se um card pendente for visto fora, sai e entra o próximo
    await especial('Escape');
    await ate("document.getElementById('fc_hoje_cnt')?.textContent==='2/100'");
    const terceiroId=await ev("fq.ids[2]");
    const pendentesAntes=await ev("fq.ids.filter(id=>!fq.resp[id]).length");
    await ev(`fcs[${JSON.stringify(terceiroId)}]=[2.5,1,1,Date.now()+864e5,0,Date.now(),0];render();0`);
    await espera(80);
    const idsDepois=await ev("cfg.fcBlocos.find(b=>b.hoje===fcHojeData()).ids");
    const pendDepois=await ev("(b=>b.ids.filter(id=>!b.resp[id]).length)(cfg.fcBlocos.find(b=>b.hoje===fcHojeData()))");
    assert.equal(idsDepois.includes(terceiroId),false,'card visto fora saiu da fila pendente');
    assert.equal(pendDepois,98,'entrou o próximo card para completar 100 no dia');

    // Virada de dia: dia anterior não repete os já vistos e reseta o contador para 0/100
    await ev(`cfg.fcHoje={d:'2000-01-01',feitos:['novo_img_alta','novo_img_baixa']};render();0`);
    await ate("document.getElementById('fc_hoje_cnt')?.textContent==='0/100'");
    const filaAmanha=await ev("fcHojeFila()");
    assert.equal(filaAmanha.includes('novo_img_alta'),false,'já visto ontem não entra na fila de hoje');

    // Layout 375 px sem estouro horizontal
    await call('Emulation.setDeviceMetricsOverride',{width:375,height:800,deviceScaleFactor:1,mobile:false});
    assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth+1'),true);
    await call('Emulation.setDeviceMetricsOverride',{width:1000,height:900,deviceScaleFactor:1,mobile:false});
  });

  assert.deepEqual(C.erros,[]);
});
