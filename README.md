# ПроверьAI — fullstack clean revision

## Запуск

1. Убедитесь, что используется публичный npm registry:

```bash
npm config set registry https://registry.npmjs.org/
```

2. Установите зависимости:

```bash
npm install
```

3. Скопируйте `.env.example` в `.env` и заполните серверный `OPENAI_API_KEY`.

Важно:
- ключ используется только на backend;
- не вставляйте его в `src/*`, `localStorage` или браузерные переменные;
- если ключ уже был где-то публично показан, его лучше перевыпустить.

4. Запустите backend:

```bash
npm run server
```

5. Во втором терминале запустите frontend:

```bash
npm run dev
```

6. Откройте:

```text
http://127.0.0.1:4273/
```

## AI env

Минимально для OpenAI:

```bash
OPENAI_API_KEY=sk-...
ENABLE_OPENAI_RECOGNITION=true
ENABLE_BATCH_AI_GRADING=true
ENABLE_TEACHER_REVIEW_REQUIRED=true
```

Дополнительно поддерживаются:

```bash
OPENAI_MODEL=gpt-5.2
OPENAI_RECOGNITION_MODEL=gpt-5.2
OPENAI_ANALYSIS_MODEL=gpt-5.2
ENABLE_MATHPIX=false
ENABLE_ADVANCED_FORMULA_RECOGNITION=false
```

Mathpix пока подготовлен архитектурно через feature flag, но не включен в обязательный runtime flow.
Если модель явно не указана, backend теперь по умолчанию берет `gpt-5.2`.

## Проверка вручную

1. Войти преподавателем `teacher@demo.ru / demo12345`.
2. Открыть `Задания` и создать или опубликовать задание с вложением.
3. Войти учеником `student@demo.ru / demo12345`.
4. Открыть `Мои задания`, загрузить несколько фото или PDF.
5. Вернуться преподавателем в `Проверка`.
6. Убедиться, что работа проходит статусы `Загружено / В очереди AI / AI обрабатывает / Черновик готов`.
7. Открыть review-экран, отредактировать комментарии и нажать `Подтвердить`.
8. Проверить в кабинете ученика подтвержденный комментарий, итоговый балл и рекомендации.

Если `OPENAI_API_KEY` не задан, backend остается в безопасном режиме: upload и review flow не падают, но новые работы получают `processingStatus=failed` с понятным сообщением о том, что AI не настроен на сервере.

## Тесты

```bash
npm run test:server
npm run build
```

## Демо-аккаунты

### Преподаватель
- email: `teacher@demo.ru`
- пароль: `demo12345`

### Ученик
- email: `student@demo.ru`
- пароль: `demo12345`

## Что изменено
- регистрация / логин через backend;
- teacher SMS mock verification;
- Freemium: 30 дней trial, после этого Free-режим с доступом только к пакетной проверке и тарифам;
- улучшены разделы Ученики / Группы / Задания / Настройки / Проверка;
- множественные загрузки файлов и фото;
- добавлен server-side AI pipeline: submission assets, recognition jobs, analysis drafts, teacher review, final feedback;
- добавлены feature flags для OpenAI / batch AI / teacher-review-required / будущего Mathpix;
- review UI преподавателя обновлен под human-in-the-loop подтверждение;
- student-side отображает только подтвержденный преподавателем результат;
- backend хранит данные в `server/data/data.json`.
