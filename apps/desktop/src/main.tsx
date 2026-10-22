import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { DiagramWindow } from './DiagramBoard'
import 'highlight.js/styles/github-dark.css'
import './styles.css'

const diagramId = new URLSearchParams(location.search).get('diagram')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {diagramId ? <DiagramWindow id={diagramId} /> : <App />}
  </StrictMode>,
)
