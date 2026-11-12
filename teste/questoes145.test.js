const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fonte=fs.readFileSync(require('node:path').join(__dirname,'../build/questoes.js'),'utf8');
test('1.45: ler e gravar preferência de Atalhos tolera localStorage bloqueado',()=>{
  const painel={hidden:true},bt={setAttribute(k,v){this[k]=v}},c=vm.createContext({localStorage:{getItem(){throw Error('bloqueado')},setItem(){throw Error('bloqueado')}},document:{getElementById:()=>painel},sess:{},esc:String,keyLab:String});
  vm.runInContext(fonte.slice(fonte.indexOf('const Q_ATALHOS='),fonte.indexOf('function vQuizQ()')),c);
  assert.equal(vm.runInContext('qAtalhosVisiveis',c),false);
  c.bt=bt;vm.runInContext('qAtalhosAlterna(bt)',c);assert.equal(painel.hidden,false);assert.equal(bt['aria-expanded'],'true');
  vm.runInContext('qAtalhosAlterna(bt)',c);assert.equal(painel.hidden,true);assert.equal(bt['aria-expanded'],'false');
  assert.match(vm.runInContext('qAtalhos()',c),/id="q_atalhos"[^>]* hidden/);
});
