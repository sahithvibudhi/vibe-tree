export interface AuthConfig {
  authRequired: boolean;
  authConfigured: boolean;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  sessionToken: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionToken: string | null;
  error: string | null;
  authConfig: AuthConfig | null;
}

export interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  checkAuthStatus: () => Promise<void>;
  clearError: () => void;
  retry: () => Promise<void>;
}

export interface AuthProviderProps {
  children: React.ReactNode;
  serverUrl?: string;
}

export interface LoginPageProps {
  onLoginSuccess?: () => void;
  className?: string;
}

export interface AuthError {
  message: string;
  code?: string;
}
