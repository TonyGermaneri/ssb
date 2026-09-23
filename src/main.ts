import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import './theme/console.css'
import App from './App.vue'

const vuetify = createVuetify({
  theme: {
    defaultTheme: 'console',
    themes: {
      console: {
        dark: true,
        colors: {
          background: '#151417',
          surface: '#1f1e23',
          'surface-variant': '#0a090c',
          primary: '#ffb000', // amber LED
          secondary: '#27e0ff', // cyan
          accent: '#ff3d7f', // hot pink
          success: '#33ff66', // phosphor green
          error: '#ff3b2f',
          warning: '#ffb000',
          info: '#27e0ff',
        },
      },
    },
  },
})

createApp(App).use(createPinia()).use(vuetify).mount('#app')
