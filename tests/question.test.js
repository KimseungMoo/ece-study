import { describe, expect, it } from 'vitest';
import {
  choiceSlots,
  isMcqPickable,
  isUnscored,
  labelQuestion,
  similarOldIds,
} from '../src/lib/question.js';
import { buildCatalog, listRounds, listYears } from '../src/lib/catalog.js';
import { extraImages, renderStem } from '../src/lib/render.js';

describe('choiceSlots / pickable', () => {
  it('uses parsed choices when present', () => {
    const q = { choices: ['가', '나', '다', '라'] };
    expect(choiceSlots(q)).toEqual(['가', '나', '다', '라']);
    expect(isMcqPickable(q)).toBe(true);
  });

  it('renders ①–④ slots when choices_missing', () => {
    const q = { exam: '필기', format: 'mcq', choices_missing: true, choices: [] };
    expect(choiceSlots(q)).toEqual(['', '', '', '']);
    expect(isMcqPickable(q)).toBe(true);
  });

  it('leaves 실기 short answers as self-grade', () => {
    const q = { exam: '실기', format: 'short', choices: [] };
    expect(choiceSlots(q)).toBeNull();
    expect(isMcqPickable(q)).toBe(false);
  });
});

describe('isUnscored / similar_old', () => {
  it('treats null answers as solvable but unscored', () => {
    expect(isUnscored({ answer: null })).toBe(true);
    expect(isUnscored({ answer: 2 })).toBe(false);
  });

  it('takes top-3 similar_old ids from strings or objects', () => {
    expect(similarOldIds({ similar_old: ['A', { id: 'B' }, 'C', 'D'] })).toEqual(['A', 'B', 'C']);
    expect(similarOldIds({})).toEqual([]);
  });

  it('labels year/round/number', () => {
    expect(labelQuestion({ year: 2025, round: 2, number: 7 })).toBe('2025년 2회 7번');
  });
});

describe('catalog year/round', () => {
  it('lists 필기 2024-1 … 2026-3 from question metadata', () => {
    const qs = [];
    for (const year of [2024, 2025, 2026]) {
      for (const round of [1, 2, 3]) {
        qs.push({
          id: `P-YT-${year}-${round}-01`,
          exam: '필기',
          year,
          round,
          number: 1,
          subject: '전기응용',
        });
      }
    }
    const cat = buildCatalog(qs);
    expect(listYears(cat, '필기')).toEqual(['2026', '2025', '2024']);
    expect(listRounds(cat, '필기', '2024').map((r) => r.roundKey)).toEqual(['1', '2', '3']);
    expect(listRounds(cat, '필기', '2026').map((r) => r.label)).toEqual([
      '2026년 1회',
      '2026년 2회',
      '2026년 3회',
    ]);
  });
});

describe('question vs explanation images', () => {
  it('keeps explanation_images out of the stem extras', () => {
    const q = {
      question: '보기',
      images: ['images/q.png'],
      explanation_images: ['images/ans.png'],
    };
    const { used } = renderStem(q.question);
    const extras = extraImages(q, used);
    expect(extras.map((e) => e.path)).toEqual(['images/q.png']);
    expect(extras.some((e) => e.path === 'images/ans.png')).toBe(false);
  });
});
