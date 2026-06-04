import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { resolveApiBase } from './services/api'
import './styles/index.css'

try {
  const api = resolveApiBase()
  ;(window as any).__SIM_API_URL__ = api
  localStorage.setItem('SIM_API_URL', api)
} catch {
  // ignore
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
