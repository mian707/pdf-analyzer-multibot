/**
 * Maximum tokens a model may generate per call (shared across providers so they
 * behave alike). For reasoning models (GPT-5.x, Gemini 3) this budget includes the
 * hidden thinking tokens, so leave headroom above the size of the JSON you expect.
 */
export const MAX_OUTPUT_TOKENS = 16000;

export const cleanJson = (s: string): string =>
  s.replace(/```json/g, '').replace(/```/g, '').trim();

/** Retry transient overload/rate-limit errors with exponential backoff. */
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const msg = (error?.message || '').toLowerCase();
      const status = error?.status || error?.code;
      const retryable =
        status === 503 || status === 429 || status === 529 ||
        msg.includes('overloaded') || msg.includes('rate limit') ||
        msg.includes('429') || msg.includes('503') || msg.includes('529') ||
        msg.includes('deadline exceeded');
      if (retryable && i < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 3000 + Math.random() * 2000));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}
