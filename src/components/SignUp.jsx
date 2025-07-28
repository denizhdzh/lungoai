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
    <div className="h-screen bg-neutral-950 flex font-sans relative overflow-hidden">
      {/* Dot Grid Background */}
      <div className="absolute inset-0 h-full w-full bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_60%,transparent_100%)]"></div>
      
      {/* Animated background grid */}
      <div className="absolute inset-0 z-0">
        <div className="grid-animation"></div>
      </div>
      
      {/* Minimalist corner accents */}
      <div className="corner-accent top-left"></div>
      <div className="corner-accent top-right"></div>
      <div className="corner-accent bottom-left"></div>
      <div className="corner-accent bottom-right"></div>
      
      {/* Subtle diagonal lines */}
      <div className="diagonal-line line-1"></div>
      <div className="diagonal-line line-2"></div>
      
      {/* Left side - SignUp Content */}
      <div className="w-1/2 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="max-w-sm w-full relative z-10">
          {/* Logo and Header Section */}
          <div className="text-center mb-10">
            <img src="/logonaked.png" alt="Lungo AI Logo" className="h-8 mx-auto mb-5" />
            <h1 className="text-3xl font-normal tracking-wide text-white mb-2">lungo ai</h1>
            <p className="text-base text-gray-400">Join Lungo AI and bring your ideas to life.</p>
          </div>

          {/* Main Content - Clean Style */}
          <div className="space-y-6">
            {/* Google Button */}
            <button
              onClick={handleGoogleSignUp}
              className="group w-full flex items-center justify-center px-6 py-4
                        bg-neutral-950/40 backdrop-blur-xl 
                        border border-neutral-700/50 hover:border-neutral-600/70
                        rounded-3xl transition-all duration-300 hover:scale-105 hover:bg-neutral-950/60"
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
      
      {/* Right side - Video */}
      <div className="w-1/2 p-5 relative z-10 h-full">
        <video autoPlay loop muted className="w-full h-full object-cover rounded-2xl">
          <source src="/vid2.mp4" type="video/mp4" />
        </video>
      </div>

      {/* CSS for the animated background */}
      <style>{`
        .grid-animation {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-image: 
            linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px);
          background-size: 35px 35px;
          background-position: center center;
          animation: grid-move 30s linear infinite;
        }
        
        .grid-animation::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-image: 
            radial-gradient(circle, rgba(0, 0, 0, 0.05) 1px, transparent 1px);
          background-size: 50px 50px;
          background-position: center center;
          animation: dots-pulse 20s ease-in-out infinite alternate;
        }

        /* Minimalist corner accents */
        .corner-accent {
          position: absolute;
          width: 60px;
          height: 60px;
          z-index: 1;
          opacity: 0.1;
        }

        .top-left {
          top: 50px;
          left: 50px;
          border-top: 1px solid #000;
          border-left: 1px solid #000;
        }

        .top-right {
          top: 50px;
          right: 50px;
          border-top: 1px solid #000;
          border-right: 1px solid #000;
        }

        .bottom-left {
          bottom: 50px;
          left: 50px;
          border-bottom: 1px solid #000;
          border-left: 1px solid #000;
        }

        .bottom-right {
          bottom: 50px;
          right: 50px;
          border-bottom: 1px solid #000;
          border-right: 1px solid #000;
        }

        /* Diagonal lines */
        .diagonal-line {
          position: absolute;
          background-color: rgba(0, 0, 0, 0.02);
          z-index: 1;
          transform: rotate(45deg);
          transform-origin: center;
        }

        .line-1 {
          width: 1px;
          height: 100vh;
          left: 15%;
        }

        .line-2 {
          width: 1px;
          height: 100vh;
          right: 15%;
        }

        @keyframes grid-move {
          0% {
            background-position: 0 0;
          }
          100% {
            background-position: 35px 35px;
          }
        }
        
        @keyframes dots-pulse {
          0% {
            opacity: 0.05;
          }
          50% {
            opacity: 0.1;
          }
          100% {
            opacity: 0.05;
          }
        }
      `}</style>
    </div>
  );
}

export default SignUp; 