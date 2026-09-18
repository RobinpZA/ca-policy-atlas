import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// base.css only - @xyflow/react's style.css ships theme colours, which would put
// literal colour values outside tokens.css and break the token contract.
import '@xyflow/react/dist/base.css';
import './styles/global.css';
import './styles/flow.css';

import { App } from './App.tsx';
import { AppProvider } from './state/appState.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
