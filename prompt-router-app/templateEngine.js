const fs = require('fs');
const path = require('path');

// Loads a category's question pool + framework from /data/<category>.json
function loadCategory(category) {
  const filePath = path.join(__dirname, 'data', `${category}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Unknown category: ${category}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// STEP 1 of Fix B: ask Gemini to pick the most relevant 2-4 questions
// from the category's full pool, based on what the idea already says.
// This keeps the curated question bank (the moat) but makes it adaptive.
function buildQuestionSelectionPrompt(categoryData, idea) {
  const poolSummary = categoryData.question_pool
    .map(q => `- id: "${q.id}" | question: "${q.question}" | options: [${q.options.join(', ')}]`)
    .join('\n');

  return [
    `You are selecting which follow-up questions to ask a user based on their idea.`,
    `Category: ${categoryData.category_label}`,
    `User's idea: "${idea}"`,
    ``,
    `Full question pool:`,
    poolSummary,
    ``,
    `Pick the 2 to 4 questions from this pool that are MOST relevant and NOT already answered by the idea text.`,
    `Skip any question the idea already makes obvious.`,
    `Respond with ONLY valid JSON, no markdown fences, no prose:`,
    `{"selected_ids": ["id1", "id2"]}`
  ].join('\n');
}

// STEP 2 of Fix B: once we have the selected questions + the user's
// tapped answers, build the final instruction sent to Gemini for
// prompt generation. Framework + idea + a clean Q&A list — no fixed
// placeholders, so it works no matter which questions were selected.
function buildGeminiInstruction(categoryData, idea, answers, selectedQuestions) {
  const qaLines = selectedQuestions
    .map(q => `- ${q.question} → ${answers[q.id] || 'not specified'}`)
    .join('\n');

  return [
    `You are an expert prompt engineer specializing in ${categoryData.category_label}.`,
    `Turn the brief below into ONE polished, ready-to-paste prompt for a ${categoryData.category_label} tool.`,
    `Framework to follow: ${categoryData.framework}`,
    ``,
    `User's idea: ${idea}`,
    `Additional details:`,
    qaLines || '(none provided)',
    ``,
    `Output ONLY the final prompt text — no preamble, no headers, no explanation.`
  ].join('\n');
}

module.exports = { loadCategory, buildQuestionSelectionPrompt, buildGeminiInstruction };
