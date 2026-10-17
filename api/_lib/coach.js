import {
  DIMENSIONS,
  PROMPT_TYPES,
  ANALYZE_SYSTEM,
  REWRITE_SYSTEM,
  buildAnalyzeInput,
  buildRewriteInput,
} from "./rubric.js";
import { askGemmaJson, CoachError } from "./gemma.js";

export const MAX_PROMPT_CHARS = 4000;
const STATUSES = ["good", "weak", "missing"];

const str = (v, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function validatePrompt(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new CoachError("Write a prompt first.", 400, "empty");
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new CoachError(`Keep the prompt under ${MAX_PROMPT_CHARS} characters.`, 400, "too_long");
  }
  return prompt.trim();
}

// Make the model's analysis safe for the UI: fixed dimension order,
// clamped score, bounded lists, no missing fields.
export function normalizeAnalysis(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const byKey = new Map();
  for (const d of Array.isArray(r.dimensions) ? r.dimensions : []) {
    if (d && typeof d.key === "string") byKey.set(d.key.toLowerCase().trim(), d);
  }
  const dimensions = DIMENSIONS.map(({ key, label, hint }) => {
    const d = byKey.get(key) || {};
    const status = STATUSES.includes(d.status) ? d.status : "missing";
    return { key, label, hint, status, note: str(d.note, 200) };
  });

  let score = Math.round(Number(r.score));
  if (!Number.isFinite(score)) {
    // Fall back to a rubric-derived score if the model omitted it.
    const pts = dimensions.reduce((s, d) => s + (d.status === "good" ? 1 : d.status === "weak" ? 0.5 : 0), 0);
    score = Math.round((pts / dimensions.length) * 10);
  }
  score = Math.max(0, Math.min(10, score));

  const type = str(r.prompt_type, 20).toLowerCase();
  const questions = (Array.isArray(r.questions) ? r.questions : [])
    .map((q, i) => ({
      id: `q${i + 1}`,
      dimension: str(q?.dimension, 30).toLowerCase(),
      question: str(q?.question, 200),
      options: (Array.isArray(q?.options) ? q.options : [])
        .map((o) => str(o, 120))
        .filter(Boolean)
        .slice(0, 4),
    }))
    .filter((q) => q.question)
    .slice(0, 4);

  return {
    prompt_type: PROMPT_TYPES.includes(type) ? type : "other",
    score,
    verdict: str(r.verdict, 300),
    dimensions,
    top_gaps: (Array.isArray(r.top_gaps) ? r.top_gaps : []).map((g) => str(g, 120)).filter(Boolean).slice(0, 3),
    questions,
  };
}

export function normalizeRewrite(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const rewritten = str(r.rewritten, 8000);
  if (!rewritten) {
    throw new CoachError("Gemma didn't return a rewritten prompt. Try again.", 502, "bad_json");
  }
  const changes = (Array.isArray(r.changes) ? r.changes : [])
    .map((c) => ({ what: str(c?.what, 80), why: str(c?.why, 240) }))
    .filter((c) => c.what)
    .slice(0, 5);
  return { rewritten, changes };
}

export async function analyzePrompt(prompt, opts) {
  const clean = validatePrompt(prompt);
  const raw = await askGemmaJson(ANALYZE_SYSTEM, buildAnalyzeInput(clean), opts);
  return normalizeAnalysis(raw);
}

export async function rewritePrompt(prompt, answers, gaps, opts) {
  const clean = validatePrompt(prompt);
  const safeAnswers = (Array.isArray(answers) ? answers : [])
    .slice(0, 6)
    .map((a) => ({ question: str(a?.question, 200), answer: str(a?.answer, 400) }));
  const safeGaps = (Array.isArray(gaps) ? gaps : []).map((g) => str(g, 120)).filter(Boolean).slice(0, 5);
  const raw = await askGemmaJson(REWRITE_SYSTEM, buildRewriteInput(clean, safeAnswers, safeGaps), opts);
  return normalizeRewrite(raw);
}
