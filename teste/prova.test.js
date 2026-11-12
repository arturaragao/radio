const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync(require.resolve('../app.js'),'utf8');
const trecho=(a,b)=>{const i=app.indexOf(a),j=app.indexOf(b,i);assert.ok(i>=0&&j>i,a);return app.slice(i,j)};

for(const prova of ['2026-11-01','12/12/2025','',null]){
  test(`data fixa ao carregar armazenamento com ${JSON.stringify(prova)}`,()=>{
    const salvo={prova,diario:7,tema:'escuro',ri:{d:'2026-10-31',ids:['q1']}};
    const c=vm.createContext({localStorage:{getItem:k=>k==='cbr_cfg'?JSON.stringify(salvo):null},DAY:86400000});
    vm.runInContext(trecho('const load=','const saveL='),c);
    vm.runInContext(trecho('const DATA_PROVA=','let Q='),c);
    vm.runInContext("let cfg=normCfg(load('cbr_cfg',{}));",c);
    vm.runInContext(trecho('function diasProva(){','// questões fáceis/médias'),c);
    assert.equal(vm.runInContext('cfg.prova',c),'2026-12-12');
    assert.equal(vm.runInContext('cfg.diario',c),7); // outros blocos mantêm sua configuração
    assert.equal(vm.runInContext('cfg.ri.ids[0]',c),'q1');
    assert.equal(vm.runInContext('JSON.parse(JSON.stringify(cfg)).prova',c),'2026-12-12');
    const esperado=Math.ceil((new Date('2026-12-12T12:00')-Date.now())/86400000);
    assert.equal(c.diasProva(),esperado);
    vm.runInContext("cfg.prova='2000-01-01'",c);
    assert.equal(c.diasProva(),esperado);
  });
}

test('configurações mostram data e RI somente leitura e todos os artefatos estão em 1.48.0',()=>{
  assert.match(app,/<input id="c_p" type="text" value="12\/12\/2026" readonly>/);
  assert.match(app,/<input id="c_d" type="number" value="\$\{RI_DIARIA\}" readonly/);
  assert.doesNotMatch(app,/cfg\.prova\s*\+|new Date\(cfg\.prova/);
  assert.equal(fs.readFileSync(require.resolve('../versao.txt'),'utf8'),'1.48.0');
  assert.match(fs.readFileSync(require.resolve('../sw.js'),'utf8'),/const VERSAO = "bcbr-1\.48\.0";/);
  assert.match(fs.readFileSync(require.resolve('../index.html'),'utf8'),/BCBR_VERSAO="1\.48\.0"/);
});

test('meta padrão 50 preserva meta personalizada já salva',()=>{
  const c=vm.createContext({});vm.runInContext(trecho('const DATA_PROVA=','let Q='),c);
  assert.equal(vm.runInContext('defCfg().diario',c),50);
  assert.equal(vm.runInContext('normCfg({}).diario',c),50);
  assert.equal(vm.runInContext('normCfg({diario:37}).diario',c),37);
});

test('migra ordem salva de abas antigas para Calendário → Tarefas → Notas e mantém a ordem personalizada',()=>{
  const f=app.slice(app.indexOf('function tabsOrdenadas(){'),app.indexOf('\n(function(){',app.indexOf('function tabsOrdenadas(){')));
  const tabs=[['hoje','Hoje'],['semana','Calendário'],['tarefas','Tarefas'],['notas','Notas'],['questoes','Questões'],['banco','Banco']];
  for(const salva of [[],['hoje','banco'],['banco','semana','questoes','hoje'],['banco','notas','tarefas','semana','hoje','questoes']]){
    const c=vm.createContext({TABS:tabs,cfg:{tabs:salva}});vm.runInContext(f,c);
    const ordem=Array.from(c.tabsOrdenadas(),t=>t[0]);
    if(salva.includes('notas'))assert.deepEqual(ordem,salva);
    else {assert.equal(ordem.indexOf('tarefas'),ordem.indexOf('semana')+1);assert.equal(ordem.indexOf('notas'),ordem.indexOf('tarefas')+1)}
    assert.deepEqual(ordem.filter(k=>salva.includes(k)),salva);
  }
});
