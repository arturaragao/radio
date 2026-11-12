# Brief de escalada — Radio 1.45.0

Motivo: regra do Artur para duas falhas na tarefa. Escopo e alterações continuam
restritos à interface em build/, testes, histórico/versão e artefatos gerados;
nenhum commit/push ou acesso aos dados reais.

Objetivo: ações discretas e lateral nas abas próprias; exclusão confirmada pela
função existente; alça de listas utilizável; painel de Atalhos recolhível no quiz.

## Erro 1 — teste dirigido inicial

`node --test teste/notas145-browser.test.js teste/questoes145.test.js`
Resultado inicial: 4 passam e 2 falham (pai + subteste).
`Error: não ocorreu a tempo: !!document.querySelector('.qatalhos-bt')`
em `notas145-browser.test.js:107`.
Causa: fixture padrão sem questões. Corrigida com `BCBR_QS=10`.
Reexecução dirigida: 6/6, saída 0.

## Erro 2 — aceite completo

`node --test teste/`: 322/325, saída 1, zero pulos/cancelamentos.
`Error: não ocorreu a tempo: !!document.querySelector('.nt-pt-titulo')`
em `pastas-browser.test.js:11:60`. Reproduzido também isoladamente.
Diagnóstico Chrome: após mudar de desktop para 375 px, a lateral continuava
aberta no DOM apesar do padrão móvel fechado. O clique no botão de abertura
atingia uma página da lateral e abria seu painel. Depois, `elementFromPoint` do
botão Pasta retornava `<s>S</s>` da barra desse painel (z=950), acima da lateral
(z=941). Correção: o evento de mudança do breakpoint reaplica o estado próprio
do modo de destino, sem modificar armazenamento nem sync. O teste de Pastas
foi mantido integralmente; o teste novo também verifica essa transição.

Outras duas asserções no aceite completo ainda exigiam 1.44.0: prova.test.js
comparou `'1.45.0' !== '1.44.0'` e radio.test.js exigiu cabeçalho `v1.44.0`.
As expectativas foram atualizadas explicitamente para a versão solicitada.

Testes novos de exclusão, listas e abas passaram tanto isolados como no aceite.
Interpretador: 28/28, saída 0. Build regenerado em 1.45.0.
Resultado final: **325/325**, saída **0**, zero falhas/cancelamentos/pulos no
aceite completo. As falhas acima foram corrigidas. O teste novo de lateral
móvel também passou a fechar pelo fundo externo, conforme a interface.
Sem bloqueio técnico restante; brief entregue para cumprir a regra de escalada
após duas falhas. Evidências e limites em `validacao-1.45.md`, saída integral em
`validacao-1.45-suite.log`.
