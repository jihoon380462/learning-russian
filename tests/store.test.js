import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, validateBackup } from '../js/store.js';

const fixedNow = () => new Date('2026-11-11T12:00:00.000Z');
function memoryStorage(initial = null) {
  let raw = initial;
  return { getItem: () => raw, setItem: (_key, value) => { raw = value; } };
}

test('sentences and independent progress/drafts persist across reloads', () => {
  const storage = memoryStorage();
  const store = createStore(storage, fixedNow);
  const sentence = store.saveSentence({ text: '  Я люблю́ чита́ть.  ', translation: ' 독서를 좋아해요. ', lessonId: 'lesson-01' });
  store.setProgress('lesson-01', 3);
  store.setDraft('lesson-01', 'Я люблю́');
  const reloaded = createStore(storage, fixedNow).getState();
  assert.equal(reloaded.sentences[0].text, 'Я люблю́ чита́ть.');
  assert.equal(reloaded.sentences[0].translation, '독서를 좋아해요.');
  assert.equal(reloaded.sentences[0].id, sentence.id);
  assert.equal(reloaded.progress['lesson-01'].step, 3);
  assert.equal(reloaded.drafts['lesson-01'], 'Я люблю́');
  assert.deepEqual(reloaded.reviews, []);
});

test('updates preserve sentence identity and creation date and reject missing sentences', () => {
  let time = fixedNow();
  const store = createStore(memoryStorage(), () => time);
  const sentence = store.saveSentence({ text: 'Я чита́ю.', translation: '읽어요.', lessonId: 'one' });
  time = new Date('2026-11-12T12:00:00.000Z');
  const edited = store.saveSentence({ id: sentence.id, text: 'Я гуля́ю.' });
  assert.equal(edited.createdAt, sentence.createdAt);
  assert.equal(edited.updatedAt, time.toISOString());
  assert.equal(edited.lessonId, 'one');
  assert.equal(edited.translation, '읽어요.');
  assert.equal(store.getState().sentences.length, 1);
  assert.throws(() => store.saveSentence({ id: 'missing', text: 'Текст.' }));
});

test('review scheduling is idempotent, has fixed intervals, and does not advance progress', () => {
  const store = createStore(memoryStorage(), fixedNow);
  const sentence = store.saveSentence({ text: 'Я люблю́ гуля́ть.' });
  store.setProgress('one', 2);
  const review = store.addToReview(sentence.id);
  assert.equal(review.dueAt, fixedNow().toISOString());
  assert.equal(store.addToReview(sentence.id).id, review.id);
  assert.equal(store.getState().reviews.length, 1);
  assert.equal(store.rateReview(review.id, 'good').dueAt, '2026-11-14T12:00:00.000Z');
  assert.equal(store.rateReview(review.id, 'easy').intervalDays, 9);
  assert.equal(store.rateReview(review.id, 'again').dueAt, '2026-11-12T12:00:00.000Z');
  assert.equal(store.getState().reviews[0].reviewCount, 3);
  assert.equal(store.getState().progress.one.step, 2);
  store.setProgress('one', 5, true);
  assert.equal(store.getState().reviews[0].reviewCount, 3);
  store.setProgress('one', 0);
  assert.equal(store.getState().progress.one.completed, true);
});

test('deleting a sentence cascades to its review without touching other entries', () => {
  const store = createStore(memoryStorage(), fixedNow);
  const first = store.saveSentence({ text: 'Первый.' });
  const second = store.saveSentence({ text: 'Второй.' });
  store.addToReview(first.id);
  store.addToReview(second.id);
  assert.equal(store.deleteSentence(first.id), true);
  assert.deepEqual(store.getState().sentences.map((s) => s.id), [second.id]);
  assert.deepEqual(store.getState().reviews.map((r) => r.sentenceId), [second.id]);
  assert.equal(store.removeReview(store.getState().reviews[0].id), true);
  assert.equal(store.getState().sentences.length, 1);
});

test('bad imports leave existing in-memory and persisted data untouched', () => {
  const storage = memoryStorage();
  const store = createStore(storage, fixedNow);
  store.saveSentence({ text: 'Сохрани́ть.' });
  const before = store.exportBackup();
  for (const raw of ['{broken', 'null', '{}', '{"schemaVersion":2}', 'x'.repeat(5 * 1024 * 1024 + 1)]) {
    assert.throws(() => store.importBackup(raw));
    assert.equal(store.exportBackup(), before);
    assert.deepEqual(createStore(storage, fixedNow).getState(), store.getState());
  }
});

test('backup validation rejects broken references, duplicate IDs, invalid dates and unsafe maps', () => {
  const store = createStore(memoryStorage(), fixedNow);
  const sentence = store.saveSentence({ text: 'Я здесь.' });
  store.addToReview(sentence.id);
  const mutations = [
    (state) => { state.reviews[0].sentenceId = 'missing'; },
    (state) => { state.sentences.push(state.sentences[0]); },
    (state) => { state.reviews.push({ ...state.reviews[0], id: 'another' }); },
    (state) => { state.sentences[0].createdAt = '2026-02-30T12:00:00.000Z'; },
    (state) => { state.settings.dailyGoal = -1; },
    (state) => { state.progress = JSON.parse('{"__proto__":{"step":0,"completed":false,"updatedAt":"2026-11-11T12:00:00.000Z"}}'); },
    (state) => { state.drafts.one = 42; },
    (state) => { state.sentences[0].text = ' '; },
    (state) => { state.reviews[0].intervalDays = Infinity; },
  ];
  for (const mutate of mutations) {
    const data = store.getState();
    mutate(data);
    assert.throws(() => validateBackup(data));
  }
});

test('valid exports round-trip all data and are detached from mutable state', () => {
  const store = createStore(memoryStorage(), fixedNow);
  const sentence = store.saveSentence({ text: 'Я тут.' });
  store.addToReview(sentence.id);
  store.setProgress('one', 5, true);
  store.setDraft('two', 'И ещё');
  store.updateSettings({ dailyGoal: 10 });
  const target = createStore(memoryStorage(), fixedNow);
  assert.deepEqual(target.importBackup(store.exportBackup()), store.getState());
  const copy = target.getState();
  copy.sentences[0].text = 'changed outside';
  assert.equal(target.getState().sentences[0].text, 'Я тут.');
});

test('corrupt storage fails safely and write failures retain session work with an error', () => {
  const corrupted = createStore(memoryStorage('{broken'), fixedNow);
  assert.equal(corrupted.getState().sentences.length, 0);
  assert.ok(corrupted.getStorageError());
  let fail = true;
  const store = createStore({ getItem: () => null, setItem: () => { if (fail) throw new Error('Quota'); } }, fixedNow);
  store.saveSentence({ text: 'Не потеря́ть.' });
  assert.equal(store.getState().sentences.length, 1);
  assert.ok(store.getStorageError());
  assert.equal(JSON.parse(store.exportBackup()).sentences[0].text, 'Не потеря́ть.');
  fail = false;
  store.setDraft('one', 'Текст');
  assert.equal(store.getStorageError(), null);
});

test('invalid local edits are rejected before state mutation', () => {
  const store = createStore(memoryStorage(), fixedNow);
  const before = store.exportBackup();
  assert.throws(() => store.saveSentence({ text: ' ' }));
  assert.throws(() => store.saveSentence({ text: 'a'.repeat(2001) }));
  assert.throws(() => store.setProgress('__proto__', 1));
  assert.throws(() => store.setProgress('one', 6));
  assert.throws(() => store.setDraft('one', null));
  assert.throws(() => store.updateSettings({ dailyGoal: 0 }));
  assert.equal(store.exportBackup(), before);
});
