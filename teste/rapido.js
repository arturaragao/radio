// Só interface/tema/layout; os cenários de sincronização pertencem à suíte completa.
const {spawnSync}=require('node:child_process'),path=require('node:path');
const inicio=performance.now(),r=spawnSync(process.execPath,['--test','teste/radio.test.js','teste/questoes145.test.js','teste/paginas-layout.test.js'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:28000,windowsHide:true});
process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');
console.log('Teste rápido: '+((performance.now()-inicio)/1000).toFixed(2)+' s');
if(r.error)console.error(r.error.message);process.exitCode=r.status===0&&!r.error?0:1;
