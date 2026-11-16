# Registro de decisões (ADR)

Formato: **ID — título** · status · contexto · decisão · consequências. Nunca apague decisões antigas: marque como
*substituída por ADR-xxx*.

## ADR-001 — Electron + TypeScript, sem bundler · aceita
- **Contexto:** app desktop de barra flutuante, Windows primeiro; usuário pediu Electron + TS.
- **Decisão:** `tsc` direto (CommonJS para main/preload, ES2022 para renderer), HTML/CSS copiados por script.
- **Consequências:** build simples e auditável; sem tree-shaking (irrelevante aqui); renderer não pode importar módulos
  locais em runtime sem cuidado (ver CLAUDE.md → armadilhas) — por isso o renderer é um arquivo só.

## ADR-002 — Zero dependências de runtime · aceita
- **Contexto:** risco de supply chain em app que executa ações no PC.
- **Decisão:** usar `fetch` nativo para as 4 APIs de IA em vez de SDKs; só devDependencies.
- **Consequências:** mais código de adapter (testado), mas superfície mínima. Streaming/recursos novos exigem implementação própria.

## ADR-003 — Interface `Provider` com adapters puros · aceita
- **Decisão:** formato interno `ChatMessage`; cada provedor tem funções puras `to…/parse…` + um `chat()` fino sobre `postJson`.
- **Consequências:** conversões 100% testáveis sem rede; adicionar provedor = 1 arquivo + registro + testes.
- **Provedores do MVP:** Ollama (local, privado), Groq (nuvem com plano grátis, formato OpenAI), Gemini, Anthropic.

## ADR-004 — Ferramentas com allowlist + `Platform` + confirmação · aceita
- **Decisão:** o modelo só escolhe entre ferramentas pré-definidas e *chaves* de allowlist; nada de executar comando livre.
  SO acessado via `Platform` injetável. Ações sensíveis via `needsConfirm` (fail-closed).
- **Consequências:** menos "mágica" que um agente irrestrito, porém previsível e testável. Ver `SECURITY.md`.

## ADR-005 — Chaves de API cifradas com `safeStorage` (async) · aceita
- **Decisão:** `encryptStringAsync`/`decryptStringAsync`; disponibilidade cacheada em `init()`; recusar salvar sem criptografia.
- **Consequências:** chave só decifrável pelo mesmo usuário/máquina do SO; trocar de máquina exige colar a chave de novo.

## ADR-006 — Sem streaming no MVP · aceita (revisável)
- **Contexto:** barra pequena; respostas curtas; complexidade de 4 formatos de stream + tool calls.
- **Decisão:** requisições não-streaming com timeout/cancelamento. **Revisar** (ROADMAP F-3) se a latência incomodar.

## ADR-007 — Janela única com painel de configurações embutido · aceita
- **Decisão:** uma `BrowserWindow`; configurações e confirmações são seções da mesma página (menos IPC/estado, menos superfícies).

## ADR-008 — Inicialização com o SO é opt-in · aceita
- **Decisão:** item de menu da bandeja, desligado por padrão. Evita persistência sem consentimento.

## ADR-009 — Testes com `node:test` sobre `dist/` · aceita
- **Decisão:** sem Jest/Vitest (zero deps). `npm test` compila e roda `node --test "dist/**/*.test.js"`. Código testável não importa `electron`.

## ADR-013 — Descoberta de modelos e recuperação automática em 404 · aceita
- **Contexto (bug real, teste manual 1):** o modelo padrão do Groq (`llama-3.3-70b-versatile`) foi descontinuado e a conversa falhou com *"Erro 404 … model does not exist"*.
  Nomes de modelo envelhecem; qualquer padrão fixo vai quebrar de novo.
- **Decisão:** (1) `Provider.listModels()` em todos os adapters (`/models`, `/api/tags`…); (2) `pickFallbackModel` (puro, em `ai/models.ts`) escolhe um
  substituto por ordem de preferência, ignorando áudio/embedding/guard; (3) `withModelRecovery` (`ai/modelRecovery.ts`): em **404**, lista, escolhe, repete **uma** vez,
  só persiste o novo modelo **depois de funcionar** e devolve um `notice` mostrado ao usuário; vale para a conversa e para "Testar conexão";
  (4) botão **Buscar modelos** no painel ⚙ preenche o campo (datalist) com os modelos da chave do usuário.
- **Consequências:** só 404 dispara a troca (401/429/rede continuam erros normais, sem listar nada). O substituto pode ter qualidade/custo diferentes — por isso há aviso
  explícito e o usuário pode fixar outro modelo. Todo novo provedor **deve** implementar `listModels`.

## ADR-012 — UI servida por protocolo `app://` (fuse do `file://` desligado) · aceita
- **Contexto:** ADR-011 precisou ligar `GrantFileProtocolExtraPrivileges` para a UI carregar do asar via `file://`, o que concede privilégios extras a qualquer página `file://`.
- **Decisão:** esquema customizado `app://ui/` registrado como privilegiado (`standard`+`secure`) **antes** do `app.ready` (`protocol.ts`).
  O handler serve **somente** `index.html`, `renderer.js` e `styles.css` (lista fechada em `appUrl.ts`), lendo com `fs` (compatível com asar), com
  CSP também como **cabeçalho** HTTP, `nosniff` e `no-store`. Qualquer outro caminho/host/porta/esquema ⇒ 404. O fuse volta a ficar **desligado**.
  A origem confiável do IPC passou a ser exatamente `app://ui/index.html` (`RENDERER_URL`).
- **Consequências:** nenhuma página do app tem acesso a `file://` (confirmado: `fetch('file:///…')` falha); resolução de URLs é pura e testada (path traversal, `%2e%2e`, barras
  invertidas, outros hosts). Novo arquivo de UI ⇒ precisa entrar em `ASSETS` (senão 404). Substitui a exceção do `file://` da ADR-011.
- **Verificação:** `scripts/smoke.mjs` (ver DEVELOPMENT.md) comprova página, preload, IPC, CSP e bloqueio de `file://` no dev, no `win-unpacked` e no portátil.

## ADR-011 — Empacotamento com electron-builder (NSIS + portátil) · aceita (a exceção do `file://` foi substituída pela ADR-012)
- **Contexto:** precisamos distribuir um `.exe`. Alternativas: `@electron/packager` (só pasta) ou electron-builder (instalador + portátil).
- **Decisão:** `electron-builder` como **devDependency** (nunca vai no pacote). Alvos `nsis` (instalador por usuário, com escolha de pasta) e `portable`,
  ambos x64; nomes distintos (`…-Setup-…` e `…-Portable-…`) — com o mesmo nome um sobrescreve o outro. Saída em `release/` (ignorada pelo git).
  Só `dist/**`, `assets/icon.png` e `package.json` entram no `app.asar` (sem `src/`, testes, sourcemaps nem node_modules).
- **Fuses do Electron** (aplicados no build): `RunAsNode` off, `EnableNodeOptionsEnvironmentVariable` off, `EnableNodeCliInspectArguments` off,
  `EnableEmbeddedAsarIntegrityValidation` on, `OnlyLoadAppFromAsar` on, `EnableCookieEncryption` on.
- **Exceção consciente — `GrantFileProtocolExtraPrivileges` = on:** com ele desligado, a UI **não carrega** do `file://` dentro do asar
  (`ERR_FILE_NOT_FOUND`; reproduzido e confirmado ligando só esse fuse). Mitigações: o app só carrega a própria página local, CSP estrita,
  navegação/`window.open` bloqueados, nenhuma URL remota. **Solução definitiva:** servir a UI por protocolo customizado (`app://`) e desligar o fuse (ROADMAP S-4).
- **Consequências:** instalador ≈ 113 MB, portátil ≈ 103 MB (Chromium). Sem certificado de assinatura ⇒ o SmartScreen avisará "editor desconhecido" (ROADMAP D-3).
  Requer rede no primeiro build (baixa Electron, NSIS e 7zip do GitHub — verificados pelo electron-builder).
- **Efeito colateral:** `productName` = "AI Assistant" ⇒ pasta de dados `%APPDATA%\AI Assistant` (igual em dev e empacotado).

## ADR-010 — Atalho global padrão `Control+Alt+Space` · aceita
- **Contexto:** `Alt+Space` abre o menu de sistema do Windows; `Ctrl+Space` conflita com IME. Configurável; fallback ao padrão e aviso se falhar.
