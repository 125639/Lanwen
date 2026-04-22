import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { AIAssistantProvider } from './components/AIAssistant/AIAssistantContext';
import './index.css';

if ('serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
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
