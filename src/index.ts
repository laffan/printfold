/**
 * PrintFold - Booklet Creator
 * Main entry point
 */

import './styles/main.css';
import { App } from './components/App';
import { env } from './services/environment';

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Add environment class to body for conditional styling
  if (env.isElectron) {
    document.body.classList.add('is-electron');
  }

  const app = new App();
  app.init();

  // Expose app for debugging in development
  if (process.env.NODE_ENV === 'development') {
    (window as unknown as { printfoldApp: App }).printfoldApp = app;
  }
});
