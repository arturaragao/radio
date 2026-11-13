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
  definitivo:{html:'<p><b>Doppler de carótidas</b></p><p>Placa ateromatosa <u>mista</u> no bulbo à direita, com estenose de <i>40%</i>.</p><ul><li>Vertebrais pérvias com fluxo anterógrado</li></ul>'},mudou:true},
  '9000102':{preliminar:{html:'<p>Exame sem alterações.</p>'},definitivo:{html:'<p>Exame sem alterações.</p>'},mudou:false},
  '9000103':{preliminar:{texto:'Artérias pérvias.'},definitivo:{texto:'Artérias pérvias, sem estenoses.'},mudou:true}};
test('Radio 1.50: página Preliminares (Chrome, dados sintéticos)',{timeout:120000},async t=>{
  const C=await iniciar({porta:8794,env:{BCBR_QS:'10'}});t.after(()=>C.fim());
  const {ev,ate,call}=C;await C.abre();
  await ev(`(()=>{window.__req=[];const f=window.fetch;window.fetch=(u,o)=>{u=String(u);
    if(u.includes('laudos-tutu-dados')){const p=u.split('/contents/')[1];window.__req.push(p);window.__auth=(o&&o.headers&&o.headers.Authorization)||'';
      const ok=j=>Promise.resolve(new Response(JSON.stringify(j),{status:200,headers:{etag:'W/"1"'}}));
      if(window.__semAcesso&&window.__auth!=='Bearer ghp_chave_de_teste')return Promise.resolve(new Response('{}',{status:404}));
      if(p==='preliminares/indice.json')return ok({versao:1,itens:${JSON.stringify(ITENS)}});
      if(p==='preliminares/lidos.json')return ok({versao:1,lidos:{'9000101':'2026-11-12T20:00:00'}});
      const m=p.match(/pares\\/(\\d+)\\.json$/),par=m&&${JSON.stringify(PARES)}[m[1]];
      return par?ok(par):Promise.resolve(new Response('{}',{status:404}))}
    return f(u,o)};0})()`);
  const foto=async nome=>{if(CAP){fs.mkdirSync(CAP,{recursive:true});await espera(250);await C.shot(path.join(CAP,nome))}};
  const tema=async(esc,larg)=>{await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:esc}]});await ev(`document.documentElement.dataset.theme='${esc==='dark'?'dark':'light'}'`);
    await call('Emulation.setDeviceMetricsOverride',{width:larg,height:larg<500?800:900,deviceScaleFactor:1,mobile:false});await espera(200)};
  await t.test('sem chave própria usa a do app; índice e lidos carregam, pares não',async()=>{
    await ev("go('preliminares')");await ate("document.querySelector('.prl-n1')");
    assert.ok((await ev("window.__req")).includes('preliminares/indice.json'));
    assert.equal((await ev("window.__req")).filter(r=>r.includes('/pares/')).length,0);
    assert.match(await ev("window.__auth"),/^Bearer /);
    assert.equal(await ev("document.querySelector('.prl h1').textContent"),'Preliminares');
    assert.deepEqual(await ev("[...document.querySelectorAll('.prl-n1 > summary')].map(s=>s.textContent.trim())"),['Tomografia2','Ultrassom3','Ressonância1']);
    assert.ok(await ev("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Preliminares')"));
  });
  await t.test('níveis 1 > 2 > 3 abrem sob demanda; acesso é o título; ✓ só nos lidos; chefe e data ao lado',async()=>{
    await ev("document.querySelector('.prl-n1[data-k=\"c1|Ultrassom\"]>summary').click()");
    await ate("document.querySelector('.prl-n2')");
    assert.equal(await ev("document.querySelectorAll('.prl-n3').length"),0);
    await ev("document.querySelector('.prl-n2[data-k*=\"carótidas\"]>summary').click()");
    await ate("document.querySelectorAll('.prl-n3').length===2");
    assert.equal(await ev("document.querySelector('.prl-n3 .prl-ac').textContent"),'9000101');
    assert.equal(await ev("document.querySelector('.prl-n3 .prl-meta').textContent"),'12/11/2026 · Chefe A.');
    assert.equal(await ev("document.querySelectorAll('.prl-ok').length"),1);
    assert.equal(await ev("document.querySelector('.prl-ok').closest('.prl-n3').querySelector('.prl-ac').textContent"),'9000101');
    assert.equal((await ev("window.__req")).filter(r=>r.includes('/pares/')).length,0);
  });
  await t.test('abrir o acesso baixa só aquele par e mostra os três toggles; corrigido marca tirado/posto e mantém formatação',async()=>{
    await ev("document.querySelector('.prl-n3>summary').click()");
    await ate("document.querySelectorAll('.prl-sub').length===3");
    assert.deepEqual((await ev("window.__req")).filter(r=>r.includes('/pares/')),['preliminares/pares/9000101.json']);
    assert.deepEqual(await ev("[...document.querySelectorAll('.prl-sub>summary')].map(s=>s.textContent)"),['Laudo preliminar','Laudo definitivo','Corrigido']);
    await ev("document.querySelectorAll('.prl-sub>summary').forEach(s=>s.click())");await espera(150);
    const cor=await ev("document.querySelectorAll('.prl-sub')[2].querySelector('.prl-laudo').innerHTML");
    assert.match(cor,/<del>calcificada<\/del>/);assert.match(cor,/<ins>mista<\/ins>/);assert.match(cor,/<b>Doppler de carótidas<\/b>/);assert.match(cor,/<ul><li>/);
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
    await ev("prelLimpa();PRL.estado={'c1|Ultrassom':true,'c2|Ultrassom|Doppler de carótidas e vertebrais':true,'a|9000102':true};render();0");
    await ate("document.querySelector('.prl-sub')");
    await ev("document.querySelectorAll('.prl-sub>summary')[2].click()");
    assert.match(await ev("document.querySelectorAll('.prl-sub')[2].textContent"),/O chefe não mudou o texto/);
    await ev("PRL.estado={'a|9000201':true,'c1|Tomografia':true,'c2|Tomografia|TC de abdome total':true};render();0");
    await ate("document.querySelector('.prl-erro')");
    assert.ok(await ev("!!document.querySelector('.prl-erro button')"));
  });
  await t.test('sem acesso ao repo de dados: pede a chave dos laudos e a usa nas próximas leituras',async()=>{
    await ev("window.__semAcesso=true;PRL.itens=null;PRL.pares={};PRL.estado={};prelCarrega(true);0");
    await ate("document.getElementById('prl_k')");
    assert.match(await ev("document.querySelector('.prl-chave').textContent"),/laudos-tutu-dados/);
    await foto('claro-pc-sem-chave.png');
    await ev("document.getElementById('prl_k').value='ghp_chave_de_teste';prelSalvaChave();0");
    await ate("document.querySelector('.prl-n1')");
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
    await ate("document.querySelector('.prl-n1')");
  });
  await t.test('capturas e acessibilidade: claro/escuro, 375 px e PC; sem rolagem horizontal; alvos de toque',async()=>{
    await ev("PRL.estado={'c1|Ultrassom':true,'c2|Ultrassom|Doppler de carótidas e vertebrais':true,'a|9000101':true,'c|9000101|c':true,'c|9000101|d':true};PRL.pares={};render();0");
    await ate("document.querySelector('.prl-sub[open] del')");
    for(const [esc,larg,nome] of [['light',1000,'claro-pc'],['dark',1000,'escuro-pc'],['light',375,'claro-375'],['dark',375,'escuro-375']]){
      await tema(esc,larg);
      assert.equal(await ev("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"),true,nome);
      await foto(nome+'-tudo.png');
    }
    await tema('light',1000);
    assert.ok(await ev("[...document.querySelectorAll('.prl summary')].every(s=>s.getBoundingClientRect().height>=36)"));
    assert.deepEqual(C.erros,[]);
  });
});
