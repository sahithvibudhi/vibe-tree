import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import type {
  AuthContextType,
  AuthProviderProps,
  AuthState,
  LoginCredentials,
  AuthConfig
} from '../types';
import { AuthAPI, AuthStorage, AuthError } from '../utils/auth';

// Auth state actions
type AuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_AUTH_CONFIG'; payload: AuthConfig }
  | { type: 'LOGIN_SUCCESS'; payload: string }
  | { type: 'LOGOUT' }
  | { type: 'CLEAR_ERROR' }
  | { type: 'RESTORE_SESSION'; payload: string };

// Initial state
const initialState: AuthState = {
  isAuthenticated: false,
  isLoading: true,
  sessionToken: null,
  error: null,
  authConfig: null
};

// Auth reducer
function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };

    case 'SET_AUTH_CONFIG':
      return { ...state, authConfig: action.payload };

    case 'LOGIN_SUCCESS':
      return {
        ...state,
        isAuthenticated: true,
        sessionToken: action.payload,
        error: null,
        isLoading: false
      };

    case 'LOGOUT':
      return {
        ...state,
        isAuthenticated: false,
        sessionToken: null,
        error: null,
        isLoading: false
      };

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    case 'RESTORE_SESSION':
      return {
        ...state,
        isAuthenticated: true,
        sessionToken: action.payload,
        isLoading: false
      };

    default:
      return state;
  }
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// AuthProvider component
export function AuthProvider({ children, serverUrl }: AuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const authAPI = React.useMemo(() => new AuthAPI(serverUrl), [serverUrl]);

  // Check authentication status on mount
  const checkAuthStatus = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });

      // Check server auth configuration
      const authConfig = await authAPI.checkAuthConfig();
      dispatch({ type: 'SET_AUTH_CONFIG', payload: authConfig });

      // If auth is not required, consider user authenticated
      if (!authConfig.authRequired) {
        dispatch({ type: 'LOGIN_SUCCESS', payload: 'no-auth-required' });
        return;
      }

      // Check for existing session token
      const existingToken = AuthStorage.getSessionToken();
      if (existingToken && AuthStorage.isAuthenticated()) {
        // TODO: Optionally validate token with server
        dispatch({ type: 'RESTORE_SESSION', payload: existingToken });
      } else {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    } catch (error) {
      console.error('Failed to check auth status:', error);
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof AuthError ? error.message : 'Failed to connect to server'
      });
    }
  }, [authAPI]);

  // Login function
  const login = useCallback(
    async (credentials: LoginCredentials) => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'CLEAR_ERROR' });

        const response = await authAPI.login(credentials);

        // Save to localStorage
        AuthStorage.setSessionToken(response.sessionToken);

        dispatch({ type: 'LOGIN_SUCCESS', payload: response.sessionToken });
      } catch (error) {
        console.error('Login failed:', error);
        const errorMessage = error instanceof AuthError ? error.message : 'Login failed';
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      }
    },
    [authAPI]
  );

  // Logout function
  const logout = useCallback(async () => {
    const currentToken = state.sessionToken;
    try {
      if (currentToken) {
        // Attempt to notify server (don't wait for response)
        authAPI.logout(currentToken).catch(console.warn);
      }
    } finally {
      // Always clear local state
      AuthStorage.removeSessionToken();
      dispatch({ type: 'LOGOUT' });
    }
  }, [authAPI]); // Remove state.sessionToken from deps to prevent re-renders

  // Clear error function
  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  // Retry function (re-check auth status)
  const retry = useCallback(async () => {
    await checkAuthStatus();
  }, [checkAuthStatus]);

  // Check auth status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []); // Empty deps array - only run on mount

  const contextValue: AuthContextType = React.useMemo(
    () => ({
      ...state,
      login,
      logout,
      checkAuthStatus,
      clearError,
      retry
    }),
    [state, login, logout, checkAuthStatus, clearError, retry]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

// Custom hook to use auth context
export function useAuthContext(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
