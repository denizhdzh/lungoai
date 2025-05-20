import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { CircleNotch } from '@phosphor-icons/react';
import { functions } from '../firebase'; // Ensure this path is correct

// Assume your firebase config is initialized elsewhere and functions are available
const exchangeTikTokAuthCode = httpsCallable(functions, 'exchangeTikTokAuthCode');
const updateTikTokUserDetails = httpsCallable(functions, 'updateTikTokUserDetails');

// --- NEW: Define REDIRECT_URI consistently ---
const REDIRECT_URI = 'https://app.lungoai.com/auth/tiktok/callback';

function TikTokAuthCallback() {
  const [message, setMessage] = useState('Authenticating with TikTok...');
  const [error, setError] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const processAuth = async () => {
      // --- NEW: Logging actual URL search params ---
      const rawSearch = window.location.search;
      console.log("[TikTokAuthCallback] Raw location.search:", rawSearch);
      // --- END NEW ---

      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      const returnedStateFromTikTok = params.get('state');

      // --- NEW: Logging parsed values ---
      console.log("[TikTokAuthCallback] Extracted code:", code);
      console.log("[TikTokAuthCallback] Extracted state (returnedStateFromTikTok):", returnedStateFromTikTok);
      // --- END NEW ---

      const originalState = localStorage.getItem('tiktok_auth_state');
      // --- NEW: Logging original state from localStorage ---
      console.log("[TikTokAuthCallback] Original state from localStorage:", originalState);
      // --- END NEW ---
      localStorage.removeItem('tiktok_auth_state'); // Clean up state

      if (!code) {
        setError('Authentication failed: No authorization code returned from TikTok.');
        setTimeout(() => navigate('/settings?tab=tiktok'), 5000);
        return;
      }

      if (returnedStateFromTikTok !== originalState) {
        // --- MODIFIED: More detailed error logging ---
        const errorMessage = `Authentication failed due to state mismatch. Returned: '${returnedStateFromTikTok}', Expected: '${originalState}'.`;
        console.error("[TikTokAuthCallback] State mismatch:", errorMessage);
        setError(errorMessage);
        // --- END MODIFIED ---
        setTimeout(() => navigate('/settings?tab=tiktok'), 5000);
        return;
      }

      try {
        setMessage('Exchanging authorization code for token...');
        const exchangeResult = await exchangeTikTokAuthCode({
          authorizationCode: code,
          redirectUri: REDIRECT_URI,
        });

        if (exchangeResult.data.success && exchangeResult.data.integrationId) {
          setMessage(exchangeResult.data.message || 'TikTok account linked. Fetching profile details...');
          const integrationId = exchangeResult.data.integrationId;
          
          try {
            // Now call updateTikTokUserDetails with the new integrationId
            setMessage(`Fetching TikTok profile for integration ID: ${integrationId}...`);
            const userDetailsResult = await updateTikTokUserDetails({ integrationId });

            if (userDetailsResult.data.success) {
              setMessage(userDetailsResult.data.message || 'TikTok profile details synced! Redirecting...');
            } else {
              // Even if user details fetch fails, the account is linked. Log error and proceed.
              console.error("Error syncing TikTok user details post-link:", userDetailsResult.data.message);
              setError(`Account linked, but failed to sync profile: ${userDetailsResult.data.message}. You can sync manually from Settings.`);
              // setMessage will be overwritten by setError, but that's fine.
            }
          } catch (detailsError) {
            console.error("Error calling updateTikTokUserDetails:", detailsError);
            setError(`Account linked, but an error occurred fetching profile: ${detailsError.message}. You can sync manually from Settings.`);
          }
        } else {
          setError(exchangeResult.data.message || 'Failed to link TikTok account. Missing integration ID.');
        }
      } catch (e) {
        console.error("Error exchanging TikTok auth code:", e);
        setError(`Error during token exchange: ${e.message || 'Unknown error'}`);
      }
      setTimeout(() => navigate('/settings?tab=tiktok'), 5000); // Redirect back to settings
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