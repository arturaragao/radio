// Banco de Laudos embutido na aba Notas do Radio (armazenamento local IndexedDB + Google Drive).
// Reaproveita o motor v2.2 do banco-laudos com filtro por Hospital/Portal, modo Por Exame,
// "Virar flashcard", "Enviar para Nota" e sincronização automática com a extensão.
import CONFIG from "./config.js";
import * as db from "./lib/db.js";
import * as prefs from "./lib/prefs.js";
import { sincronizar, imagemDe } from "./lib/nuvem.js";
import * as drive from "./lib/drive.js";
import { comExtensao, procurarExtensao, extensao, aoChegarNovos } from "./lib/ponte.js";
import { camposDaEdicao, recalculo } from "./lib/regras.js";
import { indexar, padronizar, filtrar, ordenar, termosPositivos, marcar, parecidos, estatisticas } from "./lib/indice.js";
import { normalizar } from "./lib/filtros.js";
import { destacar, definirAprendizado } from "./lib/destaque.js";
import { feitoAMao, aprender } from "./lib/aprendizado.js";
import { vocabulario, corrigir } from "./lib/aproximada.js";
import { abreviarTitulo, separarLinhas, textoDoParagrafo } from "./lib/laudo2notion.js";
import { dividirLaudo, resumoLaudo, itensConclusao, cabecalho } from "./lib/secoes.js";
import { initVisor, abrirVisor, visorAberto } from "./ui/visor.js";

const GRUPOS = ["origem", "mod", "exame", "medico", "classe", "colecao"];
const NOMES = {
  origem: "Hospital / Portal",
  mod: "Modalidade",
  exame: "Exame",
  medico: "Médico",
  classe: "Classificações",
  achado: "Achados",
  colecao: "Coleções",
};

const PADRAO = {
  q: "",
  onde: "tudo",
  periodo: "",
  de: "",
  ate: "",
  normal: "",
  fav: false,
  img: false,
  comNota: false,
  ordem: "recente",
  facetas: {},
};

const DIA = 864e5;
const LIXEIRA_DIAS = 30;
const POR_PAGINA = 40;

const lerLocal = (k, p) => { try { return JSON.parse(localStorage.getItem(k)) ?? p; } catch { return p; } };
const gravarLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const dataBr = (iso) => (iso ? iso.split("-").reverse().join("/") : "?");
const nImgs = (r) => Math.max(r.nImagens || 0, r.imgs?.length || 0, r.imgsLocais || 0);

let acAtual = null;
let intervaloSync = null;
let observador = null;
const urlsAtivas = [];

export function desmontarBancoLaudos() {
  if (acAtual) { acAtual.abort(); acAtual = null; }
  if (intervaloSync) { clearInterval(intervaloSync); intervaloSync = null; }
  if (observador) { observador.disconnect(); observador = null; }
  aoChegarNovos(null);
  for (const u of urlsAtivas.splice(0)) URL.revokeObjectURL(u);
}

function htmlEstrutura() {
  return `<div class="bl-root">
  <header class="bl-topo">
    <div class="bl-l1">
      <h2>🩻 Banco de Laudos <small id="bl_contagem">carregando…</small></h2>
      <button type="button" id="bl_bModo" title="Alternar entre Cartões e Agrupado por Exame">Cartões</button>
      <button type="button" id="bl_bSync" title="Sincronizar (Google Drive e extensão)">⇅ Sincronizar</button>
      <button type="button" class="bl-icone" id="bl_bMenu" title="Mais opções" aria-label="Mais opções">⋯</button>
    </div>
    <div class="bl-l2">
      <input id="bl_q" type="search" list="bl_historico" autocomplete="off" placeholder="Buscar: nodulo pulmonar; esteatose -leve; &quot;lesao expansiva&quot;; nº do acesso">
      <datalist id="bl_historico"></datalist>
      <select id="bl_onde" title="Onde buscar">
        <option value="tudo">Tudo</option>
        <option value="conclusao">Conclusão</option>
        <option value="achados">Achados</option>
        <option value="indicacao">Indicação</option>
      </select>
    </div>
    <div class="bl-l3">
      <button type="button" class="bl-pilula" data-periodo="" title="Todo o período">Tudo</button>
      <button type="button" class="bl-pilula" data-periodo="hoje" title="Hoje">Hoje</button>
      <button type="button" class="bl-pilula" data-periodo="3d" title="Últimos 3 dias">3d</button>
      <button type="button" class="bl-pilula" data-periodo="7d" title="Últimos 7 dias">7d</button>
      <button type="button" class="bl-pilula" data-periodo="30d" title="Últimos 30 dias">30d</button>
      <button type="button" class="bl-pilula" data-periodo="3m" title="Últimos 3 meses">3m</button>
      <button type="button" class="bl-pilula" data-periodo="12m" title="Últimos 12 meses">12m</button>
      <button type="button" class="bl-pilula" id="bl_pFav" title="Só favoritos">★</button>
      <button type="button" class="bl-pilula" id="bl_pImg" title="Só com imagem-chave">🖼</button>
      <button type="button" class="bl-pilula" id="bl_pNota" title="Só com anotação pessoal">📝</button>
      <span id="bl_facetas"></span>
      <select id="bl_ordem" title="Ordenar">
        <option value="recente">Mais recentes</option>
        <option value="antigo">Mais antigos</option>
        <option value="relevancia">Relevância</option>
      </select>
    </div>
    <div id="bl_aviso" class="bl-aviso"></div>
  </header>

  <div class="bl-corpo">
    <div id="bl_faixa" class="bl-faixa"></div>
    <section id="bl_lista"><div class="bl-vazio">Carregando…</div></section>
  </div>

  <div id="bl_visor" class="bl-visor"><img alt=""><button type="button" class="vb" id="bl_vFechar" aria-label="Fechar">×</button><button type="button" class="vb" id="bl_vAnt" aria-label="Anterior">‹</button><button type="button" class="vb" id="bl_vProx" aria-label="Próxima">›</button><div id="bl_vCont" class="bl-vcont"></div></div>
  <div id="bl_fmt" class="bl-fmt"><button type="button" data-fmt="bold"><b>N</b></button><button type="button" data-fmt="italic"><i>I</i></button><button type="button" data-fmt="underline"><u>S</u></button></div>
  <div id="bl_impressao" class="bl-impressao"></div>

  <dialog id="bl_menu" class="bl-dialog">
    <h2>Mais opções <button type="button" class="bl-icone" data-fechar>×</button></h2>
    <button type="button" class="bl-item-menu" data-menu="estudo">🎓 Modo estudo <span id="bl_mEstudo">desligado</span></button>
    <button type="button" class="bl-item-menu" data-menu="estatisticas">📊 Estatísticas da busca</button>
    <button type="button" class="bl-item-menu" data-menu="frases">💬 Frases-modelo</button>
    <button type="button" class="bl-item-menu" data-menu="csv">⬇ Exportar planilha (CSV)</button>
    <button type="button" class="bl-item-menu" data-menu="pdf">🖨 Exportar PDF / imprimir</button>
    <button type="button" class="bl-item-menu" data-menu="lixeira">🗑 Lixeira <span id="bl_mLixeira"></span></button>
    <button type="button" class="bl-item-menu" data-menu="filtradosLixeira">Mover os laudos da busca para a lixeira</button>
    <button type="button" class="bl-item-menu" data-menu="refazer">Refazer resumos</button>
    <button type="button" class="bl-item-menu" data-menu="atalhos">⌨ Atalhos do teclado</button>
    <button type="button" class="bl-item-menu" data-menu="config">⚙ Configurações</button>
  </dialog>

  <dialog id="bl_dEstat" class="bl-dialog"><h2>Estatísticas <button type="button" class="bl-icone" data-fechar>×</button></h2><div id="bl_estat"></div></dialog>

  <dialog id="bl_dFrases" class="bl-dialog">
    <h2>Frases-modelo <button type="button" class="bl-icone" data-fechar>×</button></h2>
    <input id="bl_fBusca" type="search" placeholder="Procurar frase">
    <div id="bl_frases" style="margin-top:8px"></div>
    <label for="bl_fNova">Nova frase</label>
    <textarea id="bl_fNova" rows="2" placeholder="Sem alterações significativas em relação ao exame anterior."></textarea>
    <div class="bl-linha"><button type="button" id="bl_fSalvar">Salvar frase</button><small style="margin:0">Toque numa frase para copiar.</small></div>
  </dialog>

  <dialog id="bl_dColecoes" class="bl-dialog">
    <h2>Coleções <button type="button" class="bl-icone" data-fechar>×</button></h2>
    <div id="bl_colLista"></div>
    <div class="bl-linha"><input id="bl_colNova" placeholder="Nova coleção (ex.: ensino, revisar)" style="flex:1"><button type="button" id="bl_colCriar">Criar</button></div>
  </dialog>

  <dialog id="bl_dFlashcard" class="bl-dialog">
    <h2>Virar Flashcard <button type="button" class="bl-icone" data-fechar>×</button></h2>
    <label for="bl_fcFrente">Frente</label>
    <textarea id="bl_fcFrente" rows="3"></textarea>
    <label for="bl_fcVerso">Verso</label>
    <textarea id="bl_fcVerso" rows="4"></textarea>
    <label for="bl_fcTags">Tags (separadas por ponto e vírgula)</label>
    <input id="bl_fcTags" type="text">
    <div class="bl-linha"><button type="button" id="bl_fcSalvar">Salvar flashcard</button><button type="button" data-fechar>Cancelar</button></div>
  </dialog>

  <dialog id="bl_dNota" class="bl-dialog">
    <h2>Enviar para Nota <button type="button" class="bl-icone" data-fechar>×</button></h2>
    <label for="bl_ntDestino">Página de destino</label>
    <select id="bl_ntDestino"></select>
    <label for="bl_ntTituloToggle">Título do toggle</label>
    <input id="bl_ntTituloToggle" type="text">
    <div class="bl-linha"><button type="button" id="bl_ntConfirmar">Enviar para a página</button><button type="button" data-fechar>Cancelar</button></div>
  </dialog>

  <dialog id="bl_dAtalhos" class="bl-dialog">
    <h2>Atalhos do teclado <button type="button" class="bl-icone" data-fechar>×</button></h2>
    <p style="line-height:2;margin:0"><kbd>/</kbd> buscar · <kbd>j</kbd>/<kbd>k</kbd> próximo/anterior · <kbd>Enter</kbd> abrir/fechar · <kbd>f</kbd> favorito ·
    <kbd>e</kbd> editar · <kbd>c</kbd> copiar texto · <kbd>Esc</kbd> fechar · <kbd>?</kbd> esta ajuda<br>
    Editando: <kbd>Ctrl+B</kbd> negrito · <kbd>Ctrl+I</kbd> itálico · <kbd>Ctrl+S</kbd>/<kbd>Ctrl+U</kbd> sublinhado</p>
  </dialog>

  <dialog id="bl_dOpcoes" class="bl-dialog">
    <h2>Configurações <button type="button" class="bl-icone" data-fechar>×</button></h2>
    <div id="bl_estado" class="bl-estado">…</div>
    <div class="bl-linha"><button type="button" id="bl_oConectar">Conectar ao Google Drive</button><button type="button" id="bl_oDesconectar">Desconectar</button></div>
    <label class="bl-check"><input id="bl_oResumo" type="checkbox"> Mostrar o resumo nos cartões</label>
    <small>Desligado: só a conclusão completa, com as palavras importantes destacadas.</small>
    <label for="bl_oCliente">ID do cliente OAuth do Google</label>
    <input id="bl_oCliente" placeholder="…apps.googleusercontent.com">
    <small>Só se o app pedir. O normal é já vir no app (config.js).</small>
    <div class="bl-linha"><a href="https://www.notion.so/3e991fa845d880268d64d80cdbff8515" target="_blank" rel="noopener"><button type="button">Notas Tomografia ↗</button></a></div>
  </dialog>
</div>`;
}

export async function montarBancoLaudos(raiz, host = {}) {
  desmontarBancoLaudos();
  acAtual = new AbortController();
  const { signal } = acAtual;

  raiz.innerHTML = htmlEstrutura();
  const rootEl = raiz.querySelector(".bl-root");
  const $ = (id) => raiz.querySelector(`#bl_${id}`);

  const sincronizarTema = () => {
    const dt = document.documentElement.dataset.theme;
    const escuro = dt === "dark" || (dt !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    rootEl.dataset.tema = escuro ? "escuro" : "claro";
  };
  sincronizarTema();
  const obsTema = new MutationObserver(sincronizarTema);
  obsTema.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  signal.addEventListener("abort", () => obsTema.disconnect());

  initVisor(raiz, signal);

  drive.configurar(lerLocal("app.clienteId", "") || CONFIG.clienteId);
  drive.prepararLogin();

  let F = { ...PADRAO, ...lerLocal("banco.f", {}) };
  let vista = "laudos";
  let modoLista = lerLocal("app.modoLista", "cartoes"); // cartoes | exame
  let estudo = lerLocal("app.estudo", false);
  let MOSTRAR_RESUMO = lerLocal("app.mostrarResumo", false);
  let todos = [];
  let achados = [];
  let mostrando = 0;
  let termos = [];
  let consultaUsada = "";
  let vocab = null;
  let P = prefs.vazio();
  let ddAberto = "";
  let ddBusca = "";
  let aprendido = { sempre: [], nunca: [], laudos: 0 };
  let colAlvo = null;
  let notaAlvo = null;
  let sincronizando = false;
  let tempoSinc = null;
  let tempoHist = null;
  let tempoBusca = null;

  const reaprender = (regs = todos.map((ix) => ix.r)) => {
    aprendido = aprender(regs);
    definirAprendizado(aprendido);
  };
  const aMao = (r) => (r.__mao ??= feitoAMao(r));

  function mostrarAviso() {
    const a = $("aviso");
    if (!a) return;
    a.innerHTML = [a.dataset.troca, esc(a.dataset.msg || "")].filter(Boolean).join(" · ");
  }
  const msg = (t) => {
    const a = $("aviso");
    if (!a) return;
    a.dataset.msg = t || "";
    mostrarAviso();
  };

  async function carregar() {
    const regs = [];
    await db.percorrer((r) => { regs.push(r); });
    todos = padronizar(regs.map(indexar));
    reaprender(regs);
    vocab = null;
    P = await prefs.ler();
    $("historico").innerHTML = Object.entries(P.historico)
      .sort((a, b) => b[1].em - a[1].em)
      .map(([t]) => `<option value="${esc(t)}">`)
      .join("");
  }

  function dataMenos(dias) {
    return new Date(Date.now() - dias * DIA).toISOString().slice(0, 10);
  }
  function filtroEfetivo() {
    const f = { ...F };
    const dias = { hoje: 0, "3d": 2, "7d": 6, "30d": 29, "3m": 91, "12m": 365 }[F.periodo];
    if (dias != null) { f.de = dataMenos(dias); f.ate = ""; }
    else if (F.periodo !== "datas") { f.de = ""; f.ate = ""; }
    return f;
  }

  function desenharTopo() {
    if ($("q").value !== F.q) $("q").value = F.q;
    $("onde").value = F.onde;
    $("ordem").value = F.ordem;
    raiz.querySelectorAll("[data-periodo]").forEach((b) =>
      b.classList.toggle("on", b.dataset.periodo === F.periodo || (b.dataset.periodo === "" && !F.periodo))
    );
    $("pFav").classList.toggle("on", !!F.fav);
    $("pImg").classList.toggle("on", !!F.img);
    $("pNota").classList.toggle("on", !!F.comNota);
    $("bModo").textContent = modoLista === "exame" ? "Por exame" : "Cartões";
    $("bModo").classList.toggle("on", modoLista === "exame");
  }

  function posicionarPop() {
    const d = raiz.querySelector(".bl-dd.aberto");
    if (!d) return;
    const b = d.querySelector(".bl-pilula").getBoundingClientRect();
    const pop = d.querySelector(".bl-pop");
    pop.style.top = `${Math.round(b.bottom + 6)}px`;
    pop.style.left = `${Math.round(Math.max(8, Math.min(b.left, innerWidth - pop.offsetWidth - 8)))}px`;
  }

  function desenharFacetas(cont) {
    const dd = (k, rotulo, n, corpo) =>
      `<span class="bl-dd ${ddAberto === k ? "aberto" : ""}"><button type="button" class="bl-pilula ${n ? "on" : ""}" data-dd="${k}">${rotulo}${n ? ` (${n})` : ""}</button><div class="bl-pop">${corpo}</div></span>`;
    const chips = (g) => {
      const sel = F.facetas[g] || [];
      const itens = [...(cont[g] || [])];
      for (const v of sel) if (!itens.some(([x]) => x === v)) itens.unshift([v, 0]);
      if (!itens.length) return "";
      const busca = itens.length > 10
        ? `<input class="bl-busca" data-filtrardd placeholder="Procurar ${NOMES[g].toLowerCase()}..." value="${esc(ddAberto === g ? ddBusca : "")}">`
        : "";
      const q = ddAberto === g ? normalizar(ddBusca) : "";
      const lista = itens
        .map(([v, n]) => `<button type="button" class="bl-chip ${sel.includes(v) ? "on" : ""}" data-g="${g}" data-v="${esc(v)}" ${q && !normalizar(v).includes(q) ? "hidden" : ""}><span class="nome">${esc(v)}</span><span>${n}</span></button>`)
        .join("");
      const limpar = sel.length ? `<div class="bl-rodape"><button type="button" data-limpargrupo="${g}">Limpar</button></div>` : "";
      return dd(g, NOMES[g], sel.length, `${busca}<div class="bl-chips">${lista}</div>${limpar}`);
    };
    const salvas = prefs.ativos(P, "buscas");
    const nDatas = F.periodo === "datas" ? 1 : 0;
    const total = GRUPOS.reduce((s, g) => s + (F.facetas[g]?.length || 0), 0) + (F.normal ? 1 : 0) + nDatas + (F.img ? 1 : 0) + (F.comNota ? 1 : 0) + (F.fav ? 1 : 0);
    $("facetas").innerHTML = [
      ...GRUPOS.map(chips),
      dd("laudos", "Laudos", F.normal ? 1 : 0, `<select id="bl_fNormal"><option value="">todos</option><option value="alt" ${F.normal === "alt" ? "selected" : ""}>só com alteração</option><option value="normal" ${F.normal === "normal" ? "selected" : ""}>só 100% normais</option></select>`),
      dd("datas", "Datas", nDatas, `<div class="bl-datas"><input type="date" id="bl_fDe" value="${F.periodo === "datas" ? esc(F.de) : ""}" title="De"><input type="date" id="bl_fAte" value="${F.periodo === "datas" ? esc(F.ate) : ""}" title="Até"></div>`),
      dd("buscas", "Buscas salvas", 0, `<div class="bl-chips">${salvas.length ? salvas.map(([n]) => `<button type="button" class="bl-chip" data-busca="${esc(n)}"><span class="nome">${esc(n)}</span><span data-apagarbusca="${esc(n)}" title="Apagar">✕</span></button>`).join("") : '<small style="color:var(--suave)">Nenhuma ainda.</small>'}</div><div class="bl-rodape"><button type="button" id="bl_bSalvarBusca">★ Salvar a busca atual</button></div>`),
      total ? `<button type="button" class="bl-pilula" id="bl_bLimparTudo">✕ Limpar (${total})</button>` : "",
    ].join("");
    posicionarPop();
  }

  function desenharFaixa() {
    const partes = [];
    if (vista === "lixeira") partes.push(`🗑 Lixeira — os laudos saem de vez depois de ${LIXEIRA_DIAS} dias. <button type="button" data-faixa="esvaziar">Esvaziar agora</button> <button type="button" data-faixa="sairLixeira">Voltar aos laudos</button>`);
    if (estudo) partes.push(`🎓 Modo estudo — imagens primeiro, conclusão escondida. <button type="button" data-faixa="sairEstudo">Sair do modo estudo</button>`);
    $("faixa").innerHTML = partes.join("<br>");
  }

  function completar(r) {
    if (r.__ok) return r;
    const div = dividirLaudo(r.pars || []);
    r.titulo = abreviarTitulo(r.titulo);
    r.resumo = r.resumo || resumoLaudo(div);
    r.itensConc = itensConclusao(div);
    if (!r.itensConc.length) {
      r.itensConc = String(r.conclusao || "").split("\n").map((s) => s.replace(/^\s*\d{1,2}\s*[).\-–:]\s*/, "").trim()).filter(Boolean);
    }
    r.concPars = div.secoes.conclusao || [];
    r.concSet = new Set(r.concPars);
    r.__ok = true;
    return r;
  }
  const semNum = (p) => (p.length ? [{ ...p[0], t: p[0].t.replace(/^\s*\d{1,2}\s*[).\-–:]\s*/, "") }, ...p.slice(1)] : p);
  const htmlPar = (p, marca = true) => p.map(({ t, b, i, u }) => {
    let x = marca && termos.length ? marcar(t, termos).map((s) => (s.m ? `<mark>${esc(s.t)}</mark>` : esc(s.t))).join("") : esc(t);
    if (u) x = `<u>${x}</u>`;
    if (i) x = `<i>${x}</i>`;
    if (b) x = `<b>${x}</b>`;
    return x;
  }).join("");
  const fmtConc = (r, p, marca) => htmlPar(aMao(r) ? semNum(p) : destacar(semNum(p)), marca);

  function cartao(ix) {
    const r = completar(ix.r);
    const conc = r.concPars.length ? r.concPars.map((p) => fmtConc(r, p)) : r.itensConc.map((c) => htmlPar(destacar([{ t: c, b: false, i: false, u: false }])));
    const tags = [
      ...ix.classes.map((v) => `<button type="button" class="bl-tag classe" data-g="classe" data-v="${esc(v)}">${esc(v)}</button>`),
      ...(r.colecoes || []).map((v) => `<button type="button" class="bl-tag colecao" data-g="colecao" data-v="${esc(v)}">${esc(v)}</button>`),
    ].join("");
    const lixeira = vista === "lixeira";
    const n = nImgs(r);
    const corpoEstudo = `<div class="bl-imgs" data-lazy="1">${n ? "" : '<div class="carregando">sem imagens</div>'}</div>
      <div class="bl-esconde"><button type="button" data-acao="revelar">Mostrar conclusão</button></div>
      <ol class="bl-conc" hidden>${conc.map((c) => `<li>${c}</li>`).join("")}</ol>`;
    return `<div class="bl-item ${r.normal ? "normal" : ""}" data-acc="${esc(r.acc)}">
      <div class="bl-cab" title="Abrir o laudo completo"><div class="bl-cabtxt"><span class="bl-acc">${esc(r.accOriginal || r.acc)}</span><span class="bl-origem">${esc(ix.origem)}</span><span class="bl-data">${dataBr(r.data)}</span><span class="bl-titulo">${esc(ix.exame)}</span></div><div class="bl-cabbtn">
        ${lixeira ? "" : `<button type="button" class="bl-icone fav ${r.fav ? "on" : ""}" data-acao="fav" title="Favorito (f)">${r.fav ? "★" : "☆"}</button>`}
        <button type="button" class="bl-icone" data-acao="${lixeira ? "apagarDeVez" : "lixeira"}" title="${lixeira ? "Apagar de vez" : "Mover para a lixeira"}">🗑</button></div></div>
      <div class="bl-sub">${[esc(ix.medico), esc([r.sexo, r.idade != null ? r.idade + " anos" : ""].filter(Boolean).join(", ")),
        n ? `🖼 ${n}` : "", r.indicacao ? `Indicação: ${esc(r.indicacao)}` : "",
        lixeira ? `na lixeira desde ${new Date(r.lixeiraEm).toLocaleDateString("pt-BR")}` : ""].filter(Boolean).join(" · ")}</div>
      ${!estudo && tags ? `<div class="bl-tags">${tags}</div>` : ""}
      ${!estudo && MOSTRAR_RESUMO ? `<div class="bl-resumo" contenteditable="true" data-campo="resumo" title="Toque para editar (em branco = automático)">${esc(r.resumo || "")}</div>` : ""}
      ${estudo ? corpoEstudo : `<ol class="bl-conc" contenteditable="true" data-campo="conc" title="Toque para editar">${conc.map((c) => `<li>${c}</li>`).join("")}</ol>`}
      ${!estudo && r.nota ? `<div class="bl-nota">📝 ${esc(r.nota)}</div>` : ""}
      ${lixeira ? `<div class="bl-acoes"><button type="button" data-acao="restaurar">Restaurar</button><button type="button" data-acao="apagarDeVez">Apagar de vez</button></div>` : ""}
      <div class="bl-aberto"></div>
    </div>`;
  }

  const acharIx = (acc) => achados.find((x) => x.r.acc === acc) || todos.find((x) => x.r.acc === acc);

  function ativarLazyEstudo() {
    if (!estudo) return;
    observador ||= new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) {
        observador.unobserve(e.target);
        const ix = acharIx(e.target.closest(".bl-item")?.dataset.acc);
        if (ix && nImgs(ix.r)) carregarImagens(e.target, ix.r);
      }
    }, { rootMargin: "300px" });
    $("lista").querySelectorAll('.bl-imgs[data-lazy="1"]').forEach((el) => { el.dataset.lazy = "2"; observador.observe(el); });
  }

  function desenharAgrupadoPorExame() {
    const grupos = new Map();
    for (const ix of achados) {
      const nome = ix.exame || "Outros";
      if (!grupos.has(nome)) grupos.set(nome, []);
      grupos.get(nome).push(ix);
    }
    const ordenado = [...grupos].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "pt-BR"));
    $("lista").innerHTML = ordenado.map(([nome, itens], idx) =>
      `<details class="bl-grupo-exame" ${idx < 3 ? "open" : ""}>
        <summary><span>${esc(nome)}</span><small>${itens.length} laudo(s)</small></summary>
        <div class="bl-grupo-itens">${itens.map(cartao).join("")}</div>
      </details>`
    ).join("");
    ativarLazyEstudo();
  }

  function mostrarMais() {
    $("mostrarMais")?.remove();
    const prox = achados.slice(mostrando, mostrando + POR_PAGINA);
    $("lista").insertAdjacentHTML("beforeend", prox.map(cartao).join(""));
    mostrando += prox.length;
    if (mostrando < achados.length) $("lista").insertAdjacentHTML("beforeend", `<button type="button" id="bl_mostrarMais" class="bl-mostrar-mais">Mostrar mais (${achados.length - mostrando})</button>`);
    ativarLazyEstudo();
  }

  async function buscar() {
    gravarLocal("banco.f", F);
    for (const u of urlsAtivas.splice(0)) URL.revokeObjectURL(u);
    const q = F.q.trim();
    let trocas = [];
    consultaUsada = q;
    if (q && !/^\d{5,}$/.test(q)) {
      vocab ||= vocabulario(todos.map((ix) => ix.tudo));
      const c = corrigir(q, vocab);
      if (c.trocas.length) { consultaUsada = c.expr; trocas = c.trocas; }
    }
    termos = /^\d{5,}$/.test(q) ? [] : termosPositivos(consultaUsada);
    const base = todos.filter((ix) => (vista === "lixeira" ? ix.r.lixeiraEm : !ix.r.lixeiraEm));
    const { lista, contagens } = filtrar(base, filtroEfetivo(), consultaUsada);
    achados = ordenar(lista, F.ordem, consultaUsada, base);
    $("aviso").dataset.troca = trocas.length ? `Busquei por <b>${esc(consultaUsada)}</b> (você digitou ${trocas.map(([a]) => `“${esc(a)}”`).join(", ")})` : "";
    mostrarAviso();
    desenharTopo();
    desenharFacetas(contagens);
    desenharFaixa();
    const total = base.length;
    $("contagem").textContent = vista === "lixeira" ? `lixeira: ${achados.length}` : `${achados.length} de ${total} laudo(s)`;
    mostrando = 0;
    $("lista").innerHTML = "";
    if (!todos.length) {
      $("lista").innerHTML = drive.conectado() || extensao()
        ? '<div class="bl-vazio">O banco ainda está vazio. Toque em <b>⇅ Sincronizar</b>.</div>'
        : '<div class="bl-vazio">O banco deste aparelho está vazio.<br>Toque em <b>☁ Conectar e sincronizar</b> para trazer os laudos do Google Drive (ou abra no PC com a extensão instalada).</div>';
    } else if (!achados.length) {
      $("lista").innerHTML = `<div class="bl-vazio">${vista === "lixeira" ? "A lixeira está vazia." : "Nenhum laudo com esses filtros."}</div>`;
    } else if (modoLista === "exame") {
      desenharAgrupadoPorExame();
    } else {
      mostrarMais();
    }
    clearTimeout(tempoHist);
    if (q && achados.length && !/^\d{5,}$/.test(q)) {
      tempoHist = setTimeout(async () => {
        if (!acAtual) return;
        if (P.historico[q] && Date.now() - P.historico[q].em < 60e3) return;
        P = await prefs.mudar("historico", q, {});
        if ($("historico")) {
          $("historico").innerHTML = Object.entries(P.historico).sort((a, b) => b[1].em - a[1].em).map(([t]) => `<option value="${esc(t)}">`).join("");
        }
      }, 2500);
    }
  }

  async function carregarImagens(box, r) {
    const n = nImgs(r);
    box.innerHTML = Array.from({ length: n }, (_, i) => `<div class="carregando" data-i="${i}">imagem ${i + 1}…</div>`).join("");
    const srcs = [];
    for (let i = 0; i < n; i++) {
      const lugar = box.querySelector(`.carregando[data-i="${i}"]`);
      if (!lugar) break;
      try {
        const b = await imagemDe(drive.conectado() ? drive.adaptador : null, r, i);
        if (!b) { lugar.textContent = drive.conectado() ? "ainda não enviada pelo PC" : "conecte ao Drive para ver"; continue; }
        const u = URL.createObjectURL(b);
        urlsAtivas.push(u);
        srcs.push(u);
        lugar.outerHTML = `<img src="${u}" alt="imagem chave ${i + 1}" data-n="${srcs.length - 1}">`;
      } catch (e) { lugar.textContent = e.login ? "conecte ao Drive para ver" : "erro ao baixar"; }
    }
    box.srcs = srcs;
  }

  async function abrir(item, forcar) {
    const box = item.querySelector(".bl-aberto");
    if (box.innerHTML && !forcar) { box.innerHTML = ""; return; }
    const ix = acharIx(item.dataset.acc);
    if (!ix) return;
    const r = completar(ix.r);
    let html = "", lista = [];
    const fecharLista = () => { if (lista.length) html += `<ol>${lista.map((p) => `<li>${fmtConc(r, p)}</li>`).join("")}</ol>`; lista = []; };
    for (const p of r.pars || []) { if (r.concSet.has(p)) lista.push(p); else { fecharLista(); html += `<p>${htmlPar(p)}</p>`; } }
    fecharLista();
    const par = vista === "lixeira" ? [] : parecidos(ix, todos.filter((x) => !x.r.lixeiraEm));
    box.innerHTML = `<div class="bl-laudo">${html}</div>
      ${nImgs(r) ? `<div class="bl-imgs"></div>` : ""}
      ${vista === "lixeira" ? "" : `<div class="bl-acoes">
        <button type="button" data-acao="editar">✎ Editar</button>
        <button type="button" data-acao="copiar">Copiar texto</button>
        <button type="button" data-acao="frase" title="Guarda o trecho selecionado (ou a conclusão) como frase-modelo">＋ Frase</button>
        <button type="button" data-acao="colecoes">Coleções</button>
        ${host.criarFlashcard ? `<button type="button" data-acao="flashcard">🃏 Virar flashcard</button>` : ""}
        ${host.enviarParaNota ? `<button type="button" data-acao="enviarNota">📄 Enviar para Nota</button>` : ""}
        ${r.notionId && r.notionPagina ? `<button type="button" data-acao="notion">Notion ↗</button>` : ""}
      </div>
      <div class="bl-notaEd"><textarea data-nota placeholder="Nota pessoal (só sua; vai para todos os aparelhos)">${esc(r.nota || "")}</textarea></div>
      ${par.length ? `<div class="bl-parecidos"><b>Laudos parecidos</b>${par.map((p) => `<a data-ir="${esc(p.r.acc)}">${esc(p.exame)} · ${dataBr(p.r.data)} — ${esc((p.r.resumo || "").slice(0, 90))}</a>`).join("")}</div>` : ""}`}`;
    const imgs = box.querySelector(".bl-imgs");
    if (imgs) carregarImagens(imgs, r);
  }

  function redesenhar(item) {
    const ix = acharIx(item.dataset.acc);
    if (!ix) return;
    const aberto = !!item.querySelector(".bl-aberto").innerHTML;
    const tmp = document.createElement("div");
    tmp.innerHTML = cartao(ix);
    const novo = tmp.firstElementChild;
    if (item.classList.contains("sel")) novo.classList.add("sel");
    item.replaceWith(novo);
    if (aberto) abrir(novo);
    return novo;
  }

  async function atualizarIx(acc) {
    const r = await db.laudo(acc);
    const novo = r && !r.apagado ? indexar(r) : null;
    for (const arr of [todos, achados]) {
      const i = arr.findIndex((x) => x.r.acc === acc);
      if (i >= 0) { if (novo) arr[i] = novo; else arr.splice(i, 1); }
    }
    return novo;
  }

  async function irPara(acc) {
    F = { ...PADRAO, q: acc, ordem: F.ordem };
    vista = "laudos";
    await buscar();
    const item = $("lista").querySelector(".bl-item");
    if (item) { abrir(item); selecionar(item, true); }
  }

  async function copiar(r) {
    const ix = acharIx(r.acc);
    const txt = [ix?.exame || r.titulo, `Acesso ${r.accOriginal || r.acc} · ${dataBr(r.data)} · ${ix?.medico || r.medico || ""}`, "", ...(r.pars || []).map((p) => p.map((s) => s.t).join(""))].join("\n");
    try { await navigator.clipboard.writeText(txt); msg("Laudo copiado"); } catch { msg("Não consegui copiar"); }
  }

  async function anotar(r, campos) {
    const agora = Date.now();
    await db.atualizar(r.acc, { ...campos, anotEm: agora, mudadoEm: agora });
    await atualizarIx(r.acc);
    agendarSincronia();
  }

  async function moverParaLixeira(regs) {
    for (const r of regs) await anotar(r, { lixeiraEm: Date.now() });
  }
  async function apagarDeVez(regs) {
    const agora = Date.now();
    for (const r of regs) {
      const l = await db.laudo(r.acc);
      await db.apagarImagens(r.acc, nImgs(l || r));
      await db.salvar({ acc: r.acc, data: r.data, apagado: true, mudadoEm: agora, nuvemEm: l?.nuvemEm ?? null, apagarImgs: l?.imgs || [] });
      await atualizarIx(r.acc);
    }
    agendarSincronia();
  }
  async function esvaziarVencidos() {
    const limite = Date.now() - LIXEIRA_DIAS * DIA;
    const vencidos = todos.filter((ix) => ix.r.lixeiraEm && ix.r.lixeiraEm < limite).map((ix) => ix.r);
    if (vencidos.length) await apagarDeVez(vencidos);
  }

  async function salvarEdicao(r, pars, resumo, destaqueManual = true) {
    const atual = await db.laudo(r.acc);
    if (!atual) throw new Error("laudo não encontrado");
    await db.atualizar(r.acc, camposDaEdicao(atual, pars, resumo, destaqueManual));
    vocab = null;
    const novo = await atualizarIx(r.acc);
    reaprender();
    agendarSincronia();
    return novo;
  }

  function trocarConclusao(r, itens) {
    const fora = new Set(r.concPars || []);
    const cabConc = () => [{ t: "Conclusão:", b: true, i: false, u: false }];
    const out = [];
    let ins = -1, depoisCab = -1;
    for (const p of r.pars || []) {
      if (fora.has(p)) { if (ins < 0) ins = out.length; continue; }
      const cab = cabecalho(textoDoParagrafo(p));
      if (cab?.chave === "conclusao") { out.push(cab.resto ? cabConc() : p); depoisCab = out.length; continue; }
      out.push(p);
    }
    if (ins < 0) ins = depoisCab >= 0 ? depoisCab : (out.push(cabConc()), out.length);
    out.splice(ins, 0, ...itens);
    return out;
  }

  function editar(item, r) {
    const box = item.querySelector(".bl-aberto");
    if (!box.innerHTML) { abrir(item).then(() => editar(item, r)); return; }
    const laudoEl = box.querySelector(".bl-laudo");
    if (!laudoEl) return;
    completar(r);
    let html = "", lista = [];
    const fecharLista = () => { if (lista.length) html += `<ol>${lista.map((p) => `<li>${fmtConc(r, p, false)}</li>`).join("")}</ol>`; lista = []; };
    for (const p of r.pars || []) { if (r.concSet.has(p)) lista.push(p); else { fecharLista(); html += `<p>${htmlPar(p, false)}</p>`; } }
    fecharLista();
    laudoEl.innerHTML = html;
    laudoEl.contentEditable = "true";
    laudoEl.classList.add("editando");
    laudoEl.focus();
    box.querySelector(".bl-acoes").innerHTML = `<label class="bl-rotres">Resumo (deixe em branco para o automático)
        <input class="edResumo" value="${esc(r.resumoManual ? r.resumo : "")}" placeholder="${esc(r.resumo || "")}"></label>
      <button type="button" data-acao="salvar">Salvar</button><button type="button" data-acao="cancelar">Cancelar</button>`;
    msg("Editando — Ctrl+B negrito, Ctrl+I itálico, Ctrl+U sublinhado");
  }

  function lerEditado(el) {
    const pars = [];
    const trechos = (no, f, out) => {
      if (no.nodeType === 3) { if (no.nodeValue) out.push({ t: no.nodeValue.replace(/\u00a0/g, " "), ...f }); return; }
      if (no.nodeType !== 1) return;
      const tag = no.tagName, st = no.style || {};
      const g = {
        b: f.b || tag === "B" || tag === "STRONG" || +st.fontWeight >= 600 || st.fontWeight === "bold",
        i: f.i || tag === "I" || tag === "EM" || st.fontStyle === "italic",
        u: f.u || tag === "U" || /underline/.test(st.textDecoration || ""),
      };
      if (tag === "BR") { out.push({ t: "\n", ...f }); return; }
      for (const c of no.childNodes) trechos(c, g, out);
    };
    const bloco = (no, prefixo = "") => {
      const out = [];
      trechos(no, { b: false, i: false, u: false }, out);
      if (prefixo && out.length) out[0] = { ...out[0], t: prefixo + out[0].t.replace(/^\s+/, "") };
      pars.push(...separarLinhas([out.filter((s) => s.t)]));
    };
    for (const no of el.childNodes) {
      if (no.nodeType === 1 && (no.tagName === "OL" || no.tagName === "UL")) {
        [...no.children].forEach((li, i) => bloco(li, no.tagName === "OL" ? `${i + 1}. ` : "• "));
      } else if (no.nodeType === 3 && !no.nodeValue.trim()) continue;
      else bloco(no);
    }
    return pars;
  }

  async function salvar(item, r) {
    const box = item.querySelector(".bl-aberto");
    const pars = lerEditado(box.querySelector(".bl-laudo"));
    if (!pars.length) return msg("O laudo ficou vazio — nada foi salvo");
    const resumo = box.querySelector(".edResumo")?.value || "";
    await salvarEdicao(r, pars, resumo, aMao(r));
    const novo = redesenhar(item);
    if (novo) abrir(novo, true);
    msg("Laudo salvo");
  }

  function ligarFaceta(g, v, so = false) {
    const sel = new Set(F.facetas[g] || []);
    if (sel.has(v) && !so) sel.delete(v); else sel.add(v);
    F.facetas = { ...F.facetas, [g]: [...sel] };
    buscar();
  }

  function abrirDD(k) {
    ddAberto = ddAberto === k ? "" : k;
    ddBusca = "";
    buscar();
    if (ddAberto && innerWidth >= 1000) raiz.querySelector(".bl-dd.aberto [data-filtrardd]")?.focus();
  }

  function abrirColecoes(r) {
    colAlvo = r;
    const nomes = new Set([...prefs.ativos(P, "colecoes").map(([n]) => n), ...todos.flatMap((ix) => ix.r.colecoes || [])]);
    $("colLista").innerHTML = nomes.size
      ? [...nomes].sort().map((n) => `<label class="bl-check"><input type="checkbox" data-col="${esc(n)}" ${(r.colecoes || []).includes(n) ? "checked" : ""}> ${esc(n)}</label>`).join("")
      : "<small>Nenhuma coleção ainda. Crie a primeira abaixo.</small>";
    $("dColecoes").showModal();
  }

  function abrirFlashcardModal(r) {
    const ix = acharIx(r.acc);
    completar(r);
    const frente = [ix?.exame || r.titulo, r.indicacao ? `Indicação: ${r.indicacao}` : ""].filter(Boolean).join("\n");
    const verso = r.itensConc.length ? r.itensConc.map((c, i) => `${i + 1}. ${c}`).join("\n") : (r.resumo || "");
    $("fcFrente").value = frente;
    $("fcVerso").value = verso;
    $("fcTags").value = [ix?.mod, ix?.exame].filter(Boolean).join("; ");
    $("dFlashcard").showModal();
  }

  function abrirEnviarNotaModal(r) {
    const ix = acharIx(r.acc);
    completar(r);
    notaAlvo = { r, ix };
    const paginas = host.listarPaginasNotas?.() || [];
    $("ntDestino").innerHTML = paginas.map((p) => `<option value="${esc(p.id)}">${esc(p.titulo)}</option>`).join("");
    const def = paginas.find((p) => /notas tc/i.test(p.titulo)) || paginas[0];
    if (def) $("ntDestino").value = def.id;
    $("ntTituloToggle").value = `${r.accOriginal || r.acc} - ${r.resumo || ix?.exame || r.titulo}`;
    $("dNota").showModal();
  }

  async function guardarFrase(r) {
    let t = String(getSelection()?.toString() || "").trim();
    if (!t) { completar(r); t = prompt("Frase-modelo (edite à vontade):", r.itensConc.join(" ")) || ""; }
    if (!t.trim()) return;
    P = await prefs.mudar("frases", "f" + Date.now().toString(36), { texto: t.trim() });
    agendarSincronia();
    msg("Frase guardada (⋯ › Frases-modelo)");
  }

  function desenharFrases() {
    const filtro = $("fBusca").value.trim();
    const lista = prefs.ativos(P, "frases").sort((a, b) => b[1].em - a[1].em)
      .filter(([, v]) => !filtro || v.texto.toLowerCase().includes(filtro.toLowerCase()));
    $("frases").innerHTML = lista.length
      ? lista.map(([k, v]) => `<div class="bl-frase"><p data-copiar="${esc(k)}" title="Copiar">${esc(v.texto)}</p><button type="button" class="bl-icone" data-apagarfrase="${esc(k)}" title="Apagar">✕</button></div>`).join("")
      : "<small>Nenhuma frase. Abra um laudo, selecione um trecho e toque em ＋ Frase, ou escreva abaixo.</small>";
  }

  function desenharEstat() {
    const s = estatisticas(achados);
    const barras = (titulo, lista, g) => {
      if (!lista.length) return "";
      const max = lista[0][1];
      return `<h3 style="font-size:13px;margin:0 0 6px">${titulo}</h3><div class="bl-barras">${lista.slice(0, 10).map(([v, n]) =>
        `<span class="r" ${g ? `data-g="${g}" data-v="${esc(v)}"` : ""} title="${esc(v)}">${esc(v)}</span><span class="b" style="width:${Math.max(2, (n / max) * 100)}%"></span><span>${n}</span>`).join("")}</div>`;
    };
    const meses = s.meses.slice(-24);
    const mx = Math.max(1, ...meses.map((m) => m[1]));
    $("estat").innerHTML = `<div class="bl-numeros"><div><b>${s.total}</b><span>laudos na busca</span></div><div><b>${s.total ? Math.round((s.normais / s.total) * 100) : 0}%</b><span>100% normais</span></div>
        <div><b>${s.medico.length}</b><span>médicos</span></div><div><b>${s.exame.length}</b><span>tipos de exame</span></div></div>
      ${meses.length ? `<h3 style="font-size:13px;margin:0">Laudos por mês</h3><div class="bl-meses">${meses.map(([m, n]) => `<i style="height:${(n / mx) * 100}%" title="${m}: ${n}"></i>`).join("")}</div>
        <div class="bl-meses-rot"><span>${meses[0][0]}</span><span>${meses[meses.length - 1][0]}</span></div>` : ""}
      ${barras("Classificações", s.classe, "classe")}${barras("Exames", s.exame, "exame")}
      ${barras("Médicos", s.medico, "medico")}${barras("Modalidades", s.mod, "mod")}
      <small>Toque num item para filtrar por ele.</small>`;
  }

  function baixar(nome, conteudo, tipo) {
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([conteudo], { type: tipo })), download: nome });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function exportarCsv() {
    const cel = (v) => { const s = String(v ?? ""); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const cab = ["acesso", "origem", "data", "exame", "modalidade", "medico", "idade", "sexo", "indicacao", "conclusao", "classificacoes", "colecoes", "favorito", "nota"];
    const linhas = achados.map((ix) => {
      const r = completar(ix.r);
      return [r.accOriginal || r.acc, ix.origem, dataBr(r.data), ix.exame, ix.mod, ix.medico, r.idade ?? "", r.sexo || "", r.indicacao || "",
        r.itensConc.map((c, i) => `${i + 1}. ${c}`).join(" "), ix.classes.join(", "), (r.colecoes || []).join(", "), r.fav ? "sim" : "", r.nota || ""].map(cel).join(";");
    });
    baixar(`laudos-${new Date().toISOString().slice(0, 10)}.csv`, "\uFEFF" + [cab.join(";"), ...linhas].join("\r\n"), "text/csv;charset=utf-8");
    msg(`${achados.length} laudo(s) exportado(s)`);
  }
  function exportarPdf() {
    const t0 = termos; termos = [];
    $("impressao").innerHTML = `<h1>Banco de laudos — ${achados.length} laudo(s)${F.q ? ` · busca: ${esc(F.q)}` : ""}</h1>` + achados.map((ix) => {
      const r = completar(ix.r);
      return `<div class="p"><b>${esc(ix.exame)}</b> — ${dataBr(r.data)} · acesso ${esc(r.accOriginal || r.acc)} (${esc(ix.origem)}) · ${esc(ix.medico)}<br>
        ${r.indicacao ? `<i>Indicação:</i> ${esc(r.indicacao)}<br>` : ""}${r.itensConc.map((c, i) => `${i + 1}. ${esc(c)}`).join("<br>")}${r.nota ? `<br><i>Nota:</i> ${esc(r.nota)}` : ""}</div>`;
    }).join("");
    termos = t0;
    setTimeout(() => window.print(), 50);
  }

  async function refazerResumos(forcar) {
    if (forcar) msg("Refazendo resumos...");
    let mudaram = 0;
    for (const r of await db.todos()) {
      if (r.apagado) continue;
      const c = recalculo(r, forcar);
      if (!c) continue;
      if (["resumo", "conclusao", "titulo", "pars"].some((k) => k in c && JSON.stringify(c[k]) !== JSON.stringify(r[k]))) mudaram++;
      await db.atualizar(r.acc, c);
    }
    if (mudaram) { msg(`Resumos atualizados em ${mudaram} laudo(s)`); await carregar(); buscar(); }
    else if (forcar) msg("Os resumos já estão no formato atual");
  }

  function estadoNuvem() {
    if (!$("bSync")) return;
    const precisa = drive.configurado() && !drive.conectado();
    $("bSync").classList.toggle("alerta", precisa);
    $("bSync").innerHTML = precisa ? "☁ Conectar<span class=longo> e sincronizar</span>" : "⇅<span class=longo> Sincronizar</span>";
  }

  async function sincronizarTudo({ manual = false } = {}) {
    if (sincronizando || !acAtual) return;
    sincronizando = true;
    const partes = [];
    let acordado = null;
    try { acordado = await navigator.wakeLock?.request("screen"); } catch {}
    try {
      if (await procurarExtensao()) {
        const x = await comExtensao(undefined, msg);
        if (x.trazidos) partes.push(`${x.trazidos} da extensão`);
        if (x.levados || x.apagadosLa) partes.push(`${x.levados + x.apagadosLa} para a extensão`);
      }
      if (!drive.conectado() && manual && drive.configurado()) await drive.conectar();
      if (drive.conectado()) {
        const n = await sincronizar(drive.adaptador, msg);
        if (n.recebidos) partes.push(`${n.recebidos} recebido(s)`);
        if (n.enviados) partes.push(`${n.enviados} enviado(s)`);
        if (n.imagens) partes.push(`${n.imagens} imagem(ns) enviada(s)`);
        if (extensao() && n.recebidos) { const x = await comExtensao(undefined, msg); if (x.levados) partes.push(`${x.levados} para a extensão`); }
      }
      msg(partes.length ? `Sincronizado: ${partes.join(", ")}` : drive.conectado() ? "Tudo sincronizado" : "");
      if (partes.length || manual) { await refazerResumos(false); await carregar(); buscar(); }
    } catch (e) {
      msg(e.login ? "Conecte ao Google Drive (☁)" : `Não consegui sincronizar: ${e.message}`);
    } finally {
      acordado?.release().catch(() => {});
      sincronizando = false;
      estadoNuvem();
    }
  }
  function agendarSincronia() { clearTimeout(tempoSinc); tempoSinc = setTimeout(() => sincronizarTudo(), 4000); }

  async function abrirConfig() {
    $("oResumo").checked = MOSTRAR_RESUMO;
    $("oCliente").value = lerLocal("app.clienteId", "");
    const meta = await db.lerMeta("nuvem", {});
    let total = 0, pend = 0;
    for (const r of await db.todos()) { if (!r.apagado) total++; if (r.nuvemEm !== r.mudadoEm) pend++; }
    let espaco = "";
    try { const e = await navigator.storage.estimate(); espaco = `${(e.usage / 1048576).toFixed(1)} MB usados neste aparelho`; } catch {}
    $("estado").innerHTML = [
      `<b>Google Drive:</b> ${!drive.configurado() ? "falta o ID do cliente OAuth" : drive.conectado() ? "conectado" : "desconectado"}`,
      `<b>Última sincronização:</b> ${meta.ultima ? new Date(meta.ultima).toLocaleString("pt-BR") : "nunca"}`,
      `<b>Laudos aqui:</b> ${total}${pend ? ` · ${pend} para enviar` : ""}`,
      `<b>Extensão Copiar Laudos Vue:</b> ${extensao() ? `encontrada (v${extensao()})` : "não está neste navegador"}`,
      `<b>Destaque aprendido</b> com ${aprendido.laudos} laudo(s) de negrito feito à mão: ${aprendido.sempre.length} trecho(s) sempre destacados, ${aprendido.nunca.length} palavra(s) nunca` +
        (aprendido.laudos ? `<details><summary>ver</summary><small><b>Sempre:</b> ${esc(aprendido.sempre.join(" · ") || "—")}<br><b>Nunca:</b> ${esc(aprendido.nunca.join(" · ") || "—")}</small></details>` : ""),
      espaco,
    ].filter(Boolean).join("<br>");
    $("dOpcoes").showModal();
  }

  function selecionar(item, rolar = true) {
    $("lista").querySelector(".bl-item.sel")?.classList.remove("sel");
    if (!item) return;
    item.classList.add("sel");
    if (rolar) item.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // ---------- eventos ----------
  const opt = { signal };
  addEventListener("resize", posicionarPop, opt);
  addEventListener("scroll", posicionarPop, { passive: true, signal });
  document.addEventListener("click", (e) => {
    if (ddAberto && e.target.isConnected && !e.target.closest(".bl-dd")) { ddAberto = ""; buscar(); }
    if (e.target.closest?.("#bl_root_close") || (e.target.closest?.("[data-fechar]") && rootEl.contains(e.target))) {
      e.target.closest("dialog")?.close();
    }
  }, opt);

  raiz.querySelectorAll("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }, opt));

  $("lista").addEventListener("click", async (e) => {
    if (e.target.id === "bl_mostrarMais") return mostrarMais();
    const item = e.target.closest(".bl-item");
    const tag = e.target.closest("[data-g]");
    if (tag && item) { ligarFaceta(tag.dataset.g, tag.dataset.v, true); return; }
    if (!item) return;
    selecionar(item, false);
    if (e.target.tagName === "IMG") { const box = e.target.closest(".bl-imgs"); return abrirVisor(box.srcs || [e.target.src], +e.target.dataset.n || 0); }
    const ir = e.target.closest("[data-ir]");
    if (ir) { irPara(ir.dataset.ir); return; }
    const acao = e.target.closest("[data-acao]")?.dataset.acao;
    const ix = acharIx(item.dataset.acc);
    const r = ix?.r;
    if (!r) return;
    if (acao === "fav") return anotar(r, { fav: !r.fav }).then(() => redesenhar(item));
    if (acao === "copiar") return copiar(r);
    if (acao === "editar") return editar(item, r);
    if (acao === "salvar") return salvar(item, r);
    if (acao === "cancelar") return abrir(item, true);
    if (acao === "frase") return guardarFrase(r);
    if (acao === "colecoes") return abrirColecoes(r);
    if (acao === "flashcard") return abrirFlashcardModal(r);
    if (acao === "enviarNota") return abrirEnviarNotaModal(r);
    if (acao === "revelar") { item.querySelector(".bl-conc").hidden = false; e.target.closest(".bl-esconde").remove(); return; }
    if (acao === "notion") return window.open(`https://www.notion.so/${String(r.notionPagina).replace(/-/g, "")}#${String(r.notionId).replace(/-/g, "")}`, "_blank");
    if (acao === "lixeira") { await moverParaLixeira([r]); item.remove(); msg(`Acesso ${r.accOriginal || r.acc} foi para a lixeira`); return; }
    if (acao === "restaurar") { await anotar(r, { lixeiraEm: 0 }); item.remove(); msg(`Acesso ${r.accOriginal || r.acc} restaurado`); return; }
    if (acao === "apagarDeVez") {
      if (!confirm(`Apagar de vez o acesso ${r.accOriginal || r.acc}?\n(sai de todos os aparelhos, do Drive e do banco da extensão; o Notion não muda)`)) return;
      await apagarDeVez([r]); item.remove(); msg(`Acesso ${r.accOriginal || r.acc} apagado de vez`); return;
    }
    if (e.target.closest(".bl-cab")) abrir(item);
  }, opt);

  $("lista").addEventListener("change", async (e) => {
    if (!e.target.matches("[data-nota]")) return;
    const r = acharIx(e.target.closest(".bl-item")?.dataset.acc)?.r;
    if (!r) return;
    await anotar(r, { nota: e.target.value.trim() });
    msg("Nota salva");
    const item = e.target.closest(".bl-item");
    const nota = item.querySelector(".bl-nota");
    if (nota) nota.textContent = e.target.value.trim() ? "📝 " + e.target.value.trim() : "";
  }, opt);

  $("lista").addEventListener("keydown", (e) => {
    if (!e.target.isContentEditable || !e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (k === "s" || k === "u") { e.preventDefault(); document.execCommand("underline"); }
    else if (k === "b") { e.preventDefault(); document.execCommand("bold"); }
    else if (k === "i") { e.preventDefault(); document.execCommand("italic"); }
  }, opt);
  $("fmt").addEventListener("mousedown", (e) => e.preventDefault(), opt);
  $("fmt").addEventListener("touchstart", (e) => { const b = e.target.closest("[data-fmt]"); if (b) { e.preventDefault(); document.execCommand(b.dataset.fmt); } }, { passive: false, signal });
  $("fmt").addEventListener("click", (e) => { const b = e.target.closest("[data-fmt]"); if (b) document.execCommand(b.dataset.fmt); }, opt);
  $("lista").addEventListener("focusin", (e) => {
    if (e.target.isContentEditable && matchMedia("(pointer: coarse)").matches) $("fmt").style.display = "flex";
    const el = e.target.closest?.("[data-campo]");
    if (el && el.dataset.orig == null) el.dataset.orig = el.innerHTML;
  }, opt);
  $("lista").addEventListener("focusout", async (e) => {
    setTimeout(() => { if (!document.activeElement?.isContentEditable && $("fmt")) $("fmt").style.display = "none"; }, 50);
    const el = e.target.closest?.("[data-campo]");
    if (!el || el.dataset.orig == null || el.innerHTML === el.dataset.orig) return;
    const item = el.closest(".bl-item");
    const r = acharIx(item?.dataset.acc)?.r;
    if (!r) return;
    el.dataset.orig = el.innerHTML;
    completar(r);
    let pars = r.pars || [], resumo = r.resumoManual ? r.resumo : "";
    if (el.dataset.campo === "resumo") resumo = el.textContent.trim();
    else pars = trocarConclusao(r, lerEditado(Object.assign(document.createElement("div"), { innerHTML: `<ol>${el.innerHTML}</ol>` })));
    await salvarEdicao(r, pars, resumo, el.dataset.campo === "conc" || aMao(r));
    msg(`Acesso ${r.accOriginal || r.acc} salvo`);
    item.querySelector(".bl-aberto").innerHTML = "";
  }, opt);

  $("facetas").addEventListener("click", async (e) => {
    const ap = e.target.closest("[data-apagarbusca]");
    if (ap) { e.stopPropagation(); if (confirm(`Apagar a busca salva "${ap.dataset.apagarbusca}"?`)) { P = await prefs.apagar("buscas", ap.dataset.apagarbusca); agendarSincronia(); buscar(); } return; }
    const b = e.target.closest("[data-busca]");
    if (b) { const s = P.buscas[b.dataset.busca]; if (s) { F = { ...PADRAO, ...s.f }; vista = "laudos"; buscar(); } return; }
    const c = e.target.closest(".bl-chip[data-g]");
    if (c) return ligarFaceta(c.dataset.g, c.dataset.v);
    const d = e.target.closest("[data-dd]");
    if (d) return abrirDD(d.dataset.dd);
    const lg = e.target.closest("[data-limpargrupo]");
    if (lg) { F.facetas[lg.dataset.limpargrupo] = []; return buscar(); }
    if (e.target.id === "bl_bLimparTudo") { F = { ...PADRAO, ordem: F.ordem }; ddAberto = ""; return buscar(); }
    if (e.target.id === "bl_bSalvarBusca") {
      const nome = prompt("Nome desta busca:", F.q || "Minha busca");
      if (!nome?.trim()) return;
      P = await prefs.mudar("buscas", nome.trim(), { f: { ...F } });
      agendarSincronia();
      buscar();
      msg(`Busca "${nome.trim()}" salva`);
    }
  }, opt);
  $("facetas").addEventListener("input", (e) => {
    if (!e.target.matches("[data-filtrardd]")) return;
    ddBusca = e.target.value;
    const q = normalizar(ddBusca);
    e.target.closest(".bl-pop").querySelectorAll(".bl-chip").forEach((c) => { c.hidden = !!q && !normalizar(c.dataset.v).includes(q); });
  }, opt);
  $("facetas").addEventListener("change", (e) => {
    if (e.target.id === "bl_fNormal") { F.normal = e.target.value; buscar(); }
    if (e.target.id === "bl_fDe" || e.target.id === "bl_fAte") {
      F.de = $("fDe").value; F.ate = $("fAte").value;
      F.periodo = F.de || F.ate ? "datas" : "";
      buscar();
    }
  }, opt);

  $("q").addEventListener("input", () => { F.q = $("q").value; clearTimeout(tempoBusca); tempoBusca = setTimeout(buscar, 300); }, opt);
  $("onde").addEventListener("change", () => { F.onde = $("onde").value; buscar(); }, opt);
  $("ordem").addEventListener("change", () => { F.ordem = $("ordem").value; buscar(); }, opt);
  raiz.querySelectorAll("[data-periodo]").forEach((b) => b.addEventListener("click", () => { F.periodo = b.dataset.periodo; F.de = F.ate = ""; buscar(); }, opt));
  $("pFav").addEventListener("click", () => { F.fav = !F.fav; buscar(); }, opt);
  $("pImg").addEventListener("click", () => { F.img = !F.img; buscar(); }, opt);
  $("pNota").addEventListener("click", () => { F.comNota = !F.comNota; buscar(); }, opt);
  $("bModo").addEventListener("click", () => { modoLista = modoLista === "cartoes" ? "exame" : "cartoes"; gravarLocal("app.modoLista", modoLista); buscar(); }, opt);
  $("faixa").addEventListener("click", async (e) => {
    const a = e.target.dataset.faixa;
    if (a === "sairLixeira") { vista = "laudos"; buscar(); }
    if (a === "sairEstudo") { estudo = false; gravarLocal("app.estudo", false); buscar(); }
    if (a === "esvaziar" && achados.length && confirm(`Apagar de vez os ${achados.length} laudo(s) da lixeira?`)) { await apagarDeVez(achados.map((x) => x.r)); buscar(); }
  }, opt);

  $("colLista").addEventListener("change", async (e) => {
    const n = e.target.dataset.col;
    if (!n || !colAlvo) return;
    const set = new Set(colAlvo.colecoes || []);
    e.target.checked ? set.add(n) : set.delete(n);
    await anotar(colAlvo, { colecoes: [...set] });
    colAlvo = acharIx(colAlvo.acc)?.r || colAlvo;
    const item = $("lista").querySelector(`.bl-item[data-acc="${CSS.escape(colAlvo.acc)}"]`);
    if (item) redesenhar(item);
  }, opt);
  $("colCriar").addEventListener("click", async () => {
    const n = $("colNova").value.trim();
    if (!n) return;
    P = await prefs.mudar("colecoes", n, {});
    $("colNova").value = "";
    if (colAlvo) { await anotar(colAlvo, { colecoes: [...new Set([...(colAlvo.colecoes || []), n])] }); colAlvo = acharIx(colAlvo.acc)?.r || colAlvo; abrirColecoes(colAlvo); }
    const item = colAlvo && $("lista").querySelector(`.bl-item[data-acc="${CSS.escape(colAlvo.acc)}"]`);
    if (item) redesenhar(item);
  }, opt);

  $("fcSalvar").addEventListener("click", () => {
    const f = $("fcFrente").value.trim(), v = $("fcVerso").value.trim(), tg = $("fcTags").value.trim();
    if (!f || !v) return msg("Preencha frente e verso do flashcard");
    host.criarFlashcard?.({ f, v, tg });
    $("dFlashcard").close();
    msg("Flashcard criado!");
  }, opt);

  $("ntConfirmar").addEventListener("click", async () => {
    if (!notaAlvo) return;
    const paginaId = $("ntDestino").value;
    const tituloToggle = $("ntTituloToggle").value.trim();
    if (!paginaId || !tituloToggle) return;
    const { r } = notaAlvo;
    const linhas = (r.pars || []).map((p) => textoDoParagrafo(p)).filter(Boolean);
    await host.enviarParaNota?.(paginaId, { tituloToggle, linhas });
    $("dNota").close();
    msg("Laudo enviado para a nota!");
  }, opt);

  $("fBusca").addEventListener("input", desenharFrases, opt);
  $("frases").addEventListener("click", async (e) => {
    const c = e.target.closest("[data-copiar]");
    if (c) { try { await navigator.clipboard.writeText(P.frases[c.dataset.copiar].texto); msg("Frase copiada"); c.style.opacity = 0.5; setTimeout(() => (c.style.opacity = 1), 400); } catch {} return; }
    const a = e.target.closest("[data-apagarfrase]");
    if (a && confirm("Apagar esta frase?")) { P = await prefs.apagar("frases", a.dataset.apagarfrase); agendarSincronia(); desenharFrases(); }
  }, opt);
  $("fSalvar").addEventListener("click", async () => {
    const t = $("fNova").value.trim();
    if (!t) return;
    P = await prefs.mudar("frases", "f" + Date.now().toString(36), { texto: t });
    $("fNova").value = "";
    agendarSincronia();
    desenharFrases();
  }, opt);

  $("estat").addEventListener("click", (e) => {
    const c = e.target.closest("[data-g]");
    if (c) { $("dEstat").close(); ligarFaceta(c.dataset.g, c.dataset.v, true); }
  }, opt);

  $("bMenu").addEventListener("click", () => {
    $("mEstudo").textContent = estudo ? "ligado" : "desligado";
    const nl = todos.filter((ix) => ix.r.lixeiraEm).length;
    $("mLixeira").textContent = nl ? `${nl}` : "";
    $("menu").showModal();
  }, opt);
  $("menu").addEventListener("click", async (e) => {
    const m = e.target.closest("[data-menu]")?.dataset.menu;
    if (!m) return;
    $("menu").close();
    if (m === "estudo") { estudo = !estudo; gravarLocal("app.estudo", estudo); buscar(); }
    if (m === "estatisticas") { desenharEstat(); $("dEstat").showModal(); }
    if (m === "frases") { desenharFrases(); $("dFrases").showModal(); }
    if (m === "csv") exportarCsv();
    if (m === "pdf") exportarPdf();
    if (m === "lixeira") { vista = "lixeira"; buscar(); }
    if (m === "filtradosLixeira") {
      const n = achados.length;
      if (!n || vista === "lixeira") return msg("Nenhum laudo na busca atual");
      if (!confirm(`Mover os ${n} laudo(s) da busca atual para a lixeira?\n(dá para restaurar por ${LIXEIRA_DIAS} dias)`)) return;
      await moverParaLixeira(achados.map((x) => x.r));
      msg(`${n} laudo(s) na lixeira`);
      buscar();
    }
    if (m === "refazer") refazerResumos(true);
    if (m === "atalhos") $("dAtalhos").showModal();
    if (m === "config") abrirConfig();
  }, opt);

  $("bSync").addEventListener("click", () => sincronizarTudo({ manual: true }), opt);
  $("oResumo").addEventListener("change", () => { MOSTRAR_RESUMO = $("oResumo").checked; gravarLocal("app.mostrarResumo", MOSTRAR_RESUMO); buscar(); }, opt);
  $("oCliente").addEventListener("change", () => {
    const v = $("oCliente").value.trim();
    gravarLocal("app.clienteId", v);
    drive.configurar(v || CONFIG.clienteId);
    drive.prepararLogin();
    estadoNuvem();
  }, opt);
  $("oConectar").addEventListener("click", async () => {
    try { await drive.conectar(); $("dOpcoes").close(); sincronizarTudo({ manual: true }); }
    catch (e) { alert("Não conectou: " + e.message); }
  }, opt);
  $("oDesconectar").addEventListener("click", () => { drive.desconectar(); $("dOpcoes").close(); estadoNuvem(); msg("Desconectado do Google Drive"); }, opt);

  document.addEventListener("keydown", (e) => {
    if (!rootEl.isConnected || visorAberto() || raiz.querySelector("dialog[open]")) return;
    const digitando = e.target.matches?.("input, textarea, select") || e.target.isContentEditable;
    if (e.key === "Escape") { if (digitando) e.target.blur(); else selecionar(null); return; }
    if (digitando || e.ctrlKey || e.metaKey || e.altKey) return;
    const itens = [...$("lista").querySelectorAll(".bl-item")];
    const atual = $("lista").querySelector(".bl-item.sel");
    const i = itens.indexOf(atual);
    const r = atual && acharIx(atual.dataset.acc)?.r;
    const k = e.key;
    if (k === "/") { e.preventDefault(); $("q").focus(); $("q").select(); }
    else if (k === "j") { selecionar(itens[Math.min(itens.length - 1, i + 1)]); if (i + 1 >= itens.length - 2 && mostrando < achados.length) mostrarMais(); }
    else if (k === "k") selecionar(itens[Math.max(0, i - 1)]);
    else if (k === "Enter" && atual) abrir(atual);
    else if (k === "f" && r) anotar(r, { fav: !r.fav }).then(() => selecionar(redesenhar(atual), false));
    else if (k === "e" && r) editar(atual, r);
    else if (k === "c" && r) copiar(r);
    else if (k === "?") $("dAtalhos").showModal();
    else return;
    e.preventDefault();
  }, opt);

  aoChegarNovos(() => { sincronizarTudo(); });

  estadoNuvem();
  await carregar();
  await esvaziarVencidos();
  await buscar();
  await refazerResumos(false);
  sincronizarTudo();
  intervaloSync = setInterval(() => { if (document.visibilityState === "visible") sincronizarTudo(); }, 5 * 60e3);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sincronizarTudo(); }, opt);
}
