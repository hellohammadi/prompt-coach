# Prompt Coach

Most prompts sent to AI assistants are missing something: who the output is for, how long it should be, what tone to use. The AI fills those gaps with guesses, and the result comes out generic.

**Prompt Coach** checks your prompt before you send it:

1. **Check:** scores the prompt out of 10 against a 7-point rubric and explains, specific to your prompt, what's covered, vague or missing.
2. **Ask:** asks 2–4 clarifying questions with one-tap answers (or type your own).
3. **Rewrite:** only when you ask. It merges your answers into a stronger prompt, marks anything still unknown as a `[placeholder]`, and explains each change so you learn to write better prompts yourself.
4. **Re-check:** scores the new version so you can see the improvement (e.g. 3 → 8).

Powered by **Gemma 4** (`gemma-4-26b-a4b-it`), Google DeepMind's open-weight model, served through the Gemini API.

## What makes a good prompt (the rubric)

| # | Dimension | Question it answers |
|---|-----------|---------------------|
| 1 | Goal | What exactly should the AI do? |
| 2 | Context | What background can't the AI guess? |
| 3 | Audience | Who is the output for? |
| 4 | Output format | What shape and length should the answer take? |
| 5 | Constraints | Tone, limits, things to avoid |
| 6 | Examples | What does good look like? |
| 7 | Success criteria | How will you judge whether it's right? |

The coach first classifies the prompt (writing, coding, image, research, data, business, learning) because each type needs different things. An image prompt needs style, composition and lighting; a coding prompt needs language, environment and error messages. Dimensions that don't matter for a given prompt count as covered, so a simple factual question isn't penalised.

## How it's built

```
index.html            Single-page UI (no framework, no build step)
api/analyze.js        POST /api/analyze  { prompt }                    → score, rubric, gaps, questions
api/rewrite.js        POST /api/rewrite  { prompt, answers[], gaps[] } → rewritten prompt + changes
api/_lib/rubric.js    The rubric and the system prompts sent to Gemma
api/_lib/gemma.js     Gemini API client (plain fetch), JSON parsing, error handling
api/_lib/coach.js     Input validation and output normalisation
scripts/dev.js        Local server (real or mock Gemma)
tests/                Unit tests with a fake Gemma API
```

- **Zero dependencies.** Plain HTML/JS front end and Vercel Node functions using `fetch`.
- **Structured output.** Gemma returns JSON; the server validates it, forces the 7 dimensions into a fixed order, clamps the score, and caps list lengths, so the UI never breaks on an unusual answer.
- **Resilient.** If the API rejects system instructions or JSON mode, the client retries with a single merged message. Rate limits and timeouts return clear messages.
- **Prompt-injection aware.** The user's prompt is wrapped in tags and treated as data to evaluate, not instructions to follow.
- **Extension-ready.** The API sends CORS headers, so the planned Chrome extension can call the same endpoints.

## Run locally

Requires Node 20+.

```bash
# With real Gemma (get a key at https://aistudio.google.com)
GEMINI_API_KEY=your_key node scripts/dev.js

# Without a key (canned answers, for UI work)
MOCK_GEMMA=1 node scripts/dev.js

# Tests
npm test
```

Open http://localhost:3000.

## Deploy to Vercel

1. Import this repo in Vercel. No framework preset or build command is needed.
2. Add an environment variable `GEMINI_API_KEY` with your Google AI Studio key.
3. Optional: `GEMMA_MODEL` to switch model (default `gemma-4-26b-a4b-it`; `gemma-4-31b-it` is slower but stronger).
4. Deploy.

## Roadmap

- Chrome extension: a button beside the text box on ChatGPT, Gemini and Claude that opens the coach in a side panel.
- Self-hosted mode with Ollama running Gemma 4 locally, so prompts never leave your machine.
- Saved prompt templates and a personal "common gaps" report.
