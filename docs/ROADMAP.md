# Roadmap

Legenda: ✅ feito · 🔜 próximo · 💡 ideia. Prioridade P0 (crítico) → P3. Ao concluir um item, marque aqui **e** em `PROGRESS.md`.

## MVP (v0.1) — ✅ código pronto (falta validação manual; ver PROGRESS)
- ✅ Barra flutuante no topo, atalho global, bandeja, instância única
- ✅ 4 provedores (Ollama, Groq, Gemini, Anthropic) com tool calling
- ✅ 8 ferramentas + confirmação de ações sensíveis
- ✅ Configurações com chaves cifradas; teste de conexão
- ✅ Testes unitários (32) e documentação

## Próximo (v0.2) — qualidade e distribuição
- 🔜 **D-1 (P0)** Validação manual completa no Windows (checklist em DEVELOPMENT.md) com chaves reais e com Ollama.
- 🔜 **D-2 (P0)** Empacotamento (electron-builder ou electron-packager): instalador/portátil, ícone .ico, corrigir caminho do `assets/icon.png`, assinatura de código.
- 🔜 **F-1 (P1)** Renderização de Markdown seguro nas respostas (sem `innerHTML`: construir nós DOM).
- 🔜 **F-2 (P1)** Histórico de conversas persistente (opt-in) + comando para apagar.
- 🔜 **F-3 (P2)** Streaming de respostas (revisar ADR-006).
- 🔜 **F-4 (P2)** Seleção de modelo a partir da lista do provedor (`/models`), com fallback quando o modelo configurado deixa de existir (erro 404).
- 🔜 **F-5 (P2)** Lista de apps ampliada via descoberta de atalhos do Menu Iniciar (com allowlist/confirmação).
- 🔜 **T-1 (P2)** Teste de integração do `ipc.ts`/`window.ts` com Electron headless (Playwright/Spectron-like) ou testes de contrato do IPC.
- 🔜 **T-2 (P3)** CI (GitHub Actions: `npm ci && npm test` em windows-latest).

## Segurança futura
- 💡 **S-1 (P1)** "Sessão contaminada": após ler conteúdo externo, bloquear ferramentas sensíveis até nova confirmação (T1).
- 💡 **S-2 (P2)** Log de auditoria local das ações executadas (somente nome da ferramenta + resultado, sem segredos).
- 💡 **S-3 (P2)** Política por ferramenta (sempre perguntar / permitir / bloquear) configurável.

## Funcionalidades ideais (ordem sugerida)
1. 💡 Voz: ditado (STT) e resposta falada (TTS) — começar por APIs opcionais, depois locais.
2. 💡 Mídia: play/pause/próxima via controles de mídia do SO; volume.
3. 💡 Agenda (ICS/Google) somente leitura → depois criar eventos com confirmação.
4. 💡 E-mail somente leitura (IMAP) — exige S-1 antes.
5. 💡 Integrações por webhook/Home Assistant/Telegram (todas opt-in, com segredos cifrados).
6. 💡 Notificações do SO como entrada (exige S-1).
7. 💡 Modo "pesquisa na web": ler resultados e citar fontes — exige S-1.
8. 💡 Controle do app a partir do celular na rede local — exige revisão de segurança (ver SECURITY.md → canais).
9. 💡 Temas/visual, multi-monitor avançado, macOS/Linux (`Platform` já isola o SO).
