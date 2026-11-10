# Radio (ex-Banco CBR) — app

Código do app (PWA) do Banco CBR. **Sem nenhuma questão aqui** — as questões e o progresso ficam no repositório privado de dados; o app as lê com a chave do GitHub de cada aparelho.

Documentação do projeto: `CLAUDE.md` do repositório privado de dados.

## Como funciona
- `index.html` + `app.js` são **gerados** por `python build/montar.py` a partir do código do artefato (`fonte/`) com as trocas do app (`build/montar.py`, `build/banco.js`, `build/extra.css`). Não editar `app.js` à mão.
- Sem Python: `node build/montar-node.js` executa as transformações da mesma receita; `teste/build.test.js` verifica a reprodução do HEAD anterior e dos artefatos atuais.
- `shim.js`: lê as questões e grava o progresso no repositório privado (`progresso/<doc>.json`), IA pelo Gemini.
- `build/semana.js` + `build/semana.css`: aba **Semana** (plano da semana, ex-artefato "Minha Semana"); dados em `semana/atual.json` do repo privado.
- Abas **Calendário**, **Tarefas** e **Notas**: plano v2 em `semana/plano.json` (migra `semana/atual.json`); Notas usa `build/notas.js`/`build/notas.css`, com fila local para alterações offline.
- `sw.js`: deixa o app abrir sem internet e serve as imagens do repositório privado (`./img/<arquivo>`).
- Endereço: https://arturaragao.github.io/banco-cbr-app2/
