import { WebSocketAdapter } from '@vibetree/core';

// Global singleton WebSocket adapter
let globalAdapter: WebSocketAdapter | null = null;
let connectionPromise: Promise<void> | null = null;

// Connection state callbacks
const onConnectedCallbacks: (() => void)[] = [];
const onDisconnectedCallbacks: (() => void)[] = [];

export function getGlobalAdapter(): WebSocketAdapter | null {
  console.log('getGlobalAdapter called, globalAdapter:', globalAdapter);
  return globalAdapter;
}

export function isConnected(): boolean {
  return globalAdapter !== null;
}

export function connectGlobalAdapter(wsUrl: string): Promise<void> {
  console.log('connectGlobalAdapter called with:', wsUrl);

  // Return existing connection if already connecting/connected
  if (connectionPromise) {
    console.log('Connection already in progress, returning existing promise');
    return connectionPromise;
  }

  if (globalAdapter) {
    console.log('Adapter already connected');
    return Promise.resolve();
  }

  connectionPromise = (async () => {
    try {
      console.log('Creating new global WebSocket adapter');

      // Create adapter with disconnect callback
      const adapter = new WebSocketAdapter(wsUrl, undefined, () => {
        console.log('Global adapter disconnect callback triggered');
        globalAdapter = null;
        connectionPromise = null;

        // Notify all subscribers about disconnection
        onDisconnectedCallbacks.forEach((callback) => callback());
      });

      // Wait for connection
      await adapter.connect();

      globalAdapter = adapter;
      console.log('Global WebSocket adapter connected and ready');

      // Notify all subscribers about connection
      onConnectedCallbacks.forEach((callback) => callback());
    } catch (error) {
      connectionPromise = null;
      console.error('Global adapter connection failed:', error);
      throw error;
    }
  })();

  return connectionPromise;
}

export function disconnectGlobalAdapter(): void {
  console.log('Disconnecting global WebSocket adapter');

  if (globalAdapter) {
    globalAdapter.disconnect();
    globalAdapter = null;
  }

  connectionPromise = null;

  // Notify all subscribers about disconnection
  onDisconnectedCallbacks.forEach((callback) => callback());
}

// Subscription functions for components to listen to connection state changes
export function onGlobalAdapterConnected(callback: () => void): () => void {
  onConnectedCallbacks.push(callback);

  // Return unsubscribe function
  return () => {
    const index = onConnectedCallbacks.indexOf(callback);
    if (index > -1) {
      onConnectedCallbacks.splice(index, 1);
    }
  };
}

export function onGlobalAdapterDisconnected(callback: () => void): () => void {
  onDisconnectedCallbacks.push(callback);

  // Return unsubscribe function
  return () => {
    const index = onDisconnectedCallbacks.indexOf(callback);
    if (index > -1) {
      onDisconnectedCallbacks.splice(index, 1);
    }
  };
}
