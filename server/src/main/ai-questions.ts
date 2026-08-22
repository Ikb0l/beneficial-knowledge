import { RateLimiter } from '../rate-limiter';
import { isValidCategoryFromDb } from './config';
import { logAdminAction, requireAdminCapability, requireSuperAdmin } from './admin';
import { refreshQuestionCache } from './match-helpers';

var DEFAULT_ALLOWED_TYPES = ['mcq', 'true_false', 'true_false_not_given', 'heading_match'];
var DEFAULT_GLOBAL_SETTINGS = {
  enabled: false,
  killSwitch: true,
  autoPublish: true,
  strictMode: true,
  maxQuestionsPerRun: 20,
  maxInputTokensPerRun: 6000,
  maxOutputTokensPerRun: 4000,
  dailyBudgetUsd: 5,
  monthlyBudgetUsd: 150,
  similarityThreshold: 0.92,
  requireCitation: true,
  defaultLanguage: 'en',
  allowedQuestionTypes: DEFAULT_ALLOWED_TYPES,
  defaultProfileKey: 'deepseek_default',
};

var AI_JOB_RATE_KEY = 'admin_generate_ai_questions';
var AI_MANUAL_BATCH_SIZE = 3;

function getRows(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

function tryDecodeByteJson(value: any): string | null {
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    var chars: string[] = [];
    for (var i = 0; i < value.length; i++) {
      var code = toInt(value[i], -1);
      if (code < 0 || code > 255) return null;
      chars.push(String.fromCharCode(code));
    }
    return chars.join('');
  }

  if (!value || typeof value !== 'object') return null;
  var keys = Object.keys(value);
  if (keys.length === 0) return null;
  for (var k = 0; k < keys.length; k++) {
    if (!/^\d+$/.test(keys[k])) return null;
  }

  keys.sort(function (a, b) { return toInt(a, 0) - toInt(b, 0); });
  if (keys[0] !== '0') return null;

  var out: string[] = [];
  for (var i = 0; i < keys.length; i++) {
    var key = String(i);
    if (keys[i] !== key) return null;
    var code = toInt((value as any)[key], -1);
    if (code < 0 || code > 255) return null;
    out.push(String.fromCharCode(code));
  }
  return out.join('');
}

function parseJson(value: any, fallback: any): any {
  if (value === null || value === undefined) return fallback;

  var decoded = tryDecodeByteJson(value);
  if (decoded !== null) {
    value = decoded;
  }

  if (typeof value === 'object') return value;
  if (typeof value !== 'string') {
    try {
      value = String(value);
    } catch (_e) {
      return fallback;
    }
  }
  try {
    var parsed = JSON.parse(value);
    if (typeof parsed === 'string') {
      var nested = parsed.trim();
      if (nested && (nested.charAt(0) === '{' || nested.charAt(0) === '[')) {
        try {
          return JSON.parse(nested);
        } catch (_e) {
          // Return original parsed string when nested parse fails.
        }
      }
    }
    return parsed;
  } catch (_e) {
    return fallback;
  }
}

function safePayload(payload: any): any {
  var parsed = parseJson(payload, {});
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function toInt(value: any, fallback: number): number {
  var parsed = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

function toNumber(value: any, fallback: number): number {
  var parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, minValue: number, maxValue: number): number {
  if (!Number.isFinite(value)) return minValue;
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

function normalizeAllowedTypes(raw: any): string[] {
  if (!Array.isArray(raw)) return DEFAULT_ALLOWED_TYPES.slice();
  var out: string[] = [];
  var dedupe: {[key: string]: boolean} = {};
  for (var i = 0; i < raw.length; i++) {
    var t = String(raw[i] || '').toLowerCase();
    if (DEFAULT_ALLOWED_TYPES.indexOf(t) === -1) continue;
    if (dedupe[t]) continue;
    dedupe[t] = true;
    out.push(t);
  }
  return out.length > 0 ? out : DEFAULT_ALLOWED_TYPES.slice();
}

function normalizeGlobalSettings(raw: any): any {
  var merged = Object.assign({}, DEFAULT_GLOBAL_SETTINGS, raw && typeof raw === 'object' ? raw : {});
  return {
    enabled: merged.enabled === true,
    killSwitch: merged.killSwitch === true,
    autoPublish: merged.autoPublish !== false,
    strictMode: merged.strictMode !== false,
    maxQuestionsPerRun: Math.floor(clamp(toInt(merged.maxQuestionsPerRun, 20), 1, 500)),
    maxInputTokensPerRun: Math.floor(clamp(toInt(merged.maxInputTokensPerRun, 6000), 500, 50000)),
    maxOutputTokensPerRun: Math.floor(clamp(toInt(merged.maxOutputTokensPerRun, 4000), 500, 50000)),
    dailyBudgetUsd: clamp(toNumber(merged.dailyBudgetUsd, 5), 0, 1000000),
    monthlyBudgetUsd: clamp(toNumber(merged.monthlyBudgetUsd, 150), 0, 1000000),
    similarityThreshold: clamp(toNumber(merged.similarityThreshold, 0.92), 0.4, 0.999),
    requireCitation: merged.requireCitation !== false,
    defaultLanguage: String(merged.defaultLanguage || 'en').trim().toLowerCase().slice(0, 10) || 'en',
    allowedQuestionTypes: normalizeAllowedTypes(merged.allowedQuestionTypes),
    defaultProfileKey: String(merged.defaultProfileKey || DEFAULT_GLOBAL_SETTINGS.defaultProfileKey).trim() || DEFAULT_GLOBAL_SETTINGS.defaultProfileKey,
  };
}

function getEncryptionKey(ctx: nkruntime.Context): string {
  var value = ctx.env['AI_SECRETS_ENCRYPTION_KEY'] || ctx.env['WEB_AUTH_PEPPER'] || '';
  return String(value || '').trim();
}

function slugify(input: string): string {
  var value = String(input || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return value || ('item_' + Date.now());
}

function normalizeQuestionText(input: string): string {
  return String(input || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

function globalSettings(nk: nkruntime.Nakama): any {
  var rows = getRows(nk.sqlQuery("SELECT settings FROM ai_generation_settings WHERE settings_key = 'global' LIMIT 1"));
  return normalizeGlobalSettings(parseJson(rows.length > 0 ? rows[0].settings : {}, {}));
}

function getCategoryOverride(nk: nkruntime.Nakama, categoryKey: string): any {
  var rows = getRows(nk.sqlQuery(
    `SELECT id, category_key, is_enabled, profile_id, source_pack_id, override_config, budgets
     FROM ai_category_overrides
     WHERE category_key = $1
     LIMIT 1`,
    [categoryKey]
  ));
  if (rows.length === 0) return null;
  var row = rows[0];
  return {
    id: row.id,
    categoryKey: row.category_key,
    isEnabled: row.is_enabled !== false,
    profileId: row.profile_id || null,
    sourcePackId: row.source_pack_id || null,
    overrideConfig: parseJson(row.override_config, {}),
    budgets: parseJson(row.budgets, {}),
  };
}

function getProfileByRef(nk: nkruntime.Nakama, ref: string | null): any {
  if (!ref) return null;
  var rows = getRows(nk.sqlQuery(
    `SELECT * FROM ai_provider_profiles WHERE id::text = $1 OR profile_key = $1 LIMIT 1`,
    [ref]
  ));
  if (rows.length === 0) return null;
  var row = rows[0];
  return {
    id: row.id,
    profileKey: row.profile_key,
    providerKey: row.provider_key,
    credentialProviderKey: row.credential_provider_key,
    endpointUrl: row.endpoint_url,
    model: row.model,
    temperature: toNumber(row.temperature, 0.3),
    topP: toNumber(row.top_p, 1),
    maxTokens: toInt(row.max_tokens, 1400),
    timeoutMs: toInt(row.timeout_ms, 45000),
    maxRetries: toInt(row.max_retries, 2),
    isDefault: row.is_default === true,
    isActive: row.is_active !== false,
    config: parseJson(row.config, {}),
    budgets: parseJson(row.budgets, {}),
  };
}

function getDefaultProfile(nk: nkruntime.Nakama, settings: any): any {
  var byKey = getProfileByRef(nk, String(settings.defaultProfileKey || ''));
  if (byKey && byKey.isActive) return byKey;
  var rows = getRows(nk.sqlQuery("SELECT id FROM ai_provider_profiles WHERE is_default = true AND is_active = true ORDER BY updated_at DESC LIMIT 1"));
  if (rows.length > 0) {
    var byId = getProfileByRef(nk, String(rows[0].id));
    if (byId && byId.isActive) return byId;
  }
  return getProfileByRef(nk, 'deepseek_default');
}

function getSourcePackByRef(nk: nkruntime.Nakama, ref: string | null): any {
  if (!ref) return null;
  var rows = getRows(nk.sqlQuery(`SELECT * FROM ai_source_packs WHERE id::text = $1 OR pack_key = $1 LIMIT 1`, [ref]));
  if (rows.length === 0) return null;
  var row = rows[0];
  return {
    id: row.id,
    packKey: row.pack_key,
    categoryKey: row.category_key,
    name: row.name,
    language: row.language || 'en',
    isActive: row.is_active !== false,
  };
}

function loadCredential(ctx: nkruntime.Context, nk: nkruntime.Nakama, providerKey: string): string {
  var secretKey = getEncryptionKey(ctx);
  if (!secretKey) throw new Error('AI_SECRETS_ENCRYPTION_KEY is required');
  var rows = getRows(nk.sqlQuery(
    `SELECT pgp_sym_decrypt(encrypted_secret, $2) as api_key
     FROM ai_provider_credentials
     WHERE provider_key = $1 AND is_active = true
     LIMIT 1`,
    [providerKey, secretKey]
  ));
  if (rows.length === 0) throw new Error('Provider credential not configured: ' + providerKey);
  var apiKey = String(rows[0].api_key || '').trim();
  if (!apiKey) throw new Error('Provider credential is empty: ' + providerKey);
  return apiKey;
}

function splitChunks(content: string, maxLen: number): string[] {
  var text = String(content || '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  var parts = text.split(/\n\n+/g);
  var out: string[] = [];
  for (var i = 0; i < parts.length; i++) {
    var block = parts[i].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (!block) continue;
    if (block.length <= maxLen) {
      out.push(block);
      continue;
    }
    var cursor = 0;
    while (cursor < block.length) {
      var end = Math.min(cursor + maxLen, block.length);
      var pivot = block.lastIndexOf(' ', end);
      if (pivot > cursor + 150) end = pivot;
      var item = block.slice(cursor, end).trim();
      if (item) out.push(item);
      cursor = end;
    }
  }
  return out;
}

function storeSourceDocuments(nk: nkruntime.Nakama, sourcePackId: string, documents: any[]): { docCount: number; chunkCount: number } {
  nk.sqlExec('DELETE FROM ai_source_documents WHERE source_pack_id = $1', [sourcePackId]);
  var docCount = 0;
  var chunkCount = 0;
  for (var i = 0; i < documents.length; i++) {
    var doc = documents[i] || {};
    var title = String(doc.title || ('Source ' + (i + 1))).trim().slice(0, 255);
    var content = String(doc.content || '').trim();
    if (!content) continue;
    var metadata = doc.metadata && typeof doc.metadata === 'object' ? doc.metadata : {};
    var docRows = getRows(nk.sqlQuery(
      `INSERT INTO ai_source_documents (source_pack_id, title, content, metadata, hash_sha256)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING id`,
      [sourcePackId, title, content, JSON.stringify(metadata), nk.sha256Hash(content)]
    ));
    if (docRows.length === 0) continue;
    docCount++;
    var docId = docRows[0].id;
    var chunks = splitChunks(content, 1200);
    for (var c = 0; c < chunks.length; c++) {
      var chunk = chunks[c];
      nk.sqlExec(
        `INSERT INTO ai_source_chunks (source_document_id, source_pack_id, chunk_index, content, content_normalized, token_estimate, hash_sha256, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [docId, sourcePackId, c, chunk, normalizeQuestionText(chunk), estimateTokens(chunk), nk.sha256Hash(chunk), JSON.stringify({ title: title })]
      );
      chunkCount++;
    }
  }
  return { docCount: docCount, chunkCount: chunkCount };
}

function loadSourceChunks(nk: nkruntime.Nakama, sourcePackId: string, categoryKey: string): any[] {
  var rows = getRows(nk.sqlQuery(
    `SELECT c.id, c.content, c.token_estimate, d.title
     FROM ai_source_chunks c
     JOIN ai_source_documents d ON d.id = c.source_document_id
     JOIN ai_source_packs p ON p.id = c.source_pack_id
     WHERE c.source_pack_id = $1 AND p.category_key = $2 AND p.is_active = true
     ORDER BY c.created_at DESC
     LIMIT 24`,
    [sourcePackId, categoryKey]
  ));
  var out: any[] = [];
  for (var i = 0; i < rows.length; i++) {
    out.push({ id: rows[i].id, content: String(rows[i].content || ''), title: String(rows[i].title || ''), tokenEstimate: toInt(rows[i].token_estimate, 0) });
  }
  return out;
}

function buildTypeTargets(count: number, allowedTypes: string[]): {[key: string]: number} {
  var targets: {[key: string]: number} = {};
  var total = Math.max(1, Math.floor(count));
  var types = normalizeAllowedTypes(allowedTypes);
  if (types.length === 0) return targets;
  var base = Math.floor(total / types.length);
  var remainder = total % types.length;
  for (var i = 0; i < types.length; i++) {
    targets[types[i]] = base + (i < remainder ? 1 : 0);
  }
  return targets;
}

function categoryC1Focus(categoryKey: string): string[] {
  var key = String(categoryKey || '').toLowerCase();
  var hints: string[] = [
    'Target CEFR C1 learners: emphasize precision, nuance, and advanced control of grammar in context.',
    'Use authentic academic/professional register and avoid simplistic sentence patterns.',
    'Distractors must be plausible and grammatically close to the correct answer.'
  ];

  if (key.indexOf('grammar') !== -1) {
    hints.push('Cover clause structure, inversion, clefting, emphasis, and subtle meaning shifts.');
  }
  if (key.indexOf('tense') !== -1) {
    hints.push('Test tense-aspect contrasts in narrative timeline and discourse context.');
  }
  if (key.indexOf('condition') !== -1) {
    hints.push('Use mixed conditionals, implied conditions, and inversion (e.g., had/were/should).');
  }
  if (key.indexOf('gerund') !== -1 || key.indexOf('infinitive') !== -1) {
    hints.push('Focus on verb-pattern contrasts with changes in meaning and complementation.');
  }
  if (key.indexOf('preposition') !== -1) {
    hints.push('Use fixed expressions, collocational prepositions, and argument-structure constraints.');
  }
  if (key.indexOf('comparison') !== -1) {
    hints.push('Include advanced comparative structures, modifiers, and parallelism errors.');
  }
  if (key.indexOf('adjective') !== -1 || key.indexOf('adverb') !== -1) {
    hints.push('Test adjective-adverb choice, position, gradability, and discourse effect.');
  }
  if (key.indexOf('vocabulary') !== -1) {
    hints.push('Anchor lexical-grammar choices in collocation, connotation, and register.');
  }

  return hints;
}

function questionTypeGuidance(type: string): string {
  if (type === 'mcq') return 'mcq: exactly 4 options, one best answer, distractors must be close grammar competitors.';
  if (type === 'true_false') return 'true_false: options exactly [True, False], statement must be clearly verifiable from sources.';
  if (type === 'true_false_not_given') return 'true_false_not_given: options exactly [True, False, Not Given], use Not Given only when source is genuinely silent.';
  if (type === 'heading_match') return 'heading_match: options are short headings/labels (3-8 words), only one best match.';
  return type + ': follow schema and citations strictly.';
}

function buildPrompt(categoryKey: string, language: string, count: number, allowedTypes: string[], chunks: any[]): { system: string; user: string } {
  var focus = categoryC1Focus(categoryKey);
  var typeTargets = buildTypeTargets(count, allowedTypes);
  var typeRules: string[] = [];
  for (var t = 0; t < allowedTypes.length; t++) {
    typeRules.push('- ' + questionTypeGuidance(allowedTypes[t]));
  }

  var system = [
    'You are an expert English assessment writer for CEFR C1.',
    'Generate advanced grammar questions from provided source chunks only.',
    'Return valid JSON object only with key "questions".',
    'Each question must include: difficulty, questionType, questionText, options, correctIndex, explanation, sourceReference, citations.',
    'citations must be array of {chunkId, quote} and each quote must be verbatim from the cited chunk.',
    'Never fabricate citations, never invent facts outside the provided chunks.',
    'Use mostly medium/hard C1-level challenge; avoid elementary wording.',
    'Avoid duplicate questions and avoid obvious distractors.',
    'No markdown, no extra keys, no commentary outside JSON.',
  ].join(' ');

  var lines: string[] = [];
  for (var i = 0; i < chunks.length; i++) {
    lines.push('[Chunk ' + chunks[i].id + ' | ' + chunks[i].title + '] ' + chunks[i].content);
  }
  var user = [
    'Category: ' + categoryKey,
    'Language: ' + language,
    'Target level: CEFR C1',
    'Count: ' + count,
    'Allowed question types: ' + allowedTypes.join(', '),
    'Question type target counts: ' + JSON.stringify(typeTargets),
    'If count >= number of allowed types, include at least one question per allowed type.',
    'Category focus guidance:',
    focus.map(function (item) { return '- ' + item; }).join('\n'),
    'Question type execution rules:',
    typeRules.join('\n'),
    'Schema: {"questions":[{"difficulty":"easy|medium|hard","questionType":"mcq|true_false|true_false_not_given|heading_match","questionText":"...","options":["..."],"correctIndex":0,"explanation":"...","sourceReference":"...","citations":[{"chunkId":"...","quote":"..."}]}]}',
    'Source chunks:',
    lines.join('\n')
  ].join('\n');
  return { system: system, user: user };
}

function previewText(input: any, maxLength: number): string {
  var value = String(input || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength) + '...';
}

function extractBalancedJsonSnippets(text: string): string[] {
  var out: string[] = [];
  var value = String(text || '');
  if (!value) return out;

  var depth = 0;
  var start = -1;
  var inString = false;
  var escaped = false;
  var quote = '"';

  for (var i = 0; i < value.length; i++) {
    var ch = value.charAt(i);
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === quote) {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === '\'') {
      inString = true;
      quote = ch;
      continue;
    }

    if (ch === '{' || ch === '[') {
      if (depth === 0) start = i;
      depth++;
      continue;
    }

    if (ch === '}' || ch === ']') {
      if (depth <= 0) continue;
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(value.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return out;
}

function extractJsonPayloadCandidates(content: string): string[] {
  var candidates: string[] = [];
  var dedupe: {[key: string]: boolean} = {};

  function pushCandidate(value: any): void {
    var text = String(value || '').trim();
    if (!text) return;
    if (dedupe[text]) return;
    dedupe[text] = true;
    candidates.push(text);
  }

  var raw = String(content || '').trim();
  if (!raw) return candidates;
  pushCandidate(raw);

  var strippedFence = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  pushCandidate(strippedFence);

  if (raw.indexOf('```') >= 0) {
    var noFences = raw.replace(/```json/ig, '').replace(/```/g, '').trim();
    pushCandidate(noFences);
  }

  if ((raw.charAt(0) === '"' && raw.charAt(raw.length - 1) === '"') || (raw.charAt(0) === '\'' && raw.charAt(raw.length - 1) === '\'')) {
    var unwrapped = raw.slice(1, -1).trim();
    pushCandidate(unwrapped);
    pushCandidate(unwrapped.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t'));
  }

  var rawSnippets = extractBalancedJsonSnippets(raw);
  for (var i = 0; i < rawSnippets.length; i++) pushCandidate(rawSnippets[i]);

  var strippedSnippets = extractBalancedJsonSnippets(strippedFence);
  for (var s = 0; s < strippedSnippets.length; s++) pushCandidate(strippedSnippets[s]);

  var firstObj = raw.indexOf('{');
  var lastObj = raw.lastIndexOf('}');
  if (firstObj >= 0 && lastObj > firstObj) pushCandidate(raw.slice(firstObj, lastObj + 1));

  var firstArr = raw.indexOf('[');
  var lastArr = raw.lastIndexOf(']');
  if (firstArr >= 0 && lastArr > firstArr) pushCandidate(raw.slice(firstArr, lastArr + 1));

  return candidates;
}

function asQuestionsArray(input: any, depth: number): any[] | null {
  if (depth > 5 || input === null || input === undefined) return null;

  if (Array.isArray(input)) return input;

  if (typeof input === 'string') {
    var parsedString = parseJson(input, null);
    if (parsedString === null || parsedString === undefined) return null;
    return asQuestionsArray(parsedString, depth + 1);
  }

  if (typeof input !== 'object') return null;

  var directQuestions = (input as any).questions;
  if (directQuestions !== undefined) {
    var directArray = asQuestionsArray(directQuestions, depth + 1);
    if (directArray) return directArray;
  }

  var keys = Object.keys(input);
  if (keys.length > 0) {
    var numeric = true;
    for (var k = 0; k < keys.length; k++) {
      if (!/^\d+$/.test(keys[k])) {
        numeric = false;
        break;
      }
    }

    if (numeric) {
      keys.sort(function (a, b) { return toInt(a, 0) - toInt(b, 0); });
      var numericOut: any[] = [];
      for (var n = 0; n < keys.length; n++) {
        numericOut.push((input as any)[keys[n]]);
      }
      return numericOut;
    }
  }

  var containerKeys = ['items', 'data', 'result', 'output', 'payload', 'responses', 'candidates', 'questionList'];
  for (var i = 0; i < containerKeys.length; i++) {
    var key = containerKeys[i];
    if ((input as any)[key] === undefined) continue;
    var arr = asQuestionsArray((input as any)[key], depth + 1);
    if (arr) return arr;
  }

  return null;
}

function parseModelQuestionsContent(content: string, count: number): { questions: any[]; parsed: any } | null {
  var candidates = extractJsonPayloadCandidates(content);
  if (candidates.length === 0) return null;

  for (var i = 0; i < candidates.length; i++) {
    var candidate = String(candidates[i] || '').trim();
    if (!candidate) continue;

    var variants: string[] = [];
    var variantDedup: {[key: string]: boolean} = {};
    function pushVariant(value: string): void {
      var text = String(value || '').trim();
      if (!text) return;
      if (variantDedup[text]) return;
      variantDedup[text] = true;
      variants.push(text);
    }

    pushVariant(candidate);

    var normalizedQuotes = candidate.replace(/[“”]/g, '"').replace(/[‘’]/g, '\'');
    pushVariant(normalizedQuotes);

    var strippedTrailingCommas = normalizedQuotes.replace(/,\s*([}\]])/g, '$1');
    pushVariant(strippedTrailingCommas);

    for (var v = 0; v < variants.length; v++) {
      var parsed = parseJson(variants[v], null);
      if (parsed === null || parsed === undefined) continue;

      var questions = asQuestionsArray(parsed, 0);
      if (!questions || questions.length === 0) continue;

      return { questions: questions.slice(0, count), parsed: parsed };
    }
  }

  return null;
}

function coerceModelContent(messageContent: any): string {
  if (typeof messageContent === 'string') return messageContent;
  if (messageContent === null || messageContent === undefined) return '';

  if (Array.isArray(messageContent)) {
    var parts: string[] = [];
    for (var i = 0; i < messageContent.length; i++) {
      var item = messageContent[i];
      if (typeof item === 'string') {
        parts.push(item);
      } else if (item && typeof item === 'object') {
        if (typeof item.text === 'string') parts.push(item.text);
        else if (typeof item.content === 'string') parts.push(item.content);
        else parts.push(JSON.stringify(item));
      } else if (item !== null && item !== undefined) {
        parts.push(String(item));
      }
    }
    return parts.join('\n');
  }

  if (typeof messageContent === 'object') return JSON.stringify(messageContent);
  return String(messageContent);
}

function mergeUsage(base: any, extra: any): any {
  var prompt = toInt(base && base.prompt_tokens, 0) + toInt(extra && extra.prompt_tokens, 0);
  var completion = toInt(base && base.completion_tokens, 0) + toInt(extra && extra.completion_tokens, 0);
  var total = prompt + completion;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: total,
  };
}

function deepSeekRepairResponse(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  profile: any,
  apiKey: string,
  endpoint: string,
  timeoutMs: number,
  rawContent: string,
  count: number
): { questions: any[]; usage: any } | null {
  var source = String(rawContent || '').trim();
  if (!source) return null;

  var body = {
    model: String(profile.model || 'deepseek-chat'),
    temperature: 0,
    top_p: 1,
    max_tokens: Math.floor(clamp(toInt(profile.maxTokens, 1400), 256, 16000)),
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You are a JSON formatter. Convert the provided model output into strict valid JSON only. Return an object with key "questions".',
      },
      {
        role: 'user',
        content: [
          'Normalize this output into valid JSON with schema:',
          '{"questions":[{"difficulty":"easy|medium|hard","questionType":"mcq|true_false|true_false_not_given|heading_match","questionText":"...","options":["..."],"correctIndex":0,"explanation":"...","sourceReference":"...","citations":[{"chunkId":"...","quote":"..."}]}]}',
          'Do not add markdown or comments.',
          'Model output to repair:',
          source.slice(0, 12000),
        ].join('\n'),
      },
    ],
  };

  var response = nk.httpRequest(endpoint, 'post', {
    'Authorization': 'Bearer ' + apiKey,
    'Content-Type': 'application/json',
  }, JSON.stringify(body), timeoutMs);

  if (response.code < 200 || response.code >= 300) {
    logger.warn('DeepSeek JSON repair HTTP ' + response.code + '.');
    return null;
  }

  var payload = parseJson(response.body, {});
  var choice = payload && Array.isArray(payload.choices) && payload.choices.length > 0 ? payload.choices[0] : null;
  var message = choice && choice.message ? choice.message : null;
  var content = coerceModelContent(message ? message.content : '');
  if (!content && message && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
    var toolCall = message.tool_calls[0];
    if (toolCall && toolCall['function']) {
      content = String(toolCall['function'].arguments || '');
    }
  }
  if (!content) return null;

  var parsed = parseModelQuestionsContent(content, count);
  if (!parsed) {
    logger.warn('DeepSeek JSON repair parse failed. Preview: ' + previewText(content, 220));
    return null;
  }

  return { questions: parsed.questions, usage: payload.usage || {} };
}

function deepSeekRequest(nk: nkruntime.Nakama, logger: nkruntime.Logger, profile: any, apiKey: string, prompt: { system: string; user: string }, count: number): { questions: any[]; usage: any } {
  var body = {
    model: String(profile.model || 'deepseek-chat'),
    temperature: clamp(toNumber(profile.temperature, 0.3), 0, 2),
    top_p: clamp(toNumber(profile.topP, 1), 0.05, 1),
    max_tokens: Math.floor(clamp(toInt(profile.maxTokens, 1400), 64, 16000)),
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
  };
  var endpoint = String(profile.endpointUrl || 'https://api.deepseek.com/chat/completions');
  var configuredTimeoutMs = Math.floor(clamp(toInt(profile.timeoutMs, 45000), 1000, 120000));
  var timeoutMs = Math.min(configuredTimeoutMs, 30000);
  if (timeoutMs < configuredTimeoutMs) {
    logger.warn('DeepSeek timeout capped from ' + configuredTimeoutMs + 'ms to ' + timeoutMs + 'ms for runtime safety.');
  }

  var repairTimeoutMs = Math.floor(clamp(Math.floor(timeoutMs / 3), 4000, 12000));
  var retries = Math.floor(clamp(toInt(profile.maxRetries, 2), 0, 10));
  if (timeoutMs >= 25000 && retries > 1) retries = 1;

  for (var attempt = 0; attempt <= retries; attempt++) {
    var response = nk.httpRequest(endpoint, 'post', {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    }, JSON.stringify(body), timeoutMs);

    if (response.code >= 200 && response.code < 300) {
      var payload = parseJson(response.body, {});
      var choice = payload && Array.isArray(payload.choices) && payload.choices.length > 0 ? payload.choices[0] : null;
      var message = choice && choice.message ? choice.message : null;
      var content = coerceModelContent(message ? message.content : '');
      if (!content && message && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
        var toolCall = message.tool_calls[0];
        if (toolCall && toolCall['function']) {
          content = String(toolCall['function'].arguments || '');
        }
      }
      if (!content) throw new Error('DeepSeek empty response');

      var parsedPrimary = parseModelQuestionsContent(content, count);
      if (parsedPrimary) {
        return { questions: parsedPrimary.questions, usage: payload.usage || {} };
      }

      logger.warn('DeepSeek JSON parse failed. Preview: ' + previewText(content, 220));

      var repaired = deepSeekRepairResponse(nk, logger, profile, apiKey, endpoint, repairTimeoutMs, content, count);
      if (repaired) {
        return { questions: repaired.questions, usage: mergeUsage(payload.usage || {}, repaired.usage || {}) };
      }

      throw new Error('DeepSeek returned invalid JSON questions payload. Preview: ' + previewText(content, 220));
    }

    if (!(response.code === 429 || response.code >= 500) || attempt >= retries) {
      throw new Error('DeepSeek HTTP ' + response.code + ': ' + String(response.body || '').slice(0, 500));
    }

    logger.warn('DeepSeek retry #' + (attempt + 1) + ' after HTTP ' + response.code);
  }

  throw new Error('DeepSeek request failed unexpectedly');
}

function prepareQuestion(raw: any, categoryKey: string, allowedTypes: string[]): { question: any; reasons: string[] } {
  var reasons: string[] = [];
  var questionType = String(raw.questionType || raw.question_type || 'mcq').toLowerCase();
  if (allowedTypes.indexOf(questionType) === -1) reasons.push('Question type not allowed');

  var questionText = String(raw.questionText || raw.question_text || '').replace(/\s+/g, ' ').trim();
  if (!questionText) reasons.push('Question text is required');

  var difficulty = String(raw.difficulty || 'medium').toLowerCase();
  if (difficulty !== 'easy' && difficulty !== 'medium' && difficulty !== 'hard') difficulty = 'medium';
  if (difficulty === 'easy') difficulty = 'medium';

  var options = raw.options;
  if (questionType === 'true_false') {
    options = ['True', 'False'];
  } else if (questionType === 'true_false_not_given') {
    options = ['True', 'False', 'Not Given'];
  } else if (!Array.isArray(options)) {
    options = [];
  }

  var outOptions: string[] = [];
  for (var i = 0; i < options.length; i++) {
    outOptions.push(String(options[i] || '').replace(/\s+/g, ' ').trim());
  }
  if (outOptions.length < 2 || outOptions.length > 6) reasons.push('Options length must be between 2 and 6');
  for (var oi = 0; oi < outOptions.length; oi++) {
    if (!outOptions[oi]) {
      reasons.push('Options must be non-empty');
      break;
    }
  }

  var correctIndex = toInt(raw.correctIndex !== undefined ? raw.correctIndex : raw.correct_index, -1);
  if (correctIndex < 0 || correctIndex >= outOptions.length) reasons.push('Correct index is invalid');

  var explanation = String(raw.explanation || '').replace(/\s+/g, ' ').trim();
  if (explanation.length < 16) reasons.push('Explanation is too short');

  var sourceReference = String(raw.sourceReference || raw.source_reference || '').replace(/\s+/g, ' ').trim();
  var citationsRaw = Array.isArray(raw.citations) ? raw.citations : [];
  var citations: any[] = [];
  for (var c = 0; c < citationsRaw.length; c++) {
    var item = citationsRaw[c] || {};
    var chunkId = String(item.chunkId || item.chunk_id || '').trim();
    var quote = String(item.quote || '').trim();
    if (chunkId && quote) {
      citations.push({ chunkId: chunkId, quote: quote });
    }
  }

  return {
    question: {
      category: categoryKey,
      difficulty: difficulty,
      questionType: questionType,
      questionText: questionText,
      options: outOptions,
      correctIndex: correctIndex,
      explanation: explanation,
      sourceReference: sourceReference,
      citations: citations,
    },
    reasons: reasons,
  };
}

function similarityGate(nk: nkruntime.Nakama, categoryKey: string, questionText: string, threshold: number): { ok: boolean; score: number; similar: string } {
  var dupRows = getRows(nk.sqlQuery(
    `SELECT COUNT(*) as count
     FROM questions
     WHERE category = $1 AND is_active = true AND lower(trim(question_text)) = lower(trim($2))`,
    [categoryKey, questionText]
  ));
  if (dupRows.length > 0 && toInt(dupRows[0].count, 0) > 0) {
    return { ok: false, score: 1, similar: questionText };
  }

  var simRows = getRows(nk.sqlQuery(
    `SELECT question_text, similarity(question_text, $2) as sim
     FROM questions
     WHERE category = $1 AND is_active = true
     ORDER BY sim DESC
     LIMIT 1`,
    [categoryKey, questionText]
  ));
  if (simRows.length === 0) return { ok: true, score: 0, similar: '' };

  var score = toNumber(simRows[0].sim, 0);
  return { ok: score < threshold, score: score, similar: String(simRows[0].question_text || '') };
}

function citationGate(question: any, chunkMap: {[key: string]: any}, required: boolean): { ok: boolean; reasons: string[] } {
  var reasons: string[] = [];
  var citations = Array.isArray(question.citations) ? question.citations : [];
  if (required && citations.length === 0) {
    reasons.push('Citations are required');
  }
  for (var i = 0; i < citations.length; i++) {
    var citation = citations[i] || {};
    var chunkId = String(citation.chunkId || '').trim();
    var quote = String(citation.quote || '').trim();
    if (!chunkId || !quote) {
      reasons.push('Citation entry must include chunkId and quote');
      continue;
    }
    var chunk = chunkMap[chunkId];
    if (!chunk) {
      reasons.push('Citation chunk not found: ' + chunkId);
      continue;
    }
    if (String(chunk.content || '').toLowerCase().indexOf(quote.toLowerCase()) === -1) {
      reasons.push('Citation quote not found in source chunk: ' + chunkId);
    }
  }
  return { ok: reasons.length === 0, reasons: reasons };
}

function estimateUsd(usage: any, profile: any): number {
  var inputCost = toNumber(profile && profile.config ? profile.config.inputUsdPer1M : 0, 0.14);
  var outputCost = toNumber(profile && profile.config ? profile.config.outputUsdPer1M : 0, 0.28);
  var promptTokens = toInt(usage.prompt_tokens, 0);
  var completionTokens = toInt(usage.completion_tokens, 0);
  return ((promptTokens * inputCost) + (completionTokens * outputCost)) / 1000000;
}

function spentUsdWindow(nk: nkruntime.Nakama, profileId: string, categoryKey: string, intervalText: string): number {
  var rows = getRows(nk.sqlQuery(
    `SELECT COALESCE(SUM((stats->>'estimatedUsd')::numeric), 0) as spent
     FROM ai_generation_jobs
     WHERE profile_id = $1 AND category_key = $2 AND status IN ('completed', 'scheduled')
       AND created_at >= NOW() - ($3)::interval`,
    [profileId, categoryKey, intervalText]
  ));
  return rows.length > 0 ? toNumber(rows[0].spent, 0) : 0;
}

function enforceBudgets(nk: nkruntime.Nakama, settings: any, profile: any, categoryKey: string, estimatedRunUsd: number): void {
  var pb = profile && profile.budgets && typeof profile.budgets === 'object' ? profile.budgets : {};
  var dailyCap = toNumber(pb.dailyUsd, toNumber(settings.dailyBudgetUsd, 0));
  var monthlyCap = toNumber(pb.monthlyUsd, toNumber(settings.monthlyBudgetUsd, 0));
  var dailySpent = spentUsdWindow(nk, profile.id, categoryKey, '1 day');
  var monthlySpent = spentUsdWindow(nk, profile.id, categoryKey, '30 days');
  if (dailyCap > 0 && dailySpent + estimatedRunUsd > dailyCap) throw new Error('Daily budget exceeded for this category/profile');
  if (monthlyCap > 0 && monthlySpent + estimatedRunUsd > monthlyCap) throw new Error('Monthly budget exceeded for this category/profile');
}

function createFailure(nk: nkruntime.Nakama, jobId: string, candidateId: string | null, type: string, message: string, details: any): void {
  nk.sqlExec(
    `INSERT INTO ai_generation_failures (job_id, candidate_id, failure_type, message, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [jobId, candidateId, type, message, JSON.stringify(details || {})]
  );
}

function createCandidateRow(
  nk: nkruntime.Nakama,
  jobId: string,
  categoryKey: string,
  sourcePackId: string | null,
  profileId: string | null,
  question: any,
  status: string,
  gateReport: any,
  reasons: string[],
  userId: string
): string {
  var normalizedText = normalizeQuestionText(String(question.questionText || ''));
  var result = getRows(nk.sqlQuery(
    `INSERT INTO ai_generated_candidates (
      job_id, category_key, source_pack_id, profile_id, question_data, normalized_question_text,
      question_hash, status, gate_report, failure_reasons, created_by
    )
    VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb, $10::jsonb, $11)
    RETURNING id`,
    [jobId, categoryKey, sourcePackId, profileId, JSON.stringify(question), normalizedText, nk.sha256Hash(normalizedText), status, JSON.stringify(gateReport || {}), JSON.stringify(reasons || []), userId]
  ));
  return result.length > 0 ? result[0].id : '';
}

function publishFromCandidate(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  candidateId: string,
  sourcePackId: string | null,
  question: any,
  gateReport: any,
  userId: string
): string {
  var questionId = nk.uuidv4();
  nk.sqlExec(
    `INSERT INTO questions (
      id, category, difficulty, question_text, options, correct_index, explanation, source_reference,
      question_type, created_by, created_via, ai_candidate_id, source_pack_id, citation_data, quality_gate_report
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ai', $11, $12, $13::jsonb, $14::jsonb)`,
    [
      questionId,
      question.category,
      question.difficulty,
      question.questionText,
      JSON.stringify(question.options),
      question.correctIndex,
      question.explanation || '',
      question.sourceReference || '',
      question.questionType || 'mcq',
      userId,
      candidateId,
      sourcePackId,
      JSON.stringify({ citations: question.citations || [] }),
      JSON.stringify(gateReport || {}),
    ]
  );
  nk.sqlExec(
    `UPDATE ai_generated_candidates
     SET status = 'published', published_question_id = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
     WHERE id = $3`,
    [questionId, userId, candidateId]
  );
  refreshQuestionCache(question.category, nk, logger);
  return questionId;
}

function updateJob(nk: nkruntime.Nakama, jobId: string, fields: any): void {
  var sets: string[] = ['updated_at = NOW()'];
  var args: any[] = [];
  var idx = 1;

  var keys = ['status', 'started_at', 'finished_at', 'last_run_at', 'next_run_at', 'error_summary'];
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (fields[key] !== undefined) {
      sets.push(key + ' = $' + idx++);
      args.push(fields[key]);
    }
  }

  if (fields.stats !== undefined) {
    sets.push('stats = $' + idx++ + '::jsonb');
    args.push(JSON.stringify(fields.stats || {}));
  }

  args.push(jobId);
  nk.sqlExec('UPDATE ai_generation_jobs SET ' + sets.join(', ') + ' WHERE id = $' + idx, args);
}

function jobById(nk: nkruntime.Nakama, jobId: string): any | null {
  var rows = getRows(nk.sqlQuery('SELECT * FROM ai_generation_jobs WHERE id = $1 LIMIT 1', [jobId]));
  if (rows.length === 0) return null;
  var row = rows[0];
  return {
    id: row.id,
    requestedBy: row.requested_by,
    triggerType: row.trigger_type,
    status: row.status,
    categoryKey: row.category_key,
    sourcePackId: row.source_pack_id || null,
    profileId: row.profile_id || null,
    questionTargetCount: toInt(row.question_target_count, 10),
    autoPublish: row.auto_publish !== false,
    strictMode: row.strict_mode !== false,
    allowedQuestionTypes: normalizeAllowedTypes(parseJson(row.allowed_question_types, DEFAULT_ALLOWED_TYPES)),
    scheduleIntervalMinutes: row.schedule_interval_minutes ? toInt(row.schedule_interval_minutes, 60) : null,
    nextRunAt: row.next_run_at || null,
  };
}

function createJobRow(
  nk: nkruntime.Nakama,
  requestedBy: string,
  triggerType: string,
  status: string,
  categoryKey: string,
  sourcePackId: string | null,
  profileId: string | null,
  questionTargetCount: number,
  autoPublish: boolean,
  strictMode: boolean,
  allowedQuestionTypes: string[],
  scheduleIntervalMinutes: number | null,
  nextRunAt: string | null
): string {
  var rows = getRows(nk.sqlQuery(
    `INSERT INTO ai_generation_jobs (
      requested_by, trigger_type, status, category_key, source_pack_id, profile_id,
      question_target_count, auto_publish, strict_mode, allowed_question_types,
      schedule_interval_minutes, next_run_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
    RETURNING id`,
    [requestedBy, triggerType, status, categoryKey, sourcePackId, profileId, questionTargetCount, autoPublish, strictMode, JSON.stringify(allowedQuestionTypes), scheduleIntervalMinutes, nextRunAt]
  ));
  return rows.length > 0 ? rows[0].id : '';
}

function processJob(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, jobId: string): any {
  var job = jobById(nk, jobId);
  if (!job) throw new Error('Job not found');
  if (!isValidCategoryFromDb(nk, logger, job.categoryKey)) throw new Error('Invalid job category');

  var settings = globalSettings(nk);
  if (!settings.enabled) throw new Error('AI generation is disabled');
  if (settings.killSwitch) throw new Error('AI kill switch is enabled');

  var override = getCategoryOverride(nk, job.categoryKey);
  if (override && override.isEnabled === false) throw new Error('AI generation disabled for this category');

  if (override && override.overrideConfig && typeof override.overrideConfig === 'object') {
    var oc = override.overrideConfig;
    if (oc.autoPublish !== undefined) settings.autoPublish = oc.autoPublish !== false;
    if (oc.strictMode !== undefined) settings.strictMode = oc.strictMode !== false;
    if (oc.maxQuestionsPerRun !== undefined) settings.maxQuestionsPerRun = Math.floor(clamp(toInt(oc.maxQuestionsPerRun, settings.maxQuestionsPerRun), 1, 500));
    if (oc.maxInputTokensPerRun !== undefined) settings.maxInputTokensPerRun = Math.floor(clamp(toInt(oc.maxInputTokensPerRun, settings.maxInputTokensPerRun), 500, 50000));
    if (oc.maxOutputTokensPerRun !== undefined) settings.maxOutputTokensPerRun = Math.floor(clamp(toInt(oc.maxOutputTokensPerRun, settings.maxOutputTokensPerRun), 500, 50000));
    if (oc.similarityThreshold !== undefined) settings.similarityThreshold = clamp(toNumber(oc.similarityThreshold, settings.similarityThreshold), 0.4, 0.999);
    if (oc.requireCitation !== undefined) settings.requireCitation = oc.requireCitation !== false;
    if (oc.allowedQuestionTypes !== undefined) settings.allowedQuestionTypes = normalizeAllowedTypes(oc.allowedQuestionTypes);
  }

  if (override && override.budgets && typeof override.budgets === 'object') {
    if (override.budgets.dailyUsd !== undefined) settings.dailyBudgetUsd = clamp(toNumber(override.budgets.dailyUsd, settings.dailyBudgetUsd), 0, 1000000);
    if (override.budgets.monthlyUsd !== undefined) settings.monthlyBudgetUsd = clamp(toNumber(override.budgets.monthlyUsd, settings.monthlyBudgetUsd), 0, 1000000);
  }

  var allowedTypes = normalizeAllowedTypes(job.allowedQuestionTypes || settings.allowedQuestionTypes);
  var count = Math.floor(clamp(toInt(job.questionTargetCount, 10), 1, settings.maxQuestionsPerRun));

  var profile = null;
  if (job.profileId) profile = getProfileByRef(nk, String(job.profileId));
  if ((!profile || !profile.isActive) && override && override.profileId) profile = getProfileByRef(nk, String(override.profileId));
  if (!profile || !profile.isActive) profile = getDefaultProfile(nk, settings);
  if (!profile || !profile.isActive) throw new Error('No active AI provider profile found');

  var sourcePack = null;
  if (job.sourcePackId) sourcePack = getSourcePackByRef(nk, String(job.sourcePackId));
  if ((!sourcePack || !sourcePack.isActive) && override && override.sourcePackId) sourcePack = getSourcePackByRef(nk, String(override.sourcePackId));
  if (!sourcePack || !sourcePack.isActive) throw new Error('No active source pack configured for this job');
  if (sourcePack.categoryKey !== job.categoryKey) throw new Error('Source pack category mismatch');

  var chunks = loadSourceChunks(nk, sourcePack.id, job.categoryKey);
  if (chunks.length === 0) throw new Error('Source pack has no chunks');

  updateJob(nk, job.id, { status: 'running', started_at: new Date().toISOString(), error_summary: '' });

  var prompt = buildPrompt(job.categoryKey, settings.defaultLanguage || sourcePack.language || 'en', count, allowedTypes, chunks);
  if (estimateTokens(prompt.system + '\n' + prompt.user) > settings.maxInputTokensPerRun) {
    throw new Error('Prompt token estimate exceeds configured maxInputTokensPerRun');
  }

  var estimateRunUsd = ((settings.maxInputTokensPerRun * toNumber(profile.config && profile.config.inputUsdPer1M, 0.14)) + (settings.maxOutputTokensPerRun * toNumber(profile.config && profile.config.outputUsdPer1M, 0.28))) / 1000000;
  enforceBudgets(nk, settings, profile, job.categoryKey, estimateRunUsd);

  var apiKey = loadCredential(ctx, nk, String(profile.credentialProviderKey || profile.providerKey || 'deepseek'));
  var model = deepSeekRequest(nk, logger, profile, apiKey, prompt, count);

  var usage = model.usage || {};
  var promptTokens = toInt(usage.prompt_tokens, estimateTokens(prompt.system + '\n' + prompt.user));
  var completionTokens = toInt(usage.completion_tokens, estimateTokens(JSON.stringify(model.questions)));
  if (completionTokens > settings.maxOutputTokensPerRun) throw new Error('Output token usage exceeds configured maxOutputTokensPerRun');

  var chunkMap: {[key: string]: any} = {};
  for (var c = 0; c < chunks.length; c++) chunkMap[chunks[c].id] = chunks[c];

  var seenText: {[key: string]: boolean} = {};
  var imported = 0;
  var queued = 0;
  var failed = 0;
  var candidateIds: string[] = [];
  var publishedQuestionIds: string[] = [];

  for (var i = 0; i < model.questions.length; i++) {
    var prepared = prepareQuestion(model.questions[i], job.categoryKey, allowedTypes);
    var question = prepared.question;
    var reasons = prepared.reasons.slice();

    var normalizedText = normalizeQuestionText(question.questionText || '');
    if (!normalizedText) reasons.push('Question text is empty after normalization');
    if (seenText[normalizedText]) reasons.push('Duplicate generated question in the same batch');

    var cite = citationGate(question, chunkMap, settings.requireCitation !== false);
    if (!cite.ok) {
      for (var ci = 0; ci < cite.reasons.length; ci++) reasons.push(cite.reasons[ci]);
    }

    var sim = similarityGate(nk, job.categoryKey, question.questionText, settings.similarityThreshold);
    if (!sim.ok) reasons.push('Too similar to existing question (score=' + sim.score.toFixed(3) + ')');

    var gateReport = {
      schemaPass: prepared.reasons.length === 0,
      citationPass: cite.ok,
      similarityPass: sim.ok,
      similarityScore: sim.score,
      similarQuestionText: sim.similar,
      strictMode: settings.strictMode !== false,
    };

    var candidateStatus = reasons.length === 0 && settings.autoPublish === true ? 'published' : 'needs_review';
    var candidateId = createCandidateRow(nk, job.id, job.categoryKey, sourcePack.id, profile.id, question, candidateStatus, gateReport, reasons, job.requestedBy);
    if (!candidateId) {
      failed++;
      createFailure(nk, job.id, null, 'candidate_insert', 'Failed to insert generated candidate', { index: i });
      continue;
    }

    candidateIds.push(candidateId);

    if (reasons.length > 0) {
      queued++;
      failed++;
      createFailure(nk, job.id, candidateId, 'gate_fail', 'Candidate failed safeguards', { reasons: reasons, gateReport: gateReport });
      continue;
    }

    seenText[normalizedText] = true;

    if (settings.autoPublish === true) {
      try {
        var qid = publishFromCandidate(nk, logger, candidateId, sourcePack.id, question, gateReport, job.requestedBy);
        imported++;
        publishedQuestionIds.push(qid);
      } catch (publishError) {
        queued++;
        failed++;
        nk.sqlExec(
          `UPDATE ai_generated_candidates
           SET status = 'needs_review', failure_reasons = $2::jsonb, updated_at = NOW()
           WHERE id = $1`,
          [candidateId, JSON.stringify(['Publish failed: ' + String(publishError)])]
        );
        createFailure(nk, job.id, candidateId, 'publish_fail', String(publishError), {});
      }
    } else {
      queued++;
      nk.sqlExec(`UPDATE ai_generated_candidates SET status = 'needs_review', updated_at = NOW() WHERE id = $1`, [candidateId]);
    }
  }

  var estimatedUsd = estimateUsd({ prompt_tokens: promptTokens, completion_tokens: completionTokens }, profile);
  var nowIso = new Date().toISOString();
  var recurring = job.triggerType === 'scheduled' && job.scheduleIntervalMinutes && job.scheduleIntervalMinutes > 0;
  var nextRunAt = recurring ? new Date(Date.now() + job.scheduleIntervalMinutes * 60 * 1000).toISOString() : null;

  updateJob(nk, job.id, {
    status: recurring ? 'scheduled' : 'completed',
    finished_at: nowIso,
    last_run_at: nowIso,
    next_run_at: nextRunAt,
    stats: {
      requested: count,
      generated: model.questions.length,
      imported: imported,
      queuedForReview: queued,
      failed: failed,
      promptTokens: promptTokens,
      completionTokens: completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimatedUsd: estimatedUsd,
      sourceChunkCount: chunks.length,
      profileKey: profile.profileKey,
      sourcePackKey: sourcePack.packKey,
      candidateIds: candidateIds,
      publishedQuestionIds: publishedQuestionIds,
    },
    error_summary: '',
  });

  return {
    jobId: job.id,
    status: recurring ? 'scheduled' : 'completed',
    imported: imported,
    queuedForReview: queued,
    failed: failed,
    stats: {
      requested: count,
      generated: model.questions.length,
      promptTokens: promptTokens,
      completionTokens: completionTokens,
      estimatedUsd: estimatedUsd,
    },
  };
}

function processJobSafe(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, jobId: string): any {
  try {
    return processJob(ctx, logger, nk, jobId);
  } catch (error) {
    var message = String(error || 'Unknown AI job error');
    updateJob(nk, jobId, { status: 'failed', finished_at: new Date().toISOString(), error_summary: message });
    createFailure(nk, jobId, null, 'job_fail', message, {});
    return { jobId: jobId, status: 'failed', imported: 0, queuedForReview: 0, failed: 1, error: message };
  }
}

function parseQuestionDataRow(row: any): any {
  var questionData = parseJson(row.question_data, {});
  if (!questionData || typeof questionData !== 'object') questionData = {};

  var optionsRaw = Array.isArray(questionData.options) ? questionData.options : [];
  var options: string[] = [];
  for (var i = 0; i < optionsRaw.length; i++) {
    options.push(String(optionsRaw[i] || '').trim());
  }

  var citationsRaw = Array.isArray(questionData.citations) ? questionData.citations : [];
  var citations: any[] = [];
  for (var c = 0; c < citationsRaw.length; c++) {
    var citation = citationsRaw[c] || {};
    var chunkId = String(citation.chunkId || citation.chunk_id || '').trim();
    var quote = String(citation.quote || '').trim();
    if (!chunkId || !quote) continue;
    citations.push({ chunkId: chunkId, quote: quote });
  }

  return {
    id: row.id,
    jobId: row.job_id || null,
    categoryKey: row.category_key,
    sourcePackId: row.source_pack_id || null,
    profileId: row.profile_id || null,
    status: row.status || 'needs_review',
    question: questionData,
    questionType: String(questionData.questionType || questionData.question_type || 'mcq').toLowerCase(),
    questionText: String(questionData.questionText || questionData.question_text || '').trim(),
    options: options,
    correctIndex: toInt(questionData.correctIndex !== undefined ? questionData.correctIndex : questionData.correct_index, -1),
    difficulty: String(questionData.difficulty || 'medium').toLowerCase(),
    explanation: String(questionData.explanation || '').trim(),
    sourceReference: String(questionData.sourceReference || questionData.source_reference || '').trim(),
    citations: citations,
    gateReport: parseJson(row.gate_report, {}),
    failureReasons: parseJson(row.failure_reasons, []),
    normalizedQuestionText: String(row.normalized_question_text || ''),
    publishedQuestionId: row.published_question_id || null,
    createdBy: row.created_by || null,
    reviewedBy: row.reviewed_by || null,
    reviewedAt: row.reviewed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeOverrideConfig(raw: any): any {
  if (!raw || typeof raw !== 'object') return {};
  var next: any = {};
  if (raw.autoPublish !== undefined) next.autoPublish = raw.autoPublish === true;
  if (raw.strictMode !== undefined) next.strictMode = raw.strictMode === true;
  if (raw.maxQuestionsPerRun !== undefined) next.maxQuestionsPerRun = Math.floor(clamp(toInt(raw.maxQuestionsPerRun, 20), 1, 500));
  if (raw.maxInputTokensPerRun !== undefined) next.maxInputTokensPerRun = Math.floor(clamp(toInt(raw.maxInputTokensPerRun, 6000), 500, 50000));
  if (raw.maxOutputTokensPerRun !== undefined) next.maxOutputTokensPerRun = Math.floor(clamp(toInt(raw.maxOutputTokensPerRun, 4000), 500, 50000));
  if (raw.similarityThreshold !== undefined) next.similarityThreshold = clamp(toNumber(raw.similarityThreshold, 0.92), 0.4, 0.999);
  if (raw.requireCitation !== undefined) next.requireCitation = raw.requireCitation === true;
  if (raw.defaultLanguage !== undefined) next.defaultLanguage = String(raw.defaultLanguage || '').trim().toLowerCase().slice(0, 10) || 'en';
  if (raw.allowedQuestionTypes !== undefined) next.allowedQuestionTypes = normalizeAllowedTypes(raw.allowedQuestionTypes);
  return next;
}

function normalizeOverrideBudgets(raw: any): any {
  if (!raw || typeof raw !== 'object') return {};
  var next: any = {};
  if (raw.dailyUsd !== undefined) next.dailyUsd = clamp(toNumber(raw.dailyUsd, 0), 0, 1000000);
  if (raw.monthlyUsd !== undefined) next.monthlyUsd = clamp(toNumber(raw.monthlyUsd, 0), 0, 1000000);
  return next;
}

export function rpcAdminGetAiSettings(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'ai_questions.view');

    var settings = globalSettings(nk);
    var overridesRows = getRows(nk.sqlQuery(
      `SELECT id, category_key, is_enabled, profile_id, source_pack_id, override_config, budgets, updated_by, created_at, updated_at
       FROM ai_category_overrides
       ORDER BY category_key`
    ));
    var overrides: any[] = [];
    for (var i = 0; i < overridesRows.length; i++) {
      var row = overridesRows[i];
      overrides.push({
        id: row.id,
        categoryKey: row.category_key,
        isEnabled: row.is_enabled !== false,
        profileId: row.profile_id || null,
        sourcePackId: row.source_pack_id || null,
        overrideConfig: parseJson(row.override_config, {}),
        budgets: parseJson(row.budgets, {}),
        updatedBy: row.updated_by || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }

    var profilesRows = getRows(nk.sqlQuery(
      `SELECT *
       FROM ai_provider_profiles
       ORDER BY is_default DESC, updated_at DESC
       LIMIT 100`
    ));
    var profiles: any[] = [];
    for (var p = 0; p < profilesRows.length; p++) {
      profiles.push(getProfileByRef(nk, String(profilesRows[p].id)));
    }

    var sourceRows = getRows(nk.sqlQuery(
      `SELECT p.*,
              (SELECT COUNT(*) FROM ai_source_documents d WHERE d.source_pack_id = p.id) as document_count,
              (SELECT COUNT(*) FROM ai_source_chunks c WHERE c.source_pack_id = p.id) as chunk_count
       FROM ai_source_packs p
       ORDER BY p.updated_at DESC
       LIMIT 100`
    ));
    var sourcePacks: any[] = [];
    for (var s = 0; s < sourceRows.length; s++) {
      sourcePacks.push({
        id: sourceRows[s].id,
        packKey: sourceRows[s].pack_key,
        categoryKey: sourceRows[s].category_key,
        name: sourceRows[s].name,
        description: sourceRows[s].description || '',
        language: sourceRows[s].language || 'en',
        status: sourceRows[s].status || 'active',
        isActive: sourceRows[s].is_active !== false,
        documentCount: toInt(sourceRows[s].document_count, 0),
        chunkCount: toInt(sourceRows[s].chunk_count, 0),
      });
    }

    return JSON.stringify({ settings: settings, categoryOverrides: overrides, profiles: profiles, sourcePacks: sourcePacks });
  } catch (error) {
    logger.error('admin_get_ai_settings error: ' + error);
    throw error;
  }
}

export function rpcAdminUpdateAiSettings(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireSuperAdmin(ctx, nk, logger);
    requireAdminCapability(ctx, nk, logger, 'ai_questions.manage');
    var request = safePayload(payload);
    var current = globalSettings(nk);
    var incoming = request.settings && typeof request.settings === 'object' ? request.settings : {};
    var next = normalizeGlobalSettings(Object.assign({}, current, incoming));

    nk.sqlExec(
      `INSERT INTO ai_generation_settings (settings_key, settings, updated_by, updated_at)
       VALUES ('global', $1::jsonb, $2, NOW())
       ON CONFLICT (settings_key) DO UPDATE SET settings = $1::jsonb, updated_by = $2, updated_at = NOW()`,
      [JSON.stringify(next), ctx.userId]
    );

    logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'ai_settings_update', 'ai_generation_settings', 'global', current, next);

    return JSON.stringify({ success: true, settings: next });
  } catch (error) {
    logger.error('admin_update_ai_settings error: ' + error);
    throw error;
  }
}

export function rpcAdminUpsertAiCategoryOverride(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireSuperAdmin(ctx, nk, logger);
    requireAdminCapability(ctx, nk, logger, 'ai_questions.manage');
    var request = safePayload(payload);
    var categoryKey = String(request.categoryKey || request.category_key || '').trim();
    if (!categoryKey || !isValidCategoryFromDb(nk, logger, categoryKey)) throw new Error('Valid categoryKey is required');

    var current = getCategoryOverride(nk, categoryKey);

    var isEnabled = request.isEnabled !== false && request.is_enabled !== false;
    var profileRef = request.profileId || request.profile_id || request.profileKey || request.profile_key || null;
    var sourcePackRef = request.sourcePackId || request.source_pack_id || request.sourcePackKey || request.source_pack_key || null;

    var profile = profileRef ? getProfileByRef(nk, String(profileRef)) : null;
    if (profileRef && !profile) throw new Error('Provider profile not found');

    var sourcePack = sourcePackRef ? getSourcePackByRef(nk, String(sourcePackRef)) : null;
    if (sourcePackRef && !sourcePack) throw new Error('Source pack not found');
    if (sourcePack && sourcePack.categoryKey !== categoryKey) throw new Error('Source pack category mismatch');

    var overrideConfig = normalizeOverrideConfig(request.overrideConfig || request.override_config || {});
    var budgets = normalizeOverrideBudgets(request.budgets || {});

    nk.sqlExec(
      `INSERT INTO ai_category_overrides (
         category_key, is_enabled, profile_id, source_pack_id, override_config, budgets, updated_by, updated_at
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, NOW())
       ON CONFLICT (category_key) DO UPDATE
       SET is_enabled = $2,
           profile_id = $3,
           source_pack_id = $4,
           override_config = $5::jsonb,
           budgets = $6::jsonb,
           updated_by = $7,
           updated_at = NOW()`,
      [categoryKey, isEnabled, profile ? profile.id : null, sourcePack ? sourcePack.id : null, JSON.stringify(overrideConfig), JSON.stringify(budgets), ctx.userId]
    );

    var next = getCategoryOverride(nk, categoryKey);

    logAdminAction(
      nk,
      logger,
      ctx.userId || '',
      admin.telegramId,
      'ai_category_override_upsert',
      'ai_category_overrides',
      categoryKey,
      current,
      next
    );

    return JSON.stringify({ success: true, override: next });
  } catch (error) {
    logger.error('admin_upsert_ai_category_override error: ' + error);
    throw error;
  }
}

export function rpcAdminDeleteAiCategoryOverride(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireSuperAdmin(ctx, nk, logger);
    requireAdminCapability(ctx, nk, logger, 'ai_questions.manage');
    var request = safePayload(payload);
    var categoryKey = String(request.categoryKey || request.category_key || '').trim();
    if (!categoryKey) throw new Error('categoryKey is required');

    var current = getCategoryOverride(nk, categoryKey);
    if (!current) return JSON.stringify({ success: true, deleted: false });

    nk.sqlExec('DELETE FROM ai_category_overrides WHERE category_key = $1', [categoryKey]);

    logAdminAction(
      nk,
      logger,
      ctx.userId || '',
      admin.telegramId,
      'ai_category_override_delete',
      'ai_category_overrides',
      categoryKey,
      current,
      null
    );

    return JSON.stringify({ success: true, deleted: true });
  } catch (error) {
    logger.error('admin_delete_ai_category_override error: ' + error);
    throw error;
  }
}

export function rpcAdminToggleAiKillSwitch(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireSuperAdmin(ctx, nk, logger);
    requireAdminCapability(ctx, nk, logger, 'ai_questions.manage');
    var request = safePayload(payload);
    var enabled = request.enabled === true;
    var current = globalSettings(nk);
    var next = Object.assign({}, current, { killSwitch: enabled });

    nk.sqlExec(
      `INSERT INTO ai_generation_settings (settings_key, settings, updated_by, updated_at)
       VALUES ('global', $1::jsonb, $2, NOW())
       ON CONFLICT (settings_key) DO UPDATE SET settings = $1::jsonb, updated_by = $2, updated_at = NOW()`,
      [JSON.stringify(next), ctx.userId]
    );

    logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'ai_kill_switch_toggle', 'ai_generation_settings', 'global', { killSwitch: current.killSwitch }, { killSwitch: enabled });

    return JSON.stringify({ success: true, killSwitch: enabled });
  } catch (error) {
    logger.error('admin_toggle_ai_kill_switch error: ' + error);
    throw error;
  }
}

export function rpcAdminSetAiProviderCredential(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireSuperAdmin(ctx, nk, logger);
    requireAdminCapability(ctx, nk, logger, 'ai_questions.manage');
    var request = safePayload(payload);
    var providerKey = String(request.providerKey || request.provider_key || 'deepseek').trim().toLowerCase();
    var apiKey = String(request.apiKey || request.api_key || '').trim();
    if (!providerKey) throw new Error('providerKey is required');
    if (!apiKey || apiKey.length < 8) throw new Error('apiKey is required');

    var secretKey = getEncryptionKey(ctx);
    if (!secretKey) throw new Error('AI_SECRETS_ENCRYPTION_KEY is required');

    var hint = '****' + apiKey.slice(-4);
    nk.sqlExec(
      `INSERT INTO ai_provider_credentials (provider_key, encrypted_secret, secret_hint, is_active, created_by, updated_by, updated_at)
       VALUES ($1, pgp_sym_encrypt($2, $3), $4, true, $5, $5, NOW())
       ON CONFLICT (provider_key) DO UPDATE
       SET encrypted_secret = pgp_sym_encrypt($2, $3), secret_hint = $4, is_active = true, updated_by = $5, updated_at = NOW()`,
      [providerKey, apiKey, secretKey, hint, ctx.userId]
    );

    logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'ai_provider_credential_set', 'ai_provider_credentials', providerKey, null, { providerKey: providerKey, hint: hint });

    return JSON.stringify({ success: true, providerKey: providerKey, hint: hint });
  } catch (error) {
    logger.error('admin_set_ai_provider_credential error: ' + error);
    throw error;
  }
}

export function rpcAdminListAiProviderProfiles(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'ai_questions.view');
    var request = safePayload(payload);
    var includeInactive = request.includeInactive === true;
    var query = includeInactive
      ? 'SELECT id FROM ai_provider_profiles ORDER BY is_default DESC, updated_at DESC LIMIT 100'
      : 'SELECT id FROM ai_provider_profiles WHERE is_active = true ORDER BY is_default DESC, updated_at DESC LIMIT 100';
    var rows = getRows(nk.sqlQuery(query));
    var profiles: any[] = [];
    for (var i = 0; i < rows.length; i++) {
      var item = getProfileByRef(nk, String(rows[i].id));
      if (item) profiles.push(item);
    }
    return JSON.stringify({ profiles: profiles });
  } catch (error) {
    logger.error('admin_list_ai_provider_profiles error: ' + error);
    throw error;
  }
}

export function rpcAdminCreateAiProviderProfile(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireSuperAdmin(ctx, nk, logger);
    requireAdminCapability(ctx, nk, logger, 'ai_questions.manage');
    var request = safePayload(payload);
    var profile = request.profile && typeof request.profile === 'object' ? request.profile : request;

    var profileKey = slugify(String(profile.profileKey || profile.profile_key || 'profile_' + Date.now()));
    var providerKey = String(profile.providerKey || profile.provider_key || 'deepseek').trim().toLowerCase();
    var credentialProviderKey = String(profile.credentialProviderKey || profile.credential_provider_key || providerKey).trim().toLowerCase();
    var endpointUrl = String(profile.endpointUrl || profile.endpoint_url || 'https://api.deepseek.com/chat/completions').trim();
    var model = String(profile.model || 'deepseek-chat').trim();
    var temperature = clamp(toNumber(profile.temperature, 0.3), 0, 2);
    var topP = clamp(toNumber(profile.topP !== undefined ? profile.topP : profile.top_p, 1), 0.05, 1);
    var maxTokens = Math.floor(clamp(toInt(profile.maxTokens !== undefined ? profile.maxTokens : profile.max_tokens, 1400), 64, 16000));
    var timeoutMs = Math.floor(clamp(toInt(profile.timeoutMs !== undefined ? profile.timeoutMs : profile.timeout_ms, 45000), 1000, 120000));
    var maxRetries = Math.floor(clamp(toInt(profile.maxRetries !== undefined ? profile.maxRetries : profile.max_retries, 2), 0, 10));
    var isDefault = profile.isDefault === true || profile.is_default === true;
    var isActive = profile.isActive !== false && profile.is_active !== false;
    var config = profile.config && typeof profile.config === 'object' ? profile.config : {};
    var budgets = profile.budgets && typeof profile.budgets === 'object' ? profile.budgets : {};

    if (isDefault) {
      nk.sqlExec('UPDATE ai_provider_profiles SET is_default = false WHERE is_default = true');
    }

    var rows = getRows(nk.sqlQuery(
      `INSERT INTO ai_provider_profiles (
        profile_key, provider_key, credential_provider_key, endpoint_url, model,
        temperature, top_p, max_tokens, timeout_ms, max_retries,
        is_default, is_active, config, budgets, created_by, updated_by, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,$15,NOW())
      RETURNING id`,
      [profileKey, providerKey, credentialProviderKey, endpointUrl, model, temperature, topP, maxTokens, timeoutMs, maxRetries, isDefault, isActive, JSON.stringify(config), JSON.stringify(budgets), ctx.userId]
    ));
    if (rows.length === 0) throw new Error('Failed to create provider profile');

    logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'ai_provider_profile_create', 'ai_provider_profiles', rows[0].id, null, { profileKey: profileKey, model: model, isDefault: isDefault });

    return JSON.stringify({ success: true, profileId: rows[0].id });
  } catch (error) {
    logger.error('admin_create_ai_provider_profile error: ' + error);
    throw error;
  }
}

export function rpcAdminUpdateAiProviderProfile(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireSuperAdmin(ctx, nk, logger);
    requireAdminCapability(ctx, nk, logger, 'ai_questions.manage');
    var request = safePayload(payload);
    var profileId = String(request.profileId || request.profile_key || request.profile_id || '').trim();
    var updates = request.updates && typeof request.updates === 'object' ? request.updates : {};
    if (!profileId) throw new Error('profileId is required');

    var current = getProfileByRef(nk, profileId);
    if (!current) throw new Error('Profile not found');

    var nextProviderKey = updates.providerKey !== undefined ? String(updates.providerKey).trim().toLowerCase() : current.providerKey;
    var nextCredentialProviderKey = updates.credentialProviderKey !== undefined ? String(updates.credentialProviderKey).trim().toLowerCase() : current.credentialProviderKey;
    var nextEndpointUrl = updates.endpointUrl !== undefined ? String(updates.endpointUrl).trim() : current.endpointUrl;
    var nextModel = updates.model !== undefined ? String(updates.model).trim() : current.model;
    var nextTemperature = updates.temperature !== undefined ? clamp(toNumber(updates.temperature, current.temperature), 0, 2) : current.temperature;
    var nextTopP = updates.topP !== undefined ? clamp(toNumber(updates.topP, current.topP), 0.05, 1) : current.topP;
    var nextMaxTokens = updates.maxTokens !== undefined ? Math.floor(clamp(toInt(updates.maxTokens, current.maxTokens), 64, 16000)) : current.maxTokens;
    var nextTimeoutMs = updates.timeoutMs !== undefined ? Math.floor(clamp(toInt(updates.timeoutMs, current.timeoutMs), 1000, 120000)) : current.timeoutMs;
    var nextMaxRetries = updates.maxRetries !== undefined ? Math.floor(clamp(toInt(updates.maxRetries, current.maxRetries), 0, 10)) : current.maxRetries;
    var nextIsDefault = updates.isDefault !== undefined ? updates.isDefault === true : current.isDefault;
    var nextIsActive = updates.isActive !== undefined ? updates.isActive === true : current.isActive;
    var nextConfig = updates.config && typeof updates.config === 'object' ? updates.config : current.config;
    var nextBudgets = updates.budgets && typeof updates.budgets === 'object' ? updates.budgets : current.budgets;
    var settingsBefore = globalSettings(nk);
    var needsDefaultRotation = settingsBefore.defaultProfileKey === current.profileKey && !nextIsDefault;
    var fallbackDefaultId = '';
    var fallbackDefaultKey = '';

    if (nextIsDefault && !nextIsActive) throw new Error('Default profile must be active');

    if (needsDefaultRotation) {
      var fallbackRows = getRows(nk.sqlQuery(
        `SELECT id, profile_key
         FROM ai_provider_profiles
         WHERE id <> $1 AND is_active = true
         ORDER BY is_default DESC, updated_at DESC
         LIMIT 1`,
        [current.id]
      ));
      if (fallbackRows.length === 0) throw new Error('At least one active profile must remain');
      fallbackDefaultId = String(fallbackRows[0].id || '');
      fallbackDefaultKey = String(fallbackRows[0].profile_key || '').trim();
      if (!fallbackDefaultId || !fallbackDefaultKey) throw new Error('Invalid fallback default profile');
    }

    if (nextIsDefault) {
      nk.sqlExec('UPDATE ai_provider_profiles SET is_default = false WHERE id <> $1 AND is_default = true', [current.id]);
    }

    nk.sqlExec(
      `UPDATE ai_provider_profiles
       SET provider_key = $1,
           credential_provider_key = $2,
           endpoint_url = $3,
           model = $4,
           temperature = $5,
           top_p = $6,
           max_tokens = $7,
           timeout_ms = $8,
           max_retries = $9,
           is_default = $10,
           is_active = $11,
           config = $12::jsonb,
           budgets = $13::jsonb,
           updated_by = $14,
           updated_at = NOW()
       WHERE id = $15`,
      [nextProviderKey, nextCredentialProviderKey, nextEndpointUrl, nextModel, nextTemperature, nextTopP, nextMaxTokens, nextTimeoutMs, nextMaxRetries, nextIsDefault, nextIsActive, JSON.stringify(nextConfig), JSON.stringify(nextBudgets), ctx.userId, current.id]
    );

    if (needsDefaultRotation) {
      nk.sqlExec('UPDATE ai_provider_profiles SET is_default = false WHERE is_default = true');
      nk.sqlExec(
        `UPDATE ai_provider_profiles
         SET is_default = true, updated_by = $1, updated_at = NOW()
         WHERE id = $2`,
        [ctx.userId, fallbackDefaultId]
      );
    }

    var nextDefaultProfileKey = settingsBefore.defaultProfileKey;
    if (nextIsDefault) {
      nextDefaultProfileKey = current.profileKey;
    } else if (needsDefaultRotation) {
      nextDefaultProfileKey = fallbackDefaultKey;
    }

    if (nextDefaultProfileKey !== settingsBefore.defaultProfileKey) {
      var nextSettings = normalizeGlobalSettings(Object.assign({}, settingsBefore, { defaultProfileKey: nextDefaultProfileKey }));
      nk.sqlExec(
        `INSERT INTO ai_generation_settings (settings_key, settings, updated_by, updated_at)
         VALUES ('global', $1::jsonb, $2, NOW())
         ON CONFLICT (settings_key) DO UPDATE
         SET settings = $1::jsonb, updated_by = $2, updated_at = NOW()`,
        [JSON.stringify(nextSettings), ctx.userId]
      );
    }

    logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'ai_provider_profile_update', 'ai_provider_profiles', current.id, current, {
      providerKey: nextProviderKey,
      credentialProviderKey: nextCredentialProviderKey,
      endpointUrl: nextEndpointUrl,
      model: nextModel,
      temperature: nextTemperature,
      topP: nextTopP,
      maxTokens: nextMaxTokens,
      timeoutMs: nextTimeoutMs,
      maxRetries: nextMaxRetries,
      isDefault: nextIsDefault,
      isActive: nextIsActive,
      config: nextConfig,
      budgets: nextBudgets,
    });

    var updated = getProfileByRef(nk, current.id);
    if (!updated) throw new Error('Profile not found after update');
    var settingsAfter = globalSettings(nk);
    return JSON.stringify({ success: true, profile: updated, defaultProfileKey: settingsAfter.defaultProfileKey });
  } catch (error) {
    logger.error('admin_update_ai_provider_profile error: ' + error);
    throw error;
  }
}

export function rpcAdminDeleteAiProviderProfile(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireSuperAdmin(ctx, nk, logger);
    requireAdminCapability(ctx, nk, logger, 'ai_questions.manage');
    var request = safePayload(payload);
    var profileId = String(request.profileId || request.profile_id || '').trim();
    if (!profileId) throw new Error('profileId is required');
    var profile = getProfileByRef(nk, profileId);
    if (!profile) throw new Error('Profile not found');

    var currentSettings = globalSettings(nk);
    var deletingCurrentDefault = profile.isDefault === true || currentSettings.defaultProfileKey === profile.profileKey;
    var requiresActiveReplacement = profile.isActive === true || deletingCurrentDefault;

    var replacementProfileId = '';
    var replacementProfileKey = '';
    if (requiresActiveReplacement) {
      var replacementRows = getRows(nk.sqlQuery(
        `SELECT id, profile_key
         FROM ai_provider_profiles
         WHERE id <> $1 AND is_active = true
         ORDER BY is_default DESC, updated_at DESC
         LIMIT 1`,
        [profile.id]
      ));
      if (replacementRows.length === 0) throw new Error('At least one active profile must remain');
      replacementProfileId = String(replacementRows[0].id || '');
      replacementProfileKey = String(replacementRows[0].profile_key || '').trim();
    }

    nk.sqlExec('DELETE FROM ai_provider_profiles WHERE id = $1', [profile.id]);

    var nextDefaultProfileKey = currentSettings.defaultProfileKey;
    if (deletingCurrentDefault) {
      if (!replacementProfileId || !replacementProfileKey) throw new Error('No replacement default profile available');
      nk.sqlExec('UPDATE ai_provider_profiles SET is_default = false WHERE is_default = true');
      nk.sqlExec(
        `UPDATE ai_provider_profiles
         SET is_default = true, updated_by = $1, updated_at = NOW()
         WHERE id = $2`,
        [ctx.userId, replacementProfileId]
      );

      nextDefaultProfileKey = replacementProfileKey;
      var nextSettings = normalizeGlobalSettings(Object.assign({}, currentSettings, { defaultProfileKey: nextDefaultProfileKey }));
      nk.sqlExec(
        `INSERT INTO ai_generation_settings (settings_key, settings, updated_by, updated_at)
         VALUES ('global', $1::jsonb, $2, NOW())
         ON CONFLICT (settings_key) DO UPDATE
         SET settings = $1::jsonb, updated_by = $2, updated_at = NOW()`,
        [JSON.stringify(nextSettings), ctx.userId]
      );
    }

    logAdminAction(
      nk,
      logger,
      ctx.userId || '',
      admin.telegramId,
      'ai_provider_profile_delete',
      'ai_provider_profiles',
      profile.id,
      profile,
      { deleted: true, nextDefaultProfileKey: nextDefaultProfileKey }
    );

    return JSON.stringify({ success: true, deletedProfileId: profile.id, nextDefaultProfileKey: nextDefaultProfileKey });
  } catch (error) {
    logger.error('admin_delete_ai_provider_profile error: ' + error);
    throw error;
  }
}

export function rpcAdminListAiSourcePacks(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'ai_questions.view');
    var request = safePayload(payload);
    var categoryKey = String(request.categoryKey || request.category_key || '').trim();
    var includeInactive = request.includeInactive === true;

    var conditions: string[] = [];
    var args: any[] = [];
    var idx = 1;

    if (categoryKey) {
      conditions.push('p.category_key = $' + idx++);
      args.push(categoryKey);
    }
    if (!includeInactive) {
      conditions.push('p.is_active = true');
    }

    var whereClause = conditions.length > 0 ? (' WHERE ' + conditions.join(' AND ')) : '';

    var rows = getRows(nk.sqlQuery(
      `SELECT p.*,
              (SELECT COUNT(*) FROM ai_source_documents d WHERE d.source_pack_id = p.id) as document_count,
              (SELECT COUNT(*) FROM ai_source_chunks c WHERE c.source_pack_id = p.id) as chunk_count
       FROM ai_source_packs p` + whereClause +
      ' ORDER BY p.updated_at DESC LIMIT 100',
      args
    ));

    var sourcePacks: any[] = [];
    for (var i = 0; i < rows.length; i++) {
      sourcePacks.push({
        id: rows[i].id,
        packKey: rows[i].pack_key,
        categoryKey: rows[i].category_key,
        name: rows[i].name,
        description: rows[i].description || '',
        language: rows[i].language || 'en',
        status: rows[i].status || 'active',
        isActive: rows[i].is_active !== false,
        documentCount: toInt(rows[i].document_count, 0),
        chunkCount: toInt(rows[i].chunk_count, 0),
        createdAt: rows[i].created_at,
        updatedAt: rows[i].updated_at,
      });
    }

    return JSON.stringify({ sourcePacks: sourcePacks });
  } catch (error) {
    logger.error('admin_list_ai_source_packs error: ' + error);
    throw error;
  }
}

export function rpcAdminCreateAiSourcePack(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'ai_questions.manage');
    var request = safePayload(payload);
    var pack = request.pack && typeof request.pack === 'object' ? request.pack : request;

    var categoryKey = String(pack.categoryKey || pack.category_key || '').trim();
    if (!categoryKey || !isValidCategoryFromDb(nk, logger, categoryKey)) throw new Error('Valid categoryKey is required');

    var name = String(pack.name || '').trim();
    if (!name) throw new Error('Pack name is required');

    var packKey = slugify(String(pack.packKey || pack.pack_key || (name + '_' + Date.now())));
    var description = String(pack.description || '').trim();
    var language = String(pack.language || 'en').trim().toLowerCase().slice(0, 10) || 'en';
    var status = pack.status === 'archived' ? 'archived' : 'active';
    var isActive = pack.isActive !== false && pack.is_active !== false;

    var rows = getRows(nk.sqlQuery(
      `INSERT INTO ai_source_packs (pack_key, category_key, name, description, language, status, is_active, created_by, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, NOW())
       RETURNING id`,
      [packKey, categoryKey, name, description, language, status, isActive, ctx.userId]
    ));
    if (rows.length === 0) throw new Error('Failed to create source pack');

    var counts = storeSourceDocuments(nk, rows[0].id, Array.isArray(pack.documents) ? pack.documents : []);

    logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'ai_source_pack_create', 'ai_source_packs', rows[0].id, null, {
      categoryKey: categoryKey,
      packKey: packKey,
      documentCount: counts.docCount,
      chunkCount: counts.chunkCount,
    });

    return JSON.stringify({ success: true, sourcePackId: rows[0].id, documentCount: counts.docCount, chunkCount: counts.chunkCount });
  } catch (error) {
    logger.error('admin_create_ai_source_pack error: ' + error);
    throw error;
  }
}

export function rpcAdminUpdateAiSourcePack(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'ai_questions.manage');
    var request = safePayload(payload);
    var sourcePackId = String(request.sourcePackId || request.source_pack_id || '').trim();
    var updates = request.updates && typeof request.updates === 'object' ? request.updates : {};
    if (!sourcePackId) throw new Error('sourcePackId is required');

    var current = getSourcePackByRef(nk, sourcePackId);
    if (!current) throw new Error('Source pack not found');

    var nextCategory = updates.categoryKey !== undefined ? String(updates.categoryKey).trim() : current.categoryKey;
    if (!isValidCategoryFromDb(nk, logger, nextCategory)) throw new Error('Invalid categoryKey');

    var nextName = updates.name !== undefined ? String(updates.name).trim() : current.name;
    if (!nextName) throw new Error('Pack name is required');

    var nextDescription = updates.description !== undefined ? String(updates.description).trim() : '';
    var nextLanguage = updates.language !== undefined ? String(updates.language).trim().toLowerCase().slice(0, 10) : (current.language || 'en');
    var nextStatus = updates.status === 'archived' ? 'archived' : (updates.status === 'active' ? 'active' : 'active');
    var nextIsActive = updates.isActive !== undefined ? updates.isActive === true : current.isActive;

    nk.sqlExec(
      `UPDATE ai_source_packs
       SET category_key = $1,
           name = $2,
           description = $3,
           language = $4,
           status = $5,
           is_active = $6,
           updated_by = $7,
           updated_at = NOW()
       WHERE id = $8`,
      [nextCategory, nextName, nextDescription, nextLanguage, nextStatus, nextIsActive, ctx.userId, current.id]
    );

    var counts = { docCount: 0, chunkCount: 0 };
    if (Array.isArray(updates.documents)) {
      counts = storeSourceDocuments(nk, current.id, updates.documents);
    }

    logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'ai_source_pack_update', 'ai_source_packs', current.id, current, {
      categoryKey: nextCategory,
      name: nextName,
      status: nextStatus,
      isActive: nextIsActive,
      replacedDocuments: Array.isArray(updates.documents),
      documentCount: counts.docCount,
      chunkCount: counts.chunkCount,
    });

    return JSON.stringify({ success: true, replacedDocuments: Array.isArray(updates.documents), documentCount: counts.docCount, chunkCount: counts.chunkCount });
  } catch (error) {
    logger.error('admin_update_ai_source_pack error: ' + error);
    throw error;
  }
}

export function rpcAdminDeleteAiSourcePack(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'ai_questions.manage');
    var request = safePayload(payload);
    var sourcePackId = String(request.sourcePackId || request.source_pack_id || '').trim();
    if (!sourcePackId) throw new Error('sourcePackId is required');
    var current = getSourcePackByRef(nk, sourcePackId);
    if (!current) throw new Error('Source pack not found');

    nk.sqlExec(
      `UPDATE ai_source_packs
       SET is_active = false, status = 'archived', updated_by = $1, updated_at = NOW()
       WHERE id = $2`,
      [ctx.userId, current.id]
    );

    logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'ai_source_pack_delete', 'ai_source_packs', current.id, { isActive: true }, { isActive: false, status: 'archived' });

    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error('admin_delete_ai_source_pack error: ' + error);
    throw error;
  }
}

export function rpcAdminGenerateAiQuestions(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'ai_questions.manage');
    var rate = RateLimiter.isRateLimited(nk, ctx.userId || '', AI_JOB_RATE_KEY, logger);
    if (rate.limited) {
      throw new Error('Rate limit exceeded. Try again in ' + Math.ceil((rate.retryAfterMs || 0) / 1000) + ' seconds.');
    }

    var request = safePayload(payload);
    var categoryKey = String(request.categoryKey || request.category_key || '').trim();
    if (!categoryKey || !isValidCategoryFromDb(nk, logger, categoryKey)) throw new Error('Valid categoryKey is required');

    var settings = globalSettings(nk);
    var count = Math.floor(clamp(toInt(request.count !== undefined ? request.count : request.questionTargetCount, 10), 1, settings.maxQuestionsPerRun));
    var autoPublish = request.autoPublish !== false;
    var strictMode = request.strictMode !== false;
    var allowedTypes = normalizeAllowedTypes(request.allowedQuestionTypes || request.allowed_question_types || settings.allowedQuestionTypes);

    var sourcePack = request.sourcePackId || request.source_pack_id || request.sourcePackKey || request.source_pack_key || null;
    var profileRef = request.profileId || request.profile_id || request.profileKey || request.profile_key || null;
    var sourcePackEntity = sourcePack ? getSourcePackByRef(nk, String(sourcePack)) : null;
    var profileEntity = profileRef ? getProfileByRef(nk, String(profileRef)) : null;

    var scheduled = request.scheduled === true;
    var runNow = request.runNow === true || request.run_now === true || request.executeNow === true || request.execute_now === true;
    var intervalMinutes = scheduled ? Math.floor(clamp(toInt(request.scheduleIntervalMinutes, 60), 5, 10080)) : null;

    if (!scheduled && !runNow && count > AI_MANUAL_BATCH_SIZE) {
      var queuedJobIds: string[] = [];
      var remaining = count;

      while (remaining > 0) {
        var partCount = Math.min(remaining, AI_MANUAL_BATCH_SIZE);
        var partJobId = createJobRow(
          nk,
          ctx.userId,
          'manual',
          'pending',
          categoryKey,
          sourcePackEntity ? sourcePackEntity.id : null,
          profileEntity ? profileEntity.id : null,
          partCount,
          autoPublish,
          strictMode,
          allowedTypes,
          null,
          null
        );
        if (!partJobId) throw new Error('Failed to create AI generation job');
        queuedJobIds.push(partJobId);
        remaining -= partCount;
      }

      logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'ai_generation_job_queue_batch', 'ai_generation_jobs', queuedJobIds[0], null, {
        categoryKey: categoryKey,
        requestedQuestionCount: count,
        batchSize: AI_MANUAL_BATCH_SIZE,
        batchCount: queuedJobIds.length,
        jobIds: queuedJobIds,
        sourcePackId: sourcePackEntity ? sourcePackEntity.id : null,
        profileId: profileEntity ? profileEntity.id : null,
        allowedQuestionTypes: allowedTypes,
        autoPublish: autoPublish,
        strictMode: strictMode,
      });

      return JSON.stringify({
        success: true,
        scheduled: false,
        queued: true,
        jobId: queuedJobIds[0],
        jobIds: queuedJobIds,
        batchCount: queuedJobIds.length,
        status: 'pending',
      });
    }

    var jobId = createJobRow(
      nk,
      ctx.userId,
      scheduled ? 'scheduled' : 'manual',
      scheduled ? 'scheduled' : 'pending',
      categoryKey,
      sourcePackEntity ? sourcePackEntity.id : null,
      profileEntity ? profileEntity.id : null,
      count,
      autoPublish,
      strictMode,
      allowedTypes,
      intervalMinutes,
      scheduled ? new Date().toISOString() : null
    );

    if (!jobId) throw new Error('Failed to create AI generation job');

    if (scheduled) {
      logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'ai_generation_job_schedule', 'ai_generation_jobs', jobId, null, {
        categoryKey: categoryKey,
        questionTargetCount: count,
        scheduleIntervalMinutes: intervalMinutes,
      });
      return JSON.stringify({ success: true, scheduled: true, jobId: jobId });
    }

    logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'ai_generation_job_queue', 'ai_generation_jobs', jobId, null, {
      categoryKey: categoryKey,
      questionTargetCount: count,
      sourcePackId: sourcePackEntity ? sourcePackEntity.id : null,
      profileId: profileEntity ? profileEntity.id : null,
      allowedQuestionTypes: allowedTypes,
      autoPublish: autoPublish,
      strictMode: strictMode,
    });

    if (runNow) {
      var summary = processJobSafe(ctx, logger, nk, jobId);
      logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'ai_generation_job_run', 'ai_generation_jobs', jobId, null, summary);
      return JSON.stringify(Object.assign({ success: true }, summary));
    }

    return JSON.stringify({
      success: true,
      scheduled: false,
      queued: true,
      jobId: jobId,
      status: 'pending',
    });
  } catch (error) {
    logger.error('admin_generate_ai_questions error: ' + error);
    throw error;
  }
}

export function rpcCronAiGenerationJobs(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var request = safePayload(payload);
  var limit = Math.floor(clamp(toInt(request.limit, 3), 1, 20));
  var rows = getRows(nk.sqlQuery(
    `SELECT id
     FROM ai_generation_jobs
     WHERE status = 'pending'
        OR (status = 'scheduled' AND next_run_at IS NOT NULL AND next_run_at <= NOW())
     ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, created_at ASC
     LIMIT $1`,
    [limit]
  ));

  var jobs: any[] = [];
  for (var i = 0; i < rows.length; i++) {
    jobs.push(processJobSafe(ctx, logger, nk, rows[i].id));
  }

  return JSON.stringify({ success: true, processed: jobs.length, jobs: jobs });
}

export function rpcAdminListAiGenerationJobs(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'ai_questions.view');
    var request = safePayload(payload);

    var categoryKey = String(request.categoryKey || request.category_key || '').trim();
    var status = String(request.status || '').trim();
    var limit = Math.floor(clamp(toInt(request.limit, 50), 1, 200));
    var offset = Math.max(0, toInt(request.offset, 0));

    var conditions: string[] = [];
    var args: any[] = [];
    var idx = 1;

    if (categoryKey) {
      conditions.push('j.category_key = $' + idx++);
      args.push(categoryKey);
    }
    if (status) {
      conditions.push('j.status = $' + idx++);
      args.push(status);
    }

    var whereClause = conditions.length > 0 ? (' WHERE ' + conditions.join(' AND ')) : '';
    var countRows = getRows(nk.sqlQuery('SELECT COUNT(*) as count FROM ai_generation_jobs j' + whereClause, args));
    var total = countRows.length > 0 ? toInt(countRows[0].count, 0) : 0;

    args.push(limit);
    args.push(offset);

    var query =
      `SELECT j.*, p.profile_key, s.pack_key
       FROM ai_generation_jobs j
       LEFT JOIN ai_provider_profiles p ON p.id = j.profile_id
       LEFT JOIN ai_source_packs s ON s.id = j.source_pack_id` +
      whereClause +
      ' ORDER BY j.created_at DESC LIMIT $' + idx++ + ' OFFSET $' + idx;

    var rows = getRows(nk.sqlQuery(query, args));
    var items: any[] = [];
    for (var i = 0; i < rows.length; i++) {
      items.push({
        id: rows[i].id,
        requestedBy: rows[i].requested_by,
        triggerType: rows[i].trigger_type,
        status: rows[i].status,
        categoryKey: rows[i].category_key,
        sourcePackId: rows[i].source_pack_id,
        sourcePackKey: rows[i].pack_key || null,
        profileId: rows[i].profile_id,
        profileKey: rows[i].profile_key || null,
        questionTargetCount: toInt(rows[i].question_target_count, 0),
        autoPublish: rows[i].auto_publish !== false,
        strictMode: rows[i].strict_mode !== false,
        allowedQuestionTypes: normalizeAllowedTypes(parseJson(rows[i].allowed_question_types, DEFAULT_ALLOWED_TYPES)),
        scheduleIntervalMinutes: rows[i].schedule_interval_minutes,
        nextRunAt: rows[i].next_run_at,
        lastRunAt: rows[i].last_run_at,
        startedAt: rows[i].started_at,
        finishedAt: rows[i].finished_at,
        stats: parseJson(rows[i].stats, {}),
        errorSummary: rows[i].error_summary || '',
        createdAt: rows[i].created_at,
        updatedAt: rows[i].updated_at,
      });
    }

    return JSON.stringify({ items: items, total: total, limit: limit, offset: offset });
  } catch (error) {
    logger.error('admin_list_ai_generation_jobs error: ' + error);
    throw error;
  }
}

export function rpcAdminGetAiGenerationJob(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'ai_questions.view');
    var request = safePayload(payload);
    var jobId = String(request.jobId || request.job_id || '').trim();
    if (!jobId) throw new Error('jobId is required');

    var job = jobById(nk, jobId);
    if (!job) throw new Error('Job not found');

    var candidateRows = getRows(nk.sqlQuery(
      `SELECT *
       FROM ai_generated_candidates
       WHERE job_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [jobId]
    ));

    var candidates: any[] = [];
    for (var i = 0; i < candidateRows.length; i++) {
      candidates.push(parseQuestionDataRow(candidateRows[i]));
    }

    var failureRows = getRows(nk.sqlQuery(
      `SELECT id, failure_type, message, details, created_at
       FROM ai_generation_failures
       WHERE job_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [jobId]
    ));
    var failures: any[] = [];
    for (var f = 0; f < failureRows.length; f++) {
      failures.push({ id: failureRows[f].id, failureType: failureRows[f].failure_type, message: failureRows[f].message, details: parseJson(failureRows[f].details, {}), createdAt: failureRows[f].created_at });
    }

    return JSON.stringify({ job: job, candidates: candidates, failures: failures });
  } catch (error) {
    logger.error('admin_get_ai_generation_job error: ' + error);
    throw error;
  }
}

export function rpcAdminListAiReviewQueue(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    requireAdminCapability(ctx, nk, logger, 'ai_questions.view');
    var request = safePayload(payload);
    var categoryKey = String(request.categoryKey || request.category_key || '').trim();
    var status = String(request.status || 'needs_review').trim();
    var limit = Math.floor(clamp(toInt(request.limit, 50), 1, 200));
    var offset = Math.max(0, toInt(request.offset, 0));

    var conditions: string[] = [];
    var args: any[] = [];
    var idx = 1;

    if (categoryKey) {
      conditions.push('c.category_key = $' + idx++);
      args.push(categoryKey);
    }
    if (status) {
      conditions.push('c.status = $' + idx++);
      args.push(status);
    }

    var whereClause = conditions.length > 0 ? (' WHERE ' + conditions.join(' AND ')) : '';
    var countRows = getRows(nk.sqlQuery('SELECT COUNT(*) as count FROM ai_generated_candidates c' + whereClause, args));
    var total = countRows.length > 0 ? toInt(countRows[0].count, 0) : 0;

    args.push(limit);
    args.push(offset);

    var rows = getRows(nk.sqlQuery(
      `SELECT c.*, s.pack_key, p.profile_key
       FROM ai_generated_candidates c
       LEFT JOIN ai_source_packs s ON s.id = c.source_pack_id
       LEFT JOIN ai_provider_profiles p ON p.id = c.profile_id` +
      whereClause +
      ' ORDER BY c.created_at DESC LIMIT $' + idx++ + ' OFFSET $' + idx,
      args
    ));

    var items: any[] = [];
    for (var i = 0; i < rows.length; i++) {
      var item = parseQuestionDataRow(rows[i]);
      item.sourcePackKey = rows[i].pack_key || null;
      item.profileKey = rows[i].profile_key || null;
      items.push(item);
    }

    return JSON.stringify({ items: items, total: total, limit: limit, offset: offset });
  } catch (error) {
    logger.error('admin_list_ai_review_queue error: ' + error);
    throw error;
  }
}

export function rpcAdminApproveAiQuestion(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'ai_questions.manage');
    var request = safePayload(payload);
    var candidateId = String(request.candidateId || request.candidate_id || '').trim();
    if (!candidateId) throw new Error('candidateId is required');

    var rows = getRows(nk.sqlQuery('SELECT id, source_pack_id, question_data, gate_report, status FROM ai_generated_candidates WHERE id = $1 LIMIT 1', [candidateId]));
    if (rows.length === 0) throw new Error('Candidate not found');

    var question = parseJson(rows[0].question_data, {});
    if (!question || typeof question !== 'object') throw new Error('Candidate question data is invalid');

    var questionId = publishFromCandidate(nk, logger, candidateId, rows[0].source_pack_id || null, question, parseJson(rows[0].gate_report, {}), ctx.userId);

    logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'ai_candidate_approve', 'ai_generated_candidates', candidateId, { status: rows[0].status }, { status: 'published', questionId: questionId });

    return JSON.stringify({ success: true, questionId: questionId });
  } catch (error) {
    logger.error('admin_approve_ai_question error: ' + error);
    throw error;
  }
}

export function rpcAdminRejectAiQuestion(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'ai_questions.manage');
    var request = safePayload(payload);
    var candidateId = String(request.candidateId || request.candidate_id || '').trim();
    var reason = String(request.reason || '').trim();
    if (!candidateId) throw new Error('candidateId is required');

    nk.sqlExec(
      `UPDATE ai_generated_candidates
       SET status = 'rejected',
           reviewed_by = $1,
           reviewed_at = NOW(),
           failure_reasons = CASE
             WHEN $2 = '' THEN failure_reasons
             ELSE jsonb_build_array($2)
           END,
           updated_at = NOW()
       WHERE id = $3`,
      [ctx.userId, reason, candidateId]
    );

    logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'ai_candidate_reject', 'ai_generated_candidates', candidateId, null, { reason: reason });

    return JSON.stringify({ success: true });
  } catch (error) {
    logger.error('admin_reject_ai_question error: ' + error);
    throw error;
  }
}

export function rpcAdminRetryAiQuestion(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  try {
    var admin = requireAdminCapability(ctx, nk, logger, 'ai_questions.manage');
    var request = safePayload(payload);
    var candidateId = String(request.candidateId || request.candidate_id || '').trim();
    var runNow = request.runNow === true || request.run_now === true || request.executeNow === true || request.execute_now === true;
    if (!candidateId) throw new Error('candidateId is required');

    var rows = getRows(nk.sqlQuery(
      `SELECT id, category_key, source_pack_id, profile_id, question_data
       FROM ai_generated_candidates
       WHERE id = $1
       LIMIT 1`,
      [candidateId]
    ));
    if (rows.length === 0) throw new Error('Candidate not found');

    var questionData = parseJson(rows[0].question_data, {});
    var type = String(questionData.questionType || questionData.question_type || 'mcq').toLowerCase();
    if (DEFAULT_ALLOWED_TYPES.indexOf(type) === -1) type = 'mcq';

    var jobId = createJobRow(
      nk,
      ctx.userId,
      'retry',
      'pending',
      rows[0].category_key,
      rows[0].source_pack_id || null,
      rows[0].profile_id || null,
      1,
      true,
      true,
      [type],
      null,
      null
    );

    if (!jobId) throw new Error('Failed to create retry job');

    nk.sqlExec(
      `UPDATE ai_generated_candidates
       SET status = 'invalid', reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [ctx.userId, candidateId]
    );

    if (runNow) {
      var summary = processJobSafe(ctx, logger, nk, jobId);
      logAdminAction(nk, logger, ctx.userId || '', admin.telegramId, 'ai_candidate_retry', 'ai_generated_candidates', candidateId, { status: 'needs_review' }, { status: 'invalid', retryJobId: jobId, summary: summary });
      return JSON.stringify({ success: true, retryJobId: jobId, summary: summary });
    }

    logAdminAction(
      nk,
      logger,
      ctx.userId || '',
      admin.telegramId,
      'ai_candidate_retry_queue',
      'ai_generated_candidates',
      candidateId,
      { status: 'needs_review' },
      { status: 'invalid', retryJobId: jobId, queued: true }
    );

    return JSON.stringify({ success: true, retryJobId: jobId, queued: true, status: 'pending' });
  } catch (error) {
    logger.error('admin_retry_ai_question error: ' + error);
    throw error;
  }
}
