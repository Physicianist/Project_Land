const META_TAG_PATTERNS = [
  /ocr/i,
  /confidence/i,
  /human/i,
  /manual/i,
  /нужна ручная проверка/i,
  /ручн/i,
  /uncertain/i,
  /warning/i,
  /предупрежд/i,
  /ai /i,
  /^ai$/i,
  /^ocr$/i,
];

export const NORMALIZED_ERROR_TAXONOMY = [
  'Арифметическая ошибка',
  'Вычислительная ошибка',
  'Ошибка в формуле',
  'Несоответствие условию',
  'Ошибка в единицах измерения',
  'Логическая ошибка в решении',
  'Ошибка в преобразованиях',
  'Ошибка в построении графика/рисунка',
];

const CATEGORY_RULES = [
  { category: 'Несоответствие условию', patterns: [/несоответств/i, /не по услов/i, /не соответствует/i, /задан(ию|ному условию)/i] },
  { category: 'Ошибка в единицах измерения', patterns: [/единиц/i, /см\b/i, /мм\b/i, /м\b/i, /кг\b/i, /литр/i, /размерност/i] },
  { category: 'Ошибка в построении графика/рисунка', patterns: [/график/i, /рисунк/i, /чертеж/i, /построен/i, /схем/i, /координат/i] },
  { category: 'Ошибка в преобразованиях', patterns: [/преобразован/i, /раскрыти/i, /сокращен/i, /упрощен/i, /перенос/i, /приведен/i] },
  { category: 'Ошибка в формуле', patterns: [/формул/i, /площад/i, /периметр/i, /теорем/i, /дискриминант/i, /подстав/i, /sin/i, /cos/i, /tg/i, /логарифм/i] },
  { category: 'Арифметическая ошибка', patterns: [/арифмет/i, /сложен/i, /вычитан/i, /умножен/i, /делен/i, /знак/i, /ошибка в счете/i] },
  { category: 'Вычислительная ошибка', patterns: [/вычисл/i, /посчит/i, /считал/i, /округл/i, /численн/i, /подсчет/i] },
  { category: 'Логическая ошибка в решении', patterns: [/логическ/i, /не следует/i, /нет обоснован/i, /неверный вывод/i, /ход решени/i, /рассуждени/i] },
];

const uniqueStrings = (items = []) => [...new Set(items.map(item => String(item || '').trim()).filter(Boolean))];

export function isMetaErrorTag(value = '') {
  const text = String(value || '').trim();
  if (!text) return true;
  return META_TAG_PATTERNS.some(pattern => pattern.test(text));
}

export function normalizeErrorCategory(...parts) {
  const source = parts.map(part => String(part || '').trim()).filter(Boolean).join(' ').toLowerCase();
  if (!source) return 'Логическая ошибка в решении';
  const matched = CATEGORY_RULES.find(rule => rule.patterns.some(pattern => pattern.test(source)));
  return matched?.category || 'Логическая ошибка в решении';
}

export function sanitizeEditableErrorTags(tags = []) {
  return uniqueStrings(tags)
    .filter(tag => !isMetaErrorTag(tag))
    .filter(tag => tag.length <= 90);
}

export function normalizeErrorTags(tags = [], fallback = []) {
  const source = [...sanitizeEditableErrorTags(tags), ...sanitizeEditableErrorTags(fallback)];
  return uniqueStrings(source.map(tag => normalizeErrorCategory(tag)));
}

export function normalizeMistakeCollection(mistakes = [], fallbackTags = []) {
  const rawTags = [
    ...sanitizeEditableErrorTags(fallbackTags),
    ...mistakes.flatMap(mistake => sanitizeEditableErrorTags([
      mistake?.title,
      mistake?.label,
      ...(mistake?.types || []),
    ])),
  ];
  const normalizedTags = normalizeErrorTags(rawTags);
  return {
    rawTags,
    normalizedTags,
  };
}

export function countNormalizedCategories(items = []) {
  const counts = items.reduce((acc, item) => {
    const category = normalizeErrorCategory(item);
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'ru'));
}
