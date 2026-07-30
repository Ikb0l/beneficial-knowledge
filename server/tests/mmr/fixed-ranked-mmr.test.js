const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateFixedMmrRating } = require('../../build/main/mmr.js');

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

test('calculateFixedMmrRating awards +30 to winner and preserves rd/volatility', () => {
  const player = {
    rating: 1200,
    rd: 45,
    volatility: 0.05,
  };

  const result = calculateFixedMmrRating(player, 1, createLogger());

  assert.equal(result.newRating.rating, 1230);
  assert.equal(result.ratingChange, 30);
  assert.equal(result.newRating.rd, 45);
  assert.equal(result.newRating.volatility, 0.05);
});

test('calculateFixedMmrRating deducts -30 from loser', () => {
  const player = {
    rating: 1200,
    rd: 55,
    volatility: 0.04,
  };

  const result = calculateFixedMmrRating(player, 0, createLogger());

  assert.equal(result.newRating.rating, 1170);
  assert.equal(result.ratingChange, -30);
});

test('calculateFixedMmrRating gives 0 change on draw', () => {
  const player = {
    rating: 1200,
    rd: 60,
    volatility: 0.03,
  };

  const result = calculateFixedMmrRating(player, 0.5, createLogger());

  assert.equal(result.newRating.rating, 1200);
  assert.equal(result.ratingChange, 0);
});

test('calculateFixedMmrRating clamps losses at floor', () => {
  const player = {
    rating: 105,
    rd: 50,
    volatility: 0.06,
  };

  const result = calculateFixedMmrRating(player, 0, createLogger(), 30, 100, 10000);

  assert.equal(result.newRating.rating, 100);
  assert.equal(result.ratingChange, -5);
});

test('calculateFixedMmrRating clamps gains at ceiling', () => {
  const player = {
    rating: 9990,
    rd: 50,
    volatility: 0.06,
  };

  const result = calculateFixedMmrRating(player, 1, createLogger(), 30, 100, 10000);

  assert.equal(result.newRating.rating, 10000);
  assert.equal(result.ratingChange, 10);
});
