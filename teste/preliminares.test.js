// Página Preliminares (1.50.0): lógica pura com dados SINTÉTICOS (nunca laudos reais).
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function ctx(extra={}){
  const c=vm.createContext({console,localStorage:{getItem:()=>null},navigator:{onLine:true},document:{},...extra});
  vm.runInContext('var SM={d:{prelConf:{}}};'+fs.readFileSync(path.join(__dirname,'..','build','preliminares.js'),'utf8')+'\n;this.P={SM,prelAgrupaDias,prelRotuloDia,prelPeriodo,prelSemRodape,prelTextoPuro,prelCopiaLimpa,prelConferido,prelPendente,prelFalta,prelFaltaTxt,prelFaltaTopo,prelFiltra,prelAgrupa,prelTokens,prelSeguro,prelDiffPalavras,prelCorrigidoHtml,prelData,prelTextoHtml,PRL,prelListaHtml,prelCorpoHtml,prelItem,prelIndexa,prelBuscaLaudos,prelLimpaMemoria,prelIrLaudo,prelLaudosInicia,prelPar,prelErroGeral};',c);
  return c.P;
}
const J=x=>JSON.parse(JSON.stringify(x));   // resultados vêm de outro contexto vm
const IT=[
  {acesso:'1001',data:'2026-11-10',modalidade:'US',categoria:'Ultrassom',exame:'Doppler arterial de MMII',chefe:'Chefe A.',mudou:true},
  {acesso:'1002',data:'2026-11-12',modalidade:'US',categoria:'Ultrassom',exame:'Doppler arterial de MMII',chefe:'Chefe B.',mudou:false},
  {acesso:'1003',data:'2026-11-11',modalidade:'CT',categoria:'Tomografia',exame:'TC de abdome total',chefe:'Chefe A.',mudou:true},
  {acesso:'1004',data:'2026-11-09',modalidade:'CT',categoria:'Tomografia',exame:'Angio-TC de tórax',chefe:'',mudou:true},
  {acesso:'1005',data:'2026-10-01',modalidade:'XX',categoria:'Zeta',exame:'Outro',chefe:'Chefe C.',mudou:true}];
test('agrupa: categorias na ordem do contrato, exames em ordem alfabética, itens do mais novo ao mais antigo, contagens',()=>{
  const {prelAgrupa}=ctx(),g=J(prelAgrupa(IT));
  assert.deepEqual(g.map(c=>c.categoria),['Tomografia','Ultrassom','Zeta']);
  assert.deepEqual(g[0].exames.map(e=>e.exame),['Angio-TC de tórax','TC de abdome total']);
  const us=g[1];assert.equal(us.total,2);assert.deepEqual(us.exames[0].itens.map(i=>i.acesso),['1002','1001']);
});
test('filtra: texto sem acento/caixa, período, só com correção e só não lidos',()=>{
  const {prelFiltra}=ctx();
  assert.deepEqual(J(prelFiltra(IT,{texto:'torax'})).map(i=>i.acesso),['1004']);
  assert.deepEqual(J(prelFiltra(IT,{texto:'a. doppler'})).map(i=>i.acesso),['1001']);
  assert.deepEqual(J(prelFiltra(IT,{texto:'1003'})).map(i=>i.acesso),['1003']);
  assert.deepEqual(J(prelFiltra(IT,{de:'2026-11-10',ate:'2026-11-11'})).map(i=>i.acesso),['1001','1003']);
  assert.deepEqual(J(prelFiltra(IT,{so:'mudou'})).map(i=>i.acesso),['1001','1003','1004','1005']);
  assert.deepEqual(J(prelFiltra(IT,{so:'naolidos',lidos:{1001:'x',1003:'x'}})).map(i=>i.acesso),['1002','1004','1005']);
  assert.equal(prelFiltra(IT,{}).length,5);
});
test('sanitiza: só tags de formatação, sem atributos, sem script/estilo/eventos, entidades seguras',()=>{
  const {prelSeguro}=ctx();
  const h=prelSeguro('<p onclick="x()" style="color:red"><b>Fígado</b> <u>normal</u><script>alert(1)</script><img src=x onerror=alert(1)> &lt;b&gt; <a href="javascript:1">link</a></p><style>p{}</style><!-- c -->');
  assert.equal(h,'<p><b>Fígado</b> <u>normal</u> &lt;b&gt; link</p>');
  assert.equal(prelSeguro('<ul><li>um</li><li><i>dois</i></li></ul>'),'<ul><li>um</li><li><i>dois</i></li></ul>');
  assert.equal(prelSeguro('a&nbsp;b &#60;script&#62;'),'a b &lt;script&gt;');
});
test('diff por palavras: igual, troca, inserção, remoção e arestas',()=>{
  const {prelDiffPalavras:d}=ctx();
  assert.deepEqual(J(d(['a','b','c'],['a','b','c'])),[['=','a'],['=','b'],['=','c']]);
  assert.deepEqual(J(d(['a','b','c'],['a','x','c'])),[['=','a'],['-','b'],['+','x'],['=','c']]);
  assert.deepEqual(J(d([],['a'])),[['+','a']]);assert.deepEqual(J(d(['a'],[])),[['-','a']]);assert.deepEqual(J(d([],[])),[]);
  assert.equal(d(Array(4000).fill('a'),Array(4000).fill('b')),null);   // grande demais: não trava o aparelho
});
test('corrigido: definitivo com formatação, tirado em <del>, posto em <ins>; blocos e listas preservados',()=>{
  const {prelCorrigidoHtml:c}=ctx();
  const pre='<p>Fígado com <b>esteatose leve</b> e cisto.</p><p>Sem outras alterações.</p>';
  const def='<p>Fígado com <b>esteatose moderada</b>.</p><p>Sem outras alterações.</p><ul><li>Seguimento</li></ul>';
  assert.equal(c(pre,def),'<p>Fígado com <b>esteatose <del>leve e cisto.</del> <ins>moderada</ins></b><ins>.</ins></p><p>Sem outras alterações.</p><ul><li><ins>Seguimento</ins></li></ul>');
});
test('corrigido: texto igual não ganha marcas; remoção no fim; escapa HTML das palavras',()=>{
  const {prelCorrigidoHtml:c}=ctx();
  assert.equal(c('<p>Tudo igual</p>','<p>Tudo igual</p>'),'<p>Tudo igual</p>');
  assert.equal(c('<p>Rim normal. Cisto</p>','<p>Rim normal.</p>'),'<p>Rim normal. <del>Cisto</del></p>');
  const x=c('<p>a &lt;b&gt; c</p>','<p>a c</p>');assert.match(x,/<del>&lt;b&gt;<\/del>/);assert.ok(!/<b>/.test(x));
});
test('lista: dia > categoria > exame > acesso, contagens, pendentes, ✓ nos lidos e acesso como título; par só entra no DOM quando carregado',()=>{
  const c=ctx(),P=c.PRL;P.itens=IT;P.lidos={1001:'2026-11-10T10:00:00'};
  const h=c.prelListaHtml();
  assert.match(h,/<summary><span>[^<]*11\/2026<\/span><span class="prl-pend">1 falta conferir<\/span><span class="prl-n">1<\/span>/);   // dias fechados: só o cabeçalho
  assert.ok(!/1001/.test(h)&&!/Tomografia/.test(h));
  P.estado['d|2026-11-10']=true;P.estado['c1|2026-11-10|Ultrassom']=true;P.estado['c2|2026-11-10|Ultrassom|Doppler arterial de MMII']=true;
  const h2=c.prelListaHtml();
  assert.match(h2,/<span class="prl-ac"[^>]*>1001<\/span><span class="prl-meta">10\/11\/2026 · Chefe A\.<\/span><span class="prl-ok"/);
  assert.match(h2,/<input type="checkbox"[^>]*data-ac="1001"/);assert.ok(!/checked/.test(h2));
  assert.equal((h2.match(/prl-ok/g)||[]).length,1);
  assert.ok(!/Laudo preliminar/.test(h2));           // corpo só depois de abrir o acesso
  c.SM.d.prelConf={1001:'2026-11-12T08:00:00'};
  assert.match(c.prelListaHtml(),/<input type="checkbox" checked data-ac="1001"/);
  P.estado['a|1001']=true;P.pares['1001']={par:{mudou:true,preliminar:{html:'<p>Rim com cisto</p>'},definitivo:{html:'<p>Rim com cisto simples</p>'}}};
  const h3=c.prelListaHtml();
  assert.match(h3,/Laudo preliminar[\s\S]*Laudo definitivo[\s\S]*Corrigido/);assert.match(h3,/<ins>simples<\/ins>/);assert.match(h3,/class="prl-laudo prl-cor"/);
});
test('agrupa por dia: mais recente primeiro, sem data por último, contagens; rótulos Hoje/Ontem/dia da semana',()=>{
  const {prelAgrupaDias:g,prelRotuloDia:r}=ctx();
  const d=J(g([...IT,{acesso:'1006',categoria:'X',exame:'Y'}]));
  assert.deepEqual(d.map(x=>x.dia),['2026-11-12','2026-11-11','2026-11-10','2026-11-09','2026-10-01','']);
  assert.deepEqual(d.map(x=>x.total),[1,1,1,1,1,1]);
  assert.equal(r('2026-11-13','2026-11-13'),'Hoje');assert.equal(r('2026-11-12','2026-11-13'),'Ontem');
  assert.equal(r('2026-11-12','2026-11-14'),'qui. 12/11/2026');assert.equal(r('2026-11-30','2026-12-01'),'Ontem');   // virada de mês
  assert.equal(r('','2026-11-13'),'Sem data');
});
test('períodos rápidos com data fixa: Hoje, 3, 7 e 30 dias contam o dia de hoje; filtro De/Até por eles',()=>{
  const {prelPeriodo:p,prelFiltra}=ctx();
  assert.deepEqual(J(p(1,'2026-11-13')),{de:'2026-11-13',ate:'2026-11-13'});
  assert.deepEqual(J(p(3,'2026-11-13')),{de:'2026-11-11',ate:'2026-11-13'});
  assert.deepEqual(J(p(7,'2026-11-13')),{de:'2026-11-07',ate:'2026-11-13'});
  assert.deepEqual(J(p(30,'2026-11-13')),{de:'2026-10-15',ate:'2026-11-13'});
  assert.deepEqual(J(p(7,'2026-03-02')),{de:'2026-02-24',ate:'2026-03-02'});
  assert.deepEqual(J(prelFiltra(IT,p(3,'2026-11-12'))).map(i=>i.acesso),['1001','1002','1003']);   // 10, 11 e 12/11
  assert.deepEqual(J(prelFiltra(IT,p(1,'2026-11-12'))).map(i=>i.acesso),['1002']);
});
test('conferidos: qualquer acesso do grupo vale, aguardando não é pendente, contador e filtro "só não conferidos"',()=>{
  const {prelFiltra,prelPendente,prelConferido,prelFalta,prelFaltaTxt,prelFaltaTopo,PRL,SM}=ctx();
  const G={acesso:'2002',acessos:['2001','2002'],data:'2026-11-12',categoria:'Ultrassom',exame:'A',mudou:true};
  const A={acesso:'3001',data:'2026-11-12',categoria:'Ultrassom',exame:'A',status:'aguardando'};
  const its=[...IT,G,A];
  assert.equal(prelFalta(its,{}),6);                                  // 5 de IT + G; A aguardando não conta
  assert.equal(prelFalta(its,{1001:'2026-11-12T08:00:00',2001:'2026-11-12T09:00:00'}),4);   // 2001 confere o grupo inteiro
  assert.equal(prelConferido(G,{2001:'x'}),true);assert.equal(prelConferido(G,{2002:'x'}),true);assert.equal(prelConferido(G,{9:'x'}),false);
  assert.equal(prelPendente(A,{}),false);
  assert.deepEqual(J(prelFiltra(its,{so:'naoconf',conf:{1001:'x',2001:'x',1002:'x'}})).map(i=>i.acesso),['1003','1004','1005']);
  assert.equal(prelFaltaTxt(1),'1 falta conferir');assert.equal(prelFaltaTxt(12),'12 faltam conferir');
  PRL.itens=its;SM.d.prelConf={};assert.equal(prelFaltaTopo(),' · 6 faltam conferir');
  SM.d.prelConf=Object.fromEntries(['1001','1002','1003','1004','1005','2002'].map(a=>[a,'x']));assert.equal(prelFaltaTopo(),' · tudo conferido');
});
test('rodapé do PACS sai do definitivo (tolerante a tags, espaços e maiúsculas) e o corrigido não o mostra como correção',()=>{
  const {prelSemRodape:r,prelCorrigidoHtml:cor,prelSeguro}=ctx();
  const ROD='Este laudo foi assinado eletronicamente.12/11/2026 09:33:25 / Informamos que o exame, composto por laudo e imagens, deve ser apresentado ao médico solicitante... Hospital Santa Isabel não realiza contato com pacientes para agendamento de consultas baseado no laudo do exame realizado.';
  const pre='<p>Rim normal.</p>',def='<p>Rim normal.</p><p>'+ROD+'</p>';
  assert.equal(r(def),'<p>Rim normal.</p>');
  assert.equal(cor(pre,r(def)),'<p>Rim normal.</p>');                 // antes aparecia tudo isso como <ins>
  assert.match(cor(pre,def),/<ins>/);                                  // (sem o corte, o bug reaparece)
  assert.equal(r('<div><p>Rim.</p><div><b>ESTE  LAUDO</b> foi <i>assinado</i>\n eletronicamente.12/11/2026 09:33:25<br>Informamos que…</div></div>'),'<div><p>Rim.</p>');
  assert.equal(r('<p>Rim.</p><p>Este laudo foi assinado eletronicamente</p>'),'<p>Rim.</p>');
  assert.equal(r('<p>Sem rodapé, este laudo foi bom.</p>'),'<p>Sem rodapé, este laudo foi bom.</p>');
  assert.equal(prelSeguro(r(def)),'<p>Rim normal.</p>');
});
test('texto puro do preliminar (quebra por bloco) e cópia limpa do Corrigido (sem <del>, sem <ins>)',()=>{
  const {prelTextoPuro:t,prelCopiaLimpa:l,prelCorrigidoHtml:cor}=ctx();
  assert.equal(t('<p>Fígado normal.</p><p>Sem <b>cistos</b>&nbsp;visíveis.</p><ul><li>um</li><li>dois</li></ul>a<br>b'),'Fígado normal.\nSem cistos visíveis.\num\ndois\na\nb');
  assert.equal(t('<p>a</p><p></p><p></p><p>b</p>'),'a\n\nb');
  const c=cor('<p>Placa <b>calcificada</b> com estenose de 30%.</p>','<p>Placa <b>mista</b> com estenose de <i>40%</i>.</p>');
  assert.match(c,/<del>/);
  const r=J(l(c));
  assert.ok(!/<del>|<ins>/.test(r.html));assert.match(r.html,/<b>mista<\/b>/);assert.equal(r.texto,'Placa mista com estenose de 40%.');
  assert.equal(l('<p>a <del>b</del> c</p>').html,'<p>a c</p>');
});
test('datas e texto simples',()=>{const {prelData,prelTextoHtml}=ctx();assert.equal(prelData('2026-11-05'),'05/11/2026');assert.equal(prelTextoHtml('a\n\nb<'),'<p>a</p><p>b&lt;</p>')});
test('mesmo laudo em vários acessos: um item só, acessos juntos, lido por qualquer acesso, busca por qualquer acesso/descrição',()=>{
  const {prelFiltra,prelAgrupa,prelItem,PRL}=ctx();
  const G={acesso:'2002',acessos:['2001','2002'],descricoes:['US BIOPSIA ASPIRATIVA RENAL','US APARELHO URINARIO'],data:'2026-11-12',modalidade:'US',categoria:'Ultrassom',exame:'USG de vias urinárias',chefe:'Chefe A.',mudou:false};
  const N=[{acesso:'3001',data:'2026-11-12',modalidade:'US',categoria:'Ultrassom',exame:'USG de vias urinárias',chefe:'Chefe A.',mudou:false},
    {acesso:'3002',data:'2026-11-12',modalidade:'US',categoria:'Ultrassom',exame:'USG de abdome total',chefe:'Chefe A.',mudou:false}];
  const its=[G,...N];
  assert.equal(J(prelAgrupa(its))[0].total,3);   // 3 itens (4 acessos), grupo conta uma vez
  assert.deepEqual(J(prelFiltra(its,{texto:'2001'})).map(i=>i.acesso),['2002']);
  assert.deepEqual(J(prelFiltra(its,{texto:'biopsia renal'})).map(i=>i.acesso),['2002']);
  assert.deepEqual(J(prelFiltra(its,{so:'naolidos',lidos:{2001:'x'}})).map(i=>i.acesso),['3001','3002']);
  PRL.lidos={2001:'x'};
  const h=prelItem(G);assert.match(h,/>2001 \+ 2002</);assert.match(h,/prl-ok/);   // principal 2002 baixa o par; lido pelo 2001
  assert.doesNotMatch(prelItem(N[0]),/ \+ |prl-ok/);
});

test('modo "Por exame": Categoria > Exame > Acesso sem nível de dia, data em cada acesso, mais recente primeiro, pendentes e filtros valem',()=>{
  const c=ctx(),P=c.PRL;P.itens=IT;P.modo='exame';
  const h=c.prelListaHtml();
  assert.ok(!/prl-n0/.test(h));assert.match(h,/data-k="c1\|\*\|Tomografia"/);assert.match(h,/data-k="c1\|\*\|Ultrassom"/);
  assert.match(h,/<span>Ultrassom<\/span><span class="prl-pend">2 faltam conferir<\/span><span class="prl-n">2<\/span>/);
  assert.ok(!/1001/.test(h));                                    // fechado: só os cabeçalhos
  P.estado['c1|*|Ultrassom']=true;P.estado['c2|*|Ultrassom|Doppler arterial de MMII']=true;
  const h2=c.prelListaHtml();
  assert.ok(h2.indexOf('>1002<')<h2.indexOf('>1001<'),'12/11 antes de 10/11');
  assert.match(h2,/<span class="prl-meta">12\/11\/2026 · Chefe B\.<\/span>/);assert.match(h2,/<span class="prl-meta">10\/11\/2026 · Chefe A\.<\/span>/);
  c.SM.d.prelConf={1002:'x'};P.filtro={texto:'',de:'',ate:'',so:'naoconf'};
  const h3=c.prelListaHtml();assert.ok(!/>1002</.test(h3));assert.match(h3,/<span>Ultrassom<\/span><span class="prl-pend">1 falta conferir<\/span><span class="prl-n">1<\/span>/);
  P.filtro={texto:'',de:'2026-11-11',ate:'',so:''};   // período
  assert.ok(!/Angio-TC/.test(c.prelListaHtml())&&/TC de abdome/.test(c.prelListaHtml()||'x'+'TC de abdome'));
  P.modo='dia';assert.match(c.prelListaHtml(),/prl-n0/);
});
test('busca nos laudos (memória): sem acento/caixa, sem rodapé do PACS, preliminar x definitivo, todas as palavras, mais recente primeiro, limite, refino incremental',()=>{
  const c=ctx(),P=c.PRL,ROD='<p>Este laudo foi assinado eletronicamente.12/11/2026 / Informamos que o exame, composto por laudo e imagens, deve ser apresentado ao médico solicitante.</p>';
  P.itens=IT.map(i=>({...i}));
  c.prelIndexa('1001',{preliminar:{html:'<p>Fígado com <b>esteatose</b> leve e nódulo na tireóide.</p>'},definitivo:{html:'<p>Fígado com esteatose moderada.</p><p>Tireoide sem nódulos.</p>'+ROD}});
  c.prelIndexa('1003',{preliminar:{texto:'Rins normais.\nEsteatose hepática grau 1.'},definitivo:{texto:'Rins normais.\nEsteatose hepática grau 1.'}});
  c.prelIndexa('1002',{preliminar:{html:'<p>Sem achados.</p>'},definitivo:{html:'<p>Sem achados.</p>'+ROD}});
  assert.equal(P.nIdx,3);
  let b=J(c.prelBuscaLaudos('ESTEATOSE'));
  assert.deepEqual(b.lista.map(x=>[x.ac,x.onde]),[['1003','ambos'],['1001','ambos']]);   // 11/11 antes de 10/11
  assert.deepEqual(J(c.prelBuscaLaudos('nodulo tireoide leve')).lista.map(x=>[x.ac,x.onde]),[['1001','preliminar']]);   // só o preliminar tem "leve"
  assert.deepEqual(J(c.prelBuscaLaudos('nodulos tireoide')).lista.map(x=>[x.ac,x.onde]),[['1001','definitivo']]);
  assert.equal(J(c.prelBuscaLaudos('assinado')).total,0);assert.equal(J(c.prelBuscaLaudos('informamos')).total,0);   // rodapé do PACS fora
  assert.equal(J(c.prelBuscaLaudos('')).total,0);
  assert.match(J(c.prelBuscaLaudos('moderada')).lista[0].x.t,/^Fígado com esteatose moderada\. Tireoide sem nódulos\.$/);   // texto puro, mantém a grafia original
  // refino incremental: digitar "esteat" -> "esteatose h" só olha os que já casavam; resultado igual ao da busca completa
  c.prelBuscaLaudos('esteat');const inc=J(c.prelBuscaLaudos('esteatose hepatica'));assert.deepEqual(inc.lista.map(x=>x.ac),['1003']);
  P.bc={q:'',v:-1,it:null,r:[]};assert.deepEqual(J(c.prelBuscaLaudos('esteatose hepatica')).lista.map(x=>x.ac),['1003']);
  // indexar mais um laudo invalida o cache
  c.prelBuscaLaudos('sem');c.prelIndexa('1004',{preliminar:{texto:'sem alteracoes'},definitivo:{texto:'sem alteracoes'}});assert.deepEqual(J(c.prelBuscaLaudos('sem')).lista.map(x=>x.ac).sort(),['1001','1002','1004']);
  // limite de resultados e total
  P.itens=Array.from({length:50},(_,k)=>({acesso:'9'+k,data:'2026-11-'+String(1+k%28).padStart(2,'0'),categoria:'X',exame:'Y'}));P.itens.forEach(i=>c.prelIndexa(i.acesso,{preliminar:{texto:'cisto'},definitivo:{texto:'cisto'}}));
  const l=J(c.prelBuscaLaudos('cisto',20));assert.equal(l.lista.length,20);assert.equal(l.total,50);
  assert.ok(l.lista.every((x,k,a)=>!k||a[k-1].i.data>=x.i.data));
  c.prelLimpaMemoria();assert.equal(P.nIdx,0);assert.equal(J(c.prelBuscaLaudos('cisto')).total,0);   // trocar/remover a chave apaga o índice
});
test('privacidade: o índice dos laudos não toca localStorage/IndexedDB (só o modo da lista é gravado)',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','build','preliminares.js'),'utf8');
  const i0=src.indexOf('function prelIndexa'),i1=src.indexOf('// ---- leitura no GitHub'),trecho=src.slice(i0,i1);
  assert.ok(!/localStorage|indexedDB|caches\.|sessionStorage/.test(trecho));
  assert.deepEqual([...src.matchAll(/localStorage\.setItem\(([^,]+),/g)].map(m=>m[1]).sort(),["'bcbr_prl_modo'","PRL_LS","PRL_LS"].sort());
});

// ---- 1.54.0 (revisão): regressões do Ctrl+P / lote em segundo plano ----
const resp=(status,corpo,etag='W/"1"')=>({status,ok:status>=200&&status<300,headers:{get:()=>etag},text:async()=>corpo});
const ambiente=(fetch,pintadas=[])=>ctx({localStorage:{getItem:()=>'chave'},fetch,document:{getElementById:id=>{pintadas.push(id);return null}},toast:()=>{},ntPrelAbre:()=>{},setTimeout:()=>0});
test('Ctrl+P no definitivo/ambos abre o Corrigido; laudo grande demais (sem Corrigido) abre também o definitivo; preliminar abre só o preliminar',()=>{
  const c=ambiente(async()=>resp(404,'{}')),P=c.PRL;
  const grande=t=>({mudou:true,preliminar:{texto:Array(4000).fill('a').join(' ')},definitivo:{texto:Array(4000).fill(t).join(' ')}});
  P.itens=[{acesso:'1',data:'2026-11-10',categoria:'Ultrassom',exame:'X'}];
  P.pares['1']={par:{mudou:true,preliminar:{texto:'Rim com cisto'},definitivo:{texto:'Rim com cisto simples'}}};
  P.estado['c|1|c']=false;c.prelIrLaudo('1',['cisto'],'definitivo');
  assert.equal(P.estado['c|1|c'],true);assert.equal(P.estado['c|1|d'],undefined);
  P.estado={};c.prelIrLaudo('1',['cisto'],'ambos');assert.equal(P.estado['c|1|c'],true);
  P.estado={};c.prelIrLaudo('1',['cisto'],'preliminar');assert.equal(P.estado['c|1|p'],true);assert.equal(P.estado['c|1|c'],undefined);
  P.pares['1']={par:grande('b')};P.estado={};c.prelIrLaudo('1',['b'],'definitivo');
  assert.equal(P.estado['c|1|c'],true);assert.equal(P.estado['c|1|d'],true);
});
test('lote: par corrompido ou 404 é pulado (não para a fila nem volta à fila); sem rede ou 401/403 para o lote',async()=>{
  const chamadas=[],ok=t=>resp(200,JSON.stringify({preliminar:{texto:t},definitivo:{texto:t}}));
  const c=ambiente(async u=>{const a=u.match(/pares\/(\w+)\.json/)[1];chamadas.push(a);return a==='b'?resp(200,'{quebrado'):a==='n'?resp(200,'null'):a==='x'?resp(404,'{}'):ok('laudo '+a)}),P=c.PRL;
  P.itens=['b','n','x','c','d','e','f','g'].map((a,k)=>({acesso:a,data:'2026-11-'+String(10+k)}));
  await c.prelLaudosInicia();
  assert.equal(P.lote.abort,false);assert.equal(P.nIdx,5);assert.equal(Object.keys(P.idx).sort().join(),'c,d,e,f,g');
  assert.ok(['b','n','x'].every(a=>P.pares[a].erro&&P.pares[a].fatal));
  const n=chamadas.length;await c.prelLaudosInicia();assert.equal(chamadas.length,n,'erro não transitório não volta à fila');
  // rede: TypeError do fetch para o lote; 401 também
  for(const [falha,esperado] of [[()=>{throw new TypeError('Failed to fetch')},true],[()=>resp(401,'{}'),true],[()=>resp(500,'{}'),false]]){
    let k=0;const d=ambiente(async()=>{k++;return falha()});d.PRL.itens=Array.from({length:12},(_,i)=>({acesso:'p'+i,data:'2026-11-01'}));
    await d.prelLaudosInicia();assert.equal(k<12,esperado,String(falha));
  }
  assert.equal(c.prelErroGeral(new SyntaxError('x')),false);assert.equal(c.prelErroGeral(Object.assign(new TypeError('x'),{parse:true})),false);
});
test('prelLimpaMemoria: lote antigo para e não grava depois da limpeza; novo lote já pode começar',async()=>{
  let solta;const trava=new Promise(r=>solta=r),ok=resp(200,JSON.stringify({preliminar:{texto:'antigo'},definitivo:{texto:'antigo'}}));
  const c=ambiente(async()=>{await trava;return ok}),P=c.PRL;
  P.itens=Array.from({length:6},(_,i)=>({acesso:'q'+i,data:'2026-11-01'}));
  const velho=c.prelLaudosInicia();assert.equal(P.lote.rodando,true);
  c.prelLimpaMemoria();
  c.PRL.itens=P.itens;                                              // (a lista fica; só pares/índice somem)
  const novo=c.prelLaudosInicia();assert.equal(P.lote.rodando,true,'novo lote começa na hora');
  solta();await velho;await novo;
  // só o lote novo grava (6 pares); o antigo (4 em voo) descartou o que baixou
  assert.equal(P.nIdx,6);assert.equal(Object.keys(P.idx).length,6);
  const d=ambiente(async()=>{await trava;return ok}),Q=d.PRL;Q.itens=P.itens;
  const v2=d.prelLaudosInicia();d.prelLimpaMemoria();await v2;
  assert.equal(Q.nIdx,0);assert.deepEqual(Object.keys(Q.idx),[]);assert.deepEqual(Object.keys(Q.pares),[]);
});
test('reconferência por ETag (304) não redesenha o corpo; mudança sim',async()=>{
  const pint=[];let corpo='um',st=200;
  const c=ambiente(async()=>st===304?resp(304,''):resp(200,JSON.stringify({preliminar:{texto:corpo},definitivo:{texto:corpo}}),'W/"'+corpo+'"'),pint);
  await c.prelPar('z');const n=pint.length;
  st=304;await c.prelPar('z',true);assert.equal(pint.length,n);
  st=200;corpo='dois';await c.prelPar('z',true);assert.ok(pint.length>n);assert.match(c.PRL.idx.z.def.t,/dois/);
});
