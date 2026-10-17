// Local dev server: serves index.html and the /api functions without the Vercel CLI.
//   GEMINI_API_KEY=... node scripts/dev.js        -> real Gemma
//   MOCK_GEMMA=1 node scripts/dev.js              -> canned answers, no key needed
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 3000;

if (process.env.MOCK_GEMMA) {
  process.env.GEMINI_API_KEY = "mock";
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes("generativelanguage.googleapis.com")) return realFetch(url, init);
    const text = JSON.parse(init.body).contents[0].parts[0].text;
    const isRewrite = text.includes("Rewrite the prompt.");
    await new Promise((r) => setTimeout(r, 600));
    const payload = isRewrite
      ? {
          rewritten:
            "Write a 600-word blog post about Kinnow oranges from Sargodha for [your audience].\n\nCover: where Kinnow grows, what makes its taste distinct, the harvest season (December to March), and how to pick a good one.\n\nTone: warm and practical, like a farmer explaining to a customer. Use short paragraphs and 3 subheadings. End with a one-line call to action to order direct from the farm.",
          changes: [
            { what: "Set a length", why: "A word count stops the AI guessing between a short note and a long essay." },
            { what: "Listed what to cover", why: "Naming the sections keeps the post on topic and complete." },
            { what: "Chose a tone", why: "Tone shapes word choice more than anything else in a writing prompt." },
            { what: "Added a placeholder for audience", why: "You skipped this question, so fill it in before sending." },
          ],
        }
      : {
          prompt_type: "writing",
          score: text.length > 300 ? 8 : 3,
          verdict: text.length > 300 ? "Clear goal, audience and format. Only examples are missing." : "The topic is clear, but the AI has to guess the reader, length and tone.",
          dimensions: [
            { key: "goal", status: "good", note: "You want a blog post about Kinnow oranges." },
            { key: "context", status: "weak", note: "No hint whether this is for a farm, a shop, or a food blog." },
            { key: "audience", status: "missing", note: "Nothing says who will read the post." },
            { key: "format", status: "missing", note: "No length, structure or headings mentioned." },
            { key: "constraints", status: "missing", note: "No tone or things to avoid." },
            { key: "examples", status: "missing", note: "No sample post or style reference." },
            { key: "success", status: "missing", note: "Unclear what the post should achieve: sales, awareness, SEO?" },
          ],
          top_gaps: ["No audience", "No length or structure", "No tone"],
          questions: [
            { id: "q1", dimension: "audience", question: "Who will read this post?", options: ["Customers buying fruit online", "Export buyers and wholesalers", "Food bloggers and home cooks"] },
            { id: "q2", dimension: "format", question: "How long should it be?", options: ["Short, about 300 words", "Medium, about 600 words", "Long guide, 1,200+ words"] },
            { id: "q3", dimension: "constraints", question: "What tone fits best?", options: ["Warm and personal", "Professional and factual", "Fun and casual"] },
          ],
        };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status: 200 });
  };
}

const routes = {
  "/api/analyze": () => import("../api/analyze.js"),
  "/api/rewrite": () => import("../api/rewrite.js"),
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (routes[url.pathname]) {
      const mod = await routes[url.pathname]();
      return mod.default(req, res);
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end(await readFile(path.join(root, "index.html")));
    }
    res.statusCode = 404;
    res.end("Not found");
  })
  .listen(PORT, () => console.log(`Prompt Coach running at http://localhost:${PORT}${process.env.MOCK_GEMMA ? " (mock Gemma)" : ""}`));
