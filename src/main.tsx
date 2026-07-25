import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initLang, initTheme } from './state/prefs'
import './index.css'

initTheme()
initLang()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
