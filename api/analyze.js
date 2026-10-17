import { makeHandler } from "./_lib/http.js";
import { analyzePrompt } from "./_lib/coach.js";

// POST /api/analyze  { prompt }  ->  score, rubric, gaps, clarifying questions
export default makeHandler((body) => analyzePrompt(body.prompt));
