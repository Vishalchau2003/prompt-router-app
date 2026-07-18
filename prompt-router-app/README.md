# Route — Prompt Router App (Fix B: dynamic questions)

Turns a rough idea into a ready-to-paste, category-specific prompt. The
question bank is curated per category (the "moat"), but which questions
actually get asked adapts to what the user typed — instead of a fixed
set of 3 questions every time.

```
Frontend (React)
  ↓
Backend (Node)
  ↓
JSON Database (question POOLS per category, 6-8 each)
  ↓
Gemini call #1 → picks the 2-4 most relevant, not-already-answered
  questions from the pool
  ↓
Prompt Template Engine (framework + idea + selected Q&A)
  ↓
Gemini call #2 → Final Optimized Prompt
```

## What changed from the static version

- `data/*.json` — each category now has a `question_pool` of 6-8
  questions (up from a fixed 3) plus a `framework` string (prompt-
  engineering guidance for that category) instead of a rigid
  `{placeholder}` template.
- Added `data/general.json` — a fallback category so ideas outside
  the four core buckets ("write a wedding card message", "design a
  logo") still get a working flow instead of a dead end.
- `templateEngine.js` — `buildQuestionSelectionPrompt()` is new: it
  hands the full question pool + the user's idea to Gemini and asks it
  to return only the IDs of the 2-4 most relevant, not-already-obvious
  questions. `buildGeminiInstruction()` no longer splices into a fixed
  sentence — it composes the framework + idea + whatever Q&A pairs were
  actually collected, so it works no matter which questions got picked.
- `server.js` — new `POST /api/questions` route runs the question-
  selection call. If that Gemini call fails for any reason, it falls
  back to the first 3 pool questions rather than breaking the flow.
  `POST /api/generate` is largely the same, just fed dynamic Q&A instead
  of fixed placeholders.
- Frontend now has 3 stages: pick category+idea → dynamic questions →
  result — matching the two-call backend flow.

## Running it locally

```bash
cd prompt-router-app
npm install
cp .env.example .env
# edit .env and paste your Gemini API key from https://aistudio.google.com/apikey
npm start
```

Open `http://localhost:3001`.

## Deploying it — easiest path (Render, free tier to start)

This is a single Node app that serves both the API and the static
frontend, which makes deployment simple — one service, not two.

1. **Push the code to GitHub.** Create a new repo, push this folder to it.
   (If you don't want to use git commands, GitHub's web UI lets you drag-
   and-drop the unzipped folder to create a repo directly.)

2. **Go to [render.com](https://render.com) → New → Web Service**, and
   connect your GitHub repo.

3. **Configure the service:**
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance type: Free (fine for testing; upgrade once you have users)

4. **Add your environment variable:** in the Render dashboard →
   Environment → add `GEMINI_API_KEY` with your real key. Never commit
   `.env` to GitHub — it's already excluded if you keep the `.gitignore`
   below.

5. **Deploy.** Render builds and gives you a live URL like
   `https://route-app.onrender.com` — that's the whole product, live.

Add a `.gitignore` with:
```
node_modules
.env
```

### Alternatives, if you outgrow Render's free tier
- **Railway** — nearly identical flow to Render, usage-based pricing.
- **Fly.io** — more control over regions (useful if most users are in
  India and you want lower latency — pick a Mumbai/Singapore region).
- Cheapest is your own VPS (DigitalOcean/AWS Lightsail ~$5/mo) with
  `pm2` keeping `node server.js` alive, but that's more setup work for
  not much benefit until you have real scale.

## Before opening it to real users

- **Rate-limit `/api/questions` and `/api/generate`** per IP — they're
  the only routes that cost you money per call. `express-rate-limit` is
  a two-line addition.
- **Never expose `GEMINI_API_KEY` to the frontend** — it must only ever
  live in Render's environment variables / your `.env`, never in
  `public/index.html`.
- Check https://ai.google.dev/gemini-api/docs/models for the current
  recommended model name before launch — Google updates these regularly,
  and `GEMINI_MODEL` in `.env` lets you change it without touching code.
