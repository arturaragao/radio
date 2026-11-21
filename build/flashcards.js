const FC0=()=>[2.5,0,0,0,0,0,0]; // ease, intervalo(d), repetições, vence(ms), lapsos, último(ms), suspenso
const fst=id=>fcs[id]||FC0();
const cardBy=id=>cards.find(c=>c.id===id);
const fcAtivos=()=>cards.filter(c=>!c.x&&!fst(c.id)[6]);
const FC_HOJE_META=100;
const fcDKey=t=>typeof dKey==='function'?dKey(t):(()=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})();
let fcTema='',fcImg='todos',fcGrpAberto=true;var _fcMetaCache=null,_fcIncidCache=null;
function fcMetaLimpa(){_fcMetaCache=null;_fcIncidCache=null}
const fcQCards=()=>{const x=typeof window!=='undefined'&&window.FC_QUESTOES;return Array.isArray(x)?x:(x&&Array.isArray(x.cards)?x.cards:[])};
function fcMapaFundidos(){
  const raw={};
  const fq=typeof window!=='undefined'&&window.FC_QUESTOES;
  if(fq&&!Array.isArray(fq)&&fq.fundidos&&typeof fq.fundidos==='object')Object.assign(raw,fq.fundidos);
  const rf=typeof window!=='undefined'&&window.RESUMOS_FUNDIDOS;
  if(rf&&typeof rf==='object'&&!Array.isArray(rf))Object.assign(raw,rf);
  const out=new Map();
  for(const k of Object.keys(raw)){
    let cur=k,visto=new Set();
    while(raw[cur]&&typeof raw[cur]==='string'&&raw[cur]!==cur&&!visto.has(cur)&&visto.size<16){
      visto.add(cur);cur=raw[cur];
    }
    if(cur&&cur!==k)out.set(k,cur);
  }
  return out;
}
function fcMigraFundidos(salva=true){
  const mapa=fcMapaFundidos();
  if(!mapa.size)return false;
  const resolve=id=>mapa.get(id)||id;
  let changedFcs=false,changedAv=false,changedEst=false;
  const dirtyS=new Set();
  if(typeof fcs!=='undefined'&&fcs){
    for(const [oldId,newId] of mapa){
      const so=fcs[oldId];if(!so)continue;
      const sn=fcs[newId];
      if(!sn||(so[5]||0)>(sn[5]||0)||((so[5]||0)===(sn[5]||0)&&(so[2]||0)>(sn[2]||0))){
        fcs[newId]=[so[0],so[1],so[2],so[3],so[4],so[5],(so[6]||(sn&&sn[6]))?1:0];
      }else if(so[6]&&!sn[6]){
        sn[6]=1;
      }
      delete fcs[oldId];
      changedFcs=true;
      if(typeof hk==='function'){dirtyS.add(hk(oldId,8));dirtyS.add(hk(newId,8))}
    }
  }
  if(typeof fcAv!=='undefined'&&fcAv){
    for(const [oldId,newId] of mapa){
      const vo=fcAv[oldId];if(!vo)continue;
      const vn=fcAv[newId];
      if(!vn||(vo.u||0)>(vn.u||0))fcAv[newId]={...vo,id:newId};
      delete fcAv[oldId];
      changedAv=true;
    }
  }
  if(typeof cfg!=='undefined'&&cfg){
    if(cfg.fcHoje&&Array.isArray(cfg.fcHoje.feitos)){
      const next=[],seen=new Set();let dif=false;
      for(const id of cfg.fcHoje.feitos){
        const r=resolve(id);if(r!==id)dif=true;
        if(!seen.has(r)){seen.add(r);next.push(r)}else dif=true;
      }
      if(dif){cfg.fcHoje.feitos=next;changedEst=true}
    }
    if(Array.isArray(cfg.fcBlocos)){
      for(const b of cfg.fcBlocos){
        if(!b||!Array.isArray(b.ids))continue;
        const nextIds=[],seen=new Set();let dif=false;
        for(const id of b.ids){
          const r=resolve(id);if(r!==id)dif=true;
          if(!seen.has(r)){seen.add(r);nextIds.push(r)}else dif=true;
        }
        if(dif){b.ids=nextIds;changedEst=true}
        if(b.resp&&typeof b.resp==='object'){
          for(const oldId of Object.keys(b.resp)){
            const newId=resolve(oldId);if(newId===oldId)continue;
            const ro=b.resp[oldId],rn=b.resp[newId];
            if(ro&&(!rn||(ro.t||0)>(rn.t||0)))b.resp[newId]=ro;
            delete b.resp[oldId];changedEst=true;
          }
        }
        if(b.re&&typeof b.re==='object'){
          for(const oldId of Object.keys(b.re)){
            const newId=resolve(oldId);if(newId===oldId)continue;
            b.re[newId]=1;delete b.re[oldId];changedEst=true;
          }
        }
      }
    }
  }
  if(salva&&(changedFcs||changedAv||changedEst)){
    if(typeof saveL==='function'){
      if(changedFcs)saveL('cbr_fcs',fcs);
      if(changedAv)saveL('cbr_fcav',fcAv);
      if(changedEst)saveL('cbr_cfg',cfg);
    }
    if(salva==='save'){
      if(typeof window!=='undefined'){
        const prev=window._fcMigPend||{s:[],av:false,est:false};
        window._fcMigPend={s:[...new Set([...prev.s,...dirtyS])],av:prev.av||changedAv,est:prev.est||changedEst};
      }
    }else{
      if(typeof dirty!=='undefined'){
        dirtyS.forEach(k=>dirty.add('s:'+k));
        if(changedAv)dirty.add('av:0');
      }
      if(salva==='dirty'){
        if(changedEst&&typeof estDirty!=='undefined'){estDirty=true;if(typeof estU!=='undefined'){estU=Date.now();if(typeof saveL==='function')saveL('cbr_u',estU)}}
      }else if(typeof persist==='function'){
        if(changedEst)persist('_est');
        else if(changedFcs&&dirtyS.size)persist('s:'+dirtyS.values().next().value);
        else if(changedAv)persist('av:0');
      }
    }
  }
  return changedFcs||changedAv||changedEst;
}
function fcMetaMapa(){
  if(_fcMetaCache)return _fcMetaCache;
  const byId=new Map(),byRes=new Map();
  (typeof window!=='undefined'&&window.RESUMOS_IDX||[]).forEach(r=>{
    const ch=r.chave||'';
    if(r.titulo)byRes.set(norm('Resumo: '+r.titulo),{chave:ch,tema:r.titulo,baralho:'Resumo: '+r.titulo});
    (r.cards||[]).forEach(k=>{if(k&&k.id)byId.set(k.id,{chave:ch,tema:r.titulo||'',comImagem:!!(k.fi?.length||k.vi?.length),incid:0,q:null,fonte:'',baralho:'Resumo: '+(r.titulo||'')})});
  });
  fcQCards().forEach(k=>{
    if(!k||!k.id)return;
    byId.set(k.id,{chave:k.chave||'',tema:k.tema||'',comImagem:!!(k.comImagem||(k.fi?.length)||(k.vi?.length)),incid:Number(k.incid)||0,q:k.q||null,fonte:k.fonte||'',baralho:'Questões do banco'});
  });
  return _fcMetaCache={byId,byRes};
}
function fcMeta(c){
  if(!c)return {chave:'',tema:'',comImagem:false,incid:0,q:null,fonte:'',baralho:''};
  const {byId,byRes}=fcMetaMapa(),m=byId.get(c.id);
  const resTag=!m&&c.tg?cTags(c).map(t=>byRes.get(norm(t))).find(Boolean):null;
  const chave=c.chave||m?.chave||resTag?.chave||'';
  const tema=c.tema||m?.tema||resTag?.tema||'';
  const comImagem=!!(c.comImagem||m?.comImagem||(c.fi&&c.fi.length)||(c.vi&&c.vi.length));
  const incid=c.incid!=null?(Number(c.incid)||0):(m?.incid||0);
  return {chave,tema,comImagem,incid,q:c.q||m?.q||null,fonte:c.fonte||m?.fonte||'',baralho:m?.baralho||resTag?.baralho||''};
}
const fcTemImagem=c=>fcMeta(c).comImagem;
function fcChaveParts(chave){
  const p=String(chave||'').split('|').map(s=>s.trim());
  const a=p[0]||'',t=p[1]||'',s=p[2]||'';
  if(!a&&!t&&!s)return null;
  const aNome=(typeof AREA_BY!=='undefined'&&AREA_BY[a]?.nome)||a;
  return {a,t,s,aNome,areaK:a+'|',temaK:t?a+'|'+t+'|':'',fullK:s?a+'|'+t+'|'+s:(t?a+'|'+t+'|':a+'|')};
}
function fcChaveLabel(p){
  if(!p)return 'Sem tema';
  const parts=[p.aNome];
  if(p.t&&norm(p.t)!==norm(p.aNome))parts.push(p.t);
  if(p.s)parts.push(p.s);
  return parts.join(' › ')||p.aNome||'Sem tema';
}
function fcTemaOk(c,fil=fcTema){
  if(!fil)return true;
  const p=fcChaveParts(fcMeta(c).chave);
  if(fil==='__sem__')return !p;
  if(!p)return false;
  const fp=fil.split('|');
  if(fil.endsWith('|')){
    if(fp.length<=2)return norm(p.a)===norm(fp[0]);
    return norm(p.a)===norm(fp[0])&&norm(p.t)===norm(fp[1]);
  }
  return norm(p.a)===norm(fp[0])&&norm(p.t)===norm(fp[1]||'')&&norm(p.s)===norm(fp[2]||'');
}
const fcImgOk=(c,img=fcImg)=>img==='com'?fcTemImagem(c):img==='sem'?!fcTemImagem(c):true;
const fcFiltroOk=c=>cTagOk(c)&&fcTemaOk(c)&&fcImgOk(c);
function fcTemaSet(v){fcTema=v||'';render()}
function fcImgSet(v){fcImg=v||'todos';render()}

function fcContagem(){
  const now=Date.now(),h=hoje0();let n=0,d=0,m=0,hj=0,nh=0;
  fcAtivos().forEach(c=>{const s=fcs[c.id];if(!s||s[2]===0)n++;else{if(s[3]<=now)d++;if(s[1]>=21)m++}});
  Object.values(fcs).forEach(s=>{if((s[5]||0)>=h){hj++;if(s[2]===1&&s[4]===0)nh++}});
  return {n,d,m,hj,nh,tot:fcAtivos().length};
}
const fcFmt=d=>d>=365?(d/365).toFixed(1).replace('.',',')+' a':d>=30?(d/30).toFixed(1).replace('.',',')+' m':d+' d';
const fcTemParaHoje=c=>cfg.fcNovosPrimeiro?(c.n+c.d):(c.d+Math.min(c.n,Math.max(0,cfg.fcNovos-c.nh)));

// ---- 1.63.0: Bloco diário de 100 ("Hoje: 100 cards") ----
const fcHojeData=()=>fcDKey(Date.now());
const fcFrenteChave=c=>norm(fcTxt(c?.f||'')).replace(/\s+/g,' ').trim();
const fcHojeTema=c=>{
  const m=fcMeta(c),p=fcChaveParts(m.chave);
  return norm(p?(p.a+'|'+p.t):(m.tema||c.tg||'Sem tema')).replace(/\s+/g,' ').trim();
};
function fcHojeEstado(){
  const h=fcHojeData(),c=cfg.fcHoje;
  const mapa=fcMapaFundidos(),feitos=new Set((c&&c.d===h&&Array.isArray(c.feitos)?c.feitos:[]).map(id=>mapa.get(id)||id));
  // Reconstrói o contador se uma sincronização trouxe cfg incompleto, sem perder o histórico SRS.
  Object.entries(fcs).forEach(([id,s])=>{if(s[5]&&fcDKey(s[5])===h&&s[2]<=1&&!s[4])feitos.add(mapa.get(id)||id)});
  [...(cfg.fcBlocos||[]),...(fq?[fq]:[])].forEach(b=>Object.entries(b.resp||{}).forEach(([id,r])=>{
    if(r&&r.t&&fcDKey(r.t)===h&&(r.p===null||r.p?.[2]===0))feitos.add(mapa.get(id)||id);
  }));
  return {d:h,feitos:[...feitos]};
}
function fcHojeUne(local,remota){
  const h=fcHojeData();
  const lOk=local&&local.d===h&&Array.isArray(local.feitos);
  const rOk=remota&&remota.d===h&&Array.isArray(remota.feitos);
  if(!lOk&&!rOk)return null;
  if(!lOk)return {d:h,feitos:[...new Set(remota.feitos)]};
  if(!rOk)return {d:h,feitos:[...new Set(local.feitos)]};
  return {d:h,feitos:[...new Set([...local.feitos,...remota.feitos])]};
}
function fcHojeRegistra(id,add){
  const h=fcHojeData();
  const s=new Set(fcHojeEstado().feitos);
  if(add)s.add(id);else s.delete(id);
  cfg.fcHoje={d:h,feitos:[...s]};
}
function fcIncidMapa(){
  const qs=typeof Q!=='undefined'&&Array.isArray(Q)?Q:[];
  if(_fcIncidCache&&_fcIncidCache.ref===qs&&_fcIncidCache.n===qs.length)return _fcIncidCache;
  const sub=new Map(),tema=new Map(),area=new Map();
  let totC=0,totG=0;
  const isCbr=q=>typeof foCBR==='function'?foCBR(q):[].concat((q.pr_prova&&q.pr_prova.test)||[],(q.pr_tags&&q.pr_tags.test)||[]).includes('Provas CBR');
  const add=(m,k,c)=>{let x=m.get(k);if(!x){x={c:0,g:0};m.set(k,x)}x.g++;if(c)x.c++};
  qs.forEach(q=>{
    if(!q||!q.gab||!q._a||q._a==='sem')return;
    const cbr=isCbr(q);totG++;if(cbr)totC++;
    add(area,norm(q._a),cbr);
    if(q.cl&&q.cl[0]){
      add(tema,norm(q._a+'|'+q.cl[0]),cbr);
      if(q.cl[1])add(sub,norm(q._a+'|'+q.cl[0]+'|'+q.cl[1]),cbr);
    }
  });
  const score=x=>!x?0:totC?(0.75*(x.c/totC)+0.25*(x.g/totG)):(totG?x.g/totG:0);
  return _fcIncidCache={ref:qs,n:qs.length,sub,tema,area,score,isCbr};
}
function fcHojeIncidencia(c){
  const m=fcMeta(c),p=fcChaveParts(m.chave),M=fcIncidMapa();
  let incBanco=0;
  if(p){
    const sScore=p.s?M.score(M.sub.get(norm(p.a+'|'+p.t+'|'+p.s))):0;
    const tScore=p.t?M.score(M.tema.get(norm(p.a+'|'+p.t))):0;
    const aScore=p.a?M.score(M.area.get(norm(p.a))):0;
    if(sScore>0)incBanco=tScore>0?(0.7*sScore+0.3*tScore):sScore;
    else if(tScore>0)incBanco=tScore*0.5;
    else if(aScore>0)incBanco=aScore*0.15;
  }
  if(!incBanco&&m.q&&typeof QID!=='undefined'&&QID[m.q]){
    const q=QID[m.q];
    if(q._a&&q._a!=='sem'){
      const tScore=q.cl?.[0]?M.score(M.tema.get(norm(q._a+'|'+q.cl[0]))):0;
      incBanco=tScore>0?tScore*0.5:M.score(M.area.get(norm(q._a)))*0.15;
      if(M.isCbr(q))incBanco*=1.25;
    }
  }
  if(incBanco>0)return 100+incBanco*100+(Number(m.incid)||0)*1e-6;
  return Number(m.incid)||0;
}
function fcNovosDisponiveis(bloco='',prioridade=[]){
  const mapa=fcMapaFundidos(),porId=new Map(),ids=new Set(),frentes=new Set();
  cards.forEach(c=>{if(!porId.has(c.id))porId.set(c.id,c)});
  const resolve=id=>mapa.get(id)||id;
  const marca=id=>{const k=resolve(id),f=fcFrenteChave(porId.get(k)||porId.get(id));ids.add(k);if(f)frentes.add(f)};
  // reps=0 também ocorre após uma resposta errada no modo antigo: último>0 prova que já foi visto.
  Object.entries(fcs).forEach(([id,s])=>{if(s[2]>0||s[5]>0)marca(id)});
  (cfg.fcHoje?.feitos||[]).forEach(marca);
  [...(cfg.fcBlocos||[]),...(fq?[fq]:[])].forEach(b=>{
    Object.keys(b.resp||{}).forEach(marca);
    if(b.id!==bloco&&!b.fim&&(!b.hoje||b.hoje===fcHojeData()))(b.ids||[]).forEach(marca);
  });
  return [...prioridade.map(id=>porId.get(resolve(id))),...cards].filter(c=>c&&!c.x&&!fst(c.id)[6]).filter(c=>{
    const k=resolve(c.id),f=fcFrenteChave(c);
    if(k!==c.id||ids.has(k)||(f&&frentes.has(f)))return false;
    marca(k);return true;
  });
}
function fcHojeNovos(bloco='',prioridade=[]){
  const novos=fcNovosDisponiveis(bloco,prioridade)
    .map(c=>({c,img:fcTemImagem(c)?1:0,s:fcHojeIncidencia(c)}));   // pontua uma vez por card (não dentro do sort)
  novos.sort((a,b)=>(b.img-a.img)||(b.s-a.s)||String(a.c.id).localeCompare(String(b.c.id)));
  return novos.map(x=>x.c);
}
function fcHojeAleatorio(semente){
  let s=2166136261;
  for(const c of String(semente))s=Math.imul(s^c.charCodeAt(0),16777619)>>>0;
  return ()=>{s=(s+0x6D2B79F5)>>>0;let t=Math.imul(s^(s>>>15),s|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296};
}
function fcHojeOrdem(ids,semente){
  const rnd=fcHojeAleatorio(semente+':ordem'),grupos=new Map();
  const lista=[...ids];
  for(let i=lista.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[lista[i],lista[j]]=[lista[j],lista[i]]}
  lista.forEach(id=>{const k=fcHojeTema(cardBy(id));if(!grupos.has(k))grupos.set(k,[]);grupos.get(k).push(id)});
  const out=[];let anterior=null;
  while(out.length<lista.length){
    let op=[...grupos].filter(([k,g])=>g.length&&k!==anterior);
    if(!op.length)op=[...grupos].filter(([,g])=>g.length);
    // Maior fila primeiro evita adjacências inclusive quando um tema ocupa metade do bloco.
    const max=Math.max(...op.map(([,g])=>g.length));op=op.filter(([,g])=>g.length===max);
    const [k,g]=op[Math.floor(rnd()*op.length)];out.push(g.pop());anterior=k;
  }
  return out;
}
function fcHojeFila(){
  const feitos=fcHojeEstado().feitos,faltam=Math.max(0,FC_HOJE_META-feitos.length);
  if(!faltam)return [];
  const h=fcHojeData(),rnd=fcHojeAleatorio(h+':selecao'),grupos=new Map(),conta=new Map(),teto=Math.ceil(FC_HOJE_META*.15);
  feitos.forEach(id=>{const c=cardBy(id);if(c){const k=fcHojeTema(c);conta.set(k,(conta.get(k)||0)+1)}});
  fcHojeNovos().forEach(c=>{
    const k=fcHojeTema(c);if(!grupos.has(k))grupos.set(k,{k,com:[],sem:[],peso:0});
    const g=grupos.get(k),s=Math.max(0,fcHojeIncidencia(c));g[fcTemImagem(c)?'com':'sem'].push(c.id);g.peso=Math.max(g.peso,s);
  });
  const gs=[...grupos.values()].sort((a,b)=>a.k.localeCompare(b.k)),ids=[];
  while(ids.length<faltam){
    const disponiveis=gs.filter(g=>g.com.length||g.sem.length);if(!disponiveis.length)break;
    let op=disponiveis.filter(g=>(conta.get(g.k)||0)<teto);
    if(!op.length)op=disponiveis; // Só ultrapassa o teto depois de esgotar os demais temas.
    const imagem=op.some(g=>g.com.length),tipo=imagem?'com':'sem';op=op.filter(g=>g[tipo].length);
    const total=op.reduce((s,g)=>s+g.peso,0);let alvo=rnd()*(total||op.length),g=op[op.length-1];
    for(const x of op){alvo-=total?x.peso:1;if(alvo<0){g=x;break}}
    const j=Math.floor(rnd()*g[tipo].length);ids.push(g[tipo].splice(j,1)[0]);conta.set(g.k,(conta.get(g.k)||0)+1);
  }
  return fcHojeOrdem(ids,h);
}
function fcHojeAtualiza(b){
  const h=fcHojeData();
  if(!b||b.hoje!==h)return false;
  const novos=fcHojeNovos(b.id,b.ids).map(c=>c.id);
  const novosSet=new Set(novos);
  const resp=b.resp||{};
  // O conjunto e a ordem são um retrato da abertura: retomar nunca seleciona ou acrescenta cards.
  const proxIds=fcIdsAtivos((b.ids||[]).filter(id=>resp[id]||b.re?.[id]||novosSet.has(id)),resp);
  const mudou=proxIds.length!==(b.ids||[]).length||proxIds.some((id,idx)=>id!==b.ids[idx]);
  if(mudou){
    const curId=b.ids?.[b.i];
    b.ids=proxIds;
    const k=curId?b.ids.indexOf(curId):-1;
    if(k>=0)b.i=k;
    else{
      const nx=b.ids.findIndex(id=>!resp[id]);
      b.i=nx>=0?nx:Math.max(0,b.ids.length-1);
    }
    if(b===fq)fq.shown=!!(b.ids.length&&resp[b.ids[b.i]]);
  }
  return mudou;
}
function fcHojeStart(){
  const h=fcHojeData();
  const bEx=(cfg.fcBlocos||[]).find(x=>x.hoje===h&&!x.fim);
  if(bEx){
    fcHojeAtualiza(bEx);
    if(bEx.ids.length&&fcBlocoCarrega(bEx)){persist('_est');go('fcstudy');return}
  }
  const ids=fcHojeFila();
  if(!ids.length){
    const n=fcHojeEstado().feitos.length;
    toast(n>=FC_HOJE_META?'Meta de 100 cards de hoje concluída!':'Nenhum cartão novo para hoje.');
    return;
  }
  const now=Date.now(),b={id:'hoje:'+h,hoje:h,rs:'',titulo:'Hoje: 100 cards',ids,i:0,resp:{},fim:false,t0:now,u:now};
  fcBlocoSalvaNovo(b);fcBlocoCarrega(b);go('fcstudy');
}

function fcNext(s,g,inRe){
  let [ease,ivl,reps,due,lapses]=s,again=false,ni=0;const t=Date.now(),np=!!cfg.fcNovosPrimeiro;
  if(inRe&&!np){ // reaprendendo na sessão (modo antigo): só sai da fila ao acertar
    if(g===1)again=true;
    return {st:[ease,ivl,reps,due,lapses,t,s[6]],again,lb:g===1?'<1 min':fcFmt(Math.max(ivl,1))};
  }
  if(reps===0){
    if(g<=2){if(np){reps=1;ni=1}else again=true}else{reps=1;ni=g===3?1:4;if(g===4)ease+=.15}
  }else if(g===1){lapses++;ease=Math.max(1.3,ease-.2);ni=1;if(!np)again=true}
  else if(g===2){ease=Math.max(1.3,ease-.15);ni=Math.max(ivl+1,Math.round(ivl*1.2));reps++}
  else if(g===3){ni=Math.max(ivl+1,Math.round(ivl*ease));reps++}
  else{ni=Math.max(ivl+1,Math.round(ivl*ease*1.3));ease+=.15;reps++}
  const lb=reps===0||(again&&s[2]===0)?(g===1?'<1 min':'<10 min'):again?'<1 min':fcFmt(ni);
  const nreps=again&&s[2]>0?s[2]:reps;
  return {st:[ease,again?(s[2]>0?1:0):ni,nreps,again?(s[2]>0?t+DAY:0):t+ni*DAY,lapses,t,s[6]],again,lb};
}
const FC_NOTAS={1:'Errei',2:'Difícil',3:'Bom',4:'Fácil'};
let fq=null,fcBusca='',fcDelId=null,fcTags=new Set(),fcNew={f:'',v:''},fcEdit=null,fcAvEdit=null;
function fcImgRef(u){
  u=String(u||'').trim();if(!u)return '';
  if(/^(u:|data:|https?:)/.test(u))return u;
  if(u.startsWith('gh:'))u=u.slice(3);
  u=u.replace(/^\.?\/?(?:imagens|img)\//,'');
  try{if(/%[0-9a-fA-F]{2}/.test(u))u=decodeURIComponent(u)}catch(e){}
  return u?'gh:'+u:'';
}
function fcImgsHtml(arr){
  const list=(arr||[]).map(fcImgRef).filter(u=>u&&imgSrc(u));if(!list.length)return '';
  return `<div class="fc-imgs">${list.map(ref=>`<img class="fc-img" src="${esc(imgSrc(ref))}" data-u="${esc(ref)}" onclick="zoom('${esc(ref.replace(/'/g,"\\'"))}')" loading="lazy" alt="Imagem do flashcard" onerror="if(!this.dataset.bcbrTentou||!/(?:^|\\/)img\\//.test(this.getAttribute('src')||''))this.hidden=true">`).join('')}</div>`;
}
function fcAvSalvaReg(c,voto,motivo=''){
  const now=Math.max(Date.now(),(fcAv[c.id]?.u||0)+1),reg={id:c.id,tema:c.tg||'',frente:fcTxt(c.f),verso:fcTxt(c.v||''),voto,motivo:String(motivo||'').trim(),data:new Date(now).toISOString(),u:now};
  fcAv[c.id]=reg;persist('av:0');
}
function fcAvVota(v){
  if(!fq||fq.fim)return;const c=cardBy(fq.ids[fq.i]);if(!c)return;
  const cur=fcAv[c.id];
  if(v===1){fcAvEdit=null;fcAvSalvaReg(c,cur?.voto===1?0:1,'');render();return}
  if(cur?.voto===-1&&(!fcAvEdit||fcAvEdit.id!==c.id)){fcAvEdit=null;fcAvSalvaReg(c,0,'');render();return}
  fcAvEdit={id:c.id,txt:cur?.motivo||''};render();const el=$('#fc_av_txt');el&&el.focus();
}
function fcAvEditar(){
  if(!fq||fq.fim)return;const c=cardBy(fq.ids[fq.i]);if(!c)return;
  fcAvEdit={id:c.id,txt:fcAv[c.id]?.motivo||''};render();const el=$('#fc_av_txt');el&&el.focus();
}
function fcAvSalva(){
  if(!fcAvEdit)return;const c=cardBy(fcAvEdit.id);if(!c){fcAvEdit=null;render();return}
  const el=$('#fc_av_txt');const txt=el?el.value:fcAvEdit.txt;
  fcAvSalvaReg(c,-1,txt);fcAvEdit=null;render();toast('Avaliação salva');
}
function fcAvCancela(){fcAvEdit=null;render()}
const cTags=c=>{const t=String(c.tg||'').trim();return (/[;,]/.test(t)?t.split(/[;,]/):t.split(/\s+/)).map(x=>x.trim()).filter(Boolean)};
const cTagOk=c=>!fcTags.size||cTags(c).some(t=>fcTags.has(norm(t)));
function fcTog(k){fcTags.has(k)?fcTags.delete(k):fcTags.add(k);render()}
const fcIdsAtivos=(ids,resp={})=>{
  const mapa=fcMapaFundidos(),vistos=new Set(),preferidas=new Map(),porId=new Map();
  cards.forEach(c=>{if(!porId.has(c.id))porId.set(c.id,c)});
  const lista=(ids||[]).map(id=>mapa.get(id)||id).filter(id=>{const c=porId.get(id);return c&&!c.x&&!fst(id)[6]});
  lista.forEach(id=>{
    const f=fcFrenteChave(porId.get(id)),anterior=preferidas.get(f);
    if(f&&(!anterior||(!resp[anterior]&&resp[id])))preferidas.set(f,id);
  });
  return lista.filter(id=>{
    const f=fcFrenteChave(porId.get(id));
    if(vistos.has(id)||(f&&preferidas.get(f)!==id))return false;
    vistos.add(id);return true;
  });
};
// União de blocos entre aparelhos: preserva respostas de ambos por carimbo mais recente; reinício (t0 mais novo) vence o bloco antigo.
// Descarte deixa tombstone {id:u}; o bloco só some se não teve atividade (u ou resposta) depois do descarte — atividade posterior em outro aparelho o mantém (mais seguro: não perde resposta).
const fcBlocoUlt=b=>Math.max(b.u||0,...Object.values(b.resp||{}).map(r=>r&&r.t||0));
function fcMortosUne(a,b){const m={...(a||{})};Object.entries(b||{}).forEach(([k,u])=>{if(!(m[k]>=u))m[k]=u});return Object.fromEntries(Object.entries(m).sort((x,y)=>y[1]-x[1]).slice(0,100))}
function fcBlocosPreserva(local,remota,mortos){
  const L=Array.isArray(local)?local:[],R=Array.isArray(remota)?remota:[],m=new Map();
  const une=(a,b)=>{
    if(!a)return b;if(!b)return a;
    const diario=a.hoje&&a.hoje===b.hoje;
    if(!diario&&(b.t0||0)>(a.t0||0))return b;
    if(!diario&&(a.t0||0)>(b.t0||0))return a;
    const resp={...(a.resp||{})};
    Object.entries(b.resp||{}).forEach(([k,v])=>{if(!resp[k]||(v.t||0)>(resp[k].t||0))resp[k]=v});
    const bMais=(b.u||0)>(a.u||0);
    return {...(bMais?b:a),ids:[...new Set([...(bMais?b.ids:a.ids)||[],...(bMais?a.ids:b.ids)||[]])],resp,i:bMais?b.i:a.i,fim:diario?!!(a.fim||b.fim):(bMais?!!b.fim:!!a.fim),t0:bMais?b.t0:a.t0,u:Math.max(a.u||0,b.u||0)};
  };
  R.forEach(b=>{if(b&&b.id&&Array.isArray(b.ids))m.set(b.id,b)});
  L.forEach(b=>{if(b&&b.id&&Array.isArray(b.ids))m.set(b.id,une(m.get(b.id),b))});
  return [...m.values()].filter(b=>!(mortos&&mortos[b.id]>=fcBlocoUlt(b)));
}
function fcBlocosAbertos(){
  const h=fcHojeData();
  return (cfg.fcBlocos||[]).filter(b=>!b.fim&&(!b.hoje||b.hoje===h)).map(b=>{
    if(b.hoje===h)fcHojeAtualiza(b);
    const ids=fcIdsAtivos(b.ids,b.resp),feitas=ids.filter(id=>b.resp?.[id]).length;
    return ids.length?{...b,ids,feitas,n:ids.length}:null;
  }).filter(Boolean).sort((a,b)=>(b.u||0)-(a.u||0));
}
function fcBlocoSalvaNovo(b){
  b.ids=fcIdsAtivos(b.ids,b.resp);
  const h=fcHojeData();
  const list=(cfg.fcBlocos||[]).filter(x=>x.id!==b.id&&!(b.rs&&x.rs===b.rs)&&(!x.hoje||x.hoje===h)&&(x.rs||x.hoje||!x.fim));
  const semRs=list.filter(x=>!x.rs&&!x.hoje).sort((a,b)=>(b.u||0)-(a.u||0)).slice(0,4);
  cfg.fcBlocos=[...list.filter(x=>x.rs||x.hoje),...semRs,b];cfg.fcAtivo=b.id;persist('_est');
}
function fcBlocoSync(){
  if(!fq)return;fq.u=Date.now();
  const b={id:fq.id,rs:fq.rs||'',titulo:fq.titulo||'',ids:[...fq.ids],i:fq.i,resp:JSON.parse(JSON.stringify(fq.resp||{})),fim:!!fq.fim,t0:fq.t0||fq.u,u:fq.u};
  if(fq.hoje)b.hoje=fq.hoje;
  if(fq.re&&Object.keys(fq.re).length)b.re={...fq.re};
  cfg.fcBlocos=cfg.fcBlocos||[];const k=cfg.fcBlocos.findIndex(x=>x.id===b.id);
  if(k<0)cfg.fcBlocos.push(b);else cfg.fcBlocos[k]=b;
  cfg.fcAtivo=b.id;
}
function fcBlocoSalva(wk){fcBlocoSync();persist(wk||'_est')}
function fcBlocoCarrega(b){
  if(b.hoje===fcHojeData())fcHojeAtualiza(b);
  const ids=fcIdsAtivos(b.ids,b.resp);if(!ids.length)return false;
  const atual=fcMapaFundidos().get(b.ids?.[b.i])||b.ids?.[b.i],k=ids.indexOf(atual);
  const i=k>=0?k:Math.max(0,Math.min(+b.i||0,ids.length-1)),resp=JSON.parse(JSON.stringify(b.resp||{}));
  fq={id:b.id,rs:b.rs||'',hoje:b.hoje||'',titulo:b.titulo||'',ids,i,resp,re:b.re?{...b.re}:{},shown:!!resp[ids[i]],fim:!!b.fim,t0:b.t0||Date.now(),u:b.u||Date.now(),hist:[]};
  fcAvEdit=null;cfg.fcAtivo=b.id;return true;
}
function fcAbre(){
  const h=fcHojeData();
  if(fq&&!fq.fim&&(!fq.hoje||fq.hoje===h)){
    if(fq.hoje===h)fcHojeAtualiza(fq);
    fq.ids=fcIdsAtivos(fq.ids,fq.resp);
    if(fq.ids.length){fq.i=Math.min(fq.i,fq.ids.length-1);tela='fcstudy';sub=null;render();scrollTo(0,0);return true}
    fq=null;
  }
  const ab=fcBlocosAbertos();if(!ab.length)return false;
  const b=ab.find(x=>x.id===cfg.fcAtivo)||ab[0];
  if(!fcBlocoCarrega(b))return false;
  persist('_est');tela='fcstudy';sub=null;render();scrollTo(0,0);return true;
}
function fcRetoma(id){
  const b=(cfg.fcBlocos||[]).find(x=>x.id===id);if(!b||!fcBlocoCarrega(b)){toast('Bloco não encontrado');return}
  persist('_est');go('fcstudy');
}
function fcDescarta(id){
  const b=(cfg.fcBlocos||[]).find(x=>x.id===id);
  cfg.fcMortos=fcMortosUne(cfg.fcMortos,{[id]:Math.max(Date.now(),b?fcBlocoUlt(b):0)});
  cfg.fcBlocos=(cfg.fcBlocos||[]).filter(x=>x.id!==id);
  if(cfg.fcAtivo===id)cfg.fcAtivo=null;
  if(fq&&fq.id===id)fq=null;
  persist('_est');render();toast('Bloco descartado');
}
// Mesmo conjunto que vFc lista (inclui suspensos). Com cartões ainda carregando (vazio ou db sem 1º snapshot) não poda: nunca esvazia a seleção por carga incompleta.
function fcTagsPoda(){
  if(!fcTags.size||!cards.length||(DB&&typeof primeiro!=='undefined'&&primeiro))return;
  const ex=new Set();cards.filter(c=>!c.x).forEach(c=>cTags(c).forEach(t=>ex.add(norm(t))));
  for(const k of [...fcTags])if(!ex.has(k))fcTags.delete(k);
}
function fcStart(){
  fcTagsPoda();
  const now=Date.now(),c=fcContagem(),A=fcAtivos().filter(fcFiltroOk);
  const rev=A.filter(x=>{const s=fcs[x.id];return s&&s[2]>0&&s[3]<=now}).sort((a,b)=>fcs[a.id][3]-fcs[b.id][3]).slice(0,cfg.fcMax).map(x=>x.id);
  const novAll=fcNovosDisponiveis().filter(fcFiltroOk).map(x=>x.id);
  const ids=cfg.fcNovosPrimeiro?(novAll.length?novAll:rev):[...rev,...novAll.slice(0,Math.max(0,cfg.fcNovos-c.nh))];
  if(!ids.length){toast('Nada para estudar agora.');return}
  const tgNomes=fcTags.size?[...new Set(A.flatMap(cTags).filter(t=>fcTags.has(norm(t))))].slice(0,3).join(', '):'';
  const tmNome=fcTema?(fcTema==='__sem__'?'Sem tema':fcChaveLabel(fcChaveParts(fcTema))):'';
  const imgNome=fcImg==='com'?'Com imagem':fcImg==='sem'?'Sem imagem':'';
  const tit=[tgNomes,tmNome,imgNome].filter(Boolean).join(' · ')||'Cartões de hoje';
  const b={id:'fc_'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),rs:'',titulo:tit,ids,i:0,resp:{},fim:false,t0:now,u:now};
  fcBlocoSalvaNovo(b);fcBlocoCarrega(b);go('fcstudy');
}
function fcResumoCards(rsId,modo='hoje'){
  const r=(window.RESUMOS_IDX||[]).find(x=>x.pagina===rsId);if(!r)return [];
  const tag=norm('Resumo: '+r.titulo),A=fcAtivos().filter(c=>cTags(c).some(t=>norm(t)===tag));
  if(modo==='tudo')return fcIdsAtivos(A.map(c=>c.id));
  if(modo==='errados'){const b=(fq&&fq.rs===rsId?fq:null)||(cfg.fcBlocos||[]).find(x=>x.rs===rsId);return fcIdsAtivos((b?.ids||[]).filter(id=>b.resp?.[id]&&!b.resp[id].ok))}
  const novos=new Set(fcNovosDisponiveis('rs:'+rsId).map(c=>c.id));
  const now=Date.now(),nov=A.filter(c=>novos.has(c.id)).map(c=>c.id);
  const rev=A.filter(c=>{const s=fcs[c.id];return s&&s[2]>0&&s[3]<=now}).sort((a,b)=>fcs[a.id][3]-fcs[b.id][3]).map(c=>c.id);
  return cfg.fcNovosPrimeiro?(nov.length?nov:rev):[...rev,...nov];
}
function fcResumoStart(rsId,modo='hoje'){
  const r=(window.RESUMOS_IDX||[]).find(x=>x.pagina===rsId);if(!r)return false;
  const ids=fcResumoCards(rsId,modo);
  if(!ids.length){go('fc','lista');toast(modo==='errados'?'Nenhum erro neste resumo.':'Tudo em dia neste resumo.');return true}
  const now=Date.now(),b={id:'rs:'+rsId,rs:rsId,titulo:'Resumo: '+r.titulo,ids,i:0,resp:{},fim:false,t0:now,u:now};
  fcBlocoSalvaNovo(b);fcBlocoCarrega(b);go('fcstudy');return true;
}
function fcAbreResumo(rsId){
  const r=(window.RESUMOS_IDX||[]).find(x=>x.pagina===rsId);if(!r)return false;
  fcTags=new Set([norm('Resumo: '+r.titulo)]);
  const b=(cfg.fcBlocos||[]).find(x=>x.rs===rsId);
  if(b&&fcBlocoCarrega(b)){persist('_est');go('fcstudy');return true}
  return fcResumoStart(rsId,'hoje');
}
function fcProxIdx(de=0){
  if(!fq||!fq.ids.length)return -1;const n=fq.ids.length;
  for(let j=0;j<n;j++){const k=(de+j)%n;if(!fq.resp[fq.ids[k]])return k}
  return -1;
}
function fcIr(k){
  if(!fq||k<0||k>=fq.ids.length)return;
  fq.i=k;fq.shown=!!fq.resp[fq.ids[k]];fcAvEdit=null;fcBlocoSalva();render();scrollTo(0,0);
}
// Ao responder de novo um card já respondido no bloco, recalcula SRS a partir do estado pré-bloco (resp.p)
// quando disponível (ou mantém SRS intacto se ausente), evitando duplicar revisões/lapsos.
function fcGrade(g){
  if(!fq||fq.fim||!fq.ids.length||!fq.shown)return;
  const id=fq.ids[fq.i],prevR=fq.resp[id]?{...fq.resp[id]}:null,now=Date.now(),inRe=!!fq.re?.[id];
  fq.hist.push({id,i:fq.i,prevSrs:fcs[id]?[...fcs[id]]:null,prevResp:prevR,prevFim:!!fq.fim,prevIds:[...fq.ids],prevRe:{...(fq.re||{})}});
  if(!prevR){
    const pre=fcs[id]?[...fcs[id]]:null,r=fcNext(pre||FC0(),g,inRe);
    fcs[id]=r.st;
    if(!cfg.fcNovosPrimeiro&&r.again){
      fq.re=fq.re||{};fq.re[id]=1;
      fq.ids.splice(fq.i,1);fq.ids.splice(Math.min(fq.ids.length,fq.i+(g===1?3:6)),0,id);
      fq.i=Math.min(fq.i,fq.ids.length-1);fq.shown=!!fq.resp[fq.ids[fq.i]];
      fcAvEdit=null;fcBlocoSalva('s:'+hk(id,8));render();scrollTo(0,0);return;
    }
    if(fq.re)delete fq.re[id];
    fq.resp[id]={g,ok:g!==1,t:now,p:pre};
    if(!pre||pre[2]===0)fcHojeRegistra(id,true);
  }else{
    if(prevR.g!==g&&prevR.p!==undefined){const r=fcNext(prevR.p?[...prevR.p]:FC0(),g,false);fcs[id]=r.st}
    fq.resp[id]={...prevR,g,ok:g!==1,t:now};
  }
  if(!prevR){
    const nx=fcProxIdx(fq.i+1);
    if(nx<0)fq.fim=true;else{fq.i=nx;fq.shown=!!fq.resp[fq.ids[nx]]}
  }
  fcAvEdit=null;fcBlocoSalva('s:'+hk(id,8));render();if(!prevR)scrollTo(0,0);
}
function fcUndo(){
  if(!fq||!fq.hist.length){toast('Nada para desfazer');return}
  const h=fq.hist.pop();
  if(h.prevSrs)fcs[h.id]=h.prevSrs;else delete fcs[h.id];
  if(h.prevResp)fq.resp[h.id]=h.prevResp;else{delete fq.resp[h.id];if(!h.prevSrs||h.prevSrs[2]===0)fcHojeRegistra(h.id,false)}
  if(h.prevIds)fq.ids=h.prevIds;
  if(h.prevRe)fq.re=h.prevRe;
  fq.i=Math.max(0,Math.min(h.i,fq.ids.length-1));fq.fim=!!h.prevFim;fq.shown=true;
  fcAvEdit=null;fcBlocoSalva('s:'+hk(h.id,8));render();toast('Desfeito');
}
function fcEncerra(){if(!fq)return;fq.fim=true;fcBlocoSalva();render()}
function fcSoErrados(){
  if(!fq)return;
  if(fq.rs){fcResumoStart(fq.rs,'errados');return}
  const ids=fcIdsAtivos(fq.ids.filter(id=>fq.resp?.[id]&&!fq.resp[id].ok));
  if(!ids.length){toast('Nenhum erro neste bloco');return}
  const now=Date.now(),b={id:'fc_'+now.toString(36)+Math.random().toString(36).slice(2,5),rs:'',titulo:(fq.titulo?fq.titulo+' · ':'')+'Erros',ids,i:0,resp:{},fim:false,t0:now,u:now};
  fcBlocoSalvaNovo(b);fcBlocoCarrega(b);go('fcstudy');
}
function fcZoomToggle(){
  const z=typeof document!=='undefined'&&document.getElementById('zoom');
  if(z&&!z.hidden){typeof zClose==='function'&&zClose();return true}
  if(!fq||fq.fim||!fq.ids.length)return false;
  const c=cardBy(fq.ids[fq.i]);if(!c)return false;
  const dom=typeof document!=='undefined'&&document.querySelector('.fcard .fc-img:not([hidden])');
  const refs=[...(c.fi||[]),...(fq.shown?(c.vi||[]):[])].map(fcImgRef).filter(u=>u&&imgSrc(u));
  const u=dom?.dataset?.u||refs[0];
  if(!u||typeof zoom!=='function')return false;
  zoom(u);return true;
}
function fcKey(e){
  if(!fq)return;
  const tg=e.target;if(tg&&(/INPUT|SELECT|TEXTAREA/.test(tg.tagName)||tg.isContentEditable))return;
  if((typeof QA!=='undefined'&&QA.on)||(typeof document!=='undefined'&&document.querySelector('.nt-modal')))return;
  const k=e.key;
  if(k==='Escape'){go('fc','lista');return}
  if(fq.fim)return;
  if(keyIs(e,'img')){if(fcZoomToggle())e.preventDefault();return}
  if(keyIs(e,'fcshow')){e.preventDefault();if(!fq.ids.length)return;fq.shown=!fq.shown;render();return}
  if(k==='Enter'){e.preventDefault();if(!fq.ids.length)return;if(fq.i>=fq.ids.length-1)toast('Último cartão');else fcIr(fq.i+1);return}
  if(keyIs(e,'fc1'))fcGrade(1);else if(keyIs(e,'fc2'))fcGrade(2);else if(keyIs(e,'fc3'))fcGrade(3);else if(keyIs(e,'fc4'))fcGrade(4);
  else if(keyIs(e,'fcundo'))fcUndo();
  else if(!e.shiftKey&&k==='ArrowLeft'){e.preventDefault();fcIr(fq.i-1)}
  else if(!e.shiftKey&&k==='ArrowRight'){e.preventDefault();if(fq.i>=fq.ids.length-1)toast('Último cartão');else fcIr(fq.i+1)}
}
function fcSanitiza(raw){
  let s=String(raw??'');
  if(!s)return '';
  if(typeof isRt==='function'&&isRt(s))return rtClean(s.slice(1));
  s=s.replace(/\r\n?/g,'\n').replace(/\n+/g,'\n');
  if(typeof document==='undefined'||typeof document.createElement!=='function'){
    return esc(s.replace(/<br\s*\/?>/gi,'\n').replace(/<\/?(?:b|strong|i|em|ul|ol|li|p|div)\b[^>]*>/gi,'')).replace(/\n/g,'<br>');
  }
  if(!/<(?:br|ul|ol|li|p|div)\b/i.test(s))s=s.replace(/\n/g,'<br>');
  else s=s.replace(/([^>])\n/g,'$1<br>');
  const t=document.createElement('template');t.innerHTML=s;
  const BAD=/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|IFRAME|OBJECT|EMBED|SVG|MATH|IMG|LINK|META|HEAD|TITLE|FORM|INPUT|BUTTON|TEXTAREA|SELECT)$/;
  const walk=n=>{
    let out='';
    n.childNodes.forEach(c=>{
      if(c.nodeType===3){out+=esc(c.nodeValue.replace(/[\r\n\t]+/g,' '));return}
      if(c.nodeType!==1)return;
      const tg=c.tagName;
      if(BAD.test(tg))return;
      if(tg==='BR'){out+='<br>';return}
      if(tg==='UL'||tg==='OL'){
        let lis='';
        c.childNodes.forEach(ch=>{
          if(ch.nodeType===1&&ch.tagName==='LI'){
            const li=walk(ch).replace(/^(?:\s|<br>)*•\s*/,'').replace(/(?:\s*<br>\s*)+$/,'').trim();
            if(li)lis+=`<li>${li}</li>`;
          }
        });
        if(lis)out+=`<ul>${lis}</ul>`;
        return;
      }
      if(tg==='LI'){
        const li=walk(c).replace(/^(?:\s|<br>)*•\s*/,'').replace(/(?:\s*<br>\s*)+$/,'').trim();
        if(li)out+=`<ul><li>${li}</li></ul>`;
        return;
      }
      const inner=walk(c);
      if(tg==='B'||tg==='STRONG'){if(inner)out+=`<b>${inner}</b>`;return}
      if(tg==='I'||tg==='EM'){if(inner)out+=`<i>${inner}</i>`;return}
      if(tg==='P'||tg==='DIV'){if(inner.trim())out+=inner.replace(/(?:<br>)+$/,'')+'<br>';return}
      out+=inner;
    });
    return out;
  };
  return walk(t.content).replace(/^(?:\s*<br>\s*)+|(?:\s*<br>\s*)+$/gi,'').replace(/(<br>\s*){3,}/gi,'<br><br>').trim();
}
function fcFormataCard(html){
  if(!html)return '';
  let s=html,peg='';
  const pegaPeg=re=>{
    const m=s.match(re);
    if(!m)return false;
    let resto='',rotHtml='';
    if(m.length===4&&re.source.includes('<\\/i>')){
      rotHtml=`<i>${m[1].trim()}${(m[2]||'').replace(/\s*<\/li>\s*<\/ul>\s*$/i,'')}</i>`;
      resto=m[3]||'';
    }else{
      rotHtml=`<i>${(m[1]||'Pegadinha:').trim()}</i>`;
      resto=m[2]||'';
    }
    let fecha='';
    if(/<\/li>\s*<\/ul>\s*$/i.test(resto)){resto=resto.replace(/<\/li>\s*<\/ul>\s*$/i,'');fecha='</li></ul>'}
    resto=resto.replace(/^(?:\s*<br>\s*)+|(?:\s*<br>\s*)+$/gi,'').trim();
    s=(s.slice(0,m.index)+fecha).replace(/(?:\s*<br>\s*)+$/gi,'').trim();
    peg=`<div class="fc-peg">${rotHtml}${resto?' '+resto:''}</div>`;
    return true;
  };
  pegaPeg(/(?:<br>\s*|\s)*<i>\s*(Pegadinha\s*:?)\s*<\/i>([\s\S]*)$/i)
    ||pegaPeg(/(?:<br>\s*|\s)*<i>\s*(Pegadinha\s*:?)([\s\S]*?)<\/i>([\s\S]*)$/i)
    ||pegaPeg(/(?:<br>\s*|\s)*<b>\s*(Pegadinha\s*:?)\s*<\/b>([\s\S]*)$/i)
    ||pegaPeg(/(?:<br>\s*|\s)*(Pegadinha\s*:)([\s\S]*)$/i);
  if(/•/.test(s)&&!/<ul>/i.test(s)){
    const idx=s.search(/(?:<br>\s*|\s)*•\s*/);
    let cab=idx>=0?s.slice(0,idx):'';
    const corpo=idx>=0?s.slice(idx):s;
    cab=cab.replace(/(?:\s*<br>\s*)+$/gi,'').replace(/<\/b>\s*\.\s*$/i,'</b>').trim();
    const itens=corpo.split(/(?:<br>\s*|\s)*•\s*/).map(x=>x.replace(/(?:\s*<br>\s*)+$/gi,'').trim()).filter(Boolean);
    if(itens.length){
      return (cab?`<div class="fc-dx">${cab}</div>`:'')+`<ul>${itens.map(x=>`<li>${x}</li>`).join('')}</ul>`+peg;
    }
  }
  if(/<ul>/i.test(s)){
    s=s.replace(/^([\s\S]*?)<br>\s*(<ul>)/i,(_,cab,ul)=>{
      const c=cab.replace(/(?:\s*<br>\s*)+$/gi,'').replace(/<\/b>\s*\.\s*$/i,'</b>').trim();
      return (c?`<div class="fc-dx">${c}</div>`:'')+ul;
    });
    return s+peg;
  }
  return peg?(s?`<div>${s}</div>`:'')+peg:s;
}
function fcTxt(s){
  s=String(s||'');
  if(typeof isRt==='function'&&isRt(s))return rtTxt(s);
  if(typeof document==='undefined'||typeof document.createElement!=='function')return s.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const d=document.createElement('div');d.innerHTML=fcSanitiza(s).replace(/<br>|<\/li>/gi,'$& ');
  return (d.textContent||'').replace(/\s+/g,' ').trim();
}
function fcFace(c){
  const clz=/\{\{c\d+::(.*?)(?:::.*?)?\}\}/g,F=fcFormataCard(fcSanitiza(c.f)),V=fcFormataCard(fcSanitiza(c.v||''));
  if(clz.test(F)){
    return {f:F.replace(clz,'<span class="cz">[...]</span>'),b:F.replace(clz,'<span class="cz on">$1</span>')+(V?'<br><br>'+V:'')};
  }
  return {f:F,b:V};
}
function fcPainel(){
  const ids=fq.ids,n=ids.length,rs=fq.resp||{},feitas=ids.filter(i=>rs[i]).length;
  const ok=ids.filter(i=>rs[i]?.ok).length,er=feitas-ok;
  const ehHoje=fq.hoje===fcHojeData(),hFeitos=ehHoje?fcHojeEstado().feitos.length:0;
  const stats=ehHoje?`<span class="fc-hcnt">${hFeitos}/${FC_HOJE_META}</span> · ${feitas}/${n} feitos · <span style="color:var(--ok)">✓ ${ok}</span> &nbsp; <span style="color:var(--bad)">✗ ${er}</span>`
    :`${feitas}/${n} feitos · <span style="color:var(--ok)">✓ ${ok}</span> &nbsp; <span style="color:var(--bad)">✗ ${er}</span>`;
  const sub=ehHoje?`Hoje: ${hFeitos}/${FC_HOJE_META} · ${feitas} de ${n} no bloco`:`${feitas} de ${n} feitos`;
  return blocoPainel({i:fq.i,ids,resp:rs,feitas,ok,er,itemLabel:'Cartão',sub,fn:'fcIr',rowStats:stats});
}
function fcBarra(){
  const ab=fcBlocosAbertos();if(ab.length<2)return '';
  const eu=ab.find(b=>b.id===fq.id),nome=eu?`${eu.titulo||'Bloco'} · ${eu.feitas}/${eu.n}`:'Bloco atual';
  return `<div class="qblocos"><span class="mut">Bloco:</span><select aria-label="Trocar de bloco de flashcards" onchange="if(this.value)fcRetoma(this.value);this.blur()"><option value="">${esc(nome)}</option>${ab.filter(b=>b.id!==fq.id).map(b=>`<option value="${esc(b.id)}">→ ${esc(b.titulo||'Bloco')} · ${b.feitas}/${b.n}</option>`).join('')}</select></div>`;
}
function vFcStudy(){
  if(!fq&&!fcAbre())return vFc();
  if(!fq)return vFc();
  if(fq.hoje&&fq.hoje!==fcHojeData()){fq=null;return vFc()}
  if(!fq.fim&&fq.hoje===fcHojeData())fcHojeAtualiza(fq);
  fq.ids=fcIdsAtivos(fq.ids,fq.resp);
  if(!fq.ids.length){fq=null;return vFc()}
  if(fq.i>=fq.ids.length)fq.i=fq.ids.length-1;
  const ids=fq.ids,n=ids.length,rs=fq.resp||{},feitas=ids.filter(i=>rs[i]).length,ok=ids.filter(i=>rs[i]?.ok).length,er=feitas-ok;
  if(fq.fim){
    const hj=fq.rs?fcResumoCards(fq.rs,'hoje').length:0,totRs=fq.rs?fcResumoCards(fq.rs,'tudo').length:0;
    return `<div class="card" style="text-align:center"><h2>Bloco concluído</h2>${fq.titulo?`<p class="mut" style="margin-top:-6px">${esc(fq.titulo)}</p>`:''}
    <div class="kpis" style="margin:14px 0"><div class="kpi"><b>${feitas}/${n}</b><span class="mut">feitos</span></div><div class="kpi"><b style="color:var(--ok)">${ok}</b><span class="mut">acertos</span></div><div class="kpi"><b style="color:var(--bad)">${er}</b><span class="mut">erros</span></div><div class="kpi"><b>${feitas?pct(ok,feitas)+'%':'—'}</b><span class="mut">aproveitamento</span></div></div>
    <div class="row" style="justify-content:center">${fq.rs?`${hj?`<button class="b" onclick="fcResumoStart('${esc(fq.rs)}','hoje')">Estudar pendentes de hoje (${hj})</button>`:''}<button class="b ${hj?'s':''}" onclick="fcResumoStart('${esc(fq.rs)}','tudo')">Recomeçar tudo (${totRs})</button>`:fq.hoje?`<button class="b" onclick="fcHojeStart()">Hoje: 100 cards (${fcHojeEstado().feitos.length}/${FC_HOJE_META})</button>`:`<button class="b" onclick="fcStart()">Novo bloco</button>`}${er?`<button class="b s" onclick="fcSoErrados()">Só os errados (${er})</button>`:''}${fq.hist.length?`<button class="b s" onclick="fcUndo()">Desfazer (${keyLab('fcundo')})</button>`:''}<button class="b s" onclick="go('fc','lista')">Voltar aos cartões</button></div></div>`;
  }
  const id=ids[fq.i],c=cardBy(id),f=fcFace(c),r=rs[id],s=(r&&r.p!==undefined)?(r.p||FC0()):fst(id),inRe=!!fq.re?.[id];
  const lbl=g=>fcNext(s,g,inRe).lb,av=fcAv[id],edAv=fcAvEdit&&fcAvEdit.id===id,meta=fcMeta(c);
  const imgsF=fcImgsHtml(c.fi),imgsV=fcImgsHtml(c.vi);
  const rodInfo=[c.tg,meta.tema&&!String(c.tg||'').includes(meta.tema)?meta.tema:'',meta.fonte].filter(Boolean).join(' · ');
  const avHtml=`<div class="fcard-rod">${rodInfo?`<span class="mut" style="font-size:.78rem">${esc(rodInfo)}</span>`:'<span></span>'}<div class="fc-av"><button type="button" class="ok ${av?.voto===1?'on':''}" aria-label="Gostei do cartão" aria-pressed="${av?.voto===1}" title="Gostei" onclick="fcAvVota(1)">👍</button><button type="button" class="bad ${av?.voto===-1?'on':''}" aria-label="Não gostei do cartão" aria-pressed="${av?.voto===-1}" title="Não gostei" onclick="fcAvVota(-1)">👎</button></div></div>${av?.voto===-1&&!edAv?`<div class="fc-av-mot mut">${av.motivo?`Motivo: ${esc(av.motivo)}`:'Marcado como não gostei'} <button type="button" class="fc-av-ed" onclick="fcAvEditar()">Editar motivo</button></div>`:''}${edAv?`<div class="fc-av-box"><input id="fc_av_txt" placeholder="O que não gostou?" value="${esc(fcAvEdit.txt)}" oninput="fcAvEdit.txt=this.value" onkeydown="if(event.key==='Enter'){event.preventDefault();fcAvSalva()}else if(event.key==='Escape'){event.preventDefault();fcAvCancela()}"><div class="row" style="margin-top:6px"><button type="button" class="b" style="padding:5px 12px;font-size:.82rem" onclick="fcAvSalva()">Salvar</button><button type="button" class="b s" style="padding:5px 12px;font-size:.82rem" onclick="fcAvCancela()">Cancelar</button></div></div>`:''}`;
  if(typeof setTimeout==='function'&&typeof document!=='undefined')setTimeout(()=>{const g=document.querySelector('.qnav .qgrid'),cur=g?.querySelector('.qn.cur');if(g&&cur)g.scrollTop=Math.max(0,cur.offsetTop-g.offsetTop-4)},0);
  return `${fcBarra()}<div class="fcbar"><div class="row"><button class="b s" onclick="go('fc','lista')">Sair (Esc)</button>${fq.titulo?`<span class="pill">${esc(fq.titulo)}</span>`:''}</div><button class="b s" onclick="fcEncerra()">Encerrar bloco</button></div>
  <div class="qlay"><div style="min-width:0">
  <div class="fcwrap"><button type="button" class="b s fcnav-bt fcprev" onclick="fcIr(${fq.i-1})" ${fq.i<=0?'disabled':''} aria-label="Cartão anterior" title="Anterior (←)">‹</button>
  <div class="card fcard">${r&&fq.shown?`<div class="fcresp ${r.ok?'ok':'bad'}">Resposta dada: ${FC_NOTAS[r.g]||''}</div>`:''}<div class="fcf">${f.f}${imgsF}</div>${fq.shown?`<hr><div class="fcf">${f.b||(!imgsV?'<span class="mut">(sem verso)</span>':'')}${imgsV}</div>`:''}${avHtml}</div>
  <button type="button" class="b s fcnav-bt fcnext" onclick="fcIr(${fq.i+1})" ${fq.i>=n-1?'disabled':''} aria-label="Próximo cartão" title="Próximo (→)">›</button></div>
  ${fq.shown?`<div class="fcg"><button class="g1 ${r?.g===1?'sel':''}" onclick="fcGrade(1)"><small>${lbl(1)}</small>Errei <kbd>${keyLab('fc1')}</kbd></button><button class="g2 ${r?.g===2?'sel':''}" onclick="fcGrade(2)"><small>${lbl(2)}</small>Difícil <kbd>${keyLab('fc2')}</kbd></button><button class="g3 ${r?.g===3?'sel':''}" onclick="fcGrade(3)"><small>${lbl(3)}</small>Bom <kbd>${keyLab('fc3')}</kbd></button><button class="g4 ${r?.g===4?'sel':''}" onclick="fcGrade(4)"><small>${lbl(4)}</small>Fácil <kbd>${keyLab('fc4')}</kbd></button></div>`
   :`<div class="row" style="justify-content:center"><button class="b" style="min-width:260px;padding:14px" onclick="fq.shown=true;render()">Mostrar resposta <kbd>${keyLab('fcshow')}</kbd></button></div>`}
  <p class="mut" style="text-align:center;margin-top:14px;font-size:.8rem">← / →: anterior / próximo · ${keyLab('fcshow')}: virar · Enter: próximo · G: imagem · ${keyLab('fc1')}–${keyLab('fc4')}: nota · ${keyLab('fcundo')}: desfazer · Esc: sair</p>
  </div>${fcPainel()}</div>`;
}
function cardHoje(){
  const c=fcContagem(),ab=fcBlocosAbertos(),hFeitos=fcHojeEstado().feitos.length;
  return `<div class="card" id="card_fc" style="margin-top:16px"><div class="row" style="justify-content:space-between"><span class="kick">Flashcards</span><span class="pill">${c.tot} no total · Hoje ${hFeitos}/${FC_HOJE_META}</span></div><h3>Cartões de hoje</h3>
  <p class="mut">${c.tot?`${c.d} a rever, ${c.n} novos${cfg.fcNovosPrimeiro?' (novos primeiro)':` (limite ${cfg.fcNovos} por dia)`}.`:'Nenhum cartão ainda. Importe seus flashcards na aba Flashcards.'}</p>
  <div class="row">${ab.length?`<button class="b" onclick="go('fc')">Continuar bloco (${ab[0].feitas}/${ab[0].n})</button>`:`<button class="b" ${fcTemParaHoje(c)?'':'disabled'} onclick="fcStart()">Estudar cartões</button>`}</div></div>`;
}
function fcAdd(){
  const f=rtVal(fcNew.f),v=rtVal(fcNew.v),t=$('#fc_t').value.trim();
  if(!f){toast('Escreva a frente do cartão.');return}
  const c={id:'c'+Date.now().toString(36),f,v,tg:t,u:Date.now()};cards.push(c);persist('c:'+hk(c.id,32));fcNew={f:'',v:''};render();toast('Cartão adicionado');
}
function fcImportar(){
  const t=$('#fc_imp').value.trim();if(!t)return;let rows=[];
  const limpa=x=>String(x||'').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').trim();
  try{
    if(t[0]==='[')rows=JSON.parse(t).map(o=>[o.f||o.frente||o.front||'',o.v||o.verso||o.back||'',o.tags||o.tg||'']);
    else rows=t.split(/\r?\n/).filter(l=>l.trim()&&l[0]!=='#').map(l=>{const p=l.includes('\t')?l.split('\t'):l.split(';');return [p[0],p[1],p.slice(2).join(' ')]});
  }catch(e){toast('Formato inválido');return}
  const seen=new Set(cards.map(c=>c.f+'\u0001'+c.v));let n=0;
  rows.forEach(r=>{const f=limpa(r[0]),v=limpa(r[1]);if(!f||seen.has(f+'\u0001'+v))return;seen.add(f+'\u0001'+v);
    const c={id:'c'+Date.now().toString(36)+(n++).toString(36),f,v,tg:limpa(r[2]),u:Date.now()};cards.push(c);dirty.add('c:'+hk(c.id,32))});
  persist();render();toast(n+' cartões importados');
}
function fcEditAbre(id){const c=cardBy(id);if(!c)return;fcEdit={id,f:fcSanitiza(c.f),v:fcSanitiza(c.v),tg:c.tg||''};render();setTimeout(()=>{const e=$('#ed_f');if(e)e.scrollIntoView({block:'center'})},50)}
function fcEditSalva(){const c=cardBy(fcEdit.id),f=rtVal(fcEdit.f),v=rtVal(fcEdit.v);if(!f){toast('A frente não pode ficar vazia.');return}
  Object.assign(c,{f,v,tg:fcEdit.tg.trim(),u:Date.now()});delete c._rs;persist('c:'+hk(c.id,32));fcEdit=null;render();toast('Flashcard salvo')}
function fcSusp(id){const s=fst(id).slice();s[6]=s[6]?0:1;s[5]=Date.now();fcs[id]=s;persist('s:'+hk(id,8));render()}
function fcDel(id){if(fcDelId!==id){fcDelId=id;render();return}fcDelId=null;const c=cardBy(id);c.x=1;c.u=Date.now();delete c._rs;persist('c:'+hk(id,32));render();toast('Cartão excluído')}
function fcBannerBlocos(){
  const ab=fcBlocosAbertos();if(!ab.length)return '';
  return ab.map(b=>{
    const ok=b.ids.filter(id=>b.resp?.[id]?.ok).length,dt=b.u?new Date(b.u).toLocaleString('pt-BR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
    return `<div class="iab" style="margin:10px 0"><div class="kick">${b.titulo?esc(b.titulo):'Bloco em andamento'}</div><p style="margin:6px 0">${b.feitas} de ${b.n} feitos${b.feitas?` · ${pct(ok,b.feitas)}% de acerto`:''} · parou no cartão ${(b.i||0)+1}${dt?` · salvo em ${dt}`:''}</p><div class="row"><button class="b" onclick="fcRetoma('${esc(b.id)}')">Continuar</button><button class="b s" onclick="fcDescarta('${esc(b.id)}')">Descartar</button></div></div>`;
  }).join('');
}
function fcAgrupaTemas(lista){
  const areas=new Map(),sem={n:0,com:0,sem:0};
  const inc=(o,img)=>{o.n++;if(img)o.com++;else o.sem++};
  lista.forEach(c=>{
    const img=fcTemImagem(c),p=fcChaveParts(fcMeta(c).chave);
    if(!p){inc(sem,img);return}
    const ak=norm(p.a);
    let ao=areas.get(ak);if(!ao){ao={k:p.areaK,a:p.a,label:p.aNome,n:0,com:0,sem:0,temas:new Map()};areas.set(ak,ao)}
    inc(ao,img);
    if(p.t){
      const tk=norm(p.a+'|'+p.t);
      let to=ao.temas.get(tk);if(!to){to={k:p.temaK,label:fcChaveLabel({aNome:p.aNome,t:p.t,s:''}),n:0,com:0,sem:0,subs:new Map()};ao.temas.set(tk,to)}
      inc(to,img);
      if(p.s){
        const sk=norm(p.fullK);
        let so=to.subs.get(sk);if(!so){so={k:p.fullK,label:fcChaveLabel(p),n:0,com:0,sem:0};to.subs.set(sk,so)}
        inc(so,img);
      }
    }
  });
  const ord=(a,b)=>b.n-a.n||String(a.label).localeCompare(String(b.label));
  const arList=[...areas.values()].sort(ord).map(ao=>({...ao,temas:[...ao.temas.values()].sort(ord).map(to=>({...to,subs:[...to.subs.values()].sort(ord)}))}));
  return {areas:arList,sem};
}
function fcOpcoesTema(lista){
  const {areas,sem}=fcAgrupaTemas(lista);
  const ops=[`<option value="">Todos os temas (${lista.length})</option>`];
  areas.forEach(ao=>{
    ops.push(`<option value="${esc(ao.k)}" ${fcTema===ao.k?'selected':''}>${esc(ao.label)} (${ao.n})</option>`);
    ao.temas.forEach(to=>{
      const subVis=to.subs.length>1||(to.subs.length===1&&to.subs[0].n<to.n);
      if(subVis||!to.subs.length)ops.push(`<option value="${esc(to.k)}" ${fcTema===to.k?'selected':''}>&nbsp;&nbsp;${esc(to.label)} (${to.n})</option>`);
      to.subs.forEach(so=>{
        ops.push(`<option value="${esc(so.k)}" ${fcTema===so.k?'selected':''}>&nbsp;&nbsp;&nbsp;&nbsp;${esc(so.label)} (${so.n})</option>`);
      });
    });
  });
  if(sem.n)ops.push(`<option value="__sem__" ${fcTema==='__sem__'?'selected':''}>Sem tema (${sem.n})</option>`);
  return {ops:ops.join(''),areas,sem};
}
function fcGruposHtml(areas,sem){
  const linhas=[];
  areas.forEach(ao=>{
    if(ao.temas.length){
      ao.temas.forEach(to=>{
        if(to.subs.length){
          to.subs.forEach(so=>linhas.push(so));
          if(to.subs.reduce((a,s)=>a+s.n,0)<to.n)linhas.push(to);
        }else linhas.push(to);
      });
    }else linhas.push(ao);
  });
  if(sem.n)linhas.push({k:'__sem__',label:'Sem tema',...sem});
  if(!linhas.length)return '';
  return `<div class="fc-grupos">${linhas.map(g=>`<button type="button" class="fc-grp ${fcTema===g.k?'on':''}" onclick="fcTemaSet(fcTema==='${esc(g.k.replace(/'/g,"\\'"))}'?'':'${esc(g.k.replace(/'/g,"\\'"))}')"><span class="fc-grp-nm">${esc(g.label)}</span><span class="fc-grp-ct">${g.n}${g.com?` · 🖼 ${g.com}`:''}${g.sem?` · ${g.sem} sem img`:''}</span></button>`).join('')}</div>`;
}
function vFc(){
  if(fq?.fim)fq=null;
  fcTagsPoda();
  const c=fcContagem(),q=norm(fcBusca||'');
  const todos=cards.filter(x=>!x.x);
  const baseTema=todos.filter(x=>cTagOk(x)&&fcTemaOk(x));
  const nTodos=baseTema.length,nCom=baseTema.filter(fcTemImagem).length,nSem=nTodos-nCom;
  const {ops:temaOps,areas,sem}=fcOpcoesTema(todos.filter(x=>cTagOk(x)&&fcImgOk(x)));
  const filtrados=todos.filter(fcFiltroOk);
  const lista=filtrados.filter(x=>!q||norm(fcTxt(x.f)+' '+fcTxt(x.v)+' '+(x.tg||'')+' '+fcMeta(x).tema).includes(q)).slice(0,60);
  const TG={};todos.forEach(x=>cTags(x).forEach(t=>{const k=norm(t);(TG[k]??={t,n:0}).n++}));
  const nSel=fcAtivos().filter(fcFiltroOk).length,temFiltro=!!(fcTags.size||fcTema||fcImg!=='todos');
  const now=Date.now(),hFeitos=fcHojeEstado().feitos.length,hFila=fcHojeFila(),hRest=hFila.length;
  const temGrupos=areas.length>0||sem.n>0;
  return `<div class="card"><h2>Flashcards</h2>${fcBannerBlocos()}
  <div class="fc-filtros">
    <label class="fc-fil-lbl">Tema <select id="fc_tema" aria-label="Filtrar por tema" onchange="fcTemaSet(this.value)">${temaOps}</select></label>
    <div class="seg fc-img-seg" role="group" aria-label="Filtrar por imagem">
      <button type="button" class="${fcImg==='todos'?'on':''}" onclick="fcImgSet('todos')">Todos (${nTodos})</button>
      <button type="button" class="${fcImg==='com'?'on':''}" onclick="fcImgSet('com')">Com imagem (${nCom})</button>
      <button type="button" class="${fcImg==='sem'?'on':''}" onclick="fcImgSet('sem')">Sem imagem (${nSem})</button>
    </div>
    ${temFiltro?`<button type="button" class="b s" style="padding:5px 10px;font-size:.8rem" onclick="fcTags.clear();fcTema='';fcImg='todos';render()">Limpar filtros</button>`:''}
  </div>
  ${temGrupos?`<details class="fc-grp-det" ${fcGrpAberto?'open':''} ontoggle="fcGrpAberto=this.open"><summary class="mut" style="font-size:.84rem;cursor:pointer;margin-bottom:6px">Grupos por tema (${areas.length} ${areas.length===1?'área':'áreas'})</summary>${fcGruposHtml(areas,sem)}</details>`:''}
  <div class="kpis"><div class="kpi"><b style="color:var(--pri-tx)">${c.n}</b><span class="mut">novos</span></div><div class="kpi"><b style="color:var(--ok)">${c.d}</b><span class="mut">a rever</span></div><div class="kpi"><b>${c.m}</b><span class="mut">maduros (21+ d)</span></div><div class="kpi"><b>${c.hj}</b><span class="mut">revisados hoje</span></div></div>
  <div class="row" style="margin-top:14px"><button class="b" ${nSel?'':'disabled'} onclick="fcStart()">Estudar agora${temFiltro?` (${nSel})`:''}</button><span class="mut">${nSel} cartões${temFiltro?` no filtro (de ${c.tot})`:''} · ${cfg.fcNovosPrimeiro?'novos primeiro (sem limite diário)':`${cfg.fcNovos} novos e ${cfg.fcMax} revisões por dia`}</span></div>
  <div class="fc-hoje-box">
    <div class="row" style="justify-content:space-between;align-items:center">
      <div><b>Hoje: 100 cards</b> <span class="pill" id="fc_hoje_cnt">${hFeitos}/${FC_HOJE_META}</span>
      <div class="mut" style="font-size:.82rem;margin-top:2px">Mais incidentes no banco (peso CBR), com imagem primeiro · ${hRest} pendentes para hoje</div></div>
      <button type="button" class="b s" id="fc_hoje_btn" ${hRest?'':'disabled'} onclick="fcHojeStart()">${hFeitos&&hRest?`Continuar Hoje (${hFeitos}/${FC_HOJE_META})`:'Estudar Hoje: 100 cards'}</button>
    </div>
    ${barra(pct(hFeitos,FC_HOJE_META),hFeitos>=FC_HOJE_META?'g':'')}
  </div>
  <label class="check" style="margin-top:10px;font-size:.86rem"><input type="checkbox" id="fc_novos_pri" ${cfg.fcNovosPrimeiro?'checked':''} onchange="cfg.fcNovosPrimeiro=this.checked;persist('_est');render()"> Novos primeiro (sem repetir errado na mesma sessão)</label></div>
  <div class="card"><h3>Selecionar por tags</h3>${Object.keys(TG).length?`<div>${Object.entries(TG).sort((a,b)=>b[1].n-a[1].n).map(([k,x])=>`<button class="tag ${fcTags.has(k)?'on':''}" style="cursor:pointer" onclick="fcTog('${k.replace(/'/g,"\\'")}')">${esc(x.t)} · ${x.n}</button>`).join('')}</div>
  <p class="row" style="margin-top:10px"><button class="b" ${fcTags.size&&nSel?'':'disabled'} onclick="fcStart()">Estudar selecionados (${fcTags.size?nSel:0})</button><button class="b s" ${fcTags.size?'':'disabled'} onclick="fcTags.clear();render()">Limpar seleção</button><span class="mut">Cartões com qualquer uma das tags marcadas. A lista abaixo e o botão Estudar agora também respeitam a seleção.</span></p>`:'<p class="mut">Os cartões ainda não têm tags.</p>'}</div>
  <div class="card"><h3>Adicionar cartão</h3><div class="row" style="align-items:stretch"><div style="flex:1;min-width:220px">${rtEd('fc_f',fcNew.f,370,'fcNew.f','Frente (aceita {{c1::lacuna}} estilo Anki)')}</div><div style="flex:1;min-width:220px">${rtEd('fc_v',fcNew.v,370,'fcNew.v','Verso')}</div></div>
  <p class="row"><input id="fc_t" placeholder="Tags (opcional)" style="flex:1;min-width:180px"><button class="b" onclick="fcAdd()">Adicionar</button></p></div>
  <div class="card"><h3>Importar cartões</h3><p class="mut">Cole uma linha por cartão: <code>frente ⇥ verso ⇥ tags</code> (separado por TAB, como o export de texto do Anki, ou por ponto e vírgula). Também aceita JSON: <code>[{"f":"...","v":"..."}]</code>. Duplicados são ignorados.</p>
  <textarea id="fc_imp" placeholder="Cole aqui"></textarea><p><button class="b s" onclick="fcImportar()">Importar</button></p></div>
  <div class="card"><h3>Navegar (${filtrados.length}${temFiltro?` de ${todos.length}`:''})</h3><p class="row"><input id="fc_q" placeholder="Buscar nos cartões" value="${esc(fcBusca)}" onchange="fcBusca=this.value;render()" style="flex:1;min-width:200px"></p>
  ${lista.length?`<div class="tw"><table><tr><th>Frente</th><th>Estado</th><th></th></tr>${lista.map(x=>{const s=fcs[x.id];const st=s&&s[6]?'suspenso':!s||s[2]===0?'novo':s[3]<=now?'vencido':'em '+Math.max(1,Math.ceil((s[3]-now)/DAY))+' d';
   const m=fcMeta(x),p=fcChaveParts(m.chave),subInfo=[fcTemImagem(x)?'🖼':'',p?fcChaveLabel(p):m.tema||''].filter(Boolean).join(' ');
   return `<tr><td>${esc(fcTxt(x.f).slice(0,90))}${subInfo?`<div class="mut" style="font-size:.76rem">${esc(subInfo)}</div>`:''}</td><td>${st}${s&&s[2]>0?` · ${fcFmt(s[1])}`:''}</td><td style="white-space:nowrap"><button class="b s" style="padding:4px 10px" onclick="fcEditAbre('${x.id}')">Editar</button> <button class="b s" style="padding:4px 10px" onclick="fcSusp('${x.id}')">${s&&s[6]?'Reativar':'Suspender'}</button> <button class="b s" style="padding:4px 10px" onclick="fcDel('${x.id}')">${fcDelId===x.id?'Confirmar':'Excluir'}</button></td></tr>${fcEdit&&fcEdit.id===x.id?`<tr><td colspan="3"><div class="iab"><div class="kick">Editar flashcard</div><div><b style="font-size:.85rem">Frente</b>${rtEd('ed_f',fcEdit.f,120,'fcEdit.f')}</div><div style="margin-top:8px"><b style="font-size:.85rem">Verso</b>${rtEd('ed_v',fcEdit.v,300,'fcEdit.v')}</div><label style="display:block;margin-top:6px">Tags (separadas por ;)<input style="width:100%" value="${esc(fcEdit.tg)}" oninput="fcEdit.tg=this.value"></label><div class="row" style="margin-top:8px"><button class="b" onclick="fcEditSalva()">Salvar</button><button class="b s" onclick="fcEdit=null;render()">Cancelar</button></div></div></td></tr>`:''}`}).join('')}</table></div>`:'<p class="mut">Nenhum cartão ainda. Importe ou adicione acima.</p>'}</div>`;
}
