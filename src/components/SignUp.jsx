import React, { useState } from 'react';
import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import app from '../firebase'; // Assuming firebase.js is in src folder
import { useNavigate, useLocation } from 'react-router-dom'; // Import useNavigate and useLocation
import Header from './Header';

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

function SignUp() {
  const navigate = useNavigate(); // Initialize useNavigate
  const location = useLocation(); // Initialize useLocation
  
  // Get the intended type from URL parameters
  const intendedType = new URLSearchParams(location.search).get('type');

  const handleGoogleSignUp = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Navigate based on intended type or default to dashboard
      if (intendedType) {
        switch (intendedType) {
          case 'image':
          case 'video':
          case 'edit':
            navigate(`/studio?type=${intendedType}`);
            break;
          case 'portrait':
            navigate('/portrait');
            break;
          default:
            navigate('/');
        }
      } else {
        navigate('/'); // Default to dashboard
      }

    } catch (error) {
      console.error('Google Sign-Up Attempt Error:', error);
      let errorMessageToShow = "An error occurred during the sign-in attempt. Please try again.";
      if (error.code === 'auth/popup-closed-by-user') {
        errorMessageToShow = "The sign-in process was canceled.";
      }
      // We don't show detailed Firebase errors to the user in this specific "closed beta" message flow.
      alert(errorMessageToShow);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 font-sans">
      {/* Header */}
      <Header />
      
      {/* Main Content */}
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="max-w-sm w-full">
          {/* Logo and Header Section */}
          <div className="text-center mb-8">
            <img src="/logonaked.png" alt="Lungo AI Logo" className="h-12 mx-auto mb-4" />
            <h1 className="text-3xl font-medium text-white mb-2">Welcome to Lungo AI</h1>
            <p className="text-lg text-neutral-400">Join and bring your ideas to life</p>
          </div>

          {/* Main Content */}
          <div className="bg-neutral-800/50 backdrop-blur-sm rounded-xl px-6 py-6 space-y-4">
            {/* Google Button - Header style */}
            <button
              onClick={handleGoogleSignUp}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-white hover:bg-neutral-100 text-black rounded-xl text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continue with Google
            </button>

            {/* Privacy Note */}
            <p className="text-xs text-center text-neutral-400">
              By continuing, you agree to our <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-lime-400 hover:text-lime-300 transition-colors">Terms</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-lime-400 hover:text-lime-300 transition-colors">Privacy Policy</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SignUp; 