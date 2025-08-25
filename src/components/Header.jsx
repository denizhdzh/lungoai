import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import PricingSection from './PricingSection';

const Header = () => {
  const user = auth.currentUser;
  const navigate = useNavigate();
  const location = useLocation();
  const [firestoreUserData, setFirestoreUserData] = useState(null);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isMobileCreateOpen, setIsMobileCreateOpen] = useState(false);
  const dropdownRef = useRef(null);
  const mobileCreateRef = useRef(null);
  
  // Get current type from URL
  const currentType = new URLSearchParams(location.search).get('type') || 'image';
  
  // Check if current page is GenerationPage
  const isGenerationPage = location.pathname === '/studio';

  // Fetch Firestore user data
  useEffect(() => {
    if (user && user.uid) {
      const userDocRef = doc(db, 'users', user.uid);
      const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          setFirestoreUserData(docSnap.data());
        } else {
          console.log("User document not found in Firestore for header.");
          setFirestoreUserData(null);
        }
      }, (error) => {
        console.error("Error fetching user document from Firestore for header:", error);
        setFirestoreUserData(null);
      });
      return () => unsubscribe();
    } else {
      setFirestoreUserData(null);
    }
  }, [user]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsProfileDropdownOpen(false);
      }
      if (mobileCreateRef.current && !mobileCreateRef.current.contains(event.target)) {
        setIsMobileCreateOpen(false);
      }
    };

    if (isProfileDropdownOpen || isMobileCreateOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileDropdownOpen, isMobileCreateOpen]);

  return (
    <>
      {/* Top Navigation Bar */}
      <header className="fixed top-3 left-3 right-3 z-40 transition-colors duration-200 rounded-2xl h-12">
        <div className="flex items-center h-full px-1 md:px-2">
          {/* Left: Logo + Navigation in same background */}
          {/* Mobile Version */}
          <div className="flex md:hidden items-center gap-2 bg-neutral-800/50 backdrop-blur-sm rounded-xl px-2 py-2">
            {/* Logo */}
            <button 
              onClick={() => navigate('/')}
              className="flex items-center group"
            >
              <img 
                src="/logonaked.png"
                alt="Lungo AI Logo"
                className="h-5 w-auto"
              />
            </button>
            
            {/* Create Menu Button */}
            <div className="relative" ref={mobileCreateRef}>
              <button 
                onClick={() => setIsMobileCreateOpen(!isMobileCreateOpen)}
                className="p-1.5 rounded-lg transition-colors text-white hover:bg-neutral-700"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              
              {/* Mobile Create Dropdown */}
              {isMobileCreateOpen && (
                <div className="absolute top-full left-0 mt-2 w-40 bg-neutral-800 rounded-xl shadow-lg border border-neutral-700 py-2 z-50">
                  <button
                    onClick={() => {
                      user ? navigate('/studio?type=image') : navigate('/signup');
                      setIsMobileCreateOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-sm transition-colors text-left flex items-center gap-2 ${
                      isGenerationPage && currentType === 'image' 
                        ? 'bg-white text-black' 
                        : 'text-white hover:bg-neutral-700'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Image
                  </button>
                  
                  <button
                    onClick={() => {
                      user ? navigate('/studio?type=video') : navigate('/signup');
                      setIsMobileCreateOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-sm transition-colors text-left flex items-center gap-2 ${
                      isGenerationPage && currentType === 'video' 
                        ? 'bg-white text-black' 
                        : 'text-white hover:bg-neutral-700'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Video
                  </button>
                  
                  <button
                    onClick={() => {
                      user ? navigate('/studio?type=edit') : navigate('/signup');
                      setIsMobileCreateOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-sm transition-colors text-left flex items-center gap-2 ${
                      isGenerationPage && currentType === 'edit' 
                        ? 'bg-white text-black' 
                        : 'text-white hover:bg-neutral-700'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    Edit
                  </button>
                  
                  <button
                    onClick={() => {
                      user ? navigate('/portrait') : navigate('/signup');
                      setIsMobileCreateOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-sm transition-colors text-left flex items-center gap-2 ${
                      location.pathname === '/portrait'
                        ? 'bg-white text-black' 
                        : 'text-white hover:bg-neutral-700'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    FaceSwap
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Desktop Version */}
          <div className="hidden md:flex items-center gap-4 bg-neutral-800/50 backdrop-blur-sm rounded-xl px-4 py-2">
            {/* Logo */}
            <button 
              onClick={() => navigate('/')}
              className="flex items-center group"
            >
              <img 
                src="/logonaked.png"
                alt="Lungo AI Logo"
                className="h-6 w-auto"
              />
            </button>
            
            {/* Navigation - Desktop Text */}
            <div className="flex items-center gap-2">
              <button 
                onClick={() => user ? navigate('/studio?type=image') : navigate('/signup')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isGenerationPage && currentType === 'image' 
                    ? 'bg-white text-black' 
                    : 'text-white hover:bg-neutral-700'
                }`}
              >
                Image
              </button>
              
              <button 
                onClick={() => user ? navigate('/studio?type=video') : navigate('/signup')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isGenerationPage && currentType === 'video' 
                    ? 'bg-white text-black' 
                    : 'text-white hover:bg-neutral-700'
                }`}
              >
                Video
              </button>
              
              <button 
                onClick={() => user ? navigate('/studio?type=edit') : navigate('/signup')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isGenerationPage && currentType === 'edit' 
                    ? 'bg-white text-black' 
                    : 'text-white hover:bg-neutral-700'
                }`}
              >
                Edit
              </button>
              
              <button 
                onClick={() => user ? navigate('/portrait') : navigate('/signup')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === '/portrait'
                    ? 'bg-white text-black' 
                    : 'text-white hover:bg-neutral-700'
                }`}
              >
                FaceSwap
              </button>
              
            </div>
          </div>
          
          {/* Right: Recent Generations + User Profile or Auth buttons */}
          <div className="flex items-center gap-2 ml-auto">
            {user ? (
              <div className="flex items-center gap-1 md:gap-2 bg-neutral-800/50 backdrop-blur-sm rounded-xl px-2 md:px-3 py-2">
                {/* Recent Generations Button */}
                <button
                  onClick={() => navigate('/history')}
                  className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 text-white hover:bg-neutral-700/50 rounded-lg text-sm font-medium transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="hidden lg:block">Recent</span>
                </button>

                <div className="relative" ref={dropdownRef}>
                {/* User Profile Button */}
                <button
                  onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                  className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 text-white hover:bg-neutral-800/50 rounded-lg text-sm font-medium transition-colors"
                >
                  <img
                    src={firestoreUserData?.photoURL || user.photoURL || '/pp-placeholder.webp'}
                    alt="Profile"
                    className="w-6 h-6 rounded-full object-cover"
                  />
                  <span className="hidden lg:block">
                    {(() => {
                      const fullName = firestoreUserData?.displayName || user.displayName || 'User';
                      const nameParts = fullName.split(' ');
                      if (nameParts.length >= 2) {
                        const firstName = nameParts[0];
                        const lastNameInitial = nameParts[nameParts.length - 1].charAt(0).toUpperCase();
                        return `${firstName} ${lastNameInitial}.`;
                      }
                      return fullName;
                    })()} 
                  </span>
                  <svg className="w-4 h-4 hidden md:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {/* Dropdown Menu */}
                {isProfileDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-neutral-800 rounded-xl shadow-lg border border-neutral-700 py-2 z-50">
                    {/* Credits Section */}
                    <div className="mx-3 my-2 p-3 border border-white/20 rounded-lg">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-lime-400" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                        </svg>
                        <div>
                          <div className="text-xs text-white/60">Credits</div>
                          <div className="text-sm font-medium text-white">
                            {((firestoreUserData?.general_credits || 0) + (firestoreUserData?.one_time_credits || 0))} remaining
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Menu Items */}
                    <button
                      onClick={() => {
                        setIsPricingModalOpen(true);
                        setIsProfileDropdownOpen(false);
                      }}
                      className="w-full px-4 py-2 text-sm text-white hover:bg-neutral-700 transition-colors text-left"
                    >
                      Upgrade Plan
                    </button>
                    
                    <button
                      onClick={() => {
                        navigate('/settings');
                        setIsProfileDropdownOpen(false);
                      }}
                      className="w-full px-4 py-2 text-sm text-white hover:bg-neutral-700 transition-colors text-left"
                    >
                      Settings
                    </button>
                    
                    <div className="border-t border-neutral-700 mt-2 pt-2">
                      <button
                        onClick={() => {
                          auth.signOut();
                          navigate('/');
                          setIsProfileDropdownOpen(false);
                        }}
                        className="w-full px-4 py-2 text-sm text-red-400 hover:bg-neutral-700 transition-colors text-left"
                      >
                        Log Out
                      </button>
                    </div>
                  </div>
                )}
                </div>
              </div>
            ) : (
              <>
                {/* Pricing Button for non-authenticated users */}
                <button
                  onClick={() => setIsPricingModalOpen(true)}
                  className="px-3 py-1.5 text-white hover:bg-neutral-800 rounded-lg text-sm font-medium transition-colors"
                >
                  Pricing
                </button>
                {/* Sign Up button for non-authenticated users - Hidden on mobile */}
                <button
                  onClick={() => navigate('/signup')}
                  className="hidden md:block px-4 py-1.5 bg-white hover:bg-neutral-100 text-black rounded-xl text-sm font-medium transition-colors"
                >
                  Sign Up
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Pricing Modal */}
      <AnimatePresence>
        {isPricingModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-white dark:bg-neutral-950"
            onClick={() => setIsPricingModalOpen(false)}
          >
            {/* Close button */}
            <button 
              onClick={() => setIsPricingModalOpen(false)}
              className="fixed top-6 right-6 z-20 p-3 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-full text-stone-800 dark:text-stone-200 transition-colors shadow-lg"
              aria-label="Close pricing plans"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            {/* Full Page Content */}
            <div 
              className="h-full w-full overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="min-h-full flex items-center justify-center py-20 px-6">
                <div className="w-full max-w-6xl">
                  <PricingSection id="pricing-modal" subscriptionData={firestoreUserData} user={user} />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Header;