import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import '@fontsource-variable/figtree'
import './styles.css'
import { trackVisit } from './lib/visit'

// Antes de que la app limpie la dirección (quita ?utm_… y otros parámetros).
trackVisit()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
