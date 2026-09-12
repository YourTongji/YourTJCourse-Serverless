/** @type {import('tailwindcss').Config} */
module.exports = {
  // Theme is driven by CSS tokens + prefers-color-scheme, never by `dark:` variants.
  // Scanned on purpose: only the modules this branch still renders, so the bundle
  // does not ship utility classes for the retired course community UI. Re-widen to
  // './src/**/*.{ts,tsx}' if the app shell is ever mounted here again.
  content: [
    './index.html',
    './src/main.tsx',
    './src/pages/ForumRedirectPage.tsx',
    './src/components/ui/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        page: 'rgb(var(--background-page-rgb) / <alpha-value>)',
        surface: 'rgb(var(--background-surface-rgb) / <alpha-value>)',
        'surface-raised': 'rgb(var(--background-surface-raised-rgb) / <alpha-value>)',
        'surface-selected': 'rgb(var(--background-surface-selected-rgb) / <alpha-value>)',
        brand: 'rgb(var(--background-brand-rgb) / <alpha-value>)',
        action: 'rgb(var(--action-primary-rgb) / <alpha-value>)',
        'action-hover': 'rgb(var(--action-primary-hover-rgb) / <alpha-value>)',
        'action-pressed': 'rgb(var(--action-primary-pressed-rgb) / <alpha-value>)',
        'on-action': 'rgb(var(--text-on-action-rgb) / <alpha-value>)',
        primary: 'rgb(var(--text-primary-rgb) / <alpha-value>)',
        secondary: 'rgb(var(--text-secondary-rgb) / <alpha-value>)',
        tertiary: 'rgb(var(--text-tertiary-rgb) / <alpha-value>)',
        edge: 'rgb(var(--border-default-rgb) / <alpha-value>)',
        'edge-strong': 'rgb(var(--border-hover-rgb) / <alpha-value>)',
        link: 'rgb(var(--text-link-default-rgb) / <alpha-value>)',
        accent: 'rgb(var(--icon-accent-rgb) / <alpha-value>)',
      },
      fontFamily: {
        sans: [
          'Inter',
          '"Noto Sans SC"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'system-ui',
          'sans-serif',
        ],
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
      },
    },
  },
  plugins: [],
}
