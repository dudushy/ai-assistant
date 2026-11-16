# Guia de desenvolvimento

## Setup
```bash
git clone https://github.com/dudushy/ai-assistant.git && cd ai-assistant
npm install
node node_modules/electron/install.js    # se dist/electron.exe não existir
npm test                                 # deve terminar com 32+ testes passando
npm run dev                              # abre o app com DevTools
```
Requisitos: Node ≥ 22, Windows 10/11 (as ações de SO são Windows; o resto compila em qualquer SO).
Dados do app: `%APPDATA%\AI Assistant\settings.json` (o nome vem do `productName` do package.json; igual em dev e empacotado).

## Como adicionar um provedor de IA
1. `src/shared/types.ts`: adicionar o id em `PROVIDER_IDS` e a entrada em `PROVIDERS` (label, needsKey, defaultModel).
2. Criar `src/main/ai/providers/<nome>.ts` com `toXMessages`, `toXTools`, `parseXResponse` (puras, exportadas) e `createXProvider`
   usando `postJson` (segredo em **header**, nunca na URL).
3. Registrar em `src/main/ai/registry.ts`.
4. Testes em `providers.test.ts`: conversão de conversa com 2 tool calls, parsing de resposta com/sem tool, caso de erro.
5. Atualizar tabela em `ARCHITECTURE.md` e `DECISIONS.md` se houver particularidade.

## Como adicionar uma ferramenta
1. Siga o checklist de `SECURITY.md`.
2. Em `src/main/tools/builtin.ts`: criar o objeto `Tool` (spec + `run` + `needsConfirm?`) e incluir em `BUILTIN_TOOLS`.
   Se precisar de uma capacidade nova do SO: adicionar método em `Platform` (`tools/types.ts`), implementar em `platform.ts`
   e nos fakes dos testes (`agent.test.ts`, `builtin.test.ts`).
3. Testes em `builtin.test.ts` (inclua entradas maliciosas) e, se sensível, caso de recusa em `agent.test.ts`.

## Como adicionar um canal IPC
1. Declarar em `src/shared/ipc.ts` (`IpcInvoke`/`IpcEvents`) e em `RendererApi`.
2. Handler em `ipc.ts` (o objeto `handlers` é tipado: o compilador força o novo canal). Validar tipos/tamanhos.
3. Expor em `preload.ts` (literal do canal) — o compilador confere contra `IpcInvoke`.
4. Usar no renderer via `window.api`.

## Checklist de validação manual (Windows) — usar antes de cada release
- [ ] `npm run dev`: barra aparece no topo do monitor do cursor; `Ctrl+Alt+Space` mostra/oculta; `Esc` oculta.
- [ ] Clicar fora esconde (se a opção estiver ligada); desligar a opção mantém visível.
- [ ] Ícone na bandeja: clique alterna; menu "Iniciar com o Windows" liga/desliga; "Sair" encerra.
- [ ] Segunda instância apenas mostra a barra.
- [ ] ⚙: trocar provedor mostra/oculta campos (chave / URL do Ollama); salvar persiste após reiniciar; chave aparece como "salva" e **não** em texto no `settings.json`.
- [ ] "Testar conexão" para cada provedor configurado (Ollama: `ollama pull llama3.2` antes).
- [ ] Conversa simples; "que horas são?" (tool `get_datetime`); "abre a calculadora"; "pesquisa receita de bolo".
- [ ] "me avisa em 1 minuto" gera notificação do SO.
- [ ] "bloqueia o pc" mostra confirmação; **Recusar** não bloqueia; **Permitir** bloqueia; ignorar 60 s = recusa.
- [ ] "copia 'olá' pra área de transferência" pede confirmação.
- [ ] Botão ■ cancela uma resposta em andamento; ＋ limpa a conversa.
- [ ] Erros amigáveis: sem chave, chave inválida (401/403), Ollama desligado, sem internet.
- [ ] Janela cresce/encolhe com o conteúdo (sem cortar texto, até 620 px, com rolagem).

## Smoke test automatizável (`scripts/smoke.mjs`)
```bash
npm run smoke                                              # app em modo dev
node scripts/smoke.mjs "release/win-unpacked/AI Assistant.exe"   # app empacotado (também funciona com o Portable)
```
Inicia o app oculto (`--hidden`) com `--remote-debugging-port` aleatório, conecta no DevTools Protocol e verifica: página em `app://ui/index.html`,
`window.api` exposto, **sem** `require`/`process` no renderer, IPC aceitando a origem (4 provedores chegam ao seletor), CSS aplicado, CSP bloqueando
script inline e `fetch('file://…')` bloqueado. Sai com código 1 se algo falhar. Não substitui o checklist manual (não clica, não usa chaves reais).

## Empacotamento (feito — ADR-011)
```bash
npm run pack     # só a pasta release/win-unpacked (rápido, bom para testar)
npm run dist     # instalador + portátil em release/
```
Saídas (pasta `release/`, ignorada pelo git):
- `AI Assistant-Setup-<versão>-x64.exe` — instalador NSIS (por usuário, escolhe a pasta, cria atalhos, desinstalador).
- `AI Assistant-Portable-<versão>-x64.exe` — executável único, sem instalar.
- `latest.yml` / `.blockmap` — metadados de auto-update (ainda não usados; D-4).

Configuração: bloco `"build"` do `package.json`. Ícones gerados por `node scripts/make-icon.mjs` (`assets/icon.png` 256 px e `icon.ico`).
O ícone da bandeja é lido de `assets/icon.png` por caminho relativo a `__dirname` — funciona dentro do asar porque `assets/icon.png` entra no pacote.
Requer internet no 1º build (baixa Electron, NSIS e 7zip). Build completo: ~2–4 min.

**Verificação pós-build (faça sempre):**
1. `node node_modules/@electron/asar/bin/asar.js list release/win-unpacked/resources/app.asar` — deve conter só `dist/`, `assets/icon.png`, `package.json` (sem `.map`, testes, `src/`).
2. `node node_modules/@electron/fuses/dist/bin.js read --app "release/win-unpacked/AI Assistant.exe"` — conferir os fuses do ADR-011.
3. `node scripts/smoke.mjs "release/win-unpacked/AI Assistant.exe"` (e o mesmo com o `…-Portable-…exe`) — tem que terminar em "OK: todas as verificações passaram".
4. Rodar o checklist manual acima com o **portátil** e com uma instalação real do **instalador** (desinstalar depois).

Não assinado: o SmartScreen mostrará "Windows protegeu o computador" → *Mais informações → Executar assim mesmo* (D-3 resolve).

## Dicas de ambiente (Windows + Claude Code CLI)
- Prefira a ferramenta Write a heredocs longos no Bash.
- `rm -rf dist && npm run build` resolve builds estranhos (tsc não apaga saídas antigas).
- Se `electron.exe` não existir: `node node_modules/electron/install.js`.
