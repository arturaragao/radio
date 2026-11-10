// Banco CBR app 1.42.0 — gerado por build/montar.py a partir do artefato (não editar à mão)
// ===== INTERPRETAR O TEXTO DE UMA TAREFA (pt-BR, sem API) — 1.17.0 =====
// interpretarTarefa(texto, hoje) -> [{texto,dia,hora,urg,area,prioridade,etiquetas,repetir}]
// Pura com hoje explícito; sem hoje usa a data local por compatibilidade com chamadas antigas.
//  dia: 'AAAA-MM-DD' | 'sem' (disse "sem data") | null (o texto não diz; quem chama usa o padrão/opção escolhida)
//  hora: 'HH:MM' | null · urg: boolean · area: 'estudo' | 'ferramenta' | 'tarefas' | null (null = padrão de quem chama)
//  hoje: 'AAAA-MM-DD' (padrão: hoje no aparelho). Um ditado pode ter várias tarefas: "próxima tarefa", "nova tarefa", "outra tarefa" ou ";".
// Ex.: "consulta neurologista dia 30/10 11 horas" -> [{texto:'Consulta neurologista', dia:'AAAA-10-30', hora:'11:00', ...}]
// Testes: teste/interpretar.test.js (node teste/interpretar.test.js). Sem dependências: roda no navegador e no node.
const itpSem = s => s.replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i').replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ç/g, 'c').replace(/ñ/g, 'n');
const itpP = n => String(n).padStart(2, '0');
const itpIso = (y, m, d) => y + '-' + itpP(m) + '-' + itpP(d);
const itpValida = (y, m, d) => { const x = new Date(y, m - 1, d, 12); return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d };
function itpMais(iso, n) { const [y, m, d] = iso.split('-').map(Number), x = new Date(y, m - 1, d + n, 12); return itpIso(x.getFullYear(), x.getMonth() + 1, x.getDate()) }
function itpDow(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 12).getDay() }
const ITP_MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const ITP_DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

// dia/mês (sem ano: este ano, ou o próximo se já passou) -> ISO ou null
function itpDataNum(d, mo, y, hoje) {
  const hy = +hoje.slice(0, 4);
  if (y != null) { y = y < 100 ? 2000 + y : y; return itpValida(y, mo, d) ? itpIso(y, mo, d) : null }
  if (itpValida(hy, mo, d) && itpIso(hy, mo, d) >= hoje) return itpIso(hy, mo, d);
  return itpValida(hy + 1, mo, d) ? itpIso(hy + 1, mo, d) : null;
}
// "dia 30": este mês; se já passou (ou o mês não tem o dia), o próximo que tiver
function itpDiaDoMes(d, hoje) {
  const y = +hoje.slice(0, 4), m = +hoje.slice(5, 7);
  for (let i = 0; i < 14; i++) { const mm = m + i, yy = y + Math.floor((mm - 1) / 12), m2 = ((mm - 1) % 12) + 1; if (itpValida(yy, m2, d) && itpIso(yy, m2, d) >= hoje) return itpIso(yy, m2, d) }
  return null;
}

function itpPartes(s) {
  const n = itpSem(s.toLowerCase()), re = /\s*;\s*|[\s,.]*\b(?:proxima|nova|outra)\s+tarefa\b[\s,.:]*/g, out = [];
  let ult = 0, m;
  while ((m = re.exec(n))) { out.push(s.slice(ult, m.index)); ult = m.index + m[0].length; if (!m[0].length) re.lastIndex++ }
  out.push(s.slice(ult));
  return out.map(x => x.trim()).filter(Boolean);
}

function itpUma(seg, hoje) {
  let o = seg, n = itpSem(seg.toLowerCase());
  const R = { texto: '', dia: null, hora: null, urg: false, area: null, prioridade: null, etiquetas: [], repetir: null };
  // acha a 1ª ocorrência em que fn(m) não devolve false e apaga o trecho (o e n ficam alinhados, com espaços no lugar)
  const tira = (re, fn) => {
    const g = new RegExp(re.source, 'g'); let m;
    while ((m = g.exec(n))) {
      if (!m[0].length) { g.lastIndex++; continue }
      if (fn(m) === false) continue;
      const b = ' '.repeat(m[0].length);
      o = o.slice(0, m.index) + b + o.slice(m.index + m[0].length); n = n.slice(0, m.index) + b + n.slice(m.index + m[0].length);
      return true;
    }
    return false;
  };
  tira(/\bsem\s+data(?:\s+definida)?\b/, () => { R.dia = 'sem' });
  tira(/\burgente\b/, () => { R.urg = true });
  tira(/!+(alta|media|baixa)\b|!!/, m => { R.prioridade = m[1] || 'alta' });
  while (tira(/#([a-z0-9_-]+)/, m => { if (!R.etiquetas.includes(m[1])) R.etiquetas.push(m[1]) })) {}
  tira(/\b(?:todo dia|todos os dias|diariamente)\b/, () => { R.repetir = {tipo:'diaria'} }) ||
  tira(/\b(?:dias uteis|todo dia util)\b/, () => { R.repetir = {tipo:'uteis'} }) ||
  tira(/\b(?:toda semana|todas as semanas|semanalmente)\b/, () => { R.repetir = {tipo:'semanal', dias:[]} }) ||
  tira(/\b(?:todo mes|todos os meses|mensalmente)\b/, () => { R.repetir = {tipo:'mensal'} });
  const nomesDias = [...ITP_DIAS, 'dom','seg','ter','qua','qui','sex','sab'];
  if (R.repetir?.tipo === 'semanal') {
    while (tira(new RegExp('(?:\\b(?:na|no|nas|nos|e)\\s+)?\\b(' + nomesDias.join('|') + ')(?:-feira)?\\b'), m => {
      const dia = nomesDias.indexOf(m[1]) % 7;
      if (!R.repetir.dias.includes(dia)) R.repetir.dias.push(dia);
    })) {}
  }
  // ---- data ----
  const pre = '(?:\\b(?:para|pra|ate|em)\\s+)?';
  if (!R.dia) {
    tira(/\bdaqui\s+a\s+(\d+)\s+dias?\b/, m => { if (+m[1] > 36500) return false; R.dia = itpMais(hoje, +m[1]) }) ||
    tira(new RegExp(pre + '\\bdepois\\s+de\\s+amanha\\b'), () => { R.dia = itpMais(hoje, 2) }) ||
    tira(new RegExp(pre + '\\bamanha\\b'), () => { R.dia = itpMais(hoje, 1) }) ||
    tira(new RegExp(pre + '\\bhoje\\b'), () => { R.dia = hoje }) ||
    tira(/(?:\bdia\s+)?\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?!\d)/, m => { const iso = itpDataNum(+m[1], +m[2], m[3] != null ? +m[3] : null, hoje); if (!iso) return false; R.dia = iso }) ||
    tira(new RegExp('(?:\\bdia\\s+)?\\b(\\d{1,2})\\s+de\\s+(' + ITP_MESES.join('|') + ')(?:\\s+de\\s+(\\d{4}))?\\b'), m => { const iso = itpDataNum(+m[1], ITP_MESES.indexOf(m[2]) + 1, m[3] != null ? +m[3] : null, hoje); if (!iso) return false; R.dia = iso }) ||
    tira(/\bdia\s+(\d{1,2})\b/, m => { const iso = itpDiaDoMes(+m[1], hoje); if (!iso) return false; R.dia = iso }) ||
    tira(new RegExp('(?:\\b(?:na|no|nesta|neste|esta|este|proxima|proximo|pra|para)\\s+)?\\b(' + nomesDias.join('|') + ')(?:-feira)?\\b'), m => {
      const alvo = nomesDias.indexOf(m[1]) % 7, delta = ((alvo - itpDow(hoje)) % 7 + 7) % 7 || 7; R.dia = itpMais(hoje, delta);
    });
  }
  // ---- hora ----
  const as = '(?:\\bas\\s+)?', hv = (h, mi) => { if (h > 23 || mi > 59) return false; R.hora = itpP(h) + ':' + itpP(mi) };
  tira(new RegExp(as + '\\b(\\d{1,2})\\s+(?:horas?\\s+)?da\\s+(tarde|noite|manha)\\b'), m => { let h = +m[1]; if (m[2] !== 'manha' && h < 12) h += 12; return hv(h, 0) }) ||
  tira(new RegExp(as + '\\b(\\d{1,2})\\s*(?:horas?|h)\\s+e\\s+meia\\b'), m => hv(+m[1], 30)) ||
  tira(new RegExp(as + '\\b(\\d{1,2}):(\\d{2})\\b'), m => hv(+m[1], +m[2])) ||
  tira(new RegExp(as + '\\b(\\d{1,2})h(\\d{2})\\b'), m => hv(+m[1], +m[2])) ||
  tira(new RegExp(as + '\\b(\\d{1,2})\\s*(?:horas?|h)\\b'), m => hv(+m[1], 0)) ||
  tira(new RegExp(as + '\\b(\\d{1,2})\\s+e\\s+meia\\b'), m => hv(+m[1], 30)) ||
  tira(/\bmeio[\s-]dia\b/, () => hv(12, 0)) ||
  tira(/\bas\s+(\d{1,2})\b(?![\/:])/, m => hv(+m[1], 0));
  if (R.hora) {   // "3 horas da tarde", "11 da noite": ajusta para 24 h e tira a palavra
    const h = +R.hora.slice(0, 2);
    tira(/\bda\s+(tarde|noite|manha)\b/, m => { if (m[1] !== 'manha' && h >= 1 && h < 12) R.hora = itpP(h + 12) + R.hora.slice(2) });
  }
  // ---- tipo: "estudo"/"ferramenta"/"tarefa" no começo ou no fim ----
  const resta = (re) => { const m = re.exec(n); if (!m) return null; const t = n.slice(0, m.index) + ' '.repeat(m[0].length) + n.slice(m.index + m[0].length); return /[a-z0-9]/.test(t) ? m : null };
  const tira2 = (m) => { const b = ' '.repeat(m[0].length); o = o.slice(0, m.index) + b + o.slice(m.index + m[0].length); n = n.slice(0, m.index) + b + n.slice(m.index + m[0].length) };
  const tipoDe = w => /^tarefa/.test(w) ? 'tarefas' : w;
  for (let i = 0; i < 4; i++) {
    const ini = resta(/^\s*(?:[,.:;-]\s*)*(estudo|ferramenta|tarefas?)\b(?!\s+(?:de|do|da|dos|das|sobre|para|pra)\b)/), fim = resta(/\b(estudo|ferramenta|tarefas?)[\s,.:;-]*$/);
    const m = ini || fim; if (!m) break;
    if (!R.area) R.area = tipoDe(m[1]);
    tira2(m);
  }
  if (R.repetir) {
    if (R.repetir.tipo === 'semanal' && !R.repetir.dias.length) R.repetir.dias = [itpDow(R.dia && R.dia !== 'sem' ? R.dia : hoje)];
    if (!R.dia) R.dia = R.repetir.tipo === 'mensal' ? hoje : proximaData(itpMais(hoje,-1), R.repetir);
    if (R.repetir.tipo === 'mensal' && R.dia !== 'sem') R.repetir.diaMes = +(R.dia || hoje).slice(8);
  }
  // ---- limpeza: espaços, pontuação solta e preposições que sobraram nas pontas ----
  let t = o.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 12; i++) {
    const nt = itpSem(t.toLowerCase());
    const f = nt.match(/^(?:[,.:;-]\s*)+/) || nt.match(/(?:\s*[,:;-])+$/) || nt.match(/\s+(?:a|as|o|os|no|na|nos|nas|em|para|pra|de|do|da|e|ate|por)$/) || nt.match(/^(?:para|pra|e|ate)\s+/);
    if (!f) break;
    t = f.index === 0 ? t.slice(f[0].length) : t.slice(0, f.index);
    t = t.trim();
  }
  if (!t) t = seg.trim();
  R.texto = t.charAt(0).toUpperCase() + t.slice(1);
  return R;
}

function interpretarTarefa(texto, hoje) {
  if (!hoje) { const x = new Date(); hoje = itpIso(x.getFullYear(), x.getMonth() + 1, x.getDate()) }
  texto = String(texto == null ? '' : texto).normalize('NFC');
  return itpPartes(texto).map(p => itpUma(p, hoje));
}
// Título curto de uma ideia ditada no widget Ideia (pedido do Artur, 24/10/2026): tira a enrolação da fala
// ("eu queria que", "tipo", "né") e fica com a 1ª frase, até 8 palavras. O texto inteiro vai nos detalhes.
const ITP_MULETAS = /(^|\s)(n[ée]|tipo assim|tipo|beleza|a[íi]|ent[ãa]o|assim|sabe|cara|enfim)[,.]?(?=\s|$)/gi;
const ITP_INICIO = /^(e |mas |olha |bom |a ideia [ée] |ideia:? |seria (legal|bom) (se |que )?|(eu )?(queria|quero|preciso|gostaria)( de)?( que)? |vamos |fazer (com )?que )+/i;
function tituloIdeia(texto) {
  const t = String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim();
  const frase = t.split(/[.!?;]|, (?=mas |porque |pq )/)[0].trim() || t;
  let c = frase.replace(ITP_MULETAS, ' ').replace(/\s+/g, ' ').trim();
  for (let k = 0; k < 3; k++) c = c.replace(ITP_INICIO, '').trim();
  if (!c) c = t;
  c = c.split(' ').slice(0, 8).join(' ').replace(/[\s,.;:—-]+$/, '')
    .replace(/\s+(e|de|do|da|que|o|a|os|as|em|no|na|pra|para|com|um|uma|ele|ela|se|mas|é)$/i, '');
  return c.charAt(0).toUpperCase() + c.slice(1);
}
// Só remove o marcador inicial legado; não altera detalhes nem emojis no meio do título.
function tituloTarefa(texto) { return String(texto ?? '').replace(/^💡\s+/, '') }
// Todas as tarefas, inclusive concluídas; não modifica a lista nem os objetos recebidos.
function agruparTarefas(tarefas, hoje) {
  const datas = [...new Set(tarefas.map(t => t.dia).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
  const grupos = datas.map(dia => ({dia, titulo: dia === hoje ? 'Hoje' : (dia < hoje ? 'Dias anteriores · ' : 'Próximos dias · ') + dia,
    l: ordenarTarefas(tarefas.filter(t => t.dia === dia))}));
  const sem = tarefas.filter(t => !datas.includes(t.dia) && t.dia !== 'proxima');
  const proxima = tarefas.filter(t => t.dia === 'proxima');
  if (sem.length) grupos.push({dia:'sem', titulo:'Sem data', l:sem});
  if (proxima.length) grupos.push({dia:'proxima', titulo:'Semana seguinte · sem dia definido', l:proxima});
  return grupos;
}
// Regras puras compartilhadas pela tela e pela ponte Android. Campos novos são opcionais.
function dataTarefaValida(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return false;
  const [y,m,dia] = d.split('-').map(Number); return itpValida(y,m,dia);
}
function prioridadeTarefa(t) { return t.urg || t.prioridade === 'u' ? 'u' : ['alta','media','baixa'].includes(t.prioridade) ? t.prioridade : null }
function ordenarTarefas(tarefas) {
  const pesos = {u:0, alta:1, media:2, baixa:3};
  return tarefas.slice().sort((a,b) => (pesos[prioridadeTarefa(a)] ?? 4) - (pesos[prioridadeTarefa(b)] ?? 4) || (a.ordem ?? 0) - (b.ordem ?? 0));
}
function tarefasAtrasadas(tarefas, hoje) { return ordenarTarefas(tarefas.filter(t => !t.feito && dataTarefaValida(t.dia) && t.dia < hoje)) }
// Próxima data estritamente após base; mensal conserva o dia original mesmo após fevereiro.
function proximaData(base, repetir) {
  if (!dataTarefaValida(base) || !repetir) return null;
  const tipo = repetir.tipo;
  if (tipo === 'mensal') {
    const [y,m,d] = base.split('-').map(Number), alvo = Math.min(31,Math.max(1,Number(repetir.diaMes)||d));
    for (let i=0;i<2;i++) {
      const x=new Date(y,m-1+i,1,12), yy=x.getFullYear(), mm=x.getMonth()+1;
      const data=itpIso(yy,mm,Math.min(alvo,new Date(yy,mm,0,12).getDate()));
      if (data>base) return data;
    }
  }
  if (!['diaria','uteis','semanal'].includes(tipo)) return null;
  const dias = Array.isArray(repetir.dias) && repetir.dias.length ? repetir.dias : [itpDow(base)];
  for(let i=1;i<=7;i++) { const x=itpMais(base,i),w=itpDow(x); if(tipo==='diaria'||(tipo==='uteis'&&w>0&&w<6)||(tipo==='semanal'&&dias.includes(w))) return x }
  return null;
}
function concluirTarefa(tarefas,id,feitoEm,hoje) {
  const t=tarefas.find(x=>x.id===id); if(!t||t.feito) return tarefas;
  const repetir=t.repetir ? {...t.repetir, ...(t.repetir.tipo==='mensal'?{diaMes:t.repetir.diaMes||+String(t.dia).slice(8)}:{})} : null;
  const base=dataTarefaValida(t.dia)?(t.dia>hoje?t.dia:hoje):hoje;
  let dia=proximaData(base,repetir);
  while(dia&&t.grupo&&tarefas.some(x=>x.grupo===t.grupo&&x.dia===dia))dia=proximaData(dia,repetir);
  const lista=tarefas.map(x=>x.id===id?{...x,feito:true,feitoEm}:x);
  if(dia) {
    const serie=t.serie||t.id, novoId=serie+'~'+dia;
    if(!lista.some(x=>x.id===novoId||(x.serie===serie&&x.dia===dia))) {
      const novo={...t,id:novoId,serie,dia,repetir,feito:false,subtarefas:(t.subtarefas||[]).map(s=>({...s,feito:false}))};
      delete novo.feitoEm; delete novo.auto; delete novo.grupo; delete novo.adiado; delete novo.ideia;
      lista.push(novo);
    }
  }
  return lista;
}
function normalizarAgenda(agenda) {
  if (Array.isArray(agenda)) return {eventos:agenda,avisos:[],atualizado:null};
  if (!agenda || !Array.isArray(agenda.eventos)) return {eventos:[],avisos:[],atualizado:null};
  return {eventos:agenda.eventos,avisos:Array.isArray(agenda.avisos)?agenda.avisos.filter(a=>typeof a==='string'&&a.trim()):[],atualizado:agenda.atualizado||null};
}
function dedupeAgenda(agenda, manuais, dia) {
  const chave=s=>String(s||'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
  const vistos=new Set(manuais.map(e=>chave(e.t||e.titulo)));
  return normalizarAgenda(agenda).eventos.filter(e=>{
    if(!e||!e.titulo||!dataTarefaValida(String(e.inicio).slice(0,10))) return false;
    const inicio=String(e.inicio), fim=String(e.fim||e.inicio), ultimo=fim.slice(0,10);
    if(dia<inicio.slice(0,10)||dia>ultimo||(dia===ultimo&&ultimo>inicio.slice(0,10)&&(e.diaInteiro||/T00:00(?::00(?:\.000)?)?$/.test(fim)))) return false;
    const k=chave(e.titulo); if(vistos.has(k)) return false; vistos.add(k); return true;
  });
}
function lembreteTarefa(t) {
  if(!dataTarefaValida(t.dia)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t.hora||'')||t.lembrete==null||t.lembrete===''||!Number.isFinite(+t.lembrete)||+t.lembrete<0) return null;
  const [y,m,d]=t.dia.split('-').map(Number),[h,mi]=t.hora.split(':').map(Number),x=new Date(y,m-1,d,h,mi-Number(t.lembrete));
  return itpIso(x.getFullYear(),x.getMonth()+1,x.getDate())+'T'+itpP(x.getHours())+':'+itpP(x.getMinutes());
}
function tarefasNativas(tarefas,hoje) {
  const fim=itpMais(hoje,14);
  return ordenarTarefas(tarefas.filter(t=>dataTarefaValida(t.dia)&&t.dia>=hoje&&t.dia<=fim)).map(t=>({id:String(t.id),titulo:tituloTarefa(t.texto),data:t.dia,hora:t.hora||null,lembrete:lembreteTarefa(t),feita:!!t.feito,prioridade:prioridadeTarefa(t)}));
}
if (typeof module !== 'undefined' && module.exports) module.exports = { interpretarTarefa, tituloIdeia, tituloTarefa, agruparTarefas, dataTarefaValida, ordenarTarefas, prioridadeTarefa, tarefasAtrasadas, proximaData, concluirTarefa, normalizarAgenda, dedupeAgenda, lembreteTarefa, tarefasNativas };


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
try{SM.ab=new Set(JSON.parse(localStorage.getItem('sm_abertas')||'[]'))}catch(e){}
try{const c=JSON.parse(localStorage.getItem('sm_cache2')||'null');if(c&&c.d&&c.d.v===2){SM.d=c.d;SM.sha=c.sha;SM.ok=true}}catch(e){}
// 1.42: alterações feitas sem conexão. Se a gravação falha por falta de rede, SM.sujo (e localStorage sm_sujo) lembra que o plano local tem o que o GitHub não tem;
// SM.base = último plano que o GitHub tinha (texto JSON; vai para sm_base2 quando fica sujo). Quando o plano remoto mudou nesse meio tempo, smMerge3 refaz as alterações
// locais POR CIMA dele (em vez de jogá-las fora) e elas sobem sozinhas ao voltar a conexão. Notas/páginas/frases têm a fusão própria do notas.js.
try{const sj=localStorage.getItem('sm_sujo');SM.sujo=sj!==null;SM.sujoDesde=+sj||0;SM.base=SM.sujo?localStorage.getItem('sm_base2'):(SM.d?JSON.stringify(SM.d,null,1):null)}catch(e){}
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
  try{if(sim){if(localStorage.getItem('sm_sujo')===null){SM.sujoDesde=Date.now();localStorage.setItem('sm_sujo',String(SM.sujoDesde))}if(SM.base)localStorage.setItem('sm_base2',SM.base)}else{localStorage.removeItem('sm_sujo');localStorage.removeItem('sm_base2')}}catch(e){}
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
function smGuardaCache(){try{localStorage.setItem('sm_cache2',JSON.stringify({sha:SM.sha,d:SM.d}))}catch(e){}}

// ---------- leitura / gravação ----------
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
    const f=await BCBR.api(`/repos/${BCBR.REPO}/contents/${SM_ARQ}`,{etag:SM.d&&SM.sha?SM.etag||'':undefined});
    SM.ok=true;SM.erro='';
    if(f.naoMudou||g!==(SM.gravs||0))return;
    SM.etag=f.etag;
    if(f.sha!==SM.sha){
      if(typeof ntAntes==='function')ntAntes();   // o que está sendo digitado entra na fila ANTES de o plano do GitHub chegar
      const texto=smDec(f.content),remoto=JSON.parse(texto);
      SM.d=SM.sujo?smFundePlano(remoto):remoto;SM.base=texto;if(SM.sujo)smSujo(true);
      if(typeof ntRecebe==='function')ntRecebe(SM.d);SM.sha=f.sha;smGuardaCache();smAuto();smRender();smNativoTarefas()}
  }catch(e){
    SM.ok=true;
    if(e.status===404){
      try{const f=await BCBR.api(`/repos/${BCBR.REPO}/contents/${SM_VELHO}`);SM.d=smConverte(JSON.parse(smDec(f.content)))}catch(e2){SM.d={v:2,dias:{},tarefas:[],notas:[]}}
      SM.sha=null;smMudar(()=>{},'calendário do mês (primeira vez)');
    }else SM.erro='Sem conexão com o GitHub agora; mostrando a última cópia do aparelho.';
    smRender();
  }
}
function smRender(){if(['semana','tarefas','notas','hoje'].includes(tela)&&!(tela==='notas'&&document.activeElement?.closest?.('.nt')))render()}
// toda mudança é uma função idempotente: aplica na hora e de novo na gravação (se outro aparelho mudou o arquivo, relê e reaplica)
// 1.40: mudanças que chegam enquanto outra grava (ou no mesmo instante) vão juntas num único commit (SM.lote), sem rajada.
function smMudar(fn,msg,aoSalvar){
  if(SM.ed)smRascEdSalva(SM.ed.id);
  if(!SM.d)return Promise.resolve(false);fn(SM.d);smGuardaCache();smRender();smNativoTarefas();
  const item={fn,aoSalvar,msg,feito:false,ok:false};SM.lote.push(item);
  const tarefa=async()=>{
    if(item.feito)return item.ok;   // já saiu junto com a gravação anterior
    const grupo=SM.lote.splice(0),fim=ok=>{grupo.forEach(g=>{g.feito=true;g.ok=ok});return ok};
    for(let t=0;t<6;t++){
      try{
        grupo.forEach(g=>g.fn(SM.d));
        if(typeof ntAplica==='function')ntAplica(SM.d,ntPendentes());
        const texto=JSON.stringify(SM.d,null,1),body={message:'semana: '+(grupo.length>1?grupo.length+' alterações':msg||'atualização'),content:BCBR.b64(texto),branch:'main'};if(SM.sha)body.sha=SM.sha;
        const salvo=grupo.some(g=>g.aoSalvar)?JSON.parse(smDec(body.content)):null,blocos=SM.d.notasDoc?.blocos,pags=SM.d.notasPaginas?.paginas||[];   // o que subiu: páginas criadas durante o voo do PUT não entram na base
        SM.gravs=(SM.gravs||0)+1;
        const r=await BCBR.api(`/repos/${BCBR.REPO}/contents/${SM_ARQ}`,{method:'PUT',body:JSON.stringify(body)});
        grupo.forEach(g=>g.aoSalvar&&g.aoSalvar(salvo));
        SM.gravs++;SM.sha=r.content.sha;SM.erro='';SM.base=texto;if(SM.sujo)smSujo(false);smGuardaCache();smNativoTarefas();
        if(typeof ntBaseSalva==='function')ntBaseSalva(blocos,pags);   // o que subiu é a última versão sincronizada das notas
        if(typeof ntSincroniza==='function')ntSincroniza();
        return fim(true);
      }catch(e){
        if(e.status===409||e.status===422){try{const f=await BCBR.api(`/repos/${BCBR.REPO}/contents/${SM_ARQ}`);if(typeof ntAntes==='function')ntAntes();const texto2=smDec(f.content),remoto=JSON.parse(texto2);SM.d=SM.sujo?smFundePlano(remoto):remoto;SM.base=texto2;SM.sha=f.sha;if(typeof ntRecebe==='function')ntRecebe(SM.d)}catch(e2){}continue}
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
  return `<div class="sm" aria-label="Calendário">${SM.erro?`<p class="sm-err">${esc(SM.erro)}</p>`:''}${SM.avisosAgenda?.length?`<details class="sm-avisos"><summary>Avisos da escala</summary>${SM.avisosAgenda.map(a=>`<p>${esc(a)}</p>`).join('')}</details>`:''}${smCalendario()}${SM.diaEditor?smPainelDia(SM.diaEditor):''}</div>`;
}
function vTarefas(){
  if(!SM.ok)return `<div class="card"><p class="mut">Carregando o calendário…</p></div>`;
  if(!SM.d)return `<div class="card"><p class="mut">Calendário ainda vazio.</p></div>`;
  setTimeout(smAuto,0);const hj=smHoje(),sem=SM.d.tarefas.filter(t=>t.dia==='proxima'),atr=tarefasAtrasadas(SM.d.tarefas,hj);
  const outros=[...new Set(SM.d.tarefas.map(t=>t.dia))].filter(d=>dataTarefaValida(d)&&d>hj).sort();
  return `<div class="sm sm-tarefas" aria-label="Tarefas">
   ${SM.erro?`<p class="sm-err">${esc(SM.erro)}</p>`:''}
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


// Aba Notas (1.39.0): UMA página estilo Notion, editada direto (Tiptap/ProseMirror, vendor/tiptap.js, exposto em window.TT).
// Armazenamento: SM.d.notasDoc = {v:1, blocos:[{id, atualizado, conteudo}]} em semana/plano.json (mesmo salvamento da Semana: smMudar).
// Cada bloco de TOPO tem id estável e data de alteração própria; ntBlocos/ntDocumento são as funções puras de ida e volta.
// 1.40: ntFunde junta as mudanças de dois aparelhos bloco a bloco (três vias: base = última versão sincronizada, guardada em
// bcbr_notas_base); o editor recebe só os blocos de topo que mudaram (ntAplicaNoEditor). Cópia do formato antigo em plano.json: notas_v138.
// NT.shown = blocos que o editor mostra/já salvou: é o ponto de comparação para saber o que FOI DIGITADO aqui.
// 1.41: barra fixa de formatação (sem bolha ao selecionar), painel de atalhos (Ctrl+/), Tab/Shift+Tab entre lista e toggle e PÁGINAS:
// SM.d.notasPaginas={v:1,paginas:[{id,titulo,fixada,ordem,criado,atualizado,doc:{v:1,blocos}}]} no mesmo plano, mesma fila (NT_PEND leva
// `paginas` ao lado de `blocos`), mesma fusão por bloco (ntFunde) e fusão por campo (título/fixada/ordem: o mais recente) em ntFundePaginas.
// Cada editor tem um contexto (NT = página principal, NP = painel de uma página, aberto só enquanto o painel existe).
const ntCtx=()=>({ed:null,el:null,timer:null,shown:null,sujo:false,posImg:null,alvo:null,barra:null,bolha:null,buscaEl:null,grupoArrasto:null});
const NT={...ntCtx(),sync:null};
let NP=null;
const NT_PEND='bcbr_notasdoc_pendente',NT_ABERTOS='bcbr_nt_abertos',NT_COR='bcbr_nt_cor',NT_BASE='bcbr_notas_base',NT_BASE_P='bcbr_notaspag_base',NT_LAT='bcbr_nt_lat',NT_BASE_F='bcbr_notasfrases_base',NT_REC='bcbr_nt_recentes',NT_MAX_CONFLITOS=20;

// ===== Funções puras: documento <-> blocos, migração das notas antigas =====
const ntNovoId=()=>'b'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
// Tira atributos nulos para comparar conteúdo sem falsos "alterados" (o editor preenche atributos padrão).
function ntCanon(n){
  if(Array.isArray(n))return n.map(ntCanon);
  if(!n||typeof n!=='object')return n;
  const o={};for(const k of Object.keys(n).sort()){
    const v=n[k];if(v===null||v===undefined)continue;
    if(k==='attrs'){const a=ntCanon(v);if(Object.keys(a).length)o.attrs=a;continue}
    if(k==='marks'&&!v.length)continue;
    o[k]=ntCanon(v);
  }return o;
}
const ntIgual=(a,b)=>JSON.stringify(ntCanon(a))===JSON.stringify(ntCanon(b));
// doc do editor -> blocos. `anteriores` = blocos já salvos: bloco igual ao anterior mantém `atualizado` (e a forma salva).
function ntBlocos(doc,anteriores,agora=new Date().toISOString()){
  const ant=new Map((anteriores||[]).map(b=>[b.id,b])),vistos=new Set();
  return (doc?.content||[]).map(n=>{
    let id=n.attrs?.id;if(!id||vistos.has(id)){id=ntNovoId();n={...n,attrs:{...n.attrs,id}}}
    vistos.add(id);const a=ant.get(id);
    return a&&ntIgual(a.conteudo,n)?a:{id,atualizado:agora,conteudo:n};
  });
}
// blocos -> doc do editor (sempre com pelo menos um parágrafo).
function ntDocumento(blocos){return {type:'doc',content:(blocos||[]).length?blocos.map(b=>b.conteudo):[{type:'paragraph'}]}}

// ===== Fusão por bloco, três vias =====
// base = última versão sincronizada com o GitHub (ou null se desconhecida: nada é apagado), local = o que este aparelho tem, remoto = o do GitHub.
// Bloco só mudou de um lado: fica essa versão. Mudou dos dois (e diferem): vence o `atualizado` maior (empate: o remoto) e o outro vai para `conflitos`.
// Apagado de um lado e intacto do outro: apaga (se foi editado do outro lado, a edição fica). Ordem: a do lado que mudou a ordem (o remoto, se ambos).
function ntFunde(base,local,remoto,agora=new Date().toISOString()){
  const lim=l=>(Array.isArray(l)?l:[]).filter(b=>b&&typeof b==='object'&&typeof b.id==='string');   // plano remoto malformado não quebra a fusão
  base=lim(base);local=lim(local);remoto=lim(remoto);
  const mapa=l=>new Map(l.map(b=>[b.id,b])),B=mapa(base),L=mapa(local),R=mapa(remoto),res=new Map(),conflitos=[];
  const igual=(x,y)=>ntIgual(x.conteudo,y.conteudo);
  for(const id of new Set([...B.keys(),...L.keys(),...R.keys()])){
    const b=B.get(id),l=L.get(id),r=R.get(id);let v=null;
    if(l&&r){
      if(igual(l,r))v=r;
      else{
        const lm=!b||!igual(b,l),rm=!b||!igual(b,r);
        if(lm&&!rm)v=l;else if(rm&&!lm)v=r;
        else{const localVence=String(l.atualizado||'')>String(r.atualizado||''),perde=localVence?r:l;v=localVence?l:r;conflitos.push({id,em:agora,atualizado:perde.atualizado,conteudo:perde.conteudo})}
      }
    }else if(l||r){const x=l||r;if(!b||!igual(b,x))v=x}   // novo, ou apagado do outro lado mas editado aqui
    if(v)res.set(id,v);
  }
  const ids=x=>(x||[]).map(b=>b.id);
  const mudouOrdem=lado=>{const nb=new Set(ids(base)),nl=new Set(ids(lado)),c=x=>ids(x).filter(i=>nb.has(i)&&nl.has(i));return JSON.stringify(c(base))!==JSON.stringify(c(lado))};
  const usaLocal=mudouOrdem(local)&&!mudouOrdem(remoto),ordem=ids(usaLocal?local:remoto).filter(i=>res.has(i));
  let ant=-1;   // blocos que só o outro lado tem entram logo depois do vizinho que eles tinham lá
  for(const i of ids(usaLocal?remoto:local)){
    if(!res.has(i))continue;
    const k=ordem.indexOf(i);if(k>=0){ant=k;continue}
    ordem.splice(++ant,0,i);
  }
  return {blocos:ordem.map(i=>res.get(i)),conflitos};
}
// Lista de conflitos do plano (SM.d.notas_conflitos): sem repetir (id+data), só os 20 mais recentes.
function ntJuntaConflitos(a,b){
  const vistos=new Set(),out=[];
  for(const c of [...(a||[]),...(b||[])]){const k=c.id+'|'+c.em;if(!vistos.has(k)){vistos.add(k);out.push(c)}}
  return out.slice(-NT_MAX_CONFLITOS);
}
function ntBaseLer(){try{const b=JSON.parse(localStorage.getItem(NT_BASE)||'null');return Array.isArray(b)?b:null}catch(e){return null}}
// Base = última versão sincronizada (blocos da página principal e lista de páginas). Sem `paginas`, vale o plano atual (chamada de smMudar após o PUT).
function ntBaseSalva(blocos,paginas=SM.d?.notasPaginas?.paginas||[],frases=SM.d?.notasFrases||[]){
  if(Array.isArray(blocos))try{localStorage.setItem(NT_BASE,JSON.stringify(blocos))}catch(e){}
  pgBaseSalva(paginas);frBaseSalva(frases);
}
function frBaseLer(){try{const b=JSON.parse(localStorage.getItem(NT_BASE_F)||'null');return Array.isArray(b)?b:null}catch(e){return null}}
function frBaseSalva(l){if(Array.isArray(l))try{localStorage.setItem(NT_BASE_F,JSON.stringify(l))}catch(e){}}
function pgBaseLer(){try{const b=JSON.parse(localStorage.getItem(NT_BASE_P)||'null');return Array.isArray(b)?b:null}catch(e){return null}}

// ===== Páginas: fusão três vias da lista (página nova/apagada/editada) e por campo (título, fixada, ordem) =====
// Campo que mudou só de um lado: fica essa mudança. Dos dois e diferente: vale o de `atualizado` maior (empate: o remoto). Os blocos da página
// passam por ntFunde (mesma regra das notas). Página apagada de um lado e intacta do outro: apaga; se foi editada do outro lado, a edição fica.
// Campos desconhecidos (de versões futuras) são preservados: o objeto da página é copiado inteiro, só os campos conhecidos são decididos.
const NT_PG_CAMPOS=['titulo','fixada','ordem'];
function ntFundePaginas(base,local,remoto,agora=new Date().toISOString()){
  const lim=l=>(Array.isArray(l)?l:[]).filter(p=>p&&typeof p==='object'&&typeof p.id==='string');
  base=lim(base);local=lim(local);remoto=lim(remoto);
  const mapa=l=>new Map(l.map(p=>[p.id,p])),B=mapa(base),L=mapa(local),R=mapa(remoto),res=[],conflitos=[];
  const blocos=p=>p?.doc?.blocos;
  for(const id of new Set([...R.keys(),...L.keys(),...B.keys()])){   // ordem do remoto primeiro: sem mudança local o resultado é idêntico ao remoto
    const b=B.get(id),l=L.get(id),r=R.get(id);let v=null;
    if(l&&r){
      if(ntIgual(l,r))v=r;
      else{
        const localNovo=String(l.atualizado||'')>String(r.atualizado||'');v={...l,...r};
        for(const k of NT_PG_CAMPOS){
          const lm=!b||!ntIgual(b[k],l[k]),rm=!b||!ntIgual(b[k],r[k]);
          v[k]=lm&&!rm?l[k]:rm&&!lm?r[k]:localNovo?l[k]:r[k];
        }
        const f=ntFunde(blocos(b),blocos(l),blocos(r),agora);
        v.doc={v:1,blocos:f.blocos};v.atualizado=localNovo?l.atualizado:r.atualizado;
        conflitos.push(...f.conflitos.map(c=>({...c,pagina:id})));
      }
    }else if(l||r){const x=l||r;if(!b||!ntIgual(b,x))v=x}
    if(v)res.push(v);
  }
  return {paginas:res,conflitos};
}
// Frases-padrão (1.42): lista de {id,titulo,texto,atualizado}. Mesmo id nos dois lados e diferente: vale o `atualizado` maior (empate: o remoto).
// Frase só de um lado: nova -> fica; apagada do outro lado (estava na base) -> some, a não ser que tenha sido editada aqui. Aparelho antigo (sem o campo) não apaga: remoto ausente = lista vazia sem base.
function ntFundeFrases(base,local,remoto){
  const lim=l=>(Array.isArray(l)?l:[]).filter(f=>f&&typeof f==='object'&&typeof f.id==='string');
  base=lim(base);local=lim(local);remoto=lim(remoto);
  const mapa=l=>new Map(l.map(f=>[f.id,f])),B=mapa(base),L=mapa(local),R=mapa(remoto),res=[];
  for(const id of new Set([...R.keys(),...L.keys()])){
    const b=B.get(id),l=L.get(id),r=R.get(id);let v=null;
    if(l&&r)v=ntIgual(l,r)||String(l.atualizado||'')<=String(r.atualizado||'')?r:l;
    else{const x=l||r;if(!b||!ntIgual(b,x))v=x}
    if(v)res.push(v);
  }
  return res;
}
function pgBaseSalva(paginas){if(Array.isArray(paginas))try{localStorage.setItem(NT_BASE_P,JSON.stringify(paginas))}catch(e){}}
const ntPaginas=()=>Array.isArray(SM.d?.notasPaginas?.paginas)?SM.d.notasPaginas.paginas:[];
const pgAchar=id=>ntPaginas().find(p=>p.id===id);
const ntPgOrdem=(a,b)=>(Number(a.ordem)||0)-(Number(b.ordem)||0)||String(a.criado).localeCompare(String(b.criado))||String(a.id).localeCompare(String(b.id));

// Texto antigo (1.37/1.38) -> blocos do editor: "- "/"• " listas, "> " toggles (recuo = dentro), "[img:arquivo]" imagem, resto parágrafos.
const ntRecuo=l=>/^[ \t]*/.exec(l)[0].replace(/\t/g,'  ').length;
const ntTxt=s=>s?[{type:'text',text:s}]:undefined;
const ntPar=s=>({type:'paragraph',...(s?{content:ntTxt(s)}:{})});
function ntParse(lin){
  const out=[];let i=0;
  while(i<lin.length){
    const l=lin[i];if(!l.trim()){i++;continue}
    const base=ntRecuo(l);let m;
    const filhos=()=>{let j=i+1;while(j<lin.length&&(!lin[j].trim()||ntRecuo(lin[j])>base))j++;while(j>i+1&&!lin[j-1].trim())j--;const f=lin.slice(i+1,j);i=j;return f};
    if((m=/^\s*>(?: (.*))?$/.exec(l))){
      const f=ntParse(filhos());
      out.push({type:'details',content:[{type:'detailsSummary',...(m[1]?.trim()?{content:ntTxt(m[1].trim())}:{})},{type:'detailsContent',content:f.length?f:[ntPar('')]}]});continue;
    }
    if((m=/^\s*[-•](?:\s+(.*))?$/.exec(l))){
      const item={type:'listItem',content:[ntPar((m[1]||'').trim()),...ntParse(filhos())]},u=out[out.length-1];
      if(u?.type==='bulletList')u.content.push(item);else out.push({type:'bulletList',content:[item]});continue;
    }
    if((m=/^\s*\[img:([\w.-]+)\]\s*$/.exec(l))){out.push({type:'image',attrs:{src:'./img/'+m[1]}});i++;continue}
    out.push(ntPar(l.trim()));const f=filhos();if(f.length)out.push(...ntParse(f));
  }return out;
}
const ntTextoParaBlocos=texto=>ntParse(String(texto||'').split(/\r?\n/));
const ntChave=n=>Number.isFinite(n.ordem)?n.ordem:-(Date.parse(n.em||n.atualizado||'')||0);
const ntOrdenadas=notas=>[...(notas||[])].sort((a,b)=>Number(!!b.fixa)-Number(!!a.fixa)||ntChave(a)-ntChave(b)||String(a.id).localeCompare(String(b.id)));
// Cada nota antiga vira um toggle de topo com o título; ids derivados do id da nota (migração igual em qualquer aparelho).
function ntNotaParaBloco(n){
  const id='b'+n.id,cont=ntTextoParaBlocos(n.texto);
  return {id,atualizado:n.atualizado||n.em||new Date().toISOString(),conteudo:{type:'details',attrs:{id},content:[
    {type:'detailsSummary',...(String(n.titulo||'').trim()?{content:ntTxt(String(n.titulo).trim())}:{})},
    {type:'detailsContent',content:cont.length?cont:[ntPar('')]}]}};
}
// Migra uma vez: guarda cópia em notas_v138 e cria notasDoc. Idempotente (não faz nada se notasDoc já existe).
function ntMigra(d){
  if(!d||d.notasDoc)return false;
  const velhas=d.notas||[];
  if(velhas.length&&!d.notas_v138)d.notas_v138=JSON.parse(JSON.stringify(velhas));
  d.notasDoc={v:1,blocos:[...ntOrdenadas(velhas).map(ntNotaParaBloco),{id:'b-fim',atualizado:'2026-11-09T00:00:00.000Z',conteudo:{type:'paragraph',attrs:{id:'b-fim'}}}]};   // parágrafo final: lugar para digitar depois do último toggle
  d.notas=velhas.filter(n=>n.fraco);   // "tema fraco" da Semana continua lendo d.notas
  return true;
}

// ===== Fila de salvamento: o documento pendente fica no aparelho até o GitHub confirmar =====
function ntPendentes(){
  try{const p=JSON.parse(localStorage.getItem(NT_PEND)||'null');return p&&Array.isArray(p.blocos)?[p]:[]}catch(e){return []}
}
function ntTemPendentes(){return ntPendentes().length>0}
// Põe o documento pendente em `d`. Se `d` veio do GitHub com outro conteúdo, funde por bloco (a fusão vira o novo pendente).
function ntAplica(d,ops){
  if(!ops||!ops.length){ntMigra(d);return}
  const p=ops[ops.length-1],r=d.notasDoc?.blocos,rp=d.notasPaginas?.paginas;let fundiu=false,confl=0;
  if(Array.isArray(r)&&JSON.stringify(r)!==JSON.stringify(p.blocos)){
    const f=ntFunde(ntBaseLer(),p.blocos,r);
    p.blocos=f.blocos;p.conflitos=ntJuntaConflitos(p.conflitos,f.conflitos);fundiu=true;confl+=f.conflitos.length;
  }
  if(Array.isArray(p.paginas)){   // páginas pendentes: funde com as do GitHub (se outro aparelho mexeu) e ficam no plano
    if(Array.isArray(rp)&&JSON.stringify(rp)!==JSON.stringify(p.paginas)){
      const f=ntFundePaginas(pgBaseLer(),p.paginas,rp);
      p.paginas=f.paginas;p.conflitos=ntJuntaConflitos(p.conflitos,f.conflitos);fundiu=true;confl+=f.conflitos.length;
    }
    d.notasPaginas={...d.notasPaginas,v:1,paginas:p.paginas};
  }
  if(Array.isArray(p.frases)){   // frases-padrão pendentes: funde com as do GitHub
    if(Array.isArray(d.notasFrases)&&JSON.stringify(d.notasFrases)!==JSON.stringify(p.frases)){p.frases=ntFundeFrases(frBaseLer(),p.frases,d.notasFrases);fundiu=true}
    d.notasFrases=p.frases;
  }
  if(fundiu)try{localStorage.setItem(NT_PEND,JSON.stringify(p))}catch(e){}
  if(confl&&typeof toast==='function')toast('Nota editada nos dois aparelhos: guardei a versão mais antiga em notas_conflitos.');
  d.notasDoc={v:1,blocos:p.blocos};
  if(p.conflitos?.length)d.notas_conflitos=ntJuntaConflitos(d.notas_conflitos,p.conflitos);
}
// O que está sendo digitado entra na fila (e no plano local) ANTES de qualquer plano do GitHub ser aplicado.
function ntAntes(){if(NT.ed&&NT.sujo)ntSalvaDoc();if(NP?.ed&&NP.sujo)pgSalvaDoc()}
// `d` = plano recém-baixado do GitHub, já em SM.d: funde o pendente, guarda a base e mostra no editor só o que mudou.
function ntRecebe(d){
  const r=d.notasDoc?.blocos,rp=d.notasPaginas?.paginas||[],rf=d.notasFrases||[];ntAplica(d,ntPendentes());
  ntBaseSalva(r,rp,rf);
  ntSincroniza();
}
const ntConfirmada=(salvo,op)=>JSON.stringify(salvo.notasDoc?.blocos)===JSON.stringify(op.blocos)&&(!Array.isArray(op.paginas)||JSON.stringify(salvo.notasPaginas?.paginas)===JSON.stringify(op.paginas))&&(!Array.isArray(op.frases)||JSON.stringify(salvo.notasFrases)===JSON.stringify(op.frases));
function ntSync(){
  if(NT.sync)return NT.sync;
  const ops=ntPendentes();if(!ops.length||!SM.d)return Promise.resolve(!ops.length);
  NT.sync=smMudar(d=>ntAplica(d,ntPendentes()),'notas',salvo=>{
    // Só limpa se o que subiu é o mesmo documento que estava pendente (edição nova durante o envio continua na fila).
    const atual=ntPendentes()[0];if(atual&&atual.em===ops[0].em&&ntConfirmada(salvo,atual))localStorage.removeItem(NT_PEND);
  }).finally(()=>{NT.sync=null;if(ntTemPendentes()&&!SM.erro){clearTimeout(NT.retry);NT.retry=setTimeout(ntSync,700)}});
  return NT.sync;
}
// Chamado ~1 s depois da última digitação.
function ntSalvaDoc(){
  clearTimeout(NT.timer);if(!NT.ed||!SM.d)return;
  const ant=NT.shown||SM.d.notasDoc?.blocos||[],blocos=ntBlocos(NT.ed.getJSON(),ant);NT.sujo=false;   // compara com o que o editor mostrava, não com o plano (que pode ter vindo de outro aparelho)
  if(JSON.stringify(blocos)===JSON.stringify(ant))return;
  ntLembSincroniza(ant,blocos);
  const prev=ntPendentes()[0];   // (guarda também as páginas pendentes)
  try{localStorage.setItem(NT_PEND,JSON.stringify({...prev,blocos,em:Date.now(),conflitos:prev?.conflitos||[]}))}catch(e){toast('Sem espaço para salvar as notas neste aparelho.');return}
  NT.shown=blocos;SM.d.notasDoc={v:1,blocos};smGuardaCache();ntSync();
}

// ===== Estado aberto/fechado dos toggles: por aparelho (localStorage), fora do documento =====
function ntAbertosLer(){try{return new Set(JSON.parse(localStorage.getItem(NT_ABERTOS)||'[]'))}catch(e){return new Set()}}
function ntAbertosGrava(s){try{localStorage.setItem(NT_ABERTOS,JSON.stringify([...s]))}catch(e){}}
function ntAberto(id){return !!id&&ntAbertosLer().has(id)}
function ntAbertoSalva(id,aberto){if(!id)return;const s=ntAbertosLer();aberto?s.add(id):s.delete(id);ntAbertosGrava(s)}
function ntPoeAberto(dom,aberto){dom.classList.toggle('is-open',aberto);dom.querySelector(':scope>button')?.setAttribute('aria-expanded',String(aberto))}
// Ctrl+Alt+T abre/fecha todos os toggles da página do editor `c`; Ctrl+Enter, o toggle do cursor. Só estado de tela (classe + localStorage): fora do documento, do histórico e do sync.
function ntTodosNo(c){
  const ds=[...c.el.querySelectorAll('[data-type="details"]')];
  const abrir=!(ds.length&&ds.every(d=>d.classList.contains('is-open')));
  ds.forEach(d=>ntPoeAberto(d,abrir));
  const s=ntAbertosLer();ds.forEach(d=>{if(d.dataset.id)abrir?s.add(d.dataset.id):s.delete(d.dataset.id)});ntAbertosGrava(s);   // (só os desta página: os das outras guardam o seu)
  return true;
}
function ntToggleCursor(c){
  const sel=c.ed.state.selection,$=sel.$from,n=sel.node;
  const abre=(pos,no)=>{const dom=c.ed.view.nodeDOM(pos);if(dom instanceof Element){const a=!dom.classList.contains('is-open');ntPoeAberto(dom,a);ntAbertoSalva(no.attrs.id,a)}return true};
  if(n?.type.name==='details')return abre(sel.from,n);
  for(let d=$.depth;d>=1;d--)if($.node(d).type.name==='details')return abre($.before(d),$.node(d));
  return false;
}

// ===== Paleta de cores (Notion); o documento guarda var(--ntc-…)/var(--ntb-…), definidas no CSS por tema =====
const NT_CORES=[['cinza','Cinza'],['marrom','Marrom'],['laranja','Laranja'],['amarelo','Amarelo'],['verde','Verde'],['azul','Azul'],['roxo','Roxo'],['rosa','Rosa'],['vermelho','Vermelho']];
function ntUltimaCor(){try{const c=JSON.parse(localStorage.getItem(NT_COR)||'null');if(c&&['texto','fundo'].includes(c.tipo)&&NT_CORES.some(x=>x[0]===c.cor))return c}catch(e){}return {tipo:'fundo',cor:'amarelo'}}
function ntAplicaCor(ed,tipo,cor){
  const css=`var(--nt${tipo==='texto'?'c':'b'}-${cor})`,atual=ed.getAttributes('textStyle')[tipo==='texto'?'color':'backgroundColor'];
  try{localStorage.setItem(NT_COR,JSON.stringify({tipo,cor}))}catch(e){}
  const ch=ed.chain().focus();
  if(atual===css)return (tipo==='texto'?ch.unsetColor():ch.unsetBackgroundColor()).run();
  return (tipo==='texto'?ch.setColor(css):ch.setBackgroundColor(css)).run();
}
function ntSemCor(ed){return ed.chain().focus().unsetColor().unsetBackgroundColor().run()}

// ===== Movimento de blocos (Tab/Shift+Tab, menu da alça) =====
// Bloco "movível" no ponto: item de lista, ou filho direto de documento/toggle/destaque/citação (parágrafo, título, toggle, imagem…).
const NT_PAIS=new Set(['doc','detailsContent','callout','blockquote']);
function ntBlocoEm(doc,pos){
  const $p=doc.resolve(Math.max(0,Math.min(pos,doc.content.size)));
  for(let d=$p.depth;d>=1;d--){
    const n=$p.node(d),pai=$p.node(d-1);
    if(n.type.name==='listItem'||n.type.name==='taskItem'||(NT_PAIS.has(pai.type.name)&&!['bulletList','orderedList','taskList'].includes(n.type.name)))
      return {pos:$p.before(d),node:n,pai,idx:$p.index(d-1),depth:d};
  }return null;
}
// Bloco logo "à frente" de p (imagem, divisória) ou o que contém p.
function ntBlocoPos(doc,p){
  const n=doc.nodeAt(p);
  if(n&&n.isBlock&&n.isLeaf){const $=doc.resolve(p);return {pos:p,node:n,pai:$.parent,idx:$.index(),depth:$.depth+1}}
  return ntBlocoEm(doc,p+1);
}
// Move o bloco para `destino` (posição no doc ANTES da mudança), mantendo a seleção dentro dele.
function ntMovePara(ed,b,destino,selDeslocada=true){
  const {state,view}=ed,tr=state.tr,tam=b.node.nodeSize,off=state.selection.from-b.pos;
  const dentro=state.selection.from>=b.pos&&state.selection.from<=b.pos+tam;
  let novo;
  if(destino<=b.pos){tr.delete(b.pos,b.pos+tam);tr.insert(destino,b.node);novo=destino}
  else{tr.insert(destino,b.node);tr.delete(b.pos,b.pos+tam);novo=destino-tam}
  const S=TT.pm.state;
  try{tr.setSelection(dentro&&selDeslocada?S.TextSelection.create(tr.doc,novo+Math.min(off,tam-1)):S.Selection.near(tr.doc.resolve(novo+1)))}catch(e){}
  view.dispatch(tr.scrollIntoView());return novo;
}
function ntSobeDesce(ed,b,dir){
  const {pai,idx}=b;if(dir<0&&idx===0||dir>0&&idx>=pai.childCount-1)return false;
  if(dir<0){ntMovePara(ed,b,b.pos-pai.child(idx-1).nodeSize);return true}
  ntMovePara(ed,b,b.pos+b.node.nodeSize+pai.child(idx+1).nodeSize);return true;
}
// Tab: entra no toggle anterior (vira o último filho dele). Shift+Tab: sai do toggle atual (vira irmão logo depois dele).
// Item de lista (1.41): Tab aninha na lista; se não dá (1º item) e a lista vem logo depois de um toggle, o item (com os filhos) vira o último
// filho do toggle, ainda como item de lista. Shift+Tab: item de nível mais alto dentro de um toggle sai para depois dele; senão desaninha.
const NT_LISTAS=['bulletList','orderedList','taskList'],NT_ITENS=['listItem','taskItem'];
function ntItemParaToggle(ed,b){
  const {state,view}=ed,doc=state.doc,$=doc.resolve(b.pos),lista=$.parent,listaPos=$.before(),avo=$.node($.depth-1),iL=$.index($.depth-1);
  if(b.idx!==0||!iL)return false;
  const ant=avo.child(iL-1);if(ant.type.name!=='details')return false;
  const ini=listaPos-ant.nodeSize,fimConteudo=ini+ant.nodeSize-2,conteudo=ant.lastChild,ult=conteudo.lastChild,S=TT.pm.state,off=state.selection.from-b.pos;
  const tr=state.tr,tam=b.node.nodeSize;let itemPos;
  if(lista.childCount===1)tr.delete(listaPos,listaPos+lista.nodeSize);else tr.delete(b.pos,b.pos+tam);   // (depois do toggle: não mexe nas posições dele)
  if(ult.type===lista.type){tr.insert(fimConteudo-1,b.node);itemPos=fimConteudo-1}   // já termina numa lista do mesmo tipo: entra nela
  else if(conteudo.childCount===1&&ult.type.name==='paragraph'&&!ult.content.size){tr.replaceWith(fimConteudo-ult.nodeSize,fimConteudo,lista.type.create(null,b.node));itemPos=fimConteudo-ult.nodeSize+1}   // o parágrafo vazio do toggle novo é substituído
  else{tr.insert(fimConteudo,lista.type.create(null,b.node));itemPos=fimConteudo+1}
  try{tr.setSelection(S.TextSelection.create(tr.doc,itemPos+Math.min(off,tam-1)))}catch(e){}
  view.dispatch(tr.scrollIntoView());ntAbertoSalva(ant.attrs.id,true);const dom=view.nodeDOM(ini);if(dom)ntPoeAberto(dom,true);
  return true;
}
function ntItemSaiToggle(ed,b){
  const {state,view}=ed,doc=state.doc,$=doc.resolve(b.pos),lista=$.parent,listaPos=$.before(),avo=$.node($.depth-1);
  if(avo.type.name!=='detailsContent')return false;   // aninhado em outro item, ou fora de toggle: segue o desaninhar normal
  const det=$.node($.depth-2),destino=$.before($.depth-2)+det.nodeSize,seg=doc.resolve(destino).nodeAfter,S=TT.pm.state,off=state.selection.from-b.pos,tam=b.node.nodeSize;
  const tr=state.tr,junta=seg&&seg.type===lista.type;
  if(junta)tr.insert(destino+1,b.node);else tr.insert(destino,lista.type.create(null,b.node));   // (depois do toggle: não mexe nas posições de antes)
  const passos=tr.steps.length;
  if(lista.childCount>1)tr.delete(b.pos,b.pos+tam);
  else if(avo.childCount===1)tr.replaceWith(listaPos,listaPos+lista.nodeSize,state.schema.nodes.paragraph.create());   // único filho: o toggle fica com um parágrafo vazio
  else tr.delete(listaPos,listaPos+lista.nodeSize);
  try{tr.setSelection(S.TextSelection.create(tr.doc,tr.mapping.slice(passos).map(destino+1)+Math.min(off,tam-1)))}catch(e){}
  view.dispatch(tr.scrollIntoView());return true;
}
function ntAninha(ed,b,sai){
  if(NT_ITENS.includes(b.node.type.name)){
    const t=b.node.type.name;ed.chain().focus().setTextSelection(b.pos+2).run();
    if(sai)return ntItemSaiToggle(ed,b)||ed.chain().focus().liftListItem(t).run()||true;
    return ed.can().sinkListItem(t)?ed.chain().focus().sinkListItem(t).run()||true:ntItemParaToggle(ed,b)||true;
  }
  const {state}=ed,doc=state.doc;
  if(!sai){
    if(b.idx===0)return false;const ant=b.pai.child(b.idx-1);if(ant.type.name!=='details')return false;
    const ini=b.pos-ant.nodeSize,fimConteudo=ini+ant.nodeSize-2,conteudo=ant.lastChild;
    const soVazio=conteudo.childCount===1&&conteudo.firstChild.type.name==='paragraph'&&!conteudo.firstChild.content.size;
    if(soVazio){   // o parágrafo vazio que o toggle novo traz é substituído
      const {view}=ed,tr=state.tr,tam=b.node.nodeSize,off=state.selection.from-b.pos,S=TT.pm.state;
      tr.delete(b.pos,b.pos+tam);tr.replaceWith(fimConteudo-conteudo.firstChild.nodeSize,fimConteudo,b.node);
      try{tr.setSelection(S.TextSelection.create(tr.doc,fimConteudo-conteudo.firstChild.nodeSize+Math.min(off,tam-1)))}catch(e){}
      view.dispatch(tr.scrollIntoView());
    }else ntMovePara(ed,b,fimConteudo);
    ntAbertoSalva(ant.attrs.id,true);const dom=ed.view.nodeDOM(ini);if(dom)ntPoeAberto(dom,true);
    return true;
  }
  if(b.pai.type.name!=='detailsContent')return false;
  const $p=doc.resolve(b.pos),det=$p.before($p.depth-1),detNode=doc.nodeAt(det);
  if(b.pai.childCount===1){   // único filho: o toggle fica com um parágrafo vazio
    const {view}=ed,tr=state.tr,tam=b.node.nodeSize,off=state.selection.from-b.pos,S=TT.pm.state,destino=det+detNode.nodeSize;
    tr.insert(destino,b.node);tr.replaceWith(b.pos,b.pos+tam,state.schema.nodes.paragraph.create());
    try{tr.setSelection(S.TextSelection.create(tr.doc,destino+Math.min(off,tam-1)))}catch(e){}
    view.dispatch(tr.scrollIntoView());return true;
  }
  ntMovePara(ed,b,det+detNode.nodeSize);return true;
}
function ntTab(ed,sai){
  const grupo=ntBselPos(ed.state);if(grupo.length){ntBselTab(ed.view,grupo,sai);return true}   // blocos selecionados por retângulo: o grupo todo
  const sel=ed.state.selection,b=sel.node?ntBlocoPos(ed.state.doc,sel.from):ntBlocoEm(ed.state.doc,sel.from);   // na linha do toggle, o bloco é o toggle inteiro
  if(b)ntAninha(ed,b,sai);return true;   // sempre consome Tab: não sai do editor
}

// ===== Envio de imagem: reduz (1600 px, JPEG 0,82), grava em imagens/nota-<id>.jpg no repositório privado =====
const NT_IMG_MAX=1600;
async function ntImgComprime(blob){
  const b=await createImageBitmap(blob),k=Math.min(1,NT_IMG_MAX/Math.max(b.width,b.height));
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(b.width*k));c.height=Math.max(1,Math.round(b.height*k));
  const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(b,0,0,c.width,c.height);b.close?.();
  return new Promise((ok,no)=>c.toBlob(r=>r?ok(r):no(new Error('imagem')),'image/jpeg',0.82));
}
async function ntImgEnvia(blob){
  const nome='nota-'+smId()+'.jpg';
  const b64=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.onerror=no;r.readAsDataURL(blob)});
  await BCBR.api(`/repos/${BCBR.REPO}/contents/imagens/${nome}`,{method:'PUT',body:JSON.stringify({message:'nota: imagem',content:b64,branch:'main'})});
  try{(await caches.open('bcbr-img')).put('./img/'+nome,new Response(blob,{headers:{'Content-Type':'image/jpeg'}}))}catch(e){}   // aparece já, sem baixar de novo
  return nome;
}
function ntNomeImg(src){const m=/(?:^|\/)img\/([^/?#]+)$/.exec(String(src||''));return m?decodeURIComponent(m[1]):''}

// ===== Editor =====
const NT_PH=()=>NT.phKey||(NT.phKey=new TT.pm.state.PluginKey('ntImagemEnviando'));
// Marcador "Enviando imagem…" (decoração, fora do documento): acompanha o texto digitado enquanto a imagem sobe.
function ntPluginEnvio(){
  const {Plugin}=TT.pm.state,{Decoration,DecorationSet}=TT.pm.view;
  return new Plugin({key:NT_PH(),state:{init:()=>DecorationSet.empty,apply(tr,set){
    set=set.map(tr.mapping,tr.doc);const m=tr.getMeta(NT_PH());
    if(m?.add){const el=document.createElement('div');el.className='nt-img-ph';el.contentEditable='false';el.innerHTML='<span class="nt-giro"></span>Enviando imagem…';set=set.add(tr.doc,[Decoration.widget(m.add.pos,el,{id:m.add.id,side:-1})])}
    if(m?.remove)set=set.remove(set.find(undefined,undefined,s=>s.id===m.remove));
    return set}},props:{decorations(s){return NT_PH().getState(s)}}});
}
const ntPhPos=(state,id)=>NT_PH().getState(state).find(undefined,undefined,s=>s.id===id)[0]?.from??null;
// Onde entra a imagem: depois do bloco do cursor (ou no lugar dele, se for um parágrafo vazio).
function ntPontoImagem(state,pos){
  const $p=state.doc.resolve(Math.max(0,Math.min(pos,state.doc.content.size))),tipo=state.schema.nodes.image;
  for(let d=$p.depth;d>=1;d--){const pai=$p.node(d-1),i=$p.indexAfter(d-1);if(pai.canReplaceWith(i,i,tipo))return $p.after(d)}
  return state.doc.content.size;
}
async function ntInsereImagem(arquivo,pos,c=NT){
  const ed=c.ed;if(!ed||!arquivo)return;
  const id=smId(),ponto=ntPontoImagem(ed.state,pos??ed.state.selection.from);
  ed.view.dispatch(ed.state.tr.setMeta(NT_PH(),{add:{id,pos:ponto}}));toast('Enviando imagem…');
  const tira=()=>ed.view.dispatch(ed.state.tr.setMeta(NT_PH(),{remove:id}));
  let nome;
  try{nome=await ntImgEnvia(await ntImgComprime(arquivo))}
  catch(e){tira();toast(e?.chave?'A chave do GitHub foi recusada (401).':e?.status?`Não consegui enviar a imagem (GitHub ${e.status}).`:'Não consegui enviar a imagem (precisa de conexão).');return}
  const p=ntPhPos(ed.state,id);if(p==null){toast('A imagem subiu, mas o lugar dela foi apagado.');return}
  const tr=ed.state.tr.setMeta(NT_PH(),{remove:id}),no=ed.state.schema.nodes.image.create({src:'./img/'+nome}),antes=tr.doc.resolve(p).nodeBefore;
  if(antes?.type.name==='paragraph'&&!antes.content.size)tr.replaceWith(p-antes.nodeSize,p,no);else tr.insert(p,no);
  ed.view.dispatch(tr.scrollIntoView());toast('Imagem anexada.');
}
function ntEscolheImagem(c=NT){
  c.posImg=c.ed.state.selection.from;
  let i=c.el.querySelector('.nt-arquivo');
  if(!i){i=document.createElement('input');i.type='file';i.accept='image/*';i.className='nt-arquivo';i.hidden=true;
    i.onchange=()=>{const f=i.files[0];i.value='';if(f)ntInsereImagem(f,c.posImg,c)};c.el.appendChild(i)}
  i.click();
}
// Imagem: nó próprio (largura em %, arquivo vem do repositório privado via ./img/…, com o plano B do shim se o service worker falhar).
function ntImagem(){
  return TT.ext.Image.extend({
    parseHTML(){return [{tag:'img[src^="./img/"]'}]},   // imagens de fora (Word, páginas) não entram
    addAttributes(){return {...this.parent?.(),largura:{default:null,parseHTML:el=>el.getAttribute('data-largura')||null,renderHTML:a=>a.largura?{'data-largura':a.largura}:{}}}},
    addNodeView(){return ({node})=>{
      const img=document.createElement('img');img.className='nt-img';img.alt='Imagem da nota';img.draggable=false;
      const pinta=n=>{const nome=ntNomeImg(n.attrs.src);img.src=(nome&&window.BCBR?.imgPronta?.(nome))||n.attrs.src||'';img.style.width=n.attrs.largura?n.attrs.largura+'%':''};
      pinta(node);let atual=node;
      return {dom:img,ignoreMutation:()=>true,update(n){if(n.type!==atual.type)return false;if(n.attrs.src!==atual.attrs.src||n.attrs.largura!==atual.attrs.largura)pinta(n);atual=n;return true}};
    }},
  }).configure({inline:false,allowBase64:false});
}

function ntDestaque(){
  return TT.Node.create({name:'callout',group:'block',content:'block+',defining:true,
    addAttributes(){return {icone:{default:'💡',parseHTML:el=>el.getAttribute('data-icone')||'💡',renderHTML:a=>({'data-icone':a.icone})}}},
    parseHTML(){return [{tag:'div[data-type="callout"]',contentElement:'.nt-callout-c'}]},
    renderHTML({node,HTMLAttributes}){return ['div',TT.mergeAttributes(HTMLAttributes,{'data-type':'callout',class:'nt-callout'}),['span',{class:'nt-callout-i',contenteditable:'false'},node.attrs.icone],['div',{class:'nt-callout-c'},0]]},
  });
}
// Toggle: aberto/fechado fica no DOM (classe is-open) e no aparelho; nunca no documento.
function ntToggle(){
  return TT.ext.Details.extend({
    addNodeView(){return ({node})=>{
      const dom=document.createElement('div');dom.setAttribute('data-type','details');
      const tg=document.createElement('button');tg.type='button';tg.className='nt-seta';tg.setAttribute('aria-label','Abrir ou fechar o toggle');tg.textContent='▶';
      const conteudo=document.createElement('div');conteudo.className='nt-tgl-c';dom.append(tg,conteudo);
      let id=node.attrs.id;const poe=()=>{if(id)dom.dataset.id=id;ntPoeAberto(dom,ntAberto(id))};poe();
      tg.addEventListener('mousedown',e=>e.preventDefault());   // não rouba o foco do editor (teclado do celular não aparece)
      tg.addEventListener('click',()=>{const a=!dom.classList.contains('is-open');ntPoeAberto(dom,a);ntAbertoSalva(id,a)});
      return {dom,contentDOM:conteudo,
        ignoreMutation:m=>m.type==='selection'?false:tg.contains(m.target)||!dom.contains(m.target)||dom===m.target,
        update(n){if(n.type!==node.type)return false;if(n.attrs.id!==id){id=n.attrs.id;poe()}return true}};
    }},
  });
}
// Identificação: todo bloco de TOPO e todo toggle (em qualquer nível) tem `id`; repetido (cópia/divisão) ganha id novo.
const NT_COM_ID=['paragraph','heading','details','bulletList','orderedList','taskList','blockquote','callout','image','horizontalRule','paginaLink'];
function ntIds(){
  const {Plugin,PluginKey}=TT.pm.state;
  return TT.Extension.create({name:'idBloco',
    addGlobalAttributes(){return [{types:NT_COM_ID,attributes:{id:{default:null,parseHTML:el=>el.getAttribute('data-id'),renderHTML:a=>a.id?{'data-id':a.id}:{}}}}]},
    addProseMirrorPlugins(){return [new Plugin({key:new PluginKey('idBloco'),appendTransaction(trs,antes,depois){
      if(!trs.some(t=>t.docChanged))return null;
      const vistos=new Set(),tr=depois.tr;let mudou=false;
      depois.doc.descendants((n,pos,pai)=>{
        if(!NT_COM_ID.includes(n.type.name))return;
        const precisa=pai===depois.doc||n.type.name==='details';let id=n.attrs.id;
        if(id&&vistos.has(id))id=null;
        if(!id&&precisa){id=ntNovoId();tr.setNodeMarkup(pos,undefined,{...n.attrs,id});mudou=true;if(n.type.name==='details')ntAbertoSalva(id,true)}
        if(id)vistos.add(id);
      });
      return mudou?tr.setMeta('addToHistory',false):null}})]},
  });
}

// "> " no começo da linha vira toggle (citação fica no menu "/")
function ntRegraToggle(){
  return TT.Extension.create({name:'regraToggle',addInputRules(){return [new TT.InputRule({find:/^\s*>\s$/,handler:({range,chain})=>{chain().deleteRange(range).setDetails().run()}})]}});
}
function ntAtalhos(c){
  return TT.Extension.create({name:'atalhosNotas',priority:1000,addKeyboardShortcuts(){return {
    'Mod-Shift-h':()=>{const u=ntUltimaCor();ntAplicaCor(this.editor,u.tipo,u.cor);return true},
    'Mod-k':()=>{ntLink(c);return true},
    'Mod-Alt-t':()=>ntTodosNo(c),'Mod-Enter':()=>ntToggleCursor(c),
    'Tab':()=>ntTab(this.editor,false),'Shift-Tab':()=>ntTab(this.editor,true)}}});
}
// Link (Ctrl+K ou botão da barra): campo ao lado do botão (prompt() não existe no WebView do APK).
function ntLink(c){
  const ed=c.ed,{from,to,empty}=ed.state.selection;
  if(empty&&!ed.isActive('link')){toast('Selecione o texto que vai virar link.');return}
  c.linkSel={from,to};
  const pop=c.barra.querySelector('.nt-link'),i=pop.querySelector('.nt-link-in');i.value=ed.getAttributes('link').href||'';
  c.barra.querySelector('.nt-paleta').hidden=true;
  ntPopPos(pop,c.barra.querySelector('[data-m="link"]'));i.focus();i.select();
}
function ntLinkAplica(c,url){
  const u=String(url||'').trim();c.barra.querySelector('.nt-link').hidden=true;
  const ch=c.ed.chain().focus().setTextSelection(c.linkSel).extendMarkRange('link');
  if(!u||u==='https://')ch.unsetLink().run();else ch.setLink({href:/^[a-z][a-z0-9+.-]*:/i.test(u)?u:'https://'+u}).run();
}
function ntLinkCancela(c){c.barra.querySelector('.nt-link').hidden=true;c.ed.chain().focus().setTextSelection(c.linkSel).run()}
// Janelinha (link, cores) fixa na tela, logo abaixo do botão: a barra rola na horizontal no celular e cortaria uma janelinha absoluta.
function ntPopPos(pop,bt){
  pop.hidden=false;const r=bt.getBoundingClientRect();
  pop.style.top=Math.max(8,Math.min(r.bottom+6,innerHeight-pop.offsetHeight-8))+'px';
  pop.style.left=Math.max(8,Math.min(r.left,innerWidth-pop.offsetWidth-8))+'px';
}

// ----- Menu "/" -----
const NT_SLASH=[
  ['Título 1','Título grande','h1 titulo 1 #',ed=>ed.setNode('heading',{level:1})],
  ['Título 2','Título médio','h2 titulo 2 ##',ed=>ed.setNode('heading',{level:2})],
  ['Título 3','Título pequeno','h3 titulo 3 ###',ed=>ed.setNode('heading',{level:3})],
  ['Texto','Parágrafo simples','texto paragrafo',ed=>ed.setParagraph()],
  ['Toggle','Bloco que abre e fecha','toggle >',ed=>ed.setDetails()],
  ['Lista','Lista com bolinhas','lista bolinhas -',ed=>ed.toggleBulletList()],
  ['Lista numerada','1, 2, 3…','lista numerada 1.',ed=>ed.toggleOrderedList()],
  ['Checklist','Lista de tarefas','checklist tarefas []',ed=>ed.toggleTaskList()],
  ['Citação','Trecho em destaque lateral','citacao quote',ed=>ed.toggleBlockquote()],
  ['Destaque','Caixa com ícone e fundo','destaque callout aviso',ed=>ed.wrapIn('callout')],
  ['Divisória','Linha horizontal','divisoria linha ---',ed=>ed.setHorizontalRule()],
  ['Imagem','Enviar uma imagem','imagem foto',null],
  ['Página','Nova página, aberta num painel','pagina page subpagina',null],
  ['Frase','Inserir uma frase-padrão salva','frase laudo modelo padrao',null],
];
const ntSemAcento=s=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
// Menu flutuante de sugestões ("/" blocos, "@" lembretes). itens(query) -> [[título, subtítulo, ...]]; comando(editor,range,item).
function ntSugestao(c,{nome,char,itens,comando,allow,allowSpaces=false,semVazio=false}){
  return TT.Extension.create({name:nome,addProseMirrorPlugins(){
    let menu=null,lista=[],sel=0,props=null;
    const pinta=()=>{
      if(semVazio&&!lista.length){menu.hidden=true;return}
      menu.hidden=false;
      menu.innerHTML=lista.length?lista.map((it,i)=>`<button type="button" class="nt-slash-it${i===sel?' sel':''}" data-i="${i}"><b>${esc(it[0])}</b><small>${esc(it[1])}</small></button>`).join(''):'<div class="nt-slash-vazio">Nada encontrado</div>';
      const r=props.clientRect?.();if(r){menu.style.left=Math.max(8,Math.min(r.left,innerWidth-250))+'px';const abaixo=r.bottom+6;menu.style.top=(abaixo+260>innerHeight&&r.top>270?r.top-Math.min(260,menu.offsetHeight||260)-6:abaixo)+'px'}
      menu.querySelector('.sel')?.scrollIntoView({block:'nearest'});
    };
    const fecha=()=>{menu?.remove();menu=null};
    return [TT.Suggestion({editor:this.editor,char,allowSpaces,pluginKey:new TT.pm.state.PluginKey(nome),allow,
      items:({query})=>itens(query),
      command:({editor,range,props:it})=>comando(editor,range,it),
      render:()=>({
        onStart:p=>{props=p;lista=p.items;sel=0;menu=document.createElement('div');menu.className='nt-slash';menu.setAttribute('role','listbox');
          menu.addEventListener('mousedown',e=>e.preventDefault());
          menu.addEventListener('click',e=>{const b=e.target.closest('[data-i]');if(b)props.command(lista[+b.dataset.i])});
          c.el.appendChild(menu);pinta()},
        onUpdate:p=>{props=p;lista=p.items;sel=Math.min(sel,Math.max(0,lista.length-1));pinta()},
        onKeyDown:({event:e})=>{
          if(e.key==='Escape'){fecha();return true}
          if(!lista.length)return false;
          if(e.key==='ArrowDown'){sel=(sel+1)%lista.length;pinta();return true}
          if(e.key==='ArrowUp'){sel=(sel-1+lista.length)%lista.length;pinta();return true}
          if(e.key==='Enter'||e.key==='Tab'){props.command(lista[sel]);return true}
          return false},
        onExit:fecha,
      })})];
  }});
}
const ntSlash=c=>ntSugestao(c,{nome:'slashNotas',char:'/',
  allow:({state,range})=>state.doc.resolve(range.from).parent.type.name!=='detailsSummary',
  itens:query=>{const q=ntSemAcento(query);return NT_SLASH.filter(it=>!(c.pagina&&it[0]==='Página')&&(!q||ntSemAcento(it[0]+' '+it[2]).includes(q)))},   // (dentro de uma página não há "Página")
  comando:(editor,range,it)=>{
    const ch=editor.chain().focus().deleteRange(range);
    if(it[3]){it[3](ch).run();return}
    ch.run();if(it[0]==='Página')ntPaginaDoSlash(c);else if(it[0]==='Frase')ntFrasesEscolhe(c);else ntEscolheImagem(c);
  }});

// ----- Barra fixa de formatação (no topo da página e no painel de cada página) + barra da imagem -----
// Os botões não roubam o foco: mousedown é cancelado (só o campo do link recebe foco). Sem bolha ao selecionar texto (1.41).
const NT_BARRA=[
  ['bold','<b>B</b>','Negrito (Ctrl+B)'],['italic','<i>I</i>','Itálico (Ctrl+I)'],['underline','<u>U</u>','Sublinhado (Ctrl+U)'],['strike','<s>S</s>','Tachado (Ctrl+Shift+S)'],
  ['link','🔗','Link (Ctrl+K)'],['cor','A▾','Cor do texto e realce (Ctrl+Shift+H aplica a última)'],null,
  ['h1','H1','Título 1'],['h2','H2','Título 2'],['h3','H3','Título 3'],null,
  ['bullet','•','Lista com marcadores'],['ordered','1.','Lista numerada'],['task','☑','Checklist'],['tgl','▶','Toggle'],null,
  ['frase','✚<span class="nt-bt-t"> Frase</span>','Salvar o texto selecionado como frase-padrão (insira com /Frase)'],['frases','📋','Gerenciar frases-padrão'],['hist','🕘<span class="nt-bt-t"> Histórico</span>','Histórico de versões das notas'],null,
  ['atalhos','⌨<span class="nt-bt-t"> Atalhos</span>','Atalhos e funções (Ctrl+/)']];
const NT_BARRA_ATIVO={bold:'bold',italic:'italic',underline:'underline',strike:'strike',link:'link',bullet:'bulletList',ordered:'orderedList',task:'taskList',tgl:'details'};
function ntBarra(c){
  const b=document.createElement('div'),sw=tipo=>NT_CORES.map(([k,n])=>`<button type="button" class="nt-sw" data-cor="${tipo}:${k}" title="${n}" aria-label="${tipo==='texto'?'Texto':'Fundo'} ${n}" style="${tipo==='texto'?`color:var(--ntc-${k})`:`background:var(--ntb-${k})`}">${tipo==='texto'?'A':''}</button>`).join('');
  b.className='nt-barra';
  b.innerHTML=`<div class="nt-barra-l" role="toolbar" aria-label="Formatação">${NT_BARRA.map(x=>x?`<button type="button" data-m="${x[0]}" title="${x[2]}" aria-label="${x[2]}">${x[1]}</button>`:'<i class="nt-sep"></i>').join('')}</div>
    <div class="nt-pop nt-link" hidden><input type="text" class="nt-link-in" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="Endereço do link (vazio remove)" aria-label="Endereço do link"><button type="button" data-m="link-ok" title="Aplicar">OK</button><button type="button" data-m="link-x" title="Cancelar">✕</button></div>
    <div class="nt-pop nt-paleta" hidden><div class="nt-paleta-t">Texto</div><div class="nt-paleta-l">${sw('texto')}</div><div class="nt-paleta-t">Fundo</div><div class="nt-paleta-l">${sw('fundo')}</div><button type="button" class="nt-sem-cor" data-cor="nenhuma">Sem cor</button></div>`;
  b.addEventListener('mousedown',e=>{if(!e.target.closest('input'))e.preventDefault()});
  const inp=b.querySelector('.nt-link-in'),pop=b.querySelector('.nt-link'),pal=b.querySelector('.nt-paleta');
  inp.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();ntLinkAplica(c,e.target.value)}
    else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();ntLinkCancela(c)}
  });
  inp.addEventListener('blur',()=>setTimeout(()=>{if(!pop.contains(document.activeElement))pop.hidden=true},150));   // clicou fora: fecha
  b.addEventListener('click',e=>{
    const bt=e.target.closest('button');if(!bt||!c.ed)return;const m=bt.dataset.m,ch=()=>c.ed.chain().focus();
    if(m==='link-ok'){ntLinkAplica(c,inp.value);return}
    if(m==='link-x'){ntLinkCancela(c);return}
    if(bt.dataset.cor){if(bt.dataset.cor==='nenhuma')ntSemCor(c.ed);else{const[t,k]=bt.dataset.cor.split(':');ntAplicaCor(c.ed,t,k)}pal.hidden=true;ntBarraPinta(c);return}
    if(!m)return;
    if(m==='bold')ch().toggleBold().run();else if(m==='italic')ch().toggleItalic().run();else if(m==='underline')ch().toggleUnderline().run();else if(m==='strike')ch().toggleStrike().run();
    else if(m==='link'){ntLink(c);return}
    else if(m==='cor'){if(pal.hidden){pop.hidden=true;ntPopPos(pal,bt)}else pal.hidden=true;return}
    else if(/^h[123]$/.test(m))ch().toggleHeading({level:+m[1]}).run();
    else if(m==='bullet')ch().toggleBulletList().run();else if(m==='ordered')ch().toggleOrderedList().run();else if(m==='task')ch().toggleTaskList().run();
    else if(m==='tgl'){if(c.ed.isActive('details'))ch().unsetDetails().run();else ch().setDetails().run()}
    else if(m==='atalhos'){ntAtalhosAbre();return}
    else if(m==='frase'){ntFraseSalvaSel(c);return}
    else if(m==='frases'){ntFrasesGerencia();return}
    else if(m==='hist'){ntHistAbre(c);return}
    ntBarraPinta(c);
  });
  c.barra=b;return b;
}
// Estado ativo dos botões (negrito, título, lista…) conforme o cursor/seleção.
function ntBarraPinta(c){
  const e=c.ed,b=c.barra;if(!e||!b)return;
  for(const bt of b.querySelectorAll('.nt-barra-l [data-m]')){
    const m=bt.dataset.m;let on=false;
    try{on=/^h[123]$/.test(m)?e.isActive('heading',{level:+m[1]}):m==='cor'?!!(e.getAttributes('textStyle').color||e.getAttributes('textStyle').backgroundColor):NT_BARRA_ATIVO[m]?e.isActive(NT_BARRA_ATIVO[m]):false}catch(x){}
    bt.classList.toggle('on',on);if(m!=='atalhos'&&m!=='frase'&&m!=='frases'&&m!=='hist')bt.setAttribute('aria-pressed',String(on));
  }
}
// Barra da imagem (largura 25/50/75/100 % e apagar): só aparece com uma imagem selecionada.
function ntBolha(c){
  const b=document.createElement('div');b.className='nt-bolha';b.hidden=true;b.setAttribute('role','toolbar');b.setAttribute('aria-label','Imagem');
  b.addEventListener('mousedown',e=>e.preventDefault());
  b.innerHTML=`<div class="nt-bolha-img"><button type="button" data-l="25">25%</button><button type="button" data-l="50">50%</button><button type="button" data-l="75">75%</button><button type="button" data-l="100">100%</button><button type="button" data-l="apagar" title="Apagar imagem">🗑</button></div>`;
  b.addEventListener('click',e=>{
    const bt=e.target.closest('button[data-l]');if(!bt||!c.ed)return;
    const s=c.ed.state.selection,n=s.node;if(n?.type.name!=='image')return;
    if(bt.dataset.l==='apagar')c.ed.chain().focus().deleteSelection().run();
    else c.ed.chain().focus().command(({tr})=>{tr.setNodeMarkup(s.from,undefined,{...n.attrs,largura:+bt.dataset.l===100?null:+bt.dataset.l});return true}).run();
  });
  c.bolha=b;c.el.appendChild(b);
}
function ntBolhaPos(c){
  const b=c.bolha,e=c.ed;if(!b||!e)return;
  const s=e.state.selection;
  if(s.node?.type.name!=='image'||(!e.isFocused&&!b.contains(document.activeElement))){b.hidden=true;return}
  b.hidden=false;
  const a=e.view.coordsAtPos(s.from),z=e.view.coordsAtPos(s.to),h=b.offsetHeight||40,w=b.offsetWidth||220,toque=matchMedia('(pointer:coarse)').matches;
  const topo=toque?Math.max(z.bottom,a.bottom)+10:a.top-h-8;
  b.style.top=Math.max(8,Math.min(topo<8?Math.max(z.bottom,a.bottom)+10:topo,innerHeight-h-8))+'px';
  b.style.left=Math.max(8,Math.min((a.left+z.left)/2-w/2,innerWidth-w-8))+'px';
}

// ----- Alça ⋮⋮ (arrastar com mouse; clicar/tocar abre o menu Subir/Descer/Aninhar/Apagar) -----
function ntAlca(c){
  const al=document.createElement('div');al.className='nt-alca';al.contentEditable='false';al.draggable=true;al.hidden=true;al.title='Arrastar (clique para o menu)';al.textContent='⋮⋮';
  const menu=document.createElement('div');menu.className='nt-menu-bloco';menu.hidden=true;
  menu.innerHTML=[['subir','↑ Subir'],['descer','↓ Descer'],['aninhar','⇥ Entrar no anterior'],['sair','⇤ Sair do nível'],['apagar','🗑 Apagar']].map(([k,t])=>`<button type="button" data-a="${k}">${t}</button>`).join('');
  c.el.append(al,menu);c.alcaEl=al;c.menuEl=menu;
  const bloco=()=>c.alvo!=null&&c.ed.state.doc.content.size>c.alvo?ntBlocoPos(c.ed.state.doc,c.alvo):null;
  const mostra=b=>{
    if(!b){al.hidden=true;return}
    c.alvo=b.pos;const dom=c.ed.view.nodeDOM(b.pos);if(!(dom instanceof Element)){al.hidden=true;return}
    const r=dom.getBoundingClientRect(),rc=c.el.getBoundingClientRect(),lh=parseFloat(getComputedStyle(dom).lineHeight)||24,lista=/^(listItem|taskItem)$/.test(b.node.type.name)&&dom.parentElement?dom.parentElement.getBoundingClientRect().left:r.left;   // item de lista: alça fica à esquerda da bolinha
    al.hidden=false;al.style.top=(r.top-rc.top+Math.max(0,(lh-24)/2)+1)+'px';al.style.left=(lista-rc.left-24)+'px';
  };
  c.alcaMostra=mostra;
  c.el.addEventListener('mousemove',e=>{
    if(!c.ed||e.target.closest('.nt-alca,.nt-menu-bloco'))return;
    const v=c.ed.view,pm=v.dom.getBoundingClientRect(),x=Math.min(Math.max(e.clientX,pm.left+40),pm.right-2);
    const r=v.posAtCoords({left:x,top:e.clientY});if(!r)return;
    mostra(r.inside>=0?ntBlocoPos(c.ed.state.doc,r.inside):ntBlocoEm(c.ed.state.doc,r.pos));
  });
  al.addEventListener('dragstart',e=>{
    const b=bloco();if(!b){e.preventDefault();return}
    if(ntBselArrasta(c,e,b))return;   // bloco do grupo selecionado: arrasta o grupo
    const S=TT.pm.state,v=c.ed.view,sel=S.NodeSelection.create(v.state.doc,b.pos);
    v.dispatch(v.state.tr.setSelection(sel));v.dragging={slice:sel.content(),move:true};
    const dom=v.nodeDOM(b.pos);if(dom instanceof Element)e.dataTransfer.setDragImage(dom,0,0);
    e.dataTransfer.effectAllowed='copyMove';e.dataTransfer.setData('text/plain','');
  });
  al.addEventListener('dragend',()=>{c.ed.view.dragging=null;c.grupoArrasto=null});
  al.addEventListener('click',()=>{
    const b=bloco();if(!b)return;
    if(!menu.hidden){menu.hidden=true;return}
    menu.hidden=false;menu.style.top=al.offsetTop+26+'px';menu.style.left=al.offsetLeft+'px';
  });
  menu.addEventListener('mousedown',e=>e.preventDefault());
  menu.addEventListener('click',e=>{
    const k=e.target.closest('[data-a]')?.dataset.a,b=bloco();menu.hidden=true;if(!k||!b)return;
    const ed=c.ed;ed.chain().focus().setTextSelection(Math.min(b.pos+1,ed.state.doc.content.size)).run();
    if(k==='subir')ntSobeDesce(ed,b,-1);else if(k==='descer')ntSobeDesce(ed,b,1);
    else if(k==='aninhar')ntAninha(ed,b,false);else if(k==='sair')ntAninha(ed,b,true);
    else if(k==='apagar')ed.view.dispatch(ed.state.tr.delete(b.pos,b.pos+b.node.nodeSize).scrollIntoView());
    c.alvo=null;al.hidden=true;
  });
}

function ntExtensoes(c){
  const E=TT.ext;
  return [E.Document,E.Paragraph,E.Text,E.Heading.configure({levels:[1,2,3]}),E.Bold,E.Italic,E.Underline,E.Strike,
    E.Link.configure({openOnClick:false,autolink:true}),
    E.BulletList,E.OrderedList,E.ListItem,E.TaskList,E.TaskItem.configure({nested:true}),
    E.Blockquote.extend({addInputRules(){return []}}),   // "> " é toggle; citação só pelo menu "/"
    E.HorizontalRule,ntToggle(),E.DetailsSummary,E.DetailsContent,ntDestaque(),ntImagem(),ntPaginaLink(),
    E.TextStyle,E.Color,E.BackgroundColor,E.UndoRedo,E.Dropcursor.configure({color:'#5687be',width:2}),E.Gapcursor,E.TrailingNode,
    E.Placeholder.configure({placeholder:({node})=>node.type.name==='detailsSummary'?'Toggle':node.type.name==='heading'?'Título':"Digite '/' para ver os comandos"}),
    ntIds(),ntRegraToggle(),ntAtalhos(c),ntSlash(c),ntLembrete(),ntLembretePlugin(c),ntBuscaExt(),ntBselExt(c),
    TT.Extension.create({name:'envioImagem',addProseMirrorPlugins(){return [ntPluginEnvio()]}})];
}
// Separa os blocos que o editor aceita dos inválidos (plano corrompido): um bloco ruim não derruba a aba nem apaga as outras notas.
function ntValidos(blocos){
  const bons=[],ruins=[];
  if(!Array.isArray(blocos))return {bons,ruins,corrompido:true};
  let t;
  try{t=new TT.Editor({extensions:ntExtensoes(NT)});
    for(const b of blocos){try{if(!b||typeof b.id!=='string')throw 0;t.schema.nodeFromJSON(b.conteudo).check();bons.push(b)}catch(e){ruins.push(b)}}
  }catch(e){return {bons:[],ruins:blocos,corrompido:true}}finally{try{t?.destroy()}catch(e){}}
  return {bons,ruins,corrompido:false};
}
// Guarda os blocos inválidos em notas_conflitos (uma vez só: id+data fixos).
function ntGuardaRuins(ruins,motivo='bloco inválido',pagina){
  if(!ruins.length)return;
  const novos=ruins.map((b,i)=>({id:String(b?.id||'sem-id-'+i),em:String(b?.atualizado||'invalido'),motivo,...(pagina?{pagina}:{}),conteudo:b?.conteudo??null}));
  const todos=ntJuntaConflitos(SM.d.notas_conflitos,novos);
  if(JSON.stringify(todos)!==JSON.stringify(SM.d.notas_conflitos||[]))smMudar(d=>{d.notas_conflitos=ntJuntaConflitos(d.notas_conflitos,novos)},'notas: '+motivo+' guardado');
}
// Cria o editor do contexto `c` (página principal ou painel) com os `blocos`; `aoMudar` roda ~1 s depois da última digitação.
function ntEditor(c,blocos,aoMudar){
  c.el=document.createElement('div');c.el.className='nt-ed';
  c.ed=new TT.Editor({element:c.el,extensions:ntExtensoes(c),content:ntDocumento(blocos),
    editorProps:{attributes:{class:'nt-pm','aria-label':c.pagina?'Página':'Notas',spellcheck:'true'},
      transformPastedHTML:h=>h.replace(/<img\b(?![^>]*\bsrc="\.\/img\/)[^>]*>/gi,''),
      handlePaste:(v,e)=>{
        const cd=e.clipboardData;if(!cd)return false;
        const texto=cd.getData('text/plain'),arq=[...(cd.items||[])].find(i=>i.kind==='file'&&/^image\//.test(i.type))?.getAsFile();
        if(arq&&texto){e.preventDefault();v.pasteText(texto);return true}   // Excel/Word trazem imagem + texto: cola o texto
        if(arq){e.preventDefault();ntInsereImagem(arq,undefined,c);return true}
        return false},
      handleDrop:(v,e,slice,moved)=>{
        const arq=!moved&&[...(e.dataTransfer?.files||[])].find(f=>/^image\//.test(f.type));if(!arq)return false;
        e.preventDefault();ntInsereImagem(arq,v.posAtCoords({left:e.clientX,top:e.clientY})?.pos,c);return true},
      handleClick:(v,pos,e)=>{const lb=e.target.closest?.('.nt-lemb');if(lb){ntLembreteEdita(c,lb,v.posAtDOM(lb,0));return true}if((e.ctrlKey||e.metaKey)&&e.target.closest?.('a[href]')){window.open(e.target.closest('a').href,'_blank','noopener');return true}return false}}});
  c.ed.on('update',({transaction:t})=>{if(t.getMeta('ntRemoto'))return;c.sujo=true;clearTimeout(c.timer);c.timer=setTimeout(aoMudar,1000)});
  c.ed.on('transaction',({transaction:t})=>{if(c.posImg!=null)c.posImg=t.mapping.map(c.posImg);if(c.buscaEl)ntBuscaPinta(c)});
  for(const ev of ['selectionUpdate','update','focus','blur'])c.ed.on(ev,()=>setTimeout(()=>{if(!c.ed)return;ntBolhaPos(c);ntBarraPinta(c);if(ev==='selectionUpdate'&&matchMedia('(pointer:coarse)').matches)c.alcaMostra?.(ntBlocoEm(c.ed.state.doc,c.ed.state.selection.from))},ev==='blur'?150:0));
  c.el.addEventListener('keydown',e=>{if(e.key==='Tab')e.stopPropagation()});   // depois do ProseMirror: Tab não troca de aba
  ntBolha(c);ntAlca(c);
}
function ntCria(){
  const lista=SM.d.notasDoc?.blocos,v=ntValidos(lista);
  ntGuardaRuins(v.ruins);
  if(v.corrompido||(v.ruins.length&&!v.bons.length)){ntFalha();return false}   // nada aproveitável: oferece restaurar
  NT.shown=lista;ntEditor(NT,v.bons,ntSalvaDoc);ntBarra(NT);ntBarraPinta(NT);
  return true;
}
// Plano de notas sem nenhum bloco aproveitável: não abre o editor (um documento vazio apagaria tudo ao salvar); oferece a cópia da 1.38.
function ntFalha(){
  const raiz=document.getElementById('nt_raiz');if(!raiz)return;
  const tem=Array.isArray(SM.d?.notas_v138)&&SM.d.notas_v138.length;
  raiz.innerHTML=`<div class="card"><p>Não consegui abrir as notas: o documento salvo está corrompido. Os blocos ficaram guardados em notas_conflitos.</p>${tem?'<button type="button" class="b" id="nt_restaura" onclick="ntRestaura()">Restaurar das notas antigas (cópia da 1.38)</button>':'<p class="mut">Não há cópia das notas antigas neste plano.</p>'}</div>`;
}
function ntRestaura(){
  const v=SM.d?.notas_v138;if(!Array.isArray(v)||!v.length)return;
  try{localStorage.removeItem(NT_PEND)}catch(e){}
  NT.ed?.destroy();NT.ed=null;NT.el=null;NT.shown=null;
  smMudar(d=>{delete d.notasDoc;d.notas=JSON.parse(JSON.stringify(d.notas_v138));ntMigra(d)},'notas: restauradas da cópia 1.38');
}
// Aplica no editor do contexto `c` SÓ os blocos de topo que mudaram (transação do ProseMirror, fora do histórico do Ctrl+Z): cursor, seleção e o
// que está sendo digitado nos outros blocos não são tocados. Nunca setContent no documento inteiro.
function ntAplicaNoEditor(c,alvo,local=false){   // local: restauração do histórico = edição nova (entra no Ctrl+Z e é salva pela fila normal)
  const ed=c.ed,nos=new Map();
  for(const b of alvo)try{const n=ed.state.schema.nodeFromJSON(b.conteudo);n.check();nos.set(b.id,n)}catch(e){}   // bloco inválido fica de fora (já está em notas_conflitos)
  alvo=alvo.filter(b=>nos.has(b.id));if(!alvo.length)return;
  const ids=new Set(alvo.map(b=>b.id)),tr=ed.state.tr,topo=()=>{const a=[];tr.doc.forEach((n,pos)=>a.push({id:n.attrs.id,n,pos}));return a};
  let p=0;
  for(const b of alvo){
    const cur=topo(),no=nos.get(b.id);
    while(cur[p]&&!ids.has(cur[p].id))p++;   // os que sumiram são apagados no fim
    const at=cur[p];
    if(at&&at.id===b.id){if(!at.n.eq(no))tr.replaceWith(at.pos,at.pos+at.n.nodeSize,no);p++;continue}
    const j=cur.findIndex((x,i)=>i>p&&x.id===b.id);
    if(j>=0)tr.delete(cur[j].pos,cur[j].pos+cur[j].n.nodeSize);   // o bloco veio de mais adiante (mudou de lugar)
    tr.insert(at?at.pos:tr.doc.content.size,no);p++;
  }
  for(const x of topo().reverse())if(!ids.has(x.id))tr.delete(x.pos,x.pos+x.n.nodeSize);
  if(tr.docChanged)ed.view.dispatch(local?tr:tr.setMeta('addToHistory',false).setMeta('ntRemoto',true));
}
// Mostra no editor o documento do plano (outro aparelho mudou), sem atropelar o que está sendo digitado.
function ntSincroniza(){ntSincMain();pgSincroniza();ntLateralPinta()}
function ntSincMain(){
  if(!NT.ed||!SM.d?.notasDoc||NT.sujo)return;
  const alvo=SM.d.notasDoc.blocos;
  if(JSON.stringify(alvo)===JSON.stringify(NT.shown))return;
  try{ntAplicaNoEditor(NT,alvo);NT.shown=alvo}
  catch(e){console.warn('notas: não consegui atualizar o editor; recriando',e);try{NT.ed.destroy()}catch(e2){}NT.ed=null;NT.el=null;NT.shown=null;smRender()}   // sem digitação pendente (sujo=false): recriar do plano é seguro
}
function ntMonta(){
  if(!document.getElementById('nt_raiz')||!SM.d)return;
  if(!window.TT){document.getElementById('nt_raiz').innerHTML='<p class="mut">O editor não carregou (vendor/tiptap.js). Atualize o app.</p>';return}
  if(!SM.d.notasDoc)smMudar(d=>ntMigra(d),'notas: migração para página única');   // redesenha a aba: pega o contêiner de novo
  const raiz=document.getElementById('nt_raiz');if(!raiz)return;
  if(!NT.ed&&!ntCria())return;
  if(NT.el.parentNode!==raiz)raiz.appendChild(NT.el);
  const slot=document.getElementById('nt_barra');if(slot&&NT.barra&&NT.barra.parentNode!==slot)slot.appendChild(NT.barra);
  const h=document.querySelector('header');if(h)raiz.closest('.nt')?.style.setProperty('--nt-top',Math.round(h.getBoundingClientRect().height)+'px');   // a barra gruda logo abaixo do cabeçalho do app
  ntSincroniza();
  if(NT.eraFoco){NT.eraFoco=false;NT.ed.commands.focus(null,{scrollIntoView:false})}
}
// Botão + e Alt+A: novo toggle no topo da página (ou da página aberta no painel), já com o cursor no título.
function ntAbre(){
  const c=NP?.ed?NP:NT;if(!c.ed)return;
  c.ed.chain().insertContentAt(0,{type:'details',content:[{type:'detailsSummary'},{type:'detailsContent',content:[{type:'paragraph'}]}]}).setTextSelection(2).focus().run();
  (c===NT?window:c.el.closest('.nt-pan-corpo')).scrollTo({top:0});
}
function vNotas(){
  if(!SM.d)return '<div class="card"><p class="mut">As notas ainda não estão disponíveis neste aparelho. Tente novamente com conexão.</p></div>';
  NT.eraFoco=!!NT.ed&&!!NT.el&&NT.el.contains(document.activeElement);   // a aba é redesenhada: devolve o foco ao editor
  setTimeout(ntMonta,0);
  const lat=ntLateralAberta();
  return `<div class="nt"><div class="nt-topo"><button type="button" class="b s nt-lat-bt" id="nt_lat_bt" onclick="ntLateralAlterna()" title="Mostrar ou esconder a lista de páginas" aria-label="Páginas" aria-expanded="${lat}">☰</button><h2>Notas</h2><div class="nt-barra-slot" id="nt_barra"></div></div>${SM.erro?'<p class="sm-err">Alterações salvas neste aparelho; sincronização pendente.</p>':''}<div class="nt-corpo${lat?'':' lat-off'}"><aside class="nt-lat" id="nt_lat" aria-label="Páginas">${ntLateralHtml()}</aside><div class="nt-lat-fundo" onclick="ntLateralAlterna()"></div><div class="nt-conteudo" id="nt_raiz"></div></div></div>`;
}

// ===== Páginas (1.41): bloco-link, dados, painel flutuante, barra lateral =====
// Bloco-link para uma página (comando "/Página"): clicar abre o painel. Apagar o bloco NÃO apaga a página.
function ntPlinkTexto(el){const p=pgAchar(el.dataset.pagina);el.classList.toggle('sem',!p);el.textContent='📄 '+(p?(p.titulo||'Sem título'):'Página excluída')}
const ntPaginaLinks=()=>{for(const c of [NT,NP])c?.el?.querySelectorAll('.nt-plink').forEach(ntPlinkTexto)};   // (pelo editor, não pelo document: a aba é redesenhada e o editor fica solto por instantes)
function ntPaginaLink(){
  return TT.Node.create({name:'paginaLink',group:'block',atom:true,selectable:true,
    addAttributes(){return {pagina:{default:null,parseHTML:el=>el.getAttribute('data-pagina'),renderHTML:a=>({'data-pagina':a.pagina})}}},
    parseHTML(){return [{tag:'div[data-type="pagina-link"]'}]},
    renderHTML({HTMLAttributes}){return ['div',TT.mergeAttributes(HTMLAttributes,{'data-type':'pagina-link'})]},
    addNodeView(){return ({node})=>{
      const dom=document.createElement('div');dom.className='nt-plink';dom.contentEditable='false';dom.setAttribute('role','button');dom.title='Abrir a página';
      let atual=node;const pinta=()=>{dom.dataset.pagina=atual.attrs.pagina||'';ntPlinkTexto(dom)};pinta();
      dom.addEventListener('click',e=>{e.preventDefault();const p=pgAchar(atual.attrs.pagina);if(p)ntPainelAbre(p.id);else toast('Esta página foi excluída.')});
      return {dom,ignoreMutation:()=>true,update(n){if(n.type!==atual.type)return false;atual=n;pinta();return true}};
    }},
  });
}
// Toda mudança nas páginas entra na fila (NT_PEND.paginas), no plano local e sobe pelo mesmo ntSync das notas.
function pgGrava(l){
  const p=ntPendentes()[0];
  try{localStorage.setItem(NT_PEND,JSON.stringify({...p,blocos:p?.blocos||SM.d.notasDoc?.blocos||[],paginas:l,em:Date.now(),conflitos:p?.conflitos||[]}))}catch(e){toast('Sem espaço para salvar as notas neste aparelho.');return false}
  SM.d.notasPaginas={...SM.d.notasPaginas,v:1,paginas:l};smGuardaCache();ntSync();ntLateralPinta();ntPaginaLinks();return true;
}
function pgMuda(fn){if(!SM.d)return false;const l=JSON.parse(JSON.stringify(ntPaginas()));fn(l);return pgGrava(l)}
const ntAgora=()=>new Date().toISOString();
function ntPaginaCria(){
  const agora=ntAgora(),id=ntNovoId().replace(/^b/,'p'),bid=ntNovoId(),ordem=Math.max(0,...ntPaginas().map(p=>Number(p.ordem)||0))+10;
  pgMuda(l=>l.push({id,titulo:'',fixada:false,ordem,criado:agora,atualizado:agora,doc:{v:1,blocos:[{id:bid,atualizado:agora,conteudo:{type:'paragraph',attrs:{id:bid}}}]}}));
  return id;
}
function ntPaginaNova(){const id=ntPaginaCria();ntPainelAbre(id);return id}   // botão "+ Nova página"
function ntPaginaDoSlash(c){const id=ntPaginaCria();c.ed.chain().focus().insertContent({type:'paginaLink',attrs:{pagina:id}}).run();ntPainelAbre(id)}   // "/Página"
function ntPaginaFixa(id){
  const p=pgAchar(id);if(!p)return;
  pgMuda(l=>{const x=l.find(y=>y.id===id),fixa=!x.fixada;x.fixada=fixa;x.atualizado=ntAgora();   // vai para o fim da seção de destino
    x.ordem=Math.max(0,...l.filter(y=>y.id!==id&&!!y.fixada===fixa).map(y=>Number(y.ordem)||0))+10});
  ntPainelPinta();
}
function ntPaginaExclui(id){
  if(NP?.pagina===id)ntPainelFecha(true);
  pgMuda(l=>{const i=l.findIndex(y=>y.id===id);if(i>=0)l.splice(i,1)});toast('Página excluída.');
}
// Reordena dentro da seção (fixadas / páginas): `id` passa para antes (ou depois) de `ref`; só quem mudou de ordem é regravado.
function ntPaginaMove(id,ref,depois){
  pgMuda(l=>{
    const a=l.find(p=>p.id===id);if(!a)return;
    const sec=l.filter(p=>!!p.fixada===!!a.fixada&&p.id!==id).sort(ntPgOrdem);
    let i=ref?sec.findIndex(p=>p.id===ref):sec.length;if(i<0)i=sec.length;else if(depois)i++;
    sec.splice(i,0,a);const agora=ntAgora();
    sec.forEach((p,n)=>{const o=(n+1)*10;if(p.ordem!==o){p.ordem=o;p.atualizado=agora}});
  });
}
// Salva o texto do painel (1 s depois de parar de digitar, ao fechar ou antes de entrar um plano remoto).
function pgSalvaDoc(){
  const c=NP;if(!c?.ed||!SM.d)return;clearTimeout(c.timer);
  const p=pgAchar(c.pagina);
  if(!p){   // página apagada em outro aparelho enquanto se digitava nela: o que foi digitado vai para notas_conflitos
    const novos=ntBlocos(c.ed.getJSON(),c.shown||[]).filter(b=>!(c.shown||[]).includes(b));c.sujo=false;
    if(novos.length){c.resgatou=true;ntGuardaRuins(novos,'página apagada em outro aparelho',c.pagina);toast('A página foi apagada em outro aparelho; guardei o que você digitou em notas_conflitos.')}
    return;
  }
  const ant=c.shown||p.doc?.blocos||[],blocos=ntBlocos(c.ed.getJSON(),ant);c.sujo=false;
  if(JSON.stringify(blocos)===JSON.stringify(ant))return;
  ntLembSincroniza(ant,blocos);
  c.shown=blocos;const agora=ntAgora();
  pgMuda(l=>{const x=l.find(y=>y.id===c.pagina);if(x){x.doc={v:1,blocos};x.atualizado=agora}});
}
function pgTituloSalva(){
  const c=NP;if(!c?.titulo)return;clearTimeout(c.tituloTimer);
  const p=pgAchar(c.pagina),v=c.titulo.value;if(!p||(p.titulo||'')===v)return;
  const agora=ntAgora();pgMuda(l=>{const x=l.find(y=>y.id===c.pagina);if(x){x.titulo=v;x.atualizado=agora}});
}
// Chega plano de outro aparelho: o painel aberto recebe só os blocos que mudaram (ou fecha, se a página foi excluída lá).
function pgSincroniza(){
  const c=NP;if(!c?.ed)return;
  const p=pgAchar(c.pagina);
  if(!p){const resgatou=c.sujo||c.resgatou;if(c.sujo)pgSalvaDoc();ntPainelFecha(true);if(!resgatou)toast('A página foi excluída em outro aparelho.');return}   // (com texto digitado, o aviso do resgate já diz o que houve)
  if(c.titulo&&document.activeElement!==c.titulo&&c.titulo.value!==(p.titulo||''))c.titulo.value=p.titulo||'';
  ntPainelPinta();if(c.sujo)return;
  const alvo=Array.isArray(p.doc?.blocos)?p.doc.blocos:[];if(JSON.stringify(alvo)===JSON.stringify(c.shown))return;
  try{ntAplicaNoEditor(c,alvo);c.shown=alvo}
  catch(e){console.warn('notas: não consegui atualizar a página; reabrindo',e);const id=c.pagina;ntPainelFecha(true);ntPainelAbre(id)}
}
function ntPainelPinta(){
  const c=NP,p=c&&pgAchar(c.pagina),b=document.querySelector('#nt_pan [data-a="pin"]');if(!b||!p)return;
  b.classList.toggle('on',!!p.fixada);b.title=b.ariaLabel=p.fixada?'Desafixar página':'Fixar página';b.setAttribute('aria-pressed',String(!!p.fixada));
}
function ntPainelAbre(id){
  if(!SM.d||!window.TT)return;const p=pgAchar(id);if(!p){toast('Página não encontrada.');return}
  if(NP){if(NP.pagina===id)return;ntPainelFecha()}
  ntAntes();if(matchMedia('(max-width:700px)').matches&&NT.latMov)ntLateralAlterna();
  ntRecentePoe(id);
  const v=ntValidos(p.doc?.blocos);ntGuardaRuins(v.ruins);
  const c=NP=ntCtx(),ov=document.createElement('div');c.pagina=id;c.shown=Array.isArray(p.doc?.blocos)?p.doc.blocos:[];
  ov.id='nt_pan';ov.className='nt-pan';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-label','Página');
  ov.innerHTML=`<div class="nt-pan-c"><div class="nt-pan-topo"><div class="nt-pan-barra"></div><button type="button" class="nt-pan-b" data-a="pin" aria-label="Fixar página">📌</button><span class="nt-pan-exc"><button type="button" class="nt-pan-b" data-a="exc" title="Excluir página" aria-label="Excluir página">🗑</button><span class="nt-pan-conf" hidden>Excluir esta página? <button type="button" class="nt-pan-b ruim" data-a="exc-sim">Excluir</button><button type="button" class="nt-pan-b" data-a="exc-nao">Cancelar</button></span></span><button type="button" class="nt-pan-b" data-a="fecha" title="Fechar (Esc)" aria-label="Fechar página">✕</button></div><div class="nt-pan-corpo"><input type="text" class="nt-pan-titulo" placeholder="Sem título" aria-label="Título da página" maxlength="200" autocomplete="off"><div class="nt-pan-ed"></div></div></div>`;
  document.body.appendChild(ov);document.body.style.overflow='hidden';
  c.titulo=ov.querySelector('.nt-pan-titulo');c.titulo.value=p.titulo||'';
  ntEditor(c,v.bons,pgSalvaDoc);ov.querySelector('.nt-pan-ed').appendChild(c.el);ov.querySelector('.nt-pan-barra').appendChild(ntBarra(c));ntBarraPinta(c);
  let abaixo=false;
  ov.addEventListener('pointerdown',e=>{abaixo=e.target===ov});
  ov.addEventListener('click',e=>{
    if(e.target===ov&&abaixo){ntPainelFecha();return}
    const a=e.target.closest('.nt-pan-topo [data-a]')?.dataset.a,conf=ov.querySelector('.nt-pan-conf'),exc=ov.querySelector('[data-a="exc"]');
    if(a==='fecha')ntPainelFecha();else if(a==='pin')ntPaginaFixa(c.pagina);
    else if(a==='exc'){conf.hidden=false;exc.hidden=true}
    else if(a==='exc-nao'){conf.hidden=true;exc.hidden=false}
    else if(a==='exc-sim')ntPaginaExclui(c.pagina);
  });
  c.titulo.addEventListener('input',()=>{clearTimeout(c.tituloTimer);c.tituloTimer=setTimeout(pgTituloSalva,600)});
  c.titulo.addEventListener('blur',pgTituloSalva);
  c.titulo.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();c.ed.commands.focus('start')}});
  ntPainelPinta();ntLateralPinta();
  setTimeout(()=>{if(NP!==c)return;if(p.titulo)c.ed.commands.focus('end');else c.titulo.focus()},0);
}
// `sem`: fecha sem salvar (página excluída).
function ntPainelFecha(sem){
  const c=NP;if(!c)return;
  if(!sem){pgTituloSalva();pgSalvaDoc()}
  clearTimeout(c.timer);clearTimeout(c.tituloTimer);NP=null;c.buscaEl?.remove();
  try{c.ed.destroy()}catch(e){}
  c.ed=null;document.getElementById('nt_pan')?.remove();document.body.style.overflow='';
  ntLateralPinta();ntPaginaLinks();
}

// ===== Barra lateral retrátil: Fixadas / Páginas, arrastar para ordenar =====
const ntMovel=()=>matchMedia('(max-width:700px)').matches;
function ntLateralAberta(){if(ntMovel())return !!NT.latMov;try{return localStorage.getItem(NT_LAT)!=='0'}catch(e){return true}}   // celular: sempre começa recolhida
function ntLateralAlterna(){
  const corpo=document.querySelector('.nt-corpo');if(!corpo)return;
  const off=corpo.classList.toggle('lat-off');
  if(ntMovel())NT.latMov=!off;else try{localStorage.setItem(NT_LAT,off?'0':'1')}catch(e){}
  document.getElementById('nt_lat_bt')?.setAttribute('aria-expanded',String(!off));
}
function ntLateralHtml(){
  const l=[...ntPaginas()].sort(ntPgOrdem),fix=l.filter(p=>p.fixada),res=l.filter(p=>!p.fixada);
  const item=p=>`<div class="nt-pg-it${NP?.pagina===p.id?' on':''}" data-pg="${esc(p.id)}"><span class="nt-pg-alca" title="Arrastar para mudar a ordem" aria-hidden="true">⋮⋮</span><button type="button" class="nt-pg-nome" onclick="ntPainelAbre('${esc(p.id)}')">📄 ${esc(p.titulo||'Sem título')}</button><button type="button" class="nt-pg-pin${p.fixada?' on':''}" title="${p.fixada?'Desafixar':'Fixar'}" aria-label="${p.fixada?'Desafixar':'Fixar'} ${esc(p.titulo||'Sem título')}" onclick="ntPaginaFixa('${esc(p.id)}')">📌</button></div>`;
  const rec=ntRecentes().map(id=>l.find(p=>p.id===id)).filter(Boolean);
  return `<button type="button" class="b nt-pg-novo" onclick="ntPaginaNova()">+ Nova página</button>${rec.length?`<div class="nt-lat-s">Recentes</div><div class="nt-pg-lista" data-sec="rec">${rec.map(p=>`<button type="button" class="nt-pg-rec" data-pg="${esc(p.id)}" onclick="ntPainelAbre('${esc(p.id)}')">📄 ${esc(p.titulo||'Sem título')}</button>`).join('')}</div>`:''}${fix.length?`<div class="nt-lat-s">Fixadas</div><div class="nt-pg-lista" data-sec="fix">${fix.map(item).join('')}</div>`:''}<div class="nt-lat-s">Páginas</div><div class="nt-pg-lista" data-sec="pg">${res.map(item).join('')||'<p class="mut nt-pg-vazio">Nenhuma página ainda.</p>'}</div>`;
}
function ntLateralPinta(){if(NTD?.ativo)return;const el=document.getElementById('nt_lat');if(el)el.innerHTML=ntLateralHtml()}
// Arrastar (mouse: segurando o item e movendo; toque: pela alça ⋮⋮). O alvo é decidido pelo meio das linhas da mesma seção.
let NTD=null,ntEngole=false;
function ntArrastoMarca(){
  const d=NTD;if(!d)return null;
  const outros=[...d.lista.querySelectorAll('.nt-pg-it')].filter(x=>x!==d.it);
  d.lista.querySelectorAll('.alvo-antes,.alvo-depois').forEach(x=>x.classList.remove('alvo-antes','alvo-depois'));
  if(!outros.length)return null;
  const ref=outros.find(x=>{const r=x.getBoundingClientRect();return d.y<r.top+r.height/2}),alvo=ref||outros[outros.length-1];
  alvo.classList.add(ref?'alvo-antes':'alvo-depois');return {ref:alvo.dataset.pg,depois:!ref};
}
function ntArrastoFim(aplica){
  const d=NTD;if(!d)return;NTD=null;
  d.it.classList.remove('arrastando');d.lista.querySelectorAll('.alvo-antes,.alvo-depois').forEach(x=>x.classList.remove('alvo-antes','alvo-depois'));
  if(d.ativo){ntEngole=true;setTimeout(()=>{ntEngole=false},100);if(aplica&&d.alvo)ntPaginaMove(d.id,d.alvo.ref,d.alvo.depois);else ntLateralPinta()}
}
document.addEventListener('pointerdown',e=>{
  const it=e.target.closest?.('.nt-pg-it');if(!it||(e.pointerType==='mouse'&&e.button!==0)||e.target.closest('.nt-pg-pin'))return;
  if(e.pointerType!=='mouse'&&!e.target.closest('.nt-pg-alca'))return;   // toque: só pela alça (o resto da lista rola)
  NTD={it,id:it.dataset.pg,lista:it.parentElement,x0:e.clientX,y0:e.clientY,y:e.clientY,pid:e.pointerId,ativo:false,alvo:null};
});
document.addEventListener('pointermove',e=>{
  const d=NTD;if(!d||e.pointerId!==d.pid)return;
  if(!d.it.isConnected){NTD=null;return}
  if(!d.ativo){if(Math.hypot(e.clientX-d.x0,e.clientY-d.y0)<5)return;d.ativo=true;d.it.classList.add('arrastando');try{getSelection().removeAllRanges()}catch(x){}}
  e.preventDefault();d.y=e.clientY;d.alvo=ntArrastoMarca();
},{passive:false});
document.addEventListener('pointerup',e=>{if(NTD&&e.pointerId===NTD.pid)ntArrastoFim(true)});
document.addEventListener('pointercancel',e=>{if(NTD&&e.pointerId===NTD.pid)ntArrastoFim(false)});
document.addEventListener('click',e=>{if(ntEngole){ntEngole=false;e.stopPropagation();e.preventDefault()}},true);
document.addEventListener('selectstart',e=>{if(NTD?.ativo)e.preventDefault()});

// ===== Painel de atalhos (Ctrl+/): só o que existe de fato na aba =====
const NT_ATALHOS=[
  ['Formatar o texto selecionado (ou o que for digitado)',[[['Ctrl+B'],'Negrito'],[['Ctrl+I'],'Itálico'],[['Ctrl+U'],'Sublinhado'],[['Ctrl+Shift+S'],'Tachado'],
    [['Ctrl+K'],'Link: abre um campo (Enter aplica, Esc cancela, vazio remove)'],[['Ctrl+Shift+H'],'Aplica a última cor/realce usada (padrão: fundo amarelo); de novo, remove'],
    [['**texto**','*texto*','~~texto~~'],'Digitar assim vira negrito, itálico, tachado'],[['Ctrl+clique'],'Abre o link do texto'],[['Barra de cima'],'B I U S, link, cor/realce, títulos, listas, checklist e toggle (botões acesos = ativo)']]],
  ['Criar blocos',[[['/'],'Menu de blocos: Título 1/2/3, Texto, Toggle, Lista, Lista numerada, Checklist, Citação, Destaque, Divisória, Imagem, Página (↑ ↓ escolhem, Enter aplica, Esc fecha)'],
    [['> '],'Toggle'],[['# ','## ','### '],'Título 1, 2, 3'],[['- ','* ','+ '],'Lista com marcadores'],[['1. '],'Lista numerada'],[['[] '],'Checklist'],[['---'],'Divisória'],
    [['Ctrl+Alt+1/2/3'],'Título 1, 2, 3'],[['Ctrl+Alt+0'],'Texto comum'],[['Ctrl+Shift+8'],'Lista com marcadores'],[['Ctrl+Shift+7'],'Lista numerada'],[['Ctrl+Shift+9'],'Checklist'],[['Ctrl+Shift+B'],'Citação'],[['Alt+A'],'Novo toggle no topo (também o botão +)']]],
  ['Mover e aninhar',[[['Tab'],'Entra no toggle anterior; em lista, aninha o item. O 1º item de uma lista logo depois de um toggle entra no toggle'],
    [['Shift+Tab'],'Sai do toggle; em lista, desaninha. Item de lista de nível mais alto dentro de um toggle sai para depois dele'],
    [['⋮⋮'],'Alça à esquerda do bloco: arrastar muda a ordem; clicar/tocar abre Subir, Descer, Entrar, Sair, Apagar'],[['▶'],'Abre/fecha o toggle (o estado fica neste aparelho)'],[['Ctrl+Alt+T'],'Abre/fecha todos os toggles da página'],[['Ctrl+Enter'],'Abre/fecha o toggle onde está o cursor']]],
  ['Selecionar blocos',[[['Arrastar por fora do texto'],'Desenha um retângulo: os blocos que ele cruza ficam selecionados (no toque não há retângulo)'],[['Delete','Backspace'],'Apaga o grupo de uma vez'],[['Ctrl+C','Ctrl+X'],'Copia ou recorta o grupo'],[['Tab','Shift+Tab'],'O grupo entra no toggle de cima ou sai do toggle'],[['⋮⋮'],'Arrastar a alça de um bloco do grupo move o grupo todo'],[['Esc','clique'],'Limpa a seleção']]],
  ['Buscar',[[['Ctrl+F'],'Busca nesta página (na aba Notas): destaca tudo, mostra n/total; Enter e Shift+Enter navegam, Esc fecha; abre os toggles fechados'],[['Ctrl+P'],'Busca global em qualquer aba: notas, páginas, tarefas, calendário, questões'],[['Ctrl+K'],'Busca global (dentro do texto das Notas, Ctrl+K continua sendo link)']]],
  ['Lembretes, frases e histórico',[[['@'],'Lembrete: Hoje, Amanhã, dia da semana, dd/mm, dd/mm hh:mm. Vira um chip e uma tarefa do plano; clique no chip para mudar a data; apagar o chip não apaga a tarefa'],[['/ Frase'],'Insere uma frase-padrão salva (filtre digitando, Enter insere)'],[['✚ Frase'],'Salva o texto selecionado como frase-padrão'],[['📋'],'Renomear e apagar frases'],[['🕘 Histórico'],'Versões anteriores (precisa de internet): ver, restaurar a página ou um bloco como edição nova']]],
  ['Imagem',[[['Ctrl+V'],'Cola a imagem no cursor (reduz e envia)'],[['Arrastar arquivo'],'Solta a imagem no texto'],[['/ Imagem'],'Escolhe um arquivo'],[['Clicar na imagem'],'Largura 25/50/75/100 % ou apagar; Backspace/Delete também apaga']]],
  ['Páginas',[[['☰'],'Mostra/esconde a lista de páginas (Fixadas e Páginas)'],[['+ Nova página'],'Cria e abre uma página'],[['/ Página'],'Cria uma página e coloca um link para ela no ponto do cursor'],
    [['Clicar na página'],'Abre no painel grande, com o mesmo editor e a mesma barra'],[['Arrastar o item'],'Muda a ordem dentro da seção (no toque, pela alça ⋮⋮)'],[['📌'],'Fixa ou desafixa'],[['Esc','✕','clique fora'],'Fecha o painel e salva'],[['Recentes'],'As últimas 5 páginas abertas neste aparelho, acima das Fixadas'],[['🗑'],'Exclui a página (pede confirmação)']]],
  ['Geral',[[['Ctrl+Z'],'Desfazer'],[['Ctrl+Y','Ctrl+Shift+Z'],'Refazer'],[['Ctrl+/'],'Abre/fecha este painel'],[['Esc'],'Fecha este painel']]],
];
const ntAtalhosAberto=()=>!!document.getElementById('nt_atalhos');
function ntAtalhosAbre(){
  if(ntAtalhosAberto())return;
  const ov=document.createElement('div'),ant=document.activeElement;ov.id='nt_atalhos';ov.className='nt-atalhos';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-label','Atalhos das Notas');
  ov.innerHTML=`<div class="nt-atalhos-c"><div class="nt-atalhos-t"><b>Atalhos e funções das Notas</b><button type="button" aria-label="Fechar">✕</button></div><div class="nt-atalhos-l">${NT_ATALHOS.map(([g,l])=>`<h3>${esc(g)}</h3>${l.map(([k,d])=>`<div class="nt-at-r"><span class="nt-at-k">${k.map(x=>`<kbd>${esc(x)}</kbd>`).join(' ')}</span><span>${esc(d)}</span></div>`).join('')}`).join('')}</div></div>`;
  ov.addEventListener('click',e=>{if(e.target===ov||e.target.closest('.nt-atalhos-t button'))ntAtalhosFecha()});
  ov._ant=ant;document.body.appendChild(ov);ov.querySelector('.nt-atalhos-t button').focus();
}
function ntAtalhosFecha(){const ov=document.getElementById('nt_atalhos');if(!ov)return;ov.remove();try{ov._ant?.focus?.()}catch(e){}}
document.addEventListener('keydown',e=>{
  if(tela!=='notas'&&!NP)return;
  if((e.ctrlKey||e.metaKey)&&(e.key==='/'||e.code==='Slash'||e.code==='IntlRo')){e.preventDefault();e.stopPropagation();ntAtalhosAberto()?ntAtalhosFecha():ntAtalhosAbre();return}
  if(e.key!=='Escape')return;
  if(ntAtalhosAberto()){e.preventDefault();e.stopPropagation();ntAtalhosFecha();return}
  const modal=[...document.querySelectorAll('.nt-modal')].pop();if(modal){e.preventDefault();e.stopPropagation();ntModalFecha(modal);return}   // histórico, frases e busca global: Esc fecha a de cima
  if(document.querySelector('.nt-lemb-pop'))return;
  const bs=[NP,NT].find(x=>x?.ed&&x.el?.isConnected&&ntBselPos(x.ed.state).length);if(bs){e.preventDefault();e.stopPropagation();bs.ed.view.dispatch(ntBselMeta(bs.ed.state.tr,[]));return}   // Esc limpa a seleção de blocos
  const bb=[NP,NT].find(x=>x?.buscaEl);if(bb){e.preventDefault();e.stopPropagation();ntBuscaFecha(bb);return}   // Esc fecha a busca da página
  if(e.target.closest?.('.nt-link'))return;   // o campo do link trata o próprio Esc
  if(document.querySelector('.nt-slash'))return;   // o menu "/" trata o Esc
  const pal=document.querySelector('.nt-paleta:not([hidden])');if(pal){e.preventDefault();e.stopPropagation();pal.hidden=true;return}
  if(NTD){e.stopPropagation();ntArrastoFim(false);return}
  if(NP){e.preventDefault();e.stopPropagation();ntPainelFecha()}
},true);
// Clicar fora fecha o menu da alça e a paleta de cores.
document.addEventListener('pointerdown',e=>{
  for(const c of [NT,NP]){
    if(c?.menuEl&&!c.menuEl.hidden&&!e.target.closest?.('.nt-menu-bloco,.nt-alca'))c.menuEl.hidden=true;
    const pal=c?.barra?.querySelector('.nt-paleta');if(pal&&!pal.hidden&&!e.target.closest?.('.nt-paleta,[data-m="cor"]'))pal.hidden=true;
  }
});
if(SM.d){if(!ntBaseLer()&&!ntTemPendentes())ntBaseSalva(SM.d.notasDoc?.blocos);else if(!pgBaseLer()&&!ntTemPendentes())pgBaseSalva(ntPaginas());if(!frBaseLer()&&!ntTemPendentes())frBaseSalva(SM.d.notasFrases||[]);ntAplica(SM.d,ntPendentes());smGuardaCache()}
window.addEventListener('online',()=>{ntSync().then(()=>smPuxar())});
window.addEventListener('storage',e=>{if(e.key===NT_PEND){if(SM.d){ntAntes();ntAplica(SM.d,ntPendentes());ntSincroniza()}smRender()}});
window.addEventListener('beforeunload',()=>{if(NT.sujo)ntSalvaDoc();if(NP?.sujo)pgSalvaDoc();if(NP)pgTituloSalva()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(NT.sujo)ntSalvaDoc();if(NP?.sujo)pgSalvaDoc();if(NP)pgTituloSalva()}});


// Notas 1.42 (depois de notas.js, mesmo escopo): busca na página (Ctrl+F), seleção de blocos por retângulo, lembretes "@", histórico de versões
// pelo GitHub e frases-padrão. Tudo que é só de tela (retângulo, busca, janelas) fica fora do documento, do histórico do editor e do sync.

// ===== Janela simples (histórico, frases, busca global): Esc ou clique fora fecha, foco volta para quem estava =====
function ntModal(classe,html){
  const ov=document.createElement('div'),ant=document.activeElement;ov.className='nt-modal '+classe;ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');
  ov.innerHTML=`<div class="nt-modal-c">${html}</div>`;ov._ant=ant;
  ov.addEventListener('mousedown',e=>{if(e.target===ov)ntModalFecha(ov)});
  ov.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();ntModalFecha(ov)}});
  document.body.appendChild(ov);return ov;
}
function ntModalFecha(ov){if(!ov||!ov.isConnected)return;ov.remove();ov.aoFechar?.();try{ov._ant?.focus?.()}catch(e){}}

// ===== Ctrl+F nas Notas: busca própria. Destaque por Decoration.inline, contador n/total, Enter/Shift+Enter, ocorrência em toggle fechado o abre =====
const NT_BUSCA_PK=()=>NT.buscaPK||(NT.buscaPK=new TT.pm.state.PluginKey('ntBusca'));
// Sem acento e minúsculas, sempre com o MESMO comprimento do texto (cada caractere vira um só): os índices valem no original.
const ntNorma=s=>String(s).split('').map(ch=>{const r=ch.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();return r.length===1?r:ch.toLowerCase().length===1?ch.toLowerCase():ch}).join('');
// Ocorrências de q no documento: [{from,to}] (posições do ProseMirror), por bloco de texto; átomos inline contam como 1 caractere.
function ntAchaTexto(doc,q){
  const nq=ntNorma(q),out=[];if(!nq)return out;
  doc.descendants((n,pos)=>{
    if(!n.isTextblock)return;
    let txt='';const mapa=[];
    n.forEach((ch,off)=>{const base=pos+1+off;if(ch.isText){for(let i=0;i<ch.text.length;i++)mapa.push(base+i);txt+=ch.text}else{mapa.push(base);txt+='￼'}});
    const h=ntNorma(txt);let i=h.indexOf(nq);
    while(i>=0){out.push({from:mapa[i],to:mapa[i+nq.length-1]+1});i=h.indexOf(nq,i+nq.length)}
    return false;
  });
  return out;
}
function ntBuscaExt(){
  return TT.Extension.create({name:'buscaNotas',addProseMirrorPlugins(){
    const {Plugin}=TT.pm.state,{Decoration,DecorationSet}=TT.pm.view,K=NT_BUSCA_PK();
    return [new Plugin({key:K,
      state:{init:()=>({q:'',sel:0,ms:[],deco:DecorationSet.empty}),apply(tr,v,_a,nw){
        const m=tr.getMeta(K);if(!m&&!tr.docChanged)return v;
        const q=m&&m.q!=null?m.q:v.q;let sel=m&&m.sel!=null?m.sel:v.sel;
        if(!q)return v.q?{q:'',sel:0,ms:[],deco:DecorationSet.empty}:v;
        const ms=ntAchaTexto(nw.doc,q);if(sel>=ms.length||sel<0)sel=0;
        return {q,sel,ms,deco:DecorationSet.create(nw.doc,ms.map((x,i)=>Decoration.inline(x.from,x.to,{class:i===sel?'nt-busca-hit atual':'nt-busca-hit'})))};
      }},
      props:{decorations:s=>K.getState(s).deco}})];
  }});
}
const ntBuscaEstado=c=>c.ed?NT_BUSCA_PK().getState(c.ed.state):null;
function ntBuscaSet(c,q,sel){c.ed.view.dispatch(c.ed.state.tr.setMeta(NT_BUSCA_PK(),{q,sel}))}
function ntBuscaPinta(c){
  const e=ntBuscaEstado(c),n=c.buscaEl?.querySelector('.nt-busca-n');if(!e||!n)return;
  n.textContent=e.q?(e.ms.length?`${e.sel+1}/${e.ms.length}`:'0/0'):'';
}
// Abre os toggles fechados em volta da ocorrência atual (só estado de tela) e rola até ela.
function ntBuscaMostra(c){
  const e=ntBuscaEstado(c),m=e?.ms[e.sel];if(!m)return;
  const $=c.ed.state.doc.resolve(m.from);
  for(let d=$.depth;d>=1;d--)if($.node(d).type.name==='details'){
    const dom=c.ed.view.nodeDOM($.before(d));
    if(dom instanceof Element&&!dom.classList.contains('is-open')){ntPoeAberto(dom,true);ntAbertoSalva($.node(d).attrs.id,true)}
  }
  const el=c.el.querySelector('.nt-busca-hit.atual');if(el)el.scrollIntoView({block:'center',inline:'nearest'});
}
function ntBuscaVai(c,dir){
  const e=ntBuscaEstado(c);if(!e||!e.ms.length)return;
  ntBuscaSet(c,e.q,(e.sel+dir+e.ms.length)%e.ms.length);ntBuscaPinta(c);ntBuscaMostra(c);
}
function ntBuscaAbre(c){
  if(!c?.ed)return;
  if(!c.buscaEl){
    const b=document.createElement('div');b.className='nt-busca';b.setAttribute('role','search');
    b.innerHTML=`<div class="nt-busca-c"><input type="text" class="nt-busca-in" placeholder="Buscar na página" aria-label="Buscar nas notas" autocomplete="off" spellcheck="false"><span class="nt-busca-n" aria-live="polite"></span><button type="button" data-b="-1" title="Anterior (Shift+Enter)" aria-label="Ocorrência anterior">↑</button><button type="button" data-b="1" title="Próxima (Enter)" aria-label="Próxima ocorrência">↓</button><button type="button" data-b="x" title="Fechar (Esc)" aria-label="Fechar busca">✕</button></div>`;
    const i=b.querySelector('input');
    i.addEventListener('input',()=>{ntBuscaSet(c,i.value,0);ntBuscaPinta(c);ntBuscaMostra(c)});
    i.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();ntBuscaVai(c,e.shiftKey?-1:1)}});
    b.addEventListener('click',e=>{const bt=e.target.closest('[data-b]');if(!bt)return;if(bt.dataset.b==='x')ntBuscaFecha(c);else ntBuscaVai(c,+bt.dataset.b);if(bt.dataset.b!=='x')i.focus()});
    c.el.insertBefore(b,c.el.firstChild);c.buscaEl=b;
  }
  const i=c.buscaEl.querySelector('input'),s=c.ed.state.selection;
  if(!s.empty&&s.to-s.from<=80){const t=c.ed.state.doc.textBetween(s.from,s.to,' ');if(t.trim()){i.value=t;ntBuscaSet(c,t,0);ntBuscaPinta(c);ntBuscaMostra(c)}}
  i.focus();i.select();
}
function ntBuscaFecha(c){
  if(!c?.buscaEl)return;
  const b=c.buscaEl;c.buscaEl=null;b.remove();
  if(c.ed){try{ntBuscaSet(c,'',0);c.ed.commands.focus(null,{scrollIntoView:false})}catch(e){}}
}
document.addEventListener('keydown',e=>{
  if(!((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&String(e.key).toLowerCase()==='f'))return;
  const c=NP?.ed?NP:(tela==='notas'&&NT.ed&&NT.el?.isConnected?NT:null);if(!c)return;   // fora da aba Notas o Ctrl+F continua do navegador
  e.preventDefault();e.stopPropagation();ntBuscaAbre(c);
},true);

// ===== Seleção de blocos arrastando por fora do texto (como no Notion) =====
// Plugin com estado próprio (posições dos blocos de UM nível: o topo ou o conteúdo de um toggle) + Decoration.node `nt-bsel`. Não usa NodeSelection.
// Editar o documento limpa a seleção (a menos que a própria ação a refaça). Só mouse: no toque não há retângulo (não atrapalha a rolagem).
const NT_BSEL_PK=()=>NT.bselPK||(NT.bselPK=new TT.pm.state.PluginKey('ntBsel'));
const ntBselPos=s=>NT_BSEL_PK().getState(s).pos;
const ntBselMeta=(tr,pos)=>tr.setMeta(NT_BSEL_PK(),{pos});
const ntBselIntervalos=(doc,pos)=>pos.slice().sort((a,b)=>a-b).map(p=>{const node=doc.nodeAt(p);return {from:p,to:p+node.nodeSize,node}});
function ntBselExt(c){
  return TT.Extension.create({name:'selBlocos',addProseMirrorPlugins(){
    const {Plugin}=TT.pm.state,{Decoration,DecorationSet}=TT.pm.view,K=NT_BSEL_PK();
    const limpa=v=>{if(K.getState(v.state).pos.length)v.dispatch(ntBselMeta(v.state.tr,[]))};
    return [new Plugin({key:K,
      state:{init:()=>({pos:[]}),apply(tr,v){const m=tr.getMeta(K);if(m)return {pos:m.pos};if(!tr.docChanged||!v.pos.length)return v;return tr.getMeta('appendedTransaction')?{pos:v.pos.map(p=>tr.mapping.map(p))}:{pos:[]}}},   // (ids e nó final entram como transações anexadas: só acompanham)
      props:{
        decorations(s){const p=K.getState(s).pos;return p.length?DecorationSet.create(s.doc,p.map(x=>Decoration.node(x,x+s.doc.nodeAt(x).nodeSize,{class:'nt-bsel'}))):null},
        handleKeyDown(v,e){
          const p=K.getState(v.state).pos;if(!p.length)return false;
          if(e.key==='Escape'){limpa(v);return true}
          if(e.key==='Delete'||e.key==='Backspace'){ntBselApaga(v,p);return true}
          if(e.key==='Tab'){ntBselTab(v,p,e.shiftKey);return true}
          if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key.length===1)limpa(v);   // digitar volta ao texto normal
          return false;
        },
        handleDOMEvents:{
          copy(v,e){const p=K.getState(v.state).pos;if(!p.length)return false;ntBselCopia(v,p,e);return true},
          cut(v,e){const p=K.getState(v.state).pos;if(!p.length)return false;ntBselCopia(v,p,e);ntBselApaga(v,p);return true},
          mousedown(v){limpa(v);return false},
        },
        handleDrop(v,e,_s,moved){
          if(!c.grupoArrasto||!moved)return false;
          const g=c.grupoArrasto;c.grupoArrasto=null;ntBselSolta(v,e,g);return true;
        },
      }})];
  }});
}
function ntBselCopia(v,pos,e){
  const {Slice,Fragment}=TT.pm.model,nodes=ntBselIntervalos(v.state.doc,pos).map(r=>r.node);
  const {dom,text}=v.serializeForClipboard(new Slice(Fragment.from(nodes),0,0));
  e.clipboardData.setData('text/html',dom.innerHTML);e.clipboardData.setData('text/plain',text);e.preventDefault();
}
// Apaga o grupo numa transação só; se o pai ficaria sem filhos, sobra um parágrafo vazio.
function ntBselApaga(v,pos){
  const {state}=v,rs=ntBselIntervalos(state.doc,pos),tr=state.tr,pai=state.doc.resolve(rs[0].from).parent;
  if(rs.length===pai.childCount)tr.replaceWith(rs[0].from,rs[rs.length-1].to,state.schema.nodes.paragraph.create());
  else for(const r of rs.slice().reverse())tr.delete(r.from,r.to);
  try{tr.setSelection(TT.pm.state.Selection.near(tr.doc.resolve(Math.min(rs[0].from,tr.doc.content.size)),-1))}catch(e){}
  v.dispatch(ntBselMeta(tr,[]).scrollIntoView());
}
const ntBselPosicoes=(ini,nodes)=>{let p=ini;return nodes.map(n=>{const x=p;p+=n.nodeSize;return x})};
// Tab: o grupo entra no toggle logo acima (vira os últimos filhos dele). Shift+Tab: sai do toggle em que está (vira irmão logo depois dele).
function ntBselTab(v,pos,sai){
  const {state}=v,doc=state.doc,rs=ntBselIntervalos(doc,pos),$=doc.resolve(rs[0].from),pai=$.parent,idx=$.index(),tr=state.tr;
  const ini=rs[0].from,fim=rs[rs.length-1].to,nodes=rs.map(r=>r.node);let novo,abre=null;
  if(!sai){
    const ant=idx>0?pai.child(idx-1):null;if(!ant||ant.type.name!=='details')return;
    const antPos=ini-ant.nodeSize,cont=ant.lastChild,fimC=antPos+ant.nodeSize-2,vazio=cont.childCount===1&&cont.firstChild.type.name==='paragraph'&&!cont.firstChild.content.size;
    tr.delete(ini,fim);   // (depois do ponto de entrada: não o desloca)
    novo=vazio?fimC-cont.firstChild.nodeSize:fimC;
    if(vazio)tr.replaceWith(novo,fimC,nodes);else tr.insert(novo,nodes);
    ntAbertoSalva(ant.attrs.id,true);abre=antPos;
  }else{
    if(pai.type.name!=='detailsContent')return;
    const d1=$.depth-1,detPos=$.before(d1),destino=detPos+$.node(d1).nodeSize,todos=rs.length===pai.childCount;
    tr.insert(destino,nodes);
    if(todos)tr.replaceWith(ini,fim,state.schema.nodes.paragraph.create());else tr.delete(ini,fim);
    novo=destino-(fim-ini)+(todos?2:0);
  }
  try{tr.setSelection(TT.pm.state.Selection.near(tr.doc.resolve(novo+1)))}catch(e){}
  v.dispatch(ntBselMeta(tr,ntBselPosicoes(novo,nodes)).scrollIntoView());
  if(abre!=null){const dom=v.nodeDOM(abre);if(dom instanceof Element)ntPoeAberto(dom,true)}
}
// Soltar o grupo arrastado pela alça: vai para a fronteira entre blocos do nível onde caiu (topo ou conteúdo de toggle).
function ntBselSolta(v,e,pos){
  const r=v.posAtCoords({left:e.clientX,top:e.clientY});if(!r)return;
  const {state}=v,doc=state.doc,rs=ntBselIntervalos(doc,pos),$=doc.resolve(r.pos);
  let d=$.depth;while(d>0&&$.node(d).type.name!=='detailsContent')d--;
  const cont=$.node(d),inicio=d?$.start(d):0;let dest=inicio+cont.content.size,achou=false;
  cont.forEach((n,off)=>{
    if(achou)return;const dom=v.nodeDOM(inicio+off);if(!(dom instanceof Element))return;
    const b=dom.getBoundingClientRect();if(e.clientY<b.top+b.height/2){dest=inicio+off;achou=true}
  });
  const ini=rs[0].from,fim=rs[rs.length-1].to;if(dest>=ini&&dest<=fim)return;   // soltou em cima de si mesmo
  for(const x of rs)if(dest>x.from&&dest<x.to)return;
  const tr=state.tr,nodes=rs.map(x=>x.node);
  for(const x of rs.slice().reverse())tr.delete(x.from,x.to);
  const at=tr.mapping.map(dest);tr.insert(at,nodes);
  try{tr.setSelection(TT.pm.state.Selection.near(tr.doc.resolve(at+1)))}catch(x){}
  v.dispatch(ntBselMeta(tr,ntBselPosicoes(at,nodes)).scrollIntoView());
}
// Retângulo de arrasto. mousedown em margem/fundo (fora de qualquer bloco de texto) começa; os blocos do nível onde começou que ele cruza ficam selecionados.
let ntUltPonteiro='mouse',NTR=null;
document.addEventListener('pointerdown',e=>{ntUltPonteiro=e.pointerType},true);
const NT_TEXTO_SEL='p,h1,h2,h3,li,summary,blockquote,hr,img,a,button,input,select,textarea,label,[data-type="detailsSummary"],.nt-plink,.nt-callout-c,.nt-lemb,.nt-alca,.nt-menu-bloco,.nt-barra,.nt-slash,.nt-pop,.nt-busca,.nt-bolha,.nt-modal,.nt-topo,.nt-lat,.nt-pan-topo,.nt-pan-titulo,.nt-atalhos,.nt-seta';
function ntBselCtx(t){
  if(!(t instanceof Element))return null;
  if(NP?.ed)return t.closest('#nt_pan')?NP:null;
  if(tela==='notas'&&NT.ed&&NT.el?.isConnected&&t.closest('main'))return NT;
  return null;
}
document.addEventListener('mousedown',e=>{
  if(e.button!==0||ntUltPonteiro!=='mouse'||NTR)return;
  const t=e.target,c=ntBselCtx(t);if(!c||t.closest(NT_TEXTO_SEL))return;
  const pm=c.el.querySelector('.ProseMirror');if(!pm||t.closest('.nt-ed')&&!pm.contains(t)&&t!==pm&&t.closest('.nt-ed')!==c.el)return;
  const v=c.ed.view,det=t.closest('[data-type="detailsContent"]');   // nível: conteúdo do toggle onde começou, ou o topo
  let cont;
  if(det&&pm.contains(det)){const ini=v.posAtDOM(det,0);cont={ini,node:v.state.doc.resolve(ini).parent}}else cont={ini:0,node:v.state.doc};
  e.preventDefault();
  const sc=()=>c===NP?c.el.closest('.nt-pan-corpo'):null,off=()=>({x:sc()?sc().scrollLeft:scrollX,y:sc()?sc().scrollTop:scrollY});
  NTR={c,cont,x0:e.clientX+off().x,y0:e.clientY+off().y,x:e.clientX,y:e.clientY,ativo:false,box:null,raf:0,pos:null,off,sc};
},true);
document.addEventListener('mousemove',e=>{
  const r=NTR;if(!r)return;r.x=e.clientX;r.y=e.clientY;
  if(!r.ativo){const o=r.off();if(Math.hypot(e.clientX-(r.x0-o.x),e.clientY-(r.y0-o.y))<4)return;
    r.ativo=true;r.box=document.createElement('div');r.box.className='nt-rubber';document.body.appendChild(r.box);try{getSelection().removeAllRanges()}catch(x){}}
  e.preventDefault();ntRubberQuadro();
},true);
function ntRubberQuadro(){
  const r=NTR;if(!r||r.raf)return;
  r.raf=requestAnimationFrame(()=>{
    r.raf=0;if(NTR!==r||!r.box)return;
    const s=r.sc(),o=r.off();
    if(r.y<50)(s||window).scrollBy(0,-14);else if(r.y>innerHeight-50)(s||window).scrollBy(0,14);   // rolagem automática perto das bordas
    const o2=r.off(),x0=r.x0-o2.x,y0=r.y0-o2.y,L=Math.min(x0,r.x),T=Math.min(y0,r.y),R=Math.max(x0,r.x),B=Math.max(y0,r.y);
    Object.assign(r.box.style,{left:L+'px',top:T+'px',width:(R-L)+'px',height:(B-T)+'px'});
    const v=r.c.ed.view,pos=[];
    r.cont.node.forEach((n,off)=>{   // getBoundingClientRect só dos filhos do nível
      const p=r.cont.ini+off,dom=v.nodeDOM(p);if(!(dom instanceof Element))return;
      const b=dom.getBoundingClientRect();if(b.bottom>=T&&b.top<=B&&b.right>=L&&b.left<=R)pos.push(p);
    });
    if(JSON.stringify(pos)!==JSON.stringify(r.pos)){r.pos=pos;v.dispatch(ntBselMeta(v.state.tr,pos))}
    if(r.y<50||r.y>innerHeight-50)ntRubberQuadro();
  });
}
document.addEventListener('mouseup',()=>{
  const r=NTR;if(!r)return;NTR=null;cancelAnimationFrame(r.raf);r.box?.remove();
  if(r.c.ed){if(!r.ativo)r.c.ed.view.dispatch(ntBselMeta(r.c.ed.view.state.tr,[]));r.c.ed.view.focus()}   // foco no editor: Delete, Ctrl+C e Tab chegam ao plugin
},true);
// Alça ⋮⋮ de um bloco do grupo arrasta o grupo inteiro (chamado pelo dragstart da alça).
function ntBselArrasta(c,e,bloco){
  const p=ntBselPos(c.ed.state);if(!p.length||!bloco||!p.includes(bloco.pos))return false;
  const {Slice,Fragment}=TT.pm.model,v=c.ed.view,nodes=ntBselIntervalos(v.state.doc,p).map(r=>r.node);
  c.grupoArrasto=p.slice();v.dragging={slice:new Slice(Fragment.from(nodes),0,0),move:true};
  const dom=v.nodeDOM(p[0]);if(dom instanceof Element)e.dataTransfer.setDragImage(dom,0,0);
  e.dataTransfer.effectAllowed='copyMove';e.dataTransfer.setData('text/plain','');return true;
}

// ===== @lembrete: "@" abre sugestões; o nó inline dataLembrete {iso,hora,tarefaId} é um chip e vira uma tarefa do plano (mesmo id do nó) =====
const NT_DIAS_SEM=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
const ntLembRot=a=>{
  const h=typeof smHoje==='function'?smHoje():'',am=h?smMais(h,1):'';
  const d=!a.iso?'':a.iso===h?'Hoje':a.iso===am?'Amanhã':a.iso.slice(8,10)+'/'+a.iso.slice(5,7);
  return '🔔 '+d+(a.hora?' '+a.hora:'');
};
// Itens do menu para o que foi digitado depois do "@": [rótulo, subtítulo, iso, hora]. Puro (hoje = AAAA-MM-DD).
function ntLembreteItens(query,hoje){
  let q=ntSemAcento(query).trim(),hora=null;
  const mh=/(?:^|\s)(\d{1,2})(?::(\d{2})|h(\d{2})?)\s*$/.exec(q);
  if(mh){const h=+mh[1],m=+(mh[2]||mh[3]||0);if(h<24&&m<60){hora=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');q=q.slice(0,mh.index).trim()}}
  const com=(rot,sub,iso)=>[rot+(hora?' '+hora:''),sub,iso,hora];
  const md=/^(\d{1,2})\/(\d{1,2})$/.exec(q);
  if(md){
    const dia=+md[1],mes=+md[2];let ano=+hoje.slice(0,4);
    const iso=a=>String(a).padStart(4,'0')+'-'+String(mes).padStart(2,'0')+'-'+String(dia).padStart(2,'0');
    const valido=a=>{const x=new Date(a,mes-1,dia);return x.getMonth()===mes-1&&x.getDate()===dia};
    if(mes>=1&&mes<=12&&dia>=1&&valido(ano)){if(iso(ano)<hoje&&valido(ano+1))ano++;return [com(String(dia).padStart(2,'0')+'/'+String(mes).padStart(2,'0'),'Data',iso(ano))]}
    return [];
  }
  const out=[];
  if(!q||'hoje'.startsWith(q))out.push(com('Hoje','Hoje',hoje));
  if(!q||'amanha'.startsWith(q))out.push(com('Amanhã','Amanhã',smMais(hoje,1)));
  for(let i=1;i<=7;i++){
    const iso=smMais(hoje,i),nome=NT_DIAS_SEM[smDt(iso).getDay()],n=ntSemAcento(nome);
    if(!q||n.startsWith(q)||(q.length>1&&n.includes(q)))out.push(com(nome[0].toUpperCase()+nome.slice(1),iso.slice(8,10)+'/'+iso.slice(5,7),iso));
  }
  return out;
}
function ntLembrete(){
  const atr=(k,def=null)=>({default:def,parseHTML:el=>el.getAttribute('data-'+k),renderHTML:a=>a[k]?{['data-'+k]:a[k]}:{}});
  return TT.Node.create({name:'dataLembrete',group:'inline',inline:true,atom:true,selectable:true,
    addAttributes(){return {iso:atr('iso'),hora:atr('hora'),tarefaId:atr('tarefaId')}},
    parseHTML(){return [{tag:'span[data-type="data-lembrete"]'}]},
    renderHTML({node,HTMLAttributes}){return ['span',TT.mergeAttributes(HTMLAttributes,{'data-type':'data-lembrete',class:'nt-lemb',role:'button',title:'Mudar a data do lembrete'}),ntLembRot(node.attrs)]},
  });
}
// Chips {tarefaId:'iso|hora'} de uma lista de blocos (JSON do ProseMirror).
function ntLembDe(blocos){
  const m={},v=n=>{if(!n||typeof n!=='object')return;if(n.type==='dataLembrete'&&n.attrs?.tarefaId)m[n.attrs.tarefaId]=(n.attrs.iso||'')+'|'+(n.attrs.hora||'');(n.content||[]).forEach(v)};
  (blocos||[]).forEach(b=>v(b.conteudo));return m;
}
// Ao salvar o documento: chip cuja data/hora mudou desde a versão anterior (inclusive por Ctrl+Z/Ctrl+Y) leva a tarefa junto. Só tarefa que ainda existe; chip sem mudança não mexe (outro aparelho pode ter mudado a tarefa).
function ntLembSincroniza(antes,depois){
  if(!SM.d)return;const a=ntLembDe(antes),d=ntLembDe(depois);
  for(const [id,v] of Object.entries(d)){
    if(a[id]===undefined||a[id]===v)continue;
    const [iso,hora]=v.split('|'),t=SM.d.tarefas.find(x=>x.id===id);
    if(t&&((t.dia!==iso)||((t.hora||'')!==hora)))ntLembTarefa({tarefaId:id,iso,hora:hora||null},'');
  }
}
// Cria ou atualiza a tarefa do lembrete (idempotente: smMudar reaplica no 409). Apagar o chip nunca chama isto.
function ntLembTarefa(a,texto){
  smMudar(d=>{
    let t=d.tarefas.find(x=>x.id===a.tarefaId);
    if(!t){t={id:a.tarefaId,dia:a.iso,texto:texto||'Lembrete',area:'tarefas',feito:false,ordem:100+d.tarefas.filter(x=>x.dia===a.iso).length};d.tarefas.push(t)}
    t.dia=a.iso;
    if(a.hora){t.hora=a.hora;t.lembrete=0}   // mesmo campo "Lembrete: na hora" da aba Tarefas (o app Android lê daí)
    else{delete t.hora;if(t.lembrete===0)t.lembrete=null}
  },'lembrete da nota');
}
function ntLembretePlugin(c){
  return ntSugestao(c,{nome:'lembreteNotas',char:'@',allowSpaces:true,semVazio:true,
    itens:q=>ntLembreteItens(q,smHoje()),
    comando:(editor,range,it)=>{
      const a={iso:it[2],hora:it[3],tarefaId:smId()};
      editor.chain().focus().deleteRange(range).insertContent([{type:'dataLembrete',attrs:a},{type:'text',text:' '}]).run();
      ntLembTarefa(a,editor.state.selection.$from.parent.textContent.trim());   // texto = a linha da nota (sem o chip)
    }});
}
function ntLembreteEdita(c,dom,pos){
  const no=c.ed.state.doc.nodeAt(pos);if(no?.type.name!=='dataLembrete')return;
  document.querySelector('.nt-lemb-pop')?.remove();
  const pop=document.createElement('div');pop.className='nt-pop nt-lemb-pop';
  pop.innerHTML=`<input type="date" aria-label="Data do lembrete" value="${esc(no.attrs.iso||'')}"><input type="time" aria-label="Hora (opcional)" value="${esc(no.attrs.hora||'')}"><button type="button" data-l="ok">OK</button><button type="button" data-l="x" aria-label="Cancelar">✕</button>`;
  document.body.appendChild(pop);const r=dom.getBoundingClientRect();
  pop.style.top=Math.min(r.bottom+6,innerHeight-pop.offsetHeight-8)+'px';pop.style.left=Math.max(8,Math.min(r.left,innerWidth-pop.offsetWidth-8))+'px';
  const fecha=()=>pop.remove(),[di,hi]=pop.querySelectorAll('input');
  pop.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();fecha();c.ed.commands.focus()}if(e.key==='Enter')pop.querySelector('[data-l="ok"]').click()});
  pop.addEventListener('click',e=>{
    const b=e.target.closest('[data-l]');if(!b)return;
    if(b.dataset.l==='ok'&&/^\d{4}-\d{2}-\d{2}$/.test(di.value)){
      const a={...no.attrs,iso:di.value,hora:hi.value||null};
      c.ed.view.dispatch(c.ed.state.tr.setNodeMarkup(pos,undefined,a));
      ntLembTarefa(a,c.ed.state.doc.resolve(pos).parent.textContent.trim());
    }
    fecha();c.ed.commands.focus();
  });
  di.focus();
}
document.addEventListener('pointerdown',e=>{if(!e.target.closest?.('.nt-lemb-pop,.nt-lemb'))document.querySelector('.nt-lemb-pop')?.remove()});

// ===== Histórico de versões: o plano já é versionado no GitHub (commits do arquivo). Só leitura; restaurar = NOVA edição =====
const NT_HIST_POR=30;
const ntHistApi=(p)=>BCBR.api(`/repos/${BCBR.REPO}/${p}`);
async function ntHistCommits(pagina){return ntHistApi(`commits?path=${encodeURIComponent(SM_ARQ)}&per_page=${NT_HIST_POR}&page=${pagina}`)}
async function ntHistVersao(sha){const r=await BCBR.api(`/repos/${BCBR.REPO}/contents/${SM_ARQ}?ref=${encodeURIComponent(sha)}`,{accept:'raw'});return JSON.parse(await r.text())}
// Blocos da versão `d` (documento principal) ou da página `id`.
const ntHistBlocos=(d,pg)=>pg?(d?.notasPaginas?.paginas||[]).find(p=>p.id===pg)?.doc?.blocos||[]:d?.notasDoc?.blocos||[];
function ntHistAbre(c){
  if(navigator.onLine===false){toast('O histórico precisa de internet.');return}
  const ov=ntModal('nt-hist',`<div class="nt-modal-t"><b>Histórico das notas</b><button type="button" class="nt-x" aria-label="Fechar">✕</button></div>
    <div class="nt-hist-g"><div class="nt-hist-l"><div class="nt-hist-lista"></div><button type="button" class="b s nt-hist-mais" hidden>Carregar mais</button></div>
    <div class="nt-hist-v"><div class="nt-hist-bar"><select class="nt-hist-pg" aria-label="O que ver" disabled></select><button type="button" class="b s" data-r="bloco" disabled>Restaurar este bloco</button><button type="button" class="b" data-r="pagina" disabled>Restaurar esta página</button></div>
    <p class="mut nt-hist-msg">Escolha uma versão à esquerda. Clique num bloco para escolher só ele.</p><div class="nt-hist-prev"></div></div></div>`);
  const $=s=>ov.querySelector(s),lista=$('.nt-hist-lista'),msg=$('.nt-hist-msg'),mais=$('.nt-hist-mais'),sel=$('.nt-hist-pg'),prev=$('.nt-hist-prev');
  let pagina=0,versao=null,bloco=null,ed=null,alvoPg=c.pagina||'';
  const fim=()=>{try{ed?.destroy()}catch(e){}ed=null};ov.aoFechar=fim;
  ov.querySelector('.nt-x').onclick=()=>ntModalFecha(ov);
  const mostra=()=>{
    fim();prev.innerHTML='';bloco=null;$('[data-r="bloco"]').disabled=true;
    const bl=ntHistBlocos(versao,alvoPg);
    $('[data-r="pagina"]').disabled=!(alvoPg?(versao.notasPaginas?.paginas||[]).some(p=>p.id===alvoPg):true);
    if(!bl.length){msg.textContent='Nada nesta versão.';return}
    msg.textContent='Versão só para leitura. Clique num bloco para escolher só ele.';
    const el=document.createElement('div');el.className='nt-ed nt-hist-ed';prev.appendChild(el);
    ed=new TT.Editor({element:el,extensions:ntExtensoes({pagina:!!alvoPg,el}),content:ntDocumento(bl),editable:false});
    el.querySelectorAll('[data-type="details"]').forEach(d=>d.classList.add('is-open'));
    el.addEventListener('click',e=>{
      const pm=el.querySelector('.ProseMirror'),b=e.target.closest('.ProseMirror>*'),i=b&&pm?[...pm.children].indexOf(b):-1;
      pm?.querySelectorAll('.nt-hist-sel').forEach(x=>x.classList.remove('nt-hist-sel'));
      if(i>=0&&i<bl.length){bloco=bl[i];b.classList.add('nt-hist-sel');$('[data-r="bloco"]').disabled=false}
    });
  };
  const carrega=async lst=>{
    versao=null;msg.textContent='Baixando a versão…';
    try{
      versao=await ntHistVersao(lst.dataset.sha);
      const ps=versao.notasPaginas?.paginas||[];
      sel.innerHTML=`<option value="">Notas (página principal)</option>`+ps.map(p=>`<option value="${esc(p.id)}">📄 ${esc(p.titulo||'Sem título')}</option>`).join('');
      if(alvoPg&&!ps.some(p=>p.id===alvoPg))alvoPg='';
      sel.value=alvoPg;sel.disabled=false;mostra();
    }catch(e){msg.textContent=e?.status?`Não consegui baixar esta versão (GitHub ${e.status}).`:'Não consegui baixar esta versão (precisa de conexão).'}
  };
  sel.onchange=()=>{alvoPg=sel.value;mostra()};
  const lote=async()=>{
    mais.hidden=true;
    try{
      const cs=await ntHistCommits(++pagina);
      lista.insertAdjacentHTML('beforeend',cs.map(x=>`<button type="button" class="nt-hist-it" data-sha="${esc(x.sha)}"><b>${esc(new Date(x.commit?.author?.date||x.commit?.committer?.date||0).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}))}</b><small>${esc(String(x.commit?.message||'').split('\n')[0])}</small></button>`).join(''));
      mais.hidden=cs.length<NT_HIST_POR;
      if(pagina===1&&!cs.length)lista.innerHTML='<p class="mut">Nenhuma versão encontrada.</p>';
    }catch(e){msg.textContent=navigator.onLine===false||!e?.status?'O histórico precisa de internet.':`Não consegui listar as versões (GitHub ${e.status}).`}
  };
  mais.onclick=lote;
  lista.addEventListener('click',e=>{const b=e.target.closest('.nt-hist-it');if(!b)return;lista.querySelectorAll('.on').forEach(x=>x.classList.remove('on'));b.classList.add('on');carrega(b)});
  ov.querySelector('.nt-hist-bar').addEventListener('click',e=>{
    const b=e.target.closest('[data-r]');if(!b||b.disabled||!versao)return;
    if(ntHistRestaura(c,versao,alvoPg,b.dataset.r==='bloco'?bloco:null))ntModalFecha(ov);
  });
  lote();
}
// Aplica a versão como edição NOVA no editor aberto (ntAplicaNoEditor local: entra no Ctrl+Z e é salva pela fila normal); sem editor aberto, pela fila das páginas (pgMuda).
function ntHistRestaura(c,versao,pg,bloco){
  const agora=ntAgora(),vb=ntHistBlocos(versao,pg).map(b=>({...b,atualizado:agora}));
  const ctx=pg?(NP?.ed&&NP.pagina===pg?NP:null):(NT.ed?NT:null);
  if(bloco){
    const b={...bloco,atualizado:agora};
    if(ctx){
      const atual=ntBlocos(ctx.ed.getJSON(),ctx.shown),i=atual.findIndex(x=>x.id===b.id);
      if(i>=0)atual[i]=b;
      else{const j=vb.findIndex(x=>x.id===b.id),pre=j>0?atual.findIndex(x=>x.id===vb[j-1].id):-1;atual.splice(pre>=0?pre+1:atual.length,0,b)}   // apagado depois: volta logo depois do vizinho que tinha
      ntAplicaNoEditor(ctx,atual,true);
    }else if(pg){
      pgMuda(l=>{const x=l.find(y=>y.id===pg);if(!x)return;const bl=x.doc?.blocos||[],i=bl.findIndex(y=>y.id===b.id);if(i>=0)bl[i]=b;else bl.push(b);x.doc={v:1,blocos:bl};x.atualizado=agora});
    }else return false;
    toast('Bloco restaurado como uma edição nova.');return true;
  }
  if(ctx){
    ntAplicaNoEditor(ctx,vb,true);
    if(pg){const p=(versao.notasPaginas?.paginas||[]).find(x=>x.id===pg);if(p&&ctx.titulo){ctx.titulo.value=p.titulo||'';pgTituloSalva()}}
  }else if(pg){
    const p=(versao.notasPaginas?.paginas||[]).find(x=>x.id===pg);if(!p)return false;
    pgMuda(l=>{const x=l.find(y=>y.id===pg),nova={...p,doc:{v:1,blocos:vb},atualizado:agora};if(x)Object.assign(x,nova);else l.push({...nova,ordem:Math.max(0,...l.map(y=>Number(y.ordem)||0))+10})});
  }else return false;
  toast('Versão restaurada como uma edição nova.');return true;
}

// ===== Frases-padrão: SM.d.notasFrases = [{id,titulo,texto,atualizado}] (fusão por `atualizado`, aparelho antigo não apaga) =====
const ntFrases=()=>Array.isArray(SM.d?.notasFrases)?SM.d.notasFrases:[];
function frGrava(l){
  const p=ntPendentes()[0];
  try{localStorage.setItem(NT_PEND,JSON.stringify({...p,blocos:p?.blocos||SM.d.notasDoc?.blocos||[],frases:l,em:Date.now(),conflitos:p?.conflitos||[]}))}catch(e){toast('Sem espaço para salvar as notas neste aparelho.');return false}
  SM.d.notasFrases=l;smGuardaCache();ntSync();return true;
}
const frMuda=fn=>{if(!SM.d)return false;const l=JSON.parse(JSON.stringify(ntFrases()));fn(l);return frGrava(l)};
function frSalva(titulo,texto){
  const t=String(texto||'').trim();if(!t){toast('Selecione o texto da frase.');return false}
  const id=ntNovoId().replace(/^b/,'f');
  return frMuda(l=>l.push({id,titulo:String(titulo||'').trim()||t.slice(0,40),texto:t,atualizado:ntAgora()}));
}
// Texto da frase no cursor: uma linha entra como texto; várias viram parágrafos.
function frInsere(c,f){
  const linhas=String(f.texto).split('\n');
  c.ed.chain().focus().insertContent(linhas.length===1?{type:'text',text:linhas[0]}:linhas.map(l=>({type:'paragraph',...(l?{content:[{type:'text',text:l}]}:{})}))).run();
}
function ntFrasesEscolhe(c){
  const ov=ntModal('nt-frases',`<div class="nt-modal-t"><b>Frases-padrão</b><button type="button" class="nt-x" aria-label="Fechar">✕</button></div><input type="text" class="nt-fr-q" placeholder="Filtrar frases" aria-label="Filtrar frases" autocomplete="off"><div class="nt-fr-l" role="listbox"></div>`);
  const q=ov.querySelector('.nt-fr-q'),l=ov.querySelector('.nt-fr-l');let sel=0,it=[];
  const pinta=()=>{
    const n=ntSemAcento(q.value);it=ntFrases().filter(f=>!n||ntSemAcento(f.titulo+' '+f.texto).includes(n));sel=Math.min(sel,Math.max(0,it.length-1));
    l.innerHTML=it.length?it.map((f,i)=>`<button type="button" role="option" class="nt-fr-it${i===sel?' sel':''}" data-i="${i}"><b>${esc(f.titulo)}</b><small>${esc(f.texto.slice(0,120))}</small></button>`).join(''):'<p class="mut">Nenhuma frase. Selecione um texto e use "Frase" na barra para salvar.</p>';
  };
  const poe=f=>{ntModalFecha(ov);frInsere(c,f)};
  q.addEventListener('input',()=>{sel=0;pinta()});
  q.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(it.length){sel=(sel+(e.key==='ArrowDown'?1:-1)+it.length)%it.length;pinta()}}
    else if(e.key==='Enter'&&it[sel]){e.preventDefault();poe(it[sel])}
  });
  l.addEventListener('click',e=>{const b=e.target.closest('[data-i]');if(b)poe(it[+b.dataset.i])});
  ov.querySelector('.nt-x').onclick=()=>ntModalFecha(ov);pinta();q.focus();
}
// Selecionou texto e clicou "Frase" na barra: pede o título e salva.
function ntFraseSalvaSel(c){
  const s=c.ed.state.selection,texto=s.empty?'':c.ed.state.doc.textBetween(s.from,s.to,'\n','\n').trim();
  if(!texto){toast('Selecione o texto que vai virar frase.');return}
  const ov=ntModal('nt-frases',`<div class="nt-modal-t"><b>Salvar como frase</b><button type="button" class="nt-x" aria-label="Fechar">✕</button></div><input type="text" class="nt-fr-q" placeholder="Título da frase" aria-label="Título da frase" maxlength="80" autocomplete="off" value="${esc(texto.slice(0,40))}"><p class="mut nt-fr-prev">${esc(texto.slice(0,300))}</p><div class="row"><button type="button" class="b" data-f="ok">Salvar</button><button type="button" class="b s" data-f="x">Cancelar</button></div>`);
  const q=ov.querySelector('input'),ok=()=>{if(frSalva(q.value,texto)){ntModalFecha(ov);toast('Frase salva. Insira com /Frase.')}};
  q.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();ok()}});
  ov.addEventListener('click',e=>{const b=e.target.closest('[data-f]');if(b)b.dataset.f==='ok'?ok():ntModalFecha(ov)});
  ov.querySelector('.nt-x').onclick=()=>ntModalFecha(ov);q.focus();q.select();
}
function ntFrasesGerencia(){
  const ov=ntModal('nt-frases',`<div class="nt-modal-t"><b>Gerenciar frases</b><button type="button" class="nt-x" aria-label="Fechar">✕</button></div><div class="nt-fr-l"></div>`),l=ov.querySelector('.nt-fr-l');
  const pinta=()=>{l.innerHTML=ntFrases().length?ntFrases().map(f=>`<div class="nt-fr-g" data-id="${esc(f.id)}"><input type="text" value="${esc(f.titulo)}" maxlength="80" aria-label="Título"><small>${esc(f.texto.slice(0,100))}</small><button type="button" class="b s" data-f="apaga" aria-label="Apagar frase ${esc(f.titulo)}">🗑</button></div>`).join(''):'<p class="mut">Nenhuma frase salva ainda.</p>'};
  l.addEventListener('change',e=>{const g=e.target.closest('.nt-fr-g');if(!g||e.target.tagName!=='INPUT')return;const t=e.target.value.trim();if(!t){pinta();return}frMuda(a=>{const f=a.find(x=>x.id===g.dataset.id);if(f){f.titulo=t;f.atualizado=ntAgora()}})});
  l.addEventListener('click',e=>{const b=e.target.closest('[data-f="apaga"]');if(!b)return;const id=b.closest('.nt-fr-g').dataset.id;frMuda(a=>{const i=a.findIndex(x=>x.id===id);if(i>=0)a.splice(i,1)});pinta()});
  ov.querySelector('.nt-x').onclick=()=>ntModalFecha(ov);pinta();
}

// ===== Recentes: últimas 5 páginas abertas neste aparelho =====
function ntRecentes(){try{const l=JSON.parse(localStorage.getItem(NT_REC)||'[]');return Array.isArray(l)?l.filter(x=>typeof x==='string'):[]}catch(e){return []}}
function ntRecentePoe(id){try{localStorage.setItem(NT_REC,JSON.stringify([id,...ntRecentes().filter(x=>x!==id)].slice(0,5)))}catch(e){}}


// Busca global (1.42): Ctrl+P (e Ctrl+K fora do texto das Notas) em qualquer aba. Procura em blocos das Notas, páginas, tarefas, eventos do calendário,
// questões e, se o app tiver, Resumos (função global resumosBusca() -> [{id,titulo,texto,abre}]). Busca própria: sem acento, minúsculas, por palavras.
// Ranking = relevância x frecência. A frecência vem de contadores LOCAIS (localStorage bcbr_busca_freq): só quantas vezes e quando, nunca o conteúdo.
const BG_FREQ='bcbr_busca_freq',BG_POR_TIPO=8;
const BG_TIPOS=[['nota','Notas'],['pagina','Páginas'],['tarefa','Tarefas'],['evento','Calendário'],['questao','Questões'],['resumo','Resumos']];
function bgFreqLer(){try{const o=JSON.parse(localStorage.getItem(BG_FREQ)||'{}');return o&&typeof o==='object'&&!Array.isArray(o)?o:{}}catch(e){return {}}}
function bgFreqConta(chave){
  const f=bgFreqLer(),x=f[chave]||{n:0,t:0};f[chave]={n:x.n+1,t:Date.now()};
  const ks=Object.keys(f);if(ks.length>300)ks.sort((a,b)=>f[a].t-f[b].t).slice(0,ks.length-300).forEach(k=>delete f[k]);
  try{localStorage.setItem(BG_FREQ,JSON.stringify(f))}catch(e){}
}
// 1 sem uso; cresce com o log do número de usos e cai pela metade a cada 14 dias sem uso.
const bgFrecencia=(x,agora)=>x?1+Math.log2(1+(x.n||0))*Math.pow(.5,Math.max(0,agora-(x.t||0))/(14*864e5)):1;
const bgTokens=q=>ntNorma(q).split(/\s+/).filter(Boolean);
// Cada palavra digitada precisa aparecer (no título vale mais; começo de palavra vale mais). 0 = não casa.
function bgPontua(tokens,d){
  let s=0;
  for(const t of tokens){
    if(d.tn.includes(t))s+=(d.tn.startsWith(t)||d.tn.includes(' '+t))?5:3;
    else if(d.cn.includes(t))s+=d.cn.includes(' '+t)?2:1;
    else return 0;
  }
  return s;
}
// Resultados: [{d,s}] por tipo na ordem de BG_TIPOS, até BG_POR_TIPO cada. Sem texto: os usados recentemente.
function bgBusca(q,docs,freq,agora=Date.now()){
  const tokens=bgTokens(q);
  if(!tokens.length)return docs.filter(d=>freq[d.chave]).sort((a,b)=>freq[b.chave].t-freq[a.chave].t).slice(0,10).map(d=>({d,s:0}));
  const por={};
  for(const d of docs){const s=bgPontua(tokens,d);if(s)(por[d.tipo]??=[]).push({d,s:s*bgFrecencia(freq[d.chave],agora)})}
  return BG_TIPOS.flatMap(([t])=>(por[t]||[]).sort((a,b)=>b.s-a.s).slice(0,BG_POR_TIPO));
}
// Texto corrido de um nó do ProseMirror (JSON).
function bgTextoNo(n){
  if(!n)return '';if(typeof n.text==='string')return n.text;
  const f=n.content||[];return f.map(bgTextoNo).join(f.some(x=>x.text!==undefined)?'':' ');
}
const bgEsc=s=>esc(String(s));
const bgArea=q=>typeof AREA_BY!=='undefined'?AREA_BY[q._a]?.nome:'';
function bgDocs(){
  const docs=[],add=(tipo,id,titulo,corpo,abre,sub)=>{titulo=String(titulo||'').trim();corpo=String(corpo||'');docs.push({tipo,id,chave:tipo+':'+id,titulo,sub:sub||'',corpo,tn:ntNorma(titulo),cn:ntNorma(corpo),abre})};
  const d=SM.d;
  for(const b of d?.notasDoc?.blocos||[]){
    const txt=bgTextoNo(b.conteudo).trim();if(!txt)continue;
    const sum=b.conteudo?.type==='details'?bgTextoNo(b.conteudo.content?.find(x=>x.type==='detailsSummary')).trim():'';
    add('nota',b.id,sum||txt.slice(0,70),txt,()=>bgIrNota(b.id));
  }
  for(const p of d?.notasPaginas?.paginas||[])add('pagina',p.id,p.titulo||'Sem título',(p.doc?.blocos||[]).map(b=>bgTextoNo(b.conteudo)).join(' '),()=>bgIrPagina(p.id));
  for(const t of d?.tarefas||[])add('tarefa',t.id,t.texto,[t.det,...(t.subtarefas||[]).map(s=>s.texto)].filter(Boolean).join(' '),()=>bgIrTarefa(t.id),(t.dia&&t.dia.length===10?t.dia.slice(8)+'/'+t.dia.slice(5,7):'')+(t.feito?' · feita':''));
  for(const [iso,x] of Object.entries(d?.dias||{})){
    const rot=iso.slice(8)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4);
    for(const e of x.ev||[])add('evento','m'+e.id,e.t,'',()=>bgIrDia(iso),rot);
    if(x.agenda&&String(x.agenda).trim())add('evento','a'+iso,String(x.agenda).split('\n')[0],x.agenda,()=>bgIrDia(iso),rot);
  }
  for(const e of (typeof SM!=='undefined'&&SM.agenda)||[]){const iso=String(e.inicio||'').slice(0,10);if(iso.length===10)add('evento','g'+iso+(e.titulo||''),e.titulo,e.local||'',()=>bgIrDia(iso),iso.slice(8)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4))}
  if(typeof Q!=='undefined'){
    if(bgQ.n!==Q.length||bgQ.ref!==Q[0]){bgQ.n=Q.length;bgQ.ref=Q[0];bgQ.docs=Q.map(q=>({tipo:'questao',id:q.id,chave:'questao:'+q.id,titulo:'Questão '+(q.n??'—'),sub:[bgArea(q),...(q.cl||[]).slice(0,2)].filter(Boolean).join(' › '),corpo:String(q.enunciado||''),tn:ntNorma('Questão '+(q.n??'')),
      cn:ntNorma(String(q.enunciado||'')+' '+[bgArea(q),...(q.cl||[]),...(q.tags||[])].filter(Boolean).join(' ')),abre:()=>bgIrQuestao(q.id)}))}
    docs.push(...bgQ.docs);
  }
  if(typeof resumosBusca==='function'){try{for(const r of resumosBusca()||[])add('resumo',r.id,r.titulo,r.texto,r.abre)}catch(e){}}
  return docs;
}
const bgQ={n:-1,ref:null,docs:[]};   // índice das questões: montado uma vez por sessão (5.700 questões) e reaproveitado

// ----- navegação -----
function bgEspera(fn,t=40){if(typeof NT!=='undefined'&&tela==='notas'&&NT.ed&&NT.el?.isConnected)fn();else if(t>0)setTimeout(()=>bgEspera(fn,t-1),50)}
function bgIrNota(id){
  go('notas');
  bgEspera(()=>{
    const ed=NT.ed;let pos=null;ed.state.doc.forEach((n,off)=>{if(pos==null&&n.attrs.id===id)pos=off});
    if(pos==null){toast('Esse bloco não existe mais.');return}
    const n=ed.state.doc.nodeAt(pos);
    if(n.type.name==='details'){const dom=ed.view.nodeDOM(pos);if(dom instanceof Element){ntPoeAberto(dom,true);ntAbertoSalva(id,true)}}
    try{ed.view.dispatch(ed.state.tr.setSelection(TT.pm.state.Selection.near(ed.state.doc.resolve(pos+1))))}catch(e){}
    const dom=ed.view.nodeDOM(pos);if(dom instanceof Element){dom.scrollIntoView({block:'center'});dom.classList.add('nt-flash');setTimeout(()=>dom.classList.remove('nt-flash'),1500)}
    ed.view.focus();
  });
}
function bgIrPagina(id){go('notas');bgEspera(()=>ntPainelAbre(id))}
function bgIrTarefa(id){
  go('tarefas');
  setTimeout(()=>{const r=document.querySelector(`.sm-row[data-tid="${id}"]`);if(r){r.scrollIntoView({block:'center'});r.classList.add('nt-flash');setTimeout(()=>r.classList.remove('nt-flash'),1500)}else if(smTar(id))smEdita(id)},60);
}
function bgIrDia(iso){go('semana');SM.mes=iso.slice(0,7);SM.semana=smDom(iso);smSel(iso)}
function bgIrQuestao(id){
  const q=QID[id];if(!q)return;
  bf={a:'',d:'',s:'',c:'',p:''};bq=q.n!=null?String(q.n):q.enunciado.slice(0,40);bLim=1e9;bAbertos.add(id);go('banco');
  setTimeout(()=>{const el=document.querySelector(`details.bq[data-qid="${id}"]`);if(el){el.scrollIntoView({block:'start'});el.classList.add('nt-flash');setTimeout(()=>el.classList.remove('nt-flash'),1500)}},60);
}

// ----- janela -----
function bgSnippet(d,tokens){
  const t=tokens.find(x=>d.cn.includes(x)),i=t?d.cn.indexOf(t):-1;
  if(i<0||i>=d.corpo.length)return bgEsc(d.sub);
  const a=Math.max(0,i-30);
  return (d.sub?bgEsc(d.sub)+' · ':'')+(a>0?'…':'')+bgEsc(d.corpo.slice(a,i))+'<mark>'+bgEsc(d.corpo.slice(i,i+t.length))+'</mark>'+bgEsc(d.corpo.slice(i+t.length,i+t.length+60));
}
function bgAbre(){
  const aberta=document.querySelector('.bg-m');if(aberta){ntModalFecha(aberta.closest('.nt-modal'));return}
  const ov=ntModal('bg-modal',`<input type="text" class="bg-in" placeholder="Buscar em notas, páginas, tarefas, calendário e questões" aria-label="Busca global" autocomplete="off" spellcheck="false"><div class="bg-l" role="listbox"></div>`);
  ov.firstElementChild.classList.add('bg-m');
  const q=ov.querySelector('.bg-in'),l=ov.querySelector('.bg-l'),docs=bgDocs(),freq=bgFreqLer();let res=[],sel=0;
  const pinta=()=>{
    const t0=performance.now();res=bgBusca(q.value,docs,freq);sel=Math.min(sel,Math.max(0,res.length-1));
    const tokens=bgTokens(q.value);let h='',ult='';
    if(!tokens.length&&res.length)h='<div class="bg-h">Recentes</div>';
    res.forEach((r,i)=>{
      if(tokens.length&&r.d.tipo!==ult){ult=r.d.tipo;h+=`<div class="bg-h">${BG_TIPOS.find(x=>x[0]===ult)[1]}</div>`}
      h+=`<button type="button" role="option" class="bg-it${i===sel?' sel':''}" data-i="${i}"><b>${bgEsc(r.d.titulo||'(sem título)')}</b><small>${bgSnippet(r.d,tokens)}</small></button>`;
    });
    if(!res.length)h=`<p class="bg-v">${tokens.length?'Nada encontrado.':'Digite para buscar. O que você abrir aparece aqui como recente.'}</p>`;
    l.innerHTML=h;l.querySelector('.sel')?.scrollIntoView({block:'nearest'});ov.dataset.ms=String(Math.round(performance.now()-t0));
  };
  const vai=r=>{if(!r)return;ntModalFecha(ov);bgFreqConta(r.d.chave);r.d.abre()};
  q.addEventListener('input',()=>{sel=0;pinta()});
  q.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(res.length){sel=(sel+(e.key==='ArrowDown'?1:-1)+res.length)%res.length;pinta()}}
    else if(e.key==='Enter'){e.preventDefault();vai(res[sel])}
  });
  l.addEventListener('click',e=>{const b=e.target.closest('[data-i]');if(b)vai(res[+b.dataset.i])});
  pinta();q.focus();
}
document.addEventListener('keydown',e=>{
  if(!(e.ctrlKey||e.metaKey)||e.altKey||e.shiftKey||typeof SM==='undefined')return;
  const k=String(e.key).toLowerCase();if(k!=='p'&&k!=='k')return;
  if(k==='k'&&e.target.closest?.('.ProseMirror'))return;   // dentro do texto das Notas, Ctrl+K continua sendo link
  e.preventDefault();e.stopImmediatePropagation();bgAbre();
},true);


// Offline (1.42): indicador discreto "offline · N pendentes" e download único das imagens (questões e notas) para abrir tudo sem internet.
// O resto já é local: o service worker serve o app e o vendor do cache (atualiza por trás), as questões vêm do IndexedDB (shim.js), o plano/notas/páginas/frases/agenda
// do localStorage, e toda gravação fica na fila do aparelho (notas: NT_PEND; plano: SM.sujo + fusão; progresso: dirty/estDirty) até o GitHub confirmar, sem duplicar.
const OF={prog:'',baixando:false},OF_FLAG='bcbr_baixou';
function ofPendentes(){
  let n=0;
  try{if(typeof ntTemPendentes==='function'&&ntTemPendentes())n++;if(SM.sujo)n++}catch(e){}
  try{n+=dirty.size+(estDirty?1:0)}catch(e){}   // progresso das questões (app): semanas e estado ainda não enviados
  return n;
}
function ofTexto(){
  const off=navigator.onLine===false||!!window.BCBR?.semRede,n=ofPendentes(),p=n===1?'pendente':'pendentes';
  if(OF.prog)return `baixando para offline · ${OF.prog}`;
  return off?`offline · ${n} ${p}`:n?`sincronizando · ${n} ${p}`:'';
}
function ofPinta(){
  const t=ofTexto();let el=document.getElementById('bcbr_off');
  if(!t){el?.remove();return}
  if(!el){el=document.createElement('div');el.id='bcbr_off';el.className='bcbr-off';el.setAttribute('role','status');document.body.appendChild(el)}
  if(el.textContent!==t)el.textContent=t;
}
// Nomes das imagens das notas e páginas (./img/nota-….jpg) para entrarem no "baixar tudo".
function ofImagensNotas(){
  const s=JSON.stringify([SM.d?.notasDoc,SM.d?.notasPaginas]||''),out=new Set();
  for(const m of s.matchAll(/\.\/img\/([\w.-]+)/g))out.add(m[1]);
  return [...out];
}
async function ofBaixaTudo(){
  if(OF.baixando||!window.BCBR?.baixarTudo||navigator.onLine===false)return;
  OF.baixando=true;
  try{await BCBR.baixarTudo((i,t)=>{OF.prog=`${i}/${t}`;ofPinta()},ofImagensNotas());try{localStorage.setItem(OF_FLAG,'1')}catch(e){}}
  catch(e){}finally{OF.baixando=false;OF.prog='';ofPinta()}
}
window.addEventListener('online',ofPinta);window.addEventListener('offline',ofPinta);
setInterval(ofPinta,2000);
// Primeira abertura neste aparelho: baixa tudo de uma vez (em segundo plano, fora de dados móveis/economia de dados); depois o service worker só busca o que for novo.
setTimeout(()=>{
  let c=null;try{c=navigator.connection}catch(e){}
  if(!localStorage.getItem(OF_FLAG)&&!(c&&(c.saveData||c.type==='cellular')))ofBaixaTudo();
},4000);


// Tags PersonalRad: bloco rotulado por nível (quiz após responder; Banco com a questão aberta); nunca entram na classificação ou nas contagens.
const PR_NIVEIS=[['specialty','Especialidade'],['system','Sistema'],['modality','Modalidade'],['discipline','Disciplina'],['session','Sessão'],['theme','Tema'],['subtheme','Subtema'],['specific','Específico'],['test','Prova'],['year','Ano'],['area','Área'],['tag','Tag']];
function prTagsBloco(q){
  const t=q.pr_tags;
  if(!t||typeof t!=='object')return '';
  function achatar(v,out){
    if(typeof v==='string'||typeof v==='number'){const x=String(v).trim();if(x)out.push(x)}
    else if(v&&typeof v==='object')Object.values(v).forEach(y=>achatar(y,out));
    return out;
  }
  const conhecidas=new Set(PR_NIVEIS.map(n=>n[0])),linhas=[];
  for(const [k,nome] of [...PR_NIVEIS,...Object.keys(t).filter(k=>!conhecidas.has(k)).map(k=>[k,k])]){
    const vistos=new Set(),vals=achatar(t[k],[]).filter(x=>{const n=prNorm(x)||x;if(vistos.has(n))return false;vistos.add(n);return true});
    if(vals.length)linhas.push(`<p><b>${esc(nome)}:</b> ${vals.map(esc).join(' · ')}</p>`);
  }
  return linhas.length?`<div class="ponto md pr-dados pr-tags"><div class="kick">Classificação PersonalRad</div>${linhas.join('')}</div>`:'';
}
function prLinhas(q){return Object.values(q.curso?.secoes||{}).flat().filter(v=>typeof v==='string')}
function prStats(q){
  const s={...(q.pr_stats||{})},texto=prLinhas(q).join('\n');
  const m=texto.match(/Acerto dos alunos:\s*([\d.,]+)%\s*\((\d+) respostas(?:, (\d+) alunos)?/i);
  if(m){s.acerto??=Number(m[1].replace(',','.'));s.respostas??=+m[2];if(m[3])s.respondentes??=+m[3]}
  s.alternativas={...(s.alternativas||{})};
  for(const [l,t] of Object.entries(q.alts||{})){
    const p=t.match(/·\s*(?:✓\s*)?([\d.,]+)%\s*$/);
    if(p&&!s.alternativas[l])s.alternativas[l]={percentual:Number(p[1].replace(',','.'))};
  }
  for(const linha of prLinhas(q).filter(l=>/^Alternativas marcadas:/i.test(l.trim())))
    for(const p of linha.matchAll(/\b([A-E])\s*(?:✓\s*)?([\d.,]+)%/g))
      if(!s.alternativas[p[1]])s.alternativas[p[1]]={percentual:Number(p[2].replace(',','.'))};
  return s;
}
function prDadosBloco(q){
  const s=prStats(q),linhas=[];
  if(acertoPR(q)!=null)linhas.push(`Acerto dos alunos: ${acertoPR(q).toLocaleString('pt-BR')}%`);
  if(s.respostas!=null)linhas.push(`Respostas: ${s.respostas}`);
  if(s.respondentes!=null)linhas.push(`Alunos: ${s.respondentes}`);
  const alts=Object.entries(s.alternativas||{}).filter(([,v])=>Number.isFinite(v.percentual)).map(([l,v])=>`${l}: ${v.percentual.toLocaleString('pt-BR')}%${v.respostas!=null?' ('+v.respostas+' respostas)':''}`);
  if(alts.length)linhas.push('Alternativas marcadas: '+alts.join(' · '));
  const tempos=Object.entries(s.tempos||{}).filter(([,v])=>Number.isFinite(v)).map(([k,v])=>`${k}: ${v.toLocaleString('pt-BR')} ${k==='amostra'?'respostas':'s'}`);
  if(tempos.length)linhas.push('Tempo: '+tempos.join(' · '));
  else linhas.push(...prLinhas(q).filter(l=>/^Tempo:/i.test(l.trim())));
  return linhas.length?`<div class="ponto md pr-dados"><div class="kick">Dados do site</div>${linhas.map(l=>`<p>${esc(l)}</p>`).join('')}</div>`:'';
}
function prAviso(q){return q.pr_qualidade?.needsReview===true||q.pr_qualidade?.reportsOpen>0}
function prAvisoBloco(q){return prAviso(q)?'<small class="pr-aviso">⚠ possível erro na questão</small>':''}
function prProvaBloco(q){
  const p=q.pr_prova||{},nomes=[...(p.test||[]),...(p.year||[])];
  return nomes.length?`<small class="mut pr-prova">${esc(nomes.join(' · '))}</small>`:'';
}
function prAlternativa(q,l,fb){
  const p=prStats(q).alternativas?.[l]?.percentual;
  return fb&&typeof p==='number'&&Number.isFinite(p)&&p>=0&&p<=100?` <small class="pr-percentual">· ${l===q.gab?'✓ ':''}${p.toLocaleString('pt-BR',{maximumFractionDigits:2})}%</small>`:'';
}
function prNorm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function prContagens(dados){
  const contagens={};
  function guardar(tipo,nome,n){
    const k=prNorm(nome);
    if(tipo==='theme'&&k&&typeof n==='number'&&Number.isFinite(n)&&n>0)contagens[k]=Math.max(contagens[k]||0,n);
  }
  for(const t of dados?.termos||[])guardar(t.type,t.nome,t.questoes);
  function visitar(no){
    if(!no||typeof no!=='object')return;
    if(!Array.isArray(no))guardar(no.type,no.label||no.nome||no.name,no.subtreeQuestionsActiveCount??no.questionsActiveCount);
    for(const v of Object.values(no))if(v&&typeof v==='object')visitar(v);
  }
  visitar(dados?.arvores);
  return contagens;
}
let _prInc=null;
function prPesoTema(q){
  const dados=globalThis.TAXONOMIA_PR;
  if(!dados)return 1;
  if(!_prInc||_prInc.dados!==dados||_prInc.qs!==Q||_prInc.n!==Q.length){
    const contagens=prContagens(dados),nomes=new Set(Q.map(x=>prNorm(x.cl?.[0])).filter(k=>contagens[k]));
    const valores=[...nomes].map(k=>contagens[k]),media=valores.reduce((a,b)=>a+b,0)/(valores.length||1);
    _prInc={dados,qs:Q,n:Q.length,contagens,media};
  }
  const n=_prInc.contagens[prNorm(q.cl?.[0])];
  return n&&_prInc.media?Math.min(1.25,Math.max(.8,Math.pow(n/_prInc.media,.25))):1;
}
function pesoPR(q){
  // Multiplicadores suaves e cumulativos; nunca excluem uma questão.
  const prova=(q.pr_prova?.test||[]).some(t=>/\b(cbr|t[ií]tulo|prova|seriada)\b/i.test(t)&&!/simulad|treino/i.test(t));
  return (prAviso(q)?.6:1)*(prova?1.1:1)*prPesoTema(q);
}


// ===== Foco até a prova (CBR) — célula do Painel (06/11/2026) =====
// Tudo é calculado no render a partir de Q e log atuais (sem snapshot gravado): responder ou entrar questão nova muda o resultado.
// Funções puras (focoCalc, foTab, foDifCmp, foSorteia) não dependem do app; a UI (vFoco) usa os globais do app.
const foCBR=q=>[].concat((q.pr_prova&&q.pr_prova.test)||[],(q.pr_tags&&q.pr_tags.test)||[]).includes('Provas CBR');
const foDif=q=>q._d||'m';                       // sem dificuldade conta como média
const foAnos=q=>[].concat((q.pr_prova&&q.pr_prova.year)||[]).map(String);
const foBase=Q=>Q.filter(q=>q.gab&&q._a&&q._a!=='sem'&&q.cl&&q.cl[0]);
const foKT=q=>q._a+'|'+q.cl[0],foKS=q=>q._a+'|'+q.cl[0]+'|'+(q.cl[1]||'');
// agrega um conjunto de questões: contagem por dificuldade, feitas, acerto (por resposta) e fáceis+médias ainda não vistas
function foAgg(qs,R,vistas){
  const x={n:qs.length,f:0,m:0,d:0,feitas:0,resp:0,ok:0,restam:0,restamIds:[]};
  qs.forEach(q=>{const k=foDif(q);x[k]++;const r=R[q.id];if(r){x.feitas++;x.resp+=r.n;x.ok+=r.n-r.e}
    if(!vistas.has(q.id)&&k!=='d'){x.restam++;x.restamIds.push(q.id)}});
  x.acerto=x.resp?x.ok/x.resp:null;x.fac=x.n?(x.f+.6*x.m+.1*x.d)/x.n:0;return x}
const foRespostas=(log,ids)=>{const R={};log.forEach(l=>{if(!ids.has(l.q))return;const x=R[l.q]??={n:0,e:0};x.n++;if(!l.ok)x.e++});return R};
// meta: orçamento dividido pela prioridade, limitado ao que resta de fáceis+médias do tema (a sobra é redistribuída)
function foMeta(rows,orc){
  const m=rows.map(()=>0),cap=rows.map(r=>r.restam);let ativo=rows.map((_,i)=>i),sobra=Math.max(0,Math.floor(orc));
  while(ativo.length&&sobra>0){
    const soma=ativo.reduce((a,i)=>a+rows[i].prio,0);if(!(soma>0))break;
    const cheio=ativo.filter(i=>sobra*rows[i].prio/soma>=cap[i]-m[i]);
    if(cheio.length){cheio.forEach(i=>{sobra-=cap[i]-m[i];m[i]=cap[i]});ativo=ativo.filter(i=>!cheio.includes(i));continue}
    const q=ativo.map(i=>sobra*rows[i].prio/soma);let usado=0;ativo.forEach((i,k)=>{const f=Math.floor(q[k]);m[i]+=f;usado+=f});
    let resto=sobra-usado;
    ativo.map((i,k)=>[i,q[k]-Math.floor(q[k])]).sort((a,b)=>b[1]-a[1]).forEach(([i])=>{if(resto>0&&m[i]<cap[i]){m[i]++;resto--}});
    break}
  rows.forEach((r,i)=>r.meta=m[i])}
function focoCalc(Q,log,o={}){
  const topN=o.top||20,orc=o.orcamento||0,vistas=new Set((o.all||log).map(l=>l.q));
  const B=foBase(Q),ids=new Set(B.map(q=>q.id)),R=foRespostas(log,ids);
  const C=B.filter(foCBR),totC=C.length,totG=B.length;
  const E=f=>{const m={};B.forEach(q=>{const r=R[q.id];if(!r)return;const x=m[f(q)]??={n:0,e:0};x.n+=r.n;x.e+=r.e});return m};
  const eA=E(q=>q._a),eT=E(foKT),eS=E(foKS);
  const G={};B.forEach(q=>(G[foKT(q)]??=[]).push(q));
  const todos=[];
  for(const k in G){
    const qs=G[k],qc=qs.filter(foCBR),a=foAgg(qs,R,vistas),c=foAgg(qc,R,vistas);
    const incC=totC?qc.length/totC:0,incG=totG?qs.length/totG:0,inc=.75*incC+.25*incG;
    const ea=eA[qs[0]._a]||{n:0,e:0},pA=(ea.e+.35*4)/(ea.n+4),et=eT[k]||{n:0,e:0},erro=(et.e+pA*4)/(et.n+4);
    const prio=inc*(.5+1.5*erro)*(.6+.8*a.fac)*(1-.5*(a.feitas/a.n));
    const sc={};(qc.length?qc:qs).forEach(q=>{const s=q.cl[1];if(s)sc[s]=(sc[s]||0)+1});
    todos.push({k,a:qs[0]._a,t:qs[0].cl[0],n:a.n,nC:qc.length,incC,incG,inc,erro,fac:a.fac,f:a.f,m:a.m,d:a.d,fC:c.f,mC:c.m,dC:c.d,
      feitas:a.feitas,acerto:a.acerto,restam:a.restam,prio,
      subs:Object.entries(sc).sort((x,y)=>y[1]-x[1]).slice(0,3).map(([s,n])=>({s,n})),viaGeral:incG>2*incC})}
  const temas=todos.filter(r=>r.restam>0).sort((a,b)=>b.prio-a.prio),top=temas.slice(0,topN);
  foMeta(top,orc);
  const fe=C.filter(q=>R[q.id]),rc=C.reduce((a,q)=>a+(R[q.id]?R[q.id].n:0),0),oc=C.reduce((a,q)=>a+(R[q.id]?R[q.id].n-R[q.id].e:0),0);
  const rg=B.reduce((a,q)=>a+(R[q.id]?R[q.id].n:0),0),og=B.reduce((a,q)=>a+(R[q.id]?R[q.id].n-R[q.id].e:0),0);
  const anos=[...new Set(C.flatMap(foAnos))].filter(Boolean).sort();
  return {resumo:{totC,totG,pctBanco:totG?totC/totG:0,anos,feitasC:fe.length,acertoC:rc?oc/rc:null,acertoGeral:rg?og/rg:null,orcamento:orc},temas,top}}
// panorama: tabela por área/tema/subtema, base CBR ou banco inteiro, com ordenação
function foTab(Q,log,o={}){
  const nivel=o.nivel||'tema',cbr=(o.base||'cbr')==='cbr',vistas=new Set((o.all||log).map(l=>l.q));
  const B=foBase(Q),ids=new Set(B.map(q=>q.id)),R=foRespostas(log,ids),S=cbr?B.filter(foCBR):B;
  const key=nivel==='area'?q=>q._a:nivel==='sub'?foKS:foKT,G={};S.forEach(q=>(G[key(q)]??=[]).push(q));
  const rows=Object.entries(G).map(([k,qs])=>{const a=foAgg(qs,R,vistas);
    return {k,q0:qs[0],n:a.n,pct:S.length?a.n/S.length:0,f:a.f,m:a.m,d:a.d,fac:a.fac,feitas:a.feitas,acerto:a.acerto,restam:a.restam,erro:(a.resp-a.ok+.35*3)/(a.resp+3)}});
  const ord=o.ordem||'inc',cmp={inc:(a,b)=>b.n-a.n,fac:(a,b)=>b.fac-a.fac||b.n-a.n,erro:(a,b)=>b.erro-a.erro||b.n-a.n,rest:(a,b)=>b.restam-a.restam||b.n-a.n}[ord];
  rows.sort(cmp);return {total:S.length,rows:nivel==='area'?rows:rows.slice(0,o.top||30)}}
// dificuldade: % f/m/d no CBR, no banco inteiro e o acerto dele em cada nível
function foDifCmp(Q,log){
  const B=foBase(Q),ids=new Set(B.map(q=>q.id)),R=foRespostas(log,ids),C=B.filter(foCBR);
  const dist=S=>{const c={f:0,m:0,d:0};S.forEach(q=>c[foDif(q)]++);return c};
  const ac={f:[0,0],m:[0,0],d:[0,0]};B.forEach(q=>{const r=R[q.id];if(r){const a=ac[foDif(q)];a[0]+=r.n-r.e;a[1]+=r.n}});
  return {cbr:dist(C),geral:dist(B),nC:C.length,nG:B.length,acerto:Object.fromEntries(Object.entries(ac).map(([k,[o,n]])=>[k,n?o/n:null])),resp:Object.fromEntries(Object.entries(ac).map(([k,[,n]])=>[k,n]))}}
// quantas questões de cada tema entram num bloco misto (n sorteios com peso = prio, limitados ao que resta do tema)
function foSorteia(top,n,rnd=Math.random){
  const c=top.map(()=>0);
  for(let i=0;i<n;i++){
    const w=top.map((r,j)=>c[j]<r.restam?r.prio:0),t=w.reduce((a,b)=>a+b,0);if(!(t>0))break;
    let x=rnd()*t,j=0;for(;j<w.length-1;j++){x-=w[j];if(x<=0)break}
    if(!w[j])j=w.findIndex(v=>v>0);c[j]++}
  return c}

// ---- UI (usa os globais do app) ----
let foUlt=null,foBaseSel='cbr',foOrd='inc',foAbertos=new Set();
const foP=v=>v==null?'—':(v*100).toLocaleString('pt-BR',{maximumFractionDigits:v<.1?1:0})+'%';
const foFmd=(f,m,d)=>`<span style="color:var(--ok)">${f}</span>/${m}/<span style="color:var(--bad,#c0392b)">${d}</span>`;
const foNome=r=>`${esc(AREA_BY[r.a].nome)} › ${esc(r.t)}`;
function foN(){return [10,20,30].includes(+cfg.focoN)?+cfg.focoN:20}
function foSetN(v){cfg.focoN=+v;persist('_est');render()}
function foSetPref(c){cfg.focoCbr=!!c;persist('_est');render()}
function foPacote(n,filtro){
  const pref=cfg.focoCbr!==false;let ids=pref?pacoteVolume(n,q=>filtro(q)&&foCBR(q)):[];
  if(ids.length<n){const j=new Set(ids);ids=ids.concat(pacoteVolume(n-ids.length,q=>filtro(q)&&!j.has(q.id)))}
  return ids}
function foTreinar(i){const r=foUlt&&foUlt.top[i];if(!r)return;iniciar(foPacote(foN(),q=>q.gab&&q._a&&q.cl&&q.cl[0]&&foKT(q)===r.k),'estudo')}
function foMisto(){
  if(!foUlt||!foUlt.top.length)return;const c=foSorteia(foUlt.top,foN());let ids=[];
  foUlt.top.forEach((r,i)=>{if(c[i])ids=ids.concat(foPacote(c[i],q=>q.gab&&q._a&&q.cl&&q.cl[0]&&foKT(q)===r.k))});
  iniciar(embaralha(ids),'estudo')}
function foTog(k,el){const a=foAbertos.has(k);if(el.open===a)return;el.open?foAbertos.add(k):foAbertos.delete(k);render()}
function foSet(k,v){if(k==='b')foBaseSel=v;else foOrd=v;render()}
function foTabHtml(nivel){
  const T=foTab(Q,log,{nivel,base:foBaseSel,ordem:foOrd,all});
  const nm=r=>nivel==='area'?esc(AREA_BY[r.q0._a].nome):nivel==='tema'?foNome({a:r.q0._a,t:r.q0.cl[0]}):`${esc(AREA_BY[r.q0._a].nome)} › ${esc(r.q0.cl[0])} › ${esc(r.q0.cl[1]||'—')}`;
  return `<div class="tw"><table><tr><th>${nivel==='area'?'Área':nivel==='tema'?'Tema':'Subtema'}</th><th>n</th><th>%</th><th>f/m/d</th><th>Feitas</th><th>Acerto</th><th>Restam f+m</th></tr>${T.rows.map(r=>`<tr><td>${nm(r)}</td><td>${r.n}</td><td>${foP(r.pct)}</td><td>${foFmd(r.f,r.m,r.d)}</td><td>${r.feitas}</td><td>${r.acerto==null?'—':foP(r.acerto)}</td><td>${r.restam}</td></tr>`).join('')}</table></div>`}
function vFoco(){
  const orc=Math.max(0,diasProva())*RI_DIARIA,F=focoCalc(Q,log,{orcamento:orc,all}),r=F.resumo;foUlt=F;
  const sel=(k,v,ops)=>`<select onchange="foSet('${k}',this.value)">${ops.map(([x,t])=>`<option value="${x}" ${v===x?'selected':''}>${t}</option>`).join('')}</select>`;
  const linhas=F.top.map((t,i)=>`<tr><td>${i+1}</td><td style="min-width:150px"><b>${foNome(t)}</b>${t.viaGeral?' <span class="tag">pelo banco geral</span>':''}${t.subs.length?`<div class="mut" style="font-size:.76rem">${t.subs.map(s=>esc(s.s)+' ('+s.n+')').join(' · ')}</div>`:''}</td>
    <td>${foP(t.incC)} (${t.nC})</td><td>${foP(t.incG)}</td><td>${t.nC?foFmd(t.fC,t.mC,t.dC):'—'}</td><td>${t.feitas}/${t.n}</td><td>${t.acerto==null?'—':foP(t.acerto)}</td><td>${t.restam}</td><td><b>${t.meta}</b></td>
    <td><button class="b s" style="padding:4px 10px" onclick="foTreinar(${i})">Treinar</button></td></tr>`).join('');
  const D=foDifCmp(Q,log),dp=(c,n)=>['f','m','d'].map(k=>foP(n?c[k]/n:0)).join(' / '),da=['f','m','d'].map(k=>D.acerto[k]==null?'—':foP(D.acerto[k])).join(' / ');
  const pan=(k,nome)=>`<details ${foAbertos.has(k)?'open':''} ontoggle="foTog('${k}',this)" style="margin-top:6px"><summary><b>${nome}</b></summary>${foAbertos.has(k)?foTabHtml(k):''}</details>`;
  return `<div class="card"><h2>Foco até a prova (CBR)</h2>
  <p><b>${r.totC}</b> questões do CBR no banco (${foP(r.pctBanco)} das ${r.totG} válidas) · anos: ${r.anos.length?r.anos.join(', '):'—'}<br>
  Você fez <b>${r.feitasC}</b> do CBR${r.acertoC==null?'':` (acerto ${foP(r.acertoC)})`} · acerto geral ${foP(r.acertoGeral)}<br>
  <b>${diasProva()}</b> dias até a prova · orçamento <b>${orc}</b> questões (${RI_DIARIA}/dia)</p>
  <h3>Top ${F.top.length} prioridades (tema)</h3>
  <p class="mut">Incidência no CBR (75%) e no banco (25%) × seu erro × facilidade × o que ainda não fez. A meta divide o orçamento entre os temas, só com fáceis e médias que faltam.</p>
  ${F.top.length?`<div class="tw"><table><tr><th>#</th><th>Área › Tema</th><th>Incid. CBR</th><th>Incid. geral</th><th>f/m/d CBR</th><th>Feitas</th><th>Acerto</th><th>Restam f+m</th><th>Meta</th><th></th></tr>${linhas}</table></div>`:'<p class="mut">Nenhum tema com fáceis ou médias pendentes.</p>'}
  <div class="row" style="margin-top:10px"><label>Bloco ${sel('n',String(foN()),[['10','10'],['20','20'],['30','30']]).replace("foSet('n',this.value)","foSetN(this.value)")}</label>
   <label class="row"><input type="checkbox" ${cfg.focoCbr!==false?'checked':''} onchange="foSetPref(this.checked)"> preferir questões do CBR</label>
   <button class="b" ${F.top.length?'':'disabled'} onclick="foMisto()">Bloco misto dos ${F.top.length} temas</button></div>
  <h3 style="margin-top:14px">Panorama</h3>
  <div class="row">Base: ${sel('b',foBaseSel,[['cbr','CBR'],['geral','Banco inteiro']])} Ordenar por: ${sel('o',foOrd,[['inc','incidência'],['fac','facilidade (mais fáceis)'],['erro','erro (seu)'],['rest','restantes']])}</div>
  ${pan('area','Por área')}${pan('tema','Por tema (top 30)')}${pan('sub','Por subtema (top 30)')}
  <p class="mut" style="margin-top:8px">Dificuldade (fácil / média / difícil; sem dado conta como média): CBR ${dp(D.cbr,D.nC)} · banco inteiro ${dp(D.geral,D.nG)} · seu acerto ${da}</p></div>`}



// ===== util =====
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const mdI=s=>esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g,'$1<i>$2</i>').replace(/^✔/,'<span class="ok">✔</span>').replace(/^✘/,'<span class="no">✘</span>');
function md(s){const L=String(s??'').replace(/\r/g,'').split('\n').map(l=>(l.match(/\*\*/g)||[]).length%2?l+'**':l);let h='',i=0;
  while(i<L.length){const l=L[i];
    if(/^\s*\|/.test(l)){const rows=[];while(i<L.length&&/^\s*\|/.test(L[i]))rows.push(L[i++]);
      const cel=r=>r.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim());const sep=rows[1]&&/^[\s|:-]+$/.test(rows[1]);
      const hd=sep?cel(rows[0]):null,bd=(sep?rows.slice(2):rows).map(cel);
      h+='<div class="mdt"><table>'+(hd?'<tr>'+hd.map(c=>'<th>'+mdI(c)+'</th>').join('')+'</tr>':'')+bd.map(r=>'<tr>'+r.map(c=>'<td>'+mdI(c)+'</td>').join('')+'</tr>').join('')+'</table></div>';continue}
    if(/^\s*[-•]\s+/.test(l)){h+='<ul>';while(i<L.length&&/^\s*[-•]\s+/.test(L[i]))h+='<li>'+mdI(L[i++].replace(/^\s*[-•]\s+/,''))+'</li>';h+='</ul>';continue}
    if(/^\s*\d+[.)]\s+/.test(l)){h+='<ol>';while(i<L.length&&/^\s*\d+[.)]\s+/.test(L[i]))h+='<li>'+mdI(L[i++].replace(/^\s*\d+[.)]\s+/,''))+'</li>';h+='</ol>';continue}
    if(!l.trim()){i++;continue}
    h+='<p>'+mdI(l)+'</p>';i++}
  return h}

// ===== texto formatado (flashcards): HTML limpo, marcado com ⁣ no início =====
const RTM='⁣',isRt=s=>typeof s==='string'&&s[0]===RTM;
const RT_MAP={B:'b',STRONG:'b',I:'i',EM:'i',U:'u',SUB:'sub',SUP:'sup',UL:'ul',OL:'ol',LI:'li',P:'div',DIV:'div',TR:'div',BLOCKQUOTE:'div'};
function rtClean(html){
  const t=document.createElement('template');t.innerHTML=String(html||'');
  const walk=n=>{let out='';n.childNodes.forEach(c=>{
    if(c.nodeType===3){out+=esc(c.nodeValue.replace(/[\r\n\t]+/g,' '));return}
    if(c.nodeType!==1)return;const tg=c.tagName;
    if(/^(SCRIPT|STYLE|META|TITLE|HEAD|LINK|IMG|SVG|IFRAME|OBJECT|BUTTON|INPUT)$/.test(tg))return;
    if(tg==='BR'){out+='<br>';return}
    let inner=walk(c),T=RT_MAP[tg]||null;const st=c.getAttribute('style')||'';
    if((tg==='B'||tg==='STRONG')&&/font-weight:\s*(normal|[1-4]00)/i.test(st))T=null;
    if(T!=='b'&&/font-weight:\s*(bold|[6-9]00)/i.test(st))inner='<b>'+inner+'</b>';
    if(T!=='i'&&/font-style:\s*italic/i.test(st))inner='<i>'+inner+'</i>';
    if(T!=='u'&&/text-decoration[^;]*underline/i.test(st))inner='<u>'+inner+'</u>';
    if(/^H[1-6]$/.test(tg)){inner='<b>'+inner+'</b>';T='div'}
    if(tg==='TD'||tg==='TH')inner+=' ';
    out+=T?`<${T}>${inner}</${T}>`:inner});return out};
  return walk(t.content).replace(/(<br>)+$/,'').trim();
}
const rtHtml=s=>isRt(s)?rtClean(s.slice(1)):esc(s||'').replace(/\n/g,'<br>');
function rtTxt(s){if(!isRt(s))return s||'';const d=document.createElement('div');d.innerHTML=rtClean(s.slice(1)).replace(/<br>|<\/div>|<\/li>/g,'$& ');return d.textContent.replace(/\s+/g,' ').trim()}
const rtVal=h=>{const c=rtClean(h);const d=document.createElement('div');d.innerHTML=c;return d.textContent.trim()?RTM+c:''};
function rtPaste(e){e.preventDefault();const cd=e.clipboardData,h=cd.getData('text/html');
  document.execCommand('insertHTML',false,h?rtClean(h):esc(cd.getData('text/plain')).replace(/\r?\n/g,'<br>'))}
const rtCmd=c=>`onmousedown="event.preventDefault();document.execCommand('${c}')"`;
function rtEd(id,html,minH,key,ph){return `<div class="rtbar"><button type="button" title="Negrito (Ctrl+B)" ${rtCmd('bold')}><b>B</b></button><button type="button" title="Itálico (Ctrl+I)" ${rtCmd('italic')}><i>I</i></button><button type="button" title="Sublinhado (Ctrl+U)" ${rtCmd('underline')}><u>U</u></button><button type="button" title="Lista" ${rtCmd('insertUnorderedList')}>•</button><button type="button" title="Limpar formatação" ${rtCmd('removeFormat')}>T̸</button></div><div id="${id}" class="rte" contenteditable="true" data-ph="${esc(ph||'')}" style="min-height:${minH}px" oninput="${key}=this.innerHTML" onpaste="rtPaste(event)">${html||''}</div>`}
const norm=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const DAY=864e5;
const load=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}};
const saveL=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};

// ===== áreas do edital (ordem = prioridade de classificação) =====
const AREAS=[
 {id:'dens',nome:'Densitometria Óssea',kw:['densitom']},
 {id:'mama',nome:'Mama',kw:['mama','mamograf']},
 {id:'ped',nome:'Pediatria',kw:['pediatr']},
 {id:'int',nome:'Procedimentos intervencionistas',kw:['intervencion','tecnicas interv']},
 {id:'cp',nome:'Cabeça e pescoço',kw:['cabeca e pescoco','tireoide','laringe','paratireo','salivar']},
 {id:'neuro',nome:'Neurorradiologia',kw:['neuro','encefal','cranio','sistema nervoso','coluna','medula','hipofis','sela turcica']},
 {id:'fis',nome:'Física e proteção radiológica',kw:['fisica','protecao','radioprotecao','dosimetria']},
 {id:'seg',nome:'Segurança, qualidade e estatística',kw:['seguranca','estatistica','informatica']},
 {id:'cont',nome:'Assistência à vida e contraste',kw:['contraste','reacoes adversas','anafil','farmacolog','assistencia a vida']},
 {id:'go',nome:'Ginecologia e Obstetrícia',kw:['obstet','ginecolog','feto','reprodutivo','gestac','ovario','anexo','utero','endometri','pelve feminina','trompa']},
 {id:'dop',nome:'Doppler',kw:['doppler','vascular','vasos']},
 {id:'tor',nome:'Tórax',kw:['torax','toracic','pulmao','respirat','mediastino','intersticial','pleura']},
 {id:'dig',nome:'Trato gastrointestinal',kw:['digest','gastro','hepat','figado','vesicula','vias biliares','pancrea','intestin','veia porta','esofago','colon']},
 {id:'uro',nome:'Trato urogenital',kw:['urogenital','geniturinario','rim','renal','bexiga','prostat','genital masculino','urinari','adrenal']},
 {id:'msk',nome:'Musculoesquelético',kw:['musculoesquel','osso','articul','ortoped']},
];
const SEM={id:'sem',nome:'Sem classificação'};
// Compatibilidade com questões antigas enquanto o repositório realoca a área usg.
const AREA_BY=Object.fromEntries([...AREAS,SEM,{...SEM,id:'usg'}].map(a=>[a.id,a]));
const ORDEM_AREAS_ESTUDAR=['neuro','cp','tor','mama','dig','uro','go'];
const nomeArea=s=>({'sistema digestorio':'Trato gastrointestinal','sistema urogenital':'Trato urogenital','us em ginecologia e obstetricia':'Ginecologia e Obstetrícia'}[norm(s)]||s);
const META=new Set(['medicina','radiologia','provas cbr','titulo','titulo rddi','teorica','teorico-pratica','primeiro semestre','segundo semestre','imagem diagnostica','prova seriada','autorais']);
const isMeta=t=>META.has(norm(t))||/^20\d\d$/.test(t);
function areaDe(q){
  const ov=over[q.id]; if(ov) return ov; if(q.ar&&AREA_BY[q.ar]) return q.ar;
  const tg=q.tags.map(norm);
  for(const a of AREAS) if(tg.some(t=>a.kw.some(k=>t.includes(k)))) return a.id;
  return 'sem';
}
// Dimensões dentro de cada grande área: método de imagem, órgão, tema (doença/assunto) e tipo de conteúdo.
const METODOS=[['TC',/tomografia|hrct|angiotomografia/],['RM',/ressonancia|\bmri\b/],['USG',/ultrassonografia|ultrassom|\busg\b|doppler/],['RX',/radiografia|raios? x\b/],['Mamografia',/mamografia|tomossintese/],['Angio/Fluoro',/angiografia|fluoroscopia|histerossalpingografia|urografia/],['Med. nuclear',/\bpet\b|cintilografia|medicina nuclear|spect/],['DXA',/absorciometria|\bdxa\b/]];
const METODOS_DADOS=window.METODOS_DADOS&&Array.isArray(window.METODOS_DADOS.ordem)&&window.METODOS_DADOS.q&&typeof window.METODOS_DADOS.q==='object'?window.METODOS_DADOS:null;
const RE_AREA=/^(radiologia|torax|toracico|respiratorio|pediatria|mama|neurorradiologia|densitometria ossea|cabeca e pescoco|urogenital|geniturinario|usg geral|gastrointestinal|hepatobiliar|musculoesqueletico|sistema esqueletico|sistema nervoso central|vascular|vascular e intervencionista|reprodutivo|ginecologia|obstetricia|endocrino|endocrinologia|radiologia intervencionista|ultrassom ginecologico|uro|abdome superior|pelve|oncologia)$/;
const ORG=[['Rim e vias urinárias',/\b(rim|rins|ureteres?|bexiga|urinari\w*|renal|renais|jup)\b/],['Adrenal',/\badrenal\b/],['Fígado e vias biliares',/\b(figado|hepatic\w*|vesicula|vias biliares|biliar|porta)\b/],['Pâncreas',/\bpancreas\b/],['Trato digestório',/\b(esofago|estomago|intestino|colon|reto|apendice|gastro\w*)\b/],['Pulmão e pleura',/\b(pulmao|pleura|pulmonar)\b/],['Mediastino e coração',/\b(mediastino|mediastinal|coracao|cardiaco)\b/],['Útero, ovários e pelve',/\b(ovario|ovarios|ovariana|utero|anexo|trompas|pelve|pelvico|colo uterino|endometri\w*)\b/],['Feto e placenta',/\b(feto|fetal|placenta)\b/],['Mama',/\bmama\b/],['Hipófise',/\b(hipofise|sela turcica)\b/],['Cérebro e crânio',/\b(cerebro|encefalo|cranio|craneo)\b/],['Coluna e medula',/\b(coluna|medula)\b/],['Osso e articulações',/\b(osso|ossos|esqueleto|articulacao|articulacoes|joelho|ombro|quadril|punho|mao|pe|tornozelo|cotovelo|patela|patelar|musculo|quadriceps|tarsais)\b/],['Vasos',/\b(veia|veias|arteria|arterias|aorta|vasos|jugular)\b/],['Tireoide e pescoço',/\b(tireoide|paratireoide|pescoco|salivares)\b/],['Parede abdominal',/\bparede abdominal\b/],['Testículo, escroto e próstata',/\b(testiculo|escroto|prostata|genital masculino)\b/],['Linfonodos',/\blinfonodos?\b/]];
const RE_TIPO=/^(anatomia radiologica|protocolo de exame|posicionamento|tecnicas?\b.*|seguimento|controle pos-procedimento|resposta terapeutica|lexico|forma|realce|teste laboratorial|preparo|indicacao|criterios de apropriabilidade|diretrizes de pratica clinica|qualidade de imagem|fisiologia|farmacologia|fisica|complicacao.*|variante anatomica)$/;
const _tx={};
function taxo(t){const n=norm(t);if(_tx[n])return _tx[n];
  let r;const mm=METODOS.find(([,re])=>re.test(n));
  if(mm)r={d:'m',v:mm[0]};else if(RE_AREA.test(n))r={d:'a',v:t};else if(RE_TIPO.test(n))r={d:'p',v:t};else if(ORG.some(([,re])=>re.test(n)))r={d:'o',v:ORG.find(([,re])=>re.test(n))[0]};else r={d:'t',v:t};
  return _tx[n]=r}
const DIMS=[['m','Método de imagem'],['o','Órgão'],['t','Tema / doença'],['p','Tipo de conteúdo']];
function classTags(q){q._x={m:[],o:[],t:[],p:[],g:[]};q.tags.filter(t=>!isMeta(t)).forEach(t=>{const x=taxo(t);if(x.d!=='a'&&!q._x[x.d].includes(x.v))q._x[x.d].push(x.v)});if(METODOS_DADOS)q._x.m=[...new Set((METODOS_DADOS.q[q.id]||[]).filter(v=>METODOS_DADOS.ordem.includes(v)))];if(q.cl&&q.cl.length){q._x.o=[];q._x.t=[q.cl.slice(0,2).join(' › ')]}}
const posDe=q=>q.n??1e5; // posição da questão na página "Questões" do Notion (1 = primeira)
const etapaDe=q=>{const t=q.tags.map(norm);return t.includes('teorico-pratica')?'prática':t.includes('teorica')?'teórica':'?'};
const anoDe=q=>(q.tags.find(t=>/^20\d\d$/.test(t))||'');

// ===== dificuldade exclusivamente pelo percentual dos alunos no PersonalRad =====
const DIF={f:{nome:'Fácil',meta:95,w:1.5},m:{nome:'Média',meta:75,w:1.2},d:{nome:'Difícil',meta:20,w:0.5}};
const PARAM_DEF={facil_min:60,dificil_max:30,meta_facil:95,meta_media:75,meta_dificil:20,freq_ri:5,freq_rt:2,rev_pct:15,ia_estilo:''};
let PARAM={...PARAM_DEF};
const acertoPR=q=>{const ac=prStats(q).acerto;return typeof ac==='number'&&Number.isFinite(ac)&&ac>=0&&ac<=100?ac:null};
const acertoDe=q=>q._acertoManual?q.acerto:acertoPR(q)??q.acerto;
const difAcerto=ac=>ac==null?null:ac>60?'f':ac<30?'d':'m';
const difDe=q=>difAcerto(acertoPR(q));
let metoU=0,metodo=window.METODO||'',metEdit=false;
try{const _m=JSON.parse(localStorage.getItem('cbr_metodo'));if(_m&&_m.t){metodo=_m.t;metoU=_m.u||0}}catch(e){}
function lerManual(txt){
  const P={...PARAM_DEF};
  String(txt).split('\n').forEach(l=>{const m=/^@param\s+(\w+)\s*=\s*(.*)$/.exec(l.trim());if(m){const v=m[2].trim();P[m[1]]=v===''||isNaN(+v)?v:+v}});
  PARAM=P;DIF.f.meta=P.meta_facil;DIF.m.meta=P.meta_media;DIF.d.meta=P.meta_dificil;
  if(typeof Q!=='undefined')Q.forEach(q=>q._d=difDe(q));
}

// ===== estado =====
const DIAS=['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'],DIAS_S=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
const TIPOS=[
 {k:'et',nome:'Estudo Teórico',desc:'Tópicos sugeridos para você estudar por conta própria'},
 {k:'ri',nome:'Revisão Inteligente',desc:'Questões dos temas mais frequentes, com revisão espaçada'},
 {k:'rt',nome:'Revisão Teórica',desc:'Resumo do tema + 10 questões'},
 {k:'ps',nome:'Provas e simulados',desc:'Simulado cronometrado'}];
const DATA_PROVA='2026-12-12',RI_DIARIA=50;
const defCfg=()=>({pesos:{},diario:50,fcNovos:20,fcMax:200,prova:DATA_PROVA,tema:'auto',fs:93,tabs:[],pnOrd:[],keys:{},ri:null,est:null,etDone:{},agenda:{et:[1,1,1,0,0,0,0],ri:[1,1,1,1,1,0,0],rt:[0,0,1,1,0,0,0],ps:[0,0,0,0,0,1,1]}});
const normCfg=c=>{c=Object.assign(defCfg(),c||{});c.prova=DATA_PROVA;c.nomes=c.nomes||{};c.ests=c.ests||[];
  if(c.est){if(!c.ests.some(x=>x.ids===c.est.ids))c.ests.push({id:'m'+(c.est.u||0),...c.est});c.est=null}/* migra o estudo único antigo */c.agenda=Object.assign(defCfg().agenda,c.agenda||{});c.keys=c.keys||{};c.etDone=c.etDone||{};return c};
let Q=window.QUESTOES||[];
let all=load('cbr_log',[]);          // {q,t,ok,conf,ms,modo,x} (x = anulada)
let log=all.filter(l=>!l.x);         // respostas válidas
let pon=load('cbr_pon',{});          // id -> {t,u} ponto de ensino editado
let ia=load('cbr_ia',{});            // id -> resumo gerado pelo Claude
let cards=load('cbr_cards',[]);      // {id,f,v,tg,u,x}
let fcs=load('cbr_fcs',{});          // id -> [ease,ivl,reps,due,lapses,t,susp]
let over=load('cbr_over',{});        // id -> areaId (manual)
let uimg=load('cbr_uimg',{});        // id -> dataURL das imagens que você adicionou nas questões (referência "u:ID")
const imgSrc=u=>String(u).startsWith('gh:')?(window.BCBR&&BCBR.imgPronta(String(u).slice(3))||'./img/'+encodeURIComponent(String(u).slice(3))):String(u).startsWith('u:')?(uimg[u.slice(2)]||''):((window.IMGDATA&&window.IMGDATA[u])||u);
let cfg=normCfg(load('cbr_cfg',{}));
// nomes que você deu às grandes áreas e aos temas (só o rótulo muda; as tags das questões ficam como estão)
const dn=(d,v)=>cfg.nomes[d+'|'+v]||v;
function aplicaNomes(){AREAS.concat(SEM).forEach(a=>{if(a._n===undefined)a._n=a.nome;a.nome=nomeArea(cfg.nomes['a|'+a.id]||a._n)})}
aplicaNomes();
let estU=load('cbr_u',0),resetAt=load('cbr_reset',0);
let srs={};                          // derivado do log
const INTERV=[30,60,120,200,300,420,540]; // dias até rever
const ERRO_D=14; // erro: volta só daqui a 14 dias (e reentra na caixa 1, não na 0)
let QID=Object.fromEntries(Q.map(q=>[q.id,q]));
lerManual(metodo);
Q.sort((a,b)=>posDe(a)-posDe(b));
function refQ(q){q.tags=q.tags.map(nomeArea);classTags(q);q.enunciado=[...new Set(q.enunciado.replace(/#WO#/g,"").split(/\n/).map(s=>s.trim()))].filter(Boolean).join("\n");q._a=areaDe(q);q._d=difDe(q)}
// edições do usuário (enunciado, alternativas, gabarito, comentários, tags, acerto): guardadas em pon['e:ID'] e sincronizadas junto com os pontos de ensino
function aplicaEd(q){
  if(!q._b)q._b=JSON.parse(JSON.stringify({enunciado:q.enunciado,alts:q.alts,gab:q.gab,coment:q.coment,tags:q.tags,acerto:q.acerto,imgs:q.imgs||[],imgsCom:q.imgsCom||[],cl:q.cl||[],dif:q.dif||null}));
  Object.assign(q,JSON.parse(JSON.stringify(q._b)));
  const e=pon['e:'+q.id]&&pon['e:'+q.id].e;if(e)Object.assign(q,JSON.parse(JSON.stringify(e)));
  q._difManual=!!(e&&DIF[e.dif]);
  q._acertoManual=!!(e&&e.acerto!=null&&(e.acertoManual??(e.acerto!==q._b.acerto)));
  refQ(q);
}
const aplicaEdTodas=()=>{Q.forEach(aplicaEd)};
function edSet(id,patch){const k='e:'+id,cur=(pon[k]&&pon[k].e)||{};pon[k]={e:patch===null?null:{...cur,...patch},u:Date.now()};persist('p:'+hk(k,8));aplicaEd(QID[id])}
Q.forEach(aplicaEd);
const reArea=()=>Q.forEach(q=>q._a=areaDe(q));
function aplicaSrs(l){
  const s=srs[l.q]??{box:0,due:0,n:0};
  if(!l.ok) s.box=1; else if(l.conf==='certeza') s.box=Math.min(s.box+1,INTERV.length-1); else if(l.conf==='chute') s.box=Math.max(0,s.box-1);
  s.n++;s.due=l.t+(l.ok?INTERV[s.box]:ERRO_D)*DAY;srs[l.q]=s;
}
function rebuildSrs(){srs={};log.slice().sort((a,b)=>a.t-b.t).forEach(aplicaSrs)}
rebuildSrs();

// ===== tema claro/escuro =====
function aplicaTema(){const t=cfg.tema||'auto',r=document.documentElement;r.style.setProperty('--fs',(cfg.fs||93)/100);
  if(t==='claro')r.dataset.theme='light';else if(t==='escuro')r.dataset.theme='dark';else delete r.dataset.theme;
  const b=$('#tg');if(b){b.textContent=t==='auto'?'◐':t==='claro'?'☀':'☾';b.title=b.ariaLabel='Tema: '+t}}
function ciclaTema(){cfg.tema={auto:'claro',claro:'escuro',escuro:'auto'}[cfg.tema||'auto'];saveL('cbr_tema',cfg.tema);aplicaTema();persist()}
try{const lt=localStorage.getItem('cbr_tema');if(lt)cfg.tema=JSON.parse(lt)}catch(e){}

// ===== persistência: local + sincronização automática (db do Artifact) =====
let DB=null,syncSt='local',dirty=new Set(),estDirty=false,flushT=null,retryT=null,primeiro=true;
const wkKey=t=>{const d=new Date(t);d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const packLog=l=>[l.q,l.t,l.ok?1:0,l.conf||'',l.ms||0,l.modo||'',l.x?1:0,l.e||''];
const unpackLog=a=>({q:a[0],t:a[1],ok:!!a[2],conf:a[3],ms:a[4],modo:a[5],x:a[6]?1:0,e:a[7]||''});
const hk=(id,m)=>[...String(id)].reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,7)%m;
function recalc(){log=all.filter(l=>!l.x);rebuildSrs()}
function persist(wk){
  saveL('cbr_log',all);saveL('cbr_over',over);saveL('cbr_cfg',cfg);saveL('cbr_cards',cards);saveL('cbr_fcs',fcs);saveL('cbr_ia',ia);saveL('cbr_pon',pon);
  if(wk&&wk!=='_est')dirty.add(wk);
  if(!wk||wk==='_est'){estU=Date.now();saveL('cbr_u',estU)}
  estDirty=true;saveL('cbr_reset',resetAt);
  clearTimeout(flushT);flushT=setTimeout(flush,700);
}
function setSync(s){syncSt=s;const el=$('#sync');if(!el)return;
  el.className=s;el.querySelector('span').textContent={ok:'Sincronizado',saving:'Salvando…',err:'Sem conexão, tentando de novo',local:'Só neste aparelho'}[s]}
async function flush(){
  if(!DB)return;setSync('saving');const tentadas=[...dirty],tinhaEst=estDirty;
  try{
    const col=DB.collection('cbr');
    if(estDirty){estDirty=false;await col.doc('estado').set({over,cfg,u:estU,resetAt})}
    for(const wk of [...dirty]){dirty.delete(wk);
      if(wk.startsWith('c:')){const k=+wk.slice(2);await col.doc('cards_'+k).set({items:cards.filter(c=>hk(c.id,32)===k).map(c=>[c.id,c.f,c.v,c.tg||'',c.u||0,c.x?1:0])})}
      else if(wk.startsWith('g:')){const id=wk.slice(2);if(uimg[id])await col.doc('uimg_'+id).set({d:uimg[id]})}
      else if(wk.startsWith('m:'))await col.doc('metodo').set({t:metodo,u:metoU})
      else if(wk.startsWith('p:')){const k=+wk.slice(2),o={};Object.keys(pon).forEach(id=>{if(hk(id,8)===k)o[id]=pon[id]});await col.doc('pon_'+k).set({m:o})}
      else if(wk.startsWith('i:')){const k=+wk.slice(2),o={};Object.keys(ia).forEach(id=>{if(hk(id,8)===k)o[id]=ia[id]});await col.doc('ia_'+k).set({m:o})}
      else if(wk.startsWith('s:')){const k=+wk.slice(2),o={};Object.keys(fcs).forEach(id=>{if(hk(id,8)===k)o[id]=fcs[id]});await col.doc('fcs_'+k).set({s:o})}
      else await col.doc('log_'+wk).set({items:all.filter(l=>wkKey(l.t)===wk).map(packLog)})}
    setSync('ok');
  }catch(e){tentadas.forEach(k=>dirty.add(k));if(tinhaEst)estDirty=true;setSync('err');clearTimeout(retryT);retryT=setTimeout(flush,15000)}
}
function mergeRemote(docs){
  let changed=false;const rc={};
  const est=docs.find(d=>d.id==='estado');
  if(est){const x=est.data()||{};
    if((x.resetAt||0)>resetAt){resetAt=x.resetAt;const n=all.length;all=all.filter(l=>l.t>=resetAt);if(all.length!==n)changed=true}
    if((x.u||0)>estU){
      const nova=normCfg(x.cfg),ri=riPreserva(cfg.ri,nova.ri),republica=JSON.stringify(ri)!==JSON.stringify(nova.ri);
      nova.ri=ri;over=x.over||{};cfg=nova;aplicaNomes();estU=x.u;saveL('cbr_u',estU);reArea();aplicaTema();changed=true;
      if(republica)persist('_est');
    }
    else if((x.u||0)<estU)estDirty=true;
  }else estDirty=true;
  const idx=new Map(all.map(l=>[l.q+'|'+l.t,l]));
  const cidx=new Map(cards.map(c=>[c.id,c]));
  docs.forEach(d=>{const x=d.data()||{};
    if(d.id.startsWith('log_')){const it=x.items||[];rc[d.id]=it.length;
      it.forEach(a=>{const k=a[0]+'|'+a[1];if(a[1]<resetAt)return;const ex=idx.get(k);
        if(!ex){const l=unpackLog(a);all.push(l);idx.set(k,l);changed=true}
        else if(a[6]&&!ex.x){ex.x=1;changed=true}})}
    else if(d.id.startsWith('cards_')){const it=x.items||[];rc[d.id]=it.length;
      it.forEach(a=>{const ex=cidx.get(a[0]);
        if(!ex){const c={id:a[0],f:a[1],v:a[2],tg:a[3],u:a[4],x:a[5]};cards.push(c);cidx.set(c.id,c);changed=true}
        else if((a[4]||0)>(ex.u||0)){Object.assign(ex,{f:a[1],v:a[2],tg:a[3],u:a[4],x:a[5]});changed=true}})}
    else if(d.id==='metodo'){if((x.u||0)>metoU){metodo=x.t;metoU=x.u;saveL('cbr_metodo',{t:metodo,u:metoU});lerManual(metodo);changed=true}}
    else if(d.id.startsWith('pon_')){const o=x.m||{};Object.keys(o).forEach(id=>{if(!pon[id]||(o[id].u||0)>(pon[id].u||0)){pon[id]=o[id];changed=true}})}
    else if(d.id.startsWith('uimg_')){const id=d.id.slice(5);if(x.d&&!uimg[id]){uimg[id]=x.d;changed=true}}
    else if(d.id.startsWith('ia_')){const o=x.m||{};Object.keys(o).forEach(id=>{if(!ia[id]){ia[id]=o[id];changed=true}})}
    else if(d.id.startsWith('fcs_')){const o=x.s||{};
      Object.keys(o).forEach(id=>{const ex=fcs[id];if(!ex||(o[id][5]||0)>(ex[5]||0)){fcs[id]=o[id];changed=true}})}
  });
  const lc={};all.forEach(l=>{const w=wkKey(l.t);lc[w]=(lc[w]||0)+1});
  Object.keys(lc).forEach(w=>{if(lc[w]>(rc['log_'+w]||0))dirty.add(w)});
  const cc={};cards.forEach(c=>{const k=hk(c.id,32);cc[k]=(cc[k]||0)+1});
  Object.keys(cc).forEach(k=>{if(cc[k]>(rc['cards_'+k]||0))dirty.add('c:'+k)});
  if(metoU&&!docs.some(d=>d.id==='metodo'||false))dirty.add('m:0');
  else{const md=docs.find(d=>d.id==='metodo');if(md&&(md.data().u||0)<metoU)dirty.add('m:0')}
  const pk={};Object.keys(pon).forEach(id=>pk[hk(id,8)]=1);Object.keys(pk).forEach(k=>{if(!docs.some(d=>d.id==='pon_'+k))dirty.add('p:'+k)});
  Object.keys(uimg).forEach(id=>{if(!docs.some(d=>d.id==='uimg_'+id))dirty.add('g:'+id)});
  const ik={};Object.keys(ia).forEach(id=>ik[hk(id,8)]=1);Object.keys(ik).forEach(k=>{if(!docs.some(d=>d.id==='ia_'+k))dirty.add('i:'+k)});
  const sk={};Object.keys(fcs).forEach(id=>sk[hk(id,8)]=1);
  Object.keys(sk).forEach(k=>{if(!docs.some(d=>d.id==='fcs_'+k))dirty.add('s:'+k)});
  if(changed){aplicaEdTodas();all.sort((a,b)=>a.t-b.t);recalc();saveL('cbr_log',all);saveL('cbr_over',over);saveL('cbr_cfg',cfg);saveL('cbr_reset',resetAt);saveL('cbr_cards',cards);saveL('cbr_fcs',fcs);saveL('cbr_ia',ia);saveL('cbr_pon',pon);saveL('cbr_uimg',uimg)}
  if(dirty.size||estDirty)flush();else setSync('ok');
  if(changed&&tela!=='quiz'&&tela!=='fcstudy')render();
}
async function iniciaSync(){
  try{
    const db=await claude.use('db');
    if(!db){smSyncResolve();return;}
    DB=db;setSync('saving');
    DB.collection('cbr').onSnapshot(s=>{mergeRemote(s.docs);smSyncResolve()},()=>{setSync('err');smSyncResolve()});
  }catch(e){setSync('err');smSyncResolve()}
}

// ===== estatísticas =====
function statsPor(fn){
  const S={};
  Q.forEach(q=>{const k=fn(q);(S[k]??={n:0,ok:0,solido:0,banco:0,vistas:new Set()}).banco++});
  log.forEach(l=>{const q=QID[l.q];if(!q)return;const s=S[fn(q)];if(!s)return;s.n++;if(l.ok)s.ok++;if(l.ok&&l.conf==='certeza')s.solido++;s.vistas.add(l.q)});
  return S;
}
const acertoSuav=s=>(s.ok+1)/(s.n+2);
function pesoArea(id,S){if(cfg.pesoAuto===false&&cfg.pesos[id]!=null)return cfg.pesos[id];return incidencia(id)}
function prioridades(){
  const S=statsPor(q=>q._a);const P={};
  Object.keys(S).forEach(id=>{if(id==='sem')return;P[id]=pesoArea(id,S)*(1-acertoSuav(S[id]))});
  return {S,P};
}

// ===== seleção de questões =====
function sorteioPonderado(cands,w,k,aplicarPR=true){
  const pool=cands.map(q=>({q,w:Math.max(w(q)*(aplicarPR?pesoPR(q):1),1e-6)})),out=[];
  while(out.length<k&&pool.length){
    let tot=pool.reduce((a,b)=>a+b.w,0),r=Math.random()*tot,i=0;
    for(;i<pool.length-1;i++){r-=pool[i].w;if(r<=0)break}
    out.push(pool.splice(i,1)[0].q);
  }
  return out;
}
const embaralha=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a};
const dKey=t=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
function riPreserva(local,remota){
  const hoje=dKey(Date.now()),valida=r=>r&&r.d===hoje&&Array.isArray(r.ids);
  if(!valida(local))return remota;
  if(!valida(remota))return local;
  return {...local,meta:Math.max(local.meta||0,remota.meta||0),ids:[...new Set([...local.ids,...remota.ids])]};
}
function riHoje(){ // mantém a ordem salva; completa até 50 e limita listas de versões antigas
  const d=dKey(Date.now()),meta=RI_DIARIA;
  let mudou=false;
  if(!cfg.ri||cfg.ri.d!==d||!Array.isArray(cfg.ri.ids)){
    cfg.ri={d,meta,ids:revisaoDoDia()};mudou=true;
  }
  const r=cfg.ri,alvo=meta;
  if(r.ids.length>alvo){r.ids=r.ids.slice(0,alvo);mudou=true} // migra listas antigas; respostas continuam no histórico
  if(r.meta!==alvo){r.meta=alvo;mudou=true}
  if(r.ids.length<alvo){
    const exclui=new Set(r.ids),n=alvo-r.ids.length;
    const extras=modoProva()?pacoteVolume(n,q=>!exclui.has(q.id)):revisaoDoDiaOrig(n,exclui);
    extras.forEach(id=>{if(!exclui.has(id)){r.ids.push(id);exclui.add(id);mudou=true}});
  }
  if(mudou)persist('_est');
  return cfg.ri.ids;
}
function iniciaRI(){
  const ids=riHoje(),h=hoje0(),done={};
  log.forEach(l=>{if(l.t>=h&&l.modo==='hoje'&&ids.includes(l.q))done[l.q]=l});
  const disponiveis=ids.filter(i=>QID[i]&&QID[i].gab);
  if(!disponiveis.length)return;
  iniciar(ids,'hoje');if(!sess)return;
  Object.values(done).forEach(l=>{sess.resp[l.q]={esc:l.e||null,conf:l.conf,ok:l.ok,t:l.t}});
  const first=sess.ids.findIndex(i=>!done[i]);
  sess.i=first<0?0:first;render();
}
function revisaoDoDiaOrig(n=cfg.diario,exclui=new Set()){
  // prioridade: 1) questões ainda não respondidas; 2) repetição só do que já venceu, puxando erros,
  // temas mais incidentes (área) e questões fáceis que você erra
  const now=Date.now(),{P}=prioridades(),banco=Q.filter(q=>!exclui.has(q.id));
  const U={};log.forEach(l=>{const u=U[l.q]??={n:0,ok:0,t:0,last:true};u.n++;if(l.ok)u.ok++;if(l.t>=u.t){u.t=l.t;u.last=l.ok}});
  const novas=banco.filter(q=>q.gab&&!srs[q.id]);
  const venc=banco.filter(q=>q.gab&&srs[q.id]&&srs[q.id].due<=now);
  const cap=Math.max(1,Math.ceil(n*(+PARAM.rev_pct||15)/100)),nRev=Math.min(venc.length,Math.max(cap,n-novas.length)); // prioridade: questões novas; revisões limitadas a rev_pct% do dia (só sobem se faltarem novas)
  const med=Object.values(P).reduce((a,b)=>a+b,0)/(Object.keys(P).length||1)||1;
  const wRev=q=>{const u=U[q.id]||{n:0,ok:0,last:true},ua=(u.ok+1)/(u.n+2);
    const area=Math.min(3,Math.max(.3,(P[q._a]??med)/med)),err=(0.4+2.6*(1-ua))*(u.last?1:1.8),
      fac=q._d==='f'?1+1.5*(1-ua):q._d==='d'?.7:1;
    return area*err*fac};
  const revs=sorteioPonderado(venc,wRev,nRev);
  const w=q=>(P[q._a]??med)*DIF[q._d??'m'].w;
  const novos=sorteioPonderado(novas,w,n-revs.length);
  let ids=[...novos,...revs];
  if(ids.length<n){const t=new Set(ids.map(q=>q.id));ids=ids.concat(banco.filter(q=>q.gab&&!t.has(q.id)&&srs[q.id]&&(now-(U[q.id]?.t||0))>7*DAY).sort((a,b)=>srs[a.id].due-srs[b.id].due).slice(0,n-ids.length))}
  return embaralha(ids).map(q=>q.id);
}

// ===== temas (Revisão Teórica) =====
const MODAL=/^(ultrassonografia|ultrassom|tomografia computadorizada|imagem por ressonancia.*|radiografia)$/;
function temas(){
  const now=Date.now(),M={};
  Q.filter(q=>q.gab).forEach(q=>[...q._x.t,...q._x.o].forEach(t=>(M[t]??={t,qs:[],n:0,ok:0,ew:0,tw:0,last:0}).qs.push(q)));
  log.forEach(l=>{const q=QID[l.q];if(!q)return;[...q._x.t,...q._x.o].forEach(t=>{const x=M[t];if(!x)return;
    const w=DIF[q._d??'m'].w;x.n++;x.tw+=w;if(l.ok)x.ok++;else x.ew+=w;x.last=Math.max(x.last,l.t)})});
  const tot=Q.filter(q=>q.gab).length||1;
  return Object.values(M).map(x=>{
    const inc=(modoProva()?x.qs.reduce((a,q)=>a+({f:1,m:.6,d:.05}[q._d]??.6),0):x.qs.length)/tot*100,erro=(x.ew+0.5)/(x.tw+1),dias=x.last?(now-x.last)/DAY:30;
    const rec=1+Math.min(dias,30)/10;
    return {...x,inc,erro,dias,score:inc*(0.5+erro*1.5)*rec};
  }).sort((a,b)=>b.score-a.score);
}
function questoesTemaOrig(t){   // prioriza questões ainda não vistas; só entram poucas erradas há 14+ dias
  const base=Q.filter(q=>q.gab&&(q._x.t.includes(t)||q._x.o.includes(t)));
  const ult={};log.forEach(l=>ult[l.q]=l);const now=Date.now(),nova=q=>!ult[q.id];
  let sel=sorteioPonderado(base.filter(nova),()=>1,10);
  if(sel.length<10){const ids=new Set(sel.map(q=>q.id)),areas=new Set(base.map(q=>q._a));
    const rev=sorteioPonderado(base.filter(q=>!ids.has(q.id)&&ult[q.id]&&!ult[q.id].ok&&now-ult[q.id].t>=ERRO_D*DAY),q=>DIF[q._d??'m'].w,Math.min(10-sel.length,3));
    rev.forEach(q=>ids.add(q.id));sel=sel.concat(rev);
    if(sel.length<10){const extra=embaralha(Q.filter(q=>q.gab&&!ids.has(q.id)&&nova(q)));
      extra.sort((a,b)=>(areas.has(b._a)?1:0)-(areas.has(a._a)?1:0));sel=sel.concat(extra.slice(0,10-sel.length))}}
  return embaralha(sel).map(q=>q.id);
}let temaSel=null;

// ===== sessão de quiz =====
let sess=null,tela='tarefas',sub=null;
const cur=()=>QID[sess.ids[sess.i]];
function iniciar(ids,modo,sim){
  ids=ids.filter(i=>QID[i]&&QID[i].gab);
  if(!ids.length){toast('Nenhuma questão com gabarito nesse filtro.');return}
  sess={ids,i:0,modo,sim:!!sim,resp:{},selMap:{},cut:{},t0:Date.now(),tq:Date.now()};
  if(sim){const h=sim==='prática'?3.5:3;sess.deadline=Date.now()+h*3600e3;tick()}
  salvaEst();
  go('quiz');
}
// estudo iniciado na aba Estudar: fica salvo em cfg.est (sincronizado) até ser encerrado ou descartado
// (vários blocos podem ficar abertos ao mesmo tempo: cfg.ests = lista de estudos em andamento)
function syncEst(){if(sess&&sess.modo==='estudo'&&!sess.fim){
  if(!sess.estId)sess.estId='e'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  const e={id:sess.estId,ids:sess.ids,i:sess.i,resp:sess.resp,cut:sess.cut,t0:sess.t0,u:Date.now()},k=cfg.ests.findIndex(x=>x.id===e.id);
  k<0?cfg.ests.push(e):cfg.ests[k]=e}}
function salvaEst(){if(sess&&sess.modo==='estudo'&&!sess.fim){syncEst();persist('_est')}}
function retomaEst(id){
  const e=cfg.ests.find(x=>x.id===id);if(!e)return;const ids=e.ids.filter(i=>QID[i]&&QID[i].gab);
  if(!ids.length){descartaEst(id);return}
  const at=ids.indexOf(e.ids[e.i]);
  sess={ids,i:at<0?0:at,modo:'estudo',sim:false,estId:e.id,resp:e.resp||{},selMap:{},cut:e.cut||{},t0:e.t0||Date.now(),tq:Date.now()};
  go('quiz');
}
function descartaEst(id){cfg.ests=cfg.ests.filter(x=>x.id!==id);persist('_est');render();toast('Estudo descartado')}
function bannerEst(){
  if(!cfg.ests.length)return '';
  return cfg.ests.slice().sort((a,b)=>(b.u||0)-(a.u||0)).map(e=>{
    const rs=e.ids.map(i=>(e.resp||{})[i]).filter(Boolean),ok=rs.filter(r=>r.ok).length;
    const dt=e.u?new Date(e.u).toLocaleString('pt-BR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
    return `<div class="iab" style="margin:10px 0"><div class="kick">Estudo em andamento</div><p style="margin:6px 0">${rs.length} de ${e.ids.length} respondidas${rs.length?` · ${pct(ok,rs.length)}% de acerto`:''} · parou na questão ${e.i+1}${dt?` · salvo em ${dt}`:''}</p><div class="row"><button class="b" onclick="retomaEst('${e.id}')">Continuar</button><button class="b s" onclick="descartaEst('${e.id}')">Descartar</button></div></div>`}).join('')}
let tmr=null;
function tick(){clearInterval(tmr);tmr=setInterval(()=>{const el=$('#tm');if(!sess||!sess.sim){clearInterval(tmr);return}
  const r=sess.deadline-Date.now();if(r<=0){clearInterval(tmr);terminar();return}
  if(el){const s=r/1000|0;el.textContent=`${s/3600|0}:${String(s%3600/60|0).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}},1000)}
function irPara(i){if(!sess||i<0||i>=sess.ids.length)return;sess.i=i;sess.tq=Date.now();salvaEst();render();scrollTo(0,0)}
function selAtual(){const q=cur(),r=sess.resp[q.id];return sess.selMap[q.id]!==undefined?sess.selMap[q.id]:(r?r.esc:null)}
function precisaConf(){const q=cur(),r=sess.resp[q.id],sel=selAtual();return !!sel&&(!r||(sess.sim&&sel!==r.esc))}
function escolher(l){const q=cur();if(sess.resp[q.id]&&!sess.sim)return;sess.selMap[q.id]=l;render()}
function riscar(l){const q=cur();if(!l)return;const c=(sess.cut[q.id]??=[]),k=c.indexOf(l);k<0?c.push(l):c.splice(k,1);render()}
function anula(id){
  for(let k=all.length-1;k>=0;k--){const l=all[k];if(l.q===id&&!l.x&&l.t===sess.resp[id]?.t){l.x=1;dirty.add(wkKey(l.t));break}}
  recalc();delete sess.resp[id];
}
function responder(esc_,conf){
  const q=cur();if(sess.resp[q.id])anula(q.id);
  const ok=esc_===q.gab,ms=Date.now()-sess.tq;
  const l={q:q.id,t:Date.now(),ok,conf,ms,e:esc_,modo:sess.sim?'simulado':sess.modo};
  sess.resp[q.id]={esc:esc_,conf,ok,t:l.t};delete sess.selMap[q.id];
  all.push(l);log.push(l);aplicaSrs(l);syncEst();persist(wkKey(l.t));posResposta(q,l);
  if(sess.sim&&sess.i<sess.ids.length-1)irPara(sess.i+1);else render();
}
function editar(){const q=cur();if(!sess.resp[q.id])return;const esc_=sess.resp[q.id].esc;anula(q.id);syncEst();persist();sess.selMap[q.id]=esc_;render();toast('Resposta desfeita. Escolha de novo.')}
function proxima(){if(sess.i>=sess.ids.length-1){terminar();return}irPara(sess.i+1)}
function terminar(){clearInterval(tmr);sess.fim=true;if(sess.modo==='estudo'&&sess.estId){cfg.ests=cfg.ests.filter(x=>x.id!==sess.estId);persist('_est')}go('fim')}

// ===== abas: segurar e arrastar para reordenar =====
function tabsOrdenadas(){const base=TABS.map(t=>t[0]),o=(cfg.tabs||[]).filter(k=>base.includes(k));if(o.length&&!o.includes('semana'))o.splice(Math.max(0,o.indexOf('hoje'))+1,0,'semana');if(o.length&&!o.includes('questoes'))o.splice(o.indexOf('semana')+1,0,'questoes');for(const [k,antes] of [['tarefas','semana'],['notas','tarefas']]){if(o.length&&!o.includes(k))o.splice(o.indexOf(antes)+1,0,k)}base.forEach(k=>{if(!o.includes(k))o.push(k)});return o.map(k=>TABS.find(t=>t[0]===k))}
(function(){const n=$('#nav');let d=null,sem=false;
  const ini=()=>{d.on=true;d.b.classList.add('drag');d.rects=[...n.querySelectorAll('button')].map(x=>x.getBoundingClientRect());d.idx=[...n.querySelectorAll('button')].indexOf(d.b);d.t=d.idx};
  n.addEventListener('pointerdown',e=>{const b=e.target.closest('button[data-k]');if(!b)return;d={b,x0:e.clientX,on:false,touch:e.pointerType!=='mouse',h:null};
    if(d.touch)d.h=setTimeout(()=>{if(d&&!d.on){ini();if(navigator.vibrate)navigator.vibrate(15)}},380)});
  addEventListener('pointermove',e=>{if(!d)return;const dx=e.clientX-d.x0;
    if(!d.on){if(!d.touch&&Math.abs(dx)>6)ini();else{if(d.touch&&Math.abs(dx)>10){clearTimeout(d.h);d=null}return}}
    e.preventDefault();const r=d.rects,w=r[d.idx].width,c=r[d.idx].left+w/2+dx;
    let t=r.findIndex(x=>c>=x.left&&c<=x.right);if(t<0)t=c<r[0].left?0:r.length-1;d.t=t;
    [...n.querySelectorAll('button')].forEach((x,i)=>{if(i===d.idx)x.style.transform=`translateX(${dx}px)`;else x.style.transform=t>d.idx&&i>d.idx&&i<=t?`translateX(${-w}px)`:t<d.idx&&i<d.idx&&i>=t?`translateX(${w}px)`:''})},{passive:false});
  addEventListener('pointerup',()=>{if(!d)return;clearTimeout(d.h);
    if(d.on){const o=tabsOrdenadas().map(x=>x[0]),[k]=o.splice(d.idx,1);o.splice(d.t,0,k);sem=true;cfg.tabs=o;persist('_est');d=null;render();setTimeout(()=>sem=false,0)}else d=null});
  n.addEventListener('click',e=>{if(sem){e.stopPropagation();e.preventDefault()}},true);
})();

// ===== telas =====
const TABS=[['hoje','Hoje'],['semana','Calendário'],['tarefas','Tarefas'],['notas','Notas'],['questoes','Questões'],['estudar','Estudar'],['fc','Flashcards'],['painel','Painel'],['banco','Banco'],['config','Config']];
function go(t,s){if(t==='questoes'&&qAbre())return;if(t==='tarefas')smkIni();tela=t;sub=s??null;render();scrollTo(0,0)}
function render(){aplicaLayout();
  const ativa=tela==='quiz'?'questoes':tela==='fim'?'':tela==='rt'?'hoje':tela==='fcstudy'?'fc':tela;
  $('#nav').innerHTML=tabsOrdenadas().map(([k,n])=>`<button data-k="${k}" class="${ativa===k?'on':''}" onclick="go('${k}')">${n}</button>`).join('');
  const f={hoje:vHoje,agenda:vAgenda,rt:vRT,estudar:vEstudar,painel:vPainel,banco:vBanco,config:vConfig,quiz:vQuizQ,questoes:vQuestoes,fim:vFim,fc:vFc,fcstudy:vFcStudy,semana:vSemana,tarefas:vTarefas,notas:vNotas}[tela];
  qPinta(f());
  if(tela==='quiz'&&sess?.sim)tick();
}
const pct=(a,b)=>b?Math.round(a/b*100):0;
const barra=(v,cls='',meta)=>`<div class="bar ${cls}"><i style="width:${Math.max(0,Math.min(100,v))}%"></i>${meta!=null?`<u style="left:${meta}%"></u>`:''}</div>`;
const corAc=v=>v>=70?'g':v>=60?'w':'r';
const difTag=q=>q._d?`<span class="dif ${q._d}"><i></i>${DIF[q._d].nome} · ${acertoPR(q).toLocaleString('pt-BR',{maximumFractionDigits:2})}%</span>`:'';
const hoje0=()=>new Date().setHours(0,0,0,0);
const idxHoje=()=>(new Date().getDay()+6)%7;
const CK='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';

// progresso por tipo em um dia (di = deslocamento em ms desde segunda da semana atual)
const MODO={ri:'hoje',rt:'rt',ps:'simulado'},ALVO={ri:()=>metaHoje(),rt:()=>10,ps:()=>30};
function progDia(k,ini){
  if(k==='et'){const n=cfg.etDone[dKey(ini)]?1:0;return {n,alvo:1,ok:!!n}}
 const n=log.filter(l=>l.t>=ini&&l.t<ini+DAY&&l.modo===MODO[k]).length;return {n,alvo:ALVO[k](),ok:n>=ALVO[k]()}}
const segunda=()=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-idxHoje());return +d};

function vHoje(){
  const now=Date.now(),devidas=Q.filter(q=>srs[q.id]&&srs[q.id].due<=now).length;
  const hojeLog=log.filter(l=>l.t>=hoje0());
  const okH=hojeLog.filter(l=>l.ok).length,tot=log.length,ok=log.filter(l=>l.ok).length;
  const dias=new Set(log.map(l=>new Date(l.t).toDateString()));let seq=0;
  for(let d=new Date();dias.has(d.toDateString())||(seq===0&&(d.setDate(d.getDate()-1),dias.has(d.toDateString())));d.setDate(d.getDate()-1))seq++;
  const diasProva=Math.ceil((new Date(DATA_PROVA+'T12:00')-now)/DAY);
  const ti=idxHoje(),hoje=segunda()+ti*DAY;
  const agendados=TIPOS.filter(t=>cfg.agenda[t.k][ti]),extras=TIPOS.filter(t=>!cfg.agenda[t.k][ti]);
  const tm=temas()[0];
  const card=(t,extra)=>{const p=progDia(t.k,hoje);
    const corpo=t.k==='et'?etCorpo():t.k==='ri'?`<p class="mut">${riDesc(devidas)}</p><div class="row"><button class="b" onclick="iniciaRI()">${p.n?'Continuar':'Começar'}</button></div>`
     :t.k==='rt'?`<p class="mut">${tm?`Tema sugerido: <b style="color:var(--tx)">${esc(tm.t)}</b> (${Math.round(tm.inc)}% do banco, ${Math.round(tm.erro*100)}% de erro ponderado, ${tm.last?'visto há '+Math.round(tm.dias)+' d':'nunca visto'}).`:'Sem temas ainda.'}</p><div class="row"><button class="b" onclick="temaSel=null;go('rt')">Resumo + 10 questões</button></div>`
     :`<p class="mut">60 questões sorteadas conforme o peso das áreas, sem feedback até o fim.</p><div class="row"><button class="b s" onclick="simulado('teórica')">Teórica · 3h</button><button class="b s" onclick="simulado('prática')">Teórico-prática · 3h30</button></div>`;
    return `<div class="card ${p.ok?'feito':''}" id="card_${t.k}"><div class="row" style="justify-content:space-between"><span class="kick">${extra?'Extra':'Hoje'}</span><span class="pill ${p.ok?'ok':''}">${p.ok?'Concluída':p.n+'/'+p.alvo}</span></div><h3>${t.nome}</h3>${barra(pct(p.n,p.alvo),p.ok?'g':'')}${corpo}</div>`};
  return `<div style="display:flex;justify-content:space-between;align-items:end;flex-wrap:wrap;gap:8px;margin-bottom:14px"><div><div class="kick">${DIAS[ti]}, ${new Date().toLocaleDateString('pt-BR',{day:'numeric',month:'long'})}</div><h1>${agendados.length?'Seu plano de hoje':'Hoje é dia livre'}</h1></div>${diasProva!=null?`<span class="pill">${diasProva} dias para a prova</span>`:''}</div>
  ${smCardHoje()}${metaProvaCard()}${chipsHoje(agendados)}
  <div class="plan">${agendados.map(t=>card(t)).join('')||`<div class="card"><p class="mut">Nada agendado para hoje. Ajuste em Config > Agenda ou faça uma atividade extra abaixo.</p></div>`}</div>
  <div class="kpis" style="margin:16px 0"><div class="kpi"><b>${devidas}</b><span class="mut">revisões vencidas</span></div>
   <div class="kpi"><b>${hojeLog.length}</b><span class="mut">respondidas hoje${hojeLog.length?` (${pct(okH,hojeLog.length)}%)`:''}</span></div>
   <div class="kpi"><b>${tot?pct(ok,tot)+'%':'—'}</b><span class="mut">acerto geral (${tot})</span></div>
   <div class="kpi"><b>${seq}</b><span class="mut">dias seguidos</span></div></div>
  ${cardHoje()}
  ${extras.length?`<div class="row" style="margin-top:18px"><button class="b s" onclick="extraAberto=!extraAberto;render()">${extraAberto?'Ocultar atividade extra':'Atividade extra'}</button>${extraAberto?'':'<span class="mut">Quer fazer mais hoje? Veja o que dá para fazer.</span>'}</div>${extraAberto?`<div class="plan" style="margin-top:12px">${extras.map(t=>card(t,true)).join('')}</div>`:''}`:''}`;
}
let extraAberto=false;
const ICO={
 et:'<path d="M2 5c3-1 6-1 10 1 4-2 7-2 10-1v14c-3-1-6-1-10 1-4-2-7-2-10-1z"/><path d="M12 6v14"/>',
 ri:'<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
 rt:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>',
 ps:'<circle cx="12" cy="14" r="7"/><path d="M12 14v-3M9 2h6M12 7V5"/>',
 fc:'<rect x="3" y="7" width="14" height="13" rx="2"/><path d="M7 7V5a1 1 0 0 1 1-1h11a2 2 0 0 1 2 2v10a1 1 0 0 1-1 1h-2"/>'};
// Clique no ícone: abre direto o estudo (RI, RT, cartões); ET e simulado rolam até o cartão, que tem as opções.
function abreChip(k){
  if(k==='ri')return iniciaRI();
  if(k==='rt'){temaSel=null;return go('rt')}
  if(k==='fc'){const c=fcContagem();return c.tot?(c.d+Math.min(c.n,Math.max(0,cfg.fcNovos-c.nh))?fcStart():go('fc')):go('fc')}
  const e=document.getElementById('card_'+k);if(e)e.scrollIntoView({behavior:'smooth',block:'center'});
}
const SIGLA={et:'ET',ri:'RI',rt:'RT',ps:'Simulado',fc:'Cartões'};
// Ícones do plano de hoje: ficam verdes ao concluir; clicar leva ao cartão da atividade.
function chipsHoje(agendados){
  const hoje=segunda()+idxHoje()*DAY,itens=agendados.map(t=>{const p=progDia(t.k,hoje);return {k:t.k,ok:p.ok,tx:p.ok?'Feito':t.k==='et'?'Pendente':p.n+'/'+p.alvo}});
  const c=fcContagem(),pend=c.d+Math.min(c.n,Math.max(0,cfg.fcNovos-c.nh));
  itens.push({k:'fc',ok:c.tot>0&&pend===0,mut:c.tot===0,tx:c.tot===0?'sem cartões':pend===0?'Em dia':pend+' a fazer'});
  return `<div class="chips">${itens.map(i=>`<button class="chip ${i.ok?'done':''} ${i.mut?'mut':''}" aria-label="${SIGLA[i.k]}: ${i.tx}" onclick="abreChip('${i.k}')"><span class="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICO[i.k]}</svg></span><b>${SIGLA[i.k]}</b><small>${i.tx}</small></button>`).join('')}</div>`;
}
function etCorpo(){
  const T=temas().slice(0,3),ok=!!cfg.etDone[dKey(Date.now())];
  return `<p class="mut">Temas do dia, pelo peso de incidência no banco, seus erros e tempo sem rever:</p>${T.map(x=>`<div class="sk"><b>${esc(x.t)}</b><div class="mut">${Math.round(x.inc)}% do banco · ${x.n?'erro '+Math.round(x.erro*100)+'%':'ainda sem respostas'}</div></div>`).join('')||'<p class="mut">Sem temas ainda.</p>'}<div class="row"><button class="b ${ok?'s':''}" onclick="etMarca()">${ok?'Desmarcar estudado':'Marcar como estudado'}</button></div>`;
}
function etMarca(){const k=dKey(Date.now());if(cfg.etDone[k])delete cfg.etDone[k];else cfg.etDone[k]=1;persist('_est');render()}
function simuladoOrig(et){   // prioriza questões inéditas
  const c=Q.filter(q=>q.gab&&(etapaDe(q)===et||etapaDe(q)==='?'));
  const {S}=prioridades(),seen=new Set(log.map(l=>l.q)),w=q=>pesoArea(q._a,S)||1;
  let sel=sorteioPonderado(c.filter(q=>!seen.has(q.id)),w,60);
  if(sel.length<60){const t=new Set(sel.map(q=>q.id));sel=sel.concat(sorteioPonderado(c.filter(q=>!t.has(q.id)),w,60-sel.length))}
  iniciar(embaralha(sel).map(q=>q.id),'simulado',et);
}
// ---- agenda semanal ----
let draft=null;
const cloneAg=a=>JSON.parse(JSON.stringify(a));
const agMudou=()=>JSON.stringify(draft)!==JSON.stringify(cfg.agenda);
function togAg(k,i){draft??=cloneAg(cfg.agenda);draft[k][i]=draft[k][i]?0:1;render()}
function salvaAg(){cfg.agenda=cloneAg(draft);draft=null;persist('_est');render();toast('Agenda salva')}
function desfazAg(){draft=null;render()}
function vAgenda(){
  draft??=cloneAg(cfg.agenda);const ti=idxHoje(),seg=segunda();
  const linhas=TIPOS.map(t=>`<tr><td class="lb"><b>${t.nome}</b><span>Meta semanal: ${draft[t.k].reduce((a,b)=>a+b,0)}${PARAM['freq_'+t.k]?` · manual: ${PARAM['freq_'+t.k]}`:''}</span></td>
   ${DIAS.map((_,i)=>{const feito=!agMudou()&&draft[t.k][i]&&i<=ti&&progDia(t.k,seg+i*DAY).ok;
    return `<td><button class="dot ${draft[t.k][i]?'on':''} ${feito?'done':''} ${i===ti?'today':''}" aria-label="${t.nome}, ${DIAS[i]}" aria-pressed="${!!draft[t.k][i]}" onclick="togAg('${t.k}',${i})">${CK}</button></td>`}).join('')}</tr>`).join('');
  return `<div class="card"><h2>Agenda semanal</h2><p class="mut">Marque os dias de cada atividade. O app monta o plano de hoje a partir daqui. Bolinha verde = concluída naquele dia.</p>
  <div class="tw"><table class="ag"><thead><tr><th></th>${DIAS.map((d,i)=>`<th><span class="dia-l">${d}</span><span class="dia-s">${DIAS_S[i]}</span></th>`).join('')}</tr></thead><tbody>${linhas}</tbody></table></div>
  <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="b s" ${agMudou()?'':'disabled'} onclick="desfazAg()">Desfazer alterações</button><button class="b" ${agMudou()?'':'disabled'} onclick="salvaAg()">Salvar alterações</button></div></div>
  <div class="card"><h3>Como cada atividade funciona</h3>${TIPOS.map(t=>`<div class="sk"><b>${t.nome}</b><div class="mut">${t.desc}.${t.k==='ri'?` Concluída ao responder ${RI_DIARIA} questões.`:t.k==='rt'?' Concluída ao responder 10 questões do tema.':' Concluída ao responder 30 questões em simulado.'}</div></div>`).join('')}</div>`;
}

// ---- revisão teórica ----
function vRT(){
  const T=temas();if(!T.length)return `<div class="card">Sem temas no banco ainda.</div>`;
  const cur=T.find(x=>x.t===temaSel)||T[0];
  const pontos=[...new Set(cur.qs.map(q=>pontoDe(q)).filter(Boolean))].slice(0,6);
  return `<div class="card"><div class="kick">Revisão Teórica</div><h1>${esc(cur.t)}</h1>
   <div class="row mut"><span>${cur.qs.length} questões no banco (${Math.round(cur.inc)}%)</span><span>·</span><span>erro ponderado ${Math.round(cur.erro*100)}%</span><span>·</span><span>${cur.last?'visto há '+Math.round(cur.dias)+' dias':'nunca visto'}</span></div>
   <h3 style="margin-top:16px">Resumo do tema</h3>
   ${pontos.length?pontos.map(p=>`<div class="ponto md">${md(p)}</div>`).join(''):'<p class="mut">Ainda não há CCQ para este tema.</p>'}
   <div class="row" style="margin-top:16px"><button class="b" onclick="iniciar(questoesTema(${JSON.stringify(cur.t).replace(/"/g,'&quot;')}),'rt')">Fazer as 10 questões</button></div></div>
  <div class="card"><h3>Outros temas, por prioridade</h3><p class="mut">Prioridade = incidência no banco × seus erros (fáceis pesam mais) × tempo sem rever.</p>
  <div class="tw"><table><tr><th>Tema</th><th>Banco</th><th>Erro</th><th>Visto</th></tr>${T.slice(0,12).map(x=>`<tr class="cl" onclick="temaSel=${JSON.stringify(x.t).replace(/"/g,'&quot;')};render();scrollTo(0,0)"><td>${esc(x.t)}</td><td>${x.qs.length}</td><td>${x.n?Math.round(x.erro*100)+'%':'—'}</td><td>${x.last?Math.round(x.dias)+' d':'nunca'}</td></tr>`).join('')}</table></div></div>`;
}

// ---- estudar ----
let fl={area:'',etapa:'',status:'novas',dif:'',n:20,modo:'misto',sel:{m:[],o:[],t:[],p:[],g:[],c:[]},tagq:'',open:{},tagEd:false,op:null,opv:''};
function setSel(d,v){const a=fl.sel[d],k=a.indexOf(v);k<0?a.push(v):a.splice(k,1);render()}
const nSel=()=>Object.values(fl.sel).reduce((a,b)=>a+b.length,0);
const pk=q=>q._a+'|'+(q.cl||[]).join('|')+'|';
const selOk=q=>(!fl.sel.c||!fl.sel.c.length||fl.sel.c.some(k=>pk(q).startsWith(k)))&&DIMS.every(([d])=>!fl.sel[d].length||fl.sel[d].some(v=>q._x[d].includes(v)))&&(!fl.sel.g.length||fl.sel.g.some(v=>{const [a,o]=v.split('|');return areasDe(q).includes(a)&&(o===''?!q._x.o.length:q._x.o.includes(o))}));
// ---- árvore de temas (grande área > tema/órgão > subtema); métodos de imagem e tipos de conteúdo ficam fora dela ----
const ek=s=>esc(JSON.stringify(s)).replace(/'/g,'&#39;');
function areasDe(q){const tg=q.tags.map(norm),s=new Set([q._a]);AREAS.forEach(a=>{if(a.id!=='usg'&&tg.some(t=>a.kw.some(k=>t.includes(k))))s.add(a.id)});return [...s]}
function tagsDe(d,v){const s=new Set();Q.forEach(q=>q.tags.forEach(t=>{if(!isMeta(t)){const x=taxo(t);if(x.d===d&&x.v===v)s.add(t)}}));return s}
function tagAplica(set,novo){   // novo=null remove a tag; senão renomeia (juntando duplicadas) em todas as questões
  const bk=new Set();let n=0;
  Q.forEach(q=>{if(!q.tags.some(t=>set.has(t)))return;
    const a=[...new Set(q.tags.map(t=>set.has(t)?novo:t).filter(Boolean))],k='e:'+q.id,cur=(pon[k]&&pon[k].e)||{};
    pon[k]={e:{...cur,tags:a},u:Date.now()};bk.add(hk(k,8));aplicaEd(q);n++});
  bk.forEach(b=>persist('p:'+b));return n}
function tagOp(k,d,v){fl.op={k,d,v};fl.opv=v;render();setTimeout(()=>{const e=$('#op_in');if(e){e.focus();e.select()}},0)}
function labOp(d,v){fl.op={k:'lab',d,v};fl.opv=d==='a'?AREA_BY[v].nome:dn(d,v);render();setTimeout(()=>{const e=$('#op_in');if(e){e.focus();e.select()}},0)}
function tagOpOk(){
  const o=fl.op;if(!o)return;
  if(o.k==='cl'){clOpOk(o);return}if(o.k==='lab'){const nm=($('#op_in').value||'').trim(),key=o.d+'|'+o.v,orig=o.d==='a'?AREA_BY[o.v]._n:o.v;
    if(!nm||nm===orig)delete cfg.nomes[key];else cfg.nomes[key]=nm;
    aplicaNomes();persist('_est');fl.op=null;render();toast(nm&&nm!==orig?'Nome alterado':'Nome original restaurado');return}
  const set=tagsDe(o.d,o.v);let n;
  if(o.k==='ren'){const nm=($('#op_in').value||'').trim();if(!nm){toast('Digite o novo nome.');return}
    if(nm===o.v){fl.op=null;render();return}n=tagAplica(set,nm);fl.sel[o.d]=fl.sel[o.d].filter(x=>x!==o.v);toast(`Tag renomeada em ${n} questões`)}
  else{n=tagAplica(set,null);fl.sel[o.d]=fl.sel[o.d].filter(x=>x!==o.v);toast(`Tag removida de ${n} questões`)}
  fl.op=null;render()}
const tgl=k=>{fl.open[k]=!fl.open[k];render()};
function tgChip(d,v,n){
  const ed=fl.tagEd&&d!=='m';
  return `<span class="tag ${fl.sel[d].includes(v)?'on':''}" style="cursor:pointer" onclick="setSel('${d}',${ek(v)})">${esc(v)} ${n}</span>${ed?`<span class="tgo" role="button" tabindex="0" title="Renomear tag" aria-label="Renomear ${esc(v)}" onclick="tagOp('ren','${d}',${ek(v)})">✎</span><span class="tgx" role="button" tabindex="0" title="Remover tag" aria-label="Remover ${esc(v)}" onclick="tagOp('del','${d}',${ek(v)})"><svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 2l6 6M8 2l-6 6"/></svg></span>`:''}`}
function opPainel(){
  const o=fl.op;if(!o)return '';if(o.k==='cl')return clPainel(o);
  if(o.k==='lab')return `<div class="iab" style="margin:10px 0"><div class="kick">Renomear ${o.d==='a'?'grande área':'tema'}</div><div class="row" style="margin-top:6px"><input id="op_in" value="${esc(fl.opv)}" style="flex:1;min-width:200px" onkeydown="if(event.key==='Enter')tagOpOk();else if(event.key==='Escape'){fl.op=null;render()}"><button class="b" onclick="tagOpOk()">Salvar</button><button class="b s" onclick="fl.op=null;render()">Cancelar</button></div><p class="mut" style="margin:6px 0 0;font-size:.8rem">Muda só o nome exibido; as tags das questões não mudam. Deixe em branco para voltar ao nome original.</p></div>`;
  const set=tagsDe(o.d,o.v),n=Q.filter(q=>q.tags.some(t=>set.has(t))).length;
  return o.k==='ren'
   ?`<div class="iab" style="margin:10px 0"><div class="kick">Renomear tag · ${n} questões</div><div class="row" style="margin-top:6px"><input id="op_in" value="${esc(fl.opv)}" style="flex:1;min-width:200px" onkeydown="if(event.key==='Enter')tagOpOk();else if(event.key==='Escape'){fl.op=null;render()}"><button class="b" onclick="tagOpOk()">Salvar</button><button class="b s" onclick="fl.op=null;render()">Cancelar</button></div><p class="mut" style="margin:6px 0 0;font-size:.8rem">Se já existir uma tag com o novo nome, elas são unidas.</p></div>`
   :`<div class="iab" style="margin:10px 0"><div class="kick">Remover tag</div><p style="margin:6px 0">Remover <b>${esc(o.v)}</b> de ${n} questões? As questões continuam no banco.</p><div class="row"><button class="b" onclick="tagOpOk()">Remover</button><button class="b s" onclick="fl.op=null;render()">Cancelar</button></div></div>`}
const AN0=new Set([...AREAS.map(a=>norm(a.nome)),'sistema digestorio','sistema urogenital','ginecologia e obstetricia','ultrassonografia geral','usg geral','us em ginecologia e obstetricia']);
const AN={has:n=>AN0.has(n)||AREAS.some(a=>norm(a.nome)===n)};
const XSVG='<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 2l6 6M8 2l-6 6"/></svg>';
const stp=e=>e.stopPropagation();
function trOps(d,v){return fl.tagEd?`<span class="tgo" role="button" tabindex="0" title="Renomear tag" onclick="stp(event);tagOp('ren','${d}',${ek(v)})">✎</span><span class="tgx" role="button" tabindex="0" title="Remover tag" onclick="stp(event);tagOp('del','${d}',${ek(v)})">${XSVG}</span>`:''}
function trOpsO(o){return fl.tagEd?`<span class="tgo" role="button" tabindex="0" title="Renomear tema" onclick="stp(event);labOp('o',${ek(o)})">✎</span><span class="tgx" role="button" tabindex="0" title="Remover tag" onclick="stp(event);tagOp('del','o',${ek(o)})">${XSVG}</span>`:''}
function selBar(){
  const lab=(d,v)=>d==='c'?v.split('|').filter(Boolean).map((s,i)=>i?s:AREA_BY[s].nome).join(' › '):d==='g'?AREA_BY[v.split('|')[0]].nome+' · outros temas':d==='o'?dn('o',v):v,L=[...DIMS.map(x=>x[0]),'g','c'].flatMap(d=>fl.sel[d].map(v=>[d,v]));if(!L.length)return '';
  return `<div class="selbar"><span class="mut">Filtros:</span>${L.map(([d,v])=>`<span class="tag on">${esc(lab(d,v))}<span class="tgx" role="button" tabindex="0" title="Tirar filtro" onclick="setSel('${d}',${ek(v)})">${XSVG}</span></span>`).join('')}</div>`}
// ---- árvore: grande área > tema > subtema > assunto (campo "cl" de cada questão) ----
function arvoreTags(){
  const qn=norm(fl.tagq||''),R={};
  Q.forEach(q=>{if(!q.gab)return;const a=q._a;if(a==='usg'||!AREA_BY[a]?.nome||fl.area&&a!==fl.area)return;
    let N=R,k='';[a,...(q.cl&&q.cl.length?q.cl:['Sem classificação'])].forEach(s=>{k+=s+'|';const n=N[s]??={k,s,ids:new Set(),c:{}};n.ids.add(q.id);N=n.c})});
  const nm=(n,d)=>d===0?AREA_BY[n.s].nome:n.s,mt=(n,d)=>!!qn&&norm(nm(n,d)).includes(qn);
  const hit=(n,d)=>mt(n,d)||Object.values(n.c).some(c=>hit(c,d+1));
  const node=(n,d,anc)=>{const me=mt(n,d);if(qn&&!anc&&!hit(n,d))return '';
    const kids=Object.values(n.c).sort((x,y)=>y.ids.size-x.ids.size||x.s.localeCompare(y.s)),leaf=!kids.length;
    const open=qn?true:!!fl.open[n.k],on=fl.sel.c.includes(n.k),key=ek(n.k);
    const ck=`<span class="ck ${on?'on':''}" role="checkbox" aria-checked="${on}" title="Filtrar por este tema" onclick="stp(event);setSel('c',${key})"></span>`;
    const ops=!fl.tagEd?'':d===0?(n.s!=='sem'?`<span class="tgo" role="button" tabindex="0" title="Renomear grande área" onclick="stp(event);labOp('a','${n.s}')">✎</span>`:''):`<span class="tgo" role="button" tabindex="0" title="Renomear em todas as questões" onclick="stp(event);clOp(${key})">✎</span>`;
    if(leaf&&d>0)return `<div class="trw lf ${on?'on':''}" role="button" tabindex="0" onclick="setSel('c',${key})">${ck}<span class="nm">${esc(n.s)}</span>${ops}<span class="ct">${n.ids.size}</span></div>`;
    const cls=d===0?'ar':d===1?'og':'sg';
    return `<div class="trw ${cls} ${open?'op':''}" role="button" tabindex="0" onclick="tgl(${key})"><i>▸</i><span class="nm">${esc(nm(n,d))}</span>${ops}<span class="ct">${n.ids.size}</span>${d>0?ck:''}</div>`+
      (open?`<div class="${d===0?'trb':'trl'}">${kids.map(c=>node(c,d+1,anc||me)).join('')||'<span class="mut">Sem temas.</span>'}</div>`:'')};
  const pos=a=>{const i=ORDEM_AREAS_ESTUDAR.indexOf(a);return i<0?ORDEM_AREAS_ESTUDAR.length:i};
  const html=Object.values(R).sort((x,y)=>pos(x.s)-pos(y.s)||y.ids.size-x.ids.size).map(n=>node(n,0,false)).join('');
  return `${opPainel()}${selBar()}<div class="arv">${html||'<p class="mut">Nenhum tema encontrado.</p>'}</div>`}
const clParse=s=>String(s||'').split('>').map(x=>x.trim()).filter(Boolean);
function clOp(k){fl.op={k:'cl',v:k};fl.opv=k.split('|').filter(Boolean).pop();render();setTimeout(()=>{const e=$('#op_in');if(e){e.focus();e.select()}},0)}
function clPainel(o){const n=Q.filter(q=>pk(q).startsWith(o.v)).length;
  return `<div class="iab" style="margin:10px 0"><div class="kick">Renomear tema · ${n} questões</div><div class="row" style="margin-top:6px"><input id="op_in" value="${esc(fl.opv)}" style="flex:1;min-width:200px" onkeydown="if(event.key==='Enter')tagOpOk();else if(event.key==='Escape'){fl.op=null;render()}"><button class="b" onclick="tagOpOk()">Salvar</button><button class="b s" onclick="fl.op=null;render()">Cancelar</button></div><p class="mut" style="margin:6px 0 0;font-size:.8rem">Muda a classificação de todas as questões deste ramo. Se já existir um tema com o novo nome no mesmo nível, eles são unidos.</p></div>`}
function clOpOk(o){const nm=($('#op_in').value||'').trim();if(!nm){toast('Digite o novo nome.');return}
  const segs=o.v.split('|').filter(Boolean),i=segs.length-2,bk=new Set();let n=0;   // i = posição no campo cl (o 1º segmento é a grande área)
  Q.forEach(q=>{if(!pk(q).startsWith(o.v))return;const a=[...q.cl];a[i]=nm;const k='e:'+q.id,cur=(pon[k]&&pon[k].e)||{};
    pon[k]={e:{...cur,cl:a},u:Date.now()};bk.add(hk(k,8));aplicaEd(q);n++});
  bk.forEach(b=>persist('p:'+b));const nk=[...segs.slice(0,-1),nm].join('|')+'|';
  fl.sel.c=fl.sel.c.map(x=>x.startsWith(o.v)?nk+x.slice(o.v.length):x);if(fl.open[o.v])fl.open[nk]=true;
  fl.op=null;render();toast(`Tema renomeado em ${n} questões`)}

function outrosFiltros(){
  const qn=norm(fl.tagq||'');
  return DIMS.filter(([d])=>d==='m').map(([d,nome])=>{const c={};Q.filter(q=>q.gab&&(!fl.area||q._a===fl.area)).forEach(q=>q._x[d].forEach(v=>c[v]=(c[v]||0)+1));
    const sel=fl.sel[d].map(v=>[v,c[v]||0]),rest=Object.entries(c).filter(([v])=>!fl.sel[d].includes(v)&&(!qn||norm(v).includes(qn))).sort((a,b)=>b[1]-a[1]).slice(0,30);
    const itens=METODOS_DADOS?METODOS_DADOS.ordem.filter(v=>(c[v]||fl.sel[d].includes(v))&&(fl.sel[d].includes(v)||!qn||norm(v).includes(qn))).map(v=>[v,c[v]||0]):[...sel,...rest];
    return itens.length?`<div class="dimg"><div class="kick">${nome}</div>${itens.map(([v,n])=>tgChip(d,v,n)).join('')}</div>`:''}).join('')}
function vEstudar(){
  const S=statsPor(q=>q._a);
  return `<div class="card"><h2>Estudar</h2>${bannerEst()}<div class="row">
  <label>Área <select id="f_area" onchange="fl.area=this.value;render()"><option value="">Todas</option>${AREAS.concat(SEM).map(a=>`<option value="${a.id}" ${fl.area===a.id?'selected':''}>${a.nome} (${S[a.id]?.banco||0})</option>`).join('')}</select></label>
  <label>Etapa <select id="f_et" onchange="fl.etapa=this.value;render()"><option value="">Todas</option><option ${fl.etapa==='teórica'?'selected':''}>teórica</option><option ${fl.etapa==='prática'?'selected':''}>prática</option></select></label>
  <label>Dificuldade <select id="f_dif" onchange="fl.dif=this.value;render()"><option value="">Todas</option>${Object.entries(DIF).map(([k,v])=>`<option value="${k}" ${fl.dif===k?'selected':''}>${v.nome}</option>`).join('')}</select></label>
  <label>Status <select id="f_st" onchange="fl.status=this.value;render()"><option value="todas">Todas</option><option value="novas" ${fl.status==='novas'?'selected':''}>Não vistas</option><option value="erradas" ${fl.status==='erradas'?'selected':''}>Que errei</option><option value="duvida" ${fl.status==='duvida'?'selected':''}>Dúvida/chute</option><option value="vencidas" ${fl.status==='vencidas'?'selected':''}>Revisão vencida</option></select></label>
  <label>Nº <input id="f_n" type="number" min="1" max="200" value="${fl.n}" style="width:72px" onchange="fl.n=+this.value"></label>
  <label>Ordem <select id="f_or" onchange="fl.modo=this.value"><option value="misto">Misturar (recomendado)</option><option value="bloco" ${fl.modo==='bloco'?'selected':''}>Em bloco</option></select></label></div>
  <h3 style="margin-top:14px">Temas e subtemas${fl.area?` de ${AREA_BY[fl.area].nome}`:''}</h3>
  <div class="row"><input id="f_tq" placeholder="Buscar (ex.: rim, BI-RADS, endometriose)" value="${esc(fl.tagq)}" onchange="fl.tagq=this.value;render()" style="flex:1;min-width:200px"><button class="b s" onclick="fl.tagEd=!fl.tagEd;fl.op=null;render()">${fl.tagEd?'Concluir edição':'Editar nomes e tags'}</button>${nSel()?`<button class="b s" onclick="fl.sel={m:[],o:[],t:[],p:[],g:[],c:[]};render()">Limpar (${nSel()})</button>`:''}</div>
   ${arvoreTags()}${outrosFiltros()}
  <p class="mut" style="font-size:.8rem">Dentro de um grupo vale qualquer item marcado; entre grupos, todos precisam combinar.</p>
  <p><button class="b" onclick="comecaFiltro()">Começar</button> <span class="mut">${filtrar().length} questões no filtro</span></p></div>`;
}
function subtags(area){const c={};Q.filter(q=>q._a===area).forEach(q=>q.tags.filter(t=>!isMeta(t)).forEach(t=>c[t]=(c[t]||0)+1));return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,25)}
function filtrar(){
  const ult={};log.forEach(l=>ult[l.q]=l);const now=Date.now();
  return Q.filter(q=>q.gab&&(!fl.area||q._a===fl.area)&&(!fl.etapa||etapaDe(q)===fl.etapa)&&(!fl.dif||q._d===fl.dif)&&selOk(q)).filter(q=>{
    const u=ult[q.id];
    if(fl.status==='novas')return !u;
    if(fl.status==='erradas')return u&&!u.ok;
    if(fl.status==='duvida')return u&&u.conf!=='certeza';
    if(fl.status==='vencidas')return srs[q.id]&&srs[q.id].due<=now;
    return true});
}
function comecaFiltroOrig(){
  let c=filtrar();c=fl.modo==='misto'?embaralha(c):c.sort((a,b)=>a._a.localeCompare(b._a));
  iniciar(c.slice(0,fl.n).map(q=>q.id),'estudo')
}

// ---- atalhos configuráveis ----
const KEYDEF={a1:'1',a2:'2',a3:'3',a4:'4',a5:'5',cert:'a',duv:'s',chu:'d',cut:'f',edit:'e',ia:'c',next:'Enter',img:'g',fcshow:' ',fc1:'1',fc2:'2',fc3:'3',fc4:'4',fcundo:'z',znext:'ArrowRight',zprev:'ArrowLeft',zin:'+',zout:'-',zfit:'0',qa:'a',smdel:'f',smurg:'u'};
const KEYLAB={a1:'Alternativa A',a2:'Alternativa B',a3:'Alternativa C',a4:'Alternativa D',a5:'Alternativa E',cert:'Certeza',duv:'Dúvida',chu:'Chute',cut:'Riscar alternativa',edit:'Editar resposta',ia:'CCQ e resumo com o Claude',next:'Próxima questão',img:'Selecionar / abrir / fechar imagem',fcshow:'Mostrar resposta (cartão)',fc1:'Cartão: Errei',fc2:'Cartão: Difícil',fc3:'Cartão: Bom',fc4:'Cartão: Fácil',fcundo:'Cartão: desfazer',znext:'Próxima imagem',zprev:'Imagem anterior',zin:'Aumentar (zoom)',zout:'Diminuir (zoom)',zfit:'Ajustar à tela',qa:'Nova tarefa (usa Alt + a letra)',smdel:'Apagar a tarefa selecionada',smurg:'U = urgente (tarefa selecionada)'};
// grupos de conflito (uma tecla não repete dentro do grupo)
const KG={quiz:['a1','a2','a3','a4','a5','cert','duv','chu','cut','edit','ia','next','img'],fc:['fcshow','fc1','fc2','fc3','fc4','fcundo'],zoom:['zprev','znext','zin','zout','zfit'],hoje:['qa'],sem:['smdel','smurg']};
// abas da tela Atalhos: seções = [título, grupo configurável, [[tecla fixa, descrição]]]
const ATABS=[
 ['geral','Geral',[['Navegação entre abas',null,[['Tab','Próxima aba'],['Shift+Tab','Aba anterior']]]]],
 ['hoje','Hoje / Semana',[['Nova tarefa (Hoje e Semana)','hoje',[['Alt + tecla','Abre "Nova tarefa". Dentro dela: ↑ ↓ ← → andam, A ou Espaço marcam o dia, Enter avança/adiciona, Esc volta/fecha']]],['Aba Semana','sem',[['↑ / ↓','Anda nas tarefas de hoje'],['Enter','Conclui / desmarca a tarefa'],['Esc','Solta a seleção']]]]],
 ['questao','Questão',[['Atalhos das questões','quiz',[['← / →','Questão anterior / próxima'],['↑ / ↓','Troca a alternativa (depois de responder: rola a página)'],['Espaço','Próxima questão (depois de responder)'],['Enter','Confirma como Certeza'],['Esc','Solta a imagem selecionada'],['← / → com imagem selecionada','Troca a imagem']]]]],
 ['imagem','Imagem aberta',[['Imagem aberta (zoom)','zoom',[['Esc','Fecha a imagem'],['=','Também aumenta (quando o aumentar é +)'],['Tecla de imagem (aba Questão)','Também fecha']]]]],
 ['fc','Flashcards',[['Atalhos dos flashcards','fc',[]]]]
];
let atTab='geral';
const KEY=n=>(cfg.keys&&cfg.keys[n])||KEYDEF[n];
const keyIs=(e,n)=>{const k=KEY(n);return e.key===k||(k.length===1&&e.key.toLowerCase()===k.toLowerCase())};
const keyLab=n=>{const k=KEY(n);return k===' '?'Espaço':k.length===1?k.toUpperCase():({ArrowRight:'→',ArrowLeft:'←',ArrowUp:'↑',ArrowDown:'↓'})[k]||k};
let capKey=null;
function capStart(n){capKey=n;render()}
function capturaTecla(e){
  const k=e.key;if(['Shift','Control','Alt','Meta','CapsLock'].includes(k))return;
  e.preventDefault();
  if(k==='Escape'){capKey=null;render();return}
  if(k==='Tab'){toast('Tab é reservado para trocar de aba.');return}
  if(capKey==='qa'&&!/^[a-z0-9]$/i.test(k)){toast('Para Nova tarefa use uma letra ou número (com Alt).');return}
  const g=Object.values(KG).find(x=>x.includes(capKey))||[],nk=k.length===1?k.toLowerCase():k;
  const clash=g.find(n=>n!==capKey&&KEY(n).toLowerCase()===nk.toLowerCase());
  if(clash){toast('Essa tecla já é usada em "'+KEYLAB[clash]+'".');return}
  cfg.keys=cfg.keys||{};cfg.keys[capKey]=nk;capKey=null;persist('_est');render();
}
function resetKeys(){cfg.keys={};delete cfg.passoSeta;persist('_est');render();toast('Atalhos restaurados')}
function setPasso(v){cfg.passoSeta=Math.max(40,Math.min(400,Math.round(+v)||120));persist('_est');render()}

// ---- resumo com o Claude ----
let iaBusy=null;
function mdlite(t){
  const inl=x=>esc(x).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
  const out=[];let ul=false,tb=false;
  const cu=()=>{if(ul){out.push('</ul>');ul=false}};
  for(const raw of String(t).split('\n')){const l=raw.trimEnd();let m;
    if(/^\|/.test(l)){if(/^\|[-\s|:]+\|?$/.test(l))continue;const c=l.replace(/^\||\|$/g,'').split('|').map(x=>x.trim());
      if(!tb){cu();tb=true;out.push('<div class="tw"><table><tr>'+c.map(x=>`<th>${inl(x)}</th>`).join('')+'</tr>')}else out.push('<tr>'+c.map(x=>`<td>${inl(x)}</td>`).join('')+'</tr>');continue}
    if(tb){out.push('</table></div>');tb=false}
    if(/^@param/.test(l)){cu();out.push(`<p><code>${esc(l)}</code></p>`)}
    else if((m=/^(#{1,3})\s+(.*)/.exec(l))){cu();const n=m[1].length+1;out.push(`<h${n}>${inl(m[2])}</h${n}>`)}
    else if((m=/^[*-]\s+(\[[ x]\]\s+)?(.*)/.exec(l))){if(!ul){out.push('<ul>');ul=true}out.push(`<li>${m[1]?(m[1].includes('x')?'☑ ':'☐ '):''}${inl(m[2])}</li>`)}
    else if(l==='---'){cu();out.push('<hr>')}
    else if(!l.trim())cu();
    else{cu();out.push(`<p>${inl(l)}</p>`)}}
  cu();if(tb)out.push('</table></div>');return out.join('');
}
function iaParse(t){let ccq='',fl=null;const rest=[];
  String(t).split('\n').forEach(raw=>{const l=raw.trim(),f=/^\**FLASH\**\s*:?\**\s*(.*?)\s*::\s*(.*)$/i.exec(l),m=/^\**CCQ\**\s*:?\**\s*(.*)$/i.exec(l);
    if(f)fl=[f[1].replace(/\*/g,''),f[2].replace(/\*/g,'')];else if(m&&!ccq)ccq=m[1].replace(/\*\*/g,'');else rest.push(raw)});
  return {ccq,fl,rest:rest.join('\n')};
}
const KEYSVG='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2"/></svg>';
const pontoDe=q=>pon[q.id]&&pon[q.id].t!=null?pon[q.id].t:q.ponto;
function pEdita(id){sess.pEdit=id;render()}
function pSalva(id){pon[id]={t:$('#pe').value.trim(),u:Date.now()};sess.pEdit=null;persist('p:'+hk(id,8));render();toast('CCQ salvo')}
function pOrig(id){pon[id]={t:null,u:Date.now()};sess.pEdit=null;persist('p:'+hk(id,8));render();toast('CCQ original restaurado')}
function pontoBloco(q){
  if(sess.pEdit===q.id)return `<div class="ponto"><div class="kick">Editar CCQ: Conceito Chave da Questão</div><textarea id="pe" style="min-height:140px;font:inherit">${esc(pontoDe(q)||'')}</textarea><div class="row" style="margin-top:8px"><button class="b" onclick="pSalva('${q.id}')">Salvar</button><button class="b s" onclick="sess.pEdit=null;render()">Cancelar</button>${pon[q.id]&&pon[q.id].t!=null?`<button class="b s" onclick="pOrig('${q.id}')">Restaurar original</button>`:''}</div></div>`;
  const t=pontoDe(q);
  return `${t?`<div class="ponto md"><div class="kick">CCQ: Conceito Chave da Questão${pon[q.id]&&pon[q.id].t!=null?' · editado':''}</div>${md(t)}</div>`:''}<div class="row" style="margin-top:6px"><button class="b s" style="padding:5px 12px;font-size:.82rem" onclick="pEdita('${q.id}')">${t?'Editar':'Adicionar'} CCQ</button></div>`;
}
function iaBloco(q){const t=ia[q.id],P=t?iaParse(t):null;
  return `<div class="ia">${t?`${P.ccq?`<div class="ccq"><div class="ccqh">${KEYSVG} CCQ · Conceito-chave</div><div class="ccqt">${md(P.ccq)}</div></div>`:''}${P.rest.trim()?`<div class="iab md">${mdlite(P.rest)}</div>`:''}`:''}
  <div class="row"><button class="b s" ${iaBusy?'disabled':''} onclick="gerarIA('${q.id}')">${iaBusy===q.id?'Gerando…':t?'Gerar de novo':'CCQ e resumo rápido com IA ('+keyLab('ia')+')'}</button>${P&&P.fl?`<button class="b s" onclick="iaFlash('${q.id}')">Criar flashcard do CCQ</button>`:''}<button class="b s" onclick="fcNovo('${q.id}')">Criar flashcard</button></div>${fcEd&&fcEd.q===q.id?fcEdForm():''}</div>`;
}
let fcEd=null;
const tagStr=q=>q.tags.filter(t=>!isMeta(t)).slice(0,4).join('; ');
function revItens(q){const s=String(pontoDe(q)||'');const i=s.search(/Revis[ãa]o r[áa]pida/);if(i<0)return[];const md=t=>esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\*(.+?)\*/g,'<i>$1</i>');return s.slice(i).split('\n').filter(l=>/^\s*[-•]\s/.test(l)&&l.includes('→')).map(l=>{const t=l.replace(/^\s*[-•]\s*/,'');const k=t.indexOf('→');return[md(t.slice(0,k).trim()),md(t.slice(k+1).trim().replace(/^\*(.*)\*$/,'$1'))]})}
function fcNovo(id){const R=revItens(QID[id]);const one=R.length<2;fcEd={q:id,f:R.map((r,i)=>'<div>'+(one?'':(i+1)+'. ')+r[0]+'</div>').join(''),v:R.map((r,i)=>'<div>'+(one?'':(i+1)+'. ')+r[1]+'</div>').join(''),tg:tagStr(QID[id])};render();setTimeout(()=>{const e=$('#fe_f');if(e)e.focus()},50)}
function fcEdForm(){return `<div class="iab"><div class="kick">Novo flashcard (editável)</div>
  <div><b style="font-size:.85rem">Frente</b>${rtEd('fe_f',fcEd.f,120,'fcEd.f')}</div>
  <div style="margin-top:8px"><b style="font-size:.85rem">Verso</b>${rtEd('fe_v',fcEd.v,300,'fcEd.v')}</div>
  <label style="display:block;margin-top:6px">Tags (separadas por ;)<input id="fe_t" style="width:100%" value="${esc(fcEd.tg)}" oninput="fcEd.tg=this.value"></label>
  <div class="row" style="margin-top:8px"><button class="b" onclick="fcEdSalva()">Salvar flashcard</button><button class="b s" onclick="fcEd=null;render()">Cancelar</button></div></div>`}
function fcEdSalva(){
  const f=rtVal(fcEd.f),v=rtVal(fcEd.v);if(!f||!v){toast('Preencha frente e verso.');return}
  if(cards.some(c=>!c.x&&c.f===f&&c.v===v)){toast('Esse flashcard já existe.');return}
  const c={id:'c'+Date.now().toString(36),f,v,tg:fcEd.tg.trim(),u:Date.now()};cards.push(c);persist('c:'+hk(c.id,32));fcEd=null;render();toast('Flashcard criado')
}
function iaFlash(id){const P=iaParse(ia[id]||'');if(!P.fl)return;const q=QID[id],f=P.fl[0],v=P.fl[1];
  if(cards.some(c=>!c.x&&c.f===f&&c.v===v)){toast('Esse flashcard já existe.');return}
  const c={id:'c'+Date.now().toString(36),f,v,tg:tagStr(q),u:Date.now()};cards.push(c);persist('c:'+hk(c.id,32));toast('Flashcard criado');
}
async function gerarIA(id){
  if(iaBusy)return;const q=QID[id];iaBusy=id;render();
  const prompt=promptIA(q);
  try{
    const sm=await claude.use('sample');
    if(!sm){toast('Cole a chave do Gemini em Banco › Chaves deste aparelho.')}
    else{const r=await sm(prompt,{modelTier:'quick'});ia[id]=r.text;persist('i:'+hk(id,8))}
  }catch(e){toast(e&&e.code==='not_granted'?'Cole a chave do Gemini em Banco › Chaves deste aparelho.':'Não consegui gerar agora. Tente de novo.')}
  iaBusy=null;render();
}

// ---- quiz ----
function tituloQ(q,comArea=true){
  const e=etapaDe(q),et=e==='prática'?'Prática':e==='teórica'?'Teórica':'',ano=anoDe(q),au=q.tags.some(t=>norm(t)==='autorais');
  return esc(['CBR',au?'Autoral':'',et,ano].filter(Boolean).join(' ')+(comArea?' - '+AREA_BY[q._a].nome:''));
}
const TES='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12"/></svg>';
function nvBloco(){
  if(!sess.resp[sess.ids[sess.i]]||sess.sim)return '';
  const D={f:{t:0,n:0,ok:0},m:{t:0,n:0,ok:0},d:{t:0,n:0,ok:0}};
  sess.ids.forEach(id=>{const q=QID[id],r=sess.resp[id];if(!q._d)return;D[q._d].t++;if(r){D[q._d].n++;if(r.ok)D[q._d].ok++}});
  const open=!!sess.nvOpen,fb=!sess.sim;
  return `<div style="margin-top:12px"><button class="b s" style="padding:6px 12px;font-size:.82rem;width:100%" onclick="sess.nvOpen=!sess.nvOpen;render()">${open?'Ocultar':'Ver'} por dificuldade</button>${open?`<div style="margin-top:8px;display:flex;flex-direction:column;gap:8px">${Object.entries(DIF).map(([k,v])=>{const x=D[k],er=x.n-x.ok;return `<div><div class="row" style="gap:8px;justify-content:space-between"><span class="dif ${k}"><i></i>${v.nome}</span><b style="font-size:.85rem">${x.n}/${x.t} feitas</b></div>${fb&&x.n?`<div class="mut" style="font-size:.8rem;margin-top:2px"><span style="color:var(--ok)">✓ ${x.ok} (${pct(x.ok,x.n)}%)</span> &nbsp; <span style="color:var(--bad)">✗ ${er} (${pct(er,x.n)}%)</span></div>`:''}</div>`}).join('')}</div>`:''}</div>`;
}
function painelNav(){
  const n=sess.ids.length,rs=sess.resp,feitas=sess.ids.filter(i=>rs[i]).length;
  const ok=sess.ids.filter(i=>rs[i]?.ok).length,er=feitas-ok;
  return `<aside class="qnav"><div class="row" style="justify-content:space-between"><b>${sess.i+1} de ${n}</b>${!sess.sim?`<span class="mut"><span style="color:var(--ok)">✓ ${ok}</span> &nbsp; <span style="color:var(--bad)">✗ ${er}</span>${feitas?` &nbsp; <b style="color:var(--tx)">${pct(ok,feitas)}%</b>`:''}</span>`:''}</div>
  <div class="mut" style="margin:2px 0 8px">${feitas} de ${n} respondidas</div>${barra(pct(feitas,n))}
  <div class="qgrid">${sess.ids.map((id,i)=>{const r=rs[id];return `<button class="qn ${i===sess.i?'cur':''}" aria-label="Questão ${i+1}" onclick="irPara(${i})">${i+1}${r?`<i class="${sess.sim?'n':r.ok?'ok':'bad'}"></i>`:''}</button>`}).join('')}</div>
${nvBloco()}
  <p class="mut" style="font-size:.76rem;margin:10px 0 0">↑↓ alternativas (ou ${keyLab('a1')}–${keyLab('a5')}) · ←→ questões · ${keyLab('cut')} riscar · ${keyLab('cert')}/${keyLab('duv')}/${keyLab('chu')} confiança · ${keyLab('edit')} edita</p></aside>`;
}
const DIFV={f:80,m:50,d:20};
function setDif(id,d){edSet(id,{dif:d});render();toast('Dificuldade: '+DIF[d].nome)}
function qEdita(id){const q=QID[id];sess.qEdit=id;sess.edAcertoManual=q._acertoManual;sess.edTags=[...q.tags];sess.edImgs={a:[...(q.imgs||[])],c:[...(q.imgsCom||[])]};sess.tgEd=null;render()}
function qSalva(id){
  const q=QID[id],alts={},coment={};
  Object.keys(q.alts).forEach(l=>{alts[l]=$('#ed_a_'+l).value.trim();coment[l]=$('#ed_c_'+l).value.trim()});
  const ac=$('#ed_ac').value.trim();
  edSet(id,{enunciado:$('#ed_en').value.trim(),alts,coment,gab:$('#ed_g').value,tags:[...sess.edTags],cl:clParse($('#ed_cl').value),imgs:[...sess.edImgs.a],imgsCom:[...sess.edImgs.c],acerto:ac===''?null:Math.max(0,Math.min(100,+ac||0)),acertoManual:!!sess.edAcertoManual});
  sess.qEdit=null;sess.tgEd=null;render();toast('Questão salva')
}
// ---- tags editáveis: modo 'f' = rascunho no formulário de edição; modo 'q' = direto na questão (salva na hora) ----
const tgList=m=>m==='f'?sess.edTags:cur().tags;
function tgSet(m,arr){arr=[...new Set(arr)];if(m==='f'){sess.edTags=arr;tgDraw()}else{edSet(cur().id,{tags:arr});render()}}
function tgDraw(){const b=$('#tgbox');if(b)b.innerHTML=tgHtml('f');tgFocus()}
function tgFocus(){setTimeout(()=>{const e=$('#tgin');if(e){e.focus();e.select()}},0)}
function tgIni(m,i){sess.tgEd={m,i};if(m==='f')tgDraw();else{render();tgFocus()}}
function tgDel(m,i){sess.tgEd=null;tgSet(m,tgList(m).filter((_,k)=>k!==i))}
function tgOk(val){
  const ed=sess.tgEd;if(!ed)return;sess.tgEd=null;
  const parts=String(val).split(',').map(x=>x.trim()).filter(Boolean),arr=[...tgList(ed.m)];
  if(ed.i==='new')arr.push(...parts);else arr.splice(ed.i,1,...parts);   // vazio ao editar = remove
  tgSet(ed.m,arr);
  if(sess.tgNext){sess.tgNext=false;if(parts.length)tgIni(ed.m,'new')}}   // Enter: já abre "+ tag" para a próxima
function tgKey(e){if(e.key==='Enter'||e.key===','){e.preventDefault();sess.tgNext=true;e.target.blur()}else if(e.key==='Escape'){const m=sess.tgEd&&sess.tgEd.m;sess.tgEd=null;if(m==='f')tgDraw();else render()}}
function tgHtml(m){
  const L=tgList(m),ed=sess.tgEd&&sess.tgEd.m===m?sess.tgEd:null;
  const inp=v=>`<input id="tgin" class="tgin" list="tgdl" value="${esc(v)}" placeholder="tag (vírgula separa várias)" onkeydown="tgKey(event)" onblur="tgOk(this.value)">`;
  const chips=L.map((t,i)=>m==='q'&&isMeta(t)?'':ed&&ed.i===i?inp(t):`<span class="tag tge"><span title="Clique para editar" onclick="tgIni('${m}',${i})">${esc(t)}</span><span class="tgx" role="button" tabindex="0" title="Remover tag" aria-label="Remover tag ${esc(t)}" onclick="tgDel('${m}',${i})"><svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 2l6 6M8 2l-6 6"/></svg></span></span>`).join('');
  const cnt={};Q.forEach(q=>q.tags.forEach(t=>{if(!isMeta(t))cnt[t]=(cnt[t]||0)+1}));
  const dl=`<datalist id="tgdl">${Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,400).map(([t])=>`<option value="${esc(t)}">`).join('')}</datalist>`;
  return chips+(ed&&ed.i==='new'?inp(''):`<button type="button" class="tag tgadd" onclick="tgIni('${m}','new')">+ tag</button>`)+dl}
// ---- imagens editáveis (as suas ficam salvas como "u:ID" e sincronizam) ----
function imgComprime(file){return new Promise((ok,no)=>{const u=URL.createObjectURL(file),im=new Image();
  im.onload=()=>{URL.revokeObjectURL(u);let s=Math.min(1,1600/Math.max(im.width,im.height)),q=.85,out='';
    for(let k=0;k<6;k++){const c=document.createElement('canvas');c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);
      const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);
      out=c.toDataURL('image/jpeg',q);if(out.length<600000)break;s*=.8;q=Math.max(.6,q-.08)}
    ok(out)};
  im.onerror=()=>{URL.revokeObjectURL(u);no(new Error('img'))};im.src=u})}
async function edAddImgs(k,files){
  files=[...files].filter(f=>/^image\//.test(f.type));if(!files.length)return;
  for(const f of files){
    try{const d=await imgComprime(f),id=Date.now().toString(36)+Math.random().toString(36).slice(2,6);
      uimg[id]=d;try{localStorage.setItem('cbr_uimg',JSON.stringify(uimg))}catch(e){toast('Armazenamento do aparelho cheio: a imagem só ficará na nuvem.')}
      sess.edImgs[k].push('u:'+id);persist('g:'+id)}
    catch(e){toast('Não consegui ler essa imagem.')}}
  edImgDraw()}
function edDelImg(k,i){sess.edImgs[k].splice(i,1);edImgDraw()}
function edMvImg(k,i,d){const a=sess.edImgs[k],j=i+d;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];edImgDraw()}
function edImgHtml(k){
  const a=sess.edImgs[k];
  return `<div class="imgs edimgs">${a.map((u,i)=>`<div class="eimg"><img src="${imgSrc(u)}" alt="Imagem ${i+1}"><div class="eib"><button type="button" title="Mover para trás" onclick="edMvImg('${k}',${i},-1)">‹</button><button type="button" title="Mover para frente" onclick="edMvImg('${k}',${i},1)">›</button><button type="button" class="del" title="Apagar imagem" onclick="edDelImg('${k}',${i})">🗑</button></div></div>`).join('')||'<span class="mut">Sem imagens.</span>'}</div>
  <label class="btn s edup" style="cursor:pointer;display:inline-block;margin-top:4px;padding:6px 12px;font-size:.85rem">＋ Adicionar imagem<input type="file" accept="image/*" multiple hidden onchange="edAddImgs('${k}',this.files);this.value=''"></label>`}
function edImgDraw(){['a','c'].forEach(k=>{const b=$('#edimg_'+k);if(b)b.innerHTML=edImgHtml(k)})}
function edPaste(e){const fs=[...(e.clipboardData&&e.clipboardData.files||[])].filter(f=>/^image\//.test(f.type));if(fs.length){e.preventDefault();edAddImgs('a',fs);toast('Imagem colada em "Imagens da questão"')}}
function qOrig(id){edSet(id,null);sess.qEdit=null;render();toast('Questão original restaurada')}
function qEditForm(q){
  const ls=Object.keys(q.alts),ed=pon['e:'+q.id]&&pon['e:'+q.id].e;
  return `<div class="card" onpaste="edPaste(event)"><h2>Editar questão <small class="mut">${tituloQ(q)}</small></h2>
  <label style="display:block">Enunciado<textarea id="ed_en" style="min-height:120px;font:inherit">${esc(q.enunciado)}</textarea></label>
  <div class="sk"><b>Imagens da questão</b> <span class="mut">(também dá para colar com Ctrl+V)</span><div id="edimg_a">${edImgHtml('a')}</div></div>
  ${ls.map(l=>`<div class="sk"><b>${l})</b><textarea id="ed_a_${l}" style="min-height:50px;font:inherit">${esc(q.alts[l])}</textarea><label style="display:block">Comentário ${l}<textarea id="ed_c_${l}" style="min-height:50px;font:inherit">${esc(q.coment[l]||'')}</textarea></label></div>`).join('')}
  <div class="row"><label>Gabarito <select id="ed_g">${ls.map(l=>`<option ${l===q.gab?'selected':''}>${l}</option>`).join('')}</select></label>
  <label>Acerto global estimado (%) <input id="ed_ac" type="number" min="0" max="100" style="width:80px" value="${q.acerto??''}" oninput="sess.edAcertoManual=true"></label></div>
  <div class="sk"><b>Imagens do comentário</b> <span class="mut">(aparecem depois de responder)</span><div id="edimg_c">${edImgHtml('c')}</div></div>
  <label style="display:block;margin-top:10px">Classificação <span class="mut">(Tema &gt; Subtema &gt; Assunto · a grande área é corrigida em “Corrigir área…”)</span><input id="ed_cl" list="cldl" value="${esc((q.cl||[]).join(' > '))}" style="width:100%;box-sizing:border-box"></label><datalist id="cldl">${[...new Set(Q.filter(x=>x._a===q._a&&x.cl&&x.cl.length).map(x=>x.cl.join(' > ')))].sort().map(p=>`<option value="${esc(p)}">`).join('')}</datalist>
  <div style="margin-top:8px"><span class="mut">Tags (método e palavras-chave) · clique numa tag para editar, × para remover</span><div id="tgbox" class="tagstop">${tgHtml('f')}</div></div>
  <p class="mut">O CCQ (Conceito Chave da Questão) é editado no botão próprio, depois de responder. Aceita **negrito**, listas com "- " e tabelas com "|".</p>
  <div class="row"><button class="b" onclick="qSalva('${q.id}')">Salvar</button><button class="b s" onclick="sess.qEdit=null;render()">Cancelar</button>${ed?`<button class="b s" onclick="qOrig('${q.id}')">Restaurar original</button>`:''}</div></div>`;
}
function vQuiz(){
  if(!sess)return vHoje();
  if(sess.qEdit&&sess.qEdit===cur().id)return qEditForm(cur());
  const q=cur(),r=sess.resp[q.id],fb=!!r&&!sess.sim,sel=selAtual(),cut=sess.cut[q.id]||[];
  const alts=qAlternativas(q,{r,fb,sel,cut});
  const imgs=galeria(q,'q',fb);
  const imgsC=fb?galeria(q,'c'):'';
  const last=sess.i>=sess.ids.length-1;
  return `${sess.sim?`<div class="timer"><span id="tm"></span></div>`:''}
  <div class="qlay"><div style="min-width:0"><div class="card"><div class="row mut"><span>Questão ${sess.i+1}/${sess.ids.length}</span><small class="qpos" title="Posição da questão na página Questões do Notion">Notion #${q.n??'—'}</small><b class="qtitle">${tituloQ(q,fb)}</b>${fb?qDificuldade(q):''}${fb?prProvaBloco(q):''}</div>${fb?prAvisoBloco(q):''}
  ${fb?`${q.tags.length||q.cl?.length?`<div class="mut" style="font-size:.82rem;margin-top:10px">Classificação do banco/Codex: ${esc([AREA_BY[q._a].nome,...(q.cl||[])].join(' › '))}</div>${q.tags.length?`<div class="tagstop">${tgHtml('q')}</div>`:''}`:''}`:''}
  ${qEnunciado(q,imgs)}${alts}
  ${precisaConf()?`<div class="conf"><p class="mut">Quão seguro você está de ${sel})?</p><button class="b" onclick="responder('${sel}','certeza')">${keyLab('cert')} · Certeza</button><button class="b s" onclick="responder('${sel}','duvida')">${keyLab('duv')} · Dúvida</button><button class="b s" onclick="responder('${sel}','chute')">${keyLab('chu')} · Chute</button></div>`:''}
  ${sess.sim&&r&&!precisaConf()?`<p class="mut">Resposta registrada (${r.conf}). Para trocar, escolha outra alternativa.</p>`:''}
  ${fb?`<div style="margin-top:10px"><b style="color:var(--${r.ok?'ok':'bad'})">${r.ok?'Acertou':'Errou · gabarito '+q.gab}</b> <span class="mut">(${r.conf})</span>
   ${bannerResp(q,r)}${blocoFeedback(q,r,`${cursoBloco(q)}${claudeMdBloco(q)}${pontoBloco(q)}${iaBloco(q)}`)}<div class="imgs">${imgsC}</div>
   <div class="row"><button class="b" onclick="proxima()">${last?'Finalizar':'Próxima ('+keyLab('next')+')'}</button><button class="b s" onclick="editar()">Editar resposta (${keyLab('edit')})</button></div></div>`:''}
  </div><div class="row">${sess.modo==='estudo'&&!sess.sim?`<button class="b s" onclick="salvaEst();go('estudar')">Salvar e sair</button>`:''}<button class="b s" onclick="terminar()">Encerrar</button>${fb?`<select id="q_area" onchange="reclass('${q.id}',this.value)"><option value="">Corrigir área…</option>${AREAS.map(a=>`<option value="${a.id}">${a.nome}</option>`).join('')}</select>`:''}

  <button class="b s" onclick="qEdita('${q.id}')">✎ Editar questão</button></div></div>${painelNav()}</div>`;
}
function reclass(id,a){if(!a)return;over[id]=a;QID[id]._a=a;persist('_est');render()}
let zl=[],zi=0,zs=1,zx=0,zy=0;const zp=new Map();let zmoved=false,zdist=0;
function zoom(u){const q=sess&&tela==='quiz'?cur():null;u=imgSrc(u);zl=q?[...(q.imgs||[]),...(q.imgsCom||[])].map(imgSrc).filter(Boolean):[u];if(!zl.includes(u))zl=[u];zi=zl.indexOf(u);$('#zimg').src=zl[zi];$('#zoom').hidden=false;zUi();zFit()}
function zUi(){$('#zinfo').textContent=zl.length>1?`${zi+1}/${zl.length}`:''}
function zApply(){$('#zimg').style.transform=`translate(${zx}px,${zy}px) scale(${zs})`}
function zFit(){zs=1;zx=0;zy=0;zApply()}
function zClose(){$('#zoom').hidden=true}
function zStep(d){if(zl.length<2)return;zi=(zi+d+zl.length)%zl.length;$('#zimg').src=zl[zi];zUi();zFit()}
function zScale(f,px,py){const r=$('#zst').getBoundingClientRect();px??=0;py??=0;const ns=Math.max(.5,Math.min(8,zs*f));zx=px-(px-zx)*(ns/zs);zy=py-(py-zy)*(ns/zs);zs=ns;zApply()}
(function(){const st=$('#zst');
  const rel=e=>{const r=st.getBoundingClientRect();return [e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2]};
  st.addEventListener('wheel',e=>{e.preventDefault();const [x,y]=rel(e);zScale(e.deltaY<0?1.18:1/1.18,x,y)},{passive:false});
  st.addEventListener('pointerdown',e=>{st.setPointerCapture(e.pointerId);zp.set(e.pointerId,[e.clientX,e.clientY]);zmoved=false;zdist=0});
  st.addEventListener('pointermove',e=>{if(!zp.has(e.pointerId))return;const o=zp.get(e.pointerId);zp.set(e.pointerId,[e.clientX,e.clientY]);
    if(zp.size===1){const dx=e.clientX-o[0],dy=e.clientY-o[1];if(Math.abs(dx)+Math.abs(dy)>1)zmoved=true;zx+=dx;zy+=dy;zApply()}
    else if(zp.size===2){const [a,b]=[...zp.values()],d=Math.hypot(a[0]-b[0],a[1]-b[1]);zmoved=true;if(zdist){const [x,y]=rel({clientX:(a[0]+b[0])/2,clientY:(a[1]+b[1])/2});zScale(d/zdist,x,y)}zdist=d}});
  const up=e=>{zp.delete(e.pointerId);zdist=0};st.addEventListener('pointerup',e=>{if(!zmoved&&e.target===st)zClose();up(e)});st.addEventListener('pointercancel',up);
  st.addEventListener('dblclick',e=>{const [x,y]=rel(e);if(zs>1.05)zFit();else zScale(2.6,x,y)});
})();
document.addEventListener('keydown',e=>{
  if(capKey){capturaTecla(e);return}
  if(!$('#zoom').hidden){if(e.key==='Escape')zClose();else if(keyIs(e,'znext'))zStep(1);else if(keyIs(e,'zprev'))zStep(-1);else if(keyIs(e,'zin')||(KEY('zin')==='+'&&e.key==='='))zScale(1.4);else if(keyIs(e,'zout'))zScale(1/1.4);else if(keyIs(e,'zfit'))zFit();return}
  if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||e.target.isContentEditable||e.ctrlKey||e.metaKey||e.altKey)return;
  const k=e.key;
  if(tela==='fcstudy'){fcKey(e);return}
  if(tela!=='quiz'||!sess)return;
  const q=cur(),r=sess.resp[q.id],fb=!!r&&!sess.sim,sel=selAtual(),L=Object.keys(q.alts);
  if(k==='ArrowRight'){e.preventDefault();if(sess.i>=sess.ids.length-1)toast('Última questão');else irPara(sess.i+1);return}
  if(k==='ArrowLeft'){e.preventDefault();irPara(sess.i-1);return}
  if(fb&&(k==='ArrowDown'||k==='ArrowUp')){e.preventDefault();qRola(k==='ArrowDown'?1:-1);return}   // depois de responder: rolagem suave da página (build/questoes.js)
  if(!fb&&(k==='ArrowDown'||k==='ArrowUp')){e.preventDefault();const c=sel?L.indexOf(sel):-1;
    escolher(L[k==='ArrowDown'?Math.min(c+1,L.length-1):c<0?L.length-1:Math.max(c-1,0)]);return}
  if(keyIs(e,'cut')&&sel){riscar(sel);return}
  if(!fb){
    for(let i=0;i<5;i++){const l='ABCDE'[i];if(q.alts[l]&&keyIs(e,'a'+(i+1))){escolher(l);return}}
    if(precisaConf()){
      if(keyIs(e,'cert')){responder(sel,'certeza');return}
      if(keyIs(e,'duv')){responder(sel,'duvida');return}
      if(keyIs(e,'chu')){responder(sel,'chute');return}
      if(k==='Enter'){e.preventDefault();responder(sel,'certeza')}
    }
  }else{
    if(keyIs(e,'next')||k===' '){e.preventDefault();proxima()}
    else if(keyIs(e,'edit'))editar();
    else if(keyIs(e,'ia')){if(ia[q.id])toast('O resumo já foi gerado e está salvo.');else gerarIA(q.id)}
  }
});

function vFim(){
  const rs=sess.ids.map(i=>[QID[i],sess.resp[i]]),resp=rs.filter(x=>x[1]),ok=resp.filter(x=>x[1].ok).length;
  const por={};rs.forEach(([q,r])=>{const p=por[q._a]??={n:0,ok:0};p.n++;if(r?.ok)p.ok++});
  const ms=Date.now()-sess.t0;
  return `<div class="card"><h2>Sessão concluída</h2><div class="kpis"><div class="kpi"><b>${pct(ok,sess.ids.length)}%</b><span class="mut">${ok}/${sess.ids.length} (${resp.length} respondidas)</span></div><div class="kpi"><b>${Math.round(ms/60000)} min</b><span class="mut">tempo total</span></div></div>
  <h3 style="margin-top:16px">Por área</h3><div class="tw"><table>${Object.entries(por).map(([a,p])=>`<tr><td>${AREA_BY[a].nome}</td><td>${p.ok}/${p.n}</td><td style="width:35%">${barra(pct(p.ok,p.n),corAc(pct(p.ok,p.n)))}</td></tr>`).join('')}</table></div>
  <p class="row"><button class="b" onclick="revisarErros()">Revisar erros</button> <button class="b s" onclick="go('hoje')">Início</button></p></div>`;
}
function revisarErros(){const e=sess.ids.filter(i=>!sess.resp[i]?.ok);if(!e.length){toast('Nenhum erro');return}iniciar(e,'erros')}


// ===== flashcards (estilo Anki) =====
const FC0=()=>[2.5,0,0,0,0,0,0]; // ease, intervalo(d), repetições, vence(ms), lapsos, último(ms), suspenso
const fst=id=>fcs[id]||FC0();
const cardBy=id=>cards.find(c=>c.id===id);
const fcAtivos=()=>cards.filter(c=>!c.x&&!fst(c.id)[6]);
function fcContagem(){
  const now=Date.now(),h=hoje0();let n=0,d=0,m=0,hj=0,nh=0;
  fcAtivos().forEach(c=>{const s=fcs[c.id];if(!s||s[2]===0)n++;else{if(s[3]<=now)d++;if(s[1]>=21)m++}});
  Object.values(fcs).forEach(s=>{if((s[5]||0)>=h){hj++;if(s[2]===1&&s[4]===0)nh++}});
  return {n,d,m,hj,nh,tot:fcAtivos().length};
}
const fcFmt=d=>d>=365?(d/365).toFixed(1).replace('.',',')+' a':d>=30?(d/30).toFixed(1).replace('.',',')+' m':d+' d';
function fcNext(s,g,inRe){
  let [ease,ivl,reps,due,lapses]=s,again=false,ni=0;const t=Date.now();
  if(inRe){ // reaprendendo na sessão: só sai da fila ao acertar
    if(g===1)again=true;
    return {st:[ease,ivl,reps,due,lapses,t,s[6]],again,lb:g===1?'<1 min':fcFmt(Math.max(ivl,1))};
  }
  if(reps===0){
    if(g<=2)again=true;else{reps=1;ni=g===3?1:4;if(g===4)ease+=.15}
  }else if(g===1){lapses++;ease=Math.max(1.3,ease-.2);ni=1;again=true}
  else if(g===2){ease=Math.max(1.3,ease-.15);ni=Math.max(ivl+1,Math.round(ivl*1.2));reps++}
  else if(g===3){ni=Math.max(ivl+1,Math.round(ivl*ease));reps++}
  else{ni=Math.max(ivl+1,Math.round(ivl*ease*1.3));ease+=.15;reps++}
  const lb=reps===0||(again&&s[2]===0)?(g===1?'<1 min':'<10 min'):again?'<1 min':fcFmt(ni);
  const nreps=again&&s[2]>0?s[2]:reps;
  return {st:[ease,again?(s[2]>0?1:0):ni,nreps,again?(s[2]>0?t+DAY:0):t+ni*DAY,lapses,t,s[6]],again,lb};
}
let fq=null,fcBusca='',fcDelId=null,fcTags=new Set(),fcNew={f:'',v:''},fcEdit=null;
const cTags=c=>{const t=String(c.tg||'').trim();return (/[;,]/.test(t)?t.split(/[;,]/):t.split(/\s+/)).map(x=>x.trim()).filter(Boolean)};
const cTagOk=c=>!fcTags.size||cTags(c).some(t=>fcTags.has(norm(t)));
function fcTog(k){fcTags.has(k)?fcTags.delete(k):fcTags.add(k);render()}
function fcStart(){
  const now=Date.now(),c=fcContagem(),A=fcAtivos().filter(cTagOk);
  const rev=A.filter(x=>{const s=fcs[x.id];return s&&s[2]>0&&s[3]<=now}).sort((a,b)=>fcs[a.id][3]-fcs[b.id][3]).slice(0,cfg.fcMax).map(x=>x.id);
  const nov=A.filter(x=>!fcs[x.id]||fcs[x.id][2]===0).slice(0,Math.max(0,cfg.fcNovos-c.nh)).map(x=>x.id);
  const queue=[...rev,...nov];
  if(!queue.length){toast('Nada para estudar agora.');return}
  fq={queue,shown:false,hist:[],re:new Set(),tot:queue.length};
  go('fcstudy');
}
function fcGrade(g){
  if(!fq||!fq.queue.length||!fq.shown)return;
  const id=fq.queue[0],s=fst(id);
  fq.hist.push({id,prev:fcs[id]?[...fcs[id]]:null,queue:[...fq.queue],re:[...fq.re]});
  const r=fcNext(s,g,fq.re.has(id));
  fcs[id]=r.st;fq.queue.shift();
  if(r.again){fq.re.add(id);fq.queue.splice(Math.min(fq.queue.length,g===1?3:6),0,id)}else fq.re.delete(id);
  fq.shown=false;persist('s:'+hk(id,8));render();
}
function fcUndo(){
  if(!fq||!fq.hist.length){toast('Nada para desfazer');return}
  const h=fq.hist.pop();
  if(h.prev)fcs[h.id]=h.prev;else delete fcs[h.id];
  fq.queue=h.queue;fq.re=new Set(h.re);fq.shown=false;persist('s:'+hk(h.id,8));render();toast('Desfeito');
}
function fcKey(e){
  if(!fq)return;const k=e.key;
  if(keyIs(e,'fcshow')||k==='Enter'){e.preventDefault();if(!fq.queue.length)return;if(!fq.shown){fq.shown=true;render()}else fcGrade(3)}
  else if(keyIs(e,'fc1'))fcGrade(1);else if(keyIs(e,'fc2'))fcGrade(2);else if(keyIs(e,'fc3'))fcGrade(3);else if(keyIs(e,'fc4'))fcGrade(4);
  else if(keyIs(e,'fcundo'))fcUndo();
  else if(k==='Escape')go('fc');
}
function fcFace(c){
  const clz=/\{\{c\d+::(.*?)(?:::.*?)?\}\}/g,F=rtHtml(c.f),V=rtHtml(c.v||'');
  if(clz.test(F)){
    return {f:F.replace(clz,'<span class="cz">[...]</span>'),b:F.replace(clz,'<span class="cz on">$1</span>')+(V?'<br><br>'+V:'')};
  }
  return {f:F,b:V};
}
function vFcStudy(){
  if(!fq)return vFc();
  if(!fq.queue.length){const c=fcContagem();return `<div class="card" style="text-align:center"><h2>Sessão concluída</h2><p class="mut">${fq.tot} cartões estudados. Restam ${c.d} a rever e ${c.n} novos.</p><div class="row" style="justify-content:center"><button class="b" onclick="go('fc')">Voltar aos cartões</button>${fq.hist.length?`<button class="b s" onclick="fcUndo()">Desfazer (Z)</button>`:''}</div></div>`}
  const id=fq.queue[0],c=cardBy(id),f=fcFace(c),s=fst(id),re=fq.re.has(id);
  const nn=fq.queue.filter(x=>!fq.re.has(x)&&(fcs[x]?.[2]??0)===0).length,nl=fq.queue.filter(x=>fq.re.has(x)).length,nr=fq.queue.length-nn-nl;
  const lbl=g=>fcNext(s,g,re).lb;
  return `<div class="fcbar"><button class="b s" onclick="go('fc')">Sair (Esc)</button><div class="fcn"><span style="color:var(--pri-tx)">${nn} novos</span><span style="color:var(--bad)">${nl} aprendendo</span><span style="color:var(--ok)">${nr} a rever</span></div></div>
  <div class="card fcard"><div class="fcf">${f.f}</div>${fq.shown?`<hr><div class="fcf">${f.b||'<span class="mut">(sem verso)</span>'}</div>`:''}
  ${c.tg?`<div class="mut" style="margin-top:14px;font-size:.78rem">${esc(c.tg)}</div>`:''}</div>
  ${fq.shown?`<div class="fcg"><button class="g1" onclick="fcGrade(1)"><small>${lbl(1)}</small>Errei <kbd>${keyLab('fc1')}</kbd></button><button class="g2" onclick="fcGrade(2)"><small>${lbl(2)}</small>Difícil <kbd>${keyLab('fc2')}</kbd></button><button class="g3" onclick="fcGrade(3)"><small>${lbl(3)}</small>Bom <kbd>${keyLab('fc3')}</kbd></button><button class="g4" onclick="fcGrade(4)"><small>${lbl(4)}</small>Fácil <kbd>${keyLab('fc4')}</kbd></button></div>`
   :`<div class="row" style="justify-content:center"><button class="b" style="min-width:260px;padding:14px" onclick="fq.shown=true;render()">Mostrar resposta <kbd>${keyLab('fcshow')}</kbd></button></div>`}
  <p class="mut" style="text-align:center;margin-top:14px;font-size:.8rem">${keyLab('fcshow')}: mostrar e marcar Bom · ${keyLab('fc1')}–${keyLab('fc4')}: nota · ${keyLab('fcundo')}: desfazer · Esc: sair</p>`;
}
function cardHoje(){
  const c=fcContagem();
  return `<div class="card" id="card_fc" style="margin-top:16px"><div class="row" style="justify-content:space-between"><span class="kick">Flashcards</span><span class="pill">${c.tot} no total</span></div><h3>Cartões de hoje</h3>
  <p class="mut">${c.tot?`${c.d} a rever, ${c.n} novos (limite ${cfg.fcNovos} por dia).`:'Nenhum cartão ainda. Importe seus flashcards na aba Flashcards.'}</p>
  <div class="row"><button class="b" ${c.d+Math.min(c.n,Math.max(0,cfg.fcNovos-c.nh))?'':'disabled'} onclick="fcStart()">Estudar cartões</button></div></div>`;
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
function fcEditAbre(id){const c=cardBy(id);if(!c)return;fcEdit={id,f:rtHtml(c.f),v:rtHtml(c.v),tg:c.tg||''};render();setTimeout(()=>{const e=$('#ed_f');if(e)e.scrollIntoView({block:'center'})},50)}
function fcEditSalva(){const c=cardBy(fcEdit.id),f=rtVal(fcEdit.f),v=rtVal(fcEdit.v);if(!f){toast('A frente não pode ficar vazia.');return}
  Object.assign(c,{f,v,tg:fcEdit.tg.trim(),u:Date.now()});persist('c:'+hk(c.id,32));fcEdit=null;render();toast('Flashcard salvo')}
function fcSusp(id){const s=fst(id).slice();s[6]=s[6]?0:1;s[5]=Date.now();fcs[id]=s;persist('s:'+hk(id,8));render()}
function fcDel(id){if(fcDelId!==id){fcDelId=id;render();return}fcDelId=null;const c=cardBy(id);c.x=1;c.u=Date.now();persist('c:'+hk(id,32));render();toast('Cartão excluído')}
function vFc(){
  const c=fcContagem(),q=norm(fcBusca||'');
  const lista=cards.filter(x=>!x.x&&cTagOk(x)&&(!q||norm(rtTxt(x.f)+' '+rtTxt(x.v)+' '+(x.tg||'')).includes(q))).slice(0,60);
  const TG={};cards.filter(x=>!x.x).forEach(x=>cTags(x).forEach(t=>{const k=norm(t);(TG[k]??={t,n:0}).n++}));
  const nSel=fcAtivos().filter(cTagOk).length;
  const now=Date.now();
  return `<div class="card"><h2>Flashcards</h2>
  <div class="kpis"><div class="kpi"><b style="color:var(--pri-tx)">${c.n}</b><span class="mut">novos</span></div><div class="kpi"><b style="color:var(--ok)">${c.d}</b><span class="mut">a rever</span></div><div class="kpi"><b>${c.m}</b><span class="mut">maduros (21+ d)</span></div><div class="kpi"><b>${c.hj}</b><span class="mut">revisados hoje</span></div></div>
  <div class="row" style="margin-top:14px"><button class="b" ${c.tot?'':'disabled'} onclick="fcStart()">Estudar agora</button><span class="mut">${c.tot} cartões · ${cfg.fcNovos} novos e ${cfg.fcMax} revisões por dia (ajuste em Config)</span></div></div>
  <div class="card"><h3>Selecionar por tags</h3>${Object.keys(TG).length?`<div>${Object.entries(TG).sort((a,b)=>b[1].n-a[1].n).map(([k,x])=>`<button class="tag ${fcTags.has(k)?'on':''}" style="cursor:pointer" onclick="fcTog('${k.replace(/'/g,"\\'")}')">${esc(x.t)} · ${x.n}</button>`).join('')}</div>
  <p class="row" style="margin-top:10px"><button class="b" ${fcTags.size&&nSel?'':'disabled'} onclick="fcStart()">Estudar selecionados (${fcTags.size?nSel:0})</button><button class="b s" ${fcTags.size?'':'disabled'} onclick="fcTags.clear();render()">Limpar seleção</button><span class="mut">Cartões com qualquer uma das tags marcadas. A lista abaixo e o botão Estudar agora também respeitam a seleção.</span></p>`:'<p class="mut">Os cartões ainda não têm tags.</p>'}</div>
  <div class="card"><h3>Adicionar cartão</h3><div class="row" style="align-items:stretch"><div style="flex:1;min-width:220px">${rtEd('fc_f',fcNew.f,370,'fcNew.f','Frente (aceita {{c1::lacuna}} estilo Anki)')}</div><div style="flex:1;min-width:220px">${rtEd('fc_v',fcNew.v,370,'fcNew.v','Verso')}</div></div>
  <p class="row"><input id="fc_t" placeholder="Tags (opcional)" style="flex:1;min-width:180px"><button class="b" onclick="fcAdd()">Adicionar</button></p></div>
  <div class="card"><h3>Importar cartões</h3><p class="mut">Cole uma linha por cartão: <code>frente ⇥ verso ⇥ tags</code> (separado por TAB, como o export de texto do Anki, ou por ponto e vírgula). Também aceita JSON: <code>[{"f":"...","v":"..."}]</code>. Duplicados são ignorados.</p>
  <textarea id="fc_imp" placeholder="Cole aqui"></textarea><p><button class="b s" onclick="fcImportar()">Importar</button></p></div>
  <div class="card"><h3>Navegar (${cards.filter(x=>!x.x).length})</h3><p class="row"><input id="fc_q" placeholder="Buscar nos cartões" value="${esc(fcBusca)}" onchange="fcBusca=this.value;render()" style="flex:1;min-width:200px"></p>
  ${lista.length?`<div class="tw"><table><tr><th>Frente</th><th>Estado</th><th></th></tr>${lista.map(x=>{const s=fcs[x.id];const st=s&&s[6]?'suspenso':!s||s[2]===0?'novo':s[3]<=now?'vencido':'em '+Math.max(1,Math.ceil((s[3]-now)/DAY))+' d';
   return `<tr><td>${esc(rtTxt(x.f).slice(0,90))}</td><td>${st}${s&&s[2]>0?` · ${fcFmt(s[1])}`:''}</td><td style="white-space:nowrap"><button class="b s" style="padding:4px 10px" onclick="fcEditAbre('${x.id}')">Editar</button> <button class="b s" style="padding:4px 10px" onclick="fcSusp('${x.id}')">${s&&s[6]?'Reativar':'Suspender'}</button> <button class="b s" style="padding:4px 10px" onclick="fcDel('${x.id}')">${fcDelId===x.id?'Confirmar':'Excluir'}</button></td></tr>${fcEdit&&fcEdit.id===x.id?`<tr><td colspan="3"><div class="iab"><div class="kick">Editar flashcard</div><div><b style="font-size:.85rem">Frente</b>${rtEd('ed_f',fcEdit.f,120,'fcEdit.f')}</div><div style="margin-top:8px"><b style="font-size:.85rem">Verso</b>${rtEd('ed_v',fcEdit.v,300,'fcEdit.v')}</div><label style="display:block;margin-top:6px">Tags (separadas por ;)<input style="width:100%" value="${esc(fcEdit.tg)}" oninput="fcEdit.tg=this.value"></label><div class="row" style="margin-top:8px"><button class="b" onclick="fcEditSalva()">Salvar</button><button class="b s" onclick="fcEdit=null;render()">Cancelar</button></div></div></td></tr>`:''}`}).join('')}</table></div>`:'<p class="mut">Nenhum cartão ainda. Importe ou adicione acima.</p>'}</div>`;
}

// ---- painel ----
// Boxes do painel, na ordem padrão; a ordem escolhida fica salva em cfg.pnOrd (sincroniza).
const PN_BOXES=[['foco','Foco até a prova (CBR)',()=>vFoco()],['resumo','Visão geral',()=>vResumo()],['calendario','Calendário de estudo',()=>vCalendario()],['cobertura','Cobertura do banco',()=>vCobertura()],['evolucao','Evolução do acerto',()=>vEvolucao()],['fila','Fila de revisão',()=>vFila()],['reforcar','Temas para reforçar',()=>vReforcar()],['confianca','Calibração da confiança',()=>vConfianca()],['ritmo','Ritmo e tempo',()=>vRitmo()],['dificuldade','Desempenho por dificuldade',()=>vDificuldade()],['area','Desempenho por área',()=>vAreaCard()],['marcos','Marcos',()=>vMarcos()],['incidencia','Incidência no banco',()=>vIncidencia()]];
const pnOrdem=()=>{const ids=PN_BOXES.map(b=>b[0]),sv=(cfg.pnOrd||[]).filter(i=>ids.includes(i));return (r=>sv.includes('foco')?r:['foco',...r.filter(i=>i!=='foco')])([...sv,...ids.filter(i=>!sv.includes(i))])};
function pnMove(id,d){
  const ord=pnOrdem(),vis=ord.filter(i=>PN_BOXES.find(b=>b[0]===i)[2]()),k=vis.indexOf(id),n=vis[k+d];if(!n)return;
  const a=ord.indexOf(id),b=ord.indexOf(n);[ord[a],ord[b]]=[ord[b],ord[a]];cfg.pnOrd=ord;persist('_est');render()}
function pnPadrao(){cfg.pnOrd=[];persist('_est');render()}
function vAreaCard(){
  const {S,P}=prioridades(),tot=Object.values(P).reduce((a,b)=>a+b,0)||1;
  const linhas=Object.entries(S).sort((a,b)=>(P[b[0]]??-1)-(P[a[0]]??-1)).map(([id,s])=>{
    const ac=pct(s.ok,s.n),so=pct(s.solido,s.n);
    return `<tr><td>${AREA_BY[id].nome}</td><td>${s.banco}</td><td>${s.n}</td><td style="min-width:90px">${s.n?`${ac}%${barra(ac,corAc(ac))}`:'—'}</td><td>${s.n?so+'%':'—'}</td><td>${P[id]!=null?Math.round(P[id]/tot*100)+'%':''}</td></tr>`}).join('');
  const sol=log.filter(l=>l.ok&&l.conf==='certeza').length,chu=log.filter(l=>l.ok&&l.conf!=='certeza').length;
  return `<div class="card"><h2>Desempenho por área</h2><p class="mut">Prioridade = peso da área × (1 − acerto). <b>Sólido</b> = acertou com certeza.</p>
  <div class="tw"><table><tr><th>Área</th><th>Banco</th><th>Resp.</th><th>Acerto</th><th>Sólido</th><th>Prioridade</th></tr>${linhas}</table></div>
  <p class="mut">Acertos frágeis (dúvida/chute): ${chu} de ${sol+chu}.</p></div>`}
function vPainel(){
  if(!log.length)return vFoco()+`<div class="card">Responda algumas questões para o painel aparecer.</div>`+vIncidencia();
  const ed=!!pn.ord,ord=pnOrdem(),itens=ord.map(i=>[i,PN_BOXES.find(b=>b[0]===i)]).map(([i,b])=>[i,b[1],b[2]()]).filter(x=>x[2]),
    barra=`<div class="row" style="justify-content:flex-end;margin-bottom:10px">${ed?'<button class="b s" onclick="pnPadrao()">Ordem padrão</button>':''}<button class="b ${ed?'':'s'}" onclick="pn.ord=!pn.ord;render()">${ed?'Concluir':'⇅ Reordenar boxes'}</button></div>`;
  return barra+itens.map(([id,nome,h],k)=>ed?`<div class="pnw"><div class="pnbar"><b>${esc(nome)}</b><span><button class="b s" ${k?'':'disabled'} onclick="pnMove('${id}',-1)" aria-label="Subir ${esc(nome)}">↑ Subir</button><button class="b s" ${k<itens.length-1?'':'disabled'} onclick="pnMove('${id}',1)" aria-label="Descer ${esc(nome)}">↓ Descer</button></span></div><div class="pnc">${h}</div></div>`:h).join('');
}
// ---- painel: contagens, evolução, pontos fracos e calendário ----
function periodo(ini,fim){const L=log.filter(l=>l.t>=ini&&l.t<fim);return {n:L.length,ok:L.filter(l=>l.ok).length}}
// ---- painel: visão geral, calendário, cobertura do banco, ritmo, confiança, fila de revisão e marcos ----
let pn={mes:0,dia:null,ord:false};
const addD=(t,n)=>{const x=new Date(t);x.setDate(x.getDate()+n);return +x};
const DSEM=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
function pnMes(d){pn.mes=Math.min(0,pn.mes+d);pn.dia=null;render()}
function pnDia(k){pn.dia=pn.dia===k?null:k;render()}
function diasLog(){const c={};log.forEach(l=>{const x=c[dKey(l.t)]??={n:0,ok:0,ms:0,q:[]};x.n++;if(l.ok)x.ok++;x.ms+=l.ms||0;x.q.push(l)});return c}
function sequencia(c){
  let atual=0,d=hoje0();if(!c[dKey(d)])d=addD(d,-1);
  while(c[dKey(d)]){atual++;d=addD(d,-1)}
  const ks=Object.keys(c).sort();let rec=0,run=0,prev=null;
  ks.forEach(k=>{const t=+new Date(k+'T00:00:00');run=prev!==null&&Math.round((t-prev)/DAY)===1?run+1:1;prev=t;if(run>rec)rec=run});
  return {atual,rec}}
const primeiras=()=>{const f={};log.slice().sort((a,b)=>a.t-b.t).forEach(l=>{if(!f[l.q])f[l.q]=l.t});return f};
function anel(v,max,txt,sub){
  const r=42,c=2*Math.PI*r,p=Math.min(1,max?v/max:0);
  return `<svg viewBox="0 0 100 100" width="104" height="104" role="img" aria-label="${txt}"><circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--bd)" stroke-width="9"/><circle cx="50" cy="50" r="${r}" fill="none" stroke="${p>=1?'var(--ok)':'var(--pri)'}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c*p} ${c}" transform="rotate(-90 50 50)"/><text x="50" y="52" text-anchor="middle" font-size="22" font-weight="700" fill="var(--tx)" font-family="Sora,sans-serif">${txt}</text><text x="50" y="67" text-anchor="middle" font-size="8.5" fill="var(--mut)">${sub}</text></svg>`}
function vResumo(){
  const h=hoje0(),sg=segunda(),d=new Date(),m0=+new Date(d.getFullYear(),d.getMonth(),1),mp=+new Date(d.getFullYear(),d.getMonth()-1,1),F=9e15;
  const it=[['Esta semana',periodo(sg,F),'semana passada: '+periodo(sg-7*DAY,sg).n],['Este mês',periodo(m0,F),'mês passado: '+periodo(mp,m0).n]];
  const hj=periodo(h,F),ont=periodo(h-DAY,h),meta=cfg.diario||20,c=diasLog(),sq=sequencia(c),f=primeiras(),novasHoje=Object.values(f).filter(t=>t>=h).length;
  const geral=periodo(0,F);
  return `<div class="card"><h2>Visão geral</h2><div class="hero"><div class="hr1">${anel(hj.n,meta,hj.n,'de '+meta+' hoje')}<div><b>${hj.n>=meta?'Meta do dia batida!':'Faltam '+(meta-hj.n)+' para a meta'}</b><div class="mut">${hj.n?pct(hj.ok,hj.n)+'% de acerto · ':''}ontem: ${ont.n}<br>${novasHoje} inéditas hoje</div></div></div>
  <div class="rsm" style="flex:1;min-width:260px">${it.map(([t,x,c2])=>`<div class="kpi"><span class="mut">${t}</span><b>${x.n}</b><span class="mut">${x.n?pct(x.ok,x.n)+'% de acerto · ':''}${c2}</span></div>`).join('')}
  <div class="kpi"><span class="mut">Sequência</span><b>${sq.atual} <small style="font:600 .8rem var(--fb)">${sq.atual===1?'dia':'dias'}</small></b><span class="mut">recorde: ${sq.rec}</span></div>
  <div class="kpi"><span class="mut">Acerto geral</span><b>${pct(geral.ok,geral.n)}%</b><span class="mut">${geral.n} respostas</span></div></div></div></div>`}
function vCalendario(){
  const c=diasLog(),h=new Date(),ref=new Date(h.getFullYear(),h.getMonth()+pn.mes,1),mk=ref.getMonth(),dow=(ref.getDay()+6)%7,nd=new Date(ref.getFullYear(),mk+1,0).getDate(),meta=cfg.diario||20,hk=dKey(Date.now());
  let dias=0,qs=0,ok=0,batidas=0;const cells=[];
  for(let i=0;i<dow;i++)cells.push('<i class="cd vz"></i>');
  for(let d=1;d<=nd;d++){const dt=new Date(ref.getFullYear(),mk,d),k=dKey(dt),x=c[k],n=x?x.n:0,fut=+dt>Date.now();
    if(n){dias++;qs+=n;ok+=x.ok;if(n>=meta)batidas++}
    const lv=n>=meta?'l3':n>=meta/2?'l2':n?'l1':'';
    cells.push(`<button type="button" class="cd ${lv} ${k===hk?'hj':''} ${pn.dia===k?'sel':''}" ${fut?'disabled':''} onclick="pnDia('${k}')" aria-label="${dt.toLocaleDateString('pt-BR')}: ${n} questões"><span>${d}</span>${n?`<small>${n}</small>`:''}</button>`)}
  const sel=pn.dia&&c[pn.dia];let det='';
  if(pn.dia){const dt=new Date(pn.dia+'T00:00:00'),tt=dt.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});
    if(sel){const A={};sel.q.forEach(l=>{const q=QID[l.q];if(q){const a=AREA_BY[q._a].nome;(A[a]??={n:0,ok:0}).n++;if(l.ok)A[a].ok++}});
      det=`<div class="iab" style="margin-top:12px"><div class="kick">${esc(tt)}</div><b>${sel.n} questões</b> · ${pct(sel.ok,sel.n)}% de acerto${sel.ms?` · ~${Math.round(sel.ms/sel.n/1000)} s por questão`:''}<div style="margin-top:6px">${Object.entries(A).sort((a,b)=>b[1].n-a[1].n).map(([a,x])=>`<span class="tag">${esc(a)} · ${x.ok}/${x.n}</span>`).join('')}</div></div>`}
    else det=`<div class="iab" style="margin-top:12px"><div class="kick">${esc(tt)}</div><span class="mut">Nenhuma questão neste dia.</span></div>`}
  const mes=ref.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  return `<div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Calendário de estudo</h2><div class="row" style="gap:4px"><button class="b s calb" onclick="pnMes(-1)" aria-label="Mês anterior">‹</button><b style="min-width:9.5em;text-align:center;text-transform:capitalize">${mes}</b><button class="b s calb" ${pn.mes>=0?'disabled':''} onclick="pnMes(1)" aria-label="Próximo mês">›</button></div></div>
  <p class="mut" style="margin:6px 0 12px"><b style="color:var(--tx)">${dias}</b> ${dias===1?'dia estudado':'dias estudados'} · <b style="color:var(--tx)">${qs}</b> questões${qs?' · '+pct(ok,qs)+'% de acerto':''} · ${batidas} ${batidas===1?'dia':'dias'} com a meta de ${meta}</p>
  <div class="cal">${DSEM.map(s=>`<div class="dw">${s}</div>`).join('')}${cells.join('')}</div>
  <div class="row mut" style="gap:12px;margin-top:10px;font-size:.78rem"><span><i class="lg"></i> estudou</span><span><i class="lg l2"></i> metade da meta</span><span><i class="lg l3"></i> meta batida</span></div>${det}</div>`}
function vCobertura(){
  const U={};log.forEach(l=>U[l.q]=l);const com=Q.filter(q=>q.gab),tot=com.length,vis=com.filter(q=>U[q.id]),ok=vis.filter(q=>U[q.id].ok).length,er=vis.length-ok,nov=tot-vis.length;
  const f=primeiras(),h14=Date.now()-14*DAY,r14=Object.values(f).filter(t=>t>=h14).length/14;
  const prev=nov&&r14>0?new Date(Date.now()+nov/r14*DAY).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'}).replace('.',''):'';
  const A={};com.forEach(q=>{const x=A[q._a]??={t:0,v:0};x.t++;if(U[q.id])x.v++});
  const rows=Object.entries(A).sort((a,b)=>(b[1].t-b[1].v)-(a[1].t-a[1].v)).map(([id,x])=>`<tr><td>${AREA_BY[id].nome}</td><td style="min-width:110px">${barra(pct(x.v,x.t),'')}</td><td style="text-align:right;white-space:nowrap"><b>${x.t-x.v}</b> <span class="mut">novas de ${x.t}</span></td><td style="text-align:right"><button class="b s" style="padding:3px 10px;font-size:.8rem" ${x.t-x.v?'':'disabled'} onclick="novasArea('${id}')">Fazer</button></td></tr>`).join('');
  return `<div class="card"><h2>Cobertura do banco</h2><p class="mut">Seu foco: ver o máximo de questões diferentes. Você já viu <b style="color:var(--tx)">${vis.length}</b> de ${tot} (${pct(vis.length,tot)}%).</p>
  <div class="seg3" title="certas · erradas · inéditas"><i style="width:${pct(ok,tot)}%;background:var(--ok)"></i><i style="width:${pct(er,tot)}%;background:var(--bad)"></i></div>
  <div class="row mut" style="gap:14px;margin:8px 0 12px;font-size:.82rem"><span><i class="lg" style="background:var(--ok)"></i> certas na última vez ${ok}</span><span><i class="lg" style="background:var(--bad)"></i> erradas ${er}</span><span><i class="lg" style="background:var(--bd)"></i> inéditas ${nov}</span></div>
  ${nov?`<p class="ponto" style="margin:0 0 12px">Ritmo dos últimos 14 dias: <b>${r14.toFixed(1)}</b> inéditas por dia${prev?` → no ritmo atual você termina as inéditas em <b>${prev}</b>`:' (resolva algumas para ver a previsão)'}.</p>`:'<p class="ponto" style="margin:0 0 12px">Você já viu todas as questões do banco.</p>'}
  <div class="tw"><table><tr><th>Área</th><th>Vistas</th><th style="text-align:right">Restam</th><th></th></tr>${rows}</table></div></div>`}
function novasAreaOrig(id){const U=new Set(log.map(l=>l.q)),c=embaralha(Q.filter(q=>q.gab&&q._a===id&&!U.has(q.id)));iniciar(c.slice(0,cfg.diario||20).map(q=>q.id),'estudo')}
function revisarVencidas(){const now=Date.now(),U={};log.forEach(l=>U[l.q]=l);
  const c=Q.filter(q=>q.gab&&U[q.id]&&!U[q.id].ok&&srs[q.id]&&srs[q.id].due<=now).sort((a,b)=>srs[a.id].due-srs[b.id].due);
  if(!c.length){toast('Nenhuma errada vencida agora.');return}iniciar(c.slice(0,cfg.diario||20).map(q=>q.id),'erros')}
function vFila(){
  const now=Date.now(),U={};log.forEach(l=>U[l.q]=l);
  const err=Q.filter(q=>q.gab&&U[q.id]&&!U[q.id].ok&&srs[q.id]),venc=err.filter(q=>srs[q.id].due<=now).length,sem=err.filter(q=>srs[q.id].due>now&&srs[q.id].due<=now+7*DAY).length;
  const dueC=Q.filter(q=>q.gab&&U[q.id]&&U[q.id].ok&&srs[q.id]&&srs[q.id].due<=now).length;
  return `<div class="card"><h2>Fila de revisão</h2><p class="mut">Questões inéditas têm prioridade. As erradas voltam depois de ${ERRO_D} dias e as certas só depois de ${INTERV[0]} dias ou mais.</p>
  <div class="rsm"><div class="kpi"><span class="mut">Erradas para rever</span><b style="color:${venc?'var(--bad)':'var(--tx)'}">${venc}</b><span class="mut">vencidas agora</span></div><div class="kpi"><span class="mut">Próximos 7 dias</span><b>${sem}</b><span class="mut">erradas vencendo</span></div><div class="kpi"><span class="mut">Certas vencidas</span><b>${dueC}</b><span class="mut">revisão opcional</span></div><div class="kpi"><span class="mut">Total erradas</span><b>${err.length}</b><span class="mut">na última resposta</span></div></div>
  <p class="row" style="margin-top:12px"><button class="b" ${venc?'':'disabled'} onclick="revisarVencidas()">Revisar erradas vencidas</button><span class="mut">até ${cfg.diario||20} questões, as mais antigas primeiro</span></p></div>`}
function vConfianca(){
  const C={certeza:{n:0,ok:0},duvida:{n:0,ok:0},chute:{n:0,ok:0}};log.forEach(l=>{const x=C[l.conf];if(x){x.n++;if(l.ok)x.ok++}});
  const nm={certeza:'Certeza',duvida:'Dúvida',chute:'Chute'},tot=Object.values(C).reduce((a,b)=>a+b.n,0);if(!tot)return '';
  const ac=k=>pct(C[k].ok,C[k].n);let dica='';
  if(C.certeza.n>=8&&ac('certeza')<85)dica=`Quando você marca <b>certeza</b> acerta só ${ac('certeza')}%: há superconfiança em alguns temas. Vale revisar os erros marcados com certeza.`;
  else if(C.chute.n>=8&&ac('chute')>=55)dica=`Seus chutes acertam ${ac('chute')}%: você sabe mais do que acha. Vale arriscar com mais confiança.`;
  else if(C.certeza.n>=8)dica=`Sua confiança está bem calibrada: certeza acerta ${ac('certeza')}%.`;
  return `<div class="card"><h2>Calibração da confiança</h2><p class="mut">Mostra se o que você acha que sabe bate com o que você acerta.</p><div class="tw"><table>${Object.keys(C).map(k=>`<tr><td>${nm[k]}</td><td>${C[k].n}</td><td style="min-width:140px">${C[k].n?ac(k)+'%'+barra(ac(k),corAc(ac(k))):'—'}</td></tr>`).join('')}</table></div>${dica?`<p class="ponto" style="margin-bottom:0">${dica}</p>`:''}</div>`}
function vRitmo(){
  const W=DSEM.map(()=>({n:0,ok:0,ms:0}));log.forEach(l=>{const w=W[(new Date(l.t).getDay()+6)%7];w.n++;if(l.ok)w.ok++;w.ms+=l.ms||0});
  const mx=Math.max(1,...W.map(w=>w.n)),melhor=W.reduce((b,w,i)=>w.n>=5&&(b<0||w.ok/w.n>W[b].ok/W[b].n)?i:b,-1);
  const T={ok:{n:0,ms:0},er:{n:0,ms:0}};log.forEach(l=>{if(!l.ms)return;const x=l.ok?T.ok:T.er;x.n++;x.ms+=Math.min(l.ms,300000)});
  const sec=x=>x.n?Math.round(x.ms/x.n/1000)+' s':'—';
  return `<div class="card"><h2>Ritmo e tempo</h2><p class="mut">Questões por dia da semana (a barra) e o acerto em cada um.</p>
  <div class="wk">${W.map((w,i)=>`<div class="wkc"><span class="mut" style="font-size:.72rem">${w.n?pct(w.ok,w.n)+'%':''}</span><div class="wkb"><i style="height:${w.n/mx*100}%" class="${i===melhor?'best':''}"></i></div><b style="font-size:.78rem">${DSEM[i]}</b><span class="mut" style="font-size:.72rem">${w.n}</span></div>`).join('')}</div>
  <div class="rsm" style="margin-top:12px"><div class="kpi"><span class="mut">Tempo ao acertar</span><b>${sec(T.ok)}</b><span class="mut">média por questão</span></div><div class="kpi"><span class="mut">Tempo ao errar</span><b>${sec(T.er)}</b><span class="mut">média por questão</span></div>${melhor>=0?`<div class="kpi"><span class="mut">Melhor dia</span><b>${DSEM[melhor]}</b><span class="mut">${pct(W[melhor].ok,W[melhor].n)}% de acerto</span></div>`:''}</div></div>`}
function vMarcos(){
  const tot=log.length,sq=sequencia(diasLog()),vis=new Set(log.map(l=>l.q)).size,cob=pct(vis,Q.filter(q=>q.gab).length);
  const M=[['100 questões',tot,100],['250 questões',tot,250],['500 questões',tot,500],['1000 questões',tot,1000],['Sequência de 3 dias',sq.rec,3],['Sequência de 7 dias',sq.rec,7],['Sequência de 30 dias',sq.rec,30],['25% do banco visto',cob,25],['50% do banco visto',cob,50],['75% do banco visto',cob,75],['100% do banco visto',cob,100]];
  return `<div class="card"><h2>Marcos</h2><div class="marcos">${M.map(([n,v,m])=>`<span class="marco ${v>=m?'on':''}" title="${v>=m?'Conquistado':Math.min(v,m)+' de '+m}">${v>=m?'★':'☆'} ${n}</span>`).join('')}</div></div>`}

let ev={g:'d',dif:''};
const EVG={d:{n:30,nome:'Diária',un:'dias'},w:{n:12,nome:'Semanal',un:'semanas'},m:{n:12,nome:'Mensal',un:'meses'}};
function evBuckets(){
  const {g}=ev,N=EVG[g].n,out=[],now=new Date();
  for(let i=N-1;i>=0;i--){
    let ini,fim,lb;
    if(g==='d'){const x=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i);ini=+x;fim=+new Date(x.getFullYear(),x.getMonth(),x.getDate()+1);lb=x.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
    else if(g==='w'){const x=new Date(segunda()-i*7*DAY);ini=+x;fim=+new Date(x.getFullYear(),x.getMonth(),x.getDate()+7);lb=x.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
    else{const x=new Date(now.getFullYear(),now.getMonth()-i,1);ini=+x;fim=+new Date(x.getFullYear(),x.getMonth()+1,1);lb=x.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}).replace('.','')}
    out.push({ini,fim,lb,n:0,ok:0});
  }
  log.forEach(l=>{const q=QID[l.q];if(!q||(ev.dif&&q._d!==ev.dif))return;const b=out.find(b=>l.t>=b.ini&&l.t<b.fim);if(b){b.n++;if(l.ok)b.ok++}});
  return out;
}
function evInfo(i){const b=ev.B[i],e=$('#evinfo');if(!e)return;
  const per=ev.g==='d'?b.lb:ev.g==='w'?'semana de '+b.lb:b.lb;
  e.textContent=b.n?`${per}: ${b.ok}/${b.n} certas (${pct(b.ok,b.n)}%)`:`${per}: sem questões`}
function evSet(k,v){ev[k]=v;render()}
function vEvolucao(){
  const B=ev.B=evBuckets(),w=640,h=190,pl=30,pr=10,pt=14,pb=34,bh=34,ch=h-pt-pb-bh,N=B.length;
  const x=i=>pl+(N>1?i/(N-1):.5)*(w-pl-pr),y=v=>pt+(1-v/100)*ch,mx=Math.max(1,...B.map(b=>b.n));
  const meta=ev.dif?DIF[ev.dif].meta:60,pts=B.map((b,i)=>b.n?[x(i),y(pct(b.ok,b.n)),i]:null).filter(Boolean);
  const passo=Math.ceil(N/6),tot=B.reduce((a,b)=>a+b.n,0);
  const bw=Math.max(3,(w-pl-pr)/N-4);
  const svg=`<svg viewBox="0 0 ${w} ${h}" style="width:100%" role="img" aria-label="Evolução do percentual de acerto">
   ${[0,50,100].map(v=>`<line x1="${pl}" x2="${w-pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--bd)" stroke-width="1"/><text x="${pl-5}" y="${y(v)+3}" text-anchor="end" font-size="9" fill="var(--mut)">${v}%</text>`).join('')}
   <line x1="${pl}" x2="${w-pr}" y1="${y(meta)}" y2="${y(meta)}" stroke="var(--warn)" stroke-dasharray="4"/><text x="${w-pr}" y="${y(meta)-4}" text-anchor="end" font-size="9" fill="var(--warn)">${ev.dif?'sua meta':'corte'} ${meta}%</text>
   ${B.map((b,i)=>b.n?`<rect x="${x(i)-bw/2}" y="${h-pb-b.n/mx*bh}" width="${bw}" height="${b.n/mx*bh}" rx="2" fill="var(--pri)" opacity=".28"/>`:'').join('')}
   ${pts.length>1?`<polyline fill="none" stroke="var(--pri)" stroke-width="2" stroke-linejoin="round" points="${pts.map(p=>p[0]+','+p[1]).join(' ')}"/>`:''}
   ${pts.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="var(--pri)" stroke="var(--card)" stroke-width="2"/>`).join('')}
   ${B.map((b,i)=>i%passo===0||i===N-1?`<text x="${x(i)}" y="${h-pb+14}" text-anchor="middle" font-size="9" fill="var(--mut)">${b.lb}</text>`:'').join('')}
   ${B.map((b,i)=>`<rect x="${x(i)-(w-pl-pr)/N/2}" y="${pt}" width="${(w-pl-pr)/N}" height="${h-pt-pb+4}" fill="transparent" style="cursor:pointer" onmouseover="evInfo(${i})" onclick="evInfo(${i})"><title>${b.lb}: ${b.n?b.ok+'/'+b.n+' ('+pct(b.ok,b.n)+'%)':'sem questões'}</title></rect>`).join('')}</svg>`;
  const btn=(k,o,cur)=>Object.entries(o).map(([v,n])=>`<button class="${cur===v?'on':''}" onclick="evSet('${k}','${v}')">${n}</button>`).join('');
  return `<div class="card"><h2>Evolução do acerto</h2>
   <div class="row" style="justify-content:space-between;margin-bottom:10px"><div class="seg" role="group" aria-label="Período">${btn('g',{d:'Diária',w:'Semanal',m:'Mensal'},ev.g)}</div><div class="seg" role="group" aria-label="Dificuldade">${btn('dif',{'':'Todas',f:'Fáceis',m:'Médias',d:'Difíceis'},ev.dif)}</div></div>
   ${tot?svg:'<p class="mut">Sem respostas neste filtro nos últimos '+EVG[ev.g].n+' '+EVG[ev.g].un+'.</p>'}
   <p class="mut" id="evinfo" style="min-height:1.4em;margin:6px 0 0">Linha = % de acerto; barras claras = nº de questões. Toque num período para ver o detalhe. Últimos ${EVG[ev.g].n} ${EVG[ev.g].un}.</p></div>`;
}
// Temas com mais erro (pelo menos 3 respostas), com atalho para treinar.
function vReforcar(){
  const T=temas().filter(x=>x.n>=3).sort((a,b)=>b.erro-a.erro).slice(0,5);if(!T.length)return '';
  return `<div class="card"><h2>Temas para reforçar</h2><p class="mut">Maior erro ponderado (fáceis pesam mais), com pelo menos 3 respostas.</p><div class="tw"><table>${T.map(x=>`<tr><td>${esc(x.t)}</td><td>${Math.round(x.erro*100)}% de erro</td><td>${x.n} resp.</td><td style="text-align:right"><button class="b s" style="padding:4px 12px" onclick="iniciar(questoesTema(${JSON.stringify(x.t).replace(/"/g,'&quot;')}),'estudo')">Treinar</button></td></tr>`).join('')}</table></div></div>`;
}
function vDificuldade(){
  const D={f:{n:0,ok:0},m:{n:0,ok:0},d:{n:0,ok:0}};
  log.forEach(l=>{const q=QID[l.q];if(!q?._d)return;const x=D[q._d];x.n++;if(l.ok)x.ok++});
  const nb={f:0,m:0,d:0};Q.forEach(q=>{if(q._d)nb[q._d]++});
  const alerta=D.f.n>=5&&pct(D.f.ok,D.f.n)<90?`<p class="ponto">Você está acertando ${pct(D.f.ok,D.f.n)}% das fáceis (meta ${DIF.f.meta}%). Errar fácil custa mais caro: priorize rever essas.</p>`:'';
  return `<div class="card"><h2>Desempenho por dificuldade</h2><p class="mut">A linha marca a sua meta para cada dificuldade.</p>
  <div class="tw"><table><tr><th>Nível</th><th>Banco</th><th>Resp.</th><th>Seu acerto</th><th>Meta</th></tr>${Object.entries(DIF).map(([k,v])=>{const x=D[k],a=pct(x.ok,x.n);
   return `<tr><td><span class="dif ${k}"><i></i>${v.nome}</span></td><td>${nb[k]}</td><td>${x.n}</td><td style="min-width:130px">${x.n?`${a}%${barra(a,a>=v.meta?'g':a>=v.meta-15?'w':'r',v.meta)}`:'—'}</td><td>${v.meta}%</td></tr>`}).join('')}</table></div>${alerta}</div>`;
}
function vSub(id){
  const bl=Q.filter(q=>q._a===id),out=DIMS.map(([d,nome])=>{
    const c={},m={};bl.forEach(q=>q._x[d].forEach(v=>c[v]=(c[v]||0)+1));
    log.forEach(l=>{const q=QID[l.q];if(!q||q._a!==id)return;q._x[d].forEach(v=>{const x=m[v]??={n:0,ok:0};x.n++;if(l.ok)x.ok++})});
    const rows=Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([v,n])=>{const x=m[v];return `<tr><td>${esc(v)}</td><td>${n}</td><td>${x?x.n:0}</td><td>${x?pct(x.ok,x.n)+'%':'—'}</td></tr>`}).join('');
    return rows?`<h3 style="margin-top:14px">${nome}</h3><div class="tw"><table><tr><th>Item</th><th>No banco</th><th>Resp.</th><th>Acerto</th></tr>${rows}</table></div>`:''}).join('');
  return `<div class="card"><h2>${AREA_BY[id].nome}: temas e subtemas</h2>${out}</div>`;
}
function vIncidencia(){
  const S=statsPor(q=>q._a),tot=Q.length||1;
  return `<div class="card"><h2>Incidência no banco</h2><p class="mut">Quanto cada área aparece nas ${tot} questões cadastradas (base do peso, editável em Config).</p><div class="tw"><table>${Object.entries(S).sort((a,b)=>b[1].banco-a[1].banco).map(([id,s])=>`<tr><td>${AREA_BY[id].nome}</td><td>${s.banco}</td><td style="width:40%">${barra(s.banco/tot*100*3)}</td><td>${pct(s.banco,tot)}%</td></tr>`).join('')}</table></div></div>`;
}
function evolucao(){
  const W={};log.forEach(l=>{const w=+new Date(wkKey(l.t)+'T00:00:00');const x=W[w]??={n:0,ok:0};x.n++;if(l.ok)x.ok++});
  const ks=Object.keys(W).sort((a,b)=>a-b);if(ks.length<1)return '<p class="mut">Sem dados.</p>';
  const w=600,h=150,pad=28,y=v=>h-pad-v*(h-2*pad),pts=ks.map((k,i)=>[pad+(ks.length>1?i/(ks.length-1):0.5)*(w-2*pad),y(W[k].ok/W[k].n),W[k],k]);
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%"><line x1="${pad}" x2="${w-pad}" y1="${y(0.6)}" y2="${y(0.6)}" stroke="var(--warn)" stroke-dasharray="4"/><text x="${w-pad}" y="${y(0.6)+12}" text-anchor="end" font-size="10" fill="var(--warn)">60% (corte)</text>
  <polyline fill="none" stroke="var(--pri)" stroke-width="2.5" points="${pts.map(p=>p[0]+','+p[1]).join(' ')}"/>
  ${pts.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="var(--pri)"/><text x="${p[0]}" y="${p[1]-9}" text-anchor="middle" font-size="10" fill="var(--tx)">${pct(p[2].ok,p[2].n)}%</text><text x="${p[0]}" y="${h-8}" text-anchor="middle" font-size="9" fill="var(--mut)">${new Date(+p[3]).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</text>`).join('')}</svg>`;
}

// ===== aba Banco (app): igual ao Notion — todas as questões numeradas, em toggle =====
let bq='',bf={a:'',d:'',s:'',c:'',p:''},bAbertos=new Set(),bLim=150;
const recente=q=>q.origem==='extensao'&&q.chegou&&Date.now()-Date.parse(q.chegou)<7*864e5;
// ordem do Banco: número do Notion decrescente (últimas em cima); sem número no fim
const bOrdena=L=>L.slice().sort((a,b)=>(a.n==null)-(b.n==null)||(a.n==null?0:b.n-a.n));
function comentAlt(q,l){
  const c=q.curso&&q.curso.coment&&q.curso.coment[l],k=q.coment&&q.coment[l];
  if(!c&&!k)return'';
  return `<div class="cmw">${c?`<div class="mut md cm cmc"><span class="src">Curso</span>${md(c)}</div>`:''}${k?`<div class="mut md cm cmk"><span class="src">Claude</span>${md(k)}</div>`:''}</div>`;
}
function cursoBloco(q){
  const c=q.curso;if(!c)return prDadosBloco(q)+prTagsBloco(q);
  const sec=Object.entries(c.secoes||{}).map(([k,v])=>[k,(v||[]).filter(t=>!/^\s*(?:📊|Acerto dos alunos:|Alternativas marcadas:|Tempo:|Dados do site\s*$)/i.test(t))]).filter(([k,v])=>v&&v.length&&!/alternativ/i.test(k));
  if(!c.ponto&&!sec.length)return prDadosBloco(q)+prTagsBloco(q);
  return `<div class="ponto md pcurso"><div class="kick">Ponto de ensino · Curso (PersonalRad)</div>${c.ponto?md(c.ponto):''}${sec.map(([k,v])=>`<div class="kick" style="margin-top:8px">${esc(k)}</div>${md(v.join('\n\n'))}`).join('')}</div>${prDadosBloco(q)}${prTagsBloco(q)}`;
}
function bStatus(q,ult){const l=ult[q.id];return l?(l.ok?'<span class="bok">✓</span>':'<span class="bbad">✗</span>'):'<span class="mut">·</span>'}
function prAcertoBloco(q){const ac=acertoPR(q),n=prStats(q).respostas;return ac==null?'':`<span class="mut" style="font-size:.82rem"> · acerto dos alunos ${ac.toLocaleString('pt-BR',{maximumFractionDigits:2})}%${n!=null?' ('+n+')':''}</span>`}
function bCorpo(q){
  const ult={};log.forEach(l=>ult[l.q]=l);const r=ult[q.id];
  const imgs=galeria(q,'q'),imgsC=galeria(q,'c');
  const alts=qAlternativas(q,{r,fb:true,leitura:true});
  return `<div class="bc">
    <div class="mut" style="font-size:.82rem">${esc([AREA_BY[q._a].nome,...(q.cl||[])].join(' › '))}${q.classif?'':' · <b>ainda sem classificação</b>'}${prProvaBloco(q)}${prAvisoBloco(q)}</div>
    ${q.tags.length?`<div style="margin-top:4px">${q.tags.filter(t=>!isMeta(t)).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>`:''}
    <div class="row">${qDificuldade(q)}<span class="mut">${r?'Feita · '+(r.ok?'acertou':'errou'):'Não feita'}</span></div>
    ${qEnunciado(q,imgs)}${alts}
    <p style="margin:8px 0"><b>Gabarito: ${q.gab||'—'}</b>${prAcertoBloco(q)}${r?` · <span class="mut">sua última resposta: ${r.e||'?'} (${r.ok?'acertou':'errou'}, ${r.conf||''})</span>`:''}</p>
    ${cursoBloco(q)}${claudeMdBloco(q)}${pontoDe(q)?`<div class="ponto md"><div class="kick">CCQ · Claude</div>${md(pontoDe(q))}</div>`:''}<div class="imgs">${imgsC}</div>
    <div class="row" style="margin-top:8px"><span class="mut" style="font-size:.8rem">${q.chegou?'chegou em '+new Date(q.chegou).toLocaleDateString('pt-BR'):''}${q.origem==='extensao'?' pela extensão':''}</span></div>
  </div>`;
}
function bTog(id,el){
  if(!el.isConnected)return; // ignora eventos de nós substituídos por render/sincronização
  if(el.open){if(!el.querySelector('.bc'))el.insertAdjacentHTML('beforeend',bCorpo(QID[id]));bAbertos.add(id)}
  else{bAbertos.delete(id);const c=el.querySelector('.bc');if(c)c.remove()}
}
async function bBaixar(){const el=$('#b_dl');if(el)el.disabled=true;
  const n=await BCBR.baixarTudo((i,t)=>{const e=$('#b_dl');if(e)e.textContent=`Baixando imagens… ${i}/${t}`},typeof ofImagensNotas==='function'?ofImagensNotas():[]);
  toast(`${n} imagens guardadas neste aparelho`);const e=$('#b_dl');if(e){e.disabled=false;e.textContent='Baixar imagens para offline'}}
function vBanco(){
  const n=norm(bq),ult={};log.forEach(l=>ult[l.q]=l);
  const L=bOrdena(Q.filter(q=>(!n||norm((q.n??'')+' '+q.enunciado+' '+q.tags.join(' ')+' '+(q.cl||[]).join(' ')).includes(n))
    &&(!bf.a||q._a===bf.a)&&(!bf.d||q._d===bf.d)
    &&(!bf.s||(bf.s==='nao'?!ult[q.id]:bf.s==='ok'?ult[q.id]&&ult[q.id].ok:ult[q.id]&&!ult[q.id].ok))
    &&(!bf.c||(bf.c==='sem'?!q.classif:recente(q)))&&(!bf.p||foCBR(q))));
  const sg=Q.filter(q=>!q.gab).length,semc=Q.filter(q=>!q.classif).length,nov=Q.filter(recente).length,feitas=Q.filter(q=>ult[q.id]).length;
  const sel=(id,k,ops)=>`<select id="${id}" onchange="bf.${k}=this.value;bLim=150;render()">${ops.map(([v,t])=>`<option value="${v}" ${bf[k]===v?'selected':''}>${t}</option>`).join('')}</select>`;
  const linhas=L.slice(0,bLim).map(q=>`<details class="bq" data-qid="${q.id}" ${bAbertos.has(q.id)?'open':''} ontoggle="bTog('${q.id}',this)"><summary>
      <span class="bs">${bStatus(q,ult)}</span>
      <span class="bm"><span class="be"><b>Questão ${q.n??'—'}</b> · ${esc(q.enunciado.slice(0,130))}${q.enunciado.length>130?'…':''} ${q._d?' · '+qDificuldade(q):''}</span>
      <span class="bl"><span class="ba">${AREA_BY[q._a].nome}</span>${q.classif?'':'<span class="tag">sem classificação</span>'}${q.tags.length?q.tags.filter(t=>!isMeta(t)).slice(0,4).map(t=>`<span class="tag">${esc(t)}</span>`).join(''):''}${q.imgs&&q.imgs.length?'<span class="tag">🖼 '+q.imgs.length+'</span>':''}${recente(q)?'<span class="nova">nova</span>':''}${q.gab?'':'<span class="tag">sem gabarito</span>'}</span></span>
    </summary>${bAbertos.has(q.id)?bCorpo(q):''}</details>`).join('');
  return `<div class="card"><h2>Banco (${Q.length} questões)</h2>
  <p class="mut">${feitas} feitas · ${semc} sem classificação · ${sg} sem gabarito (não entram nos estudos) · ${nov} novas nos últimos 7 dias</p>
  <div class="row bfil"><input id="b_q" placeholder="Buscar por número, texto ou tag" value="${esc(bq)}" onchange="bq=this.value;bLim=150;render()" style="flex:1;min-width:180px">
   ${sel('b_p','p',[['','Todas as provas'],['cbr','Só CBR']])}
   ${sel('b_a','a',[['','Todas as áreas'],...AREAS.map(a=>[a.id,a.nome]),['sem','Sem área']])}
   ${sel('b_d','d',[['','Todas as dificuldades'],['f','Fácil'],['m','Média'],['d','Difícil']])}
   ${sel('b_s','s',[['','Feitas e não feitas'],['nao','Não feitas'],['ok','Acertei'],['err','Errei']])}
   ${sel('b_c','c',[['','Todas'],['sem','Sem classificação'],['novas','Novas (7 dias)']])}</div>
  <p class="mut">${L.length} questões</p>
  <div class="blist">${linhas}</div>
  ${L.length>bLim?`<p><button class="b s" onclick="bLim+=300;render()">Mostrar mais (${L.length-bLim} restantes)</button> <button class="b s" onclick="bLim=1e9;render()">Mostrar todas</button></p>`:''}
  <div class="row" style="margin-top:14px"><button class="b s" id="b_dl" onclick="bBaixar()">Baixar imagens para offline</button><button class="b s" onclick="BCBR.config()">Chaves deste aparelho</button></div></div>`;
}

// ===== comentário novo do Claude (modelo "B didático", gerado pelo Gemini à noite ou pelo botão) =====
function claudeMdBloco(q){
  if(!q.claudeMd)return'';
  const P=iaParse(q.claudeMd);
  return `<div class="ponto md pclaude"><div class="kick">Comentário do Claude</div>${md(P.rest)}${P.fl?`<div class="row" style="margin-top:6px"><button class="b s" onclick="mdFlash('${q.id}')">+ virar flashcard</button></div>`:''}</div>`;
}
function mdFlash(id){const q=QID[id],P=iaParse(q.claudeMd||'');if(!P.fl)return;const f=P.fl[0],v=P.fl[1];
  if(cards.some(c=>!c.x&&c.f===f&&c.v===v)){toast('Esse flashcard já existe.');return}
  const c={id:'c'+Date.now().toString(36),f,v,tg:tagStr(q),u:Date.now()};cards.push(c);persist('c:'+hk(c.id,32));toast('Flashcard criado')}
const MODELO_COMENT=`Seções, nesta ordem (markdown, português, didático, explicando o PORQUÊ; não repetir o comentário do curso):
**🔑 Conceito-chave** (2–3 frases) · **🧩 Entenda o raciocínio** (2–4 tópicos; em questão fácil, 1–2 ou omitir) · **🖼️ Na imagem** (só se houver imagem: onde olhar e o que ver) · **🩻 Diferenciais** (só se for diagnóstico: tabela "Diagnóstico | o que separa", 2–3 linhas) · **🎯 Como acertar** · **⚠️ Pegadinha** · **⭐ Para a prova** (1 linha). Última linha: FLASH: pergunta curta :: resposta curta. ~80 palavras (fácil) a ~150 (difícil). Não invente números nem referências.`;
function promptIA(q){
  const r=sess&&sess.resp&&sess.resp[q.id];const errou=r&&!r.ok&&r.esc;
  const cur=q.curso||{};
  return `Você é professor de radiologia preparando um residente para a prova de título do CBR. Escreva o comentário desta questão.
${errou?`O aluno marcou ${r.esc} (errado). COMECE com a seção **❌ Por que você errou**: explique o raciocínio que leva à ${r.esc} e onde ele quebra (2–3 frases).\n`:''}${MODELO_COMENT}
Dificuldade: ${q._d?DIF[q._d].nome:'?'}.

Questão: ${q.enunciado.slice(0,1500)}
${Object.entries(q.alts).map(([l,t])=>l+') '+t.slice(0,300)).join('\n')}
Gabarito: ${q.gab}
Comentário do curso (não repetir): ${JSON.stringify(cur.coment||{}).slice(0,1500)}
Ponto de ensino do curso: ${String(cur.ponto||'').slice(0,600)}`;
}

// ===== minivisualizador de imagens: uma por vez, miniaturas, setas; clique abre o zoom de sempre =====
const gIdx={},gLeg={};
function galLista(q,t){const L=(t==='c'?q.imgsCom:q.imgs)||[],G=(t==='c'?q.legendasCom:q.legendas)||[];return L.map((u,i)=>({u,leg:G[i]||''})).filter(x=>imgSrc(x.u))}
function galInner(q,t){
  const L=galLista(q,t),k=q.id+'_'+t;if(!L.length)return'';
  let i=gIdx[k]||0;if(i>=L.length)i=0;const x=L[i],n=L.length;
  return `<div class="galm">${n>1?`<button class="galb" aria-label="Imagem anterior" onclick="galVai('${q.id}','${t}',-1)">‹</button>`:''}
    <img src="${imgSrc(x.u)}" data-u="${x.u}" onclick="zoom('${x.u}')" alt="Imagem ${i+1} de ${n}" fetchpriority="high">
    ${n>1?`<button class="galb dir" aria-label="Próxima imagem" onclick="galVai('${q.id}','${t}',1)">›</button><span class="galn">${i+1}/${n}</span>`:''}</div>
    ${x.leg&&gLeg[k]!==false?`<div class="gall md">${md(x.leg)}</div>`:''}
    ${n>1?`<div class="galt">${L.map((y,j)=>`<img src="${imgSrc(y.u)}" data-u="${y.u}" class="${j===i?'on':''}" onclick="galVai('${q.id}','${t}',0,${j})" alt="Miniatura ${j+1}">`).join('')}</div>`:''}`;
}
function galeria(q,t,leg=true){gLeg[q.id+'_'+t]=leg;const h=galInner(q,t);return h?`<div class="gal" id="gal_${q.id}_${t}">${h}</div>`:''}
function galVai(id,t,d,abs){const q=QID[id],n=galLista(q,t).length,k=id+'_'+t;
  gIdx[k]=abs!=null?abs:((gIdx[k]||0)+d+n)%n;
  document.querySelectorAll('#gal_'+CSS.escape(k)).forEach(el=>{const v=qGuarda(el);el.innerHTML=galInner(q,t);qReusa(el,v)})}

// ===== peso das áreas automático pela incidência do banco =====
let _inc=null,_incN=-1;
function incidencia(id){
  if(_incN!==Q.length){const c={};let tot=0;Q.forEach(q=>{if(!q.gab||q._a==='sem'||!q._a)return;c[q._a]=(c[q._a]||0)+1;tot++});
    _inc={};Object.keys(c).forEach(a=>_inc[a]=c[a]/(tot||1)*100);_incN=Q.length}
  return _inc[id]||0;
}
function pesosUI(){
  const auto=cfg.pesoAuto!==false;
  return `<h3>Peso das áreas na prova (%)</h3>
  <label class="check" style="display:block;margin:6px 0"><input type="checkbox" ${auto?'checked':''} onchange="cfg.pesoAuto=this.checked;persist('_est');render()"> <b>Automático pela incidência do banco</b> (recomendado — se atualiza sozinho quando entram questões novas)</label>
  <p class="mut">${auto?'Calculado agora com '+Q.filter(q=>q.gab&&q._a&&q._a!=='sem').length+' questões (sem contar as de fora da radiologia).':'Manual: vazio = usa a incidência do banco.'}</p>
  <div class="row">${AREAS.map(a=>`<label style="width:46%;min-width:240px">${a.nome} ${auto?`<b>${incidencia(a.id).toFixed(1)}%</b>`:`<input id="p_${a.id}" type="number" step="0.5" style="width:70px" placeholder="${incidencia(a.id).toFixed(1)}" value="${cfg.pesos[a.id]??''}" onchange="setPeso('${a.id}',this.value)">`}</label>`).join('')}</div>`;
}

// ===== layouts da tela da questão =====
const LAYOUTS=[['compacto','Compacto (padrão) — abas em cima, painel de questões em faixa acima da questão'],['compfoco','Compacto + Foco — igual, sem cabeçalho (botão ⤢ Foco na questão)'],['otimizado','Otimizado — combina os outros conforme a tela'],['lado','2 · Lado a lado — imagem fixa à esquerda (PC/tablet)'],['foco','3 · Foco — tela cheia, sem cabeçalho nem painel'],['grade','4 · Alternativas em grade — curtas em 2 colunas'],['ajustada','5 · Imagem ajustada à tela — imagem ocupa só o espaço que sobra'],['original','Original do artefato']];
function aplicaLayout(){if(typeof qaBotao==="function")qaBotao();
  const b=document.body,l=cfg.layout||'compacto';
  b.classList.toggle('emquiz',tela==='quiz');
  LAYOUTS.forEach(([k])=>b.classList.toggle('lay-'+k,k===l));
  let fb=document.getElementById('focoBtn');const foco=l==='foco'||l==='compfoco';
  if(tela==='quiz'&&l!=='original'){if(!fb){fb=document.createElement('button');fb.id='focoBtn';b.appendChild(fb)}
    fb.textContent=foco?'⤡ Sair do foco':'⤢ Foco';fb.title=foco?'Mostrar o cabeçalho e as abas':'Esconder o cabeçalho e as abas';
    fb.onclick=()=>{cfg.layout=foco?(l==='foco'?'otimizado':'compacto'):'compfoco';persist('_est');render()}}
  else if(fb)fb.remove();
  if(tela==='quiz')setTimeout(qCentraNum,0);
}
// 1.37.0: centraliza o número atual só dentro da faixa que rola na horizontal; nunca rola a página (pedido do Artur, 06/11/2026:
// ao responder a página não pode mexer — o scrollIntoView antigo subia a página até a grade de números).
function qCentraNum(){
  const c=document.querySelector('.qnav .qn.cur');if(!c)return;
  for(let e=c.parentElement;e&&e!==document.body;e=e.parentElement){
    const o=getComputedStyle(e).overflowX;
    if((o==='auto'||o==='scroll')&&e.scrollWidth>e.clientWidth+1){const cr=c.getBoundingClientRect(),er=e.getBoundingClientRect();e.scrollLeft+=(cr.left+cr.width/2)-(er.left+er.width/2);return}
  }
}
function layoutUI(){
  return `<h3>Layout da questão</h3><p class="mut">Como a questão aparece quando você está respondendo. Muda na hora.</p>
  <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:12px">${LAYOUTS.map(([k,n])=>`<label class="check"><input type="radio" name="lay" ${ (cfg.layout||'compacto')===k?'checked':''} onchange="cfg.layout='${k}';persist('_est');render()"> ${n}</label>`).join('')}</div>`;
}

// ===== MODO PRÉ-PROVA (pedido do Artur, 20/10/2026 — vale até a prova) =====
// Objetivo: ver o MÁXIMO de questões novas. Regras: só questões ainda não respondidas (nem as erradas voltam por enquanto);
// fáceis >> médias >> difíceis (quase nunca); peso maior para área/tema/subtema mais incidentes no banco e para os temas que
// ele mais erra; intercalado (poucas do mesmo subtema por pacote). Vale para RI, temas, simulados, Estudar e "novas da área".
// Parâmetros no Manual (aba Config): modo_prova, peso_facil, peso_media, peso_dificil, max_por_subtema.
const modoProva=()=>String(PARAM.modo_prova??1)!=='0';
let _pv=null,_pvN=-1;
function _pvBase(){
  if(_pvN===log.length+Q.length*1e6)return _pv;
  const C=(f)=>{const m={};Q.forEach(q=>{if(!q.gab||q._a==='sem')return;const k=f(q);if(k)m[k]=(m[k]||0)+1});const v=Object.values(m),me=v.reduce((a,b)=>a+b,0)/(v.length||1)||1;return {m,me}};
  const kA=q=>q._a,kT=q=>q.cl&&q.cl[0]?q._a+'|'+q.cl[0]:null,kS=q=>q.cl&&q.cl[1]?q._a+'|'+q.cl[0]+'|'+q.cl[1]:null;
  const iA=C(kA),iT=C(kT),iS=C(kS);
  const E=(f)=>{const m={};log.forEach(l=>{const q=QID[l.q];if(!q)return;const k=f(q);if(!k)return;const x=m[k]??={n:0,e:0};x.n++;if(!l.ok)x.e++});return m};
  const eA=E(kA),eT=E(kT),eS=E(kS);
  _pv={kA,kT,kS,iA,iT,iS,eA,eT,eS};_pvN=log.length+Q.length*1e6;return _pv;
}
function pesoVolume(q){
  const b=_pvBase(),dif={f:+(PARAM.peso_facil??6),m:+(PARAM.peso_media??3),d:+(PARAM.peso_dificil??0.15)};
  const wd=dif[q._d]??dif.m;
  const r=(I,k,ex)=>k&&I.m[k]?Math.pow(I.m[k]/I.me,ex):1;
  const wInc=Math.min(4,Math.max(.3,r(b.iA,b.kA(q),.5)*r(b.iT,b.kT(q),.5)*r(b.iS,b.kS(q),.25)));
  // erro: média bayesiana — subtema puxado para o tema, tema puxado para a área, área para 35%
  const ea=b.eA[b.kA(q)]||{n:0,e:0},pA=(ea.e+.35*4)/(ea.n+4);
  const et=b.eT[b.kT(q)]||{n:0,e:0},pT=(et.e+pA*4)/(et.n+4);
  const es=b.eS[b.kS(q)]||{n:0,e:0},pS=(es.e+pT*3)/(es.n+3);
  const wErr=0.5+2.2*pS;
  return wd*wInc*wErr*pesoPR(q);
}
function pacoteVolume(n,filtro=()=>true){
  const vistas=new Set(all.map(l=>l.q)),maxS=+(PARAM.max_por_subtema??2),b=_pvBase();
  const pool=Q.filter(q=>q.gab&&!(q.classif&&q._a==='sem')&&!vistas.has(q.id)&&filtro(q)).map(q=>({q,w:Math.max(pesoVolume(q),1e-6)}));
  const out=[],cS={},cT={};
  while(out.length<n&&pool.length){
    pool.forEach(x=>{const s=b.kS(x.q),t=b.kT(x.q);x.wa=x.w*((cS[s]||0)>=maxS?.05:1)*Math.pow(.6,cT[t]||0)});
    let tot=pool.reduce((a,x)=>a+x.wa,0),r=Math.random()*tot,i=0;
    for(;i<pool.length-1;i++){r-=pool[i].wa;if(r<=0)break}
    const x=pool.splice(i,1)[0];out.push(x.q.id);const s=b.kS(x.q),t=b.kT(x.q);cS[s]=(cS[s]||0)+1;cT[t]=(cT[t]||0)+1;
  }
  return out;
}
// texto do cartão da Revisão Inteligente = o que a lista de hoje tem de fato
function riDesc(devidas){
  if(!modoProva())return `${RI_DIARIA} questões do dia (a lista só muda à 00:00): ${devidas} vencidas no total, o restante sorteado com mais peso nos temas frequentes e fracos.`;
  const ids=riHoje(),ini=hoje0(),vistas=new Set(log.filter(l=>l.t<ini).map(l=>l.q)),rep=ids.filter(i=>vistas.has(i)).length,nov=ids.length-rep;
  const d=diasProva(),fim=+(PARAM.revisao_final_dias??14),cnt={f:0,m:0,d:0,sem:0};ids.forEach(i=>{const q=QID[i];if(q&&!vistas.has(i))cnt[q._d??'sem']++});
  const reta=emReta();
  return `Meta diária: <b>${RI_DIARIA} questões</b>. <b>${nov} questões novas</b>${rep?` + <b>${rep} errada${rep>1?'s':''} para rever</b>${reta?' (reta final: erradas fáceis e médias)':' (errou com certeza ou era fácil)'}`:''}. `+
   `${cnt.f} fáceis · ${cnt.m} médias${cnt.sem?' · '+cnt.sem+' sem dificuldade':''}${cnt.d?' · '+cnt.d+(cnt.d>1?' difíceis':' difícil'):''}, sorteadas com mais peso nas áreas e temas que mais caem e nos que você mais erra. A lista só muda à meia-noite.`;
}
// repetidas eventuais (pedido do Artur, 22/10/2026): ~1 a cada 25, no máx. 2 por RI — só erradas COM CERTEZA ou erradas FÁCEIS, última resposta errada há 5+ dias
function pacoteRepeteRaro(n){
  const ult={};log.forEach(l=>ult[l.q]=l);const lim=Date.now()-(+(PARAM.repete_dias??5))*DAY,cada=+(PARAM.repete_cada??25);
  const pool=Q.filter(q=>{const l=ult[q.id];return q.gab&&l&&!l.ok&&l.t<lim&&(l.conf==='certeza'||q._d==='f')});
  let k=Math.floor(n/cada);if(Math.random()<n/cada-k)k++;k=Math.min(2,k,pool.length);
  return k?sorteioPonderado(pool,q=>pesoVolume(q)*(ult[q.id].conf==='certeza'?2:1),k,false).map(q=>q.id):[];
}
function revisaoDoDia(){
  if(!modoProva())return revisaoDoDiaOrig(RI_DIARIA);
  const n=tamanhoRI(),d=diasProva(),fim=+(PARAM.revisao_final_dias??14);
  if(emReta()){const e=pacoteErradas(Math.round(n*.3));return embaralha([...pacoteVolume(n-e.length),...e])}
  const r=pacoteRepeteRaro(n);return r.length?embaralha([...pacoteVolume(n-r.length),...r]):pacoteVolume(n); // repetidas fazem parte das 50
}
function questoesTema(t){return modoProva()?pacoteVolume(10,q=>q._x&&(q._x.t.includes(t)||q._x.o.includes(t))):questoesTemaOrig(t)}
function simulado(et){
  if(!modoProva())return simuladoOrig(et);
  const ids=pacoteVolume(60,q=>etapaDe(q)===et||etapaDe(q)==='?');iniciar(ids,'simulado',et);
}
function novasArea(id){if(!modoProva())return novasAreaOrig(id);iniciar(pacoteVolume(cfg.diario||20,q=>q._a===id),'estudo')}
function comecaFiltro(){
  if(!modoProva()||(fl.status&&fl.status!=='novas'))return comecaFiltroOrig();
  const ok=new Set(filtrar().map(q=>q.id));let ids=pacoteVolume(fl.n,q=>ok.has(q.id));
  if(fl.modo!=='misto')ids.sort((a,b)=>QID[a]._a.localeCompare(QID[b]._a));
  iniciar(ids,'estudo');
}
function modoProvaUI(){
  const vv=new Set(all.map(l=>l.q)),n=Q.filter(q=>q.gab&&!(q.classif&&q._a==='sem')&&!vv.has(q.id)).length;
  return `<h3>Modo pré-prova</h3><label class="check" style="display:block;margin:6px 0"><input type="checkbox" ${modoProva()?'checked':''} onchange="setModoProva(this.checked)"> <b>Máximo de questões novas até a prova</b> — fáceis e médias primeiro (difíceis quase nunca), áreas/temas mais incidentes e os que você mais erra; questões já respondidas não voltam — só, de vez em quando (~1 a cada 25, máx. 2 por dia), uma errada com certeza ou errada fácil.</label>
  <p class="mut">Vale para a Revisão Inteligente, temas, simulados e pacotes do Estudar. ${n} questões novas disponíveis. Pesos no Manual: fácil ${PARAM.peso_facil??6} · média ${PARAM.peso_media??3} · difícil ${PARAM.peso_dificil??0.15}.</p>`;
}
function setModoProva(on){
  const lin='@param modo_prova='+(on?1:0);
  metodo=/^@param\s+modo_prova\s*=.*$/m.test(metodo)?metodo.replace(/^@param\s+modo_prova\s*=.*$/m,lin):metodo+'\n'+lin;
  metoU=Date.now();saveL('cbr_metodo',{t:metodo,u:metoU});lerManual(metodo);persist('m:0');cfg.ri=null;persist('_est');render();
}

// ===== sugestões 1–5 (20/10/2026) =====
// 1) erro vira flashcard automático (o conceito volta em repetição espaçada sem repetir a questão)
const limpaTxt=s=>String(s||'').replace(/<[^>]+>/g,'').replace(/\*\*/g,'').replace(/\s+/g,' ').trim();
function criaFlashErro(q){
  let f='',v='';const P=q.claudeMd?iaParse(q.claudeMd):null;
  if(P&&P.fl){[f,v]=P.fl}
  else{const R=revItens(q);if(R.length){f=limpaTxt(R[0][0]);v=limpaTxt(R[0][1])}
  else if(q.curso&&q.curso.ponto){f=`${(q.cl&&(q.cl[2]||q.cl[1]))||'Conceito'} — qual é o ponto-chave? (Q${q.n??''})`;v=limpaTxt(q.curso.ponto).slice(0,420)}}
  if(!f||!v||cards.some(c=>!c.x&&(c.f===f||c.q===q.id)))return;
  const c={id:'c'+Date.now().toString(36),f,v,tg:(tagStr(q)?tagStr(q)+'; ':'')+'erro',u:Date.now(),q:q.id};cards.push(c);persist('c:'+hk(c.id,32));
  toast('Flashcard do erro criado');
}
function posResposta(q,l){if(!l.ok&&PARAM.flash_erro!==0)criaFlashErro(q)}
// 2) errou com certeza = hipercorreção · 4) comentários recolhidos quando acertou com certeza
function verCom(q){return true}   // pedido do Artur (20/10): comentários sempre visíveis, inclusive quando acerta com certeza
function bannerResp(q,r){return r&&!r.ok&&r.conf==='certeza'?`<div class="hiper">⚠️ <b>Você errou com certeza.</b> É o tipo de erro que mais se corrige agora: leia os dois comentários com calma. Já virou flashcard.</div>`:''}
function blocoFeedback(q,r,html){
  if(verCom(q))return html;
  return `<div class="row" style="margin-top:8px"><button class="b s" onclick="(sess.verCom??={})['${q.id}']=1;render()">Ver comentários</button><span class="mut" style="font-size:.82rem">acertou com certeza — siga para a próxima</span></div>`;
}
// 5) meta diária para cobrir todas as fáceis e médias até a prova (últimos 14 dias ficam para rever os erros)
function _restantesFM(){const v=new Set(all.map(l=>l.q));return Q.filter(q=>q.gab&&!(q.classif&&q._a==='sem')&&!v.has(q.id)&&q._d!=='d').length}
function diasProva(){return Math.ceil((new Date(DATA_PROVA+'T12:00')-Date.now())/DAY)}
// questões fáceis/médias ainda não vistas no começo de hoje (a meta não cai ao longo do dia)
function _restantesInicioDia(){const hj=dKey(Date.now()),ant=new Set(),hoje=new Set();all.forEach(l=>{if(dKey(l.t)<hj)ant.add(l.q);else hoje.add(l.q)});
  return _restantesFM()+[...hoje].filter(id=>!ant.has(id)&&QID[id]&&QID[id].gab&&!(QID[id].classif&&QID[id]._a==='sem')&&QID[id]._d!=='d').length}
// RI fixa em 50; metaDia mantém apenas a estimativa de cobertura do banco no calendário.
function emReta(){const r=typeof smRetaIni==='function'?smRetaIni():null;return !!r&&smHoje()>=r}
function metaDia(){const d=diasProva();if(d==null||d<=0||emReta())return null;
  if(!(typeof smDiasEstudoRestantes==='function'&&SM.d))return null;return Math.ceil(_restantesInicioDia()/Math.max(1,smDiasEstudoRestantes()))}
function tamanhoRI(){return RI_DIARIA}
function metaHoje(){return RI_DIARIA}
function riRefaz(){return !!(cfg.ri&&!cfg.ri.cal&&modoProva()&&typeof SM!=='undefined'&&SM.d&&!log.some(l=>l.t>=hoje0()&&l.modo==='hoje'))}
function metaProvaCard(){
  if(!modoProva())return'';const d=diasProva(),r=_restantesFM(),fim=+(PARAM.revisao_final_dias??14);
  if(d==null)return `<div class="card"><span class="kick">Meta até a prova</span><p class="mut">Coloque a <b>data da prova</b> em Config para eu calcular quantas questões por dia você precisa para ver todas as fáceis e médias. Faltam ${r}.</p></div>`;
  const fase=emReta(),mh=metaHoje();
  return `<div class="card"><span class="kick">Meta até a prova</span><p><b>${d} dias</b> até a prova · <b>${r}</b> questões fáceis e médias ainda não vistas.</p>
   <p class="mut">Meta de hoje: <b>${mh} questões</b> na Revisão do dia.${fase?' <b>Reta final:</b> mistura 70% novas e 30% das fáceis e médias que você errou.':` Os últimos ${fim} dias ficam para rever os erros.`}</p>${typeof smMetaHoje==='function'?smMetaHoje():''}</div>`;
}
// 3) reta final: erradas fáceis/médias voltam (30%) nos últimos dias
function pacoteErradas(k){
  const ult={};log.forEach(l=>ult[l.q]=l);
  const pool=Q.filter(q=>q.gab&&ult[q.id]&&!ult[q.id].ok&&q._d!=='d');
  return sorteioPonderado(pool,q=>pesoVolume(q),k,false).map(q=>q.id);
}


let cfgTab='geral';
function vConfig(){
  const tabs=[['geral','Geral'],['agenda','Agenda'],['atalhos','Atalhos'],['sync','Sincronização e backup'],['metodo','Metodologia']];
  return `<div class="subtabs">${tabs.map(([k,n])=>`<button class="${cfgTab===k?'on':''}" onclick="cfgTab='${k}';capKey=null;render()">${n}</button>`).join('')}</div>`+({geral:cfgGeral,agenda:vAgenda,atalhos:cfgAtalhos,sync:cfgSync,metodo:cfgMetodo}[cfgTab])();
}
function cfgGeral(){
  const S=statsPor(q=>q._a);
  return `<div class="card"><h2>Aparência</h2><p class="row"><label>Tamanho do texto <input id="c_fs" type="range" min="80" max="125" step="1" value="${cfg.fs||93}" oninput="cfg.fs=+this.value;aplicaTema();$('#fsv').textContent=this.value+'%'" onchange="persist('_est')" style="width:200px"><b id="fsv">${cfg.fs||93}%</b></label> <button class="b s" onclick="cfg.fs=93;aplicaTema();persist('_est');render()">Padrão</button></p><div class="row">${[['auto','Automático'],['claro','Claro'],['escuro','Escuro']].map(([k,n])=>`<button class="b ${cfg.tema===k?'':'s'}" onclick="cfg.tema='${k}';saveL('cbr_tema',cfg.tema);aplicaTema();persist('_est');render()">${n}</button>`).join('')}</div></div>
  <div class="card"><h2>Estudo</h2>
  <p class="row"><label>Questões na Revisão Inteligente <input id="c_d" type="number" value="${RI_DIARIA}" readonly style="width:80px"></label>
  <label>Cartões novos por dia <input id="c_fn" type="number" min="0" max="500" value="${cfg.fcNovos}" onchange="cfg.fcNovos=+this.value;persist('_est')" style="width:80px"></label>
  <label>Máx. revisões de cartões por dia <input id="c_fm" type="number" min="10" max="2000" value="${cfg.fcMax}" onchange="cfg.fcMax=+this.value;persist('_est')" style="width:90px"></label>
  <label>Data da prova <input id="c_p" type="text" value="12/12/2026" readonly></label></p>
  <p class="mut">Revisão Inteligente: 50 questões por dia. Prova em 12/12/2026.</p>
  ${modoProvaUI()}${layoutUI()}${ordemUI()}${pesosUI()}</div>`;
}
function cfgAtalhos(){
  const linhaCfg=n=>`<tr><td>${KEYLAB[n]}</td><td style="text-align:right"><button class="b ${capKey===n?'':'s'}" style="min-width:150px" onclick="capStart('${n}')">${capKey===n?'Pressione uma tecla…':(n==='qa'?'Alt + ':'')+keyLab(n)}</button></td></tr>`;
  const linhaFix=([k,d])=>`<tr><td>${d}</td><td style="text-align:right"><kbd>${k}</kbd> <span class="mut">fixo</span></td></tr>`;
  const tabs=`<div class="subtabs">${ATABS.map(([k,n])=>`<button class="${atTab===k?'on':''}" onclick="atTab='${k}';capKey=null;render()">${n}</button>`).join('')}</div>`;
  const [,,secs]=ATABS.find(x=>x[0]===atTab)||ATABS[0];
  const corpo=secs.map(([t,g,fix])=>`<div class="card"><h2>${t}</h2><div class="tw"><table>${(g?KG[g].map(linhaCfg):[]).join('')}${fix.map(linhaFix).join('')}</table></div></div>`).join('');
  const passo=atTab==='geral'?`<div class="card"><h2>Rolagem pelas setas</h2><p class="row"><label>Passo da rolagem pelas setas (px) <input type="number" min="40" max="400" step="10" value="${+cfg.passoSeta||120}" onchange="setPasso(this.value)" style="width:90px"></label></p><p class="mut">Vale para ↑ / ↓ depois de responder a questão (40 a 400; padrão 120).</p></div>`:'';
  return tabs+corpo+passo+`<div class="card"><p class="mut">Clique no botão e pressione a nova tecla (Esc cancela). Teclas marcadas "fixo" não mudam.</p><button class="b s" onclick="resetKeys()">Restaurar padrão</button></div>`;
}
function cfgSync(){
  return `<div class="card"><h3>Sincronização</h3><p class="mut">${DB?'Seu progresso é salvo automaticamente no GitHub (banco-cbr-app) e aparece igual em todos os aparelhos.':'A sincronização não está disponível nesta janela. O progresso fica só neste navegador; use o backup abaixo.'}</p>
  <h3>Backup manual</h3><p class="mut">Opcional. Copie o texto para guardar uma cópia ou para restaurar.</p>
  <button class="b" onclick="exportar()">Gerar backup</button> <button class="b s" onclick="copiar()">Copiar</button>
  <textarea id="bk" placeholder="O backup aparece aqui. Para importar, cole o texto aqui e clique em Importar."></textarea>
  <p class="row"><button class="b s" onclick="importar()">Importar o texto acima</button> <button class="b s" onclick="zerar()">${zerarOk?'Confirmar: apagar tudo':'Zerar progresso'}</button></p></div>`;
}
function cfgMetodo(){
  if(metEdit)return `<div class="card"><h2>Editar manual metodológico</h2><p class="mut">Texto em markdown. As linhas <code>@param nome=valor</code> controlam o app (cortes de dificuldade, metas, estilo do Claude). Ao salvar, a plataforma passa a seguir o novo texto e ele é sincronizado.</p>
  <textarea id="mt" style="min-height:420px;font:13px/1.5 monospace">${esc(metodo)}</textarea>
  <div class="row" style="margin-top:12px"><button class="b" onclick="metSalva()">Salvar</button><button class="b s" onclick="metEdit=false;render()">Cancelar</button><button class="b s" onclick="metOrig()">Restaurar original</button></div></div>`;
  return `<div class="card md"><div class="row" style="justify-content:space-between"><p class="mut" style="margin:0">Documento de referência do projeto. Agenda, revisões, classificação e resumos do Claude seguem este manual.</p><button class="b s" onclick="metEdit=true;render()">Editar manual</button></div>${mdlite(metodo)}</div>`;
}
function metSalva(){metodo=$('#mt').value;metoU=Date.now();saveL('cbr_metodo',{t:metodo,u:metoU});lerManual(metodo);persist('m:0');metEdit=false;render();toast('Manual salvo. A plataforma já segue o novo texto.')}
function metOrig(){metodo=window.METODO||'';metoU=Date.now();saveL('cbr_metodo',{t:metodo,u:metoU});lerManual(metodo);persist('m:0');metEdit=false;render();toast('Manual original restaurado')}
let zerarOk=false;
function zerar(){
  if(!zerarOk){zerarOk=true;render();return}
  zerarOk=false;const ws=new Set(all.map(l=>wkKey(l.t)));
  all=[];log=[];srs={};resetAt=Date.now();ws.forEach(w=>dirty.add(w));persist('_est');render();toast('Progresso zerado');
}
function toast(m){const t=$("#toast");t.textContent=m;t.style.display="block";clearTimeout(toast.h);toast.h=setTimeout(()=>t.style.display="none",2500)}
function exportar(){$("#bk").value=JSON.stringify({log:all,over,cfg,cards,fcs})}
function copiar(){exportar();const t=$("#bk");t.select();try{navigator.clipboard.writeText(t.value).then(()=>toast("Copiado"),()=>toast("Selecionado: use Ctrl+C"))}catch(e){toast("Selecionado: use Ctrl+C")}}
function importar(){try{const d=JSON.parse($("#bk").value);all=(d.log||[]).map(l=>({...l}));cards=d.cards||cards;fcs=d.fcs||fcs;cards.forEach(c=>dirty.add('c:'+hk(c.id,32)));Object.keys(fcs).forEach(id=>dirty.add('s:'+hk(id,8)));over=d.over||{};cfg=normCfg(d.cfg);
  recalc();reArea();all.forEach(l=>dirty.add(wkKey(l.t)));persist('_est');aplicaTema();render();toast("Importado")}catch(e){toast("Texto inválido")}}
function setPeso(id,v){if(v==='')delete cfg.pesos[id];else cfg.pesos[id]=+v;persist('_est')}

aplicaTema();smkIni();render();iniciaSync();smAtalhosInicia();


// ===== aba Questões (pedido do Artur, 22/10/2026) =====
// Abre o último bloco em andamento (revisão do dia ou estudo salvo) já na próxima questão a fazer;
// no topo da questão, um seletor troca para outro bloco em aberto.
function qChave(){if(!sess||sess.fim)return null;return sess.estId||(sess.modo==='hoje'?'ri':'atual')}
function qBlocos(){
  const L=[];
  try{const ids=riHoje(),h=hoje0(),f=new Set();let u=0;
    log.forEach(l=>{if(l.t>=h&&l.modo==='hoje'&&ids.includes(l.q)){f.add(l.q);u=Math.max(u,l.t)}});
    if(ids.length&&f.size<ids.length)L.push({k:'ri',nome:'Revisão do dia',feitas:f.size,n:ids.length,u})}catch(e){}
  (cfg.ests||[]).forEach(e=>{const ids=e.ids.filter(i=>QID[i]&&QID[i].gab),f=ids.filter(i=>(e.resp||{})[i]).length;
    if(ids.length&&f<ids.length)L.push({k:e.id,nome:'Estudo',feitas:f,n:ids.length,u:e.u||e.t0||0})});
  return L.sort((a,b)=>b.u-a.u);
}
// índice da próxima questão sem resposta, a partir da atual (dá a volta)
function qProxIdx(){const n=sess.ids.length;for(let j=0;j<n;j++){const i=(sess.i+j)%n;if(!sess.resp[sess.ids[i]])return i}return sess.i}
function qCarrega(k){
  if(sess&&!sess.fim&&sess.modo==='estudo')salvaEst();
  if(k==='ri'){iniciaRI();return}
  retomaEst(k);if(!sess||sess.estId!==k)return;
  const nx=qProxIdx();if(nx!==sess.i){sess.i=nx;sess.tq=Date.now();salvaEst();render();scrollTo(0,0)}
}
// chamado por go('questoes'): devolve true quando já levou para a questão
function qAbre(){
  if(sess&&sess.modo==='hoje'){iniciaRI();return tela==='quiz'}
  if(sess&&!sess.fim){go('quiz');return true}
  const L=qBlocos();if(!L.length)return false;
  qCarrega(L[0].k);return tela==='quiz';
}
function qTroca(k){if(k)qCarrega(k)}
function vQuestoes(){
  return `<div class="card"><h2>Questões</h2><p class="mut">Nenhum bloco de questões em aberto agora.</p>
  <div class="row"><button class="b" onclick="go('estudar')">Montar um estudo</button><button class="b s" onclick="go('hoje')">Ir para Hoje</button></div></div>`;
}
const qDt=u=>u?' · '+new Date(u).toLocaleString('pt-BR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
function qBarra(){
  if(!sess||sess.sim||sess.fim)return'';
  const at=qChave(),L=qBlocos(),outros=L.filter(b=>b.k!==at);if(!outros.length)return'';
  const eu=L.find(b=>b.k===at),nome=eu?`${eu.nome} · ${eu.feitas}/${eu.n}`:'Bloco atual';
  return `<div class="qblocos"><span class="mut">Bloco:</span><select aria-label="Trocar de bloco de questões" onchange="qTroca(this.value);this.blur()"><option value="">${esc(nome)}</option>${outros.map(b=>`<option value="${b.k}">→ ${b.nome} · ${b.feitas}/${b.n}${qDt(b.u)}</option>`).join('')}</select></div>`;
}
function qAtalhos(){
  if(!sess||sess.qEdit)return'';
  const K=n=>`<kbd>${esc(keyLab(n))}</kbd>`,it=(k,t)=>`<span>${k} ${t}</span>`;
  const alts=['a1','a2','a3','a4','a5'].map(K).join('');
  return `<div class="qatalhos" aria-label="Atalhos do teclado">
  ${it('<kbd>←</kbd><kbd>→</kbd>','questão anterior/próxima')}
  ${it('<kbd>↑</kbd><kbd>↓</kbd>','alternativas (dá a volta; ↑ na A vai para a imagem) · depois de responder: rola a página')}
  ${it(alts,'alternativas A–E')}
  ${it(K('cert')+K('duv')+K('chu'),'certeza / dúvida / chute (<kbd>Enter</kbd> = certeza)')}
  ${it(K('cut'),'riscar alternativa')}
  ${it(K('next')+'<kbd>Espaço</kbd>','próxima (depois de responder)')}
  ${it(K('edit'),'editar resposta')}
  ${it(K('ia'),'CCQ e resumo com IA')}
  ${it(K('img'),'seleciona a 1ª imagem › de novo abre › de novo fecha')}
  ${it('<kbd>←</kbd><kbd>→</kbd>','com imagem selecionada: troca a imagem (<kbd>↓</kbd> ou <kbd>Esc</kbd> volta)')}
  ${it(K('zin')+K('zout')+K('zfit'),'imagem aberta: aumenta / diminui / ajusta')}
  ${it('<kbd>Tab</kbd><kbd>Shift+Tab</kbd>','próxima / aba anterior')}
  </div>`;
}
function vQuizQ(){const h=vQuiz();if(tela!=='quiz'||!sess||sess.qEdit)return h;return qBarra()+h+qAtalhos()}

// ===== imagens: teclado (G + setas) — 22/10/2026 =====
// G seleciona a 1ª imagem › G abre › G fecha. Com imagem selecionada, ←/→ trocam a imagem e ↓ volta à alternativa A.
// Sem imagem selecionada: ↑ na alternativa A sobe para a 1ª imagem (se houver; senão vai para a última alternativa); ↓ na última volta à A.
const GS={id:null,on:false,t:'q'};
function qGalTipo(q){const fb=!!sess.resp[q.id]&&!sess.sim;return galLista(q,'q').length?'q':fb&&galLista(q,'c').length?'c':null}
function qMarcaGal(){const q=tela==='quiz'&&sess&&!sess.fim?cur():null;
  document.querySelectorAll('#app .gal').forEach(el=>el.classList.toggle('gsel',!!q&&GS.on&&GS.id===q.id&&el.id==='gal_'+q.id+'_'+GS.t))}
function qSelImg(q,tp){GS.on=true;GS.t=tp;galVai(q.id,tp,0,0);qMarcaGal();const el=document.getElementById('gal_'+q.id+'_'+tp);el&&el.scrollIntoView({block:'nearest',behavior:'smooth'})}
window.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  const t=e.target;if(t&&(/INPUT|SELECT|TEXTAREA/.test(t.tagName)||t.isContentEditable))return;
  if(typeof capKey!=='undefined'&&capKey)return;
  if(typeof QA!=='undefined'&&QA.on)return;
  const isG=keyIs(e,'img'),z=document.getElementById('zoom'),k=e.key;
  if(z&&!z.hidden){if(isG){e.preventDefault();e.stopImmediatePropagation();zClose()}return}
  if(tela!=='quiz'||!sess||sess.fim||sess.qEdit)return;
  const q=cur();if(!q)return;
  if(GS.id!==q.id){GS.id=q.id;GS.on=false}
  const fb=!!sess.resp[q.id]&&!sess.sim,tp=qGalTipo(q);
  const para=()=>{e.preventDefault();e.stopImmediatePropagation()};
  if(isG){if(!tp)return;para();
    if(!GS.on)qSelImg(q,tp);else{const x=galLista(q,GS.t)[gIdx[q.id+'_'+GS.t]||0];if(x)zoom(x.u)}
    return}
  if(GS.on&&(k==='ArrowLeft'||k==='ArrowRight')){para();galVai(q.id,GS.t,k==='ArrowRight'?1:-1);qMarcaGal();return}
  if(GS.on&&k==='Escape'){GS.on=false;qMarcaGal();return}
  if(fb||(k!=='ArrowUp'&&k!=='ArrowDown'))return;   // depois de responder ↑/↓ rolam a página (handler do app)
  para();const L=Object.keys(q.alts),n=L.length,c=L.indexOf(selAtual());
  if(GS.on){if(k==='ArrowDown'){GS.on=false;qMarcaGal();escolher(L[0])}return}
  if(k==='ArrowDown'){escolher(L[(c+1)%n]);return}
  if(c===0&&tp){qSelImg(q,tp);return}
  escolher(L[c<=0?n-1:c-1]);
},true);

// ===== rolagem pelas setas: suave como a roda do mouse; passo em Config › Atalhos (cfg.passoSeta, padrão 120 px) =====
const QR={alvo:null,raf:0};
function qRola(dir){
  const passo=+cfg.passoSeta||120,max=document.documentElement.scrollHeight-innerHeight;
  if(QR.alvo==null||!QR.raf)QR.alvo=scrollY;
  QR.alvo=Math.max(0,Math.min(max,QR.alvo+dir*passo));
  if(!QR.raf){const anda=()=>{const d=QR.alvo-scrollY;if(Math.abs(d)<1){scrollTo(0,QR.alvo);QR.raf=0;return}
    scrollTo(0,scrollY+d*0.2);QR.raf=requestAnimationFrame(anda)};QR.raf=requestAnimationFrame(anda)}
}
addEventListener('wheel',()=>{if(QR.raf){cancelAnimationFrame(QR.raf);QR.raf=0}},{passive:true});

// ===== imagens sem piscar: a cada redesenho reaproveita as <img> já carregadas (mesma imagem = mesmo elemento) =====
function qGuarda(root){const v={};root.querySelectorAll('img[data-u]').forEach(im=>{if(im.complete&&im.naturalWidth)(v[im.dataset.u]??=[]).push(im)});return v}
function qReusa(root,v){root.querySelectorAll('img[data-u]').forEach(im=>{const o=(v[im.dataset.u]||[]).shift();if(!o)return;
  [...o.attributes].forEach(a=>{if(a.name!=='src'&&!im.hasAttribute(a.name))o.removeAttribute(a.name)});
  [...im.attributes].forEach(a=>{if(a.name!=='src')o.setAttribute(a.name,a.value)});im.replaceWith(o)})}
function qPinta(html){const app=$('#app'),v=qGuarda(app);app.innerHTML=html;qReusa(app,v);qMarcaGal();qPreCarrega();if(typeof smkPinta==='function')smkPinta()}
// pré-carrega as imagens da questão atual e das 3 seguintes (ficam prontas na memória)
const qPre=new Map();
function qPreCarrega(){
  if(tela!=='quiz'||!sess||!window.BCBR||!BCBR.imgDireto)return;
  for(let d=0;d<=3;d++){const q=QID[sess.ids[sess.i+d]];if(!q)continue;
    [...(q.imgs||[]),...(q.imgsCom||[])].forEach(u=>{u=String(u);if(!u.startsWith('gh:'))return;const n=u.slice(3);if(qPre.has(n))return;
      qPre.set(n,null);BCBR.imgDireto(n).then(src=>{const im=new Image();im.src=src;qPre.set(n,im);if(im.decode)im.decode().catch(()=>{})}).catch(()=>qPre.delete(n))})}
}

// ===== deslizar o dedo na questão (1.17.0): ← próxima, → anterior (mesmas funções das teclas ←/→) =====
// Só gesto horizontal claro (|dx|>60 px e |dx|>1.5·|dy|). Ignora: rolagem vertical, zoom de imagem aberto, galeria/miniaturas,
// campos de texto, áreas que rolam na horizontal, seleção de texto e a tela Nova tarefa.
const QSW={x:0,y:0,t:0,ok:false};
function qSwOk(el){
  if(!el||!el.closest||el.closest('input,textarea,select,[contenteditable],.gal,.galt,.galm,#zoom,#qa,#nav,button'))return false;
  for(let e=el;e&&e!==document.body;e=e.parentElement){const o=getComputedStyle(e).overflowX;if((o==='auto'||o==='scroll')&&e.scrollWidth>e.clientWidth+2)return false}
  return true;
}
document.addEventListener('touchstart',e=>{
  QSW.ok=false;
  if(e.touches.length!==1||tela!=='quiz'||!sess||sess.fim||sess.qEdit||(typeof QA!=='undefined'&&QA.on))return;
  const z=document.getElementById('zoom');if(z&&!z.hidden)return;
  if(!qSwOk(e.target))return;
  QSW.x=e.touches[0].clientX;QSW.y=e.touches[0].clientY;QSW.t=Date.now();QSW.ok=true;
},{passive:true});
document.addEventListener('touchmove',e=>{if(e.touches.length>1)QSW.ok=false},{passive:true});
document.addEventListener('touchcancel',()=>{QSW.ok=false},{passive:true});
document.addEventListener('touchend',e=>{
  if(!QSW.ok)return;QSW.ok=false;
  if(tela!=='quiz'||!sess||sess.fim)return;
  const t=e.changedTouches[0];if(!t)return;
  const dx=t.clientX-QSW.x,dy=t.clientY-QSW.y;
  if(Math.abs(dx)<=60||Math.abs(dx)<=1.5*Math.abs(dy)||Date.now()-QSW.t>1200)return;
  try{const s=getSelection();if(s&&!s.isCollapsed&&String(s).trim())return}catch(x){}
  if(dx<0){if(sess.i>=sess.ids.length-1)toast('Última questão');else{irPara(sess.i+1);qPulaGrade()}}
  else{irPara(sess.i-1);qPulaGrade()}
},{passive:true});

// depois de deslizar, a página já abre na questão: a grade com os números fica acima, fora da tela (pedido do Artur, 24/10/2026)
// o cabeçalho encolhe ao rolar: rola, e corrige uma vez depois que ele mudou de altura
function qPulaGrade(){qPulaGrade1();setTimeout(qPulaGrade1,60)}
function qPulaGrade1(){   // topo do cartão da questão logo abaixo da barra fixa (título + abas); a grade fica acima, é só subir
  const c=document.querySelector('#app .qlay .card');if(!c)return;let off=0;
  document.querySelectorAll('body>*,body>*>*').forEach(e=>{if(e.id==='app')return;const p=getComputedStyle(e).position;if(p!=='sticky'&&p!=='fixed')return;const r=e.getBoundingClientRect();if(r.top<=0.5&&r.bottom>0&&r.bottom<innerHeight/2&&r.width>innerWidth/2)off=Math.max(off,r.bottom)});
  scrollTo(0,Math.max(0,c.getBoundingClientRect().top+scrollY-off-8))}
// Corpo compartilhado pelo quiz e pela consulta no Banco (sem sessão artificial).
function qDificuldade(q){return difTag(q)}
function qEnunciado(q,imgs){return `<div class="enun" style="margin-top:10px">${esc(q.enunciado)}</div><div class="imgs">${imgs}</div>`}
function qAlternativas(q,{r=null,fb=false,sel=null,cut=[],leitura=false}={}){
  return Object.entries(q.alts||{}).map(([l,tx])=>{
    let c='';if(fb){if(l===q.gab)c='ok';else if(l===(r?.esc??r?.e))c='bad'}else if(sel===l)c='sel';
    return `<div class="alt ${c} ${cut.includes(l)?'cutd':''} ${tx.length<60?'curta':''} ${tx.length<28?'curtinha':''}"${leitura?'':' tabindex="0" onclick="escolher(\''+l+'\')"'}><b>${l})</b><div style="flex:1;min-width:0"><span class="at">${esc(tx.replace(/\s*·\s*(?:✓\s*)?(?:[\d.,]+%\s*)?$/,''))}</span>${prAlternativa(q,l,fb)}${fb&&verCom(q)?comentAlt(q,l):''}</div>${leitura?'':`<button class="cut ${cut.includes(l)?'on':''}" title="Riscar alternativa (F)" aria-label="Riscar alternativa ${l}" onclick="event.stopPropagation();riscar('${l}')">${TES}</button>`}</div>`;
  }).join('');
}

// ===== 1.37.0 (pedido do Artur, 06/11/2026): responder/escolher/riscar não mexe no scroll da página =====
// Guarda a posição antes do redesenho e repõe depois (inclusive após o setTimeout do layout). Trocar de questão segue indo ao topo.
function qFixaScroll(fn){return function(...a){const y=scrollY,q0=sess&&sess.i;const r=fn.apply(this,a);
  if(tela==='quiz'&&sess&&sess.i===q0){const volta=()=>{if(sess&&sess.i===q0&&Math.abs(scrollY-y)>1)scrollTo(0,y)};volta();setTimeout(volta,0)}
  return r}}
if(typeof responder==='function'){responder=qFixaScroll(responder);escolher=qFixaScroll(escolher);riscar=qFixaScroll(riscar);editar=qFixaScroll(editar)}


// ===== Reordenar cartões arrastando (pedido do Artur, 22/10/2026) =====
// Segurar ~400 ms num cartão (mouse ou toque) e arrastar para onde quiser; a ordem fica em cfg.ordemCartoes[aba]
// e sincroniza entre aparelhos junto com o resto do cfg (persist('_est')). Só mexe nos .card irmãos (mesmo pai).
const LY_HOLD=400;
let lyEngole=0;   // 1 = o próximo clique (logo após soltar o cartão) é engolido
const lyNorm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[0-9]+/g,'').replace(/[^a-z]+/g,' ').trim().slice(0,40);
// pais que têm 2+ cartões .card como filhos diretos (e os cartões deles)
function lyGrupos(){
  const app=document.getElementById('app'),ps=new Set(),gs=[];
  if(!app)return gs;
  app.querySelectorAll('.card').forEach(c=>{const p=c.parentElement;if(p&&!ps.has(p)){ps.add(p);const cs=[...p.children].filter(x=>x.classList.contains('card'));if(cs.length>1)gs.push({p,cs})}});
  return gs;
}
// chave estável de cada cartão (data-ordem > id > 1º título/.kick sem números > índice); repetidas ganham sufixo
function lyChaves(gs){
  const m=new Map(),vistas={};let i=0;
  gs.forEach(g=>g.cs.forEach(c=>{
    let k=c.dataset.ordem||c.id||'';
    if(!k){const t=c.querySelector('h2,h3,.kick,h4');k=lyNorm(t&&t.textContent)}
    if(!k)k='i'+i;i++;
    vistas[k]=(vistas[k]||0)+1;if(vistas[k]>1)k+='#'+vistas[k];
    m.set(c,k)}));
  return m;
}
// reaplica a ordem salva da aba atual (chamado depois de cada render, via MutationObserver)
function lyAplica(){
  if(tela==='quiz'||tela==='fim')return;
  const ord=cfg.ordemCartoes&&cfg.ordemCartoes[tela];if(!ord||!ord.length)return;
  const gs=lyGrupos(),ch=lyChaves(gs);
  gs.forEach(g=>{
    const pos=c=>ord.indexOf(ch.get(c)),conhecidos=g.cs.filter(c=>pos(c)>=0).sort((a,b)=>pos(a)-pos(b));
    const alvo=g.cs.map(c=>pos(c)>=0?conhecidos.shift():c);   // cartões novos ficam na posição natural
    if(alvo.every((c,i)=>c===g.cs[i]))return;
    const marcas=g.cs.map(c=>{const m=document.createComment('');c.before(m);return m});
    alvo.forEach((c,i)=>marcas[i].replaceWith(c));
  });
}
function lySalva(){
  const gs=lyGrupos(),ch=lyChaves(gs);cfg.ordemCartoes=cfg.ordemCartoes||{};
  cfg.ordemCartoes[tela]=gs.flatMap(g=>g.cs.map(c=>ch.get(c)));persist('_est');
}
function lyRestaura(aba){
  if(aba==='tudo')cfg.ordemCartoes={};else if(cfg.ordemCartoes)delete cfg.ordemCartoes[aba];
  persist('_est');render();toast(aba==='tudo'?'Ordem de todos os cartões restaurada':'Ordem restaurada');
}
function ordemUI(){
  const oc=cfg.ordemCartoes||{},com=TABS.filter(t=>oc[t[0]]&&oc[t[0]].length);
  return `<h3>Ordem dos cartões</h3><p class="mut">Em qualquer aba, segure um cartão por meio segundo e arraste para onde quiser. A ordem fica salva e vale nos seus aparelhos.</p>
  <div class="row" style="margin-bottom:12px">${com.map(t=>`<button class="b s" onclick="lyRestaura('${t[0]}')">Restaurar ${t[1]}</button>`).join('')}<button class="b s" ${com.length?'':'disabled'} onclick="lyRestaura('tudo')">Restaurar ordem dos cartões (tudo)</button></div>`;
}

// ---- arrastar ----
let lyD=null;   // {c,p,x0,y0,sy0,pid,ativo,timer,alvo,antes,mk,auto,cx,cy}
const lyIgnora='input,button,select,textarea,a,label,summary,.sm-row,[contenteditable],[onclick],.gal,.bar';
function lyFim(cancela){
  const d=lyD;if(!d)return;clearTimeout(d.timer);clearInterval(d.auto);lyD=null;
  document.body.classList.remove('ly-on');
  if(d.mk)d.mk.remove();
  if(!d.ativo)return;
  d.c.classList.remove('ly-drag');d.c.style.transform='';
  lyEngole=1;setTimeout(()=>{lyEngole=0},60);
  if(!cancela&&d.moveu&&d.alvo){if(d.antes)d.alvo.before(d.c);else d.alvo.after(d.c);lySalva();if(navigator.vibrate)try{navigator.vibrate(12)}catch(e){}}
}
function lyAlvo(x,y){
  const d=lyD,cs=[...d.p.children].filter(c=>c.classList.contains('card')&&c!==d.c);let best=null,bd=1e9;
  cs.forEach(c=>{const r=c.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dd=Math.hypot(x-cx,(y-cy)*1.4);if(dd<bd){bd=dd;best=c}});
  if(!best){d.alvo=null;return}
  const r=best.getBoundingClientRect(),pr=d.p.getBoundingClientRect(),vert=r.width<pr.width*.8;
  d.alvo=best;d.antes=vert&&y>=r.top&&y<=r.bottom?x<r.left+r.width/2:y<r.top+r.height/2;
  d.mk.style.cssText=vert?`left:${(d.antes?r.left:r.right)-2}px;top:${r.top}px;width:4px;height:${r.height}px`
    :`left:${r.left}px;top:${(d.antes?r.top:r.bottom)-2}px;width:${r.width}px;height:4px`;
}
function lyPos(){
  const d=lyD;if(!d||!d.ativo)return;
  d.c.style.transform=`translate(${d.cx-d.x0}px,${d.cy-d.y0+(window.scrollY-d.sy0)}px) scale(1.02)`;
  lyAlvo(d.cx,d.cy);
}
function lyMove(e){
  const d=lyD;if(!d||e.pointerId!==d.pid)return;
  if(!d.ativo){if(Math.hypot(e.clientX-d.x0,e.clientY-d.y0)>8)lyFim(true);return}   // mexeu antes do tempo = rolagem/seleção normal
  e.preventDefault();if(Math.hypot(e.clientX-d.x0,e.clientY-d.y0)>8)d.moveu=true;d.cx=e.clientX;d.cy=e.clientY;lyPos();
}
function lyComeca(){
  const d=lyD;if(!d)return;d.ativo=true;
  d.mk=document.createElement('div');d.mk.className='ly-mk';document.body.appendChild(d.mk);
  d.c.classList.add('ly-drag');document.body.classList.add('ly-on');
  try{d.c.setPointerCapture(d.pid)}catch(e){}
  if(navigator.vibrate)try{navigator.vibrate(25)}catch(e){}
  d.cx=d.x0;d.cy=d.y0;lyPos();
  d.auto=setInterval(()=>{const h=innerHeight;if(d.cy<70)scrollBy(0,-14);else if(d.cy>h-70)scrollBy(0,14);else return;lyPos()},16);
}
function lyIni(){
  const app=document.getElementById('app');if(!app||app._ly)return;app._ly=1;
  app.addEventListener('pointerdown',e=>{
    if(lyD||tela==='quiz'||tela==='fim'||(e.pointerType==='mouse'&&e.button!==0))return;
    const c=e.target.closest&&e.target.closest('.card');if(!c||e.target.closest(lyIgnora))return;
    const p=c.parentElement;if(!p||[...p.children].filter(x=>x.classList.contains('card')).length<2)return;
    lyD={c,p,x0:e.clientX,y0:e.clientY,sy0:window.scrollY,pid:e.pointerId,ativo:false};
    lyD.timer=setTimeout(lyComeca,LY_HOLD);
  });
  document.addEventListener('pointermove',lyMove,{passive:false});
  document.addEventListener('pointerup',e=>{if(lyD&&e.pointerId===lyD.pid)lyFim(false)});
  document.addEventListener('pointercancel',e=>{if(lyD&&e.pointerId===lyD.pid&&!lyD.ativo)lyFim(true)});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&lyD)lyFim(true)});
  // enquanto arrasta: sem rolagem do toque, sem seleção de texto, sem menu de contexto
  document.addEventListener('touchmove',e=>{if(lyD&&lyD.ativo)e.preventDefault()},{passive:false});
  document.addEventListener('selectstart',e=>{if(lyD&&lyD.ativo)e.preventDefault()});
  app.addEventListener('contextmenu',e=>{if(lyD)e.preventDefault()});
  // o clique que vem logo depois de soltar o cartão não deve acionar nada dentro dele
  document.addEventListener('click',e=>{if(lyEngole){lyEngole=0;e.stopPropagation();e.preventDefault()}},true);
  new MutationObserver(()=>lyAplica()).observe(app,{childList:true});
  lyAplica();
}
// Mantém a chave interna e a ordem salva das abas; só o rótulo muda.
const lyCalendario=TABS.find(t=>t[0]==='semana');if(lyCalendario)lyCalendario[1]='Calendário';
delete KEYLAB.smurg;KG.sem=KG.sem.filter(k=>k!=='smurg');
lyIni();
render();
