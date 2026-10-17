import { makeHandler } from "./_lib/http.js";
import { rewritePrompt } from "./_lib/coach.js";

// POST /api/rewrite  { prompt, answers: [{question, answer}], gaps: [] }  ->  rewritten prompt + changes
export default makeHandler((body) => rewritePrompt(body.prompt, body.answers, body.gaps));
