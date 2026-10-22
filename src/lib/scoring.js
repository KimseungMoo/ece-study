import { isUnscored } from './question.js';

/** Per-subject % plus 과락(<40) / 합격(avg>=60 and no 과락). Null-answer items are excluded. */
export function scoreExam(questions, grades) {
  const bySubject = new Map();
  for (const q of questions) {
    if (isUnscored(q)) continue;
    const sub = q.subject || '기타';
    if (!bySubject.has(sub)) bySubject.set(sub, { subject: sub, total: 0, correct: 0, points: 0, pointsMax: 0 });
    const row = bySubject.get(sub);
    row.total += 1;
    const pts = Number.isFinite(q.points) ? q.points : 1;
    row.pointsMax += pts;
    if (grades[q.id] === 'correct') {
      row.correct += 1;
      row.points += pts;
    }
  }
  const subjects = [...bySubject.values()].map((row) => {
    const percent = row.total ? Math.round((row.correct / row.total) * 1000) / 10 : 0;
    return { ...row, percent, fail: percent < 40 };
  });
  const avg = subjects.length
    ? Math.round((subjects.reduce((s, r) => s + r.percent, 0) / subjects.length) * 10) / 10
    : 0;
  const anyFail = subjects.some((s) => s.fail);
  const pass = subjects.length > 0 && avg >= 60 && !anyFail;
  return { subjects, avg, anyFail, pass };
}

export function gradeMcq(question, choiceIndex) {
  if (question.answer == null || choiceIndex == null) return null;
  const ans = question.answer;
  const ok = Number(ans) === Number(choiceIndex);
  return ok ? 'correct' : 'wrong';
}
