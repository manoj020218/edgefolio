import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './lib/auth';
import { NetworkStatusProvider } from './lib/network';
import { AuthedNotificationsProvider } from './lib/notifications';
import '@fontsource-variable/plus-jakarta-sans';
import './index.css';
import { installRipples } from './lib/ripple';

installRipples();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <NetworkStatusProvider>
          <AuthedNotificationsProvider>
            <App />
          </AuthedNotificationsProvider>
        </NetworkStatusProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
