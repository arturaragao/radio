// Banco CBR (app) — ponte entre o código do artefato e o GitHub.
// - Questões: dados/questoes.json do repo privado (cache no aparelho, só baixa de novo se mudar).
// - Progresso: substitui o banco do artefato (claude.use('db')) por arquivos progresso/<doc>.json no repo privado.
// - IA: substitui claude.use('sample') pelo Gemini (chave do aparelho).
// - Imagens: o service worker (sw.js) serve ./img/<arquivo> lendo do repo com a chave.
(function () {
  const REPO = "arturaragao/banco-cbr-app", API = "https://api.github.com";
  const LS = { tk: "bcbr_gh_token", gm: "bcbr_gemini_key", gmModelo: "bcbr_gemini_modelo", off: "bcbr_offline" };
  const tok = () => localStorage.getItem(LS.tk) || "";
  const offlineAtivo = () => { try { return localStorage.getItem(LS.off) === "1"; } catch (e) { return false; } };
  const fmtHora = (ms) => { const d = new Date(ms); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  window.BCBR = { REPO, pausaAte: 0, limiteMsg: "", chaveErro: "", chaveErroStatus: 0, chaveErroToken: "", semRede: false, ultimoConflitoEm: 0, fmtHora };
  const ehLimite = (st, h, resp) => st === 429 || (st === 403 && (h?.get?.("x-ratelimit-remaining") === "0" || window.BCBR.cota?.rest === 0 || !!h?.get?.("retry-after") || /rate.?limit|secondary|abuse|limite|too many|wait a few/i.test(resp || "")));
  const calculaEspera = (h) => {
    const ra = h?.get?.("retry-after");
    if (ra) {
      const seg = Number(ra); if (Number.isFinite(seg) && seg > 0) return seg * 1000;
      const dt = Date.parse(ra); if (Number.isFinite(dt) && dt > Date.now()) return dt - Date.now();
    }
    const rst = Number(h?.get?.("x-ratelimit-reset") || 0);
    if (Number.isFinite(rst) && rst > 0) { const ms = rst * 1000 - Date.now() + 1000; if (ms > 0) return ms; }
    return 60000;
  };
  let configAberta = false, carregamentoPendente = false, recusada = "", aguardando401 = "";
  const aba = Math.random().toString(36).slice(2);
  const avisaSyncEstado = () => {
    try { window.RadioFila?.atualizaUI?.(); } catch (e) {}
    try { if (typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") window.dispatchEvent(new CustomEvent("bcbr-sync-estado")); } catch (e) {}
  };
  window.BCBR.limpaChaveErro = () => {
    window.BCBR.chaveErro = ""; window.BCBR.chaveErroStatus = 0; window.BCBR.chaveErroToken = "";
    recusada = ""; aguardando401 = "";
    avisaSyncEstado();
  };
  // Recupera a cópia já usada pelo SW nas versões anteriores, sem apagar nenhuma chave.
  async function recuperarChave() {
    if (tok()) return;
    try {
      const c = await caches.open("bcbr-cfg"), r = await c.match("./__token");
      const antiga = r && (await r.text()).trim();
      if (antiga && !tok()) localStorage.setItem(LS.tk, antiga);
    } catch (e) {}
  }
  async function credencialRecusada(chave) {
    if (!chave || chave !== tok() || recusada === chave) return;
    aguardando401 = chave;
    if (document.visibilityState !== "visible") return;
    const mostrar = () => {
      if (chave !== tok() || recusada === chave) return;
      const k = "bcbr_auth_aviso";
      let aviso; try { aviso = JSON.parse(localStorage.getItem(k) || "null"); } catch (e) {}
      if (aviso && aviso.aba !== aba && Date.now() - aviso.em < 60000) return;
      localStorage.setItem(k, JSON.stringify({ aba, em: Date.now() }));
      recusada = chave; aguardando401 = "";
      telaConfig("O GitHub respondeu 401: a credencial foi recusada. Salve uma chave válida.");
    };
    if (navigator.locks) {
      try {
        if (typeof AbortController === "function" && typeof setTimeout === "function") {
          const ac = new AbortController();
          const tm = setTimeout(() => ac.abort(), 3000);
          tm?.unref?.();
          await navigator.locks.request("bcbr-login", { signal: ac.signal }, () => { clearTimeout(tm); mostrar(); });
        } else {
          await navigator.locks.request("bcbr-login", mostrar);
        }
      } catch (e) { mostrar(); }
    } else mostrar();
  }
  document.addEventListener("visibilitychange", () => { if (aguardando401 && document.visibilityState === "visible") credencialRecusada(aguardando401); });
  window.addEventListener("storage", (e) => {
    if (e.key !== LS.tk || !e.newValue) return;
    window.BCBR.limpaChaveErro(); passarChaveSW();
    if (configAberta || carregamentoPendente) location.reload();
    else window.RadioFila?.tentarAgora?.("chave");
  });

  // ---------- tela de configuração (1x por aparelho) ----------
  function telaConfig(msg) {
    configAberta = true;
    document.getElementById("app").innerHTML = `<div class="card" style="max-width:560px;margin:24px auto">
      <h2>Radio — configurar este aparelho</h2>
      <p class="mut">Uma vez por aparelho. As chaves ficam só aqui.</p>
      ${msg ? `<p style="color:var(--bad)">${msg}</p>` : ""}
      <label style="display:block;margin-top:10px"><b>Chave do GitHub</b> (fine-grained, repositório <b>banco-cbr-app</b>, Contents: Read and write)
        <input id="cf_tk" type="password" style="width:100%" value="${tok()}"></label>
      <label style="display:block;margin-top:10px"><b>Chave do Gemini</b> (opcional: para o botão de comentário com IA)
        <input id="cf_gm" type="password" style="width:100%" value="${localStorage.getItem(LS.gm) || ""}"></label>
      <label style="display:block;margin-top:10px"><b>Chave dos laudos</b> (opcional: fine-grained, repositório <b>laudos-tutu-dados</b>, Contents: Read-only; usada só na página Preliminares)
        <input id="cf_dk" type="password" style="width:100%" value="${localStorage.getItem("bcbr_gh_token_dados") || ""}"></label>
      <div class="row" style="margin-top:14px"><button class="b" id="cf_ok">Salvar e abrir</button></div></div>`;
    document.getElementById("cf_ok").onclick = async () => {
      localStorage.setItem(LS.tk, document.getElementById("cf_tk").value.trim());
      localStorage.setItem(LS.gm, document.getElementById("cf_gm").value.trim());
      localStorage.setItem("bcbr_gh_token_dados", document.getElementById("cf_dk").value.trim());
      localStorage.removeItem("bcbr_auth_aviso");
      await passarChaveSW(); location.reload();
    };
  }
  window.BCBR.config = telaConfig;

  async function api(path, opt = {}) {
    if ((window.BCBR.pausaAte || 0) > Date.now()) {
      const ate = window.BCBR.pausaAte, msg = window.BCBR.limiteMsg || ("Limite do GitHub, tenta às " + fmtHora(ate));
      throw Object.assign(new Error(msg), { status: 429, limite: true, ate });
    }
    const chave = tok();
    let r;
    try { r = await fetch(API + path, {
      ...opt, cache: "no-store",
      headers: { Authorization: "Bearer " + chave, Accept: opt.accept === "raw" ? "application/vnd.github.raw" : opt.accept || "application/vnd.github+json", ...(opt.body ? { "Content-Type": "application/json" } : {}), ...(opt.etag ? { "If-None-Match": opt.etag } : {}) },
    }); } catch (e) { window.BCBR.semRede = true; avisaSyncEstado(); throw e; }   // 1.42: falha de rede (mesmo com navigator.onLine verdadeiro) alimenta o indicador offline
    window.BCBR.semRede = false;
    // 1.40: cota do GitHub (BCBR.cota) para o ciclo rápido da Semana/Notas voltar a 90 s se faltar; opt.etag = GET condicional (304 não gasta cota).
    const rest = r.headers?.get?.("x-ratelimit-remaining");
    if (rest != null) window.BCBR.cota = { rest: +rest, reset: +r.headers?.get?.("x-ratelimit-reset") || 0 };
    if (r.status === 304) { window.BCBR.pausaAte = 0; window.BCBR.limiteMsg = ""; window.BCBR.chaveErro = ""; window.BCBR.chaveErroStatus = 0; window.BCBR.chaveErroToken = ""; return { naoMudou: true }; }
    if (r.status === 401) {
      window.BCBR.chaveErro = "Chave do GitHub inválida ou vencida (401)";
      window.BCBR.chaveErroStatus = 401;
      window.BCBR.chaveErroToken = chave;
      if (!window.BCBR_APP_ATIVO) await credencialRecusada(chave);
      else avisaSyncEstado();
      throw Object.assign(new Error("chave"), { chave: true, status: 401 });
    }
    if (!r.ok) {
      const resp = await r.text().catch(() => "");
      if (ehLimite(r.status, r.headers, resp)) {
        const ate = Math.max(window.BCBR.pausaAte || 0, Date.now() + calculaEspera(r.headers));
        const msg = "Limite do GitHub, tenta às " + fmtHora(ate);
        window.BCBR.pausaAte = ate; window.BCBR.limiteMsg = msg;
        avisaSyncEstado();
        throw Object.assign(new Error(msg), { status: r.status, resp, limite: true, ate });
      }
      if (r.status === 403) {
        window.BCBR.chaveErro = "Chave do GitHub sem permissão ou vencida (403)";
        window.BCBR.chaveErroStatus = 403;
        window.BCBR.chaveErroToken = chave;
        avisaSyncEstado();
        throw Object.assign(new Error("chave"), { chave: true, status: 403, resp });
      }
      throw Object.assign(new Error("GitHub " + r.status), { status: r.status, resp });
    }
    window.BCBR.pausaAte = 0; window.BCBR.limiteMsg = "";
    window.BCBR.chaveErro = ""; window.BCBR.chaveErroStatus = 0; window.BCBR.chaveErroToken = "";
    if (opt.etag !== undefined) { const j = await r.json(); j.etag = r.headers?.get?.("etag") || ""; return j; }
    return opt.accept === "raw" ? r : r.json();
  }
  const raw = (sha) => api(`/repos/${REPO}/git/blobs/${sha}`, { accept: "raw" }).then(r => r.text());
  const rawItem = async (f) => {
    if (f && f.download_url) {
      try { const r = await fetch(f.download_url, { cache: "no-store" }); if (r.ok) return r.text(); } catch (e) {}
    }
    return raw(f.sha);
  };
  const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
  Object.assign(window.BCBR, { api, raw, b64 });   // usados pela aba Semana (build/semana.js)

  // ---------- cache simples em IndexedDB ----------
  const IDB_MS = 2500;
  const idb = new Promise((ok, no) => {
    if (typeof indexedDB === "undefined") { window.BCBR.idbIndisponivel = true; return no(new Error("sem idb")); }
    let fim = false;
    const encerra = (fn, v, indisp) => {
      if (fim) return; fim = true;
      if (tm && typeof clearTimeout === "function") clearTimeout(tm);
      if (indisp) { window.BCBR.idbIndisponivel = true; avisaSyncEstado(); }
      fn(v);
    };
    const tm = typeof setTimeout === "function" ? setTimeout(() => encerra(no, new Error("idb timeout"), true), IDB_MS) : null;
    if (typeof tm?.unref === "function") tm.unref();
    try {
      const r = indexedDB.open("bcbr", 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames?.contains?.("kv")) r.result.createObjectStore("kv"); };
      r.onsuccess = () => {
        const d = r.result;
        if (d) d.onversionchange = () => { try { d.close?.(); } catch (e) {} };
        if (fim) { try { d?.close?.(); } catch (e) {} return; }
        encerra(ok, d, false);
      };
      r.onerror = () => encerra(no, r.error || new Error("idb erro"), true);
      r.onblocked = () => encerra(no, new Error("idb bloqueado"), true);
    } catch (e) { encerra(no, e, true); }
  });
  idb.catch(() => {});
  const kvGet = (k) => idb.then((d) => new Promise((ok) => {
    let fim = false;
    const done = (v) => { if (fim) return; fim = true; if (tm && typeof clearTimeout === "function") clearTimeout(tm); ok(v); };
    const tm = typeof setTimeout === "function" ? setTimeout(() => done(undefined), IDB_MS) : null;
    if (typeof tm?.unref === "function") tm.unref();
    try {
      const tx = d.transaction("kv");
      const req = tx.objectStore("kv").get(k);
      req.onsuccess = () => done(req.result);
      req.onerror = () => done(undefined);
      tx.onabort = tx.onerror = () => done(undefined);
    } catch (e) { done(undefined); }
  })).catch(() => undefined);
  const kvSet = (k, v) => idb.then((d) => new Promise((ok) => {
    let fim = false;
    const done = () => { if (fim) return; fim = true; if (tm && typeof clearTimeout === "function") clearTimeout(tm); ok(); };
    const tm = typeof setTimeout === "function" ? setTimeout(done, IDB_MS) : null;
    if (typeof tm?.unref === "function") tm.unref();
    try {
      const tx = d.transaction("kv", "readwrite");
      tx.objectStore("kv").put(v, k);
      tx.oncomplete = tx.onerror = tx.onabort = done;
    } catch (e) { done(); }
  })).catch(() => {});

  async function passarChaveSW() {
    if (!tok()) return;
    try { const c = await caches.open("bcbr-cfg"); await c.put("./__token", new Response(tok())); } catch (e) {}
  }

  // ---------- questões ----------
  const limpa = (s) => String(s ?? "").replace(/<span[^>]*>\s*\[\*?🖼[^\]]*\]\([^)]*\)\s*<\/span>/g, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\n{3,}/g, "\n\n").trim();
  function adaptar(U) {
    return U.filter((u) => u.alts && Object.keys(u.alts).length).map((u) => ({
      id: u.id, n: u.n, grupo: null, enunciado: limpa(u.enunciado),
      alts: Object.fromEntries(Object.entries(u.alts).map(([k, v]) => [k, limpa(v)])), gab: u.gab || null,
      coment: (u.claude && u.claude.coment) || {}, ponto: (u.claude && u.claude.ponto) || "",
      tags: Array.isArray(u.tags) ? u.tags : [],
      imgs: (u.imgs || []).filter((f) => !f.startsWith("images/")).map((f) => "gh:" + f),
      imgsCom: (u.imgsCom || []).filter((f) => !f.startsWith("images/")).map((f) => "gh:" + f),
      acerto: u.acerto ?? null, ar: u.ar || undefined, cl: u.cl || [], dif: u.dif || null,
      pr_stats: u.pr_stats || null, dif_pr: u.dif_pr || null, dificuldade_site: u.dificuldade_site ?? null,
      pr_qualidade: u.pr_qualidade || null, pr_tags: u.pr_tags || {}, pr_video: u.pr_video ?? null, pr_prova: u.pr_prova || {},
      curso: u.curso || null, claudeMd: u.claude_md_suspeito ? "" : (u.claude_md || ""), chegou: u.chegou || null, classif: u.classif || null, origem: u.origem || null, legendas: u.legendas || [], legendasCom: u.legendasCom || [],
    }));
  }
  // fundo=true: o app já abriu com a cópia do aparelho; só baixa o que mudou e guarda (vale ao recarregar). Devolve true se mudou.
  async function carregarDados(fundo) {
    const lista = await api(`/repos/${REPO}/contents/dados`);
    const item = Object.fromEntries(lista.map((f) => [f.name, f]));
    const sha = Object.fromEntries(lista.map((f) => [f.name, f.sha]));
    const lerTxt = (f) => (typeof rawItem === "function" ? rawItem(f) : raw(f.sha));
    let mudou = false;
    const pegar = async (nome) => {
      const c = await kvGet("f:" + nome);
      if (c && c.sha === sha[nome]) return c.txt;
      const txt = await lerTxt(item[nome]); mudou = true; await kvSet("f:" + nome, { sha: sha[nome], txt }); return txt;
    };
    const metodos = async () => {
      if (sha["metodos.json"]) return pegar("metodos.json");
      // Apaga a cópia antiga se o arquivo deixou de existir no repositório.
      if (await kvGet("f:metodos.json")) { await kvSet("f:metodos.json", null); mudou = true; }
      return "";
    };
    const opcional = async (nome) => {
      if (sha[nome]) return pegar(nome);
      if (await kvGet("f:" + nome)) { await kvSet("f:" + nome, null); mudou = true; }
      return "";
    };
    // 1.52.0 / 1.63.0 / 1.65.0: resumos/indice.json, resumos/fundidos.json e flashcards/questoes.json (pastas próprias, opcionais). Sem o arquivo (404), segue sem erro.
    const pastaArquivos = async (pasta, arquivos) => {
      let lista = [];
      let falhou = false;
      try { lista = await api(`/repos/${REPO}/contents/${pasta}`); }
      catch (e) { if (e.chave) throw e; if (e.status !== 404) falhou = true; }
      return Promise.all(arquivos.map(async ([arquivo, cacheKey]) => {
        if (falhou) { const c = await kvGet(cacheKey); return c ? c.txt : ""; }
        const fRaw = Array.isArray(lista) && lista.find((x) => x.name === arquivo && (!x.path || x.path === pasta + "/" + arquivo));
        const f = fRaw && (!fRaw.path && sha[arquivo] && fRaw.sha === sha[arquivo]) ? null : fRaw;
        if (!f) { if (await kvGet(cacheKey)) { await kvSet(cacheKey, null); mudou = true; } return ""; }
        const c = await kvGet(cacheKey);
        if (c && c.sha === f.sha) return c.txt;
        const txt = await lerTxt(f); mudou = true; await kvSet(cacheKey, { sha: f.sha, txt }); return txt;
      }));
    };
    const lerResumos = (t) => { try { const j = t ? JSON.parse(t) : null; return Array.isArray(j) ? j : null; } catch (e) { return null; } };
    const lerFundidos = (t) => {
      try {
        const j = t ? JSON.parse(t) : null;
        if (!j || typeof j !== "object" || Array.isArray(j)) return null;
        return j.fundidos && typeof j.fundidos === "object" && !Array.isArray(j.fundidos) ? j.fundidos : j;
      } catch (e) { return null; }
    };
    const lerFcQuestoes = (t) => { try { const j = t ? JSON.parse(t) : null; return j && Array.isArray(j.cards) ? j : (Array.isArray(j) ? { v: 1, cards: j } : null); } catch (e) { return null; } };
    const [q, m, mt, tax, sim, resArr, fqArr] = await Promise.all([
      pegar("questoes.json"),
      sha["metodologia.md"] ? pegar("metodologia.md") : "",
      metodos(),
      opcional("taxonomia-pr.json"),
      opcional("simulados-pr.json"),
      pastaArquivos("resumos", [["indice.json", "f:resumos-indice.json"], ["fundidos.json", "f:resumos-fundidos.json"]]),
      pastaArquivos("flashcards", [["questoes.json", "f:flashcards-questoes.json"]]),
    ]);
    const [rs, rf] = resArr, [fq] = fqArr;
    if (!fundo) {
      window.RESUMOS_IDX = lerResumos(rs);
      window.RESUMOS_FUNDIDOS = lerFundidos(rf);
      window.FC_QUESTOES = lerFcQuestoes(fq);
      window.QUESTOES = adaptar(JSON.parse(q));
      window.METODO = m;
      window.METODOS_DADOS = mt ? JSON.parse(mt) : null;
      window.TAXONOMIA_PR = tax ? JSON.parse(tax) : null;
      window.SIMULADOS_PR = sim ? JSON.parse(sim) : null;
    }
    return mudou;
  }
  async function dadosDoCache() {
    const q = await kvGet("f:questoes.json"), m = await kvGet("f:metodologia.md"), mt = await kvGet("f:metodos.json");
    if (!q) return false;
    const tax = await kvGet("f:taxonomia-pr.json"), sim = await kvGet("f:simulados-pr.json"), rs = await kvGet("f:resumos-indice.json"), rf = await kvGet("f:resumos-fundidos.json"), fq = await kvGet("f:flashcards-questoes.json");
    try { const j = rs && rs.txt ? JSON.parse(rs.txt) : null; window.RESUMOS_IDX = Array.isArray(j) ? j : null; } catch (e) { window.RESUMOS_IDX = null; }
    try {
      const j = rf && rf.txt ? JSON.parse(rf.txt) : null;
      window.RESUMOS_FUNDIDOS = j && typeof j === "object" && !Array.isArray(j) ? (j.fundidos && typeof j.fundidos === "object" && !Array.isArray(j.fundidos) ? j.fundidos : j) : null;
    } catch (e) { window.RESUMOS_FUNDIDOS = null; }
    try { const j = fq && fq.txt ? JSON.parse(fq.txt) : null; window.FC_QUESTOES = j && Array.isArray(j.cards) ? j : (Array.isArray(j) ? { v: 1, cards: j } : null); } catch (e) { window.FC_QUESTOES = null; }
    window.QUESTOES = adaptar(JSON.parse(q.txt)); window.METODO = m ? m.txt : ""; window.METODOS_DADOS = mt ? JSON.parse(mt.txt) : null; window.TAXONOMIA_PR = tax ? JSON.parse(tax.txt) : null; window.SIMULADOS_PR = sim ? JSON.parse(sim.txt) : null; return true;
  }

  // ---------- progresso: o "banco" do artefato vira arquivos no GitHub ----------
  const docs = new Map(), shas = new Map(), qDocs = new Map();   // id -> dados, id -> sha, id -> rev pendente na fila
  let fila = Promise.resolve(), outboxFila = Promise.resolve(), ouvintes = [];
  const avisar = () => { const s = { docs: [...docs].map(([id, d]) => ({ id, data: () => d })) }; ouvintes.forEach((o) => o.cb(s)); };
  const decB64 = (s) => decodeURIComponent(escape(atob(String(s).replace(/\n/g, ""))));

  function mergeProgressoDoc(id, local, rem) {
    if (!rem || typeof rem !== "object") return local;
    if (!local || typeof local !== "object") return rem;
    if (id.startsWith("log_")) {
      const mp = new Map();
      const poe = (a) => {
        if (!Array.isArray(a)) return;
        const k = a[0] + "|" + a[1], prev = mp.get(k);
        if (!prev) mp.set(k, a.slice());
        else if (a[6] && !prev[6]) prev[6] = 1;
      };
      (rem.items || []).forEach(poe);
      (local.items || []).forEach(poe);
      return { items: [...mp.values()].sort((a, b) => (a[1] || 0) - (b[1] || 0)) };
    }
    if (id.startsWith("cards_")) {
      const mp = new Map();
      (rem.items || []).forEach((a) => { if (Array.isArray(a) && a[0]) mp.set(a[0], a.slice()); });
      (local.items || []).forEach((a) => {
        if (!Array.isArray(a) || !a[0]) return;
        const p = mp.get(a[0]);
        if (!p || (a[4] || 0) >= (p[4] || 0)) mp.set(a[0], a.slice());
      });
      return { items: [...mp.values()] };
    }
    if (id.startsWith("fcs_")) {
      const s = { ...(rem.s || {}) };
      Object.entries(local.s || {}).forEach(([k, v]) => {
        const ex = s[k];
        if (!ex || (v && (v[5] || 0) >= (ex[5] || 0))) s[k] = v;
      });
      return { s };
    }
    if (id === "fc_avaliacoes") {
      const items = { ...(rem.items || {}) };
      Object.entries(local.items || {}).forEach(([k, v]) => {
        const ex = items[k];
        if (v && (!ex || (v.u || 0) >= (ex.u || 0))) items[k] = v;
      });
      return { items };
    }
    if (id.startsWith("pon_") || id.startsWith("ia_")) {
      const m = { ...(rem.m || {}) };
      Object.entries(local.m || {}).forEach(([k, v]) => {
        const ex = m[k];
        if (v && (!ex || (v.u || 0) >= (ex.u || 0))) m[k] = v;
      });
      return { m };
    }
    if (id === "metodo") return (local.u || 0) >= (rem.u || 0) ? local : rem;
    if (id.startsWith("uimg_")) return local.d ? local : rem;
    if (id === "estado") {
      const lWins = (local.u || 0) >= (rem.u || 0);
      const resetAt = Math.max(local.resetAt || 0, rem.resetAt || 0);
      const u = Math.max(local.u || 0, rem.u || 0);
      const over = lWins ? { ...(rem.over || {}), ...(local.over || {}) } : { ...(local.over || {}), ...(rem.over || {}) };
      const lc = local.cfg || {}, rc = rem.cfg || {};
      const cfg = JSON.parse(JSON.stringify(lWins ? lc : rc));
      const mor = { ...(rc.fcMortos || {}) };
      Object.entries(lc.fcMortos || {}).forEach(([k, v]) => { if (!(mor[k] >= v)) mor[k] = v; });
      cfg.fcMortos = Object.fromEntries(Object.entries(mor).sort((a, b) => b[1] - a[1]).slice(0, 100));
      const bUlt = (b) => Math.max(b.u || 0, ...Object.values(b.resp || {}).map((r) => (r && r.t) || 0));
      const bm = new Map();
      (rc.fcBlocos || []).forEach((b) => { if (b && b.id && Array.isArray(b.ids)) bm.set(b.id, b); });
      (lc.fcBlocos || []).forEach((b) => {
        if (!b || !b.id || !Array.isArray(b.ids)) return;
        const a = bm.get(b.id);
        if (!a) { bm.set(b.id, b); return; }
        if ((b.t0 || 0) > (a.t0 || 0)) { bm.set(b.id, b); return; }
        if ((a.t0 || 0) > (b.t0 || 0)) return;
        const resp = { ...(a.resp || {}) };
        Object.entries(b.resp || {}).forEach(([k, v]) => { if (!resp[k] || (v && (v.t || 0) > (resp[k].t || 0))) resp[k] = v; });
        const bMais = (b.u || 0) >= (a.u || 0);
        bm.set(b.id, { ...(bMais ? b : a), ids: [...new Set([...((bMais ? b.ids : a.ids) || []), ...((bMais ? a.ids : b.ids) || [])])], resp, u: Math.max(a.u || 0, b.u || 0) });
      });
      cfg.fcBlocos = [...bm.values()].filter((b) => !(cfg.fcMortos[b.id] >= bUlt(b)));
      if (lc.fcHoje && rc.fcHoje && lc.fcHoje.d === rc.fcHoje.d) {
        cfg.fcHoje = { d: lc.fcHoje.d, feitos: [...new Set([...(rc.fcHoje.feitos || []), ...(lc.fcHoje.feitos || [])])] };
      } else if (lc.fcHoje && (!rc.fcHoje || lc.fcHoje.d > rc.fcHoje.d)) {
        cfg.fcHoje = lc.fcHoje;
      } else if (rc.fcHoje) {
        cfg.fcHoje = rc.fcHoje;
      }
      if (lc.ri && rc.ri && lc.ri.d === rc.ri.d && Array.isArray(lc.ri.ids) && Array.isArray(rc.ri.ids)) {
        cfg.ri = { ...lc.ri, meta: Math.max(lc.ri.meta || 0, rc.ri.meta || 0), ids: [...new Set([...lc.ri.ids, ...rc.ri.ids])] };
      } else if (lc.ri && (!rc.ri || String(lc.ri.d || "") > String(rc.ri.d || ""))) {
        cfg.ri = lc.ri;
      } else if (rc.ri) {
        cfg.ri = rc.ri;
      }
      if (Array.isArray(lc.ests) || Array.isArray(rc.ests)) {
        const em = new Map();
        (rc.ests || []).forEach((e) => { if (e && e.id) em.set(e.id, e); });
        (lc.ests || []).forEach((e) => { if (e && e.id && (!em.has(e.id) || (e.u || 0) >= (em.get(e.id).u || 0))) em.set(e.id, e); });
        cfg.ests = [...em.values()];
      }
      return { over, cfg, u, resetAt };
    }
    return { ...rem, ...local };
  }

  function salvaOutboxIdb(id, data, rev) {
    outboxFila = outboxFila.then(async () => {
      await kvSet("q:p:" + id, { id, d: data, rev, t: Date.now() });
      const idx = (await kvGet("q:p_idx")) || [];
      const arr = Array.isArray(idx) ? idx : [];
      if (!arr.includes(id)) await kvSet("q:p_idx", [...arr, id]);
    }).catch(() => {});
    return outboxFila;
  }
  function removeOutboxIdb(id, rev) {
    outboxFila = outboxFila.then(async () => {
      if (qDocs.get(id) !== rev) return;
      qDocs.delete(id);
      await kvSet("q:p:" + id, null);
      const idx = (await kvGet("q:p_idx")) || [];
      if (Array.isArray(idx) && idx.includes(id)) await kvSet("q:p_idx", idx.filter((x) => x !== id));
    }).catch(() => {});
    return outboxFila;
  }

  async function gravarDoc(id, data) {
    const rev = Date.now() + Math.random();
    docs.set(id, data);
    qDocs.set(id, rev);
    await salvaOutboxIdb(id, data, rev);
    const tarefa = async () => {
      let atual = docs.get(id) || data;
      let teveConflito = false;
      for (let t = 1; t <= 5; t++) {
        try {
          const body = { message: "progresso: " + id, content: b64(JSON.stringify(atual)), branch: "main" };
          if (shas.get(id)) body.sha = shas.get(id);
          const r = await api(`/repos/${REPO}/contents/progresso/${id}.json`, { method: "PUT", body: JSON.stringify(body) });
          if (!r?.content?.sha) throw new Error("GitHub não confirmou sha");
          shas.set(id, r.content.sha);
          docs.set(id, atual);
          await kvSet("p:" + id, { sha: r.content.sha, d: atual });
          await removeOutboxIdb(id, rev);
          if (teveConflito) {
            window.BCBR.ultimoConflitoEm = Date.now();
            try { window.RadioFila?.marcaConflitoResolvido?.("Progresso (" + id + ")"); } catch (e2) {}
            avisar();
          }
          return;
        } catch (e) {
          if (e.status === 409 || e.status === 422) {
            teveConflito = true;
            try {
              const f = await api(`/repos/${REPO}/contents/progresso/${id}.json`);
              shas.set(id, f.sha);
              let remTxt = "";
              if (f.encoding === "none" || (!f.content && f.size > 0)) remTxt = await raw(f.sha);
              else if (f.content) remTxt = decB64(f.content);
              if (remTxt) {
                const rem = JSON.parse(remTxt);
                atual = mergeProgressoDoc(id, atual, rem);
                docs.set(id, atual);
              }
            } catch (e2) { if (e2 && e2.status === 404) shas.delete(id); else throw e2; }
            continue;
          }
          throw e;
        }
      }
      throw new Error("não consegui gravar " + id);
    };
    const p = fila.then(tarefa); fila = p.catch(() => {}); return p;
  }
  async function puxar() {
    if ((window.BCBR.pausaAte || 0) > Date.now()) {
      throw Object.assign(new Error(window.BCBR.limiteMsg || "Limite do GitHub"), { limite: true, ate: window.BCBR.pausaAte, status: 429 });
    }
    let lista;
    try { lista = await api(`/repos/${REPO}/contents/progresso`); } catch (e) { if (e.status === 404) lista = []; else throw e; }
    let mudou = false;
    await Promise.all(lista.filter((f) => f.name.endsWith(".json")).map(async (f) => {
      const id = f.name.slice(0, -5);
      if (shas.get(id) === f.sha && docs.has(id)) return;
      const c = await kvGet("p:" + id);
      const d = c && c.sha === f.sha ? c.d : JSON.parse(await raw(f.sha));
      if (!(c && c.sha === f.sha)) kvSet("p:" + id, { sha: f.sha, d });
      const finalD = qDocs.has(id) && docs.has(id) ? mergeProgressoDoc(id, docs.get(id), d) : d;
      docs.set(id, finalD); shas.set(id, f.sha); mudou = true;
    }));
    return mudou;
  }
  window.BCBR.mergeProgressoDoc = mergeProgressoDoc;
  window.BCBR.puxarProgresso = puxar;
  const DBshim = {
    collection() {
      return {
        doc: (id) => ({ set: (data) => gravarDoc(id, data) }),
        onSnapshot(cb, err) {
          const o = { cb, err }; ouvintes.push(o);
          const ciclo = async (primeira) => {
            if ((window.BCBR.pausaAte || 0) > Date.now()) { err && err(Object.assign(new Error(window.BCBR.limiteMsg || "Limite do GitHub"), { limite: true, ate: window.BCBR.pausaAte, status: 429 })); return; }
            if (window.BCBR.chaveErro && window.BCBR.chaveErroToken === tok()) { err && err(Object.assign(new Error("chave"), { chave: true, status: window.BCBR.chaveErroStatus || 401 })); return; }
            try { const m = await puxar(); if (m || primeira) avisar(); } catch (e) { err && err(e); }
          };
          ciclo(true);
          setInterval(() => document.visibilityState === "visible" && !((window.BCBR.pausaAte || 0) > Date.now()) && !(window.BCBR.chaveErro && window.BCBR.chaveErroToken === tok()) && ciclo(false), 60000);
          document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && !((window.BCBR.pausaAte || 0) > Date.now()) && !(window.BCBR.chaveErro && window.BCBR.chaveErroToken === tok()) && ciclo(false));
          return () => { ouvintes = ouvintes.filter((x) => x !== o); };
        },
      };
    },
  };

  // ---------- IA: Gemini no lugar do Claude do artefato ----------
  async function gemini(prompt) {
    const k = localStorage.getItem(LS.gm); if (!k) throw Object.assign(new Error("sem chave"), { code: "not_granted" });
    const m = localStorage.getItem(LS.gmModelo) || "gemini-3.8-flash";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${k}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } }),
    });
    if (!r.ok) throw new Error("Gemini " + r.status);
    const j = await r.json(); return { text: j.candidates[0].content.parts.map((p) => p.text || "").join("") };
  }
  window.claude = { use: async (k) => (k === "db" ? DBshim : k === "sample" ? (localStorage.getItem(LS.gm) ? gemini : null) : null) };

  // ---------- baixar tudo (offline) ----------
  const encPath = (nome) => String(nome || "").replace(/^\/+/, "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const normImgNome = (u) => {
    let s = String(u || "").trim();
    if (!s || /^(u:|data:|https?:)/.test(s)) return "";
    if (s.startsWith("gh:")) s = s.slice(3);
    s = s.replace(/^\.?\/?(?:imagens|img)\//, "");
    try { if (/%[0-9a-fA-F]{2}/.test(s)) s = decodeURIComponent(s); } catch (e) {}
    return s.trim();
  };
  window.BCBR.baixarTudo = async (aoAndar, extras = []) => {   // extras: imagens das notas (nomes de arquivo)
    if ((window.BCBR.pausaAte || 0) > Date.now()) return 0;
    if ("serviceWorker" in navigator) await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 4000))]).catch(() => {});   // as imagens passam pelo SW, que guarda no aparelho
    const fcImgs = [
      ...(window.RESUMOS_IDX || []).flatMap((r) => (r.cards || []).flatMap((k) => [...(k.fi || []), ...(k.vi || [])])),
      ...((Array.isArray(window.FC_QUESTOES) ? window.FC_QUESTOES : window.FC_QUESTOES?.cards) || []).flatMap((k) => [...(k.fi || []), ...(k.vi || [])]),
    ];
    const fs = [...new Set([...(window.QUESTOES || []).flatMap((q) => [...q.imgs, ...q.imgsCom]), ...fcImgs, ...extras].map(normImgNome).filter(Boolean))];
    let cacheImg = null; try { cacheImg = await caches.open("bcbr-img"); } catch (e) {}
    let n = 0, parar = false;
    for (let i = 0; i < fs.length && !parar; i += 3) {
      await Promise.all(fs.slice(i, i + 3).map(async (f) => {
        if (parar || (window.BCBR.pausaAte || 0) > Date.now()) { parar = true; return; }
        const urlImg = "./img/" + encPath(f);
        try {
          if (cacheImg && ((await cacheImg.match(urlImg)) || (await cacheImg.match("./img/" + f)))) return;
          const r = await fetch(urlImg);
          if (r.status === 403 || r.status === 429) { parar = true; return; }
          if (!r.ok) await imgDireto(f);
        } catch (e) {
          if (e?.limite || e?.status === 403 || e?.status === 429) { parar = true; return; }
          await imgDireto(f).catch((e2) => { if (e2?.limite || e2?.status === 403 || e2?.status === 429) parar = true; });
        }
      }));
      n = Math.min(fs.length, i + 3); aoAndar && aoAndar(n, fs.length);
    }
    return fs.length;
  };

  // ---------- imagens: plano B quando o service worker não serve ./img/ (1ª abertura, endereço alternativo) ----------
  const imgCache = new Map(), imgOk = new Map();
  window.BCBR.imgPronta = (nome) => imgOk.get(nome) || imgOk.get(normImgNome(nome)) || null;
  async function imgDireto(nomeOrig) {
    const nome = normImgNome(nomeOrig) || String(nomeOrig || "");
    if (!nome) throw new Error("img vazia");
    if (imgCache.has(nome)) return imgCache.get(nome);
    const p = (async () => {
      try {
        const c = await caches.open("bcbr-img");
        const h = (await c.match("./img/" + encPath(nome))) || (await c.match("./img/" + nome));
        if (h && h.ok) {
          const b = await h.blob();
          if (b.size > 0 && !/text\/html|application\/json/i.test(b.type || "")) return URL.createObjectURL(b);
          await c.delete("./img/" + encPath(nome)).catch(() => {});
        }
      } catch (e) {}
      const tentativas = [...new Set([nome, nome.normalize("NFC"), nome.normalize("NFD")])];
      let r = null, errUlt = null;
      for (const nm of tentativas) {
        try {
          r = await api(`/repos/${REPO}/contents/imagens/${encPath(nm)}`, { accept: "raw" });
          if (r && r.ok) break;
        } catch (e) {
          errUlt = e;
          if (e?.status !== 404) throw e;
        }
      }
      if (!r || !r.ok) throw errUlt || new Error("img " + (r?.status || 404));
      const b = await r.blob();
      if (!b.size || /text\/html|application\/json/i.test(b.type || "")) throw new Error("img invalida");
      if (offlineAtivo()) {
        try { const c = await caches.open("bcbr-img"); await c.put("./img/" + encPath(nome), new Response(b.slice(0), { headers: { "Content-Type": b.type || "image/jpeg" } })); } catch (e) {}
      }
      return URL.createObjectURL(b);
    })();
    imgCache.set(nome, p);
    p.then((u) => { imgOk.set(nome, u); imgOk.set(nome.normalize("NFC"), u); if (nomeOrig !== nome) imgOk.set(nomeOrig, u); }).catch(() => imgCache.delete(nome));
    return p;
  }
  document.addEventListener("error", (ev) => {
    const el = ev.target;
    if (!el || el.tagName !== "IMG") return;
    const src = String(el.getAttribute("src") || ""), m = src.match(/(?:^|\/)(?:img|imagens)\/([^?#]+)$/);
    if (!m || el.dataset.bcbrTentou === src) {
      if (el.classList.contains("fc-img") && el.dataset.bcbrTentou) el.hidden = true;
      return;
    }
    el.dataset.bcbrTentou = src;
    let nome = m[1]; try { nome = decodeURIComponent(nome); } catch (e) {}
    imgDireto(nome).then((u) => { el.hidden = false; el.src = u; }).catch(() => { if (el.classList.contains("fc-img")) el.hidden = true; });
  }, true);
  document.addEventListener("load", (ev) => {
    const el = ev.target; if (!el || el.tagName !== "IMG") return;
    const m = String(el.getAttribute("src") || "").match(/(?:^|\/)(?:img|imagens)\/([^?#]+)$/);
    if (m) {
      let nome = m[1]; try { nome = decodeURIComponent(nome); } catch (e) {}
      if (!imgOk.has(nome)) imgDireto(nome).catch(() => {});
    }
  }, true);
  Object.assign(window.BCBR, { imgDireto, passarChaveSW, carregarDados, kvGet });

  // ---------- aviso "versão nova / questões novas" (o app abre na hora com a cópia do aparelho e se atualiza por trás) ----------
  function aviso() {
    let el = document.getElementById("bcbr_aviso");
    if (!el) {
      el = document.createElement("div"); el.id = "bcbr_aviso";
      el.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:99999;display:flex;gap:8px;align-items:center;background:var(--card,#1e293b);color:var(--tx,#fff);border:1px solid var(--pri,#3b82f6);border-radius:12px;padding:6px 10px;box-shadow:0 8px 24px rgba(0,0,0,.35);font-size:.9rem;max-width:calc(100vw - 32px)";
      document.body.appendChild(el);
    }
    el.innerHTML = `<button class="b s" id="bcbr_av_ok">Atualizar</button><button class="b s sm-ghost" id="bcbr_av_no" aria-label="Depois">✕</button>`;
    document.getElementById("bcbr_av_ok").onclick = () => location.reload();
    document.getElementById("bcbr_av_no").onclick = () => el.remove();
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", (e) => { if (e.data === "bcbr-nova") aviso(); });
  // 1.19.2: atualização instantânea (pedido do Artur, 24/10/2026): ao abrir e ao voltar para a tela, confere versao.txt (sem cache).
  // Se mudou, apaga a cópia do app no aparelho e recarrega sozinho (progresso e rascunhos já ficam salvos).
  async function confereVersao() {
    try {
      const r = await fetch("./versao.txt?t=" + Date.now(), { cache: "no-store" }); if (!r.ok) return;
      const v = (await r.text()).trim(); if (!v || v === window.BCBR_VERSAO) return;
      if (sessionStorage.getItem("bcbr_recarregou") === v) return;   // não entra em laço se o GitHub ainda serve a velha
      sessionStorage.setItem("bcbr_recarregou", v);
      const ks = await caches.keys(); await Promise.all(ks.filter((k) => k.startsWith("bcbr-v") || /^bcbr-\d/.test(k)).map((k) => caches.delete(k)));
      const reg = "serviceWorker" in navigator && await navigator.serviceWorker.getRegistration(); if (reg) await reg.update().catch(() => {});
      location.reload();
    } catch (e) {}
  }
  window.bcbrConfereVersao = confereVersao;
  confereVersao();
  let ultChecagem = Date.now();
  const checarDados = () => {
    if ((window.BCBR.pausaAte || 0) > Date.now()) return Promise.resolve(false);
    return carregarDados(true).then((m) => { if (m) aviso(); return m; }).catch(() => false);
  };
  document.addEventListener("visibilitychange", () => {   // app que ficou aberto em segundo plano: confere de novo (no máx. a cada 10 min)
    if (document.visibilityState === "visible") confereVersao();
    if (document.visibilityState === "visible" && Date.now() - ultChecagem > 600000) { ultChecagem = Date.now(); checarDados(); }
  });

  // ---------- Nova tarefa antes do app abrir (?acao=tarefa|voz, 1ª vez no aparelho, enquanto as questões baixam) ----------
  // Só guarda o texto no rascunho (mesma chave do app); o app abre a Nova tarefa com ele, ou grava na hora se deu Enter.
  function tarefaRapida() {
    const acao = new URLSearchParams(location.search).get("acao");
    if (acao !== "tarefa" && acao !== "voz") return;
    const K = "bcbr_rasc_tarefa";
    let r = {}; try { r = JSON.parse(localStorage.getItem(K) || "{}") || {}; } catch (e) {}
    document.getElementById("app").innerHTML = `<div class="card" style="max-width:560px;margin:24px auto"><b>➕ Nova tarefa</b>
      <input id="tr_in" style="width:100%;box-sizing:border-box;font-size:1.05rem;padding:10px;margin-top:8px" placeholder="Digite e aperte Enter" autocomplete="off" enterkeyhint="done">
      <p class="mut" id="tr_msg">Carregando o banco… o que você digitar é guardado e salvo em seguida.</p></div>`;
    const i = document.getElementById("tr_in"); i.value = r.texto || "";
    const guarda = (extra) => { try { localStorage.setItem(K, JSON.stringify({ ...r, texto: i.value, aberto: true, ...(extra || {}) })); } catch (e) {} };
    i.oninput = () => guarda();
    i.onkeydown = (e) => { if (e.key === "Enter" && i.value.trim()) { guarda({ salvar: true, aberto: false }); i.disabled = true; document.getElementById("tr_msg").textContent = "Guardada. Salvo assim que o app terminar de carregar."; } };
    i.focus();
  }

  // ---------- início ----------
  async function iniciar() {
    await recuperarChave();
    if (offlineAtivo() && "serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").then(passarChaveSW).catch(() => {});   // só registra quando o modo offline está ligado neste aparelho
    if (!tok()) return telaConfig();
    document.getElementById("app").innerHTML = `<div class="card"><p class="mut">Carregando o banco…</p></div>`;
    let ok = false;
    const cache = await dadosDoCache();
    if (!cache) tarefaRapida();   // 1ª vez neste aparelho: deixa digitar a tarefa enquanto as questões baixam
    // Abre na hora com o banco guardado no aparelho; confere o GitHub por trás (pedido do Artur, 23/10/2026: abrir rápido no celular)
    if (cache) { abrirApp(); checarDados(); return; }
    try { await carregarDados(); ok = true; }
    catch (e) {
      if (e.chave && e.status === 401 && !window.BCBR_APP_ATIVO) { carregamentoPendente = true; return; }
      ok = await dadosDoCache();   // sem internet: usa o que já está no aparelho
      if (!ok) {
        document.getElementById("app").innerHTML = '<div class="card"><p>Não foi possível baixar o banco. Verifique a conexão e tente novamente.</p><button class="b" id="bcbr_tentar">Tentar novamente</button></div>';
        document.getElementById("bcbr_tentar").onclick = iniciar;
        return;
      }
    }
    abrirApp();
  }
  function abrirApp() { const s = document.createElement("script"); s.src = "./app.js?v=" + (window.BCBR_VERSAO || "1"); document.body.appendChild(s); }
  iniciar();
})();
