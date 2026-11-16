import type { ProviderId } from '../../shared/types';

/** Modelos que não servem para conversar com ferramentas (áudio, embeddings, moderação, imagem…). */
const NOT_CHAT = /whisper|tts|guard|orpheus|playai|embed|moderation|image|imagen|veo|aqa|transcribe|audio|live|robotics|safeguard|distil/i;

export function filterChatModels(ids: string[]): string[] {
  return [...new Set(ids)].filter((id) => !NOT_CHAT.test(id)).sort();
}

/** Ordem de preferência por provedor (a 1ª regra que casar vence; dentro dela, o id "maior"/mais novo). */
const PREFERENCES: Record<ProviderId, RegExp[]> = {
  groq: [/llama-3\.3-70b/, /gpt-oss-120b/, /llama-4-maverick/, /llama-4-scout/, /qwen3-32b/, /gpt-oss-20b/, /llama-3\.1-8b/],
  gemini: [/^gemini-[\d.]+-flash$/, /^gemini-[\d.]+-flash-/, /flash/, /pro/],
  anthropic: [/haiku/, /sonnet/, /opus/],
  ollama: [/llama3/, /qwen/, /mistral/, /gemma/],
};

/**
 * Escolhe um substituto para um modelo indisponível. Nunca devolve o próprio `current`.
 * Retorna `null` se não houver nenhum candidato de chat.
 */
export function pickFallbackModel(provider: ProviderId, available: string[], current: string): string | null {
  const candidates = filterChatModels(available)
    .filter((m) => m !== current)
    .reverse(); // ids mais novos costumam ordenar depois ("-0.5" < "-2.5")
  for (const re of PREFERENCES[provider]) {
    const hit = candidates.find((m) => re.test(m));
    if (hit) return hit;
  }
  return candidates[0] ?? null;
}
