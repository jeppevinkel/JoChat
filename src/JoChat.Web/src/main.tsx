import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { AuthProvider } from 'react-oidc-context'
import App from './App.tsx'
import { loadRuntimeConfig, oidcConfig } from './auth.ts'
import './index.css'

// Follow the OS colour scheme; shadcn themes key off the `dark` class.
const scheme = window.matchMedia('(prefers-color-scheme: dark)')
const applyScheme = () => document.documentElement.classList.toggle('dark', scheme.matches)
applyScheme()
scheme.addEventListener('change', applyScheme)

const root = createRoot(document.getElementById('root')!)

loadRuntimeConfig().then(
  (cfg) =>
    root.render(
      <StrictMode>
        <AuthProvider {...oidcConfig(cfg)}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </StrictMode>,
    ),
  (err: unknown) =>
    root.render(
      <div className="text-destructive flex h-full items-center justify-center p-6 text-sm">
        {err instanceof Error ? err.message : String(err)}
      </div>,
    ),
)
