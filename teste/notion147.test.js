const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fonte=fs.readFileSync(require.resolve('../build/notas2.js'),'utf8'),notas=fs.readFileSync(require.resolve('../build/notas.js'),'utf8');
const c=vm.createContext({ntAgora:()=> '2026-11-11T12:00:00Z',Uint8Array,DataView,TextDecoder,Blob,DecompressionStream});
vm.runInContext(notas.slice(notas.indexOf('const ntNovoId='),notas.indexOf('// ===== Fusão por bloco')),c);
vm.runInContext(fonte.slice(fonte.indexOf('const NT_ZIP_MAX=')),c);
c.ntNotionId=vm.runInContext('ntNotionId',c);
vm.runInContext(notas.slice(notas.indexOf('const NT_PG_CAMPOS='),notas.indexOf('// Frases-padrão (1.42)')),c);
vm.runInContext(notas.slice(notas.indexOf('function ntFunde('),notas.indexOf('// Lista de conflitos do plano')),c);
const par=(text,id)=>({type:'paragraph',...(id?{attrs:{id}}:{}),content:[{type:'text',text}]}),bl=(text,id)=>({id,atualizado:'antes',conteudo:par(text,id)});
const puro=x=>JSON.parse(JSON.stringify(x));
test('Notion 1.47: LCS mantém repetidos e normaliza acentos/espaços, sem perder mudanças de marcas',()=>{
  const antes=[bl('A','a'),bl('Repetido','r1'),bl('Repetido','r2'),bl('Árvore  azul','cor')];
  const novo=[par('A'),par('Repetido'),par('Árvore azul')];novo[0].content[0].marks=[{type:'bold'}];
  const diff=c.ntNotionDiff(antes,novo);assert.deepEqual(puro(diff.map(r=>r.tipo)),['alterado','igual','removido','alterado']);
  const r=puro(c.ntNotionCombina(diff));assert.deepEqual(r.map(b=>b.id),['a','r1','cor']);assert.equal(r[0].conteudo.content[0].marks[0].type,'bold');assert.equal(r[1].atualizado,'antes');
});
test('Notion 1.47: aplicar parcial preserva bloco ignorado, identidade e ordem; entradas não são mutadas',()=>{
  const antes=[bl('início','i'),bl('removido','r'),bl('âncora','a'),bl('antigo','t'),bl('fim','f')],novo=[par('início'),par('âncora'),par('novo'),par('fim'),par('adicionado')];
  const original=JSON.stringify(antes),diff=c.ntNotionDiff(antes,novo);assert.deepEqual(puro(diff.map(r=>r.tipo)),['igual','removido','igual','alterado','igual','adicionado']);
  diff.find(r=>r.tipo==='removido').aplicar=false;const r=puro(c.ntNotionCombina(diff));
  assert.deepEqual(r.map(b=>b.conteudo.content[0].text),['início','removido','âncora','novo','fim','adicionado']);assert.deepEqual(r.slice(0,5).map(b=>b.id),['i','r','a','t','f']);assert.equal(JSON.stringify(antes),original);
  diff.forEach(r=>r.aplicar=false);assert.deepEqual(puro(c.ntNotionCombina(diff)),antes);
});
test('Notion 1.47: toggle mantém IDs internos; imagem com mesmo src é igual, diferente é alteração',()=>{
  const a={type:'details',attrs:{id:'toggle'},content:[{type:'detailsSummary',content:[{type:'text',text:'Título'}]},{type:'detailsContent',content:[par('Dentro','interno')]}]},b=puro(a);b.attrs.id='gerado';b.content[1].content[0].attrs.id='novo';
  assert.equal(c.ntNotionDiff([{id:'toggle',conteudo:a}],[b])[0].tipo,'igual');b.content[1].content[0].content[0].text='Editado';
  const r=c.ntNotionCombina(c.ntNotionDiff([{id:'toggle',conteudo:a}],[b]));assert.equal(r[0].conteudo.attrs.id,'toggle');assert.equal(r[0].conteudo.content[1].content[0].attrs.id,'interno');
  const img=src=>({type:'image',attrs:{src}});assert.equal(c.ntNotionDiff([{id:'img',conteudo:img('./img/a.jpg')}],[img('./img/a.jpg')])[0].tipo,'igual');assert.equal(c.ntNotionDiff([{id:'img',conteudo:img('./img/a.jpg')}],[img('./img/b.jpg')])[0].tipo,'alterado');
});
test('Notion 1.47: extrai UUID com/sem hífens e ambos os ZIPs reais são lidos',async()=>{
  const {exemplo,id,nome}=require('./notion147-ficticio.js');assert.equal(c.ntNotionId(nome),id);assert.equal(c.ntNotionId('01234567-89ab-cdef-0123-456789abcdef'),id);assert.equal(c.ntNotionId('nada'),'');
  for(const v of [1,2]){const arquivos=await c.ntZipLer(exemplo(v));assert.equal(arquivos.size,2);const html=new TextDecoder().decode(arquivos.get(nome));assert.match(html,/details/);assert.match(html,/pixel.png/);assert.match(html,v===1?/Texto antigo/:/Texto atualizado/)}
});
test('Notion 1.47: origem usa a regra por campo existente; data e hashes novos sobrevivem à fusão normal',()=>{
  const p={id:'p',titulo:'Página',atualizado:'2026-11-11T10:00:00Z',origem:{tipo:'notion-zip',titulo:'Original',importadoEm:'v1',imagens:{hash1:'./img/a.jpg'}},doc:{v:1,blocos:[]}},local=puro(p),remoto=puro(p);
  local.atualizado='2026-11-11T11:00:00Z';local.origem.importadoEm='v2';local.origem.imagens.hash2='./img/b.jpg';remoto.titulo='Renomeada em outro aparelho';
  const r=puro(c.ntFundePaginas([p],[local],[remoto]).paginas[0]);assert.deepEqual(r.origem,local.origem);assert.equal(r.titulo,remoto.titulo);
});
