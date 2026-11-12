// ===== ABA SEMANA = CALENDÁRIO DO MÊS (pedido do Artur, 21/10/2026) =====
// Dados: semana/plano.json no repo privado banco-cbr-app (mesma chave do app). Formato v2:
//  {v:2, regras, subtitulo, dias:{"AAAA-MM-DD":{agenda,tipo?,meta?}}, tarefas:[{id,dia,texto,area,sub?,feito,feitoEm,ordem,grupo?,auto?,adiado?}], notas:[...], tipos?:[{id,nome,subs?:[]}]}
// dia:'sem' = tarefa sem data (célula "Sem data" acima do calendário; fora da meta, das bolinhas e do "ficou para trás"). 'proxima' = adiada para a semana nova.
// tipos (criados pela tela): padrão Estudo, Ferramenta, Tarefas (subtema Casamento) quando faltar.
// tipo: "estudo" | "sobreaviso" | "descanso". Sem tipo: plantão BR = estudo (até sáb/dom/feriado); sáb/dom/feriado sem BR = descanso; resto (inclusive HSI em dia útil) = estudo. "sobreaviso" só se escolhido no dia.
// Dia também tem tema?, foco?, noite? (BR|HSI|''; sem = pela agenda), feriado? (sem = lista fixa). estagios:{"AAAA-MM":"RM MSK"} = estágio do mês.
// Meta de questões automática só nos dias de estudo (plantão na Ecomax conta como estudo). Descanso e sobreaviso: sem cor, sem meta.
// A revisão de domingo (tarefa agendada do Claude) preenche a agenda das próximas semanas pelo Google Agenda e põe os itens da semana nova.
const SM={d:null,sha:null,ok:false,erro:'',ed:null,add:{},dr:{},ab:new Set(),sel:null,sem:null,mes:null,plan:false,semAdd:null,conf:null,fila:Promise.resolve(),lote:[],auto:new Set(),fr:[]};
const SM_ARQ='semana/plano.json',SM_VELHO='semana/atual.json';
// O shim hidrata o espelho antes de carregar app.js. Sem IDB, mantém o caminho localStorage.
const smArmazem=globalThis.BCBR?.grandes||localStorage;
// Grava no localStorage; se a cota estourar, libera as cópias grandes já confirmadas no IDB e tenta uma vez mais.
function smLsGrava(k,v){try{localStorage.setItem(k,v)}catch(e){if(!smCota(e)||!smArmazem.liberar?.())throw e;localStorage.setItem(k,v)}}
const smCota=e=>e?.name==='QuotaExceededError'||e?.name==='NS_ERROR_DOM_QUOTA_REACHED';
function smLocalBytes(){let n=0;for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);n+=2*(k.length+(localStorage.getItem(k)||'').length)}return n}
function smErroLocal(e,acao='salvar as notas'){
  if(!smCota(e))return 'Não foi possível '+acao+' neste aparelho ('+(e?.name||'erro de armazenamento')+'). Baixe uma cópia em Ajustes.';
  let uso='indisponível';try{uso=Math.ceil(smLocalBytes()/1024)+' KB'}catch(x){}
  try{if(typeof rdOfertaCopia==='function')rdOfertaCopia()}catch(x){} // aviso nunca pode interromper a retenção do editor sujo
  return 'Sem espaço para '+acao+' neste aparelho. localStorage: '+uso+'. Baixar cópia em Ajustes › Backup e recuperação.';
}
function smGravaGrande(k,v){
  const falha=e=>{SM.erroLocal=smErroLocal(e,'guardar a cópia local');if(typeof toast==='function')toast(SM.erroLocal);return false};
  try{return Promise.resolve(smArmazem.setItem(k,v)).then(()=>true,falha)}catch(e){return Promise.resolve(falha(e))}
}
try{SM.ab=new Set(JSON.parse(localStorage.getItem('sm_abertas')||'[]'))}catch(e){}
try{const c=JSON.parse(smArmazem.getItem('sm_cache2')||'null');if(c&&c.d&&c.d.v===2){SM.d=c.d;SM.sha=c.sha;SM.ok=true}}catch(e){}
// 1.42: alterações feitas sem conexão. Se a gravação falha por falta de rede, SM.sujo (e localStorage sm_sujo) lembra que o plano local tem o que o GitHub não tem;
// SM.base = último plano que o GitHub tinha (texto JSON; vai para sm_base2 quando fica sujo). Quando o plano remoto mudou nesse meio tempo, smMerge3 refaz as alterações
// locais POR CIMA dele (em vez de jogá-las fora) e elas sobem sozinhas ao voltar a conexão. Notas/páginas/frases têm a fusão própria do notas.js.
try{const sj=localStorage.getItem('sm_sujo');SM.sujo=sj!==null;SM.sujoDesde=+sj||0;SM.base=SM.sujo?smArmazem.getItem('sm_base2'):(SM.d?JSON.stringify(SM.d):null)}catch(e){}
const smPlano=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const smIgual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const SM_MERGE_FORA=new Set(['notasDoc','notasPaginas','notasFrases','notas_conflitos']);
// Três vias (b = base, l = local, r = remoto). Objetos: por chave; listas de objetos: por id (apagado de um lado e intacto do outro apaga; editado do outro lado fica; itens sem id:
// os do remoto ficam e os locais novos entram). Escalar mudado dos dois lados: vale o lado cujo item tem \`atualizado\` (ou \`em\`) mais novo; sem carimbo, o local.
// sb = {desde} quando a base se perdeu: não dá para saber o que o remoto apagou, então só entra item local criado depois de \`desde\` (os ids vêm da hora), nada é ressuscitado.
const smCarimbo=x=>smPlano(x)?String(x.atualizado||x.em||''):'';
function smMerge3(b,l,r,topo=true,car=null,sb=null){
  if(smIgual(l,r))return r;
  if(l===undefined)return smIgual(b,r)?undefined:r;
  if(r===undefined)return smIgual(b,l)?undefined:l;
  if(smIgual(b,l))return r;
  if(smIgual(b,r))return l;
  if(smPlano(l)&&smPlano(r)){
    const o={},bb=smPlano(b)?b:{},cl=smCarimbo(l),cr=smCarimbo(r),c=cl&&cr?{l:cl,r:cr}:car;
    for(const k of new Set([...Object.keys(r),...Object.keys(l)])){
      const v=topo&&SM_MERGE_FORA.has(k)?r[k]:smMerge3(bb[k],l[k],r[k],false,c,sb);
      if(v!==undefined)o[k]=v;
    }
    return o;
  }
  const objs=a=>Array.isArray(a)&&a.length>0&&a.every(smPlano),temId=x=>typeof x.id==='string';
  if(objs(l)&&objs(r)&&(b===undefined||Array.isArray(b))&&(l.some(temId)||r.some(temId))){
    const bl=Array.isArray(b)?b:[],B=new Map(bl.filter(temId).map(x=>[x.id,x])),Lm=new Map(l.filter(temId).map(x=>[x.id,x])),Rm=new Map(r.filter(temId).map(x=>[x.id,x])),out=[];
    const novoLocal=x=>!sb||(parseInt(x.id.slice(1,9),36)>=sb.desde);   // sem base: só o que nasceu depois de ficar sujo
    for(const x of r){
      if(!temId(x)){out.push(x);continue}   // sem id: o remoto fica
      const v=smMerge3(B.get(x.id),Lm.get(x.id),x,false,null,sb);if(v!==undefined)out.push(v);
    }
    for(const x of l){
      if(!temId(x)){if(!r.some(y=>smIgual(y,x)))out.push(x);continue}   // sem id: o local novo entra (sem repetir)
      if(!Rm.has(x.id)){const v=smMerge3(B.get(x.id),x,undefined,false,null,sb);if(v!==undefined&&(B.has(x.id)||novoLocal(x)))out.push(v)}
    }
    return out;
  }
  if(car&&car.l!==car.r)return car.l>car.r?l:r;   // escalar: o item mais recentemente alterado
  return l;
}
// Funde o plano remoto com o local (SM.d) usando a base guardada; sem base, o modo cauteloso acima.
const smFundePlano=remoto=>smMerge3(SM.base?JSON.parse(SM.base):undefined,SM.d,remoto,true,null,SM.base?null:{desde:SM.sujoDesde||0});
function smSujo(sim){
  SM.sujo=sim;
  try{if(sim){if(localStorage.getItem('sm_sujo')===null){SM.sujoDesde=Date.now();localStorage.setItem('sm_sujo',String(SM.sujoDesde))}if(SM.base)return smGravaGrande('sm_base2',SM.base)}else{localStorage.removeItem('sm_sujo');return smArmazem.removeItem('sm_base2')}}catch(e){SM.erroLocal=smErroLocal(e,'guardar a cópia local')}
}
// Sobe o que ficou só neste aparelho (voltou a conexão, ou o plano remoto acabou de ser fundido com o local).
function smEnviaSujo(){
  if(!SM.d||!SM.sujo||SM.enviandoSujo||navigator.onLine===false)return;
  SM.enviandoSujo=true;smMudar(()=>{},'alterações feitas sem conexão').finally(()=>{SM.enviandoSujo=false});
}
const smDec=s=>decodeURIComponent(escape(atob(String(s).replace(/\n/g,''))));
const smId=()=>'x'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const smHoje=()=>dKey(Date.now());
const smDOW=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const smMES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const smDt=iso=>{const[y,m,d]=iso.split('-').map(Number);return new Date(y,m-1,d,12)};
const smMais=(iso,n)=>{const x=smDt(iso);x.setDate(x.getDate()+n);return dKey(+x)};
const smRot=iso=>{if(iso==='proxima')return'Sem dia';if(iso==='sem')return'Sem data';const x=smDt(iso);return smDOW[x.getDay()]+' '+x.getDate()};
const smRotL=iso=>{const x=smDt(iso);return smDOW[x.getDay()]+' '+x.getDate()+'/'+String(x.getMonth()+1).padStart(2,'0')};
const smDom=iso=>smMais(iso,-smDt(iso).getDay()); // domingo a sábado
const smSemana=iso=>{const s=smDom(iso);return Array.from({length:7},(_,i)=>smMais(s,i))};
const smNumSem=iso=>{const x=smDt(smDom(iso)),a=smDt(smDom(`${x.getFullYear()}-01-01`));return Math.floor((Math.round((x-a)/DAY))/7)+1}; // semana iniciada no domingo
function smGuardaCache(){return smGravaGrande('sm_cache2',JSON.stringify({sha:SM.sha,d:SM.d}))}

// ---------- leitura / gravação ----------
// Contents omite o base64 acima de 1 MB; o blob identificado pelo SHA mantém a mesma versão (inclusive no histórico).
async function smLerArquivo(path=SM_ARQ,opts={}){
  const f=await BCBR.api(`/repos/${BCBR.REPO}/contents/${path}`,opts);
  if(f.naoMudou)return f;
  if(f.encoding==='none'||(!f.content&&f.size>0)){
    if(!f.sha)throw new Error('arquivo sem SHA');
    const b=await BCBR.api(`/repos/${BCBR.REPO}/git/blobs/${encodeURIComponent(f.sha)}`);
    if(b.encoding!=='base64'||!b.content)throw new Error('blob sem conteúdo base64');
    return {...f,content:b.content,encoding:b.encoding};
  }
  return f;
}
function smErroLeitura(e){
  if(navigator.onLine===false||(!e.status&&(e.name==='TypeError'||/fetch|network|failed to fetch/i.test(e.message||''))))return 'Sem conexão com o GitHub agora; mostrando a última cópia do aparelho.';
  if((e.status===403||e.status===429)&&(e.status===429||BCBR.cota?.rest===0||/rate.?limit|limite de uso|abuse/i.test(e.resp||e.message||'')))return 'Limite de uso do GitHub atingido; tenta de novo em alguns minutos.';
  if(e.status===401||e.status===403)return 'GitHub recusou a chave (401/403) — confira a chave em Ajustes.';
  const motivo=e.name==='SyntaxError'?'JSON inválido':e.name==='URIError'||e.name==='InvalidCharacterError'?'codificação inválida':e.status?'HTTP '+e.status:String(e.message||'resposta inválida').slice(0,100);
  return 'Não consegui ler os dados do GitHub ('+motivo+'); mostrando a última cópia do aparelho.';
}
function smConverte(v){   // semana/atual.json (v1) -> plano v2
  const dias={};(v.dias||[]).forEach(x=>{dias[x.id]={agenda:x.agenda||''}});
  return {v:2,regras:v.regras||'',subtitulo:v.subtitulo||'',dias,tarefas:v.tarefas||[],notas:v.notas||[]};
}
// 1.40: GET condicional (If-None-Match com o ETag da última leitura): 304 não gasta a cota do GitHub e não muda nada. Uma busca por vez.
async function smPuxar(){
  if(SM.puxando&&Date.now()-SM.puxando<30000)return;SM.puxando=Date.now();   // (busca travada há mais de 30 s não bloqueia a próxima)
  try{await smPuxar1()}finally{SM.puxando=0;smEnviaSujo()}
}
async function smPuxar1(){
  smAgendaPuxar();
  if(SM.d&&typeof ntSync==='function'&&ntTemPendentes()&&!await ntSync())return;
  try{
    const g=SM.gravs||0;   // contador de gravações: resposta velha (a gravação começou/terminou durante a busca) é descartada; a próxima busca traz a nova
    const f=await smLerArquivo(SM_ARQ,{etag:SM.d&&SM.sha?SM.etag||'':undefined});
    SM.ok=true;SM.erro='';
    if(f.naoMudou||g!==(SM.gravs||0)){if(g===(SM.gravs||0)&&typeof rdGancho==='function'&&SM.base)rdGancho('leitura',SM.base);return}
    SM.avisoTamanho=f.size>800000?'Dados grandes ('+(f.size/1000000).toFixed(2)+' MB): páginas importadas pesadas deixam a sincronização lenta.':'';
    if(f.sha!==SM.sha){
      if(typeof ntAntes==='function')ntAntes();   // o que está sendo digitado entra na fila ANTES de o plano do GitHub chegar
      const texto=smDec(f.content),remoto=JSON.parse(texto);
      if(typeof rdGancho==='function')rdGancho('leitura',remoto);
      SM.d=SM.sujo?smFundePlano(remoto):remoto;SM.base=texto;if(SM.sujo)smSujo(true);
      if(typeof ntRecebe==='function')ntRecebe(SM.d);SM.sha=f.sha;smGuardaCache();smAuto();smRender();smNativoTarefas()}
    SM.etag=f.etag;
    if(typeof rdGancho==='function'&&SM.base)rdGancho('leitura',SM.base);
  }catch(e){
    console.warn('Leitura do plano no GitHub',e);
    SM.ok=true;
    if(e.status===404){
      try{const f=await BCBR.api(`/repos/${BCBR.REPO}/contents/${SM_VELHO}`);SM.d=smConverte(JSON.parse(smDec(f.content)))}catch(e2){SM.d={v:2,dias:{},tarefas:[],notas:[]}}
      SM.sha=null;smMudar(()=>{},'calendário do mês (primeira vez)');
    }else SM.erro=smErroLeitura(e);
    if(typeof rdGancho==='function')rdGancho('erro',e);
    smRender();
  }
}
function smRender(){if(typeof NTA!=='undefined'&&NTA&&NTA!=='notas')return;   // aba de uma página (?pagina=<id>): o resto do app não é desenhado
  if(['semana','tarefas','notas','hoje'].includes(tela)&&!(tela==='notas'&&document.activeElement?.closest?.('.nt')))render()}
// toda mudança é uma função idempotente: aplica na hora e de novo na gravação (se outro aparelho mudou o arquivo, relê e reaplica)
// 1.40: mudanças que chegam enquanto outra grava (ou no mesmo instante) vão juntas num único commit (SM.lote), sem rajada.
function smMudar(fn,msg,aoSalvar){
  if(SM.ed)smRascEdSalva(SM.ed.id);
  if(!SM.d)return Promise.resolve(false);
  const diario=typeof rdGancho==='function'?rdGancho('antes',SM.d):null;
  fn(SM.d);
  if(typeof rdGancho==='function'){rdGancho('edicao',diario,SM.d);rdGancho('inicio')}
  smGuardaCache();smRender();   // a cópia LS é síncrona; o IDB segue em segundo plano e não adia PUT nem marcadorsmNativoTarefas();
  const item={fn,aoSalvar,msg,feito:false,ok:false};SM.lote.push(item);
  const tarefa=async()=>{
    if(item.feito)return item.ok;   // já saiu junto com a gravação anterior
    const grupo=SM.lote.splice(0),fim=ok=>{grupo.forEach(g=>{g.feito=true;g.ok=ok});if(typeof rdGancho==='function')rdGancho('fim',grupo.length);return ok};
    for(let t=0;t<6;t++){
      try{
        grupo.forEach(g=>g.fn(SM.d));
        if(typeof ntAplica==='function')ntAplica(SM.d,ntPendentes());
        const texto=JSON.stringify(SM.d),body={message:'semana: '+(grupo.length>1?grupo.length+' alterações':msg||'atualização'),content:BCBR.b64(texto),branch:'main'};if(SM.sha)body.sha=SM.sha;
        const salvo=grupo.some(g=>g.aoSalvar)?JSON.parse(smDec(body.content)):null,blocos=SM.d.notasDoc?.blocos,pags=SM.d.notasPaginas?.paginas||[],pastas=SM.d.notasPaginas?.pastas,frases=SM.d.notasFrases||[];   // o que subiu: edições durante o voo do PUT não entram na base
        SM.gravs=(SM.gravs||0)+1;
        const enviadas=typeof rdGancho==='function'?rdGancho('envio',texto):null;
        const r=await BCBR.api(`/repos/${BCBR.REPO}/contents/${SM_ARQ}`,{method:'PUT',body:JSON.stringify(body)});
        if(typeof rdGancho==='function')rdGancho('confirmou',enviadas,texto);
        grupo.forEach(g=>g.aoSalvar&&g.aoSalvar(salvo));
        SM.gravs++;SM.sha=r.content.sha;SM.erro='';SM.base=texto;if(SM.sujo)smSujo(false);smGuardaCache();smNativoTarefas();
        if(typeof ntBaseSalva==='function')ntBaseSalva(blocos,pags,frases,pastas||null);   // o que subiu é a última versão sincronizada das notas
        if(typeof ntSincroniza==='function')ntSincroniza();
        return fim(true);
      }catch(e){
        if(e.status===409||e.status===422){try{const f=await smLerArquivo();if(typeof ntAntes==='function')ntAntes();const texto2=smDec(f.content),remoto=JSON.parse(texto2);if(typeof rdGancho==='function')rdGancho('leitura',remoto);SM.d=SM.sujo?smFundePlano(remoto):remoto;SM.base=texto2;SM.sha=f.sha;if(typeof ntRecebe==='function')ntRecebe(SM.d)}catch(e2){if(typeof rdGancho==='function')rdGancho('erro',e2)}continue}
        if(typeof rdGancho==='function')rdGancho('erro',e);
        SM.erro='Não salvou no GitHub ('+e.message+'). Confira a internet; a mudança fica neste aparelho.';smSujo(true);smRender();return fim(false);
      }
    }
    SM.erro='Não salvou após conflitos no GitHub. Tente novamente.';smRender();return fim(false);
  };
  SM.fila=SM.fila.then(tarefa);return SM.fila;
}

// ---------- tipo do dia, meta e questões ----------
const smDia=iso=>(SM.d&&SM.d.dias&&SM.d.dias[iso])||{};
function smTipo(iso){
  const x=smDia(iso);if(x.tipo)return x.tipo;
  if(smNoite(iso)==='BR')return'estudo';   // plantão BR: estudo, até em fim de semana/feriado
  const w=smDt(iso).getDay();return w===0||w===6||smFeriado(iso)?'descanso':'estudo';   // HSI em dia útil = estudo normal
}
const smProvaIso=()=>DATA_PROVA;
const smRetaIni=()=>{const p=smProvaIso();return p?smMais(p,-(+(PARAM.revisao_final_dias??14))):null};
// dias de estudo de hoje (se hoje for de estudo) até a véspera da reta final — usado pela meta (banco.js › metaDia)
function smDiasEstudoRestantes(){
  const fim=smRetaIni();if(!fim)return null;let n=0;
  for(let x=smHoje();x<fim&&n<400;x=smMais(x,1))if(smTipo(x)==='estudo')n++;
  return n;
}
function smMetaDe(iso){
  if(smTipo(iso)!=='estudo')return 0;
  const hj=smHoje(),r=smRetaIni(),p=smProvaIso();
  if(p&&iso>=p)return 0;
  if(!p)return cfg.diario;
  // Ritmo atual do banco, sem usar a meta gravada nem a lista de revisão congelada.
  // Reserva a reta final; quando ela começa, distribui o restante até a prova.
  const fim=r&&hj<r?r:p;let dias=0;
  for(let x=hj;x<fim;x=smMais(x,1))if(smTipo(x)==='estudo')dias++;
  return Math.ceil(_restantesFM()/Math.max(1,dias));
}
function smQ(dia){let n=0,ok=0;log.forEach(l=>{if(dKey(l.t)===dia){n++;if(l.ok)ok++}});return{n,ok}}
const smMeta=t=>{if((t.area||'estudo')!=='estudo'||t.dia==='sem')return 0;const s=String(t.texto),m=s.match(/(\d+)\s*quest/i);return m?+m[1]:/quest/i.test(s)&&t.dia!=='proxima'?smMetaDe(t.dia):0};
// Atrasadas só mudam de data pela ação explícita da faixa.
function smRolaAplica(d,hj){let n=0;const hoje=new Set(d.tarefas.filter(t=>t.dia===hj&&t.grupo).map(t=>t.grupo)),sai=new Set();
  d.tarefas.forEach(t=>{if(!dataTarefaValida(t.dia)||t.dia>=hj||t.feito)return;n++;
    if(t.grupo&&hoje.has(t.grupo)){sai.add(t.id);return}if(t.grupo)hoje.add(t.grupo);t.dia=hj;t.ordem=200+n});
  if(sai.size)d.tarefas=d.tarefas.filter(t=>!sai.has(t.id));return n}
function smRola(){if(!SM.d)return;const hj=smHoje(),n=smRolaAplica(JSON.parse(JSON.stringify(SM.d)),hj);if(!n)return;
  smMudar(d=>smRolaAplica(d,hj),'pendentes passaram para hoje');toast(n===1?'1 tarefa pendente passou para hoje':n+' tarefas pendentes passaram para hoje')}
function smAuto(){   // marca sozinho "N questões" quando o banco chega à meta do dia
  if(!SM.d)return;const hj=smHoje(),marcar=[];
  SM.d.tarefas.forEach(t=>{const m=smMeta(t);if(!m||t.feito||t.dia>hj||SM.auto.has(t.id))return;if(smQ(t.dia).n>=m){SM.auto.add(t.id);marcar.push(t.id)}});
  const feitoEm=new Date().toISOString();
  if(marcar.length)smMudar(d=>marcar.forEach(id=>{d.tarefas=concluirTarefa(d.tarefas,id,feitoEm,hj);const t=d.tarefas.find(t=>t.id===id);if(t)t.auto=true}),'questões do dia (automático)');
}
function smCor(iso){
  const hj=smHoje();if(iso>hj||smTipo(iso)!=='estudo')return'';
  const m=smMetaDe(iso),n=smQ(iso).n;if(!m)return'';
  if(n>=m)return'c3';if(iso===hj)return'';
  return n===0?'c0':n<m*.6?'c1':'c2';
}
function smRitmo(){   // últimos 5 dias de estudo antes de hoje
  let x=smMais(smHoje(),-1),k=0,f=0,m=0;
  for(let i=0;i<40&&k<5;i++,x=smMais(x,-1))if(smTipo(x)==='estudo'){k++;f+=smQ(x).n;m+=smMetaDe(x)}
  return m?Math.round(f/m*100):null;
}
function smFracos(){   // últimos 14 dias, temas com 3+ respostas e menos de 70% de acerto
  const ini=Date.now()-14*DAY,M={};
  log.forEach(l=>{if(l.t<ini)return;const q=QID[l.q];if(!q||!q._x)return;(q._x.t||[]).forEach(t=>{const x=M[t]??={t,n:0,ok:0};x.n++;if(l.ok)x.ok++})});
  return Object.values(M).filter(x=>x.n>=3&&x.ok/x.n<0.7).sort((a,b)=>a.ok/a.n-b.ok/b.n||b.n-a.n).slice(0,6);
}
function smTreinar(i){const x=SM.fr[i];if(x)iniciar(questoesTema(x.t),'estudo')}
const smAgCurta=a=>/sobreaviso|hsi/i.test(a||'')?'S':/plant|ecomax 7|ecomax.*18/i.test(a||'')?'P':'';

// ---------- tipos e subtemas (Estudo, Ferramenta, Tarefas + os que o Artur criar pela tela) ----------
const SM_TIPOS0=[{id:'ferramenta',nome:'Ferramenta'},{id:'tarefas',nome:'Tarefa',subs:['Casamento']},{id:'estudo',nome:'Estudo'}];
const smTipos=()=>[...(SM.d&&Array.isArray(SM.d.tipos)&&SM.d.tipos.length?SM.d.tipos:SM_TIPOS0)].map(t=>t.id==='tarefas'?{...t,nome:'Tarefa'}:t).sort((a,b)=>{const ordem=['ferramenta','tarefas','estudo'];return (ordem.includes(a.id)?ordem.indexOf(a.id):3)-(ordem.includes(b.id)?ordem.indexOf(b.id):3)});
const smTipoDe=id=>smTipos().find(x=>x.id===id)||SM_TIPOS0.find(x=>x.id===id)||{id,nome:id?id[0].toUpperCase()+id.slice(1):'Estudo'};
const smTipoIco=id=>({estudo:'📚',ferramenta:'🛠️',tarefas:'✅'})[id]||'📌';
const smSlug=n=>String(n).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'tipo';
function smTiposGarante(d){if(!Array.isArray(d.tipos)||!d.tipos.length)d.tipos=JSON.parse(JSON.stringify(SM_TIPOS0));return d.tipos}
function smTipoNovo(nome){   // cria o tipo (se não existir) e devolve o id
  nome=String(nome||'').trim();if(!nome)return null;const ex=smTipos().find(x=>x.nome.toLowerCase()===nome.toLowerCase()),id=ex?ex.id:smSlug(nome);
  if(!ex)smMudar(d=>{const l=smTiposGarante(d);if(!l.some(x=>x.id===id))l.push({id,nome})},'novo tipo');return id;
}
function smSubNovo(tipo,nome){
  nome=String(nome||'').trim();if(!nome)return;
  smMudar(d=>{const t=smTiposGarante(d).find(x=>x.id===tipo);if(!t)return;t.subs=t.subs||[];if(!t.subs.some(x=>x.toLowerCase()===nome.toLowerCase()))t.subs.push(nome)},'novo subtema');
}
// <option> de todos os tipos (e "Tipo › subtema"); valor "tipo" ou "tipo|subtema"
function smOpcoes(sel){return smTipos().map(t=>`<option value="${esc(t.id)}" ${sel===t.id?'selected':''}>${esc(t.nome)}</option>`+(t.subs||[]).map(s=>`<option value="${esc(t.id+'|'+s)}" ${sel===t.id+'|'+s?'selected':''}>${esc(t.nome)} › ${esc(s)}</option>`).join('')).join('')}
const smParseTS=v=>{const i=String(v||'estudo').indexOf('|');return i<0?{area:v||'estudo',sub:''}:{area:v.slice(0,i),sub:v.slice(i+1)}};
// agrupa por tipo (na ordem dos tipos) e subtema; tipos/subtemas antigos que sumiram da lista ainda aparecem
function smAgrupa(its){
  const ord=smTipos().map(t=>t.id);its.forEach(t=>{const a=t.area||'estudo';if(!ord.includes(a))ord.push(a)});const out=[];
  ord.forEach(a=>{const l=its.filter(t=>(t.area||'estudo')===a);if(!l.length)return;const subs=smTipoDe(a).subs||[];
    const ks=['',...subs];l.forEach(t=>{if(t.sub&&!ks.includes(t.sub))ks.push(t.sub)});
    ks.forEach(k=>{const m=ordenarTarefas(l.filter(t=>(t.sub||'')===k));if(m.length)out.push({a,sub:k,l:m})})});
  return out;
}

// ---------- ações ----------
const smTar=id=>SM.d&&SM.d.tarefas.find(t=>t.id===id);
const smGrupo=t=>t.grupo?SM.d.tarefas.filter(x=>x.grupo===t.grupo):[t];
const smItensDe=dia=>ordenarTarefas(SM.d.tarefas.filter(t=>t.dia===dia));
function smSel(iso){SM.diaEditor=iso;SM.ed=null;render()}
const smDiaAtual=()=>SM.sel||smHoje();
function smDiaClique(iso){
  SM.sel=iso;SM.ed=null;document.querySelector('.sm-ed')?.remove();
  // Preserva os botões do calendário entre os dois cliques do dblclick.
  document.querySelectorAll('.sm-cel.sel,.sm-li.sel').forEach(el=>el.classList.remove('sel'));
  document.querySelectorAll(`[data-drop="${iso}"].sm-cel,[data-drop="${iso}"].sm-li`).forEach(el=>el.classList.add('sel'));
  const atual=document.querySelector('.sm-hoje1'),html=tela==='tarefas'?smHojeGrande():'';
  if(atual){if(html)atual.outerHTML=html;else atual.remove()}else if(html)document.querySelector('.sm-cal')?.insertAdjacentHTML('afterend',html);
  SMK.on=true;SMK.i=-1;SMK.id=null;SMK.cel='hoje';smkPinta();
  if(tela==='semana'){
    SM.diaEditor=iso;
    const painel=document.querySelector('.sm > .sm-pan'),html=smPainelDia(iso);
    if(painel)painel.outerHTML=html;else document.querySelector('.sm-cal')?.insertAdjacentHTML('afterend',html);
  }
}
function smSem(seg){SM.sem=SM.sem===seg?null:seg;SM.semAdd=null;SM.conf=null;render()}
function smMesVai(k){const[y,m]=(SM.mes||smHoje().slice(0,7)).split('-').map(Number),x=new Date(y,m-1+k,1,12);SM.mes=dKey(+x).slice(0,7);render()}
// O prazo usa feitoEm, inclusive para itens concluídos automaticamente ou em outro aparelho.
const SM_FEITAS={};
try{Object.assign(SM_FEITAS,JSON.parse(localStorage.getItem('sm_feitas')||'{}'))}catch(e){}
let smFeitasTimer,smFeitasPrazo=Infinity;
const smFeitaHoje=t=>!!t.feito&&!!t.feitoEm&&dKey(+new Date(t.feitoEm))===smHoje();
function smVisiveis(dia){
  const its=smItensDe(dia),agora=Date.now();
  const prazos=its.filter(t=>t.feito).map(t=>+new Date(t.feitoEm)+5000-agora).filter(n=>n>0);
  const prazo=agora+Math.min(...prazos)+20;
  if(prazo<smFeitasPrazo){clearTimeout(smFeitasTimer);smFeitasPrazo=prazo;smFeitasTimer=setTimeout(()=>{smFeitasTimer=null;smFeitasPrazo=Infinity;smRender()},prazo-agora)}
  return its.filter(t=>!t.feito||+new Date(t.feitoEm)+5000>agora||(SM_FEITAS[dia]&&smFeitaHoje(t)));
}
function smFeitasBotao(dia){const n=smItensDe(dia).filter(smFeitaHoje).length;return `<button class="sm-tagb" aria-label="Mostrar ou esconder concluídas hoje" aria-pressed="${!!SM_FEITAS[dia]}" onclick="smFeitasAlterna('${dia}')">✓ ${n}</button>`}
function smFeitasAlterna(dia){SM_FEITAS[dia]=!SM_FEITAS[dia];try{localStorage.setItem('sm_feitas',JSON.stringify(SM_FEITAS))}catch(e){}render()}
function smCheck(id,v,forcar=false){
  const original=smTar(id);if(!original)return Promise.resolve(false);if(!!original.feito===v&&!forcar)return Promise.resolve(true);
  const antes={feito:original.feito,feitoEm:original.feitoEm,auto:original.auto},feitoEm=v?new Date().toISOString():null,hj=smHoje();
  let documento;const novas=new Set();
  const salvo=smMudar(d=>{if(v){
    if(documento!==d){documento=d;novas.clear()}
    const ids=new Set(d.tarefas.map(t=>t.id));d.tarefas=concluirTarefa(d.tarefas,id,feitoEm,hj);
    d.tarefas.forEach(t=>{if(!ids.has(t.id))novas.add(t.id)});
  }else{const t=d.tarefas.find(x=>x.id===id);if(t){t.feito=false;t.feitoEm=null;delete t.auto}}},v?'feito':'desmarcado');
  if(!v)SM.auto.add(id);
  if(v)smDesfazToast('Concluída ·',()=>{SM.auto.add(id);smMudar(d=>{
    const t=d.tarefas.find(x=>x.id===id);if(t&&t.feitoEm===feitoEm){Object.assign(t,antes);d.tarefas=d.tarefas.filter(x=>!novas.has(x.id))}
  },'desfez conclusão')});
  return salvo;
}
function smUrgente(id){const t=smTar(id);if(!t)return;const urg=!t.urg;smMudar(d=>{const x=d.tarefas.find(y=>y.id===id);if(x){if(urg)x.urg=true;else delete x.urg}},'urgência do item')}
function smEdita(id){
  if(SM.ed&&SM.ed.id===id){smEdFecha();return}
  const t=smTar(id);if(!t)return;SM.ed={id,esc:'todos',dias:new Set(smGrupo(t).map(x=>x.dia).filter(x=>x!=='proxima'&&x!=='sem')),conf:false};render();
  const i=document.getElementById('sm_ed_txt');if(i)i.focus();
}
function smChip(set,id,dias){if(id==='*'){if(dias.every(x=>set.has(x)))dias.forEach(x=>set.delete(x));else dias.forEach(x=>set.add(x))}else set.has(id)?set.delete(id):set.add(id);render()}
function smEdChip(id){const t=SM.ed&&smTar(SM.ed.id);t&&smChip(SM.ed.dias,id,smSemana(t.dia==='proxima'||t.dia==='sem'?smHoje():t.dia))}
function smEdEsc(v){if(SM.ed){SM.ed.esc=v;render()}}
function smEdConf(v){if(SM.ed){SM.ed.conf=v;render()}}
function smSalvar(id,textoDireto){
  if(id){const texto=String(textoDireto||'').trim(),t=smTar(id);if(t&&texto&&texto!==t.texto)smMudar(d=>{const x=d.tarefas.find(y=>y.id===id);if(x)x.texto=texto},'editou texto');return}
  const t=smTar(SM.ed&&SM.ed.id);if(!t)return;
  const campo=document.getElementById('sm_ed_txt'),texto=campo.innerText.trim(),textoHtml=smSanitiza(campo.innerHTML),{area,sub}=smParseTS(document.getElementById('sm_ed_area').value);if(!texto)return;
  const extras=smExtrasLer();
  if(extras.repetir?.tipo==='semanal'&&!extras.repetir.dias.length){toast('Escolha pelo menos um dia para repetir.');return}
  const dtEl=document.getElementById('sm_ed_det'),det=dtEl?dtEl.innerText.trim():(t.det||''),detHtml=dtEl?smSanitiza(dtEl.innerHTML).trim():t.detHtml;const dEl=document.getElementById('sm_ed_dia'),nd=dEl?(dEl.value||(/^\d{4}-/.test(t.dia)?'sem':t.dia)):t.dia,mudouDia=!!dEl&&nd!==t.dia;
  const g=smGrupo(t),ligado=g.length>1;
  const aplica=(x,sd)=>{const diaMes=x.repetir?.tipo==='mensal'?x.repetir.diaMes:null;Object.assign(x,extras);x.texto=texto;x.textoHtml=textoHtml;x.area=area;if(det)x.det=det;else delete x.det;if(detHtml)x.detHtml=detHtml;else delete x.detHtml;if(sub)x.sub=sub;else delete x.sub;if(sd){x.dia=nd;delete x.grupo;x.ordem=100+SM.d.tarefas.filter(y=>y.dia===nd).length}if(!dataTarefaValida(x.dia))x.hora=null;if(x.repetir?.tipo==='mensal'&&dataTarefaValida(x.dia))x.repetir={...x.repetir,diaMes:!sd&&diaMes?diaMes:+x.dia.slice(8)}};
  if((ligado&&SM.ed.esc==='este')||t.dia==='sem'||(!ligado&&mudouDia)){const id=t.id,sd=mudouDia;smRascEdLimpa();SM.ed=null;smMudar(d=>{const x=d.tarefas.find(y=>y.id===id);if(x)aplica(x,sd)},'editou item');return}
  const semana=new Set(smSemana(t.dia==='proxima'?smHoje():t.dia)),dias=[...SM.ed.dias].filter(x=>semana.has(x));
  if(!dias.length&&t.dia!=='proxima'&&g.every(x=>semana.has(x.dia))){toast('Escolha pelo menos um dia (ou use Excluir).');return}
  const gid=t.grupo||(dias.length>1?'g'+smId():null),tem=new Set(g.map(x=>x.dia)),ids=g.map(x=>x.id);
  const fora=g.filter(x=>semana.has(x.dia)&&!SM.ed.dias.has(x.dia)).map(x=>x.id);   // só mexe nos dias desta semana
  const novos=dias.filter(dia=>!tem.has(dia)).map(dia=>({...t,...(t.subtarefas?{subtarefas:t.subtarefas.map(s=>({...s}))}:{}),id:smId(),dia,texto,textoHtml,area,...(sub?{sub}:{}),...(det?{det}:{}),feito:false,ordem:100+smItensDe(dia).length,...(gid?{grupo:gid}:{})}));
  novos.forEach(n=>aplica(n,false));
  smRascEdLimpa();SM.ed=null;
  smMudar(d=>{d.tarefas=d.tarefas.filter(x=>!fora.includes(x.id));d.tarefas.forEach(x=>{if(ids.includes(x.id)){aplica(x,false);if(gid)x.grupo=gid}});
    novos.forEach(n=>{if(!d.tarefas.some(x=>x.id===n.id))d.tarefas.push({...n})})},'editou item');
}
function smExcluir(){
  const t=smTar(SM.ed&&SM.ed.id);if(!t)return;const ids=(SM.ed.conf==='todos'?smGrupo(t):[t]).map(x=>x.id);smRascEdLimpa();SM.ed=null;
  smMudar(d=>{d.tarefas=d.tarefas.filter(x=>!ids.includes(x.id))},'excluiu item');
}
function smProxEstudo(base){let x=smMais(base,1);for(let i=0;i<60;i++,x=smMais(x,1))if(smTipo(x)==='estudo')return x;return'proxima'}
function smAdiar(id){   // passa para o próximo dia de estudo (pula descanso e sobreaviso)
  const t=smTar(id);if(!t)return;const base=t.dia==='proxima'||t.dia==='sem'||t.dia<smHoje()?smMais(smHoje(),-1):t.dia,alvo=smProxEstudo(base);smRascEdLimpa();SM.ed=null;
  smMudar(d=>{const x=d.tarefas.find(y=>y.id===id);if(!x||x.dia===alvo)return;
    if(x.grupo&&d.tarefas.some(y=>y.id!==id&&y.grupo===x.grupo&&y.dia===alvo)){d.tarefas=d.tarefas.filter(y=>y.id!==id);return}
    x.dia=alvo;x.feito=false;x.adiado=(x.adiado||0)+1;x.ordem=200+d.tarefas.filter(y=>y.dia===alvo).length},'adiou item');
  toast(alvo==='proxima'?'Ficou sem dia':'Passou para '+smRotL(alvo));
}
function smNovos(dias,texto,area,sub,det){const gid=dias.length>1?'g'+smId():null;det=String(det||'').trim();return dias.map(x=>({id:smId(),dia:x,texto,area,...(sub?{sub}:{}),...(det?{det}:{}),feito:false,ordem:100+smItensDe(x).length,...(gid?{grupo:gid}:{})}))}
function smPoe(novos,msg){smMudar(d=>novos.forEach(n=>{if(!d.tarefas.some(x=>x.id===n.id))d.tarefas.push({...n})}),msg)}
function smAddDias(dia){if(SM.add[dia])delete SM.add[dia];else SM.add[dia]=new Set([dia]);render()}
function smAddChip(dia,id){SM.add[dia]&&smChip(SM.add[dia],id,smSemana(dia))}
function smAdd(dia){
  const inp=document.getElementById('sm_add_'+dia),v=(inp&&inp.value||'').trim();if(!v)return;
  const ts=smParseTS(document.getElementById('sm_area_'+dia).value),alvo=SM.add[dia]&&SM.add[dia].size?[...SM.add[dia]]:[dia];
  const dt=document.getElementById('sm_det_'+dia),det=dt?dt.value:'';delete SM.add[dia];delete SM.dr['sm_add_'+dia];delete SM.dr['sm_det_'+dia];if(SM.addDet)delete SM.addDet[dia];smCriaDeTexto(v,{dias:alvo,area:ts.area+(ts.sub?'|'+ts.sub:''),det});
}
function smAgenda(iso,v){v=String(v||'').trim();smMudar(d=>{d.dias[iso]=d.dias[iso]||{};d.dias[iso].agenda=v},'agenda do dia')}
function smTipoMuda(iso,v){smMudar(d=>{d.dias[iso]=d.dias[iso]||{};if(v==='auto')delete d.dias[iso].tipo;else d.dias[iso].tipo=v;delete d.dias[iso].meta},'tipo do dia')}
// semana inteira
function smSemAdd(seg){SM.semAdd=SM.semAdd?null:new Set(smSemana(seg).filter(x=>x>=smHoje()&&smTipo(x)==='estudo'));render()}
function smSemChip(seg,id){SM.semAdd&&smChip(SM.semAdd,id,smSemana(seg))}
function smSemPor(seg){
  const i=document.getElementById('sm_sem_txt'),v=(i&&i.value||'').trim();if(!v||!SM.semAdd||!SM.semAdd.size){toast('Escreva o item e escolha os dias.');return}
  const ts=smParseTS(document.getElementById('sm_sem_area').value),dias=[...SM.semAdd].sort();SM.semAdd=null;delete SM.dr.sm_sem_txt;smPoe(smNovos(dias,v,ts.area,ts.sub),'item na semana');
}
function smSemCopia(seg){
  const its=smSemana(seg).flatMap(smItensDe);if(!its.length){toast('Semana sem itens.');return}
  const mapa={},novos=its.map(t=>{const g=t.grupo?(mapa[t.grupo]??='g'+smId()):null;return{id:smId(),dia:smMais(t.dia,7),texto:t.texto,area:t.area||'estudo',...(t.urg?{urg:true}:{}),...(t.sub?{sub:t.sub}:{}),...(t.det?{det:t.det}:{}),feito:false,ordem:t.ordem??0,...(g?{grupo:g}:{})}});
  smPoe(novos,'copiou a semana');toast(`${novos.length} itens copiados para a semana de ${smRotL(smMais(seg,7))}`);
}
function smSemLimpa(seg){
  const ds=new Set(smSemana(seg)),n=SM.d.tarefas.filter(t=>ds.has(t.dia)&&!t.feito).length;SM.conf=null;
  smMudar(d=>{d.tarefas=d.tarefas.filter(t=>!(ds.has(t.dia)&&!t.feito))},'limpou a semana');toast(n+' itens não feitos apagados');
}
// mês inteiro
function smMesDias(rep,ate,esc){
  const hj=smHoje(),[y,m]=(SM.mes||hj.slice(0,7)).split('-').map(Number),ini=dKey(+new Date(y,m-1,1,12));
  let fim=ate==='prova'&&smProvaIso()?smMais(smProvaIso(),-1):dKey(+new Date(y,m,0,12));const out=[];
  for(let x=ini>hj?ini:hj;x<=fim&&out.length<120;x=smMais(x,1)){
    const w=smDt(x).getDay(),t=smTipo(x);
    if(rep==='estudo'?t==='estudo':rep==='uteis'?w>0&&w<6:rep==='sqs'?[1,3,5].includes(w):rep==='todos'?true:esc&&esc.has(x))out.push(x);
  }
  return out;
}
function smMesPor(){
  const v=(document.getElementById('sm_mes_txt').value||'').trim(),ts=smParseTS(document.getElementById('sm_mes_area').value),rep=document.getElementById('sm_mes_rep').value,ate=document.getElementById('sm_mes_ate').value;
  if(!v){toast('Escreva o item.');return}
  const dias=smMesDias(rep,ate,SM.mesEsc);if(!dias.length){toast('Nenhum dia nesse período.');return}
  delete SM.dr.sm_mes_txt;smPoe(smNovos(dias,v,ts.area,ts.sub),'item no mês');toast(`Item posto em ${dias.length} dias`);
}
function smMesRep(v){SM.mesRep=v;if(v==='escolher'&&!SM.mesEsc)SM.mesEsc=new Set();render()}
function smMesChip(x){SM.mesEsc.has(x)?SM.mesEsc.delete(x):SM.mesEsc.add(x);render()}
function smMesLimpa(){
  const hj=smHoje(),mes=SM.mes||hj.slice(0,7),n=SM.d.tarefas.filter(t=>t.dia.startsWith(mes)&&t.dia>=hj&&!t.feito).length;SM.conf=null;
  smMudar(d=>{d.tarefas=d.tarefas.filter(t=>!(t.dia.startsWith(mes)&&t.dia>=hj&&!t.feito))},'limpou o mês');toast(n+' itens não feitos apagados (de hoje em diante)');
}
function smNota(){
  const i=document.getElementById('sm_nota'),v=(i&&i.value||'').trim();if(!v)return;
  const n={id:smId(),texto:v,em:new Date().toISOString(),...(document.getElementById('sm_fraco').checked?{fraco:true}:{})};delete SM.dr.sm_nota;
  smMudar(d=>{d.notas=d.notas||[];if(!d.notas.some(x=>x.id===n.id))d.notas.push(n)},'anotação');
}
function smNotaFraco(id){smMudar(d=>{const n=(d.notas||[]).find(x=>x.id===id);if(n){if(n.fraco)delete n.fraco;else n.fraco=true}},'tema fraco')}
function smNotaDel(id){smMudar(d=>{d.notas=(d.notas||[]).filter(x=>x.id!==id)},'apagou anotação')}
function smProva(){cfg.prova=DATA_PROVA;persist('_est');render()}

// ---------- telas ----------
const smVal=(id,pad)=>esc(SM.dr[id]??pad??'');
const smTipoNome={estudo:'Estudo',sobreaviso:'Sobreaviso',descanso:'Descanso'};
function smChips(set,mk,dias){return `<div class="sm-chips">${dias.map(x=>`<button type="button" class="sm-chip ${smTipo(x)!=='estudo'?'fraco':''}" aria-pressed="${set.has(x)}" onclick="${mk(x)}">${smRot(x)}</button>`).join('')}<button type="button" class="sm-chip" aria-pressed="${dias.every(x=>set.has(x))}" onclick="${mk('*')}">Todos</button></div>`}
// rascunho da edição de tarefa (localStorage a cada tecla; some ao salvar/cancelar/excluir)
const SM_RASC_ED='bcbr_rasc_edicao';
const smRascEd=id=>{try{const r=JSON.parse(localStorage.getItem(SM_RASC_ED)||'null');return r&&r.id===id?r:null}catch(e){return null}};
function smRascEdSalva(id){
  const g=k=>document.getElementById(k),a=g('sm_ed_txt');if(!a)return;
  if(typeof rdGancho==='function')rdGancho('rascunho',id);
  try{localStorage.setItem(SM_RASC_ED,JSON.stringify({id,texto:a.innerText,textoHtml:smSanitiza(a.innerHTML),det:g('sm_ed_det')?.innerText,detHtml:g('sm_ed_det')?smSanitiza(g('sm_ed_det').innerHTML):undefined,area:g('sm_ed_area').value,dia:g('sm_ed_dia')?g('sm_ed_dia').value:undefined,...smExtrasLer()}))}catch(e){}
}
const smRascEdLimpa=()=>{try{localStorage.removeItem(SM_RASC_ED)}catch(e){}};
function smEdFecha(){smRascEdLimpa();SM.ed=null;render()}
function smEditor(t){
  const rd=smRascEd(t.id)||{};
  const g=smGrupo(t),lig=g.length>1,todos=!lig||SM.ed.esc==='todos',prox=t.dia==='proxima'||t.dia==='sem',sem=smSemana(prox?smHoje():t.dia),outras=g.filter(x=>!sem.includes(x.dia)).length;
  return `<div class="sm-ed" role="dialog" aria-modal="true" aria-label="Editar tarefa">
   <div class="row sm-ed-topo"><h3>Editar tarefa</h3><select id="sm_ed_area" aria-label="Tipo" onchange="smRascEdSalva('${t.id}')">${smOpcoes(rd.area??(t.sub?(t.area||'estudo')+'|'+t.sub:(t.area||'estudo')))}</select><span style="flex:1"></span>${SM.ed.conf?`<span class="sm-conf">${SM.ed.conf==='todos'?`Excluir dos ${g.length} dias?`:'Excluir este item?'}</span><button class="b s sm-ghost" onclick="smEdConf(false)">Não</button><button class="b s sm-del" onclick="smExcluir()">Excluir</button>`:`<button class="b s sm-danger" onclick="smEdConf('este')">${lig?'Excluir só deste dia':'Excluir'}</button>${lig?`<button class="b s sm-danger" onclick="smEdConf('todos')">De todos</button>`:''}<button class="b s sm-ghost" onclick="smEdFecha()" title="Esc ou clique fora">Cancelar</button><button class="b s" onclick="smSalvar()" title="Ctrl+Enter">Salvar</button>`}</div>
   ${smRichCampo('sm_ed_txt','Texto',rd.texto??t.texto,rd.textoHtml??t.textoHtml,t.id)}
   ${smRichCampo('sm_ed_det','Detalhes',rd.det??t.det??'',rd.det!=null?rd.detHtml:t.detHtml,t.id)}
   ${!lig||SM.ed.esc==='este'?`<div class="row"><span class="sm-lbl">Data</span><input type="date" id="sm_ed_dia" class="sm-date" value="${rd.dia!=null?rd.dia:/^\d{4}-/.test(t.dia)?t.dia:''}" aria-label="Data" onchange="smRascEdSalva('${t.id}');render()"><button type="button" class="sm-tagb" onclick="document.getElementById('sm_ed_dia').value='';smRascEdSalva('${t.id}');render()">sem data</button>${t.dia==='proxima'?'<span class="mut">(hoje: sem dia, semana nova)</span>':''}</div>`:''}
   ${smExtrasHtml(t,rd)}
   ${lig?`<div class="row"><span class="sm-lbl">Aplicar em</span><div class="sm-seg"><button type="button" aria-pressed="${SM.ed.esc==='este'}" onclick="smEdEsc('este')">Só neste dia</button><button type="button" aria-pressed="${SM.ed.esc==='todos'}" onclick="smEdEsc('todos')">Todos os ${g.length} dias</button></div></div>`:''}
   ${todos&&!prox?`<span class="sm-lbl">Dias desta semana${outras?` <span class="mut">(+${outras} em outras semanas, ficam como estão)</span>`:''}</span>${smChips(SM.ed.dias,x=>`smEdChip('${x}')`,sem)}`:''}
   <div class="row"><button class="b s sm-ghost" onclick="smAdiar('${t.id}')">Passar para o próximo dia de estudo</button></div>
  </div>`;
}
// texto/det são texto puro (inclusive tags literais); textoHtml/detHtml guardam só HTML sanitizado.
function smSanitiza(html){
  const tpl=document.createElement('template');tpl.innerHTML=String(html||'');
  const limpa=n=>{if(n.nodeType===3)return esc(n.textContent);if(n.nodeType!==1)return'';
    const tag=n.tagName.toLowerCase();if(['script','style','iframe','object','svg','math','template'].includes(tag))return'';
    const filhos=[...n.childNodes].map(limpa).join('');
    if(['b','strong','u'].includes(tag))return `<${tag}>${filhos}</${tag}>`;
    // execCommand legado pode emitir FONT; a saída sempre usa SPAN só com cor.
    const cor=n.style?.color||(tag==='font'?n.getAttribute('color'):'')||'';
    if((tag==='span'||tag==='font')&&/^(#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)$/i.test(cor))return `<span style="color:${cor}">${filhos}</span>`;
    return tag==='br'?'\n':filhos+(['div','p'].includes(tag)?'\n':'');};
  return [...tpl.content.childNodes].map(limpa).join('');
}
const smRichVista=(texto,html)=>html!=null?smSanitiza(html):esc(texto||'');
function smRichCampo(id,nome,texto,html,tid){return `<div class="sm-rich-campo"><span class="sm-lbl">${nome}</span><div class="sm-format" role="toolbar" aria-label="Formatar ${nome}">${[['bold','B','Negrito (Ctrl+B)'],['underline','U','Sublinhado (Ctrl+U)'],['foreColor','●','Cor do tipo (Ctrl+Shift+H)']].map(([cmd,ico,rot])=>`<button type="button" class="sm-tagb" aria-label="${rot}" title="${rot}" onmousedown="event.preventDefault()" onclick="smFormata('${id}','${cmd}')">${ico}</button>`).join('')}</div><div id="${id}" class="sm-rich" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${nome}" onkeydown="smRichTecla(event,this)" onpaste="smRichCola(event)" oninput="smRascEdSalva('${tid}')">${smRichVista(texto,html)}</div></div>`}
function smFormata(id,cmd){
  const el=document.getElementById(id);if(!el)return;const sel=getSelection();
  // Um clique sem seleção aplica só a partir do cursor; nunca formata o campo inteiro.
  if(!sel?.anchorNode||!el.contains(sel.anchorNode)){el.focus();const r=document.createRange();r.selectNodeContents(el);r.collapse(false);sel.removeAllRanges();sel.addRange(r)}
  const area=smParseTS(document.getElementById('sm_ed_area').value).area;
  document.execCommand(cmd,false,cmd==='foreColor'?smCorTexto(area):null);if(SM.ed)smRascEdSalva(SM.ed.id);
}
function smCorTexto(area){
  const fixas={ferramenta:'#a87a12',tarefas:'#368261',estudo:'#5687be'};
  const i=smTipos().filter(t=>!fixas[t.id]).findIndex(t=>t.id===area);
  return fixas[area]||['#af724d','#b26080','#8467bc'][Math.max(0,i)%3];
}
function smRichTecla(e,el){if(e.ctrlKey&&!e.altKey&&(['b','u'].includes(e.key.toLowerCase())||(e.shiftKey&&e.key.toLowerCase()==='h'))){e.preventDefault();e.stopPropagation();smFormata(el.id,e.key.toLowerCase()==='b'?'bold':e.key.toLowerCase()==='u'?'underline':'foreColor')}else if(e.key==='Escape'){e.preventDefault();smEdFecha()}}
function smRichCola(e){e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'))}
function smTexto(t){return `<span class="sm-texto">${t.textoHtml?smSanitiza(t.textoHtml):esc(tituloTarefa(t.texto))}</span>`}
function smItem(t){
  const g=t.grupo?SM.d.tarefas.filter(x=>x.grupo===t.grupo):[t],m=smMeta(t),q=m&&t.dia!=='proxima'&&t.dia!=='sem'?smQ(t.dia):null;
  const ab=SM.ab.has(t.id),filhos=!!(t.sub||t.det||t.detHtml||t.subtarefas?.length),tg=filhos?`<button type="button" class="sm-tg" onclick="event.stopPropagation();smTg('${t.id}')" ondblclick="event.stopPropagation()" aria-expanded="${!!ab}" aria-label="Expandir ou recolher detalhes">${ab?'▾':'▸'}</button>`:'';
  return `<div class="sm-row ${t.feito?'ok':''}" style="--sm-pastel:${qaCor(t.area||'estudo')};--sm-cor:${smCorTexto(t.area||'estudo')}" data-tid="${t.id}" ondblclick="if(!event.target.closest('button,input,a,label,form')){event.stopPropagation();smEdita('${t.id}')}" ><div class="sm-it"><input type="checkbox" aria-label="Concluir tarefa" ${t.feito?'checked':''} onchange="smCheck('${t.id}',this.checked)">${tg}<span class="sm-tx">${smTexto(t)}${g.length>1?` <span class="sm-tag">${g.filter(x=>x.feito).length}/${g.length} dias</span>`:''}${q&&q.n?` <span class="sm-tag ${q.n>=m?'g':''}">banco ${q.n}/${m}</span>`:''}${t.auto?' <span class="sm-tag g">automático</span>':''}</span></div><span class="sm-arrastar" title="Arrastar tarefa" aria-label="Arrastar tarefa">⠿</span>
   ${smMetadados(t)}${ab&&filhos?`<div class="sm-conteudo">${t.sub?`<div class="sm-subtema">${esc(t.sub)}</div>`:''}${t.det||t.detHtml?`<div class="sm-det">${smRichVista(t.det,t.detHtml)}</div>`:''}${t.subtarefas?.length?smSubHtml(t):''}</div>`:''}${t.anexos?.length?smAnexosHtml(t):''}</div>`;
}
function smGrupos(its){
  const g=smAgrupa(its);if(!g.length)return'';
  return `<div class="sm-gs">${g.map(x=>`<div class="sm-grp sm-${esc(x.a)}" data-drop="${esc(x.l[0].dia)}" data-area="${esc(x.a)}" data-sub="${esc(x.sub)}"><span class="sm-lbl">${esc(smTipoDe(x.a).nome)}</span><div class="sm-itens-tipo">${x.l.map(smItem).join('')}</div></div>`).join('')}</div>`;
}
function smAddDet(dia){SM.addDet=SM.addDet||{};SM.addDet[dia]=!SM.addDet[dia];render();const i=document.getElementById(SM.addDet[dia]?'sm_det_'+dia:'sm_add_'+dia);i&&i.focus()}
function smTg(id){SM.ab.has(id)?SM.ab.delete(id):SM.ab.add(id);try{localStorage.setItem('sm_abertas',JSON.stringify([...SM.ab]))}catch(e){}render()}
function smAddLinha(){return ''} // Adição pelo botão flutuante ou duplo clique no dia.
function smTipoSeg(iso){const x=smDia(iso),t=smTipo(iso);
  return `<div class="sm-seg">${['estudo','sobreaviso','descanso'].map(k=>`<button type="button" aria-pressed="${t===k}" onclick="smTipoMuda('${iso}','${k}')">${smTipoNome[k]}</button>`).join('')}</div>${x.tipo?`<button class="sm-tagb" onclick="smTipoMuda('${iso}','auto')" title="Volta ao automático (fim de semana = descanso, HSI = sobreaviso)">automático</button>`:''}`}
// cartão de hoje, grande
function smHojeGrande(){
  const hj=smDiaAtual(),x=smDt(hj),ag=smDia(hj).agenda||'',tp=smTipo(hj),its=smVisiveis(hj);
  if(!smItensDe(hj).length)return '';
  return `<div class="card sm-hoje sm-hoje1" data-drop="${hj}"><div class="sm-hl">
    <div class="sm-hh"><span class="kick">${hj===smHoje()?'Hoje':'Tarefas do dia'}${tp!=='estudo'?` · ${smTipoNome[tp].toLowerCase()}`:''}</span>${smFeitasBotao(hj)}
     <h2>${['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][x.getDay()]}, ${x.getDate()} de ${smMES[x.getMonth()]}</h2>
     <div class="sm-ags">${smNt(smNoite(hj))}${smEvs(hj)}${smEstagio(hj.slice(0,7))?`<span class="sm-agc">${esc(smEstagio(hj.slice(0,7)))}</span>`:''}${smFeriado(hj)?`<span class="sm-fe">${esc(smFeriado(hj))}</span>`:''}${smAgResto(ag)?`<span class="sm-agc">${esc(smAgResto(ag))}</span>`:''}${smDia(hj).tema?`<span class="sm-htm">${esc(smDia(hj).tema)}</span>`:''}${smDia(hj).foco?`<span class="sm-fo">+ ${esc(smDia(hj).foco)}</span>`:''}<button class="sm-tagb" onclick="smSel('${hj}')">editar dia</button></div></div>
    ${smGrupos(its)}${smAddLinha(hj)}</div>
  </div>`;
}
// célula "Sem data" (tarefas com dia:'sem'), acima do calendário; marcável, editável e navegável pelo teclado como as de hoje
function smSemData(){
  const its=smVisiveis('sem');
  return `<div class="card sm-sd" data-drop="sem"><div class="sm-hh"><span class="kick">Tarefas${its.length?` · ${its.filter(t=>t.feito).length}/${its.length}`:''}</span>${smFeitasBotao('sem')}</div>
   ${smGrupos(its)}${smAddLinha('sem')}</div>`;
}
function smPainelDia(iso){
  const x=smDia(iso),its=smItensDe(iso),q=smQ(iso),m=smMetaDe(iso);
  return `<div class="sm-pan" data-drop="${iso}"><div class="row" style="justify-content:space-between"><b>${smRotL(iso)}</b><span class="mut">${q.n} questões${m?` · meta ${m}`:''}</span><button class="b s sm-ghost" onclick="qaAbreDia('${iso}')">+ tarefa</button><button class="sm-edb" onclick="smSel(null)" aria-label="Fechar">×</button></div>
   <div class="row"><input placeholder="Agenda do dia (ex.: Plantão 18–0h)" value="${esc(x.agenda||'')}" onchange="smAgenda('${iso}',this.value)" style="flex:1 1 220px;min-width:0" aria-label="Agenda do dia">${smTipoSeg(iso)}</div>
   <div class="row sm-campos"><input placeholder="Tema do dia (ex.: RM Joelho)" value="${esc(x.tema||'')}" onchange="smCampo('${iso}','tema',this.value)" aria-label="Tema do dia"><input placeholder="Foco específico (ex.: USG tireoide TI-RADS)" value="${esc(x.foco||'')}" onchange="smCampo('${iso}','foco',this.value)" aria-label="Foco do dia"><input placeholder="Feriado" value="${esc(smFeriado(iso))}" onchange="smCampo('${iso}','feriado',this.value)" aria-label="Feriado"></div>
   <div class="row"><span class="sm-lbl">Noite</span><div class="sm-seg">${[['BR','BR plantão'],['HSI','HSI sobreaviso'],['','Nada']].map(([k,n])=>`<button type="button" aria-pressed="${smNoite(iso)===k}" onclick="smCampo('${iso}','noite','${k}')">${n}</button>`).join('')}</div>${x.noite!=null?`<button class="sm-tagb" onclick="smCampo('${iso}','noite','auto')" title="Volta a seguir a agenda">pela agenda</button>`:''}</div>
   ${smEvEditor(iso)}
   ${tela==='semana'?smCalMeta(iso):''}${smGrupos(its)}</div>`;
}
function smPainelSemana(seg){
  const ds=smSemana(seg),hj=smHoje(),meta=ds.reduce((a,x)=>a+smMetaDe(x),0),feitas=ds.reduce((a,x)=>a+smQ(x).n,0),add=SM.semAdd;
  return `<div class="sm-pan"><div class="row"><b>Semana ${smNumSem(seg)} · ${smDt(ds[0]).getDate()}–${smDt(ds[6]).getDate()}/${String(smDt(ds[6]).getMonth()+1).padStart(2,'0')}</b><span class="mut">meta ${meta} questões · feitas ${feitas}</span><span style="flex:1"></span>
    <button class="b s sm-ghost" aria-pressed="${!!add}" onclick="smSemAdd('${seg}')">+ item na semana</button><button class="b s sm-ghost" onclick="smSemCopia('${seg}')">Copiar para a próxima</button>
    ${SM.conf==='sem'?`<span class="sm-conf">Apagar os não feitos?</span><button class="b s sm-ghost" onclick="SM.conf=null;render()">Não</button><button class="b s sm-del" onclick="smSemLimpa('${seg}')">Apagar</button>`:`<button class="b s sm-danger" onclick="SM.conf='sem';render()">Limpar semana</button>`}<button class="sm-edb" onclick="smSem(null)" aria-label="Fechar">×</button></div>
   ${add?`<div class="sm-add"><div class="row"><input id="sm_sem_txt" placeholder="Item para vários dias da semana" value="${smVal('sm_sem_txt')}" oninput="SM.dr[this.id]=this.value" onkeydown="if(event.key==='Enter')smSemPor('${seg}')" style="flex:1;min-width:0"><select id="sm_sem_area" aria-label="Tipo">${smOpcoes()}</select><button class="b s" onclick="smSemPor('${seg}')">Adicionar</button></div>${smChips(add,x=>`smSemChip('${seg}','${x}')`,ds)}</div>`:''}
   <div class="sm-wcs">${ds.map(x=>{const t=smTipo(x),its=smItensDe(x),q=smQ(x);return `<div class="sm-wc ${x===hj?'hoje':''} ${t!=='estudo'?'off':''}" data-drop="${x}"><button class="sm-wch" onclick="smSel('${x}')"><b>${smRot(x)}</b><small>${esc(smDia(x).agenda||smTipoNome[t])}</small>${q.n?`<small>${q.n} q</small>`:''}</button>${its.map(smItem).join('')}<button class="sm-wadd" onclick="smSel('${x}')">+ item</button></div>`}).join('')}</div></div>`;
}
function smPainelMes(){
  const rep=SM.mesRep||'estudo',mes=SM.mes||smHoje().slice(0,7);
  const escolher=rep==='escolher'?`<div class="sm-chips">${smMesDias('todos','mes').map(x=>`<button type="button" class="sm-chip ${smTipo(x)!=='estudo'?'fraco':''}" aria-pressed="${SM.mesEsc.has(x)}" onclick="smMesChip('${x}')">${smRot(x)}</button>`).join('')}</div>`:'';
  return `<div class="sm-pan"><div class="row"><b>Planejar ${smMES[+mes.slice(5)-1]}</b><span class="mut">vale de hoje em diante</span><span style="flex:1"></span><button class="sm-edb" onclick="SM.plan=false;render()" aria-label="Fechar">×</button></div>
   <div class="sm-add"><div class="row"><input id="sm_mes_txt" placeholder="Ex.: Questões do dia · 1 tema de tórax" value="${smVal('sm_mes_txt')}" oninput="SM.dr[this.id]=this.value" style="flex:1 1 220px;min-width:0"><select id="sm_mes_area" aria-label="Tipo">${smOpcoes()}</select></div>
    <div class="row"><select id="sm_mes_rep" onchange="smMesRep(this.value)" aria-label="Repetir">${[['estudo','Dias de estudo (sem descanso e sobreaviso)'],['uteis','Seg a sex'],['sqs','Seg, qua e sex'],['todos','Todo dia'],['escolher','Escolher os dias']].map(([k,n])=>`<option value="${k}" ${rep===k?'selected':''}>${n}</option>`).join('')}</select>
     <select id="sm_mes_ate" aria-label="Até"><option value="mes">até o fim do mês</option>${smProvaIso()?'<option value="prova">até a prova</option>':''}</select><button class="b s" onclick="smMesPor()">Adicionar</button></div>${escolher}
    <p class="mut" style="margin:0">Dica: um item “Questões do dia” (sem número) usa a meta automática de cada dia e marca sozinho.</p></div>
   <div class="row">${SM.conf==='mes'?`<span class="sm-conf">Apagar os itens não feitos do mês (de hoje em diante)?</span><button class="b s sm-ghost" onclick="SM.conf=null;render()">Não</button><button class="b s sm-del" onclick="smMesLimpa()">Apagar</button>`:`<button class="b s sm-danger" onclick="SM.conf='mes';render()">Limpar itens não feitos do mês</button>`}</div></div>`;
}
// ---------- estágio do mês, noite (BR/HSI), feriados, tema do dia (pedido do Artur, 21/10/2026) ----------
const smEstagio=mes=>(SM.d&&SM.d.estagios&&SM.d.estagios[mes])||'';
function smEstagioEdita(mes){
  const v=prompt('Estágio de '+smMES[+mes.slice(5)-1]+' (ex.: RM MSK, USG):',smEstagio(mes));if(v==null)return;
  smMudar(d=>{d.estagios=d.estagios||{};if(v.trim())d.estagios[mes]=v.trim();else delete d.estagios[mes]},'estágio do mês');
}
function smNoite(iso){   // BR = plantão Ecomax · HSI = sobreaviso HSI · '' = nada
  const x=smDia(iso);if(x.noite!=null)return x.noite;const a=x.agenda||'';
  return smPlantao({t:a})||[...(x.ev||[]),...dedupeAgenda(SM.agenda||[],[],iso)].map(smPlantao).find(Boolean)||'';
}
function smPlantao(e){
  const tipo=e.tipo||String(e.c||'').replace(/^escala-/,''),titulo=e.titulo||e.t||'';
  return tipo==='hsi'||/sobreaviso|\bhsi\b/i.test(titulo)?'HSI':['br','br-manha'].includes(tipo)||/plantão|plantao|\bBR\b/i.test(titulo)?'BR':'';
}
function smPascoa(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),dd=(h+l-7*m+114)%31+1;return dKey(+new Date(y,mo-1,dd,12))}
const SM_FER={'01-01':'Confraternização','04-21':'Tiradentes','05-01':'Dia do Trabalho','09-02':'Aniversário de Blumenau','09-07':'Independência','10-12':'N. Sra. Aparecida','11-02':'Finados','11-15':'Proclamação da República','11-20':'Consciência Negra','12-25':'Natal'};
function smFeriadoAuto(iso){
  if(SM_FER[iso.slice(5)])return SM_FER[iso.slice(5)];
  const p=smPascoa(+iso.slice(0,4));
  return iso===smMais(p,-48)||iso===smMais(p,-47)?'Carnaval':iso===smMais(p,-2)?'Sexta-feira Santa':iso===smMais(p,60)?'Corpus Christi':'';
}
const smFeriado=iso=>{const x=smDia(iso);return x.feriado!=null?x.feriado:smFeriadoAuto(iso)};
function smAgResto(a){   // o que sobra da agenda depois de tirar Ecomax do dia, plantão e sobreaviso (já aparecem como estágio/BR/HSI)
  return String(a||'').split(/\s*[·+]\s*/).filter(p=>p&&!/^ecomax( dia)?( ?\(.*\))?$/i.test(p)&&!/^(br|hsi)$/i.test(p)&&!/plant|sobreaviso/i.test(p)).join(' · ');
}
function smCampo(iso,k,v){
  v=String(v??'').trim();
  smMudar(d=>{const x=d.dias[iso]=d.dias[iso]||{};
    if(k==='feriado'){if(v===smFeriadoAuto(iso))delete x.feriado;else x.feriado=v}
    else if(k==='noite'){if(v==='auto')delete x.noite;else x.noite=v;delete x.meta}
    else if(v)x[k]=v;else delete x[k]},k==='tema'?'tema do dia':k==='foco'?'foco do dia':k==='feriado'?'feriado':'noite do dia');
}
const smNt=nt=>nt?`<span class="sm-nt ${nt.toLowerCase()}">${nt}</span>`:'';
function smSelo(x,longo){   // questões feitas/meta: só a letra colorida
  const hj=smHoje(),t=smTipo(x),q=smQ(x),mt=smMetaDe(x),c=smCor(x);
  if(x<=hj)return t==='estudo'&&mt?`<span class="q ${c}">${q.n}<small>/${mt}</small></span>`:q.n?`<span class="q">${q.n}</span>`:'';
  return t==='estudo'&&mt?`<span class="q fut">${longo?mt+' questões':'meta '+mt}</span>`:'';
}
const smCorTipo=a=>(a||'estudo')==='estudo'?'e':a==='ferramenta'?'f':'t';   // bolinha: azul estudo, amarelo ferramenta, verde tarefas (e outros tipos)
const smDots=x=>{const its=smItensDe(x),hj=smHoje();return its.length?`<span class="dots">${its.map(i=>`<i class="t-${smCorTipo(i.area)} ${i.feito?'ok':x<hj?'late':''}"></i>`).join('')}</span>`:''};
function smCalCab(mes,y,m){
  const hj=smHoje(),est=smEstagio(mes),vis=SM.vis||'semana',sem=vis==='semana',seg=vis==='lista'?smDom(hj):SM.semana||smDom(hj);
  const titulo=sem||vis==='lista'?`${smRotL(seg)} – ${smRotL(smMais(seg,6))}`:`${smMES[m-1][0].toUpperCase()+smMES[m-1].slice(1)} ${y}`;
  return `<div class="sm-calh"><button class="b s sm-ghost" onclick="smCalVai(-1)" aria-label="${sem?'Semana anterior':'Mês anterior'}">‹</button><h3>${titulo}</h3><button class="sm-est ${est?'':'vazio'}" onclick="smEstagioEdita('${mes}')" title="Estágio do mês (toque para mudar)">${est?esc(est):'+ estágio'}</button><button class="b s sm-ghost" onclick="smCalVai(1)" aria-label="${sem?'Próxima semana':'Próximo mês'}">›</button>${(sem?seg!==smDom(hj):mes!==hj.slice(0,7))?`<button class="b s sm-ghost" onclick="SM.mes=null;SM.semana=null;render()">Hoje</button>`:''}<span style="flex:1"></span>
   <div class="sm-seg"><button type="button" aria-pressed="${vis==='mes'}" onclick="smVis('mes')">Mês</button><button type="button" aria-pressed="${sem}" onclick="smVis('semana')">Semana</button><button type="button" aria-label="Lista da semana atual" aria-pressed="${vis==='lista'}" onclick="smVis('lista')">≡ Lista</button></div>
   ${sem?`<button class="b s sm-ghost" onclick="smSem('${seg}')">editar semana</button>`:''}
   </div>`;
}
function smVis(v){SM.vis=v;if(v==='lista'){SM.semana=smDom(smHoje());SM.mes=smHoje().slice(0,7)}try{localStorage.setItem('sm_vis',v)}catch(e){}render()}
function smCalVai(k){if(SM.vis==='lista')return;if(SM.vis!=='semana'){smMesVai(k);return}SM.semana=smMais(SM.semana||smDom(smHoje()),k*7);render()}
SM.vis='semana';
function smCalendario(){
  const hj=smHoje(),sem=SM.vis==='semana',seg=SM.semana||smDom(hj),mes=sem?seg.slice(0,7):SM.mes||hj.slice(0,7),[y,m]=mes.split('-').map(Number),ini=sem?seg:smDom(dKey(+new Date(y,m-1,1,12))),fim=sem?smMais(seg,6):dKey(+new Date(y,m,0,12)),p=smProvaIso(),r=smRetaIni();
  const corpo=SM.vis==='lista'?smLista(mes,smDom(hj),smMais(smDom(hj),6),p,r):smGrade(mes,ini,fim,p,r,sem);
  return `<div class="card sm-cal">${smCalCab(mes,y,m)}${corpo}
   <p class="mut sm-dica">Clique no dia para ver ou criar tarefas · toque no estágio ao lado do mês para mudar.</p></div>`;
}
// Itens derivados do plano e das respostas: a meta fixa nunca é gravada como tarefa.
function smCalMeta(iso){const feita=smQ(iso).n>=50;return `<span class="sm-cal-meta" data-feito="${feita}">${feita?'✓':'○'} 50 questões</span>`}
function smCalItens(iso){return smCalMeta(iso)+smItensDe(iso).map(t=>`<span class="sm-cal-tarefa" data-tid="${esc(t.id)}" data-feito="${!!t.feito}">${t.feito?'✓':'○'} ${esc(t.texto)}</span>`).join('')}
function qaAbreDia(dia){qaAbre();QA.quando=dia;QA.calCursor=dia;QA.calAberto=true;QA.diasAberto=false;QA.quandoManual=true;QA.dias=[];qaRascSalva();qaPinta()}
function smGrade(mes,ini,fim,p,r,sem=false){
  const hj=smHoje();let h='';
  for(let s=ini;s<=fim;s=smMais(s,7)){
    const ds=smSemana(s);
    h+=`<div class="sm-lin">${ds.map(x=>{
      if(!sem&&x.slice(0,7)!==mes)return `<button class="sm-cel fora" data-drop="${x}" onclick="smDiaClique('${x}')" ondblclick="smSel('${x}')"><span class="top"><span class="n">${smDt(x).getDate()}</span></span>${smCalItens(x)}</button>`;
      const t=smTipo(x),di=smDia(x),fe=smFeriado(x),rs=smAgResto(di.agenda);
      return `<button lang="pt-BR" class="sm-cel ${x===hj?'hoje':''} ${t!=='estudo'?'off':''} ${SM.sel===x?'sel':''} ${fe?'fer':''} ${r&&x>=r&&p&&x<p?'rf':''}" data-drop="${x}" onclick="smDiaClique('${x}')" ondblclick="smSel('${x}')" title="${esc(di.agenda||'')}">
        <span class="top"><span class="n">${smDt(x).getDate()}</span>${smNt(smNoite(x))}${x===p?'<span class="sm-pv2">PROVA</span>':''}</span>
        ${smEvs(x)}${fe?`<span class="sm-fe">${esc(fe)}</span>`:''}${di.tema?`<span class="sm-tm">${esc(di.tema)}</span>`:''}${di.foco?`<span class="sm-fo">+ ${esc(di.foco)}</span>`:''}${rs?`<span class="sm-rs">${esc(rs)}</span>`:''}
        ${smCalItens(x)}<span class="sm-bt">${smSelo(x)}${smDots(x)}</span></button>`}).join('')}</div>`;
    if(SM.sem===s&&tela==='tarefas')h+=smPainelSemana(s);
  }
  return `<div class="sm-grid ${sem?'sm-vsem':''}"><div class="sm-lin cab">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d=>`<span>${d}</span>`).join('')}</div>${h}</div>`;
}
function smLista(mes,ini,fim,p,r){
  const hj=smHoje(),esta=smDom(hj);let h='';
  for(let s=ini;s<=fim;s=smMais(s,7)){
    h+=`<div class="sm-lh"><b>Semana ${smNumSem(s)}${s===esta?' · esta':''}</b></div>`;
    if(SM.sem===s&&tela==='tarefas')h+=smPainelSemana(s);
    smSemana(s).forEach(x=>{
      const t=smTipo(x),di=smDia(x),fe=smFeriado(x),rs=smAgResto(di.agenda),dw=smDt(x).getDay();
      const vazio=!di.tema&&!fe?(t==='sobreaviso'?'<span class="mut">sobreaviso · sem estudo</span>':t==='descanso'?'<span class="mut">descanso</span>':''):'';
      h+=`<button class="sm-li ${x===hj?'hoje':''} ${t!=='estudo'?'off':''} ${SM.sel===x?'sel':''} ${r&&x>=r&&p&&x<p?'rf':''}" data-drop="${x}" onclick="smDiaClique('${x}')" ondblclick="smSel('${x}')">
        <span class="ld"><b class="${fe?'fer':''}">${smDt(x).getDate()}</b><small>${smDOW[dw]}</small></span>
        <span class="lc"><span class="lt">${smNt(smNoite(x))}${x===p?'<span class="sm-pv2">PROVA</span>':''}${fe?`<span class="sm-fe">${esc(fe)}</span>`:''}${smEvs(x)}${di.tema?`<span class="sm-tm">${esc(di.tema)}</span>`:''}${vazio}</span>
        ${di.foco?`<span class="sm-fo">+ ${esc(di.foco)}</span>`:''}${rs?`<span class="sm-rs">${esc(rs)}</span>`:''}
        ${smCalItens(x)}<span class="lb">${smSelo(x,true)}${smDots(x)}</span></span></button>`;
    });
  }
  return `<div class="sm-lista">${h}</div>`;
}
function smFracosCard(){
  SM.fr=smFracos();const man=(SM.d.notas||[]).filter(n=>n.fraco);
  if(!SM.fr.length&&!man.length)return '';
  return `<div class="card"><span class="kick">Temas fracos</span>
   ${SM.fr.length?`<p class="mut">Últimos 14 dias no banco (3+ respostas, menos de 70%).</p><div class="sm-fr">${SM.fr.map((x,i)=>`<div class="sm-frl"><span>${esc(x.t)}</span><span class="sm-q">${x.ok}/${x.n}</span><button class="b s" onclick="smTreinar(${i})">Treinar</button></div>`).join('')}</div>`:''}
   ${man.length?`<p class="mut">Que você marcou nas anotações:</p><ul class="sm-notas">${man.map(n=>`<li>${esc(n.texto)}</li>`).join('')}</ul>`:''}</div>`;
}
function vSemana(){
  if(!SM.ok)return `<div class="card"><p class="mut">Carregando o calendário…</p></div>`;
  if(!SM.d)return `<div class="card"><p class="mut">Calendário indisponível offline neste aparelho.</p></div>`;
  return `<div class="sm" aria-label="Calendário">${SM.erro?`<p class="sm-err">${esc(SM.erro)}</p>`:''}${SM.avisoTamanho?`<p class="mut">${esc(SM.avisoTamanho)}</p>`:''}${SM.avisosAgenda?.length?`<details class="sm-avisos"><summary>Avisos da escala</summary>${SM.avisosAgenda.map(a=>`<p>${esc(a)}</p>`).join('')}</details>`:''}${smCalendario()}${SM.diaEditor?smPainelDia(SM.diaEditor):''}</div>`;
}
function vTarefas(){
  if(!SM.ok)return `<div class="card"><p class="mut">Carregando o calendário…</p></div>`;
  if(!SM.d)return `<div class="card"><p class="mut">Calendário ainda vazio.</p></div>`;
  setTimeout(smAuto,0);const hj=smHoje(),sem=SM.d.tarefas.filter(t=>t.dia==='proxima'),atr=tarefasAtrasadas(SM.d.tarefas,hj);
  const outros=[...new Set(SM.d.tarefas.map(t=>t.dia))].filter(d=>dataTarefaValida(d)&&d>hj).sort();
  return `<div class="sm sm-tarefas" aria-label="Tarefas">
   ${SM.erro?`<p class="sm-err">${esc(SM.erro)}</p>`:''}
   ${SM.avisoTamanho?`<p class="mut">${esc(SM.avisoTamanho)}</p>`:''}
   ${atr.length?`<div class="card sm-atrasadas"><div class="row"><span class="kick">Atrasadas · ${atr.length}</span><button class="b s sm-ghost" onclick="smRola()">Passar tudo para hoje</button></div><div class="sm-atrasadas-lista">${atr.map(t=>`<div><small>${smRotL(t.dia)}</small>${smItem(t)}</div>`).join('')}</div></div>`:''}
   ${smHojeGrande()}
   ${smSemData()}
   ${outros.filter(d=>d!==smDiaAtual()).map(d=>`<div class="card" data-drop="${d}"><h3>${smRotL(d)}</h3>${smGrupos(smVisiveis(d))}${smFeitasBotao(d)}</div>`).join('')}
   ${sem.length?`<div class="card"><span class="kick">Sem dia</span><p class="mut">A revisão de domingo encaixa estes itens.</p>${sem.map(smItem).join('')}</div>`:''}
   <div class="row sm-planejar"><button class="b s sm-ghost" onclick="smSem('${smDom(hj)}')">Planejar semana</button><button class="b s sm-ghost" onclick="SM.plan=!SM.plan;SM.conf=null;render()">Planejar mês</button></div>
   ${SM.plan?smPainelMes():''}${SM.sem?smPainelSemana(SM.sem):''}
   ${SM.ed&&smTar(SM.ed.id)?smEditor(smTar(SM.ed.id)):''}
  </div>`;
}
// cartão na aba Hoje: itens de hoje com check, sem sair da tela
function smCardHoje(){
  if(!SM.d)return'';setTimeout(smAuto,0);const hj=smHoje(),todos=smItensDe(hj),its=smVisiveis(hj);if(!todos.length)return'';
  return `<div class="card sm-ch"><div class="row" style="justify-content:space-between"><span class="kick">Hoje no calendário · ${todos.filter(t=>t.feito).length}/${todos.length}</span>${smFeitasBotao(hj)}<button class="b s sm-ghost" onclick="go('semana')">Ver calendário</button></div>${smGrupos(its)}${SM.ed&&smTar(SM.ed.id)?smEditor(smTar(SM.ed.id)):''}</div>`;
}
const smCarga=Promise.resolve().then(smPuxar);
// 1.40: com o app visível busca a cada 10 s (304 não gasta cota); se a cota do GitHub estiver acabando (BCBR.cota, vinda dos cabeçalhos), volta a 90 s.
// Também busca ao voltar à tela, ao ganhar foco e (notas.js) ao voltar a conexão. No app Android o mesmo ciclo vale: smNativo só ENVIA o resumo para o widget.
function smIntervalo(){const c=BCBR.cota;if(!c)return 10000;if(c.rest<=5)return Math.max(90000,c.reset*1000-Date.now()+1000);return c.rest<500?90000:10000}
function smCiclo(){
  clearTimeout(SM.tmCiclo);
  SM.tmCiclo=setTimeout(async()=>{if(document.visibilityState==='visible'&&navigator.onLine!==false)await smPuxar().catch(()=>{});smCiclo()},smIntervalo());
}
smCiclo();
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){smPuxar();smAuto()}});
window.addEventListener('focus',()=>smPuxar());
// anel da meta de hoje + dias até a prova + ritmo (estavam no cartão de hoje da aba Semana; agora no "Meta até a prova" da aba Hoje)
function smMetaHoje(){
  if(!SM.d)return'';const hj=smHoje(),q=smQ(hj),m=smMetaDe(hj),dd=diasProva(),rit=smRitmo(),r=smRetaIni(),tp=smTipo(hj);
  const p=m?Math.min(100,Math.round(q.n/m*100)):0,cor=m&&q.n>=m?'var(--ok)':'var(--warn)';
  return `<div class="sm-mh"><div class="sm-hm">${m?`<div class="sm-ring" style="background:conic-gradient(${cor} ${p}%,var(--bd) 0)"><div><b>${q.n}</b><span>de ${m}</span></div></div><span class="mut">meta automática de hoje${q.n?` · ${pct(q.ok,q.n)}% de acerto`:''}</span>`
     :`<div class="sm-ring" style="background:var(--bd)"><div><b>${q.n}</b><span>questões</span></div></div><span class="mut">${tp==='descanso'?'dia de descanso — sem meta':'sobreaviso — sem meta hoje'}</span>`}</div>
   <div class="sm-hp">${dd!=null?`<span class="sm-bign">${dd}</span><span class="mut">dias até a prova</span>`:''}${rit!=null?`<span class="mut">ritmo: <b style="color:${rit>=90?'var(--ok)':rit>=60?'var(--warn)':'var(--bad)'}">${rit>=90?'no caminho':rit>=60?'um pouco abaixo':'abaixo'}</b> (${rit}% da meta nos últimos 5 dias de estudo)</span>`:''}<span class="mut">${_restantesFM()} fáceis/médias novas</span>${r?`<span class="mut">reta final (rever erros) a partir de ${smRotL(r)}</span>`:''}</div></div>`;
}

// ===== NOVA TAREFA — Alt+A, botão +, ?acao=tarefa / ?acao=voz (1.17.0: campo único, Enter salva na hora) =====
// Passos progressivos: texto → tipo → quando → lembrete → hora → urgente → detalhes.
// Enter salva em qualquer passo. O rascunho mantém inclusive os metadados legados.
const QA_RASC='bcbr_rasc_tarefa';
const QA={on:false,texto:'',det:'',area:'tarefas',quando:'',dias:[],subtarefas:[],urg:false,prioridade:'',hora:'',lembrete:'',repetir:null,etiquetas:[],ouvindo:false,rec:null,detAberto:false,diasAberto:false,passo:0,alcance:0,calAberto:false,calCursor:null};
const qaRascLer=()=>{try{return JSON.parse(localStorage.getItem(QA_RASC)||'null')}catch(e){return null}};
function qaRascSalva(extra){
  try{const r={texto:QA.texto,det:QA.det,area:QA.area,quando:QA.quando,quandoManual:!!QA.quandoManual,dias:QA.dias,subtarefas:QA.subtarefas,urg:!!QA.urg,prioridade:QA.prioridade,hora:QA.hora,lembrete:QA.lembrete,repetir:QA.repetir,etiquetas:QA.etiquetas,aberto:QA.on,...(extra||{})};
    if(!r.texto.trim()&&!r.det.trim()&&r.area==='tarefas'&&!r.quando&&!(r.dias||[]).length&&!r.urg&&!r.salvar&&!r.prioridade&&!r.hora&&r.lembrete===''&&!r.repetir&&!r.etiquetas.length)localStorage.removeItem(QA_RASC);else localStorage.setItem(QA_RASC,JSON.stringify(r))}catch(e){}
}
const qaRascLimpa=()=>{try{localStorage.removeItem(QA_RASC)}catch(e){}};
// No app Android (WebView) a voz do navegador não funciona: o 🎤 abre o reconhecedor nativo (BCBRNativo.falar), que grava na fila de pendentes;
// o app importa ao voltar (MainActivity.onResume chama smNativoImporta). APK antigo sem falar(): sem 🎤 (pedido do Artur, 24/10/2026).
const qaVozNativa=()=>!!(window.BCBRNativo&&typeof window.BCBRNativo.falar==='function');
const qaVozAPI=()=>window.BCBRNativo?qaVozNativa():(window.SpeechRecognition||window.webkitSpeechRecognition);
function qaZera(){Object.assign(QA,{texto:'',det:'',area:'tarefas',quando:'',quandoManual:false,dias:[],subtarefas:[],urg:false,prioridade:'',hora:'',lembrete:'',repetir:null,etiquetas:[],detAberto:false,diasAberto:false,passo:0,alcance:0,calAberto:false,calCursor:null})}
function qaAbre(){
  if(QA.on){const i=document.getElementById('qa_in');i&&i.focus();return}
  QA.focoAnterior=document.activeElement;
  const r=qaRascLer()||{};
  QA.subtarefas=Array.isArray(r.subtarefas)?r.subtarefas.map(String):[];
  Object.assign(QA,{on:true,texto:r.texto||'',det:r.det||'',area:r.area||'tarefas',quando:r.quando||'',dias:Array.isArray(r.dias)?r.dias:[],urg:!!r.urg,prioridade:r.prioridade||'',hora:r.hora||'',lembrete:r.lembrete??'',repetir:r.repetir||null,etiquetas:r.etiquetas||[],ouvindo:false,rec:null,detAberto:!!r.det,diasAberto:Array.isArray(r.dias)&&r.dias.length>0});
  Object.assign(QA,{passo:0,alcance:0,calAberto:false,calCursor:dataTarefaValida(QA.quando)?QA.quando:smHoje()});
  QA.quandoManual=r.quandoManual??!!(r.quando||r.dias?.length);qaSugereData();
  qaRascSalva();qaDesenha();
}
function qaFechaEl(){if(QA.rec){try{QA.rec.abort()}catch(e){}QA.rec=null}QA.ouvindo=false;QA.on=false;const el=document.getElementById('qa');if(el)el.remove();const foco=QA.focoAnterior;QA.focoAnterior=null;if(foco?.isConnected)foco.focus()}
function qaFecha(){qaFechaEl();qaRascSalva()}                       // fechar NÃO apaga o rascunho
function qaLimpa(){qaZera();qaRascLimpa();qaRascSalva();if(QA.on){qaDesenha()}}   // "Limpar": apaga o rascunho de propósito
function qaSugereData(){
  if(QA.quandoManual||QA.dias.length)return;
  QA.quando=interpretarTarefa(QA.texto,smHoje()).find(r=>dataTarefaValida(r.dia))?.dia||'';
  QA.calCursor=QA.quando||smHoje();
}
function qaTxt(v){QA.texto=v;qaSugereData();qaRascSalva();qaPinta()}
function qaQuando(v){QA.quandoManual=true;QA.quando=QA.quando===v?'':v;if(QA.quando)QA.dias=[];qaRascSalva();qaPinta()}
// vários dias (opcional): chips dos próximos 14 dias; escolher dias apaga o "Quando" e vice-versa (pedido do Artur, 24/10/2026)
const qaDiasLista=()=>Array.from({length:14},(_,i)=>smMais(smHoje(),i));
const qaDiasHtml=()=>qaDiasLista().map(x=>`<button type="button" class="sm-chip ${smTipo(x)!=='estudo'?'fraco':''}" data-d="${x}" onclick="qaDia('${x}')">${smRot(x)}</button>`).join('');
function qaDiasAlterna(){QA.diasAberto=!QA.diasAberto;const el=document.getElementById('qa_dias');if(el){if(QA.diasAberto&&!el.childElementCount)el.innerHTML=qaDiasHtml();el.hidden=!QA.diasAberto}qaPinta()}
function qaDia(x){QA.quandoManual=true;const i=QA.dias.indexOf(x);if(i<0)QA.dias.push(x);else QA.dias.splice(i,1);if(QA.dias.length)QA.quando='';qaRascSalva();qaPinta()}
// "+ novo tipo" (opcional): campo pequeno; Enter cria o tipo e já escolhe
function qaTipoSel(v){if(v==='__novo'){const s=document.getElementById('qa_area');if(s)s.value=QA.area;const n=document.getElementById('qa_tn');if(n){n.hidden=false;n.focus()}return}QA.area=v;qaRascSalva()}
function qaTipoCria(){
  const n=document.getElementById('qa_tn'),nome=(n&&n.value||'').trim();if(!nome)return;
  if(!SM.d){toast('Espere o calendário carregar para criar um tipo.');return}
  const id=smTipoNovo(nome);if(!id)return;QA.area=id;qaRascSalva();
  qaPasso(2);toast('Tipo “'+nome+'” criado');
}
function qaUrgente(){QA.urg=!QA.urg;qaRascSalva();qaPinta()}
function qaDetAlterna(){QA.detAberto=!QA.detAberto;const d=document.getElementById('qa_det');if(d){d.hidden=!QA.detAberto;if(QA.detAberto)d.focus()}qaPinta()}
const qaDM=iso=>iso.slice(8)+'/'+iso.slice(5,7);
function qaPrevTxt(){return smPreviaTexto(QA.texto,{...QA,painel:true})}
function smTextoOpcoes(texto,hoje,pad={}){
  const partes=String(texto).split(/\s*(?:[;\n]+|(?:pr[oó]xima|nova)\s+tarefa)\s*/i).filter(x=>x.trim());
  const itens=interpretarTarefa(texto,hoje);
  return itens.map((r,i)=>{
    const repetir=r.repetir||pad.repetir||null;
    let dias=r.dia?[r.dia]:pad.dias?.length?[...pad.dias].sort():[pad.quando==='hoje'?hoje:pad.quando||'sem'];
    if(pad.painel)dias=pad.dias?.length?[...pad.dias].sort():[dataTarefaValida(pad.quando)?pad.quando:'sem'];
    else if(repetir&&!r.dia&&!pad.dias?.length&&!pad.quando)dias=[repetir.tipo==='mensal'?hoje:proximaData(smMais(hoje,-1),repetir)||hoje];
    return {...r,...(pad.painel?{area:null,...(dataTarefaValida(r.dia)?{texto:(partes.length===itens.length?partes[i]:texto).trim()}:{})}:{}),dias,hora:r.hora||pad.hora||null,prioridade:r.prioridade||pad.prioridade||null,urg:r.urg||!!pad.urg,repetir,
      lembrete:pad.lembrete==null||pad.lembrete===''?null:+pad.lembrete,etiquetas:[...new Set([...r.etiquetas,...(pad.etiquetas||[])])]};
  });
}
function smPrevLinha(dia,texto){const el=document.getElementById('sm_prev_'+dia);if(el)el.textContent=smPreviaTexto(texto,{dias:SM.add[dia]?[...SM.add[dia]]:[dia]})}
function smPreviaTexto(texto,pad={}){
  const hj=smHoje(),L=smTextoOpcoes(texto,hj,pad);if(!L.length)return'';
  const parte=r=>{const p=[r.dias.map(d=>d==='sem'?'sem data':qaDM(d)).join(', '),r.hora||'sem hora',({alta:'alta',media:'média',baixa:'baixa'})[r.prioridade]||'sem prioridade'];if(r.repetir)p.push(({diaria:'todo dia',uteis:'dias úteis',semanal:'toda semana',mensal:'todo mês'})[r.repetir.tipo]);if(r.etiquetas.length)p.push(r.etiquetas.map(t=>'#'+t).join(' '));return p.join(' · ')};
  if(L.length===1)return parte(L[0]);
  return L.length+' tarefas: '+L.map(r=>r.texto+(parte(r)?' ('+parte(r)+')':'')).join(' | ');
}
function qaPinta(){   // atualiza só o que mudou (não refaz o campo: não perde foco nem teclado do celular)
  const el=document.getElementById('qa');if(!el)return;
  el.querySelectorAll('[data-campo]').forEach(b=>{const c=b.dataset.campo,v=c==='quando'?qaModoQuando():c==='urg'?QA.urg?'sim':'':String(QA[c]);b.setAttribute('aria-pressed',String(b.dataset.valor===v))});
  el.querySelectorAll('[data-q]').forEach(b=>b.setAttribute('aria-pressed',String(QA.quando===b.dataset.q)));
  const dt=document.getElementById('qa_dt');if(dt)dt.value=/^\d{4}-/.test(QA.quando)?QA.quando:'';
  el.querySelectorAll('[data-d]').forEach(b=>b.setAttribute('aria-pressed',String(QA.dias.includes(b.dataset.d))));
  const vb=document.getElementById('qa_diasb');if(vb){vb.setAttribute('aria-pressed',String(QA.diasAberto||QA.dias.length>0));vb.textContent='📅 vários dias'+(QA.dias.length?' ('+QA.dias.length+')':'')}
  const u=document.getElementById('qa_urg');if(u)u.setAttribute('aria-pressed',String(!!QA.urg));
  const db=document.getElementById('qa_detb');if(db)db.setAttribute('aria-pressed',String(QA.detAberto));
  const pv=document.getElementById('qa_prev');if(pv)pv.textContent=qaPrevTxt();
  const mic=document.getElementById('qa_mic');if(mic){mic.setAttribute('aria-pressed',String(QA.ouvindo));mic.textContent=QA.ouvindo?'⏹ Ouvindo…':'🎤'}
}
// cria a(s) tarefa(s) a partir de um texto livre; pad = escolhas dos botões {quando,area,urg,det}. Devolve as tarefas criadas.
function smCriaDeTexto(bruto,pad){
  pad=pad||{};const hj=smHoje(),novos=[];
  smTextoOpcoes(bruto,hj,pad).forEach(r=>{
    const ts=r.area?{area:r.area,sub:''}:smParseTS(pad.area||'tarefas');
    smNovos(r.dias,r.texto,ts.area,ts.sub,pad.det).forEach(x=>novos.push({...x,urg:r.urg,hora:r.hora,lembrete:r.lembrete,prioridade:r.prioridade,etiquetas:r.etiquetas,repetir:r.repetir?{...r.repetir,...(r.repetir.tipo==='mensal'&&dataTarefaValida(x.dia)?{diaMes:+x.dia.slice(8)}:{})}:null}));
  });
  if(pad.nativoId){const prefixo='nat_'+Array.from(String(pad.nativoId),c=>c.codePointAt(0).toString(16)).join('_'),grupos=new Map();novos.forEach((x,i)=>{x.id=prefixo+'_'+i;if(x.grupo){if(!grupos.has(x.grupo))grupos.set(x.grupo,prefixo+'_g'+i);x.grupo=grupos.get(x.grupo)}})}
  if(pad.subtarefas?.some(s=>s.trim()))novos.forEach(t=>{t.subtarefas=pad.subtarefas.filter(s=>s.trim()).map(texto=>({id:smId(),texto:texto.trim(),feito:false}))});
  if(novos.length)smPoe(novos,'novo item');
  return novos;
}
function smResumoNovos(l){const x=l[0];if(l.length>1&&l.every(y=>y.grupo&&y.grupo===x.grupo))return '“'+x.texto+'” · '+l.length+' dias';return (l.length>1?l.length+' tarefas':'“'+x.texto+'”')+' · '+(x.dia==='sem'?'sem data':qaDM(x.dia))}
// aviso com "Desfazer" (~3,5 s)
function smDesfazToast(msg,fn){
  let el=document.getElementById('sm_dz');if(el)el.remove();
  el=document.createElement('div');el.id='sm_dz';el.className='sm-dz';
  const sp=document.createElement('span');sp.textContent=msg;const b=document.createElement('button');b.className='b s';b.textContent='Desfazer';
  el.setAttribute('role','status');b.onclick=()=>{clearTimeout(el._t);el.remove();fn()};el.append(sp,b);document.body.appendChild(el);el._t=setTimeout(()=>el.remove(),5000);
}
function qaSalvar(){
  const bruto=QA.texto.trim();if(!bruto){toast('Escreva a tarefa');return}
  if(qaModoQuando()==='varios'&&!QA.dias.length){toast('Escolha pelo menos um dia.');return}
  const pad={quando:QA.quando,dias:[...QA.dias],subtarefas:[...QA.subtarefas],area:QA.area,urg:QA.urg,det:QA.det.trim(),prioridade:QA.prioridade,hora:qaModoQuando()==='sem'?'':QA.hora,lembrete:QA.lembrete,repetir:QA.repetir,etiquetas:QA.etiquetas};
  if(smTextoOpcoes(bruto,smHoje(),{...pad,painel:true}).some(r=>r.repetir?.tipo==='semanal'&&!r.repetir.dias?.length)){toast('Escolha pelo menos um dia para repetir.');return}
  if(!SM.d){   // calendário ainda não carregou nem está guardado no aparelho: guarda e grava quando chegar
    qaFechaEl();qaRascSalva({salvar:true,aberto:false});toast('Vai salvar assim que o calendário carregar.');smCarga.then(smRascPend);return}
  const novos=smCriaDeTexto(bruto,{...pad,painel:true});if(!novos.length)return;
  qaFechaEl();qaZera();qaRascLimpa();
  const ids=novos.map(x=>x.id);
  smDesfazToast('Salvei: '+smResumoNovos(novos),()=>{
    smMudar(d=>{d.tarefas=d.tarefas.filter(t=>!ids.includes(t.id))},'desfez item');
    try{localStorage.setItem(QA_RASC,JSON.stringify({...pad,texto:bruto,aberto:true}))}catch(e){}
    qaAbre();
  });
}
// rascunho marcado para salvar assim que o calendário carregar (atalho usado antes do app terminar de carregar)
function smRascPend(){
  const r=qaRascLer();if(!r||!r.salvar)return;
  if(!SM.d){toast('Não consegui salvar a tarefa agora. O texto está guardado neste aparelho.');return}
  const bruto=(r.texto||'').trim();qaRascLimpa();if(!bruto)return;
  const novos=smCriaDeTexto(bruto,{...r,det:(r.det||'').trim(),painel:true});
  if(novos.length)toast('Salvei: '+smResumoNovos(novos));
}
// ---- voz (Web Speech API; sem ela o botão 🎤 nem aparece) ----
function qaVoz(){
  if(qaVozNativa()){qaFecha();try{window.BCBRNativo.falar()}catch(e){toast('Não consegui abrir o microfone.')}return}
  const API=qaVozAPI();if(!API||!QA.on)return;
  if(QA.ouvindo&&QA.rec){try{QA.rec.stop()}catch(e){}return}
  const rec=new API(),base=QA.texto.trim();let final='';
  rec.lang='pt-BR';rec.interimResults=true;rec.continuous=false;rec.maxAlternatives=1;
  rec.onresult=e=>{let f='',pv='';for(let i=0;i<e.results.length;i++){const r=e.results[i];if(r.isFinal)f+=r[0].transcript;else pv+=r[0].transcript}
    final=f;qaTxt(((base?base+' ':'')+(f+pv)).trim());const c=document.getElementById('qa_in');if(c)c.value=QA.texto};
  rec.onerror=e=>{const c=e.error;if(c==='not-allowed'||c==='service-not-allowed')toast('Permita o microfone para ditar.');else if(c==='no-speech')toast('Não ouvi nada.');else if(c!=='aborted')toast('Não consegui ouvir ('+c+').')};
  rec.onend=()=>{if(QA.rec===rec){QA.rec=null;QA.ouvindo=false;qaPinta()}};
  QA.rec=rec;QA.ouvindo=true;qaPinta();
  try{rec.start()}catch(e){QA.rec=null;QA.ouvindo=false;qaPinta()}
}
function qaCampo(campo,valor){QA[campo]=valor;qaRascSalva();qaPinta()}
function qaRepetir(tipo){QA.repetir=tipo?{tipo,...(tipo==='semanal'?{dias:[smDt(smHoje()).getDay()]}:{})}:null;qaRascSalva();qaDesenha()}
function qaRepDia(dia,marcado){if(QA.repetir?.tipo!=='semanal')return;const dias=new Set(QA.repetir.dias);marcado?dias.add(dia):dias.delete(dia);QA.repetir={tipo:'semanal',dias:[...dias]};qaRascSalva();qaPinta()}
function qaExtrasHtml(){
  return (qaModoQuando()==='sem'?'':qaLinha(3,'Hora',QA.hora||'Sem hora',`<input id="qa_hora" type="time" aria-label="Hora" value="${esc(QA.hora)}" onchange="qaCampo('hora',this.value)">`))+
    qaLinha(4,'Detalhes',QA.det||'Sem detalhes',`<textarea id="qa_det" class="qa-in" rows="2" aria-label="Detalhes" placeholder="Detalhes opcionais" oninput="QA.det=this.value;qaRascSalva()">${esc(QA.det)}</textarea>`)+
    qaLinha(5,'Lembrete',qaLembretes().find(x=>x[0]===String(QA.lembrete))?.[1]||'Nenhum',qaChips('lembrete',qaLembretes(),String(QA.lembrete)));
}
const qaLembretes=()=>[['','Nenhum'],['0','Na hora'],['15','15 min antes'],['60','1 h antes']];
function qaTipos(){
  const tipos=[...SM_TIPOS0,...smTipos().filter(t=>!SM_TIPOS0.some(x=>x.id===t.id))];
  return tipos.flatMap(t=>{const atual=smTipos().find(x=>x.id===t.id)||t;return [[t.id,t.id==='tarefas'?'Tarefa':atual.nome],...(atual.subs||[]).map(s=>[t.id+'|'+s,atual.nome+' › '+s])]});
}
function qaCor(tipo){
  const id=tipo.split('|')[0],fixas={tarefas:'#DDF5E8',estudo:'#DCEBFF',ferramenta:'#FFF1C2'};
  const i=smTipos().filter(t=>!fixas[t.id]).findIndex(t=>t.id===id);
  return fixas[id]||['#FFE4D6','#FFE0EC','#E9E3FF'][Math.max(0,i)%3];
}
function qaChips(campo,opcoes,valor){return `<div class="qa-chips" role="group" aria-label="${({area:'Tipo',quando:'Quando',lembrete:'Lembrete',urg:'Urgente'})[campo]}">${opcoes.map(([v,n])=>`<button type="button" class="qa-chip" data-campo="${campo}" data-valor="${esc(v)}" ${campo==='area'?`style="--qa-cor:${qaCor(v)}"`:''} aria-pressed="${v===valor}" onclick="qaEscolhe('${campo}',this.dataset.valor,true)">${esc(n)}</button>`).join('')}</div>`}
function qaLinha(n,nome,resumo,conteudo){return `<section class="qa-passo ${QA.passo===n?'atual':''}" data-passo="${n}" ${n>QA.alcance?'hidden':''}>
  ${QA.passo===n?`<div class="sm-lbl">${nome}</div>${conteudo}`:`<button type="button" class="qa-resumo" onclick="qaPasso(${n})"><span>${nome}</span><b>${esc(resumo)}</b></button>`}</section>`}
const qaModoQuando=()=>QA.diasAberto||QA.dias.length?'varios':QA.calAberto||dataTarefaValida(QA.quando)?'data':'sem';
function qaEscolhe(campo,valor,avancar=false){
  if(campo==='quando'){
    QA.quandoManual=true;
    QA.calAberto=valor==='data';QA.diasAberto=valor==='varios';
    if(valor!=='varios')QA.dias=[];
    QA.quando=valor==='data'?(dataTarefaValida(QA.quando)?QA.quando:QA.calCursor||smHoje()):'';
    QA.calCursor=QA.quando||QA.calCursor||smHoje();
  }else QA[campo]=campo==='urg'?valor==='sim':valor;
  qaRascSalva();
  if(avancar&&(campo!=='quando'||valor==='sem'))qaPasso(QA.passo+1);
  else qaDesenha(campo==='quando'&&valor!=='sem'?'cal':null);
}
function qaPasso(n){if(n===3&&qaModoQuando()==='sem')n=QA.passo>3?2:4;QA.passo=Math.max(0,Math.min(5,n));QA.alcance=Math.max(QA.alcance,QA.passo);qaDesenha()}
function qaCalendario(){
  const multi=qaModoQuando()==='varios',cur=QA.calCursor||smHoje(),d=smDt(cur),primeiro=dKey(+new Date(d.getFullYear(),d.getMonth(),1,12)),ini=smDom(primeiro);
  return `<div class="qa-cal"><div class="row"><button type="button" class="qa-chip" aria-label="Mês anterior" onclick="qaCalMes(-1)">‹</button><b>${smMES[d.getMonth()]} ${d.getFullYear()}</b><button type="button" class="qa-chip" aria-label="Próximo mês" onclick="qaCalMes(1)">›</button></div>
    <div class="qa-cg" role="group" aria-label="Calendário; setas mudam o dia">${smDOW.map(x=>`<span class="qa-ch">${x}</span>`).join('')}${Array.from({length:42},(_,i)=>{const iso=smMais(ini,i),sel=multi?QA.dias.includes(iso):iso===QA.quando;return `<button type="button" class="qa-cd ${iso.slice(0,7)!==cur.slice(0,7)?'fora':''} ${sel?'cur':''}" data-cal="${iso}" tabindex="${iso===cur?0:-1}" aria-label="${iso}" aria-pressed="${sel}" onclick="${multi?'qaMultiDia':'qaCalDia'}(this.dataset.cal,true)">${+iso.slice(8)}</button>`}).join('')}</div>
    <button type="button" class="qa-chip" onclick="qaPasso(3)">${multi?'Usar dias · '+QA.dias.length:'Usar data · '+qaDM(QA.quando)}</button></div>`;
}
function qaCalDia(iso,avancar=false){QA.quandoManual=true;QA.calCursor=iso;QA.quando=iso;QA.dias=[];qaRascSalva();avancar?qaPasso(3):qaDesenha('cal')}
function qaCalMes(n){const d=smDt(QA.calCursor||smHoje());QA.calCursor=dKey(+new Date(d.getFullYear(),d.getMonth()+n,1,12));qaDesenha('cal')}
function qaMultiDia(iso){QA.quandoManual=true;QA.diasAberto=true;QA.calCursor=iso;const i=QA.dias.indexOf(iso);if(i<0)QA.dias.push(iso);else QA.dias.splice(i,1);QA.quando='';qaRascSalva();qaDesenha('cal')}
function qaSubHtml(){return QA.subtarefas.map((s,i)=>`<input class="qa-in" aria-label="Subtarefa ${i+1}" placeholder="Subtarefa ${i+1}" value="${esc(s)}" oninput="QA.subtarefas[${i}]=this.value;qaRascSalva()">`).join('')}
function qaSubNova(){QA.subtarefas.push('');qaRascSalva();const el=document.getElementById('qa_subs');if(el){el.innerHTML=qaSubHtml();el.lastElementChild?.focus()}}
function qaHtml(){
  const modo=qaModoQuando(),tipo=qaTipos().find(x=>x[0]===QA.area)?.[1]||QA.area;
  const quando=QA.dias.length?QA.dias.map(qaDM).join(', '):dataTarefaValida(QA.quando)?qaDM(QA.quando):'Sem data';
  return `<div class="qa-caixa" role="dialog" aria-modal="true" aria-label="Nova tarefa"><div class="row"><b>Nova tarefa</b><span style="flex:1"></span>${qaVozAPI()?'<button type="button" id="qa_mic" class="qa-chip" onclick="qaVoz()" aria-label="Falar a tarefa">🎤</button>':''}<button type="button" class="qa-chip" onclick="qaFecha()" aria-label="Fechar">✕</button></div>
    <div class="qa-corpo">${qaLinha(0,'Tarefa',QA.texto||'Escreva a tarefa',`<input id="qa_in" class="qa-in" placeholder="O que você precisa fazer?" value="${esc(QA.texto)}" oninput="qaTxt(this.value)" ondblclick="qaSubNova()" autocomplete="off" enterkeyhint="done" aria-label="Tarefa"><div id="qa_subs">${qaSubHtml()}</div>`)}
    ${qaLinha(1,'Tipo',tipo,qaChips('area',qaTipos(),QA.area)+`<div class="qa-novo"><input id="qa_tn" aria-label="Nome do novo tipo" placeholder="Novo tipo (opcional)"><button type="button" class="qa-chip" onclick="qaTipoCria()">Criar tipo</button></div>`)}
    ${qaLinha(2,'Quando',quando,qaChips('quando',[['sem','Sem data'],['data','Data'],['varios','Vários dias']],modo)+(modo==='data'||modo==='varios'?qaCalendario():''))}
    ${qaExtrasHtml()}</div>
    <div class="qa-rodape"><button type="button" class="b" onclick="qaSalvar()">Salvar</button><button type="button" class="qa-chip" onclick="qaPasso(QA.passo+1)" ${QA.passo===5?'hidden':''}>Próximo ↓</button><button type="button" class="qa-chip" onclick="qaLimpa()">Limpar</button></div>
    <div class="qa-dica">↑ ↓ passos · ← → escolhem · Enter salva · Esc fecha</div></div>`;
}
function qaDesenha(foco){
  let el=document.getElementById('qa');
  if(!el){el=document.createElement('div');el.id='qa';el.className='qa-fundo';el.onclick=e=>{if(e.target===el)qaFecha()};document.body.appendChild(el)}
  el.innerHTML=qaHtml();
  qaAjustaTela();
  const atual=el.querySelector('.qa-passo.atual');
  const i=foco==='cal'?el.querySelector(`[data-cal="${QA.calCursor}"]`):atual&&(atual.querySelector('input:not(#qa_tn),textarea')||atual.querySelector('[aria-pressed="true"]')||atual.querySelector('button'));
  if(i){i.focus();if(i.id==='qa_in')i.setSelectionRange(i.value.length,i.value.length)}
}
function qaAjustaTela(){
  const el=document.getElementById('qa'),v=window.visualViewport;if(!el||!v)return;
  el.style.height=v.height+'px';el.style.top=v.offsetTop+'px';el.style.bottom='auto';el.style.setProperty('--qa-altura',v.height+'px');
}
window.visualViewport?.addEventListener('resize',qaAjustaTela);
window.visualViewport?.addEventListener('scroll',qaAjustaTela);
function qaTecla(e){
  const k=e.key,alvo=e.target||{};
  if(k==='Escape'){e.preventDefault();qaFecha();return}
  if(k==='Tab'){
    const el=document.getElementById('qa');if(!el)return;
    const campos=[...el.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(x=>!x.disabled&&x.tabIndex>=0&&!x.closest('[hidden]')&&x.getClientRects().length);
    e.preventDefault();const i=campos.indexOf(document.activeElement),n=campos.length;
    if(n)campos[i<0?(e.shiftKey?n-1:0):(i+(e.shiftKey?-1:1)+n)%n].focus();return;
  }
  if(alvo.dataset?.cal&&(k===' '||k==='Enter')){e.preventDefault();if(qaModoQuando()==='varios')qaMultiDia(alvo.dataset.cal);else qaCalDia(alvo.dataset.cal,true);return}
  if(k==='Enter'&&!e.isComposing){if(alvo.tagName==='BUTTON')return;e.preventDefault();qaSalvar();return}
  if(alvo.id==='qa_tn'&&k.startsWith('Arrow'))return;
  if(alvo.dataset?.cal&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(k)){
    e.preventDefault();const dia=smMais(alvo.dataset.cal,({ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7})[k]);if(qaModoQuando()==='varios'){QA.calCursor=dia;qaDesenha('cal')}else qaCalDia(dia);return;
  }
  if(k==='ArrowDown'||k==='ArrowUp'){e.preventDefault();qaPasso(QA.passo+(k==='ArrowDown'?1:-1));return}
  if(k==='ArrowLeft'||k==='ArrowRight'){
    if(/^(INPUT|TEXTAREA)$/.test(alvo.tagName)||alvo.isContentEditable)return;
    const c=({1:'area',2:'quando',5:'lembrete'})[QA.passo];if(!c)return;
    const ops=c==='area'?qaTipos():c==='quando'?[['sem'],['data'],['varios']]:c==='urg'?[[''],['sim']]:qaLembretes();
    const valor=c==='quando'?qaModoQuando():c==='urg'?QA.urg?'sim':'':String(QA[c]);
    const i=Math.max(0,ops.findIndex(x=>x[0]===valor)),j=(i+(k==='ArrowRight'?1:-1)+ops.length)%ops.length;
    e.preventDefault();qaEscolhe(c,ops[j][0]);
  }
}
window.addEventListener('keydown',e=>{
  if(!QA.on){if(e.altKey&&!e.ctrlKey&&(e.code==='Key'+KEY('qa').toUpperCase()||e.code==='Digit'+KEY('qa'))&&(['hoje','semana','tarefas','notas'].includes(tela))){e.preventDefault();e.stopImmediatePropagation();tela==='notas'&&typeof ntAbre==='function'?ntAbre():qaAbre()}return}
  e.stopImmediatePropagation();
  qaTecla(e);
},true);
// botão flutuante "+" (celular e mouse) nas abas Hoje e Semana — chamado a cada render
function qaBotao(){let b=document.getElementById('qa_fab');const ver=['hoje','semana','tarefas','notas'].includes(tela);
  if(!b){b=document.createElement('button');b.id='qa_fab';b.className='qa-fab';b.textContent='+';b.onclick=()=>tela==='notas'&&typeof ntAbre==='function'?ntAbre():qaAbre();document.body.appendChild(b)}
  const nome=tela==='notas'?'Nova nota (Alt+A)':'Nova tarefa (Alt+A)';b.title=nome;b.setAttribute('aria-label',nome);   // na aba Notas o + cria nota (05/11/2026)
  b.style.display=ver?'':'none'}

// Tab = próxima aba (à direita), Shift+Tab = anterior (à esquerda), em volta. Pedido do Artur, 22/10/2026.
// (Alt+Tab não chega ao navegador: o Windows usa para trocar de janela.) Não age ao digitar num campo,
// com o zoom aberto nem na tela de Nova tarefa (Alt+A). Na questão também troca de aba (pedido do Artur, 22/10/2026).
window.addEventListener('keydown',e=>{
  if(e.key!=='Tab'||e.ctrlKey||e.metaKey||e.altKey)return;
  if(typeof QA!=='undefined'&&QA.on)return;
  const t=e.target;if(/INPUT|SELECT|TEXTAREA/.test(t.tagName)||t.isContentEditable)return;
  const z=document.getElementById('zoom');if(z&&!z.hidden)return;
  const o=tabsOrdenadas().map(x=>x[0]);if(!o.length)return;
  const ativa=tela==='quiz'?'questoes':tela==='fim'?'estudar':tela==='rt'?'hoje':tela==='fcstudy'?'fc':tela;
  let i=o.indexOf(ativa);if(i<0)i=0;
  e.preventDefault();go(o[(i+(e.shiftKey?-1:1)+o.length)%o.length]);
});


// Teclado na aba Semana (pedido do Artur, 22/10/2026): ao abrir, o cartão "Hoje" já vem selecionado;
// ↑/↓ andam pelas tarefas de hoje e, passando da última, pelas da célula "Sem data"; Enter conclui/desmarca, F apaga, Esc solta.
// Clique numa tarefa = seleciona (atalhos valem); clique de novo no texto = edita. Clique no vazio da célula Tarefas = seleciona a célula
// (pedido do Artur, 24/10/2026). SMK.id = tarefa selecionada fora de Hoje/Tarefas (outros dias); SMK.cel = célula sem tarefa marcada.
const SMK={on:false,i:-1,id:null,cel:'hoje'};
function smkIni(){SMK.on=true;SMK.i=-1;SMK.id=null;SMK.cel='hoje'}
const smkItens=dia=>smVisiveis(dia);
const smkNh=()=>smkItens(smDiaAtual()).length;
const smkLinhas=()=>[...document.querySelectorAll('#app .sm-row[data-tid]')].filter(r=>r.getClientRects().length);
function smkSelecionada(id){if(!SMK.on)return false;if(SMK.id)return SMK.id===id;const x=smkLista()[SMK.i];return !!x&&x.id===id}
function smkSeleciona(id){const i=smkLista().findIndex(t=>t.id===id);SMK.on=true;SMK.cel=null;if(i>=0){SMK.i=i;SMK.id=null}else{SMK.i=-1;SMK.id=id}smkPinta()}
function smkLista(){
  if(tela!=='tarefas')return [...smkItens(smDiaAtual()),...smkItens('sem')];
  return [...new Set(smkLinhas().map(r=>r.dataset.tid))].map(smTar).filter(Boolean);
}
function smkPinta(){if(tela!=='tarefas')return;const c=document.querySelector('#app .sm-hoje1'),d=document.querySelector('#app .sm-sd');
  const rh=c?[...c.querySelectorAll('.sm-grp .sm-row')]:[],linhas=smkLinhas(),rows=smkLista().map(t=>linhas.find(r=>r.dataset.tid===t.id));
  const naSd=SMK.i<0?SMK.cel==='sd':SMK.i>=rh.length,cel=SMK.on&&!SMK.id;
  if(c)c.classList.toggle('kbsel',cel&&!naSd);if(d)d.classList.toggle('kbsel',cel&&naSd);
  document.querySelectorAll('#app .sm-row.kbsel').forEach(r=>r.classList.remove('kbsel'));
  rows.forEach((r,i)=>{if(cel&&i===SMK.i)r.classList.add('kbsel')});
  if(SMK.on&&SMK.id)linhas.forEach(r=>{if(r.dataset.tid===SMK.id)r.classList.add('kbsel')});
  const r=SMK.id?document.querySelector('#app .sm-row.kbsel'):rows[SMK.i];if(SMK.on&&r)r.scrollIntoView({block:'nearest'})}
window.addEventListener('keydown',e=>{
  if(tela!=='tarefas'||!SMK.on||e.ctrlKey||e.metaKey||e.altKey)return;
  if(typeof QA!=='undefined'&&QA.on)return;
  const t=e.target;if(t&&(/INPUT|SELECT|TEXTAREA/.test(t.tagName)||t.isContentEditable))return;
  if(t?.closest?.('button,a,label'))return;
  const z=document.getElementById('zoom');if(z&&!z.hidden)return;
  const L=smkLista(),n=L.length,k=e.key;
  if(k==='ArrowDown'||k==='ArrowUp'){if(!n)return;e.preventDefault();const de=SMK.id?-1:SMK.i;
    SMK.i=SMK.cel==='sd'&&de<0&&k==='ArrowDown'?Math.min(n-1,smkNh()):k==='ArrowDown'?Math.min(n-1,de+1):Math.max(0,de-1);SMK.id=null;SMK.cel=null;smkPinta();return}
  if(k==='Escape'){SMK.on=false;SMK.id=null;smkPinta();return}
  const x=SMK.id?L.find(t=>t.id===SMK.id):L[SMK.i];if(!x)return;
  if(k==='Enter'){e.preventDefault();smCheck(x.id,!x.feito);return}
  if(keyIs(e,'smdel')){e.preventDefault();
    smMudar(d=>{d.tarefas=d.tarefas.filter(y=>y.id!==x.id)},'excluiu item');if(SMK.id){SMK.id=null;SMK.on=false;smkPinta()}else SMK.i=Math.min(SMK.i,n-2);toast('Item apagado')}
});
// clique fora do cartão de hoje e da célula "Sem data" solta a seleção do teclado
document.addEventListener('pointerdown',e=>{if(tela==='tarefas'&&SMK.on&&!e.target.closest('.sm-hoje1,.sm-sd,.sm-row[data-tid]')){SMK.on=false;SMK.id=null;smkPinta()}},true);
// clique numa tarefa (fora do texto, do check e dos botões) seleciona; clique no vazio de Hoje/Tarefas seleciona a célula
document.addEventListener('click',e=>{if(tela!=='tarefas')return;const t=e.target;if(!t.closest||t.closest('input,select,textarea,button,a,label,.sm-add,.sm-det,[contenteditable]'))return;
  const r=t.closest('.sm-row[data-tid]');if(r){if(!smkSelecionada(r.dataset.tid))smkSeleciona(r.dataset.tid);return}
  const cel=t.closest('.sm-hoje1,.sm-sd');if(cel){SMK.on=true;SMK.i=-1;SMK.id=null;SMK.cel=cel.classList.contains('sm-sd')?'sd':'hoje';smkPinta()}});


// ===== EVENTOS DO DIA (pedido do Artur, 23/10/2026): selos como BR/HSI, largura toda da célula =====
// dias[iso].ev = [{id, t, c}] · c = cor (roxo, azul, laranja, rosa, turquesa, cinza). Criar/apagar no painel do dia.
const SM_EVC=[['roxo','Roxo'],['azul','Azul'],['laranja','Laranja'],['rosa','Rosa'],['turquesa','Turquesa'],['cinza','Cinza']];
const SM_AGENDA_TIPOS=['br','norte','hsi','br-manha','almoco','estagio','cobre-pos'];
const smEvL=iso=>{const manuais=smDia(iso).ev||[];return [...manuais,...dedupeAgenda(SM.agenda||[],[...manuais,{t:smDia(iso).agenda}],iso).map(e=>({t:e.titulo,tipo:e.tipo,c:SM_AGENDA_TIPOS.includes(e.tipo)?'escala-'+e.tipo:'escala',leitura:true,inicio:e.inicio,fim:e.fim,diaInteiro:e.diaInteiro,local:e.local}))].filter(e=>!smPlantao(e))};
const smEvs=iso=>smEvL(iso).map(v=>`<span class="sm-ev c-${esc(v.c||'roxo')}" title="${esc(v.t+(v.leitura?' · escala automática (somente leitura)':''))}">${esc(v.t)}${v.leitura?`<small>${v.diaInteiro?'Dia inteiro':esc(String(v.inicio).slice(11,16)+(v.fim?' – '+String(v.fim).slice(11,16):''))}${v.local?' · '+esc(v.local):''}</small>`:''}</span>`).join('');
function smEvEditor(iso){
  const c=SM.evc||'roxo';
  return `<div class="row sm-evr"><span class="sm-lbl">Eventos</span>${smEvL(iso).map(v=>`<span class="sm-ev c-${esc(v.c||'roxo')} sm-evx">${esc(v.t)}${v.leitura?'<small>Escala · somente leitura</small>':`<button onclick="smEvDel('${iso}','${v.id}')" aria-label="Apagar evento">×</button>`}</span>`).join('')}
   <input id="sm_ev_${iso}" placeholder="Novo evento (ex.: Aniversário, Prova USG)" onkeydown="if(event.key==='Enter')smEvAdd('${iso}')" style="flex:1 1 180px;min-width:0" aria-label="Novo evento">
   <span class="sm-evcs">${SM_EVC.map(([k,n])=>`<button type="button" class="sm-evc c-${k}" aria-pressed="${c===k}" title="${n}" aria-label="${n}" onclick="smEvCor('${k}',this)"></button>`).join('')}</span>
   <button class="b s" onclick="smEvAdd('${iso}')">+ evento</button></div>`;
}
function smEvCor(c,b){SM.evc=c;b.parentElement.querySelectorAll('.sm-evc').forEach(x=>x.setAttribute('aria-pressed',String(x===b)))}
function smEvAdd(iso){
  const i=document.getElementById('sm_ev_'+iso),t=(i&&i.value||'').trim();if(!t){toast('Escreva o evento.');return}
  const ev={id:smId(),t,c:SM.evc||'roxo'};
  smMudar(d=>{const x=d.dias[iso]=d.dias[iso]||{};x.ev=x.ev||[];if(!x.ev.some(y=>y.id===ev.id))x.ev.push(ev)},'evento do dia');
}
function smEvDel(iso,id){smMudar(d=>{const x=d.dias[iso];if(x&&x.ev){x.ev=x.ev.filter(y=>y.id!==id);if(!x.ev.length)delete x.ev}},'apagou evento')}

// ===== ARRASTAR TAREFA PARA OUTRO DIA (pedido do Artur, 23/10/2026) =====
// Na aba Semana: mouse inicia ao mover >4 px; toque segura ~120 ms antes de mover e soltar
// num dia do calendário (grade ou lista), no cartão Hoje, na célula Tarefas (sem data) ou numa coluna da semana.
const SMD_HOLD=300;let SMD=null,smdEngole=0;
function smMover(id,dia){
  const t=smTar(id);if(!t||t.dia===dia)return;
  smMudar(d=>{const x=d.tarefas.find(y=>y.id===id);if(!x||x.dia===dia)return;
    if(x.grupo&&d.tarefas.some(y=>y.id!==id&&y.grupo===x.grupo&&y.dia===dia)){d.tarefas=d.tarefas.filter(y=>y.id!==id);return}   // o mesmo item já está nesse dia
    x.dia=dia;x.ordem=100+d.tarefas.filter(y=>y.dia===dia).length},'moveu item');
  toast(dia==='sem'?'Foi para Tarefas (sem data)':dia===smHoje()?'Foi para hoje':'Foi para '+smRotL(dia));
}
// Soltar no grupo muda só esta tarefa, pela mesma fila/retentativa da edição.
function smSolta(id,alvo,ref){
  const t=smTar(id);if(!t||!alvo?.drop)return false;
  const dia=alvo.drop,area=alvo.area,sub=alvo.sub||'';
  if(area!=null&&((t.area||'estudo')!==area||(t.sub||'')!==sub)){
    smMudar(d=>{const x=d.tarefas.find(y=>y.id===id);if(!x)return;
      x.area=area;if(sub)x.sub=sub;else delete x.sub;
      // Preserva os outros campos, inclusive recorrência, notas e anexos.
      x.dia=dia;
      const l=ordenarTarefas(d.tarefas.filter(y=>y.id!==id&&y.dia===dia&&(y.area||'estudo')===area&&(y.sub||'')===sub));
      const i=ref?l.findIndex(y=>y.id===ref):-1;l.splice(i<0?l.length:i,0,x);
      l.forEach((y,n)=>{y.ordem=(n+1)*10});
    },'editou tipo do item');return true;
  }
  if(t.dia===dia)return ref?smReordena(id,ref):false;
  smMover(id,dia);return true;
}
function smdAlvo(x,y){const el=document.elementFromPoint(x,y);return el&&el.closest&&el.closest('[data-drop]')}
function smdFim(cancela){
  const d=SMD;if(!d)return;clearTimeout(d.timer);clearInterval(d.auto);SMD=null;
  document.body.classList.remove('smd-on');document.querySelectorAll('.smd-alvo').forEach(e=>e.classList.remove('smd-alvo'));
  if(!d.ativo)return;d.g&&d.g.remove();smdEngole=1;setTimeout(()=>{smdEngole=0},80);
  document.querySelectorAll('.smd-linha').forEach(e=>e.classList.remove('smd-linha'));
  if(!cancela){const z=smdAlvo(d.cx,d.cy),tr=smdLinha(d);if(z)smSolta(d.id,z.dataset,tr);if(navigator.vibrate)try{navigator.vibrate(12)}catch(e){}}
}
function smdPos(){
  const d=SMD;if(!d||!d.ativo)return;d.g.style.transform=`translate(${d.cx-d.dx}px,${d.cy-d.dy}px)`;
  const z=smdAlvo(d.cx,d.cy);if(z!==d.z){d.z&&d.z.classList.remove('smd-alvo');z&&z.classList.add('smd-alvo');d.z=z}
  const tr=smdLinha(d);document.querySelectorAll('.smd-linha').forEach(e=>{if(e.dataset.tid!==tr)e.classList.remove('smd-linha')});if(tr)document.querySelectorAll(`#app .sm-row[data-tid="${tr}"]`).forEach(e=>e.classList.add('smd-linha'));
}
function smdComeca(){
  const d=SMD;if(!d)return;const r=document.querySelector(`.sm-row[data-tid="${d.id}"]`)||d.r,b=r.getBoundingClientRect();d.ativo=true;
  d.g=r.cloneNode(true);d.g.className+=' smd-g';d.g.style.cssText=`width:${b.width}px;left:0;top:0`;d.dx=d.x0-b.left;d.dy=d.y0-b.top;document.body.appendChild(d.g);
  document.body.classList.add('smd-on');try{getSelection().removeAllRanges()}catch(e){}
  if(navigator.vibrate)try{navigator.vibrate(25)}catch(e){}
  smdPos();
  d.auto=setInterval(()=>{const h=innerHeight;if(d.cy<70)scrollBy(0,-16);else if(d.cy>h-70)scrollBy(0,16);
    const q=document.getElementById('sm_quadro');if(q){const b=q.getBoundingClientRect();if(d.cy>=b.top&&d.cy<=b.bottom){if(d.cx<b.left+38)q.scrollLeft-=8;else if(d.cx>b.right-38)q.scrollLeft+=8}}smdPos()},16);
}
document.addEventListener('pointerdown',e=>{
  if(SMD||tela!=='tarefas'||(e.pointerType==='mouse'&&e.button!==0))return;
  const alca=e.target.closest&&e.target.closest('.sm-arrastar'),r=alca&&alca.closest('.sm-row[data-tid]');if(!r)return;
  SMD={r,id:r.dataset.tid,x0:e.clientX,y0:e.clientY,cx:e.clientX,cy:e.clientY,pid:e.pointerId,mouse:e.pointerType==='mouse',ativo:false};if(!SMD.mouse)SMD.timer=setTimeout(smdComeca,SMD_HOLD);
},true);
document.addEventListener('pointermove',e=>{
  const d=SMD;if(!d||e.pointerId!==d.pid)return;
  if(!d.ativo){const dist=Math.hypot(e.clientX-d.x0,e.clientY-d.y0);if(d.mouse&&dist>4){d.cx=e.clientX;d.cy=e.clientY;smdComeca()}else{if(!d.mouse&&dist>8)smdFim(true);return}}   // toque antes do prazo = rolagem normal
  e.preventDefault();d.cx=e.clientX;d.cy=e.clientY;smdPos();
},{passive:false});
document.addEventListener('pointerup',e=>{if(SMD&&e.pointerId===SMD.pid)smdFim(false)});
document.addEventListener('pointercancel',e=>{if(SMD&&e.pointerId===SMD.pid)smdFim(true)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&SMD)smdFim(true)});
document.addEventListener('touchmove',e=>{if(SMD&&SMD.ativo)e.preventDefault()},{passive:false});
document.addEventListener('selectstart',e=>{if(SMD&&(!e.target.isContentEditable||SMD.ativo))e.preventDefault()});
document.addEventListener('contextmenu',e=>{if(SMD)e.preventDefault()});
document.addEventListener('click',e=>{if(smdEngole){smdEngole=0;e.stopPropagation();e.preventDefault()}},true);

// ===== ORDEM DAS TAREFAS (pedido do Artur, 03/11/2026) =====
// Alt+↑/↓ na tarefa selecionada, ou arrastar sobre outra tarefa do mesmo dia. A prioridade continua vindo antes da ordem.
function smdLinha(d){const el=document.elementFromPoint(d.cx,d.cy),r=el&&el.closest&&el.closest('.sm-row[data-tid]');if(!r||r.dataset.tid===d.id)return null;const a=smTar(d.id),b=smTar(r.dataset.tid);return a&&b?b.id:null}
function smReordena(id,ref,k){
  const t=smTar(id);if(!t)return false;const l=smItensDe(t.dia).filter(x=>(x.area||'estudo')===(t.area||'estudo')&&(x.sub||'')===(t.sub||'')),i=l.findIndex(x=>x.id===id),j=ref?l.findIndex(x=>x.id===ref):i+k;
  if(i<0||j<0||j>=l.length||i===j)return false;
  const nova=l.filter(x=>x.id!==id);nova.splice(j,0,t);const ordem=new Map(nova.map((x,n)=>[x.id,(n+1)*10])),dia=t.dia;
  smMudar(d=>{d.tarefas.forEach(x=>{if(x.dia===dia&&ordem.has(x.id))x.ordem=ordem.get(x.id)})},'reordenou item');return true;
}
window.addEventListener('keydown',e=>{
  if(tela!=='tarefas'||!SMK.on||SM.ed||!e.altKey||e.ctrlKey||e.metaKey||(e.key!=='ArrowUp'&&e.key!=='ArrowDown'))return;
  if(typeof QA!=='undefined'&&QA.on)return;const t=e.target;if(t&&(/INPUT|SELECT|TEXTAREA/.test(t.tagName)||t.isContentEditable))return;
  const x=SMK.id?smTar(SMK.id):smkLista()[SMK.i];if(!x)return;e.preventDefault();e.stopImmediatePropagation();
  if(smReordena(x.id,null,e.key==='ArrowDown'?1:-1))setTimeout(()=>smkSeleciona(x.id),0);
},true);
// Editor de tarefa: clique fora cancela, Ctrl+Enter salva (pedido do Artur, 03/11/2026)
let smEdEngole=false;
document.addEventListener('pointerdown',e=>{const ed=document.querySelector('.sm-ed');if(!SM.ed||!ed||ed.contains(e.target))return;
  e.preventDefault();e.stopPropagation();smEdEngole=true;setTimeout(()=>{smEdEngole=false},600);smEdFecha()},true);
document.addEventListener('click',e=>{if(smEdEngole){smEdEngole=false;e.preventDefault();e.stopPropagation()}},true);
document.addEventListener('keydown',e=>{if(SM.ed&&document.querySelector('.sm-ed')&&e.ctrlKey&&!e.altKey&&e.key==='Enter'){e.preventDefault();e.stopPropagation();smSalvar()}},true);

// Atalhos do ícone (?acao=tarefa | voz | ri). Nova tarefa abre NA HORA (usa o calendário guardado no aparelho; não espera o GitHub
// nem as questões); se o calendário nunca foi carregado, o texto fica de rascunho e grava quando chegar. RI do dia espera os dados.
let smSyncResolve;
const smSyncCarga=new Promise(resolve=>{smSyncResolve=resolve});
function smAtalhosInicia(){
  const url=new URL(location.href),acao=url.searchParams.get('acao'),r=qaRascLer();
  if(r&&r.salvar){smCarga.then(smRascPend);if(!['tarefa','voz','ri'].includes(acao))return}   // tarefa digitada antes do app abrir (shim.js)
  if(!['tarefa','voz','ri'].includes(acao)){
    if(r&&r.aberto&&!r.salvar&&(r.texto||'').trim())setTimeout(()=>{if(!QA.on)qaAbre()},0);   // app recarregou/atualizou com a Nova tarefa aberta: reabre
    return;
  }
  url.searchParams.delete('acao');history.replaceState(history.state,'',url.pathname+url.search+url.hash);
  if(acao==='ri'){
    Promise.all([smCarga,smSyncCarga]).then(()=>{
      if(!SM.d){toast('Não foi possível carregar o calendário. Reabra o atalho quando houver conexão.');return}
      iniciaRI();
    });
    return;
  }
  go('semana');
  const abre=()=>{qaAbre();if(acao==='voz'&&qaVozAPI())qaVoz()};
  if(r&&r.salvar){smCarga.then(()=>SM.fila).then(abre);return}
  abre();
}

// ---- Ponte com o app Android (widgets e notificações; repo banco-cbr-android) ----
// Só age dentro do app Android (window.BCBRNativo). Manda um resumo quando muda, a cada 20 s e ao sair do app.
let smNatUlt='';
function smNativoResumo(){
  if(!SM.d)return null;const hj=smHoje();
  const tp=t=>t.area==='estudo'||t.area==='ferramenta'?t.area:'tarefas';
  const it=t=>({id:String(t.id),texto:tituloTarefa(t.texto),tipo:tp(t),feito:!!t.feito,urg:!!t.urg});
  const lista=d=>smItensDe(d).map(it).sort((a,b)=>(b.urg-a.urg));
  const dias={};for(let i=-7;i<=35;i++){const d=smMais(hj,i),x=smDia(d),m=smMetaDe(d);
    dias[d]={noite:smNoite(d)||'',ev:smEvL(d).map(v=>v.t||''),agenda:x.agenda||'',meta:m||0,feito:smQ(d).n,tipoDia:smTipo(d)};}
  return {geradoEm:new Date().toISOString(),hoje:hj,tarefasHoje:lista(hj),tarefasSem:lista('sem'),dias,mes:hj.slice(0,7)};
}
function smNativo(forca){
  smNativoTarefas();
  try{if(!window.BCBRNativo)return;const r=smNativoResumo();if(!r)return;
    const s=JSON.stringify({...r,geradoEm:''});if(!forca&&s===smNatUlt)return;smNatUlt=s;window.BCBRNativo.dados(JSON.stringify(r))}catch(e){console.warn('ponte Android',e)}
}
// No app Android: topo mostra a versão do site e a do APK (BCBRNativo.versao), para saber se o app atualizou.
try{const B=window.BCBRNativo,v=document.querySelector('.brand .versao');if(B&&typeof B.versao==='function'&&v)v.textContent='site '+(window.BCBR_VERSAO||'')+' · app '+B.versao()}catch(e){}
if(window.BCBRNativo){setInterval(()=>smNativo(),20000);document.addEventListener('visibilitychange',()=>{if(document.hidden)smNativo(true)});setTimeout(()=>smNativo(true),4000)}

// ---- Tarefas criadas pela tela nativa do app Android (sem abrir a WebView) — 1.17.0 ----
// BCBRNativo.pendentes() -> JSON [{id, texto, criadoEm, voz, tipo?}] · cada texto passa por interpretarTarefa;
// tipo 'ideia' (widget Ideia, APK 1.3) entra pela caixa, como tarefa Ferramenta sem data com o texto inteiro nos detalhes · BCBRNativo.confirmar(JSON de ids).
// Ids já importados ficam em localStorage (não duplica se o app nativo reenviar). Tolera a ponte sem esses métodos.
const SM_NAT_IMP='bcbr_nat_importados';
let smNatBusy=false;
function smNativoImporta(){
  try{
    const B=window.BCBRNativo;if(!B||typeof B.pendentes!=='function'||smNatBusy)return;
    if(!SM.d){smCarga.then(()=>{if(SM.d)smNativoImporta()});return}
    let lista=JSON.parse(B.pendentes()||'[]');if(!Array.isArray(lista)||!lista.length)return;
    let jaImp=[];try{jaImp=JSON.parse(localStorage.getItem(SM_NAT_IMP)||'[]')}catch(e){}
    const ids=[],gravacoes=[];smNatBusy=true;
    lista.forEach(p=>{
      if(!p||p.id==null)return;const id=String(p.id);ids.push(id);if(jaImp.includes(id))return;
      if(p.tipo==='concluir'){
        const tarefa=smTar(String(p.tarefa));if(!tarefa){ids.pop();return}
        gravacoes.push(smCheck(String(p.tarefa),true,true));
      }else{const t=String(p.texto||'').trim();if(t&&p.tipo==='ideia'){smIdeiaNova=true}else if(t){const nv=smCriaDeTexto(t,{nativoId:id});if(nv.length)toast('Salvei: '+smResumoNovos(nv))}}
      jaImp.push(id);
    });
    Promise.all([SM.fila,...gravacoes]).then(([, ...resultados])=>{smNatBusy=false;if(resultados.every(Boolean)&&!SM.erro&&ids.length){try{localStorage.setItem(SM_NAT_IMP,JSON.stringify(jaImp.slice(-500)));if(typeof B.confirmar==='function')B.confirmar(JSON.stringify(ids))}catch(e){console.warn('confirmar',e)}}});
  }catch(e){smNatBusy=false;console.warn('ponte Android (pendentes)',e)}
}
// ---- Caixa de ideias (ideias/caixa.md do repo privado) -> tarefas em Ferramenta, sem data ----
// A caixa é a fonte (pedido do Artur, 24/10/2026): cada "- [ ] AAAA-MM-DD HH:MM — texto" vira 1 tarefa (campo ideia = data/hora, não duplica);
// "- [x]" (o Claude no PC fez a ideia) marca a tarefa como concluída. Ideia do widget (APK) só é confirmada e entra pela caixa.
let smIdeiaNova=false,smIdeiasUlt=0;
function smIdeiasLinhas(md){const r=[];String(md||'').split(String.fromCharCode(10)).forEach(l=>{const m=l.trim().match(/^- \[( |x)\] (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) — (.+)$/);if(m&&!/^TESTE/.test(m[3]))r.push({feita:m[1]==='x',chave:m[2],texto:m[3].trim()})});return r}
async function smIdeiasSync(forca){
  if(!forca&&Date.now()-smIdeiasUlt<60000)return;smIdeiasUlt=Date.now();
  try{await smCarga;if(!SM.d)return;
    const f=await BCBR.api(`/repos/${BCBR.REPO}/contents/ideias/caixa.md`);const linhas=smIdeiasLinhas(smDec(f.content));
    // 1.19.4: a caixa só acrescenta. Ideia já importada nunca volta: concluída ou apagada por ele na aba fica assim
    // (antes "- [ ]" na caixa desmarcava a tarefa concluída e recriava a apagada). "- [x]" ainda conclui.
    const vistas=new Set(SM.d.ideiasVistas||SM.d.tarefas.filter(y=>y.ideia).map(y=>y.ideia));
    const muda=x=>{const t=SM.d.tarefas.find(y=>y.ideia===x.chave);return t?(x.feita&&!t.feito):!vistas.has(x.chave)};
    if(!linhas.some(muda)&&SM.d.ideiasVistas)return;
    // 1ª vez: ideias com mais de 2 h já passaram pela aba; se não há tarefa, ele apagou — não recria.
    const velha=x=>Date.now()-new Date(x.chave.replace(' ','T')).getTime()>7200000;
    smMudar(d=>{const v=new Set(d.ideiasVistas||[...d.tarefas.filter(y=>y.ideia).map(y=>y.ideia),...linhas.filter(velha).map(x=>x.chave)]);
      linhas.forEach(x=>{const t=d.tarefas.find(y=>y.ideia===x.chave);
        if(t){if(x.feita)t.feito=true;v.add(x.chave);return}
        if(v.has(x.chave))return;
        v.add(x.chave);const n=smNovos(['sem'],tituloTarefa(tituloIdeia(x.texto)),'ferramenta','',x.texto)[0];n.ideia=x.chave;n.feito=x.feita;d.tarefas.push(n)});
      d.ideiasVistas=[...v].slice(-1000)},'ideias do celular');
  }catch(e){if(e&&e.status!==404)console.warn('caixa de ideias',e)}
}
smIdeiasSync(true);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')smIdeiasSync()});
setInterval(()=>{if(smIdeiaNova){smIdeiaNova=false;setTimeout(()=>smIdeiasSync(true),12000)}},3000);   // widget acabou de mandar: relê a caixa
if(window.BCBRNativo){smNativoImporta();document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')smNativoImporta()})}

// ===== Semana 1.21: campos opcionais; nenhum dado privado vai para o código público =====
function smMetadados(t){
  const p=t.prioridade==='u'?'':t.prioridade||'',subs=t.subtarefas||[];
  return `<div class="sm-metadados">${p?`<span class="sm-prio sm-prio-${p}">${({u:'U',alta:'Alta',media:'Média',baixa:'Baixa'})[p]}</span>`:''}${t.hora?`<time>${esc(t.hora)}</time>`:''}${subs.length?`<span aria-label="Subtarefas concluídas">${subs.filter(s=>s.feito).length}/${subs.length}</span>`:''}${t.repetir?'<span title="Tarefa recorrente">↻</span>':''}${(t.etiquetas||[]).map(s=>`<span>#${esc(s)}</span>`).join('')}${t.anexos?.length?`<span>${t.anexos.length} anexo(s)</span>`:''}</div>`;
}
function smEdTemData(t,rd={}){return !!t&&(smGrupo(t).length>1&&SM.ed?.esc!=='este'?[...SM.ed.dias].some(dataTarefaValida):dataTarefaValida(rd.dia??t.dia))}
function smExtrasLer(){
  const valor=id=>document.getElementById(id)?.value||'',tipo=valor('sm_ed_rep'),dia=document.getElementById('sm_ed_dia'),temData=dia?dataTarefaValida(dia.value):smEdTemData(smTar(SM.ed?.id));
  return {prioridade:valor('sm_ed_prioridade')||null,hora:temData?(valor('sm_ed_hora')||null):null,lembrete:valor('sm_ed_lembrete')===''?null:+valor('sm_ed_lembrete'),
    repetir:tipo?{tipo,...(tipo==='semanal'?{dias:[...document.querySelectorAll('[name="sm_rep_dia"]:checked')].map(e=>+e.value)}:{})}:null,
    ...(document.getElementById('sm_ed_etiquetas')?{etiquetas:[...new Set(valor('sm_ed_etiquetas').split(/[\s,]+/).map(s=>s.replace(/^#/, '').trim()).filter(Boolean))]}:{})};   // sem campo Etiquetas no editor (1.29.0): mantém as que já existem
}
function smExtrasHtml(t,rd){
  const x={...t,...rd},rep=x.repetir||{},dias=rep.dias||[smDt(dataTarefaValida(t.dia)?t.dia:smHoje()).getDay()];
  const muda=`smRascEdSalva('${t.id}')`;
  return `<div class="sm-extras"><label>Prioridade<select id="sm_ed_prioridade" onchange="${muda}">${[['','Sem prioridade'],['alta','Alta'],['media','Média'],['baixa','Baixa']].map(([v,n])=>`<option value="${v}" ${v===(x.prioridade||'')?'selected':''}>${n}</option>`).join('')}</select></label>
    ${smEdTemData(t,rd)?`<label>Hora<input id="sm_ed_hora" type="time" value="${esc(x.hora||'')}" onchange="${muda}"></label>`:''}
    <label>Lembrete<select id="sm_ed_lembrete" onchange="${muda}">${[['','Nenhum'],['0','Na hora'],['15','15 min antes'],['60','1 h antes']].map(([v,n])=>`<option value="${v}" ${v===String(x.lembrete??'')?'selected':''}>${n}</option>`).join('')}</select></label>
    <label>Repetir<select id="sm_ed_rep" onchange="${muda};render()">${[['','Não repetir'],['diaria','Todo dia'],['uteis','Dias úteis'],['semanal','Toda semana'],['mensal','Todo mês']].map(([v,n])=>`<option value="${v}" ${v===(rep.tipo||'')?'selected':''}>${n}</option>`).join('')}</select></label></div>
    <div class="sm-rep-dias" ${rep.tipo==='semanal'?'':'hidden'}>${[1,2,3,4,5,6,0].map(d=>`<label><input type="checkbox" name="sm_rep_dia" value="${d}" ${dias.includes(d)?'checked':''} onchange="${muda}">${smDOW[d]}</label>`).join('')}</div>
    ${smSubHtml(t)}${smAnexosHtml(t)}<label>Anexar foto ou arquivo (até 3 MB)<input type="file" aria-label="Anexar foto ou arquivo" onchange="smAnexa('${t.id}',this)"></label>`;
}
function smSubHtml(t){
  return `<div class="sm-subtarefas"><b>Subtarefas</b>${(t.subtarefas||[]).map((s,i)=>`<div class="sm-sub"><label><input type="checkbox" ${s.feito?'checked':''} onchange="smSubMarca('${t.id}',${i},this.checked)"><span>${esc(s.texto)}</span></label><button class="sm-tagb" onclick="smSubApaga('${t.id}',${i})" aria-label="Apagar subtarefa">×</button></div>`).join('')}<form onsubmit="smSubAdd(event,'${t.id}')"><input name="texto" aria-label="Nova subtarefa" placeholder="Nova subtarefa" required><button class="sm-tagb" type="submit">+</button></form></div>`;
}
function smSubAdd(e,id){e.preventDefault();const i=e.currentTarget.elements.texto,texto=i.value.trim();if(!texto)return;const sub={id:smId(),texto,feito:false};i.value='';
  smMudar(d=>{const t=d.tarefas.find(t=>t.id===id);if(t){t.subtarefas=t.subtarefas||[];if(!t.subtarefas.some(s=>s.id===sub.id))t.subtarefas.push({...sub})}},'adicionou subtarefa');
}
function smSubMarca(id,i,feito){const sub=smTar(id)?.subtarefas?.[i];if(!sub)return;const sid=sub.id;smMudar(d=>{const l=d.tarefas.find(t=>t.id===id)?.subtarefas||[],s=sid?l.find(s=>s.id===sid):l[i];if(s)s.feito=feito},'marcou subtarefa')}
function smSubApaga(id,i){const sub=smTar(id)?.subtarefas?.[i];if(!sub)return;const sid=sub.id;smMudar(d=>{const t=d.tarefas.find(t=>t.id===id);if(t)t.subtarefas=(t.subtarefas||[]).filter((s,j)=>sid?s.id!==sid:j!==i)},'apagou subtarefa')}
const smAnexoImagem=a=>/^image\/(jpeg|png|gif|webp|avif)$/.test(a.tipo||'');
function smAnexosHtml(t){
  setTimeout(smAnexosMiniaturas,0);
  return `<div class="sm-anexos">${(t.anexos||[]).map((a,i)=>`<button class="sm-anexo sm-tagb" onclick="smAnexoAbre('${t.id}',${i})">${smAnexoImagem(a)?`<img data-anexo-t="${t.id}" data-anexo-i="${i}" alt="Miniatura de ${esc(a.nome)}">`:'📎'}<span>${esc(a.nome)}</span></button>`).join('')}</div>`;
}
async function smAnexa(id,input){
  const file=input.files?.[0];if(!file)return;if(file.size>3*1024*1024){toast('O arquivo deve ter até 3 MB.');input.value='';return}
  input.disabled=true;smRascEdSalva(id);
  try{
    const conteudo=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(new Error('Falha ao ler arquivo'));r.readAsDataURL(file)});
    const pasta=String(id).replace(/[^a-zA-Z0-9_-]/g,'_'),nome=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),caminho=`semana/anexos/${pasta}/${smId()}-${nome}`;
    const r=await BCBR.api(`/repos/${BCBR.REPO}/contents/${caminho}`,{method:'PUT',body:JSON.stringify({message:'semana: anexo da tarefa',content:conteudo,branch:'main'})});
    const anexo={id:smId(),nome:file.name,caminho,sha:r.content.sha,tipo:file.type,tamanho:file.size};
    const ok=await smMudar(d=>{const t=d.tarefas.find(t=>t.id===id);if(t){t.anexos=t.anexos||[];if(!t.anexos.some(a=>a.id===anexo.id))t.anexos.push(anexo)}},'anexou arquivo');
    toast(ok?'Anexo salvo':'Anexo enviado; os dados da tarefa ainda precisam sincronizar.');
  }catch(e){toast('Não foi possível anexar: '+e.message)}finally{input.disabled=false;input.value=''}
}
async function smAnexoUrl(a){
  SM.urlsAnexos=SM.urlsAnexos||{};const chave=a.sha||a.caminho;
  if(!SM.urlsAnexos[chave])SM.urlsAnexos[chave]=(async()=>{
    let f=a.sha?await BCBR.api(`/repos/${BCBR.REPO}/git/blobs/${encodeURIComponent(a.sha)}`):await BCBR.api(`/repos/${BCBR.REPO}/contents/${a.caminho}`);
    if(!f.content&&f.sha)f=await BCBR.api(`/repos/${BCBR.REPO}/git/blobs/${encodeURIComponent(f.sha)}`);
    const raw=atob(String(f.content||'').replace(/\s/g,'')),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes],{type:smAnexoImagem(a)||a.tipo==='application/pdf'?a.tipo:'application/octet-stream'}));
  })().catch(e=>{delete SM.urlsAnexos[chave];throw e});
  return SM.urlsAnexos[chave];
}
async function smAnexosMiniaturas(){
  for(const img of document.querySelectorAll('img[data-anexo-t]:not([src])')){
    const a=smTar(img.dataset.anexoT)?.anexos?.[+img.dataset.anexoI];if(!a)continue;
    try{img.src=await smAnexoUrl(a)}catch(e){img.alt='Toque para tentar abrir o anexo'}
  }
}
async function smAnexoAbre(id,i){
  const a=smTar(id)?.anexos?.[i];if(!a)return;const visual=smAnexoImagem(a)||a.tipo==='application/pdf',aba=visual?window.open('about:blank','_blank'):null;if(aba)aba.opener=null;
  try{const url=await smAnexoUrl(a);if(aba)aba.location.replace(url);else{const link=document.createElement('a');link.href=url;link.download=a.nome;link.click()}}
  catch(e){if(aba)aba.close();toast('Não foi possível abrir o anexo: '+e.message)}
}
async function smAgendaPuxar(){
  if(SM.agendaLendo)return;SM.agendaLendo=true;
  const aplica=a=>{const n=normalizarAgenda(a);SM.agenda=n.eventos;SM.avisosAgenda=n.avisos;SM.agendaAtualizado=n.atualizado};
  if(!SM.agenda){try{aplica(JSON.parse(localStorage.getItem('sm_agenda')||'[]'))}catch(e){aplica([])}}
  try{const f=await BCBR.api(`/repos/${BCBR.REPO}/contents/semana/agenda.json`,{etag:SM.agendaSha?SM.agendaEtag||'':undefined});if(f.naoMudou)return;SM.agendaEtag=f.etag;if(f.sha!==SM.agendaSha){const a=JSON.parse(smDec(f.content));if(!Array.isArray(a)&&!Array.isArray(a?.eventos))throw new Error('Formato de agenda inválido');aplica(a);SM.agendaSha=f.sha;try{localStorage.setItem('sm_agenda',JSON.stringify(a))}catch(e){}smRender()}}
  catch(e){if(e.status===404){const tinha=SM.agenda.length||SM.avisosAgenda?.length;aplica([]);SM.agendaSha=null;try{localStorage.removeItem('sm_agenda')}catch(e){}if(tinha)smRender()}}
  finally{SM.agendaLendo=false}
}
function smNativoTarefas(){
  try{const b=window.BCBRNativo;if(SM.d&&b&&typeof b.tarefas==='function')b.tarefas(JSON.stringify(tarefasNativas(SM.d.tarefas,smHoje())))}catch(e){console.warn('ponte Android (tarefas)',e)}
}
