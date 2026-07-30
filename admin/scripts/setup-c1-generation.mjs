import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@heroiclabs/nakama-js';

const ALLOWED_TYPES = ['mcq', 'true_false', 'true_false_not_given', 'heading_match'];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().length === 0 || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function parsePayload(payload) {
  if (!payload) return {};
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      return {};
    }
  }
  if (typeof payload === 'object') return payload;
  return {};
}

async function rpc(client, session, id, payload = {}) {
  const response = await client.rpc(session, id, payload);
  return parsePayload(response.payload);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeKey(input) {
  return String(input || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function buildCategoryDocument(categoryKey, categoryName) {
  const key = String(categoryKey || '').toLowerCase();

  const intro = [
    `Category: ${categoryName} (${categoryKey})`,
    'Target level: CEFR C1.',
    'Use exam-like contexts: academic writing, formal correspondence, editorial commentary, and professional communication.',
    'Questions should test subtle grammar control, not isolated memorization.',
  ];

  const core = [];
  if (key === 'grammar') {
    core.push(
      'Focus points: inversion (rarely had, only after), cleft sentences, emphasis with do-support, relative clause reduction, and article nuance.',
      'Common errors: overusing simple clause order, incorrect reference in reduced relative clauses, and article omission in abstract noun phrases.',
      'Example pair: "Only after the committee had voted was the policy revised." vs "Only after the committee had voted the policy was revised."'
    );
  } else if (key === 'tenses') {
    core.push(
      'Focus points: narrative tense sequencing, perfect aspect for prior reference, and modal perfect for deduction/regret.',
      'Common errors: mixing present perfect with finished time adverbials, and weak control of past perfect in multi-event timelines.',
      'Example pair: "By the time the data was published, several assumptions had already been challenged." vs "By the time the data was published, several assumptions were already challenged."'
    );
  } else if (key === 'conditionals') {
    core.push(
      'Focus points: mixed conditionals, implied conditions, and inverted conditionals (Had/Were/Should).',
      'Common errors: tense mismatch in mixed conditionals and over-literal "if" constructions where inversion is expected in formal style.',
      'Example pair: "Had the warning been clearer, fewer firms would now be facing penalties." vs "If the warning had been clearer, fewer firms would now face penalties."'
    );
  } else if (key === 'gerund_infinitive') {
    core.push(
      'Focus points: verb pattern meaning shifts (remember doing/to do, stop doing/to do, try doing/to do), adjective + infinitive, and noun + gerund patterns.',
      'Common errors: selecting correct form but wrong meaning in context.',
      'Example pair: "She stopped to check the calculations." vs "She stopped checking the calculations."'
    );
  } else if (key === 'prepositions') {
    core.push(
      'Focus points: dependent prepositions, prepositional collocations, and preposition choice after nominalization.',
      'Common errors: literal translation of prepositions and omission in formal noun phrases.',
      'Example pair: "The report is consistent with prior findings." vs "The report is consistent to prior findings."'
    );
  } else if (key === 'comparisons') {
    core.push(
      'Focus points: comparative clauses, proportional comparisons, double comparatives, and modifiers (far, by far, slightly).',
      'Common errors: incorrect parallelism and ambiguous comparative reference.',
      'Example pair: "The proposal is far more feasible than was initially assumed." vs "The proposal is more far feasible than initially assumed."'
    );
  } else if (key === 'adjectives') {
    core.push(
      'Focus points: adjective order, gradability, stance adverbs, and adjective vs adverb choice in formal register.',
      'Common errors: confusing near-synonyms that change tone or degree.',
      'Example pair: "The findings are highly significant." vs "The findings are high significant."'
    );
  } else if (key === 'vocabulary') {
    core.push(
      'Focus points: lexical grammar, collocation, register-sensitive synonyms, and fixed expressions used in advanced argumentation.',
      'Common errors: semantically close but collocationally invalid choices.',
      'Example pair: "The policy is likely to yield substantial gains." vs "The policy is likely to win substantial gains."'
    );
  } else {
    core.push(
      'Focus points: advanced grammar accuracy in context, register control, and subtle meaning distinctions.',
      'Common errors: literal translation, weak collocation, and incorrect clause linkage.'
    );
  }

  const constraints = [
    'Authoring constraints for generated questions:',
    '1. Use mostly medium/hard difficulty with C1-level sentence complexity.',
    '2. Distractors must be plausible and grammar-focused.',
    '3. Explanations must teach the exact rule and why distractors fail.',
    '4. Keep statements fact-checkable from source text so citation quotes are possible.',
    '5. For True/False/Not Given, use "Not Given" only when information is absent rather than contradicted.',
  ];

  return [...intro, ...core, ...constraints].join('\n');
}

async function main() {
  const adminDir = process.cwd();
  const rootDir = path.resolve(adminDir, '..');
  loadEnvFile(path.join(rootDir, '.env'));

  const key = process.env.VITE_NAKAMA_KEY || 'dev_server_key_change_me';
  const host = process.env.VITE_NAKAMA_HOST || 'localhost';
  const port = process.env.VITE_NAKAMA_PORT || '7350';
  const ssl = (process.env.VITE_NAKAMA_SSL || 'false') === 'true';
  const telegramId = Number((process.env.ADMIN_TELEGRAM_IDS || '').split(',')[0] || '0');
  const adminToken = process.env.ADMIN_LOGIN_TOKEN || '';

  if (!telegramId || !adminToken) {
    throw new Error('Missing ADMIN_TELEGRAM_IDS or ADMIN_LOGIN_TOKEN in root .env');
  }

  const client = new Client(key, host, port, ssl);
  const session = await client.authenticateCustom(`admin_token_${telegramId}`, true, undefined, { adminToken });
  const verify = await rpc(client, session, 'admin_verify_session', {});
  if (!verify?.valid) throw new Error('Admin verification failed');

  const categoryResponse = await rpc(client, session, 'admin_list_categories', {});
  const categories = Array.isArray(categoryResponse.categories) ? categoryResponse.categories : [];
  if (categories.length === 0) throw new Error('No categories found');

  let settingsResponse = await rpc(client, session, 'admin_get_ai_settings', {});
  const profiles = Array.isArray(settingsResponse.profiles) ? settingsResponse.profiles : [];
  const activeProfiles = profiles.filter((p) => p && p.isActive);
  if (activeProfiles.length === 0) throw new Error('No active AI profile found');
  const selectedProfile = activeProfiles.find((p) => p.isDefault) || activeProfiles[0];

  const baseSettings = settingsResponse.settings || {};
  await rpc(client, session, 'admin_update_ai_settings', {
    settings: {
      ...baseSettings,
      enabled: true,
      killSwitch: false,
      autoPublish: false,
      strictMode: true,
      requireCitation: true,
      allowedQuestionTypes: ALLOWED_TYPES,
      defaultProfileKey: selectedProfile.profileKey || baseSettings.defaultProfileKey,
    },
  });

  settingsResponse = await rpc(client, session, 'admin_get_ai_settings', {});
  let sourcePacks = Array.isArray(settingsResponse.sourcePacks) ? settingsResponse.sourcePacks : [];
  const sourcePackByCategory = new Map();

  for (const pack of sourcePacks) {
    if (!pack || !pack.isActive) continue;
    const categoryKey = String(pack.categoryKey || '');
    if (!sourcePackByCategory.has(categoryKey)) sourcePackByCategory.set(categoryKey, pack);
  }

  const createdPacks = [];
  for (const category of categories) {
    const categoryKey = String(category.categoryKey || '').trim();
    if (!categoryKey) continue;

    let pack = sourcePackByCategory.get(categoryKey) || null;
    if (!pack) {
      const packKey = `c1_${normalizeKey(categoryKey)}_core`;
      const packName = `C1 ${category.name || categoryKey} Core`;
      const content = buildCategoryDocument(categoryKey, String(category.name || categoryKey));

      const created = await rpc(client, session, 'admin_create_ai_source_pack', {
        pack: {
          categoryKey,
          name: packName,
          packKey,
          language: 'en',
          description: `Auto-generated C1 guidance source pack for ${category.name || categoryKey}`,
          documents: [
            {
              title: `${category.name || categoryKey} C1 Guidance`,
              content,
              metadata: {
                source: 'internal_c1_playbook',
                level: 'C1',
              },
            },
          ],
        },
      });

      createdPacks.push({ categoryKey, sourcePackId: created.sourcePackId, name: packName });
    }
  }

  if (createdPacks.length > 0) {
    settingsResponse = await rpc(client, session, 'admin_get_ai_settings', {});
    sourcePacks = Array.isArray(settingsResponse.sourcePacks) ? settingsResponse.sourcePacks : [];
    sourcePackByCategory.clear();
    for (const pack of sourcePacks) {
      if (!pack || !pack.isActive) continue;
      const categoryKey = String(pack.categoryKey || '');
      if (!sourcePackByCategory.has(categoryKey)) sourcePackByCategory.set(categoryKey, pack);
    }
  }

  const overrideResults = [];
  for (const category of categories) {
    const categoryKey = String(category.categoryKey || '').trim();
    if (!categoryKey) continue;

    const pack = sourcePackByCategory.get(categoryKey);
    if (!pack?.id) {
      overrideResults.push({ categoryKey, status: 'skipped_no_source_pack' });
      continue;
    }

    await rpc(client, session, 'admin_upsert_ai_category_override', {
      categoryKey,
      isEnabled: true,
      profileId: selectedProfile.id,
      sourcePackId: pack.id,
      overrideConfig: {
        autoPublish: false,
        strictMode: true,
        requireCitation: true,
        similarityThreshold: 0.92,
        allowedQuestionTypes: ALLOWED_TYPES,
      },
      budgets: {},
    });

    overrideResults.push({ categoryKey, status: 'ok', sourcePackId: pack.id, profileId: selectedProfile.id });
  }

  const smokeCategory = categories[0]?.categoryKey;
  let smoke = null;
  if (smokeCategory) {
    const smokeRequest = await rpc(client, session, 'admin_generate_ai_questions', {
      categoryKey: smokeCategory,
      count: 6,
      autoPublish: false,
      strictMode: true,
      allowedQuestionTypes: ALLOWED_TYPES,
      scheduled: false,
    });

    if (smokeRequest?.jobId) {
      let final = null;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const jobDetails = await rpc(client, session, 'admin_get_ai_generation_job', { jobId: smokeRequest.jobId });
        const status = String(jobDetails?.job?.status || '').toLowerCase();
        final = jobDetails?.job || null;
        if (status === 'completed' || status === 'failed' || status === 'cancelled') break;
        await sleep(5000);
      }
      smoke = { request: smokeRequest, finalJob: final };
    } else {
      smoke = smokeRequest;
    }
  }

  console.log(JSON.stringify({
    verifiedAdmin: verify.adminInfo || null,
    selectedProfile: {
      id: selectedProfile.id,
      profileKey: selectedProfile.profileKey,
    },
    categories: categories.map((c) => c.categoryKey),
    createdPacks,
    overridesConfigured: overrideResults,
    smokeTest: smoke,
  }, null, 2));
}

main().catch((error) => {
  console.error('setup-c1-generation failed:', error);
  process.exit(1);
});
