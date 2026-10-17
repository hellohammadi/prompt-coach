import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzePrompt, rewritePrompt, normalizeAnalysis } from "../api/_lib/coach.js";
import { parseJsonLoose, CoachError } from "../api/_lib/gemma.js";

// Fake Gemini API: returns queued responses and records requests.
function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    const r = responses.shift();
    return { status: r.status, json: async () => r.data };
  };
  fn.calls = calls;
  return fn;
}
const reply = (obj, extraParts = []) => ({
  status: 200,
  data: { candidates: [{ content: { parts: [...extraParts, { text: typeof obj === "string" ? obj : JSON.stringify(obj) }] } }] },
});

const sampleAnalysis = {
  prompt_type: "writing",
  score: 3,
  verdict: "Topic is clear but the AI has to guess everything else.",
  dimensions: [
    { key: "goal", status: "good", note: "Wants a blog post about kinnow." },
    { key: "audience", status: "missing", note: "No reader named." },
  ],
  top_gaps: ["No audience", "No length", "No tone", "extra"],
  questions: [
    { id: "x", dimension: "audience", question: "Who will read this?", options: ["Customers", "Exporters", "Students", "Chefs", "Too many"] },
    { question: "" },
  ],
};

test("analyze: sends key in header, uses system instruction + JSON mode, normalizes", async () => {
  const f = fakeFetch([reply(sampleAnalysis)]);
  const out = await analyzePrompt("write a blog post about kinnow", { apiKey: "k", fetchImpl: f });
  assert.equal(f.calls.length, 1);
  assert.match(f.calls[0].url, /gemma-4-26b-a4b-it:generateContent$/);
  assert.equal(f.calls[0].headers["x-goog-api-key"], "k");
  assert.ok(f.calls[0].body.systemInstruction);
  assert.equal(f.calls[0].body.generationConfig.responseMimeType, "application/json");
  assert.equal(out.dimensions.length, 7);
  assert.deepEqual(out.dimensions.map((d) => d.key), ["goal", "context", "audience", "format", "constraints", "examples", "success"]);
  assert.equal(out.dimensions[1].status, "missing"); // filled default
  assert.equal(out.top_gaps.length, 3);
  assert.equal(out.questions.length, 1);
  assert.equal(out.questions[0].options.length, 4);
  assert.equal(out.questions[0].id, "q1");
});

test("analyze: falls back to merged prompt when API rejects system/JSON options", async () => {
  const f = fakeFetch([
    { status: 400, data: { error: { message: "Developer instruction is not enabled" } } },
    reply("```json\n" + JSON.stringify(sampleAnalysis) + "\n```"),
  ]);
  const out = await analyzePrompt("draw a cat", { apiKey: "k", fetchImpl: f });
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].body.systemInstruction, undefined);
  assert.equal(f.calls[1].body.generationConfig.responseMimeType, undefined);
  assert.match(f.calls[1].body.contents[0].parts[0].text, /You are Prompt Coach/);
  assert.equal(out.score, 3);
});

test("analyze: skips thought parts and clamps score", async () => {
  const f = fakeFetch([reply({ ...sampleAnalysis, score: 42 }, [{ text: "thinking...", thought: true }])]);
  const out = await analyzePrompt("x", { apiKey: "k", fetchImpl: f });
  assert.equal(out.score, 10);
});

test("analyze: rate limit gives a friendly 429", async () => {
  const f = fakeFetch([{ status: 429, data: {} }]);
  await assert.rejects(analyzePrompt("x", { apiKey: "k", fetchImpl: f }), (e) => e instanceof CoachError && e.status === 429);
});

test("analyze: missing key and empty prompt are rejected before calling Gemma", async () => {
  const f = fakeFetch([]);
  await assert.rejects(analyzePrompt("hi", { apiKey: "", fetchImpl: f }), (e) => e.code === "no_key");
  await assert.rejects(analyzePrompt("   ", { apiKey: "k", fetchImpl: f }), (e) => e.status === 400);
  await assert.rejects(analyzePrompt("a".repeat(4001), { apiKey: "k", fetchImpl: f }), (e) => e.code === "too_long");
  assert.equal(f.calls.length, 0);
});

test("rewrite: passes answers to the model and normalizes changes", async () => {
  const f = fakeFetch([reply({ rewritten: "Write a 600-word post for [your audience]...", changes: [{ what: "Added length", why: "Sets scope." }, {}] })]);
  const out = await rewritePrompt(
    "blog post about kinnow",
    [{ question: "Who will read this?", answer: "Export buyers in the Gulf" }, { question: "Tone?", answer: "" }],
    ["No audience"],
    { apiKey: "k", fetchImpl: f }
  );
  const sent = f.calls[0].body.contents[0].parts[0].text;
  assert.match(sent, /Export buyers in the Gulf/);
  assert.doesNotMatch(sent, /Q: Tone\?/); // blank answers dropped
  assert.equal(out.changes.length, 1);
  assert.match(out.rewritten, /600-word/);
});

test("rewrite: empty rewrite is an error", async () => {
  const f = fakeFetch([reply({ rewritten: "" }), reply({ rewritten: "" })]);
  await assert.rejects(rewritePrompt("x", [], [], { apiKey: "k", fetchImpl: f }), (e) => e.code === "bad_json");
});

test("parseJsonLoose handles surrounding text and braces in strings", () => {
  assert.deepEqual(parseJsonLoose('Sure! {"a":"x}y","b":{"c":1}} done'), { a: "x}y", b: { c: 1 } });
  assert.equal(parseJsonLoose("no json here"), null);
});

test("normalizeAnalysis derives score when missing", () => {
  const out = normalizeAnalysis({ dimensions: [{ key: "goal", status: "good" }, { key: "context", status: "weak" }] });
  assert.equal(out.score, 2); // 1.5/7*10 = 2.14
  assert.equal(out.prompt_type, "other");
});
