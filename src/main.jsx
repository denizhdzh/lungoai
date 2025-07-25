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
import { motion } from 'framer-motion';
import CanvasWorkspace from './pages/CanvasWorkspace.jsx';
import { useCanvasPreload } from './hooks/useCanvasPreload.js';

// --- FORCE DARK MODE ---
document.documentElement.classList.add('dark');
console.log("[main.jsx] Dark mode forced.");
// --- END FORCE DARK MODE ---

// --- ENHANCED NAVIGATION PROTECTION ---
// Protect against all common techniques to disable browser navigation
(function() {
  // Store original functions
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  const originalBack = history.back;
  const originalForward = history.forward;
  const originalGo = history.go;
  const originalSetTimeout = window.setTimeout;
  const originalSetInterval = window.setInterval;
  
  // Track navigation blocking attempts
  let suspiciousActivity = {
    forwardLoops: 0,
    pushStateSpam: 0,
    timeoutHijacks: 0
  };
  
  // Override history.pushState to detect manipulation
  history.pushState = function(state, title, url) {
    if (state === null && title === null && url === window.location.href) {
      suspiciousActivity.pushStateSpam++;
      console.log("[Navigation Protection] Blocked suspicious pushState manipulation #" + suspiciousActivity.pushStateSpam);
      return;
    }
    return originalPushState.apply(this, arguments);
  };
  
  // Override history.forward to detect loops and immediate calls
  let lastForwardCall = 0;
  let forwardCallCount = 0;
  let pageLoadTime = Date.now();
  
  history.forward = function() {
    const now = Date.now();
    
    // Block rapid consecutive calls
    if (now - lastForwardCall < 100) {
      suspiciousActivity.forwardLoops++;
      console.log("[Navigation Protection] Blocked rapid history.forward() loop #" + suspiciousActivity.forwardLoops);
      return;
    }
    
    // Block multiple forward calls within first 2 seconds of page load (common pattern)
    if (now - pageLoadTime < 2000) {
      forwardCallCount++;
      if (forwardCallCount > 1) {
        suspiciousActivity.forwardLoops++;
        console.log("[Navigation Protection] Blocked multiple history.forward() calls during page load #" + suspiciousActivity.forwardLoops);
        return;
      }
    }
    
    // Check if called from a suspicious context (look at call stack)
    const stack = new Error().stack;
    if (stack && (stack.includes('noBack') || stack.includes('preventBack') || stack.includes('disableBack'))) {
      suspiciousActivity.forwardLoops++;
      console.log("[Navigation Protection] Blocked history.forward() from suspicious function");
      return;
    }
    
    lastForwardCall = now;
    console.log("[Navigation Protection] Allowing normal forward navigation");
    return originalForward.apply(this, arguments);
  };
  
  // Override history.back to ensure it works normally
  history.back = function() {
    console.log("[Navigation Protection] Back navigation called normally");
    return originalBack.apply(this, arguments);
  };
  
  // Override history.go to prevent blocking
  history.go = function(delta) {
    if (delta === 1) {
      const now = Date.now();
      if (now - lastForwardCall < 100) {
        console.log("[Navigation Protection] Blocked suspicious history.go(1) call");
        return;
      }
    }
    console.log("[Navigation Protection] Go navigation called with delta:", delta);
    return originalGo.apply(this, arguments);
  };
  
  // Override setTimeout to detect navigation blocking scripts
  window.setTimeout = function(callback, delay) {
    if (typeof callback === 'string') {
      // Check for suspicious setTimeout strings
      if (callback.includes('history.forward') || callback.includes('preventBack') || callback.includes('disableBack')) {
        suspiciousActivity.timeoutHijacks++;
        console.log("[Navigation Protection] Blocked suspicious setTimeout: " + callback);
        return;
      }
    } else if (typeof callback === 'function') {
      // Check function content for navigation blocking
      const funcStr = callback.toString();
      if (funcStr.includes('history.forward') && delay === 0) {
        suspiciousActivity.timeoutHijacks++;
        console.log("[Navigation Protection] Blocked suspicious setTimeout function");
        return;
      }
    }
    return originalSetTimeout.apply(this, arguments);
  };
  
  // Prevent onpopstate hijacking
  let originalOnPopState = window.onpopstate;
  Object.defineProperty(window, 'onpopstate', {
    get: function() {
      return originalOnPopState;
    },
    set: function(value) {
      if (typeof value === 'function') {
        const funcStr = value.toString();
        if (funcStr.includes('history.go(1)') || funcStr.includes('history.forward()')) {
          console.log("[Navigation Protection] Blocked suspicious onpopstate handler");
          return;
        }
      }
      originalOnPopState = value;
    }
  });
  
  // Prevent onbeforeunload from being used for navigation blocking
  let originalOnBeforeUnload = window.onbeforeunload;
  Object.defineProperty(window, 'onbeforeunload', {
    get: function() {
      return originalOnBeforeUnload;
    },
    set: function(value) {
      if (typeof value === 'function') {
        const funcStr = value.toString();
        // Allow legitimate beforeunload handlers but block those used just for navigation blocking
        if (funcStr.length < 100 && (funcStr.includes('sorry') || funcStr.includes('work will be lost'))) {
          console.log("[Navigation Protection] Blocked suspicious onbeforeunload handler");
          return;
        }
      }
      originalOnBeforeUnload = value;
    }
  });
  
  // Override onunload to prevent null assignments
  let originalOnUnload = window.onunload;
  Object.defineProperty(window, 'onunload', {
    get: function() {
      return originalOnUnload;
    },
    set: function(value) {
      if (value === null || (typeof value === 'function' && value.toString().includes('null'))) {
        console.log("[Navigation Protection] Blocked suspicious onunload manipulation");
        return;
      }
      originalOnUnload = value;
    }
  });
  
  // Monitor global function definitions that might be used for navigation blocking
  const originalDefineProperty = Object.defineProperty;
  Object.defineProperty = function(obj, prop, descriptor) {
    if (obj === window && typeof prop === 'string') {
      const suspiciousFunctionNames = ['noBack', 'preventBack', 'disableBack', 'blockBack', 'stopBack'];
      if (suspiciousFunctionNames.includes(prop)) {
        console.log("[Navigation Protection] Blocked suspicious global function definition: " + prop);
        return obj;
      }
    }
    return originalDefineProperty.apply(this, arguments);
  };
  
  // Override window property assignment for suspicious functions
  const originalWindow = window;
  const windowProxy = new Proxy(window, {
    set: function(target, property, value) {
      if (typeof property === 'string' && typeof value === 'function') {
        const suspiciousFunctionNames = ['noBack', 'preventBack', 'disableBack', 'blockBack', 'stopBack'];
        if (suspiciousFunctionNames.includes(property)) {
          console.log("[Navigation Protection] Blocked suspicious global function assignment: " + property);
          return true;
        }
        // Also check function content
        const funcStr = value.toString();
        if (funcStr.includes('history.forward') && funcStr.length < 200) {
          console.log("[Navigation Protection] Blocked suspicious function with history.forward: " + property);
          return true;
        }
      }
      target[property] = value;
      return true;
    }
  });
  
  console.log("[Navigation Protection] Enhanced browser navigation protection enabled");
  
  // Report protection stats every 10 seconds if there's activity
  setInterval(() => {
    const total = suspiciousActivity.forwardLoops + suspiciousActivity.pushStateSpam + suspiciousActivity.timeoutHijacks;
    if (total > 0) {
      console.log("[Navigation Protection] Blocked attempts - Forward loops:", suspiciousActivity.forwardLoops, 
                  "PushState spam:", suspiciousActivity.pushStateSpam, 
                  "Timeout hijacks:", suspiciousActivity.timeoutHijacks);
    }
  }, 10000);
})();
// --- END ENHANCED NAVIGATION PROTECTION ---

// Protected Route Component (Updated to use userData)
function ProtectedRoute({ user, userData, userDataFetched, children }) {

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
  const [logoAnimationComplete, setLogoAnimationComplete] = useState(false); // Track logo animation
  const navigate = useNavigate(); // Initialize navigate hook
  
  // Canvas preload hook
  const { canvasData, preloadForCurrentUser } = useCanvasPreload();

  // Fallback: Force animation complete after 4 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      console.log('[AppRouter] Animation fallback timeout triggered');
      setLogoAnimationComplete(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => { // Make async
      setUser(currentUser);
      setAuthChecked(true);
      setUserDataFetched(false); // Reset fetch status on auth change
      setUserData(null); // Clear previous user data

      if (currentUser) {
          try {
              console.log(`[AppRouter Auth] User ${currentUser.uid} logged in. Fetching Firestore data...`);
              
              // Start canvas preload and user data fetch in parallel
              const [userDocSnap, _] = await Promise.all([
                getDoc(doc(db, "users", currentUser.uid)),
                preloadForCurrentUser() // Preload canvas in background
              ]);
              
              if (userDocSnap.exists()) {
                  setUserData(userDocSnap.data());
                  console.log("[AppRouter Auth] User data fetched:", userDocSnap.data());
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

  // Wait until auth check, user data fetch, AND logo animation are complete before rendering routes
  if (!authChecked || !userDataFetched || !logoAnimationComplete) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-neutral-950 text-white">
        <DotLottieReact
          src="/lottie-logo.json"
          loop={false}
          autoplay
          style={{ width: 120, height: 120 }}
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
        <Route path="studio" element={<CanvasWorkspace preloadedCanvasData={canvasData} />} />
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
