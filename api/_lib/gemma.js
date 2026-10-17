// Thin client for Gemma 4 hosted on the Gemini API (Google AI Studio key).
// No SDK: plain fetch keeps the project dependency-free.

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const DEFAULT_MODEL = "gemma-4-26b-a4b-it";

export class CoachError extends Error {
  constructor(message, status = 500, code = "internal") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function buildBody(system, input, { nativeSystem, jsonMode }) {
  const userText = nativeSystem ? input : `${system}\n\n---\n\n${input}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
  };
  if (nativeSystem) body.systemInstruction = { parts: [{ text: system }] };
  if (jsonMode) body.generationConfig.responseMimeType = "application/json";
  return body;
}

async function callOnce(fetchImpl, url, apiKey, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new CoachError("Gemma took too long to answer. Try again.", 504, "timeout");
    }
    throw new CoachError("Couldn't reach the Gemma API.", 502, "network");
  } finally {
    clearTimeout(timer);
  }
}

export function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  // Skip any "thought" parts some models return; keep the answer text.
  return parts
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("");
}

// Pull the first complete JSON object out of model text, tolerating
// markdown fences or stray words around it.
export function parseJsonLoose(text) {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {}
  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Ask Gemma for a JSON answer.
 * Tries native system instructions + JSON mode first; if the API rejects
 * those options (400), falls back to a single merged user message.
 */
export async function askGemmaJson(system, input, opts = {}) {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  const model = opts.model ?? process.env.GEMMA_MODEL ?? DEFAULT_MODEL;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 55000;
  if (!apiKey) {
    throw new CoachError("The server is missing its GEMINI_API_KEY.", 500, "no_key");
  }
  const url = `${API_BASE}/${encodeURIComponent(model)}:generateContent`;

  const attempts = [
    { nativeSystem: true, jsonMode: true },
    { nativeSystem: false, jsonMode: false },
  ];

  let lastError = null;
  for (const mode of attempts) {
    const { status, data } = await callOnce(
      fetchImpl, url, apiKey, buildBody(system, input, mode), timeoutMs
    );
    if (status === 429) {
      throw new CoachError(
        "Gemma's free quota is busy right now. Wait a few seconds and try again.",
        429,
        "rate_limited"
      );
    }
    if (status === 401 || status === 403) {
      throw new CoachError("The Gemma API key was rejected. Check GEMINI_API_KEY.", 500, "bad_key");
    }
    if (status === 400) {
      lastError = new CoachError(data?.error?.message || "Gemma rejected the request.", 502, "bad_request");
      continue; // try the simpler request shape
    }
    if (status >= 500 || status !== 200) {
      lastError = new CoachError("Gemma had a problem answering. Try again.", 502, "upstream");
      continue;
    }
    const parsed = parseJsonLoose(extractText(data));
    if (parsed) return parsed;
    lastError = new CoachError("Gemma's answer wasn't in the expected format. Try again.", 502, "bad_json");
  }
  throw lastError;
}
