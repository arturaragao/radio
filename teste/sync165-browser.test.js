// Radio 1.65.0 no Chrome: aceitação da sincronização durável em IndexedDB,
// offline + reload + volta online, 401/403 chave, 403 rate limit sem martelar,
// conflito 409 mesclado sem perda, faixa fixa >10 min, detalhes, exportar JSON e beforeunload.
// Dados inteiramente fictícios.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { iniciar, espera } = require('./chrome-util.js');

test('Radio 1.65.0: sincronização que nunca perde nada (navegador, GitHub simulado)', { timeout: 240000 }, async (t) => {
  const C = await iniciar({ porta: 8811, sw: true, largura: 1280, altura: 900, env: { BCBR_QS: '10' } });
  t.after(() => C.fim());
  const { ev, call, click, ate } = C;

  const INST_SCRIPT = `(()=>{
    if(window.__inst165)return;window.__inst165=true;
    const origFetch=window.fetch.bind(window);
    window.__origFetch165=origFetch;
    window.__rlHits165=0;
    try{
      Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>localStorage.getItem('__off165')!=='1'});
    }catch(e){}
    window.fetch=async(u,o)=>{
      const s=String(u);
      if(s.includes('/api/')){
        if(localStorage.getItem('__off165')==='1')throw new TypeError('Failed to fetch');
        const mode=localStorage.getItem('__mode165')||'';
        if(mode==='401')return new Response('{"message":"Bad credentials"}',{status:401,headers:{'content-type':'application/json'}});
        if(mode==='403_key')return new Response('{"message":"Resource not accessible by personal access token"}',{status:403,headers:{'content-type':'application/json'}});
        if(mode==='403_rl'){
          window.__rlHits165++;
          const rst=Math.floor(Date.now()/1000)+180;
          return new Response('{"message":"API rate limit exceeded"}',{status:403,headers:{'content-type':'application/json','x-ratelimit-remaining':'0','x-ratelimit-reset':String(rst)}});
        }
        const iProg=s.indexOf('/contents/progresso/');
        const mProg=iProg>=0&&s.endsWith('.json')?s.slice(iProg+20):null;
        if(o&&o.method==='PUT'&&mProg){
          const r=await origFetch(u,o);
          if(r.ok){
            const j=await r.clone().json();
            const map=JSON.parse(localStorage.getItem('__progList165')||'{}');
            map[decodeURIComponent(mProg)]=j.content.sha;
            localStorage.setItem('__progList165',JSON.stringify(map));
          }
          return r;
        }
        if(s.endsWith('/contents/progresso')){
          const map=JSON.parse(localStorage.getItem('__progList165')||'{}');
          const arr=Object.entries(map).map(([name,sha])=>({name,sha,type:'file'}));
          return new Response(JSON.stringify(arr),{status:200,headers:{'content-type':'application/json'}});
        }
        const iBlob=s.indexOf('/git/blobs/');
        if(iBlob>=0){
          const shaReq=decodeURIComponent(s.slice(iBlob+11).split('?')[0]);
          const map=JSON.parse(localStorage.getItem('__progList165')||'{}');
          const hit=Object.entries(map).find(([,sha])=>sha===shaReq);
          if(hit){
            const fr=await origFetch('/api/repos/arturaragao/banco-cbr-app/contents/progresso/'+encodeURIComponent(hit[0]));
            if(fr.ok){
              const j=await fr.json();
              const txt=decodeURIComponent(escape(atob(j.content.replace(/\\s+/g,''))));
              return new Response(txt,{status:200,headers:{'content-type':'application/json'}});
            }
          }
        }
      }
      return origFetch(u,o);
    };
  })();`;
  await call('Page.addScriptToEvaluateOnNewDocument', { source: INST_SCRIPT });

  await C.abre('notas');
  await ate("typeof NT!=='undefined'&&!!NT.ed&&!NT.carregando&&typeof RadioFila!=='undefined'");

  // Semeia nota inicial e RI de hoje confirmados no servidor simulado
  await ev(`(async()=>{
    const ag=new Date().toISOString();
    riHoje();
    SyncNotas.salvarPagina({id:'notas',titulo:'Notas',pasta:'',ordem:0,atualizado:ag,doc:{v:1,blocos:[{id:'b1',atualizado:ag,conteudo:{type:'paragraph',attrs:{id:'b1'},content:[{type:'text',text:'Inicial'}]}}]}});
    await SyncNotas.enviar();
    await RadioFila.tentarAgora('manual');
  })()`);
  await ate("RadioFila.contar()===0");

  await t.test('1. Offline: editar nota + responder questão -> fila IndexedDB ("2 alterações pendentes"), recarregar mantém fila/texto e voltar online envia tudo', async (st) => {
    st.after(() => ev("localStorage.removeItem('__off165');localStorage.removeItem('__mode165');0").catch(() => {}));
    await ev("localStorage.setItem('__off165','1');window.dispatchEvent(new Event('offline'));0");
    await ate("document.querySelector('#sync span').textContent.includes('Sem internet')");

    // Edita nota offline
    await ev("NT.ed.commands.setContent({type:'doc',content:[{type:'paragraph',attrs:{id:'b1'},content:[{type:'text',text:'Editado offline 165'}]}]},{emitUpdate:true});ntAntes();0");
    // Responde questão offline (modo 'banco' altera apenas o log, sem sujar estado/RI)
    await ev("iniciar([Q[0].id],'banco');responder(Q[0].gab,'certeza');0");
    await ate("RadioFila.contar()===2", 5000);

    const stOff = await ev(`(async()=>{
      const idbItens=await new Promise(ok=>{const r=indexedDB.open('bcbr-fila',1);r.onsuccess=()=>{const g=r.result.transaction('fila').objectStore('fila').getAll();g.onsuccess=()=>ok(g.result);g.onerror=()=>ok([])};r.onerror=()=>ok([])});
      const notasIdb=await new Promise(ok=>{const r=indexedDB.open('bcbr',1);r.onsuccess=()=>{const g=r.result.transaction('kv').objectStore('kv').get('notas:fila:idx');g.onsuccess=()=>ok(g.result||[]);g.onerror=()=>ok([])};r.onerror=()=>ok([])});
      const evBu=new Event('beforeunload',{cancelable:true});
      window.dispatchEvent(evBu);
      return {
        syncTxt:document.querySelector('#sync span').textContent,
        syncCls:document.getElementById('sync').className,
        cont:RadioFila.contar(),
        idbIds:idbItens.map(x=>x.id).sort(),
        notasIdb,
        beforeUnloadAvisou:evBu.defaultPrevented
      };
    })()`);
    assert.equal(stOff.cont, 2);
    assert.equal(stOff.syncCls, 'pend');
    assert.match(stOff.syncTxt, /^2 alterações pendentes — salvas neste PC/);
    assert.ok(stOff.idbIds.some((x) => x.startsWith('prog:')), 'questão salva no IndexedDB');
    assert.ok(stOff.notasIdb.length >= 1, 'nota salva no IndexedDB');
    assert.equal(stOff.beforeUnloadAvisou, true, 'beforeunload avisa quando há pendência');

    // Recarrega a página ainda offline
    await call('Page.navigate', { url: C.URL_ });
    await ate("typeof NT!=='undefined'&&!!NT.ed&&!NT.carregando&&typeof RadioFila!=='undefined'", 15000);
    await ate("RadioFila.contar()===2", 8000);

    const aposReload = await ev(`({
      cont:RadioFila.contar(),
      syncTxt:document.querySelector('#sync span').textContent,
      notaTxt:NT.ed.getText(),
      temResp:all.some(l=>l.q===Q[0].id&&!l.x)
    })`);
    assert.equal(aposReload.cont, 2, 'fila sobrevive ao recarregar');
    assert.match(aposReload.syncTxt, /^2 alterações pendentes — salvas neste PC/);
    assert.match(aposReload.notaTxt, /Editado offline 165/, 'texto editado aparece após recarregar');
    assert.equal(aposReload.temResp, true, 'questão respondida persiste após recarregar');

    // Volta online -> envia tudo, fila zera, "Sincronizado"
    await ev("localStorage.removeItem('__off165');window.dispatchEvent(new Event('online'));0");
    await ate("RadioFila.contar()===0&&document.getElementById('sync').classList.contains('ok')", 15000);
    assert.equal(await ev("document.querySelector('#sync span').textContent"), 'Sincronizado');

    const srv = await ev(`(async()=>{
      const p=await BCBR.api('/repos/'+BCBR.REPO+'/contents/notas/paginas/notas.json');
      const d=JSON.parse(decodeURIComponent(escape(atob(p.content.replace(/\\n/g,'')))));
      const wk=wkKey(all.find(l=>l.q===Q[0].id).t);
      const lg=await BCBR.api('/repos/'+BCBR.REPO+'/contents/progresso/log_'+wk+'.json');
      const ld=JSON.parse(decodeURIComponent(escape(atob(lg.content.replace(/\\n/g,'')))));
      return {nota:JSON.stringify(d.doc),logLen:ld.items.length};
    })()`);
    assert.match(srv.nota, /Editado offline 165/);
    assert.ok(srv.logLen >= 1);
  });

  await t.test('2. 401/403 de chave -> mensagem com Config › Sincronização e faixa fixa; 403 rate limit -> tenta às HH:MM sem martelar', async (st) => {
    st.after(() => ev("localStorage.removeItem('__off165');localStorage.removeItem('__mode165');BCBR.pausaAte=0;BCBR.limiteMsg='';BCBR.limpaChaveErro();0").catch(() => {}));
    await ev("localStorage.removeItem('__off165');localStorage.setItem('__mode165','401');go('notas');0");
    await ate("typeof NT!=='undefined'&&!!NT.ed&&!NT.carregando", 10000);
    await ev("NT.ed.commands.setContent({type:'doc',content:[{type:'paragraph',attrs:{id:'b1'},content:[{type:'text',text:'Edit 401'}]}]},{emitUpdate:true});ntAntes();RadioFila.tentarAgora('manual');0");
    await ate("document.getElementById('sync').classList.contains('err')&&!document.getElementById('rd_faixa').hidden", 8000);

    const ui401 = await ev("({sync:document.querySelector('#sync span').textContent,faixa:document.getElementById('rd_faixa').textContent,appVivo:!!document.querySelector('#app .nt')})");
    assert.equal(ui401.sync, 'Chave do GitHub inválida ou vencida → Config › Sincronização');
    assert.match(ui401.faixa, /Config › Sincronização/);
    assert.equal(ui401.appVivo, true, '401 com app ativo não destrói a tela');

    await ev("localStorage.setItem('__mode165','403_key');RadioFila.tentarAgora('manual');0");
    await ate("BCBR.chaveErroStatus===403", 5000);
    assert.equal(await ev("document.querySelector('#sync span').textContent"), 'Chave do GitHub inválida ou vencida → Config › Sincronização');

    // 403 rate limit
    await ev("localStorage.setItem('__mode165','403_rl');BCBR.limpaChaveErro();BCBR.pausaAte=0;BCBR.limiteMsg='';window.__rlHits165=0;RadioFila.tentarAgora('manual');0");
    await ate("(window.BCBR.pausaAte||0)>Date.now()", 5000);
    const uiRl = await ev("document.querySelector('#sync span').textContent");
    assert.match(uiRl, /^Limite do GitHub, tenta às \d\d:\d\d$/);

    const hitsAntes = await ev("window.__rlHits165");
    await ev("RadioFila.tentarAgora('timer30s');smPuxar().catch(()=>{});SyncNotas.enviar().catch(()=>{});0");
    await espera(400);
    assert.equal(await ev("window.__rlHits165"), hitsAntes, 'não martela durante rate limit');

    // Recupera
    await ev("localStorage.removeItem('__mode165');BCBR.pausaAte=0;BCBR.limiteMsg='';BCBR.limpaChaveErro();RadioFila.tentarAgora('manual');0");
    await ate("RadioFila.contar()===0&&document.getElementById('sync').classList.contains('ok')", 15000);
  });

  await t.test('3. Conflito 409 -> mescla bloco a bloco nas Notas e união no progresso sem perder nada', async (st) => {
    st.after(() => ev("localStorage.removeItem('__off165');localStorage.removeItem('__mode165');0").catch(() => {}));
    await ev("localStorage.removeItem('__mode165');go('notas');0");
    await ate("typeof NT!=='undefined'&&!!NT.ed&&!NT.carregando", 10000);
    await ev("localStorage.setItem('__off165','1');window.dispatchEvent(new Event('offline'));0");
    await ev("NT.ed.commands.setContent({type:'doc',content:[{type:'paragraph',attrs:{id:'b1'},content:[{type:'text',text:'Bloco b1 local 409'}]}]},{emitUpdate:true});ntAntes();0");
    await ev("iniciar([Q[1].id],'banco');responder(Q[1].gab,'certeza');0");
    await ate("RadioFila.contar()===2", 5000);

    // Outro aparelho grava direto no servidor simulado causando 409 nos dois arquivos
    await ev(`(async()=>{
      const dec=s=>JSON.parse(decodeURIComponent(escape(atob(s.replace(/\\n/g,'')))));
      const enc=o=>btoa(unescape(encodeURIComponent(JSON.stringify(o))));
      const fN=await (await window.__origFetch165('/api/repos/'+BCBR.REPO+'/contents/notas/paginas/notas.json')).json();
      const dN=dec(fN.content);
      dN.doc.blocos.push({id:'b_remoto',atualizado:new Date(Date.now()+5000).toISOString(),conteudo:{type:'paragraph',attrs:{id:'b_remoto'},content:[{type:'text',text:'Bloco remoto preservado 409'}]}});
      await window.__origFetch165('/api/repos/'+BCBR.REPO+'/contents/notas/paginas/notas.json',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({message:'remoto',sha:fN.sha,content:enc(dN)})});

      const wk=wkKey(all.find(l=>l.q===Q[1].id).t);
      const fL=await (await window.__origFetch165('/api/repos/'+BCBR.REPO+'/contents/progresso/log_'+wk+'.json')).json();
      const dL=dec(fL.content);
      dL.items.push([Q[2].id,Date.now()-500,1,'certeza',400,'hoje',0,'A']);
      await window.__origFetch165('/api/repos/'+BCBR.REPO+'/contents/progresso/log_'+wk+'.json',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({message:'remoto log',sha:fL.sha,content:enc(dL)})});
    })()`);

    await ev("localStorage.removeItem('__off165');window.dispatchEvent(new Event('online'));0");
    await ate("RadioFila.contar()===0", 15000);

    const pos409 = await ev(`(async()=>{
      const dec=s=>JSON.parse(decodeURIComponent(escape(atob(s.replace(/\\n/g,'')))));
      const fN=await BCBR.api('/repos/'+BCBR.REPO+'/contents/notas/paginas/notas.json');
      const dN=dec(fN.content);
      const wk=wkKey(all.find(l=>l.q===Q[1].id).t);
      const fL=await BCBR.api('/repos/'+BCBR.REPO+'/contents/progresso/log_'+wk+'.json');
      const dL=dec(fL.content);
      return {notaTxt:JSON.stringify(dN.doc),logIds:dL.items.map(x=>x[0]),q1Id:Q[1].id,q2Id:Q[2].id};
    })()`);
    assert.match(pos409.notaTxt, /Bloco b1 local 409/);
    assert.match(pos409.notaTxt, /Bloco remoto preservado 409/);
    assert.ok(pos409.logIds.includes(pos409.q1Id), 'resposta local preservada');
    assert.ok(pos409.logIds.includes(pos409.q2Id), 'resposta remota preservada');
  });

  await t.test('4. Pendência >10 min (relógio simulado) -> faixa fixa com Tentar agora, Ver detalhes e Exportar pendências', async (st) => {
    st.after(() => ev("localStorage.removeItem('__off165');localStorage.removeItem('__mode165');0").catch(() => {}));
    await ev("localStorage.removeItem('__off165');localStorage.removeItem('__mode165');go('notas');0");
    await ate("typeof NT!=='undefined'&&!!NT.ed&&!NT.carregando", 10000);
    await ev("localStorage.setItem('__off165','1');window.dispatchEvent(new Event('offline'));0");
    await ev("NT.ed.commands.setContent({type:'doc',content:[{type:'paragraph',attrs:{id:'b1'},content:[{type:'text',text:'Pendente 11 min'}]}]},{emitUpdate:true});ntAntes();0");
    await ate("RadioFila.contar()>=1", 5000);

    // Simula pendência com mais de 10 minutos
    await ev(`(()=>{
      const velho=Date.now()-11*60*1000;
      const e=[...RadioFila._mem.values()][0];
      if(e){e.criadoEm=velho;RadioFila.gravaItem(e)}
      const k=Object.keys(localStorage).find(x=>x.startsWith('bcbr_paginas_pendentes_v2:'));
      if(k){const o=JSON.parse(localStorage.getItem(k));o.criadoEm=velho;localStorage.setItem(k,JSON.stringify(o))}
      SyncNotas.pendentesDetalhe().forEach(x=>{x.criadoEm=velho});
      RadioFila.atualizaUI();
    })()`);

    // Atualiza também criadoEm interno de SyncNotas via reload com registro envelhecido no storage/IDB
    await ev(`(async()=>{
      const velho=Date.now()-11*60*1000;
      const k=Object.keys(localStorage).find(x=>x.startsWith('bcbr_paginas_pendentes_v2:'));
      if(k){
        const o=JSON.parse(localStorage.getItem(k));o.criadoEm=velho;localStorage.setItem(k,JSON.stringify(o));
        await new Promise(ok=>{const r=indexedDB.open('bcbr',1);r.onsuccess=()=>{const t=r.result.transaction('kv','readwrite');t.objectStore('kv').put(o,'notas:fila:'+k);t.oncomplete=ok;t.onerror=ok};r.onerror=ok});
      }
    })()`);
    await call('Page.navigate', { url: C.URL_ });
    await ate("typeof RadioFila!=='undefined'&&!document.getElementById('rd_faixa').hidden", 15000);

    const fx = await ev("({txt:document.getElementById('rd_faixa').textContent,temTentar:!![...document.querySelectorAll('#rd_faixa button')].find(b=>b.textContent==='Tentar agora'),temDet:!![...document.querySelectorAll('#rd_faixa button')].find(b=>b.textContent==='Ver detalhes')})");
    assert.equal(fx.temTentar, true);
    assert.equal(fx.temDet, true);
    assert.match(fx.txt, /pendente/i);

    // Abre Ver detalhes e testa Exportar pendências
    await ev("[...document.querySelectorAll('#rd_faixa button')].find(b=>b.textContent==='Ver detalhes').click();0");
    await ate("document.getElementById('rd_det_box')");
    const det = await ev(`(()=>{
      const box=document.getElementById('rd_det_box');
      window.__expJson165=null;
      const origCreate=URL.createObjectURL;
      URL.createObjectURL=b=>{window.__expBlob165=b;return 'blob:fake'};
      box.querySelector('[data-exp]').click();
      URL.createObjectURL=origCreate;
      return {itens:box.querySelectorAll('.rd-lista li').length,temExp:!!box.querySelector('[data-exp]'),temBlob:!!window.__expBlob165};
    })()`);
    assert.ok(det.itens >= 1);
    assert.equal(det.temExp, true);
    assert.equal(det.temBlob, true);
    const jsonExp = await ev("window.__expBlob165.text()");
    const parsedExp = JSON.parse(jsonExp);
    assert.ok(parsedExp.pendentes.length >= 1);

    // Fecha modal, volta online e clica Tentar agora na faixa fixa
    await click('.nt-modal .nt-x');
    await ev("localStorage.removeItem('__off165');0");
    await ev("[...document.querySelectorAll('#rd_faixa button')].find(b=>b.textContent==='Tentar agora').click();0");
    await ate("RadioFila.contar()===0&&document.getElementById('rd_faixa').hidden&&document.getElementById('sync').classList.contains('ok')", 15000);
  });

  await t.test('5. Semana / preliminares conferidos offline -> IndexedDB, reload e conflito 409 mesclado ao voltar online', async (st) => {
    st.after(() => ev("localStorage.removeItem('__off165');localStorage.removeItem('__mode165');0").catch(() => {}));
    await call('Page.enable');
    C.on('Page.javascriptDialogOpening', () => call('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}));
    await ev("(async()=>{localStorage.removeItem('__off165');localStorage.removeItem('__mode165');await smMudar(d=>{d.prelConf=d.prelConf||{}},'base');})()");
    await ate("RadioFila.contar()===0&&!SM.sujo", 10000);

    await ev("localStorage.setItem('__off165','1');window.dispatchEvent(new Event('offline'));0");
    await ev("smMudar(d=>{d.prelConf=d.prelConf||{};d.prelConf['9001']='2026-11-18T12:00:00'},'preliminares: conferido');0");
    await ate("RadioFila.contar()>=1&&SM.sujo===true", 5000);

    await call('Page.navigate', { url: C.URL_ });
    await ate("typeof RadioFila!=='undefined'&&typeof SM!=='undefined'&&SM.ok&&RadioFila.contar()>=1", 15000);
    assert.equal(await ev("SM.d?.prelConf?.['9001']"), '2026-11-18T12:00:00');

    // Simula alteração concorrente no servidor enquanto este aparelho estava offline
    await ev(`(async()=>{
      const dec=s=>JSON.parse(decodeURIComponent(escape(atob(s.replace(/\\n/g,'')))));
      const enc=o=>btoa(unescape(encodeURIComponent(JSON.stringify(o))));
      const fS=await (await window.__origFetch165('/api/repos/'+BCBR.REPO+'/contents/semana/plano.json')).json();
      const dS=dec(fS.content);
      dS.prelConf=dS.prelConf||{};
      dS.prelConf['9002']='2026-11-18T12:05:00';
      await window.__origFetch165('/api/repos/'+BCBR.REPO+'/contents/semana/plano.json',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({message:'remoto sem',sha:fS.sha,content:enc(dS)})});
    })()`);

    await ev("localStorage.removeItem('__off165');window.dispatchEvent(new Event('online'));0");
    await ate("RadioFila.contar()===0&&!SM.sujo", 15000);
    const confSrv = await ev(`(async()=>{
      const dec=s=>JSON.parse(decodeURIComponent(escape(atob(s.replace(/\\n/g,'')))));
      const fS=await BCBR.api('/repos/'+BCBR.REPO+'/contents/semana/plano.json');
      return dec(fS.content).prelConf||{};
    })()`);
    assert.equal(confSrv['9001'], '2026-11-18T12:00:00');
    assert.equal(confSrv['9002'], '2026-11-18T12:05:00');
  });

  assert.deepEqual(C.erros, []);
});

test('Radio 1.65.0 regressão: resumos/fundidos.json na abertura migra fcs/fcAv/cfg sem travar em Carregando o banco', { timeout: 120000 }, async (t) => {
  const C = await iniciar({ porta: 8812, sw: false, largura: 1280, altura: 900, env: { BCBR_QS: '10' } });
  t.after(() => C.fim());
  const { ev, call, ate } = C;

  await call('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{
    if(window.__regFundidos)return;window.__regFundidos=true;
    localStorage.setItem('cbr_fcs',JSON.stringify({fc_old_1:[2.5,6,2,Date.now()+86400000,0,1700000000000,0]}));
    localStorage.setItem('cbr_fcav',JSON.stringify({fc_old_1:{id:'fc_old_1',voto:'up',u:1700000000000}}));
    localStorage.setItem('cbr_cfg',JSON.stringify({fcHoje:{d:'2026-11-18',feitos:['fc_old_1']},fcBlocos:[{id:'b1',ids:['fc_old_1'],resp:{fc_old_1:{g:3,ok:true,t:1700000000000}},i:0,fim:false,t0:1,u:1}]}));
    const orig=window.fetch.bind(window);
    window.fetch=async(u,o)=>{
      const s=String(u);
      if(s.includes('/contents/resumos')&&!s.includes('fundidos')){
        return new Response(JSON.stringify([{name:'fundidos.json',path:'resumos/fundidos.json',sha:'sha_rf_reg1'}]),{status:200,headers:{'content-type':'application/json'}});
      }
      if(s.includes('/git/blobs/sha_rf_reg1')){
        return new Response(JSON.stringify({fc_old_1:'fc_new_1'}),{status:200,headers:{'content-type':'application/json'}});
      }
      return orig(u,o);
    };
  })();` });

  const t0 = Date.now();
  await call('Page.navigate', { url: C.URL_ });
  await ate("typeof NT!=='undefined'&&!!NT.ed&&!NT.carregando&&typeof RadioFila!=='undefined'", 10000);
  const dt = Date.now() - t0;
  assert.ok(dt < 10000, 'app abriu rápido com fundidos.json (' + dt + ' ms)');

  const res = await ev(`({
    carregando:document.getElementById('app').textContent.includes('Carregando o banco'),
    rdSync:document.getElementById('rd_sync').textContent,
    hasOldFcs:'fc_old_1' in fcs,
    hasNewFcs:'fc_new_1' in fcs,
    hasNewAv:'fc_new_1' in fcAv,
    hojeFeitos:cfg.fcHoje?.feitos||[],
    blocoIds:cfg.fcBlocos?.[0]?.ids||[]
  })`);
  assert.equal(res.carregando, false, 'saiu de Carregando o banco…');
  assert.notEqual(res.rdSync, 'Aguardando sincronização', 'topo saiu de Aguardando sincronização');
  assert.equal(res.hasOldFcs, false, 'ID antigo migrado de fcs');
  assert.equal(res.hasNewFcs, true, 'ID novo presente em fcs');
  assert.equal(res.hasNewAv, true, 'ID novo presente em fcAv');
  assert.deepEqual(res.hojeFeitos, ['fc_new_1']);
  assert.deepEqual(res.blocoIds, ['fc_new_1']);
  assert.deepEqual(C.erros, []);
});

test('Radio 1.65.0 regressão: IndexedDB bloqueado/sem resposta + fila 1.64 no localStorage abre em poucos segundos e preserva a fila', { timeout: 120000 }, async (t) => {
  const C = await iniciar({ porta: 8813, sw: false, largura: 1280, altura: 900, env: { BCBR_QS: '10' } });
  t.after(() => C.fim());
  const { ev, call, ate } = C;

  const CHAVE_164 = 'bcbr_paginas_pendentes_v2:dev164:notas';
  const criaScript = (modo) => `(()=>{
    if(window.__regIdb164)return;window.__regIdb164=true;
    if(!localStorage.getItem('${CHAVE_164}')){
      localStorage.setItem('${CHAVE_164}',JSON.stringify({
        k:'${CHAVE_164}',
        p:{id:'notas',titulo:'Notas',pasta:'',ordem:0,atualizado:'2026-11-18T10:00:00.000Z',doc:{v:1,blocos:[{id:'b164',atualizado:'2026-11-18T10:00:00.000Z',conteudo:{type:'paragraph',attrs:{id:'b164'},content:[{type:'text',text:'Texto pendente da 1.64 preservado'}]}}]}},
        em:Date.now()-120000,
        rev:'r164-1'
      }));
    }
    if(!localStorage.getItem('sm_sujo')){
      const planoBase={v:2,regras:'',subtitulo:'',dias:{},tarefas:[],notas:[]};
      const planoLocal={v:2,regras:'',subtitulo:'',dias:{},tarefas:[{id:'t164',dia:'sem',texto:'Tarefa 1.64',area:'tarefas',feito:false}],notas:[]};
      localStorage.setItem('sm_cache2',JSON.stringify({sha:'s0',d:planoLocal}));
      localStorage.setItem('sm_base2',JSON.stringify(planoBase));
      localStorage.setItem('sm_sujo',String(Date.now()-120000));
    }
    const origFetch=window.fetch.bind(window);
    window.fetch=async(u,o)=>{
      if(o&&o.method==='PUT')throw new TypeError('Failed to fetch');
      return origFetch(u,o);
    };
    indexedDB.open=function(){
      const fake={};
      if('${modo}'==='blocked'){
        setTimeout(()=>{if(typeof fake.onblocked==='function')fake.onblocked(new Event('blocked'))},30);
      }
      return fake;
    };
  })();`;

  // Caso A: indexedDB.open nunca responde (nem onsuccess, nem onerror, nem onblocked)
  await call('Page.addScriptToEvaluateOnNewDocument', { source: criaScript('hang') });
  const t0 = Date.now();
  await call('Page.navigate', { url: C.URL_ });
  await ate("typeof NT!=='undefined'&&!!NT.ed&&!NT.carregando&&typeof RadioFila!=='undefined'", 8000);
  const dtHang = Date.now() - t0;
  assert.ok(dtHang < 7000, 'saiu de Carregando o banco em poucos segundos com IDB travado (' + dtHang + ' ms)');

  const stHang = await ev(`({
    carregando:document.getElementById('app').textContent.includes('Carregando o banco'),
    rdSync:document.getElementById('rd_sync').textContent,
    faixaHidden:document.getElementById('rd_faixa').hidden,
    faixaTxt:document.getElementById('rd_faixa').textContent,
    notaTxt:NT.ed.getText(),
    lsNota:localStorage.getItem('${CHAVE_164}'),
    lsSmSujo:localStorage.getItem('sm_sujo'),
    cont:RadioFila.contar(),
    idbIndisp:RadioFila.estadoResumo().idbIndisponivel
  })`);
  assert.equal(stHang.carregando, false, 'não ficou preso em Carregando o banco…');
  assert.notEqual(stHang.rdSync, 'Aguardando sincronização', 'topo saiu de Aguardando sincronização');
  assert.equal(stHang.idbIndisp, true, 'sinalizou modo seguro sem IndexedDB');
  assert.equal(stHang.faixaHidden, false, 'mostrou faixa de aviso do modo seguro');
  assert.match(stHang.faixaTxt, /IndexedDB|modo seguro/i);
  assert.match(stHang.notaTxt, /Texto pendente da 1\.64 preservado/, 'nota da fila 1.64 foi carregada');
  assert.ok(stHang.lsNota && stHang.lsNota.includes('Texto pendente da 1.64 preservado'), 'fila 1.64 de Notas preservada no localStorage');
  assert.ok(stHang.lsSmSujo, 'sm_sujo da 1.64 preservado no localStorage');
  assert.ok(stHang.cont >= 2, 'pendências da 1.64 contabilizadas (' + stHang.cont + ')');

  // Caso B: segunda aba com indexedDB.open disparando 'blocked'
  const aba2 = await C.novaAba();
  t.after(() => aba2.fecha());
  await aba2.call('Page.addScriptToEvaluateOnNewDocument', { source: criaScript('blocked') });
  const t1 = Date.now();
  await aba2.call('Page.navigate', { url: C.URL_ });
  for (let i = 0; i < 60; i++) {
    if (await aba2.ev("typeof NT!=='undefined'&&!!NT.ed&&!NT.carregando&&typeof RadioFila!=='undefined'").catch(() => false)) break;
    await espera(100);
  }
  const dtBlocked = Date.now() - t1;
  assert.ok(dtBlocked < 5000, 'aba com IDB blocked abriu rápido (' + dtBlocked + ' ms)');
  const stBlocked = await aba2.ev(`({
    carregando:document.getElementById('app').textContent.includes('Carregando o banco'),
    lsNota:!!localStorage.getItem('${CHAVE_164}'),
    faixaHidden:document.getElementById('rd_faixa').hidden,
    idbIndisp:RadioFila.estadoResumo().idbIndisponivel
  })`);
  assert.equal(stBlocked.carregando, false);
  assert.equal(stBlocked.lsNota, true, 'fila 1.64 intacta com IDB blocked');
  assert.equal(stBlocked.faixaHidden, false, 'aviso de modo seguro visível com IDB blocked');
  assert.equal(stBlocked.idbIndisp, true);
  assert.deepEqual(C.erros, []);
  assert.deepEqual(aba2.erros, []);
});
