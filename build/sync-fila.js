// Radio 1.65.0: fila durável unificada em IndexedDB (Notas, Progresso, Semana), reenvio automático,
// backoff de rate limit/chave, faixa fixa >10 min/erro, detalhes, exportação JSON e beforeunload.
(function (root) {
  const DB_NOME = 'bcbr-fila', STORE = 'fila', LS_META = 'bcbr_fila_meta', LS_PROG = 'bcbr_fila_prog';
  const DEZ_MIN = 10 * 60 * 1000;
  const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  const fmtHora = (ms) => {
    const d = new Date(ms);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };
  const tokAtual = () => { try { return localStorage.getItem('bcbr_gh_token') || ''; } catch (e) { return ''; } };

  let dbRef = null, dbAbrindo = null, hidratando = null, drenando = null;
  let writesEmCurso = Promise.resolve();
  let conflitoAte = 0, conflitoDesc = '', ultimoErro = '', uiTimer = null, retryTimer = null;
  let falhasSeguidas = 0, backoffAte = 0, hidratouDb = false;
  const memMap = new Map();
  const hidratadores = { progresso: null, semana: null };
  const hidratadosTipos = { progresso: false, semana: false };
  const drenadores = [];

  function abrirDb() {
    if (dbRef) return Promise.resolve(dbRef);
    if (dbAbrindo) return dbAbrindo;
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    dbAbrindo = new Promise((ok) => {
      try {
        const req = indexedDB.open(DB_NOME, 1);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
        };
        req.onsuccess = () => { dbRef = req.result; ok(dbRef); };
        req.onerror = () => ok(null);
        req.onblocked = () => ok(null);
      } catch (e) { ok(null); }
    });
    return dbAbrindo;
  }

  function idbOp(modo, fn) {
    if (dbRef) {
      return new Promise((ok) => {
        try {
          const tx = dbRef.transaction(STORE, modo);
          const st = tx.objectStore(STORE);
          const r = fn(st);
          tx.oncomplete = () => ok(r && 'result' in r ? r.result : true);
          tx.onerror = tx.onabort = () => ok(null);
        } catch (e) { ok(null); }
      });
    }
    return abrirDb().then((d) => {
      if (!d) return null;
      return new Promise((ok) => {
        try {
          const tx = d.transaction(STORE, modo);
          const st = tx.objectStore(STORE);
          const r = fn(st);
          tx.oncomplete = () => ok(r && 'result' in r ? r.result : true);
          tx.onerror = tx.onabort = () => ok(null);
        } catch (e) { ok(null); }
      });
    });
  }

  function espelhaMetaLS() {
    try {
      const lista = [...memMap.values()].map((r) => ({
        id: r.id, tipo: r.tipo, titulo: r.titulo, detalhe: r.detalhe || '',
        criadoEm: r.criadoEm, atualizadoEm: r.atualizadoEm, rev: r.rev, erro: r.erro || ''
      }));
      if (lista.length) localStorage.setItem(LS_META, JSON.stringify(lista));
      else localStorage.removeItem(LS_META);
    } catch (e) {}
  }

  // Hidratação síncrona mínima do localStorage antes do primeiro render.
  try {
    const rawMeta = localStorage.getItem(LS_META);
    if (rawMeta) {
      const l = JSON.parse(rawMeta);
      if (Array.isArray(l)) l.forEach((r) => { if (r && r.id) memMap.set(r.id, r); });
    }
  } catch (e) {}

  function gravaItem(rec) {
    if (!rec || !rec.id) return Promise.resolve(false);
    const ant = memMap.get(rec.id);
    const agora = Date.now();
    const item = {
      id: rec.id,
      tipo: rec.tipo || 'outro',
      titulo: rec.titulo || rec.id,
      detalhe: rec.detalhe || '',
      criadoEm: ant?.criadoEm || rec.criadoEm || agora,
      atualizadoEm: rec.atualizadoEm || agora,
      rev: rec.rev != null ? rec.rev : agora,
      payload: rec.payload !== undefined ? clone(rec.payload) : ant?.payload,
      erro: rec.erro != null ? rec.erro : (ant?.erro || ''),
    };
    memMap.set(item.id, item);
    espelhaMetaLS();
    const p = idbOp('readwrite', (st) => st.put(item)).then((ok) => !!ok);
    writesEmCurso = writesEmCurso.then(() => p).catch(() => {});
    atualizaUI();
    return p;
  }

  function confirmaItem(id, rev) {
    const cur = memMap.get(id);
    if (!cur) return Promise.resolve(true);
    if (rev != null && cur.rev != null && cur.rev !== rev) return Promise.resolve(false);
    memMap.delete(id);
    espelhaMetaLS();
    if (!contar()) {
      clearTimeout(retryTimer);
      retryTimer = null;
      backoffAte = 0;
    }
    const p = idbOp('readwrite', (st) => st.delete(id)).then(() => true);
    writesEmCurso = writesEmCurso.then(() => p).catch(() => {});
    atualizaUI();
    return p;
  }

  function salvaSnapshotProgLS(snap) {
    try {
      if (!snap || (!snap.dirty?.length && !snap.estDirty)) localStorage.removeItem(LS_PROG);
      else localStorage.setItem(LS_PROG, JSON.stringify(snap));
    } catch (e) {}
  }

  function leSnapshotProgLS() {
    try {
      const raw = localStorage.getItem(LS_PROG);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function aplicaHidratador(tipo) {
    if (!hidratouDb || hidratadosTipos[tipo] || typeof hidratadores[tipo] !== 'function') return;
    hidratadosTipos[tipo] = true;
    if (tipo === 'semana') {
      try { hidratadores.semana(memMap.get('semana:plano') || null); } catch (e) {}
    } else if (tipo === 'progresso') {
      const progs = [...memMap.values()].filter((r) => r.tipo === 'progresso');
      try { hidratadores.progresso(progs, leSnapshotProgLS()); } catch (e) {}
    }
  }

  function hidrata() {
    if (hidratando) return hidratando;
    hidratando = (async () => {
      try { await abrirDb(); } catch (e) {}
      const todos = await idbOp('readonly', (st) => st.getAll());
      if (Array.isArray(todos)) {
        for (const r of todos) {
          if (!r || !r.id) continue;
          const cur = memMap.get(r.id);
          if (!cur || !cur.payload || (r.atualizadoEm || 0) >= (cur.atualizadoEm || 0)) {
            memMap.set(r.id, r);
          }
        }
        espelhaMetaLS();
      }
      if (typeof SyncNotas !== 'undefined' && SyncNotas.pronto) {
        await SyncNotas.pronto.catch(() => {});
      }
      hidratouDb = true;
      aplicaHidratador('semana');
      aplicaHidratador('progresso');
      atualizaUI();
      if (typeof window !== 'undefined' && contar() > 0 && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
        setTimeout(() => { if (contar() > 0) tentarAgora('abertura'); }, 0);
      }
      return true;
    })();
    return hidratando;
  }

  function listar(comPayload = false) {
    const mapa = new Map();
    const poe = (r) => {
      if (!r || !r.id) return;
      const ant = mapa.get(r.id);
      if (!ant) { mapa.set(r.id, { ...r }); return; }
      mapa.set(r.id, {
        ...ant,
        ...r,
        criadoEm: Math.min(ant.criadoEm || r.criadoEm || Date.now(), r.criadoEm || ant.criadoEm || Date.now()),
        atualizadoEm: Math.max(ant.atualizadoEm || 0, r.atualizadoEm || 0),
        payload: r.payload !== undefined ? r.payload : ant.payload,
      });
    };

    for (const r of memMap.values()) {
      if (r.tipo === 'nota' && typeof SyncNotas !== 'undefined') continue;
      if (r.tipo === 'progresso' && typeof dirty !== 'undefined') {
        const k = r.id.slice(5);
        if (k === 'estado' && typeof estDirty !== 'undefined' && !estDirty) continue;
        if (k !== 'estado' && !dirty.has(k)) continue;
      }
      if (r.tipo === 'semana' && typeof SM !== 'undefined' && !SM.sujo) continue;
      poe(comPayload ? r : { id: r.id, tipo: r.tipo, titulo: r.titulo, detalhe: r.detalhe, criadoEm: r.criadoEm, atualizadoEm: r.atualizadoEm, erro: r.erro });
    }

    if (typeof SyncNotas !== 'undefined' && typeof SyncNotas.pendentesDetalhe === 'function') {
      for (const n of SyncNotas.pendentesDetalhe(comPayload)) poe(n);
    }
    if (typeof SM !== 'undefined' && SM.sujo) {
      const m = memMap.get('semana:plano');
      const msgs = Array.isArray(SM.pendMsgs) && SM.pendMsgs.length ? SM.pendMsgs.join(', ') : (m?.detalhe || 'Alterações no plano');
      poe({
        id: 'semana:plano', tipo: 'semana', titulo: 'Semana / Tarefas', detalhe: msgs,
        criadoEm: SM.sujoDesde || m?.criadoEm || Date.now(),
        atualizadoEm: m?.atualizadoEm || Date.now(),
        erro: SM.erro || '',
        ...(comPayload ? { payload: { d: SM.d, base: SM.base } } : {}),
      });
    }
    if (typeof dirty !== 'undefined') {
      const addProg = (k, titulo, payload) => {
        const id = 'prog:' + k, m = memMap.get(id);
        poe({
          id, tipo: 'progresso', titulo: m?.titulo || titulo, detalhe: m?.detalhe || '',
          criadoEm: m?.criadoEm || Date.now(), atualizadoEm: m?.atualizadoEm || Date.now(),
          erro: m?.erro || '', ...(comPayload ? { payload: payload !== undefined ? payload : m?.payload } : {}),
        });
      };
      if (typeof estDirty !== 'undefined' && estDirty) addProg('estado', 'Configurações e blocos', typeof cfg !== 'undefined' ? { over, cfg, u: estU, resetAt } : undefined);
      for (const k of dirty) {
        let tit = 'Progresso (' + k + ')';
        if (/^\d{4}-\d{2}-\d{2}$/.test(k)) tit = 'Questões respondidas (' + k + ')';
        else if (k.startsWith('s:')) tit = 'Revisões de flashcards';
        else if (k.startsWith('c:')) tit = 'Cartões de flashcards';
        else if (k === 'av:0') tit = 'Avaliações de flashcards';
        else if (k.startsWith('p:')) tit = 'Edições / pontos de ensino';
        else if (k.startsWith('i:')) tit = 'Comentários de IA';
        else if (k.startsWith('m:')) tit = 'Manual metodológico';
        else if (k.startsWith('g:')) tit = 'Imagens do usuário';
        addProg(k, tit, comPayload && progBridge ? docPayload(k, progBridge.get()) : undefined);
      }
    }
    return [...mapa.values()].sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0));
  }

  function contar() { return listar(false).length; }
  function temPendencia() {
    if (typeof NT !== 'undefined' && NT.sujo) return true;
    return contar() > 0;
  }
  function idadeMaxMs(agora = Date.now()) {
    const l = listar(false);
    if (!l.length) return 0;
    let min = Infinity;
    for (const x of l) min = Math.min(min, x.criadoEm || agora);
    return Math.max(0, agora - min);
  }

  function descreveErro(e) {
    if (!e) return '';
    if (e.chave || e.status === 401 || (e.status === 403 && !e.limite)) return 'Chave do GitHub inválida ou vencida → Config › Sincronização';
    if (e.limite || e.status === 429) return e.ate ? ('Limite do GitHub, tenta às ' + fmtHora(e.ate)) : 'Limite do GitHub';
    if ((typeof navigator !== 'undefined' && navigator.onLine === false) || (!e.status && (e.name === 'TypeError' || /fetch|network|offline|conex/i.test(e.message || '')))) return 'Sem internet';
    return String(e.message || 'Erro de sincronização');
  }

  function estadoResumo(agora = Date.now()) {
    const b = (typeof window !== 'undefined' && window.BCBR) || {};
    const l = listar(false), n = l.length;
    const idade = l.reduce((mx, x) => Math.max(mx, Math.max(0, agora - (x.criadoEm || agora))), 0);
    const offline = (typeof navigator !== 'undefined' && navigator.onLine === false) || !!b.semRede;
    const chaveErro = !!(b.chaveErro && (!b.chaveErroToken || b.chaveErroToken === tokAtual()));
    const limite = (b.pausaAte || 0) > agora;
    const ntResumo = typeof SyncNotas !== 'undefined' && SyncNotas.resumo ? SyncNotas.resumo() : null;
    const enviando = !!drenando || !!ntResumo?.enviando || (typeof syncSt !== 'undefined' && syncSt === 'saving') || (typeof RD !== 'undefined' && RD.enviando > 0);
    const conectado = typeof DB !== 'undefined' && !!DB;
    const volatil = !!ntResumo?.volatil;
    const basePend = n === 1 ? '1 alteração pendente — salva neste PC' : `${n} alterações pendentes — salvas neste PC`;
    const erroRaw = ntResumo?.erro || (typeof SM !== 'undefined' && SM.erro) || (typeof RD !== 'undefined' && RD.erro) || ultimoErro || '';

    let cls = 'local', texto = 'Só neste aparelho', faixaTexto = '', mostrarFaixa = false;
    if (chaveErro) {
      cls = 'err';
      texto = 'Chave do GitHub inválida ou vencida → Config › Sincronização';
      mostrarFaixa = true;
      faixaTexto = texto + (n ? ` (${n} ${n === 1 ? 'pendente — salva neste PC' : 'pendentes — salvas neste PC'})` : '');
    } else if (limite) {
      cls = 'err';
      texto = b.limiteMsg || ('Limite do GitHub, tenta às ' + fmtHora(b.pausaAte));
      if (n > 0 && idade >= DEZ_MIN) {
        mostrarFaixa = true;
        faixaTexto = `${basePend} · ${texto}`;
      }
    } else if (volatil) {
      cls = 'err';
      texto = 'Pendente — mantenha esta aba aberta';
      mostrarFaixa = true;
      faixaTexto = texto;
    } else if (n > 0) {
      cls = offline ? 'pend' : enviando ? 'saving' : 'pend';
      const semRedeErr = erroRaw && /^Sem internet/i.test(erroRaw);
      texto = offline ? `${basePend} · Sem internet` : enviando ? 'Salvando…' : (erroRaw && !semRedeErr ? `${basePend} · ${erroRaw}` : basePend);
      if (idade >= DEZ_MIN) {
        mostrarFaixa = true;
        const mins = Math.max(10, Math.floor(idade / 60000));
        faixaTexto = `${basePend} (há ${mins} min)` + (offline ? ' · Sem internet' : erroRaw ? ' · ' + erroRaw : '');
      }
    } else if (offline) {
      cls = 'pend';
      texto = 'Sem internet';
    } else if (conflitoAte > agora) {
      cls = 'ok';
      texto = 'Conflito resolvido';
    } else if (conectado) {
      cls = 'ok';
      texto = 'Sincronizado';
    }

    return {
      cls, texto, chaveErro, limite, offline, enviando, conectado,
      conflito: conflitoAte > agora, conflitoDesc, pendentes: n, idadeMaxMs: idade,
      mostrarFaixa, faixaTexto, erro: erroRaw,
    };
  }

  function pintaFaixa(est) {
    if (typeof document === 'undefined') return;
    const fx = document.getElementById('rd_faixa');
    if (!fx) return;
    if (!est.mostrarFaixa) {
      fx.hidden = true;
      return;
    }
    fx.hidden = false;
    fx.className = 'rd-faixa ' + (est.chaveErro ? 'rd-fx-erro' : 'rd-fx-aviso');
    const escFn = typeof esc === 'function' ? esc : (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const msg = est.faixaTexto || est.texto;
    const chaveHtml = est.chaveErro ? '<button type="button" class="b s rd-fx-bt" onclick="rdIrConfigSync()">Config › Sincronização</button>' : '';
    const html = `<span class="rd-fx-txt">${escFn(msg)}</span><span class="rd-fx-bts">${chaveHtml}<button type="button" class="b s rd-fx-bt" onclick="rdTentarAgora()">Tentar agora</button><button type="button" class="b s rd-fx-bt" onclick="rdSyncAbre()">Ver detalhes</button></span>`;
    if (fx.innerHTML !== html) fx.innerHTML = html;
  }

  function atualizaUI() {
    if (typeof document === 'undefined') return;
    const est = estadoResumo();
    const el = document.getElementById('sync');
    if (el) {
      el.className = est.cls;
      el.title = est.texto;
      const sp = el.querySelector('span');
      if (sp && sp.textContent !== est.texto) sp.textContent = est.texto;
    }
    if (typeof rdPinta === 'function') rdPinta(est);
    pintaFaixa(est);
    if (typeof ofPinta === 'function') ofPinta();
  }

  function marcaConflitoResolvido(desc = '') {
    conflitoAte = Date.now() + 8000;
    conflitoDesc = desc;
    atualizaUI();
    clearTimeout(uiTimer);
    uiTimer = setTimeout(atualizaUI, 8200);
    if (typeof uiTimer?.unref === 'function') uiTimer.unref();
  }

  function agendaRetry(atrasoMs) {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      if (contar() > 0) tentarAgora('backoff');
    }, Math.max(500, atrasoMs));
    if (typeof retryTimer?.unref === 'function') retryTimer.unref();
  }

  function aoFalhar(e) {
    ultimoErro = descreveErro(e);
    falhasSeguidas++;
    const b = (typeof window !== 'undefined' && window.BCBR) || {};
    if (e?.limite || e?.status === 429 || (b.pausaAte || 0) > Date.now()) {
      const espera = Math.max(1000, (b.pausaAte || Date.now() + 60000) - Date.now() + 500);
      agendaRetry(espera);
    } else if (!(e?.chave || e?.status === 401 || e?.status === 403)) {
      const espera = e?.status >= 500 ? Math.min(300000, 30000 * Math.pow(2, Math.min(3, falhasSeguidas - 1))) : 30000;
      if (e?.status >= 500) backoffAte = Date.now() + espera;
      agendaRetry(espera);
    }
    atualizaUI();
  }

  async function tentarAgora(motivo = 'manual') {
    await hidrata();
    await writesEmCurso;
    const b = (typeof window !== 'undefined' && window.BCBR) || {};
    if ((b.pausaAte || 0) > Date.now()) {
      atualizaUI();
      agendaRetry(b.pausaAte - Date.now() + 500);
      return false;
    }
    if (motivo === 'manual' || motivo === 'online' || motivo === 'chave') {
      backoffAte = 0;
      falhasSeguidas = 0;
    }
    if (motivo === 'manual') {
      b.limpaChaveErro?.();
      b.semRede = false;
      ultimoErro = '';
    } else {
      if (b.chaveErro && (!b.chaveErroToken || b.chaveErroToken === tokAtual())) { atualizaUI(); return false; }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { atualizaUI(); return false; }
      if (motivo === 'timer30s' && backoffAte > Date.now()) { atualizaUI(); return false; }
    }
    if (drenando) return drenando;
    drenando = (async () => {
      let tudoOk = true;
      atualizaUI();
      try {
        const podeSeguir = () => !((b.pausaAte || 0) > Date.now()) && !(b.chaveErro && (!b.chaveErroToken || b.chaveErroToken === tokAtual())) && !b.semRede;
        if (typeof SyncNotas !== 'undefined') {
          const okN = await SyncNotas.enviar();
          if (okN === false) tudoOk = false;
        }
        if (podeSeguir() && typeof flush === 'function' && ((typeof dirty !== 'undefined' && dirty.size) || (typeof estDirty !== 'undefined' && estDirty))) {
          const okF = await flush();
          if (okF === false) tudoOk = false;
        }
        if (podeSeguir() && typeof SM !== 'undefined' && SM.sujo && typeof smEnviaSujoSync === 'function') {
          const okS = await smEnviaSujoSync();
          if (okS === false) tudoOk = false;
        }
        for (const fn of drenadores) {
          try { if ((await fn()) === false) tudoOk = false; } catch (e) { tudoOk = false; }
        }
        if (tudoOk && !contar()) {
          backoffAte = 0;
          falhasSeguidas = 0;
          ultimoErro = '';
          if (typeof SM !== 'undefined') SM.erro = '';
          if (typeof RD !== 'undefined') RD.erro = '';
        }
        return tudoOk;
      } finally {
        drenando = null;
        atualizaUI();
      }
    })();
    return drenando;
  }

  function registraHidratador(tipo, fn) {
    hidratadores[tipo] = fn;
    hidratadosTipos[tipo] = false;
    if (hidratouDb) aplicaHidratador(tipo);
  }
  function registraDrenador(fn) { drenadores.push(fn); }

  let progBridge = null, ultEstSnap = '';
  const progRevs = Object.create(null);
  function estadoSnap(over, cfg, resetAt) {
    try { return JSON.stringify({ over, cfg, resetAt }); } catch (e) { return ''; }
  }
  function revProgresso(k) { return progRevs[k] || 0; }
  function docPayload(k, st) {
    if (k === 'estado') return { over: st.over, cfg: st.cfg, u: st.estU, resetAt: st.resetAt };
    if (k.startsWith('c:')) { const n = +k.slice(2); return { items: st.cards.filter((c) => !c._rs && st.hk(c.id, 32) === n).map((c) => [c.id, c.f, c.v, c.tg || '', c.u || 0, c.x ? 1 : 0]) }; }
    if (k.startsWith('g:')) { const id = k.slice(2); return st.uimg[id] ? { d: st.uimg[id] } : null; }
    if (k.startsWith('m:')) return { t: st.metodo, u: st.metoU };
    if (k.startsWith('p:')) { const n = +k.slice(2), o = {}; Object.keys(st.pon).forEach((id) => { if (st.hk(id, 8) === n) o[id] = st.pon[id]; }); return { m: o }; }
    if (k.startsWith('i:')) { const n = +k.slice(2), o = {}; Object.keys(st.ia).forEach((id) => { if (st.hk(id, 8) === n) o[id] = st.ia[id]; }); return { m: o }; }
    if (k.startsWith('s:')) { const n = +k.slice(2), o = {}; Object.keys(st.fcs).forEach((id) => { if (st.hk(id, 8) === n) o[id] = st.fcs[id]; }); return { s: o }; }
    if (k === 'av:0') return { items: st.fcAv || {} };
    return { items: st.all.filter((l) => st.wkKey(l.t) === k).map(st.packLog) };
  }
  function docTitulo(k) {
    if (k === 'estado') return 'Configurações e blocos';
    if (/^\d{4}-\d{2}-\d{2}$/.test(k)) return 'Questões respondidas (' + k + ')';
    if (k.startsWith('s:')) return 'Revisões de flashcards';
    if (k.startsWith('c:')) return 'Cartões de flashcards';
    if (k === 'av:0') return 'Avaliações de flashcards';
    if (k.startsWith('p:')) return 'Edições / pontos de ensino';
    if (k.startsWith('i:')) return 'Comentários de IA';
    if (k.startsWith('m:')) return 'Manual metodológico';
    if (k.startsWith('g:')) return 'Imagens do usuário';
    return 'Progresso (' + k + ')';
  }
  function conectaProgresso(bridge) {
    progBridge = bridge;
    const st = bridge.get();
    ultEstSnap = estadoSnap(st.over, st.cfg, st.resetAt);
    const snapLS = leSnapshotProgLS();
    if (snapLS) {
      (snapLS.dirty || []).forEach((k) => { if (!st.dirty.has(k)) st.dirty.add(k); });
      if (snapLS.estDirty && !st.estDirty) st.setEstDirty(true);
      if (snapLS.estDirty) ultEstSnap = '';
    }
    registraHidratador('progresso', (itens, lsSnap) => {
      if (!progBridge) return;
      const cur = progBridge.get();
      let hidratou = false;
      if (lsSnap) {
        (lsSnap.dirty || []).forEach((k) => cur.dirty.add(k));
        if (lsSnap.estDirty) cur.setEstDirty(true);
      }
      if (Array.isArray(itens) && itens.length) {
        for (const r of itens) {
          const k = r.id.slice(5);
          if (r.rev != null) progRevs[k] = Math.max(progRevs[k] || 0, Number(r.rev) || 0);
          if (k === 'estado') { cur.setEstDirty(true); ultEstSnap = ''; }
          else cur.dirty.add(k);
          if (r.payload) {
            const p = r.payload;
            if (k === 'estado') {
              if ((p.u || 0) >= (cur.estU || 0)) {
                cur.applyEstado(p);
                hidratou = true;
              }
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Array.isArray(p.items)) {
              if (cur.mergeLogItems(p.items)) hidratou = true;
            } else if (k.startsWith('fcs_') || k.startsWith('s:')) {
              if (p.s && cur.mergeFcs(p.s)) hidratou = true;
            } else if (k.startsWith('c:') && Array.isArray(p.items)) {
              if (cur.mergeCards(p.items)) hidratou = true;
            } else if (k === 'av:0' && p.items) {
              if (cur.mergeAv(p.items)) hidratou = true;
            } else if (k.startsWith('p:') && p.m) {
              if (cur.mergePon(p.m)) hidratou = true;
            } else if (k.startsWith('i:') && p.m) {
              if (cur.mergeIa(p.m)) hidratou = true;
            } else if (k.startsWith('m:') && p.t != null) {
              if ((p.u || 0) >= (cur.metoU || 0)) { cur.applyMetodo(p); hidratou = true; }
            } else if (k.startsWith('g:') && p.d) {
              if (cur.mergeUimg(k.slice(2), p.d)) hidratou = true;
            }
          }
        }
      }
      if (hidratou) cur.onHidratou();
    });
  }
  function persisteProgresso(wk) {
    if (!progBridge) return;
    const st = progBridge.get();
    const chaves = new Set(st.dirty);
    if (wk && wk !== '_est') chaves.add(wk);
    if (st.estDirty) chaves.add('estado');
    ultEstSnap = estadoSnap(st.over, st.cfg, st.resetAt);
    salvaSnapshotProgLS({ dirty: [...st.dirty], estDirty: !!st.estDirty, t: Date.now() });
    const agora = Date.now();
    for (const k of chaves) {
      const payload = docPayload(k, st);
      if (!payload) continue;
      const ex = memMap.get('prog:' + k);
      if (!wk && ex && ex.payload !== undefined && JSON.stringify(ex.payload) === JSON.stringify(payload)) continue;
      progRevs[k] = (progRevs[k] || 0) + 1;
      gravaItem({ id: 'prog:' + k, tipo: 'progresso', titulo: docTitulo(k), rev: progRevs[k], atualizadoEm: agora, payload });
    }
  }
  function confirmaProgresso(k, rev) {
    if (progBridge) {
      const st = progBridge.get();
      salvaSnapshotProgLS({ dirty: [...st.dirty], estDirty: !!st.estDirty, t: Date.now() });
    }
    confirmaItem('prog:' + k, rev);
  }
  function estadoMudou(over, cfg, resetAt) {
    return estadoSnap(over, cfg, resetAt) !== ultEstSnap;
  }
  function marcaEstadoLimpo(over, cfg, resetAt) {
    ultEstSnap = estadoSnap(over, cfg, resetAt);
  }
  function reconciliaRemoto(docs, st) {
    const remById = new Map(docs.map((d) => [d.id, d.data() || {}]));
    // log_<wk>: detecta itens faltando OU anulados localmente (l.x)
    const weeks = new Set(st.all.map((l) => st.wkKey(l.t)));
    for (const w of weeks) {
      const rem = remById.get('log_' + w)?.items || [];
      const rm = new Map(rem.map((a) => [a[0] + '|' + a[1], a]));
      for (const l of st.all) {
        if (st.wkKey(l.t) !== w) continue;
        const r = rm.get(l.q + '|' + l.t);
        if (!r || ((l.x ? 1 : 0) !== (r[6] ? 1 : 0))) { st.dirty.add(w); break; }
      }
    }
    // cards_<k>: compara u por id
    const cBuckets = new Set(st.cards.filter((c) => !c._rs).map((c) => st.hk(c.id, 32)));
    for (const k of cBuckets) {
      const rm = new Map((remById.get('cards_' + k)?.items || []).map((a) => [a[0], a]));
      for (const c of st.cards) {
        if (c._rs || st.hk(c.id, 32) !== k) continue;
        const r = rm.get(c.id);
        if (!r || (c.u || 0) > (r[4] || 0)) { st.dirty.add('c:' + k); break; }
      }
    }
    // fcs_<k>: compara s[5] por id
    for (const id of Object.keys(st.fcs)) {
      const k = st.hk(id, 8), rs = remById.get('fcs_' + k)?.s || {};
      const r = rs[id];
      if (!r || (st.fcs[id][5] || 0) > (r[5] || 0)) st.dirty.add('s:' + k);
    }
    // pon_<k>: compara .u por id
    for (const id of Object.keys(st.pon)) {
      const k = st.hk(id, 8), rm = remById.get('pon_' + k)?.m || {};
      const r = rm[id];
      if (!r || (st.pon[id].u || 0) > (r.u || 0)) st.dirty.add('p:' + k);
    }
    // ia_<k>: faltando no remoto
    for (const id of Object.keys(st.ia)) {
      const k = st.hk(id, 8), rm = remById.get('ia_' + k)?.m || {};
      if (!rm[id]) st.dirty.add('i:' + k);
    }
  }

  function exportarObjeto() {
    return {
      geradoEm: new Date().toISOString(),
      versao: (typeof window !== 'undefined' && window.BCBR_VERSAO) || '',
      estado: estadoResumo(),
      pendentes: listar(true),
    };
  }

  const api = {
    abrirDb, gravaItem, confirmaItem, salvaSnapshotProgLS, leSnapshotProgLS,
    hidrata, pronto: () => hidrata(),
    listar, contar, temPendencia, idadeMaxMs, estadoResumo, atualizaUI,
    marcaConflitoResolvido, aoFalhar, tentarAgora, descreveErro,
    registraHidratador, registraDrenador, exportarObjeto,
    conectaProgresso, persisteProgresso, confirmaProgresso, revProgresso,
    estadoSnap, estadoMudou, marcaEstadoLimpo, reconciliaRemoto,
    _mem: memMap,
  };

  if (typeof window !== 'undefined') {
    window.RadioFila = api;
    window.addEventListener('bcbr-sync-estado', atualizaUI);
    window.addEventListener('online', () => {
      if (window.BCBR) window.BCBR.semRede = false;
      falhasSeguidas = 0;
      tentarAgora('online');
    });
    window.addEventListener('offline', atualizaUI);
    window.addEventListener('pageshow', () => { if (contar()) tentarAgora('pageshow'); });
    window.addEventListener('beforeunload', (e) => {
      if (typeof ntAntes === 'function') ntAntes();
      if (temPendencia()) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    });
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          if (contar()) tentarAgora('visivel');
          atualizaUI();
        }
      });
    }
    setInterval(() => {
      if (contar() > 0) tentarAgora('timer30s');
      else if (conflitoAte > 0 || (window.BCBR?.pausaAte || 0) > 0) atualizaUI();
    }, 30000);
    setInterval(() => {
      if (contar() > 0 || conflitoAte > 0) atualizaUI();
    }, 5000);
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RadioFila = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
