import { lastAttemptByQuestion } from './analysis.js';
import { similarOldIds } from './question.js';

const DAY = 86_400_000;

function defaultRng() {
  return Math.random();
}

function keywordSet(q) {
  return new Set((q.keywords || []).map((k) => String(k)));
}

function sharesKeyword(q, weakKeywords) {
  for (const k of q.keywords || []) {
    if (weakKeywords.has(String(k))) return true;
  }
  return false;
}

function daysSince(at, now) {
  if (!at) return 365;
  return Math.max(0, (now - at) / DAY);
}

/**
 * Build a mock exam from weak topics, then same keywords.
 * Excludes recently-correct items. Weighted: more misses + longer gap → higher chance.
 */
export function selectMockExam(questions, attempts, opts = {}) {
  const {
    size = 20,
    exam = null,
    recentCorrectDays = 14,
    now = Date.now(),
    rng = defaultRng,
    mastered = {},
  } = opts;

  const pool0 = questions.filter((q) => (!exam || q.exam === exam) && !mastered[q.id]);
  const qmap = new Map(pool0.map((q) => [q.id, q]));
  const last = lastAttemptByQuestion(attempts);

  const isRecentlyCorrect = (q) => {
    const a = last.get(q.id);
    if (!a || a.result !== 'correct') return false;
    return now - a.at <= recentCorrectDays * DAY;
  };

  const candidates = pool0.filter((q) => !isRecentlyCorrect(q));

  const topicMiss = new Map();
  const topicJudged = new Map();
  const topicKeywords = new Map();
  const qMiss = new Map();

  for (const a of attempts) {
    const q = qmap.get(a.questionId);
    if (!q) continue;
    const topic = q.topic || '미분류';
    topicJudged.set(topic, (topicJudged.get(topic) || 0) + 1);
    if (a.result === 'wrong' || a.result === 'unsure') {
      topicMiss.set(topic, (topicMiss.get(topic) || 0) + 1);
      qMiss.set(q.id, (qMiss.get(q.id) || 0) + 1);
    }
    if (!topicKeywords.has(topic)) topicKeywords.set(topic, new Set());
    for (const k of keywordSet(q)) topicKeywords.get(topic).add(k);
  }

  const weakness = (topic) => {
    const miss = topicMiss.get(topic) || 0;
    const judged = topicJudged.get(topic) || 0;
    if (!judged) return 0;
    return (miss / judged) * Math.log2(1 + miss);
  };

  const weakTopics = new Set(
    [...new Set(candidates.map((q) => q.topic || '미분류'))].filter((topic) => weakness(topic) > 0),
  );
  const weakKeywords = new Set();
  for (const t of weakTopics) {
    for (const k of topicKeywords.get(t) || []) weakKeywords.add(k);
  }

  const weightOf = (q) => {
    const a = last.get(q.id);
    const gap = 1 + daysSince(a?.at, now);
    const missBoost = 1 + (qMiss.get(q.id) || 0);
    const topic = q.topic || '미분류';
    const weakBoost = 1 + weakness(topic);
    return gap * missBoost * weakBoost;
  };

  const similarIds = new Set();
  for (const a of attempts) {
    if (a.result !== 'wrong' && a.result !== 'unsure') continue;
    const q = qmap.get(a.questionId);
    if (!q) continue;
    for (const id of similarOldIds(q)) similarIds.add(id);
  }

  const weakPool = candidates.filter((q) => weakTopics.has(q.topic || '미분류'));
  const similarPool = candidates.filter(
    (q) => similarIds.has(q.id) && !weakTopics.has(q.topic || '미분류'),
  );
  const keywordPool = candidates.filter(
    (q) =>
      !weakTopics.has(q.topic || '미분류') &&
      !similarIds.has(q.id) &&
      sharesKeyword(q, weakKeywords),
  );
  const restPool = candidates.filter(
    (q) =>
      !weakTopics.has(q.topic || '미분류') &&
      !similarIds.has(q.id) &&
      !sharesKeyword(q, weakKeywords),
  );

  const picked = [];
  for (const pool of [weakPool, similarPool, keywordPool, restPool]) {
    if (picked.length >= size) break;
    picked.push(...pickWeighted(pool, weightOf, rng, size - picked.length));
  }
  return picked;
}

function pickWeighted(pool, weightOf, rng, n) {
  const remaining = pool.slice();
  const picked = [];
  while (picked.length < n && remaining.length) {
    const weights = remaining.map(weightOf);
    const sum = weights.reduce((s, w) => s + w, 0) || remaining.length;
    let r = rng() * sum;
    let idx = 0;
    for (; idx < remaining.length; idx++) {
      r -= weights[idx] || 1;
      if (r <= 0) break;
    }
    if (idx >= remaining.length) idx = remaining.length - 1;
    picked.push(remaining.splice(idx, 1)[0]);
  }
  return picked;
}

export const MOCK_SIZES = [20, 50, 100];
