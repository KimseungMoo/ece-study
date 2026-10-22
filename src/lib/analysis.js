import { similarOldIds } from './question.js';

const BAD = new Set(['wrong', 'unsure']);

export function lastAttemptByQuestion(attempts) {
  const map = new Map();
  for (const a of attempts) {
    const prev = map.get(a.questionId);
    if (!prev || a.at > prev.at) map.set(a.questionId, a);
  }
  return map;
}

function emptyBucket(key, extra) {
  return { key, total: 0, correct: 0, wrong: 0, unsure: 0, accuracy: 1, ...extra };
}

function finish(row) {
  const judged = row.correct + row.wrong + row.unsure;
  row.accuracy = judged ? row.correct / judged : 1;
  row.miss = row.wrong + row.unsure;
  return row;
}

/** Aggregate 맞음/애매/틀림 by subject and topic. */
export function analyzeAttempts(questions, attempts) {
  const qmap = new Map(questions.map((q) => [q.id, q]));
  const bySubject = new Map();
  const byTopic = new Map();
  const last = lastAttemptByQuestion(attempts);

  const touch = (map, key, extra, result) => {
    if (!map.has(key)) map.set(key, emptyBucket(key, extra));
    const row = map.get(key);
    row.total += 1;
    if (result === 'correct') row.correct += 1;
    else if (result === 'unsure') row.unsure += 1;
    else if (result === 'wrong') row.wrong += 1;
  };

  for (const a of attempts) {
    const q = qmap.get(a.questionId);
    if (!q) continue;
    touch(bySubject, q.subject || '기타', { exam: q.exam, subject: q.subject || '기타' }, a.result);
    touch(
      byTopic,
      q.topic || '미분류',
      { exam: q.exam, subject: q.subject || '기타', topic: q.topic || '미분류' },
      a.result,
    );
  }

  const subjects = [...bySubject.values()].map(finish).sort((a, b) => a.accuracy - b.accuracy || b.miss - a.miss);
  const topics = [...byTopic.values()].map(finish).sort((a, b) => a.accuracy - b.accuracy || b.miss - a.miss);

  const reviewAreas = topics
    .filter((t) => t.miss > 0)
    .slice(0, 12)
    .map((t) => ({
      topic: t.topic,
      subject: t.subject,
      exam: t.exam,
      miss: t.miss,
      accuracy: t.accuracy,
      latest: lastResultForTopic(questions, last, t.topic),
    }));

  return { subjects, topics, reviewAreas, last };
}

function lastResultForTopic(questions, last, topic) {
  let latest = null;
  for (const q of questions) {
    if (q.topic !== topic) continue;
    const a = last.get(q.id);
    if (a && (!latest || a.at > latest.at)) latest = a;
  }
  return latest?.result ?? null;
}

export function wrongNoteItems(questions, attempts, memos, mastered) {
  const { last } = analyzeAttempts(questions, attempts);
  const qmap = new Map(questions.map((q) => [q.id, q]));
  const groups = new Map();
  const listed = new Set();
  for (const q of questions) {
    if (mastered?.[q.id]) continue;
    const a = last.get(q.id);
    if (!a || !BAD.has(a.result)) continue;
    const topic = q.topic || '미분류';
    if (!groups.has(topic)) groups.set(topic, { topic, subject: q.subject, exam: q.exam, items: [] });
    groups.get(topic).items.push({
      question: q,
      attempt: a,
      memo: memos?.[q.id] || '',
    });
    listed.add(q.id);
  }
  for (const q of questions) {
    const a = last.get(q.id);
    if (!a || !BAD.has(a.result)) continue;
    const topic = q.topic || '미분류';
    for (const id of similarOldIds(q)) {
      if (listed.has(id) || mastered?.[id]) continue;
      const t = qmap.get(id);
      if (!t) continue;
      if (!groups.has(topic)) groups.set(topic, { topic, subject: q.subject, exam: q.exam, items: [] });
      groups.get(topic).items.push({
        question: t,
        attempt: a,
        memo: memos?.[t.id] || '',
        similar: true,
        relatedFrom: q.id,
      });
      listed.add(id);
    }
  }
  const list = [...groups.values()].sort((a, b) => b.items.length - a.items.length);
  for (const g of list) g.items.sort((a, b) => b.attempt.at - a.attempt.at);
  return list;
}
