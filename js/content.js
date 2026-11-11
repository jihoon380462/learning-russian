/**
 * 정식 커리큘럼은 추후 추가합니다.
 * previewLesson은 UI와 학습 흐름을 확인하기 위한 샘플입니다.
 */
export const lessons = [];

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
