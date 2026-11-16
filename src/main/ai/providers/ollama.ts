import type { ChatMessage, ToolCall } from '../../../shared/types';
import { type ChatRequest, type ChatResponse, type Provider, ProviderError, getJson, parseArgs, postJson } from '../provider';
import { toOpenAITools } from './openai-compat';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[];
  tool_name?: string;
}

export function toOllamaMessages(system: string, messages: ChatMessage[]): OllamaMessage[] {
  const out: OllamaMessage[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content });
    else if (m.role === 'tool') out.push({ role: 'tool', tool_name: m.name, content: m.content });
    else {
      const msg: OllamaMessage = { role: 'assistant', content: m.content };
      if (m.toolCalls?.length) {
        msg.tool_calls = m.toolCalls.map((c) => ({ function: { name: c.name, arguments: c.args } }));
      }
      out.push(msg);
    }
  }
  return out;
}

export function parseOllamaResponse(data: unknown): ChatResponse {
  const msg = (
    data as {
      message?: { content?: string; tool_calls?: { function?: { name?: string; arguments?: unknown } }[] };
    }
  ).message;
  if (!msg) throw new ProviderError('Resposta sem mensagem do Ollama.');
  const toolCalls: ToolCall[] = (msg.tool_calls ?? [])
    .filter((c) => c.function?.name)
    .map((c, i) => ({ id: `call_${i}`, name: c.function!.name!, args: parseArgs(c.function!.arguments) }));
  return { text: msg.content ?? '', toolCalls };
}

export function parseOllamaModels(data: unknown): string[] {
  const list = (data as { models?: { name?: unknown }[] }).models;
  return Array.isArray(list) ? list.map((m) => m.name).filter((n): n is string => typeof n === 'string') : [];
}

export function createOllamaProvider(baseUrl: string, model: string): Provider {
  const base = baseUrl.replace(/\/+$/, '');
  return {
    id: 'ollama',
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const body: Record<string, unknown> = {
        model,
        messages: toOllamaMessages(req.system, req.messages),
        stream: false,
        options: { temperature: 0.4 },
      };
      if (req.tools.length) body['tools'] = toOpenAITools(req.tools);
      const data = await postJson(`${base}/api/chat`, {}, body, req.signal, 180_000);
      return parseOllamaResponse(data);
    },
    async listModels(signal) {
      return parseOllamaModels(await getJson(`${base}/api/tags`, {}, signal));
    },
  };
}
