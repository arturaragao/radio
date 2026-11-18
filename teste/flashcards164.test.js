// Radio 1.64.0: testes unitários puros (Node, sem navegador) para as mudanças 1–7.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ler=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8').replace(/\r\n/g,'\n');

test('1.64.0: shim.js respeita 403/429 com espera (Retry-After / X-RateLimit-Reset), sem martelar e aviso sem texto',async()=>{
  const calls=[];
  const ls={bcbr_gh_token:'tok_teste'};
  const mkDoc=()=>{
    const els=new Map();
    const mkEl=id=>({id,innerHTML:'',style:{},onclick:null,remove(){els.delete(id)}});
    return {
      body:{appendChild(el){els.set(el.id,el)}},
      getElementById(id){return els.get(id)||null},
      createElement(){return mkEl('bcbr_aviso')},
      addEventListener(){},
      visibilityState:'visible',
    };
  };
  const doc=mkDoc();
  let mode='403_rl';
  const fetchMock=async(url,opt)=>{
    if(String(url).includes('api.github.com'))calls.push(String(url));
    if(mode==='403_rl'){
      return {
        ok:false,status:403,
        headers:new Map([['x-ratelimit-remaining','0'],['x-ratelimit-reset',String(Math.floor(Date.now()/1000)+120)]]),
        text:async()=>'API rate limit exceeded'
      };
    }
    if(mode==='429_ra'){
      return {
        ok:false,status:429,
        headers:new Map([['retry-after','90']]),
        text:async()=>'too many requests'
      };
    }
    return {ok:true,status:200,headers:new Map([['x-ratelimit-remaining','4999']]),json:async()=>[],text:async()=>'[]'};
  };
  const ctx=vm.createContext({
    window:{BCBR_VERSAO:'1.64.0',addEventListener(){}},
    document:doc,
    localStorage:{getItem:k=>ls[k]??null,setItem:(k,v)=>{ls[k]=v},removeItem:k=>{delete ls[k]}},
    sessionStorage:{getItem:()=>null,setItem(){}},
    navigator:{onLine:true},
    indexedDB:{open(){return {set onupgradeneeded(_){},set onsuccess(_){},set onerror(_){}}}},
    caches:{open:async()=>({match:async()=>null,put:async()=>{}}),keys:async()=>[]},
    location:{reload(){},search:''},
    fetch:fetchMock,
    setTimeout,clearTimeout,setInterval:()=>0,
    URLSearchParams,Date,Math,Map,Set,Array,Object,String,Number,Error,Promise,JSON,encodeURIComponent,decodeURIComponent
  });
  ctx.window.window=ctx.window;ctx.window.document=doc;
  // Evita que iniciar() dispare carregarDados antes do nosso teste
  const src=ler('shim.js').replace('iniciar();','');
  vm.runInContext(src,ctx);
  const BCBR=ctx.window.BCBR;

  await assert.rejects(()=>BCBR.api('/repos/a/b/contents/x'),e=>e.limite===true&&/^GitHub ocupado, tentando às \d\d:\d\d$/.test(e.message));
  assert.equal(calls.length,1);
  assert.ok(BCBR.pausaAte>Date.now());

  // Durante pausaAte, api() NÃO chama fetch (sem martelar)
  await assert.rejects(()=>BCBR.api('/repos/a/b/contents/y'),e=>e.limite===true&&e.status===429);
  assert.equal(calls.length,1,'não faz nova chamada durante a pausa');

  // 429 com Retry-After
  BCBR.pausaAte=0;mode='429_ra';
  await assert.rejects(()=>BCBR.api('/repos/a/b/contents/z'),e=>e.limite===true&&e.ate>Date.now()+80000);
  assert.equal(calls.length,2);

  // Recupera quando pausa expira e 200 retorna
  BCBR.pausaAte=0;mode='ok';
  await BCBR.api('/repos/a/b/contents/ok');
  assert.equal(BCBR.pausaAte,0);
  assert.equal(BCBR.limiteMsg,'');
});

test('1.64.0: fcImgRef normaliza caminhos (imagens/, ./img/, acentos) e offline.js não exibe texto poluído',()=>{
  const fcSrc=ler('build/flashcards.js');
  const m=fcSrc.match(/function fcImgRef\(u\)\{[\s\S]*?\n\}/);assert.ok(m);
  const ctx=vm.createContext({});vm.runInContext(m[0]+'\nthis.fcImgRef=fcImgRef;',ctx);
  assert.equal(ctx.fcImgRef('ovário.jpg'),'gh:ovário.jpg');
  assert.equal(ctx.fcImgRef('imagens/ovário e anexos.jpg'),'gh:ovário e anexos.jpg');
  assert.equal(ctx.fcImgRef('./imagens/sub/foto.png'),'gh:sub/foto.png');
  assert.equal(ctx.fcImgRef('/img/ov%C3%A1rio.jpg'),'gh:ovário.jpg');
  assert.equal(ctx.fcImgRef('gh:imagens/teste.jpg'),'gh:teste.jpg');

  const offSrc=ler('build/offline.js');
  const ctx2=vm.createContext({localStorage:{getItem:()=>null},navigator:{onLine:true},dirty:new Set(),estDirty:false,SM:{sujo:false},window:{BCBR:{},addEventListener(){}},document:{addEventListener(){}},setTimeout:()=>0,setInterval:()=>0});
  vm.runInContext(offSrc+'\nthis.OF=OF;this.ofTexto=ofTexto;this.ofIcoLoad=ofIcoLoad;',ctx2);
  ctx2.OF.baixando=true;ctx2.OF.prog='12/100';
  assert.equal(ctx2.ofTexto(),'','não mostra texto poluído durante download');
  const loadHtml=ctx2.ofIcoLoad(42);
  assert.match(loadHtml,/42%/);assert.match(loadHtml,/of-ring/);assert.match(loadHtml,/of-bar/);
});

test('1.64.0: app.js gerado tem syncErroTxt, fcFormataCard e versão 1.64.0',()=>{
  const app=ler('app.js');
  assert.match(app,/function syncErroTxt\(e\)/);
  assert.match(app,/function fcFormataCard\(html\)/);
  assert.match(app,/function fcSanitiza\(raw\)/);
  const css=ler('build/extra.css');
  assert.match(css,/\.qnav \.qgrid\{[^}]*max-height:58px/);
  assert.match(css,/\.of-btn\.on\{[^}]*color:#4ade80/);
});
