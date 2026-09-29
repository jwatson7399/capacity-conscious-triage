// © 2026 New York University. All rights reserved.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted fonts (no Google Fonts request): Inter for text (variable, so in-between weights such
// as the home title's 550 render true), IBM Plex Sans for numbers.
import '@fontsource-variable/inter/wght.css'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
