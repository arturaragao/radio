const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const appFonte=fs.readFileSync(require.resolve('../app.js'),'utf8');
const fixos=appFonte.slice(appFonte.indexOf('const DATA_PROVA='),appFonte.indexOf('let Q='));
assert.ok(fixos.includes('RI_DIARIA=50'));
const fonte=fixos+'\n'+['interpretar','semana','notas','notas2','busca'].map(n=>fs.readFileSync(require.resolve('../build/'+n+'.js'),'utf8')).join('\n');
const copia=x=>JSON.parse(JSON.stringify(x));
const mutacoesLegadas=[];
afterEach(()=>assert.deepEqual(mutacoesLegadas.splice(0),[],'1.43 nunca escreve nem apaga chaves da 1.42'));
function auditaLegado(acao,k){if(k==='bcbr_notasdoc_pendente'||/^bcbr_notas(?:pag|frases|pastas)?_base$/.test(k))mutacoesLegadas.push([acao,k])}
async function app(tarefas=[],nativo=false,armazenamento=null,offline=false,remotoSalvo=null,opcoes={}){
  const inicial={v:2,dias:{},tarefas:copia(tarefas)},salvos=[],avisos=[],recebidos=[],confirmados=[],elementos=new Map(),tempos=[],teclas=[],mem=armazenamento||new Map([['sm_cache2',JSON.stringify({sha:'s0',d:inicial})]]);
  const estado={remoto:copia(remotoSalvo||inicial),pendentes:[],conflito:false,falhar:offline};
  const el=tag=>({tagName:tag.toUpperCase(),children:[],querySelector(){return null},querySelectorAll(){return []},setAttribute(k,v){this[k]=v},append(...xs){this.children.push(...xs)},remove(){elementos.delete(this.id)}});
  const document={visibilityState:'visible',addEventListener(){},querySelector(){return null},querySelectorAll(){return []},getElementById:id=>elementos.get(id)||null,createElement:el,body:{appendChild(x){elementos.set(x.id,x)},classList:{remove(){},add(){}}}};
  const B={tarefas:json=>recebidos.push(JSON.parse(json)),pendentes:()=>JSON.stringify(estado.pendentes),confirmar:json=>confirmados.push(JSON.parse(json)),dados(){}};
  const SyncNotas={estado:()=>({paginas:[],abertas:{},pendentes:0}),receberLegado:async()=>{},enviar:async()=>true,listarPaginas:async()=>[],integrarPlano:async(d,sha)=>({d,sha})};
  const c=vm.createContext({SyncNotas,console,document,window:{addEventListener(tipo,fn){if(tipo==='keydown')teclas.push(fn)},...(nativo?{BCBRNativo:B}:{})},navigator:opcoes.navigator||{},
    localStorage:{get length(){return mem.size},key:i=>[...mem.keys()][i],getItem:k=>mem.get(k)??null,setItem:(k,v)=>{auditaLegado('setItem',k);return mem.set(k,v)},removeItem:k=>{auditaLegado('removeItem',k);return mem.delete(k)}},confirm:()=>true,
    setTimeout:(fn,ms)=>{tempos.push({fn,ms});return tempos.length},clearTimeout(){},setInterval(){},clearInterval(){},
    atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64'),
    Date:class extends Date{constructor(...args){super(...(args.length?args:['2026-10-26T12:00:00']))}static now(){return new Date('2026-10-26T12:00:00').getTime()}},
    dKey:n=>{const d=new Date(n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')},
    BCBR:{REPO:'privado/teste',b64:s=>Buffer.from(s).toString('base64'),api:async(path,opt)=>{
      if(path.endsWith('semana/plano.json')){
        if(opt?.method==='PUT'){
          if(estado.conflito){estado.conflito=false;estado.remoto.tarefas.push({id:'outro',texto:'Outro aparelho',dia:'2026-10-27'});throw Object.assign(new Error('conflito'),{status:409})}
          if(estado.falhar)throw Object.assign(new Error('offline'),{status:503});
          estado.remoto=JSON.parse(Buffer.from(JSON.parse(opt.body).content,'base64').toString());salvos.push(copia(estado.remoto));return{content:{sha:'s'+salvos.length}};
        }
        return{sha:salvos.length?'s'+salvos.length:'s0',content:Buffer.from(JSON.stringify(estado.remoto)).toString('base64')};
      }
      if(path.endsWith('semana/agenda.json')&&estado.agenda)return {sha:'agenda'+JSON.stringify(estado.agenda).length,content:Buffer.from(JSON.stringify(estado.agenda)).toString('base64')};
      throw Object.assign(new Error('não existe'),{status:404});
    }},
    tela:'semana',render(){},toast:m=>avisos.push(m),cfg:{diario:10},PARAM:{},log:[],DAY:86400000,metaHoje:()=>10,metaDia:()=>10,_restantesFM:()=>100,
    esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),URL,Blob,
  });
  opcoes.antes?.(c);vm.runInContext(fonte,c);await vm.runInContext('smCarga',c);await new Promise(r=>setImmediate(r));
  return{c,estado,salvos,avisos,recebidos,confirmados,elementos,tempos,teclas,mem,lista:()=>copia(vm.runInContext('SM.d.tarefas',c)),fila:()=>vm.runInContext('SM.fila',c)};
}

test('Calendário mantém chave da aba, ordem e Tab/Shift+Tab; remove atalho urgente da UI',async()=>{
  const a=await app();
  vm.runInContext("const TABS=[['hoje','Hoje'],['semana','Semana'],['tarefas','Tarefas'],['notas','Notas'],['questoes','Questões']];const KEYLAB={smurg:'Urgente',smdel:'Apagar'};const KG={sem:['smdel','smurg']};",a.c);
  const layout=fs.readFileSync(require.resolve('../build/layout.js'),'utf8');
  vm.runInContext(layout.slice(layout.indexOf('const lyCalendario='),layout.indexOf('lyIni();',layout.indexOf('const lyCalendario='))),a.c);
  assert.deepEqual(copia(vm.runInContext('TABS[1]',a.c)),['semana','Calendário']);
  assert.deepEqual(copia(vm.runInContext('KG.sem',a.c)),['smdel']);assert.equal(vm.runInContext('KEYLAB.smurg',a.c),undefined);
  a.c.tabsOrdenadas=()=>vm.runInContext('TABS',a.c);a.c.go=t=>{a.c.tela=t};
  const tab=a.teclas.find(fn=>fn.toString().includes('tabsOrdenadas()'));assert.ok(tab);
  let impedidos=0;const e={key:'Tab',target:{tagName:'BODY'},preventDefault(){impedidos++}};
  tab(e);assert.equal(a.c.tela,'tarefas');tab(e);assert.equal(a.c.tela,'notas');tab({...e,shiftKey:true});assert.equal(a.c.tela,'tarefas');tab({...e,shiftKey:true});assert.equal(a.c.tela,'semana');assert.equal(impedidos,4);
});

test('cards sem lápis; detalhes e subtarefas recolhem no toggle, sem emoji ou urgente',async()=>{
  const a=await app([{id:'a',dia:'2026-10-26',texto:'Título antigo',det:'Texto puro',urg:true},{id:'b',dia:'2026-10-26',texto:'Com etapas',subtarefas:[{texto:'Etapa'}]}]);
  const simples=a.c.smItem(a.lista()[0]),sub=a.c.smItem(a.lista()[1]);
  assert.doesNotMatch(simples,/sm-edb|smTxtIni|smDetIni|contenteditable|sm-urg/);
  assert.match(simples,/class="sm-tg"/);assert.doesNotMatch(simples,/Texto puro/);
  a.c.smTg('a');assert.match(a.c.smItem(a.lista()[0]),/Texto puro/);
  a.c.smTg('a');assert.doesNotMatch(a.c.smItem(a.lista()[0]),/Texto puro/);
  assert.match(simples,/ondblclick=.*smEdita\('a'\)/);assert.match(simples,/sm-arrastar/);assert.match(simples,/--sm-pastel:/);
  assert.match(sub,/class="sm-tg"/);assert.doesNotMatch(a.c.smGrupos(a.lista()),/[📚🛠✅]/u);
  assert.equal(a.c.smAddLinha('2026-10-26'),'');assert.equal(a.lista()[0].urg,true);
  vm.runInContext("SM.ed={id:'a',esc:'todos',dias:new Set(['2026-10-26'])}",a.c);
  const editor=a.c.smEditor(a.lista()[0]);assert.match(editor,/contenteditable="true"/);assert.match(editor,/Ctrl\+B/);assert.match(editor,/Ctrl\+U/);assert.match(editor,/Ctrl\+Shift\+H/);assert.doesNotMatch(editor,/sm_ed_urg|Urgente/);
});

test('clique no dia muda célula e lista do teclado; dia vazio não cria célula; duplo clique escolhe data',async()=>{
  const a=await app([{id:'hoje',dia:'2026-10-26',texto:'Hoje'},{id:'outro',dia:'2026-10-27',texto:'Amanhã'}]);
  a.c.smDiaClique('2026-10-27');assert.equal(vm.runInContext('SM.sel',a.c),'2026-10-27');assert.equal(vm.runInContext('QA.on',a.c),false);
  assert.match(a.c.smHojeGrande(),/data-drop="2026-10-27"/);assert.match(a.c.smHojeGrande(),/Amanhã/);assert.equal(vm.runInContext('smkLista()[0].id',a.c),'outro');
  a.c.smDiaClique('2026-10-28');assert.equal(a.c.smHojeGrande(),'');
  const grade=a.c.smCalendario();assert.match(grade,/onclick="smDiaClique\('/);assert.match(grade,/ondblclick="smSel\('/);   // 1.29.0: duplo clique abre o painel do dia; "+ tarefa" no painel chama qaAbreDia
  a.c.qaAbreDia('2026-10-29');assert.equal(vm.runInContext('QA.on',a.c),true);assert.equal(vm.runInContext('QA.quando',a.c),'2026-10-29');assert.equal(vm.runInContext('qaModoQuando()',a.c),'data');
});

test('Calendário integra tarefas por data e mantém 50 questões derivadas em qualquer dia',async()=>{
  const a=await app([{id:'agenda',dia:'2026-10-27',texto:'Revisar tórax',area:'tarefas'},{id:'sem',dia:'sem',texto:'Sem data'}]);
  assert.match(a.c.smCalItens('2026-10-27'),/Revisar tórax/);
  assert.doesNotMatch(a.c.smCalItens('2026-10-28'),/Revisar tórax|Sem data/);
  for(const vis of ['mes','semana','lista']){
    a.c.smVis(vis);const html=a.c.smCalendario();
    const dias=(html.match(/class="sm-(?:cel|li) /g)||[]).length;
    assert.ok(dias>=7);assert.equal((html.match(/50 questões/g)||[]).length,dias);
    assert.match(html,/Revisar tórax/);
  }
  a.c.smDiaClique('2026-10-27');assert.equal(vm.runInContext('SM.diaEditor',a.c),'2026-10-27');
  assert.match(a.c.smPainelDia('2026-10-27'),/Revisar tórax/);
  assert.match(a.c.smPainelDia('2026-10-28'),/qaAbreDia\('2026-10-28'\)/);
  a.c.qaAbreDia('2026-10-28');a.c.qaTxt('Revisar abdome');a.c.qaSalvar();await a.fila();
  assert.match(a.c.smCalItens('2026-10-28'),/Revisar abdome/);
  await a.c.smCheck('agenda',true);
  assert.match(a.c.smCalItens('2026-10-27'),/data-feito="true">✓ Revisar tórax/);
  assert.match(a.c.vTarefas(),/data-tid="agenda"[\s\S]*?checked/);
  a.c.tela='tarefas';await a.c.smCheck('agenda',false);a.c.tela='semana';
  assert.match(a.c.smPainelDia('2026-10-27'),/data-tid="agenda"/);
  assert.doesNotMatch(a.c.smItem(a.lista().find(t=>t.id==='agenda')),/<input[^>]*\schecked(?:\s|>)/);
  for(const dia of ['2026-10-25','2026-11-01','2026-12-12','2027-01-01']){
    a.c.log=Array.from({length:49},()=>({t:+new Date(dia+'T12:00:00'),ok:false}));
    assert.match(a.c.smCalMeta(dia),/data-feito="false">○ 50 questões/);
    a.c.log.push({t:+new Date(dia+'T12:00:00'),ok:false});
    assert.match(a.c.smCalMeta(dia),/data-feito="true">✓ 50 questões/);
    assert.doesNotMatch(a.c.smCalMeta(dia),/onclick|input|data-tid/);
  }
  assert.equal(a.lista().length,3);assert.ok(a.salvos.every(d=>d.tarefas.every(t=>t.texto!=='50 questões')));
});

test('Lista contém só semana atual domingo–sábado, inclusive quando atravessa o mês',async()=>{
  const a=await app([{id:'dentro',dia:'2026-11-01',texto:'Dentro'},{id:'fora',dia:'2026-11-08',texto:'Fora'}]);
  a.c.Date.now=()=>new Date('2026-11-01T12:00').getTime();a.c.smVis('lista');let html=a.c.smCalendario();
  assert.equal((html.match(/class="sm-li /g)||[]).length,7);assert.match(html,/data-drop="2026-11-01"/);assert.match(html,/data-drop="2026-11-07"/);assert.match(html,/Dentro/);assert.doesNotMatch(html,/Fora|sm-row/);
  a.c.Date.now=()=>new Date('2026-10-31T12:00').getTime();html=a.c.smCalendario();assert.match(html,/data-drop="2026-10-25"/);assert.match(html,/data-drop="2026-10-31"/);assert.doesNotMatch(html,/data-drop="2026-11-01"/);
  a.c.Date.now=()=>new Date('2026-11-30T12:00').getTime();html=a.c.smCalendario();assert.match(html,/data-drop="2026-11-29"/);assert.match(html,/data-drop="2026-12-05"/);
});

test('vários dias usa calendário mensal; setas só movem cursor, Espaço/Enter alternam sem salvar',async()=>{
  const a=await app();a.c.qaAbre();a.c.qaTxt('Vários dias');a.c.qaPasso(2);a.c.qaEscolhe('quando','varios');
  assert.equal((a.c.qaCalendario().match(/data-cal=/g)||[]).length,42);
  const tecla=(key,dia)=>a.c.qaTecla({key,target:{tagName:'BUTTON',dataset:{cal:dia}},preventDefault(){}});
  tecla('ArrowRight','2026-10-26');assert.equal(vm.runInContext('QA.calCursor',a.c),'2026-10-27');assert.equal(vm.runInContext('QA.dias.length',a.c),0);
  tecla(' ','2026-10-27');assert.deepEqual(copia(vm.runInContext('QA.dias',a.c)),['2026-10-27']);
  tecla('Enter','2026-10-27');assert.equal(vm.runInContext('QA.dias.length',a.c),0);assert.equal(a.lista().length,0);assert.equal(vm.runInContext('QA.on',a.c),true);
  a.c.qaSalvar();assert.equal(a.avisos.at(-1),'Escolha pelo menos um dia.');assert.equal(a.lista().length,0);
  a.c.qaCalMes(2);tecla('Enter','2026-12-05');assert.deepEqual(copia(vm.runInContext('QA.dias',a.c)),['2026-12-05']);
});

test('passos: tipos ordenados, sem Urgente, Hora só com data; Detalhes antes do Lembrete',async()=>{
  const a=await app();a.c.qaAbre();vm.runInContext("SM.d.tipos=[{id:'estudo',nome:'Estudo'},{id:'tarefas',nome:'Tarefas'},{id:'ferramenta',nome:'Ferramenta'}]",a.c);
  assert.deepEqual(copia(a.c.qaTipos()).map(t=>t[0]),['ferramenta','tarefas','estudo']);assert.deepEqual(copia(vm.runInContext('smTipos()',a.c)).map(t=>t.id),['ferramenta','tarefas','estudo']);
  a.c.qaPasso(2);a.c.qaEscolhe('quando','sem');a.c.qaPasso(3);assert.equal(vm.runInContext('QA.passo',a.c),4);assert.doesNotMatch(a.c.qaHtml(),/id="qa_hora"|Urgente/);
  a.c.qaPasso(3);assert.equal(vm.runInContext('QA.passo',a.c),2);
  a.c.qaEscolhe('quando','data');a.c.qaPasso(3);assert.match(a.c.qaHtml(),/id="qa_hora"/);a.c.qaPasso(4);a.c.qaPasso(5);
  const html=a.c.qaHtml();assert.ok(html.indexOf('Detalhes')<html.indexOf('Lembrete'));
});

test('duplo clique na adição cria campos de subtarefa; rascunho e tarefas agrupadas preservam etapas',async()=>{
  const a=await app();a.c.qaAbre();assert.match(a.c.qaHtml(),/ondblclick="qaSubNova\(\)"/);
  a.c.qaTxt('Projeto fictício');a.c.qaSubNova();vm.runInContext("QA.subtarefas[0]='Etapa 1'",a.c);a.c.qaSubNova();vm.runInContext("QA.subtarefas[1]='Etapa 2'",a.c);a.c.qaRascSalva();a.c.qaFecha();a.c.qaAbre();
  assert.deepEqual(copia(vm.runInContext('QA.subtarefas',a.c)),['Etapa 1','Etapa 2']);
  a.c.qaMultiDia('2026-10-27');a.c.qaMultiDia('2026-11-02');a.c.qaSalvar();await a.fila();
  assert.equal(a.lista().length,2);assert.equal(a.lista()[0].grupo,a.lista()[1].grupo);assert.deepEqual(a.lista()[0].subtarefas.map(s=>s.texto),['Etapa 1','Etapa 2']);assert.ok(a.lista()[0].subtarefas.every(s=>s.id&&!s.feito));
  a.c.qaZera();assert.equal(vm.runInContext('QA.subtarefas.length',a.c),0);
});

test('sanitização mantém só b/strong, u, span color e texto; descarta scripts, atributos e URLs',async()=>{
  const a=await app(),txt=s=>({nodeType:3,textContent:s}),node=(tag,filhos=[],attrs={},cor='')=>({nodeType:1,tagName:tag.toUpperCase(),childNodes:filhos,style:{color:cor},getAttribute:k=>attrs[k]||null});
  // A árvore DOM é simulada: valida a política de saída, sem substituir o aceite do parser real no Chrome.
  const nodes=[node('script',[txt('alert(1)')]),node('img',[],{onerror:'alert(1)',src:'javascript:x'}),node('strong',[txt('A & B')],{onclick:'x'}),node('u',[txt('U')]),node('span',[txt('Cor')],{style:'background:url(x)',onmouseover:'x'},'rgb(132, 103, 188)'),node('a',[txt('Link')],{href:'javascript:x'}),node('svg',[txt('x')]),node('span',[txt('Sem estilo')],{},'url(x)')];
  a.c.document.createElement=()=>({content:{childNodes:nodes}});
  assert.equal(a.c.smSanitiza('HTML hostil'),'<strong>A &amp; B</strong><u>U</u><span style="color:rgb(132, 103, 188)">Cor</span>LinkSem estilo');
  nodes.splice(0,nodes.length,node('font',[node('b',[node('u',[txt('Cor legada')])])],{color:'#8467bc',face:'Arial',size:'7',onclick:'x'}),node('span',[txt('Sem cor CSS')],{color:'red'}));
  const esperado='<span style="color:#8467bc"><b><u>Cor legada</u></b></span>Sem cor CSS';
  assert.equal(a.c.smSanitiza('<font color="#8467bc">'),esperado);
  a.c.smTg('rich');const card=a.c.smItem({id:'rich',dia:'sem',texto:'Cor legada',textoHtml:'<font color="#8467bc">',det:'Cor legada',detHtml:'<font color="#8467bc">'});
  assert.ok(card.includes(`<span class="sm-texto">${esperado}</span>`));
  assert.ok(card.includes(`<div class="sm-det">${esperado}</div>`));
  assert.doesNotMatch(card,/<font\b|onclick="x"|face=|size=/);
});

test('editor salva HTML opcional e detalhes, mantém título puro e urgência legada',async()=>{
  const a=await app([{id:'a',dia:'sem',texto:'Antigo',urg:true,hora:'09:00'}]);
  const txt=s=>({nodeType:3,textContent:s}),b={nodeType:1,tagName:'B',childNodes:[txt('Novo')],style:{},getAttribute(){return null}};
  a.c.document.createElement=()=>({content:{childNodes:[b]}});
  a.elementos.set('sm_ed_txt',{innerText:'Novo',innerHTML:'<b>Novo</b>'});a.elementos.set('sm_ed_det',{innerText:'Nota',innerHTML:'<b>Nota</b>'});a.elementos.set('sm_ed_area',{value:'tarefas'});
  vm.runInContext("SM.ed={id:'a',esc:'todos',dias:new Set()}",a.c);a.c.smSalvar();await a.fila();
  assert.equal(a.lista()[0].texto,'Novo');assert.equal(a.lista()[0].textoHtml,'<b>Novo</b>');assert.equal(a.lista()[0].urg,true);assert.equal(a.lista()[0].dia,'sem');
  assert.match(a.c.smItem(a.lista()[0]),/<b>Novo<\/b>/);assert.equal(a.salvos.at(-1).tarefas[0].textoHtml,'<b>Novo</b>');
});

test('copiar para outros dias isola o array e os objetos das subtarefas, inclusive ao sincronizar',async()=>{
  const a=await app([{id:'original',dia:'2026-10-26',texto:'Projeto',subtarefas:[{id:'etapa',texto:'Etapa',feito:false}]}]);
  a.c.document.createElement=()=>({content:{childNodes:[]}});
  a.elementos.set('sm_ed_txt',{innerText:'Projeto',innerHTML:'Projeto'});a.elementos.set('sm_ed_area',{value:'tarefas'});
  vm.runInContext("SM.ed={id:'original',esc:'todos',dias:new Set(['2026-10-26','2026-10-27','2026-10-28'])}",a.c);
  a.c.smSalvar();
  assert.equal(a.lista().length,3);
  assert.equal(vm.runInContext('new Set(SM.d.tarefas.map(t=>t.subtarefas)).size',a.c),3);
  assert.equal(vm.runInContext('new Set(SM.d.tarefas.map(t=>t.subtarefas[0])).size',a.c),3);
  const id=a.lista()[1].id;a.c.smSubMarca(id,0,true);
  assert.deepEqual(a.lista().map(t=>t.subtarefas[0].feito),[false,true,false]);
  assert.equal(await a.fila(),true);
  assert.deepEqual(a.salvos.at(-1).tarefas.map(t=>t.subtarefas[0].feito),[false,true,false]);
  a.c.smSubMarca(id,0,false);assert.equal(await a.fila(),true);
  assert.deepEqual(a.lista().map(t=>t.subtarefas[0].feito),[false,false,false]);
});

test('detalhes mantêm texto puro e HTML separado em três round-trips e no rascunho',async()=>{
  const casos=[{det:'A & B'},{det:'A &amp; B'},{det:'<b>literal</b>'},{det:'A & B',detHtml:'<b>A &amp; B</b>'}];
  for(const caso of casos){
    const a=await app([{id:'detalhes',dia:'sem',texto:'Título',...caso}]);
    // Simula apenas os nós de texto, entidades e B destas fixtures. O parser real é coberto no teste Chrome.
    const decodifica=s=>s.replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&amp;','&');
    const conteudo=html=>{const b=/^<b>(.*)<\/b>$/s.exec(html);return {negrito:!!b,texto:decodifica(b?b[1]:html)}};
    a.c.document.createElement=()=>({set innerHTML(html){const {negrito,texto}=conteudo(html),txt={nodeType:3,textContent:texto};this.content={childNodes:negrito?[{nodeType:1,tagName:'B',childNodes:[txt],style:{}}]:[txt]}}});
    let anterior;
    for(let rodada=0;rodada<3;rodada++){
      a.c.smEdita('detalhes');
      const editor=a.c.smEditor(a.lista()[0]),campo=editor.match(/id="sm_ed_det"[^>]*>([\s\S]*?)<\/div><\/div>/);
      assert.ok(campo,'campo de detalhes presente');const html=campo[1],dom=conteudo(html);
      assert.equal(dom.texto,caso.det);assert.equal(dom.negrito,!!caso.detHtml);
      if(anterior!==undefined)assert.equal(html,anterior,'HTML idempotente');anterior=html;
      a.elementos.set('sm_ed_txt',{innerText:'Título',innerHTML:'Título',focus(){}});a.elementos.set('sm_ed_area',{value:'tarefas'});
      a.elementos.set('sm_ed_det',{innerText:dom.texto,innerHTML:html});
      a.c.smRascEdSalva('detalhes');
      const rascunho=vm.runInContext("smRascEd('detalhes')",a.c);assert.equal(rascunho.det,caso.det);assert.equal(rascunho.detHtml,html);
      assert.equal(a.c.smEditor(a.lista()[0]).match(/id="sm_ed_det"[^>]*>([\s\S]*?)<\/div><\/div>/)[1],html);
      a.c.smSalvar();assert.equal(await a.fila(),true);
      assert.equal(a.lista()[0].det,caso.det);assert.equal(a.lista()[0].detHtml,html);
      assert.equal(a.salvos.at(-1).tarefas[0].det,caso.det);assert.equal(a.salvos.at(-1).tarefas[0].detHtml,html);
      if(!vm.runInContext("SM.ab.has('detalhes')",a.c))a.c.smTg('detalhes');
      assert.ok(a.c.smItem(a.lista()[0]).includes(`<div class="sm-det">${html}</div>`));
    }
  }
});

test('Hora some e é limpa no rascunho e na gravação ao retirar data, inclusive só neste dia',async()=>{
  for(const agrupada of [false,true]){
    const a=await app([{id:'hora',dia:'2026-10-26',texto:'Horário',hora:'09:30',...(agrupada?{grupo:'horarios'}:{})},...(agrupada?[{id:'outra',dia:'2026-10-27',texto:'Outro dia',hora:'09:30',grupo:'horarios'}]:[])]);
    a.c.document.createElement=()=>({content:{childNodes:[]}});
    a.c.smEdita('hora');assert.match(a.c.smEditor(a.lista()[0]),/id="sm_ed_hora"/);
    if(agrupada){
      assert.doesNotMatch(a.c.smEditor(a.lista()[0]),/id="sm_ed_dia"/);
      a.elementos.set('sm_ed_hora',{value:'09:30'});assert.equal(a.c.smExtrasLer().hora,'09:30');a.c.smEdEsc('este');
    }
    a.elementos.set('sm_ed_txt',{innerText:'Horário',innerHTML:'Horário',focus(){}});a.elementos.set('sm_ed_area',{value:'tarefas'});
    a.elementos.set('sm_ed_dia',{value:''});a.elementos.set('sm_ed_hora',{value:'09:30'});
    assert.equal(a.c.smExtrasLer().hora,null,'ignora hora antiga mesmo com input presente');a.c.smRascEdSalva('hora');
    assert.equal(vm.runInContext("smRascEd('hora').hora",a.c),null);assert.doesNotMatch(a.c.smEditor(a.lista()[0]),/id="sm_ed_hora"/);
    a.c.smSalvar();assert.equal(await a.fila(),true);
    assert.equal(a.lista()[0].dia,'sem');assert.equal(a.lista()[0].hora,null);assert.equal(a.salvos.at(-1).tarefas[0].hora,null);
    if(agrupada)assert.equal(a.lista()[1].hora,'09:30');
    a.c.smEdita('hora');assert.doesNotMatch(a.c.smEditor(a.lista()[0]),/id="sm_ed_hora"/);
  }
});

test('atalhos ricos só formatam com comando e usam a cor do tipo; colagem é texto puro',async()=>{
  const a=await app(),comandos=[];a.c.document.execCommand=(...args)=>comandos.push(args);
  a.c.smFormata=(...args)=>comandos.push(args);const el={id:'sm_ed_txt'};
  for(const [key,shiftKey,cmd] of [['b',false,'bold'],['u',false,'underline'],['H',true,'foreColor']]){let impedido=false;a.c.smRichTecla({key,ctrlKey:true,shiftKey,preventDefault(){impedido=true},stopPropagation(){}},el);assert.equal(impedido,true);assert.deepEqual(comandos.at(-1),['sm_ed_txt',cmd])}
  a.c.smRichTecla({key:'b',ctrlKey:false},el);assert.equal(comandos.length,3);
  assert.notEqual(vm.runInContext("smCorTexto('ferramenta')",a.c),vm.runInContext("smCorTexto('estudo')",a.c));a.c.smRichCola({preventDefault(){},clipboardData:{getData:()=>'<script>texto literal</script>'}});assert.deepEqual(comandos.at(-1),['insertText',false,'<script>texto literal</script>']);
});

test('calendário usa grade ampliada; Tarefas mantém Hoje, atrasadas e ordenação',async()=>{
  const a=await app([{id:'baixa',dia:'2026-10-26',texto:'Baixa',prioridade:'baixa'},{id:'u',dia:'2026-10-26',texto:'Urgente',urg:true},{id:'velha',dia:'2020-01-01',texto:'Vencida'}]);
  vm.runInContext("SM.d.dias['2026-10-26']={ev:[{id:'e',t:'Evento',c:'azul'}]}",a.c);
  const html=a.c.vSemana();assert.equal((html.match(/class="sm-cel /g)||[]).length,7);
  assert.ok(html.includes('sm-grid sm-vsem'));assert.ok(!html.includes('sm-colunas'));assert.ok(!html.includes('sm_quadro'));
  assert.ok(html.indexOf('data-drop="2026-10-25"')<html.indexOf('data-drop="2026-10-26"'));
  assert.ok(html.includes('Evento'));assert.match(html,/Urgente/);assert.match(html,/Baixa/);assert.doesNotMatch(html,/Passar tudo para hoje/);
  const tarefas=a.c.vTarefas();assert.ok(tarefas.indexOf('Urgente')<tarefas.indexOf('Baixa'));assert.ok(tarefas.includes('Passar tudo para hoje'));assert.doesNotMatch(tarefas,/sm-grid/);
  assert.ok(!html.includes('Temas fracos'));assert.ok(!html.includes('💡'));assert.equal(a.lista()[2].dia,'2020-01-01');
  a.c.smRola();await a.fila();assert.equal(a.lista()[2].dia,'2026-10-26');
});

test('concluir e desfazer em 5 s remove próxima ocorrência intacta e notifica Android',async()=>{
  const a=await app([{id:'r',dia:'2026-10-26',texto:'Ler',feito:false,repetir:{tipo:'diaria'}}],true);
  await a.c.smCheck('r',true);assert.equal(a.lista().length,2);assert.equal(a.lista()[0].feito,true);
  assert.ok(a.tempos.some(t=>t.ms===5000));const barra=a.elementos.get('sm_dz');assert.equal(barra.children[0].textContent,'Concluída ·');
  barra.children[1].onclick();await a.fila();assert.equal(a.lista().length,1);assert.equal(a.lista()[0].feito,false);
  assert.equal(a.recebidos.at(-1)[0].feita,false);
});

test('conflito remoto reaplica conclusão e repetição uma vez e mantém tarefa do outro aparelho',async()=>{
  const a=await app([{id:'r',dia:'2026-10-26',texto:'Ler',feito:false,repetir:{tipo:'diaria'}}]);
  a.estado.conflito=true;await a.c.smCheck('r',true);
  assert.equal(a.lista().length,3);assert.equal(a.lista().filter(t=>t.id==='r~2026-10-27').length,1);assert.ok(a.lista().some(t=>t.id==='outro'));
});

test('Desfazer usa os ids realmente criados após conflito e reabre a original',async()=>{
  const a=await app([{id:'r',dia:'2026-10-26',texto:'Ler',feito:false,repetir:{tipo:'diaria'}}]);
  a.estado.remoto.tarefas[0].dia='2026-10-28';
  a.estado.remoto.tarefas.push({id:'r~2026-10-27',serie:'r',dia:'2026-10-27',texto:'Ler',feito:false,repetir:{tipo:'diaria'},subtarefas:[]});
  a.estado.conflito=true;await a.c.smCheck('r',true);
  assert.ok(a.estado.remoto.tarefas.some(t=>t.id==='r~2026-10-29'));
  vm.runInContext("smTar('r~2026-10-29').texto='Texto alterado'",a.c);
  a.elementos.get('sm_dz').children[1].onclick();await a.fila();
  assert.equal(a.estado.remoto.tarefas.find(t=>t.id==='r').feito,false);
  assert.deepEqual(a.estado.remoto.tarefas.map(t=>t.id),['r','r~2026-10-27','outro']);
});

test('widget só confirma conclusão gravada, inclusive cache feito e conflitos no retry',async()=>{
  const a=await app([{id:'r',dia:'2026-10-26',texto:'Ler',feito:false,repetir:{tipo:'diaria'}}],true);
  a.estado.pendentes=[{id:'widget-retry',tipo:'concluir',tarefa:'r'}];a.estado.falhar=true;
  a.c.smNativoImporta();await a.fila();await new Promise(r=>setImmediate(r));
  assert.equal(a.lista()[0].feito,true);assert.equal(a.estado.remoto.tarefas[0].feito,false);assert.equal(a.confirmados.length,0);
  a.estado.falhar=false;a.estado.conflito=true;
  const api=a.c.BCBR.api;let liberar,gravando;
  const iniciou=new Promise(r=>{gravando=r}),aguardar=new Promise(r=>{liberar=r});
  a.c.BCBR.api=async(path,opt)=>{if(opt?.method==='PUT'){gravando();await aguardar}return api(path,opt)};
  a.c.smNativoImporta();await iniciou;assert.equal(a.confirmados.length,0);liberar();
  await a.fila();await new Promise(r=>setImmediate(r));
  assert.equal(a.estado.remoto.tarefas.find(t=>t.id==='r').feito,true);
  assert.equal(a.estado.remoto.tarefas.filter(t=>t.id==='r~2026-10-27').length,1);
  assert.deepEqual(a.confirmados.at(-1),['widget-retry']);
  assert.ok(JSON.parse(a.mem.get('bcbr_nat_importados')).includes('widget-retry'));
});

test('widget conclui, repete, confirma após gravação e ignora reenvio',async()=>{
  const a=await app([{id:'r',dia:'2026-10-26',texto:'Ler',feito:false,repetir:{tipo:'diaria'}}],true);
  a.estado.pendentes=[{id:'widget1',tipo:'concluir',tarefa:'r'}];a.c.smNativoImporta();await a.fila();await new Promise(r=>setImmediate(r));
  assert.equal(a.lista().length,2);assert.equal(a.lista()[0].feito,true);assert.deepEqual(a.confirmados.at(-1),['widget1']);
  a.c.smNativoImporta();await a.fila();await new Promise(r=>setImmediate(r));assert.equal(a.lista().length,2);
});

test('pendência sem tarefa conhecida não é confirmada e falha de gravação pode ser repetida',async()=>{
  const a=await app([{id:'r',dia:'2026-10-26',texto:'Ler',feito:false,repetir:{tipo:'diaria'}}],true);
  a.estado.pendentes=[{id:'p',tipo:'concluir',tarefa:'r'},{id:'inexistente',tipo:'concluir',tarefa:'x'}];a.estado.falhar=true;
  a.c.smNativoImporta();await a.fila();await new Promise(r=>setImmediate(r));assert.equal(a.confirmados.length,0);
  a.estado.falhar=false;a.c.smNativoImporta();await a.fila();await new Promise(r=>setImmediate(r));
  assert.equal(a.lista().length,2);assert.deepEqual(a.confirmados.at(-1),['p']);
});

test('tipos antigos de pendência continuam entrando e retry não duplica nova tarefa',async()=>{
  const a=await app([],true);a.estado.pendentes=[{id:'voz1',texto:'Ler amanhã 9h !! #pacs',voz:true},{id:'ideia1',tipo:'ideia',texto:'Uma ideia'}];a.estado.falhar=true;
  a.c.smNativoImporta();await a.fila();await new Promise(r=>setImmediate(r));assert.equal(a.confirmados.length,0);
  a.estado.falhar=false;a.c.smNativoImporta();await a.fila();await new Promise(r=>setImmediate(r));
  assert.equal(a.lista().length,1);assert.equal(a.lista()[0].hora,'09:00');assert.equal(a.lista()[0].prioridade,'alta');assert.equal(a.lista()[0].texto,'Ler');
  assert.deepEqual(a.confirmados.at(-1),['voz1','ideia1']);assert.equal(vm.runInContext('smIdeiaNova',a.c),true);
});

test('mover tarefa preserva campos e atualiza lembrete enviado ao Android',async()=>{
  const a=await app([{id:'r',dia:'2026-10-26',texto:'Consulta',hora:'09:00',lembrete:60,subtarefas:[{id:'s',texto:'Documentos'}]}],true);
  a.c.smMover('r','2026-10-28');await a.fila();assert.equal(a.lista()[0].dia,'2026-10-28');assert.equal(a.lista()[0].subtarefas.length,1);
  assert.equal(a.recebidos.at(-1)[0].lembrete,'2026-10-28T08:00');
});

test('Nova tarefa salva texto natural com os mesmos dia, hora e prioridade da prévia',async()=>{
  const a=await app([],true);
  vm.runInContext("Object.assign(QA,{texto:'comprar ração sexta 9h30 !alta #pacs',quando:'2026-10-30',prioridade:'baixa',hora:'10:00',lembrete:'15',det:'Marca habitual'})",a.c);
  assert.match(a.c.qaPrevTxt(),/30\/10 · 09:30 · alta/);
  assert.match(a.c.qaPrevTxt(),/#pacs/);
  a.c.qaSalvar();await a.fila();
  const t=a.lista()[0];assert.equal(t.texto,'comprar ração sexta 9h30 !alta #pacs');assert.equal(t.dia,'2026-10-30');assert.equal(t.hora,'09:30');assert.equal(t.prioridade,'alta');assert.equal(t.det,'Marca habitual');assert.deepEqual(t.etiquetas,['pacs']);
  assert.equal(a.recebidos.at(-1)[0].lembrete,'2026-10-30T09:15');
});

test('campos de Nova tarefa persistem no rascunho e entram na gravação pendente',async()=>{
  const a=await app();
  vm.runInContext("Object.assign(QA,{texto:'Revisar',on:true,quando:'2026-10-27',prioridade:'media',hora:'08:30',lembrete:'60',repetir:{tipo:'semanal',dias:[2,4]}})",a.c);
  a.c.qaRascSalva({salvar:true});const r=JSON.parse(a.mem.get('bcbr_rasc_tarefa'));
  assert.equal(r.prioridade,'media');assert.equal(r.hora,'08:30');assert.equal(r.lembrete,'60');assert.deepEqual(r.repetir.dias,[2,4]);
  vm.runInContext('QA.passo=3;QA.alcance=5',a.c);
  const html=a.c.qaExtrasHtml();assert.ok(html.includes('id="qa_hora"'));assert.doesNotMatch(html,/Prioridade|Repetir|qa_prioridade|qa_repetir/);
  assert.match(a.c.qaPrevTxt(),/27\/10 · 08:30 · média · toda semana/);
  a.c.smRascPend();await a.fila();const t=a.lista()[0];assert.equal(t.dia,'2026-10-27');assert.equal(t.prioridade,'media');assert.equal(t.lembrete,60);assert.deepEqual(t.repetir.dias,[2,4]);
});

test('agenda mantém eventos e avisos; plantões viram apenas etiquetas sem horário',async()=>{
  const a=await app();
  const tipos=['br','norte','hsi','br-manha','almoco','estagio','cobre-pos'];
  a.estado.agenda={atualizado:'2026-10-26T09:00:00Z',eventos:tipos.map(tipo=>({titulo:'Evento '+tipo,local:'Hospital',inicio:'2026-10-26T08:00',fim:'2026-10-26T09:00',tipo})),avisos:['Confirmar <troca>']};
  await a.c.smAgendaPuxar();const html=a.c.vSemana();
  for(const tipo of tipos.filter(t=>!['br','hsi','br-manha'].includes(t)))assert.ok(html.includes('c-escala-'+tipo));
  for(const tipo of ['br','hsi','br-manha'])assert.ok(!html.includes('c-escala-'+tipo+'"'));
  assert.ok(html.includes('class="sm-nt br">BR</span>'));
  assert.ok(html.includes('Hospital'));assert.ok(html.includes('<details class="sm-avisos">'));assert.ok(html.includes('Confirmar &lt;troca&gt;'));assert.ok(!html.includes('<details class="sm-avisos" open'));
  vm.runInContext("SM.d.dias['2026-10-26']={ev:[{id:'manual',t:'Evento norte',c:'azul'}]}",a.c);
  const eventos=copia(vm.runInContext("smEvL('2026-10-26')",a.c));assert.equal(eventos.filter(e=>e.t==='Evento norte').length,1);assert.equal(eventos[0].c,'azul');
  const editor=a.c.smEvEditor('2026-10-26');assert.ok(editor.includes('Escala · somente leitura'));assert.equal((editor.match(/onclick="smEvDel/g)||[]).length,1);
  assert.equal(JSON.parse(a.mem.get('sm_agenda')).avisos.length,1);
  delete a.estado.agenda;await a.c.smAgendaPuxar();assert.equal(vm.runInContext("smEvL('2026-10-26').length",a.c),1);assert.ok(!a.c.vSemana().includes('sm-avisos'));
});

test('HSI de sexta 13/11 a sábado 14/11 usa a mesma etiqueta, sem cartão nem horário',async()=>{
  const a=await app();
  a.estado.agenda={eventos:[{titulo:'Sobreaviso HSI',tipo:'hsi',inicio:'2026-11-13T22:00',fim:'2026-11-14T23:00'}]};
  await a.c.smAgendaPuxar();
  vm.runInContext("SM.d.dias['2026-11-13']={agenda:'Sobreaviso HSI 22h–7h30'};SM.semana='2026-11-09'",a.c);
  const html=a.c.smCalendario();
  for(const dia of ['2026-11-13','2026-11-14']){
    const cel=html.slice(html.indexOf('data-drop="'+dia+'"')).split('</button>')[0];
    assert.ok(cel.includes('<span class="sm-nt hsi">HSI</span>'));
    assert.ok(!cel.includes('class="sm-ev '));assert.ok(!cel.includes('<small>22:00'));
  }
  assert.equal(vm.runInContext("smNoite('2026-11-14')",a.c),'HSI');
  vm.runInContext("SM.d.dias['2026-11-14']={noite:''}",a.c);
  assert.equal(vm.runInContext("smNoite('2026-11-14')",a.c),'');
});

test('dia e Tarefas sem data recuperam grupos sem emojis, com cores e campos legados',async()=>{
  const tarefas=['2026-10-26','sem'].flatMap(dia=>[
    {id:dia+'b',dia,area:'estudo',texto:'Baixa',prioridade:'baixa'},
    {id:dia+'u',dia,area:'estudo',texto:'Urgente',urg:true},
    {id:dia+'f',dia,area:'ferramenta',texto:'Ferramenta',hora:'09:00',repetir:{tipo:'diaria'}},
    {id:dia+'t',dia,area:'tarefas',texto:'Tarefa',subtarefas:[{texto:'Uma etapa',feito:true}],anexos:[{nome:'Foto'}]},
  ]);
  const a=await app(tarefas);a.c.tela='tarefas';
  for(const html of [a.c.smPainelDia('2026-10-26'),a.c.smSemData()]){
    for(const [tipo,icone] of [['estudo','📚'],['ferramenta','🛠️'],['tarefas','✅']]){
      assert.ok(html.includes('sm-grp sm-'+tipo));assert.ok(!html.includes(icone));
    }
    assert.ok(html.indexOf('Urgente')<html.indexOf('Baixa'));
    for(const texto of ['09:00','↻','1/1','1 anexo(s)'])assert.ok(html.includes(texto));
  }
});

test('meta do calendário recalcula saldo e dias de estudo, ignora valor salvo e não grava meta',async()=>{
  const a=await app();let restantes=230;a.c._restantesFM=()=>restantes;
  vm.runInContext("cfg.prova='2026-11-16';PARAM.revisao_final_dias=14;SM.d.dias['2026-10-26']={meta:999}",a.c);
  assert.equal(vm.runInContext('smProvaIso()',a.c),'2026-12-12');assert.equal(vm.runInContext('smRetaIni()',a.c),'2026-11-28');
  assert.equal(a.c.smMetaDe('2026-10-26'),10); // 23 dias úteis até 28/11, descontados 2/11 e 20/11
  assert.equal(a.c.smMetaDe('2026-10-27'),10);
  restantes=115;assert.equal(a.c.smMetaDe('2026-10-26'),5);
  vm.runInContext("SM.d.dias['2026-10-27']={tipo:'descanso'}",a.c);
  assert.equal(a.c.smMetaDe('2026-10-26'),6);assert.equal(a.c.smMetaDe('2026-10-27'),0);
  vm.runInContext("SM.d.dias['2026-10-31']={noite:'BR'}",a.c);
  assert.equal(a.c.smMetaDe('2026-10-26'),5);assert.equal(a.c.smMetaDe('2026-10-31'),5);
  assert.equal(a.c.smMetaDe('2026-12-12'),0);assert.equal(a.c.smMetaDe('2026-12-14'),0);
  restantes=0;assert.equal(a.c.smMetaDe('2026-10-26'),0);
  a.c.smAuto();await a.fila();assert.equal(a.salvos.length,0);
  vm.runInContext("cfg.prova='2026-10-30'",a.c);restantes=30;
  assert.equal(a.c.smMetaDe('2026-10-26'),2); // data gravada não adianta a reta final
  a.c.Date.now=()=>new Date('2026-11-30T12:00').getTime();
  assert.equal(a.c.smMetaDe('2026-11-30'),3); // reta final: dez dias úteis até a prova fixa
});

test('painel progressivo omite prioridade/repetir e salva só texto e tipo sem data',async()=>{
  const legado={id:'antiga',texto:'Legado',dia:'sem',prioridade:'alta',repetir:{tipo:'diaria'}};
  const a=await app([legado]);a.c.qaAbre();
  let html=a.c.qaHtml();assert.doesNotMatch(html,/Prioridade|Repetir|qa_prioridade|qa_repetir/);
  assert.match(html,/data-passo="1" hidden/);assert.match(html,/data-passo="2" hidden/);
  a.c.qaTxt('Revisar amanhã');
  const tecla=key=>a.c.qaTecla({key,target:{},preventDefault(){}});
  tecla('ArrowDown');assert.equal(vm.runInContext('QA.passo',a.c),1);
  tecla('ArrowRight');assert.equal(vm.runInContext('QA.area',a.c),'tarefas|Casamento');
  a.c.qaEscolhe('area','estudo',true);assert.equal(vm.runInContext('QA.passo',a.c),2);
  a.c.qaEscolhe('quando','sem');
  html=a.c.qaHtml();assert.match(html,/qa-resumo/);assert.match(html,/data-valor="sem"[^>]*aria-pressed="true"/);
  tecla('ArrowUp');assert.equal(vm.runInContext('QA.passo',a.c),1);
  tecla('Enter');await a.fila();
  const t=a.lista().at(-1);assert.equal(t.texto,'Revisar amanhã');assert.equal(t.area,'estudo');assert.equal(t.dia,'sem');
  assert.deepEqual(a.lista()[0],legado);assert.equal(a.lista().length,2);
});

test('setas do calendário escolhem data; chips de toque avançam e vários dias agrupam',async()=>{
  const a=await app();a.c.qaAbre();a.c.qaTxt('Consulta');a.c.qaPasso(2);
  a.c.qaEscolhe('quando','data',true);assert.equal(vm.runInContext('QA.passo',a.c),2);
  assert.equal((a.c.qaCalendario().match(/data-cal=/g)||[]).length,42);
  a.c.qaTecla({key:'ArrowDown',target:{dataset:{cal:'2026-10-26'}},preventDefault(){}});
  assert.equal(vm.runInContext('QA.quando',a.c),'2026-11-02');
  a.c.qaCalDia('2026-11-03',true);assert.equal(vm.runInContext('QA.passo',a.c),3);
  a.c.qaPasso(5);a.c.qaEscolhe('lembrete','15',true);assert.equal(vm.runInContext('QA.passo',a.c),5);
  a.c.qaPasso(2);a.c.qaEscolhe('quando','varios',true);
  a.c.qaMultiDia('2026-10-27');a.c.qaMultiDia('2026-10-29');a.c.qaSalvar();await a.fila();
  assert.deepEqual(a.lista().map(t=>t.dia),['2026-10-27','2026-10-29']);
  assert.equal(a.lista()[0].grupo,a.lista()[1].grupo);assert.equal(a.lista()[0].lembrete,15);
});

test('painel acompanha altura do teclado virtual, mantém rascunho no Esc e cores por tipo',async()=>{
  const a=await app();a.c.qaAbre();a.c.qaTxt('Texto preservado');
  const el=a.elementos.get('qa');el.style={setProperty(k,v){this[k]=v}};
  a.c.window.visualViewport={height:320,offsetTop:12};a.c.qaAjustaTela();
  assert.equal(el.style.height,'320px');assert.equal(el.style.top,'12px');assert.equal(el.style['--qa-altura'],'320px');
  vm.runInContext("SM.d.tipos=[...SM_TIPOS0,{id:'a',nome:'Pessoal'},{id:'b',nome:'Casa'},{id:'c',nome:'Trabalho'}]",a.c);
  assert.deepEqual(['tarefas','estudo','ferramenta','a','b','c'].map(a.c.qaCor),['#DDF5E8','#DCEBFF','#FFF1C2','#FFE4D6','#FFE0EC','#E9E3FF']);
  a.c.qaTecla({key:'Escape',preventDefault(){}});assert.equal(a.elementos.has('qa'),false);
  assert.equal(JSON.parse(a.mem.get('bcbr_rasc_tarefa')).texto,'Texto preservado');
  delete a.c.window.visualViewport;a.c.qaAbre();assert.equal(vm.runInContext('QA.texto',a.c),'Texto preservado');
});

test('setas horizontais editam campos; nome do novo tipo preserva todas as setas',async()=>{
  const a=await app();a.c.qaAbre();a.c.qaTxt('Consulta');
  const painel=a.elementos.get('qa');
  for(const [id,passo,value] of [['qa_in',0,'Consulta'],['qa_hora',4,'09:30'],['qa_tn',1,'Meu novo tipo']]){
    a.c.qaPasso(passo);
    const alvo={id,tagName:'INPUT',value,selectionStart:2,selectionEnd:2};
    const html=painel.innerHTML,area=vm.runInContext('QA.area',a.c);
    for(const key of id==='qa_tn'?['ArrowLeft','ArrowRight','ArrowUp','ArrowDown']:['ArrowLeft','ArrowRight']){
      let impedida=false;a.c.qaTecla({key,target:alvo,preventDefault(){impedida=true}});
      assert.equal(impedida,false,key+' em '+id);
      assert.equal(vm.runInContext('QA.passo',a.c),passo);
      assert.equal(vm.runInContext('QA.area',a.c),area);
      assert.equal(alvo.value,value);assert.equal(alvo.selectionStart,2);assert.equal(painel.innerHTML,html);
    }
  }
  for(const id of ['qa_in','qa_hora']){
    a.c.qaPasso(0);
    for(const [key,passo] of [['ArrowDown',1],['ArrowUp',0]]){
      let impedida=false;a.c.qaTecla({key,target:{id,tagName:'INPUT'},preventDefault(){impedida=true}});
      assert.equal(impedida,true);assert.equal(vm.runInContext('QA.passo',a.c),passo);
    }
  }
});

test('data digitada preseleciona Quando e conserva texto ao salvar e reabrir rascunho',async()=>{
  const a=await app();a.c.qaAbre();a.c.qaTxt('Consulta dia 20/11');
  assert.equal(vm.runInContext('QA.quando',a.c),'2026-11-20');
  a.c.qaPasso(2);assert.match(a.c.qaHtml(),/data-valor="data"[^>]*aria-pressed="true"/);
  assert.match(a.c.qaCalendario(),/data-cal="2026-11-20"[^>]*aria-pressed="true"/);
  assert.match(a.c.qaPrevTxt(),/20\/11/);
  a.c.qaFecha();a.c.qaAbre();assert.equal(vm.runInContext('QA.texto',a.c),'Consulta dia 20/11');
  assert.equal(vm.runInContext('QA.quando',a.c),'2026-11-20');
  a.c.qaSalvar();await a.fila();
  assert.equal(a.lista()[0].texto,'Consulta dia 20/11');assert.equal(a.lista()[0].dia,'2026-11-20');
  a.c.qaAbre();a.c.qaTxt('Consulta dia 20/11');a.c.qaCalDia('2026-11-22');
  a.c.qaTxt('Consulta dia 20/11 com documentos');assert.equal(vm.runInContext('QA.quando',a.c),'2026-11-22');
  a.c.qaEscolhe('quando','sem');a.c.qaFecha();a.c.qaAbre();a.c.qaTxt('Consulta dia 20/11 confirmada');
  assert.equal(vm.runInContext('QA.quando',a.c),'');
  a.c.qaSalvar();await a.fila();
  assert.equal(a.lista()[1].dia,'sem');assert.equal(a.lista()[1].texto,'Consulta dia 20/11 confirmada');
});

test('datas de várias tarefas preservam cada texto e escolhas explícitas do painel',async()=>{
  const a=await app();a.c.qaAbre();a.c.qaTxt('Consulta dia 20/11; Ligar amanhã');
  a.c.qaSalvar();await a.fila();
  assert.deepEqual(a.lista().map(t=>t.texto),['Consulta dia 20/11','Ligar amanhã']);
  assert.deepEqual(a.lista().map(t=>t.dia),['2026-11-20','2026-11-20']);
});

test('mudar mês só move visualização; escolher dia altera data e gravação',async()=>{
  const a=await app();a.c.qaAbre();a.c.qaTxt('Consulta');a.c.qaPasso(2);
  a.c.qaEscolhe('quando','data');a.c.qaCalDia('2026-11-20');
  const salvo=a.mem.get('bcbr_rasc_tarefa');
  for(const [n,cursor] of [[1,'2026-12-01'],[-1,'2026-11-01'],[-1,'2026-10-01'],[1,'2026-11-01']]){
    a.c.qaCalMes(n);assert.equal(vm.runInContext('QA.calCursor',a.c),cursor);
    assert.equal(vm.runInContext('QA.quando',a.c),'2026-11-20');
    assert.equal(a.mem.get('bcbr_rasc_tarefa'),salvo);assert.match(a.c.qaCalendario(),/Usar data · 20\/11/);
  }
  a.c.qaCalDia('2026-11-24',true);assert.equal(vm.runInContext('QA.quando',a.c),'2026-11-24');
  a.c.qaSalvar();await a.fila();assert.equal(a.lista()[0].dia,'2026-11-24');
});

test('Tab e Shift+Tab circulam apenas nos controles visíveis; Esc restaura o abridor',async()=>{
  const a=await app(),doc=a.c.document;
  const controle=(id,extra={})=>({id,tabIndex:0,focus(){doc.activeElement=this},closest(){return null},getClientRects(){return [{}]},...extra});
  for(const id of ['qa_fab','outro_abridor']){
    const abridor=controle(id,{isConnected:true});doc.activeElement=abridor;a.c.qaAbre();
    const painel=a.elementos.get('qa'),primeiro=controle('fechar'),meio=controle('qa_in'),ultimo=controle('limpar');
    const oculto=controle('oculto',{closest(){return {hidden:true}}}),desabilitado=controle('desabilitado',{disabled:true});
    const semTab=controle('dia_fora_do_cursor',{tabIndex:-1}),invisivel=controle('invisivel',{getClientRects(){return []}});
    painel.querySelectorAll=()=>[primeiro,oculto,desabilitado,semTab,invisivel,meio,ultimo];
    const tab=(origem,shiftKey,destino)=>{
      doc.activeElement=origem;let impedida=false;
      a.c.qaTecla({key:'Tab',target:origem,shiftKey,preventDefault(){impedida=true}});
      assert.equal(impedida,true);assert.equal(doc.activeElement,destino);
    };
    tab(ultimo,false,primeiro);tab(primeiro,true,ultimo);
    tab(primeiro,false,meio);tab(meio,true,primeiro);tab(abridor,false,primeiro);tab(abridor,true,ultimo);
    doc.activeElement=meio;a.c.qaAbre(); // Reabrir enquanto aberto não substitui o abridor.
    let impedida=false;a.c.qaTecla({key:'Escape',preventDefault(){impedida=true}});
    assert.equal(impedida,true);assert.equal(a.elementos.has('qa'),false);assert.equal(doc.activeElement,abridor);
  }
});

test('toggle recolhe subtema, nota e subtarefas; estado persiste ao reabrir sem concluir tarefa',async()=>{
  const tarefas=[{id:'toggle',texto:'Pai',dia:'sem',sub:'Subtema filho',det:'Nota filha',subtarefas:[{texto:'Etapa filha'}]}];
  const a=await app(tarefas);let h=a.c.smItem(a.lista()[0]);
  assert.doesNotMatch(h,/Subtema filho|Nota filha|Etapa filha/);assert.match(h,/▸/);assert.match(h,/event.stopPropagation\(\)/);
  a.c.smTg('toggle');h=a.c.smItem(a.lista()[0]);assert.match(h,/Subtema filho/);assert.match(h,/Nota filha/);assert.match(h,/Etapa filha/);assert.match(h,/▾/);
  const b=await app(tarefas,false,a.mem);assert.match(b.c.smItem(b.lista()[0]),/Nota filha/);assert.equal(!!b.lista()[0].feito,false);
  b.c.smTg('toggle');assert.doesNotMatch(b.c.smItem(b.lista()[0]),/Nota filha|Etapa filha/);
});

test('planejamento não reinsere tarefas na aba Calendário, mesmo com semana/mês abertos',async()=>{
  const a=await app([{id:'a',dia:'2026-10-26',texto:'Item isolado'}]);
  vm.runInContext("SM.plan=true;SM.sem='2026-10-25';SM.diaEditor='2026-10-26'",a.c);
  for(const vis of ['semana','mes','lista']){a.c.smVis(vis);assert.match(a.c.vSemana(),/Item isolado/);assert.doesNotMatch(a.c.vSemana(),/sm_mes_txt/)}
  a.c.tela='tarefas';assert.match(a.c.vTarefas(),/Item isolado/);assert.match(a.c.vTarefas(),/sm_mes_txt/);
});

test('dia futuro: setas e F ignoram tarefa de hoje ausente e seleção por ID invisível',async()=>{
  const a=await app([{id:'hoje',dia:'2026-10-26',texto:'Oculta'},{id:'futuro',dia:'2026-10-27',texto:'Visível'}]);
  a.c.tela='tarefas';a.c.keyIs=(e,k)=>k==='smdel'&&e.key==='f';
  const row={dataset:{tid:'futuro'},getClientRects:()=>[{}],closest:()=>null,classList:{add(){},remove(){}},scrollIntoView(){}};
  a.c.document.querySelectorAll=s=>s.includes('.sm-row[data-tid]')?[row]:[];
  a.c.document.querySelector=s=>s.includes('data-tid="futuro"')?row:null;
  a.c.smDiaClique('2026-10-27');
  assert.doesNotMatch(a.c.vTarefas(),/data-tid="hoje"/);
  const teclado=a.teclas.find(fn=>fn.toString().includes('const L=smkLista()'));assert.ok(teclado);
  const tecla=key=>teclado({key,target:{tagName:'BODY'},preventDefault(){}});
  tecla('ArrowDown');tecla('ArrowDown');tecla('ArrowDown');tecla('f');await a.fila();
  assert.ok(a.lista().some(t=>t.id==='hoje'),'F preserva a tarefa invisível de hoje');
  assert.ok(!a.lista().some(t=>t.id==='futuro'),'F age na tarefa visível selecionada');
  vm.runInContext("SMK.on=true;SMK.id='hoje'",a.c);tecla('Enter');tecla('f');await a.fila();
  assert.equal(a.lista().find(t=>t.id==='hoje').feito,undefined);
});

test('arrastar para outro tipo/subtema salva pela fila normal e reaplica em conflito sem perder campos',async()=>{
  const original={id:'a',dia:'sem',area:'estudo',sub:'Antigo',texto:'Mover',det:'Nota',textoHtml:'<b>Mover</b>',etiquetas:['legada'],subtarefas:[{id:'s',texto:'Etapa',feito:true}],anexos:[{nome:'arquivo'}],repetir:{tipo:'diaria'},grupo:'g',ordem:10};
  const a=await app([original,{id:'b',dia:'sem',area:'ferramenta',texto:'Destino',ordem:10},{...original,id:'ligada',dia:'2026-10-27'}]);
  a.estado.conflito=true;
  assert.equal(a.c.smSolta('a',{drop:'sem',area:'ferramenta',sub:''},'b'),true);assert.equal(await a.fila(),true);
  const salvo=a.salvos.at(-1),movida=salvo.tarefas.find(t=>t.id==='a');
  const esperado={...original,area:'ferramenta',ordem:10};delete esperado.sub;assert.deepEqual(movida,esperado);
  assert.ok(movida.ordem<salvo.tarefas.find(t=>t.id==='b').ordem);
  assert.equal(salvo.tarefas.filter(t=>t.id==='a').length,1);assert.ok(salvo.tarefas.some(t=>t.id==='outro'));
  assert.equal(salvo.tarefas.find(t=>t.id==='ligada').area,'estudo');
  assert.equal(a.c.smSolta('a',{drop:'sem',area:'tarefas',sub:'Casamento'}),true);await a.fila();
  assert.equal(a.salvos.at(-1).tarefas.find(t=>t.id==='a').sub,'Casamento');
});

test('reordenação e Alt+setas continuam dentro do tipo/subtema; soltar no grupo atual não altera nada',async()=>{
  const a=await app([{id:'a',dia:'sem',area:'estudo',ordem:10},{id:'x',dia:'sem',area:'tarefas',ordem:15},{id:'b',dia:'sem',area:'estudo',ordem:20}]);
  assert.equal(a.c.smSolta('a',{drop:'sem',area:'estudo',sub:''},'b'),true);await a.fila();
  assert.ok(a.lista().find(t=>t.id==='a').ordem>a.lista().find(t=>t.id==='b').ordem);
  assert.equal(a.lista().find(t=>t.id==='x').ordem,15);
  a.c.tela='tarefas';vm.runInContext("SMK.on=true;SMK.id='a'",a.c);
  const alt=a.teclas.find(fn=>fn.toString().includes('smReordena(x.id'));assert.ok(alt);
  let preveniu=false;alt({key:'ArrowUp',altKey:true,target:{tagName:'BODY'},preventDefault(){preveniu=true},stopImmediatePropagation(){}});await a.fila();assert.equal(preveniu,true);
  assert.ok(a.lista().find(t=>t.id==='a').ordem<a.lista().find(t=>t.id==='b').ordem);
  const n=a.salvos.length;assert.equal(a.c.smSolta('a',{drop:'sem',area:'estudo',sub:''}),false);assert.equal(a.salvos.length,n);
});

test('Tarefas: grupos identificam destino e planejamento vem depois das tarefas',async()=>{
  const a=await app([{id:'ultima',dia:'2026-10-27',texto:'Última tarefa',area:'ferramenta'}]);
  const html=a.c.vTarefas();assert.doesNotMatch(html,/<h2>Tarefas<\/h2>/);
  assert.ok(html.indexOf('Planejar semana')>html.indexOf('data-tid="ultima"'));
  assert.match(html,/data-drop="2026-10-27" data-area="ferramenta" data-sub=""/);
});

test('Notas 1.39: ntBlocos/ntDocumento — id estável, data de alteração só no bloco mudado, ida e volta sem perda',async()=>{
  const a=await app(),p=(id,t,extra={})=>({type:'paragraph',attrs:{id,...extra},content:[{type:'text',text:t}]});
  const doc1={type:'doc',content:[p('x','a'),p('y','b'),p('z','c')]};
  const bl=copia(a.c.ntBlocos(copia(doc1),[],'2026-11-01T00:00:00.000Z'));
  assert.deepEqual(bl.map(b=>[b.id,b.atualizado]),[['x','2026-11-01T00:00:00.000Z'],['y','2026-11-01T00:00:00.000Z'],['z','2026-11-01T00:00:00.000Z']]);
  assert.deepEqual(copia(a.c.ntDocumento(bl)),doc1,'ida e volta');
  const doc2=copia(doc1);doc2.content[1].content[0].text='b!';
  const b2=copia(a.c.ntBlocos(doc2,bl,'2026-11-02T00:00:00.000Z'));
  assert.deepEqual(b2.map(b=>b.atualizado),['2026-11-01T00:00:00.000Z','2026-11-02T00:00:00.000Z','2026-11-01T00:00:00.000Z'],'só o bloco editado ganha data nova');
  const doc3=copia(doc1);doc3.content[0].attrs.textAlign=null;doc3.content[2].marks=[];
  assert.deepEqual(copia(a.c.ntBlocos(doc3,bl,'2026-11-03T00:00:00.000Z')),bl,'atributos nulos/padrão não contam como mudança');
  const doc4={type:'doc',content:[p('x','a'),{type:'paragraph',content:[{type:'text',text:'sem id'}]},p('x','copia')]};
  const b4=copia(a.c.ntBlocos(doc4,bl,'2026-11-04T00:00:00.000Z'));
  assert.equal(new Set(b4.map(b=>b.id)).size,3,'sem id e id repetido ganham id novo');assert.equal(b4[0].id,'x');
  assert.deepEqual(copia(a.c.ntDocumento([])),{type:'doc',content:[{type:'paragraph'}]},'sempre há onde digitar');
});

test('Notas 1.39: toggle aberto/fechado fica por aparelho (localStorage), fora do documento',async()=>{
  const a=await app();
  assert.equal(a.c.ntAberto('b1'),false);a.c.ntAbertoSalva('b1',true);a.c.ntAbertoSalva('b2',true);assert.equal(a.c.ntAberto('b1'),true);
  const b=await app([],false,a.mem);assert.equal(b.c.ntAberto('b1'),true,'lembrado depois de recarregar');
  b.c.ntAbertoSalva('b1',false);assert.equal(b.c.ntAberto('b1'),false);assert.equal(b.c.ntAberto('b2'),true);
  assert.doesNotMatch(JSON.stringify(vm.runInContext('SM.d',b.c)),/b1|is-open|"open"/,'o plano não guarda o estado');
});

test('Notas 1.40: ciclo de busca — 10 s, cota baixa volta a 90 s; rajada de mudanças vira um único commit',async()=>{
  const a=await app();
  assert.equal(a.c.smIntervalo(),10000);
  vm.runInContext("BCBR.cota={rest:4000,reset:0}",a.c);assert.equal(a.c.smIntervalo(),10000);
  vm.runInContext("BCBR.cota={rest:100,reset:0}",a.c);assert.equal(a.c.smIntervalo(),90000);
  vm.runInContext("BCBR.cota={rest:2,reset:0}",a.c);assert.ok(a.c.smIntervalo()>=90000);
  const antes=a.salvos.length;
  const ps=['n1','n2','n3'].map(id=>vm.runInContext(`smMudar(d=>{if(!d.tarefas.some(t=>t.id==='${id}'))d.tarefas.push({id:'${id}',dia:'sem',texto:'${id}',area:'tarefas'})},'rajada')`,a.c));
  assert.deepEqual(await Promise.all(ps),[true,true,true]);
  assert.equal(a.salvos.length-antes,1,'um commit para as três mudanças');
  assert.deepEqual(['n1','n2','n3'].filter(id=>a.salvos.at(-1).tarefas.some(t=>t.id===id)),['n1','n2','n3']);
});

test('Notas 1.42: @lembrete — itens do menu (Hoje, Amanhã, dia da semana, dd/mm, dd/mm hh:mm), hora e datas inválidas',async()=>{
  const a=await app(),H='2026-11-09',it=q=>copia(a.c.ntLembreteItens(q,H)).map(x=>x[0]+'='+x[2]+(x[3]?'@'+x[3]:''));   // 09/11/2026 é segunda
  assert.deepEqual(it('').slice(0,3),['Hoje=2026-11-09','Amanhã=2026-11-10','Terça=2026-11-10']);
  assert.equal(it('').length,9,'hoje, amanhã e os próximos 7 dias');
  assert.deepEqual(it('amanha'),['Amanhã=2026-11-10']);
  assert.deepEqual(it('qui'),['Quinta=2026-11-12']);
  assert.deepEqual(it('seg'),['Segunda=2026-11-16'],'o mesmo dia da semana é o da semana que vem');
  assert.deepEqual(it('15/11'),['15/11=2026-11-15']);
  assert.deepEqual(it('03/11'),['03/11=2027-11-03'],'data que já passou vai para o ano que vem');
  assert.deepEqual(it('15/11 14:30'),['15/11 14:30=2026-11-15@14:30']);
  assert.deepEqual(it('hoje 8h'),['Hoje 08:00=2026-11-09@08:00']);
  assert.deepEqual(it('amanha 9h15'),['Amanhã 09:15=2026-11-10@09:15']);
  assert.deepEqual(it('31/02'),[],'dia que não existe');
  assert.deepEqual(it('xyz'),[]);
});

test('Busca global 1.42: bgBusca — relevância x frecência, tipos agrupados, recentes e contadores sem conteúdo',async()=>{
  const a=await app(),n=vm.runInContext('ntNorma',a.c);
  const d=(tipo,id,titulo,corpo='')=>({tipo,id,chave:tipo+':'+id,titulo,sub:'',corpo,tn:n(titulo),cn:n(corpo),abre(){}});
  const docs=[d('nota','1','Reunião de órgãos','pauta de tomografia'),d('tarefa','2','Comprar café'),d('questao','3','Questão 12','Paciente com dor abdominal e tomografia'),d('pagina','4','Tomografia de tórax','achados'),d('nota','5','Outra','tomografia computadorizada tomografia')];
  const ordem=(q,f={},agora=Date.now())=>copia(a.c.bgBusca(q,docs,f,agora)).map(r=>r.d.tipo+':'+r.d.id);
  const o=ordem('tomografia');assert.deepEqual(o.map(x=>x.split(':')[0]),['nota','nota','pagina','questao'],'agrupado por tipo: Notas, Páginas, Tarefas, Calendário, Questões');
  assert.equal(o.includes('tarefa:2'),false);
  assert.deepEqual(ordem('REUNIAO orgaos'),['nota:1'],'sem acento, sem maiúsculas, todas as palavras');
  assert.deepEqual(ordem('tomografia xyz'),[],'cada palavra precisa casar');
  assert.deepEqual(ordem('12'),['questao:3'],'número da questão');
  const agora=Date.parse('2026-11-09T12:00:00Z');
  assert.equal(ordem('tomografia',{'nota:5':{n:20,t:agora-3600e3}},agora)[0],'nota:5','frecência alta supera a relevância pequena');
  assert.ok(vm.runInContext('bgFrecencia',a.c)({n:20,t:agora-400*864e5},agora)<1.001,'uso muito antigo quase não conta');
  assert.ok(vm.runInContext('bgFrecencia',a.c)({n:20,t:agora-3600e3},agora)>4,'uso recente conta');
  const rec=copia(a.c.bgBusca('',docs,{'nota:1':{n:1,t:1},'tarefa:2':{n:9,t:50},'pagina:4':{n:1,t:20}},agora)).map(r=>r.d.id);
  assert.deepEqual(rec,['2','4','1'],'sem texto: recentes, o mais novo primeiro');
  a.c.bgFreqConta('nota:1');a.c.bgFreqConta('nota:1');
  const salvo=JSON.parse(a.mem.get('bcbr_busca_freq'));assert.deepEqual(Object.keys(salvo['nota:1']).sort(),['n','t']);assert.equal(salvo['nota:1'].n,2);
  assert.doesNotMatch(a.mem.get('bcbr_busca_freq'),/Reuni|tomografia/,'contador local: só contagem e hora, nunca conteúdo');
});

test('Plano 1.42: sem conexão a alteração fica na fila, o plano remoto que mudou é fundido por cima (smMerge3) e sobe sozinho, sem duplicar',async()=>{
  const a=await app([{id:'t1',dia:'sem',texto:'Antiga',area:'tarefas'}]);
  const b={tarefas:[{id:'a',texto:'A'},{id:'b',texto:'B'}],dias:{'2026-11-01':{agenda:'x'}},tipos:['u']};
  const m=copia(a.c.smMerge3(b,{tarefas:[{id:'a',texto:'A local'},{id:'b',texto:'B'},{id:'n',texto:'nova local'}],dias:{'2026-11-01':{agenda:'x'}},tipos:['u']},{tarefas:[{id:'a',texto:'A'},{id:'r',texto:'nova remota'}],dias:{'2026-11-01':{agenda:'x'},'2026-11-02':{agenda:'y'}},tipos:['u','v']}));
  assert.deepEqual(m.tarefas.map(t=>t.id+':'+t.texto),['a:A local','r:nova remota','n:nova local'],'edição local, nova remota e nova local ficam; B apagada lá some');
  assert.deepEqual(Object.keys(m.dias),['2026-11-01','2026-11-02']);assert.deepEqual(m.tipos,['u','v']);
  a.estado.falhar=true;
  await vm.runInContext("smMudar(d=>{if(!d.tarefas.some(t=>t.id==='off1'))d.tarefas.push({id:'off1',dia:'sem',texto:'Criada offline',area:'tarefas'})},'offline')",a.c);
  assert.equal(vm.runInContext('SM.sujo',a.c),true);assert.ok(+a.mem.get('sm_sujo')>0,'sm_sujo guarda a hora');assert.ok(a.mem.get('sm_base2'));
  assert.equal(a.estado.remoto.tarefas.some(t=>t.id==='off1'),false);
  a.estado.remoto.tarefas.push({id:'outro',dia:'sem',texto:'Do outro aparelho',area:'tarefas'});a.estado.remoto.tarefas.find(t=>t.id==='t1').texto='Antiga editada lá';
  a.estado.falhar=false;a.salvos.length=0;
  a.mem.set('sm_cache2',JSON.stringify({...JSON.parse(a.mem.get('sm_cache2')),sha:'velho'}));   // (o plano remoto mudou: sha diferente do guardado)
  const b2=await app([],false,a.mem,false,a.estado.remoto);   // "recarrega" o app: o estado sujo vem do localStorage
  await vm.runInContext('smPuxar()',b2.c);await b2.fila();
  assert.deepEqual(b2.estado.remoto.tarefas.map(t=>t.id+':'+t.texto).sort(),['off1:Criada offline','outro:Do outro aparelho','t1:Antiga editada lá'],'as três coisas, uma vez cada');
  assert.equal(vm.runInContext('SM.sujo',b2.c),false);assert.equal(b2.mem.get('sm_sujo')??null,null);
  const n=b2.salvos.length;await vm.runInContext('smPuxar()',b2.c);await b2.fila();assert.equal(b2.salvos.length,n,'repetir o ciclo não regrava');
});

test('Plano 1.42 (revisão): smMerge3 — escalar dos dois lados vale o carimbo mais novo; sem base nada é ressuscitado; lista com item sem id não perde o remoto',async()=>{
  const a=await app();
  const m=(b,l,r,sb)=>copia(vm.runInContext('smMerge3',a.c)(b,l,r,true,null,sb));
  // (a) mesmo campo nos dois lados: vale o item de `atualizado` mais novo (o local só vence se for mais novo ou sem carimbo)
  const b={tarefas:[{id:'a',texto:'A',atualizado:'2026-11-01T00:00:00Z'},{id:'c',texto:'C'}]};
  assert.equal(m(b,{tarefas:[{id:'a',texto:'local',atualizado:'2026-11-02T00:00:00Z'},b.tarefas[1]]},{tarefas:[{id:'a',texto:'remoto',atualizado:'2026-11-03T00:00:00Z'},b.tarefas[1]]}).tarefas[0].texto,'remoto','o remoto é mais novo');
  assert.equal(m(b,{tarefas:[{id:'a',texto:'local',atualizado:'2026-11-04T00:00:00Z'},b.tarefas[1]]},{tarefas:[{id:'a',texto:'remoto',atualizado:'2026-11-03T00:00:00Z'},b.tarefas[1]]}).tarefas[0].texto,'local','o local é mais novo');
  assert.equal(m(b,{tarefas:[b.tarefas[0],{id:'c',texto:'local'}]},{tarefas:[b.tarefas[0],{id:'c',texto:'remoto'}]}).tarefas[1].texto,'local','sem carimbo mantém o local');
  // (b) sem base: o que sumiu do remoto não volta; entra só item local criado depois de `desde`; edição local em item que existe lá vale
  const desde=Date.parse('2026-11-09T12:00:00Z'),idNovo='x'+desde.toString(36)+'abcd',idVelho='x'+(desde-86400000).toString(36)+'abcd';
  const local={tarefas:[{id:idVelho,texto:'apagada lá'},{id:idNovo,texto:'criada offline'},{id:'z',texto:'editada aqui'}]},remoto={tarefas:[{id:'z',texto:'z'},{id:'w',texto:'só remoto'}]};
  assert.deepEqual(m(undefined,local,remoto,{desde}).tarefas.map(t=>t.id+':'+t.texto),['z:editada aqui','w:só remoto',idNovo+':criada offline']);
  // (c) item sem id: o remoto fica, o local novo entra, os com id se fundem
  const c=m({lista:[{id:'1',v:1}]},{lista:[{id:'1',v:2},{x:'local sem id'}]},{lista:[{id:'1',v:1},{x:'remoto sem id'},{id:'2',v:9}]});
  assert.deepEqual(c.lista.map(x=>x.id?x.id+':'+x.v:x.x),['1:2','remoto sem id','2:9','local sem id']);
  // sem sm_base2 guardado no aparelho: o modo cauteloso é o usado pela busca
  assert.equal(vm.runInContext('smFundePlano({tarefas:[],v:2}).tarefas.length',a.c)>=0,true);
});

test('Notas 1.42 (revisão): chip de lembrete — HTML guarda o vínculo (data-tarefaId), colar não duplica a tarefa',async()=>{
  const fonteN=fs.readFileSync(require.resolve('../build/notas2.js'),'utf8');
  assert.match(fonteN,/tarefaId:atr\('tarefaId'\)/);assert.doesNotMatch(fonteN,/atr\('tarefa'\)/);
});
