import katex from 'katex';

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function texHtml(src, display) {
  try {
    return katex.renderToString(src, { throwOnError: false, displayMode: display });
  } catch {
    return `<code>${esc(src)}</code>`;
  }
}

const TOKEN = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\[그림:\s*([^\]]+)\]/g;

export function renderStem(text) {
  const used = [];
  const src = String(text ?? '');
  let out = '';
  let last = 0;
  let m;
  const re = new RegExp(TOKEN.source, 'g');
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index)).replace(/\n/g, '<br>');
    if (m[1] != null) out += texHtml(m[1], true);
    else if (m[2] != null) out += texHtml(m[2], false);
    else {
      const path = m[3].trim();
      used.push(path);
      out += `<figure class="q-fig" data-img="${esc(path)}"><span class="q-fig-ph">그림 불러오는 중</span></figure>`;
    }
    last = m.index + m[0].length;
  }
  out += esc(src.slice(last)).replace(/\n/g, '<br>');
  return { html: out, used };
}

export function extraImages(question, used) {
  const usedSet = new Set(used);
  const meta = new Map((question.image_meta || []).map((m) => [m.path, m]));
  const extras = (question.images || []).filter((p) => !usedSet.has(p));
  extras.sort((a, b) => {
    const ka = tableRank(meta.get(a));
    const kb = tableRank(meta.get(b));
    return ka - kb;
  });
  return extras.map((path) => ({ path, meta: meta.get(path) || null }));
}

function tableRank(meta) {
  if (!meta) return 1;
  if (meta.kind === 'table' || meta.role === 'table') return 0;
  return 1;
}

export function fillFigures(root, getUrl) {
  const nodes = [...root.querySelectorAll('[data-img]')];
  return Promise.all(
    nodes.map(async (node) => {
      const path = node.getAttribute('data-img');
      try {
        const url = await getUrl(path);
        const img = document.createElement('img');
        img.src = url;
        img.alt = '문제 그림';
        img.className = 'q-img';
        node.replaceChildren(img);
      } catch {
        node.innerHTML = '<span class="q-fig-err">그림을 불러오지 못했습니다</span>';
      }
    }),
  );
}

export function formatChoiceLabel(i) {
  return `${i}`;
}
