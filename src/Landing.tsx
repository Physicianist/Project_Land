import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, Menu, X } from 'lucide-react';
import workPhoto from '../image.png';
import workCrop from '../Crop.jpg';

const navItems = [
  { id: 'demo', label: 'Пример' },
  { id: 'pain', label: 'Узнать себя' },
  { id: 'workflow', label: 'Функционал' },
  { id: 'calculator', label: 'Калькулятор выгоды' },
  { id: 'pricing', label: 'Тарифы' },
  { id: 'faq', label: 'FAQ' },
];

const proofItems = [
  'Распознает почерк и переведет ответ в печатный формат с рисунками ученика',
  'Проверит с указанием конкретной ошибки и предложением балла',
  'Выявит первопричину и добавит рекомендации по усвоению материала',
  'Напишет готовый комментарий для каждой работы',
  'Составит отчет родителям за выбранный период'
];


const painItems = [
  'Работы копятся и съедают время в течение или после занятий',
  'Фото тетрадей неудобно разбирать, особенно если страниц несколько',
  'Почерк учеников оставляет желать лучшего',
  'Одни и те же комментарии приходится переписывать снова и снова',
  'Хотите заниматься преподаванием, а не проверкой',
  'Хотите быть конкурентными на рынке репетиторских услуг и не отставать от технологий',
  'Родители требует обратной связи и нужно каждому ответить'
];

const scenarioSteps = [
  {
    step: '01',
    title: 'Ученица загрузила 4 фото по алгебре',
    text: 'Система собрала страницы в одну работу и подготовила их к разбору.',
  },
  {
    step: '02',
    title: 'Найдена ошибка на шаге 3',
    text: 'ПроверьAI подсветил место, где решение ушло не туда после раскрытия скобок.',
  },
  {
    step: '03',
    title: 'Предложен балл 7/10',
    text: 'Баллы собраны как черновик. Итог не отправляется автоматически.',
  },
  {
    step: '04',
    title: 'Собран комментарий к работе',
    text: 'Комментарий объясняет, где именно сбилась логика решения и что проверить заново.',
  },
  {
    step: '05',
    title: 'Преподаватель поправил формулировку и отправил итог',
    text: 'Финальная версия остаётся человеческой, а не машинной.',
  },
];

const workSteps = [
  {
    number: '01',
    title: 'Создайте задание',
    text: 'Задайте тему, дедлайн, получателя,добавьте вложения (при необходимости). Задание можно сохранить как шаблон для повторного использования',
  },
  {
    number: '02',
    title: 'Загрузка работы',
    text: 'Загружать работу может как ученик, так и преподаватель. Подойдут фото тетради, сканы или PDF. Если страниц несколько, загрузите их вместе, и система соберёт их в одну работу.',
  },
  {
    number: '03',
    title: 'Система соберёт первичный разбор',
    text: 'Распознает текст в удобном формате, подсветит вероятные ошибки, соберёт черновик комментария и оценки.Вам останется лишь утвердить резуьльт',
  },
  {
    number: '04',
    title: 'Аналитика резуьтатов и отчёты',
    text: 'Каждому пользователю доступен интерактивынй дашборд с основными показателями учеников/классов для выявления их точек роста. Также система будет собирать статистику по каждому ученику и формировать отчёт для родителей по выбранному периоду',
  },
];

const businessOutcomes = [
  {
    title: 'Быстрее даёте обратную связь',
    text: 'Черновик проверки уже собран, поэтому вы не начинаете с пустого листа.',
    meta: 'Черновик уже собран',
    bars: [84, 58, 92],
  },
  {
    title: 'Меньше механической нагрузки',
    text: 'Распознавание, первичный разбор и повторяющиеся комментарии уходят в сервис.',
    meta: 'Рутина уходит первой',
    bars: [72, 46, 78],
  },
  {
    title: 'Видите типовые ошибки по теме',
    text: 'Проще понять, что повторяется у ученика или мини-группы.',
    meta: 'Повторяемость заметнее',
    bars: [48, 80, 62],
  },
  {
    title: 'Не теряете контроль над оценкой',
    text: 'Итоговая оценка и текст комментария всегда остаются под вашим подтверждением.',
    meta: 'Решение за преподавателем',
    bars: [94, 52, 88],
  },
  {
    title: 'Работаете и с единичными, и с пакетными проверками',
    text: 'Один сценарий подходит и для репетитора 1:1, и для потока работ.',
    meta: 'Один интерфейс',
    bars: [56, 86, 68],
  },
  {
    title: 'Не просите идеальные файлы',
    text: 'Сервис рассчитан на реальные фото, сканы и PDF, а не на специально подготовленные документы.',
    meta: 'Работает с реальными файлами',
    bars: [76, 60, 90],
  },
];

const trustItems = [
  'ИИ не отправляет результат без преподавателя.',
  'Видно исходник, распознанный текст, найденные ошибки и предложенный балл.',
  'Преподаватель всегда может переписать комментарий и поменять оценку.',
];

const trustPolicies = [
  'Публично описать правила хранения и удаления файлов.',
  'Отдельно зафиксировать, кто имеет доступ к работам и отчётам.',
  'Для школ и команд показать условия подключения и роли доступа до старта.',
];

const pricingPlans = [
  {
    title: 'Бесплатный тест',
    price: '30 дней бесплатно',
    label: 'Старт без риска',
    note: 'Чтобы проверить сервис на реальных работах до оплаты.',
    features: [
      'Все ключевые сценарии на пробный период',
      'Без привязки карты',
      'Проверка первой работы в реальном интерфейсе',
    ],
    track: [28, 54, 76],
    cta: 'Проверить первую работу бесплатно',
    href: '/login?mode=register',
    featured: false,
  },
  {
    title: 'Lite',
    price: 'Для старта',
    label: 'Режим знакомства',
    note: 'Для частных преподавателей с умеренным потоком работ.',
    features: [
      'Ограниченный объём проверок',
      'Подходит для 1:1 и первых мини-групп',
      'Понятный вход без перегрузки лишними функциями',
    ],
    track: [36, 58, 72],
    cta: 'Запустить пробный месяц',
    href: '/login?mode=register',
    featured: false,
  },
  {
    title: 'Pro',
    price: 'Для потока',
    label: 'Для активных преподавателей',
    note: 'Основной тариф для регулярной проверки, групп и аналитики.',
    features: [
      'Больше проверок и сценарии для мини-групп',
      'Аналитика по темам и типовым ошибкам',
      'Подходит, когда проверка стала регулярной частью недели',
    ],
    track: [48, 72, 92],
    cta: 'Запустить пробный месяц',
    href: '/login?mode=register',
    featured: true,
  },
  {
    title: 'Team / School',
    price: 'По запросу',
    label: 'Для школы и команды',
    note: 'Когда нужен общий контур работы, правила доступа и внедрение в поток.',
    features: [
      'Командный сценарий и сопровождение внедрения',
      'Настройка под процесс школы или курса',
      'Условия и состав решения обсуждаются отдельно',
    ],
    track: [40, 64, 88],
    cta: 'Обсудить подключение',
    href: '/login?mode=register',
    featured: false,
  },
];

const faqs = [
  {
    q: 'ИИ сам ставит итоговую оценку?',
    a: 'Нет. ПроверьAI собирает первичный разбор, подсвечивает вероятные ошибки и предлагает балл как черновик. Итоговую оценку подтверждает или меняет преподаватель',
  },
  {
    q: 'Подходит ли сервис частному репетитору?',
    a: 'Да. Сервис помогает репетиторам и преподавателям мини-групп быстрее проходить письменные работы без потери качества обратной связи',
  },
  {
    q: 'Можно ли проверять много работ сразу?',
    a: 'Да. Сервис рассчитан не только на единичную проверку, но и на поток фото, сканов и PDF. Это особенно полезно для мини-групп и школьных сценариев',
  },
  {
    q: 'Какие форматы поддерживаются?',
    a: 'Фото тетрадей, сканы и PDF. Для одной работы можно загрузить несколько страниц',
  },
  {
    q: 'Что будет после бесплатного периода?',
    a: 'После пробного периода можно выбрать подходящий тариф под свой объём проверки',
  },
  {
    q: 'Для каких предметов это подходит?',
    a: 'Пока сервис сфокусирован на математику, физику и химию, но мы планируем расширять список поддерживаемых предметов',
  },
  {
    q: 'Что, если система ошиблась?',
    a: 'У вас всегда есть возможность отредактировать черновик проверки',
  },
];

function scrollToId(id) {
  const element = document.getElementById(id);
  if (!element) return;

  const header = document.querySelector('.plHeader');
  const offset = header ? header.getBoundingClientRect().height : 0;
  const top = element.getBoundingClientRect().top + window.scrollY - offset - 12;
  window.scrollTo({ top, behavior: 'smooth' });
}

function LandingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNav = (id) => {
    setMobileOpen(false);
    scrollToId(id);
  };

  return (
    <header className="plHeader">
      <div className="plContainer plHeaderRow">
        <Link to="/" className="plBrand" aria-label="ПроверьAI">
          <span className="plBrandMark" aria-hidden="true">
            <span className="plBrandMarkCore" />
          </span>
          <span className="plBrandTextWrap">
            <span className="plBrandText">ПроверьAI</span>
            <span className="plBrandMeta">Помощник каждого репетитора и преподавателя</span>
          </span>
        </Link>

        <nav className="plNav" aria-label="Основная навигация">
          {navItems.map(({ id, label }) => (
            <button key={id} type="button" onClick={() => handleNav(id)}>
              {label}
            </button>
          ))}
        </nav>

        <div className="plHeaderActions">
          <Link to="/login" className="plGhostBtn">
            Войти
          </Link>
          <Link to="/login?mode=register" className="plPrimaryBtn plHeaderCta">
            Проверить первую работу
          </Link>
        </div>

        <button
          type="button"
          className="plBurger"
          aria-label={mobileOpen ? 'Закрыть меню' : 'Открыть меню'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(current => !current)}
        >
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="plMobileMenu">
          <div className="plContainer plMobileMenuInner">
            {navItems.map(({ id, label }) => (
              <button key={id} type="button" onClick={() => handleNav(id)}>
                {label}
              </button>
            ))}
            <Link to="/login?mode=register" className="plPrimaryBtn plPrimaryBtnWide">
              Проверить первую работу бесплатно
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

function DynamicBackdrop() {
  return (
    <div className="plBackdrop" aria-hidden="true">
      <div className="plBackdropGlow plBackdropGlowOne" />
      <div className="plBackdropGlow plBackdropGlowTwo" />
      <div className="plBackdropGlow plBackdropGlowThree" />

      <div className="plBackdropObject plBackdropMathBoard">
        <div className="plBackdropLabel">Математика</div>
        <div className="plBackdropFormulaText">f(x) = x² - 4x + 3</div>
        <svg viewBox="0 0 240 140" className="plBackdropSvg" aria-hidden="true">
          <path d="M20 118H224" className="plBackdropAxis" />
          <path d="M120 16V124" className="plBackdropAxis" />
          <path d="M28 102C64 78 78 42 120 42C162 42 176 78 212 102" className="plBackdropCurve" />
          <circle cx="120" cy="42" r="5" className="plBackdropPoint" />
        </svg>
      </div>

      <div className="plBackdropObject plBackdropGeometryCard">
        <div className="plBackdropLabel">Геометрия</div>
        <svg viewBox="0 0 220 160" className="plBackdropSvg" aria-hidden="true">
          <path d="M42 122L110 38L178 122Z" className="plBackdropShape" />
          <path d="M58 110Q110 88 162 110" className="plBackdropCurve" />
          <circle cx="110" cy="38" r="6" className="plBackdropPoint" />
          <circle cx="42" cy="122" r="6" className="plBackdropPoint" />
          <circle cx="178" cy="122" r="6" className="plBackdropPoint" />
          <path d="M74 84A40 40 0 0 1 146 84" className="plBackdropOutline" />
        </svg>
      </div>

      <div className="plBackdropObject plBackdropPhysicsBoard">
        <div className="plBackdropLabel">Физика</div>
        <div className="plBackdropFormulaText">E = mc²</div>
        <svg viewBox="0 0 240 120" className="plBackdropSvg" aria-hidden="true">
          <path d="M12 60C34 26 58 94 82 60C106 26 130 94 154 60C178 26 202 94 228 60" className="plBackdropWave" />
          <path d="M36 102L196 102" className="plBackdropAxis" />
          <path d="M120 20L120 102" className="plBackdropAxis" />
        </svg>
      </div>

      <div className="plBackdropObject plBackdropPhysicsCard">
        <div className="plBackdropLabel">Механика</div>
        <svg viewBox="0 0 220 180" className="plBackdropSvg" aria-hidden="true">
          <path d="M110 24V118" className="plBackdropAxis" />
          <path d="M110 24L156 82" className="plBackdropShapeMuted" />
          <circle cx="156" cy="82" r="20" className="plBackdropOutline" />
          <path d="M54 132C78 110 130 110 166 132" className="plBackdropShape" />
          <path d="M54 132H166" className="plBackdropShapeMuted" />
        </svg>
      </div>

      <div className="plBackdropObject plBackdropChemBoard">
        <div className="plBackdropLabel">Химия</div>
        <div className="plBackdropFormulaText">H₂O · CO₂ · NaCl</div>
        <svg viewBox="0 0 240 150" className="plBackdropSvg" aria-hidden="true">
          <path d="M58 92L92 56L140 56L174 92L140 128L92 128Z" className="plBackdropShape" />
          <path d="M92 56L140 128" className="plBackdropShapeMuted" />
          <path d="M140 56L92 128" className="plBackdropShapeMuted" />
          <circle cx="58" cy="92" r="8" className="plBackdropPoint" />
          <circle cx="92" cy="56" r="8" className="plBackdropPoint" />
          <circle cx="140" cy="56" r="8" className="plBackdropPoint" />
          <circle cx="174" cy="92" r="8" className="plBackdropPoint" />
          <circle cx="140" cy="128" r="8" className="plBackdropPoint" />
          <circle cx="92" cy="128" r="8" className="plBackdropPoint" />
        </svg>
      </div>

      <div className="plBackdropObject plBackdropLabCard">
        <svg viewBox="0 0 220 190" className="plBackdropSvg" aria-hidden="true">
          <path d="M86 28H134" className="plBackdropAxis" />
          <path d="M100 28V76L62 144C58 152 64 162 74 162H146C156 162 162 152 158 144L120 76V28" className="plBackdropShape" />
          <path d="M76 126C92 118 108 136 124 128C136 122 144 128 152 132" className="plBackdropWave" />
          <circle cx="88" cy="108" r="5" className="plBackdropPoint plBackdropBubbleOne" />
          <circle cx="132" cy="112" r="4" className="plBackdropPoint plBackdropBubbleTwo" />
        </svg>
      </div>

      <div className="plBackdropClockNext">
        <div className="plBackdropClockMarks">
          {Array.from({ length: 12 }, (_, index) => (
            <span key={index} style={{ '--clock-rotation': `${index * 30}deg` }} />
          ))}
        </div>
        <span className="plBackdropClockHand plBackdropClockHandHour" />
        <span className="plBackdropClockHand plBackdropClockHandMinute" />
      </div>
      <div className="plBackdropOrbit plBackdropOrbitOne" />
      <div className="plBackdropOrbit plBackdropOrbitTwo" />
      <div className="plBackdropOrbit plBackdropOrbitThree" />
      <div className="plBackdropBeam plBackdropBeamOne" />
      <div className="plBackdropBeam plBackdropBeamTwo" />
      <div className="plBackdropTrail plBackdropTrailOne">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="plBackdropTrail plBackdropTrailTwo">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="plBackdropPanel plBackdropPanelOne" />
      <div className="plBackdropPanel plBackdropPanelTwo" />
      <div className="plBackdropFrame" />
      <div className="plBackdropBadge plBackdropPhysics">E=mc²</div>
      <div className="plBackdropBadge plBackdropChemistry">H₂O</div>
      <div className="plBackdropBadge plBackdropMath">a²+b²=c²</div>
      <div className="plBackdropBadge plBackdropFormula">∫ x² dx</div>
      <div className="plBackdropBadge plBackdropPhysics2">F = ma</div>
      <div className="plBackdropBadge plBackdropChemistry2">C₆H₁₂O₆</div>
      <div className="plBackdropBadge plBackdropMath2">πr²</div>
      <div className="plBackdropBadge plBackdropFormula2">sin x</div>
      <div className="plBackdropBadge plBackdropFormula3">Δv = at</div>
      <div className="plBackdropBadge plBackdropGraph">y = x²</div>
      <div className="plBackdropClock">
        <span />
        <span />
      </div>
      <div className="plBackdropDots">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function PrismSketch({ className = '' }) {
  return (
    <svg viewBox="0 0 240 180" className={className} aria-hidden="true">
      <path d="M48 132V52L120 52V132Z" />
      <path d="M120 132L170 94V20L120 52Z" />
      <path d="M48 52L98 20H170L120 52Z" />
      <path d="M98 20L98 100" />
      <path d="M170 20V94" />
      <path d="M48 132H120" />
      <path d="M120 132L170 94" />
      <text x="54" y="156">a=10</text>
      <text x="146" y="118">b=20</text>
      <text x="176" y="54">c=30</text>
    </svg>
  );
}

function RecognizedPrismFragment() {
  return (
    <div className="plRecognizedBlock">
      <div className="plLatexCard">
        <div className="plLatexLine">a = 10,\quad b = 20,\quad c = 30</div>
        <div className="plLatexLine">V = a \cdot b \cdot c</div>
        <div className="plLatexLine">V = 10 \cdot 20 \cdot 30 = 6000</div>
        <div className="plLatexLine">\text&#123;Ответ:&#125;\quad V = 6000</div>
      </div>
      <div className="plRecognizedSketchCard">
        <PrismSketch className="plRecognizedSketch" />
      </div>
    </div>
  );
}

function WorkPhotoPreview() {
  return (
    <div className="plWorkPhotoCard">
      <img src={workPhoto} alt="Фото работы ученика" className="plWorkPhoto" />
    </div>
  );
}

function RecognizedWorkFragment() {
  return (
    <div className="plRecognizedBlockNext">
      <div className="plRecognizedTextCard">
        <div className="plRecognizedTextLine">Р-м параллелепипед со сторонами a=10, b=20, c=30</div>
        <div className="plRecognizedTextLine">Д-во: V=a·b·c = 30·20·10 =3000</div>
        <div className="plRecognizedTextLine">Ответ: V=3000</div>
      </div>
      <div className="plRecognizedCropCard">
        <img src={workCrop} alt="Вырезанный фрагмент фото с рисунком" className="plRecognizedCrop" />
      </div>
    </div>
  );
}

function HeroSection() {
  return (
    <section className="plHero">
      <div className="plContainer plHeroGrid">
        <div className="plHeroCopy" data-reveal style={getRevealStyle(0)}>
          <h1 className="plHeroTitle">
            Проверка, аналитика и составление отчетов для родителей без рутины
          </h1>

          <div className="plHeroActions">
            <Link to="/login?mode=register" className="plPrimaryBtn">
              Попробовать бесплатно <ArrowRight size={16} />
            </Link>
            <button type="button" className="plSecondaryBtn" onClick={() => scrollToId('demo')}>
              Посмотреть пример проверки
            </button>
          </div>

        </div>

        <div className="plHeroDemo" aria-label="Пример продуктовой проверки" data-reveal style={getRevealStyle(1)}>
          <div className="plReviewCase">
            <div className="plDemoCardTop">
              <span>Фото работы и черновик проверки</span>
              <span>1 страница</span>
            </div>

            <div className="plNotebookMeta">
              <strong>Геометрия, домашняя работа</strong>
              <span>Ученица: Мария К.</span>
            </div>

            <WorkPhotoPreview />

            <article className="plResultItem">
              <span>Распознанный фрагмент</span>
              <RecognizedWorkFragment />
            </article>

            <article className="plResultItem">
              <span>Список ошибок в работе</span>
              <p>Объем прямоугольного параллелепипеда вычислен по верной формуле, но в подстановке допущена арифметическая ошибка: 10 · 20 · 30 равно 6000, а не 3000.</p>
            </article>

            <div className="plReviewBottom">
              <article className="plDraftComment">
                <span>Комментарий ученику</span>
                <p>
                  Формула объема выбрана правильно, и обозначения на рисунке читаются аккуратно. Ошибка возникла на последнем вычислении:
                  вместо <em>10 · 20 · 30 = 6000</em> записано <em>3000</em>. Пересчитай произведение и исправь ответ.
                </p>
              </article>

              <article className="plResultItem plResultScore">
                <span>Предложенный балл</span>
                <strong>3/5</strong>
              </article>
            </div>

            <div className="plReviewActions">
              <button type="button" className="plEditBtn">Редактировать</button>
              <button type="button" className="plConfirmBtn">Подтвердить</button>
            </div>
          </div>

          <div className="plDemoSource">
            <div className="plDemoCardTop">
              <span>Фото работы</span>
              <span>1 страница</span>
            </div>

            <div className="plNotebookShot">
              <div className="plNotebookMeta">
                <strong>Геометрия, домашняя работа</strong>
                <span>Ученица: Мария К.</span>
              </div>
              <WorkPhotoPreview />
              <div className="plNotebookPhoto">
                <div className="plNotebookPhotoFrame">
                  <div className="plNotebookPhotoSketch">
                    <PrismSketch className="plNotebookSketch" />
                  </div>
                  <div className="plNotebookPhotoText">
                    <div>Р-м параллелепипед со сторонами</div>
                    <div>a = 10, b = 20, c = 30</div>
                    <div>Д-во: V = a · b · c</div>
                    <div>V = 30 · 20 · 10 = 3000</div>
                    <div>Ответ: V = 3000</div>
                  </div>
                </div>
              </div>
              <div className="plDemoHint">Подходят фото тетради, сканы и PDF</div>
            </div>
          </div>

          <div className="plDemoResult">
            <div className="plDemoCardTop">
              <span>Черновик проверки</span>
            </div>

            <div className="plResultGrid">
              <article className="plResultItem">
                <span>Распознанный фрагмент</span>
                <RecognizedWorkFragment />
              </article>
              <article className="plResultItem">
                <span>Список ошибок в работе</span>
                <p>Объем прямоугольного параллелепипеда вычислен по верной формуле, но в подстановке допущена арифметическая ошибка: 10 · 20 · 30 равно 6000, а не 3000.</p>
              </article>
              <article className="plResultItem plResultScore">
                <span>Предложенный балл</span>
                <strong>3/5</strong>
              </article>
            </div>

            <article className="plDraftComment">
              <span>Комментарий по ученику</span>
              <p>
                Формула объема выбрана правильно, и обозначения на рисунке читаются аккуратно. Ошибка возникла на последнем вычислении:
                вместо <em>10 \cdot 20 \cdot 30 = 6000</em> записано <em>3000</em>. Пересчитай произведение и исправь ответ.
              </p>
            </article>

            <div className="plResultActions">
              <button type="button" className="plConfirmBtn">Подтвердить</button>
              <button type="button" className="plEditBtn">Исправить</button>
            </div>

            <div className="plHumanLoopNote">
              Финальный результат отправляется только после подтверждения преподавателя.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProofStripSection() {
  return (
    <section className="plProofStrip">
      <div className="plContainer">
        <h3 className="plProofTitle" data-reveal style={getRevealStyle(0)}>
          Чем ПроверьAI может быть полезен преподавателю и репетитору
        </h3>
      </div>
      <div className="plContainer plProofGrid">
        {proofItems.map((item, index) => (
          <article
            key={item}
            className={`plProofCard ${index < 3 ? 'is-top-row' : 'is-bottom-row'}`}
            data-reveal
            style={getRevealStyle(index)}
          >
            <div className="plProofTop" aria-hidden="true">
              <span className="plProofDot" />
              <span className="plProofRail" />
            </div>
            <p>{item}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function AudienceSection() {
  return (
    <section id="audience" className="plSection">
      <div className="plContainer">
        <div className="plSectionHead" data-reveal style={getRevealStyle(0)}>
          <div className="plEyebrow">Кому подходит</div>
        </div>

        <div className="plAudienceGrid">
          {audienceCards.map(({ title, badge, pain, result, points }, index) => (
            <article
              key={title}
              className={`plCard plAudienceCard ${index < 2 ? 'is-primary' : 'is-secondary'}`}
              data-reveal
              style={getRevealStyle(index)}
            >
              <div className="plCardTop">
                <span className="plCardIndex">0{index + 1}</span>
                <span className="plCardBadge">{badge}</span>
              </div>
              <h3>{title}</h3>
              <div className="plCardSplit">
                <div>
                  <span className="plCardLabel">Боль</span>
                  <p>{pain}</p>
                </div>
                <div>
                  <span className="plCardLabel">Результат</span>
                  <p>{result}</p>
                </div>
              </div>
              <ul className="plList">
                {points.map(point => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function PainSection() {
  return (
    <section id="pain" className="plSection plSectionDark">
      <div className="plContainer plPainGrid">
        <div data-reveal style={getRevealStyle(0)}>
          <div className="plEyebrow plEyebrowLight">От чего страдают большинство преподавателей</div>
          <h2 className="plSectionTitleLight"> Если хотя бы 1 пункт описывает вашу ситуацию, то ПроверьAI может быть полезен</h2>
        </div>

        <div className="plPainBoard">
          {painItems.map((item, index) => (
            <article key={item} className="plPainItem" data-reveal style={getRevealStyle(index + 1)}>
              <span>0{index + 1}</span>
              <p>{item}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ExampleSection() {
  return (
    <section id="demo" className="plSection">
      <div className="plContainer">
        <div className="plSectionHead" data-reveal style={getRevealStyle(0)}>
          <div className="plEyebrow">Пример одной проверки</div>
          <h2>Не “магия ИИ”, а понятный сценарий от загрузки до отправки результата</h2>
        </div>

        <div className="plExampleLayout">
          <div className="plExampleTimeline">
            {scenarioSteps.map(({ step, title, text }, index) => (
              <article key={step} className="plTimelineItem" data-reveal style={getRevealStyle(index)}>
                <span>{step}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="plExampleBoard" data-reveal style={getRevealStyle(2)}>
            <div className="plExampleColumn">
              <span className="plMiniTitle">Что загрузил ученик</span>
              <div className="plUploadStack">
                <div>Фото 1 · чертеж прямоугольного параллелепипеда с подписями a=10, b=20, c=30</div>
                <div>Фото 2 · запись условия и выбранная формула объема V = a · b · c</div>
                <div>Фото 3 · подстановка чисел 30 · 20 · 10</div>
                <div>Фото 4 · итоговый ответ V = 3000</div>
              </div>
            </div>

            <div className="plExampleColumn">
              <span className="plMiniTitle">Что собрал сервис</span>
              <div className="plAuditList">
                <div>
                  <strong>Распознавание</strong>
                  <p>Из фото собраны обозначения a = 10, b = 20, c = 30, формула V = a · b · c и итоговый ответ ученика.</p>
                </div>
                <div>
                  <strong>Ошибка</strong>
                  <p>Вычисление на последнем шаге неверно: произведение 10 · 20 · 30 равно 6000, поэтому ответ 3000 занижен вдвое.</p>
                </div>
                <div>
                  <strong>Балл</strong>
                  <p>Черновик: 3/5.</p>
                </div>
                <div>
                  <strong>Комментарий</strong>
                  <p>Сервис отмечает, что ход решения выбран верно, а ошибка локализуется в арифметике при подсчете объема.</p>
                </div>
              </div>
            </div>

            <div className="plExampleOutcome">
              <span className="plMiniTitle">Что отправил преподаватель</span>
              <p>
                Исправил формулировку комментария, оставил предложенный балл и отправил ученице
                уже собранный, понятный итог.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkflowSection() {
  return (
    <section id="workflow" className="plSection plSectionTint">
      <div className="plContainer">
        <div className="plSectionHead" data-reveal style={getRevealStyle(0)}>
          <div className="plEyebrow">Как это работает</div>
          <h2>Функционал без которого невозможно обойтись, попробовав хоть раз</h2>
          <p>
            Сервис не требует перестраивать привычный процесс, он лишь оптимизирует существующий         </p>
        </div>

        <div className="plStepsGrid">
          {workSteps.map(({ number, title, text }, index) => (
            <article key={number} className="plCard plStepCard" data-reveal style={getRevealStyle(index)}>
              <span className="plStepNumber">{number}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>

        <p className="plSectionNote" data-reveal style={getRevealStyle(5)}>
          ПроверьAI забирает рутину проверки, но не забирает ваше решение.
        </p>
      </div>
    </section>
  );
}

function BenefitsSection() {
  return (
    <section className="plSection">
      <div className="plContainer">
        <div className="plSectionHead" data-reveal style={getRevealStyle(0)}>
          <div className="plEyebrow">Почему это покупают</div>
          <h2>Сервис продаётся не функциями, а спокойным рабочим процессом</h2>
          <p>
            Ниже не “фичи ради фич”, а то, что меняется в повседневной работе преподавателя после
            внедрения такого инструмента.
          </p>
        </div>

        <div className="plBenefitsGrid">
          {businessOutcomes.map(({ title, text, meta, bars }, index) => (
            <article key={title} className="plCard plBenefitCard" data-reveal style={getRevealStyle(index)}>
              <div className="plCardSignal" aria-hidden="true">
                {bars.map((value, barIndex) => (
                  <span
                    key={`${title}-${barIndex}`}
                    className="plSignalBar"
                    style={{ '--signal-size': `${12 + value * 0.34}px`, '--signal-delay': `${barIndex * 120}ms` }}
                  />
                ))}
              </div>
              <span className="plBenefitMeta">{meta}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustSection() {
  return (
    <section className="plSection plSectionTint">
      <div className="plContainer plTrustGrid">
        <article className="plTrustMain" data-reveal style={getRevealStyle(0)}>
          <div className="plEyebrow">Доверие и прозрачность</div>
          <h2>Проверка становится быстрее, но решение остаётся за преподавателем</h2>
          <p>
            Это не сервис “оценить вместо учителя”. Это инструмент, который показывает исходник,
            распознанный текст, ошибки и черновик результата до того, как что-то уйдёт ученику.
          </p>

          <ul className="plTrustList">
            {trustItems.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <div className="plTrustSide">
          <div className="plCard plAuditCard" data-reveal style={getRevealStyle(1)}>
            <span className="plMiniTitle">Что видно преподавателю</span>
            <div className="plAuditList">
              <div>
                <strong>Исходник</strong>
                <p>Фото тетради или PDF рядом с результатом.</p>
              </div>
              <div>
                <strong>Распознанный текст</strong>
                <p>Можно быстро сверить, что поняла система.</p>
              </div>
              <div>
                <strong>Предложение системы</strong>
                <p>Ошибка, балл и комментарий как черновик, а не как финал.</p>
              </div>
            </div>
          </div>

          <div className="plCard plPolicyCard" data-reveal style={getRevealStyle(2)}>
            <span className="plMiniTitle">Что важно зафиксировать публично</span>
            <div className="plPolicySignals" aria-hidden="true">
              <span>Хранение</span>
              <span>Доступ</span>
              <span>Удаление</span>
            </div>
            <ul className="plList">
              {trustPolicies.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function OutcomeSection() {
  const [worksPerWeek, setWorksPerWeek] = useState(20);
  const [minutesPerWork, setMinutesPerWork] = useState(12);
  const [minutesSaved, setMinutesSaved] = useState(4);
  const maxMinutesSaved = 30;

  const calculation = useMemo(() => {
    const safeSaved = Math.min(minutesSaved, minutesPerWork);
    const totalSavedMinutes = worksPerWeek * safeSaved;
    const hours = Math.floor(totalSavedMinutes / 60);
    const minutes = totalSavedMinutes % 60;

    return {
      totalSavedMinutes,
      safeSaved,
      readable:
        hours > 0 ? `${hours} ч ${minutes > 0 ? `${minutes} мин` : ''}`.trim() : `${minutes} мин`,
    };
  }, [minutesPerWork, minutesSaved, worksPerWeek]);

  return (
    <section id="calculator" className="plSection">
      <div className="plContainer plOutcomeGrid">
        <div>
          <div className="plSectionHead" data-reveal style={getRevealStyle(0)}>
            <div className="plEyebrow">Выгода в цифрах</div>
            <h2>Без громких обещаний и выдуманных цифр, оценить потенциал можно на своей реальной нагрузке</h2>
          </div>

          <div className="plOutcomeCards">
            <article className="plCard plOutcomeCard" data-reveal style={getRevealStyle(1)}>
              <div className="plOutcomeAccent" aria-hidden="true" />
              <h3>Больше времени на преподавание</h3>
              <p>Разбор уже сделан, и вы можете сосредоточиться на содержательном донесении материала, что выделяет вас на рынке дополнительного образования</p>
            </article>
            <article className="plCard plOutcomeCard" data-reveal style={getRevealStyle(2)}>
              <div className="plOutcomeAccent" aria-hidden="true" />
              <h3>Меньше рутины</h3>
              <p>Все однотипные задачи, отнимающие большую часть времени, автоматизированы</p>
            </article>
            <article className="plCard plOutcomeCard" data-reveal style={getRevealStyle(3)}>
              <div className="plOutcomeAccent" aria-hidden="true" />
              <h3>Больше видимости по группе</h3>
              <p>Проще заметить, где ошибки начинают повторяться системно.</p>
            </article>
          </div>
        </div>

        <div className="plCard plCalculatorCard" data-reveal style={getRevealStyle(2)}>
          <div className="plMiniTitle">Калькулятор сэкономленного времени</div>
          <h3>Прикиньте эффект на своей неделе</h3>

          <label className="plField">
            <div className="plFieldHead">
              <span>Сколько работ вы проверяете в неделю?</span>
              <strong className="plFieldValue">{worksPerWeek} работ</strong>
            </div>
            <div className="plRangeShell">
              <input
                className="plRange"
                style={getRangeStyle(worksPerWeek, 5, 120)}
                type="range"
                min="5"
                max="120"
                value={worksPerWeek}
                onInput={event => setWorksPerWeek(Number(event.currentTarget.value))}
              />
            </div>
            <div className="plRangeScale" aria-hidden="true">
              <span>5</span>
              <span>120</span>
            </div>
          </label>

          <label className="plField">
            <div className="plFieldHead">
              <span>Сколько минут уходит на одну проверку сейчас?</span>
              <strong className="plFieldValue">{minutesPerWork} минут</strong>
            </div>
            <div className="plRangeShell">
              <input
                className="plRange"
                style={getRangeStyle(minutesPerWork, 3, 30)}
                type="range"
                min="3"
                max="30"
                value={minutesPerWork}
                onInput={event => setMinutesPerWork(Number(event.currentTarget.value))}
              />
            </div>
            <div className="plRangeScale" aria-hidden="true">
              <span>3</span>
              <span>30</span>
            </div>
          </label>

          <label className="plField">
            <div className="plFieldHead">
              <span>Сколько минут может снять первичный разбор?</span>
              <strong className="plFieldValue">{calculation.safeSaved} минут</strong>
            </div>
            <div className="plRangeShell">
              <input
                className="plRange"
                style={getRangeStyle(minutesSaved, 1, maxMinutesSaved)}
                type="range"
                min="1"
                max={maxMinutesSaved}
                value={minutesSaved}
                onInput={event => setMinutesSaved(Number(event.currentTarget.value))}
              />
            </div>
            <div className="plRangeScale" aria-hidden="true">
              <span>1</span>
              <span>{maxMinutesSaved}</span>
            </div>
            {minutesSaved > minutesPerWork && (
              <span className="plFieldHint">
                В расчёте учитываем не больше {minutesPerWork} минут, потому что одна проверка сейчас занимает столько времени.
              </span>
            )}
          </label>

          <div className="plCalcResult">
            <span>Потенциально возвращается за неделю</span>
            <strong>{calculation.readable}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  const [showContacts, setShowContacts] = useState(false);

  return (
    <section id="pricing" className="plSection plSectionTint">
      <div className="plContainer">
        <div className="plSectionHead" data-reveal style={getRevealStyle(0)}>
          <div className="plEyebrow">Тарифы</div>
          <h2>Выберите формат подключения под свой поток проверок</h2>
        </div>

        <div className="plPricingGrid">
          {pricingPlans.map(({ title, price, label, note, features, cta, href, featured, track }, index) => (
            <article
              key={title}
              className={`plCard plPriceCard ${featured ? 'is-featured' : ''}`}
              data-reveal
              style={getRevealStyle(index)}
            >
              <div className="plPriceTop">
                <div>
                  <span className="plMiniTitle">{label}</span>
                  <h3>{title}</h3>
                </div>
                {featured && <span className="plFeaturedBadge">Основной тариф</span>}
              </div>

              <div className="plPlanTrack" aria-hidden="true">
                {track.map((value, trackIndex) => (
                  <span
                    key={`${title}-track-${trackIndex}`}
                    className="plPlanTrackBar"
                    style={{ '--track-size': `${10 + value * 0.22}px`, '--track-delay': `${trackIndex * 120}ms` }}
                  />
                ))}
              </div>

              <div className="plPriceValue">{price}</div>
              <p className="plPriceNote">{note}</p>

              <ul className="plList">
                {features.map(feature => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>

              {title === 'Team / School' ? (
                <button
                  type="button"
                  className="plSecondaryBtn plPrimaryBtnWide"
                  onClick={() => setShowContacts(current => !current)}
                  aria-expanded={showContacts}
                  aria-controls="pricing-contacts"
                >
                  {cta}
                </button>
              ) : (
                <Link to={href} className={featured ? 'plPrimaryBtn plPrimaryBtnWide' : 'plSecondaryBtn plPrimaryBtnWide'}>
                  {cta}
                </Link>
              )}

              {title === 'Team / School' && showContacts && (
                <div id="pricing-contacts" className="plContactCardInline">
                  <span className="plMiniTitle">Контакты для подключения</span>
                  <div className="plContactList">
                    <a href="mailto:shepelin2005@bk.ru">shepelin2005@bk.ru</a>
                    <a href="tel:89827054732">8 982 705-47-32</a>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>

        <p className="plPricingFootnote" data-reveal style={getRevealStyle(5)}>
          Тариф окупается, если экономит хотя бы 25 минут в неделю.
        </p>
      </div>
    </section>
  );
}

function FAQSection() {
  const [open, setOpen] = useState(0);

  return (
    <section id="faq" className="plSection plSectionTint">
      <div className="plContainer plFaqWrap">
        <div className="plSectionHead" data-reveal style={getRevealStyle(0)}>
          <div className="plEyebrow">FAQ</div>
          <h2>Ответы на частые вопросы по подключению и работе сервиса</h2>
        </div>

        <div className="plFaqList">
          {faqs.map(({ q, a }, index) => {
            const active = open === index;
            return (
              <article
                key={q}
                className={`plFaqItem ${active ? 'is-active' : ''}`}
                data-reveal
                style={getRevealStyle(index)}
              >
                <button
                  type="button"
                  className="plFaqButton"
                  aria-expanded={active}
                  onClick={() => setOpen(active ? -1 : index)}
                >
                  <span>{q}</span>
                  <ChevronDown size={18} />
                </button>
                {active && <div className="plFaqContent">{a}</div>}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FinalCTASection() {
  return (
    <section className="plSection plFinalSection">
      <div className="plContainer">
        <div className="plFinalCard" data-reveal style={getRevealStyle(0)}>
          <p>
            Зарегистрируйтесь, загрузите первую работу и ощутитие на себе, как рутина проверки уходит на второй план
          </p>

          <div className="plHeroActions plFinalActions">
            <Link to="/login?mode=register" className="plPrimaryBtn">
              Проверить первую работу<ArrowRight size={16} />
            </Link>
          </div>

          <div className="plFinalTrust">
            <span>Регистрация за 1 минуту</span>
            <span>Без привязки карты</span>
            <span>Финальную оценку утверждаете вы</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="plFooter">
      <div className="plContainer plFooterRow">
        <div>
          <div className="plBrandText">ПроверьAI</div>
          <div className="plFooterMeta">Инструмент для проверки письменных работ</div>
        </div>
        <span>© {new Date().getFullYear()} ПроверьAI</span>
      </div>
    </footer>
  );
}

function getRangeStyle(value, min, max) {
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return { '--range-percent': `${percent}%` };
}

function getRevealStyle(index = 0, step = 90) {
  return { '--reveal-delay': `${index * step}ms` };
}

export default function Landing() {
  const pageRef = useRef(null);
  const cursorAuraRef = useRef(null);
  const cursorDotRef = useRef(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousHeight = document.body.style.height;
    document.body.style.overflow = 'auto';
    document.body.style.height = 'auto';

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.height = previousHeight;
    };
  }, []);

  useEffect(() => {
    const pageNode = pageRef.current;
    if (!pageNode) return undefined;

    let frameId = null;

    const applyBackdropState = () => {
      frameId = null;
      const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const progress = Math.min(window.scrollY / maxScroll, 1);

      let phase = 0;
      if (progress > 0.75) phase = 3;
      else if (progress > 0.48) phase = 2;
      else if (progress > 0.22) phase = 1;

      pageNode.style.setProperty('--pl-scroll-progress', progress.toFixed(4));
      pageNode.setAttribute('data-phase', String(phase));
    };

    const onScroll = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(applyBackdropState);
    };

    applyBackdropState();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll('[data-reveal]'));
    if (!nodes.length) return undefined;

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.setAttribute('data-revealed', 'true');
          observer.unobserve(entry.target);
        });
      },
      {
        threshold: 0.16,
        rootMargin: '0px 0px -8% 0px',
      }
    );

    nodes.forEach(node => observer.observe(node));

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return undefined;

    const aura = cursorAuraRef.current;
    const dot = cursorDotRef.current;
    if (!aura || !dot) return undefined;

    document.body.classList.add('plHasCursor');

    let animationId = null;
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let auraX = targetX;
    let auraY = targetY;
    let dotX = targetX;
    let dotY = targetY;
    let pointerInside = false;

    const animate = () => {
      auraX += (targetX - auraX) * 0.14;
      auraY += (targetY - auraY) * 0.14;
      dotX += (targetX - dotX) * 0.26;
      dotY += (targetY - dotY) * 0.26;

      const auraHalfWidth = aura.offsetWidth / 2;
      const auraHalfHeight = aura.offsetHeight / 2;
      const dotHalfWidth = dot.offsetWidth / 2;
      const dotHalfHeight = dot.offsetHeight / 2;
      const dotScale = dot.classList.contains('is-pressed') ? 0.92 : dot.classList.contains('is-active') ? 1.04 : 1;

      aura.style.transform = `translate3d(${auraX - auraHalfWidth}px, ${auraY - auraHalfHeight}px, 0)`;
      dot.style.transform = `translate3d(${dotX - dotHalfWidth}px, ${dotY - dotHalfHeight}px, 0) scale(${dotScale})`;

      const auraDelta = Math.abs(targetX - auraX) + Math.abs(targetY - auraY);
      const dotDelta = Math.abs(targetX - dotX) + Math.abs(targetY - dotY);
      if (pointerInside || auraDelta > 0.08 || dotDelta > 0.08) {
        animationId = window.requestAnimationFrame(animate);
      } else {
        animationId = null;
      }
    };

    const ensureAnimation = () => {
      if (animationId === null) animationId = window.requestAnimationFrame(animate);
    };

    const setInteractive = (target) => {
      const interactive = target instanceof Element
        && target.closest('a, button, input, textarea, select, label, summary, [role="button"]');
      aura.classList.toggle('is-active', Boolean(interactive));
      dot.classList.toggle('is-active', Boolean(interactive));
    };

    const onMove = (event) => {
      targetX = event.clientX;
      targetY = event.clientY;
      pointerInside = true;
      aura.classList.add('is-visible');
      dot.classList.add('is-visible');
      setInteractive(event.target);
      ensureAnimation();
    };

    const onOver = (event) => {
      setInteractive(event.target);
      ensureAnimation();
    };

    const onLeave = () => {
      pointerInside = false;
      aura.classList.remove('is-visible', 'is-active', 'is-pressed');
      dot.classList.remove('is-visible', 'is-active', 'is-pressed');
    };

    const onDown = () => {
      aura.classList.add('is-pressed');
      dot.classList.add('is-pressed');
    };

    const onUp = () => {
      aura.classList.remove('is-pressed');
      dot.classList.remove('is-pressed');
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerover', onOver, { passive: true });
    window.addEventListener('pointerleave', onLeave);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);

    return () => {
      document.body.classList.remove('plHasCursor');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerover', onOver);
      window.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      if (animationId !== null) window.cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div className="plPage" ref={pageRef} data-phase="0">
      <DynamicBackdrop />
      <div className="plCursorAura" ref={cursorAuraRef} aria-hidden="true" />
      <div className="plCursorDot" ref={cursorDotRef} aria-hidden="true" />
      <LandingHeader />
      <main>
        <HeroSection />
        <ProofStripSection />
        <PainSection />
        <ExampleSection />
        <WorkflowSection />
        <OutcomeSection />
        <PricingSection />
        <FAQSection />
        <FinalCTASection />
      </main>
      <LandingFooter />
    </div>
  );
}
