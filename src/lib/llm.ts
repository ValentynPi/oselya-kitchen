/** OpenAI (ChatGPT) helpers for server-side recipe enrichment. */

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const DEFAULT_BASE =
  process.env.OPENAI_BASE_URL?.replace(/\/$/, "") || "https://api.openai.com/v1";

export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

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

/**
 * Ask ChatGPT for a JSON object. Returns null when unconfigured or on any failure.
 */
export async function completeJson<T>(
  system: string,
  user: string,
): Promise<T | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const url = `${DEFAULT_BASE}/chat/completions`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
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

      if (!res.ok) {
        return null;
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };

      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) return null;

      const jsonText = extractJsonObject(text);
      if (!jsonText) return null;

      return JSON.parse(jsonText) as T;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}
