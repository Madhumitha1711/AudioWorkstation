import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { BrowserRouter } from 'react-router-dom'
import { store } from './store'
import { ThemeProvider } from './theme/ThemeContext'
import './index.css'
import App from './App.jsx'

// See GoogleAuthButton.jsx: this stays empty (rather than crashing) until
// VITE_GOOGLE_CLIENT_ID is set in .env, at which point Google Sign-In lights
// up on the login/signup pages without any other code changes.
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <ThemeProvider>
        <GoogleOAuthProvider clientId={googleClientId}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </GoogleOAuthProvider>
      </ThemeProvider>
    </Provider>
  </StrictMode>,
)
