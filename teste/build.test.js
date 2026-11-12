const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const raiz=path.resolve(__dirname,'..'),normal=s=>s.replace(/\r\n/g,'\n');
const fonte=fs.readFileSync(path.join(raiz,'build/montar-node.js'),'utf8');
test('gerador Node reproduz exatamente app/index/versão/SW do HEAD anterior às mudanças',()=>{
  const salvos=new Map(),mock={readFileSync:fs.readFileSync,writeFileSync:(p,s)=>salvos.set(p,s)};
  vm.runInNewContext(fonte,{require:n=>n==='node:fs'?mock:require(n),__dirname:path.join(raiz,'build'),console:{log(){}}});
  assert.equal(salvos.size,4);
  assert.equal(salvos.get(path.join(raiz,'index.html')).match(/id="rd_sync"/g)?.length,1);
  assert.match(salvos.get(path.join(raiz,'index.html')),/<div class="hr">[\s\S]*id="sync"/);
  assert.match(salvos.get(path.join(raiz,'index.html')),/<div class="hr">[\s\S]*id="rd_sync"/);
});
test('artefatos atuais correspondem à receita, UTF-8 sem BOM e JS válido',()=>{
  const salvos=new Map(),mock={readFileSync:fs.readFileSync,writeFileSync:(p,s)=>salvos.set(p,s)};
  vm.runInNewContext(fonte,{require:n=>n==='node:fs'?mock:require(n),__dirname:path.join(raiz,'build'),console:{log(){}}});
  assert.equal(salvos.size,4);
  for(const [p,s] of salvos){assert.equal(normal(fs.readFileSync(p,'utf8')),s,path.basename(p));assert.notEqual(fs.readFileSync(p).subarray(0,3).toString('hex'),'efbbbf')}
  for(const p of ['app.js','shim.js','sw.js'])assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(path.join(raiz,p),'utf8'),{filename:p}));
});
