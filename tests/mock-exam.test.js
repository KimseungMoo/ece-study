import { describe, expect, it } from 'vitest';
import { selectMockExam } from '../src/lib/mock-exam.js';
import { analyzeAttempts, wrongNoteItems } from '../src/lib/analysis.js';
import { scoreExam } from '../src/lib/scoring.js';

function q(partial) {
  return {
    id: 'x',
    exam: '필기',
    subject: '회로이론',
    topic: '옴의 법칙',
    keywords: ['저항'],
    number: 1,
    ...partial,
  };
}

const questions = [
  q({ id: 'a1', topic: '약한주제', keywords: ['약함', '공통'] }),
  q({ id: 'a2', topic: '약한주제', keywords: ['약함'] }),
  q({ id: 'a3', topic: '약한주제', keywords: ['약함'] }),
  q({ id: 'b1', topic: '강한주제', keywords: ['강함'] }),
  q({ id: 'b2', topic: '강한주제', keywords: ['강함'] }),
  q({ id: 'c1', topic: '키워드만', keywords: ['공통'] }),
  q({ id: 'c2', topic: '키워드만', keywords: ['다른'] }),
  q({ id: 'd1', topic: '최근정답', keywords: ['약함'] }),
];

const now = Date.parse('2026-10-22T00:00:00Z');
const day = 86_400_000;

function att(questionId, result, daysAgo) {
  return { id: `${questionId}-${daysAgo}`, questionId, result, at: now - daysAgo * day };
}

describe('selectMockExam', () => {
  it('excludes recently-correct questions', () => {
    const attempts = [
      att('a1', 'wrong', 2),
      att('a2', 'wrong', 2),
      att('d1', 'correct', 1),
    ];
    const picked = selectMockExam(questions, attempts, {
      size: 20,
      now,
      rng: () => 0,
    });
    expect(picked.map((x) => x.id)).not.toContain('d1');
  });

  it('keeps older-correct questions eligible', () => {
    const attempts = [
      att('a1', 'wrong', 3),
      att('d1', 'correct', 30),
    ];
    const picked = selectMockExam(questions, attempts, {
      size: 20,
      now,
      recentCorrectDays: 14,
      rng: () => 0,
    });
    expect(picked.map((x) => x.id)).toContain('d1');
  });

  it('prefers weak topics over strong ones when rng always takes the first weight', () => {
    const attempts = [
      att('a1', 'wrong', 1),
      att('a2', 'unsure', 1),
      att('b1', 'correct', 1),
      att('b2', 'correct', 2),
    ];
    const picked = selectMockExam(questions, attempts, {
      size: 3,
      now,
      rng: () => 0,
    });
    expect(picked[0].topic).toBe('약한주제');
    expect(picked.map((x) => x.topic).filter((t) => t === '약한주제').length).toBeGreaterThanOrEqual(2);
  });

  it('fills with same-keyword questions after weak-topic pool', () => {
    const attempts = [att('a1', 'wrong', 1), att('a2', 'wrong', 1), att('a3', 'wrong', 1)];
    const picked = selectMockExam(questions, attempts, {
      size: 5,
      now,
      rng: () => 0,
    });
    expect(picked.map((x) => x.id)).toContain('c1');
  });

  it('respects size and exam filter', () => {
    const mixed = [...questions, q({ id: 's1', exam: '실기', topic: '약한주제' })];
    const picked = selectMockExam(mixed, [att('a1', 'wrong', 1)], {
      size: 2,
      exam: '필기',
      now,
      rng: () => 0.99,
    });
    expect(picked).toHaveLength(2);
    expect(picked.every((x) => x.exam === '필기')).toBe(true);
  });

  it('pulls similar_old of missed items before keyword fill', () => {
    const withSimilar = [
      ...questions,
      q({ id: 'old1', topic: '옛기출', keywords: ['무관'] }),
      q({ id: 'old2', topic: '옛기출', keywords: ['무관'] }),
    ];
    const attempts = [
      att('a1', 'wrong', 1),
      att('a2', 'wrong', 1),
      att('a3', 'wrong', 1),
    ];
    withSimilar[0] = { ...withSimilar[0], similar_old: ['old1', 'old2'] };
    const picked = selectMockExam(withSimilar, attempts, {
      size: 6,
      now,
      rng: () => 0,
    });
    const ids = picked.map((x) => x.id);
    expect(ids).toContain('old1');
    expect(ids).toContain('old2');
    expect(ids.indexOf('old1')).toBeLessThan(ids.indexOf('c1'));
  });

  it('skips mastered questions', () => {
    const picked = selectMockExam(questions, [att('a1', 'wrong', 1)], {
      size: 20,
      now,
      mastered: { a2: true, a3: true },
      rng: () => 0,
    });
    expect(picked.map((x) => x.id)).not.toContain('a2');
    expect(picked.map((x) => x.id)).not.toContain('a3');
  });
});

describe('analysis helpers', () => {
  it('ranks weak topics and groups 오답노트', () => {
    const attempts = [att('a1', 'wrong', 1), att('a2', 'unsure', 1), att('b1', 'correct', 1)];
    const { topics, reviewAreas } = analyzeAttempts(questions, attempts);
    expect(topics[0].topic).toBe('약한주제');
    expect(reviewAreas[0].topic).toBe('약한주제');
    const notes = wrongNoteItems(questions, attempts, { a1: '다시' }, {});
    expect(notes[0].topic).toBe('약한주제');
    expect(notes[0].items).toHaveLength(2);
  });

  it('adds similar_old questions into 오답노트 review', () => {
    const qs = [
      q({ id: 'n1', topic: '약한주제', similar_old: ['oldA'] }),
      q({ id: 'oldA', topic: '옛기출', number: 9 }),
    ];
    const notes = wrongNoteItems(qs, [att('n1', 'wrong', 1)], {}, {});
    const ids = notes.flatMap((g) => g.items.map((it) => it.question.id));
    expect(ids).toContain('n1');
    expect(ids).toContain('oldA');
    expect(notes[0].items.find((it) => it.question.id === 'oldA').similar).toBe(true);
  });
});

describe('scoreExam', () => {
  it('applies 과락 under 40 and 합격 at average 60', () => {
    const qs = [
      ...Array.from({ length: 5 }, (_, i) => q({ id: `p${i}`, subject: '전력공학' })),
      ...Array.from({ length: 5 }, (_, i) => q({ id: `c${i}`, subject: '회로이론' })),
    ];
    const passGrades = Object.fromEntries(qs.map((item, i) => [item.id, i % 5 === 0 ? 'wrong' : 'correct']));
    const pass = scoreExam(qs, passGrades);
    expect(pass.avg).toBe(80);
    expect(pass.pass).toBe(true);
    expect(pass.anyFail).toBe(false);

    const failGrades = {
      p0: 'correct',
      p1: 'wrong',
      p2: 'wrong',
      p3: 'wrong',
      p4: 'wrong',
      c0: 'correct',
      c1: 'correct',
      c2: 'correct',
      c3: 'correct',
      c4: 'correct',
    };
    const fail = scoreExam(qs, failGrades);
    expect(fail.subjects.find((s) => s.subject === '전력공학').fail).toBe(true);
    expect(fail.anyFail).toBe(true);
    expect(fail.pass).toBe(false);
  });

  it('excludes null-answer items from scoring totals', () => {
    const qs = [
      q({ id: 'p0', subject: '전력공학' }),
      q({ id: 'p1', subject: '전력공학' }),
      q({ id: 'u1', subject: '전력공학', answer: null }),
      q({ id: 'c0', subject: '회로이론' }),
      q({ id: 'c1', subject: '회로이론' }),
    ];
    const grades = { p0: 'correct', p1: 'correct', u1: 'correct', c0: 'correct', c1: 'wrong' };
    const scored = scoreExam(qs, grades);
    const power = scored.subjects.find((s) => s.subject === '전력공학');
    expect(power.total).toBe(2);
    expect(power.correct).toBe(2);
    expect(scored.subjects.find((s) => s.subject === '회로이론').total).toBe(2);
  });
});
