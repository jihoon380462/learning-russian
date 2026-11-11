const STORAGE_KEY = 'russian-notebook:v1';
const MAX_ITEMS = 10000;
const MAX_BACKUP_LENGTH = 5 * 1024 * 1024;
const DAY = 24 * 60 * 60 * 1000;
const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor']);

const clone = (value) => JSON.parse(JSON.stringify(value));
const initialState = () => ({
  schemaVersion: 1,
  sentences: [],
  progress: {},
  drafts: {},
  reviews: [],
  settings: { dailyGoal: 5 },
});

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function validId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
    && !unsafeKeys.has(value) && !/[\u0000-\u001f]/u.test(value);
}

function validText(value, allowEmpty = true) {
  return typeof value === 'string' && value.length <= 2000 && (allowEmpty || value.trim().length > 0);
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function validMap(value) {
  return plainObject(value) && Object.keys(value).length <= MAX_ITEMS && Object.keys(value).every(validId);
}

/** Validate and copy a complete version-1 backup without changing any stored data. */
export function validateBackup(input) {
  let data = input;
  if (typeof input === 'string') {
    requireValue(input.length <= MAX_BACKUP_LENGTH, '백업 파일은 5MB 이하여야 합니다.');
    try { data = JSON.parse(input); } catch { throw new Error('올바른 JSON 백업 파일이 아닙니다.'); }
  }
  requireValue(plainObject(data) && data.schemaVersion === 1, '지원하지 않는 백업 형식입니다.');
  requireValue(Array.isArray(data.sentences) && data.sentences.length <= MAX_ITEMS, '문장 목록이 올바르지 않습니다.');
  requireValue(Array.isArray(data.reviews) && data.reviews.length <= MAX_ITEMS, '복습 목록이 올바르지 않습니다.');
  requireValue(validMap(data.progress) && validMap(data.drafts), '진도 또는 임시 문장 정보가 올바르지 않습니다.');
  requireValue(plainObject(data.settings) && Number.isInteger(data.settings.dailyGoal)
    && data.settings.dailyGoal >= 1 && data.settings.dailyGoal <= 100, '하루 목표는 1~100개여야 합니다.');

  const result = initialState();
  const sentenceIds = new Set();
  result.sentences = data.sentences.map((sentence) => {
    requireValue(plainObject(sentence) && validId(sentence.id) && !sentenceIds.has(sentence.id)
      && validText(sentence.text, false) && validText(sentence.translation)
      && validDate(sentence.createdAt) && validDate(sentence.updatedAt)
      && (sentence.lessonId === null || validId(sentence.lessonId)), '문장 정보가 올바르지 않거나 중복됩니다.');
    sentenceIds.add(sentence.id);
    return {
      id: sentence.id, text: sentence.text.trim(), translation: sentence.translation.trim(),
      lessonId: sentence.lessonId, createdAt: sentence.createdAt, updatedAt: sentence.updatedAt,
    };
  });
  for (const [lessonId, progress] of Object.entries(data.progress)) {
    requireValue(plainObject(progress) && Number.isInteger(progress.step) && progress.step >= 0 && progress.step <= 5
      && typeof progress.completed === 'boolean' && validDate(progress.updatedAt), '레슨 진도가 올바르지 않습니다.');
    result.progress[lessonId] = { step: progress.step, completed: progress.completed, updatedAt: progress.updatedAt };
  }
  for (const [lessonId, text] of Object.entries(data.drafts)) {
    requireValue(validText(text), '임시 문장이 너무 길거나 올바르지 않습니다.');
    result.drafts[lessonId] = text;
  }
  const reviewIds = new Set();
  const reviewedSentences = new Set();
  result.reviews = data.reviews.map((review) => {
    requireValue(plainObject(review) && validId(review.id) && !reviewIds.has(review.id)
      && sentenceIds.has(review.sentenceId) && !reviewedSentences.has(review.sentenceId)
      && validDate(review.dueAt) && Number.isInteger(review.intervalDays)
      && review.intervalDays >= 0 && review.intervalDays <= 36500
      && Number.isInteger(review.reviewCount) && review.reviewCount >= 0 && review.reviewCount <= 1000000,
    '복습 정보가 올바르지 않거나 연결된 문장이 없습니다.');
    reviewIds.add(review.id);
    reviewedSentences.add(review.sentenceId);
    return { id: review.id, sentenceId: review.sentenceId, dueAt: review.dueAt,
      intervalDays: review.intervalDays, reviewCount: review.reviewCount };
  });
  result.settings.dailyGoal = data.settings.dailyGoal;
  return result;
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Session state survives storage failures; getStorageError exposes persistence problems. */
export function createStore(storage, now = () => new Date()) {
  let storageError = null;
  let state = initialState();
  if (storage === undefined) {
    try { storage = globalThis.localStorage; } catch { storage = null; }
  }
  try {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
      throw new Error('unavailable');
    }
    const saved = storage.getItem(STORAGE_KEY);
    if (saved !== null) state = validateBackup(saved);
  } catch {
    storageError = '브라우저의 저장 데이터를 읽지 못했습니다. 새로 작성하는 내용은 백업해 주세요.';
  }

  const stamp = () => {
    const value = now();
    requireValue(value instanceof Date && Number.isFinite(value.getTime()), '현재 시간을 확인할 수 없습니다.');
    return value.toISOString();
  };
  const persist = () => {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageError = null;
    } catch {
      storageError = '브라우저 저장 공간을 사용할 수 없습니다. 현재 내용은 이 화면에만 남으니 백업을 내려받아 주세요.';
    }
  };
  const assertLesson = (id) => requireValue(validId(id), '레슨 식별자가 올바르지 않습니다.');

  return {
    getState: () => clone(state),
    getStorageError: () => storageError,
    saveSentence({ id, text, translation, lessonId } = {}) {
      requireValue(validText(text, false), '문장을 1~2,000자 이내로 작성해 주세요.');
      requireValue(translation === undefined || validText(translation), '뜻은 2,000자 이내로 작성해 주세요.');
      requireValue(lessonId === undefined || lessonId === null || validId(lessonId), '레슨 식별자가 올바르지 않습니다.');
      const existing = id === undefined ? null : state.sentences.find((sentence) => sentence.id === id);
      requireValue(id === undefined || existing, '수정할 문장을 찾을 수 없습니다.');
      requireValue(existing || state.sentences.length < MAX_ITEMS, '문장은 최대 10,000개까지 저장할 수 있습니다.');
      const time = stamp();
      const sentence = {
        id: existing?.id ?? newId(), text: text.trim(),
        translation: translation === undefined ? (existing?.translation ?? '') : translation.trim(),
        lessonId: lessonId === undefined ? (existing?.lessonId ?? null) : lessonId,
        createdAt: existing?.createdAt ?? time, updatedAt: time,
      };
      if (existing) state.sentences[state.sentences.indexOf(existing)] = sentence;
      else state.sentences.unshift(sentence);
      persist();
      return clone(sentence);
    },
    deleteSentence(id) {
      const existed = state.sentences.some((sentence) => sentence.id === id);
      state.sentences = state.sentences.filter((sentence) => sentence.id !== id);
      state.reviews = state.reviews.filter((review) => review.sentenceId !== id);
      persist();
      return existed;
    },
    setDraft(lessonId, text) {
      assertLesson(lessonId);
      requireValue(validText(text), '문장을 2,000자 이내로 작성해 주세요.');
      requireValue(Object.hasOwn(state.drafts, lessonId) || Object.keys(state.drafts).length < MAX_ITEMS,
        '임시 문장을 더 저장할 수 없습니다.');
      if (text === '') delete state.drafts[lessonId];
      else state.drafts[lessonId] = text;
      persist();
    },
    setProgress(lessonId, step, completed = false) {
      assertLesson(lessonId);
      requireValue(Number.isInteger(step) && step >= 0 && step <= 5 && typeof completed === 'boolean', '학습 단계가 올바르지 않습니다.');
      requireValue(Object.hasOwn(state.progress, lessonId) || Object.keys(state.progress).length < MAX_ITEMS,
        '진도 정보를 더 저장할 수 없습니다.');
      state.progress[lessonId] = { step, completed: completed || state.progress[lessonId]?.completed || false, updatedAt: stamp() };
      persist();
      return clone(state.progress[lessonId]);
    },
    addToReview(sentenceId) {
      requireValue(state.sentences.some((sentence) => sentence.id === sentenceId), '복습할 문장을 찾을 수 없습니다.');
      const existing = state.reviews.find((review) => review.sentenceId === sentenceId);
      if (existing) return clone(existing);
      requireValue(state.reviews.length < MAX_ITEMS, '복습 목록은 최대 10,000개까지 저장할 수 있습니다.');
      const review = { id: newId(), sentenceId, dueAt: stamp(), intervalDays: 0, reviewCount: 0 };
      state.reviews.push(review);
      persist();
      return clone(review);
    },
    rateReview(reviewId, rating) {
      const review = state.reviews.find((entry) => entry.id === reviewId);
      requireValue(review, '복습할 문장을 찾을 수 없습니다.');
      requireValue(['again', 'good', 'easy'].includes(rating), '복습 평가가 올바르지 않습니다.');
      const intervalDays = rating === 'again' ? 1
        : Math.min(36500, rating === 'good' ? (review.intervalDays * 2 || 3) : (review.intervalDays * 3 || 7));
      review.dueAt = new Date(Date.parse(stamp()) + intervalDays * DAY).toISOString();
      review.intervalDays = intervalDays;
      review.reviewCount = Math.min(1000000, review.reviewCount + 1);
      persist();
      return clone(review);
    },
    removeReview(id) {
      const existed = state.reviews.some((review) => review.id === id);
      state.reviews = state.reviews.filter((review) => review.id !== id);
      persist();
      return existed;
    },
    updateSettings(partial) {
      requireValue(plainObject(partial), '설정 값이 올바르지 않습니다.');
      const dailyGoal = partial.dailyGoal ?? state.settings.dailyGoal;
      requireValue(Number.isInteger(dailyGoal) && dailyGoal >= 1 && dailyGoal <= 100, '하루 목표는 1~100개여야 합니다.');
      state.settings = { dailyGoal };
      persist();
      return clone(state.settings);
    },
    exportBackup: () => JSON.stringify(state, null, 2),
    importBackup(raw) {
      const imported = validateBackup(raw);
      state = imported;
      persist();
      return clone(state);
    },
  };
}
