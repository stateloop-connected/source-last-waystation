import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { GameProvider } from './app/GameProvider'
import './index.css'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('缺少应用根节点。')
}

createRoot(root).render(
  <StrictMode>
    <GameProvider>
      <App />
    </GameProvider>
  </StrictMode>,
)
