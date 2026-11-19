// Radio 1.65.0: testes unitários puros (Node) para fila durável, backoff 401/403/429,
// merge 409/422, faixa fixa >10 min, exportação JSON, beforeunload e migração de flashcards fundidos.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { criarSyncNotas } = require('../build/sync-notas.js');
const RadioFila = require('../build/sync-fila.js');

const ler = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r\n/g, '\n');
const cp = (x) => JSON.parse(JSON.stringify(x));

test('1.65.0: SyncNotas persiste em cache/IndexedDB mesmo com QuotaExceededError no localStorage, sobrevive a reload e só confirma após sha novo', async () => {
  const idbStore = new Map();
  const cache = {
    get: async (k) => (idbStore.has(k) ? cp(idbStore.get(k)) : undefined),
    set: async (k, v) => {
      if (v === null) idbStore.delete(k);
      else idbStore.set(k, cp(v));
    },
  };
  let n = 0;
  const files = new Map();
  let offline = true;
  const api = async (url, opt = {}) => {
    if (offline) throw new TypeError('Failed to fetch');
    const p = decodeURIComponent(url.split('/contents/')[1] || '');
    if (opt.method === 'PUT') {
      const b = JSON.parse(opt.body), f = files.get(p);
      if (f && b.sha !== f.sha) throw Object.assign(Error('HTTP 409'), { status: 409 });
      const sha = 'sha' + (++n);
      files.set(p, { sha, d: JSON.parse(Buffer.from(b.content, 'base64').toString()) });
      return { content: { sha } };
    }
    const f = files.get(p);
    if (!f) throw Object.assign(Error('HTTP 404'), { status: 404 });
    return { sha: f.sha, etag: '"' + f.sha + '"', content: Buffer.from(JSON.stringify(f.d)).toString('base64') };
  };
  const storageCheio = {
    length: 0,
    key: () => null,
    getItem: () => null,
    setItem: () => { throw Object.assign(Error('Quota'), { name: 'QuotaExceededError' }); },
    removeItem: () => {},
  };

  const s1 = criarSyncNotas({ api, repo: 'f/t', storage: storageCheio, cache, atraso: 100000, aparelhoId: 'pc1' });
  const pag = {
    id: 'notas', titulo: 'Notas', pasta: '', ordem: 0, atualizado: '2026-11-18T10:00:00Z',
    doc: { v: 1, blocos: [{ id: 'b1', atualizado: '2026-11-18T10:00:00Z', conteudo: { type: 'paragraph', content: [{ type: 'text', text: 'Salvo só no IDB' }] } }] },
  };
  s1.salvarPagina(pag);
  assert.equal(s1.resumo().volatil, false, 'IDB disponível: não é volátil mesmo sem localStorage');
  assert.equal(await s1.enviar(), false);
  assert.equal(s1.resumo().pendentes, 1, 'permanece pendente após falha offline');
  assert.ok(idbStore.has('notas:fila:idx'), 'índice da fila salvo em IDB');

  // Simula recarregar a página (nova instância, localStorage vazio, mesmo cache IDB)
  const s2 = criarSyncNotas({ api, repo: 'f/t', storage: storageCheio, cache, atraso: 100000, aparelhoId: 'pc1' });
  const aberta = await s2.abrirPaginaCache('notas');
  assert.equal(aberta.doc.blocos[0].conteudo.content[0].text, 'Salvo só no IDB');
  assert.equal(s2.pendentesDetalhe(true).length, 1);
  assert.equal(s2.pendentesDetalhe(true)[0].payload.doc.blocos[0].conteudo.content[0].text, 'Salvo só no IDB');

  // Volta online: envia e só então limpa fila do IDB
  offline = false;
  assert.equal(await s2.enviar(), true);
  assert.equal(s2.resumo().pendentes, 0);
  assert.deepEqual(idbStore.get('notas:fila:idx'), []);
  assert.equal(files.get('notas/paginas/notas.json').d.doc.blocos[0].conteudo.content[0].text, 'Salvo só no IDB');
});

test('1.65.0: shim.js classifica 401/403 chave sem apagar #app ativo, 403 rate limit com tenta às HH:MM, carrega fundidos.json e mescla 409 no progresso', async () => {
  const calls = [], kv = new Map();
  const ls = { bcbr_gh_token: 'tok1' };
  let mode = '200';
  const files = new Map();
  let shaSeq = 0;

  const doc = {
    body: { appendChild() {} },
    getElementById: (id) => (id === 'app' ? { innerHTML: '<main>APP ATIVO</main>' } : null),
    createElement: () => ({ style: {}, remove() {} }),
    addEventListener() {},
    visibilityState: 'visible',
  };
  const db = {
    transaction() {
      const tr = {
        objectStore() {
          return {
            get(k) { const r = { result: kv.get(k) }; queueMicrotask(() => r.onsuccess?.()); return r; },
            put(v, k) { if (v == null) kv.delete(k); else kv.set(k, cp(v)); queueMicrotask(() => tr.oncomplete?.()); return {}; },
          };
        },
      };
      return tr;
    },
  };
  const fetchMock = async (u, opt = {}) => {
    const s = String(u);
    if (s.includes('api.github.com')) calls.push({ url: s, method: opt.method || 'GET' });
    if (mode === '401') return new Response('{}', { status: 401 });
    if (mode === '403_key') return new Response('{"message":"Resource not accessible by personal access token"}', { status: 403 });
    if (mode === '403_rl') {
      const rst = Math.floor(Date.now() / 1000) + 180;
      return new Response('{"message":"API rate limit exceeded"}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(rst) } });
    }
    const p = decodeURIComponent(s.split('/contents/')[1] || '');
    if (opt.method === 'PUT') {
      const b = JSON.parse(opt.body), cur = files.get(p);
      if (cur && b.sha !== cur.sha) return new Response('{"message":"sha mismatch"}', { status: 409 });
      const sha = 's' + (++shaSeq);
      files.set(p, { sha, d: JSON.parse(Buffer.from(b.content, 'base64').toString()) });
      return new Response(JSON.stringify({ content: { sha } }), { status: 200 });
    }
    if (s.endsWith('/contents/dados')) return new Response(JSON.stringify([{ name: 'questoes.json', sha: 'q1' }]), { status: 200 });
    if (s.endsWith('/git/blobs/q1')) return new Response('[]', { status: 200 });
    if (s.endsWith('/contents/resumos')) return new Response(JSON.stringify([{ name: 'indice.json', sha: 'ri1' }, { name: 'fundidos.json', sha: 'rf1' }]), { status: 200 });
    if (s.endsWith('/git/blobs/ri1')) return new Response(JSON.stringify([{ pagina: 'p1', titulo: 'T', chave: 'tor|T', cards: [] }]), { status: 200 });
    if (s.endsWith('/git/blobs/rf1')) return new Response(JSON.stringify({ r_old: 'r_new' }), { status: 200 });
    if (s.endsWith('/contents/flashcards')) return new Response(JSON.stringify([{ name: 'questoes.json', sha: 'fq1' }]), { status: 200 });
    if (s.endsWith('/git/blobs/fq1')) return new Response(JSON.stringify({ v: 2, cards: [{ id: 'q_new', f: 'F', v: 'V' }], fundidos: { q_old: 'q_new' } }), { status: 200 });
    const f = files.get(p);
    if (!f) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ sha: f.sha, content: Buffer.from(JSON.stringify(f.d)).toString('base64') }), { status: 200 });
  };

  const ctx = vm.createContext({
    window: { BCBR_VERSAO: '1.65.0', BCBR_APP_ATIVO: true, addEventListener() {}, dispatchEvent() {} },
    document: doc,
    localStorage: { getItem: (k) => ls[k] ?? null, setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => delete ls[k] },
    sessionStorage: { getItem: () => null, setItem() {} },
    navigator: { onLine: true },
    indexedDB: { open() { const r = { result: db }; queueMicrotask(() => r.onsuccess?.()); return r; } },
    caches: { open: async () => ({ match: async () => null, put: async () => {} }), keys: async () => [] },
    location: { reload() {}, search: '' },
    fetch: fetchMock, Response, CustomEvent: function (t) { this.type = t; },
    setTimeout, clearTimeout, setInterval: () => 0,
    URLSearchParams, Date, Math, Map, Set, Array, Object, String, Number, Error, Promise, JSON, encodeURIComponent, decodeURIComponent,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  });
  ctx.window.window = ctx.window; ctx.window.document = doc;
  vm.runInContext(ler('shim.js').replace('iniciar();', ''), ctx);
  const BCBR = ctx.window.BCBR;

  // 1) Carrega fundidos.json e questoes.json v:2
  await BCBR.carregarDados(false);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.window.RESUMOS_FUNDIDOS)), { r_old: 'r_new' });
  assert.equal(ctx.window.FC_QUESTOES.v, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.window.FC_QUESTOES.fundidos)), { q_old: 'q_new' });

  // 2) 401 com app ativo NÃO limpa #app e marca BCBR.chaveErro
  mode = '401';
  await assert.rejects(() => BCBR.api('/repos/a/b/contents/x'), (e) => e.chave === true && e.status === 401);
  assert.equal(BCBR.chaveErroStatus, 401);

  // 3) 403 sem rate limit marca BCBR.chaveErro (status 403)
  BCBR.limpaChaveErro(); mode = '403_key';
  await assert.rejects(() => BCBR.api('/repos/a/b/contents/x'), (e) => e.chave === true && e.status === 403);
  assert.equal(BCBR.chaveErroStatus, 403);

  // 4) 403 rate limit usa "Limite do GitHub, tenta às HH:MM" e não martela
  BCBR.limpaChaveErro(); mode = '403_rl';
  const antes = calls.length;
  await assert.rejects(() => BCBR.api('/repos/a/b/contents/x'), (e) => e.limite === true && /^Limite do GitHub, tenta às \d\d:\d\d$/.test(e.message));
  assert.equal(calls.length, antes + 1);
  await assert.rejects(() => BCBR.api('/repos/a/b/contents/y'), (e) => e.limite === true);
  assert.equal(calls.length, antes + 1, 'sem novas requisições durante pausaAte');

  // 5) 409 em progresso/log_... mescla remoto + local sem perder nenhum dos dois
  BCBR.pausaAte = 0; BCBR.limiteMsg = ''; mode = '200';
  const remSha = 's_rem';
  files.set('progresso/log_2026-11-18.json', {
    sha: remSha,
    d: { items: [['q_remoto', 1000, 1, 'certeza', 500, 'hoje', 0, 'A']] },
  });
  const dbShim = (await ctx.window.claude.use('db')).collection('cbr');
  await dbShim.doc('log_2026-11-18').set({ items: [['q_local', 2000, 0, 'duvida', 800, 'hoje', 0, 'B']] });
  const salvo = files.get('progresso/log_2026-11-18.json').d;
  assert.equal(salvo.items.length, 2, 'ambas respostas preservadas após 409');
  assert.deepEqual(salvo.items.map((x) => x[0]), ['q_remoto', 'q_local']);
  assert.ok(BCBR.ultimoConflitoEm > 0);
});

test('1.65.0: fcMigraFundidos migra progresso (fcs), votos (fcAv) e vistos (fcHoje/fcBlocos) de removidos para mantido (inclusive cadeia)', () => {
  const fcSrc = ler('build/flashcards.js');
  const fcs = {
    old1: [2.5, 4, 2, 999999, 0, 2000, 0],
    old2: [2.4, 1, 1, 888888, 1, 1000, 0],
    keep2: [2.6, 10, 4, 777777, 0, 5000, 0], // keep2 é mais recente (5000 > 1000)
    chainA: [2.5, 6, 3, 555555, 0, 3000, 1],
  };
  const fcAv = {
    old1: { id: 'old1', voto: 1, motivo: '', data: '2026-11-18', u: 2000 },
    chainA: { id: 'chainA', voto: -1, motivo: 'erro', data: '2026-11-18', u: 3000 },
  };
  const cfg = {
    fcHoje: { d: '2026-11-18', feitos: ['old1', 'keep2', 'old2'] },
    fcBlocos: [{ id: 'b1', ids: ['old1', 'keep2', 'old2', 'chainA'], resp: { old1: { g: 3, ok: true, t: 2000 } }, re: { chainA: 1 } }],
  };
  const dirty = new Set();
  const persistCalls = [];
  const ctx = vm.createContext({
    window: {
      FC_QUESTOES: { v: 2, cards: [], fundidos: { old1: 'keep1', old2: 'keep2' } },
      RESUMOS_FUNDIDOS: { chainA: 'chainB', chainB: 'keepC' },
      RESUMOS_IDX: [],
    },
    cards: [], fcs, fcAv, cfg, dirty,
    hk: (id, m) => [...String(id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % m,
    saveL() {},
    persist: (w) => persistCalls.push(w),
    norm: (s) => String(s).toLowerCase(),
  });
  vm.runInContext(fcSrc, ctx);
  const mudou = ctx.fcMigraFundidos(true);
  assert.equal(mudou, true);
  assert.equal(fcs.old1, undefined);
  assert.equal(fcs.old2, undefined);
  assert.equal(fcs.chainA, undefined);
  assert.equal(fcs.keep1[2], 2);
  assert.equal(fcs.keep2[2], 4, 'progresso mais recente no mantido preservado');
  assert.equal(fcs.keepC[6], 1, 'cadeia chainA -> chainB -> keepC migrada');
  assert.equal(fcAv.old1, undefined);
  assert.equal(fcAv.keep1.voto, 1);
  assert.equal(fcAv.keep1.id, 'keep1');
  assert.equal(fcAv.keepC.motivo, 'erro');
  assert.deepEqual(JSON.parse(JSON.stringify(cfg.fcHoje.feitos)), ['keep1', 'keep2']);
  assert.deepEqual(JSON.parse(JSON.stringify(cfg.fcBlocos[0].ids)), ['keep1', 'keep2', 'keepC']);
  assert.equal(cfg.fcBlocos[0].resp.keep1.g, 3);
  assert.equal(cfg.fcBlocos[0].resp.old1, undefined);
  assert.equal(cfg.fcBlocos[0].re.keepC, 1);
  assert.ok(dirty.has('av:0'));
  assert.ok(persistCalls.includes('_est'));
});

test('1.65.0: RadioFila faixa fixa >10 min, exportação JSON e reconciliaRemoto para annulments/fcs/pon', () => {
  const agora = Date.now();
  const res = RadioFila.estadoResumo(agora);
  assert.equal(res.mostrarFaixa, false);

  RadioFila.gravaItem({
    id: 'nota:p1', tipo: 'nota', titulo: 'Nota: Teste',
    criadoEm: agora - 11 * 60 * 1000, atualizadoEm: agora - 1000, rev: 1,
    payload: { id: 'p1', doc: { v: 1, blocos: [] } },
  });
  const est = RadioFila.estadoResumo(agora);
  assert.equal(est.pendentes, 1);
  assert.equal(est.mostrarFaixa, true, 'pendente > 10 min ativa faixa fixa');
  assert.match(est.texto, /1 alteração pendente — salva neste PC/);

  const exp = RadioFila.exportarObjeto();
  assert.equal(exp.pendentes.length, 1);
  assert.equal(exp.pendentes[0].payload.id, 'p1');

  RadioFila.confirmaItem('nota:p1', 1);
  assert.equal(RadioFila.contar(), 0);

  // reconciliaRemoto detecta l.x anulada, fcs mais novo e pon mais novo mesmo quando o doc já existe no remoto
  const dirty = new Set();
  const hk = (id, m) => [...String(id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % m;
  const wkKey = () => '2026-11-18';
  const docs = [
    { id: 'log_2026-11-18', data: () => ({ items: [['q1', 1000, 1, 'certeza', 100, 'hoje', 0, 'A']] }) },
    { id: 'fcs_' + hk('c1', 8), data: () => ({ s: { c1: [2.5, 1, 1, 999, 0, 1000, 0] } }) },
    { id: 'pon_' + hk('q1', 8), data: () => ({ m: { q1: { t: 'antigo', u: 1000 } } }) },
  ];
  RadioFila.reconciliaRemoto(docs, {
    all: [{ q: 'q1', t: 1000, ok: true, conf: 'certeza', ms: 100, modo: 'hoje', x: 1, e: 'A' }],
    cards: [],
    fcs: { c1: [2.5, 4, 2, 2000, 0, 5000, 0] },
    pon: { q1: { t: 'novo', u: 5000 } },
    ia: {},
    dirty, wkKey, hk,
  });
  assert.ok(dirty.has('2026-11-18'), 'detecta anulação local');
  assert.ok(dirty.has('s:' + hk('c1', 8)), 'detecta fcs mais novo');
  assert.ok(dirty.has('p:' + hk('q1', 8)), 'detecta pon mais novo');
});

test('1.65.0: SyncNotas não regredir para localStorage antigo quando IDB tem edição mais nova, e exige sha no PUT', async () => {
  const idbStore = new Map();
  const cache = {
    get: async (k) => (idbStore.has(k) ? cp(idbStore.get(k)) : undefined),
    set: async (k, v) => { if (v === null) idbStore.delete(k); else idbStore.set(k, cp(v)); },
  };
  let failLS = false, noSha = false, offline = true, n = 0;
  const lsMap = new Map();
  const storage = {
    get length() { return lsMap.size; },
    key: (i) => [...lsMap.keys()][i],
    getItem: (k) => lsMap.get(k) ?? null,
    setItem: (k, v) => { if (failLS) throw Object.assign(Error('Quota'), { name: 'QuotaExceededError' }); lsMap.set(k, String(v)); },
    removeItem: (k) => lsMap.delete(k),
  };
  const files = new Map();
  const api = async (url, opt = {}) => {
    if (offline) throw new TypeError('Failed to fetch');
    const p = decodeURIComponent(url.split('/contents/')[1] || '');
    if (opt.method === 'PUT') {
      if (noSha) return { content: {} };
      const b = JSON.parse(opt.body);
      const sha = 's' + (++n);
      files.set(p, { sha, d: JSON.parse(Buffer.from(b.content, 'base64').toString()) });
      return { content: { sha } };
    }
    const f = files.get(p);
    if (!f) throw Object.assign(Error('HTTP 404'), { status: 404 });
    return { sha: f.sha, etag: '"' + f.sha + '"', content: Buffer.from(JSON.stringify(f.d)).toString('base64') };
  };

  const s1 = criarSyncNotas({ api, repo: 'f/t', storage, cache, atraso: 100000, aparelhoId: 'pc1' });
  const pg1 = { id: 'notas', titulo: 'Notas', pasta: '', ordem: 0, atualizado: '2026-11-18T10:00:00Z', doc: { v: 1, blocos: [{ id: 'b1', atualizado: '2026-11-18T10:00:00Z', conteudo: { type: 'paragraph', content: [{ type: 'text', text: 'Antigo LS' }] } }] } };
  s1.salvarPagina(pg1);
  // Edição 2 falha no localStorage mas salva no IDB; garantir que timestamp avança >= 1ms
  await new Promise((r) => setTimeout(r, 5));
  failLS = true;
  const pg2 = { id: 'notas', titulo: 'Notas', pasta: '', ordem: 0, atualizado: '2026-11-18T10:01:00Z', doc: { v: 1, blocos: [{ id: 'b1', atualizado: '2026-11-18T10:01:00Z', conteudo: { type: 'paragraph', content: [{ type: 'text', text: 'Mais novo IDB' }] } }] } };
  s1.salvarPagina(pg2);
  await s1.enviar();

  // Simula reload com outro instância: se PUT vier sem sha, permanece na fila; depois com sha envia o texto do IDB
  const s2 = criarSyncNotas({ api, repo: 'f/t', storage, cache, atraso: 100000, aparelhoId: 'pc1' });
  offline = false; noSha = true;
  assert.equal(await s2.enviar(), false, 'PUT sem sha não confirma nem limpa fila');
  assert.equal(s2.resumo().pendentes, 1);

  noSha = false;
  assert.equal(await s2.enviar(), true);
  assert.equal(s2.resumo().pendentes, 0);
  assert.equal(files.get('notas/paginas/notas.json').d.doc.blocos[0].conteudo.content[0].text, 'Mais novo IDB');
});

test('1.65.0: mergeProgressoDoc("estado") preserva cfg.ri + cfg.ests e registraHidratador sem corrida', () => {
  // 1) Verifica merge de cfg.ri em shim.js quando remoto tem u maior
  const ctx = vm.createContext({
    window: { BCBR_VERSAO: '1.65.0', BCBR_APP_ATIVO: true, addEventListener() {}, dispatchEvent() {} },
    document: { body: { appendChild() {} }, getElementById: () => null, createElement: () => ({ style: {}, remove() {} }), addEventListener() {}, visibilityState: 'visible' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    navigator: { onLine: true },
    indexedDB: { open: () => ({ set onupgradeneeded(_) {}, set onsuccess(_) {}, set onerror(_) {} }) },
    caches: { open: async () => ({ match: async () => null, put: async () => {} }), keys: async () => [] },
    location: { reload() {}, search: '' },
    fetch: async () => new Response('{}', { status: 200 }),
    setTimeout, clearTimeout, setInterval: () => 0,
    URLSearchParams, Date, Math, Map, Set, Array, Object, String, Number, Error, Promise, JSON, encodeURIComponent, decodeURIComponent,
  });
  ctx.window.window = ctx.window; ctx.window.document = ctx.document;
  vm.runInContext(ler('shim.js').replace('iniciar();', ''), ctx);

  const merged = ctx.window.BCBR.mergeProgressoDoc('estado',
    { u: 1000, over: { q1: 'tor' }, cfg: { ri: { d: '2026-11-18', meta: 50, ids: ['q1', 'q2'] }, ests: [{ id: 'e1', u: 900, ids: ['q1'] }] } },
    { u: 2000, over: { q2: 'abd' }, cfg: { ri: { d: '2026-11-18', meta: 50, ids: ['q2', 'q3'] }, ests: [{ id: 'e2', u: 1500, ids: ['q3'] }] } }
  );
  assert.deepEqual(JSON.parse(JSON.stringify(merged.cfg.ri.ids)), ['q1', 'q2', 'q3']);
  assert.deepEqual(JSON.parse(JSON.stringify(merged.cfg.ests.map((e) => e.id).sort())), ['e1', 'e2']);

  // 2) Verifica semana.js marca SM.sujo=true imediatamente no smMudar e zera SM.sujoDesde ao confirmar
  const appSrc = ler('app.js');
  const fixos = appSrc.slice(appSrc.indexOf('const DATA_PROVA='), appSrc.indexOf('let Q='));
  const semSrc = fixos + '\n' + ler('build/interpretar.js') + '\n' + ler('build/semana.js');
  let failPut = true;
  const smCtx = vm.createContext({
    RadioFila,
    SyncNotas: { receberLegado: async () => {}, enviar: async () => true, listarPaginas: async () => [], integrarPlano: async (d, sha) => ({ d, sha }) },
    document: { visibilityState: 'visible', addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null },
    window: { addEventListener() {} },
    navigator: { onLine: true },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    BCBR: {
      REPO: 'f/t', b64: (s) => Buffer.from(s).toString('base64'),
      api: async (p, opt = {}) => {
        if (opt.method === 'PUT') {
          if (failPut) throw Object.assign(Error('offline'), { status: 503 });
          return { content: { sha: 's_ok' } };
        }
        if (p.endsWith('semana/plano.json')) return { sha: 's0', content: Buffer.from(JSON.stringify({ v: 2, dias: {}, tarefas: [], notas: [] })).toString('base64') };
        throw Object.assign(Error('404'), { status: 404 });
      },
    },
    dKey: () => '2026-11-18',
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (ms >= 1000 && t && typeof t.unref === 'function') t.unref(); return t; },
    clearTimeout, setInterval: () => 0,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    tela: 'semana', render() {}, toast() {}, cfg: { diario: 10 }, PARAM: {}, log: [], DAY: 86400000, metaHoje: () => 10, metaDia: () => 10, _restantesFM: () => 100, esc: (s) => s,
    Date, Math, Map, Set, Array, Object, String, Number, Error, Promise, JSON,
  });
  vm.runInContext(semSrc, smCtx);
  vm.runInContext('SM.d = { v: 2, dias: {}, tarefas: [], notas: [] }; SM.sha = "s0"; SM.base = JSON.stringify(SM.d);', smCtx);
  const prom = smCtx.smMudar((d) => { d.prelConf = { '9001': '2026-11-18T12:00:00' }; }, 'preliminares: conferido');
  assert.equal(vm.runInContext('SM.sujo', smCtx), true, 'SM.sujo marcado antes do PUT concluir');
  assert.ok(RadioFila.contar() >= 1);
  return prom.then(async (ok1) => {
    assert.equal(ok1, false);
    assert.equal(vm.runInContext('SM.sujo', smCtx), true);
    assert.ok(vm.runInContext('SM.sujoDesde', smCtx) > 0);
    failPut = false;
    const ok2 = await smCtx.smEnviaSujoSync();
    assert.equal(ok2, true);
    assert.equal(vm.runInContext('SM.sujo', smCtx), false);
    assert.equal(vm.runInContext('SM.sujoDesde', smCtx), 0);
    assert.equal(RadioFila.contar(), 0);
  });
});

test('1.65.0: smEnviaSujo respeita chaveErro/pausaAte, SyncNotas descreveErro e mergeRemote com estDirty preserva estado remoto', async () => {
  // 1) smEnviaSujo não dispara PUT quando BCBR.chaveErro ou BCBR.pausaAte estão ativos
  const appSrc = ler('app.js');
  const fixos = appSrc.slice(appSrc.indexOf('const DATA_PROVA='), appSrc.indexOf('let Q='));
  const semSrc = fixos + '\n' + ler('build/interpretar.js') + '\n' + ler('build/semana.js');
  let puts = 0;
  const smCtx = vm.createContext({
    RadioFila,
    SyncNotas: { receberLegado: async () => {}, enviar: async () => true, listarPaginas: async () => [], integrarPlano: async (d, sha) => ({ d, sha }) },
    document: { visibilityState: 'visible', addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null },
    window: { addEventListener() {} },
    navigator: { onLine: true },
    localStorage: { getItem: (k) => (k === 'bcbr_gh_token' ? 'tk1' : null), setItem() {}, removeItem() {} },
    BCBR: {
      REPO: 'f/t', b64: (s) => Buffer.from(s).toString('base64'),
      chaveErro: 'Chave inválida', chaveErroToken: 'tk1', pausaAte: 0,
      api: async (_p, opt = {}) => { if (opt.method === 'PUT') puts++; return { content: { sha: 'x' } }; },
    },
    dKey: () => '2026-11-18',
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (ms >= 1000 && t && typeof t.unref === 'function') t.unref(); return t; },
    clearTimeout, setInterval: () => 0,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    tela: 'semana', render() {}, toast() {}, cfg: { diario: 10 }, PARAM: {}, log: [], DAY: 86400000, metaHoje: () => 10, metaDia: () => 10, _restantesFM: () => 100, esc: (s) => s,
    Date, Math, Map, Set, Array, Object, String, Number, Error, Promise, JSON,
  });
  vm.runInContext(semSrc, smCtx);
  vm.runInContext('SM.d = { v: 2, dias: {}, tarefas: [], notas: [] }; SM.sujo = true; SM.enviandoSujo = false;', smCtx);
  smCtx.smEnviaSujo();
  smCtx.BCBR.chaveErro = '';
  smCtx.BCBR.pausaAte = Date.now() + 60000;
  smCtx.smEnviaSujo();
  assert.equal(puts, 0, 'smEnviaSujo não martela durante chaveErro ou pausaAte');

  // 2) SyncNotas formata erro amigável em pendentesDetalhe quando descreveErro é fornecido
  const sErr = criarSyncNotas({
    api: async () => { throw new TypeError('Failed to fetch'); },
    repo: 'f/t',
    descreveErro: (e) => RadioFila.descreveErro(e),
    atraso: 100000,
    aparelhoId: 'pc1',
  });
  sErr.salvarPagina({ id: 'notas', titulo: 'Notas', atualizado: '2026-11-18T10:00:00Z', doc: { v: 1, blocos: [] } });
  await sErr.enviar();
  assert.equal(sErr.pendentesDetalhe()[0].erro, 'Sem internet');

  // 3) mergeRemote em app.js usa mergeProgressoDoc quando estDirty=true e remoto tem u <= estU
  assert.match(appSrc, /if\(estDirty&&window\.BCBR\?\.mergeProgressoDoc\)\{const mn=BCBR\.mergeProgressoDoc\('estado'/);

  // 4) conectaProgresso com snapLS.dirty (sem estDirty) não zera ultEstSnap nem inventa estadoMudou=true depois
  const lsSnap = new Map([['bcbr_fila_prog', JSON.stringify({ dirty: ['2026-11-16'], estDirty: false, t: Date.now() })]]);
  const filaCtx = vm.createContext({
    localStorage: { getItem: (k) => lsSnap.get(k) ?? null, setItem: (k, v) => lsSnap.set(k, String(v)), removeItem: (k) => lsSnap.delete(k) },
    Date, Math, Map, Set, Array, Object, String, Number, Error, Promise, JSON,
    setTimeout, clearTimeout, setInterval: () => 0, module: { exports: {} },
  });
  vm.runInContext(ler('build/sync-fila.js'), filaCtx);
  const rf = filaCtx.module.exports;
  const dirtySnap = new Set();
  let estDirtySnap = false;
  const overSnap = { q1: 'tor' }, cfgSnap = { diario: 20 };
  rf.conectaProgresso({
    get: () => ({ all: [], over: overSnap, cfg: cfgSnap, cards: [], fcs: {}, ia: {}, pon: {}, fcAv: {}, uimg: {}, metodo: '', metoU: 0, estU: 1000, resetAt: 0, dirty: dirtySnap, estDirty: estDirtySnap, hk: () => 0, wkKey: () => '2026-11-16', packLog: (l) => l }),
    setEstDirty: (v) => { estDirtySnap = !!v; },
    applyEstado() {}, mergeLogItems: () => false, mergeFcs: () => false, mergeCards: () => false, mergeAv: () => false, mergePon: () => false, mergeIa: () => false, applyMetodo() {}, mergeUimg: () => false, onHidratou() {},
  });
  assert.ok(dirtySnap.has('2026-11-16'));
  assert.equal(estDirtySnap, false);
  assert.equal(rf.estadoMudou(overSnap, cfgSnap, 0), false, 'dirty de log sem estDirty não marca estadoMudou');
});
