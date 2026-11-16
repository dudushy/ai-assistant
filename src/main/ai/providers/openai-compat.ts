import type { ChatMessage, ToolCall, ToolSpec } from '../../../shared/types';
import { type ChatRequest, type ChatResponse, type Provider, ProviderError, parseArgs, postJson } from '../provider';

/** Adapter para APIs compatíveis com OpenAI Chat Completions (usado para Groq). */

export interface OAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export function toOpenAIMessages(system: string, messages: ChatMessage[]): OAIMessage[] {
  const out: OAIMessage[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content });
    else if (m.role === 'tool') out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
    else {
      const msg: OAIMessage = { role: 'assistant', content: m.content || null };
      if (m.toolCalls?.length) {
        msg.tool_calls = m.toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.args) },
        }));
      }
      out.push(msg);
    }
  }
  return out;
}

export function toOpenAITools(tools: ToolSpec[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export function parseOpenAIResponse(data: unknown): ChatResponse {
  const msg = (data as { choices?: { message?: Record<string, unknown> }[] }).choices?.[0]?.message;
  if (!msg) throw new ProviderError('Resposta sem mensagem do provedor.');
  const rawCalls =
    (msg['tool_calls'] as { id?: string; function?: { name?: string; arguments?: unknown } }[] | undefined) ?? [];
  const toolCalls: ToolCall[] = rawCalls
    .filter((c) => c.function?.name)
    .map((c, i) => ({ id: c.id ?? `call_${i}`, name: c.function!.name!, args: parseArgs(c.function!.arguments) }));
  const content = msg['content'];
  return { text: typeof content === 'string' ? content : '', toolCalls };
}

export function createOpenAICompatProvider(id: 'groq', baseUrl: string, apiKey: string, model: string): Provider {
  return {
    id,
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const body: Record<string, unknown> = {
        model,
        messages: toOpenAIMessages(req.system, req.messages),
        temperature: 0.4,
      };
      if (req.tools.length) body['tools'] = toOpenAITools(req.tools);
      const data = await postJson(`${baseUrl}/chat/completions`, { authorization: `Bearer ${apiKey}` }, body, req.signal);
      return parseOpenAIResponse(data);
    },
  };
}
