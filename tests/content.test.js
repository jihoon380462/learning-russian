import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { lessons, previewLesson, stages, a1Topics } from '../js/content.js';

const curriculum = await readFile(new URL('../docs/curriculum.md', import.meta.url), 'utf8');
const a1Section = curriculum.split('## A1 ')[1]?.split('\n## A2 ')[0] ?? '';
const documentedTopicEntries = [...a1Section.matchAll(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|/gm)]
  .map(match => ({ id: Number(match[1]), title: match[2] }));
const documentedTopics = documentedTopicEntries.map(topic => topic.id);
const a1Lessons = lessons.filter(lesson => lesson.level === 'A1');
const levels = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

function text(value, path) {
  assert.equal(typeof value, 'string', `${path} must be text`);
  assert.ok(value.trim().length, `${path} must not be empty`);
  assert.doesNotMatch(value, /\b(?:TODO|TBD|FIXME)\b|작성 예정|내용 준비 중/iu, `${path} contains a placeholder`);
}

function textList(value, path) {
  assert.ok(Array.isArray(value) && value.length > 0, `${path} needs at least one item`);
  value.forEach((item, index) => text(item, `${path}[${index}]`));
}

// These function words may attach to a neighbouring stressed word in speech.
// The check detects omitted teaching stress, not whether its position is correct.
const unstressedFunctionWords = new Set(['или', 'чтобы', 'перед', 'через', 'обо']);
function stressProblems(value, path) {
  const problems = [];
  const words = value.normalize('NFC').match(/[А-Яа-яЁё\u0301]+/gu) ?? [];
  if (!words.length) problems.push(`${path}: no Russian text`);
  for (const word of words) {
    if (/(?<![АЕЁИОУЫЭЮЯаеёиоуыэюя])\u0301/u.test(word)) {
      problems.push(`${path}: stress is not attached to a vowel in ${word}`);
    }
    const vowelCount = (word.match(/[аеёиоуыэюя]/giu) ?? []).length;
    if (vowelCount > 1 && !/[\u0301ё]/iu.test(word) && !unstressedFunctionWords.has(word.toLowerCase())) {
      problems.push(`${path}: ${word} needs a stress mark`);
    }
  }
  return problems;
}

test('formal lessons have unique stable IDs and valid levels, separate from the preview', () => {
  assert.ok(lessons.length > 0, 'formal content must be available');
  assert.equal(previewLesson.isPreview, true);
  assert.equal(previewLesson.id, 'preview', 'keep existing preview drafts and sentence references valid');
  const ids = lessons.map(lesson => lesson.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate IDs would share progress and drafts');
  assert.ok(!ids.includes(previewLesson.id));
  for (const lesson of lessons) {
    assert.match(lesson.id, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/u, 'IDs must be safe, stable route keys');
    assert.equal(lesson.isPreview, false, lesson.id);
    assert.ok(levels.has(lesson.level), `${lesson.id}: unknown level`);
    assert.ok(Number.isInteger(lesson.topic) && lesson.topic > 0, `${lesson.id}: invalid topic`);
    text(lesson.number, `${lesson.id}.number`);
  }
});

test('A1 covers the documented topics in order without splitting topic groups', () => {
  assert.ok(documentedTopics.length > 0, 'A1 topic table must be readable');
  assert.deepEqual(a1Topics, documentedTopicEntries, 'topic labels must stay aligned with the curriculum');
  const topicRuns = a1Lessons.map(lesson => lesson.topic).filter((topic, index, topics) => index === 0 || topic !== topics[index - 1]);
  assert.deepEqual(topicRuns, documentedTopics, 'each A1 topic needs one contiguous group in curriculum order');
  for (const lesson of a1Lessons) {
    assert.match(lesson.id, /^a1-\d{2}-\d{2}$/u);
    assert.equal(Number(lesson.id.split('-')[1]), lesson.topic, `${lesson.id}: topic identity mismatch`);
  }
});

test('each A1 lesson provides goals, explanation, free creation and recall material', () => {
  const prompts = new Set();
  for (const lesson of a1Lessons) {
    for (const key of ['title', 'description', 'prompt']) text(lesson[key], `${lesson.id}.${key}`);
    for (const key of ['objectives', 'creationHints', 'reviewQuestions']) textList(lesson[key], `${lesson.id}.${key}`);
    assert.ok(lesson.grammar && typeof lesson.grammar === 'object', `${lesson.id}.grammar`);
    text(lesson.grammar.pattern, `${lesson.id}.grammar.pattern`);
    text(lesson.grammar.explanation, `${lesson.id}.grammar.explanation`);
    textList(lesson.grammar.notes, `${lesson.id}.grammar.notes`);
    assert.ok(!prompts.has(lesson.prompt), `${lesson.id}: creation task duplicates another lesson`);
    prompts.add(lesson.prompt);
  }
});

test('vocabulary and examples have Russian text and Korean meanings', () => {
  for (const lesson of [...a1Lessons, previewLesson]) {
    for (const key of ['words', 'examples']) {
      assert.ok(Array.isArray(lesson[key]) && lesson[key].length > 0, `${lesson.id}.${key} must contain material`);
      lesson[key].forEach((item, index) => {
        const path = `${lesson.id}.${key}[${index}]`;
        assert.ok(item && typeof item === 'object' && !Array.isArray(item), path);
        text(item.ru, `${path}.ru`);
        text(item.meaning, `${path}.meaning`);
        assert.match(item.ru, /[А-Яа-яЁё]/u, `${path}.ru must contain Russian`);
        assert.match(item.meaning, /[가-힣]|^\d+$/u, `${path}.meaning must explain the meaning in Korean or give the numeric value`);
        if (item.note !== undefined) text(item.note, `${path}.note`);
      });
    }
  }
});

test('Russian vocabulary and example words mark multisyllabic stress', () => {
  const problems = [];
  for (const lesson of [...a1Lessons, previewLesson]) {
    for (const key of ['words', 'examples']) {
      lesson[key].forEach((item, index) => problems.push(...stressProblems(item.ru, `${lesson.id}.${key}[${index}]`)));
    }
  }
  assert.deepEqual(problems, [], `Missing or malformed stress marks:\n${problems.join('\n')}`);
});

test('grammar tables keep column headings aligned with every row', () => {
  for (const lesson of a1Lessons) {
    const table = lesson.grammar.table;
    if (table === undefined) continue;
    textList(table.headers, `${lesson.id}.grammar.table.headers`);
    assert.ok(Array.isArray(table.rows) && table.rows.length > 0, `${lesson.id}: table needs rows`);
    table.rows.forEach((row, index) => {
      textList(row, `${lesson.id}.grammar.table.rows[${index}]`);
      assert.equal(row.length, table.headers.length, `${lesson.id}: table row ${index} has the wrong number of columns`);
    });
  }
});

test('all lessons use the six-stage creation and review learning flow', () => {
  assert.deepEqual(stages.map(stage => stage.id), ['input', 'understand', 'repeat', 'create', 'feedback', 'review']);
  assert.deepEqual(stages.map(stage => stage.name), ['Input', 'Understand', 'Repeat', 'Create', 'Feedback', 'Review']);
  stages.forEach(stage => text(stage.label, `stages.${stage.id}.label`));
});
