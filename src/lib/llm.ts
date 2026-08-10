/** OpenAI (ChatGPT) helpers for server-side recipe enrichment. */

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const DEFAULT_BASE =
  process.env.OPENAI_BASE_URL?.replace(/\/$/, "") || "https://api.openai.com/v1";

export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export type CompleteJsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function extractJsonObject(raw: string): string | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (cleaned.startsWith("{") && cleaned.endsWith("}")) return cleaned;

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1);
  return null;
}

function truncateError(text: string, max = 180): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

/**
 * Ask ChatGPT for a JSON object. Returns structured failure when unconfigured or on API errors.
 */
export async function completeJson<T>(
  system: string,
  user: string,
): Promise<CompleteJsonResult<T>> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "OPENAI_API_KEY відсутній на сервері" };
  }

  const url = `${DEFAULT_BASE}/chat/completions`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);
    try {
      const res = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });

      const rawBody = await res.text();
      if (!res.ok) {
        let detail = rawBody;
        try {
          const parsed = JSON.parse(rawBody) as {
            error?: { message?: string; code?: string; type?: string };
          };
          detail =
            parsed.error?.message ||
            parsed.error?.code ||
            parsed.error?.type ||
            rawBody;
        } catch {
          /* keep raw */
        }
        return {
          ok: false,
          error: `OpenAI HTTP ${res.status}: ${truncateError(detail || res.statusText)}`,
        };
      }

      let data: {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      try {
        data = JSON.parse(rawBody) as typeof data;
      } catch {
        return { ok: false, error: "OpenAI повернув не-JSON відповідь" };
      }

      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) {
        return { ok: false, error: "OpenAI повернув порожню відповідь" };
      }

      const jsonText = extractJsonObject(text);
      if (!jsonText) {
        return { ok: false, error: "Не вдалося витягнути JSON з відповіді ШІ" };
      }

      try {
        return { ok: true, data: JSON.parse(jsonText) as T };
      } catch {
        return { ok: false, error: "JSON від ШІ невалідний" };
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: "Таймаут запиту до OpenAI (55с)" };
    }
    const message = err instanceof Error ? err.message : "невідома помилка";
    return { ok: false, error: `Мережа OpenAI: ${truncateError(message)}` };
  }
}
