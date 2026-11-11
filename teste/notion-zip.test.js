const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {zip}=require('./zip-ficticio.js');
const fonte=fs.readFileSync(require.resolve('../build/notas2.js'),'utf8');
const c=vm.createContext({Uint8Array,DataView,TextDecoder,Blob,DecompressionStream});vm.runInContext(fonte.slice(fonte.indexOf('const NT_ZIP_MAX=')),c);
test('ZIP Notion: métodos 0 e 8, nomes UTF-8 e bytes da imagem preservados',async()=>{
  const b=zip([{nome:'Raiz fictícia.html',dados:'<title>Raiz</title>',metodo:0},{nome:'imagens/ação.png',dados:Buffer.from([1,2,3,255]),metodo:8}]);
  const r=await c.ntZipLer(b);assert.equal(r.size,2);assert.equal(Buffer.from(r.get('Raiz fictícia.html')).toString(),'<title>Raiz</title>');assert.deepEqual([...r.get('imagens/ação.png')],[1,2,3,255]);
});
test('ZIP Notion: ExportBlock.zip com Part-1.zip dentro e caminhos relativos',async()=>{
  const b=zip([{nome:'Part-1.zip',dados:zip([{nome:'Raiz.html',dados:'raiz'},{nome:'Raiz/Filha.html',dados:'filha',metodo:0}])}]);
  const r=await c.ntZipLer(b);assert.deepEqual([...r.keys()],['Part-1/Raiz.html','Part-1/Raiz/Filha.html']);assert.equal(c.ntNotionRef('Part-1/Raiz.html','Raiz/Filha.html'),'Part-1/Raiz/Filha.html');
});
test('ZIP Notion: rejeita truncado, CRC alterado, cifrado, método desconhecido e ZIP64 antes de importar',async()=>{
  const original=zip([{nome:'a.html',dados:'abc',metodo:0}]);
  await assert.rejects(c.ntZipLer(original.subarray(0,original.length-1)),/corrompido/);
  const ruim=Buffer.from(original);ruim[36]^=1;await assert.rejects(c.ntZipLer(ruim),/corrompido/);
  await assert.rejects(c.ntZipLer(zip([{nome:'a.html',dados:'abc',flags:0x801}])) ,/cifrado/);
  await assert.rejects(c.ntZipLer(zip([{nome:'a.html',dados:'abc',metodo:12}])) ,/Método/);
  const z64=Buffer.from(original);z64.writeUInt16LE(65535,z64.length-12);await assert.rejects(c.ntZipLer(z64),/ZIP64/);
  const interno=zip([{nome:'ruim.zip',dados:zip([{nome:'a.html',flags:1}])},{nome:'boa.html',dados:'boa'}]);await assert.rejects(c.ntZipLer(interno),/cifrado/);
});
test('ZIP Notion: limites de quantidade, imagem, expansão e caminhos; cancelamento',async()=>{
  await assert.rejects(c.ntZipLer(zip([{nome:'../fora.html',dados:'x'}])),/fora/);
  await assert.rejects(c.ntZipLer(zip([{nome:'a.html'},{nome:'./a.html'}])),/repetidos/);
  await assert.rejects(c.ntZipLer(zip(Array.from({length:2001},(_,i)=>({nome:i+'.html'})))),/2.000/);
  const b=zip([{nome:'a.png',dados:'x',metodo:0}]),central=b.indexOf(Buffer.from('504b0102','hex'));b.writeUInt32LE(26*1024*1024,central+24);await assert.rejects(c.ntZipLer(b),/25 MB/);
  const bomba=zip([{nome:'a.html',dados:'x'.repeat(10000)}]),ic=bomba.indexOf(Buffer.from('504b0102','hex'));bomba.writeUInt32LE(1,ic+24);bomba.writeUInt32LE(1,22);await assert.rejects(c.ntZipLer(bomba),/corrompido/);
  await assert.rejects(c.ntZipLer(zip([{nome:'a.html'}]),undefined,'',0,()=>true),/cancelada/);
});
