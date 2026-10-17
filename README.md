# Prompt Coach

**Better prompts, before you hit send.**

Live demo: **https://prompt-coach-three.vercel.app**

Most prompts sent to AI assistants are missing something: who the output is for, how long it should be, what tone to use, what "good" looks like. The AI fills those gaps with guesses, and the result comes out generic. Prompt Coach checks your prompt before you send it, asks you a few quick questions about what's missing, and writes you a better prompt, explaining every change so you learn to write better prompts yourself.

Powered by **Gemma 4** (`gemma-4-26b-a4b-it`), Google DeepMind's open-weight model.

## How it works

The site walks you through four steps, each unlocking when the one before is done:

1. **Write your prompt.** A live checklist shows which parts of a good prompt you've covered as you type.
2. **See what's missing.** Gemma scores the prompt out of 10, detects its type (writing, coding, image, research, data, business, learning) and explains, specific to your prompt, what's covered, vague or missing.
3. **Answer a few questions.** Two to four clarifying questions with one-tap answers, or type your own. Skip any you like.
4. **Get your improved prompt.** Your original and the improved version side by side. Anything only you know becomes a highlighted `[placeholder]`. A "what changed and why" list teaches the reasoning, and you can re-score the new prompt to see the improvement (e.g. 1 → 6, 3 → 8).

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

What "good" means depends on the prompt type: an image prompt needs style, composition and lighting; a coding prompt needs language, environment and error messages. Dimensions a prompt doesn't need count as covered, so a simple factual question isn't penalised.

## Tech stack

- **AI model:** Gemma 4 26B A4B (instruction-tuned, mixture-of-experts), open-weight, Apache 2.0
- **Model access:** Gemini API (Google AI Studio), structured JSON output, system instructions, minimal thinking mode for fast replies
- **Back end:** Node.js serverless functions on Vercel, zero dependencies (plain `fetch`)
- **Front end:** Single HTML page with vanilla JavaScript and CSS, no framework or build step; responsive, light and dark mode, keyboard and screen-reader friendly
- **Testing:** Node's built-in test runner with a fake Gemma API
- **Hosting:** Vercel

## Project structure

```
index.html            The whole UI: hero, how it works, the 4-step coach, rubric, roadmap
api/analyze.js        POST /api/analyze  { prompt }                    → score, rubric, gaps, questions
api/rewrite.js        POST /api/rewrite  { prompt, answers[], gaps[] } → improved prompt + changes
api/_lib/rubric.js    The rubric and the system prompts sent to Gemma
api/_lib/gemma.js     Gemini API client: JSON parsing, retries, fallbacks, error messages
api/_lib/coach.js     Input validation and output normalisation
scripts/dev.js        Local server (real Gemma or mock mode)
tests/                Unit tests with a fake Gemma API
```

## Engineering notes

- **Structured output, validated.** Gemma returns JSON; the server forces the 7 dimensions into a fixed order, clamps the score, and caps list lengths, so the UI never breaks on an unusual answer.
- **Fast.** Gemma 4's thinking is set to minimal, cutting a check from ~30s to ~12s and a rewrite from ~40s to ~8s.
- **Resilient.** One automatic retry on Gemma server errors. If the API ever rejects the thinking setting, system instructions or JSON mode, the client falls back step by step to a simpler request. Rate limits and timeouts return clear messages.
- **Prompt-injection aware.** The user's prompt is wrapped in tags and treated as data to evaluate, never as instructions.
- **Honest rewrites.** The model is told never to invent facts about the user; unknown details become `[placeholders]`.
- **Extension-ready.** The API sends CORS headers, so the planned Chrome extension can call the same endpoints.

## Run locally

Requires Node 20+. No `npm install` needed.

```bash
# With real Gemma (get a free key at https://aistudio.google.com)
GEMINI_API_KEY=your_key node scripts/dev.js

# Without a key (canned answers, for UI work)
MOCK_GEMMA=1 node scripts/dev.js

# Tests
npm test
```

Open http://localhost:3000.

## Deploy to Vercel

1. Import this repo in Vercel. No framework preset or build command is needed.
2. Add the environment variable `GEMINI_API_KEY` with your Google AI Studio key.
3. Optional: `GEMMA_MODEL` to switch model (default `gemma-4-26b-a4b-it`; `gemma-4-31b-it` is slower but stronger).
4. Deploy.

## Roadmap

- **Chrome extension:** a Coach button beside the prompt box on ChatGPT, Gemini and Claude; the coach opens in a side panel; one click replaces your draft with the improved prompt.
- **Private mode:** run Gemma 4 locally (Ollama) so prompts never leave your machine.
- **Personal report:** the gaps you leave out most often, so you improve over time.

## Author

Built by Hammad ([hellohammadi](https://github.com/hellohammadi)) for an AI hackathon, October 2026.
