import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { isLocalHostname } from './browser';
import { AIAssistantProvider } from './components/AIAssistant/AIAssistantContext';
import './index.css';

if ('serviceWorker' in navigator) {
  const shouldDisableServiceWorker =
    import.meta.env.DEV || isLocalHostname(window.location.hostname);

  if (shouldDisableServiceWorker) {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        void registration.unregister();
      });
    });
  } else {
    registerSW({
      immediate: true,
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <AIAssistantProvider>
    <App />
  </AIAssistantProvider>,
);
