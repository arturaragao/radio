# Kit de teste (Banco CBR)
Serve o app direto desta pasta e simula a API do GitHub com os dados de `../banco-cbr-app` (privado, nada é copiado para cá). PUT = só 200, nada grava. O `sw.js` é trocado por um nulo.

**Subir:** `node teste/servidor.js [pasta-dados] [porta]` (padrão: `../banco-cbr-app`, 8765; ou `BCBR_DADOS`/`PORT`). Rodar com o diretório do repo como base.

**Calendário 1.27, sem dados privados:** `node teste/servidor.js --simulado 8765` usa apenas as seis tarefas fictícias em memória de `calendario-dados.js`; PUT não grava nada.
O aceite visual completo está em `node --test teste/calendario-browser.test.js` (Chrome local, porta 8766; bloqueia requisições externas).
Se o ambiente negar processos filhos, rode os testes Node com `--test-isolation=none` e execute `teste/interpretar.test.js` separadamente: ele chama `process.exit` e encerraria a suíte antes das outras asserções.
Resultados e limites desta entrega: [calendario-validacao.md](calendario-validacao.md).
**Notas 1.39 (Chrome):** `node --test teste/notas-browser.test.js` (porta 8767) sobe o servidor com `BCBR_MEM=1` (só com `--simulado`): PUT de `semana/plano.json` e `imagens/` fica em memória do servidor e volta no GET, para provar que a nota e a imagem sobrevivem ao recarregar.
**Sincronização 1.40 (Chrome):** `node --test teste/sync-browser.test.js` (porta 8768) usa DUAS janelas = dois aparelhos (origens `127.0.0.1` e `localhost`, localStorage separado) contra o mesmo `servidor.js --simulado` com `BCBR_MEM=1`; nesse modo o servidor devolve ETag e 304, responde 409 a PUT com sha velho e expõe `/__stats` (contadores) e `/__cota?rest=N` (cabeçalhos X-RateLimit simulados). `BCBR_CAPTURAS=<pasta>` grava capturas do tema Sépia.
**Notas 1.41 (Chrome):** `notas-browser` cobre a barra fixa, Ctrl+/, Tab/Shift+Tab lista<->toggle, páginas (painel, "/Página", barra lateral, arrastar, excluir) e o celular de 375 px; `sync-browser` ganhou o teste de páginas em dois aparelhos.
**Abrir (Browser pane):** navegar para `http://localhost:8765/`. O servidor injeta (só na resposta) um fetch que desvia `api.github.com` para `/api` e grava token falso em `bcbr_gh_token`. O app não precisa de linha nenhuma.
**Prova/meta:** prova fixa em 12/12/2026; `cfg.prova` salvo/sincronizado não altera o prazo. RI fixa em 50 questões nos dois modos. Nota: `requestAnimationFrame` fica travado no Browser pane; para testar `qRola` use `window.requestAnimationFrame=f=>setTimeout(()=>f(performance.now()),16)`.
**Dica:** esperar ~4 s após carregar; eventos de teclado: `document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'g',bubbles:true,cancelable:true}))`.

## Roteiro
1. Carga: sem erro de JS no console (404 de recursos pode aparecer); `QUESTOES.length` > 2000; abas: Hoje, Semana, Questões, Estudar, Flashcards, Painel, Banco, Config.
2. Questão com imagem: `iniciar(['q28','q1048','q1058'],'estudo')` (2-3 imagens cada). Tecla G seleciona imagem, ←/→ trocam sem mudar a questão, G abre zoom, G fecha. Rodapé `.qatalhos` presente.
3. Imagem não pisca: após responder (Enter com alternativa escolhida), o `<img>` principal continua o mesmo nó DOM.
4. Abas: `go('questoes')` abre bloco/tela "Nenhum bloco"; Tab/Shift+Tab trocam aba (de Questões: Estudar / Semana).
5. RI: `metaHoje() === tamanhoRI() === ALVO.ri() === 50`; `riHoje().length === 50` com banco suficiente. `smMetaDe` continua sendo a estimativa de cobertura do calendário, até a prova fixa, com reta final em 28/11.
6. Semana: `.sm-hoje1.kbsel`, ↓/↑ marcam `.sm-row.kbsel`, Enter alterna, F apaga (só em memória), Esc solta, Alt+A abre Nova tarefa.

- 1.42: `radio.test.js` (tema/contraste/nome), `radio-browser.test.js` (Notas no Chrome), `offline-browser.test.js` (SW real, servidor desligado); auxiliar `chrome-util.js`.
