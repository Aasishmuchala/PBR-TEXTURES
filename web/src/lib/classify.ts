// claudeopus.pro vision call with retry-on-429/5xx + model fallback.
// Prefers the user's chosen model (opus 4.7); only falls back when it's
// transiently unavailable, so classification still works under rate limits.

const CO_ENDPOINT = "https://api.claudeopus.pro/v1/chat/completions";
const CO_MODELS = ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ClaudeOpusResult {
  text: string;
  model: string;
}

export async function claudeOpusVision(
  key: string,
  prompt: string,
  dataUrl: string,
  maxTokens = 40,
): Promise<ClaudeOpusResult> {
  let lastErr = "claudeopus.pro request failed";

  for (const model of CO_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let r: Response;
      try {
        r = await fetch(CO_ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: prompt },
                  { type: "image_url", image_url: { url: dataUrl } },
                ],
              },
            ],
          }),
        });
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        await sleep(1200);
        continue; // network blip — retry
      }

      if (r.ok) {
        const j = (await r.json().catch(() => null)) as {
          choices?: Array<{ message?: { content?: unknown } }>;
        } | null;
        const content = j?.choices?.[0]?.message?.content;
        const text =
          typeof content === "string"
            ? content
            : Array.isArray(content)
              ? content.map((c) => (typeof c === "string" ? c : (c as { text?: string })?.text ?? "")).join(" ")
              : "";
        if (text.trim()) return { text: text.trim(), model };
        lastErr = "empty/unexpected response shape";
        break; // shape issue won't be fixed by retry — try next model
      }

      const status = r.status;
      const body = await r.text().catch(() => "");
      lastErr = `${status} ${body.slice(0, 160)}`;

      if (status === 401 || status === 403) throw new Error(lastErr); // bad key — stop
      if (status === 429 || status === 502 || status === 503 || status === 529) {
        if (attempt === 0) {
          await sleep(1800); // transient — back off and retry same model once
          continue;
        }
        break; // still busy — fall through to next model
      }
      break; // 404 / other — try next model
    }
  }
  throw new Error(lastErr);
}
