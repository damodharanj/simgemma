import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Buffer } from 'buffer'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.tsx'
import './index.css'

// Polyfill Buffer for isomorphic-git and lightning-fs
if (typeof window !== 'undefined') {
  window.Buffer = Buffer
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/:appName?" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
