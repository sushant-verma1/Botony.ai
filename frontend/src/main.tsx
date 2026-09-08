import './instrument'
import ReactDOM from 'react-dom/client'
import { Sentry } from './instrument'
import App from './App'
import './index.css'
import { AuthProvider } from './context/AuthContext'

ReactDOM.createRoot(document.getElementById('root')!, {
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
}).render(
    <AuthProvider>
      <App />
    </AuthProvider>
)
