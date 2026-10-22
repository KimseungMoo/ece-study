import { buildCatalog, getSession, listExams, listRounds, listYears, yearLabel } from '../lib/catalog.js';
import { analyzeAttempts, wrongNoteItems } from '../lib/analysis.js';
import { selectMockExam, MOCK_SIZES } from '../lib/mock-exam.js';
import { frequentTopics, rankFrequent } from '../lib/frequent.js';
import { gradeMcq, scoreExam } from '../lib/scoring.js';
import { createImageStore } from '../lib/images.js';
import { downloadJson, readJsonFile } from '../lib/backup.js';
import {
  addAttempt,
  allAttempts,
  clearRememberedKey,
  exportBackup,
  importBackup,
  loadProgressMeta,
  loadRememberedKey,
  newAttempt,
  saveMastered,
  saveMemos,
  saveRememberedKey,
  saveSettings,
} from '../lib/store.js';
import { checkPassphrase, decryptData, deriveKey } from '../crypto/ece-decrypt.mjs';
import { choicesHtml, explainHtml, hydrateQuestion, kecBits, stemHtml } from './question-view.js';
import { esc } from '../lib/render.js';

const DATA_BASE = `${import.meta.env.BASE_URL}data/`;
const root = () => document.getElementById('app');

const state = {
  route: parseRoute(),
  unlocked: false,
  unlocking: false,
  unlockStage: '',
  unlockError: '',
  remember: false,
  data: null,
  key: null,
  catalog: null,
  images: null,
  attempts: [],
  memos: {},
  mastered: {},
  settings: { theme: 'system', immediate: false, timer: false },
  session: null,
  result: null,
  needUpdate: false,
  toast: '',
};

function parseRoute() {
  const raw = decodeURIComponent((location.hash || '#/').replace(/^#/, '') || '/');
  const parts = raw.split('/').filter(Boolean);
  return { raw, parts, name: parts[0] || 'home' };
}

function go(hash) {
  if (!hash.startsWith('#')) hash = `#${hash}`;
  if (location.hash === hash) {
    state.route = parseRoute();
    render();
    return;
  }
  location.hash = hash;
}

function examFromSlug(slug) {
  if (slug === 'pilgi') return '필기';
  if (slug === 'silgi') return '실기';
  return slug;
}

function examSlug(exam) {
  if (exam === '필기') return 'pilgi';
  if (exam === '실기') return 'silgi';
  return encodeURIComponent(exam);
}

function applyTheme() {
  const t = state.settings.theme || 'system';
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

function setToast(msg) {
  state.toast = msg;
  render();
  if (msg) setTimeout(() => { state.toast = ''; render(); }, 2400);
}

async function persistGrade(q, result, mode) {
  const attempt = newAttempt({
    questionId: q.id,
    exam: q.exam,
    subject: q.subject,
    topic: q.topic,
    keywords: q.keywords || [],
    result,
    mode,
  });
  state.attempts.push(attempt);
  await addAttempt(attempt);
}

async function unlockWithPassphrase(passphrase, remember) {
  state.unlocking = true;
  state.unlockError = '';
  state.unlockStage = '파일을 불러오는 중';
  render();
  try {
    const [manifest, verifyBuf, dataBuf] = await Promise.all([
      fetch(`${DATA_BASE}manifest.json`).then((r) => {
        if (!r.ok) throw new Error('manifest를 불러오지 못했습니다');
        return r.json();
      }),
      fetch(`${DATA_BASE}verify.bin`).then((r) => r.arrayBuffer()),
      fetch(`${DATA_BASE}data.bin`).then((r) => r.arrayBuffer()),
    ]);
    state.unlockStage = '암호 키를 만드는 중 · 아이패드에서 몇 초 걸릴 수 있습니다';
    render();
    const worker = new Worker(new URL('../crypto/unlock-worker.js', import.meta.url), { type: 'module' });
    const result = await new Promise((resolve, reject) => {
      worker.onmessage = (ev) => {
        const m = ev.data;
        if (m.stage === 'derive') {
          state.unlockStage = '암호 키를 만드는 중 · 아이패드에서 몇 초 걸릴 수 있습니다';
          render();
        } else if (m.stage === 'verify') {
          state.unlockStage = '암호 확인 중';
          render();
        } else if (m.stage === 'data') {
          state.unlockStage = '문제 데이터를 푸는 중';
          render();
        } else if (m.ok === false) {
          worker.terminate();
          resolve(m);
        } else if (m.ok === true) {
          worker.terminate();
          resolve(m);
        }
      };
      worker.onerror = (e) => {
        worker.terminate();
        reject(e.error || e.message || e);
      };
      worker.postMessage({ passphrase, manifest, verifyBuf, dataBuf }, [verifyBuf, dataBuf]);
    });
    if (!result.ok) {
      state.unlocking = false;
      state.unlockError = '암호가 올바르지 않습니다';
      render();
      return;
    }
    let key = result.key;
    if (!key) {
      state.unlockStage = '키를 다시 준비하는 중';
      render();
      key = await deriveKey(passphrase, manifest);
    }
    await finishUnlock(key, result.data, manifest, remember);
  } catch (err) {
    state.unlocking = false;
    state.unlockError = `잠금 해제에 실패했습니다: ${err?.message || err}`;
    render();
  }
}

async function finishUnlock(key, data, manifest, remember) {
  if (state.images) state.images.revokeAll();
  state.key = key;
  state.data = data;
  state.catalog = buildCatalog(data.questions || []);
  state.images = createImageStore({
    key,
    imageIndex: data.image_index || {},
    dataBase: DATA_BASE,
  });
  state.unlocked = true;
  state.unlocking = false;
  state.unlockError = '';
  if (remember) {
    await saveRememberedKey(key, manifest?.built_at || data.built_at);
    state.settings.remember = true;
    await saveSettings(state.settings);
  }
  applyTheme();
  if (!state.route.parts.length || state.route.name === 'unlock') go('#/');
  else render();
}

async function tryAutoUnlock() {
  const saved = await loadRememberedKey();
  if (!saved?.key) return false;
  try {
    const [manifest, verifyBuf, dataBuf] = await Promise.all([
      fetch(`${DATA_BASE}manifest.json`).then((r) => r.json()),
      fetch(`${DATA_BASE}verify.bin`).then((r) => r.arrayBuffer()),
      fetch(`${DATA_BASE}data.bin`).then((r) => r.arrayBuffer()),
    ]);
    const ok = await checkPassphrase(saved.key, verifyBuf);
    if (!ok) {
      await clearRememberedKey();
      return false;
    }
    const data = await decryptData(saved.key, dataBuf);
    await finishUnlock(saved.key, data, manifest, false);
    return true;
  } catch {
    return false;
  }
}

async function lockApp() {
  if (state.images) state.images.revokeAll();
  await clearRememberedKey();
  state.unlocked = false;
  state.key = null;
  state.data = null;
  state.catalog = null;
  state.images = null;
  state.session = null;
  state.result = null;
  go('#/unlock');
}

function startSession({ questions, title, exam, mode, immediate, timer }) {
  state.session = {
    questions,
    title,
    exam,
    mode,
    index: 0,
    answers: {},
    grades: {},
    revealed: {},
    immediate: immediate ?? state.settings.immediate,
    timerOn: timer ?? state.settings.timer,
    remain: timer ?? state.settings.timer ? 150 * 60 : null,
    startedAt: Date.now(),
    tick: null,
  };
  if (state.session.timerOn) {
    clearInterval(window.__eceTick);
    window.__eceTick = setInterval(() => {
      if (!state.session || state.session.remain == null) return;
      state.session.remain -= 1;
      if (state.session.remain <= 0) {
        state.session.remain = 0;
        clearInterval(window.__eceTick);
        submitSession();
        return;
      }
      const el = document.querySelector('[data-testid="timer"]');
      if (el) el.textContent = fmtTime(state.session.remain);
    }, 1000);
  }
  go('#/play');
}

function fmtTime(sec) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

async function submitSession() {
  const sess = state.session;
  if (!sess) return;
  clearInterval(window.__eceTick);
  for (const q of sess.questions) {
    if (sess.grades[q.id]) continue;
    if (q.exam === '필기' && q.format === 'mcq' && q.answer != null) {
      const g = gradeMcq(q, sess.answers[q.id]);
      if (g) {
        sess.grades[q.id] = g;
        await persistGrade(q, g, sess.mode);
      }
    }
  }
  state.result = {
    title: sess.title,
    exam: sess.exam,
    mode: sess.mode,
    questions: sess.questions,
    answers: sess.answers,
    grades: sess.grades,
    score: sess.exam === '필기' ? scoreExam(sess.questions, sess.grades) : null,
  };
  go('#/result');
}

function chrome(inner, opts = {}) {
  const tab = opts.tab || '';
  const showTabs = state.unlocked && !opts.hideTabs;
  const update = state.needUpdate
    ? `<div class="banner">새 버전이 있습니다
        <button class="btn primary" type="button" data-act="apply-update">지금 새로고침</button>
      </div>`
    : '';
  const toast = state.toast ? `<div class="banner" data-testid="toast">${esc(state.toast)}</div>` : '';
  const tabs = showTabs
    ? `<nav class="tabs">
        <button type="button" class="${tab === 'home' ? 'active' : ''}" data-go="#/">홈</button>
        <button type="button" class="${tab === 'exam' ? 'active' : ''}" data-go="#/exam" data-testid="nav-exam">기출</button>
        <button type="button" class="${tab === 'study' ? 'active' : ''}" data-go="#/study" data-testid="nav-study">학습</button>
        <button type="button" class="${tab === 'freq' ? 'active' : ''}" data-go="#/frequent" data-testid="nav-frequent">빈출</button>
        <button type="button" class="${tab === 'set' ? 'active' : ''}" data-go="#/settings">설정</button>
      </nav>`
    : '';
  return `<div class="shell ${showTabs ? '' : 'no-tab'}">${
    showTabs ? `<div class="main-col">${update}${toast}${inner}</div>${tabs}` : `${update}${toast}${inner}`
  }</div>`;
}

function top(title, back) {
  return `<div class="topbar">
    ${back ? `<button class="icon-btn" type="button" data-go="${esc(back)}" aria-label="뒤로">←</button>` : ''}
    <h1>${esc(title)}</h1>
  </div>`;
}

function viewUnlock() {
  return chrome(
    `<section class="unlock" data-testid="unlock-screen">
      <div class="mark"><img src="${import.meta.env.BASE_URL}apple-touch-icon.png" alt=""></div>
      <h1>전기공사 기출</h1>
      <p class="sub muted">전기공사산업기사 · 필기 · 실기</p>
      <div class="card">
        <label class="field">암호
          <input type="password" id="pass" data-testid="unlock-passphrase" autocomplete="current-password" ${
            state.unlocking ? 'disabled' : ''
          }>
        </label>
        <label class="check">
          <input type="checkbox" id="remember" data-testid="remember-device" ${state.remember ? 'checked' : ''}>
          <span>이 기기에서 기억<br><span class="small muted">잠금 해제 키를 이 브라우저에 남깁니다. 다른 사람이 쓰는 기기면 끄세요.</span></span>
        </label>
        ${state.unlockError ? `<div class="err" data-testid="unlock-error">${esc(state.unlockError)}</div>` : ''}
        <button class="btn primary" style="width:100%" type="button" data-act="unlock" data-testid="unlock-submit" ${
          state.unlocking ? 'disabled' : ''
        }>${state.unlocking ? '푸는 중…' : '잠금 해제'}</button>
        ${
          state.unlocking
            ? `<div class="progress"><i></i></div><p class="small muted center">${esc(state.unlockStage)}</p>`
            : ''
        }
      </div>
    </section>`,
    { hideTabs: true },
  );
}

function viewHome() {
  const n = state.data?.questions?.length || 0;
  const exams = listExams(state.catalog);
  return chrome(
    `${top('전기공사 기출')}
    <p class="muted">복호화된 문항 ${n}개 · ${exams.join(' · ')}</p>
    <div class="grid tiles">
      <button class="tile" type="button" data-go="#/exam">
        <b>연도별 기출</b>
        <span class="muted">회차 그대로 풀기</span>
      </button>
      <button class="tile" type="button" data-go="#/study">
        <b>학습</b>
        <span class="muted">오답 분석 · 모의고사 · 노트</span>
      </button>
      <button class="tile" type="button" data-go="#/frequent">
        <b>빈출 주제</b>
        <span class="muted">실기 재출제 우선</span>
      </button>
      <button class="tile" type="button" data-go="#/settings">
        <b>설정</b>
        <span class="muted">백업 · 테마 · 잠금</span>
      </button>
    </div>`,
    { tab: 'home' },
  );
}

function viewExamPick() {
  const parts = state.route.parts;
  if (parts.length === 1) {
    const exams = listExams(state.catalog);
    return chrome(
      `${top('연도별 기출', '#/')}
      ${exams
        .map(
          (e) => `<button class="list-btn" type="button" data-go="#/exam/${examSlug(e)}" data-testid="exam-${examSlug(e)}">
            <span>${esc(e)}</span><span class="meta">연도 선택</span>
          </button>`,
        )
        .join('')}`,
      { tab: 'exam' },
    );
  }
  const exam = examFromSlug(parts[1]);
  if (parts.length === 2) {
    const years = listYears(state.catalog, exam);
    return chrome(
      `${top(exam, '#/exam')}
      ${years
        .map(
          (y) => `<button class="list-btn" type="button" data-go="#/exam/${examSlug(exam)}/${encodeURIComponent(y)}">
            <span>${esc(yearLabel(y))}</span>
            <span class="meta">${listRounds(state.catalog, exam, y).length}개 회차</span>
          </button>`,
        )
        .join('')}`,
      { tab: 'exam' },
    );
  }
  if (parts.length === 3) {
    const yk = parts[2];
    const rounds = listRounds(state.catalog, exam, yk);
    return chrome(
      `${top(yearLabel(yk), `#/exam/${examSlug(exam)}`)}
      ${rounds
        .map(
          (r) => `<button class="list-btn" type="button" data-go="#/exam/${examSlug(exam)}/${encodeURIComponent(yk)}/${encodeURIComponent(r.roundKey)}">
            <span>${esc(r.label)}</span>
            <span class="meta">${r.questions.length}문항</span>
          </button>`,
        )
        .join('')}`,
      { tab: 'exam' },
    );
  }
  const sess = getSession(state.catalog, exam, parts[2], parts[3]);
  if (!sess) return chrome(`${top('없음', '#/exam')}<p>해당 회차가 없습니다.</p>`, { tab: 'exam' });
  const isPilgi = exam === '필기';
  return chrome(
    `${top(sess.label, `#/exam/${examSlug(exam)}/${encodeURIComponent(parts[2])}`)}
    <div class="card" data-testid="year-exam-screen">
      <p>${esc(exam)} · ${sess.questions.length}문항</p>
      ${
        isPilgi
          ? `<label class="check"><input type="checkbox" id="opt-immediate" ${
              state.settings.immediate ? 'checked' : ''
            }><span>푸는 즉시 채점</span></label>
             <label class="check"><input type="checkbox" id="opt-timer" ${
               state.settings.timer ? 'checked' : ''
             }><span>타이머 2시간 30분</span></label>`
          : `<p class="muted">정답을 스스로 펼친 뒤 맞음 / 애매 / 틀림으로 표시합니다.</p>`
      }
      <button class="btn primary" type="button" data-act="start-year" data-testid="session-start">풀기 시작</button>
    </div>`,
    { tab: 'exam' },
  );
}

function viewPlay() {
  const sess = state.session;
  if (!sess) return chrome(`${top('세션 없음', '#/')}<p>풀고 있는 문제가 없습니다.</p>`, { tab: 'exam' });
  const q = sess.questions[sess.index];
  if (!q) return chrome(`${top(sess.title, '#/exam')}<p>문항이 없습니다.</p>`, { tab: 'exam' });
  const reveal =
    sess.revealed[q.id] || (sess.immediate && sess.grades[q.id] && q.exam === '필기');
  const self = q.exam === '실기' || q.answer == null || q.format !== 'mcq';
  const nums = sess.questions
    .map((item, i) => {
      const g = sess.grades[item.id];
      let cls = i === sess.index ? 'on' : '';
      if (g === 'correct') cls += ' ok';
      else if (g === 'wrong') cls += ' ng';
      else if (g === 'unsure') cls += ' mid';
      else if (sess.answers[item.id] != null || sess.revealed[item.id]) cls += ' did';
      return `<button type="button" class="${cls.trim()}" data-act="jump" data-i="${i}">${i + 1}</button>`;
    })
    .join('');
  const body = `<div class="card">
      <div class="play-head">
        <div><b>${sess.index + 1}</b> / ${sess.questions.length}
          <span class="muted"> · ${esc(q.subject || '')} · ${esc(q.topic || '')}</span>
        </div>
        ${
          sess.timerOn && sess.remain != null
            ? `<div class="timer" data-testid="timer">${fmtTime(sess.remain)}</div>`
            : ''
        }
      </div>
      ${kecBits(q)}
      ${stemHtml(q)}
      ${q.choices ? choicesHtml(q, sess.answers[q.id], sess.grades[q.id], reveal && !self) : ''}
      ${
        self
          ? `${
              sess.revealed[q.id]
                ? `${explainHtml(q)}
                   <div class="btn-row" style="margin-top:12px">
                     <button class="btn good" type="button" data-act="self" data-g="correct">맞음</button>
                     <button class="btn warn" type="button" data-act="self" data-g="unsure">애매</button>
                     <button class="btn bad" type="button" data-act="self" data-g="wrong">틀림</button>
                   </div>`
                : `<button class="btn" type="button" data-act="reveal" data-testid="reveal-answer">정답 · 해설 보기</button>`
            }`
          : `${reveal ? explainHtml(q) : ''}`
      }
    </div>`;
  return chrome(
    `${top(sess.title, '#/exam')}
    <div class="play-grid" data-testid="play-screen">
      <div>${body}</div>
      <div>
        <div class="qnums">${nums}</div>
        <div class="pager">
          <button class="btn" type="button" data-act="prev" ${sess.index === 0 ? 'disabled' : ''}>이전</button>
          <button class="btn" type="button" data-act="next" ${
            sess.index >= sess.questions.length - 1 ? 'disabled' : ''
          }>다음</button>
        </div>
        <button class="btn primary" style="width:100%" type="button" data-act="submit" data-testid="submit-exam">채점 · 종료</button>
      </div>
    </div>`,
    { tab: 'exam', hideTabs: false },
  );
}

function viewResult() {
  const r = state.result;
  if (!r) return chrome(`${top('결과 없음', '#/')}<p>제출한 시험이 없습니다.</p>`, { tab: 'exam' });
  const score = r.score;
  let head = '';
  if (score) {
    head = `<div class="card" data-testid="result-score">
      <p><b>${score.pass ? '합격' : '불합격'}</b> · 평균 ${score.avg}점 ${
        score.anyFail ? '· 과락' : ''
      }</p>
      ${score.subjects
        .map(
          (s) => `<div class="score-row ${s.fail ? 'fail' : ''}">
            <span>${esc(s.subject)}</span>
            <span>${s.percent}점 ${s.fail ? '과락' : ''} (${s.correct}/${s.total})</span>
          </div>`,
        )
        .join('')}
      <p class="small muted">과목 40점 미만이면 과락, 전과목 평균 60점 이상이면 합격입니다.</p>
    </div>`;
  } else {
    const vals = Object.values(r.grades);
    const ok = vals.filter((g) => g === 'correct').length;
    const mid = vals.filter((g) => g === 'unsure').length;
    const ng = vals.filter((g) => g === 'wrong').length;
    head = `<div class="card"><p>맞음 ${ok} · 애매 ${mid} · 틀림 ${ng} · 미채점 ${r.questions.length - vals.length}</p></div>`;
  }
  return chrome(
    `${top('결과', '#/exam')}${head}
    <p><button class="btn" type="button" data-go="#/study/wrong">오답노트로</button>
       <button class="btn" type="button" data-go="#/study/analysis">유형 분석</button></p>`,
    { tab: 'exam' },
  );
}

function viewStudy() {
  return chrome(
    `${top('학습', '#/')}
    <div class="grid tiles">
      <button class="tile" type="button" data-go="#/study/analysis" data-testid="open-analysis">
        <b>오답 유형 분석</b>
        <span class="muted">약한 과목 · 주제</span>
      </button>
      <button class="tile" type="button" data-go="#/study/mock" data-testid="open-mock">
        <b>유형 모의고사</b>
        <span class="muted">약한 주제 위주</span>
      </button>
      <button class="tile" type="button" data-go="#/study/wrong" data-testid="open-wrong">
        <b>오답노트</b>
        <span class="muted">해설 · 메모 · 익힘</span>
      </button>
    </div>`,
    { tab: 'study' },
  );
}

function viewAnalysis() {
  const { subjects, topics, reviewAreas } = analyzeAttempts(state.data.questions, state.attempts);
  const row = (t, label) => {
    const pct = Math.round(t.accuracy * 100);
    const cls = pct < 50 ? 'bad' : pct < 70 ? '' : 'good';
    return `<div class="card">
      <div class="score-row"><span>${esc(label)}</span><span>${pct}% · 틀림·애매 ${t.miss}</span></div>
      <div class="bar ${cls}"><i style="width:${pct}%"></i></div>
    </div>`;
  };
  return chrome(
    `${top('오답 유형 분석', '#/study')}
    <div data-testid="analysis-screen">
      <h2 class="small muted">복습 필요 영역</h2>
      ${
        reviewAreas.length
          ? reviewAreas.map((a) => row(a, `${a.subject} · ${a.topic}`)).join('')
          : '<p class="muted">아직 틀린 기록이 없습니다. 기출을 한 회차 풀어 보세요.</p>'
      }
      <h2 class="small muted">과목</h2>
      ${subjects.length ? subjects.map((s) => row(s, s.subject)).join('') : '<p class="muted">기록 없음</p>'}
      <h2 class="small muted">주제</h2>
      ${topics.slice(0, 20).map((t) => row(t, t.topic)).join('')}
    </div>`,
    { tab: 'study' },
  );
}

function viewMock() {
  return chrome(
    `${top('유형 모의고사', '#/study')}
    <div class="card">
      <p class="muted">약한 주제를 먼저 넣고, 같은 키워드로 채운 뒤 최근 맞은 문항은 빼습니다.</p>
      <label class="field">시험
        <select id="mock-exam">
          <option value="">전체</option>
          <option value="필기">필기</option>
          <option value="실기">실기</option>
        </select>
      </label>
      <label class="field">문항 수
        <select id="mock-size" data-testid="mock-size">
          ${MOCK_SIZES.map((n) => `<option value="${n}">${n}</option>`).join('')}
        </select>
      </label>
      <button class="btn primary" type="button" data-act="start-mock" data-testid="start-mock">출제</button>
    </div>`,
    { tab: 'study' },
  );
}

function viewWrong() {
  const groups = wrongNoteItems(state.data.questions, state.attempts, state.memos, state.mastered);
  const { reviewAreas } = analyzeAttempts(state.data.questions, state.attempts);
  const summary = reviewAreas.length
    ? `<div class="card"><b>복습 필요 영역</b><p>${reviewAreas
        .map((a) => `${esc(a.topic)} (${a.miss})`)
        .join(' · ')}</p></div>`
    : '';
  const body = groups.length
    ? groups
        .map((g) => {
          const items = g.items
            .map((it) => {
              const q = it.question;
              return `<article class="card note-item" data-qid="${esc(q.id)}">
                <h3>${esc(q.subject || '')} · ${q.number ?? ''}번</h3>
                ${kecBits(q)}
                ${stemHtml(q)}
                ${explainHtml(q)}
                <label class="field">메모
                  <textarea data-memo="${esc(q.id)}">${esc(it.memo)}</textarea>
                </label>
                <div class="btn-row">
                  <button class="btn" type="button" data-act="save-memo" data-id="${esc(q.id)}">메모 저장</button>
                  <button class="btn good" type="button" data-act="master" data-id="${esc(q.id)}">익힘으로 표시</button>
                </div>
              </article>`;
            })
            .join('');
          return `<h2>${esc(g.topic)} <span class="muted">· ${g.items.length}문항</span></h2>${items}`;
        })
        .join('')
    : '<p class="muted">틀린 문항이 아직 없습니다.</p>';
  return chrome(
    `${top('오답노트', '#/study')}<div data-testid="wrong-screen">${summary}${body}</div>`,
    { tab: 'study' },
  );
}

function viewFrequent() {
  const topics = frequentTopics(state.data.questions, '실기');
  const list = topics.length
    ? topics
        .map(
          (t) => `<button class="list-btn" type="button" data-act="freq-topic" data-topic="${esc(t.topic)}">
            <span>${esc(t.topic)}</span>
            <span class="meta">이전 출제 ${t.prev} · ${t.count}문항</span>
          </button>`,
        )
        .join('')
    : '<p class="muted">실기 빈출 데이터가 없습니다.</p>';
  return chrome(
    `${top('빈출 주제', '#/')}
    <div class="card">
      <p class="muted">실기는 예전 기출이 다시 나오는 경우가 많습니다. prev_years · 주제 빈도로 정렬했습니다.</p>
      <button class="btn primary" type="button" data-act="start-freq" data-testid="start-freq">빈도순 20문항</button>
    </div>
    ${list}`,
    { tab: 'freq' },
  );
}

function viewSettings() {
  return chrome(
    `${top('설정', '#/')}
    <div class="card">
      <label class="field">화면
        <select id="theme" data-testid="theme">
          <option value="system" ${state.settings.theme === 'system' ? 'selected' : ''}>시스템</option>
          <option value="light" ${state.settings.theme === 'light' ? 'selected' : ''}>밝게</option>
          <option value="dark" ${state.settings.theme === 'dark' ? 'selected' : ''}>어둡게</option>
        </select>
      </label>
      <label class="check"><input type="checkbox" id="set-immediate" ${
        state.settings.immediate ? 'checked' : ''
      }><span>필기 기본: 즉시 채점</span></label>
      <label class="check"><input type="checkbox" id="set-timer" ${
        state.settings.timer ? 'checked' : ''
      }><span>필기 기본: 타이머</span></label>
      <div class="btn-row">
        <button class="btn" type="button" data-act="export">학습 기록 내보내기</button>
        <button class="btn" type="button" data-act="import">가져오기</button>
      </div>
      <input type="file" id="import-file" accept="application/json" hidden>
      <p class="small muted">아이패드 저장 공간이 지워질 수 있으니 JSON으로 백업해 두세요.</p>
      <button class="btn bad" type="button" data-act="lock">잠그기</button>
    </div>`,
    { tab: 'set' },
  );
}

function view() {
  if (!state.unlocked) return viewUnlock();
  const n = state.route.name;
  if (n === 'home') return viewHome();
  if (n === 'exam') return viewExamPick();
  if (n === 'play') return viewPlay();
  if (n === 'result') return viewResult();
  if (n === 'study' && state.route.parts[1] === 'analysis') return viewAnalysis();
  if (n === 'study' && state.route.parts[1] === 'mock') return viewMock();
  if (n === 'study' && state.route.parts[1] === 'wrong') return viewWrong();
  if (n === 'study') return viewStudy();
  if (n === 'frequent') return viewFrequent();
  if (n === 'settings') return viewSettings();
  return viewHome();
}

export function render() {
  const el = root();
  if (!el) return;
  el.innerHTML = view();
  bind(el);
  const play = el.querySelector('[data-testid="play-screen"]') || el.querySelector('[data-testid="wrong-screen"]');
  if (play && state.images) hydrateQuestion(play, state.images);
}

function bind(el) {
  el.querySelectorAll('[data-go]').forEach((n) => {
    n.addEventListener('click', () => go(n.getAttribute('data-go')));
  });
  el.querySelectorAll('[data-act]').forEach((n) => {
    n.addEventListener('click', () => onAct(n.getAttribute('data-act'), n));
  });
  const pass = el.querySelector('#pass');
  if (pass) {
    pass.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onAct('unlock');
    });
    if (!state.unlocking) pass.focus();
  }
  el.querySelector('#remember')?.addEventListener('change', (e) => {
    state.remember = e.target.checked;
  });
  el.querySelector('#theme')?.addEventListener('change', async (e) => {
    state.settings.theme = e.target.value;
    applyTheme();
    await saveSettings(state.settings);
  });
  el.querySelector('#set-immediate')?.addEventListener('change', async (e) => {
    state.settings.immediate = e.target.checked;
    await saveSettings(state.settings);
  });
  el.querySelector('#set-timer')?.addEventListener('change', async (e) => {
    state.settings.timer = e.target.checked;
    await saveSettings(state.settings);
  });
  el.querySelectorAll('[data-choice]').forEach((n) => {
    n.addEventListener('click', () => onChoice(Number(n.getAttribute('data-choice'))));
  });
}

async function onChoice(n) {
  const sess = state.session;
  if (!sess) return;
  const q = sess.questions[sess.index];
  sess.answers[q.id] = n;
  if (!sess.immediate || q.exam !== '필기' || q.format !== 'mcq' || q.answer == null) {
    render();
    return;
  }
  const g = gradeMcq(q, n);
  if (g) {
    sess.grades[q.id] = g;
    await persistGrade(q, g, sess.mode);
  }
  render();
}

async function onAct(act, node) {
  if (act === 'unlock') {
    const pass = document.querySelector('#pass')?.value || '';
    const remember = document.querySelector('#remember')?.checked || false;
    state.remember = remember;
    if (!pass) {
      state.unlockError = '암호를 입력하세요';
      render();
      return;
    }
    await unlockWithPassphrase(pass, remember);
    return;
  }
  if (act === 'apply-update') {
    if (window.__eceUpdateSW) window.__eceUpdateSW();
    else location.reload();
    return;
  }
  if (act === 'start-year') {
    const parts = state.route.parts;
    const exam = examFromSlug(parts[1]);
    const sess = getSession(state.catalog, exam, parts[2], parts[3]);
    if (!sess) return;
    const immediate = document.querySelector('#opt-immediate')?.checked ?? state.settings.immediate;
    const timer = document.querySelector('#opt-timer')?.checked ?? false;
    startSession({
      questions: sess.questions,
      title: sess.label,
      exam,
      mode: 'year',
      immediate,
      timer,
    });
    return;
  }
  if (act === 'prev' && state.session) {
    state.session.index = Math.max(0, state.session.index - 1);
    render();
    return;
  }
  if (act === 'next' && state.session) {
    state.session.index = Math.min(state.session.questions.length - 1, state.session.index + 1);
    render();
    return;
  }
  if (act === 'jump' && state.session) {
    state.session.index = Number(node.dataset.i);
    render();
    return;
  }
  if (act === 'reveal' && state.session) {
    const q = state.session.questions[state.session.index];
    state.session.revealed[q.id] = true;
    render();
    return;
  }
  if (act === 'self' && state.session) {
    const q = state.session.questions[state.session.index];
    const g = node.dataset.g;
    state.session.grades[q.id] = g;
    await persistGrade(q, g, state.session.mode);
    render();
    return;
  }
  if (act === 'submit') {
    await submitSession();
    return;
  }
  if (act === 'start-mock') {
    const exam = document.querySelector('#mock-exam')?.value || null;
    const size = Number(document.querySelector('#mock-size')?.value || 20);
    const qs = selectMockExam(state.data.questions, state.attempts, {
      size,
      exam: exam || null,
      mastered: state.mastered,
    });
    if (!qs.length) {
      setToast('출제할 문항이 없습니다');
      return;
    }
    startSession({
      questions: qs,
      title: `유형 모의고사 ${qs.length}문항`,
      exam: exam || qs[0].exam,
      mode: 'mock',
      immediate: exam === '실기' ? false : state.settings.immediate,
      timer: false,
    });
    return;
  }
  if (act === 'start-freq') {
    const rows = rankFrequent(state.data.questions, '실기').slice(0, 20);
    startSession({
      questions: rows.map((r) => r.question),
      title: '빈출 20문항',
      exam: '실기',
      mode: 'frequent',
      immediate: false,
      timer: false,
    });
    return;
  }
  if (act === 'freq-topic') {
    const topic = node.dataset.topic;
    const qs = rankFrequent(state.data.questions, '실기')
      .filter((r) => r.question.topic === topic)
      .map((r) => r.question);
    startSession({
      questions: qs,
      title: topic,
      exam: '실기',
      mode: 'frequent',
      immediate: false,
      timer: false,
    });
    return;
  }
  if (act === 'save-memo') {
    const id = node.dataset.id;
    const text = document.querySelector(`[data-memo="${CSS.escape(id)}"]`)?.value || '';
    state.memos = { ...state.memos, [id]: text };
    await saveMemos(state.memos);
    setToast('메모를 저장했습니다');
    return;
  }
  if (act === 'master') {
    const id = node.dataset.id;
    state.mastered = { ...state.mastered, [id]: true };
    await saveMastered(state.mastered);
    render();
    return;
  }
  if (act === 'export') {
    const data = await exportBackup();
    downloadJson(`ece-study-backup-${new Date().toISOString().slice(0, 10)}.json`, data);
    return;
  }
  if (act === 'import') {
    const input = document.querySelector('#import-file');
    if (!input) return;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const payload = await readJsonFile(file);
        await importBackup(payload);
        const meta = await loadProgressMeta();
        state.memos = meta.memos;
        state.mastered = meta.mastered;
        state.settings = { ...state.settings, ...meta.settings };
        state.attempts = await allAttempts();
        applyTheme();
        setToast('기록을 가져왔습니다');
      } catch (e) {
        setToast(e.message || '가져오기에 실패했습니다');
      }
    };
    input.click();
    return;
  }
  if (act === 'lock') {
    await lockApp();
  }
}

export async function boot() {
  window.addEventListener('hashchange', () => {
    state.route = parseRoute();
    if (!state.unlocked && state.route.name !== 'unlock') {
      location.hash = '#/unlock';
      return;
    }
    render();
  });
  window.addEventListener('ece-sw-update', () => {
    state.needUpdate = true;
    render();
  });
  const meta = await loadProgressMeta();
  state.memos = meta.memos;
  state.mastered = meta.mastered;
  state.settings = meta.settings;
  state.remember = !!meta.settings.remember;
  state.attempts = await allAttempts();
  applyTheme();
  const auto = await tryAutoUnlock();
  if (!auto) {
    if (location.hash && location.hash !== '#/unlock' && location.hash !== '#/' && location.hash !== '') {
      location.hash = '#/unlock';
    } else {
      location.hash = '#/unlock';
    }
    state.route = parseRoute();
    render();
  }
  if (import.meta.env.DEV) {
    window.__ece = {
      state,
      selectMockExam,
      analyzeAttempts,
      persistGrade,
    };
  }
}
