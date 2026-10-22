export function sessionLabel(q) {
  if (q.round_label) return q.round_label;
  if (q.year == null) return q.collection || q.chapter || '단답 모음';
  if (q.round == null) return `${q.year}년`;
  return `${q.year}년 ${q.round}회`;
}

export function yearKeyOf(q) {
  return q.year == null ? 'none' : String(q.year);
}

export function roundKeyOf(q) {
  if (q.round != null) return String(q.round);
  return q.collection || q.chapter || '기타';
}

export function yearLabel(yearKey) {
  return yearKey === 'none' ? '단답 · 연도 없음' : `${yearKey}년`;
}

/** Build exam → year → round sessions from questions. Years/rounds are not hardcoded. */
export function buildCatalog(questions) {
  const exams = new Map();
  for (const q of questions) {
    if (!exams.has(q.exam)) exams.set(q.exam, new Map());
    const years = exams.get(q.exam);
    const yk = yearKeyOf(q);
    if (!years.has(yk)) years.set(yk, new Map());
    const rounds = years.get(yk);
    const rk = roundKeyOf(q);
    if (!rounds.has(rk)) {
      rounds.set(rk, {
        exam: q.exam,
        year: q.year ?? null,
        round: q.round ?? null,
        yearKey: yk,
        roundKey: rk,
        label: sessionLabel(q),
        questions: [],
      });
    }
    rounds.get(rk).questions.push(q);
  }
  for (const years of exams.values()) {
    for (const rounds of years.values()) {
      for (const sess of rounds.values()) {
        sess.questions.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
      }
    }
  }
  return exams;
}

export function listExams(catalog) {
  return [...catalog.keys()].sort((a, b) => (a === '필기' ? -1 : a === '실기' ? 1 : a.localeCompare(b, 'ko')));
}

export function listYears(catalog, exam) {
  const years = catalog.get(exam);
  if (!years) return [];
  return [...years.keys()].sort((a, b) => {
    if (a === 'none') return 1;
    if (b === 'none') return -1;
    return Number(b) - Number(a);
  });
}

export function listRounds(catalog, exam, yearKey) {
  const rounds = catalog.get(exam)?.get(yearKey);
  if (!rounds) return [];
  return [...rounds.values()].sort((a, b) => {
    const na = Number(a.roundKey);
    const nb = Number(b.roundKey);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a.label).localeCompare(String(b.label), 'ko');
  });
}

export function getSession(catalog, exam, yearKey, roundKey) {
  return catalog.get(exam)?.get(yearKey)?.get(roundKey) ?? null;
}

export function subjectsOf(questions) {
  const seen = [];
  for (const q of questions) {
    if (q.subject && !seen.includes(q.subject)) seen.push(q.subject);
  }
  return seen;
}

export function questionById(questions, id) {
  return questions.find((q) => q.id === id) ?? null;
}
