import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import './index.css'
import SignUp from './components/SignUp.jsx';
import Onboarding from './components/Onboarding.jsx';
import Dashboard from './components/Dashboard.jsx';
import Settings from './components/Settings.jsx';
import Layout from './components/Layout.jsx';
import Admin from './components/Admin.jsx';
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from './firebase';
import { doc, getDoc, setDoc } from "firebase/firestore";
import PricingSection from './components/PricingSection.jsx';
import CommandInfo from './components/CommandInfo.jsx';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import TikTokAuthCallback from './components/TikTokAuthCallback.jsx';
import { motion } from 'framer-motion';
import CanvasWorkspace from './pages/CanvasWorkspace.jsx';

// --- FORCE DARK MODE ---
document.documentElement.classList.add('dark');
console.log("[main.jsx] Dark mode forced.");
// --- END FORCE DARK MODE ---

// Protected Route Component (Updated to use userData)
function ProtectedRoute({ user, userData, userDataFetched, children }) {
  // --- DEVELOPMENT OVERRIDE ---
  // In development, always allow access to children to bypass login for testing.
  if (import.meta.env.DEV) {
    return children;
  }
  // --- END DEVELOPMENT OVERRIDE ---

  // Wait until auth is checked and user data is fetched
  if (!userDataFetched) {
    return null; // Or a loading indicator
  }
  if (!user) {
    return <Navigate to="/signup" replace />;
  }
  // Check Firestore data
  if (!userData?.onboardingCompleted) {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
}

// Main App component to handle routing logic
function AppRouter() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [userData, setUserData] = useState(null); // State for Firestore user data
  const [userDataFetched, setUserDataFetched] = useState(false); // Track fetch status
  const navigate = useNavigate(); // Initialize navigate hook

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => { // Make async
      setUser(currentUser);
      setAuthChecked(true);
      setUserDataFetched(false); // Reset fetch status on auth change
      setUserData(null); // Clear previous user data

      if (currentUser) {
          try {
              console.log(`[AppRouter Auth] User ${currentUser.uid} logged in. Fetching Firestore data...`);
              const userDocRef = doc(db, "users", currentUser.uid);
              const docSnap = await getDoc(userDocRef);
              if (docSnap.exists()) {
                  setUserData(docSnap.data());
                  console.log("[AppRouter Auth] User data fetched:", docSnap.data());
              } else {
                  // Handle case where user exists in Auth but not Firestore 
                  console.warn("[AppRouter Auth] User document not found in Firestore for UID:", currentUser.uid);
                  setUserData({}); // Set to indicate fetch attempt completed, but no data
              }
          } catch (error) {
              console.error("[AppRouter Auth] Error fetching user document:", error);
              setUserData({}); // Set to indicate fetch attempt completed, with error
          } finally {
              setUserDataFetched(true); // Mark fetch as complete
          }
      } else {
          console.log("[AppRouter Auth] User logged out.");
          // User is logged out, userData is already null
          setUserDataFetched(true); // Mark fetch as complete (no data to fetch)
      }
  });
  return () => unsubscribe();
  }, []); // Keep dependency array empty

  // Update handler to set Firestore AND navigate
  const handleSetOnboardingComplete = async () => {
    if (user) {
      const userDocRef = doc(db, "users", user.uid);
      try {
        console.log(`[AppRouter Onboarding] Setting onboardingCompleted for user ${user.uid}`);
        await setDoc(userDocRef, { onboardingCompleted: true }, { merge: true });
        // Update local state immediately for faster UI response
        setUserData(prevData => ({ ...prevData, onboardingCompleted: true })); 
        console.log(`[AppRouter Onboarding] Firestore updated. Navigating to /`);
        navigate('/'); // Navigate to dashboard immediately after setting
      } catch (error) {
         console.error("[AppRouter Onboarding] Error setting onboarding complete in Firestore:", error);
         // Optionally show an error to the user
      }
    }
  };

  // Wait until auth check AND user data fetch are complete before rendering routes
  if (!authChecked || !userDataFetched) {
    // Use custom logo spinner for initial loading
    // const isDarkMode = document.documentElement.classList.contains('dark'); // No longer needed for src
    // const logoSrc = isDarkMode ? "/logonaked-white.png" : "/logonaked-black.png"; // No longer needed for src

    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white dark:bg-neutral-950 text-black dark:text-white">
        <motion.div
          style={{
            width: 80, // Represents 4 units
            boxSizing: 'border-box',
            boxShadow: 'inset 0 0 0 10px currentColor', // Thicker inside border
            marginBottom: 20, // Optional space below
            borderRadius: '16px',
          }}
          animate={{
            height: [80, 40, 80], // 4x4 -> 4x2 -> 4x4
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            repeatType: "loop",
            ease: "easeInOut",
          }}
        />
      </div>
    );
  }

  return (
    <Routes>
      {/* Updated /signup Route using userData */}
      <Route 
        path="/signup" 
        element={
          user ? (
            userData?.onboardingCompleted ? (
              <Navigate to="/" replace />
            ) : (
              <Navigate to="/onboarding" replace />
            )
          ) : (
            <SignUp />
          )
        }
      />
      {/* Updated /onboarding Route using userData */}
      <Route 
        path="/onboarding" 
        element={
          user ? (
            userData?.onboardingCompleted ? (
              <Navigate to="/" replace />
            ) : (
              <Onboarding setOnboardingComplete={handleSetOnboardingComplete} />
            )
          ) : (
            <Navigate to="/signup" replace /> // If no user, cannot be on onboarding
          )
        }
      />

      {/* --- NEW TIKTOK CALLBACK ROUTE --- */}
      <Route path="/auth/tiktok/callback" element={<TikTokAuthCallback />} />

      {/* Protected Routes using Layout (Pass userData now) */}
      <Route 
        path="/" 
        element={
          <ProtectedRoute user={user} userData={userData} userDataFetched={userDataFetched}>
            <Layout /> 
          </ProtectedRoute>
        }
      >
        {/* Default child route (Dashboard) */}
        <Route index element={<Dashboard />} /> 
        {/* Other child routes */}
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="settings" element={<Settings />} />
        <Route path="pricing" element={<PricingSection id="pricing" />} />
        <Route path="aiguide" element={<CommandInfo />} />
        <Route path="admin" element={<Admin />} />
        <Route path="studio" element={<CanvasWorkspace />} />
      </Route>

      {/* --- REMOVE STANDALONE STUDIO ROUTE --- */}
      {/* <Route 
        path="/studio" 
        element={
          <ProtectedRoute user={user} userData={userData} userDataFetched={userDataFetched}>
            <CanvasWorkspace /> 
          </ProtectedRoute>
        }
      /> */}

      {/* Fallback Route - Simplified (ProtectedRoute handles logic) */}
      <Route 
        path="*" 
        element={<Navigate to="/" replace />}
      />
    </Routes>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppRouter />
    </BrowserRouter>
  </StrictMode>,
)
