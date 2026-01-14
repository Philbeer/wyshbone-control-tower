/**
 * WABS Scorer - "What's Actually Been Said" Interestingness Scoring
 *
 * Scores results 0-100 for "interestingness" based on user goals and preferences.
 * Considers: relevance, novelty, actionability, urgency.
 */

/**
 * Score a result for interestingness
 *
 * @param {Object} result - Task result to score
 * @param {Object} userContext - User goals and preferences
 * @param {Object} options - Scoring options
 * @returns {Object} { score: 0-100, explanation: string, signals: Object }
 */
export function scoreInterestingness(result, userContext = {}, options = {}) {
  const signals = {
    relevance: 0,
    novelty: 0,
    actionability: 0,
    urgency: 0
  };

  const weights = {
    relevance: options.relevanceWeight || 0.35,
    novelty: options.noveltyWeight || 0.25,
    actionability: options.actionabilityWeight || 0.25,
    urgency: options.urgencyWeight || 0.15
  };

  const explanations = [];

  // ========== RELEVANCE SCORE (0-100) ==========
  signals.relevance = scoreRelevance(result, userContext);

  if (signals.relevance > 70) {
    explanations.push(`High relevance to user goals (${signals.relevance}/100)`);
  } else if (signals.relevance > 40) {
    explanations.push(`Moderate relevance (${signals.relevance}/100)`);
  }

  // ========== NOVELTY SCORE (0-100) ==========
  signals.novelty = scoreNovelty(result, userContext);

  if (signals.novelty > 70) {
    explanations.push(`Novel finding (${signals.novelty}/100)`);
  } else if (signals.novelty < 30) {
    explanations.push(`Seen before (${signals.novelty}/100)`);
  }

  // ========== ACTIONABILITY SCORE (0-100) ==========
  signals.actionability = scoreActionability(result);

  if (signals.actionability > 70) {
    explanations.push(`Highly actionable (${signals.actionability}/100)`);
  } else if (signals.actionability < 30) {
    explanations.push(`Not immediately actionable (${signals.actionability}/100)`);
  }

  // ========== URGENCY SCORE (0-100) ==========
  signals.urgency = scoreUrgency(result);

  if (signals.urgency > 70) {
    explanations.push(`Time-sensitive (${signals.urgency}/100)`);
  }

  // ========== WEIGHTED COMBINATION ==========
  const finalScore = Math.round(
    signals.relevance * weights.relevance +
    signals.novelty * weights.novelty +
    signals.actionability * weights.actionability +
    signals.urgency * weights.urgency
  );

  return {
    score: Math.max(0, Math.min(100, finalScore)),
    explanation: explanations.length > 0
      ? explanations.join('; ')
      : 'Standard result',
    signals,
    weights
  };
}

/**
 * Score relevance to user goals and preferences
 */
function scoreRelevance(result, userContext) {
  let score = 50; // Start neutral

  const { preferences = {}, goals = {}, keywords = [] } = userContext;

  // Match against user preferences
  if (preferences.industries && preferences.industries.length > 0) {
    const industryMatch = preferences.industries.some(pref =>
      matchesPreference(result, pref.value)
    );
    if (industryMatch) score += 20;
  }

  if (preferences.regions && preferences.regions.length > 0) {
    const regionMatch = preferences.regions.some(pref =>
      matchesPreference(result, pref.value)
    );
    if (regionMatch) score += 15;
  }

  // Match against user keywords
  const resultText = JSON.stringify(result).toLowerCase();
  const keywordMatches = keywords.filter(keyword =>
    resultText.includes(keyword.toLowerCase())
  );
  score += Math.min(20, keywordMatches.length * 5);

  // Match against primary goal
  if (goals.primary) {
    const goalMatch = resultText.includes(goals.primary.toLowerCase());
    if (goalMatch) score += 15;
  }

  return Math.min(100, score);
}

/**
 * Score novelty - is this new/different from past results?
 */
function scoreNovelty(result, userContext) {
  let score = 70; // Assume novel unless proven otherwise

  const { recentResults = [], seenEntities = [] } = userContext;

  // Check if we've seen similar results recently
  const similarCount = recentResults.filter(past =>
    isSimilar(result, past)
  ).length;

  if (similarCount > 0) {
    score -= similarCount * 15; // Penalize duplicates
  }

  // Check for new entities (companies, people, etc.)
  const entities = extractEntities(result);
  const newEntities = entities.filter(entity =>
    !seenEntities.includes(entity)
  );

  if (newEntities.length > 0) {
    score += Math.min(30, newEntities.length * 10);
  }

  // Recently opened/created items are more novel
  if (result.createdAt || result.openedAt) {
    const ageInDays = getAgeInDays(result.createdAt || result.openedAt);
    if (ageInDays < 7) {
      score += 20;
    } else if (ageInDays < 30) {
      score += 10;
    }
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Score actionability - can user do something with this?
 */
function scoreActionability(result) {
  let score = 50;

  // Has contact information
  if (result.email || result.phone || result.contactEmail) {
    score += 25;
  }

  // Has specific details
  if (result.address || result.location || result.website) {
    score += 15;
  }

  // Has clear next steps
  if (result.recommendations || result.nextSteps || result.actions) {
    score += 20;
  }

  // Has quantitative data (numbers to act on)
  const hasNumbers = /\d+/.test(JSON.stringify(result));
  if (hasNumbers) {
    score += 10;
  }

  // Reduce score for vague results
  if (result.status === 'partial' || result.incomplete) {
    score -= 20;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Score urgency - does this need attention soon?
 */
function scoreUrgency(result) {
  let score = 30; // Default low urgency

  // Time-sensitive keywords
  const urgentKeywords = [
    'deadline', 'expires', 'limited', 'closing', 'ending',
    'urgent', 'immediate', 'asap', 'time-sensitive', 'expiring'
  ];

  const resultText = JSON.stringify(result).toLowerCase();
  const urgentMatches = urgentKeywords.filter(keyword =>
    resultText.includes(keyword)
  );

  score += urgentMatches.length * 15;

  // Recency indicates urgency
  if (result.createdAt || result.publishedAt) {
    const ageInDays = getAgeInDays(result.createdAt || result.publishedAt);
    if (ageInDays < 1) {
      score += 40; // Very recent
    } else if (ageInDays < 7) {
      score += 20;
    } else if (ageInDays < 30) {
      score += 10;
    }
  }

  // High priority flag
  if (result.priority === 'high' || result.urgent === true) {
    score += 30;
  }

  // Limited availability/slots
  if (result.availability && result.availability < 5) {
    score += 20;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Helper: Check if result matches preference
 */
function matchesPreference(result, preferenceValue) {
  const resultText = JSON.stringify(result).toLowerCase();
  return resultText.includes(preferenceValue.toLowerCase());
}

/**
 * Helper: Check if two results are similar
 */
function isSimilar(result1, result2) {
  // Simple similarity check - compare key fields
  if (result1.id && result2.id && result1.id === result2.id) {
    return true;
  }

  if (result1.title && result2.title) {
    return result1.title === result2.title;
  }

  if (result1.name && result2.name) {
    return result1.name === result2.name;
  }

  return false;
}

/**
 * Helper: Extract entities (companies, people, etc.)
 */
function extractEntities(result) {
  const entities = [];

  if (result.company) entities.push(result.company);
  if (result.name) entities.push(result.name);
  if (result.organization) entities.push(result.organization);
  if (result.business) entities.push(result.business);

  return entities.filter(Boolean);
}

/**
 * Helper: Calculate age in days
 */
function getAgeInDays(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Batch score multiple results
 *
 * @param {Array} results - Array of results to score
 * @param {Object} userContext - User context
 * @returns {Array} Scored results sorted by score descending
 */
export function batchScore(results, userContext = {}) {
  return results
    .map(result => ({
      ...result,
      interestingness: scoreInterestingness(result, userContext)
    }))
    .sort((a, b) => b.interestingness.score - a.interestingness.score);
}

/**
 * Get top N most interesting results
 */
export function getTopInteresting(results, userContext = {}, topN = 5) {
  const scored = batchScore(results, userContext);
  return scored.slice(0, topN);
}

/**
 * Calibrate scoring weights based on user feedback
 *
 * @param {Array} feedbackHistory - Past results with user feedback
 * @returns {Object} Optimized weights
 */
export function calibrateWeights(feedbackHistory) {
  // Simple calibration: increase weights for signals that correlate with positive feedback

  const weights = {
    relevance: 0.35,
    novelty: 0.25,
    actionability: 0.25,
    urgency: 0.15
  };

  if (!feedbackHistory || feedbackHistory.length < 10) {
    return weights; // Not enough data
  }

  const positive = feedbackHistory.filter(item => item.feedback === 'helpful');
  const negative = feedbackHistory.filter(item => item.feedback === 'not_helpful');

  // Calculate average signal values for positive vs negative feedback
  const avgSignals = {
    positive: {
      relevance: average(positive.map(item => item.signals?.relevance || 50)),
      novelty: average(positive.map(item => item.signals?.novelty || 50)),
      actionability: average(positive.map(item => item.signals?.actionability || 50)),
      urgency: average(positive.map(item => item.signals?.urgency || 50))
    },
    negative: {
      relevance: average(negative.map(item => item.signals?.relevance || 50)),
      novelty: average(negative.map(item => item.signals?.novelty || 50)),
      actionability: average(negative.map(item => item.signals?.actionability || 50)),
      urgency: average(negative.map(item => item.signals?.urgency || 50))
    }
  };

  // Adjust weights based on which signals correlate most with positive feedback
  const deltas = {
    relevance: avgSignals.positive.relevance - avgSignals.negative.relevance,
    novelty: avgSignals.positive.novelty - avgSignals.negative.novelty,
    actionability: avgSignals.positive.actionability - avgSignals.negative.actionability,
    urgency: avgSignals.positive.urgency - avgSignals.negative.urgency
  };

  // Normalize deltas to weights (ensure they sum to 1.0)
  const totalDelta = Object.values(deltas).reduce((sum, d) => sum + Math.abs(d), 0);

  if (totalDelta > 0) {
    weights.relevance = Math.abs(deltas.relevance) / totalDelta;
    weights.novelty = Math.abs(deltas.novelty) / totalDelta;
    weights.actionability = Math.abs(deltas.actionability) / totalDelta;
    weights.urgency = Math.abs(deltas.urgency) / totalDelta;
  }

  return weights;
}

/**
 * Helper: Calculate average
 */
function average(numbers) {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

// Export default scorer
export default {
  scoreInterestingness,
  batchScore,
  getTopInteresting,
  calibrateWeights
};
