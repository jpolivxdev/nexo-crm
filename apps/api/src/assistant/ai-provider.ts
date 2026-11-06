import { z } from 'zod';

/** Um turno da conversa com o guia. */
export interface AiTurn {
  role: 'user' | 'model';
  text: string;
}

export interface AiRequest {
  system: string;
  turns: AiTurn[];
}

export interface AiResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/** Erro do provedor que vira resposta amigável (limite do provedor, fora do ar, resposta vazia). */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly kind: 'limit' | 'unavailable',
  ) {
    super(message);
  }
}

/** Provedor de IA atrás de uma interface, para trocar de modelo sem mexer no resto. */
export interface AiProvider {
  readonly name: string;
  readonly model: string;
  generate(req: AiRequest): Promise<AiResult>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');

const geminiResponse = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({ parts: z.array(z.object({ text: z.string().optional() })).optional() })
          .optional(),
      }),
    )
    .optional(),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().optional(),
      candidatesTokenCount: z.number().optional(),
    })
    .optional(),
});

/**
 * Gemini pela API REST (generateContent). Sem SDK: um POST com a chave no cabeçalho.
 * O texto nunca vai para o log.
 */
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly timeoutMs = 15_000,
  ) {}

  async generate(req: AiRequest): Promise<AiResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: req.turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
          generationConfig: { maxOutputTokens: 400, temperature: 0.3 },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new AiProviderError('Gemini fora do ar ou demorou demais.', 'unavailable');
    }
    if (res.status === 429) throw new AiProviderError('Limite do Gemini.', 'limit');
    if (!res.ok) throw new AiProviderError(`Gemini respondeu ${res.status}.`, 'unavailable');
    const parsed = geminiResponse.safeParse(await res.json().catch(() => null));
    if (!parsed.success)
      throw new AiProviderError('Resposta do Gemini fora do formato.', 'unavailable');
    const text = (parsed.data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim();
    if (!text) throw new AiProviderError('Resposta vazia do Gemini.', 'unavailable');
    return {
      text,
      inputTokens: parsed.data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: parsed.data.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }
}
