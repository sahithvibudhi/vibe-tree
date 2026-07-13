// import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from '@vibetree/auth';
import App from './App';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  // Temporarily disable StrictMode to fix terminal character duplication
  // <React.StrictMode>
  <AuthProvider serverUrl="http://localhost:3002">
    <App />
  </AuthProvider>
  // </React.StrictMode>
);
