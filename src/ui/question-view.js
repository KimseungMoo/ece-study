import { extraImages, fillFigures, renderStem, esc } from '../lib/render.js';
import { subjectsOf } from '../lib/catalog.js';
import { choiceSlots, isMcqPickable, isUnscored, labelQuestion, similarOldIds } from '../lib/question.js';

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

export function circled(n) {
  return CIRCLED[n - 1] || String(n);
}

export function subjectBanner(questions, q) {
  const subs = subjectsOf(questions);
  const idx = q.subject ? subs.indexOf(q.subject) : -1;
  const n = idx >= 0 ? idx + 1 : 1;
  const count = q.subject ? questions.filter((x) => x.subject === q.subject).length : 0;
  const name = q.subject || q.exam || '';
  return count ? `【${n}과목】 ${name} (${count}문제)` : `【${n}과목】 ${name}`;
}

export function kecBits(q) {
  let html = '';
  if (q.kec_outdated) {
    const flags = (q.kec_flags || []).map((f) => esc(f)).join(' · ');
    html += `<p class="paper-note" data-testid="kec-badge">※ 현행 KEC와 다를 수 있음${
      flags ? ` — ${flags}` : ''
    }</p>`;
  }
  if (q.kec_basis) html += `<p class="paper-note dim">${esc(q.kec_basis)}</p>`;
  return html;
}

export function stemHtml(q) {
  const { html, used } = renderStem(q.question);
  const extras = extraImages(q, used);
  let extra = '';
  for (const item of extras) {
    const label = item.meta?.kind === 'table' || item.meta?.role === 'table' ? '표' : '그림';
    extra += `<figure class="q-fig" data-img="${esc(item.path)}"><span class="q-fig-ph">${label} 불러오는 중</span></figure>`;
  }
  return `<div class="q-stem">${html}${extra}</div>`;
}

export function choicesHtml(q, picked, grade, reveal) {
  const slots = choiceSlots(q);
  if (!slots) return '';
  return `<div class="choices" role="listbox">
    ${slots
      .map((c, i) => {
        const n = i + 1;
        let cls = 'paper-choice';
        if (picked === n) cls += ' picked';
        let stamp = '';
        if (reveal && q.answer != null) {
          if (n === Number(q.answer)) {
            cls += ' right';
            stamp = '<i class="stamp ok">정</i>';
          } else if (picked === n) {
            cls += ' wrong';
            stamp = '<i class="stamp ng">오</i>';
          }
        }
        return `<button type="button" class="${cls}" data-choice="${n}" data-testid="choice-${n}">
          <span class="circ">${circled(n)}</span>
          <span class="txt">${esc(c)}</span>
          ${stamp}
        </button>`;
      })
      .join('')}
  </div>`;
}

export function markBarHtml(q, picked) {
  const slots = choiceSlots(q);
  if (!slots) return '';
  return `<div class="mark-bar" role="group" aria-label="답 표시">
    ${slots
      .map((_, i) => {
        const n = i + 1;
        return `<button type="button" class="mark-dot${picked === n ? ' on' : ''}" data-choice="${n}">${circled(n)}</button>`;
      })
      .join('')}
  </div>`;
}

export function omrHtml(session) {
  const rows = session.questions
    .map((item, i) => {
      const picked = session.answers[item.id];
      const on = i === session.index;
      const slots = choiceSlots(item);
      const bubbles = slots
        ? slots
            .map((_, ci) => {
              const n = ci + 1;
              const fill = picked === n ? ' fill' : '';
              return `<button type="button" class="omr-b${fill}" data-act="omr" data-i="${i}" data-choice="${n}">${circled(n)}</button>`;
            })
            .join('')
        : '<span class="omr-self">필답</span>';
      return `<div class="omr-row${on ? ' on' : ''}">
        <button type="button" class="omr-no" data-act="jump" data-i="${i}">${i + 1}</button>
        ${bubbles}
      </div>`;
    })
    .join('');
  return `<aside class="omr" data-testid="omr-sheet">
    <h3>답안 작성란</h3>
    <p class="omr-cap">${esc(session.title)} · ${session.questions.length}문항</p>
    ${rows}
  </aside>`;
}

export function similarOldHtml(q, allQuestions) {
  const ids = similarOldIds(q);
  if (!ids.length) return '';
  const qmap = new Map((allQuestions || []).map((item) => [item.id, item]));
  const links = ids
    .map((id) => {
      const t = qmap.get(id);
      return `<button type="button" class="paper-link" data-act="open-similar" data-id="${esc(id)}">${esc(
        t ? labelQuestion(t) : id,
      )}</button>`;
    })
    .join(' · ');
  return `<p class="paper-note" data-testid="similar-old">비슷한 옛 기출 ${links}</p>`;
}

function figureList(paths, label) {
  if (!paths || !paths.length) return '';
  return paths
    .map((path) => `<figure class="q-fig" data-img="${esc(path)}"><span class="q-fig-ph">${label}</span></figure>`)
    .join('');
}

export function explainHtml(q, allQuestions) {
  const unscored = isUnscored(q);
  const ans = unscored
    ? '정답 미확인'
    : Array.isArray(q.choices) && Number(q.answer) >= 1
      ? `${circled(Number(q.answer))}`
      : String(q.answer);
  const exp = q.explanation ? renderStem(q.explanation).html : '<span class="muted">해설 없음</span>';
  const expImgs = figureList(q.explanation_images, '해설 그림 불러오는 중');
  const basis = q.answer_basis ? `<p class="paper-note dim">${esc(q.answer_basis)}</p>` : '';
  const overlap = q.overlap_judgment ? `<p class="paper-note dim">${esc(q.overlap_judgment)}</p>` : '';
  const recent = Array.isArray(q.similar_recent_prev) && q.similar_recent_prev.length
    ? `<p class="paper-note dim">${esc(q.similar_recent_prev.join(' · '))}</p>`
    : q.similar_recent_prev
      ? `<p class="paper-note dim">${esc(q.similar_recent_prev)}</p>`
      : '';
  return `<div class="explain" data-testid="explain">
    <b>정답</b> ${esc(ans)}
    <div class="explain-body">${exp}</div>
    ${expImgs}
    ${basis}${overlap}${recent}
    ${similarOldHtml(q, allQuestions)}
  </div>`;
}

export function paperHtml({ session, q, index, reveal, self, allQuestions }) {
  const picked = session.answers[q.id];
  const grade = session.grades[q.id];
  const pts = q.points != null ? ` (배점 ${esc(q.points)}점)` : '';
  const restored = q.restored ? '<span class="paper-tag">가복원</span>' : '';
  const unansweredMark = isUnscored(q) ? '<span class="paper-tag">정답 미확인</span>' : '';
  const pickable = isMcqPickable(q);
  const body = `
    <div class="paper-qno">${index + 1}.${pts} ${restored} ${unansweredMark}</div>
    ${kecBits(q)}
    ${stemHtml(q)}
    ${pickable ? choicesHtml(q, picked, grade, reveal && !self && !isUnscored(q)) : ''}
    ${
      self
        ? session.revealed[q.id]
          ? `${explainHtml(q, allQuestions)}
             <div class="paper-grade">
               <button class="paper-stamp-btn" type="button" data-act="self" data-g="correct">맞음</button>
               <button class="paper-stamp-btn mid" type="button" data-act="self" data-g="unsure">애매</button>
               <button class="paper-stamp-btn ng" type="button" data-act="self" data-g="wrong">틀림</button>
             </div>`
          : `<button class="paper-link" type="button" data-act="reveal" data-testid="reveal-answer">정답 · 해설 보기</button>`
        : `${reveal ? explainHtml(q, allQuestions) : similarOldHtml(q, allQuestions)}`
    }`;
  return `<article class="paper">
    <header class="paper-head">
      <h2>국가기술자격 검정 문제지</h2>
      <table>
        <tbody>
          <tr>
            <th>자격종목</th><td>전기공사산업기사</td>
            <th>구분</th><td>${esc(q.exam || session.exam || '')}</td>
            <th>문항</th><td>${index + 1} / ${session.questions.length}</td>
          </tr>
        </tbody>
      </table>
      <div class="paper-subject">${esc(subjectBanner(session.questions, q))}</div>
    </header>
    <div class="paper-body">${body}</div>
    <footer class="paper-foot">― ${index + 1} ―</footer>
  </article>`;
}

export async function hydrateQuestion(root, images) {
  if (!root || !images) return;
  await fillFigures(root, (path) => images.getUrl(path));
}
