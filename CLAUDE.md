# CLAUDE.md — AI Assistant

> Arquivo lido automaticamente pelo Claude Code CLI a cada sessão. **Leia isto primeiro, depois `docs/SESSION_STATE.md` (snapshot da última pausa) e `docs/PROGRESS.md` (histórico).**

## O que é
Assistente de IA para desktop (Windows primeiro), em **Electron + TypeScript**: uma barra flutuante no topo da
tela (atalho global), conversa com um LLM (Ollama local, Groq, Gemini ou Anthropic) e executa ações no PC por
*tool calling* — sempre com limites de segurança. Projeto original, escrito do zero. Idioma da UI/respostas: pt-BR.

## Regras do projeto (inegociáveis)
1. **Não mencionar origem/inspiração.** Nenhum nome de produto de terceiros em código, docs, commits ou issues.
2. **Segurança primeiro** — leia `docs/SECURITY.md` antes de mexer em ferramentas, IPC ou janelas.
   - Chaves de API só existem em texto puro na memória do processo *main*; no disco, apenas cifradas (`safeStorage`).
   - O renderer nunca recebe chaves. Renderer usa só `textContent` (nunca `innerHTML`).
   - Ferramentas: lista fechada, sem shell, argumentos validados. Ação sensível ⇒ `needsConfirm`.
3. **Dependências mínimas.** Hoje só há devDependencies (`electron`, `electron-builder`, `typescript`, `@types/node`); as chamadas às APIs de IA usam `fetch` nativo. Adicionar dependência exige justificativa em `docs/DECISIONS.md`.
4. **Sem bundler.** `tsc` compila tudo para `dist/`; HTML/CSS são copiados por `scripts/copy-static.mjs`.
5. **Testes acompanham o código.** Lógica nova em `src/main` precisa de `*.test.ts` ao lado. `npm test` deve passar antes de todo commit.
6. **Documentação viva.** Ao fim de cada sessão/tarefa: atualizar `docs/PROGRESS.md` (estado + próximos passos) e, se mudou
   decisão/arquitetura/segurança, `docs/DECISIONS.md` / `docs/ARCHITECTURE.md` / `docs/SECURITY.md`.

## Comandos
```bash
npm install                      # instala devDependencies
node node_modules/electron/install.js   # baixa o binário do Electron se ainda não existir (dist/electron.exe)
npm run build                    # tsc (main+preload+shared) + tsc (renderer) + copia estáticos
npm run typecheck                # só checa tipos
npm test                         # build + node --test dist/**/*.test.js
npm start                        # build + abre o app
npm run dev                      # idem, com DevTools habilitado (--dev)
npm run smoke                    # build + teste de ponta a ponta (página, preload, IPC, CSP) via DevTools Protocol
npm run pack                     # empacota só a pasta release/win-unpacked (teste rápido)
npm run dist                     # instalador NSIS + portátil em release/ (ver DEVELOPMENT.md → Empacotamento)
node scripts/make-icon.mjs       # regenera assets/icon.png
```
Smoke test sem piscar a tela: `npm run smoke` (ou `node scripts/smoke.mjs <exe> [args]`, que roda com `--hidden`, conecta no
DevTools Protocol e confere app://, preload, IPC, CSP e bloqueio de `file://`; sai com código ≠ 0 se algo falhar).

## Mapa do código (detalhes em `docs/ARCHITECTURE.md`)
```
src/shared/     tipos + contrato de IPC (sem Node/Electron; usado por todos)
src/main/       processo principal: main.ts (ciclo de vida, atalho, bandeja), window.ts, ipc.ts,
                settings.ts (config + chaves cifradas), platform.ts (única ponte para APIs do SO/Electron),
                appUrl.ts (puro: lista de arquivos servidos em app://) + protocol.ts (registra/serve o app://)
  ai/           provider.ts (interface+HTTP), providers/* (4 adapters), registry.ts, agent.ts (loop de tools)
  tools/        types.ts (Tool/Platform/Context), builtin.ts (ferramentas)
src/preload/    preload.ts — contextBridge; roda em sandbox ⇒ NÃO pode importar módulos locais em runtime
src/renderer/   index.html, styles.css, renderer.ts (módulo ES, sem imports em runtime)
scripts/        copy-static.mjs, make-icon.mjs, smoke.mjs (teste ponta a ponta via DevTools Protocol)
docs/           documentação (ver índice abaixo)
```

## Armadilhas já encontradas (não repita)
- **Preload em sandbox** só pode `require('electron')`. Importe de `shared/` apenas `import type`. Nomes de canais IPC são literais, checados por tipo contra `IpcInvoke`/`IpcEvents`.
- **Renderer** é `type="module"` carregado via `app://ui/` sob CSP `script-src 'self'`; imports de `shared/` devem ser `import type` (apagados na compilação). Qualquer dado de `shared/` necessário em runtime deve vir por IPC (ex.: `PublicSettings.providers`).
- **`safeStorage`**: use as variantes `*Async` + `isAsyncEncryptionAvailable()` (as síncronas estão depreciadas no Electron 45). A disponibilidade é cacheada em `electronCodec.init()`, chamado antes de criar o `SettingsStore`.
- **Binário do Electron** não é baixado pelo `npm install` neste ambiente: rode `node node_modules/electron/install.js`.
- **Gemini** rejeita `OBJECT` com `properties` vazio ⇒ ferramentas sem parâmetros omitem `parameters` (ver `toGeminiTools`).
- **Gemini/Anthropic** exigem que resultados de várias tools de uma mesma rodada fiquem no **mesmo turno** do usuário (já tratado nos conversores; há testes).
- **Heredocs longos no Bash tool** quebraram por aspas; prefira a ferramenta Write para criar arquivos de código.
- **A UI é servida por `app://ui/…`, não por `file://`** (ADR-012). Qualquer arquivo novo de UI (ex.: imagem, segundo `.js`) precisa entrar na lista `ASSETS` de `src/main/appUrl.ts` **e** em `scripts/copy-static.mjs` (se for estático), senão dá 404. Com o fuse `GrantFileProtocolExtraPrivileges` desligado, um `loadFile`/`file://` não funciona empacotado — não volte a usá-lo.
- **Se o app do usuário estiver aberto** (teste manual), nunca o encerre: a trava de instância única faz qualquer outra instância sair sozinha. `scripts/smoke.mjs` já usa `--user-data-dir` temporário; para rodar o app manualmente em paralelo, passe `--user-data-dir=<pasta>` também.
- **Nomes de modelo de IA envelhecem** (já deu 404 no Groq): o app se recupera sozinho (ADR-013), mas todo provedor novo precisa de `listModels` + preferências em `ai/models.ts`.
- `registerAppScheme()` precisa rodar **antes** de `app.whenReady()`; `serveApp()` depois, antes de criar a janela.
- **Após mudar `build.electronFuses`, UI ou protocolo:** `npm run pack` e `node scripts/smoke.mjs "release/win-unpacked/AI Assistant.exe"` (precisa dar "OK").
- **Nomes de artefatos** de `nsis` e `portable` precisam ser diferentes, senão um sobrescreve o outro.
- O `npm install` do electron-builder avisa sobre scripts de instalação (`electron-winstaller`); são desnecessários (não usamos Squirrel).
- Ao cortar histórico de conversa, corte **sempre num turno `user`** (`trimHistory`) para não deixar `tool` órfão.

## Convenções
- TypeScript `strict` + `noUncheckedIndexedAccess`. Sem `any`. Erros mostrados ao usuário em pt-BR, claros e sem vazar segredos.
- Comentários em pt-BR, explicando o **porquê**. Nomes de código em inglês.
- Commits pequenos, mensagem no imperativo em pt-BR (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`).
- Toda nova ferramenta: spec + validação + (se sensível) `needsConfirm` + teste. Toda nova API de SO: via `Platform`.

## Índice de documentação
| Arquivo | Conteúdo |
|---|---|
| `docs/SESSION_STATE.md` | **Snapshot da última pausa**: onde parou, o que o usuário deve fazer, resultados do teste manual (sobrescrever a cada pausa) |
| `docs/PROGRESS.md` | Estado atual, histórico de sessões, próximos passos (atualize sempre) |
| `docs/ARCHITECTURE.md` | Componentes, fluxos (envio de mensagem, confirmação), contratos |
| `docs/SECURITY.md` | Modelo de ameaças, controles, checklist para novas ferramentas |
| `docs/DECISIONS.md` | Registro de decisões (ADR) com contexto e consequências |
| `docs/ROADMAP.md` | Backlog priorizado com IDs |
| `docs/DEVELOPMENT.md` | Como adicionar provedor/ferramenta, testar manualmente, empacotar |
