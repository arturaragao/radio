// Página Preliminares no Chrome (1.50.0): dados SINTÉTICOS servidos por um fetch trocado na página; nada vai ao GitHub.
// BCBR_CAPTURAS=<pasta> grava capturas (claro/escuro, 375 px e PC).
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {iniciar,espera}=require('./chrome-util.js');
const CAP=process.env.BCBR_CAPTURAS;
const ITENS=[
  {acesso:'9000101',data:'2026-11-12',modalidade:'US',categoria:'Ultrassom',exame:'Doppler de carótidas e vertebrais',chefe:'Chefe A.',mudou:true},
  {acesso:'9000102',data:'2026-11-11',modalidade:'US',categoria:'Ultrassom',exame:'Doppler de carótidas e vertebrais',chefe:'Chefe B.',mudou:false},
  {acesso:'9000103',data:'2026-11-10',modalidade:'US',categoria:'Ultrassom',exame:'Doppler arterial de MMII',chefe:'Chefe A.',mudou:true},
  {acesso:'9000201',data:'2026-11-12',modalidade:'CT',categoria:'Tomografia',exame:'TC de abdome total',chefe:'Chefe C.',mudou:true},
  {acesso:'9000202',data:'2026-11-09',modalidade:'CT',categoria:'Tomografia',exame:'Angio-TC de tórax',chefe:'Chefe A.',mudou:true},
  {acesso:'9000301',data:'2026-10-20',modalidade:'MR',categoria:'Ressonância',exame:'RM de joelho',chefe:'',mudou:false}];
const PARES={'9000101':{preliminar:{html:'<p><b>Doppler de carótidas</b></p><p>Placa ateromatosa <u>calcificada</u> no bulbo à direita, com estenose de 30%.</p><ul><li>Vertebrais pérvias</li></ul>'},
  definitivo:{html:'<p><b>Doppler de carótidas</b></p><p>Placa ateromatosa <u>mista</u> no bulbo à direita, com estenose de <i>40%</i>.</p><ul><li>Vertebrais pérvias com fluxo anterógrado</li></ul><p>Este laudo foi assinado eletronicamente.12/11/2026 09:33:25 / Informamos que o exame, composto por laudo e imagens, deve ser apresentado ao médico solicitante... Hospital Santa Isabel não realiza contato com pacientes para agendamento de consultas baseado no laudo do exame realizado.</p>'},mudou:true},
  '9000102':{preliminar:{html:'<p>Exame sem alterações.</p>'},definitivo:{html:'<p>Exame sem alterações.</p>'},mudou:false},
  '9000103':{preliminar:{texto:'Artérias pérvias.'},definitivo:{texto:'Artérias pérvias, sem estenoses.'},mudou:true}};
test('Radio 1.55: página Preliminares (Chrome, dados sintéticos)',{timeout:120000},async t=>{
  const C=await iniciar({porta:8794,env:{BCBR_QS:'10'}});t.after(()=>C.fim());
  const {ev,ate,call}=C;await C.abre();
  const INST=`(()=>{window.__req=[];const f=window.fetch;window.fetch=(u,o)=>{u=String(u);
    if(u.includes('laudos-tutu-dados')){const p=u.split('/contents/')[1];window.__req.push(p);window.__auth=(o&&o.headers&&o.headers.Authorization)||'';
      const ok=j=>Promise.resolve(new Response(JSON.stringify(j),{status:200,headers:{etag:'W/"1"'}}));
      if(window.__semAcesso&&window.__auth!=='Bearer ghp_chave_de_teste')return Promise.resolve(new Response('{}',{status:404}));
      if(p==='preliminares/indice.json')return ok({versao:1,itens:${JSON.stringify(ITENS)}});
      if(p==='preliminares/lidos.json')return ok({versao:1,lidos:{'9000101':'2026-11-12T20:00:00'}});
      const m=p.match(/pares\\/(\\d+)\\.json$/),par=m&&${JSON.stringify(PARES)}[m[1]];
      return par?ok(par):Promise.resolve(new Response('{}',{status:404}))}
    return f(u,o)};0})()`;
  await ev(INST);
  const foto=async nome=>{if(CAP){fs.mkdirSync(CAP,{recursive:true});await espera(250);await C.shot(path.join(CAP,nome))}};
  const tema=async(esc,larg)=>{await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:esc}]});await ev(`document.documentElement.dataset.theme='${esc==='dark'?'dark':'light'}'`);
    await call('Emulation.setDeviceMetricsOverride',{width:larg,height:larg<500?800:900,deviceScaleFactor:1,mobile:false});await espera(200)};
  await t.test('sem chave própria usa a do app; índice e lidos carregam, pares não',async()=>{
    // 1.50.4: Preliminares é página especial de Notas, dentro da pasta Laudos, logo abaixo de "Notas USG"
    await ev("go('notas')");await ate("!!document.getElementById('nt_lat')&&!NT.carregando&&!!NT.ed");
    await ev(`(()=>{const ag=ntAgora();ntPastasMuda(l=>l.push({id:'fLaudosT',titulo:'Laudos',ordem:10,criado:ag,atualizado:ag}));const id=ntPaginaCria();pgMuda(l=>{const p=l.find(x=>x.id===id);p.titulo='Notas USG';p.pasta='fLaudosT';p.ordem=10});ntLateralPinta();return id})()`);
    await ate("!!document.querySelector('[data-pasta=\"fLaudosT\"] .nt-pg-prel')");
    assert.deepEqual(await ev("[...document.querySelector('[data-pasta=\"fLaudosT\"] .nt-pg-lista').children].map(x=>x.querySelector('a').textContent)"),['Notas USG','Preliminares']);
    assert.equal(await ev("document.querySelector('.nt-pg-prel [onclick*=ntPrelClique]')?.textContent||document.querySelector('.nt-pg-prel a').textContent"),'Preliminares');
    assert.equal(await ev("document.querySelector('.nt-pg-prel').matches('.nt-pg-it')||!!document.querySelector('.nt-pg-prel .nt-pg-alca,.nt-pg-prel .nt-pg-pin,.nt-pg-prel .nt-pg-mover')"),false,'sem alça, fixar nem mover');
    await ev("document.querySelector('.nt-pg-prel a').click()");await ate("document.querySelector('.prl-n0')");
    assert.equal(await ev("tela"),'notas');assert.equal(await ev("!!document.getElementById('nt_titulo')"),false);
    assert.equal(await ev("getComputedStyle(document.querySelector('.nt-pg-opcoes')).display"),'none');
    assert.ok((await ev("window.__req")).includes('preliminares/indice.json'));
    await ate("!PRL.lote.rodando&&PRL.nIdx===3");   // 1.54: ao abrir Preliminares os pares são baixados em segundo plano (os 3 sem arquivo dão 404 e ficam de fora)
    assert.deepEqual((await ev("window.__req")).filter(r=>r.includes('/pares/')).sort(),['9000101','9000102','9000103','9000201','9000202','9000301'].map(a=>'preliminares/pares/'+a+'.json'));
    assert.match(await ev("window.__auth"),/^Bearer /);
    assert.equal(await ev("document.querySelector('.prl h1').textContent"),'Preliminares');
    assert.deepEqual(await ev("[...document.querySelectorAll('.prl-n0')].map(d=>d.dataset.k)"),['d|2026-11-12','d|2026-11-11','d|2026-11-10','d|2026-11-09','d|2026-10-20']);   // dia no topo, mais recente primeiro
    assert.deepEqual(await ev("[...document.querySelectorAll('.prl-n0 > summary .prl-n')].map(s=>s.textContent)"),['2','1','1','1','1']);
    assert.deepEqual(await ev("[...document.querySelectorAll('.prl-n0 > summary .prl-pend')].map(s=>s.textContent)"),['2 faltam conferir','1 falta conferir','1 falta conferir','1 falta conferir','1 falta conferir']);
    assert.match(await ev("document.getElementById('prl_pend').textContent"),/6 faltam conferir/);
    assert.equal(await ev("tela"),'notas');
    assert.equal(await ev("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Preliminares')"),false,'sem aba própria no topo');
    assert.equal(await ev("SyncNotas.estado().paginas.some(p=>p.id==='preliminares'||p.titulo==='Preliminares')"),false,'não é página sincronizada');
  });
  await t.test('níveis 1 > 2 > 3 abrem sob demanda; acesso é o título; ✓ só nos lidos; chefe e data ao lado',async()=>{
    await ev("document.querySelector('.prl-n0[data-k=\"d|2026-11-12\"]>summary').click()");
    await ate("document.querySelector('.prl-n0')");
    assert.equal(await ev("document.querySelectorAll('.prl-n2').length"),0);
    await ev("document.querySelector('.prl-n1[data-k=\"c1|2026-11-12|Ultrassom\"]>summary').click()");
    await ate("document.querySelector('.prl-n2')");
    assert.equal(await ev("document.querySelectorAll('.prl-n3').length"),0);
    await ev("document.querySelector('.prl-n2[data-k*=\"carótidas\"]>summary').click()");
    await ate("document.querySelectorAll('.prl-n3').length===1");
    assert.equal(await ev("document.querySelector('.prl-n3 .prl-ac').textContent"),'9000101');
    assert.equal(await ev("document.querySelector('.prl-n3 .prl-meta').textContent"),'12/11/2026 · Chefe A.');
    assert.equal(await ev("document.querySelector('.prl-n3 > summary .prl-conf input').type"),'checkbox');
    assert.equal(await ev("document.querySelectorAll('.prl-ok').length"),1);
    assert.equal(await ev("document.querySelector('.prl-ok').closest('.prl-n3').querySelector('.prl-ac').textContent"),'9000101');
  });
  await t.test('abrir o acesso baixa só aquele par e mostra os três toggles; corrigido marca tirado/posto e mantém formatação',async()=>{
    await ev("document.querySelector('.prl-n3>summary').click()");
    await ate("document.querySelectorAll('.prl-sub').length===3");
    assert.equal((await ev("window.__req")).filter(r=>r==='preliminares/pares/9000101.json').length,1,'o par já veio em segundo plano: abrir o toggle não baixa de novo');
    assert.deepEqual(await ev("[...document.querySelectorAll('.prl-sub>summary')].map(s=>s.firstChild.textContent)"),['Laudo preliminar','Laudo definitivo','Corrigido']);
    await ev("document.querySelectorAll('.prl-sub>summary').forEach(s=>s.click())");await espera(150);
    const cor=await ev("document.querySelectorAll('.prl-sub')[2].querySelector('.prl-laudo').innerHTML");
    assert.match(cor,/<del>calcificada<\/del>/);
    assert.ok(!/assinado|Informamos|Santa Isabel/.test(cor),'rodapé do PACS não é correção');
    assert.ok(!/assinado|Informamos/.test(await ev("document.querySelectorAll('.prl-sub')[1].querySelector('.prl-laudo').textContent")),'nem aparece no definitivo');assert.match(cor,/<ins>mista<\/ins>/);assert.match(cor,/<b>Doppler de carótidas<\/b>/);assert.match(cor,/<ul><li>/);
    const est=await ev("(()=>{const s=document.querySelectorAll('.prl-sub')[2],d=s.querySelector('del'),i=s.querySelector('ins');return [getComputedStyle(d).textDecorationLine,getComputedStyle(i).textDecorationLine,getComputedStyle(d).color,getComputedStyle(i).color]})()");
    assert.equal(est[0],'line-through');assert.equal(est[1],'underline');assert.notEqual(est[2],est[3]);
    assert.match(await ev("document.querySelectorAll('.prl-sub')[1].querySelector('.prl-laudo').innerHTML"),/<u>mista<\/u>/);   // definitivo com formatação
    await foto('claro-pc-par.png');
  });
  await t.test('busca por texto, período e "só não lidos" filtram sem perder o foco; contagem muda',async()=>{
    await ev("(()=>{const q=document.getElementById('prl_q');q.focus();q.value='tórax';q.dispatchEvent(new Event('input',{bubbles:true}))})()");
    await ate("document.querySelectorAll('.prl-n3').length===1");
    assert.equal(await ev("document.activeElement.id"),'prl_q');
    assert.match(await ev("document.getElementById('prl_cont').textContent"),/^1 laudo de 6$/);
    await ev("(()=>{const q=document.getElementById('prl_q');q.value='';q.dispatchEvent(new Event('input',{bubbles:true}));const d=document.getElementById('prl_de');d.value='2026-11-12';d.dispatchEvent(new Event('change'))})()");
    await ate("document.querySelectorAll('.prl-n3').length===2");
    await ev("(()=>{const s=document.getElementById('prl_so');s.value='naolidos';s.dispatchEvent(new Event('change'))})()");
    await ate("document.querySelectorAll('.prl-n3').length===1&&document.querySelector('.prl-ac').textContent==='9000201'");
    await ev("prelLimpa()");
    assert.equal(await ev("document.getElementById('prl_q').value"),'');
  });
  await t.test('acesso sem correção mostra o aviso; erro do par tem "Tentar de novo"',async()=>{
    await ev("prelLimpa();PRL.estado={'d|2026-11-11':true,'c1|2026-11-11|Ultrassom':true,'c2|2026-11-11|Ultrassom|Doppler de carótidas e vertebrais':true,'a|9000102':true};render();0");
    await ate("document.querySelector('.prl-sub')");
    await ev("document.querySelectorAll('.prl-sub>summary')[2].click()");
    assert.match(await ev("document.querySelectorAll('.prl-sub')[2].textContent"),/O chefe não mudou o texto/);
    await ev("PRL.estado={'a|9000201':true,'d|2026-11-12':true,'c1|2026-11-12|Tomografia':true,'c2|2026-11-12|Tomografia|TC de abdome total':true};render();0");
    await ate("document.querySelector('.prl-erro')");
    assert.ok(await ev("!!document.querySelector('.prl-erro button')"));
  });
  await t.test('sem acesso ao repo de dados: pede a chave dos laudos e a usa nas próximas leituras',async()=>{
    await ev("window.__semAcesso=true;PRL.itens=null;PRL.pares={};PRL.estado={};prelCarrega(true);0");
    await ate("document.getElementById('prl_k')");
    assert.match(await ev("document.querySelector('.prl-chave').textContent"),/laudos-tutu-dados/);
    await foto('claro-pc-sem-chave.png');
    await ev("document.getElementById('prl_k').value='ghp_chave_de_teste';prelSalvaChave();0");
    await ate("document.querySelector('.prl-n0')");
    assert.equal(await ev("window.__auth"),'Bearer ghp_chave_de_teste');
    assert.equal(await ev("localStorage.getItem('bcbr_gh_token_dados')"),'ghp_chave_de_teste');
  });
  await t.test('aba Config > Geral tem a "Chave dos laudos": salvar, testar e remover',async()=>{
    await ev("window.__semAcesso=true;cfgTab='geral';go('config');0");
    await ate("document.getElementById('prl_ck')");
    assert.match(await ev("document.querySelector('.prl-cfg').textContent"),/laudos-tutu-dados/);
    await ev("document.getElementById('prl_ck').value='ghp_errada';prelCfgTesta();0");
    await ate("/recusou|não enxerga/.test(document.getElementById('prl_cm').textContent)");
    await ev("document.getElementById('prl_ck').value='ghp_chave_de_teste';prelCfgSalva();0");
    assert.equal(await ev("localStorage.getItem('bcbr_gh_token_dados')"),'ghp_chave_de_teste');
    assert.match(await ev("document.getElementById('prl_cs').textContent"),/Há uma chave salva/);
    await ev("prelCfgTesta();0");
    await ate("/funcionando/.test(document.getElementById('prl_cm').textContent)");
    await ev("prelCfgRemove();0");
    assert.equal(await ev("localStorage.getItem('bcbr_gh_token_dados')"),null);
    assert.match(await ev("document.getElementById('prl_cs').textContent"),/Nenhuma chave/);
    await ev("document.getElementById('prl_ck').value='ghp_chave_de_teste';prelCfgSalva();window.__semAcesso=false;go('preliminares');0");
    await ate("document.querySelector('.prl-n0')");
  });
  // estado aberto para os testes de 1.53: 9000101 (12/11) e 9000102 (11/11), com os pares na memória
  const ABRE=`PRL.estado={'d|2026-11-12':true,'c1|2026-11-12|Ultrassom':true,'c2|2026-11-12|Ultrassom|Doppler de carótidas e vertebrais':true,'a|9000101':true,'d|2026-11-11':true,'c1|2026-11-11|Ultrassom':true,'c2|2026-11-11|Ultrassom|Doppler de carótidas e vertebrais':true,'a|9000102':true,'d|2026-11-10':true,'c1|2026-11-10|Ultrassom':true,'c2|2026-11-10|Ultrassom|Doppler arterial de MMII':true,'a|9000103':true,'c|9000101|p':true,'c|9000101|d':true,'c|9000101|c':true};PRL.filtro={texto:'',de:'',ate:'',so:''};render();0`;
  const clica=async(sel,dx=0)=>{const p=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)throw Error('Ausente '+${JSON.stringify(sel)});const r=e.getBoundingClientRect();return {x:r.x+r.width/2+${dx},y:r.y+r.height/2}})()`);
    await C.mouse('mouseMoved',p.x,p.y);await C.mouse('mousePressed',p.x,p.y);await C.mouse('mouseReleased',p.x,p.y);await espera(120)};
  await t.test('checkbox "conferi": no canto direito, não abre/fecha o toggle, grava no plano, sincroniza (recarrega) e atualiza os contadores',async()=>{
    await ev(ABRE);await ate("document.querySelectorAll('.prl-n3').length===3&&document.querySelectorAll('.prl-sub').length>=3");
    await ev("document.querySelector('.prl-n3[data-ac=\"9000101\"]>summary').scrollIntoView({block:'center'});0");
    const sel='.prl-n3[data-ac="9000101"]>summary .prl-conf input';
    const lado=await ev(`(()=>{const s=document.querySelector('.prl-n3[data-ac="9000101"]>summary').getBoundingClientRect(),c=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return [s.right-c.right,c.left>s.left+s.width/2]})()`);
    assert.ok(lado[1]&&lado[0]<30,'checkbox no canto direito do summary');
    assert.equal(await ev("PRL.pares['9000101'].par.mudou"),true);
    await clica(sel);
    await ate("!!SM.d.prelConf&&!!SM.d.prelConf['9000101']");
    assert.match(await ev("SM.d.prelConf['9000101']"),/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/);
    assert.deepEqual(await ev("Object.keys(SM.d.prelConf)"),['9000101']);   // só número do acesso + hora
    assert.equal(await ev("document.querySelector('.prl-n3[data-ac=\"9000101\"]').open"),true,'clicar no check não fecha o toggle');
    assert.equal(await ev("document.querySelector('.prl-n3[data-ac=\"9000101\"] .prl-conf input').checked"),true);
    assert.match(await ev("document.getElementById('prl_pend').textContent"),/5 faltam conferir/);
    assert.deepEqual(await ev("[...document.querySelectorAll('.prl-n0 > summary .prl-pend')].map(s=>s.textContent)"),['1 falta conferir','1 falta conferir','1 falta conferir','1 falta conferir','1 falta conferir']);   // dia 12/11 ainda tem o TC; os outros mantêm
    await ev("document.querySelector('.prl-n3[data-ac=\"9000102\"]>summary').click()");   // outro toggle fecha/abre normalmente
    await ate("!document.querySelector('.prl-n3[data-ac=\"9000102\"]').open");
    await clica('.prl-n3[data-ac="9000101"]>summary .prl-meta');   // clicar fora do check ainda alterna
    await ate("!document.querySelector('.prl-n3[data-ac=\"9000101\"]').open");
    await ev("document.querySelector('.prl-n3[data-ac=\"9000101\"]>summary').click()");await ate("document.querySelector('.prl-n3[data-ac=\"9000101\"]').open");
    // persiste: grava no GitHub simulado e volta depois de recarregar
    assert.ok(await C.confirmado(),'plano gravado');
    await C.abre();await ev(INST);
    assert.equal(await ev("tela"),'notas','abre direto em Notas');
    await ate("!!SM.d&&!!SM.d.prelConf&&!!SM.d.prelConf['9000101']");
    await ev("go('preliminares');PRL.erro='';PRL.semChave=false;prelCarrega(true);0");await ate("document.querySelector('.prl-n0')");   // (a página reaberta já tentou ler antes de o teste trocar o fetch)
    await ev("PRL.estado={'d|2026-11-12':true,'c1|2026-11-12|Ultrassom':true,'c2|2026-11-12|Ultrassom|Doppler de carótidas e vertebrais':true};render();0");
    await ate("document.querySelector('.prl-n3[data-ac=\"9000101\"] .prl-conf input')");
    assert.equal(await ev("document.querySelector('.prl-n3[data-ac=\"9000101\"] .prl-conf input').checked"),true,'marcação veio do plano sincronizado');
    assert.match(await ev("document.getElementById('prl_pend').textContent"),/5 faltam conferir/);
    // desmarcar também grava
    await ev("document.querySelector('.prl-n3[data-ac=\"9000101\"] .prl-conf input').click()");
    await ate("!SM.d.prelConf['9000101']");
    assert.ok(await C.confirmado());
    assert.match(await ev("document.getElementById('prl_pend').textContent"),/6 faltam conferir/);
  });
  await t.test('"só não conferidos" esconde os conferidos e os aguardando; contagem por grupo muda',async()=>{
    await ev("SM.d.prelConf={'9000201':'2026-11-13T09:00:00'};PRL.filtro={texto:'',de:'',ate:'',so:'naoconf'};PRL.estado={};render();0");
    await ate("document.querySelector('.prl-n0')");
    assert.deepEqual(await ev("[...document.querySelectorAll('.prl-n0')].map(d=>d.dataset.k)"),['d|2026-11-12','d|2026-11-11','d|2026-11-10','d|2026-11-09','d|2026-10-20']);
    assert.equal(await ev("document.querySelectorAll('.prl-n3').length"),5);   // 9000201 conferido some
    assert.match(await ev("document.getElementById('prl_pend').textContent"),/5 faltam conferir/);
    assert.match(await ev("document.getElementById('prl_cont').textContent"),/^5 laudos de 6$/);
    assert.deepEqual(await ev("[...document.querySelectorAll('.prl-n1 > summary .prl-pend')].map(s=>s.textContent)"),['1 falta conferir','1 falta conferir','1 falta conferir','1 falta conferir','1 falta conferir']);
    await ev("SM.d.prelConf={};prelLimpa();0");
  });
  await t.test('período rápido (Hoje, 3, 7, 30 dias) e dias com rótulo Ontem / dia da semana (data de hoje fixada em 13/11/2026)',async()=>{
    await ev("window.__D=Date;window.Date=class extends window.__D{constructor(...a){a.length?super(...a):super(2026,10,13,10,0,0)}static now(){return new window.__D(2026,10,13,10).getTime()}};render();0");
    await ate("document.querySelector('.prl-per')");
    assert.deepEqual(await ev("[...document.querySelectorAll('.prl-per button')].map(b=>b.textContent)"),['Hoje','Últimos 3 dias','Últimos 7 dias','Últimos 30 dias']);
    assert.deepEqual(await ev("[...document.querySelectorAll('.prl-n0 > summary > span:first-child')].map(b=>b.textContent)"),['Ontem','qua. 11/11/2026','ter. 10/11/2026','seg. 09/11/2026','ter. 20/10/2026']);
    await ev("document.querySelectorAll('.prl-per button')[1].click()");
    await ate("document.getElementById('prl_de').value==='2026-11-11'");
    assert.equal(await ev("document.getElementById('prl_ate').value"),'2026-11-13');
    assert.match(await ev("document.getElementById('prl_cont').textContent"),/^3 laudos de 6$/);
    assert.equal(await ev("document.querySelectorAll('.prl-per button')[1].getAttribute('aria-pressed')"),'true');
    await ev("document.querySelectorAll('.prl-per button')[0].click()");
    await ate("document.getElementById('prl_de').value==='2026-11-13'");
    assert.match(await ev("document.querySelector('.prl-lista,#prl_lista').textContent"),/Nada encontrado/);
    await ev("document.querySelectorAll('.prl-per button')[2].click()");
    await ate("document.getElementById('prl_de').value==='2026-11-07'");
    assert.match(await ev("document.getElementById('prl_cont').textContent"),/^5 laudos de 6$/);
    await ev("document.querySelectorAll('.prl-per button')[3].click()");
    await ate("document.getElementById('prl_de').value==='2026-10-15'");
    assert.match(await ev("document.getElementById('prl_cont').textContent"),/^6 laudos de 6$/);
    await ev("window.Date=window.__D;prelLimpa();0");
  });
  await t.test('clicar no número do acesso copia SÓ o número, com aviso, sem abrir/fechar o toggle',async()=>{
    await ev("window.__cp=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:t=>{window.__cp.push(t);return Promise.resolve()}},configurable:true});0");
    await ev(ABRE);await ate("document.querySelectorAll('.prl-n3').length===3");
    await ev("document.querySelector('.prl-n3[data-ac=\"9000101\"]>summary').scrollIntoView({block:'center'});0");
    await clica('.prl-n3[data-ac="9000101"] .prl-ac');
    await ate("window.__cp.length===1");
    assert.equal(await ev("window.__cp[0]"),'9000101');
    assert.equal(await ev("document.querySelector('.prl-n3[data-ac=\"9000101\"]').open"),true,'não fecha');
    assert.equal(await ev("document.getElementById('toast').textContent"),'Acesso copiado');
    // acesso fechado e sem o par na memória: copia o número, sem baixar nada nem abrir
    await ev("PRL.estado={'d|2026-11-10':true,'c1|2026-11-10|Ultrassom':true,'c2|2026-11-10|Ultrassom|Doppler arterial de MMII':true};PRL.pares={};render();0");
    await ate("document.querySelector('.prl-n3[data-ac=\"9000103\"]')");
    await ev("document.querySelector('.prl-n3[data-ac=\"9000103\"]>summary').scrollIntoView({block:'center'});0");
    await clica('.prl-n3[data-ac="9000103"] .prl-ac');
    await ate("window.__cp.length===2");
    assert.equal(await ev("window.__cp[1]"),'9000103');
    assert.equal(await ev("document.querySelector('.prl-n3[data-ac=\"9000103\"]').open"),false,'não abre');
  });
  await t.test('botão "copiar laudo" no cabeçalho do Corrigido: não alterna o toggle e copia o definitivo limpo, sem rodapé do PACS',async()=>{
    await ev("window.__cw=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:t=>{window.__cw.push({txt:t});return Promise.resolve()},write:async it=>{const o=it[0],tx=await (await o.getType('text/plain')).text(),ht=await (await o.getType('text/html')).text();window.__cw.push({txt:tx,html:ht})}},configurable:true});0");
    await ev(ABRE);await ate("document.querySelector('.prl-cor')");
    await ev("document.querySelector('.prl-cor').closest('details').scrollIntoView({block:'center'});0");
    const sel='.prl-sub[data-k="c|9000101|c"]';
    assert.equal(await ev(`document.querySelector('${sel}').open`),true);
    await clica(sel+'>summary .prl-cp');
    await ate("window.__cw.length===1");
    assert.equal(await ev(`document.querySelector('${sel}').open`),true,'não fecha o toggle');
    const r=await ev("window.__cw[0]");
    assert.equal(r.txt,'Doppler de carótidas\nPlaca ateromatosa mista no bulbo à direita, com estenose de 40%.\nVertebrais pérvias com fluxo anterógrado');
    assert.ok(!/<del|<ins|calcificada|assinado|Informamos/.test(r.html+r.txt));assert.match(r.html,/<b>Doppler de carótidas<\/b>/);
    assert.equal(await ev("document.getElementById('toast').textContent"),'Laudo copiado');
    assert.equal(await ev(`(()=>{const b=document.querySelector('${sel} .prl-cp').getBoundingClientRect(),s=document.querySelector('${sel}>summary').getBoundingClientRect();return s.right-b.right<30})()`),true,'no canto direito');
  });
  await t.test('copiar no Corrigido: só o texto final (sem o apagado, sem <ins>/<del>), em text/plain e text/html',async()=>{
    await ev(ABRE);await ate("document.querySelector('.prl-cor del')");
    const r=await ev(`(()=>{const el=document.querySelector('.prl-cor'),s=getSelection(),g=document.createRange();g.selectNodeContents(el);s.removeAllRanges();s.addRange(g);
      const dt=new DataTransfer(),e=new ClipboardEvent('copy',{clipboardData:dt,cancelable:true,bubbles:true});el.dispatchEvent(e);
      return {prev:e.defaultPrevented,txt:dt.getData('text/plain'),html:dt.getData('text/html')}})()`);
    assert.equal(r.prev,true);
    assert.equal(r.txt,'Doppler de carótidas\nPlaca ateromatosa mista no bulbo à direita, com estenose de 40%.\nVertebrais pérvias com fluxo anterógrado');
    assert.ok(!/calcificada|<del|<ins|30%/.test(r.html+r.txt));assert.match(r.html,/<b>Doppler de carótidas<\/b>/);assert.match(r.html,/<i>40%<\/i>/);
    // seleção fora do Corrigido (definitivo) não é mexida
    const r2=await ev(`(()=>{const el=document.querySelectorAll('.prl-laudo')[1],s=getSelection(),g=document.createRange();g.selectNodeContents(el);s.removeAllRanges();s.addRange(g);
      const dt=new DataTransfer(),e=new ClipboardEvent('copy',{clipboardData:dt,cancelable:true,bubbles:true});el.dispatchEvent(e);return e.defaultPrevented})()`);
    assert.equal(r2,false);
    await ev("getSelection().removeAllRanges();0");
  });
  await t.test('fechar um toggle com a página rolada até o fim não sobe a página nem troca a célula sob o mouse',async()=>{
    await call('Emulation.setDeviceMetricsOverride',{width:1000,height:700,deviceScaleFactor:1,mobile:false});await espera(150);
    await ev(ABRE);await ate("document.querySelectorAll('.prl-sub').length>=3");
    await ev("scrollTo(0,document.documentElement.scrollHeight);0");await espera(200);
    assert.ok(await ev("document.documentElement.scrollHeight>innerHeight+200"),'página rolável');
    const DET="(k=>[...document.querySelectorAll('.prl details')].find(d=>d.dataset.k===k))";
    const antes=await ev("(()=>{const l=[...document.querySelectorAll('.prl-n3[open]>summary')].filter(s=>{const t=s.getBoundingClientRect().top;return t>=110&&t<innerHeight-30}),s=l[l.length-1],r=s.querySelector('.prl-meta').getBoundingClientRect();return {k:s.parentElement.dataset.k,top:s.getBoundingClientRect().top,x:r.x+r.width/2,y:r.y+r.height/2,altura:document.documentElement.scrollHeight}})()");
    assert.ok(antes.top>=110&&antes.top<600,'célula visível');
    await C.mouse('mouseMoved',antes.x,antes.y);await C.mouse('mousePressed',antes.x,antes.y);await C.mouse('mouseReleased',antes.x,antes.y);
    await ate(`!${DET}(${JSON.stringify(antes.k)}).open`);await espera(300);
    const depois=await ev(`(()=>{const s=${DET}(${JSON.stringify(antes.k)}).querySelector('summary');return {top:s.getBoundingClientRect().top,altura:document.documentElement.scrollHeight}})()`);
    assert.ok(Math.abs(depois.top-antes.top)<=1,'a célula clicada ficou no mesmo lugar: '+antes.top+' -> '+depois.top);
    assert.ok(depois.altura>=antes.altura-1,'altura da página mantida enquanto não rola (espaçador)');
    assert.equal(await ev("[...document.querySelectorAll('.prl')].every(e=>e.style.minHeight!=='')"),true);
    await ev("document.dispatchEvent(new WheelEvent('wheel',{deltaY:-10}));0");   // o usuário rola: espaçador solto
    assert.equal(await ev("document.querySelector('.prl').style.minHeight"),'');
    await call('Emulation.setDeviceMetricsOverride',{width:1000,height:900,deviceScaleFactor:1,mobile:false});
  });
  const digita=v=>ev(`(()=>{const q=document.querySelector('.bg-in');q.value=${JSON.stringify(v)};q.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await t.test('Ctrl+P acha palavras DENTRO dos laudos (sem acento), mostra acesso · exame · data e de qual texto vem, e abre o acesso com a palavra destacada',async()=>{
    await ev("prelLimpaMemoria();PRL.estado={};PRL.filtro={texto:'',de:'',ate:'',so:''};go('notas');0");
    await ev("bgAbre();0");await ate("document.querySelector('.bg-in')");
    await ate("!PRL.lote.rodando&&PRL.nIdx===3");
    await digita('anterogrado');
    assert.equal(await ev("document.querySelector('.bg-st').textContent"),'','sem "carregando" depois de terminar');
    assert.deepEqual(await ev("[...document.querySelectorAll('.bg-h')].map(h=>h.textContent)"),['Laudos']);
    assert.deepEqual(await ev("[...document.querySelectorAll('.bg-it b')].map(b=>b.textContent)"),['9000101 · Doppler de carótidas e vertebrais · 12/11/2026']);
    assert.match(await ev("document.querySelector('.bg-it small').innerHTML"),/^Definitivo · .*<mark>anterógrado<\/mark>/);
    assert.ok(!/assinado|Informamos/.test(await ev("document.querySelector('.bg-l').textContent")));
    await digita('calcificada');
    assert.match(await ev("document.querySelector('.bg-it small').innerHTML"),/^Preliminar · .*<mark>calcificada<\/mark>/);   // só o preliminar tinha a palavra: foi trocada pelo chefe
    await digita('estenose');
    assert.deepEqual(await ev("[...document.querySelectorAll('.bg-it')].map(b=>b.querySelector('b').textContent.split(' · ')[0]+':'+b.querySelector('small').textContent.split(' · ')[0])"),['9000101:Preliminar e definitivo','9000103:Definitivo']);   // mais recente primeiro
    await digita('pervias sem');assert.equal(await ev("document.querySelector('.bg-it b').textContent.split(' · ')[0]"),'9000103');   // sem acento; todas as palavras
    await digita('assinado');assert.equal(await ev("document.querySelector('.bg-v')?.textContent"),'Nada encontrado.');   // rodapé do PACS não é indexado
    // nada de texto de laudo em armazenamento do navegador
    assert.equal(await ev("Object.keys(localStorage).some(k=>/anterógrado|calcificada|ateromatosa|pérvias/.test(k+localStorage.getItem(k)))"),false);
    // escolher: abre Preliminares com o acesso aberto, rolado até ele, palavra destacada
    await digita('anterogrado');await ev("document.querySelector('.bg-it').click()");
    await ate("document.querySelector('.prl-n3[data-ac=\"9000101\"] mark')");
    assert.equal(await ev("document.querySelector('.bg-in')"),null,'janela fechou');
    assert.equal(await ev("document.querySelector('.prl-n3[data-ac=\"9000101\"]').open"),true);
    assert.equal(await ev("document.querySelector('.prl-n3[data-ac=\"9000101\"] mark').textContent"),'anterógrado');
    assert.equal(await ev("(()=>{const r=document.querySelector('.prl-n3[data-ac=\"9000101\"]').getBoundingClientRect();return r.top>=0&&r.top<innerHeight})()"),true,'rolou até o acesso');
    // trecho só do preliminar: abre o toggle "Laudo preliminar" com a palavra marcada
    await ev("go('notas');bgAbre();0");await ate("document.querySelector('.bg-in')");await digita('calcificada');
    await ev("document.querySelector('.bg-it').click()");
    await ate("document.querySelector('.prl-sub[data-k=\"c|9000101|p\"][open] mark')");
    assert.equal(await ev("document.querySelector('.prl-sub[data-k=\"c|9000101|p\"] mark').textContent"),'calcificada');
    await ev("prelLimpa();0");assert.equal(await ev("PRL.dest"),null);
  });
  await t.test('Ctrl+P sem chave: nenhum pedido ao GitHub e nenhum resultado de laudo, sem erro',async()=>{
    await ev("localStorage.removeItem('bcbr_gh_token_dados');localStorage.removeItem('bcbr_gh_token');prelLimpaMemoria();PRL.estado={};PRL.itens=null;PRL.semChave=false;PRL.erro='';window.__req.length=0;go('notas');0");
    await ev("bgAbre();0");await ate("document.querySelector('.bg-in')");
    await digita('anterogrado');await espera(300);
    assert.equal(await ev("document.querySelector('.bg-l').textContent"),'Nada encontrado.');
    assert.equal(await ev("document.querySelector('.bg-st').textContent"),'');
    assert.deepEqual(await ev("window.__req"),[]);
    await ev("ntModalFecha(document.querySelector('.nt-modal'));localStorage.setItem('bcbr_gh_token_dados','ghp_chave_de_teste');prelCarrega(true);0");await ate("PRL.itens&&!PRL.lote.rodando&&PRL.nIdx===3");
  });
  await t.test('modo da lista "Por exame": Categoria > Exame > Acesso com a data em cada acesso, contadores e filtros iguais, preferência lembrada',async()=>{
    await ev("SM.d.prelConf={};PRL.estado={};PRL.filtro={texto:'',de:'',ate:'',so:''};go('preliminares');0");await ate("document.querySelector('.prl-n0')");
    assert.deepEqual(await ev("[...document.querySelectorAll('.prl-modo button')].map(b=>b.textContent+':'+b.getAttribute('aria-pressed'))"),['Por dia:true','Por exame:false']);
    await ev("document.querySelectorAll('.prl-modo button')[1].click()");await ate("!document.querySelector('.prl-n0')");
    assert.equal(await ev("localStorage.getItem('bcbr_prl_modo')"),'exame');
    assert.deepEqual(await ev("[...document.querySelectorAll('.prl-n1 > summary > span:first-child')].map(s=>s.textContent)"),['Tomografia','Ultrassom','Ressonância']);
    assert.deepEqual(await ev("[...document.querySelectorAll('.prl-n1 > summary .prl-pend')].map(s=>s.textContent)"),['2 faltam conferir','3 faltam conferir','1 falta conferir']);
    assert.match(await ev("document.getElementById('prl_pend').textContent"),/6 faltam conferir/);
    await ev("document.querySelector('.prl-n1[data-k=\"c1|*|Ultrassom\"]>summary').click()");await ate("document.querySelector('.prl-n2')");
    assert.deepEqual(await ev("[...document.querySelectorAll('.prl-n2 > summary > span:first-child')].map(s=>s.textContent)"),['Doppler arterial de MMII','Doppler de carótidas e vertebrais']);
    await ev("document.querySelector('.prl-n2[data-k*=\"carótidas\"]>summary').click()");await ate("document.querySelectorAll('.prl-n3').length===2");
    assert.deepEqual(await ev("[...document.querySelectorAll('.prl-n3 .prl-meta')].map(s=>s.textContent)"),['12/11/2026 · Chefe A.','11/11/2026 · Chefe B.']);   // dia em cada acesso, mais recente primeiro
    // filtros e conferidos valem neste modo
    await ev("SM.d.prelConf={'9000101':'2026-11-13T09:00:00'};PRL.filtro={texto:'',de:'',ate:'',so:'naoconf'};render();0");await ate("document.querySelector('.prl-n1')");
    assert.deepEqual(await ev("[...document.querySelectorAll('.prl-n1 > summary .prl-pend')].map(s=>s.textContent)"),['2 faltam conferir','2 faltam conferir','1 falta conferir']);
    assert.match(await ev("document.getElementById('prl_cont').textContent"),/^5 laudos de 6$/);
    await ev("(()=>{const q=document.getElementById('prl_q');q.value='tórax';q.dispatchEvent(new Event('input',{bubbles:true}))})()");
    await ate("document.querySelectorAll('.prl-n1').length===1&&document.querySelector('.prl-n1 > summary > span').textContent==='Tomografia'");
    assert.match(await ev("document.getElementById('prl_pend').textContent"),/1 falta conferir/);
    // Ctrl+P abre o acesso também neste modo
    await ev("SM.d.prelConf={};prelLimpa();PRL.estado={};bgAbre();0");await ate("document.querySelector('.bg-in')");
    await digita('anterogrado');await ev("document.querySelector('.bg-it').click()");
    await ate("document.querySelector('.prl-n1[data-k=\"c1|*|Ultrassom\"] .prl-n3[data-ac=\"9000101\"] mark')");
    await ev("prelModoSet('dia');prelLimpa();PRL.estado={};0");await ate("document.querySelector('.prl-n0')");
    assert.equal(await ev("localStorage.getItem('bcbr_prl_modo')"),'dia');
  });
  const bancos=()=>ev("indexedDB.databases().then(l=>l.map(d=>d.name))");
  await t.test('laudos no aparelho (opt-in): desligado não grava nada; ligado persiste e o Ctrl+P acha sem novo download após recarregar; desligar apaga o banco',async()=>{
    assert.equal(await ev("localStorage.getItem('bcbr_prl_local')"),null,'desligado por padrão');
    assert.ok(!(await bancos()).includes('radio-laudos'),'flag desligada: nada no IndexedDB');
    await ev("cfgTab='geral';go('config');0");await ate("document.querySelector('.prl-loc input')");
    assert.match(await ev("document.querySelector('.prl-loc').textContent"),/Guardar os laudos neste aparelho \(use só em computador pessoal\)/);
    assert.equal(await ev("document.querySelector('.prl-loc input').checked"),false);
    await ev("document.querySelector('.prl-loc input').click()");
    await ate("localStorage.getItem('bcbr_prl_local')==='1'");
    await ate("PRL.itens&&!PRL.lote.rodando&&PRL.nIdx===3");
    await ate("indexedDB.databases().then(l=>l.some(d=>d.name==='radio-laudos'))");
    await espera(300);
    assert.equal(await ev("new Promise(r=>{const q=indexedDB.open('radio-laudos');q.onsuccess=()=>{const g=q.result.transaction('pares').objectStore('pares').getAllKeys();g.onsuccess=()=>{q.result.close();r(g.result.sort().join())}}})"),'9000101,9000102,9000103');
    assert.equal(await ev("Object.keys(localStorage).some(k=>/anterógrado|calcificada|ateromatosa|pérvias/.test(k+localStorage.getItem(k)))"),false);
    // recarrega: os pares sobem do banco, o índice já está pronto e só o que não tem arquivo é pedido de novo
    await C.abre();await ev(INST);
    await ate("!PRL.carregando");await ev("PRL.semChave=false;PRL.erro='';PRL.itens=null;window.__req.length=0;0");   // (a página recém-aberta já tentou ler antes de o teste trocar o fetch)
    await ev("bgAbre();0");await ate("document.querySelector('.bg-in')");
    await ate("PRL.itens&&!PRL.lote.rodando&&PRL.nIdx===3");
    await digita('anterogrado');
    assert.deepEqual(await ev("[...document.querySelectorAll('.bg-it b')].map(b=>b.textContent.split(' · ')[0])"),['9000101']);
    assert.deepEqual((await ev("window.__req")).filter(r=>/pares\/(9000101|9000102|9000103)\.json/.test(r)),[],'sem novo download dos pares guardados');
    // desligar apaga o banco
    await ev("ntModalFecha(document.querySelector('.nt-modal'));cfgTab='geral';go('config');0");await ate("document.querySelector('.prl-loc input')");
    assert.equal(await ev("document.querySelector('.prl-loc input').checked"),true);
    await ev("document.querySelector('.prl-loc input').click()");
    await ate("indexedDB.databases().then(l=>!l.some(d=>d.name==='radio-laudos'))");
    assert.equal(await ev("localStorage.getItem('bcbr_prl_local')"),null);
    // ligado de novo e chave removida: também apaga
    await ev("document.querySelector('.prl-loc input').click()");await ate("indexedDB.databases().then(l=>l.some(d=>d.name==='radio-laudos'))");
    await ev("prelCfgRemove();0");
    await ate("indexedDB.databases().then(l=>!l.some(d=>d.name==='radio-laudos'))");
    assert.equal(await ev("localStorage.getItem('bcbr_prl_local')"),null);
    await ev("localStorage.setItem('bcbr_gh_token_dados','ghp_chave_de_teste');PRL.semChave=false;PRL.erro='';PRL.itens=null;go('preliminares');0");await ate("document.querySelector('.prl-n0')");
  });
  await t.test('capturas e acessibilidade: claro/escuro, 375 px e PC; sem rolagem horizontal; alvos de toque',async()=>{
    await ev("PRL.estado={'d|2026-11-12':true,'c1|2026-11-12|Ultrassom':true,'c2|2026-11-12|Ultrassom|Doppler de carótidas e vertebrais':true,'a|9000101':true,'c|9000101|c':true,'c|9000101|d':true};PRL.pares={};render();0");
    await ate("document.querySelector('.prl-sub[open] del')");
    for(const [esc,larg,nome] of [['light',1000,'claro-pc'],['dark',1000,'escuro-pc'],['light',375,'claro-375'],['dark',375,'escuro-375']]){
      await tema(esc,larg);
      assert.equal(await ev("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"),true,nome);
      await foto(nome+'-tudo.png');
    }
    await tema('light',375);await ev("NT.latMov=true;render();0");await espera(300);
    assert.equal(await ev("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"),true,'lateral 375');
    await foto('claro-375-lateral.png');await ev("NT.latMov=false;render();0");
    await tema('light',1000);
    assert.ok(await ev("[...document.querySelectorAll('.prl summary')].every(s=>s.getBoundingClientRect().height>=36)"));
    assert.deepEqual(C.erros,[]);
  });
});
