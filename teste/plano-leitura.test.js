const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const semana=fs.readFileSync(require.resolve('../build/semana.js'),'utf8');
const fonte=semana.slice(0,semana.indexOf('// ---------- tipo do dia'));
const plano={v:2,dias:{},tarefas:[],notasPaginas:{v:1,paginas:[{id:'usg',titulo:'Notas USG',doc:{v:1,blocos:[]}}]}};
const b64=x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64');
function app(api){
  const avisos=[],mem=new Map();
  const c=vm.createContext({BCBR:{REPO:'ficticio/teste',api,b64},navigator:{onLine:true},console:{warn:(...args)=>avisos.push(args)},
    localStorage:{getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)},
    atob:s=>Buffer.from(s,'base64').toString('binary'),smAgendaPuxar(){},smAuto(){},smNativoTarefas(){},tela:'tarefas',render(){}});
  vm.runInContext(fonte,c);
  return {c,avisos,mem,sm:()=>vm.runInContext('SM',c)};
}

test('plano >1 MB: contents real sem content busca blob e smPuxar1 carrega sem erro',async()=>{
  const chamadas=[];
  const a=app(async(path,opt)=>{
    chamadas.push([path,opt]);
    if(path.endsWith('/contents/semana/plano.json'))return {encoding:'none',content:'',size:1680860,sha:'abc',etag:'"plano"'};
    assert.equal(path,'/repos/ficticio/teste/git/blobs/abc');
    return {encoding:'base64',content:b64(plano),sha:'abc',size:1680860};
  });
  await a.c.smPuxar1();
  assert.deepEqual(JSON.parse(JSON.stringify(a.sm().d)),plano);
  assert.equal(a.sm().sha,'abc');assert.equal(a.sm().etag,'"plano"');assert.equal(a.sm().erro,'');
  assert.equal(chamadas.length,2);assert.equal(a.avisos.length,0);
  assert.match(a.sm().avisoTamanho,/Dados grandes \(1\.68 MB\)/);
});

test('plano 401: mensagem identifica chave recusada e registra erro',async()=>{
  const erro=Object.assign(new Error('chave'),{status:401});
  const a=app(async()=>{throw erro});
  await a.c.smPuxar1();
  assert.equal(a.sm().erro,'GitHub recusou a chave (401/403) — confira a chave em Ajustes.');
  assert.equal(a.avisos.length,1);assert.ok(a.avisos[0].includes(erro));
});

test('plano pequeno inline e 304 mantêm ETag e não pedem blob',async()=>{
  const chamadas=[];
  const a=app(async(path,opt)=>{
    chamadas.push([path,opt]);
    return chamadas.length===1?{encoding:'base64',content:b64(plano),size:500,sha:'abc',etag:'"e1"'}:{naoMudou:true};
  });
  await a.c.smPuxar1();const d=a.sm().d;
  await a.c.smPuxar1();
  assert.equal(chamadas.length,2);assert.equal(chamadas[1][1].etag,'"e1"');
  assert.equal(a.sm().d,d);assert.equal(a.sm().etag,'"e1"');assert.equal(a.sm().erro,'');assert.equal(a.sm().avisoTamanho,'');
});

test('content vazio com size positivo também busca blob, mesmo sem encoding none',async()=>{
  let blobs=0;
  const a=app(async path=>path.includes('/git/blobs/')?(blobs++,{encoding:'base64',content:b64(plano)}):{encoding:'base64',content:'',size:1680860,sha:'abc'});
  await a.c.smPuxar1();assert.equal(blobs,1);assert.equal(a.sm().d.v,2);assert.equal(a.sm().erro,'');
});

for(const status of [409,422])test('conflito '+status+': relê blob grande e regrava compacto com SHA novo',async()=>{
  let puts=0,blobs=0;
  const remoto={...plano,subtitulo:'Remoto',campoFuturo:{preservado:true}},enviados=[];
  const a=app(async(path,opt)=>{
    if(opt?.method==='PUT'){
      const body=JSON.parse(opt.body),texto=Buffer.from(body.content,'base64').toString();
      enviados.push({body,texto});
      if(++puts===1)throw Object.assign(new Error('conflito'),{status});
      return {content:{sha:'salvo'}};
    }
    if(path.includes('/git/blobs/')){blobs++;return {encoding:'base64',content:b64(JSON.stringify(remoto,null,1))}};
    return {encoding:'none',content:'',size:1680860,sha:'abc'};
  });
  a.sm().d=JSON.parse(JSON.stringify(plano));a.sm().sha='antigo';
  assert.equal(await a.c.smMudar(d=>{d.regras='Edição local'},'teste'),true);
  assert.equal(puts,2);assert.equal(blobs,1);assert.equal(enviados[1].body.sha,'abc');
  const salvo=JSON.parse(enviados[1].texto);
  assert.equal(salvo.regras,'Edição local');assert.equal(salvo.subtitulo,'Remoto');assert.equal(salvo.campoFuturo.preservado,true);
  assert.equal(enviados[1].texto,JSON.stringify(salvo));assert.equal(a.sm().base,enviados[1].texto);assert.equal(a.sm().erro,'');
});

test('histórico usa helper, ref do commit e blob do SHA retornado',async()=>{
  const chamadas=[];
  const a=app(async path=>{chamadas.push(path);return path.includes('/git/blobs/')?{encoding:'base64',content:b64(plano)}:{encoding:'none',content:'',size:1680860,sha:'blob-historico'}});
  const notas=fs.readFileSync(require.resolve('../build/notas2.js'),'utf8');
  vm.runInContext(notas.slice(notas.indexOf('async function ntHistVersao'),notas.indexOf('// Blocos da versão')),a.c);
  assert.deepEqual(JSON.parse(JSON.stringify(await a.c.ntHistVersao('commit/antigo'))),plano);
  assert.deepEqual(chamadas,['/repos/ficticio/teste/contents/semana/plano.json?ref=commit%2Fantigo','/repos/ficticio/teste/git/blobs/blob-historico']);
});

test('base com indentação antiga funde objetos e PUT passa a usar JSON compacto',async()=>{
  const remoto={...plano,subtitulo:'Outro aparelho'};let texto;
  const a=app(async(path,opt)=>{
    if(opt?.method==='PUT'){texto=Buffer.from(JSON.parse(opt.body).content,'base64').toString();return {content:{sha:'salvo'}}}
    return {sha:'novo',content:b64(remoto)};
  });
  Object.assign(a.sm(),{d:{...plano,regras:'Local'},base:JSON.stringify(plano,null,1),sujo:true});
  await a.c.smPuxar1();
  assert.equal(a.sm().d.regras,'Local');assert.equal(a.sm().d.subtitulo,'Outro aparelho');
  assert.equal(await a.c.smMudar(()=>{},'offline'),true);
  assert.equal(texto,JSON.stringify(a.sm().d));assert.equal(a.sm().sujo,false);
});

for(const [nome,erro,cota,mensagem] of [
  ['403 chave',Object.assign(new Error('GitHub 403'),{status:403}),null,/recusou a chave/],
  ['403 cota',Object.assign(new Error('GitHub 403'),{status:403}),{rest:0},/Limite de uso/],
  ['403 secundário',Object.assign(new Error('GitHub 403'),{status:403,resp:'secondary rate limit'}),null,/Limite de uso/],
  ['429',Object.assign(new Error('GitHub 429'),{status:429}),null,/Limite de uso/],
  ['rede',new TypeError('Failed to fetch'),null,/Sem conexão/],
  ['HTTP 500',Object.assign(new Error('GitHub 500'),{status:500}),null,/Não consegui ler.*HTTP 500/],
])test('mensagem honesta: '+nome,async()=>{
  const a=app(async()=>{throw erro});a.c.BCBR.cota=cota;
  await a.c.smPuxar1();assert.match(a.sm().erro,mensagem);assert.equal(a.avisos.length,1);
});

test('JSON inválido mantém cópia local, informa leitura e permite nova tentativa sem ETag inválido',async()=>{
  const a=app(async()=>({sha:'ruim',etag:'"ruim"',content:b64('{invalido')}));
  const local=JSON.parse(JSON.stringify(plano));a.sm().d=local;a.sm().sha='local';a.sm().etag='"local"';
  await a.c.smPuxar1();
  assert.equal(a.sm().d,local);assert.equal(a.sm().sha,'local');assert.equal(a.sm().etag,'"local"');
  assert.match(a.sm().erro,/Não consegui ler.*JSON inválido/);assert.equal(a.avisos.length,1);
});

test('falha do blob não vira sucesso e preserva cópia local',async()=>{
  const a=app(async path=>path.includes('/git/blobs/')?{encoding:'none',content:''}:{encoding:'none',content:'',size:1680860,sha:'abc'});
  const local=JSON.parse(JSON.stringify(plano));a.sm().d=local;a.sm().sha='local';
  await a.c.smPuxar1();assert.equal(a.sm().d,local);assert.equal(a.sm().sha,'local');
  assert.match(a.sm().erro,/Não consegui ler.*blob sem conteúdo base64/);assert.equal(a.avisos.length,1);
});
