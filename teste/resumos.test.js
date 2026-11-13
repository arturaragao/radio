const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ler=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// rsSemeia (fonte/artefato-app.js): cartões dos resumos só em memória, o do aparelho vence
function semeia(cards,idx){
  const src=ler('fonte/artefato-app.js'),m=src.match(/function rsSemeia\(\)\{[\s\S]*?\n(?=rsSemeia\(\);)/);assert.ok(m);
  const c=vm.createContext({cards,window:{RESUMOS_IDX:idx}});vm.runInContext(m[0]+'\nrsSemeia();this.out=cards;',c);return c.out}
const R=[{pagina:'p1',titulo:'Útero',chave:'go|Ginecologia|Útero',cards:[{id:'a',f:'F',v:'V'},{id:'b',f:'F2',v:'V2'}]}];
test('resumos: cartões semeados na memória com tag e sem dirty',()=>{
  const o=semeia([],R);assert.equal(o.length,2);
  assert.deepEqual(JSON.parse(JSON.stringify(o[0])),{id:'a',f:'F',v:'V',tg:'Resumo: Útero;',u:0,_rs:1});
});
test('resumos: cartão já existente (editado/excluído) vence o do arquivo; sem arquivo = sem erro',()=>{
  const o=semeia([{id:'a',f:'EDITADO',v:'V',tg:'x',u:5,x:1}],R);
  assert.equal(o.find(c=>c.id==='a').f,'EDITADO');assert.equal(o.find(c=>c.id==='a')._rs,undefined);assert.equal(o.length,2);
  assert.equal(semeia([{id:'z',f:'1',v:'2'}],null).length,1);
});
test('resumos: semeado antigo atualiza com o arquivo e some se saiu do arquivo',()=>{
  const o=semeia([{id:'a',f:'velho',v:'V',tg:'t',u:0,_rs:1},{id:'q',f:'1',v:'2',tg:'',u:0,_rs:1}],R);
  assert.equal(o.find(c=>c.id==='a').f,'F');assert.ok(!o.some(c=>c.id==='q'));
});
test('foco: ligação por tema/subtema e sem coluna Meta',()=>{
  const c=vm.createContext({console,esc,window:{RESUMOS_IDX:R}});
  vm.runInContext(ler('build/foco.js')+'\n;this.F={foResTema,foResSub,foResBtn};',c);
  assert.equal(c.F.foResTema('go|Ginecologia').length,1);assert.equal(c.F.foResTema('go|Gin').length,0);
  assert.equal(c.F.foResSub('go|Ginecologia|Útero').length,1);
  assert.match(c.F.foResBtn(R[0]),/📖 Útero/);
  assert.ok(!/<th>Meta<\/th>/.test(ler('build/foco.js')));
});
