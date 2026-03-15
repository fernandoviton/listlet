# LLM-Powered Date Editing for QuickTrip

## NOTE: We should not do this until we have azure functions with Auth

## Context

Currently in QuickTrip, participants mark dates by clicking calendar cells one at a time (unmarked → available → blocked → removed). This is tedious for entering ranges. The goal is to add a text input on each participant's card where they can type natural language like "free March 20-25 but blocked on the 22nd" and have an LLM parse it into date operations automatically.

**Architecture**: Server-side Azure Function proxy → OpenRouter API (OpenAI-compatible, model-flexible, cheap).

## Files to Modify

| File | Change |
|------|--------|
| `api/llm/function.json` | **New** — Azure Function route config |
| `api/llm/index.js` | **New** — LLM proxy function |
| `client/config.js` | Add `API_LLM_PARSE` endpoint |
| `client/config-loader.js` | Add `API_LLM_PARSE: 'mock'` for localhost fallback |
| `client/quicktrip/quicktrip.js` | Add text input in `renderParticipants()`, add `handleAiDateParse()` handler |
| `client/quicktrip/quicktrip.css` | Styles for AI input + feedback |

## Step 1: Azure Function — `api/llm/`

### `api/llm/function.json`
Route: `llm/parse-dates`, methods: POST + OPTIONS only.

### `api/llm/index.js`
- Copy CORS pattern from `api/tasks/index.js` (allowed origins, preflight handling)
- Read `process.env.OPENROUTER_API_KEY` (and optional `OPENROUTER_MODEL`, default: `google/gemini-2.0-flash-001`)
- Accept POST body: `{ text, participantName, existingDates, currentDate }`
- Call `https://openrouter.ai/api/v1/chat/completions` with:
  - `response_format: { type: "json_object" }`
  - System prompt instructing the model to return: `{ operations: [{ action: "add"|"remove", date: "YYYY-MM-DD", type: "available"|"blocked" }], summary: "..." }`
  - Prompt rules: expand ranges, default to current year, map "free"→available/"busy"→blocked, skip duplicates
- Validate response shape, return operations + summary to client
- Error handling: 500 if no API key, 502 if OpenRouter fails, 400 if unparseable output
- No new npm dependencies needed (Node 20 has native `fetch`)

## Step 2: Config

**`client/config.js`** — Add `API_LLM_PARSE: '/api/llm/parse-dates'`

**`client/config-loader.js`** — Add `API_LLM_PARSE: 'mock'` in the mock mode block (line ~33)

No changes needed to `staticwebapp.config.json` — existing `/api/*` route already covers it.

## Step 3: Frontend UI — `quicktrip.js`

### Text input in `renderParticipants()` (~line 296)
- Show a text input + "Parse" button on the **active** participant's card only
- `<form>` wrapper so Enter submits naturally
- Feedback `<div>` for showing results/errors

### `handleAiDateParse(participantId, text, formEl)` handler
1. Collect participant's existing dates via `QuickTripMutations.getParticipantDates()`
2. POST to `CONFIG.API_LLM_PARSE` with `{ text, participantName, existingDates, currentDate }`
3. In mock mode: show error message directing user to manual calendar
4. Apply returned operations via `api.saveTasks(mutate)`:
   - `"add"`: remove existing date if any (handles type changes), then `QuickTripMutations.addDate()`
   - `"remove"`: find by participantId+date, then `QuickTripMutations.removeDate()`
5. Update store, show summary feedback, re-render

### Existing functions reused
- `QuickTripMutations.addDate(doc, participantId, dateStr, type)` — `quicktrip-mutations.js:31`
- `QuickTripMutations.removeDate(doc, dateId)` — `quicktrip-mutations.js:43`
- `QuickTripMutations.getParticipantDates(doc, participantId)` — `quicktrip-mutations.js:74`
- `api.saveTasks(mutate)` — `shared/api.js:55` (GET-modify-PUT pattern for batch changes)

## Step 4: CSS — `quicktrip.css`

Styles for `.ai-date-input`, `.ai-date-form`, `.ai-date-text`, `.ai-date-feedback` with success/error/loading states.

## Step 5: Environment

Add `OPENROUTER_API_KEY` to Azure Function App settings. Optionally `OPENROUTER_MODEL` to override the default model. For local dev, add to `api/local.settings.json`.

## Verification

1. **Unit test the Azure Function**: curl POST to `/api/llm/parse-dates` with sample text, verify structured response
2. **End-to-end**: Open QuickTrip, add a participant, select them, type "free March 20-25 but blocked on the 22nd" → verify 5 available + 1 blocked date appear on calendar and in date pills
3. **Mock mode**: On localhost without config, verify the input shows a graceful error message
4. **Edge cases**: "clear all my dates", "next weekend", relative dates, no dates in text
