import './assets/base.css'

import { createApp } from 'vue'
import store from './store'
import {
  Button,
  Card,
  ConfigProvider,
  Dropdown,
  Layout,
  Menu,
  Modal,
  Select,
  Spin,
  Tabs,
  Tooltip
} from 'ant-design-vue'
import App from './App.vue'
import axios from 'axios'

const app = createApp(App);

axios.defaults.baseURL = (import.meta as any).env?.VITE_API_URL || ''

function cleanupSchedulerStorage() {
  const keys = ['majorSelected', 'stagedCourses', 'selectedCourses', 'occupied', 'timeTableData']
  let touched = false

  for (const key of keys) {
    const raw = window.localStorage.getItem(key)
    if (!raw) continue

    try {
      JSON.parse(raw)
    } catch {
      window.localStorage.removeItem(key)
      touched = true
    }
  }

  return touched
}

if (typeof window !== 'undefined') {
  cleanupSchedulerStorage()
  window.addEventListener('error', (event) => {
    console.error('[scheduler] runtime error', event.error || event.message)
  })
}

app
  .use(Button)
  .use(Card)
  .use(ConfigProvider)
  .use(Dropdown)
  .use(Layout)
  .use(Menu)
  .use(Modal)
  .use(Select)
  .use(Spin)
  .use(Tabs)
  .use(Tooltip)
  .use(store)
  .mount('#app')

function finishLoadingOverlay() {
  const loader = document.getElementById('yourtj-sim-loader')
  if (loader) {
    loader.classList.add('yourtj-sim-loader-hide')
    window.setTimeout(() => loader.remove(), 260)
  }
  document.documentElement.classList.remove('yourtj-sim-loading')
}

// Keep the app hidden briefly so async-loaded panes/data settle, reducing CLS in Lighthouse/PageSpeed.
window.setTimeout(() => requestAnimationFrame(finishLoadingOverlay), 1500)
