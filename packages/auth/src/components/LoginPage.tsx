import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { clsx } from 'clsx';
import type { LoginPageProps } from '../types';

// Utility function similar to desktop app
const cn = (...inputs: any[]) => {
  return clsx(inputs);
};

// Input component styles (copied from desktop app)
const inputClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export function LoginPage({ onLoginSuccess, className = '' }: LoginPageProps) {
  const { login, isLoading, error, authConfig, clearError, retry } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Clear error when component mounts or inputs change
  useEffect(() => {
    if (error) {
      clearError();
    }
  }, [username, password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await login({ username: username.trim(), password });
      onLoginSuccess?.();
    } catch (err) {
      // Error is handled by the auth context
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading state while checking auth config
  if (isLoading && !authConfig) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 ${className}`}
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Checking server status...</p>
        </div>
      </div>
    );
  }

  // Show connection error with retry
  if (error && !authConfig) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 ${className}`}
      >
        <div className="max-w-md w-full space-y-8 p-8">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 text-red-500 mb-4">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Connection Error
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
            <button
              onClick={retry}
              disabled={isLoading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                'Retry Connection'
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show info if auth is not required
  if (authConfig && !authConfig.authRequired) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 ${className}`}
      >
        <div className="text-center">
          <div className="mx-auto h-12 w-12 text-green-500 mb-4">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            No Authentication Required
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            The server is running in open access mode.
          </p>
        </div>
      </div>
    );
  }

  // Show warning if auth is required but not configured
  if (authConfig && authConfig.authRequired && !authConfig.authConfigured) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 ${className}`}
      >
        <div className="max-w-md w-full space-y-8 p-8">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 text-yellow-500 mb-4">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Server Configuration Error
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-2">
              Authentication is required but not properly configured on the server.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Please contact your administrator to set up USERNAME and PASSWORD environment
              variables.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show login form
  return (
    <div
      className={`h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 ${className}`}
    >
      <div className="max-w-md w-full space-y-8 p-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            Sign in to VibeTree
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Enter your credentials to access the terminal interface
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3 sm:space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium mb-1.5 sm:mb-2">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isSubmitting}
                className={inputClass}
                placeholder="Enter your username"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1.5 sm:mb-2">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                className={inputClass}
                placeholder="Enter your password"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isSubmitting || !username.trim() || !password.trim()}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
