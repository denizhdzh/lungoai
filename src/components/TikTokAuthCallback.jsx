import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { CircleNotch } from '@phosphor-icons/react';

// Assume your firebase config is initialized elsewhere and functions are available
const functions = getFunctions();
const exchangeTikTokAuthCode = httpsCallable(functions, 'exchangeTikTokAuthCode');

function TikTokAuthCallback() {
  const [message, setMessage] = useState('Processing TikTok authentication...');
  const [error, setError] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const processAuth = async () => {
      const searchParams = new URLSearchParams(location.search);
      const code = searchParams.get('code');
      const returnedState = searchParams.get('state');

      const originalState = localStorage.getItem('tiktok_oauth_state');
      console.log('[TikTokAuthCallback] Returned state from URL:', returnedState);
      console.log('[TikTokAuthCallback] Original state from localStorage:', originalState);
      // const codeVerifier = sessionStorage.getItem('tiktok_code_verifier'); // No longer needed for Web flow

      // Clear them immediately after retrieval
      localStorage.removeItem('tiktok_oauth_state');
      // sessionStorage.removeItem('tiktok_code_verifier'); // No longer needed

      if (!code || !returnedState) {
        setError('Missing authorization code or state from TikTok.');
        setMessage('Authentication failed.');
        setTimeout(() => navigate('/settings', { state: { tiktokAuthError: 'Missing code or state.' } }), 3000);
        return;
      }

      if (returnedState !== originalState) {
        setError('Invalid state parameter. Possible CSRF attack.');
        setMessage('Authentication failed due to state mismatch.');
        setTimeout(() => navigate('/settings', { state: { tiktokAuthError: 'State mismatch.' } }), 3000);
        return;
      }

      // The redirectUri here MUST EXACTLY MATCH the one used to generate the auth URL
      // AND the one registered in your TikTok app settings.
      const redirectUri = `${window.location.origin}/auth/tiktok/callback`;

      try {
        setMessage('Exchanging authorization code for access token...');
        // For Web flow, codeVerifier is not sent
        const result = await exchangeTikTokAuthCode({
          authorizationCode: code,
          redirectUri: redirectUri,
          state: returnedState,
          // codeVerifier: codeVerifier // No longer sent
        });

        if (result.data.success) {
          setMessage('TikTok account linked successfully! Redirecting...');
          // Navigate to settings, perhaps with a success message in state
          setTimeout(() => navigate('/settings', { state: { tiktokAuthSuccess: 'TikTok account linked!' } }), 2000);
        } else {
          throw new Error(result.data.message || 'Failed to link TikTok account.');
        }
      } catch (err) {
        console.error('Error exchanging TikTok auth code:', err);
        const errorMessage = err.message || 'An unknown error occurred during TikTok authentication.';
        setError(errorMessage);
        setMessage(`Error: ${errorMessage}`);
        setTimeout(() => navigate('/settings', { state: { tiktokAuthError: errorMessage } }), 5000);
      }
    };

    processAuth();
  }, [location, navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
      <div className="bg-white dark:bg-gray-800 shadow-xl rounded-lg p-8 md:p-12 text-center">
        {error ? (
          <svg className="mx-auto h-12 w-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : (
          <CircleNotch size={48} className="mx-auto text-sky-500 animate-spin" />
        )}
        <h1 className={`mt-4 text-2xl font-semibold ${error ? 'text-red-700 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}`}>
          {error ? 'Authentication Failed' : 'Connecting to TikTok'}
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          {message}
        </p>
        {error && (
          <p className="mt-1 text-sm text-red-500 dark:text-red-400">
            You will be redirected to settings shortly.
          </p>
        )}
         {!error && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Please wait, this should only take a moment.
          </p>
        )}
      </div>
    </div>
  );
}

export default TikTokAuthCallback; 