import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import PricingSection from './PricingSection';

const Header = () => {
  const user = auth.currentUser;
  const navigate = useNavigate();
  const [firestoreUserData, setFirestoreUserData] = useState(null);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);

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

  return (
    <>
      {/* Top Navigation Bar */}
      <header className="fixed top-3 left-3 right-3 z-40 bg-neutral-900/10 backdrop-blur-sm transition-colors duration-200 rounded-2xl h-12">
        <div className="flex items-center justify-between h-full px-2">
          {/* Left: Logo */}
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
          
          {/* Right: Navigation items for desktop only, Sign Up for guests */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                {/* Models Button */}
                <button
                  onClick={() => navigate('/models')}
                  className="px-3 py-1.5 text-white hover:bg-neutral-800 rounded-lg text-sm font-medium transition-colors"
                >
                  Models
                </button>

                {/* Pricing Button */}
                <button
                  onClick={() => setIsPricingModalOpen(true)}
                  className="px-3 py-1.5 text-white hover:bg-neutral-800 rounded-lg text-sm font-medium transition-colors"
                >
                  Pricing
                </button>
                
                {/* Settings Button */}
                <button
                  onClick={() => navigate('/settings')}
                  className="px-3 py-1.5 text-white hover:bg-neutral-800 rounded-lg text-sm font-medium transition-colors"
                >
                  Settings
                </button>
                
                {/* Studio Button */}
                <button
                  onClick={() => navigate('/studio')}
                  className="px-3 py-1.5 bg-lime-400 hover:bg-lime-600 text-black rounded-lg text-sm font-medium transition-colors"
                >
                  Create+
                </button>
              </>
            ) : (
              <>
                {/* Models Button for non-authenticated users - Hidden on mobile */}
                <button
                  onClick={() => navigate('/models')}
                  className="hidden md:block px-3 py-1.5 text-white hover:bg-neutral-800 rounded-lg text-sm font-medium transition-colors"
                >
                  Models
                </button>

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