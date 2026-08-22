// GLICKO-2 RATING SYSTEM
// ============================================================================

// Glicko-2 constants
export var GLICKO2_TAU = 0.5; // System constant (controls volatility change)
export var GLICKO2_EPSILON = 0.000001; // Convergence tolerance
export var GLICKO2_SCALE = 173.7178; // Scale factor (400/ln(10))

// Convert from display rating to Glicko-2 scale
export function toGlicko2Scale(rating: number): number {
  return (rating - 1500) / GLICKO2_SCALE;
}

// Convert from Glicko-2 scale to display rating
export function fromGlicko2Scale(mu: number): number {
  return mu * GLICKO2_SCALE + 1500;
}

// Convert RD to Glicko-2 scale
export function rdToGlicko2(rd: number): number {
  return rd / GLICKO2_SCALE;
}

// Convert RD from Glicko-2 scale
export function rdFromGlicko2(phi: number): number {
  return phi * GLICKO2_SCALE;
}

// Calculate g(φ) function
export function g(phi: number): number {
  return 1 / Math.sqrt(1 + 3 * phi * phi / (Math.PI * Math.PI));
}

// Calculate E(μ, μj, φj) - expected score
export function expectedScore(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

// Calculate new volatility using iterative algorithm
export function calculateNewVolatility(
  phi: number,
  v: number,
  delta: number,
  sigma: number
): number {
  var a = Math.log(sigma * sigma);
  var deltaSq = delta * delta;
  var phiSq = phi * phi;

  // Function f(x)
  function f(x: number): number {
    var expX = Math.exp(x);
    var num1 = expX * (deltaSq - phiSq - v - expX);
    var denom1 = 2 * Math.pow(phiSq + v + expX, 2);
    var num2 = x - a;
    var denom2 = GLICKO2_TAU * GLICKO2_TAU;
    return num1 / denom1 - num2 / denom2;
  }

  // Initial bounds for iteration
  var A = a;
  var B: number;

  if (deltaSq > phiSq + v) {
    B = Math.log(deltaSq - phiSq - v);
  } else {
    var k = 1;
    // Safety limit to prevent infinite loop in edge cases
    var maxIterations = 100;
    while (f(a - k * GLICKO2_TAU) < 0 && k < maxIterations) {
      k++;
    }
    B = a - k * GLICKO2_TAU;
  }

  // Iterative algorithm
  var fA = f(A);
  var fB = f(B);

  // Safety limit to prevent infinite loop in convergence
  var maxIterations = 100;
  var iterations = 0;
  while (Math.abs(B - A) > GLICKO2_EPSILON && iterations < maxIterations) {
    var C = A + (A - B) * fA / (fB - fA);
    var fC = f(C);

    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }

    B = C;
    fB = fC;
    iterations++;
  }

  return Math.exp(A / 2);
}

// Main Glicko-2 calculation
export interface Glicko2Rating {
  rating: number;
  rd: number;
  volatility: number;
}

export interface Glicko2Result {
  newRating: Glicko2Rating;
  ratingChange: number;
}

export function calculateGlicko2(
  player: Glicko2Rating,
  opponent: Glicko2Rating,
  score: number, // 1 = win, 0.5 = draw, 0 = loss
  logger: nkruntime.Logger,
  mmrFloor?: number,
  mmrCeiling?: number
): Glicko2Result {
  // Convert to Glicko-2 scale
  var mu = toGlicko2Scale(player.rating);
  var phi = rdToGlicko2(player.rd);
  var sigma = player.volatility;

  var muJ = toGlicko2Scale(opponent.rating);
  var phiJ = rdToGlicko2(opponent.rd);

  // Step 3: Compute variance v
  var gPhiJ = g(phiJ);
  var E = expectedScore(mu, muJ, phiJ);

  if (!isFinite(E) || !isFinite(gPhiJ)) {
    logger.warn('Glicko-2 invalid inputs for rating calculation');
    return {
      newRating: {
        rating: player.rating,
        rd: player.rd,
        volatility: player.volatility,
      },
      ratingChange: 0,
    };
  }

  var clampedE = Math.min(1 - GLICKO2_EPSILON, Math.max(GLICKO2_EPSILON, E));
  var safeGPhiJ = Math.max(GLICKO2_EPSILON, gPhiJ);
  var v = 1 / (safeGPhiJ * safeGPhiJ * clampedE * (1 - clampedE));

  if (!isFinite(v)) {
    logger.warn('Glicko-2 variance calculation failed');
    return {
      newRating: {
        rating: player.rating,
        rd: player.rd,
        volatility: player.volatility,
      },
      ratingChange: 0,
    };
  }

  // Step 4: Compute delta (estimated improvement)
  var delta = v * gPhiJ * (score - E);

  // Step 5: Compute new volatility
  var sigmaNew = calculateNewVolatility(phi, v, delta, sigma);

  // Step 6: Update phi to new pre-rating period value
  var phiStar = Math.sqrt(phi * phi + sigmaNew * sigmaNew);

  // Step 7: Update rating and RD
  var phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  var muNew = mu + phiNew * phiNew * gPhiJ * (score - E);

  // Convert back to display scale
  var newRating = Math.round(fromGlicko2Scale(muNew));
  var newRd = Math.round(rdFromGlicko2(phiNew));

  // Clamp values to reasonable ranges
  var minRating = typeof mmrFloor === 'number' ? mmrFloor : 100;
  var maxRating = typeof mmrCeiling === 'number' ? mmrCeiling : 10000;
  if (maxRating < minRating) {
    maxRating = minRating;
  }
  newRating = Math.max(minRating, Math.min(maxRating, newRating));
  newRd = Math.max(30, Math.min(350, newRd));

  var ratingChange = newRating - player.rating;

  logger.info('Glicko-2 calculation: ' + player.rating + ' -> ' + newRating +
    ' (change: ' + ratingChange + ', score: ' + score + ')');

  return {
    newRating: {
      rating: newRating,
      rd: newRd,
      volatility: sigmaNew,
    },
    ratingChange: ratingChange,
  };
}

