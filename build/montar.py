"""Monta o app a partir do código do artefato Banco CBR (fonte/), aplicando as trocas do app.
Uso: python build/montar.py  -> gera index.html e app.js na raiz. Não editar index.html/app.js à mão: editar aqui ou em fonte/."""
import os, re
R = os.path.join(os.path.dirname(__file__), "..")
VERSAO = "1.58.0"
# 1.58.0: Notas — página raiz em botão de texto fixo ao lado da abertura da lateral, também no celular
# 1.57.0: Notas — retângulo seleciona células em qualquer nível; Tab recua o bloco (indent) como filho do anterior; robô trata o recuo como achado/conclusão
# 1.56.0: Notas — arrasto estilo Notion nos filhos do toggle; copiar blocos com imagens; clique na imagem só seleciona, duplo clique amplia
# 1.55.0: laudos guardados no aparelho (opt-in); copiar acesso; copiar laudo; Notas: barra lateral só com texto
# 1.54.0: Ctrl+P acha texto dentro dos laudos dos Preliminares (índice só em memória); Preliminares: lista Por dia / Por exame
# 1.53.0: abre em Notas; Preliminares: conferido (plano), por dia, período rápido, rodapé do PACS fora, copiar preliminar/corrigido, rolagem estável
# 1.52.0: fileira do dia em uma linha; Foco sem Meta; resumos ligados ao Foco, aos flashcards e às Notas (resumos/indice.json)
# 1.51.0: tabelas nas Notas (Tiptap extension-table; "/Tabela", minibarra de linhas e colunas, importação do Notion como tabela)
# 1.50.5: Preliminares sem ícone de página e sem legenda; "sem correção" → "sem mudanças"
# 1.50.4: Preliminares passa para dentro de Notas (barra lateral, pasta Laudos, abaixo de Notas USG); aba do topo removida
# 1.50.3: Preliminares — Corrigido já abre; preliminar e definitivo recolhidos; laudo em folha branca Arial, sem espaçamento
# 1.50.2: Preliminares mostra "aguardando definitivo" (par sem definitivo do chefe; o robô completa depois)
js = open(f"{R}/fonte/artefato-app.js", encoding="utf8").read()
js = js.split("<script>", 1)[1].rsplit("</script>", 1)[0]
head = open(f"{R}/fonte/artefato-head.html", encoding="utf8").read()

# 1.45.0: estado de salvamento na mesma linha do titulo, ao lado da sincronizacao.
rd_inline = '<button type="button" id="rd_sync" onclick="rdSyncAbre()" aria-live="polite">Aguardando sincroniza\u00e7\u00e3o</button>'
head = head.replace('<div class="hr">', '<div class="hr">' + rd_inline, 1)
head = head.replace('<div class="rd-topo">' + rd_inline + '<button', '<div class="rd-topo"><button', 1)
assert head.count('id="rd_sync"') == 1

def troca(a, b, n=1):
    global js
    c = js.count(a)
    assert c == n, f"esperava {n}x, achei {c}x: {a[:80]}"
    js = js.replace(a, b)

# imagens do repositório privado (servidas pelo sw.js)
troca("const imgSrc=u=>String(u).startsWith('u:')?",
      "const imgSrc=u=>String(u).startsWith('gh:')?(window.BCBR&&BCBR.imgPronta(String(u).slice(3))||'./img/'+encodeURIComponent(String(u).slice(3))):String(u).startsWith('u:')?")
# 1.19.1: botão de tema só com ícone (Artur: com a versão do APK no topo ele descia para outra linha)
troca("b.textContent=t==='auto'?'Tema: auto':t==='claro'?'Tema: claro':'Tema: escuro'",
      "{b.textContent=t==='auto'?'◐':t==='claro'?'☀':'☾';b.title=b.ariaLabel='Tema: '+t}")
# número da questão = número no Notion
troca("const posDe=q=>+q.id.slice(1);", "const posDe=q=>q.n??1e5;")
troca("Notion #${posDe(q)%1000}${q.n!=null?' · Q'+q.n+'/'+q.grupo:''}", "Notion #${q.n??'—'}")
# comentário do curso + do Claude em cada alternativa
troca("${fb&&q.coment[l]?`<div class=\"mut md cm\" style=\"margin-top:6px\">${md(q.coment[l])}</div>`:''}", "${fb?comentAlt(q,l):''}")
# ponto de ensino do curso antes do CCQ do Claude
troca("${pontoBloco(q)}${iaBloco(q)}", "${cursoBloco(q)}${claudeMdBloco(q)}${pontoBloco(q)}${iaBloco(q)}")
# IA = Gemini
troca("'CCQ e resumo rápido com o Claude ('+keyLab('ia')+')'", "'CCQ e resumo rápido com IA ('+keyLab('ia')+')'")
troca("toast('O Claude não está disponível nesta janela.')", "toast('Cole a chave do Gemini em Banco › Chaves deste aparelho.')")
troca("toast(e&&e.code==='not_granted'?'Permissão negada para usar o Claude.':'Não consegui gerar agora. Tente de novo.')",
      "toast(e&&e.code==='not_granted'?'Cole a chave do Gemini em Banco › Chaves deste aparelho.':'Não consegui gerar agora. Tente de novo.')")
# botão de IA: modelo novo de comentário (+ "Por que você errou")
i0 = js.index("const prompt=`Tutor de radiologia"); i1 = js.index("`;", i0) + 2
js = js[:i0] + "const prompt=promptIA(q);" + js[i1:]
# imagens: minivisualizador
troca("const imgs=(q.imgs||[]).filter(imgSrc).map(u=>`<img src=\"${imgSrc(u)}\" onclick=\"zoom('${u}')\" loading=\"lazy\" alt=\"Imagem da questão\">`).join('');", "const imgs=galeria(q,'q',fb);")
troca("const imgsC=fb?(q.imgsCom||[]).filter(imgSrc).map(u=>`<img src=\"${imgSrc(u)}\" onclick=\"zoom('${u}')\" alt=\"Imagem do comentário\">`).join(''):'';", "const imgsC=fb?galeria(q,'c'):'';")
# peso das áreas automático
troca("function pesoArea(id,S){if(cfg.pesos[id]!=null)return cfg.pesos[id];const tot=Q.length||1;return (S[id]?.banco||0)/tot*100}",
      "function pesoArea(id,S){if(cfg.pesoAuto===false&&cfg.pesos[id]!=null)return cfg.pesos[id];return incidencia(id)}")
i0 = js.index("<h3>Peso das áreas na prova (%)</h3>"); i1 = js.index("</label>`).join('')}</div></div>`;", i0) + len("</label>`).join('')}</div>")
js = js[:i0] + "${pesosUI()}" + js[i1:]
# layouts + setas ↑/↓ rolam a página depois de responder
troca("function render(){", "function render(){aplicaLayout();")
troca("  if(!fb&&(k==='ArrowDown'||k==='ArrowUp')){e.preventDefault();", "  if(fb&&(k==='ArrowDown'||k==='ArrowUp')){e.preventDefault();qRola(k==='ArrowDown'?1:-1);return}   // depois de responder: rolagem suave da página (build/questoes.js)\n  if(!fb&&(k==='ArrowDown'||k==='ArrowUp')){e.preventDefault();")
troca("return `<div class=\"alt ${c} ${cut.includes(l)?'cutd':''}\"", "return `<div class=\"alt ${c} ${cut.includes(l)?'cutd':''} ${tx.length<60?'curta':''} ${tx.length<28?'curtinha':''}\"")
# Quiz e Banco compartilham o corpo da questão; Banco usa alternativas somente para leitura.
i0 = js.index("  const alts=Object.entries(q.alts).map", js.index("function vQuiz(){"))
i1 = js.index("  const imgs=", i0)
js = js[:i0] + "  const alts=qAlternativas(q,{r,fb,sel,cut});\n" + js[i1:]
troca('<div class="enun" style="margin-top:10px">${esc(q.enunciado)}</div><div class="imgs">${imgs}</div>${alts}',
      '${qEnunciado(q,imgs)}${alts}')
troca("${fb?difTag(q)+prAcertoBloco(q):''}", "${fb?qDificuldade(q):''}")
js = js.replace("${pesosUI()}", "${layoutUI()}${pesosUI()}", 1)
# modo pré-prova: as funções originais viram *Orig e as novas (build/banco.js) decidem
troca("function revisaoDoDia(n=cfg.diario,exclui=new Set()){", "function revisaoDoDiaOrig(n=cfg.diario,exclui=new Set()){")
troca("function questoesTema(t){", "function questoesTemaOrig(t){")
troca("function simulado(et){", "function simuladoOrig(et){")
troca("function novasArea(id){", "function novasAreaOrig(id){")
troca("function comecaFiltro(){", "function comecaFiltroOrig(){")
# cartão da RI: texto e contador seguem a lista de verdade (22/10/2026)
troca("`<p class=\"mut\">${cfg.diario} questões do dia (a lista só muda à 00:00): ${devidas} vencidas no total, o restante sorteado com mais peso nos temas frequentes e fracos.</p>", "`<p class=\"mut\">${riDesc(devidas)}</p>")
js = js.replace("${layoutUI()}${pesosUI()}", "${modoProvaUI()}${layoutUI()}${pesosUI()}", 1)
# sugestões 1–5
troca("all.push(l);log.push(l);aplicaSrs(l);syncEst();persist(wkKey(l.t));", "all.push(l);log.push(l);aplicaSrs(l);syncEst();persist(wkKey(l.t));posResposta(q,l);")
troca("${cursoBloco(q)}${claudeMdBloco(q)}${pontoBloco(q)}${iaBloco(q)}", "${bannerResp(q,r)}${blocoFeedback(q,r,`${cursoBloco(q)}${claudeMdBloco(q)}${pontoBloco(q)}${iaBloco(q)}`)}")
troca("  ${chipsHoje(agendados)}", "  ${metaProvaCard()}${chipsHoje(agendados)}")
troca("const inc=x.qs.length/tot*100,", "const inc=(modoProva()?x.qs.reduce((a,q)=>a+({f:1,m:.6,d:.05}[q._d]??.6),0):x.qs.length)/tot*100,")
# texto da sincronização
troca("<h3>Backup manual</h3>", "${rdBackupHtml()}<h3>Backup manual</h3>")
troca("['sync','Sincronização e backup']", "['sync','Backup e recuperação']")
js = js.replace("Seu progresso é salvo automaticamente na sua conta e aparece igual em todos os aparelhos que abrirem este link.",
                "Seu progresso é salvo automaticamente no GitHub (banco-cbr-app) e aparece igual em todos os aparelhos.")

# aba Banco nova: igual ao Notion (todas, numeradas, em toggle)
ini = js.index("let bq='';\nfunction vBanco(){")
fim = js.index("let cfgTab='geral';")
js = js[:ini] + open(f"{R}/build/banco.js", encoding="utf8").read() + "\n\n" + js[fim:]

# Painel: célula "Foco até a prova (CBR)" em primeiro (build/foco.js), mesmo com pnOrd salvo e sem respostas (1.35.0)
troca("const PN_BOXES=[['resumo',", "const PN_BOXES=[['foco','Foco até a prova (CBR)',()=>vFoco()],['resumo',")
troca("return [...sv,...ids.filter(i=>!sv.includes(i))]};", "return (r=>sv.includes('foco')?r:['foco',...r.filter(i=>i!=='foco')])([...sv,...ids.filter(i=>!sv.includes(i))])};")

# 1.35.1: área seg ganha nome mais amplo (bioestatística, informática e IA entram nela; o id continua seg)
troca("{id:'seg',nome:'Segurança do paciente',kw:['seguranca']}", "{id:'seg',nome:'Segurança, qualidade e estatística',kw:['seguranca','estatistica','informatica']}")
troca("if(!log.length)return `<div class=\"card\">Responda algumas questões para o painel aparecer.</div>`+vIncidencia();", "if(!log.length)return vFoco()+`<div class=\"card\">Responda algumas questões para o painel aparecer.</div>`+vIncidencia();")
# aba Semana (substitui o artefato "Minha Semana", 21/10/2026)
troca("let sess=null,tela='hoje',sub=null;", "let sess=null,tela='notas',sub=null;")
troca("aplicaTema();render();iniciaSync();", "aplicaTema();smkIni();render();iniciaSync();smAtalhosInicia();")
# Atalhos aguardam o primeiro resultado de progresso, inclusive o caminho de erro/offline.
troca("if(!db)return;", "if(!db){smSyncResolve();return;}")
troca("DB.collection('cbr').onSnapshot(s=>mergeRemote(s.docs),()=>setSync('err'));",
      "DB.collection('cbr').onSnapshot(s=>{mergeRemote(s.docs);smSyncResolve()},()=>{setSync('err');smSyncResolve()});")
troca("}catch(e){setSync('err')}\n}", "}catch(e){setSync('err');smSyncResolve()}\n}")
troca("qa:'a',smdel:'f'", "qa:'a',smdel:'f',smurg:'u'")
troca("smdel:'Apagar a tarefa selecionada'", "smdel:'Apagar a tarefa selecionada',smurg:'U = urgente (tarefa selecionada)'")
troca("sem:['smdel']", "sem:['smdel','smurg']")
troca("const TABS=[['hoje','Hoje'],", "const TABS=[['hoje','Hoje'],['semana','Semana'],")
troca("const base=TABS.map(t=>t[0]),o=(cfg.tabs||[]).filter(k=>base.includes(k));", "const base=TABS.map(t=>t[0]),o=(cfg.tabs||[]).filter(k=>base.includes(k));if(o.length&&!o.includes('semana'))o.splice(Math.max(0,o.indexOf('hoje'))+1,0,'semana');")
# 1.42 offline: o que não chegou ao GitHub volta para a fila (antes o flush tirava a chave de "dirty" antes de gravar e, sem internet, ela se perdia até o remoto mudar)
troca("if(!DB)return;setSync('saving');", "if(!DB)return;setSync('saving');const tentadas=[...dirty],tinhaEst=estDirty;")
troca("setSync('err');clearTimeout(retryT);retryT=setTimeout(flush,15000)", "tentadas.forEach(k=>dirty.add(k));if(tinhaEst)estDirty=true;setSync('err');clearTimeout(retryT);retryT=setTimeout(flush,15000)")
troca("fc:vFc,fcstudy:vFcStudy}[tela];", "fc:vFc,fcstudy:vFcStudy,semana:vSemana,tarefas:vTarefas,notas:vNotas}[tela];")
troca("  ${metaProvaCard()}${chipsHoje(agendados)}", "  ${smCardHoje()}${metaProvaCard()}${chipsHoje(agendados)}")
# aba Questões à direita da Semana: último bloco em andamento + troca de bloco + atalhos (22/10/2026)
troca("['semana','Semana'],", "['semana','Semana'],['questoes','Questões'],")
troca("o.splice(Math.max(0,o.indexOf('hoje'))+1,0,'semana');", "o.splice(Math.max(0,o.indexOf('hoje'))+1,0,'semana');if(o.length&&!o.includes('questoes'))o.splice(o.indexOf('semana')+1,0,'questoes');")
troca("['semana','Semana'],['questoes','Questões'],", "['semana','Calendário'],['tarefas','Tarefas'],['notas','Notas'],['questoes','Questões'],")
troca("base.forEach(k=>{if(!o.includes(k))o.push(k)});return o.map", "for(const [k,antes] of [['tarefas','semana'],['notas','tarefas']]){if(o.length&&!o.includes(k))o.splice(o.indexOf(antes)+1,0,k)}base.forEach(k=>{if(!o.includes(k))o.push(k)});return o.map")
# 1.50.0: página Preliminares; desde 1.50.4 é página especial de Notas (pasta Laudos), sem aba própria
# 1.50.1: "Chave dos laudos" na aba Config > Geral (campo, salvar, testar, remover)
troca("function cfgGeral(){", "function cfgGeral(){return cfgGeralOrig()+prelCfgHtml()} function cfgGeralOrig(){")
troca("quiz:vQuiz,", "quiz:vQuizQ,questoes:vQuestoes,")
troca("function go(t,s){tela=t;", "function go(t,s){if(t==='preliminares'){ntPrelAbre();return}if(t==='questoes'&&qAbre())return;if(t==='tarefas')smkIni();tela=t;")
troca("const ativa=tela==='quiz'||tela==='fim'?'':", "const ativa=tela==='quiz'?'questoes':tela==='fim'?'':")
troca("$('#app').innerHTML=f();", "qPinta(f());")
# atalhos do zoom configuráveis (Config > Atalhos)
troca("if(e.key==='Escape')zClose();else if(e.key==='ArrowRight')zStep(1);else if(e.key==='ArrowLeft')zStep(-1);else if(e.key==='+'||e.key==='=')zScale(1.4);else if(e.key==='-')zScale(1/1.4);else if(e.key==='0')zFit();return}",
      "if(e.key==='Escape')zClose();else if(keyIs(e,'znext'))zStep(1);else if(keyIs(e,'zprev'))zStep(-1);else if(keyIs(e,'zin')||(KEY('zin')==='+'&&e.key==='='))zScale(1.4);else if(keyIs(e,'zout'))zScale(1/1.4);else if(keyIs(e,'zfit'))zFit();return}")
js = open(f"{R}/build/personalrad.js", encoding="utf8").read() + "\n\n" + open(f"{R}/build/foco.js", encoding="utf8").read() + "\n\n" + js
js = js + "\n\n" + open(f"{R}/build/questoes.js", encoding="utf8").read()
# reordenar cartões arrastando (22/10/2026): botões de restaurar em Config + arrastar/segurar (build/layout.js)
troca("${layoutUI()}${pesosUI()}", "${layoutUI()}${ordemUI()}${pesosUI()}")
js = js + "\n\n" + open(f"{R}/build/layout.js", encoding="utf8").read()
js = open(f"{R}/build/sync-notas.js", encoding="utf8").read() + "\n\n" + open(f"{R}/build/interpretar.js", encoding="utf8").read() + "\n\n" + open(f"{R}/build/semana.js", encoding="utf8").read() + "\n\n" + open(f"{R}/build/notas.js", encoding="utf8").read() + "\n\n" + open(f"{R}/build/notas2.js", encoding="utf8").read() + "\n\n" + open(f"{R}/build/preliminares.js", encoding="utf8").read() + "\n\n" + open(f"{R}/build/recuperacao.js", encoding="utf8").read() + "\n\n" + open(f"{R}/build/busca.js", encoding="utf8").read() + "\n\n" + open(f"{R}/build/offline.js", encoding="utf8").read() + "\n\n" + js  # antes do código do app: estado e notas existem no primeiro render

open(f"{R}/app.js", "w", encoding="utf8").write(f"// Banco CBR app {VERSAO} — gerado por build/montar.py a partir do artefato (não editar à mão)\n" + js)

css = open(f"{R}/build/extra.css", encoding="utf8").read() + open(f"{R}/build/semana.css", encoding="utf8").read() + open(f"{R}/build/questoes.css", encoding="utf8").read() + open(f"{R}/build/layout.css", encoding="utf8").read() + open(f"{R}/build/notas.css", encoding="utf8").read() + open(f"{R}/build/preliminares.css", encoding="utf8").read()
pwa = ('<link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon.svg"><link rel="apple-touch-icon" href="apple-touch-icon.png">'
       '<meta name="theme-color" content="#2f2923" media="(prefers-color-scheme: dark)"><meta name="theme-color" content="#4a3320" media="(prefers-color-scheme: light)"><meta name="apple-mobile-web-app-capable" content="yes">')
head = head.replace("<style>", pwa + "<style>", 1).replace("</style>", css + "</style>", 1)
# versão pequena ao lado do título
assert head.count("</svg>Radio</div>") == 1
head = head.replace("</svg>Radio</div>", f'</svg>Radio<small class="versao">v{VERSAO}</small></div>')
open(f"{R}/index.html", "w", encoding="utf8").write(head + f'\n<script>window.BCBR_VERSAO="{VERSAO}"</script><script src="shim.js?v={VERSAO}"></script>\n</body></html>\n')
open(f"{R}/versao.txt", "w", encoding="utf8").write(VERSAO)  # o app confere ao abrir (atualização instantânea)
sw_path = f"{R}/sw.js"
sw = open(sw_path, encoding="utf8").read()
sw, n = re.subn(r'^const VERSAO = "[^"]+";', f'const VERSAO = "bcbr-{VERSAO}";', sw, count=1, flags=re.M)
assert n == 1, f"esperava 1 declaração const VERSAO em sw.js, achei {n}"
open(sw_path, "w", encoding="utf8").write(sw)
print("ok: app.js", len(js), "bytes · index.html", VERSAO)
