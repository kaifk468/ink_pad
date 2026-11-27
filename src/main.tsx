import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './app/tokens.css'
import './app/desktopPolish.css'
import './app/desktop-topbar.css'
import './app/desktop-dock.css'
import './app/desktop-panels.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
