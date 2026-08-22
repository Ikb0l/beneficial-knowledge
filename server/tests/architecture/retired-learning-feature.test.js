const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '../../..');
const runtimeRoots = [
  'client/src',
  'server/src',
  'server/scripts',
  'server/data',
  'admin/src',
];

const retiredRuntimePatterns = [
  /flashcards?/i,
  /vocab_import/i,
  /vocabulary_imports/i,
  /vocabulary-admin/i,
  /vocabulary-fsrs/i,
];

function listFiles(relativeRoot) {
  const absoluteRoot = path.join(repositoryRoot, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];

  return fs.readdirSync(absoluteRoot, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeRoot, entry.name);
    return entry.isDirectory() ? listFiles(relativePath) : [relativePath];
  });
}

test('retired learning feature has no runtime files or references', () => {
  const violations = runtimeRoots
    .flatMap(listFiles)
    .flatMap((relativePath) => {
      const contents = fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
      return retiredRuntimePatterns
        .filter((pattern) => pattern.test(relativePath) || pattern.test(contents))
        .map((pattern) => `${relativePath}: ${pattern}`);
    });

  assert.deepEqual(violations, [], `Retired runtime references found:\n${violations.join('\n')}`);
});
