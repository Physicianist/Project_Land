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

3. Запустите backend:

```bash
npm run server
```

4. Во втором терминале запустите frontend:

```bash
npm run dev
```

5. Откройте:

```text
http://127.0.0.1:4173/
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
- backend хранит данные в `server/data/data.json`.
