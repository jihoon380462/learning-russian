import { createStore, validateBackup } from './store.js';
import { lessons, previewLesson, stages, curriculumLevels } from './content.js';

const icons = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  book: '<path d="M12 5C9 2 4 3 2 4v15c3-2 7-1 10 1 3-2 7-3 10-1V4c-3-1-7-2-10 1ZM12 5v15"/>',
  review: '<path d="M20 7a9 9 0 0 0-15-2L2 8m0-6v6h6m-4 9a9 9 0 0 0 15 2l3-3m0 6v-6h-6"/>',
  bookmark: '<path d="M6 3h12a1 1 0 0 1 1 1v18l-7-5-7 5V4a1 1 0 0 1 1-1Z"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>',
  back: '<path d="m14 5-7 7 7 7M7 12h14"/>',
  pen: '<path d="m15 3 6 6-11 11-7 1 1-7ZM13 5l6 6"/>',
  flag: '<path d="M5 22V3c5-4 9 4 14 0v11c-5 4-9-4-14 0"/>',
  play: '<path d="m8 4 13 8-13 8Z"/>',
  sparkle: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3ZM20 2v4m-2-2h4"/>',
  close: '<path d="m5 5 14 14M5 19 19 5"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  download: '<path d="M12 2v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.book}</svg>`;
const escape = (v = '') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attr = escape;
const store = createStore();
const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
let state = store.getState();
let referenceTab = 'expression';
let reviewFilter = 'due';
let searchQuery = '';
let revealedReviewId = null;
let editingDraftId = null;
let toastTimer;
let pendingBackup;
let previousFocus;
const lessonFor = id => lessons.find(l => l.id === id) || previewLesson;
const lessonsForLevel = level => lessons.filter(l => l.level === level);
const availableLevels = () => curriculumLevels.filter(level => lessonsForLevel(level.id).length);
const topicTitle = lesson => curriculumLevels.find(level => level.id === lesson.level)?.topics.find(topic => topic.id === lesson.topic)?.title || '';
const route = () => location.hash.slice(1) || 'home';
const currentLesson = () => {
  try { return lessonFor(decodeURIComponent(route().split('/')[1] || 'preview')); }
  catch { return previewLesson; }
};
const dateLabel = value => new Date(value).toLocaleDateString('ko-KR', {month:'long',day:'numeric'});
const dueReviews = () => state.reviews.filter(r => new Date(r.dueAt) <= new Date());
const stripStress = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function sync() {
  state = store.getState();
  const warning = document.querySelector('#storage-warning');
  warning.hidden = !store.getStorageError();
  warning.textContent = store.getStorageError() ? '브라우저에 저장할 수 없어 이 탭에서만 보관 중이에요. 설정에서 백업을 내려받아 주세요.' : '';
}
function toast(message) {
  const node = document.querySelector('#toast');
  clearTimeout(toastTimer); node.textContent = message; node.hidden = false;
  toastTimer = setTimeout(() => { node.hidden = true; }, 3500);
}
function go(path) { if (route() === path) render(); else location.hash = path; }
function button(text, action, cls = 'secondary', extras = '') {
  return `<button class="button ${cls}" data-action="${action}" ${extras}>${text}</button>`;
}
function empty(title, description, action = '') {
  return `<div class="empty-state"><div class="empty-icon">${icon('book')}</div><h3 class="empty-title">${title}</h3><p>${description}</p>${action}</div>`;
}
function sentenceCard(sentence, compact = false) {
  const review = state.reviews.find(r => r.sentenceId === sentence.id);
  return `<article class="sentence-card ${compact ? 'sentence-preview' : 'card'}">
    <div class="row"><span class="sentence-marker">${icon('bookmark')}</span><div class="grow"><p class="sentence-text" lang="ru">${escape(sentence.text)}</p>${sentence.translation ? `<p class="translation">${escape(sentence.translation)}</p>` : ''}</div></div>
    ${compact ? '' : `<div class="sentence-meta"><span class="sentence-date">${dateLabel(sentence.createdAt)}</span>${review ? '<span class="chip">복습 중</span>' : ''}</div><div class="card-actions">${button(icon('play')+'듣기','speak','ghost small',`data-text="${attr(sentence.text)}" aria-label="문장 듣기"`)}${button(icon('pen')+'수정','edit','ghost small',`data-id="${attr(sentence.id)}"`)}${button(icon('sparkle')+'AI 교정','feedback','ghost small',`data-id="${attr(sentence.id)}"`)}${button(icon('review')+(review?'복습 해제':'복습에 추가'),review?'remove-review':'add-review','ghost small',`data-id="${attr(review?.id || sentence.id)}"`)}<button class="icon-button danger" data-action="delete" data-id="${attr(sentence.id)}" aria-label="문장 삭제">${icon('trash')}</button></div>`}
  </article>`;
}
function home() {
  const completed = lessons.filter(l => state.progress[l.id]?.completed).length;
  const completedAll = lessons.length > 0 && completed === lessons.length;
  const next = lessons.find(l => !state.progress[l.id]?.completed) || lessons[0];
  const levels = availableLevels();
  const levelProgress = levels.map(level => {
    const items = lessonsForLevel(level.id);
    const done = items.filter(l => state.progress[l.id]?.completed).length;
    return `<a href="#lessons/${level.id}" class="level-progress"><span>${level.id}${done===items.length?' 완료':''}</span><span>${done} / ${items.length}</span></a>`;
  }).join('');
  const recent = [...state.sentences].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0,2);
  const today = new Date().toLocaleDateString('en-CA');
  const todayCount = state.sentences.filter(s => new Date(s.createdAt).toLocaleDateString('en-CA') === today).length;
  return `<div class="page home-page"><div class="page-heading"><p class="eyebrow">나의 속도로, 나의 문장으로</p><h1>오늘의 러시아어</h1><span class="heading-stroke" aria-hidden="true"></span></div>
    <div class="home-grid"><section class="hero card"><div class="hero-copy"><span class="badge">${completedAll?escape(levels.map(level=>level.id).join('·'))+' 한 바퀴 완료':next?(escape(next.level)+' · 오늘의 레슨'):'나만의 러시아어 노트'}</span><h2>${completedAll?'이제, 내 이야기로<br>이어가 볼까요?':next?escape(next.title):'문장 하나로<br>시작하는 러시아어'}</h2><p>${completedAll?'배운 표현을 다시 꺼내 새로운 상황에 활용해 보세요.':next?escape(next.description):'작은 표현을 모아,<br>내 생각을 문장으로 만들어 보세요.'}</p><a class="button primary" href="${completedAll?'#lessons':'#study/'+(next?encodeURIComponent(next.id):'preview')}">${completedAll?'레슨 다시 살펴보기':next?'이어서 학습':'문장 연습하기'} ${icon('arrow')}</a></div><img class="hero-art" src="./assets/stationery.svg" alt="종이 위에 놓인 버건디색 펜" width="200" height="220"></section>
    <div class="stats-grid"><section class="stat-card progress-card"><div class="title-row"><h2>학습 진도</h2>${icon('flag')}</div><p>${lessons.length?`${lessons.length}개 레슨 중 ${completed}개 완료`:'정식 레슨 준비 중'}</p><div class="progress-track" role="progressbar" aria-label="전체 레슨 완료율" aria-valuenow="${lessons.length?Math.round(completed/lessons.length*100):0}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${lessons.length?completed/lessons.length*100:0}%"></div></div>${levelProgress}<a class="text-link" href="#lessons">레슨 살펴보기 ${icon('arrow')}</a></section><section class="stat-card review-card"><div class="title-row"><h2>오늘의 복습</h2>${icon('review')}</div><p>기다리는 문장 <strong>${dueReviews().length}개</strong></p><a class="button secondary small" href="#review">복습하기 ${icon('arrow')}</a></section></div>
    <section class="recent-card card"><div class="section-heading"><h2>내가 저장한 문장</h2><a class="text-link" href="#sentences">더 보기 ${icon('arrow')}</a></div>${recent.length?recent.map(s=>sentenceCard(s,true)).join(''):empty('첫 문장을 기다리고 있어요','완벽하지 않아도 좋아요. 떠오르는 생각을 적어 보세요.')}</section></div>
    <div class="daily-strip">${icon('pen')}<span>오늘 쓴 문장 <strong>${todayCount}</strong><span class="subtle"> / ${state.settings.dailyGoal}개</span></span><span class="subtle">조금씩, 꾸준히</span></div>
  </div>`;
}
function lessonsPage() {
  const levels = availableLevels();
  const requestedLevel = route().split('/')[1];
  const next = lessons.find(l => !state.progress[l.id]?.completed) || lessons[0];
  const level = levels.find(item => item.id === requestedLevel) || levels.find(item => item.id === next?.level) || levels[0];
  const levelLessons = level ? lessonsForLevel(level.id) : [];
  const topics = [...new Set(levelLessons.map(l => l.topic))];
  const nextTopic = (levelLessons.find(l => !state.progress[l.id]?.completed) || levelLessons[0])?.topic;
  const completed = levelLessons.filter(l => state.progress[l.id]?.completed).length;
  const levelChoices = `<nav class="level-choices" aria-label="학습 수준">${levels.map(item => {
    const items = lessonsForLevel(item.id);
    const done = items.filter(l => state.progress[l.id]?.completed).length;
    return `<a href="#lessons/${item.id}" class="level-choice ${item.id===level?.id?'active':''}" ${item.id===level?.id?'aria-current="true"':''}><strong>${item.id} · ${escape(item.label)}</strong><span>${done} / ${items.length} 완료</span></a>`;
  }).join('')}</nav>`;
  const groups = topics.map(topic => {
    const items = levelLessons.filter(l => l.topic === topic);
    const completed = items.filter(l => state.progress[l.id]?.completed).length;
    const title = level.topics.find(t => t.id === topic)?.title || '레슨';
    return `<details class="topic-group card" ${topic===nextTopic?'open':''}><summary><span class="topic-title">${topic?`<span class="topic-number">${String(topic).padStart(2,'0')}</span>`:''}${escape(title)}</span><span class="topic-progress">${completed} / ${items.length} 완료</span></summary><div class="topic-lessons">${items.map(l=>`<a href="#study/${encodeURIComponent(l.id)}" class="lesson-link"><span class="lesson-number">${escape(l.number)}</span><div class="grow"><h3>${escape(l.title)}</h3><p class="subtle">${escape(l.description)}</p><span class="lesson-status">${state.progress[l.id]?.completed?'완료':state.progress[l.id]?'학습 중':'시작하기'}</span></div>${state.progress[l.id]?.completed?icon('check'):icon('arrow')}</a>`).join('')}</div></details>`;
  }).join('');
  return `<div class="page"><div class="page-heading"><p class="eyebrow">INPUT TO CREATE</p><h1>나의 학습 여정</h1><p class="subtle">이해한 표현을 나만의 문장으로 연결해요.</p></div>${level?`${levelChoices}<section class="curriculum-intro"><span class="badge">${level.id} · ${escape(level.label)}</span><h2>${topics.length}개 주제, ${levelLessons.length}개 레슨</h2><p>${escape(level.description)}</p>${completed===levelLessons.length?'<p class="level-complete">이 수준의 레슨을 모두 마쳤어요. 필요한 표현을 다시 활용해 보세요.</p>':''}</section><div class="stack">${groups}</div><p class="progress-note">B1부터 C2까지의 레슨은 차례로 준비할 예정이에요.</p>`:`<section class="card">${empty('커리큘럼을 준비하고 있어요','학습 콘텐츠가 추가되면 이곳에서 순서대로 만나볼 수 있어요.')}</section>`}<section class="card sample-card"><span class="badge">화면 체험용</span><h2>취향 말하기</h2><p>샘플 표현으로 여섯 단계의 학습 흐름과 문장 작성을 체험해 보세요.</p><a class="button secondary" href="#study/preview">샘플 레슨 열기 ${icon('arrow')}</a><p class="optional-note">샘플은 정식 학습 진도에 포함되지 않아요.</p></section></div>`;
}
function learningList(items, cls = '') {
  return items?.length ? `<ul class="learning-list ${cls}">${items.map(item=>`<li>${escape(item)}</li>`).join('')}</ul>` : '';
}
function grammarContent(grammar) {
  const table = grammar.table;
  return `<p class="pattern">${escape(grammar.pattern)}</p><p class="grammar-explanation">${escape(grammar.explanation)}</p>${learningList(grammar.notes)}${table?`<div class="grammar-table-wrap" role="region" aria-label="형태와 용법 정리" tabindex="0"><table class="grammar-table"><caption>형태와 용법 정리</caption><thead><tr>${table.headers.map(h=>`<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${table.rows.map(row=>`<tr>${row.map((cell,i)=>i===0?`<th scope="row">${escape(cell)}</th>`:`<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:''}`;
}
function reference(lesson) {
  const e = lesson.examples[0];
  const body = referenceTab==='grammar' ? grammarContent(lesson.grammar) : referenceTab==='examples' ? lesson.examples.map(e=>example(e)).join('') : `<div class="pattern"><span class="chip">문법</span><span>${escape(lesson.grammar.pattern)}</span></div>${example(e)}`;
  return `<section class="reference-card card"><div class="reference-tabs" role="tablist" aria-label="참고 자료">${[['expression','표현'],['grammar','문법'],['examples','예문']].map(([id,name])=>`<button id="tab-${id}" role="tab" aria-controls="reference-panel" aria-selected="${referenceTab===id}" data-action="reference" data-tab="${id}" class="${referenceTab===id?'active':''}">${name}</button>`).join('')}</div><div id="reference-panel" class="reference-content" role="tabpanel" aria-labelledby="tab-${referenceTab}">${body}</div><div class="word-chips"><span class="chip">참고 단어</span>${lesson.words.map(w=>`<button class="word-chip" data-action="speak" data-text="${attr(w.ru)}" aria-label="${attr(w.ru)} 듣기"><b lang="ru">${escape(w.ru)}</b><span>${escape(w.meaning)}</span></button>`).join('')}</div></section>`;
}
function example(e) {
  return `<div class="example-line"><button class="play-button" data-action="speak" data-text="${attr(e.ru)}" aria-label="예문 듣기">${icon('play')}</button><div><p class="ru" lang="ru">${escape(e.ru)}</p><p class="translation">${escape(e.meaning)}</p></div></div>`;
}
function writing(lesson) {
  const draft=state.drafts[lesson.id] || '';
  return `<section class="writing-card card"><div class="writing-heading">${icon('pen')}<h2>내 문장 만들기</h2></div><p class="writing-tip">${escape(lesson.prompt)}</p>${lesson.creationHints?.length?`<details class="creation-hints"><summary>막힐 때 참고하기</summary>${learningList(lesson.creationHints)}</details>`:''}<label for="sentence-input" class="sr-only">러시아어 문장 입력</label><textarea id="sentence-input" class="sentence-input" rows="5" maxlength="2000" spellcheck="false" lang="ru" placeholder="나만의 러시아어 문장을 적어 보세요" data-lesson="${attr(lesson.id)}">${escape(draft)}</textarea><div class="input-meta"><span id="draft-status">${draft?'임시 저장된 문장':''}</span><span><span id="char-count">${draft.length}</span> / 2,000</span></div><div class="writing-actions">${button('문장 저장 '+icon('arrow'),'save-sentence','primary')}${button(icon('sparkle')+'AI 교정 요청','feedback','secondary')}</div><p class="optional-note">AI 교정은 필요할 때 선택할 수 있어요.</p></section>`;
}
function studyPage() {
  const lesson=currentLesson();
  const step=state.progress[lesson.id]?.step ?? (lesson.isPreview?3:0);
  let body='';
  if(step===0) body=`<section class="step-card card"><p class="eyebrow">INPUT</p><h2>표현을 만나 보세요</h2><p class="subtle">강세를 보고, 소리를 들으며 따라 읽어 보세요.</p><div class="word-list">${lesson.words.map(w=>`<div class="word-row"><div class="grow"><p class="ru" lang="ru">${escape(w.ru)}</p><p class="translation">${escape(w.meaning)}</p>${w.note?`<p class="word-note">${escape(w.note)}</p>`:''}</div><button class="play-button" data-action="speak" data-text="${attr(w.ru)}" aria-label="${attr(w.ru)} 듣기">${icon('play')}</button></div>`).join('')}</div></section>`;
  if(step===1) body=`<section class="step-card card"><p class="eyebrow">UNDERSTAND</p><h2>문장의 원리 이해하기</h2><div class="grammar-box">${grammarContent(lesson.grammar)}</div>${lesson.examples.map(example).join('')}</section>`;
  if(step===2) body=`<section class="step-card card"><p class="eyebrow">REPEAT</p><h2>읽고, 듣고, 말해 보세요</h2><p class="subtle">예문을 소리 내어 읽으며 문장의 리듬을 익혀요.</p>${lesson.examples.map(e=>`<div class="example-card"><p class="ru" lang="ru">${escape(e.ru)}</p><details><summary>뜻 확인하기</summary><p>${escape(e.meaning)}</p></details><div class="practice-nav">${button(icon('play')+'듣기','speak','secondary small',`data-text="${attr(e.ru)}"`)}${button('천천히 듣기','speak','ghost small',`data-text="${attr(e.ru)}" data-rate="0.65"`)}</div></div>`).join('')}</section>`;
  if(step===3) body=reference(lesson)+writing(lesson);
  if(step===4) body=`<section class="step-card card"><p class="eyebrow">FEEDBACK · 선택</p><h2>내 문장을 한 번 더 살펴봐요</h2><p>스스로 읽어 보고, 도움이 필요하면 AI에 교정을 요청해 보세요.</p><p class="subtle">교정 요청문을 복사해 사용하는 AI에 전달할 수 있어요.</p></section>`+writing(lesson);
  if(step===4 && !state.drafts[lesson.id]) {
    const saved=[...state.sentences].filter(s=>s.lessonId===lesson.id).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
    if(saved)body=body.replace(writing(lesson), `<section class="card"><h2>최근 저장한 문장</h2>${sentenceCard(saved)}</section>`);
  }
  if(step===5) {
    const sentences=state.sentences.filter(s=>s.lessonId===lesson.id);
    body=`${lesson.reviewQuestions?.length?`<section class="step-card card"><p class="eyebrow">RECALL</p><h2>기억에서 꺼내 보기</h2><p class="subtle">설명을 덮고 말해 본 뒤, 배운 표현으로 새 문장을 하나 더 만들어 보세요.</p>${learningList(lesson.reviewQuestions)}</section>`:''}<section class="step-card card"><p class="eyebrow">REVIEW</p><h2>나중에 다시 꺼내 볼 문장</h2><p class="subtle">저장한 문장을 복습에 추가해 다시 활용해 보세요. 레슨을 완료해도 복습 일정은 따로 관리돼요.</p>${sentences.length?sentences.map(s=>sentenceCard(s)).join(''):empty('아직 저장한 문장이 없어요','창작 단계에서 내 문장을 하나 적어 보세요.',button('문장 만들러 가기','step','secondary','data-step="3"'))}</section>`;
  }
  return `<div class="page study-page"><div class="study-heading"><a class="back-link icon-button" href="${lesson.isPreview?'#lessons':'#lessons/'+encodeURIComponent(lesson.level)}" aria-label="레슨 목록">${icon('back')}</a><h1>${escape(lesson.title)}</h1><span class="step-counter">${step+1} / 6</span></div>${lesson.isPreview?'<p class="preview-notice">샘플 레슨 · 정식 학습 진도에 포함되지 않아요.</p>':`<p class="lesson-context">${escape(lesson.level)} · 레슨 ${escape(lesson.number)} · ${escape(topicTitle(lesson))}</p>`}<div class="stage-nav" aria-label="학습 단계">${stages.map((s,i)=>`<button class="stage ${i===step?'active':''}" data-action="step" data-step="${i}" ${i===step?'aria-current="step"':''}>${s.label}</button>`).join('')}</div>${step===0 && lesson.objectives?.length?`<section class="lesson-objectives"><h2>이번 레슨에서 할 수 있는 것</h2>${learningList(lesson.objectives)}</section>`:''}${body}<div class="step-footer">${step>0?button(icon('back')+'이전','step','ghost',`data-step="${step-1}"`):'<span></span>'}${step<5?button('다음 단계 '+icon('arrow'),'step','secondary',`data-step="${step+1}"`):button(lesson.isPreview?'연습 마치기':'레슨 완료','complete','primary')}</div></div>`;
}
function sentencesPage() {
  const filtered=[...state.sentences].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).filter(s=>stripStress(s.text+' '+s.translation).includes(stripStress(searchQuery)));
  return `<div class="page"><div class="page-heading"><p class="eyebrow">MY SENTENCES</p><div class="title-row"><h1>내 문장</h1><button class="icon-button" data-action="new-sentence" aria-label="새 문장 쓰기">${icon('plus')}</button></div><p class="subtle">내가 만든 ${state.sentences.length}개의 작은 표현들</p></div><label class="sr-only" for="search">저장한 문장 검색</label><input class="search-input" id="search" type="search" placeholder="러시아어 또는 뜻으로 찾기" value="${attr(searchQuery)}"><div class="sentence-list" id="sentence-results">${sentenceResults(filtered)}</div></div>`;
}
function sentenceResults(filtered) { return filtered.length?filtered.map(s=>sentenceCard(s)).join(''):empty(searchQuery?'일치하는 문장이 없어요':'첫 번째 문장을 남겨 보세요',searchQuery?'다른 단어나 뜻으로 찾아보세요.':'오늘 떠오른 생각을 러시아어로 적어 볼까요?',searchQuery?'':button('문장 쓰러 가기','new-sentence','primary')); }
function reviewPage() {
  const due=dueReviews();
  const upcoming=state.reviews.filter(r=>new Date(r.dueAt)>new Date()).sort((a,b)=>a.dueAt.localeCompare(b.dueAt));
  const review=due[0];
  const sentence=review && state.sentences.find(s=>s.id===review.sentenceId);
  return `<div class="page"><div class="page-heading"><p class="eyebrow">A LITTLE, AGAIN</p><h1>다시 만나는 문장</h1><p class="subtle">기억을 되짚고, 새로운 상황에 활용해 보세요.</p></div><div class="filter-tabs" aria-label="복습 목록"><button data-action="review-filter" data-filter="due" class="${reviewFilter==='due'?'active':''}">오늘의 복습 ${due.length}</button><button data-action="review-filter" data-filter="upcoming" class="${reviewFilter==='upcoming'?'active':''}">예정된 복습 ${upcoming.length}</button></div>${reviewFilter==='due'?sentence?`<section class="review-study card"><div class="section-heading"><span class="badge">${due.length}개 남았어요</span><button class="play-button" data-action="speak" data-text="${attr(sentence.text)}" aria-label="문장 듣기">${icon('play')}</button></div><p class="review-word" lang="ru">${escape(sentence.text)}</p>${revealedReviewId===review.id?`<div class="review-meaning">${sentence.translation?escape(sentence.translation):'저장된 뜻이 없어요. 이 문장을 새로운 상황에 활용해 보세요.'}</div><p class="subtle">소리 내어 읽고, 얼마나 기억나는지 선택해 주세요.</p><div class="rating-actions">${button('다시 연습<small>내일</small>','rate-review','secondary',`data-id="${attr(review.id)}" data-rating="again"`)}${button('기억나요<small>'+Math.min(36500,review.intervalDays*2||3)+'일 뒤</small>','rate-review','primary',`data-id="${attr(review.id)}" data-rating="good"`)}${button('쉬워요<small>'+Math.min(36500,review.intervalDays*3||7)+'일 뒤</small>','rate-review','secondary',`data-id="${attr(review.id)}" data-rating="easy"`)}</div>`:button('뜻 확인하고 복습하기','reveal-review','primary',`data-id="${attr(review.id)}"`)}</section>`:`<section class="card">${empty('오늘의 복습을 모두 마쳤어요',state.reviews.length?'다음 복습일에 다시 만나요. 오늘은 새 문장을 만들어 볼까요?':'내 문장에서 다시 보고 싶은 표현을 복습에 추가해 보세요.','<a class="button secondary" href="#sentences">내 문장 보러 가기</a>')}</section>`:`<section class="card scheduled-list">${upcoming.length?upcoming.map(r=>{const s=state.sentences.find(s=>s.id===r.sentenceId);return `<div class="scheduled-row"><div class="grow"><p class="ru" lang="ru">${escape(s?.text)}</p><span class="subtle">${dateLabel(r.dueAt)} · ${r.reviewCount}회 복습</span></div><button class="icon-button" data-action="remove-review" data-id="${attr(r.id)}" aria-label="복습에서 제외">${icon('close')}</button></div>`;}).join(''):empty('예정된 복습이 없어요','문장을 복습하면 다음 복습 일정이 여기에 표시돼요.')}</section>`}<p class="progress-note">복습 일정은 레슨 진도와 별도로 관리해요.</p></div>`;
}
function render(focus = false) {
  sync();
  let page=route();
  const isLessons = page === 'lessons' || page.startsWith('lessons/');
  if(!['home','review','sentences','app'].includes(page) && !isLessons && !page.startsWith('study/')) page='home';
  app.innerHTML = page.startsWith('study/')?studyPage():isLessons?lessonsPage():page==='review'?reviewPage():page==='sentences'?sentencesPage():home();
  const active=(page.startsWith('study/') || isLessons)?'lessons':page==='app'?'home':page;
  document.querySelector('#navigation').innerHTML=[['home','홈','home'],['lessons','레슨','book'],['review','복습','review'],['sentences','내 문장','bookmark']].map(([id,label,symbol])=>`<a href="#${id}" class="nav-item ${active===id?'active':''}" ${active===id?'aria-current="page"':''}>${icon(symbol)}<span>${label}</span></a>`).join('');
  document.title=({home:'오늘의 러시아어',lessons:'레슨',review:'복습',sentences:'내 문장'}[active] || '러시아어 노트')+' · 러시아어 노트';
  if(focus){window.scrollTo({top:0,behavior:'instant'});app.focus({preventScroll:true});}
}
function openModal(title, body, actions = '') {
  previousFocus=document.activeElement;
  modal.innerHTML=`<div class="modal-header"><h2 id="modal-title">${title}</h2><button class="icon-button modal-close" data-action="close-modal" aria-label="닫기">${icon('close')}</button></div><div class="modal-body">${body}</div>${actions?`<div class="modal-actions">${actions}</div>`:''}`;
  if(!modal.open) modal.showModal();
}
function settings() {
  openModal('나의 노트 설정',`<div class="settings-row"><div><h3>하루 문장 목표</h3><p class="subtle">작은 목표로 꾸준히 써 보세요.</p></div><label class="sr-only" for="daily-goal">하루 문장 목표</label><select id="daily-goal">${[...new Set([1,3,5,10,state.settings.dailyGoal])].sort((a,b)=>a-b).map(n=>`<option value="${n}" ${state.settings.dailyGoal===n?'selected':''}>${n}문장</option>`).join('')}</select></div><div class="settings-note"><h3>나의 데이터</h3><p>문장과 학습 기록은 지금 사용하는 브라우저에 저장돼요. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 백업해 주세요.</p><p class="backup-info">저장한 문장 ${state.sentences.length}개 · 복습 ${state.reviews.length}개</p></div><div class="stack">${button(icon('download')+'백업 내려받기','export','secondary')}${button('백업 불러오기','choose-import','ghost')}<input type="file" id="import-file" accept="application/json,.json" hidden></div><p class="optional-note">다크 모드는 추후 제공될 예정이에요.</p>`);
}
function feedback(sentenceId) {
  const saved=sentenceId ? state.sentences.find(s=>s.id===sentenceId) : [...state.sentences].filter(s=>s.lessonId===currentLesson().id).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
  const text=sentenceId ? saved?.text || '' : document.querySelector('#sentence-input')?.value.trim() || state.drafts[currentLesson().id] || saved?.text || '';
  if(!text.trim()) {toast('교정할 문장을 먼저 적어 주세요.');document.querySelector('#sentence-input')?.focus();return;}
  const prompt=`나는 러시아어를 배우는 한국어 사용자야. 다음 문장을 교정해 줘.\n\n${text}\n\n1. 의미를 유지한 자연스러운 문장\n2. 바꾼 부분과 문법적 이유를 한국어로 설명\n3. 틀린 부분이 없다면 그대로 알려 줘\n4. 내가 직접 고쳐 볼 수 있는 힌트 하나\n답변의 러시아어 단어에는 필요하면 강세를 표시해 줘.`;
  openModal('AI 교정 요청',`<p>요청문을 복사해 사용하는 AI에 붙여넣어 주세요.</p><label class="sr-only" for="feedback-prompt">교정 요청문</label><textarea id="feedback-prompt" class="prompt-input" rows="9" readonly>${escape(prompt)}</textarea><p class="optional-note">이 사이트에서 AI로 문장을 자동 전송하지 않아요.</p>`,button('요청문 복사','copy-prompt','primary'));
}
function speak(text, rate=0.85) {
  if(!('speechSynthesis' in window)){toast('이 브라우저는 듣기를 지원하지 않아요.');return;}
  const synth=window.speechSynthesis;
  const voices=synth.getVoices();
  const voice=voices.find(v=>/^ru(?:-|_|$)/i.test(v.lang));
  if(!voice){toast('기기의 러시아어 음성을 사용할 수 없어요. 음성 설정을 확인해 주세요.');return;}
  synth.cancel();
  const utterance=new SpeechSynthesisUtterance(text.replace(/\u0301/g,''));
  utterance.lang='ru-RU';utterance.voice=voice;utterance.rate=rate;
  utterance.onerror=e=>{if(!['canceled','interrupted'].includes(e.error))toast('음성을 재생하지 못했어요. 다시 시도해 주세요.');};
  synth.speak(utterance);
}
function currentText() { return document.querySelector('#sentence-input')?.value || ''; }
async function action(target) {
  const {action:act,id}=target.dataset;
  switch(act){
    case 'close-modal': modal.close(); break;
    case 'step': store.setProgress(currentLesson().id,Number(target.dataset.step));render(true);break;
    case 'reference': referenceTab=target.dataset.tab;render();document.querySelector(`#tab-${referenceTab}`)?.focus();break;
    case 'speak': speak(target.dataset.text,Number(target.dataset.rate||0.85));break;
    case 'save-sentence': {
      const text=currentText().trim();if(!text){toast('저장할 문장을 적어 주세요.');document.querySelector('#sentence-input')?.focus();return;}
      const lesson=currentLesson();store.saveSentence({text,lessonId:lesson.id});store.setDraft(lesson.id,'');editingDraftId=null;render();toast(store.getStorageError()?'현재 탭에 보관했어요. 백업도 내려받아 주세요.':'내 문장에 저장했어요.');break;
    }
    case 'new-sentence':
      if(state.drafts.preview?.trim()){openModal('작성 중인 문장이 있어요','<p>자동 저장된 초안을 이어서 쓰거나 새 문장을 시작할 수 있어요. 새 문장을 시작하면 기존 초안은 지워집니다.</p>',button('이어서 쓰기','resume-draft','primary')+button('새 문장','confirm-new','secondary'));break;}
      store.setProgress('preview',3);go('study/preview');break;
    case 'resume-draft': modal.close();store.setProgress('preview',3);go('study/preview');break;
    case 'confirm-new': modal.close();editingDraftId=null;store.setDraft('preview','');store.setProgress('preview',3);go('study/preview');break;
    case 'feedback': feedback(id);break;
    case 'copy-prompt': {
      const field=document.querySelector('#feedback-prompt');
      try{await navigator.clipboard.writeText(field.value);toast('교정 요청문을 복사했어요.');}catch{field.focus();field.select();toast('요청문을 길게 눌러 복사해 주세요.');}break;
    }
    case 'complete': {const lesson=currentLesson();if(!lesson.isPreview)store.setProgress(lesson.id,5,true);go('home');toast(lesson.isPreview?'연습을 마쳤어요. 작성한 문장은 내 문장에서 볼 수 있어요.':'레슨을 완료했어요.');break;}
    case 'edit': {
      const s=state.sentences.find(s=>s.id===id);if(!s)return;
      openModal('문장 다듬기',`<form id="edit-form" data-id="${attr(id)}"><label class="form-field">러시아어 문장<textarea name="text" maxlength="2000" rows="4" required lang="ru">${escape(s.text)}</textarea></label><label class="form-field">뜻 또는 나의 메모 <span class="subtle">(선택)</span><textarea name="translation" maxlength="2000" rows="2">${escape(s.translation)}</textarea></label><div class="form-actions"><button class="button primary" type="submit">수정 저장</button></div></form>`);break;
    }
    case 'delete': openModal('이 문장을 삭제할까요?','<p>이 문장의 복습 일정도 함께 삭제됩니다.</p>',button('취소','close-modal','secondary')+button('삭제','confirm-delete','danger',`data-id="${attr(id)}"`));break;
    case 'confirm-delete': store.deleteSentence(id);if(editingDraftId===id)editingDraftId=null;modal.close();render();toast('문장을 삭제했어요.');break;
    case 'add-review': store.addToReview(id);render();toast('오늘의 복습에 추가했어요.');break;
    case 'remove-review': store.removeReview(id);render();toast('복습 목록에서 제외했어요.');break;
    case 'review-filter': reviewFilter=target.dataset.filter;render();break;
    case 'reveal-review': revealedReviewId=id;render();break;
    case 'rate-review': store.rateReview(id,target.dataset.rating);revealedReviewId=null;render();toast('다음 복습 일정을 저장했어요.');break;
    case 'export': {
      const blob=new Blob([store.exportBackup()],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`russian-notebook-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('백업 파일을 내려받았어요.');break;
    }
    case 'choose-import': document.querySelector('#import-file').click();break;
    case 'confirm-import': if(pendingBackup){store.importBackup(pendingBackup);pendingBackup=null;editingDraftId=null;modal.close();render();toast('백업 데이터를 불러왔어요.');}break;
  }
  sync();
}

document.addEventListener('click',e=>{const target=e.target.closest('[data-action]');if(target)action(target).catch(err=>toast(err.message||'처리하지 못했어요. 다시 시도해 주세요.'));});
document.querySelector('#settings-button').addEventListener('click',settings);
document.querySelector('.skip-link').addEventListener('click',e=>{e.preventDefault();app.focus();});
app.addEventListener('keydown',e=>{
  if(e.target.getAttribute('role')==='tab' && ['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){
    e.preventDefault();const tabs=['expression','grammar','examples'];const idx=tabs.indexOf(referenceTab);
    referenceTab=tabs[e.key==='Home'?0:e.key==='End'?2:(idx+(e.key==='ArrowRight'?1:2))%3];render();document.querySelector(`#tab-${referenceTab}`)?.focus();
  }
});
app.addEventListener('input',e=>{
  if(e.target.id==='sentence-input'){
    try{store.setDraft(e.target.dataset.lesson,e.target.value);sync();document.querySelector('#char-count').textContent=e.target.value.length;document.querySelector('#draft-status').textContent=store.getStorageError()?'이 탭에서만 보관 중':'임시 저장됨';}catch(err){toast(err.message);}
  }
  if(e.target.id==='search'){
    searchQuery=e.target.value;
    const filtered=[...state.sentences].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).filter(s=>stripStress(s.text+' '+s.translation).includes(stripStress(searchQuery)));
    document.querySelector('#sentence-results').innerHTML=sentenceResults(filtered);
  }
});
modal.addEventListener('submit',e=>{
  if(e.target.id!=='edit-form')return;e.preventDefault();
  try{const form=new FormData(e.target);store.saveSentence({id:e.target.dataset.id,text:form.get('text'),translation:form.get('translation')});modal.close();render();toast('문장을 수정했어요.');}catch(err){toast(err.message);}
});
modal.addEventListener('change',async e=>{
  try{
    if(e.target.id==='daily-goal'){store.updateSettings({dailyGoal:Number(e.target.value)});render();toast('목표를 바꿨어요.');}
    if(e.target.id==='import-file'){
      const file=e.target.files[0];if(!file)return;
      if(file.size>5_000_000)throw new Error('5MB 이하의 백업 파일을 선택해 주세요.');
      const raw=await file.text();validateBackup(raw);pendingBackup=raw;
      openModal('백업을 불러올까요?','<p>지금 브라우저에 저장된 문장과 학습 기록을 백업 내용으로 교체합니다. 필요하면 현재 데이터를 먼저 내려받아 주세요.</p>',button('취소','close-modal','secondary')+button('불러오기','confirm-import','primary'));
    }
  }catch(err){toast('백업을 불러오지 못했어요. '+err.message);if(e.target.type==='file')e.target.value='';}
});
modal.addEventListener('click',e=>{if(e.target===modal){const rect=modal.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)modal.close();}});
modal.addEventListener('close',()=>{pendingBackup=null;previousFocus?.isConnected&&previousFocus.focus();});
window.addEventListener('hashchange',()=>{if(modal.open)modal.close();if('speechSynthesis' in window)window.speechSynthesis.cancel();editingDraftId=null;render(true);});
window.addEventListener('pageshow',()=>sync());
render();
