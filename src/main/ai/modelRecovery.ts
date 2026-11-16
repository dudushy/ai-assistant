import type { ProviderId } from '../../shared/types';
import { pickFallbackModel } from './models';
import { type Provider, ProviderError } from './provider';

export interface RecoveryDeps<T> {
  providerId: ProviderId;
  currentModel: string;
  /** Monta o provedor para um modelo específico. */
  build(model: string): Promise<Provider>;
  /** Executa a operação (conversa, teste…) com o provedor. */
  run(provider: Provider): Promise<T>;
  /** Persiste o novo modelo escolhido. */
  saveModel(model: string): void;
}

export interface Recovered<T> {
  value: T;
  /** Preenchido só quando o modelo foi trocado automaticamente. */
  notice?: string;
}

/** O provedor disse que o modelo não existe / sem acesso. (Groq, Gemini, Anthropic e Ollama respondem 404.) */
export function isModelNotFound(e: unknown): boolean {
  return e instanceof ProviderError && e.status === 404;
}

/**
 * Roda a operação; se o modelo configurado não existir mais (404), lista os modelos da conta, escolhe o melhor
 * substituto, salva e repete UMA vez. Qualquer outro erro (ou falha na recuperação) é propagado.
 */
export async function withModelRecovery<T>(d: RecoveryDeps<T>): Promise<Recovered<T>> {
  const first = await d.build(d.currentModel);
  try {
    return { value: await d.run(first) };
  } catch (e) {
    if (!isModelNotFound(e)) throw e;
    let available: string[];
    try {
      available = await first.listModels();
    } catch {
      throw e; // não deu para listar: mantém o erro original (mais útil que "falha ao listar")
    }
    const next = pickFallbackModel(d.providerId, available, d.currentModel);
    if (!next) throw new ProviderError(`O modelo "${d.currentModel}" não existe e nenhum outro modelo de chat está disponível para esta chave.`, 404);
    const value = await d.run(await d.build(next));
    d.saveModel(next); // só persiste depois de funcionar
    return { value, notice: `O modelo "${d.currentModel}" não está mais disponível; passei a usar "${next}".` };
  }
}
