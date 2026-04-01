import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BadgeCheck, BookOpen, Brain, CheckCircle2, ChevronDown,
  Clock3, FileText, GraduationCap, Layers, Menu, Shield, Sparkles,
  Upload, Users, X
} from 'lucide-react';

const faqs = [
  {
    q: 'AI сам ставит итоговую оценку?',
    a: 'Нет. Сервис делает первичный разбор, находит ошибки и предлагает баллы. Финальное решение и отправка результата всегда остаются за преподавателем.',
  },
  {
    q: 'Подходит ли сервис для частного репетитора, а не только для школы?',
    a: 'Да. ПроверьAI в первую очередь полезен частным репетиторам и преподавателям с мини-группами. Школьные учителя тоже могут использовать его для пакетной проверки работ класса.',
  },
  {
    q: 'Можно ли проверять много работ сразу?',
    a: 'Да. В сервисе есть пакетная проверка: можно загрузить пачку фото или файлов, получить первичный разбор и быстро пройтись по очереди подтверждения.',
  },
  {
    q: 'Какие форматы файлов поддерживаются?',
    a: 'Фотографии, сканы и PDF. Ученик может загрузить несколько страниц одной работы.',
  },
  {
    q: 'Что будет после бесплатного периода?',
    a: 'После 30 дней полного доступа можно остаться на Free-тарифе с ограничениями или перейти на Pro без лимитов по количеству учеников и проверок.',
  },
];

function LandingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (!el) {
      setMobileOpen(false);
      return;
    }
    // Determine the offset height of the sticky header so that the scrolled
    // section isn't hidden behind it. Query the element rather than
    // hard‑coding pixels to account for responsive layouts.
    const header = document.querySelector('.landingHeader');
    const offset = header ? (/** @type {HTMLElement} */(header)).offsetHeight : 0;
    const top = el.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top, behavior: 'smooth' });
    setMobileOpen(false);
  };

  return (
    <header className="landingHeader">
      <div className="landingContainer landingHeaderRow">
        <Link to="/" className="landingBrand">
          <span className="landingBrandMark"><Sparkles size={16} /></span>
          <span className="landingBrandText">ПроверьAI</span>
        </Link>

        <nav className="landingDesktopNav">
          <button onClick={() => scrollTo('for-whom')}>Для кого</button>
          <button onClick={() => scrollTo('pain')}>Проблемы</button>
          <button onClick={() => scrollTo('how')}>Как работает</button>
          <button onClick={() => scrollTo('benefits')}>Преимущества</button>
          <button onClick={() => scrollTo('pricing')}>Тарифы</button>
          <button onClick={() => scrollTo('faq')}>FAQ</button>
        </nav>

        <div className="landingHeaderActions">
          {/* Keep the "Войти" button pointing to the standard login page. */}
          <Link to="/login" className="landingGhostBtn">Войти</Link>
          {/* The primary call to action should lead to the registration mode of the login page. */}
          <Link to="/login?mode=register" className="landingPrimaryBtn">Попробовать бесплатно</Link>
        </div>

        <button className="landingBurger" onClick={() => setMobileOpen(v => !v)}>
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="landingMobileNavWrap">
          <div className="landingContainer landingMobileNav">
            <button onClick={() => scrollTo('for-whom')}>Для кого</button>
            <button onClick={() => scrollTo('pain')}>Проблемы</button>
            <button onClick={() => scrollTo('how')}>Как работает</button>
            <button onClick={() => scrollTo('benefits')}>Преимущества</button>
            <button onClick={() => scrollTo('pricing')}>Тарифы</button>
            <button onClick={() => scrollTo('faq')}>FAQ</button>
            {/* In mobile navigation the CTA also opens the registration mode on the login page */}
            <Link to="/login?mode=register" className="landingPrimaryBtn wide">Начать бесплатный период</Link>
          </div>
        </div>
      )}
    </header>
  );
}

function HeroSection() {
  return (
    <section className="landingHero">
      <div className="landingContainer landingHeroGrid">
        <div>
          <div className="landingPill fit"><Sparkles size={14} /> 1 месяц полного доступа бесплатно</div>
          <h1 className="landingHeroTitle">
            Проверяйте работы <span>в 2–4 раза быстрее</span> — без потери контроля
          </h1>
          <p className="landingHeroText">
            Платформа оформляет работу в читабельный формат, распознаёт ход решения и делает первичную проверку. Преподаватель подтверждает результат. Работает и
            для индивидуальных учеников, и для потока работ.
          </p>
          <div className="landingCTAGroup">
            {/* This CTA should open registration mode on the login page */}
            <Link to="/login?mode=register" className="landingPrimaryBtn">Начать бесплатный пробный период <ArrowRight size={16} /></Link>
            <a href="#how" className="landingSecondaryBtn">Посмотреть, как это работает</a>
          </div>
          <div className="landingMetaRow">
            <span><CheckCircle2 size={16} /> 30 дней без ограничений</span>
            <span><Shield size={16} /> Без привязки карты</span>
          </div>
        </div>

        <div className="landingMockCard">
          <div className="landingMockTopbar">
            <div className="landingDot danger" />
            <div className="landingDot warn" />
            <div className="landingDot success" />
            <span>ПроверьAI — Проверка работ</span>
          </div>
          <div className="landingMockBody">
            <div className="landingMiniStats">
              <div className="landingMiniStat"><FileText size={16} /><strong>12</strong><span>Ждут проверки</span></div>
              <div className="landingMiniStat"><BadgeCheck size={16} /><strong>8</strong><span>Проверено сегодня</span></div>
              <div className="landingMiniStat"><Clock3 size={16} /><strong>7.4</strong><span>Средний балл</span></div>
            </div>
            <div className="landingMockReview">
              <div className="landingMockRow between">
                <div>
                  <div className="landingMockTitle">Алгебра — Квадратные уравнения</div>
                  <div className="landingMockSub">Иванов Артём · загружено 14:32</div>
                </div>
                <span className="landingTag"><Sparkles size={12} /> AI-проверено</span>
              </div>
              <div className="landingMockPanels">
                <div className="landingMockPanel">
                  <div className="landingMockPanelTitle">Ошибка в шаге 3</div>
                  Неверно раскрыты скобки: (x+2)² ≠ x²+4
                </div>
                <div className="landingMockPanel accent">
                  <div className="landingMockPanelTitle">Предложенный балл</div>
                  <strong>7</strong> / 10
                </div>
              </div>
              <div className="landingMockActions">
                <button className="landingPrimaryBtn small">Подтвердить</button>
                <button className="landingSecondaryBtn small">Исправить</button>
              </div>
            </div>
            <div className="teacher-confirmed-badge justify-center text-sm py-3 px-6 w-full rounded-xl">
              <Shield size={16} /> Финальный результат подтверждает преподаватель
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ForWhomSection() {
  const segments = [
    {
      icon: GraduationCap,
      title: 'Частным репетиторам',
      desc: 'Прекратите тратить вечера на разбор домашних. Ученик загружает фото или PDF, система находит ошибки за секунды, а вы быстро подтверждаете итог.',
      points: ['Экономия 1–2 часов в день', 'Формат 1:1 с быстрой обратной связью', 'Фото из тетради — не проблема'],
    },
    {
      icon: Users,
      title: 'Репетиторам с мини-группами',
      desc: 'Управляйте группами до 10–15 учеников без хаоса. Видите общую картину по группе: кто сдал, кто нет, какие ошибки повторяются.',
      points: ['Пакетная проверка работ группы', 'Аналитика типовых ошибок и тем', 'Удобное назначение и контроль сдачи'],
    },
    {
      icon: BookOpen,
      title: 'Школьным учителям',
      desc: 'Загрузите контрольную или пачку тетрадей класса — получите очередь из 25–30 работ, первичный разбор и понятную аналитику по классу.',
      points: ['Массовая загрузка и пакетная проверка', 'Аналитика по классу', 'Экономия часов без потери качества'],
    },
  ];

  return (
    <section id="for-whom" className="landingSection landingSectionAlt">
      <div className="landingContainer">
        <div className="landingSectionHead center">
          <div className="landingEyebrow">Для кого</div>
          <h2>Один инструмент — для разных форматов преподавания</h2>
        </div>
        <div className="landingCardGrid three">
          {segments.map(({ icon: Icon, title, desc, points }) => (
            <article key={title} className="landingInfoCard interactive">
              <div className="landingIconWrap"><Icon size={20} /></div>
              <h3>{title}</h3>
              <p>{desc}</p>
              <ul className="landingBulletList">
                {points.map(point => (
                  <li key={point}><CheckCircle2 size={15} /> {point}</li>
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
  const pains = [
    { icon: Clock3, title: 'Работы копятся', text: 'Домашние и контрольные быстро накапливаются и съедают вечера и выходные.' },
    { icon: Layers, title: 'Нет общей картины', text: 'Сложно понять, кто сдал, а кто нет, и какие ошибки повторяются у группы или класса.' },
    { icon: Brain, title: 'Комментарии повторяются', text: 'Одни и те же замечания приходится писать вручную снова и снова.' },
    { icon: Upload, title: 'Фото неудобно разбирать', text: 'Рукописные решения, сканы и PDF в разном качестве превращают проверку в рутину.' },
  ];

  return (
    <section id="pain" className="landingSection">
      <div className="landingContainer">
        <div className="landingProblemBlock">
          <div className="landingProblemVisual">
            <div className="landingVisualBubble big" />
            <div className="landingVisualBubble small" />
            <div className="landingVisualPanel">
              <div className="landingVisualCard red">Работы ждут проверки</div>
              <div className="landingVisualCard violet">Комментарий генерируется автоматически</div>
              <div className="landingVisualCard dark">Аналитика по ошибкам за 1 клик</div>
            </div>
          </div>
          <div>
            <div className="landingEyebrow">Проблема</div>
            <h2>Почему обычная проверка начинает тормозить преподавателя</h2>
            <p className="landingSectionLead">Проверка письменных работ важна, но именно рутинная часть процесса отнимает непропорционально много времени. ПроверьAI снимает эту нагрузку и делает workflow управляемым.</p>
            <div className="landingCardGrid two compact">
              {pains.map(({ icon: Icon, title, text }) => (
                <article key={title} className="landingInfoCard interactive compactCard">
                  <div className="landingIconWrap soft"><Icon size={18} /></div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    { num: '01', icon: FileText, title: 'Создайте задание', desc: 'Укажите предмет, тему, дедлайн и прикрепите файл задания' },
    { num: '02', icon: Upload, title: 'Ученик загружает работу', desc: 'Фото, скан или PDF — несколько страниц, рукопись или печатный текст' },
    { num: '03', icon: Brain, title: 'Система делает первичный разбор', desc: 'OCR распознаёт решение, AI находит ошибки и предлагает баллы' },
    { num: '04', icon: Shield, title: 'Вы подтверждаете результат', desc: 'Видите исходник, распознанный текст и AI-анализ' },
  ];
  return (
    <section id="how" className="landingSection landingSectionAlt">
      <div className="landingContainer">
        <div className="landingSectionHead center">
          <div className="landingEyebrow">Как это работает</div>
          <h2>Понятный workflow — от задания до результата</h2>
          <p>ПроверьAI не пытается заменить преподавателя, он убирает рутину</p>
        </div>
        <div className="landingStepsGrid">
          {steps.map(({ num, icon: Icon, title, desc }) => (
            <article key={num} className="landingStepCard interactive">
              <div className="landingStepTop">
                <span className="landingStepNum">{num}</span>
                <div className="landingIconWrap soft"><Icon size={18} /></div>
              </div>
              <h3>{title}</h3>
              <p>{desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function BenefitsSection() {
  const items = [
    { icon: Layers, title: 'По одному и пакетно', desc: 'Индивидуальная проверка и пакетная обработка нескольких работ в одном сервисе.' },
    { icon: Upload, title: 'Рукопись и печатный текст', desc: 'Фото, сканы и PDF — без сложной подготовки со стороны ученика.' },
    { icon: Brain, title: 'AI-первичный разбор', desc: 'Ошибки, комментарии и предложенные баллы появляются до ручной проверки преподавателя.' },
    { icon: Shield, title: 'Финальный контроль у вас', desc: 'Ни одна оценка не уходит ученику без вашего подтверждения.' },
    { icon: BookOpen, title: 'Интерактивная аналитика по темам', desc: 'Видно, где группа или ученик проваливается чаще всего.' },
    { icon: Users, title: 'Подходит для групп и классов', desc: 'Сервис помогает масштабировать преподавание без хаоса и потери качества.' },
  ];
  return (
    <section id="benefits" className="landingSection">
      <div className="landingContainer">
        <div className="landingSectionHead center">
          <div className="landingEyebrow">Преимущества</div>
          <h2>Не просто AI-проверка, а рабочая система для ежедневного использования</h2>
          <p>Сервис помогает преподавателю работать быстрее, системнее и увереннее</p>
        </div>
        <div className="landingCardGrid three">
          {items.map(({ icon: Icon, title, desc }) => (
            <article key={title} className="landingInfoCard interactive">
              <div className="landingIconWrap"><Icon size={20} /></div>
              <h3>{title}</h3>
              <p>{desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustSection() {
  const items = [
    { icon: Shield, title: 'AI не заменяет преподавателя', desc: 'Система распознаёт, анализирует и предлагает. Финальное решение — всегда за человеком.' },
    { icon: BookOpen, title: 'Полная прозрачность', desc: 'Вы видите исходную работу, распознанный текст, ошибки и предложенные баллы.' },
    { icon: BadgeCheck, title: 'Подтверждение каждого результата', desc: 'Ни одна оценка не отправляется без вашего участия.' },
    { icon: Brain, title: 'Меньше рутины — не меньше экспертизы', desc: 'Сервис снимает механическую нагрузку, а не забирает преподавательскую экспертизу.' },
  ];
  return (
    <section className="landingSection landingSectionAlt">
      <div className="landingContainer">
        <div className="landingSectionHead center">
          <div className="landingEyebrow">Доверие</div>
          <h2>Почему преподаватели доверяют сервису</h2>
          <p>Мы строим инструмент для профессионалов, а не замену профессионалам.</p>
        </div>
        <div className="landingCardGrid two">
          {items.map(({ icon: Icon, title, desc }) => (
            <article key={title} className="landingInfoCard interactive horizontal">
              <div className="landingIconWrap"><Icon size={20} /></div>
              <div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="landingTrustStrip">
          <Shield size={16} /> Финальный результат подтверждает преподаватель. Всегда.
        </div>
      </div>
    </section>
  );
}

function ImpactSection() {
  const claims = [
    { value: '2–4×', label: 'быстрее первичная проверка', sub: 'по типовым сценариям' },
    { value: '6–10 ч', label: 'экономии в неделю', sub: 'у преподавателей с потоком учеников' },
    { value: '~80%', label: 'рутинных шагов берёт система', sub: 'распознавание почерка, выявление ошибок, анлиз результатов, отчеты родителям' },
    { value: '+20%', label: ' к доходам', sub: 'открывает возможность найти 1-3 новых учеников' },
  ];
  return (
    <section className="landingSection">
      <div className="landingContainer">
        <div className="landingSectionHead center">
          <div className="landingEyebrow">Эффект</div>
          <h2>Преимущество в цифрах</h2>
          <p>Цифры для типовых сценариев преподавателей, у которых есть поток учеников и регулярная проверка письменных работ.</p>
        </div>
        <div className="landingImpactGrid">
          {claims.map(c => (
            <article key={c.label} className="landingImpactCard">
              <strong>{c.value}</strong>
              <h3>{c.label}</h3>
              <p>{c.sub}</p>
            </article>
          ))}
        </div>
        <p className="landingDisclaimer">* Фактический эффект зависит от предмета, числа учеников и формата работ.</p>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section id="pricing" className="landingSection landingSectionAlt">
      <div className="landingContainer">
        <div className="landingSectionHead center">
          <div className="landingEyebrow">Тариф</div>
          <h2>Попробуйте бесплатно — решите потом</h2>
          <p>1 месяц полного доступа без ограничений. Без привязки карты. Поймите, сколько времени сервис экономит именно вам.</p>
        </div>
        <div className="landingPricingWrap">
          <article className="landingPriceCard">
            <div className="landingPriceLabel">Free</div>
            <div className="landingPriceSub">После пробного периода</div>
            <div className="landingPriceValue">0 ₽ <span>/ мес</span></div>
            <ul className="landingBulletList compact">
              <li><CheckCircle2 size={15} /> До 3 учеников</li>
              <li><CheckCircle2 size={15} /> До 5 проверок в месяц</li>
              <li><CheckCircle2 size={15} /> Базовая аналитика</li>
            </ul>
            {/* Redirect to registration mode for free plan start */}
            <Link to="/login?mode=register" className="landingSecondaryBtn wide">Начать бесплатно</Link>
          </article>
          <article className="landingPriceCard featured">
            <div className="landingRecommend">Рекомендуем</div>
            <div className="landingPriceLabel">Pro</div>
            <div className="landingPriceSub">Для активных преподавателей</div>
            <div className="landingPriceValue">990 ₽ <span>/ мес</span></div>
            <ul className="landingBulletList compact">
              <li><CheckCircle2 size={15} /> Без ограничений по ученикам</li>
              <li><CheckCircle2 size={15} /> Без ограничений по проверкам</li>
              <li><CheckCircle2 size={15} /> Продвинутая аналитика</li>
              <li><CheckCircle2 size={15} /> Работа с группами</li>
            </ul>
            {/* Redirect to registration mode when starting the Pro trial */}
            <Link to="/login?mode=register" className="landingPrimaryBtn wide">Попробовать 30 дней бесплатно <ArrowRight size={16} /></Link>
          </article>
        </div>
      </div>
    </section>
  );
}

function FAQSection() {
  const [open, setOpen] = useState(null);
  return (
    <section id="faq" className="landingSection">
      <div className="landingContainer landingFaqContainer">
        <div className="landingSectionHead center">
          <div className="landingEyebrow">FAQ</div>
          <h2>Частые вопросы</h2>
        </div>
        <div className="landingFaqList">
          {faqs.map((item, index) => {
            const active = open === index;
            return (
              <article key={item.q} className={active ? 'landingFaqItem active' : 'landingFaqItem'}>
                <button className="landingFaqTrigger" onClick={() => setOpen(active ? null : index)}>
                  <span>{item.q}</span>
                  <ChevronDown size={18} />
                </button>
                {active && <div className="landingFaqContent">{item.a}</div>}
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
    <section className="landingFinalCta">
      <div className="landingContainer landingFinalCtaInner">
        <div className="landingEyebrow">Старт</div>
        <h2>Начните экономить время на проверке — уже сегодня</h2>
        <p>30 дней полного доступа бесплатно. Без привязки карты. Убедитесь, что сервис подходит именно вам.</p>
        {/* Final CTA should lead to registration mode */}
        <Link to="/login?mode=register" className="landingPrimaryBtn large">Начать бесплатный пробный период <ArrowRight size={18} /></Link>
        <span className="landingMutedLine">Регистрация занимает 1 минуту</span>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="landingFooter">
      <div className="landingContainer landingFooterInner">
        <span className="landingBrandText">ПроверьAI</span>
        <span>© {new Date().getFullYear()} ПроверьAI. Все права защищены.</span>
      </div>
    </footer>
  );
}

export default function Landing() {
  // Enable page scrolling on the landing page. The main application sets
  // `overflow: hidden` on the body to control scrolling within dashboard
  // layouts. On the landing we want the body itself to be scrollable, so
  // temporarily override the overflow property and restore it on unmount.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevHeight = document.body.style.height;
    document.body.style.overflow = 'auto';
    document.body.style.height = 'auto';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.height = prevHeight;
    };
  }, []);
  return (
    <div className="landingPage">
      <LandingHeader />
      <HeroSection />
      <ForWhomSection />
      <PainSection />
      <HowItWorksSection />
      <BenefitsSection />
      <TrustSection />
      <ImpactSection />
      <PricingSection />
      <FAQSection />
      <FinalCTASection />
      <LandingFooter />
    </div>
  );
}
