const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');

function trecho(ini,fim){
  const i0=app.indexOf(ini);assert.ok(i0>=0,'início ausente: '+ini);
  const i1=fim?app.indexOf(fim,i0):app.length;assert.ok(i1>i0,'fim ausente: '+fim);
  return app.slice(i0,i1);
}

function criaCtx({cards=[],fcs={},fcAv={},cfg={},resumos=[],agora}={}){
  const store=new Map();
  let persisted=[],gravados={};
  const ctx={
    Date:agora==null?Date:class extends Date{constructor(...a){super(...(a.length?a:[agora]))}static now(){return agora}},Math,Set,Map,Array,Object,JSON,Number,String,Boolean,RegExp,
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
    fs.readFileSync(path.join(__dirname,'..','build','flashcards.js'),'utf8'),
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

const AGORA_BLOCO=new Date(2026,10,21,12).getTime();
function cardsDoDia(temas=10,quantidade=40){
  return Array.from({length:temas},(_,t)=>Array.from({length:quantidade},(_,i)=>({
    id:`t${t}-c${i}`,f:`Pergunta ${t}/${i}`,v:`Resposta ${t}/${i}`,
    chave:`a|Tema ${t}|Subtema ${i%3}`,tema:`Tema ${t}`,incid:t===0?10000:1
  }))).flat();
}

test('Hoje: não repete ID/frente e exclui respostas antigas, fundidos e reservas de outro bloco',()=>{
  const cards=[
    {id:'c1',f:'<b>Qual é o sinal?</b>'},{id:'c1',f:'<b>Qual é o sinal?</b>'},
    {id:'c2',f:'  QUAL E O SINAL?  '},{id:'novo',f:'Pergunta nova'},
    {id:'errou',f:'Visto antes'},{id:'copia',f:' VISTO ANTES '},
    {id:'acertou',f:'Acertou antes'},{id:'historico',f:'Histórico sem SRS'},
    {id:'feito',f:'Feito de ontem'},{id:'removido',f:'Texto antigo'},
    {id:'mantido',f:'Texto fundido'},{id:'reservado',f:'Em outro bloco'},
    {id:'copia-reserva',f:' EM OUTRO BLOCO '}
  ];
  const ctx=criaCtx({cards,agora:AGORA_BLOCO,
    fcs:{errou:[2.5,0,0,0,0,AGORA_BLOCO-864e5,0],acertou:[2.5,1,1,0,0,AGORA_BLOCO-864e5,0],removido:[2.5,1,1,0,0,AGORA_BLOCO-864e5,0]},
    cfg:{fcHoje:{d:'2026-11-20',feitos:['feito']},fcBlocos:[
      {id:'antigo',ids:['historico'],resp:{historico:{g:3,t:AGORA_BLOCO-864e5}},fim:true},
      {id:'outro',ids:['reservado'],resp:{},fim:false}
    ]}});
  ctx.window.RESUMOS_FUNDIDOS={removido:'mantido'};
  const ids=[...ctx.fcHojeFila()];
  assert.equal(ids.length,2);
  assert.deepEqual(ids.slice().sort(),['c1','novo']);
  ctx.fcHojeStart();
  assert.equal(ctx.ev('fq.ids.length'),2);
  assert.equal(new Set(ctx.ev('fq.ids')).size,2);
  assert.equal(new Set(ctx.ev('fq.ids.map(id=>fcFrenteChave(cardBy(id)))')).size,2);
});

test('blocos comuns: deduplicam frentes e IDs e não reservam o mesmo novo em dois blocos',()=>{
  const cards=[{id:'a',f:'Sinal A'},{id:'a',f:'Sinal A'},{id:'b',f:' SINAL A '},{id:'c',f:'Sinal C'}];
  const ctx=criaCtx({cards,agora:AGORA_BLOCO});
  ctx.fcStart();
  assert.deepEqual([...ctx.ev('fq.ids')],['a','c']);
  assert.equal(ctx.fcHojeFila().length,0,'novos já reservados no bloco comum');
  const ativo=ctx.ev('fq.id');
  ctx.fcStart();
  assert.equal(ctx.ev('fq.id'),ativo,'não abre outro bloco com os mesmos novos');
  assert.equal(ctx.ev('cfg.fcBlocos.length'),1);
  assert.equal(ctx.fcBlocoCarrega({id:'legado',ids:['a','b','a','c'],i:3,resp:{}}),true);
  assert.deepEqual([...ctx.ev('fq.ids')],['a','c']);
  assert.equal(ctx.ev('fq.i'),1,'deduplicação preserva o card atual');
});

test('Hoje: escolha e ordem estáveis por dia, embaralhadas e sem temas consecutivos quando possível',()=>{
  const cards=cardsDoDia(),ctx=criaCtx({cards,agora:AGORA_BLOCO});
  const ids=[...ctx.fcHojeFila()],igual=criaCtx({cards:cards.slice().reverse(),agora:AGORA_BLOCO});
  assert.equal(ids.length,100);
  assert.deepEqual([...igual.fcHojeFila()],ids,'mesma semente e catálogo em outra ordem');
  const temas=ids.map(id=>ctx.ev('fcHojeTema')(cards.find(c=>c.id===id)));
  assert.ok(temas.every((t,i)=>!i||t!==temas[i-1]));
  assert.notDeepEqual(ids,ids.slice().sort(),'não exibe por tema/ID');
  const amostra=cards.slice(0,2).concat(cards.slice(40,42),cards.slice(80,82)).map(c=>c.id);
  const ordem=[...ctx.fcHojeOrdem(amostra,'2026-11-21')];
  assert.deepEqual([...ctx.fcHojeOrdem(amostra,'2026-11-21')],ordem);
  assert.notDeepEqual([...ctx.fcHojeOrdem(amostra,'2026-11-22')],ordem);
  assert.deepEqual(ordem.slice().sort(),amostra.slice().sort());
  const desigual=cards.slice(0,4).concat(cards.slice(40,42),cards.slice(80,81)).map(c=>c.id);
  const intercalados=[...ctx.fcHojeOrdem(desigual,'2026-11-21')].map(id=>ctx.ev('fcHojeTema')(cards.find(c=>c.id===id)));
  assert.ok(intercalados.every((t,i)=>!i||t!==intercalados[i-1]),'tema majoritário com metade arredondada ainda intercala');
});

test('Hoje: teto de 15 por tema agrupa subtemas e só é relaxado quando faltam alternativas',()=>{
  const cards=cardsDoDia(),ctx=criaCtx({cards,agora:AGORA_BLOCO});
  const ids=[...ctx.fcHojeFila()],conta={};
  ids.forEach(id=>{const tema=ctx.ev('fcHojeTema')(cards.find(c=>c.id===id));conta[tema]=(conta[tema]||0)+1});
  assert.equal(ids.length,100);
  assert.ok(Object.values(conta).every(n=>n<=15));
  assert.equal(conta['a|tema 0'],15,'alta incidência ocupa o teto, sem dominar o dia');
  const escassos=cardsDoDia(1,95).concat(cardsDoDia(2,5).filter(c=>c.tema==='Tema 1'));
  const pouco=criaCtx({cards:escassos,agora:AGORA_BLOCO}),fila=[...pouco.fcHojeFila()];
  assert.equal(fila.length,100,'usa todos os disponíveis se o teto impedir completar');
  assert.equal(fila.filter(id=>id.startsWith('t1-')).length,5,'esgota as alternativas');
});

test('Hoje: amostragem favorece proporcionalmente a incidência e prioriza imagens respeitando o teto',()=>{
  const cards=cardsDoDia(200,10).map((c,i)=>({...c,incid:Math.floor(i/10)<100?5:1}));
  const ctx=criaCtx({cards,agora:AGORA_BLOCO}),fila=[...ctx.fcHojeFila()];
  const alta=fila.filter(id=>Number(id.match(/^t(\d+)/)[1])<100).length;
  assert.equal(fila.length,100);
  assert.ok(alta>=65&&alta<100,`seleção ponderada inclui ambos os grupos: ${alta}/100 de alta incidência`);
  const imagens=cardsDoDia().map(c=>({...c,fi:Number(c.id.split('-c')[1])<4?['imagem.jpg']:[],incid:1}));
  const imgCtx=criaCtx({cards:imagens,agora:AGORA_BLOCO}),imgIds=[...imgCtx.fcHojeFila()];
  assert.equal(imgIds.length,100);
  assert.equal(imgIds.filter(id=>imagens.find(c=>c.id===id).fi.length>0).length,40,'inclui todas as imagens disponíveis antes dos cards sem imagem');
  const concentradas=cardsDoDia().map(c=>({...c,fi:c.tema==='Tema 0'?['imagem.jpg']:[]}));
  const capCtx=criaCtx({cards:concentradas,agora:AGORA_BLOCO}),capIds=[...capCtx.fcHojeFila()];
  assert.equal(capIds.length,100);
  assert.equal(capIds.filter(id=>id.startsWith('t0-')).length,15,'imagem não permite furar o teto havendo outros temas');
});

test('Hoje: retomar mantém o bloco salvo e sincronizar adota ordem e posição mais recentes',()=>{
  const cards=cardsDoDia(),ctx=criaCtx({cards,agora:AGORA_BLOCO});
  ctx.fcHojeStart();
  const ordem=[...ctx.ev('fq.ids')],primeiro=ordem[0];
  ctx.ev('fq.shown=true');ctx.fcGrade(1);
  const cfg=JSON.parse(ctx.store.get('cbr_cfg')),fcs=JSON.parse(ctx.store.get('cbr_fcs'));
  assert.deepEqual(cfg.fcBlocos[0].ids,ordem,'ordem persistida após a resposta');
  const novos=[{id:'alias-importado',f:cards.find(c=>c.id===ordem[1]).f,incid:1e9},...cardsDoDia(11,40).filter(c=>c.tema==='Tema 10')];
  const retomado=criaCtx({cards:[...novos,...cards],cfg,fcs,agora:AGORA_BLOCO});
  retomado.fcHojeStart();
  assert.deepEqual([...retomado.ev('fq.ids')],ordem,'catálogo alterado não muda a escolha salva');
  assert.equal(retomado.ev('fq.i'),1);
  assert.equal(retomado.ev('fq.resp[fq.ids[0]].ok'),false);
  const h=retomado.ev('fcHojeData()'),local=retomado.ev('cfg.fcBlocos[0]');
  const remoto={...JSON.parse(JSON.stringify(local)),ids:ordem.slice().reverse(),i:50,t0:local.t0+10,u:local.u+100,resp:{[ordem[2]]:{g:3,ok:true,t:AGORA_BLOCO+100,p:null}}};
  retomado.mergeRemote([{id:'estado',data:()=>({u:AGORA_BLOCO+100,cfg:{fcHoje:{d:h,feitos:[]},fcBlocos:[remoto]}})}]);
  const unido=retomado.ev('cfg.fcBlocos[0]');
  assert.deepEqual([...unido.ids],remoto.ids,'sincronização preserva a ordem do bloco mais recente');
  assert.equal(unido.i,50);
  assert.ok(unido.resp[primeiro]);assert.ok(unido.resp[ordem[2]],'preserva respostas dos dois aparelhos');
  assert.ok(retomado.fcHojeEstado().feitos.includes(primeiro));
  assert.ok(retomado.fcHojeEstado().feitos.includes(ordem[2]));
  retomado.fcRetoma(unido.id);
  assert.deepEqual([...retomado.ev('fq.ids')],remoto.ids);
  assert.equal(retomado.ev('fq.i'),50);
});

test('Hoje: bloco legado conserva a ordem e não cresce ao retomar ou atualizar',()=>{
  const cards=cardsDoDia(),h='2026-11-21',ids=['t2-c3','t1-c2','t0-c1'];
  const ctx=criaCtx({cards,agora:AGORA_BLOCO,cfg:{fcBlocos:[{id:'hoje:'+h,hoje:h,ids,i:1,resp:{},t0:AGORA_BLOCO-100,u:AGORA_BLOCO-100,fim:false}]}});
  ctx.fcHojeStart();
  assert.deepEqual([...ctx.ev('fq.ids')],ids);
  assert.equal(ctx.ev('fq.i'),1);
  assert.equal(ctx.fcHojeAtualiza(ctx.ev('fq')),false);
  assert.deepEqual([...ctx.ev('fq.ids')],ids);
});

test('Hoje: respondidos não voltam como novos no dia seguinte, inclusive sem SRS sincronizado',()=>{
  const cards=cardsDoDia(),ctx=criaCtx({cards,agora:AGORA_BLOCO});ctx.fcHojeStart();
  const feitos=[...ctx.ev('fq.ids')].slice(0,3);
  for(const g of [1,2,3]){ctx.ev('fq.shown=true');ctx.fcGrade(g)}
  const cfg=JSON.parse(ctx.store.get('cbr_cfg')),fcs=JSON.parse(ctx.store.get('cbr_fcs'));
  const copia={id:'outro-id',f:cards.find(c=>c.id===feitos[0]).f.toUpperCase()};
  for(const progresso of [fcs,{}]){
    const amanha=criaCtx({cards:[copia,...cards],cfg,fcs:progresso,agora:AGORA_BLOCO+864e5}),fila=[...amanha.fcHojeFila()];
    assert.equal(fila.length,100);
    assert.ok(feitos.every(id=>!fila.includes(id)));
    assert.ok(!fila.includes('outro-id'),'frente respondida sob outro ID também fica excluída');
  }
  const semContador=criaCtx({cards,cfg:{...cfg,fcHoje:{d:'2026-11-21',feitos:[]}},fcs:{},agora:AGORA_BLOCO});
  assert.equal(semContador.fcHojeEstado().feitos.length,3,'recupera contador das respostas após sincronização incompleta');
});

test('Hoje: modo antigo mantém Errei/Difícil na reaprendizagem após atualizar e recarregar',()=>{
  const cards=cardsDoDia(1,3);
  for(const nota of [1,2]){
    const ctx=criaCtx({cards,agora:AGORA_BLOCO,cfg:{fcNovosPrimeiro:false}});
    ctx.fcHojeStart();
    const id=ctx.ev('fq.ids[0]');
    ctx.ev('fq.shown=true');ctx.fcGrade(nota);
    assert.equal(ctx.fcs[id][5],AGORA_BLOCO,'SRS já foi gravado');
    assert.equal(ctx.ev('fq.resp')[id],undefined,'ainda sem resposta definitiva');
    assert.equal(ctx.ev('fq.re')[id],1);
    ctx.vFcStudy();
    assert.ok(ctx.ev('fq.ids').includes(id),'renderização mantém o card em reaprendizagem');
    const retomado=criaCtx({cards,agora:AGORA_BLOCO,cfg:JSON.parse(ctx.store.get('cbr_cfg')),fcs:JSON.parse(ctx.store.get('cbr_fcs'))});
    retomado.fcHojeStart();
    assert.ok(retomado.ev('fq.ids').includes(id),'recarga mantém o card em reaprendizagem');
    assert.equal(retomado.ev('fq.re')[id],1);
    for(let i=0;i<2;i++){retomado.ev('fq.shown=true');retomado.fcGrade(3)}
    assert.equal(retomado.ev('fq.ids[fq.i]'),id,'card volta depois dos demais');
    retomado.ev('fq.shown=true');retomado.fcGrade(1);retomado.vFcStudy();
    assert.ok(retomado.ev('fq.ids').includes(id),'novo erro continua na fila');
    assert.equal(retomado.ev('fq.fim'),false);
    retomado.ev('fq.shown=true');retomado.fcGrade(3);
    assert.equal(retomado.ev('fq.resp')[id].g,3,'resposta definitiva registrada ao acertar');
    assert.equal(retomado.ev('fq.re')[id],undefined);
    assert.equal(retomado.ev('fq.fim'),true);
  }
});

test('Hoje: união conserva respostas e IDs dos dois aparelhos, posição mais recente e conclusão',()=>{
  const cards=['c1','c2','c3'].map(id=>({id,f:id,v:id})),h='2026-11-21';
  const ctx=criaCtx({cards,agora:AGORA_BLOCO});
  for(const localMaisNovo of [false,true])for(const concluidoMaisNovo of [false,true]){
    const antigo={id:'hoje:'+h,hoje:h,ids:['c1','c2'],i:0,resp:{c1:{g:1,ok:false,t:100}},fim:!concluidoMaisNovo,t0:10,u:100};
    const recente={...antigo,ids:['c2','c3'],i:1,resp:{c1:{g:3,ok:true,t:200},c3:{g:2,ok:true,t:200}},fim:concluidoMaisNovo,t0:20,u:200};
    const [unido]=ctx.fcBlocosPreserva([localMaisNovo?recente:antigo],[localMaisNovo?antigo:recente],{});
    assert.deepEqual([...unido.ids],['c2','c3','c1'],'ordem mais recente primeiro e união dos IDs');
    assert.equal(unido.i,1,'posição do aparelho mais recente');
    assert.equal(unido.t0,20);
    assert.equal(unido.u,200);
    assert.equal(unido.resp.c1.g,3,'resposta mais recente vence');
    assert.equal(unido.resp.c3.g,2,'resposta só do outro aparelho preservada');
    assert.ok(Object.keys(unido.resp).every(id=>unido.ids.includes(id)),'respostas continuam dentro do bloco');
    assert.equal(unido.fim,true,'conclusão não reabre com cópia pendente de outro aparelho');
    assert.equal(ctx.fcBlocoCarrega(unido),true);
    assert.match(ctx.vFcStudy(),/Bloco concluído/);
  }
});

test('bloco legado: deduplicação conserva a ocorrência respondida e seu progresso no painel',()=>{
  const cards=[{id:'primeiro',f:'Mesma frente',v:'A'},{id:'posterior',f:'MESMA   FRENTE',v:'B'},{id:'outro',f:'Outra frente',v:'C'}];
  for(const respondido of ['primeiro','posterior']){
    const b={id:'legado',ids:['primeiro','posterior','outro'],i:2,resp:{[respondido]:{g:3,ok:true,t:AGORA_BLOCO}},fim:false,t0:AGORA_BLOCO,u:AGORA_BLOCO};
    const ctx=criaCtx({cards,agora:AGORA_BLOCO,cfg:{fcBlocos:[b]}});
    const [aberto]=ctx.fcBlocosAbertos();
    assert.deepEqual([...aberto.ids],[respondido,'outro']);
    assert.equal(aberto.feitas,1,'resposta contada no painel');
    assert.equal(aberto.n,2,'frente repetida removida');
    ctx.fcRetoma(b.id);
    assert.deepEqual([...ctx.ev('fq.ids')],[respondido,'outro']);
    assert.equal(ctx.ev('fq.i'),1,'mantém o card atual após deduplicar');
    assert.match(ctx.vFcStudy(),/1\/2/,'progresso aparece no estudo');
    const salvo=JSON.parse(ctx.store.get('cbr_cfg'));
    const recarregado=criaCtx({cards,agora:AGORA_BLOCO,cfg:salvo});
    assert.equal(recarregado.fcBlocosAbertos()[0].feitas,1,'progresso persiste após recarregar');
  }
});
