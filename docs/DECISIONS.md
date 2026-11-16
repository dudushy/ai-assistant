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

## ADR-010 — Atalho global padrão `Control+Alt+Space` · aceita
- **Contexto:** `Alt+Space` abre o menu de sistema do Windows; `Ctrl+Space` conflita com IME. Configurável; fallback ao padrão e aviso se falhar.
