import {App as AntApp, ConfigProvider} from 'antd';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {Provider as ReduxProvider} from 'react-redux';

import App from './App.tsx';
import './index.css';
import {store} from './store';
import {antdTheme} from './theme/antdTheme.ts';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider theme={antdTheme}>
      <AntApp>
        <ReduxProvider store={store}>
          <App />
        </ReduxProvider>
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
);
