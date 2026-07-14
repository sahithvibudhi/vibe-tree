import { useAuthContext } from '../contexts/AuthContext';
import type { AuthContextType } from '../types';

/**
 * Hook to access authentication state and actions
 *
 * @returns AuthContextType - Complete authentication context
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isAuthenticated, login, logout, error } = useAuth();
 *
 *   if (!isAuthenticated) {
 *     return <LoginForm onLogin={login} error={error} />;
 *   }
 *
 *   return (
 *     <div>
 *       <button onClick={logout}>Logout</button>
 *       <p>Welcome! You are authenticated.</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useAuth(): AuthContextType {
  return useAuthContext();
}
