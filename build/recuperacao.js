// 1.44 PARCIAL: observação local. Não é uma fila nem altera o formato/fusão do plano.
// Só um PUT confirmado marca edições como enviadas; GET observa o remoto ANTES da fusão.
const RD_CHAVE='bcbr_edicoes_v144',RD_IDADE=14*86400000,RD_ESPERA=5000,RD_BYTES=512*1024;
const RD={enviando:0,ultima:0,erro:'',localErro:''};
const rdCopia=x=>JSON.parse(JSON.stringify(x));
const rdTexto=n=>typeof n==='string'?n:n?.text||((n?.content||[]).map(rdTexto).join(n?.type==='doc'||n?.type==='detailsContent'?'\n':''));
const rdChave=x=>JSON.stringify([x.tipo,x.pagina||'',x.id,x.campo||'']);
function rdLer(){
  try{const l=JSON.parse(localStorage.getItem(RD_CHAVE)||'[]');if(!Array.isArray(l))throw Error('formato inválido');return l.filter(e=>e&&typeof e.texto==='string'&&Number.isFinite(e.hora)&&e.hora>Date.now()-RD_IDADE).slice(-200)}
  catch(e){RD.localErro='Detector indisponível: não consegui ler o diário local.';return []}
}
function rdGuardar(l){
  try{
    const recentes=l.filter(e=>e.hora>Date.now()-RD_IDADE).sort((a,b)=>a.hora-b.hora).slice(-200);
    let raw=JSON.stringify(recentes);
    // Conta chave + JSON em UTF-16 (inclusive conteúdo, anterior e escapes). Poda só entradas já confirmadas
    // pelo PUT, das mais antigas; a mais recente e as não confirmadas ficam mesmo acima do limite.
    while(2*(RD_CHAVE.length+raw.length)>RD_BYTES){const i=recentes.findIndex((e,n)=>e.enviada===true&&n<recentes.length-1);if(i<0)break;recentes.splice(i,1);raw=JSON.stringify(recentes)}
    smLsGrava(RD_CHAVE,raw);RD.localErro='';
  }catch(e){RD.localErro=smErroLocal(e,'guardar o diário local')}
}
function rdItens(d){
  const m=new Map(),poe=x=>m.set(rdChave(x),x);
  for(const t of d?.tarefas||[])for(const campo of ['texto','det'])poe({tipo:'tarefa',id:t.id,campo,texto:String(t[campo]||''),atualizado:t.atualizado||t.em||''});
  const blocos=(l,pagina='')=>{for(const b of l||[])poe({tipo:'bloco',id:b.id,pagina,texto:rdTexto(b.conteudo),atualizado:b.atualizado||'',conteudo:b.conteudo})};
  blocos(d?.notasDoc?.blocos);
  for(const p of d?.notasPaginas?.paginas||[]){poe({tipo:'pagina',id:p.id,campo:'titulo',texto:p.titulo||'',atualizado:p.atualizado||''});blocos(p.doc?.blocos,p.id)}
  return m;
}
function rdUltimas(l){const m=new Map();for(const e of l)m.set(rdChave(e),e);return m}
function rdMudou(antes,depois,rascunho=false){
  const l=rdLer(),ult=rdUltimas(l);let mudou=false;
  for(const k of new Set([...antes.keys(),...depois.keys()])){
    const a=antes.get(k),b=depois.get(k),excluido=!b;
    if(a&&b&&a.texto===b.texto)continue;
    if(!a&&!b?.texto)continue;
    const v=b||{...a,texto:''},u=ult.get(k);
    if(u&&!u.enviada&&u.texto===v.texto&&!!u.excluido===excluido){
      if(!rascunho&&u.rascunho){u.rascunho=false;u.atualizado=v.atualizado;u.anterior=a?.texto;u.conteudo=v.conteudo;mudou=true}
      continue;
    }
    l.push({...rdCopia(v),hora:Date.now(),uid:Date.now().toString(36)+Math.random().toString(36).slice(2),anterior:a?.texto,rascunho,excluido,enviada:false});mudou=true;
  }
  if(mudou)rdGuardar(l);
}
// Chamados nos pontos de edição, inclusive antes do debounce. Rascunhos nunca são confirmados por coincidência de texto.
function rdEditor(c){
  const ant=c.rdMostrado||c.shown||[],blocos=ntBlocos(c.ed.getJSON(),ant);
  const plano=l=>c.pagina?{notasPaginas:{paginas:[{id:c.pagina,doc:{blocos:l}}]}}:{notasDoc:{blocos:l}};
  rdMudou(rdItens(plano(ant)),rdItens(plano(blocos)),true);c.rdMostrado=rdCopia(blocos);
}
function rdRascunhoTarefa(id){
  const t=SM.d?.tarefas?.find(t=>t.id===id),el=document.getElementById('sm_ed_txt');if(!t||!el)return;
  const n={...t,texto:el.innerText.trim(),det:document.getElementById('sm_ed_det')?.innerText.trim()||''};
  const antes=rdItens({tarefas:[t]}),depois=rdItens({tarefas:[n]}),ult=rdUltimas(rdLer());
  for(const [k,a] of antes){const u=ult.get(k);if(u?.rascunho)antes.set(k,{...a,texto:u.texto})}
  rdMudou(antes,depois,true);
}
function rdEnvio(texto){
  const m=rdItens(JSON.parse(texto));
  return [...rdUltimas(rdLer()).values()].filter(e=>!e.rascunho&&!e.excluido&&m.get(rdChave(e))?.texto===e.texto).map(e=>e.uid);
}
function rdConfirmou(ids,texto){
  const l=rdLer(),m=rdItens(JSON.parse(texto)),s=new Set(ids);
  for(const e of l)if(s.has(e.uid)){e.enviada=true;e.confirmada=Date.now();e.atualizado=m.get(rdChave(e))?.atualizado||e.atualizado}
  rdGuardar(l);RD.ultima=Date.now();RD.erro='';rdVerifica(JSON.parse(texto));
}
function rdVerifica(d){
  const l=rdLer(),m=rdItens(d),agora=Date.now();let mudou=false;
  for(const [k,e] of rdUltimas(l)){
    if(e.excluido||e.rascunho||!e.enviada||e.ignorada||agora-e.hora<RD_ESPERA)continue;
    const r=m.get(k);if(!r)continue; // ausência não prova perda; não ressuscita itens apagados
    if(r.texto===e.texto||(e.texto&&r.texto.includes(e.texto)))continue;
    const tr=Date.parse(r.atualizado),te=Date.parse(e.atualizado)||e.hora;
    // Data mais nova de outro aparelho é legítima. Sem data, só uma versão ANTIGA conhecida é evidência.
    const conhecido=r.texto===e.anterior||l.some(a=>rdChave(a)===k&&a.uid!==e.uid&&a.hora<=e.hora&&a.texto===r.texto);
    if(Number.isFinite(tr)?tr>te||!(tr<te||conhecido):!conhecido)continue;
    if(!e.perda){e.perda={hora:agora,atual:r.texto};mudou=true}
  }
  if(mudou)rdGuardar(l);
}
function rdAlertas(){return [...rdUltimas(rdLer()).values()].filter(e=>e.perda&&!e.ignorada&&!e.excluido)}
function rdIgnorar(uid){const l=rdLer(),e=l.find(e=>e.uid===uid);if(e){e.ignorada=true;rdGuardar(l)}rdPinta()}
async function rdRestaurar(uid){
  // Flush do editor pelo caminho existente antes de aplicar a recuperação.
  if(typeof ntAntes==='function')ntAntes();
  if(typeof ntTemPendentes==='function'&&ntTemPendentes()&&!await ntSync()){toast('Sincronize as notas pendentes antes de restaurar.');return false}
  const e=rdAlertas().find(e=>e.uid===uid);if(!e||!rdItens(SM.d).has(rdChave(e))){toast('O item foi excluído ou recebeu outra edição local.');return false}
  const agora=new Date().toISOString();
  const ok=await smMudar(d=>{
    if(e.tipo==='tarefa'){const t=d.tarefas.find(t=>t.id===e.id);if(t){t[e.campo]=e.texto;delete t[e.campo==='texto'?'textoHtml':'detHtml'];if(t.atualizado)t.atualizado=agora}}
    else if(e.tipo==='pagina'){const p=d.notasPaginas?.paginas.find(p=>p.id===e.id);if(p){p.titulo=e.texto;p.atualizado=agora}}
    else{const p=e.pagina?d.notasPaginas?.paginas.find(p=>p.id===e.pagina):null,bl=e.pagina?p?.doc?.blocos:d.notasDoc?.blocos;
      // O editor guarda referência aos blocos mostrados: substituir, nunca mutar essa base.
      if(bl?.some(b=>b.id===e.id)){const blocos=bl.map(b=>b.id===e.id?{...b,conteudo:rdCopia(e.conteudo),atualizado:agora}:b);if(p){p.doc={...p.doc,blocos};p.atualizado=agora}else d.notasDoc={...d.notasDoc,blocos}}}
  },'restaurou edição pelo detector');
  if(typeof ntSincroniza==='function')ntSincroniza();rdPinta();return ok;
}
// Ganchos não podem interromper leitura, edição ou gravação se o diário falhar.
function rdGancho(acao,a,b){
  try{
    if(acao==='antes')return rdItens(a);
    if(acao==='edicao')rdMudou(a,rdItens(b));
    if(acao==='editor')rdEditor(a);
    if(acao==='rascunho')rdRascunhoTarefa(a);
    if(acao==='inicio')RD.enviando++;
    if(acao==='fim')RD.enviando=Math.max(0,RD.enviando-a);
    if(acao==='envio')return rdEnvio(a);
    if(acao==='confirmou')rdConfirmou(a||[],b);
    if(acao==='leitura'){rdVerifica(typeof a==='string'?JSON.parse(a):a);RD.ultima=Date.now();RD.erro=''}
    if(acao==='erro')RD.erro=smErroLeitura(a);
    rdPinta();
  }catch(e){RD.localErro='Detector indisponível nesta operação. Baixe uma cópia em Ajustes.'}
}
function rdEstado(){
  const pend=RD.enviando||SM.sujo||(typeof ntTemPendentes==='function'&&ntTemPendentes())||(typeof NT!=='undefined'&&NT.sujo)||(typeof NP!=='undefined'&&NP?.sujo);
  if(navigator.onLine===false||window.BCBR?.semRede||/^Sem conexão/.test(RD.erro))return 'Pendente — sem conexão';
  if(RD.erro||SM.erro)return RD.erro||SM.erro;
  if(pend)return 'Enviando…';
  return RD.ultima?'Salvo ✓':'Aguardando sincronização';
}
function rdPinta(){
  if(document.body?.classList.contains('nt-aba')){const topo=document.querySelector('.rd-topo'),alvo=document.querySelector('.nt-pan.aba .nt-pan-topo')||document.querySelector('.nt-topo');if(topo&&alvo&&topo.parentElement!==alvo)alvo.appendChild(topo)}
  const el=document.getElementById('rd_sync');if(el){el.textContent=rdEstado();el.title=el.textContent;el.classList.toggle('rd-erro',!!(RD.erro||SM.erro))}
  const aviso=document.getElementById('rd_aviso');if(aviso){aviso.hidden=!rdAlertas().length&&!RD.localErro;aviso.textContent=RD.localErro||'Uma edição pode ter sido sobrescrita — ver'}
  const c=document.getElementById('rd_conflitos');if(c)c.textContent='Conflitos ('+(SM.d?.notas_conflitos||[]).length+')';
}
function rdJanela(titulo,html){const ov=ntModal('rd-modal',`<div class="nt-modal-t"><b>${esc(titulo)}</b><button type="button" class="nt-x" aria-label="Fechar">✕</button></div>${html}`);ov.querySelector('.nt-x').onclick=()=>ntModalFecha(ov);ov.querySelector('button')?.focus();return ov}
async function rdSincronizar(){
  if(typeof ntAntes==='function')ntAntes();
  if(SM.sujo)await smMudar(()=>{},'sincronização manual');
  if(typeof ntSync==='function')await ntSync();
  await smPuxar();rdPinta();
}
function rdSyncAbre(){
  const ov=rdJanela('Sincronização',`<p>Última sincronização: ${RD.ultima?esc(new Date(RD.ultima).toLocaleString('pt-BR')):'ainda não confirmada nesta sessão'}</p><p>${esc(rdEstado())}</p><button type="button" class="b" data-sync>Sincronizar agora</button>`);
  ov.querySelector('[data-sync]').onclick=async e=>{e.target.disabled=true;try{await rdSincronizar();ntModalFecha(ov);rdSyncAbre()}finally{e.target.disabled=false}};
}
function rdPerdasAbre(){
  const lista=rdAlertas(),atual=rdItens(SM.d);
  const ov=rdJanela('Possíveis perdas',`${RD.localErro?'<p>'+esc(RD.localErro)+'</p>':''}${lista.map((e,i)=>`<section><p>${esc(e.tipo+' · '+e.id)} · ${esc(new Date(e.hora).toLocaleString('pt-BR'))}</p><b>Texto da edição confirmada</b><pre>${esc(e.texto)}</pre><b>Texto atual</b><pre>${esc(atual.get(rdChave(e))?.texto??'Item ausente')}</pre><button class="b" data-restaura="${i}">Restaurar</button> <button class="b s" data-ignora="${i}">Ignorar</button></section>`).join('')||'<p>Nenhuma possível perda registrada.</p>'}`);
  ov.addEventListener('click',async ev=>{const b=ev.target.closest('[data-restaura],[data-ignora]');if(!b)return;b.disabled=true;const restaura=b.hasAttribute('data-restaura'),e=lista[+(restaura?b.dataset.restaura:b.dataset.ignora)];try{if(restaura)await rdRestaurar(e.uid);else rdIgnorar(e.uid);ntModalFecha(ov);rdPerdasAbre()}finally{b.disabled=false}});
}
const rdConflitoChave=c=>JSON.stringify([c.id,c.pagina,c.em,c.atualizado,c.conteudo]);
async function rdConflitoDescarta(c){
  if(typeof ntTemPendentes==='function'&&ntTemPendentes()&&!await ntSync())return false;
  const k=rdConflitoChave(c);return smMudar(d=>{d.notas_conflitos=(d.notas_conflitos||[]).filter(x=>rdConflitoChave(x)!==k)},'descartou conflito');
}
function rdConflitosAbre(){
  const lista=SM.d?.notas_conflitos||[],ov=rdJanela('Conflitos ('+lista.length+')',lista.map((c,i)=>`<section><p>${esc(c.pagina||'Notas')} · ${esc(c.id)} · ${esc(c.motivo||c.em||'')}</p><pre tabindex="0">${esc(rdTexto(c.conteudo)||JSON.stringify(c.conteudo))}</pre><button class="b s" data-copia="${i}">Copiar</button> <button class="b s" data-descarta="${i}">Descartar</button><span data-confirma="${i}" hidden> Descartar esta cópia? <button class="b s" data-sim="${i}">Descartar definitivamente</button> <button class="b s" data-nao="${i}">Cancelar</button></span></section>`).join('')||'<p>Nenhum conflito.</p>');
  ov.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.copia!==undefined){try{await navigator.clipboard.writeText(rdTexto(lista[+b.dataset.copia].conteudo));toast('Texto copiado.')}catch(x){const r=document.createRange();r.selectNodeContents(b.parentElement.querySelector('pre'));const s=getSelection();s.removeAllRanges();s.addRange(r);toast('Texto selecionado: use Copiar.')}}
    if(b.dataset.descarta!==undefined)ov.querySelector(`[data-confirma="${b.dataset.descarta}"]`).hidden=false;
    if(b.dataset.nao!==undefined)ov.querySelector(`[data-confirma="${b.dataset.nao}"]`).hidden=true;
    if(b.dataset.sim!==undefined){b.disabled=true;const ok=await rdConflitoDescarta(lista[+b.dataset.sim]);ntModalFecha(ov);rdPinta();rdConflitosAbre();if(!ok)toast('Descarte pendente de sincronização; confira a conexão.')}
  });
}
function rdBackupHtml(){setTimeout(rdUsoAtualiza,0);return `<div class="card"><h3>Backup e recuperação</h3><p id="rd_uso">localStorage: ${Math.ceil(smLocalBytes()/1024)} KB · Consultando armazenamento…</p><button type="button" class="b s" onclick="rdPersistir(this)">Proteger armazenamento neste aparelho</button><p id="rd_persist"></p><p><a href="https://github.com/${esc(BCBR.REPO)}/tree/backups" target="_blank" rel="noopener noreferrer">Abrir backup diário</a></p><p>Escolha a data no branch backups e baixe a cópia do plano.<br>Para recuperar um texto, copie-o dessa versão e salve na tarefa ou nota correspondente.</p><button type="button" class="b" onclick="rdBaixar()">Baixar cópia agora</button></div>`}
async function rdUsoAtualiza(){
  let idb='IDB estimado: indisponível',persist='Persistência não informada pelo navegador.';
  try{const e=await navigator.storage?.estimate();if(e){const n=e.usageDetails?.indexedDB;idb=n!==undefined?'IDB estimado: '+Math.ceil(n/1024)+' KB':'Armazenamento da origem (IDB + caches): '+Math.ceil((e.usage||0)/1024)+' KB; IDB separado indisponível'}}catch(e){}
  try{if(navigator.storage?.persisted)persist=await navigator.storage.persisted()?'Armazenamento persistente concedido.':'Armazenamento sujeito à limpeza pelo navegador.'}catch(e){}
  const el=document.getElementById('rd_uso');if(el)el.textContent='localStorage: '+Math.ceil(smLocalBytes()/1024)+' KB · '+idb;
  const p=document.getElementById('rd_persist');if(p)p.textContent=persist;
}
async function rdPersistir(botao){
  botao.disabled=true;let msg;
  try{msg=navigator.storage?.persist?(await navigator.storage.persist()?'Armazenamento persistente concedido.':'O navegador não concedeu persistência. Mantenha uma cópia baixada.'):'Este navegador não oferece armazenamento persistente.'}catch(e){msg='Não foi possível pedir persistência neste navegador.'}
  const el=document.getElementById('rd_persist');if(el)el.textContent=msg;botao.disabled=false;
}
function rdOfertaCopia(){
  if(document.getElementById('rd_copia_cota'))return;
  const ov=rdJanela('Armazenamento cheio',`<p>localStorage: ${Math.ceil(smLocalBytes()/1024)} KB. A edição continua aberta. Baixe uma cópia antes de fechar.</p><button type="button" class="b" id="rd_copia_cota">Baixar cópia</button>`);
  ov.querySelector('#rd_copia_cota').onclick=rdBaixar;
}
function rdBaixar(){
  if(typeof ntAntes==='function')ntAntes();if(typeof pgTituloSalva==='function')pgTituloSalva();
  if(!SM.d){toast('O plano ainda não está disponível.');return}
  const copia=rdCopia(SM.d);
  // Se a fila não coube, o editor continua sujo e SM.d ainda tem a versão anterior.
  // Exporta também esse texto sem confirmar a fila nem alterar o plano em memória.
  for(const c of [typeof NT==='undefined'?null:NT,typeof NP==='undefined'?null:NP]){
    const pagina=c?.pagina&&copia.notasPaginas?.paginas?.find(p=>p.id===c.pagina);
    if(pagina&&c.titulo)pagina.titulo=c.titulo.value;
    if(!c?.ed||!c.sujo)continue;
    const doc={v:1,blocos:ntBlocos(c.ed.getJSON(),c.shown||[])};
    if(c.pagina){if(pagina)pagina.doc=doc}
    else copia.notasDoc=doc;
  }
  const url=URL.createObjectURL(new Blob([JSON.stringify(copia,null,2)],{type:'application/json;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='radio-plano-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
window.addEventListener('pageshow',()=>smPuxar());
window.addEventListener('online',rdPinta);window.addEventListener('offline',rdPinta);
window.addEventListener('storage',e=>{if(e.key===RD_CHAVE)rdPinta()});
setInterval(rdPinta,1000);setTimeout(()=>{rdGuardar(rdLer());rdPinta()},0);
