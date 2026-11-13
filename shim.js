// Banco CBR (app) — ponte entre o código do artefato e o GitHub.
// - Questões: dados/questoes.json do repo privado (cache no aparelho, só baixa de novo se mudar).
// - Progresso: substitui o banco do artefato (claude.use('db')) por arquivos progresso/<doc>.json no repo privado.
// - IA: substitui claude.use('sample') pelo Gemini (chave do aparelho).
// - Imagens: o service worker (sw.js) serve ./img/<arquivo> lendo do repo com a chave.
(function () {
  const REPO = "arturaragao/banco-cbr-app", API = "https://api.github.com";
  const LS = { tk: "bcbr_gh_token", gm: "bcbr_gemini_key", gmModelo: "bcbr_gemini_modelo" };
  const tok = () => localStorage.getItem(LS.tk) || "";
  window.BCBR = { REPO };
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
    if (r.status === 304) return { naoMudou: true };
    if (r.status === 401) { await credencialRecusada(chave); throw Object.assign(new Error("chave"), { chave: true, status: 401 }); }
    if (!r.ok) throw Object.assign(new Error("GitHub " + r.status), { status: r.status, resp: await r.text().catch(() => "") });
    if (opt.etag !== undefined) { const j = await r.json(); j.etag = r.headers?.get?.("etag") || ""; return j; }
    return opt.accept === "raw" ? r : r.json();
  }
  const raw = (sha) => api(`/repos/${REPO}/git/blobs/${sha}`, { accept: "raw" }).then(r => r.text());
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
    const sha = Object.fromEntries(lista.map((f) => [f.name, f.sha]));
    let mudou = false;
    const pegar = async (nome) => {
      const c = await kvGet("f:" + nome);
      if (c && c.sha === sha[nome]) return c.txt;
      const txt = await raw(sha[nome]); mudou = true; await kvSet("f:" + nome, { sha: sha[nome], txt }); return txt;
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
    // 1.52.0: resumos/indice.json (pasta própria, opcional): lista de resumos ligados ao painel Foco e aos flashcards. Sem o arquivo (404), segue sem erro.
    const resumos = async () => {
      let lista = [];
      try { lista = await api(`/repos/${REPO}/contents/resumos`); }
      catch (e) { if (e.chave) throw e; if (e.status !== 404) { const c = await kvGet("f:resumos-indice.json"); return c ? c.txt : ""; } }   // sem rede: usa a cópia do aparelho
      const f = Array.isArray(lista) && lista.find((x) => x.name === "indice.json");
      if (!f) { if (await kvGet("f:resumos-indice.json")) { await kvSet("f:resumos-indice.json", null); mudou = true; } return ""; }
      const c = await kvGet("f:resumos-indice.json");
      if (c && c.sha === f.sha) return c.txt;
      const txt = await raw(f.sha); mudou = true; await kvSet("f:resumos-indice.json", { sha: f.sha, txt }); return txt;
    };
    const lerResumos = (t) => { try { const j = t ? JSON.parse(t) : null; return Array.isArray(j) ? j : null; } catch (e) { return null; } };
    const [q, m, mt, tax, sim, rs] = await Promise.all([pegar("questoes.json"), sha["metodologia.md"] ? pegar("metodologia.md") : "", metodos(), opcional("taxonomia-pr.json"), opcional("simulados-pr.json"), resumos()]);
    if (!fundo) { window.RESUMOS_IDX = lerResumos(rs); window.QUESTOES = adaptar(JSON.parse(q)); window.METODO = m; window.METODOS_DADOS = mt ? JSON.parse(mt) : null; window.TAXONOMIA_PR = tax ? JSON.parse(tax) : null; window.SIMULADOS_PR = sim ? JSON.parse(sim) : null; }
    return mudou;
  }
  async function dadosDoCache() {
    const q = await kvGet("f:questoes.json"), m = await kvGet("f:metodologia.md"), mt = await kvGet("f:metodos.json");
    if (!q) return false;
    const tax = await kvGet("f:taxonomia-pr.json"), sim = await kvGet("f:simulados-pr.json"), rs = await kvGet("f:resumos-indice.json");
    try { const j = rs && rs.txt ? JSON.parse(rs.txt) : null; window.RESUMOS_IDX = Array.isArray(j) ? j : null; } catch (e) { window.RESUMOS_IDX = null; }
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
          setInterval(() => document.visibilityState === "visible" && ciclo(false), 60000);
          document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && ciclo(false));
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
  window.BCBR.baixarTudo = async (aoAndar, extras = []) => {   // extras: imagens das notas (nomes de arquivo)
    if ("serviceWorker" in navigator) await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 4000))]).catch(() => {});   // as imagens passam pelo SW, que guarda no aparelho
    const fs = [...new Set([...(window.QUESTOES || []).flatMap((q) => [...q.imgs, ...q.imgsCom]).map((u) => u.slice(3)), ...extras])];
    let n = 0;
    for (let i = 0; i < fs.length; i += 6) {
      await Promise.all(fs.slice(i, i + 6).map((f) => fetch("./img/" + encodeURIComponent(f)).catch(() => {})));
      n = Math.min(fs.length, i + 6); aoAndar && aoAndar(n, fs.length);
    }
    return fs.length;
  };

  // ---------- imagens: plano B quando o service worker não serve ./img/ (1ª abertura, endereço alternativo) ----------
  const imgCache = new Map(), imgOk = new Map();
  window.BCBR.imgPronta = (nome) => imgOk.get(nome) || null;
  async function imgDireto(nome) {
    if (imgCache.has(nome)) return imgCache.get(nome);
    const p = (async () => {
      try { const c = await caches.open("bcbr-img"); const h = await c.match("./img/" + encodeURIComponent(nome)); if (h) return URL.createObjectURL(await h.blob()); } catch (e) {}
      const r = await api(`/repos/${REPO}/contents/imagens/${encodeURIComponent(nome)}`, { accept: "raw" });
      if (!r.ok) throw new Error("img " + r.status);
      const b = await r.blob();
      try { const c = await caches.open("bcbr-img"); await c.put("./img/" + encodeURIComponent(nome), new Response(b.slice(0), { headers: { "Content-Type": b.type || "image/jpeg" } })); } catch (e) {}
      return URL.createObjectURL(b);
    })();
    imgCache.set(nome, p); p.then((u) => imgOk.set(nome, u)).catch(() => imgCache.delete(nome)); return p;
  }
  document.addEventListener("error", (ev) => {
    const el = ev.target;
    if (!el || el.tagName !== "IMG") return;
    const src = String(el.getAttribute("src") || ""), m = src.match(/(?:^|\/)img\/([^/?#]+)$/);
    if (!m || el.dataset.bcbrTentou === src) return;
    el.dataset.bcbrTentou = src;
    imgDireto(decodeURIComponent(m[1])).then((u) => { el.src = u; }).catch(() => {});
  }, true);
  document.addEventListener("load", (ev) => {
    const el = ev.target; if (!el || el.tagName !== "IMG") return;
    const m = String(el.getAttribute("src") || "").match(/(?:^|\/)img\/([^/?#]+)$/);
    if (m && !imgOk.has(decodeURIComponent(m[1]))) imgDireto(decodeURIComponent(m[1])).catch(() => {});
  }, true);
  window.BCBR.imgDireto = imgDireto;

  // ---------- aviso "versão nova / questões novas" (o app abre na hora com a cópia do aparelho e se atualiza por trás) ----------
  function aviso(txt) {
    let el = document.getElementById("bcbr_aviso");
    if (!el) {
      el = document.createElement("div"); el.id = "bcbr_aviso";
      el.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:99999;display:flex;gap:10px;align-items:center;background:var(--card,#1e293b);color:var(--tx,#fff);border:1px solid var(--pri,#3b82f6);border-radius:12px;padding:8px 12px;box-shadow:0 8px 24px rgba(0,0,0,.35);font-size:.9rem;max-width:calc(100vw - 32px)";
      document.body.appendChild(el);
    }
    el.innerHTML = `<span>${txt}</span><button class="b s" id="bcbr_av_ok">Atualizar</button><button class="b s sm-ghost" id="bcbr_av_no" aria-label="Depois">✕</button>`;
    document.getElementById("bcbr_av_ok").onclick = () => location.reload();
    document.getElementById("bcbr_av_no").onclick = () => el.remove();
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", (e) => { if (e.data === "bcbr-nova") aviso("Versão nova do app pronta."); });
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
  const checarDados = () => carregarDados(true).then((m) => { if (m) aviso("Questões novas baixadas."); }).catch(() => {});
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
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").then(passarChaveSW).catch(() => {});   // não espera
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
