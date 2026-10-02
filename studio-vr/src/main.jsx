import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { BrowserRouter } from 'react-router-dom'
import { store } from './store'
import { ThemeProvider } from './theme/ThemeContext'
import { PaletteProvider } from './theme/PaletteContext'
import './index.css'
import App from './App.jsx'

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <ThemeProvider>
        <PaletteProvider>
          <GoogleOAuthProvider clientId={googleClientId}>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </GoogleOAuthProvider>
        </PaletteProvider>
      </ThemeProvider>
    </Provider>
  </StrictMode>,
)
