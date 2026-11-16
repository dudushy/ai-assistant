# Arquitetura

## Visão geral
```
┌────────────────────────── Electron ──────────────────────────┐
│ main (Node)                                                  │
│  main.ts ─ ciclo de vida, atalho global, bandeja             │
│  window.ts ─ BrowserWindow sem moldura, sempre no topo       │
│  ipc.ts ──── handlers + Agent + confirmações                 │
│  settings.ts ─ SettingsStore (JSON + chaves cifradas)        │
│  platform.ts ─ ÚNICA ponte para shell/clipboard/Notification │
│  ai/  agent.ts ─ loop de tool calling                        │
│       provider.ts ─ interface Provider + postJson            │
│       providers/{ollama,openai-compat,gemini,anthropic}.ts   │
│  tools/ builtin.ts ─ ferramentas │ types.ts ─ contratos      │
├──────────────── contextBridge (window.api) ──────────────────┤
│ preload (sandbox) ─ expõe RendererApi, nada mais             │
├──────────────────────────────────────────────────────────────┤
│ renderer (Chromium, CSP estrita) ─ UI da barra               │
└──────────────────────────────────────────────────────────────┘
```
Rede: só o processo *main* fala com a internet (APIs de IA e a busca no navegador via `shell.openExternal`).
O renderer não tem acesso a rede nem a Node.

## Fluxo: usuário envia uma mensagem
1. Renderer: `window.api.sendMessage(text)` → IPC `chat:send`.
2. `ipc.ts` valida origem (`senderFrame.url` == nossa página) e tamanho (≤ 4000), recusa se já houver envio em curso.
3. Monta o `Provider` da configuração atual (`registry.createProvider`) com a chave decifrada **só em memória**.
4. `Agent.send` (até `MAX_STEPS = 6` rodadas):
   a. `provider.chat({system, messages, tools})` → `{text, toolCalls}`.
   b. Sem `toolCalls` ⇒ devolve `text`.
   c. Para cada call: acha a `Tool` (inexistente ⇒ erro textual ao modelo) → se `needsConfirm(args)` retorna texto,
      chama `confirm()` (ver abaixo) → `tool.run(args, ctx)`; qualquer exceção vira `"Erro: …"` devolvido ao modelo.
   d. Resultados entram como mensagens `tool` e volta ao passo (a).
5. Em erro/cancelamento o histórico é restaurado ao tamanho anterior (sem estado inconsistente).
6. Resposta final volta ao renderer como `ChatResult`.

## Fluxo: confirmação de ação sensível
`Agent` → `confirm(tool, descrição)` (em `ipc.ts`): cria `id` (UUID), mostra a janela, emite evento `chat:event {type:'confirm'}`
→ renderer exibe a caixa → botão chama `confirm:respond(id, bool)` → promessa resolve. Timeout de 60 s e `chat:cancel`
**negam** por padrão (fail-closed).

## Modelo de mensagens (provider-agnóstico)
`ChatMessage = user | assistant{toolCalls?} | tool{toolCallId,name}` (`shared/types.ts`). Cada adapter converte de/para o
formato do provedor com funções **puras e testadas** (`toXMessages`, `toXTools`, `parseXResponse`):

| Provedor | Endpoint | Auth | Particularidades |
|---|---|---|---|
| Ollama | `POST {url}/api/chat` | — | `arguments` já é objeto; `tool_name` nas respostas de tool; ids sintéticos |
| Groq | `POST https://api.groq.com/openai/v1/chat/completions` | `Authorization: Bearer` | formato OpenAI; `arguments` é string JSON |
| Gemini | `POST …/v1beta/models/{m}:generateContent` | header `x-goog-api-key` | tipos em maiúsculas; sem `parameters` se não há props; tool results agrupados |
| Anthropic | `POST https://api.anthropic.com/v1/messages` | `x-api-key` + `anthropic-version` | blocos `tool_use`/`tool_result`; results agrupados num turno |

## Ferramentas (`tools/builtin.ts`)
| Nome | Risco | Observação |
|---|---|---|
| `get_datetime`, `system_info` | baixo | só leitura |
| `open_url` | baixo/médio | só http(s), sem credenciais na URL, ≤ 2048 chars |
| `web_search` | baixo | abre DuckDuckGo no navegador; não lê resultados (evita injeção de prompt) |
| `open_app` | médio | **allowlist fechada** (`APP_ALLOWLIST`), exe sem caminho, `spawn` sem shell |
| `set_timer` | baixo | 0 < min ≤ 1440; notificação do SO |
| `lock_pc` | alto | **confirmação** |
| `clipboard_write` | médio | **confirmação** (mostra prévia do texto) |

`Platform` (`tools/types.ts`) abstrai o SO (`openExternal`, `notify`, `writeClipboard`, `lockWorkStation`, `launch`);
produção = `platform.ts` (Electron), testes = fake. Ferramentas **nunca** importam `electron` diretamente.

## Janela
Sem moldura, transparente, `alwaysOnTop('screen-saver')`, fora da barra de tarefas, centralizada no topo do monitor do
cursor. Altura ajustada pelo renderer (`ui:resize`, 72–620 px). Esconde ao perder o foco (configurável). `will-navigate`
e `window.open` bloqueados; permissões do Chromium negadas.

## Configurações (`settings.ts`)
`userData/settings.json` (modo 0600, escrita atômica `tmp`+`rename`). Chaves de API: `safeStorage.encryptStringAsync` →
base64 no JSON. Se a criptografia não estiver disponível, **recusa** salvar a chave. `PublicSettings` (enviado ao renderer)
traz apenas `hasKey: boolean` por provedor.

## Build
`tsconfig.json` (main/preload/shared, CommonJS) e `tsconfig.renderer.json` (ES2022 + DOM) → `dist/`. `copy-static.mjs`
copia `index.html`/`styles.css`. Entrada do Electron: `dist/main/main.js`. Ícone: `assets/icon.png` (resolvido a partir de
`dist/main` ⇒ `../../assets`; **ao empacotar, revisar esse caminho** — ver ROADMAP).
