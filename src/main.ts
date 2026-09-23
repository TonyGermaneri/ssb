import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import './theme/console.css'
import { THEMES } from './theme/themes'
import App from './App.vue'

const vuetify = createVuetify({
  theme: {
    defaultTheme: 'console85',
    themes: Object.fromEntries(
      THEMES.map((t) => [
        t.id,
        {
          dark: true,
          colors: {
            background: t.bg[2],
            surface: t.panel[2],
            'surface-variant': '#0a090c',
            primary: t.primary,
            secondary: t.secondary,
            accent: t.accent,
            success: t.success,
            error: t.danger,
            warning: t.primary,
            info: t.secondary,
          },
        },
      ]),
    ),
  },
})

createApp(App).use(createPinia()).use(vuetify).mount('#app')
