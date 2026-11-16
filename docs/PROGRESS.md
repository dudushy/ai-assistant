# Progresso e handoff entre sessões

> **Atualize este arquivo ao fim de TODA sessão.** Quem abrir uma nova sessão do Claude Code deve ler `CLAUDE.md` → este arquivo → o item de ROADMAP que for trabalhar.

## Estado atual (2026-11-15)
**Versão 0.1.0 (MVP) — código completo, compila, 32/32 testes passando, app inicia sem erros no smoke test.**
O que **ainda não foi validado**: uso real da UI por um humano e chamadas reais às APIs (nenhuma chave foi usada
nas sessões de desenvolvimento). Os adapters foram verificados só por testes de conversão contra o formato documentado
de cada API — **o primeiro teste real pode revelar ajustes** (ex.: nome de modelo padrão, campos opcionais).

### Entregue
| Área | Itens |
|---|---|
| App | Barra no topo (sem moldura, transparente, sempre visível), atalho global `Control+Alt+Space`, bandeja, instância única, esconder ao perder foco, auto-altura |
| IA | Ollama, Groq, Gemini, Anthropic via `fetch`; tool calling; loop de até 6 passos; cancelamento; timeout |
| Ferramentas | `get_datetime`, `system_info`, `open_url`, `web_search`, `open_app` (allowlist), `set_timer`, `lock_pc`*, `clipboard_write`* (*exigem confirmação) |
| Config | Painel ⚙ (provedor, modelo, chave, URL Ollama, atalho, esconder ao clicar fora), teste de conexão, chaves cifradas |
| Segurança | contextIsolation + sandbox + CSP; IPC com checagem de origem; fail-closed nas confirmações; ver `SECURITY.md` |
| Qualidade | 32 testes (conversores ×4, agente/confirmação, ferramentas, settings); `strict` TS |
| Docs | CLAUDE.md, README, ARCHITECTURE, SECURITY, DECISIONS (ADR-001…010), ROADMAP, DEVELOPMENT |

### Valores padrão que podem precisar de ajuste ao testar com chaves reais
- Groq `llama-3.3-70b-versatile`, Gemini `gemini-2.0-flash`, Anthropic `claude-haiku-5-5`, Ollama `llama3.2` (modelo precisa ter suporte a tools).
  Se um modelo deixar de existir a API devolve 404: o usuário troca o nome no painel ⚙ (melhoria: ROADMAP F-4).

## Próximos passos recomendados (ordem)
1. **D-1** Rodar o checklist manual de `DEVELOPMENT.md` com pelo menos 1 provedor real; corrigir o que aparecer; registrar aqui.
2. **D-2** Empacotamento (instalador/portátil).
3. **F-1** Markdown seguro nas respostas; **F-4** lista de modelos do provedor.
4. **T-2** CI no GitHub Actions.
5. Depois, itens de segurança S-1 antes de qualquer canal que leia conteúdo externo.

## Log de sessões
### Sessão 1 — 2026-11-15
- Decisões: Electron + TS, MVP, zero deps de runtime (ADR-001/002), allowlist + confirmação (ADR-004).
- Implementado todo o MVP descrito acima; migrado `safeStorage` para API assíncrona (a síncrona está depreciada no Electron 45).
- Problemas resolvidos: heredoc do Bash quebrando (usar Write); `lib: DOM.Iterable` no tsconfig do renderer; binário do Electron
  precisa de `node node_modules/electron/install.js`; sync→async no `SecretCodec`.
- Pendente: tudo em "Próximos passos". Nenhum bug conhecido em aberto.

<!-- Modelo para novas sessões:
### Sessão N — AAAA-MM-DD
- Objetivo:
- Feito:
- Decisões novas (ADR-xxx):
- Problemas/armadilhas (copiar para CLAUDE.md se recorrentes):
- Próximos passos:
-->
