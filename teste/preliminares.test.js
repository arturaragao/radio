// Página Preliminares (1.50.0): lógica pura com dados SINTÉTICOS (nunca laudos reais).
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function ctx(){
  const c=vm.createContext({console,localStorage:{getItem:()=>null},navigator:{onLine:true},document:{}});
  vm.runInContext('var SM={d:{prelConf:{}}};'+fs.readFileSync(path.join(__dirname,'..','build','preliminares.js'),'utf8')+'\n;this.P={SM,prelAgrupaDias,prelRotuloDia,prelPeriodo,prelSemRodape,prelTextoPuro,prelCopiaLimpa,prelConferido,prelPendente,prelFalta,prelFaltaTxt,prelFaltaTopo,prelFiltra,prelAgrupa,prelTokens,prelSeguro,prelDiffPalavras,prelCorrigidoHtml,prelData,prelTextoHtml,PRL,prelListaHtml,prelCorpoHtml,prelItem};',c);
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
