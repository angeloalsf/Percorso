import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initSentry } from './lib/sentry'
import { initLang, initTheme } from './state/prefs'
import './index.css'

initSentry()
initTheme()
initLang()

if (import.meta.env.DEV) {
  const [{ default: React }, { default: ReactDOM }, { default: axe }] = await Promise.all([
    import('react'),
    import('react-dom'),
    import('@axe-core/react')
  ])
  axe(React, ReactDOM, 1000)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
