// Seed questions into the database
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const CATEGORIES = [];

async function seedQuestions() {
  const client = new Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'nakama',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'localdb',
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Clear existing questions (optional - comment out to append)
    await client.query('DELETE FROM questions');
    console.log('Cleared existing questions');

    let totalInserted = 0;

    for (const category of CATEGORIES) {
      const filePath = path.join(__dirname, '..', 'data', 'questions', `${category}.json`);

      if (!fs.existsSync(filePath)) {
        console.warn(`Warning: No question file found for category: ${category}`);
        continue;
      }

      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const questions = data.questions;

      console.log(`Loading ${questions.length} questions for category: ${category}`);

      for (const q of questions) {
        const questionType = (q.question_type || q.questionType || 'mcq');
        await client.query(
          `INSERT INTO questions
           (category, difficulty, question_text, options, correct_index, explanation, source_reference, question_type, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            category,
            q.difficulty,
            q.question_text,
            JSON.stringify(q.options),
            q.correct_index,
            q.explanation || null,
            q.source_reference || null,
            questionType,
            true
          ]
        );
        totalInserted++;
      }

      console.log(`  ✓ Inserted ${questions.length} questions for ${category}`);
    }

    // Print summary
    const result = await client.query(`
      SELECT category, difficulty, COUNT(*) as count
      FROM questions
      GROUP BY category, difficulty
      ORDER BY category, difficulty
    `);

    console.log('\n=== Question Summary ===');
    let currentCategory = '';
    for (const row of result.rows) {
      if (row.category !== currentCategory) {
        currentCategory = row.category;
        console.log(`\n${currentCategory}:`);
      }
      console.log(`  ${row.difficulty}: ${row.count} questions`);
    }

    console.log(`\n✓ Total questions inserted: ${totalInserted}`);

  } catch (error) {
    console.error('Error seeding questions:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seedQuestions();
