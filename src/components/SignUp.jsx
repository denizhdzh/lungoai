import React, { useState } from 'react';
import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import app from '../firebase'; // Assuming firebase.js is in src folder
import { useNavigate } from 'react-router-dom'; // Import useNavigate

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

function SignUp() {
  const navigate = useNavigate(); // Initialize useNavigate

  const handleGoogleSignUp = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const email = user.email;

      // Navigate to dashboard upon successful sign-in
      navigate('/dashboard'); // Assuming '/dashboard' is the target route

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
    <div className="min-h-screen bg-neutral-950 flex flex-col lg:flex-row font-sans relative overflow-auto">
      {/* Static Background Image */}
      <div className="absolute inset-0 w-full h-full">
        <img 
          src="/Glowing Abstract Flower.png" 
          alt="Background" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/50" />
      </div>
      
      {/* SignUp Content - Full width on mobile, left half on desktop */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-12 lg:py-0 min-h-screen">
        <div className="max-w-sm w-full relative z-10">
          {/* Logo and Header Section */}
          <div className="text-center mb-10">
            <img src="/logonaked.webp" alt="Lungo AI Logo" className="h-8 mx-auto mb-5" />
            <h1 className="text-3xl font-normal tracking-wide text-white mb-2">lungo ai</h1>
            <p className="text-base text-gray-400">Join Lungo AI and bring your ideas to life.</p>
          </div>

          {/* Main Content - Clean Style */}
          <div className="space-y-6">
            {/* Google Button */}
            <button
              onClick={handleGoogleSignUp}
              className="group w-full flex items-center justify-center px-6 py-4
                        bg-neutral-900/70 backdrop-blur-xl 
                        border border-neutral-100/20 hover:border-lime-400
                        rounded-3xl transition-all duration-300 hover:scale-105 hover:bg-neutral-900/80"
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              <span className="text-sm font-normal text-white tracking-wide">Continue with Google</span>
            </button>

            {/* Privacy Note */}
            <p className="mt-6 text-xs text-center text-neutral-400">
              By continuing, you agree to our <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-lime-400 hover:text-lime-300 transition-colors">Terms</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-lime-400 hover:text-lime-300 transition-colors">Privacy Policy</a>.
            </p>
          </div>
        </div>
      </div>
      
      {/* Video - Hidden on mobile, right half on desktop */}
      <div className="hidden lg:block lg:w-1/2 p-5 relative z-10 h-screen">
        <video autoPlay loop muted className="w-full h-full object-cover rounded-2xl">
          <source src="/vid2.mp4" type="video/mp4" />
        </video>
      </div>

    </div>
  );
}

export default SignUp; 