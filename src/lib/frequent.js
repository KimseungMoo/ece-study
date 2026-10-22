function prevYearCount(q) {
  if (Array.isArray(q.prev_years)) return q.prev_years.length;
  const n = q.overlap?.n_tag_years;
  return Number.isFinite(n) ? n : 0;
}

export function topicFrequency(questions, exam = '실기') {
  const map = new Map();
  for (const q of questions) {
    if (exam && q.exam !== exam) continue;
    const t = q.topic || '미분류';
    map.set(t, (map.get(t) || 0) + 1);
  }
  return map;
}

/** 빈출: prev_years count + topic frequency. Higher first. */
export function rankFrequent(questions, exam = '실기') {
  const freq = topicFrequency(questions, exam);
  const rows = questions
    .filter((q) => !exam || q.exam === exam)
    .map((q) => {
      const prev = prevYearCount(q);
      const topicN = freq.get(q.topic || '미분류') || 1;
      return {
        question: q,
        prev,
        topicN,
        score: prev * 10 + topicN,
      };
    });
  rows.sort((a, b) => b.score - a.score || b.prev - a.prev || (a.question.number ?? 0) - (b.question.number ?? 0));
  return rows;
}

export function frequentTopics(questions, exam = '실기') {
  const freq = topicFrequency(questions, exam);
  const prevByTopic = new Map();
  for (const q of questions) {
    if (exam && q.exam !== exam) continue;
    const t = q.topic || '미분류';
    prevByTopic.set(t, (prevByTopic.get(t) || 0) + prevYearCount(q));
  }
  return [...freq.entries()]
    .map(([topic, count]) => ({
      topic,
      count,
      prev: prevByTopic.get(topic) || 0,
      score: (prevByTopic.get(topic) || 0) * 10 + count,
    }))
    .sort((a, b) => b.score - a.score);
}
