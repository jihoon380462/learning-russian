import { a1Foundations } from './lessons/a1-foundations.js';
import { a1Cases } from './lessons/a1-cases.js';
import { a1Actions } from './lessons/a1-actions.js';

// 주제 번호는 docs/curriculum.md와 연결되며, 한 주제에 여러 레슨을 둡니다.
export const a1Topics = [
  { id: 1, title: '발음과 강세 익히기' },
  { id: 2, title: '인사와 자기소개' },
  { id: 3, title: '가장 기본적인 문장' },
  { id: 4, title: '명사의 성과 수' },
  { id: 5, title: '사람과 소유 표현' },
  { id: 6, title: '사람과 사물 묘사' },
  { id: 7, title: '숫자와 생활 정보' },
  { id: 8, title: '현재 하는 일' },
  { id: 9, title: '어디에 있는지 말하기' },
  { id: 10, title: '무엇을 하는지 말하기' },
  { id: 11, title: '가지고 있는 것과 없는 것' },
  { id: 12, title: '누구에게, 누구에게 필요한지' },
  { id: 13, title: '누구와, 무엇으로 하는지' },
  { id: 14, title: '어제 있었던 일' },
  { id: 15, title: '동사상의 첫 이해' },
  { id: 16, title: '앞으로 할 일' },
  { id: 17, title: '이동과 목적지' },
  { id: 18, title: '부탁·허락·필요 표현' },
  { id: 19, title: '짧은 문장 연결' },
];

export const lessons = [...a1Foundations, ...a1Cases, ...a1Actions];

export const stages = [
  { id: 'input', label: '단어', name: 'Input' },
  { id: 'understand', label: '이해', name: 'Understand' },
  { id: 'repeat', label: '반복', name: 'Repeat' },
  { id: 'create', label: '창작', name: 'Create' },
  { id: 'feedback', label: '피드백', name: 'Feedback' },
  { id: 'review', label: '복습', name: 'Review' },
];

export const previewLesson = {
  id: 'preview',
  number: '01',
  title: '취향 말하기',
  description: '좋아하는 활동을 나만의 문장으로 표현해 보세요.',
  isPreview: true,
  words: [
    { ru: 'чита́ть', meaning: '읽다' },
    { ru: 'гуля́ть', meaning: '산책하다' },
    { ru: 'гото́вить', meaning: '요리하다' },
  ],
  grammar: {
    pattern: 'Я люблю́ + 동사원형',
    explanation:
      '좋아하는 활동을 말할 때 Я люблю́ 뒤에 동사원형을 붙입니다. люблю́는 люби́ть(좋아하다)의 1인칭 단수 현재형입니다.',
  },
  examples: [
    { ru: 'Я люблю́ чита́ть.', meaning: '나는 독서를 좋아해요.' },
    { ru: 'Я люблю́ гуля́ть.', meaning: '나는 산책하는 것을 좋아해요.' },
  ],
  prompt: '좋아하는 활동을 자유롭게 써 보세요.',
};
