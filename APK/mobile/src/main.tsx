import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './lib/auth';
import { NetworkStatusProvider } from './lib/network';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <NetworkStatusProvider>
          <App />
        </NetworkStatusProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
