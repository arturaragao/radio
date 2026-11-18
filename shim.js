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
  window.BCBR = { REPO, pausaAte: 0, limiteMsg: "" };
  const fmtHora = (ms) => { const d = new Date(ms); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
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
    if (navigator.locks) await navigator.locks.request("bcbr-login", mostrar); else mostrar();
  }
  document.addEventListener("visibilitychange", () => { if (aguardando401 && document.visibilityState === "visible") credencialRecusada(aguardando401); });
  window.addEventListener("storage", (e) => {
    if (e.key !== LS.tk || !e.newValue) return;
    recusada = ""; aguardando401 = ""; passarChaveSW();
    if (configAberta || carregamentoPendente) location.reload();
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
      const ate = window.BCBR.pausaAte, msg = window.BCBR.limiteMsg || ("GitHub ocupado, tentando às " + fmtHora(ate));
      throw Object.assign(new Error(msg), { status: 429, limite: true, ate });
    }
    const chave = tok();
    let r;
    try { r = await fetch(API + path, {
      ...opt, cache: "no-store",
      headers: { Authorization: "Bearer " + chave, Accept: opt.accept === "raw" ? "application/vnd.github.raw" : opt.accept || "application/vnd.github+json", ...(opt.body ? { "Content-Type": "application/json" } : {}), ...(opt.etag ? { "If-None-Match": opt.etag } : {}) },
    }); } catch (e) { window.BCBR.semRede = true; throw e; }   // 1.42: falha de rede (mesmo com navigator.onLine verdadeiro) alimenta o indicador offline
    window.BCBR.semRede = false;
    // 1.40: cota do GitHub (BCBR.cota) para o ciclo rápido da Semana/Notas voltar a 90 s se faltar; opt.etag = GET condicional (304 não gasta cota).
    const rest = r.headers?.get?.("x-ratelimit-remaining");
    if (rest != null) window.BCBR.cota = { rest: +rest, reset: +r.headers?.get?.("x-ratelimit-reset") || 0 };
    if (r.status === 304) { window.BCBR.pausaAte = 0; window.BCBR.limiteMsg = ""; return { naoMudou: true }; }
    if (r.status === 401) { await credencialRecusada(chave); throw Object.assign(new Error("chave"), { chave: true, status: 401 }); }
    if (!r.ok) {
      const resp = await r.text().catch(() => "");
      if (ehLimite(r.status, r.headers, resp)) {
        const ate = Math.max(window.BCBR.pausaAte || 0, Date.now() + calculaEspera(r.headers));
        const msg = "GitHub ocupado, tentando às " + fmtHora(ate);
        window.BCBR.pausaAte = ate; window.BCBR.limiteMsg = msg;
        throw Object.assign(new Error(msg), { status: r.status, resp, limite: true, ate });
      }
      throw Object.assign(new Error("GitHub " + r.status), { status: r.status, resp });
    }
    window.BCBR.pausaAte = 0; window.BCBR.limiteMsg = "";
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
  const idb = new Promise((ok, no) => { const r = indexedDB.open("bcbr", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const kvGet = (k) => idb.then((d) => new Promise((ok) => { const t = d.transaction("kv").objectStore("kv").get(k); t.onsuccess = () => ok(t.result); t.onerror = () => ok(undefined); })).catch(() => undefined);
  const kvSet = (k, v) => idb.then((d) => new Promise((ok) => { const t = d.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = ok; t.onerror = ok; })).catch(() => {});

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
    let mudou = false;
    const pegar = async (nome) => {
      const c = await kvGet("f:" + nome);
      if (c && c.sha === sha[nome]) return c.txt;
      const txt = await rawItem(item[nome]); mudou = true; await kvSet("f:" + nome, { sha: sha[nome], txt }); return txt;
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
    // 1.52.0 / 1.63.0: resumos/indice.json e flashcards/questoes.json (pastas próprias, opcionais). Sem o arquivo (404), segue sem erro.
    const pastaJson = async (pasta, arquivo, cacheKey) => {
      let lista = [];
      try { lista = await api(`/repos/${REPO}/contents/${pasta}`); }
      catch (e) { if (e.chave) throw e; if (e.status !== 404) { const c = await kvGet(cacheKey); return c ? c.txt : ""; } }   // sem rede: usa a cópia do aparelho
      const f = Array.isArray(lista) && lista.find((x) => x.name === arquivo);
      if (!f) { if (await kvGet(cacheKey)) { await kvSet(cacheKey, null); mudou = true; } return ""; }
      const c = await kvGet(cacheKey);
      if (c && c.sha === f.sha) return c.txt;
      const txt = await rawItem(f); mudou = true; await kvSet(cacheKey, { sha: f.sha, txt }); return txt;
    };
    const lerResumos = (t) => { try { const j = t ? JSON.parse(t) : null; return Array.isArray(j) ? j : null; } catch (e) { return null; } };
    const lerFcQuestoes = (t) => { try { const j = t ? JSON.parse(t) : null; return j && Array.isArray(j.cards) ? j : (Array.isArray(j) ? { v: 1, cards: j } : null); } catch (e) { return null; } };
    const [q, m, mt, tax, sim, rs, fq] = await Promise.all([pegar("questoes.json"), sha["metodologia.md"] ? pegar("metodologia.md") : "", metodos(), opcional("taxonomia-pr.json"), opcional("simulados-pr.json"), pastaJson("resumos", "indice.json", "f:resumos-indice.json"), pastaJson("flashcards", "questoes.json", "f:flashcards-questoes.json")]);
    if (!fundo) { window.RESUMOS_IDX = lerResumos(rs); window.FC_QUESTOES = lerFcQuestoes(fq); window.QUESTOES = adaptar(JSON.parse(q)); window.METODO = m; window.METODOS_DADOS = mt ? JSON.parse(mt) : null; window.TAXONOMIA_PR = tax ? JSON.parse(tax) : null; window.SIMULADOS_PR = sim ? JSON.parse(sim) : null; }
    return mudou;
  }
  async function dadosDoCache() {
    const q = await kvGet("f:questoes.json"), m = await kvGet("f:metodologia.md"), mt = await kvGet("f:metodos.json");
    if (!q) return false;
    const tax = await kvGet("f:taxonomia-pr.json"), sim = await kvGet("f:simulados-pr.json"), rs = await kvGet("f:resumos-indice.json"), fq = await kvGet("f:flashcards-questoes.json");
    try { const j = rs && rs.txt ? JSON.parse(rs.txt) : null; window.RESUMOS_IDX = Array.isArray(j) ? j : null; } catch (e) { window.RESUMOS_IDX = null; }
    try { const j = fq && fq.txt ? JSON.parse(fq.txt) : null; window.FC_QUESTOES = j && Array.isArray(j.cards) ? j : (Array.isArray(j) ? { v: 1, cards: j } : null); } catch (e) { window.FC_QUESTOES = null; }
    window.QUESTOES = adaptar(JSON.parse(q.txt)); window.METODO = m ? m.txt : ""; window.METODOS_DADOS = mt ? JSON.parse(mt.txt) : null; window.TAXONOMIA_PR = tax ? JSON.parse(tax.txt) : null; window.SIMULADOS_PR = sim ? JSON.parse(sim.txt) : null; return true;
  }

  // ---------- progresso: o "banco" do artefato vira arquivos no GitHub ----------
  const docs = new Map(), shas = new Map();   // id -> dados, id -> sha do arquivo
  let fila = Promise.resolve(), ouvintes = [];
  const avisar = () => { const s = { docs: [...docs].map(([id, d]) => ({ id, data: () => d })) }; ouvintes.forEach((o) => o.cb(s)); };
  async function gravarDoc(id, data) {
    docs.set(id, data);
    const tarefa = async () => {
      for (let t = 1; t <= 4; t++) {
        try {
          const body = { message: "progresso: " + id, content: b64(JSON.stringify(data)), branch: "main" };
          if (shas.get(id)) body.sha = shas.get(id);
          const r = await api(`/repos/${REPO}/contents/progresso/${id}.json`, { method: "PUT", body: JSON.stringify(body) });
          shas.set(id, r.content.sha); kvSet("p:" + id, { sha: r.content.sha, d: data }); return;
        } catch (e) {
          if (e.status === 409 || e.status === 422) {   // mudou em outro aparelho: pega o sha novo e grava de novo
            try { const f = await api(`/repos/${REPO}/contents/progresso/${id}.json`); shas.set(id, f.sha); } catch (e2) { shas.delete(id); }
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
    let lista;
    try { lista = await api(`/repos/${REPO}/contents/progresso`); } catch (e) { if (e.status === 404) lista = []; else throw e; }
    let mudou = false;
    await Promise.all(lista.filter((f) => f.name.endsWith(".json")).map(async (f) => {
      const id = f.name.slice(0, -5);
      if (shas.get(id) === f.sha && docs.has(id)) return;
      const c = await kvGet("p:" + id);
      const d = c && c.sha === f.sha ? c.d : JSON.parse(await raw(f.sha));
      if (!(c && c.sha === f.sha)) kvSet("p:" + id, { sha: f.sha, d });
      docs.set(id, d); shas.set(id, f.sha); mudou = true;
    }));
    return mudou;
  }
  const DBshim = {
    collection() {
      return {
        doc: (id) => ({ set: (data) => gravarDoc(id, data) }),
        onSnapshot(cb, err) {
          const o = { cb, err }; ouvintes.push(o);
          const ciclo = async (primeira) => {
            try { const m = await puxar(); if (m || primeira) avisar(); } catch (e) { err && err(e); }
          };
          ciclo(true);
          setInterval(() => document.visibilityState === "visible" && !((window.BCBR.pausaAte || 0) > Date.now()) && ciclo(false), 60000);
          document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && !((window.BCBR.pausaAte || 0) > Date.now()) && ciclo(false));
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
      const ks = await caches.keys(); await Promise.all(ks.filter((k) => k.startsWith("bcbr-v")).map((k) => caches.delete(k)));
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
      if (e.chave) { carregamentoPendente = true; return; }
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
