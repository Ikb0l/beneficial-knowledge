import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/i18n' // Initialize i18n before app renders
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initSentry } from './lib/analytics/sentry'

// Initialize Sentry error tracking before app renders
initSentry();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found. Please check your index.html.');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
