import { extraImages, fillFigures, renderStem, esc } from '../lib/render.js';

export function kecBits(q) {
  let html = '';
  if (q.kec_outdated) {
    const flags = (q.kec_flags || []).map((f) => esc(f)).join(' · ');
    html += `<div class="kec-badge" data-testid="kec-badge">현행 KEC와 다를 수 있음${
      flags ? ` · ${flags}` : ''
    }</div>`;
  }
  if (q.kec_basis) {
    html += `<p class="kec-basis">${esc(q.kec_basis)}</p>`;
  }
  if (q.restored) html += `<span class="tag">가복원</span>`;
  if (q.points != null) html += `<span class="tag dim">${esc(q.points)}점</span>`;
  if (q.format) html += `<span class="tag dim">${esc(q.format)}</span>`;
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
  if (!q.choices || !q.choices.length) return '';
  return `<div class="choices" role="listbox">
    ${q.choices
      .map((c, i) => {
        const n = i + 1;
        let cls = 'choice';
        if (picked === n) cls += ' picked';
        if (reveal && q.answer != null) {
          if (n === Number(q.answer)) cls += ' right';
          else if (picked === n) cls += ' wrong';
        }
        return `<button type="button" class="${cls}" data-choice="${n}" data-testid="choice-${n}">
          <span class="n">${n}</span><span>${esc(c)}</span>
        </button>`;
      })
      .join('')}
  </div>`;
}

export function explainHtml(q) {
  const ans = q.answer == null ? '원문에 정답 없음' : Array.isArray(q.choices) && Number(q.answer) >= 1
    ? `${q.answer}번`
    : String(q.answer);
  const exp = q.explanation ? renderStem(q.explanation).html : '<span class="muted">해설 없음</span>';
  return `<div class="explain" data-testid="explain">
    <b>정답</b> ${esc(ans)}
    <div style="margin-top:8px">${exp}</div>
  </div>`;
}

export async function hydrateQuestion(root, images) {
  if (!root || !images) return;
  await fillFigures(root, (path) => images.getUrl(path));
}
