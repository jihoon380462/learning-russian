import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createStore, validateBackup } from '../js/store.js';
import { lessons, previewLesson, stages } from '../js/content.js';

// This is a mocked-DOM integration smoke test of the actual app and store.
// It does not run a browser, calculate layout, exercise native focus/dialog
// behavior, or verify CSS, audio availability, downloads, and visual fidelity.
const source = (await readFile(new URL('../js/app.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '');
const NOW = '2026-11-11T12:00:00.000Z';
const decode = value => value.replace(/&(?:amp|lt|gt|quot|#39);/g, value => ({
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
})[value]);

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

function harness({ curriculum = lessons } = {}) {
  const nodes = new Map();
  let document;
  class Node {
    constructor(id = '', owner = null) {
      this.id = id;
      this.owner = owner;
      this.dataset = {};
      this.attributes = {};
      this.listeners = new Map();
      this.value = '';
      this.textContent = '';
      this.hidden = true;
      this.open = false;
      this.isConnected = true;
      this.html = '';
    }
    addEventListener(type, callback) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), callback]);
    }
    async emit(type, event = {}) {
      for (const callback of this.listeners.get(type) ?? []) await callback(event);
    }
    set innerHTML(html) {
      this.html = html;
      // Only enough parsing for IDs, textarea values and dataset bindings used
      // by the interaction handlers. This intentionally is not an HTML parser.
      for (const [id, node] of nodes) if (node.owner === this) nodes.delete(id);
      for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)) {
        const node = new Node(match[3], this);
        for (const attribute of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) {
          node.attributes[attribute[1]] = decode(attribute[2]);
          if (attribute[1].startsWith('data-')) node.dataset[attribute[1].slice(5)] = decode(attribute[2]);
        }
        node.value = node.attributes.value ?? '';
        nodes.set(node.id, node);
      }
      for (const match of html.matchAll(/<textarea\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g)) {
        nodes.get(match[1]).value = decode(match[2]);
      }
    }
    get innerHTML() { return this.html; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    focus() { document.activeElement = this; }
    select() { this.selected = true; }
    click() {}
    showModal() { this.open = true; }
    close() {
      this.open = false;
      for (const listener of this.listeners.get('close') ?? []) listener({ target: this });
    }
    getBoundingClientRect() { return { left: 0, right: 400, top: 0, bottom: 600 }; }
  }
  for (const id of ['app', 'modal', 'toast', 'storage-warning', 'navigation', 'settings-button', 'skip-link']) nodes.set(id, new Node(id));
  const documentListeners = new Map();
  document = {
    title: '', activeElement: null,
    querySelector(selector) { return nodes.get(selector === '.skip-link' ? 'skip-link' : selector.slice(1)) ?? null; },
    addEventListener(type, callback) { documentListeners.set(type, callback); },
    createElement() { return new Node(); },
  };
  const windowListeners = new Map();
  const window = {
    addEventListener(type, callback) { windowListeners.set(type, callback); },
    scrollTo() {},
  };
  let hash = '';
  const location = {};
  Object.defineProperty(location, 'hash', {
    get: () => hash,
    set(value) {
      const next = value ? (value.startsWith('#') ? value : '#' + value) : '';
      if (next !== hash) { hash = next; windowListeners.get('hashchange')?.(); }
    },
  });
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return Date.parse(NOW); }
  }
  const storage = memoryStorage();
  const context = vm.createContext({
    document, window, location,
    Date: FixedDate,
    createStore: () => createStore(storage, () => new Date(NOW)),
    validateBackup, lessons: curriculum, previewLesson, stages,
    navigator: { clipboard: { writeText: async () => {} } },
    setTimeout: () => 1, clearTimeout() {},
  });
  vm.runInContext(source + '\nglobalThis.testApp = { render, action, store, currentLesson };', context, { filename: 'js/app.js' });
  const api = context.testApp;
  return {
    ...api, nodes, document,
    get html() { return nodes.get('app').innerHTML; },
    get modal() { return nodes.get('modal'); },
    navigate(path) { location.hash = path; api.render(); },
    click(action, dataset = {}) { return api.action({ dataset: { action, ...dataset } }); },
    async type(text) {
      const input = nodes.get('sentence-input');
      assert.ok(input, 'current route should contain a writing input');
      input.value = text;
      await nodes.get('app').emit('input', { target: input });
    },
  };
}

test('every route and all six lesson stages render with the real content module', async () => {
  const app = harness();
  for (const [route, title] of [['home', '오늘의 러시아어'], ['lessons', '나의 학습 여정'], ['study/preview', '취향 말하기'], ['review', '다시 만나는 문장'], ['sentences', '내 문장'], ['unknown', '오늘의 러시아어']]) {
    app.navigate(route);
    assert.ok(app.html.includes(title), route);
    assert.match(app.nodes.get('navigation').innerHTML, /aria-current="page"/);
  }
  app.navigate('study/preview');
  for (let step = 0; step < stages.length; step++) {
    await app.click('step', { step: String(step) });
    assert.match(app.html, new RegExp(`${step + 1} / 6`));
    assert.equal(app.store.getState().progress.preview.step, step);
  }
});

test('malformed URI and unknown lesson IDs safely render the preview', () => {
  const app = harness();
  for (const route of ['study/%E0%A4%A', 'study/%', 'study/does-not-exist']) {
    app.navigate(route);
    assert.equal(app.currentLesson().id, 'preview');
    assert.match(app.html, /샘플 레슨/);
  }
});

test('finishing a preview never completes a real lesson, while an actual lesson can complete', async () => {
  const real = { ...previewLesson, id: 'real-one', isPreview: false };
  const app = harness({ curriculum: [real] });
  app.navigate('study/preview');
  await app.click('step', { step: '5' });
  await app.click('complete');
  assert.equal(app.store.getState().progress.preview.completed, false);
  assert.equal(app.store.getState().progress['real-one'], undefined);
  assert.match(app.html, /1개 레슨 중 0개 완료/);
  app.navigate('study/real-one');
  await app.click('complete');
  assert.equal(app.store.getState().progress['real-one'].completed, true);
  assert.match(app.html, /1개 레슨 중 1개 완료/);
});

test('consecutive sentence saves preserve both entries and clear the draft', async () => {
  const app = harness();
  app.navigate('study/preview');
  for (const text of ['Я люблю́ чита́ть.', 'Я люблю́ гуля́ть.']) {
    await app.type(text);
    assert.equal(app.store.getState().drafts.preview, text);
    await app.click('save-sentence');
    assert.equal(app.store.getState().drafts.preview, undefined);
    assert.equal(app.nodes.get('sentence-input').value, '');
  }
  const saved = app.store.getState().sentences;
  assert.equal(saved.length, 2);
  assert.equal(new Set(saved.map(sentence => sentence.id)).size, 2);
  assert.deepEqual(saved.map(sentence => sentence.text).sort(), ['Я люблю́ чита́ть.', 'Я люблю́ гуля́ть.'].sort());
});

test('starting a new sentence preserves an existing draft until explicit confirmation', async () => {
  const app = harness();
  app.navigate('study/preview');
  await app.type('Мой черновик');
  app.navigate('sentences');
  await app.click('new-sentence');
  assert.equal(app.modal.open, true);
  assert.equal(app.store.getState().drafts.preview, 'Мой черновик');
  await app.click('resume-draft');
  assert.equal(app.nodes.get('sentence-input').value, 'Мой черновик');
  app.navigate('sentences');
  await app.click('new-sentence');
  await app.click('confirm-new');
  assert.equal(app.store.getState().drafts.preview, undefined);
  assert.equal(app.nodes.get('sentence-input').value, '');
});

for (const [rating, days] of [['again', 1], ['good', 3], ['easy', 7]]) {
  test(`review reveal and ${rating} rating move the sentence to its independent schedule`, async () => {
    const app = harness();
    const sentence = app.store.saveSentence({ text: 'Я чита́ю.', translation: '나는 읽어요.', lessonId: 'preview' });
    app.store.setProgress('preview', 2);
    const progressBefore = app.store.getState().progress;
    await app.click('add-review', { id: sentence.id });
    app.navigate('review');
    const review = app.store.getState().reviews[0];
    assert.match(app.html, /뜻 확인하고 복습하기/);
    assert.doesNotMatch(app.html, /나는 읽어요\./);
    await app.click('reveal-review', { id: review.id });
    assert.match(app.html, /나는 읽어요\./);
    await app.click('rate-review', { id: review.id, rating });
    const updated = app.store.getState().reviews[0];
    assert.equal(updated.intervalDays, days);
    assert.equal(updated.reviewCount, 1);
    assert.equal(Date.parse(updated.dueAt) - Date.parse(NOW), days * 86_400_000);
    assert.deepEqual(app.store.getState().progress, progressBefore);
    assert.match(app.html, /오늘의 복습을 모두 마쳤어요/);
    await app.click('review-filter', { filter: 'upcoming' });
    assert.match(app.html, /Я чита́ю\./);
    assert.match(app.html, /1회 복습/);
  });
}

test('saved text and drafts are HTML-escaped in list, attribute and textarea contexts', () => {
  const app = harness();
  const text = '</textarea><img src=x onerror="alert(1)">';
  app.store.saveSentence({ text, translation: '<svg onload="alert(2)">' });
  app.navigate('sentences');
  assert.doesNotMatch(app.html, /<img src=x|<svg onload=/);
  assert.match(app.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(app.html, /data-text="&lt;\/textarea&gt;/);
  app.store.setDraft('preview', text);
  app.navigate('study/preview');
  assert.doesNotMatch(app.html, /<img src=x/);
  assert.equal(app.nodes.get('sentence-input').value, text);
});

test('backup import validates before confirmation and invalid input preserves current data', async () => {
  const app = harness();
  const old = app.store.saveSentence({ text: '기존 문장' });
  const other = createStore(memoryStorage(), () => new Date(NOW));
  other.saveSentence({ text: '복원할 문장' });
  const raw = other.exportBackup();
  const selectFile = text => app.modal.emit('change', { target: {
    id: 'import-file', type: 'file', value: 'backup.json',
    files: [{ size: text.length, text: async () => text }],
  } });
  await selectFile(raw);
  assert.equal(app.store.getState().sentences[0].id, old.id);
  assert.equal(app.modal.open, true);
  assert.match(app.modal.innerHTML, /백업을 불러올까요/);
  await app.click('confirm-import');
  assert.equal(app.store.getState().sentences[0].text, '복원할 문장');
  const validState = app.store.exportBackup();
  await selectFile('{"schemaVersion":1}');
  assert.equal(app.store.exportBackup(), validState);
  assert.match(app.nodes.get('toast').textContent, /백업을 불러오지 못했어요/);
});
