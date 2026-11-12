// 1.42 no Chrome headless (dados fictícios, servidor --simulado + BCBR_MEM=1 + 5.700 questões fictícias): Ctrl+F nas Notas, busca global Ctrl+P, Ctrl+Alt+T / Ctrl+Enter,
// seleção de blocos por retângulo, histórico de versões, @lembrete, frases-padrão e o resgate do texto digitado numa página apagada em outro aparelho (A2).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {iniciar,espera}=require('./chrome-util.js');
const PORTA=8771;
test('Notas/Radio 1.42 no Chrome',{timeout:420000},async t=>{
  const C=await iniciar({porta:PORTA,env:{BCBR_QS:'5700'}});
  t.after(()=>C.fim());
  const {ev,call,tecla,digita,especial,ctrl,click,arrasta,ate,par,tg,reset,fechaTodos,confirmado,abertos}=C;
  await C.abre('notas');
  const txtTopo=()=>ev("NT.ed.getJSON().content.map(n=>n.type==='details'?'T:'+(n.content[0].content?.[0]?.text||''):(n.content?.[0]?.text||''))");

  await t.test('Ctrl+F nas Notas: destaca, conta n/total, Enter e Shift+Enter navegam, Esc fecha e ocorrência em toggle fechado o ABRE',async()=>{
    await reset(tg('Um',par('alfa beta'),tg('Filho',par('gama Beta'))),tg('Dois',par('delta')),par('Beta fim'),par(''));await fechaTodos();
    assert.deepEqual(await abertos(),[false,false,false]);
    await ev("window.__ev=null;window.addEventListener('keydown',e=>{if(e.ctrlKey&&String(e.key).toLowerCase()==='f')window.__ev=e},true)");
    await ctrl('f');await espera(100);
    assert.equal(await ev("document.activeElement.className"),'nt-busca-in');
    assert.equal(await ev("window.__ev.defaultPrevented"),true,'na aba Notas a busca é a do app (o navegador não abre a dele)');
    await digita('BÉTA'.replace('É','E'));await espera(200);   // sem acento e sem maiúsculas
    assert.equal(await ev("document.querySelector('.nt-busca-n').textContent"),'1/3');
    assert.equal(await ev("document.querySelectorAll('.nt-busca-hit').length"),3,'todas as ocorrências destacadas por decoration inline');
    assert.deepEqual(await abertos(),[true,false,false],'a 1ª ocorrência está dentro de um toggle fechado: ele abriu');
    await especial('Enter');await espera(120);
    assert.equal(await ev("document.querySelector('.nt-busca-n').textContent"),'2/3');
    assert.deepEqual(await abertos(),[true,true,false],'a 2ª está no toggle aninhado: abriu também (o "Dois" continua fechado)');
    assert.equal(await ev("(()=>{const r=document.querySelector('.nt-busca-hit.atual').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()"),true,'rolou até a ocorrência');
    await especial('Enter');await espera(100);assert.equal(await ev("document.querySelector('.nt-busca-n').textContent"),'3/3');
    await especial('Enter');await espera(100);assert.equal(await ev("document.querySelector('.nt-busca-n').textContent"),'1/3','volta ao início');
    await especial('Enter',8);await espera(100);assert.equal(await ev("document.querySelector('.nt-busca-n').textContent"),'3/3','Shift+Enter volta');
    // abrir toggle é só estado de tela: não entra no documento nem na fila de gravação
    assert.equal(await ev("ntTemPendentes()"),false);
    assert.equal(await ev("JSON.stringify(NT.ed.getJSON()).includes('is-open')"),false);
    await especial('Escape');await espera(100);
    assert.equal(await ev("!document.querySelector('.nt-busca')&&document.querySelectorAll('.nt-busca-hit').length"),0,'Esc fecha e tira o destaque');
    await ev("go('tarefas')");await espera(300);await ev("window.__ev=null");
    await ctrl('f');await espera(100);
    assert.equal(await ev("window.__ev.defaultPrevented"),false,'fora da aba Notas o Ctrl+F continua do navegador');
    await ev("go('notas')");await ate("!!NT.ed&&NT.el.isConnected&&!!document.querySelector('.nt-pm')");await espera(800);
  });

  await t.test('Ctrl+Alt+T abre/fecha todos os toggles, Ctrl+Enter o do cursor; o botão "Abrir/Fechar todos" não existe mais; o estado não vai ao documento',async()=>{
    await reset(tg('Um',par('a')),tg('Dois',par('b'),tg('Neto',par('c'))),par('fim'));await fechaTodos();
    assert.equal(await ev("document.getElementById('nt_todos')"),null);
    assert.equal(await ev("[...document.querySelectorAll('button')].some(b=>/Abrir todos|Fechar todos/.test(b.textContent))"),false);
    await ev("NT.ed.commands.focus()");
    await ctrl('t',3);await espera(100);assert.deepEqual(await abertos(),[true,true,true]);
    await ctrl('t',3);await espera(100);assert.deepEqual(await abertos(),[false,false,false]);
    await ev("NT.ed.chain().focus().setTextSelection(3).run()");   // dentro do título do 1º toggle
    await especial('Enter',2);await espera(100);assert.deepEqual(await abertos(),[true,false,false],'Ctrl+Enter abre o toggle do cursor');
    await especial('Enter',2);await espera(100);assert.deepEqual(await abertos(),[false,false,false],'e fecha');
    assert.equal(await ev("ntTemPendentes()"),false,'abrir/fechar não gera gravação');
    // atalhos listados no painel Ctrl+/
    await ctrl('/');await espera(150);
    const painel=await ev("document.getElementById('nt_atalhos')?.textContent");
    for(const s of ['Ctrl+Alt+T','Ctrl+Enter','Ctrl+F','Ctrl+P','Histórico','@','Frase','Selecionar blocos'])assert.ok(painel.includes(s),'painel de atalhos lista '+s);
    await especial('Escape');
  });

  await t.test('seleção de blocos por retângulo: arrastar pela margem seleciona, Delete numa transação (Ctrl+Z desfaz tudo), Tab/Shift+Tab em grupo, copiar/recortar, Esc limpa, arrasto no texto segue normal',async()=>{
    const montar=async()=>{await reset(par('p1'),par('p2'),tg('T3',par('x')),par('p4'),par('p5'));await fechaTodos();await espera(200)};
    const geo=()=>ev("(()=>{const pm=document.querySelector('.nt-pm').getBoundingClientRect(),bl=[...document.querySelectorAll('.nt-pm>*')].map(e=>e.getBoundingClientRect());return {pmL:pm.left,pmB:pm.bottom,bl:bl.map(r=>({l:r.left,t:r.top,b:r.bottom,r:r.right}))}})()");
    const sel=()=>ev("JSON.stringify(ntBselPos(NT.ed.state))");
    await montar();let g=await geo();
    const margem=[g.pmL+10,g.bl[4].b+25];   // margem à esquerda, abaixo do último bloco: fora de qualquer texto
    await ev("window.__rb=0;new MutationObserver(()=>{if(document.querySelector('.nt-rubber'))window.__rb++}).observe(document.body,{childList:true})");
    await arrasta(margem,[g.bl[0].l+60,g.bl[1].t+6],5);   // sobe cruzando p5, p4, T3 e p2
    assert.ok(await ev("window.__rb")>0,'desenhou o retângulo');
    assert.equal(await ev("document.querySelectorAll('.nt-rubber').length"),0,'e o removeu ao soltar');
    assert.equal(await ev("document.querySelectorAll('.nt-bsel').length"),4,'p2, T3, p4 e p5 selecionados (classe nt-bsel via Decoration.node)');
    assert.equal(await ev("NT.ed.state.selection.constructor.name!=='NodeSelection'"),true,'sem NodeSelection');
    // Delete: um passo só
    await especial('Delete');await espera(150);
    assert.deepEqual((await txtTopo()).filter(Boolean),['p1']);
    await ctrl('z');await espera(150);
    assert.deepEqual((await txtTopo()).slice(0,5),['p1','p2','T:T3','p4','p5'],'um único Ctrl+Z restaura o grupo todo');
    // Esc limpa
    await montar();g=await geo();await arrasta([g.pmL+10,g.bl[4].b+25],[g.bl[0].l+60,g.bl[3].t+6],4);
    assert.ok((JSON.parse(await sel())).length>=2);await especial('Escape');await espera(100);assert.equal(await sel(),'[]','Esc limpa');
    assert.equal(await ev("!!document.querySelector('.nt-pan')"),false,'e não fechou nada além');
    // Tab entra no toggle de cima; Shift+Tab sai
    await montar();g=await geo();await arrasta([g.pmL+10,g.bl[4].b+25],[g.bl[0].l+60,g.bl[3].t+6],4);
    assert.equal(JSON.parse(await sel()).length,2,'p4 e p5');
    await especial('Tab');await espera(150);
    assert.deepEqual((await ev("NT.ed.getJSON().content.map(n=>n.type==='details'?'T['+n.content[1].content.map(c=>c.content?.[0]?.text||'').join(',')+']':n.content?.[0]?.text||'')")).slice(0,3),['p1','p2','T[x,p4,p5]'],'p4 e p5 entraram no toggle T3');
    assert.equal(JSON.parse(await sel()).length,2,'a seleção acompanha os blocos movidos');
    await especial('Tab',8);await espera(150);
    assert.deepEqual((await txtTopo()).slice(0,5),['p1','p2','T:T3','p4','p5'],'Shift+Tab traz de volta');
    // copiar e recortar
    await montar();g=await geo();await arrasta([g.pmL+10,g.bl[4].b+25],[g.bl[0].l+60,g.bl[3].t+6],4);
    const copia=await ev("(()=>{const dt=new DataTransfer(),e=new ClipboardEvent('copy',{clipboardData:dt,bubbles:true,cancelable:true});NT.ed.view.dom.dispatchEvent(e);return {texto:dt.getData('text/plain'),html:dt.getData('text/html'),prevenido:e.defaultPrevented}})()");
    assert.ok(copia.prevenido&&/p4/.test(copia.texto)&&/p5/.test(copia.texto)&&!/p2/.test(copia.texto)&&/<p/.test(copia.html),'Ctrl+C leva só o grupo');
    assert.deepEqual((await txtTopo()).slice(0,5),['p1','p2','T:T3','p4','p5'],'copiar não mexe no texto');
    await ev("(()=>{const dt=new DataTransfer();NT.ed.view.dom.dispatchEvent(new ClipboardEvent('cut',{clipboardData:dt,bubbles:true,cancelable:true}))})()");await espera(150);
    assert.deepEqual((await txtTopo()).filter(Boolean),['p1','p2','T:T3'],'Ctrl+X recorta o grupo');
    // arrasto que começa DENTRO do texto: seleção de texto normal, sem retângulo
    await montar();g=await geo();
    await ev("window.__rb=0");
    await arrasta([g.bl[0].l+8,g.bl[0].t+12],[g.bl[3].l+30,g.bl[3].t+12],6);
    assert.equal(await ev("window.__rb"),0,'sem retângulo');assert.equal(await sel(),'[]','nenhum bloco selecionado');
    const s=await ev("({from:NT.ed.state.selection.from,to:NT.ed.state.selection.to})");assert.ok(s.to>s.from,'seleção de texto cruzando blocos: '+JSON.stringify(s));
    // arrastar a alça de um bloco do grupo move o grupo
    await montar();g=await geo();await arrasta([g.pmL+10,g.bl[4].b+25],[g.bl[0].l+60,g.bl[1].t+6],4);   // p2, T3, p4, p5
    await ev(`(()=>{const dt=new DataTransfer(),al=document.querySelector('.nt-alca');NT.alcaMostra(ntBlocoPos(NT.ed.state.doc,${await ev("ntBselPos(NT.ed.state)[0]")}));
      al.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:dt}));
      const alvo=document.querySelector('.nt-pm'),p1=document.querySelector('.nt-pm>p'),r=p1.getBoundingClientRect();
      alvo.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:r.x+40,clientY:r.y+2}));
      alvo.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:r.x+40,clientY:r.y+2}));
      al.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:dt}))})()`);
    await espera(150);
    assert.deepEqual((await txtTopo()).slice(0,5),['p2','T:T3','p4','p5','p1'],'o grupo foi para o começo, p1 desceu');
  });

  await t.test('1.43 sem "Recentes": a barra lateral só tem Fixadas e Páginas, e a chave bcbr_nt_recentes não é mais gravada (nem sobra)',async()=>{
    for(let i=1;i<=6;i++){await ev(`(()=>{const id=ntPaginaCria();pgMuda(l=>{l.find(p=>p.id===id).titulo='Pág ${i}'});window.__id${i}=id})()`)}
    await ev("go('notas')");await ate("!!NT.ed&&!!document.querySelector('.nt-pm')");
    await ev("pgMuda(l=>{l.find(p=>p.titulo==='Pág 2').fixada=true})");
    for(let i=1;i<=6;i++){await ev(`ntPainelAbre(window.__id${i})`);await espera(150);await especial('Escape');await espera(150)}
    await ev("ntLateralPinta()");
    assert.deepEqual(await ev("[...document.querySelectorAll('#nt_lat .nt-lat-s')].map(e=>e.textContent)"),['Fixadas','Páginas'],'sem a seção Recentes');
    assert.equal(await ev("document.querySelectorAll('#nt_lat .nt-pg-rec,#nt_lat [data-sec=rec]').length"),0);
    assert.equal(await ev("typeof ntRecentes+typeof ntRecentePoe+typeof NT_REC"),'undefinedundefinedundefined','o código saiu');
    assert.equal(await ev("localStorage.getItem('bcbr_nt_recentes')"),null,'abrir páginas não grava a chave');
  });

  await t.test('@lembrete: sugestões, chip + tarefa no plano (data/hora/lembrete), mudar a data atualiza a tarefa, apagar o chip mantém a tarefa',async()=>{
    await reset(par('Ligar para o laboratório'),par(''));await ev("NT.ed.chain().focus().setTextSelection(NT.ed.state.doc.content.size-1).run()");
    await digita('Revisar laudos @');await espera(200);
    const m=await ev("[...document.querySelectorAll('.nt-slash-it b')].map(b=>b.textContent)");
    assert.deepEqual(m.slice(0,2),['Hoje','Amanhã']);assert.equal(m.length,9);
    await digita('amanha 14:30');await espera(200);
    assert.deepEqual(await ev("[...document.querySelectorAll('.nt-slash-it b')].map(b=>b.textContent)"),['Amanhã 14:30']);
    await especial('Enter');await espera(300);
    const no=await ev("(()=>{let n=null;NT.ed.state.doc.descendants(x=>{if(x.type.name==='dataLembrete')n=x.attrs});return n})()");
    assert.ok(no&&no.tarefaId&&no.hora==='14:30'&&/^\d{4}-\d{2}-\d{2}$/.test(no.iso),JSON.stringify(no));
    assert.match(await ev("document.querySelector('.nt-lemb').textContent"),/Amanhã 14:30/);
    const tarefa=()=>ev(`SM.d.tarefas.find(t=>t.id===${JSON.stringify(no.tarefaId)})`);
    let tf=await tarefa();assert.deepEqual([tf.dia,tf.hora,tf.lembrete,tf.texto,tf.area],[no.iso,'14:30',0,'Revisar laudos','tarefas'],'mesma tarefa da aba Tarefas, com o campo de lembrete "na hora"');
    await click('.nt-lemb');await ate("!!document.querySelector('.nt-lemb-pop')");
    await ev("(()=>{const p=document.querySelector('.nt-lemb-pop'),[d,h]=p.querySelectorAll('input');d.value='2026-12-24';h.value='';p.querySelector('[data-l=ok]').click()})()");await espera(300);
    tf=await tarefa();assert.deepEqual([tf.dia,tf.hora??null,tf.lembrete??null],['2026-12-24',null,null],'mudar a data atualiza a tarefa');
    assert.match(await ev("document.querySelector('.nt-lemb').textContent"),/24\/12/);
    await ev("(()=>{let pos=-1;NT.ed.state.doc.descendants((x,p)=>{if(x.type.name==='dataLembrete')pos=p});NT.ed.view.dispatch(NT.ed.state.tr.delete(pos,pos+1))})()");await espera(200);
    assert.equal(await ev("document.querySelectorAll('.nt-lemb').length"),0);
    assert.ok(await tarefa(),'apagar o chip não apaga a tarefa');
    await confirmado();
    assert.ok((await C.ev("SM.d.tarefas.length"))>0);
  });

  await t.test('frases-padrão: salvar o texto selecionado, "/Frase" filtra e insere, painel renomeia/apaga, sobe pela fila das notas',async()=>{
    await reset(par('Fígado de dimensões normais, contornos regulares.','f1'),par('','f2'));
    await ev("NT.ed.chain().focus().setTextSelection({from:1,to:51}).run()");
    assert.equal(await ev("!!document.querySelector('[data-m=frase],[data-m=frases]')"),false,'1.49: botões de frase ocultos');await ev('ntFraseSalvaSel(NT)');await ate("!!document.querySelector('.nt-modal input')");
    await ev("document.querySelector('.nt-modal input').select()");await digita('Fígado normal');await especial('Enter');await espera(300);
    assert.deepEqual(await ev("SM.d.notasFrases.map(f=>[f.titulo,f.texto])"),[['Fígado normal','Fígado de dimensões normais, contornos regulares.']]);
    await ev("frSalva('Rins normais','Rins de forma e dimensões normais.')");
    await ev("NT.ed.chain().focus().setTextSelection(NT.ed.state.doc.content.size-1).run()");await espera(250);
    await digita('/Frase');await espera(200);await especial('Enter');await ate("!!document.querySelector('.nt-fr-q')");
    await digita('rins');await espera(150);
    assert.equal(await ev("document.querySelectorAll('.nt-fr-it').length"),1,'filtra pela digitação');
    await especial('Enter');await espera(300);
    assert.equal(await ev("NT.ed.getText().includes('Rins de forma e dimensões normais.')"),true,'a frase foi inserida');
    // gerenciar: renomear e apagar
    await ev('ntFrasesGerencia()');await ate("!!document.querySelector('.nt-fr-g')");
    await ev("(()=>{const i=document.querySelector('.nt-fr-g input');i.value='Fígado OK';i.dispatchEvent(new Event('change',{bubbles:true}))})()");await espera(200);
    assert.deepEqual(await ev("SM.d.notasFrases.map(f=>f.titulo)"),['Fígado OK','Rins normais']);
    await ev("document.querySelectorAll('.nt-fr-g [data-f=apaga]')[1].click()");await espera(200);
    assert.deepEqual(await ev("SM.d.notasFrases.map(f=>f.titulo)"),['Fígado OK']);
    await especial('Escape');await espera(100);
    assert.ok(await confirmado(),'subiu pela fila');
    const remoto=await(await fetch(C.URL_+'api/repos/arturaragao/banco-cbr-app/contents/semana/plano.json')).json();
    assert.deepEqual(JSON.parse(Buffer.from(remoto.content,'base64').toString()).notasFrases.map(f=>f.titulo),['Fígado OK'],'está no plano do GitHub (fictício)');
  });

  await t.test('revisão: clicar na margem sem arrastar limpa a seleção de blocos; chip colado mantém o vínculo sem duplicar a tarefa; Ctrl+Z da data leva a tarefa junto',async()=>{
    await ev("go('notas')");await ate("!!NT.ed&&NT.el.isConnected&&!!document.querySelector('.nt-pm')");await espera(800);
    await reset(par('p1'),par('p2'),par('p3'));await espera(200);
    const g=await ev("(()=>{const pm=document.querySelector('.nt-pm').getBoundingClientRect(),b=[...document.querySelectorAll('.nt-pm>*')].map(e=>e.getBoundingClientRect());return {pmL:pm.left,bl:b.map(r=>({l:r.left,t:r.top,b:r.bottom}))}})()");
    await arrasta([g.pmL+10,g.bl[2].b+25],[g.bl[0].l+60,g.bl[0].t+6],4);
    assert.ok(JSON.parse(await ev("JSON.stringify(ntBselPos(NT.ed.state))")).length>=2,'selecionou');
    await C.mouse('mouseMoved',g.pmL+10,g.bl[2].b+25);await C.mouse('mousePressed',g.pmL+10,g.bl[2].b+25);await C.mouse('mouseReleased',g.pmL+10,g.bl[2].b+25);await espera(150);
    assert.equal(await ev("JSON.stringify(ntBselPos(NT.ed.state))"),'[]','um clique na margem limpa');
    // chip: vínculo no HTML, colar não cria tarefa nova
    await ev("NT.ed.chain().focus('end').insertContent([{type:'dataLembrete',attrs:{iso:'2026-12-10',hora:null,tarefaId:'tvinc'}}]).run()");
    await ev("ntLembTarefa({tarefaId:'tvinc',iso:'2026-12-10',hora:null},'Linha do chip')");await espera(200);
    const html=await ev("NT.ed.getHTML()");assert.match(html,/data-tarefaid="tvinc"/i,'o HTML guarda o vínculo');
    const antes=await ev("SM.d.tarefas.length");
    await ev(String.raw`(()=>{const dt=new DataTransfer();dt.setData('text/html',${JSON.stringify(html)});dt.setData('text/plain','x');NT.ed.chain().focus('end').run();NT.ed.view.dom.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))})()`);await espera(300);
    assert.equal(await ev("(()=>{let n=0;NT.ed.state.doc.descendants(x=>{if(x.type.name==='dataLembrete'&&x.attrs.tarefaId==='tvinc')n++});return n})()"),2,'dois chips com o mesmo vínculo');
    assert.equal(await ev("SM.d.tarefas.length"),antes,'colar não cria tarefa');assert.equal(await ev("SM.d.tarefas.filter(t=>t.id==='tvinc').length"),1);
    // Ctrl+Z da troca de data leva a tarefa junto (dois chips com o mesmo vínculo: vale o último do texto)
    await ev("ntSalvaDoc()");await espera(200);   // (a versão salva já tem os chips)
    await ev("NT.ed.view.dispatch(NT.ed.state.tr.setNodeMarkup((()=>{let p=-1;NT.ed.state.doc.descendants((x,q)=>{if(x.type.name==='dataLembrete')p=q});return p})(),undefined,{iso:'2026-12-20',hora:null,tarefaId:'tvinc'}))");
    await ev("ntSalvaDoc()");await espera(200);
    assert.equal(await ev("SM.d.tarefas.find(t=>t.id==='tvinc').dia"),'2026-12-20','mudar o chip leva a tarefa');
    await ev("NT.ed.commands.focus()");await espera(200);await ctrl('z');await espera(150);await ev("ntSalvaDoc()");await espera(200);
    assert.equal(await ev("SM.d.tarefas.find(t=>t.id==='tvinc').dia"),'2026-12-10','Ctrl+Z desfaz e a tarefa acompanha');
    await ctrl('y');await espera(150);await ev("ntSalvaDoc()");await espera(200);
    assert.equal(await ev("SM.d.tarefas.find(t=>t.id==='tvinc').dia"),'2026-12-20','Ctrl+Y também');
    await confirmado();
  });

  assert.deepEqual(C.erros,[],'sem exceções na página');
});
