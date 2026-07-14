import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../store';
import {
  connectGlobalAdapter,
  disconnectGlobalAdapter,
  getGlobalAdapter,
  isConnected,
  onGlobalAdapterConnected,
  onGlobalAdapterDisconnected
} from '../adapters/globalWebSocketAdapter';
import { getServerWebSocketUrl } from '../services/portDiscovery';
import { getAuthenticatedWebSocketUrl } from '../services/authService';

export function useWebSocket() {
  const { setConnected, setConnecting, setError } = useAppStore();

  // Local state to force re-renders when adapter changes
  const [adapterVersion, setAdapterVersion] = useState(0);

  const connect = useCallback(async () => {
    if (isConnected()) {
      console.log('Already connected to global adapter');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      // Get WebSocket URL using dynamic port discovery
      const baseWsUrl = await getServerWebSocketUrl();

      // Add authentication if available
      const wsUrl = getAuthenticatedWebSocketUrl(baseWsUrl);

      console.log('Attempting WebSocket connection to:', wsUrl);

      await connectGlobalAdapter(wsUrl);

      setConnected(true);
      setConnecting(false);
      setAdapterVersion((prev) => prev + 1); // Force re-render
    } catch (error) {
      setConnecting(false);
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect';
      setError(errorMessage);
      console.error('WebSocket connection failed with error:', error);
      console.error('Error details:', {
        message: errorMessage,
        type: typeof error,
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }, [setConnected, setConnecting, setError]);

  const disconnect = useCallback(() => {
    console.log('Disconnecting global WebSocket adapter');
    disconnectGlobalAdapter();
    setConnected(false);
    setAdapterVersion((prev) => prev + 1); // Force re-render
  }, [setConnected]);

  const getAdapter = useCallback(() => {
    const adapter = getGlobalAdapter();
    console.log('getAdapter called, globalAdapter:', adapter);
    return adapter;
  }, [adapterVersion]); // Re-run when adapter changes

  // Subscribe to global adapter state changes
  useEffect(() => {
    const unsubscribeConnected = onGlobalAdapterConnected(() => {
      console.log('Global adapter connected callback');
      setConnected(true);
      setAdapterVersion((prev) => prev + 1);
    });

    const unsubscribeDisconnected = onGlobalAdapterDisconnected(() => {
      console.log('Global adapter disconnected callback');
      setConnected(false);
      setAdapterVersion((prev) => prev + 1);
    });

    return () => {
      unsubscribeConnected();
      unsubscribeDisconnected();
    };
  }, [setConnected]);

  return {
    connect,
    disconnect,
    getAdapter
  };
}
