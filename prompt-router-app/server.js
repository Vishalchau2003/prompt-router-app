require('dotenv').config();
const express = require('express');
const path = require('path');
const { loadCategory, buildQuestionSelectionPrompt, buildGeminiInstruction } = require('./templateEngine');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Check https://ai.google.dev/gemini-api/docs/models for the current
// recommended model name — Google updates these regularly.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const VALID_CATEGORIES = ['presentation', 'resume', 'image', 'video', 'general'];

// Shared helper for calling Gemini's generateContent endpoint.
async function callGemini(promptText) {
  if (!GEMINI_API_KEY) {
    throw new Error('Server is missing GEMINI_API_KEY. Add it to your .env file.');
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('\n').trim();
  if (!text) throw new Error('Gemini returned no usable content.');
  return text;
}

function stripFences(text) {
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
}

// ---- GET /api/categories ----
// Lightweight list for the frontend's category picker.
app.get('/api/categories', (req, res) => {
  const cats = VALID_CATEGORIES.filter(c => c !== 'general').map(c => {
    const data = loadCategory(c);
    return { id: c, label: data.category_label };
  });
  res.json(cats);
});

// ---- POST /api/questions ----
// Body: { category, idea }
// Fix B step 1: send the full question pool + idea to Gemini, get back
// the 2-4 most relevant, not-already-answered questions.
// Falls back to the first 3 pool questions if the Gemini call fails,
// so the app never dead-ends on a network/API hiccup.
app.post('/api/questions', async (req, res) => {
  const { category, idea } = req.body;
  const cat = VALID_CATEGORIES.includes(category) ? category : 'general';

  try {
    const categoryData = loadCategory(cat);
    let selectedIds;

    try {
      const raw = await callGemini(buildQuestionSelectionPrompt(categoryData, idea || ''));
      const parsed = JSON.parse(stripFences(raw));
      selectedIds = parsed.selected_ids;
    } catch (innerErr) {
      // Fallback: static first 3 questions, so a Gemini hiccup never
      // breaks the flow for the user.
      selectedIds = categoryData.question_pool.slice(0, 3).map(q => q.id);
    }

    const selectedQuestions = categoryData.question_pool.filter(q => selectedIds.includes(q.id));
    res.json({
      category: cat,
      category_label: categoryData.category_label,
      tools: categoryData.tools,
      questions: selectedQuestions.length ? selectedQuestions : categoryData.question_pool.slice(0, 3)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- POST /api/generate ----
// Body: { category, idea, answers: {qid: value}, selectedQuestions: [...] }
// Fix B step 2: build the final instruction from the framework + idea +
// the dynamic Q&A pairs, then call Gemini once for the finished prompt.
app.post('/api/generate', async (req, res) => {
  const { category, idea, answers, selectedQuestions } = req.body;
  const cat = VALID_CATEGORIES.includes(category) ? category : 'general';

  if (!idea || !idea.trim()) {
    return res.status(400).json({ error: 'idea is required' });
  }

  try {
    const categoryData = loadCategory(cat);
    const instruction = buildGeminiInstruction(categoryData, idea, answers || {}, selectedQuestions || []);
    const finalPrompt = await callGemini(instruction);

    res.json({
      finalPrompt,
      tools: categoryData.tools,
      category_label: categoryData.category_label
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Prompt Router server running at http://localhost:${PORT}`);
});
