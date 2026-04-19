import { ArrowRight, BookOpen, Check, Crown, Sparkles, Star, X } from 'lucide-react';
import { Link } from 'react-router-dom';

const plans = [
  {
    title: 'Free',
    subtitle: 'Попробовать бесплатно',
    price: '0 ₽',
    buttonLabel: 'Начать бесплатно',
    icon: Sparkles,
    featured: false,
    features: [
      'Решение задач по фото',
      'Короткий ответ',
      'Проверка решения',
      '5 задач в день',
    ],
    disabled: [
      'Подробные объяснения',
      'Разбор ошибок',
      'История задач',
    ],
  },
  {
    title: 'Basic',
    subtitle: 'Для домашних заданий',
    price: '690 ₽',
    buttonLabel: 'Оформить Basic',
    icon: BookOpen,
    featured: false,
    features: [
      'Решение задач по фото и тексту',
      'Краткие объяснения',
      'Подходит для повседневных задач',
      'Работа с PDF и скриншотами',
      'До 100 задач',
    ],
    disabled: [
      'Глубокий разбор',
      'Объяснение как преподаватель',
    ],
  },
  {
    title: 'Standard',
    subtitle: 'Лучший выбор',
    price: '1190 ₽',
    buttonLabel: 'Оформить Standard',
    icon: Star,
    featured: true,
    features: [
      'Пошаговые решения',
      'Объяснение как учитель',
      'Разбор ошибок',
      'Подготовка к контрольным',
      'История задач',
      'До 250 задач',
    ],
    disabled: [
      'Нет приоритета в очереди',
    ],
  },
  {
    title: 'Premium',
    subtitle: 'Максимум возможностей',
    price: '1990 ₽',
    buttonLabel: 'Оформить Premium',
    icon: Crown,
    featured: false,
    features: [
      'Полные разборы задач',
      'Объяснение с нуля',
      'Подготовка к экзаменам',
      'Быстрые ответы',
      'История и повтор решений',
      'До 500 задач',
    ],
    disabled: [],
  },
];

function PricingCard({ plan }) {
  const Icon = plan.icon;

  return (
    <article
      className={[
        'group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white p-6 text-slate-900',
        'transition-all duration-300 hover:-translate-y-1.5 hover:shadow-pricing-card-hover',
        'border-slate-200 shadow-pricing-card',
        plan.featured ? 'border-violet-400 shadow-pricing-glow' : '',
      ].join(' ')}
    >
      {plan.featured && (
        <div className="absolute right-4 top-4">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300 bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
            <Sparkles className="h-3.5 w-3.5" />
            Рекомендуем
          </span>
        </div>
      )}

      <div
        className={[
          'absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent transition-all duration-300',
          plan.featured ? 'via-violet-300' : 'group-hover:via-violet-200',
        ].join(' ')}
        aria-hidden="true"
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div
              className={[
                'inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition-all duration-300',
                plan.featured
                  ? 'border-violet-300 bg-violet-100 text-violet-700'
                  : 'border-slate-200 bg-slate-50 text-slate-700 group-hover:border-violet-200 group-hover:text-violet-700',
              ].join(' ')}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-2xl font-semibold tracking-tight text-slate-950">{plan.title}</h3>
              <p className="mt-1 text-sm text-slate-500">{plan.subtitle}</p>
            </div>
          </div>

          <div className="mt-6 flex items-end gap-2">
            <span className="text-4xl font-semibold tracking-tight text-slate-950">{plan.price}</span>
            <span className="pb-1 text-sm text-slate-400">/ мес</span>
          </div>
        </div>
      </div>

      <div className="mt-6 h-px w-full bg-slate-100" />

      <div className="mt-6 flex flex-1 flex-col">
        <ul className="space-y-3">
          {plan.features.map(feature => (
            <li key={feature} className="flex items-start gap-3 text-sm leading-6 text-slate-700">
              <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <Check className="h-3.5 w-3.5" />
              </span>
              <span>{feature}</span>
            </li>
          ))}
          {plan.disabled.map(feature => (
            <li key={feature} className="flex items-start gap-3 text-sm leading-6 text-slate-400">
              <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <X className="h-3.5 w-3.5" />
              </span>
              <span className="line-through decoration-slate-300">{feature}</span>
            </li>
          ))}
        </ul>

        <Link
          to="/login?mode=register"
          className={[
            'mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold',
            'transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2',
            plan.featured
              ? 'bg-violet-600 text-white hover:bg-violet-700'
              : 'border border-slate-200 bg-slate-50 text-slate-900 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700',
          ].join(' ')}
        >
          {plan.buttonLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

export default function TailwindPricingSection() {
  return (
    <section id="pricing" className="px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white/90 px-6 py-8 shadow-[0_20px_70px_-40px_rgba(15,23,42,0.3)] backdrop-blur sm:px-8 lg:px-10 lg:py-10">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(139,92,246,0.14),transparent_58%)]"
            aria-hidden="true"
          />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
                Тарифы
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Выберите план под свой формат учебы
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">
                От быстрого старта до полного разбора задач с объяснениями как у преподавателя.
                Карточки адаптивны, а основной акцент сразу падает на рекомендуемый план.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 self-start rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Доступ открывается сразу после регистрации
            </div>
          </div>

          <div className="relative mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            {plans.map(plan => (
              <PricingCard key={plan.title} plan={plan} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
