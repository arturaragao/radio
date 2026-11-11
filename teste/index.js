// Entrada para `node --test teste/` também no Windows/Node 24.
// Cada arquivo mantém seus testes reais; o interpretador usa process.exit e roda isolado.
const fs=require('node:fs'),path=require('node:path');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
for(const f of fs.readdirSync(__dirname).sort())if(f.endsWith('.test.js')&&f!=='interpretar.test.js')require('./'+f);
test('interpretador: 28 casos em processo isolado',()=>{
  const r=spawnSync(process.execPath,[path.join(__dirname,'interpretar.test.js')],{encoding:'utf8',windowsHide:true});
  assert.ifError(r.error);assert.equal(r.status,0,r.stderr||r.stdout);assert.match(r.stdout,/ok: 28 casos/);
});
