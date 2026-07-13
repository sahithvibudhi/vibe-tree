import ReactDOM from 'react-dom/client';
import { AuthProvider } from '@vibetree/auth';
import App from './App';
import { getServerHttpUrl } from './services/portDiscovery';
import './styles/globals.css';

// The server port is discovered (or taken from VITE_WS_URL) before render
// so the auth layer talks to the same server as the terminal transport,
// instead of assuming the default port
async function bootstrap() {
  const serverUrl = await getServerHttpUrl();

  // StrictMode stays disabled: double-mounting duplicates terminal input
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <AuthProvider serverUrl={serverUrl}>
      <App />
    </AuthProvider>
  );
}

bootstrap();
