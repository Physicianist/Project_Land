/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      boxShadow: {
        'pricing-card': '0 18px 45px -28px rgba(15, 23, 42, 0.28)',
        'pricing-card-hover': '0 24px 64px -30px rgba(15, 23, 42, 0.38)',
        'pricing-glow': '0 0 0 1px rgba(139, 92, 246, 0.55), 0 28px 70px -34px rgba(124, 58, 237, 0.42)',
      },
    },
  },
};
