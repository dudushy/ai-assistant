# Segurança

Um assistente que executa ações no PC a partir de texto de um LLM é, por natureza, uma superfície de ataque.
Este documento fixa o modelo de ameaças e os controles. **Leia antes de adicionar ferramentas ou canais de entrada.**

## Ativos
1. Chaves de API do usuário. 2. Integridade do PC (executar/abrir coisas). 3. Privacidade (conteúdo do PC e das conversas).

## Ameaças e controles
| # | Ameaça | Controle atual |
|---|---|---|
| T1 | **Injeção de prompt** (texto externo manda o modelo agir) | MVP não lê conteúdo externo (busca só abre o navegador). Prompt de sistema trata saída de tools como dado. Ações sensíveis exigem confirmação humana. **Regra futura:** depois de ingerir conteúdo externo (web/e-mail), ferramentas sensíveis ficam bloqueadas até nova confirmação (ROADMAP S-1). |
| T2 | Modelo escolhe comando arbitrário | `open_app` usa **allowlist fechada** (chave → exe fixo), `spawn(shell:false)`. Não existe ferramenta de "executar comando". |
| T3 | URL maliciosa (`file:`, `javascript:`, credenciais) | `validateWebUrl`: só http(s), sem `user:pass@`, ≤ 2048. |
| T4 | Vazamento de chave de API | Cifrada em disco (`safeStorage`); recusa salvar sem criptografia; nunca enviada ao renderer; Gemini usa header (não URL); mensagens de erro não incluem a chave; `settings.json` com modo 0600. |
| T5 | Renderer comprometido (XSS) | `contextIsolation`, `sandbox`, `nodeIntegration:false`, CSP `default-src 'none'; script-src 'self'`, só `textContent`, navegação/`window.open` bloqueados, permissões negadas, sem conteúdo remoto carregado. |
| T6 | IPC forjado por outra página/frame | Todo handler checa `senderFrame.url === file://…/index.html`; entradas validadas (tipo/tamanho). |
| T7 | Ação sensível sem consentimento | `needsConfirm` + fail-closed (timeout 60 s e cancelar = recusar). |
| T8 | Loop infinito de tools / custo | `MAX_STEPS = 6`; timeouts de rede (90 s; Ollama 180 s); cancelamento via `AbortSignal`. |
| T9 | Supply chain | Zero dependências de runtime; só devDependencies (electron, typescript, @types/node); chamadas HTTP com `fetch` nativo. |
| T10 | Persistência indesejada | Inicialização com o Windows é **opt-in** (menu da bandeja, desligado por padrão). |
| T11 | Instância duplicada / atalho sequestrado | `requestSingleInstanceLock`; falha ao registrar atalho avisa o usuário. |

## Checklist para QUALQUER nova ferramenta
- [ ] Parâmetros validados (tipo, tamanho, faixa) com `argString`/`argNumber` ou equivalente; falha ⇒ `Error` claro.
- [ ] Nada de `shell:true`, `exec` com string, `eval`, `new Function`, caminho/comando vindo do modelo.
- [ ] Acessa o SO **somente** via `Platform` (adicione método lá se necessário).
- [ ] Efeito irreversível, dados do usuário ou saída de rede ⇒ `needsConfirm` com descrição legível.
- [ ] Retorno ao modelo é curto e não inclui segredos.
- [ ] Teste cobrindo entradas maliciosas (ver `builtin.test.ts`).
- [ ] Linha adicionada na tabela de ferramentas de `ARCHITECTURE.md` e, se tiver risco novo, aqui.

## Checklist para novos canais de entrada (web, e-mail, celular, voz…)
- Tratar todo conteúdo como não confiável (T1). Marcar a sessão como "contaminada" e exigir confirmação para sensíveis.
- Servidores locais: bind em `127.0.0.1` por padrão; se for LAN, autenticação forte + HTTPS + limite de taxa + opt-in explícito.
- Nunca abrir portas/regras de firewall sem ação explícita do usuário.

## Relato de vulnerabilidades
Abra uma issue privada no repositório do projeto ou contate o mantenedor diretamente.
