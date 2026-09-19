/** @type {import('tailwindcss').Config} */

/**
 * 品牌靛紫 —— 取自 Linear 设计系统（DESIGN.md §2），是该系统里**唯一的彩色**。
 * 按规范只用于 CTA、链接与激活态，不做装饰性使用。
 */
const brandPalette = {
  50: '#f4f4ff',
  100: '#e9e9fd',
  200: '#d7d8f8',
  300: '#b8baf0',
  400: '#9598e6',
  500: '#7170ff', // Accent Violet：交互强调
  600: '#5e6ad2', // Brand Indigo：CTA 背景
  700: '#4d55b5',
  800: '#3e4591',
  900: '#31376f',
  950: '#1e2145',
};

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /**
         * 中性色阶 —— 取自 Linear 设计系统（DESIGN.md §2 的 Surface 与 Light Mode Neutrals）。
         *
         * 这里**覆盖** Tailwind 默认的 slate，而不是新增一套名字：项目里已有数百处
         * `bg-slate-*` / `border-slate-*`，覆盖取值即可让它们整体切到新色板，
         * 既不必逐处重写，也避免新旧两套中性色长期并存。
         *
         * 约定：亮色模式取低阶（50–300），暗色模式取高阶（800–950）。
         */
        slate: {
          50: '#f7f8f8', // Light Background
          100: '#f3f4f5', // Light Surface
          200: '#e6e6e6', // Light Border Alt
          300: '#d0d6e0', // Light Border（暗色模式下即 Secondary Text）
          400: '#b4b8bf', // 过渡阶
          500: '#8a8f98', // Tertiary Text
          600: '#62666d', // Quaternary Text
          700: '#3e3e44', // Border Tertiary
          800: '#28282c', // Secondary Surface
          900: '#191a1b', // Level 3 Surface
          950: '#08090a', // Marketing Black
        },
        brand: brandPalette,
        // 既有代码大量使用 indigo-*，将其指向同一套靛紫以平滑迁移。
        // 新增代码请优先用 brand-*，语义更清晰。
        indigo: brandPalette,
      },
      letterSpacing: {
        /**
         * Linear 在大字号上的负字距是恒定的 -0.022em 比例
         * （72px → -1.584px、48px → -1.056px、32px → -0.704px）。
         * 比 Tailwind 内置的 tracking-tight（-0.025em）略松一点。
         */
        display: '-0.022em',
        title: '-0.018em',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.25s ease-out',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
