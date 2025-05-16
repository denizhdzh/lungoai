import React, { useState, useEffect } from 'react';
import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import app from '../firebase'; // Assuming firebase.js is in src folder
import { useNavigate } from 'react-router-dom'; // Import useNavigate
import { DotLottieReact } from '@lottiefiles/dotlottie-react'; // Import DotLottieReact

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

function SignUp() {
  const navigate = useNavigate(); // Initialize useNavigate
  const [isLoading, setIsLoading] = useState(true); // Add loading state

  // Simulate loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1500); // Simulate 1.5 seconds load time
    return () => clearTimeout(timer);
  }, []);

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

  // --- Full Page Loader ---
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white">
        {/* Using a slightly different Lottie or the same one is fine */}
        <DotLottieReact
          src="https://lottie.host/f5046ffa-160b-4e7b-9d11-1c8f4fe34e04/eppkYXQ80Y.lottie" 
          loop
          autoplay
          style={{ width: '80px', height: '80px' }}
        />
      </div>
    );
  }
  // --- End Full Page Loader ---

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans relative overflow-hidden">
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
      
      <div className="max-w-sm w-full relative z-10">
        {/* Logo and Header Section */}
        <div className="text-center mb-10">
          <img src="/logonaked-black.png" alt="Lungo AI Logo" className="h-16 mx-auto mb-5" />
          <h1 className="text-3xl font-normal tracking-wide text-black mb-2">lungo ai</h1>
          <p className="text-base text-gray-500">Join Lungo AI and bring your ideas to life.</p>
        </div>

        {/* Main Content - No Card Border */}
        <div className="space-y-5 p-8 rounded-lg">
          {/* Buttons Container */}
          <div className="space-y-4">
            {/* Google Button */}
            <button
              onClick={handleGoogleSignUp}
              className="group w-full flex items-center justify-center px-5 py-3
                        border border-gray-100 rounded-md
                        bg-white hover:border-gray-200
                        transition-all duration-200 ease-in-out"
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              <span className="text-sm font-normal">Continue with Google</span>
            </button>

            {/* Twitter Button - REMOVED */}

            {/* Apple Button - REMOVED */}
            {/*
            <button
              onClick={handleAppleSignUp}
              className="group w-full flex items-center justify-center px-5 py-3
                        border border-gray-100 rounded-md
                        bg-white hover:border-gray-200
                        transition-all duration-200 ease-in-out"
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.569 12.6254C17.597 15.4237 20.1579 16.3088 20.1869 16.3216C20.1649 16.3943 19.8501 17.4169 19.1395 18.4798C18.5346 19.3839 17.9128 20.2809 16.9128 20.3093C15.9344 20.3368 15.6169 19.7008 14.4837 19.7008C13.3504 19.7008 13.0058 20.2809 12.0564 20.3368C11.0858 20.3927 10.3777 19.3978 9.76762 18.5021C8.52547 16.6682 7.55047 13.3132 8.82129 11.0197C9.44961 9.88094 10.5858 9.16181 11.8213 9.13431C12.7712 9.10681 13.6663 9.80094 14.2456 9.80094C14.8249 9.80094 15.9009 8.9777 17.022 9.12681C17.5976 9.15431 18.6949 9.38956 19.3777 10.3389C19.3081 10.3839 17.5465 11.3783 17.569 12.6254ZM15.5702 7.46506C16.0606 6.87094 16.3949 6.04431 16.295 5.22681C15.5864 5.25431 14.7336 5.71506 14.2262 6.29831C13.7747 6.80919 13.37 7.65944 13.4847 8.45331C14.2696 8.51506 15.0798 8.05944 15.5702 7.46506Z" fill="black" />
              </svg>
              <span className="text-sm font-normal">Continue with Apple</span>
            </button>
            */}
          </div>

          {/* Privacy Note - UPDATED */}
          <p className="mt-6 text-xs text-center text-gray-500 dark:text-gray-400">
            By clicking "Continue with Google", you acknowledge that you have read and 
            understood, and agree to Lungo AI's <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-black dark:hover:text-white transition-colors">Terms & Conditions</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-black dark:hover:text-white transition-colors">Privacy Policy</a>.
          </p>
        </div>
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