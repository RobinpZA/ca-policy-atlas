import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// base.css only - @xyflow/react's style.css ships theme colours, which would put
// literal colour values outside tokens.css and break the token contract.
import '@xyflow/react/dist/base.css';

// Fonts are bundled, never fetched: no runtime network call, and the layout's measured
// glyph widths (NEWSREADER_EM, CHAR_W_*) cannot be undone by a blocked font CDN.
// Newsreader needs the opsz build - its optical-size axis is part of those measurements.
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/geist';
import '@fontsource-variable/jetbrains-mono';
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
