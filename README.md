# AI Assistant

Assistente de IA para desktop que vive numa barra no topo da tela. Abra com **`Ctrl+Alt+Space`**, converse por texto e peça
ações simples no computador. Feito com **Electron + TypeScript**, sem dependências de runtime.

- **Vários provedores de IA:** Ollama (100% local), Groq, Google Gemini e Anthropic Claude.
- **Ações no PC** por *tool calling*: hora, info do sistema, abrir links/pesquisas, abrir apps (lista fechada),
  lembretes, bloquear o PC e copiar texto (estes dois pedem sua confirmação).
- **Segurança por padrão:** chaves de API cifradas pelo sistema, janela isolada (sandbox + CSP), sem execução livre de comandos.

> Status: **MVP (v0.1.0)**. Veja [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Começando
```bash
npm install
node node_modules/electron/install.js   # só se o binário do Electron não tiver sido baixado
npm start
```
1. Clique em ⚙, escolha o provedor e cole a chave de API (ou use o Ollama local) → **Testar conexão**.
   - Groq (grátis): https://console.groq.com/keys · Gemini: https://aistudio.google.com/apikey · Claude: https://platform.claude.com/settings/keys
   - Ollama: instale em https://ollama.com e rode `ollama pull llama3.2` (o modelo precisa suportar *tools*).
2. Digite, por exemplo: *"que horas são?"*, *"abre a calculadora"*, *"pesquisa receita de bolo"*, *"me avisa em 10 minutos para tirar o bolo"*.

Atalhos: `Ctrl+Alt+Space` mostra/oculta · `Esc` oculta · ícone da bandeja para menu (iniciar com o Windows, sair).

## Gerar o instalador
```bash
npm run dist   # cria release/AI Assistant-Setup-*.exe e release/AI Assistant-Portable-*.exe
```
Os binários ainda não são assinados: o SmartScreen pode avisar na primeira execução.

## Desenvolvimento
```bash
npm test        # compila e roda os testes
npm run dev     # app com DevTools
```
Documentação completa em [`docs/`](docs): arquitetura, segurança, decisões, roadmap e guia de desenvolvimento.
Se você usa o Claude Code, ele lê [`CLAUDE.md`](CLAUDE.md) automaticamente.

## Licença
MIT
