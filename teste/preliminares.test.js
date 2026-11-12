// Página Preliminares (1.50.0): lógica pura com dados SINTÉTICOS (nunca laudos reais).
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function ctx(){
  const c=vm.createContext({console,localStorage:{getItem:()=>null},navigator:{onLine:true},document:{}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','build','preliminares.js'),'utf8')+'\n;this.P={prelFiltra,prelAgrupa,prelTokens,prelSeguro,prelDiffPalavras,prelCorrigidoHtml,prelData,prelTextoHtml,PRL,prelListaHtml,prelCorpoHtml};',c);
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
test('lista: níveis, contagens, ✓ nos lidos e acesso como título; par só entra no DOM quando carregado',()=>{
  const c=ctx(),P=c.PRL;P.itens=IT;P.lidos={1001:'2026-11-12T10:00:00'};
  const h=c.prelListaHtml();
  assert.match(h,/<summary><span>Tomografia<\/span><span class="prl-n">2<\/span>/);
  assert.ok(!/1001/.test(h));                        // categorias fechadas: filhos não são gerados
  P.estado['c1|Ultrassom']=true;P.estado['c2|Ultrassom|Doppler arterial de MMII']=true;
  const h2=c.prelListaHtml();
  assert.match(h2,/<span class="prl-ac">1001<\/span><span class="prl-meta">10\/11\/2026 · Chefe A\.<\/span><span class="prl-ok"/);
  assert.match(h2,/1002<\/span><span class="prl-meta">12\/11\/2026 · Chefe B\.<\/span><span class="prl-sem">sem correção/);
  assert.equal((h2.match(/prl-ok/g)||[]).length,1);
  assert.ok(!/Laudo preliminar/.test(h2));           // corpo só depois de abrir o acesso
  P.estado['a|1001']=true;P.pares['1001']={par:{mudou:true,preliminar:{html:'<p>Rim com cisto</p>'},definitivo:{html:'<p>Rim com cisto simples</p>'}}};
  const h3=c.prelListaHtml();
  assert.match(h3,/Laudo preliminar[\s\S]*Laudo definitivo[\s\S]*Corrigido/);assert.match(h3,/<ins>simples<\/ins>/);
});
test('datas e texto simples',()=>{const {prelData,prelTextoHtml}=ctx();assert.equal(prelData('2026-11-05'),'05/11/2026');assert.equal(prelTextoHtml('a\n\nb<'),'<p>a</p><p>b&lt;</p>')});
