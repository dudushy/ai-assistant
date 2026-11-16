import type { ChatMessage, ToolCall, ToolSpec } from '../../../shared/types';
import { type ChatRequest, type ChatResponse, type Provider, ProviderError, getJson, parseArgs, postJson } from '../provider';

type Part =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: { result: string } } };
export interface GeminiContent {
  role: 'user' | 'model';
  parts: Part[];
}

export function toGeminiContents(messages: ChatMessage[]): GeminiContent[] {
  const out: GeminiContent[] = [];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', parts: [{ text: m.content }] });
    else if (m.role === 'assistant') {
      const parts: Part[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const c of m.toolCalls ?? []) parts.push({ functionCall: { name: c.name, args: c.args } });
      if (parts.length) out.push({ role: 'model', parts });
    } else {
      const part: Part = { functionResponse: { name: m.name, response: { result: m.content } } };
      const last = out[out.length - 1];
      // resultados de várias ferramentas da mesma rodada precisam ir juntos num único turno do usuário
      if (last && last.role === 'user' && last.parts.every((p) => 'functionResponse' in p)) last.parts.push(part);
      else out.push({ role: 'user', parts: [part] });
    }
  }
  return out;
}

export function toGeminiTools(tools: ToolSpec[]) {
  if (!tools.length) return undefined;
  return [
    {
      functionDeclarations: tools.map((t) => {
        const hasProps = Object.keys(t.parameters.properties).length > 0;
        const decl: Record<string, unknown> = { name: t.name, description: t.description };
        // Gemini rejeita OBJECT com `properties` vazio: ferramentas sem parâmetros omitem `parameters`.
        if (hasProps) {
          decl['parameters'] = {
            type: 'OBJECT',
            properties: Object.fromEntries(
              Object.entries(t.parameters.properties).map(([k, v]) => [
                k,
                { type: v.type.toUpperCase(), description: v.description, ...(v.enum ? { enum: v.enum } : {}) },
              ]),
            ),
            ...(t.parameters.required?.length ? { required: t.parameters.required } : {}),
          };
        }
        return decl;
      }),
    },
  ];
}

export function parseGeminiResponse(data: unknown): ChatResponse {
  const cand = (data as { candidates?: { content?: { parts?: Record<string, unknown>[] } }[] }).candidates?.[0];
  const parts = cand?.content?.parts;
  if (!parts) {
    throw new ProviderError('O Gemini não retornou conteúdo (pode ter sido bloqueado pelo filtro de segurança).');
  }
  let text = '';
  const toolCalls: ToolCall[] = [];
  for (const p of parts) {
    if (typeof p['text'] === 'string') text += p['text'];
    const fc = p['functionCall'] as { name?: string; args?: unknown } | undefined;
    if (fc?.name) toolCalls.push({ id: `call_${toolCalls.length}`, name: fc.name, args: parseArgs(fc.args) });
  }
  return { text, toolCalls };
}

/** Só modelos que suportam generateContent; remove o prefixo "models/". */
export function parseGeminiModels(data: unknown): string[] {
  const list = (data as { models?: { name?: unknown; supportedGenerationMethods?: unknown }[] }).models;
  if (!Array.isArray(list)) return [];
  return list
    .filter((m) => typeof m.name === 'string' && Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
    .map((m) => (m.name as string).replace('models/', ''));
}

export function createGeminiProvider(apiKey: string, model: string): Provider {
  return {
    id: 'gemini',
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const body: Record<string, unknown> = {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: toGeminiContents(req.messages),
        generationConfig: { temperature: 0.4 },
      };
      const tools = toGeminiTools(req.tools);
      if (tools) body['tools'] = tools;
      // a chave vai no cabeçalho (nunca na URL) para não vazar em logs/erros
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      return parseGeminiResponse(await postJson(url, { 'x-goog-api-key': apiKey }, body, req.signal));
    },
    async listModels(signal) {
      return parseGeminiModels(await getJson('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { 'x-goog-api-key': apiKey }, signal));
    },
  };
}
