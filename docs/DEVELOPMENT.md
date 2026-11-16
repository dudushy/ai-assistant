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
Dados do app: `%APPDATA%\ai-assistant\settings.json` (o nome vem do `name` do package.json).

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

## Smoke test automatizável
`timeout 8 node_modules/electron/dist/electron.exe . --hidden` — não deve imprimir erros além dos de GPU/Network causados pelo kill.

## Empacotamento (pendente — D-2)
Pontos de atenção: `main` aponta para `dist/main/main.js`; `assets/icon.png` é lido por caminho relativo a `__dirname`
(ajustar para `process.resourcesPath` quando empacotado); incluir `dist/` e `assets/`, excluir `src/` e testes; ícone `.ico`;
assinatura de código; desabilitar fuses inseguros do Electron (`RunAsNode`, `EnableNodeOptionsEnvironmentVariable`).

## Dicas de ambiente (Windows + Claude Code CLI)
- Prefira a ferramenta Write a heredocs longos no Bash.
- `rm -rf dist && npm run build` resolve builds estranhos (tsc não apaga saídas antigas).
- Se `electron.exe` não existir: `node node_modules/electron/install.js`.
