const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');

function trecho(ini,fim){
  const i0=app.indexOf(ini);assert.ok(i0>=0,'início ausente: '+ini);
  const i1=fim?app.indexOf(fim,i0):app.length;assert.ok(i1>i0,'fim ausente: '+fim);
  return app.slice(i0,i1);
}

function criaCtx({cards=[],fcs={},fcAv={},cfg={},resumos=[]}={}){
  const store=new Map();
  let persisted=[],gravados={};
  const ctx={
    Date,Math,Set,Map,Array,Object,JSON,Number,String,Boolean,RegExp,
    DATA_PROVA:'2026-12-12',RI_DIARIA:50,DAY:864e5,
    Q:[],QID:{},all:[],log:[],over:{},pon:{},ia:{},uimg:{},srs:{},
    cards:cards.map(c=>({...c})),
    fcs:JSON.parse(JSON.stringify(fcs)),
    fcAv:JSON.parse(JSON.stringify(fcAv)),
    cfg:JSON.parse(JSON.stringify(cfg)),
    estU:100,resetAt:0,metoU:0,metodo:'',
    tela:'notas',sub:null,sess:null,dirty:new Set(),estDirty:false,flushT:null,retryT:null,
    DB:{collection:()=>({doc:id=>({set:async d=>{gravados[id]=JSON.parse(JSON.stringify(d))}})})},
    setSync(){},clearTimeout(){},setTimeout:()=>0,
    window:{RESUMOS_IDX:resumos},
    document:{querySelector:()=>null},
    $:()=>null,
    localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))},
    saveL:(k,v)=>store.set(k,JSON.stringify(v)),
    imgSrc:u=>String(u).startsWith('gh:')?'./img/'+encodeURIComponent(String(u).slice(3)):String(u),
    esc:s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
    norm:s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),
    rtHtml:s=>String(s||''),rtTxt:s=>String(s||''),rtVal:s=>s,
    hk:(id,m)=>[...String(id)].reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,7)%m,
    hoje0:()=>new Date().setHours(0,0,0,0),
    pct:(a,b)=>b?Math.round(a/b*100):0,
    barra:(v)=>`[bar:${v}]`,
    keyIs:(e,n)=>e.key==={fcshow:' ',fc1:'1',fc2:'2',fc3:'3',fc4:'4',fcundo:'z'}[n],
    keyLab:n=>({fcshow:'Espaço',fc1:'1',fc2:'2',fc3:'3',fc4:'4',fcundo:'Z'}[n]||n),
    aplicaNomes(){},reArea(){},aplicaTema(){},aplicaEdTodas(){},recalc(){},lerManual(){},
    riPreserva:(a,b)=>b,ntPrelAbre(){},qAbre:()=>false,smkIni(){},
    scrollToCalls:[],renderCalls:0,toasts:[],
    scrollTo:(x,y)=>ctx.scrollToCalls.push([x,y]),
    render:()=>{ctx.renderCalls++},
    toast:m=>ctx.toasts.push(m),
    flush(){},
    persist:wk=>{
      persisted.push(wk||'_est');
      ctx.saveL('cbr_cfg',ctx.cfg);ctx.saveL('cbr_fcs',ctx.fcs);ctx.saveL('cbr_cards',ctx.cards);ctx.saveL('cbr_fcav',ctx.fcAv);
      if(wk&&wk!=='_est')ctx.dirty.add(wk);
      if(!wk||wk==='_est')ctx.estU=Date.now();
      ctx.estDirty=true;
    },
    persisted,gravados,store
  };
  vm.createContext(ctx);
  const src=[
    trecho('const defCfg=()=>','let Q='),
    trecho('function rsSemeia(){','let fcs='),
    trecho('async function flush(){','async function iniciaSync()'),
    trecho('function go(t,s){','function render()'),
    trecho('function blocoPainel({','const DIFV='),
    trecho('const FC0=()=>','// ---- painel ----'),
    fs.readFileSync(path.join(__dirname,'..','build','notas.js'),'utf8').match(/function ntResumoBtn\(\)\{[\s\S]*?\nfunction ntResumoFc\([\s\S]*?\n(?=\/\/|function vNotas)/)[0]
  ].join('\n');
  vm.runInContext(src+';cfg=normCfg(cfg);this.ev=s=>eval(s);',ctx);
  return ctx;
}

test('bloco de flashcards: criação, painel, mapeamento acertei/errei e SRS sem duplicar',()=>{
  const cards=[
    {id:'c1',f:'Pergunta 1',v:'Resp 1',tg:'Tórax',u:1},
    {id:'c2',f:'Pergunta 2',v:'Resp 2',tg:'Tórax',u:2},
    {id:'c3',f:'Pergunta 3',v:'Resp 3',tg:'Abdome',u:3}
  ];
  const ctx=criaCtx({cards,cfg:{fcNovos:10,fcMax:50}}),ev=ctx.ev;
  ctx.fcStart();
  assert.equal(ctx.tela,'fcstudy');
  assert.deepEqual([...ev('fq.ids')],['c1','c2','c3']);

  // Painel inicial: 0 feitos, 0 acertos, 0 erros
  let html=ctx.fcPainel();
  assert.match(html,/1 de 3/);
  assert.match(html,/0\/3 feitos/);
  assert.match(html,/✓ 0/);
  assert.match(html,/✗ 0/);

  // Card 1: mostrar e marcar Bom (3 => acerto)
  ev('fq.shown=true');
  ctx.fcGrade(3);
  assert.equal(ev('fq.i'),1);
  assert.equal(ev('fq.resp.c1.g'),3);
  assert.equal(ev('fq.resp.c1.ok'),true);
  assert.equal(ctx.fcs.c1[2],1,'1 revisão aplicada no SRS');

  // Card 2: mostrar e marcar Errei (1 => erro)
  ev('fq.shown=true');
  ctx.fcGrade(1);
  assert.equal(ev('fq.i'),2);
  assert.equal(ev('fq.resp.c2.g'),1);
  assert.equal(ev('fq.resp.c2.ok'),false);

  html=ctx.fcPainel();
  assert.match(html,/3 de 3/);
  assert.match(html,/2\/3 feitos/);
  assert.match(html,/✓ 1/);
  assert.match(html,/✗ 1/);
  assert.match(html,/<button[^>]*onclick="fcIr\(0\)"[^>]*>1<i class="ok"><\/i>/);
  assert.match(html,/<button[^>]*onclick="fcIr\(1\)"[^>]*>2<i class="bad"><\/i>/);
  assert.match(html,/<button[^>]*class="qn cur"[^>]*onclick="fcIr\(2\)"[^>]*>3<\/button>/);

  // Voltar ao card 1 (já respondido): mostra resposta dada e re-responder não duplica SRS
  ctx.fcIr(0);
  assert.equal(ev('fq.i'),0);
  assert.equal(ev('fq.shown'),true,'revisitar card respondido abre frente e verso');
  const srsAntes=JSON.stringify(ctx.fcs.c1);
  ctx.fcGrade(3); // mesma nota: não altera nem duplica SRS
  assert.equal(JSON.stringify(ctx.fcs.c1),srsAntes);
  ctx.fcGrade(4); // altera nota para Fácil: recalcula a partir do estado pré-bloco, reps continua 1 (não 2!)
  assert.equal(ctx.fcs.c1[2],1,'reps não duplicou');
  assert.equal(ctx.fcs.c1[1],4,'intervalo atualizado de Bom (1d) para Fácil (4d)');
  assert.equal(ev('fq.resp.c1.g'),4);

  // Caso sem resp.p (ex.: bloco legado): responder de novo não toca no SRS
  ev('delete fq.resp.c1.p');
  const srsSemP=JSON.stringify(ctx.fcs.c1);
  ctx.fcGrade(2);
  assert.equal(JSON.stringify(ctx.fcs.c1),srsSemP,'sem resp.p não duplica nem altera SRS');
  assert.equal(ev('fq.resp.c1.g'),2);

  // Avança e finaliza no card 3 -> vai para tela de bloco concluído
  ctx.fcIr(2);
  assert.equal(ev('fq.shown'),false,'card ainda não respondido começa fechado');
  ev('fq.shown=true');
  ctx.fcGrade(2); // Difícil => acerto (g !== 1)
  assert.equal(ev('fq.fim'),true);
  const fimHtml=ctx.vFcStudy();
  assert.match(fimHtml,/Bloco concluído/);
  assert.match(fimHtml,/3\/3/);
  assert.match(fimHtml,/Só os errados \(1\)/);
  assert.match(fimHtml,/Novo bloco/);
});

test('atalhos ←/→ e Esc no estudo de flashcards respeitam foco e modais',()=>{
  const cards=[{id:'c1',f:'F1',v:'V1',u:1},{id:'c2',f:'F2',v:'V2',u:2}];
  const ctx=criaCtx({cards}),ev=ctx.ev;
  ctx.fcStart();
  const mkEv=(key,tag='BODY',extra={})=>({key,target:{tagName:tag,isContentEditable:false},shiftKey:false,preventDefaultCalled:false,preventDefault(){this.preventDefaultCalled=true},...extra});

  const eDir=mkEv('ArrowRight');
  ctx.fcKey(eDir);
  assert.equal(eDir.preventDefaultCalled,true);
  assert.equal(ev('fq.i'),1);

  const eEsq=mkEv('ArrowLeft');
  ctx.fcKey(eEsq);
  assert.equal(ev('fq.i'),0);

  // Campo de texto ou contentEditable não dispara seta
  const eInp=mkEv('ArrowRight','INPUT');
  ctx.fcKey(eInp);
  assert.equal(ev('fq.i'),0);
  const eCe=mkEv('ArrowRight','DIV',{target:{tagName:'DIV',isContentEditable:true}});
  ctx.fcKey(eCe);
  assert.equal(ev('fq.i'),0);

  // Esc sai para a lista de gerenciamento sem descartar o bloco salvo
  ctx.fcKey(mkEv('Escape'));
  assert.equal(ctx.tela,'fc');
  assert.equal(ctx.sub,'lista');
  assert.equal(ctx.fcBlocosAbertos().length,1);

  // Clicar na aba Flashcards (go('fc')) retoma o bloco aberto
  ev('fq=null');
  ctx.go('fc');
  assert.equal(ctx.tela,'fcstudy');
  assert.equal(ev('fq.i'),0);
});

test('resumos: salva progresso do resumo, retoma onde parou e oferece recomeçar / só os errados ao terminar',()=>{
  const resumos=[{pagina:'p1',titulo:'Útero',chave:'go|Ginecologia|Útero',cards:[{id:'rz-p1-01',f:'F1',v:'V1'},{id:'rz-p1-02',f:'F2',v:'V2'}]}];
  const ctx=criaCtx({resumos}),ev=ctx.ev;
  assert.equal(ev('cards.length'),2);

  // Primeiro clique no botão do resumo
  ctx.ntResumoFc('p1');
  assert.equal(ctx.tela,'fcstudy');
  assert.equal(ev('fq.id'),'rs:p1');
  assert.equal(ev('fq.rs'),'p1');
  assert.equal(ev('fq.ids.length'),2);

  // Responde o 1º card como Errei e sai
  ev('fq.shown=true');
  ctx.fcGrade(1);
  assert.equal(ev('fq.i'),1);

  // Simula recarregamento mantendo apenas cfg e fcs salvos no localStorage
  const cfgSalvo=JSON.parse(ctx.store.get('cbr_cfg'));
  const fcsSalvo=JSON.parse(ctx.store.get('cbr_fcs'));
  const ctx2=criaCtx({cfg:cfgSalvo,fcs:fcsSalvo,resumos}),ev2=ctx2.ev;
  ctx2.ntResumoFc('p1');
  assert.equal(ctx2.tela,'fcstudy');
  assert.equal(ev2('fq.i'),1,'retomou no card 2 onde parou');
  assert.equal(ev2('fq.resp["rz-p1-01"].ok'),false,'manteve erro do card 1');

  // Termina o card 2 como Bom
  ev2('fq.shown=true');
  ctx2.fcGrade(3);
  assert.equal(ev2('fq.fim'),true);

  // Clicar de novo no botão do resumo com o bloco terminado abre resumo com Recomeçar tudo e Só os errados
  ev2('fq=null');
  ctx2.ntResumoFc('p1');
  const html=ctx2.vFcStudy();
  assert.match(html,/Bloco concluído/);
  assert.match(html,/Recomeçar tudo \(2\)/);
  assert.match(html,/Só os errados \(1\)/);

  // Escolhe Só os errados
  ctx2.fcSoErrados();
  assert.equal(ev2('fq.fim'),false);
  assert.deepEqual([...ev2('fq.ids')],['rz-p1-01']);
});

test('mergeRemote preserva respostas de ambos aparelhos e mantém compatibilidade com cfg antigo',()=>{
  const cards=[{id:'c1',f:'F1',v:'V1',u:1},{id:'c2',f:'F2',v:'V2',u:2}];
  // Compatibilidade: cfg antigo sem fcBlocos/fcAtivo
  const ctx=criaCtx({cards,cfg:{tema:'auto'}}),ev=ctx.ev;
  assert.deepEqual([...ev('cfg.fcBlocos')],[]);
  assert.equal(ev('cfg.fcAtivo'),null);

  // Aparelho local respondeu c1; remoto (estU maior) respondeu c2 no mesmo bloco (mesmo t0)
  ev('cfg.fcBlocos=[{id:"rs:p1",rs:"p1",titulo:"Resumo: P1",ids:["c1","c2"],i:1,resp:{c1:{g:3,ok:true,t:1100}},fim:false,t0:1000,u:1100}];cfg.fcAtivo="rs:p1";');
  ctx.estU=1100;

  const docRemoto={
    id:'estado',
    data:()=>({
      u:1200,
      over:{},
      resetAt:0,
      cfg:{
        tema:'auto',
        fcAtivo:'rs:p1',
        fcBlocos:[{id:'rs:p1',rs:'p1',titulo:'Resumo: P1',ids:['c1','c2'],i:0,resp:{c2:{g:1,ok:false,t:1200}},fim:false,t0:1000,u:1200}]
      }
    })
  };
  ctx.mergeRemote([docRemoto]);
  const b=ev('cfg.fcBlocos.find(x=>x.id==="rs:p1")');
  assert.ok(b.resp.c1,'resposta local c1 preservada');
  assert.ok(b.resp.c2,'resposta remota c2 preservada');
  assert.equal(b.resp.c1.ok,true);
  assert.equal(b.resp.c2.ok,false);
  assert.ok(ctx.persisted.includes('_est'),'republica união');
});

test('parte 1: rsSemeia leva fi/vi para novos e preservando texto editado pelo Artur',()=>{
  const resumos=[{pagina:'p1',titulo:'Tórax',chave:'tor|Tórax|Nódulo',cards:[
    {id:'rz-1',f:'Frente índice',v:'Verso índice',fi:['a.jpg'],vi:['b.jpg']},
    {id:'rz-2',f:'Sem img',v:'Sem img v'}
  ]}];
  const edited=[{id:'rz-1',f:'Texto editado pelo Artur',v:'Verso editado',tg:'Resumo: Tórax;',u:500}];
  const ctx=criaCtx({cards:edited,resumos}),ev=ctx.ev;
  const c1=ev('cardBy("rz-1")');
  assert.equal(c1.f,'Texto editado pelo Artur');
  assert.equal(c1.v,'Verso editado');
  assert.deepEqual([...c1.fi],['a.jpg']);
  assert.deepEqual([...c1.vi],['b.jpg']);
  const c2=ev('cardBy("rz-2")');
  assert.equal(c2.fi,undefined);
  assert.equal(c2.vi,undefined);

  ctx.fcStart();
  const hF=ctx.vFcStudy();
  assert.match(hF,/\.\/img\/a\.jpg/);
  assert.doesNotMatch(hF,/\.\/img\/b\.jpg/);
  ev('fq.shown=true');
  const hV=ctx.vFcStudy();
  assert.match(hV,/\.\/img\/b\.jpg/);
});

test('parte 2: avaliação 👍/👎 não mexe no SRS, sincroniza em fc_avaliacoes e faz união por id (última edição vence)',async()=>{
  const cards=[{id:'c1',f:'F1',v:'V1',tg:'Resumo: Tórax;',u:1},{id:'c2',f:'F2',v:'V2',tg:'Tórax',u:2}];
  const ctx=criaCtx({cards}),ev=ctx.ev;
  ctx.fcStart();
  const srsAntes=JSON.stringify(ctx.fcs);

  // Vota 👍 e depois desfaz
  ctx.fcAvVota(1);
  assert.equal(ctx.fcAv.c1.voto,1);
  assert.equal(ctx.fcAv.c1.tema,'Resumo: Tórax;');
  assert.equal(JSON.stringify(ctx.fcs),srsAntes,'avaliação não altera SRS');
  ctx.fcAvVota(1);
  assert.equal(ctx.fcAv.c1.voto,0);

  // Vota 👎 com motivo (foco síncrono em #fc_av_txt, sem depender de setTimeout)
  let focos=0;ctx.$=s=>s==='#fc_av_txt'?{focus(){focos++}}:null;
  ctx.fcAvVota(-1);
  assert.equal(focos,1,'foco imediato em #fc_av_txt ao abrir 👎');
  ctx.$=()=>null;
  ev('fcAvEdit.txt="Imagem confusa"');
  ctx.fcAvSalva();
  ctx.$=s=>s==='#fc_av_txt'?{focus(){focos++}}:null;
  ctx.fcAvEditar();
  assert.equal(focos,2,'foco imediato em #fc_av_txt ao editar motivo');
  ctx.$=()=>null;
  ctx.fcAvCancela();
  assert.equal(ctx.fcAv.c1.voto,-1);
  assert.equal(ctx.fcAv.c1.motivo,'Imagem confusa');
  assert.ok(ctx.dirty.has('av:0'));
  assert.equal(JSON.stringify(ctx.fcs),srsAntes,'avaliação negativa não altera SRS');

  // flush grava progresso/fc_avaliacoes.json
  await ctx.flush();
  assert.equal(ctx.gravados.fc_avaliacoes.items.c1.motivo,'Imagem confusa');

  // mergeRemote: união por id, última edição vence
  const tLocal=ctx.fcAv.c1.u;
  ctx.mergeRemote([{id:'fc_avaliacoes',data:()=>({items:{
    c1:{id:'c1',tema:'Resumo: Tórax;',frente:'F1',verso:'V1',voto:1,motivo:'',data:'2026-01-01T00:00:00Z',u:tLocal-1000},
    c2:{id:'c2',tema:'Tórax',frente:'F2',verso:'V2',voto:-1,motivo:'Cortar texto',data:'2026-11-16T10:00:00Z',u:tLocal+1000}
  }})}]);
  assert.equal(ctx.fcAv.c1.voto,-1,'local mais novo vence');
  assert.equal(ctx.fcAv.c1.motivo,'Imagem confusa');
  assert.equal(ctx.fcAv.c2.voto,-1,'remoto novo entra na união');
  assert.equal(ctx.fcAv.c2.motivo,'Cortar texto');
  assert.ok(ctx.dirty.has('av:0'),'local mais novo entra na fila para republicar');
});

test('parte 3: novos primeiro (sem limite diário e sem repetir errado) vs modo antigo',()=>{
  const now=Date.now(),DAY=864e5;
  const cards=[
    {id:'v1',f:'Vencido 1',v:'RV1',u:1},
    {id:'n1',f:'Novo 1',v:'RN1',u:2},
    {id:'n2',f:'Novo 2',v:'RN2',u:3},
    {id:'n3',f:'Novo 3',v:'RN3',u:4}
  ];
  const fcs={v1:[2.5,2,2,now-DAY,0,now-3*DAY,0]};
  const ctx=criaCtx({cards,fcs,cfg:{fcNovos:1,fcMax:50}}),ev=ctx.ev;
  assert.equal(ev('cfg.fcNovosPrimeiro'),true,'ligado por padrão');

  // Modo novos primeiro: pega TODOS os novos (ignora limite fcNovos=1) e não inclui vencidos enquanto há novos
  ctx.fcStart();
  assert.deepEqual([...ev('fq.ids')],['n1','n2','n3']);

  // Errar n1 não traz de volta no bloco e agenda >= 1 dia
  ev('fq.shown=true');
  ctx.fcGrade(1);
  assert.deepEqual([...ev('fq.ids')],['n1','n2','n3']);
  assert.equal(ev('fq.resp.n1.ok'),false);
  assert.ok(ctx.fcs.n1[3]>=now+DAY-5000,'erro agendado para >= 1 dia');
  assert.ok(ctx.fcs.n1[2]>=1,'registrado no SRS');

  // Conclui n2 e n3 -> próximo bloco traz o vencido v1
  ev('fq.shown=true');ctx.fcGrade(3);
  ev('fq.shown=true');ctx.fcGrade(3);
  assert.equal(ev('fq.fim'),true);
  ctx.fcStart();
  assert.deepEqual([...ev('fq.ids')],['v1']);

  // Tag órfã não bloqueia fcStart()
  ev('fcTags.add("resumo: inexistente");fq=null;cfg.fcBlocos=[]');
  ctx.fcStart();
  assert.deepEqual([...ev('fq.ids')],['v1']);

  // Desligar o modo restaura ordem antiga ([rev, ...nov com limite]) e reinserção na mesma sessão
  ev('cfg.fcNovosPrimeiro=false');
  const ctxOld=criaCtx({
    cards:[{id:'v1',f:'V1',v:'R1',u:1},{id:'n1',f:'N1',v:'R1',u:2},{id:'n2',f:'N2',v:'R2',u:3}],
    fcs:{v1:[2.5,2,2,now-DAY,0,now-3*DAY,0]},
    cfg:{fcNovos:1,fcMax:50,fcNovosPrimeiro:false}
  }),evO=ctxOld.ev;
  ctxOld.fcStart();
  assert.deepEqual([...evO('fq.ids')],['v1','n1'],'vencido antes dos novos e respeito ao limite diário=1');
  evO('fq.shown=true');
  ctxOld.fcGrade(1);
  assert.equal(evO('fq.resp.v1'),undefined,'erro re-enfileirado na mesma sessão no modo antigo');
  assert.deepEqual([...evO('fq.ids')],['n1','v1']);
});

test('1.61 mergeRemote com local mais novo ainda une blocos remotos (respostas de ambos, posição mais recente)',()=>{
  const cards=[{id:'c1',f:'F1',v:'V1',u:1},{id:'c2',f:'F2',v:'V2',u:2},{id:'c3',f:'F3',v:'V3',u:3}];
  const ctx=criaCtx({cards}),ev=ctx.ev;
  ev('cfg.fcBlocos=[{id:"b1",ids:["c1","c2","c3"],i:1,resp:{c1:{g:3,ok:true,t:1100}},fim:false,t0:1000,u:1100}];cfg.fcAtivo="b1";');
  ctx.estU=5000;ctx.estDirty=false;
  ctx.mergeRemote([{id:'estado',data:()=>({u:1300,cfg:{fcAtivo:'b2',fcBlocos:[
    {id:'b1',ids:['c1','c2','c3'],i:2,resp:{c1:{g:1,ok:false,t:1000},c2:{g:2,ok:true,t:1200}},fim:false,t0:1000,u:1200},
    {id:'b2',ids:['c3'],i:0,resp:{},fim:false,t0:1250,u:1250}]}})}]);
  const b1=ev('cfg.fcBlocos.find(x=>x.id==="b1")');
  assert.equal(b1.resp.c1.ok,true,'resposta local mais recente vence');
  assert.equal(b1.resp.c2.ok,true,'resposta remota preservada');
  assert.equal(b1.i,2,'posição do mais recente (remoto u=1200)');
  assert.ok(ev('cfg.fcBlocos.some(x=>x.id==="b2")'),'bloco só remoto preservado');
  assert.equal(ev('cfg.fcAtivo'),'b1','ativo local válido mantido');
  assert.ok(ctx.gravados.estado.cfg.fcBlocos.some(x=>x.id==='b2'),'reenvia a união ao db');
  assert.equal(ctx.estU,5000,'não rebaixa o carimbo local');
});

test('1.61 fcTagsPoda: tag só com suspensos é mantida; cards carregando não esvaziam a seleção',()=>{
  const cards=[{id:'c1',f:'F1',v:'V1',tg:'Tórax',u:1},{id:'c2',f:'F2',v:'V2',tg:'Abdome',u:2}];
  const ctx=criaCtx({cards,fcs:{c1:[2.5,0,0,0,0,0,1]}}),ev=ctx.ev;
  ev('fcTags=new Set(["torax","sumiu"])');
  ctx.fcTagsPoda();
  assert.deepEqual([...ev('fcTags')],['torax'],'suspenso conta como no vFc; tag inexistente podada');
  // Carregando: sem cartões, ou db sem 1º snapshot
  ev('cards=[];fcTags=new Set(["torax"])');ctx.fcTagsPoda();
  assert.deepEqual([...ev('fcTags')],['torax']);
  ev('cards=[{id:"c2",f:"F2",v:"V2",tg:"Abdome",u:2}];primeiro=true');ctx.fcTagsPoda();
  assert.deepEqual([...ev('fcTags')],['torax'],'sem snapshot não poda');
  ctx.mergeRemote([]);
  assert.equal(ev('primeiro'),false);
  ctx.fcTagsPoda();
  assert.deepEqual([...ev('fcTags')],[],'após snapshot, órfã podada');
});

test('1.61 fcDescarta deixa tombstone respeitado pela união; atividade posterior ao descarte mantém o bloco',()=>{
  const cards=[{id:'c1',f:'F1',v:'V1',u:1},{id:'c2',f:'F2',v:'V2',u:2}];
  const ctx=criaCtx({cards}),ev=ctx.ev;
  ev('cfg.fcBlocos=[{id:"b1",ids:["c1","c2"],i:0,resp:{},fim:false,t0:1000,u:1000},{id:"b2",ids:["c1"],i:0,resp:{},fim:false,t0:1000,u:1000}];cfg.fcAtivo="b1";');
  ctx.fcDescarta('b1');ctx.fcDescarta('b2');
  const tb=ev('cfg.fcMortos.b1');
  assert.ok(tb>=1000,'tombstone gravado');
  const remoto=u=>({id:'estado',data:()=>({u,cfg:{fcBlocos:[
    {id:'b1',ids:['c1','c2'],i:0,resp:{},fim:false,t0:1000,u:1000},
    {id:'b2',ids:['c1'],i:0,resp:{c1:{g:3,ok:true,t:tb+60000}},fim:false,t0:1000,u:tb+60000}]}})});
  ctx.estU=tb+1;ctx.mergeRemote([remoto(1500)]);           // local mais novo
  assert.ok(!ev('cfg.fcBlocos.some(x=>x.id==="b1")'),'b1 não ressuscita');
  assert.ok(ev('cfg.fcBlocos.some(x=>x.id==="b2")'),'b2 respondido depois do descarte é mantido');
  ev('cfg.fcBlocos=[]');ctx.estU=1;ctx.mergeRemote([remoto(tb+90000)]);  // remoto mais novo, sem tombstone próprio
  assert.ok(!ev('cfg.fcBlocos.some(x=>x.id==="b1")'),'b1 não ressuscita (remoto mais novo)');
  assert.ok(ev('cfg.fcMortos.b1')>=tb,'tombstone local sobrevive ao cfg remoto');
});
