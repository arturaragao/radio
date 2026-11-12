// Radio 1.48: estado de salvamento e exportação explícita; sem diário/detector de perda.
const RD={ultima:0,enviando:0,erro:''};
function rdGancho(acao,a){
  if(acao==='inicio')RD.enviando++;
  if(acao==='fim')RD.enviando=Math.max(0,RD.enviando-(a||1));
  if(acao==='confirmou'||acao==='leitura'){RD.ultima=Date.now();RD.erro=''}
  if(acao==='erro')RD.erro=a?.message||'Falha de sincronização';
  rdPinta();
}
function rdEstado(){
  const s=SyncNotas.estado();
  if(s.volatil)return 'Pendente — mantenha esta aba aberta';
  if(navigator.onLine===false||window.BCBR?.semRede)return 'Pendente — sem conexão';
  if(s.erro||SM.erro||RD.erro)return s.erro||SM.erro||RD.erro;
  if(s.pendentes||s.enviando||SM.sujo||RD.enviando)return 'Enviando…';
  return s.ultima||RD.ultima?'Salvo ✓':'Aguardando sincronização';
}
function rdPinta(){const e=document.getElementById('rd_sync');if(e){e.textContent=rdEstado();e.title=rdEstado()}}
function rdJanela(titulo,html){const ov=ntModal('rd-modal',`<div class="nt-modal-t"><b>${esc(titulo)}</b><button type="button" class="nt-x" aria-label="Fechar">✕</button></div>${html}`);ov.querySelector('.nt-x').onclick=()=>ntModalFecha(ov);return ov}
async function rdSincronizar(){ntAntes();if(SM.sujo)await smMudar(()=>{},'sincronização manual');await SyncNotas.enviar();await smPuxar();rdPinta()}
function rdSyncAbre(){const ov=rdJanela('Sincronização',`<p>${esc(rdEstado())}</p><button class="b" data-sync>Sincronizar agora</button>`);ov.querySelector('[data-sync]').onclick=async e=>{e.target.disabled=true;try{await rdSincronizar();ntModalFecha(ov)}finally{e.target.disabled=false}}}
function rdUsoLocal(){
  const chaves=[];let bytes=0,erro=false;
  try{for(let i=0;i<localStorage.length;i++){const chave=localStorage.key(i);if(chave===null)continue;const valor=localStorage.getItem(chave);if(valor===null)continue;const tamanho=(chave.length+valor.length)*2;bytes+=tamanho;chaves.push({chave,bytes:tamanho})}}catch(e){erro=true}
  chaves.sort((a,b)=>b.bytes-a.bytes||a.chave.localeCompare(b.chave));return {bytes,chaves:chaves.slice(0,8),erro};
}
const rdKB=bytes=>(bytes/1024).toFixed(1);
async function rdStorageAtualiza(){
  // Cede ao render síncrono de Ajustes. Uma tentativa de persistência por sessão, mesmo se falhar.
  await Promise.resolve();
  if(!RD.persistTentada){RD.persistTentada=true;try{RD.persist=typeof navigator.storage?.persist==='function'?await navigator.storage.persist():null}catch(e){RD.persist=null}}
  let texto='Estimativa do navegador indisponível.';
  try{if(typeof navigator.storage?.estimate==='function'){const e=await navigator.storage.estimate();if(Number.isFinite(e.usage)&&Number.isFinite(e.quota))texto=`Armazenamento da origem (navegador): ${rdKB(e.usage)} KB usados / ${rdKB(e.quota)} KB de cota.`}}catch(e){}
  texto+=' Armazenamento persistente: '+(RD.persist===true?'concedido.':RD.persist===false?'não concedido.':'indisponível.');
  const el=document.getElementById('rd_estimativa');if(el)el.textContent=texto;
}
function rdBackupHtml(){
  const uso=rdUsoLocal();rdStorageAtualiza();
  return `<div class="card"><h3>Backup e recuperação</h3><p><a href="https://github.com/${esc(BCBR.REPO)}/tree/backups" target="_blank" rel="noopener noreferrer">Abrir backup diário</a></p><p>Páginas: use Versões no menu da página. A cópia abaixo inclui as páginas disponíveis online e as pendentes deste aparelho.</p><button type="button" class="b" onclick="rdBaixar()">Baixar cópia agora</button><p>localStorage: ${uso.erro?'leitura indisponível':rdKB(uso.bytes)+' KB usados'} (estimativa UTF-16 de chaves e valores).</p><p>8 maiores chaves:</p><ol style="overflow-wrap:anywhere">${uso.chaves.map(c=>`<li>${esc(c.chave)}: ${rdKB(c.bytes)} KB</li>`).join('')}</ol><p id="rd_estimativa" aria-live="polite">Consultando armazenamento do navegador…</p></div>`;
}

async function rdBaixar(){
  ntAntes();const paginas=[];
  try{for(const p of await SyncNotas.listarPaginas())paginas.push(await SyncNotas.abrirPagina(p.id));
    const url=URL.createObjectURL(new Blob([JSON.stringify({plano:SM.d,paginas},null,2)],{type:'application/json;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='radio-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){toast('Não foi possível completar a cópia: '+e.message)}
}
window.addEventListener('pageshow',()=>smPuxar());
window.addEventListener('online',rdPinta);window.addEventListener('offline',rdPinta);
setInterval(rdPinta,1000);
