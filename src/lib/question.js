export function choiceSlots(q) {
  if (Array.isArray(q.choices) && q.choices.length) return q.choices;
  if (q.choices_missing || (q.exam === '필기' && q.format === 'mcq')) {
    return ['', '', '', ''];
  }
  return null;
}

export function isMcqPickable(q) {
  return !!choiceSlots(q);
}

export function isUnscored(q) {
  return q.answer === null;
}

export function similarOldIds(q) {
  const raw = q.similar_old;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => (typeof x === 'string' ? x : x?.id)).filter(Boolean).slice(0, 3);
}

export function questionByIdMap(questions) {
  return new Map(questions.map((q) => [q.id, q]));
}

export function labelQuestion(q) {
  if (!q) return '';
  const yr = q.year != null ? `${q.year}년` : '';
  const rd = q.round != null ? ` ${q.round}회` : '';
  const n = q.number != null ? ` ${q.number}번` : '';
  return `${yr}${rd}${n}`.trim() || q.id;
}
