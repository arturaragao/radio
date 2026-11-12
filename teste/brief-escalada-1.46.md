# Escalada — 1.46.0 parcial

## Retomada de 11/11/2026 — estado atual, não publicar

Objetivo: liberar localStorage com migração confirmada para IDB, preservar dados/fila/abas antigas e entregar a suíte completa verde. Restrições mantidas: somente arquivos autorizados; sem commit/push, sem repo de dados e somente dados fictícios nos testes.

Os dois erros do registro anterior foram corrigidos. Na retomada, o direcionado passou 118/118. Foram acrescentadas regressões de falha parcial/tardia do IDB, download do editor sob cota real e binário 1.45 real aberto antes/depois da migração. Os 15 testes novos passaram, isolados e na suíte completa. O download agora inclui rascunhos não enfileirados; bases 1.42 e pendentes não são removidos pela migração. Arquivos e cenários detalhados em `validacao-1.46.md`.

### Erro 1 da retomada — teste Chrome, corrigido antes da suíte completa

`node --test teste/armazenamento146-browser.test.js`: saída 1, 3/4 passaram.

```
1.46 Chrome: binário 1.45 antes e depois da migração preserva edições pela fila existente
TypeError: Cannot read properties of null (reading 'commands')
at teste/armazenamento146-browser.test.js:81
```

O teste tentava digitar depois de um render entre abas ter desmontado o editor. Foi corrigido para trazer a aba, abrir Notas e aguardar `NT.ed`. Repetição: 4/4, saída 0. Nenhuma asserção de integridade foi removida.

### Erro 2 da retomada — suíte completa, pendente

`node --test teste/`: saída **1**, **322/341**, 19 falhas, nenhum cancelado/ignorado, 205973 ms. Log integral: `validacao-1.46-suite.log`.

```
teste/login.test.js:31:83
AssertionError: 0 !== 1 (recarregamentos.length)

teste/plano-leitura.test.js:13 (16 casos)
const smArmazem=window.BCBR?.grandes||localStorage;
ReferenceError: window is not defined

teste/prova.test.js:31
AssertionError: '1.46.0' !== '1.45.0'

teste/radio.test.js:47
expected: /<\/svg>Radio<small class="versao">v1\.45\.0<\/small><\/div>/
```

Evidência para a próxima execução autorizada:

1. O mock de login registra ouvintes por `Map.set(tipo,callback)`, substituindo o ouvinte anterior de `storage`. O shim agora tem mais um ouvinte de storage; hipótese forte: o mock precisa suportar vários callbacks, como o navegador. Preservar a asserção de reload e testar 401 entre abas.
2. O contexto VM de `plano-leitura.test.js` não oferece `window`, mas oferece `BCBR`; decidir entre completar o ambiente de navegador do teste ou tornar a seleção do armazém compatível com esse contexto. Não remover os 16 testes nem alterar leitura/fusão/PUT para contorná-los.
3. Atualizar expectativas explícitas de versão em `prova.test.js` e `radio.test.js` para 1.46.0, preservando todas as verificações.
4. Rerodar os testes afetados e `node --test teste/` completo; só então atualizar o status de validação no CLAUDE.

Demais verificações: `node teste/interpretar.test.js` **28/28**, saída 0; build regenerado, saída 0; `git diff --check` sem erros e 15 arquivos validados como UTF-8 sem BOM. Os logs foram gerados em UTF-8.

Limite de compatibilidade: a abertura do binário antigo foi validada **com rede**, seguida de edição offline nas duas abas, confirmação na 1.46 e reabertura. Uma 1.45 iniciada totalmente offline não sabe ler IDB depois de removido o cache do localStorage. Nenhuma alteração neste código consegue mudar um shim antigo já em cache. A 1.46 foi validada reabrindo as notas sem rede. Ainda não há teste de queda de energia, aparelho físico ou WebView.

**Escalar: sim.** Duas execuções com falha nesta retomada; trabalho de código/testes interrompido após a suíte completa conforme regra do Artur. Foram atualizados somente este brief, o registro de validação e o status do CLAUDE depois desse resultado. Nenhum commit/push.

---

## Registro da tentativa anterior (histórico)

Pedido: liberar localStorage migrando caches e bases para IndexedDB sem perder notas, preservar legado/fila/fusão/PUT, limitar diário por bytes e oferecer diagnóstico/backup/persistência. Não publicar este estado sem concluir a validação.

## Estado e escopo

- `shim.js`: hidratação antes do app, espelho síncrono, commit + releitura estrita, remoção condicional ao valor original ainda estar no localStorage, fallback e serialização com Web Locks quando disponível. Bases 1.42 são copiadas, nunca removidas.
- `build/semana.js`, `build/notas.js`: usam o armazenamento grande; pendentes continuam no localStorage. Aviso diferencia `QuotaExceededError` de outras exceções. Persistência do cache aguardada no caminho assíncrono de gravação do plano.
- `build/recuperacao.js`: poda de diário por 512 KB UTF-16, incluindo chave/JSON/metadados; botão de cópia na cota; estimativa de IDB (ou total da origem identificado como tal), solicitação explícita de `navigator.storage.persist()`.
- `build/montar.py`: versão 1.46.0. `app.js`, `index.html`, `versao.txt`, `sw.js` regenerados pelo gerador.
- Testes novos: `teste/armazenamento146.test.js`, `teste/armazenamento146-browser.test.js`. Dois mocks de quota existentes ajustados para usar o nome real da exceção.
- Nenhum commit/push, nenhum acesso ao repo de dados. Navegadores de teste só receberam dados fictícios, com tráfego externo bloqueado pelo auxiliar existente.
- Arquivos preexistentes não alterados: `previa-visual.html`, `teste/brief-escalada-1.45.md`.

## Execução real

1. `node build/montar-node.js` — saída 0; `ok: app.js 526427 caracteres · index.html 1.46.0 (receita montar.py)`.
2. `node --test teste/armazenamento146.test.js teste/armazenamento146-browser.test.js teste/recuperacao.test.js teste/semana-integracao.test.js` — saída 1; 118 testes, 116 passaram, 2 falharam, nenhum cancelado/ignorado. Aproximadamente 6,6 s.

Os 9 novos testes unitários passaram: ordem commit/releitura/remoção, falhas de abertura/escrita/leitura/comparação, concorrência de escrita antiga, hidratação offline, bytes e diferenciação de erros. As regressões de recuperação e de integração de notas também passaram.

## Erro 1 — Chrome, compatibilidade depois da migração

Teste: `1.46 Chrome: cota real, migração IDB, reabertura offline e escrita posterior de aba antiga`.

```
Error: SecurityError: Failed to read the 'localStorage' property from 'Window': Access is denied for this document.
at Object.ev2 [as ev] (teste/chrome-util.js:50:154)
at TestContext.<anonymous> (teste/armazenamento146-browser.test.js:30:3)
```

Antes dessa linha passaram: cota real do Chrome, remoção das três chaves migráveis, preservação da base 1.42, texto das notas no editor offline, leitura de 700.000 caracteres do cache no IDB e segunda reabertura offline. A falha ocorreu no acesso da nova aba após `Page.navigate`, sem aguardar o documento da origem carregar. Hipótese: execução ainda em `about:blank`. Próximo passo: aguardar URL/documento da origem antes de escrever; não mudar as asserções de integridade.

## Erro 2 — Chrome, IDB indisponível

Teste: `1.46 Chrome: IDB indisponível conserva LS e app continua funcionando`.

```
AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
+ actual - expected
+ [ 'SecurityError: negado' ]
- []
at TestContext.<anonymous> (teste/armazenamento146-browser.test.js:43:10)
```

O app abriu, o editor existiu, a base 1.42 permaneceu e a escrita de fallback no localStorage passou. Porém houve erro de runtime não tratado. Hipótese: a promessa `idb` rejeita imediatamente quando `indexedDB.open` lança, enquanto o tratamento pela hidratação só começa depois da aquisição assíncrona de Web Lock. Próximo passo: garantir tratamento imediato da rejeição sem mascarar os erros utilizados na confirmação de migração; rerodar o teste.

## Cenários de perda e limites

- Interrupção/erro antes de confirmar IDB: chave original não é removida; validado nas falhas injetadas de commit, leitura e comparação.
- Escrita antiga durante confirmação: compara novamente a chave antes de remover; teste unitário preservou o valor concorrente e a prioridade de leitura.
- Legado 1.42/fila: migração só remove chaves grandes autorizadas; bases antigas e entradas pendentes permanecem; regressões de fusão/PUT existentes passaram.
- Reabertura sem rede: hidratação foi validada em VM e no Chrome com editor mostrando notas em duas aberturas.
- As gravações novas são assíncronas. Ainda revisar fechamento abrupto durante gravação, falha tardia com LS cheio e concorrência de múltiplas abas 1.46 antes de considerar concluído.
- O teste de compatibilidade usa uma aba que escreve as mesmas chaves da 1.45; NÃO executa um binário 1.45 completo. Uma versão antiga com shim antigo não sabe ler IDB se o cache tiver sido removido. Validar/definir esse limite é necessário para a exigência de abertura antiga, principalmente offline.
- `node --test teste/` completo e `node teste/interpretar.test.js` não foram executados após os dois erros, respeitando a regra de escalada. UTF-8/BOM ainda precisa da verificação final automatizada; edições foram feitas com apply_patch, artefatos com o gerador UTF-8.
- Não testado em aparelho físico ou WebView Android; o botão de persistência e o modal de download ainda não tiveram validação Chrome concluída.

Escalar: sim, dois testes novos falharam. Trabalho interrompido após a execução direcionada; não declarar aceite nem publicar a versão parcial.
