// 1.42: nome Radio e tema Sépia nítido (escuro e claro): valores pedidos, razão de contraste WCAG calculada, paleta do editor legível e nada técnico renomeado.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ler=p=>fs.readFileSync(require.resolve('../'+p),'utf8').replace(/\r\n/g,'\n');
const head=ler('fonte/artefato-head.html'),css=ler('build/notas.css');
const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
const razao=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
const vars=txt=>Object.fromEntries([...txt.matchAll(/--([\w-]+):(#[0-9a-fA-F]{6})/g)].map(m=>[m[1],m[2].toLowerCase()]));
// os quatro blocos de tema da cabeça: padrão (escuro), claro por preferência do sistema, claro forçado, escuro forçado
const bloco=sel=>{const i=head.indexOf(sel);assert.ok(i>=0,sel);return vars(head.slice(i,head.indexOf('}',head.indexOf('color-scheme',i))))};
const T={escuro:bloco(':root{\n --bg'),claro:bloco(':root[data-theme="light"]{'),escuroForcado:bloco(':root[data-theme="dark"]{'),claroSistema:bloco('@media (prefers-color-scheme:light){:root:not([data-theme="dark"]){')};

test('Tema Sépia nítido 1.42: valores pedidos nos dois temas e nos quatro blocos',()=>{
  const pedido={escuro:{bg:'#221e1a',band:'#2f2923',card:'#2f2923',card2:'#3a332b',tx:'#faf4ea',mut:'#d6c8b4',bd:'#463d34',pri:'#f0a75a'},
    claro:{bg:'#f6efe4',card:'#fffaf2',card2:'#f1e7d8',tx:'#2b2520',mut:'#6b5d4f',bd:'#e3d6c3',pri:'#b8742f'}};
  for(const [k,v] of Object.entries(pedido.escuro)){assert.equal(T.escuro[k],v,'escuro --'+k);assert.equal(T.escuroForcado[k],v,'escuro forçado --'+k)}
  for(const [k,v] of Object.entries(pedido.claro)){assert.equal(T.claro[k],v,'claro --'+k);assert.equal(T.claroSistema[k],v,'claro (sistema) --'+k)}
  assert.deepEqual(T.escuro,T.escuroForcado);assert.deepEqual(T.claro,T.claroSistema);
});

test('Tema Sépia nítido 1.42: contraste WCAG >= 4,5 (calculado) nos dois temas',()=>{
  for(const nome of ['escuro','claro']){
    const t=T[nome];
    for(const fg of ['tx','mut','pri-tx','ok','bad','warn','f','m','d'])for(const bg of ['bg','card','card2'])
      assert.ok(razao(t[fg],t[bg])>=4.5,`${nome}: --${fg} sobre --${bg} = ${razao(t[fg],t[bg]).toFixed(2)}`);
    assert.ok(razao(t['on-pri'],t.pri)>=4.5,`${nome}: --on-pri sobre --pri = ${razao(t['on-pri'],t.pri).toFixed(2)}`);
    assert.ok(razao(t.ok,t.okbg)>=4.5&&razao(t.tx,t.okbg)>=4.5,nome+': estado ok');
    assert.ok(razao(t.bad,t.badbg)>=4.5&&razao(t.tx,t.badbg)>=4.5,nome+': estado erro');
    assert.ok(razao(t.ptx,t.pbg)>=4.5,nome+': aviso (pbg)');
    assert.ok(razao('#ffffff',t.band)>=4.5,nome+': texto branco do cabeçalho sobre --band');
  }
});

test('Tema Sépia nítido 1.42: paleta de cores do editor (--ntc-/--ntb-) legível no escuro e no claro',()=>{
  const linhas=css.split('\n'),escuro=vars(linhas.slice(10,12).join('\n')),claro=vars(linhas.slice(14,16).join('\n'));
  for(const [nome,p,t] of [['escuro',escuro,T.escuro],['claro',claro,T.claro]]){
    const textos=Object.keys(p).filter(k=>k.startsWith('ntc-')),fundos=Object.keys(p).filter(k=>k.startsWith('ntb-'));
    assert.equal(textos.length,9,nome);assert.equal(fundos.length,9,nome);
    for(const k of textos)for(const bg of ['bg','card','card2'])assert.ok(razao(p[k],t[bg])>=4.5,`${nome}: --${k} sobre --${bg} = ${razao(p[k],t[bg]).toFixed(2)}`);
    for(const k of fundos)assert.ok(razao(t.tx,p[k])>=4.5,`${nome}: texto sobre --${k} = ${razao(t.tx,p[k]).toFixed(2)}`);
  }
});

test('Nome Radio 1.42: título, cabeçalho, manifest e tela de configuração; nada técnico foi renomeado',()=>{
  const index=ler('index.html'),man=JSON.parse(ler('manifest.webmanifest'));
  assert.match(index,/<title>Radio<\/title>/);assert.match(index,/<\/svg>Radio<small class="versao">v1\.42\.0<\/small><\/div>/);
  assert.equal(man.name,'Radio');assert.equal(man.short_name,'Radio');assert.equal(man.theme_color,'#2f2923');assert.equal(man.background_color,'#221e1a');
  assert.match(index,/<meta name="theme-color" content="#2f2923" media="\(prefers-color-scheme: dark\)">/);
  assert.match(index,/<meta name="theme-color" content="#4a3320" media="\(prefers-color-scheme: light\)">/);
  assert.doesNotMatch(index,/<title>Banco CBR/);assert.doesNotMatch(index,/<\/svg>Banco CBR/);
  const shim=ler('shim.js');assert.match(shim,/<h2>Radio — configurar este aparelho<\/h2>/);
  // repositório, chaves e arquivos continuam com os nomes antigos
  assert.match(shim,/REPO = "arturaragao\/banco-cbr-app"/);assert.match(shim,/tk: "bcbr_gh_token"/);assert.match(ler('sw.js'),/const REPO = "arturaragao\/banco-cbr-app"/);
  assert.ok(fs.existsSync(require.resolve('../vendor/tiptap.js')));
});
