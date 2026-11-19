// Radio 1.65.0: estado unificado de sincronização, faixa fixa, detalhes, exportação de pendências e chave em Config > Sincronização.
const RD={ultima:0,enviando:0,erro:''};
function rdGancho(acao,a){
  if(acao==='inicio')RD.enviando++;
  if(acao==='fim')RD.enviando=Math.max(0,RD.enviando-(a||1));
  if(acao==='confirmou'||acao==='leitura'){RD.ultima=Date.now();RD.erro=''}
  if(acao==='erro')RD.erro=typeof RadioFila!=='undefined'?RadioFila.descreveErro(a):(a?.message||'Falha de sincronização');
  if(typeof RadioFila!=='undefined')RadioFila.atualizaUI();else rdPinta();
}
function rdEstado(){
  if(typeof RadioFila!=='undefined')return RadioFila.estadoResumo().texto;
  const s=SyncNotas.resumo?SyncNotas.resumo():SyncNotas.estado();
  if(s.volatil)return 'Pendente — mantenha esta aba aberta';
  if(navigator.onLine===false||window.BCBR?.semRede)return 'Sem internet';
  if((window.BCBR?.pausaAte||0)>Date.now()&&window.BCBR?.limiteMsg)return window.BCBR.limiteMsg;
  if(s.erro||SM.erro||RD.erro)return s.erro||SM.erro||RD.erro;
  if(s.pendentes||s.enviando||SM.sujo||RD.enviando)return 'Salvando…';
  return s.ultima||RD.ultima?'Sincronizado':'Aguardando sincronização';
}
function rdPinta(est){
  const e=document.getElementById('rd_sync');if(!e)return;
  const r=est||(typeof RadioFila!=='undefined'?RadioFila.estadoResumo():{texto:rdEstado(),cls:''});
  if(e.textContent!==r.texto)e.textContent=r.texto;
  if(e.title!==r.texto)e.title=r.texto;
  e.classList.toggle('rd-erro',r.cls==='err');
  e.classList.toggle('rd-pend',r.cls==='pend'||r.cls==='saving');
  e.classList.toggle('rd-ok',r.cls==='ok');
}
function rdJanela(titulo,html){const ov=ntModal('rd-modal',`<div class="nt-modal-t"><b>${esc(titulo)}</b><button type="button" class="nt-x" aria-label="Fechar">✕</button></div>${html}`);ov.querySelector('.nt-x').onclick=()=>ntModalFecha(ov);return ov}
async function rdTentarAgora(){
  if(typeof ntAntes==='function')ntAntes();
  if(typeof RadioFila!=='undefined')await RadioFila.tentarAgora('manual');
  else await rdSincronizar();
}
async function rdSincronizar(){
  if(typeof ntAntes==='function')ntAntes();
  if(typeof RadioFila!=='undefined'){await RadioFila.tentarAgora('manual');await smPuxar();RadioFila.atualizaUI();return}
  if(SM.sujo)await smMudar(()=>{},'sincronização manual');
  await SyncNotas.enviar();await smPuxar();rdPinta();
}
function rdIrConfigSync(){
  document.querySelectorAll('.nt-modal').forEach(m=>{try{ntModalFecha(m)}catch(e){m.remove()}});
  if(typeof cfgTab!=='undefined')cfgTab='sync';
  if(typeof go==='function')go('config');
}
function rdExportarPendencias(){
  try{
    const dados=typeof RadioFila!=='undefined'?RadioFila.exportarObjeto():{geradoEm:new Date().toISOString(),pendentes:[]};
    const stamp=new Date().toISOString().slice(0,16).replace(/[:T]/g,'-');
    const url=URL.createObjectURL(new Blob([JSON.stringify(dados,null,2)],{type:'application/json;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`radio-pendencias-${stamp}.json`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    if(typeof toast==='function')toast('Pendências exportadas');
  }catch(e){if(typeof toast==='function')toast('Não foi possível exportar: '+e.message)}
}
function rdFormataIdade(ms){
  const s=Math.max(0,Math.floor(ms/1000));
  if(s<60)return 'agora';
  const m=Math.floor(s/60);
  if(m<60)return `há ${m} min`;
  const h=Math.floor(m/60);
  return `há ${h} h ${m%60} min`;
}
function rdRenderDetalhesHtml(){
  const est=typeof RadioFila!=='undefined'?RadioFila.estadoResumo():{texto:rdEstado(),chaveErro:false,pendentes:0};
  const itens=typeof RadioFila!=='undefined'?RadioFila.listar(false):[];
  const agora=Date.now();
  const tipoLab={nota:'Nota',progresso:'Progresso',semana:'Semana'};
  const listaHtml=itens.length
    ?`<ul class="rd-lista">${itens.map(it=>`<li><span class="rd-tag">${esc(tipoLab[it.tipo]||it.tipo)}</span> <span class="rd-it-t">${esc(it.titulo)}</span> <span class="mut">(${esc(rdFormataIdade(agora-(it.criadoEm||agora)))})</span>${it.detalhe?`<div class="mut rd-it-d">${esc(it.detalhe)}</div>`:''}${it.erro?`<div class="rd-it-e">${esc(it.erro)}</div>`:''}</li>`).join('')}</ul>`
    :'<p class="mut">Nenhuma alteração pendente. Tudo confirmado no GitHub.</p>';
  return `<p class="rd-det-st"><b>Estado:</b> ${esc(est.texto)}</p>
    <div class="row" style="margin:10px 0">
      <button type="button" class="b" data-sync>Tentar agora</button>
      <button type="button" class="b s" data-exp>Exportar pendências</button>
      ${est.chaveErro?'<button type="button" class="b s" onclick="rdIrConfigSync()">Config › Sincronização</button>':''}
    </div>
    <h3>Pendentes (${itens.length})</h3>${listaHtml}`;
}
function rdSyncAbre(){
  const ov=rdJanela('Sincronização',`<div id="rd_det_box">${rdRenderDetalhesHtml()}</div>`);
  const liga=()=>{
    const bSync=ov.querySelector('[data-sync]'),bExp=ov.querySelector('[data-exp]');
    if(bExp)bExp.onclick=()=>rdExportarPendencias();
    if(bSync)bSync.onclick=async e=>{
      e.target.disabled=true;
      try{await rdTentarAgora()}finally{
        const box=ov.querySelector('#rd_det_box');
        if(box){box.innerHTML=rdRenderDetalhesHtml();liga()}
      }
    };
  };
  liga();
}
function rdCfgSyncHtml(){
  const tk=(()=>{try{return localStorage.getItem('bcbr_gh_token')||''}catch(e){return ''}})();
  const est=typeof RadioFila!=='undefined'?RadioFila.estadoResumo():{texto:rdEstado(),pendentes:0};
  return `<div class="card"><h3>Chave do GitHub (banco-cbr-app)</h3>
    <p class="mut">Token fine-grained com permissão <b>Contents: Read and write</b> no repositório <b>${esc(typeof BCBR!=='undefined'?BCBR.REPO:'banco-cbr-app')}</b>.</p>
    <p class="mut">Estado atual: <b>${esc(est.texto)}</b></p>
    <label style="display:block;margin-bottom:10px">Chave atual<input id="cfg_gh_tk" type="password" style="width:100%" value="${esc(tk)}" placeholder="ghp_... ou github_pat_..."></label>
    <div class="row">
      <button type="button" class="b" onclick="rdCfgSalvaChave()">Salvar chave</button>
      <button type="button" class="b s" onclick="rdCfgTestaChave()">Testar chave</button>
      <button type="button" class="b s" onclick="rdSyncAbre()">Ver pendências (${est.pendentes||0})</button>
    </div>
  </div>`;
}
async function rdCfgSalvaChave(){
  const el=document.getElementById('cfg_gh_tk');if(!el)return;
  const v=el.value.trim();
  if(!v){if(typeof toast==='function')toast('Informe uma chave válida do GitHub.');return}
  try{localStorage.setItem('bcbr_gh_token',v);localStorage.removeItem('bcbr_auth_aviso')}catch(e){}
  try{await window.BCBR?.passarChaveSW?.()}catch(e){}
  window.BCBR?.limpaChaveErro?.();
  if(typeof toast==='function')toast('Chave salva — tentando sincronizar…');
  await rdTentarAgora();
  if(typeof render==='function'&&typeof tela!=='undefined'&&tela==='config')render();
}
async function rdCfgTestaChave(){
  const el=document.getElementById('cfg_gh_tk'),digitada=el?el.value.trim():'';
  const salva=(()=>{try{return localStorage.getItem('bcbr_gh_token')||''}catch(e){return ''}})();
  if(!digitada&&!salva){if(typeof toast==='function')toast('Informe uma chave antes de testar.');return}
  try{
    if(digitada&&digitada!==salva){
      const r=await fetch(`https://api.github.com/repos/${window.BCBR.REPO}`,{cache:'no-store',headers:{Authorization:'Bearer '+digitada,Accept:'application/vnd.github+json'}});
      if(!r.ok)throw new Error('GitHub '+r.status);
      if(typeof toast==='function')toast('Chave válida! Clique em Salvar chave para aplicar.');
    }else{
      window.BCBR?.limpaChaveErro?.();
      await window.BCBR?.api?.(`/repos/${window.BCBR.REPO}`);
      window.BCBR?.limpaChaveErro?.();
      if(typeof toast==='function')toast('Chave válida!');
    }
  }catch(e){
    if(typeof toast==='function')toast('Falha na chave: '+(e?.message||'inválida'));
  }
  if(typeof RadioFila!=='undefined')RadioFila.atualizaUI();
}
function rdUsoLocal(){
  const chaves=[];let bytes=0,erro=false;
  try{for(let i=0;i<localStorage.length;i++){const chave=localStorage.key(i);if(chave===null)continue;const valor=localStorage.getItem(chave);if(valor===null)continue;const tamanho=(chave.length+valor.length)*2;bytes+=tamanho;chaves.push({chave,bytes:tamanho})}}catch(e){erro=true}
  chaves.sort((a,b)=>b.bytes-a.bytes||a.chave.localeCompare(b.chave));return {bytes,chaves:chaves.slice(0,8),erro};
}
const rdKB=bytes=>(bytes/1024).toFixed(1);
async function rdStorageAtualiza(){
  await Promise.resolve();
  if(!RD.persistTentada){RD.persistTentada=true;try{RD.persist=typeof navigator.storage?.persist==='function'?await navigator.storage.persist():null}catch(e){RD.persist=null}}
  let texto='Estimativa do navegador indisponível.';
  try{if(typeof navigator.storage?.estimate==='function'){const e=await navigator.storage.estimate();if(Number.isFinite(e.usage)&&Number.isFinite(e.quota))texto=`Armazenamento da origem (navegador): ${rdKB(e.usage)} KB usados / ${rdKB(e.quota)} KB de cota.`}}catch(e){}
  texto+=' Armazenamento persistente: '+(RD.persist===true?'concedido.':RD.persist===false?'não concedido.':'indisponível.');
  const el=document.getElementById('rd_estimativa');if(el)el.textContent=texto;
}
function rdBackupHtml(){
  const uso=rdUsoLocal();rdStorageAtualiza();
  return `<div class="card"><h3>Backup e recuperação</h3><p><a href="https://github.com/${esc(BCBR.REPO)}/tree/backups" target="_blank" rel="noopener noreferrer">Abrir backup diário</a></p><p>Páginas: use Versões no menu da página. A cópia abaixo inclui as páginas disponíveis online e as pendentes deste aparelho.</p><button type="button" class="b" onclick="rdBaixar()">Baixar cópia agora</button> <button type="button" class="b s" onclick="rdExportarPendencias()">Exportar pendências</button><p>localStorage: ${uso.erro?'leitura indisponível':rdKB(uso.bytes)+' KB usados'} (estimativa UTF-16 de chaves e valores).</p><p>8 maiores chaves:</p><ol style="overflow-wrap:anywhere">${uso.chaves.map(c=>`<li>${esc(c.chave)}: ${rdKB(c.bytes)} KB</li>`).join('')}</ol><p id="rd_estimativa" aria-live="polite">Consultando armazenamento do navegador…</p></div>`;
}
async function rdBaixar(){
  ntAntes();const paginas=[];
  try{for(const p of await SyncNotas.listarPaginas())paginas.push(await SyncNotas.abrirPagina(p.id));
    const url=URL.createObjectURL(new Blob([JSON.stringify({plano:SM.d,paginas},null,2)],{type:'application/json;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='radio-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){toast('Não foi possível completar a cópia: '+e.message)}
}
window.addEventListener('pageshow',()=>smPuxar());
window.addEventListener('online',()=>rdPinta());window.addEventListener('offline',()=>rdPinta());
setInterval(()=>rdPinta(),1000);
