import type { ChatMessage, ToolCall, ToolSpec } from '../../../shared/types';
import { type ChatRequest, type ChatResponse, type Provider, ProviderError, parseArgs, postJson } from '../provider';

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };
export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Block[];
}

export function toAnthropicMessages(messages: ChatMessage[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content });
    else if (m.role === 'assistant') {
      const blocks: Block[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const c of m.toolCalls ?? []) blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args });
      if (blocks.length) out.push({ role: 'assistant', content: blocks });
    } else {
      const block: Block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
      const last = out[out.length - 1];
      // todos os tool_result de uma rodada vão no mesmo turno do usuário
      if (last && last.role === 'user' && Array.isArray(last.content) && last.content.every((b) => b.type === 'tool_result')) {
        last.content.push(block);
      } else out.push({ role: 'user', content: [block] });
    }
  }
  return out;
}

export function toAnthropicTools(tools: ToolSpec[]) {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
}

export function parseAnthropicResponse(data: unknown): ChatResponse {
  const content = (data as { content?: Record<string, unknown>[] }).content;
  if (!Array.isArray(content)) throw new ProviderError('Resposta sem conteúdo da Anthropic.');
  let text = '';
  const toolCalls: ToolCall[] = [];
  for (const b of content) {
    if (b['type'] === 'text' && typeof b['text'] === 'string') text += b['text'];
    else if (b['type'] === 'tool_use' && typeof b['name'] === 'string') {
      toolCalls.push({ id: String(b['id'] ?? `call_${toolCalls.length}`), name: b['name'], args: parseArgs(b['input']) });
    }
  }
  return { text, toolCalls };
}

export function createAnthropicProvider(apiKey: string, model: string): Provider {
  return {
    id: 'anthropic',
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const body: Record<string, unknown> = {
        model,
        max_tokens: 1024,
        system: req.system,
        messages: toAnthropicMessages(req.messages),
      };
      if (req.tools.length) body['tools'] = toAnthropicTools(req.tools);
      const data = await postJson(
        'https://api.anthropic.com/v1/messages',
        { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body,
        req.signal,
      );
      return parseAnthropicResponse(data);
    },
  };
}
