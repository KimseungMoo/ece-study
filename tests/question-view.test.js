import { describe, expect, it } from 'vitest';
import { circled, subjectBanner } from '../src/ui/question-view.js';

describe('exam paper helpers', () => {
  it('maps 1-4 to ①②③④', () => {
    expect(circled(1)).toBe('①');
    expect(circled(2)).toBe('②');
    expect(circled(4)).toBe('④');
  });

  it('builds 과목 banners from session subjects', () => {
    const qs = [
      { subject: '전기응용' },
      { subject: '전기응용' },
      { subject: '전력공학' },
    ];
    expect(subjectBanner(qs, qs[0])).toBe('【1과목】 전기응용 (2문제)');
    expect(subjectBanner(qs, qs[2])).toBe('【2과목】 전력공학 (1문제)');
  });
});
