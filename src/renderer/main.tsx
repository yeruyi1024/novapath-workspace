import './index.css';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';

import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
import EngineRepairOverlay from './components/cowork/EngineRepairOverlay';
import PlatformSessionGate from './components/login/PlatformSessionGate';
import { store } from './store';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find the root element');
}

try {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <Provider store={store}>
        <AppErrorBoundary>
          <PlatformSessionGate>
            <App />
            <EngineRepairOverlay />
          </PlatformSessionGate>
        </AppErrorBoundary>
      </Provider>
    </React.StrictMode>
  );
} catch (error) {
  console.error('Failed to render the app:', error);
}
