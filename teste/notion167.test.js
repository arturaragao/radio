// Radio 1.67.0 no Chrome: importação de ZIP GRANDE do Notion (acima de 200 MB) lida do disco em pedaços — sem limite de 200 MB do arquivo,
// sem ler vídeos/PDFs, imagem grande demais só conta como falha, ZIP64 e ExportBlock/Part-N.zip. Arquivos fictícios.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {deflateRawSync,crc32}=require('node:zlib');
const {iniciar}=require('./chrome-util.js'),{zip}=require('./zip-ficticio.js');

// ZIP64 mínimo (EOCD64 + localizador + extra tag 1 com tamanhos e deslocamento de 64 bits).
function zip64(arquivos){
  const locais=[],centrais=[];let offset=0;
  for(const a of arquivos){
    const nome=Buffer.from(a.nome),raw=Buffer.from(a.dados||''),metodo=a.metodo??8,comp=metodo===8?deflateRawSync(raw):raw,crc=crc32(raw);
    const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(45,4);l.writeUInt16LE(0x800,6);l.writeUInt16LE(metodo,8);l.writeUInt32LE(crc,14);l.writeUInt32LE(comp.length,18);l.writeUInt32LE(raw.length,22);l.writeUInt16LE(nome.length,26);
    const x=Buffer.alloc(28);x.writeUInt16LE(1,0);x.writeUInt16LE(24,2);x.writeBigUInt64LE(BigInt(raw.length),4);x.writeBigUInt64LE(BigInt(comp.length),12);x.writeBigUInt64LE(BigInt(offset),20);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(45,4);c.writeUInt16LE(45,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(metodo,10);c.writeUInt32LE(crc,16);
    c.writeUInt32LE(0xffffffff,20);c.writeUInt32LE(0xffffffff,24);c.writeUInt16LE(nome.length,28);c.writeUInt16LE(x.length,30);c.writeUInt32LE(0xffffffff,42);
    locais.push(l,nome,comp);centrais.push(c,nome,x);offset+=l.length+nome.length+comp.length;
  }
  const central=Buffer.concat(centrais),p64=offset+central.length;
  const e64=Buffer.alloc(56);e64.writeUInt32LE(0x06064b50);e64.writeBigUInt64LE(44n,4);e64.writeUInt16LE(45,12);e64.writeUInt16LE(45,14);e64.writeBigUInt64LE(BigInt(arquivos.length),24);e64.writeBigUInt64LE(BigInt(arquivos.length),32);e64.writeBigUInt64LE(BigInt(central.length),40);e64.writeBigUInt64LE(BigInt(offset),48);
  const loc=Buffer.alloc(20);loc.writeUInt32LE(0x07064b50);loc.writeBigUInt64LE(BigInt(p64),8);loc.writeUInt32LE(1,16);
  const e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50);e.writeUInt16LE(0xffff,8);e.writeUInt16LE(0xffff,10);e.writeUInt32LE(0xffffffff,12);e.writeUInt32LE(0xffffffff,16);
  return Buffer.concat([...locais,central,e64,loc,e]);
}
const pagina=(titulo,corpo)=>`<!DOCTYPE html><html><head><title>${titulo}</title></head><body><article><h1 class="page-title">${titulo}</h1><div class="page-body">${corpo}</div></article></body></html>`;
const arr=b=>JSON.stringify([...b]);

test('Radio 1.67.0: Notion — ZIP grande lido em pedaços',{timeout:150000},async t=>{
  const C=await iniciar({porta:8813,sw:true});t.after(()=>C.fim());const {ev,ate}=C;await C.abre('notas');
  await ate("typeof NT!=='undefined'&&!!NT.ed&&!NT.carregando");
  // força o caminho "grande" para arquivos pequenos e troca o envio/compressão de imagem por stubs
  await ev(`NT_ZIP_MEM=1;window.lidos=[];window.enviadas=0;
    const o=ntZipEntradaLe;ntZipEntradaLe=async(a,...r)=>{window.lidos.push(a.tamanho);return o(a,...r)};
    ntImgComprime=async b=>b;ntImgEnvia=async()=>'nota-'+(++window.enviadas)+'.jpg';0`);
  const importa=(buf,nome='grande.zip')=>ev(`ntNotionImporta(new File([new Uint8Array(${arr(buf)})],${JSON.stringify(nome)}))`);
  const fecha=()=>ev("document.querySelector('.nt-importa .nt-importa-acoes button:last-child')?.click();0");
  const imgs='<figure class="image"><img src="Pag/pequena.png"></figure><figure class="image"><img src="Pag/enorme.png"></figure><figure class="image"><img src="Pag/sumiu.png"></figure>';

  await t.test('lê só HTML e a imagem pequena; vídeo e imagem >25 MB não são lidos (falhas contam, página importa)',async()=>{
    const buf=zip([
      {nome:'Pag 0123456789abcdef0123456789abcdef.html',dados:pagina('Pag grande',`<p>Texto fictício</p>${imgs}`),metodo:8},
      {nome:'Pag/pequena.png',dados:Buffer.from([137,80,78,71,1,2,3]),metodo:0},
      {nome:'Pag/enorme.png',dados:Buffer.alloc(26*1024*1024),metodo:8},   // declarada com 26 MB: não pode ser lida
      {nome:'Pag/video.mp4',dados:Buffer.alloc(1024*1024),metodo:0},
      {nome:'Pag/arquivo.pdf',dados:Buffer.alloc(1024),metodo:8},
    ]);
    await ev('window.lidos=[];window.enviadas=0;0');
    const r=await importa(buf);
    assert.deepEqual({paginas:r.paginas,enviadas:r.enviadas,falhas:r.falhas},{paginas:1,enviadas:1,falhas:2});
    const lidos=await ev('window.lidos');
    assert.equal(lidos.length,2,'só o HTML e a imagem pequena: '+JSON.stringify(lidos));
    assert.ok(!lidos.includes(26*1024*1024)&&!lidos.includes(1024*1024));
    await fecha();
  });

  await t.test('ZIP64 e ExportBlock.zip com Part-N.zip (armazenado e compactado) abrem com caminhos corretos',async()=>{
    const interno=zip([{nome:'A 0123456789abcdef0123456789abcdef.html',dados:pagina('A','<p>a</p>'),metodo:0},{nome:'A/foto.jpg',dados:Buffer.from([255,216,1,2]),metodo:0}]);
    const caminhos=async buf=>ev(`ntZipAbre(new Blob([new Uint8Array(${arr(buf)})])).then(m=>[...m.keys()].sort())`);
    assert.deepEqual(await caminhos(zip([{nome:'Part-1.zip',dados:interno,metodo:0}])),['Part-1/A 0123456789abcdef0123456789abcdef.html','Part-1/A/foto.jpg']);
    assert.deepEqual(await caminhos(zip([{nome:'Part-1.zip',dados:interno,metodo:8}])),['Part-1/A 0123456789abcdef0123456789abcdef.html','Part-1/A/foto.jpg']);
    assert.deepEqual(await caminhos(zip64([{nome:'x/a.html',dados:'<p>z64</p>',metodo:8},{nome:'x/b.png',dados:Buffer.from([1,2,3]),metodo:0}])),['x/a.html','x/b.png']);
    const lido=await ev(`ntZipAbre(new Blob([new Uint8Array(${arr(zip64([{nome:'x/a.html',dados:'<p>z64</p>',metodo:8}]))})])).then(async m=>new TextDecoder().decode(await ntZipEntradaLe(m.get('x/a.html'),()=>false,1e6)))`);
    assert.equal(lido,'<p>z64</p>');
    const r=await importa(zip64([{nome:'Z 0123456789abcdef0123456789abcdef.html',dados:pagina('Pagina ZIP64','<p>ok</p>'),metodo:8}]),'z64.zip');
    assert.equal(r.paginas,1);await fecha();
  });

  await t.test('rejeita senha, CRC errado, truncado, caminho fora do ZIP, repetido e método desconhecido',async()=>{
    const msg=buf=>ev(`ntZipAbre(new Blob([new Uint8Array(${arr(buf)})])).then(()=>'ok',e=>e.message)`);
    const ok=zip([{nome:'a.html',dados:'abc',metodo:0}]);
    assert.match(await msg(zip([{nome:'a.html',dados:'abc',flags:0x801}])),/senha|cifrado/);
    assert.match(await msg(zip([{nome:'a.html',dados:'abc',metodo:12}])),/Método/);
    assert.match(await msg(zip([{nome:'../fora.html',dados:'x'}])),/fora/);
    assert.match(await msg(zip([{nome:'a.html'},{nome:'./a.html'}])),/repetidos/);
    assert.match(await msg(ok.subarray(0,ok.length-1)),/corrompido/);
    const ruim=Buffer.from(ok);ruim[36]^=1;   // byte do dado: o índice abre, mas a leitura da entrada acusa o CRC
    const lida=await ev(`ntZipAbre(new Blob([new Uint8Array(${arr(ruim)})])).then(m=>ntZipEntradaLe(m.get('a.html'),()=>false,1e6)).then(()=>'ok',e=>e.message)`);
    assert.match(lida,/corrompido/);
    const bomba=zip([{nome:'a.html',dados:'x'.repeat(10000)}]),ic=bomba.indexOf(Buffer.from('504b0102','hex'));bomba.writeUInt32LE(1,ic+24);bomba.writeUInt32LE(1,22);
    assert.match(await ev(`ntZipAbre(new Blob([new Uint8Array(${arr(bomba)})])).then(m=>ntZipEntradaLe(m.get('a.html'),()=>false,1e6)).then(()=>'ok',e=>e.message)`),/corrompido/);
  });

  await t.test('arquivo pequeno continua no leitor antigo (limite e mensagens preservados)',async()=>{
    await ev('NT_ZIP_MEM=200*1024*1024;0');
    const r=await importa(zip([{nome:'P 0123456789abcdef0123456789abcdef.html',dados:pagina('Pequeno','<p>x</p>'),metodo:8}]),'pequeno.zip');
    assert.equal(r.paginas,1);await fecha();
  });

  assert.deepEqual(C.erros,[]);
});
