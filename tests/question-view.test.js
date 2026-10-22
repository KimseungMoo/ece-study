import { describe, expect, it } from 'vitest';
import {
  circled,
  choicesHtml,
  explainHtml,
  kecBits,
  paperHtml,
  similarOldHtml,
  stemHtml,
  subjectBanner,
} from '../src/ui/question-view.js';

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

  it('shows ①–④ buttons when choices are missing', () => {
    const html = choicesHtml({ choices_missing: true, exam: '필기', format: 'mcq' }, null, null, false);
    expect(html).toContain('data-testid="choice-1"');
    expect(html).toContain('data-testid="choice-4"');
    expect(html).toContain('①');
    expect(html).toContain('④');
  });

  it('keeps explanation_images out of the stem and only in 해설', () => {
    const q = {
      id: 'x',
      question: '문제',
      images: ['images/q.png'],
      explanation_images: ['images/ans.png'],
      explanation: '풀이',
      answer: 2,
      choices: ['가', '나', '다', '라'],
    };
    expect(stemHtml(q)).toContain('images/q.png');
    expect(stemHtml(q)).not.toContain('images/ans.png');
    const exp = explainHtml(q, []);
    expect(exp).toContain('images/ans.png');
    expect(exp).toContain('②');
  });

  it('marks 정답 미확인 and still renders similar_old links', () => {
    const q = {
      id: 'p1',
      exam: '필기',
      year: 2025,
      round: 1,
      number: 3,
      question: '보기',
      answer: null,
      choices: ['가', '나', '다', '라'],
      similar_old: ['old1'],
      kec_outdated: true,
      kec_flags: ['접지'],
      answer_basis: '공개 정답 없음',
    };
    const old = { id: 'old1', year: 2018, round: 2, number: 11 };
    const session = { answers: {}, grades: {}, revealed: {}, questions: [q], title: '가상', exam: '필기' };
    const paper = paperHtml({ session, q, index: 0, reveal: true, self: false, allQuestions: [q, old] });
    expect(paper).toContain('정답 미확인');
    expect(paper).toContain('현행 KEC와 다를 수 있음');
    expect(explainHtml(q, [q, old])).toContain('정답 미확인');
    expect(explainHtml(q, [q, old])).toContain('공개 정답 없음');
    expect(similarOldHtml(q, [q, old])).toContain('비슷한 옛 기출');
    expect(similarOldHtml(q, [q, old])).toContain('2018년 2회 11번');
  });
});
