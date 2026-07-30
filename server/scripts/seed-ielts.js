#!/usr/bin/env node
/**
 * Seed IELTS questions into the database.
 * Reads all ielts-*.json files from server/seeds/ and inserts them.
 *
 * Usage: node scripts/seed-ielts.js
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const SEEDS_DIR = path.join(__dirname, '..', 'seeds');

async function seedIeltsQuestions() {
  const client = new Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'nakama',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'localdb',
  });

  try {
    await client.connect();
    console.log('Connected to database\n');

    // Find all IELTS seed files
    const files = fs.readdirSync(SEEDS_DIR)
      .filter(f => f.startsWith('ielts-') && f.endsWith('.json'))
      .sort();

    if (files.length === 0) {
      console.log('No IELTS seed files found in', SEEDS_DIR);
      console.log('Run: node ../../scripts/import-ielts-pack.mjs --all');
      return;
    }

    console.log(`Found ${files.length} IELTS seed files\n`);

    // Delete existing IELTS questions (by category) to avoid duplicates
    const ieltsCategories = ['ielts_tfng', 'ielts_ynng', 'ielts_mcq', 'ielts_headings'];
    for (const cat of ieltsCategories) {
      await client.query('DELETE FROM questions WHERE category = $1', [cat]);
    }
    console.log('Cleared existing IELTS questions\n');

    let totalInserted = 0;
    const stats = {};

    for (const file of files) {
      const filePath = path.join(SEEDS_DIR, file);
      const questions = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      if (!Array.isArray(questions) || questions.length === 0) {
        console.log(`  ⏭  ${file}: empty`);
        continue;
      }

      // Determine category from question type
      const qtype = questions[0].question_type;
      const category = qtype === 'true_false_not_given'
        ? (questions[0].metadata?.variant === 'yes_no_not_given' ? 'ielts_ynng' : 'ielts_tfng')
        : qtype === 'mcq' ? 'ielts_mcq'
        : qtype === 'heading_match' ? 'ielts_headings'
        : null;

      if (!category) {
        console.log(`  ⚠  ${file}: unknown type ${qtype}`);
        continue;
      }

      let inserted = 0;
      for (const q of questions) {
        await client.query(
          `INSERT INTO questions
           (category, difficulty, question_text, options, correct_index, explanation, source_reference, question_type, passage_text, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            category,
            q.difficulty || 'medium',
            q.question_text,
            JSON.stringify(q.options),
            q.correct_index,
            q.explanation || '',
            q.source_reference || '',
            q.question_type,
            q.passage_text || '',
            true,
          ]
        );
        inserted++;
      }

      totalInserted += inserted;
      if (!stats[category]) stats[category] = 0;
      stats[category] += inserted;
      console.log(`  ✅ ${file}: ${inserted} questions → ${category}`);
    }

    // Summary
    console.log('\n=== IELTS Questions Summary ===');
    for (const [cat, count] of Object.entries(stats)) {
      const result = await client.query(
        'SELECT difficulty, COUNT(*) as count FROM questions WHERE category = $1 GROUP BY difficulty ORDER BY difficulty',
        [cat]
      );
      console.log(`\n${cat}: ${count} questions`);
      for (const row of result.rows) {
        console.log(`  ${row.difficulty}: ${row.count}`);
      }
    }

    console.log(`\n✅ Total IELTS questions inserted: ${totalInserted}`);

  } catch (error) {
    console.error('Error seeding IELTS questions:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seedIeltsQuestions();
