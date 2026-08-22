/**
 * IELTS Test Pack → QuizUp Questions Seed Importer
 *
 * Reads IELTS test pack JSON, filters to click-only question types,
 * and generates QuizUp-compatible seed JSON files.
 *
 * Usage:
 *   node scripts/import-ielts-pack.mjs <path-to-test.json>
 *   node scripts/import-ielts-pack.mjs <path-to-folder-with-test.json>
 *   node scripts/import-ielts-pack.mjs --all
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

const PROJECT_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname), '..'
);
const SEEDS_DIR = path.join(PROJECT_ROOT, 'server', 'seeds');

// Path to exported test packs (Windows path, accessible from WSL)
const IELTS_PACKS_DIR = '/mnt/c/Users/IKBOLJ0N/Desktop/Needed Ones/IELTS CD/IELTS CD/exported-test-packs';

// ─── Configuration ───────────────────────────────────────────────────

/**
 * Question types we support in QuizUp.
 * ONLY types with perfect, production-ready game UI.
 * Everything else is skipped — no half-working features.
 */
const TYPE_MAP = {
  true_false_not_given:    { qtype: 'true_false_not_given', fixedOptions: ['True', 'False', 'Not Given'] },
  yes_no_not_given:        { qtype: 'true_false_not_given', fixedOptions: ['Yes', 'No', 'Not Given'], variant: 'yes_no_not_given' },
  multiple_choice:         { qtype: 'mcq' },
  matching_headings:       { qtype: 'heading_match' },
};

/** Types we skip — require typing, audio, complex interaction, or don't have perfect UI yet */
const SKIP = new Set([
  'summary_completion', 'sentence_completion', 'note_completion',
  'table_completion', 'flow_chart_completion', 'diagram_labeling',
  'form_completion', 'map_labelling', 'short_answer', 'fill_in_blank',
  'multiple_choice_multiple', 'matching', 'matching_sentence_endings',
  'matching_features', 'matching_information',
  'essay_task1', 'essay_task2',
  'speaking_part1', 'speaking_part2', 'speaking_part3',
]);

// ─── Passage excerpt ─────────────────────────────────────────────────

function extractExcerpt(fullText, questionText, count = 4) {
  if (!fullText) return '';
  const sentences = fullText
    .replace(/([.!?])\s+/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  if (sentences.length <= count) return fullText.trim();

  // Keyword scoring for relevance
  const keywords = (questionText || '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
    .filter(w => w.length > 3);

  if (!keywords.length) return sentences.slice(0, count).join(' ');

  let bestIdx = 0, bestScore = 0;
  sentences.forEach((s, i) => {
    const lower = s.toLowerCase();
    let score = 0;
    for (const w of keywords) { if (lower.includes(w)) score++; }
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  });

  const start = Math.max(0, bestIdx - 1);
  return sentences.slice(start, start + count).join(' ');
}

// ─── Helpers ─────────────────────────────────────────────────────────

function slug(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

function diffLabel(n) {
  if (!n || n < 1) return 'medium';
  if (n <= 3) return 'easy';
  if (n <= 6) return 'medium';
  return 'hard';
}

function norm(s) {
  return String(s || '').trim().toUpperCase().replace(/[\s_]+/g, '_');
}

function findCorrectIdx(options, correctAnswers, optionIds) {
  if (!correctAnswers || !correctAnswers.length) return 0;
  const target = norm(correctAnswers[0]);

  // If option IDs provided (A, B, C...), match by ID first
  if (optionIds && optionIds.length === options.length) {
    const targetUpper = String(correctAnswers[0]).trim().toUpperCase();
    for (let i = 0; i < optionIds.length; i++) {
      if (optionIds[i] === targetUpper) return i;
    }
  }

  // Match by normalized text
  for (let i = 0; i < options.length; i++) {
    if (norm(options[i]) === target) return i;
  }
  // Fuzzy: substring match
  for (let i = 0; i < options.length; i++) {
    const opt = norm(options[i]);
    if (opt.includes(target) || target.includes(opt)) return i;
  }
  return 0;
}

function extractQuestionText(q) {
  // Some IELTS questions have the statement in 'question', others in 'statement'
  const text = (q.question || q.statement || '').trim();
  // Skip meta-questions like "Questions 1-6"
  if (/^Questions?\s+\d+[-–]\d+$/i.test(text)) return null;
  if (!text) return null;
  return text;
}

// ─── Main import ─────────────────────────────────────────────────────

function importPack(inputPath) {
  const raw = fs.readFileSync(inputPath, 'utf-8');
  const pack = JSON.parse(raw);
  const name = pack.template?.name || path.basename(inputPath, '.json');
  const examType = pack.template?.type || 'academic';

  const byCategory = {};
  let imported = 0, skipped = 0;

  for (const section of (pack.sections || [])) {
    if (section.type !== 'reading') {
      skipped += (section.questions || []).length;
      continue;
    }

    // Build passage map
    const passages = section.metadata?.reading?.passages || [];
    const passageMap = {};
    for (const p of passages) passageMap[p.passageNumber] = p.text || '';

    for (const q of (section.questions || [])) {
      const ieltsType = q.type;

      if (SKIP.has(ieltsType)) { skipped++; continue; }

      const mapping = TYPE_MAP[ieltsType];
      if (!mapping) { skipped++; continue; }

      // ── Special handling: matching_headings groups ──────────
      // These are group questions with items (paragraphs) and matchOptions (headings)
      if (ieltsType === 'matching_headings') {
        const matchOptions = (q.metadata?.matchOptions) || (q.options) || [];
        const items = q.metadata?.items || [];
        const answerKey = q.metadata?.answerKey || {};
        const pNum = q.metadata?.placement?.passageNumber;
        const fullPassage = pNum ? (passageMap[pNum] || '') : '';
        const instruction = q.metadata?.instruction || q.question || '';

        if (!matchOptions.length || !items.length) { skipped++; continue; }

        // Map all heading options — use text only (QuizUp adds its own A/B/C/D badges)
        const allHeadings = matchOptions.map(o => {
          const label = o.label || o.id || '';
          const text = o.text || '';
          return { label, text, full: text };
        });

        if (allHeadings.length < 2) { skipped++; continue; }

        for (const item of items) {
          const itemId = item.id || '';
          const itemText = item.text || item.statement || '';
          if (!itemText) continue;

          const correctAnswer = answerKey[itemId];
          const correctLabel = correctAnswer ? correctAnswer[0] : null;
          const correctHeading = correctLabel
            ? allHeadings.find(h => h.label === correctLabel)
            : null;

          // Randomly pick 4-5 headings including the correct one
          // IELTS lists have 7-11 headings — too many for QuizUp. Pick 4.
          const numOptions = Math.min(4, allHeadings.length);
          const otherHeadings = correctHeading
            ? allHeadings.filter(h => h.label !== correctLabel)
            : [...allHeadings];

          // Shuffle others and pick (numOptions - 1)
          const shuffled = [...otherHeadings].sort(() => Math.random() - 0.5);
          const distractors = shuffled.slice(0, numOptions - 1);

          // Combine correct + distractors, then shuffle
          let selectedHeadings = correctHeading
            ? [correctHeading, ...distractors]
            : distractors.slice(0, numOptions);
          selectedHeadings = selectedHeadings.sort(() => Math.random() - 0.5);

          const options = selectedHeadings.map(h => h.full);
          const correctIdx = correctHeading
            ? selectedHeadings.findIndex(h => h.label === correctLabel)
            : 0;

          if (options.length < 2) { skipped++; continue; }

          const excerpt = fullPassage ? extractExcerpt(fullPassage, itemText, 5) : '';

          const questionText = `Choose the correct heading for: ${itemText}`;

          const category = `ielts_${mapping.qtype}`;
          const quizQ = {
            question_text: questionText,
            options: options,
            correct_index: correctIdx >= 0 ? correctIdx : 0,
            question_type: mapping.qtype,
            difficulty: diffLabel(pack.template?.difficulty),
            explanation: instruction || `The correct heading is ${correctLabel}.`,
            source_reference: name,
            passage_text: excerpt,
            metadata: {
              ielts_type: ieltsType,
              variant: null,
              exam_type: examType,
              passage_num: pNum,
              correct_answers: correctLabel ? [correctLabel] : [],
              source_pack: name,
              item_text: itemText,
            },
          };

          if (!byCategory[category]) byCategory[category] = [];
          byCategory[category].push(quizQ);
          imported++;
        }
        continue;
      }

      // ── Normal handling: individual questions ──────────────
      const text = extractQuestionText(q);
      if (!text) { skipped++; continue; }

      // Determine options and map option IDs for correct answer lookup
      let options;
      let optionIds = null; // letter IDs from test pack (A, B, C, D...)
      if (mapping.fixedOptions) {
        options = mapping.fixedOptions;
      } else if (q.options?.length) {
        options = q.options.map(o => o.text || o.label || '');
        // Store option letter IDs for matching correct answers like ['B']
        if (q.options[0].id) {
          optionIds = q.options.map(o => String(o.id || '').trim().toUpperCase());
        }
      } else {
        skipped++; continue;
      }

      if (options.length < 2 || options.length > 6) { skipped++; continue; }

      const correctAnswers = q.correctAnswers || [];
      const correctIdx = findCorrectIdx(options, correctAnswers, optionIds);
      const pNum = q.metadata?.placement?.passageNumber;
      const fullPassage = pNum ? (passageMap[pNum] || '') : '';
      const excerpt = fullPassage ? extractExcerpt(fullPassage, text) : '';

      const category = `ielts_${mapping.qtype}`;

      const quizQ = {
        question_text: text,
        options,
        correct_index: correctIdx,
        question_type: mapping.qtype,
        difficulty: diffLabel(pack.template?.difficulty),
        explanation: q.explanation || '',
        source_reference: name,
        passage_text: excerpt,
        metadata: {
          ielts_type: ieltsType,
          variant: mapping.variant || null,
          exam_type: examType,
          passage_num: pNum,
          correct_answers: correctAnswers,
          source_pack: name,
        },
      };

      if (!byCategory[category]) byCategory[category] = [];
      byCategory[category].push(quizQ);
      imported++;
    }
  }

  // Write seed files
  const written = [];
  for (const [category, questions] of Object.entries(byCategory)) {
    const fname = `ielts-${slug(name)}-${category}.json`;
    const fpath = path.join(SEEDS_DIR, fname);
    fs.mkdirSync(path.dirname(fpath), { recursive: true });
    fs.writeFileSync(fpath, JSON.stringify(questions, null, 2));
    written.push({ category, count: questions.length, path: fpath });
  }

  return { name, imported, skipped, written };
}

// ─── CLI ─────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║   IELTS Test Pack → QuizUp Seed Importer                ║
╠══════════════════════════════════════════════════════════╣
║  Usage:                                                 ║
║    node scripts/import-ielts-pack.mjs <test.json>       ║
║    node scripts/import-ielts-pack.mjs <folder/>         ║
║    node scripts/import-ielts-pack.mjs --all             ║
╠══════════════════════════════════════════════════════════╣
║  Supported (click-only, fully tested):                  ║
║    ✅ true_false_not_given  → True / False / Not Given  ║
║    ✅ yes_no_not_given      → Yes / No / Not Given      ║
║    ✅ multiple_choice       → A / B / C / D             ║
║    ✅ matching_headings     → Match heading to paragraph║
╠══════════════════════════════════════════════════════════╣
║  Skipped (need typing/audio or complex UI):             ║
║    ❌ summary/sentence/note/table/flow completion       ║
║    ❌ diagram/map/form labeling                         ║
║    ❌ fill_in_blank, short_answer                       ║
║    ❌ multiple_choice_mult, matching_features/info      ║
║    ❌ essay_task1/2, speaking_part1/2/3                 ║
╚══════════════════════════════════════════════════════════╝
`);
    return;
  }

  // --all mode
  if (args[0] === '--all') {
    if (!fs.existsSync(IELTS_PACKS_DIR)) {
      console.error('Packs directory not found:', IELTS_PACKS_DIR);
      process.exit(1);
    }
    const zips = fs.readdirSync(IELTS_PACKS_DIR).filter(f => f.endsWith('.zip'));
    console.log(`Processing ${zips.length} packs...\n`);

    let grandTotal = 0;
    for (const zip of zips) {
      const result = processZip(path.join(IELTS_PACKS_DIR, zip));
      if (result) grandTotal += result.imported;
    }
    console.log(`\n🏁 Grand total: ${grandTotal} questions imported`);
    return;
  }

  // Single input
  const input = path.resolve(args[0]);
  if (!fs.existsSync(input)) {
    console.error('Not found:', input);
    process.exit(1);
  }

  const stat = fs.statSync(input);
  if (stat.isDirectory()) {
    const tj = path.join(input, 'test.json');
    if (fs.existsSync(tj)) printResult(importPack(tj));
    else { console.error('No test.json in folder'); process.exit(1); }
  } else if (input.endsWith('.zip')) {
    processZip(input);
  } else {
    printResult(importPack(input));
  }
}

function processZip(zipPath) {
  const tmp = path.join(os.tmpdir(), 'ielts-import-' + Date.now());
  try {
    execSync(`unzip -o "${zipPath}" -d "${tmp}"`, { stdio: 'pipe' });
    const tj = findFile(tmp, 'test.json');
    if (tj) {
      const result = importPack(tj);
      printResult(result);
      return result;
    }
    console.error('No test.json in zip:', zipPath);
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
  return null;
}

function findFile(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isFile() && e.name === name) return full;
    if (e.isDirectory()) { const f = findFile(full, name); if (f) return f; }
  }
  return null;
}

function printResult(r) {
  console.log(`\n📦 ${r.name}`);
  console.log(`   ✅ Imported: ${r.imported}  ⏭ Skipped: ${r.skipped}`);
  for (const w of r.written) {
    console.log(`   📁 ${w.category}: ${w.count} questions`);
  }
}

main();
