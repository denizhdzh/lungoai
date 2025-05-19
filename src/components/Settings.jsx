import React, { useState, useEffect, useRef } from 'react';
import { auth, db, storage } from '../firebase';
import { collection, query, getDocs, doc, updateDoc, deleteDoc, addDoc, setDoc, serverTimestamp, writeBatch, Timestamp, getDoc, increment, orderBy, onSnapshot } from "@firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from "firebase/storage";
import { updateProfile, signOut, deleteUser } from "firebase/auth";
import { useNavigate, useOutletContext } from 'react-router-dom'; // Import useNavigate & useOutletContext
// Import Firebase Functions
import { getFunctions, httpsCallable } from 'firebase/functions'; 
import { Sun, Moon, X, Plus, PencilSimple, Trash, User, Package, Camera, Image as ImageIcon, TiktokLogo, ClockCounterClockwise, CaretRight, CheckCircle, ImagesSquare, WarningCircle, FilmSlate, UserCircle, ArrowUp, Star, MagnifyingGlass, Sparkle, CircleNotch, SignOut, CreditCard, ArrowSquareOut } from '@phosphor-icons/react';
import PricingSection from './PricingSection'; // Import the PricingSection component

// Initialize Firebase Functions
const functions = getFunctions();
const createStripePortalSession = httpsCallable(functions, 'createStripePortalSession');
const generateImageDescription = httpsCallable(functions, 'generateImageDescription'); // <-- Add reference
const manuallyStandardizeProductVideo = httpsCallable(functions, 'manuallyStandardizeProductVideo'); // <-- ADD THIS
const getTikTokAuthUrl = httpsCallable(functions, 'getTikTokAuthUrl'); // <-- ADD THIS FOR TIKTOK

// --- NEW: Fixed Descriptions for Library Images ---
const libraryImageDescriptions = {
  "Afterglow Desk.png": "A dark room with a view of a lit-up city skyline through the window; calm, solitary atmosphere.",
  "Canal Breather.png": "A cozy wooden table on a balcony or terrace surrounded by trees, with a book and coffee cup.",
  "City Pulse.png": "Aerial view of a city bridge packed with cars, surrounded by tall skyscrapers at sunset.",
  "Fog Curve.png": "A wet, winding road cutting through tall pine trees; moody and quiet.",
  "Green Spine.png": "A narrow dirt trail winding along a lush green ridge, high above the surrounding forest.",
  "Late Hours.png": "A dimly lit room with someone working intensely in front of a glowing computer screen.",
  "Quiet Cosmos.png": "A serene night sky filled with stars, silhouetted by the tips of trees on the horizon.",
  "Quiet Stack.png": "A warmly lit, classic library filled with bookshelves and wooden furniture.",
  "Sky Office.png": "A clean, modern desk setup by a window overlooking the ocean and green landscape.",
  "Spark.png": "A glowing bonfire with sparks flying upward, set against a black background.",
  "Still Spin.png": "A record player sitting in a sun-drenched corner, casting soft shadows.",
  "Stone Alley.png": "A narrow, cobblestone street in a quiet European town, with warm light and one person walking.",
  "Tether Drift.png": "A top-down view of a person in a yellow kayak on calm, greenish water.",
  "Window & Words.png": "A person working on a laptop inside a cafe with large windows looking out onto a city street."
};
// --- END NEW ---

function Settings() {
  const user = auth.currentUser;
  const navigate = useNavigate(); // Initialize navigate
  const { refreshLayoutData } = useOutletContext(); // <-- GET THE REFRESH FUNCTION
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState('user');
  const [isLoading, setIsLoading] = useState(false);
  
  // User settings states
  const [firstName, setFirstName] = useState(''); // New state for first name
  const [lastName, setLastName] = useState('');   // New state for last name
  const [photoURL, setPhotoURL] = useState('');     // Initialize photoURL state properly
  const [photoFile, setPhotoFile] = useState(null);
  const [previewURL, setPreviewURL] = useState(null); // New state for image preview
  
  // Products state
  const [products, setProducts] = useState([]);
  // Rename states for the product form to be generic
  const [productNameForForm, setProductNameForForm] = useState('');
  const [productDescriptionForForm, setProductDescriptionForForm] = useState('');
  const [productLogoFileForForm, setProductLogoFileForForm] = useState(null);
  const [productMediaFileForForm, setProductMediaFileForForm] = useState(null);
  const [showAddProductForm, setShowAddProductForm] = useState(false);
  const productLogoInputRef = useRef(null);
  const productMediaInputRef = useRef(null);
  
  // State for Product Editing
  const [editingProduct, setEditingProduct] = useState(null); // Stores the product object being edited
  // No separate modal for edit, we reuse the add form
  // States to hold current URLs when editing, to display them and help with update logic
  const [currentLogoUrlInForm, setCurrentLogoUrlInForm] = useState(null);
  const [currentMediaUrlInForm, setCurrentMediaUrlInForm] = useState(null);
  const [currentMediaTypeInForm, setCurrentMediaTypeInForm] = useState('image'); // To render video or image for current media
  
  // TikTok accounts state
  const [tiktokAccounts, setTiktokAccounts] = useState([]);
  const [isLoadingTikTok, setIsLoadingTikTok] = useState(false); // NEW For loading TikTok operations
  
  // UGC Creators state
  const [creators, setCreators] = useState([]);
  const [newCreatorName, setNewCreatorName] = useState('');
  const [newCreatorFile, setNewCreatorFile] = useState(null);
  const [showAddCreatorForm, setShowAddCreatorForm] = useState(false);
  const creatorFileInputRef = useRef(null);
  
  // Background images state
  const [backgrounds, setBackgrounds] = useState([]); // User's added backgrounds
  const [newBackgroundName, setNewBackgroundName] = useState(''); // For custom upload
  const [newBackgroundFile, setNewBackgroundFile] = useState(null); // For custom upload
  const [showAddBackgroundForm, setShowAddBackgroundForm] = useState(false); // For custom upload form
  const backgroundFileInputRef = useRef(null); // For custom upload

  // NEW: Library Backgrounds State
  const [showLibrary, setShowLibrary] = useState(false); // Toggle library view
  const [libraryImages, setLibraryImages] = useState([]); // Array of { url: string, name: string }
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [selectedLibraryImages, setSelectedLibraryImages] = useState([]); // Array of URLs
  const [userBackgroundUrls, setUserBackgroundUrls] = useState(new Set()); // Set of URLs user already has
  
  // Future requests state - Kept for now, might be removed if featureRequests handles it fully
  const [requests, setRequests] = useState([]);
  const [newRequest, setNewRequest] = useState({ title: '', description: '', priority: 'medium' });

  // NEW: Confirmation Modals State (Combined & Specific)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false); // For Backgrounds & Creators
  const [itemToDelete, setItemToDelete] = useState(null); // { id, imageUrl, isFromLibrary, name, type: 'background' | 'creator' }
  const [showDeleteProductConfirmModal, setShowDeleteProductConfirmModal] = useState(false); // For Products
  const [productToDelete, setProductToDelete] = useState(null); // { id, logoUrl, mediaUrl, name }
  const [showDeleteAccountConfirmModal, setShowDeleteAccountConfirmModal] = useState(false); // For Account Deletion

  // Feature Requests State
  const [featureRequests, setFeatureRequests] = useState([]);
  const [userUpvotedFeatures, setUserUpvotedFeatures] = useState(new Set()); // Set of feature titles/keys user has upvoted
  const [votingCooldown, setVotingCooldown] = useState({}); // Key: featureTitle, Value: boolean (true if on cooldown)
  const [isFetchingRequests, setIsFetchingRequests] = useState(false);

  // NEW: State for submitting new feature requests by the user
  const [newFeatureRequestText, setNewFeatureRequestText] = useState('');
  const [userPrivateRequests, setUserPrivateRequests] = useState([]);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  // NEW: State for custom toast notifications
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const toastTimeoutRef = useRef(null); // To manage auto-hide timeout

  // NEW: User Subscription State
  const [userSubscription, setUserSubscription] = useState(null); // { stripeCustomerId, stripePriceId, subscriptionStatus, ... }
  const [isFetchingSubscription, setIsFetchingSubscription] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false); // Loading state for portal button
  const [portalError, setPortalError] = useState(null); // Error state for portal button

  // Tab configuration - Added Plan & Billing, updated icons
  const tabs = [
    { id: 'user', label: 'User Profile', icon: <User size={18} /> },
    { id: 'plan', label: 'Plan & Billing', icon: <CreditCard size={18} /> }, // New Plan tab
    { id: 'products', label: 'Products', icon: <Package size={18} /> },
    { id: 'tiktok', label: 'TikTok Accounts', icon: <TiktokLogo size={18} /> },
    { id: 'creators', label: 'UGC Creators', icon: <Camera size={18} /> },
    { id: 'backgrounds', label: 'Background Images', icon: <ImagesSquare size={18} /> },
    { id: 'featureRequests', label: 'Feature Requests', icon: <Sparkle size={18} /> }, // Changed icon
  ];

  // Dark mode effect
  useEffect(() => {
    // Default to light mode unless explicitly set to dark in localStorage
    const savedMode = localStorage.getItem('darkMode') === 'true';
    setIsDarkMode(savedMode); 
    
    if (savedMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode(prevMode => {
      const newMode = !prevMode;
      localStorage.setItem('darkMode', newMode);
      if (newMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return newMode;
    });
  };

  // --- NEW: Generic Firestore Data Fetcher ---
  const fetchUserData = async (collectionName, setData, orderByField = null, orderByDirection = 'desc') => {
    if (!user) {
      setData([]); // Clear data if no user
      return () => {}; // Return a no-op unsubscribe function
    }
    
    console.log(`[fetchUserData] Fetching ${collectionName} for user ${user.uid}`); // Added logger
    let q = query(collection(db, 'users', user.uid, collectionName));
    if (orderByField) {
      q = query(q, orderBy(orderByField, orderByDirection));
    }

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const items = [];
      querySnapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() });
      });
      setData(items);
      console.log(`[fetchUserData] Fetched ${items.length} items for ${collectionName}`); // Added logger
    }, (error) => {
      console.error(`Error fetching ${collectionName} data: `, error);
      showCustomToast(`Error fetching ${collectionName}: ${error.message}`, 'error');
      setData([]); // Clear data on error
    });
    return unsubscribe; // Return the unsubscribe function for cleanup
  };
  // --- END NEW: Generic Firestore Data Fetcher ---

  // --- NEW: Define Fetch User Subscription Data Function --- 
  const fetchSubscriptionData = async () => {
      if (!user) return;
      setIsFetchingSubscription(true);
      try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
              const data = userDocSnap.data();
              // Store relevant fields needed for pricing display and portal link
              setUserSubscription({
                  stripeCustomerId: data.stripeCustomerId || null,
                  stripePriceId: data.stripePriceId || null,
                  subscriptionStatus: data.subscriptionStatus || null,
                  // Add other fields if needed later
              });
          } else {
              console.log("User document not found, cannot fetch subscription data.");
              setUserSubscription(null); // Explicitly set to null if doc doesn't exist
          }
      } catch (error) {
          console.error("Error fetching user subscription data:", error);
          setUserSubscription(null); // Set to null on error
          // Optionally set an error state to display to the user
      } finally {
           setIsFetchingSubscription(false);
      }
  };
  // --- End Define Fetch User Subscription Data Function ---

  // NEW: Fetch subscription data once on mount or user change
  useEffect(() => {
      fetchSubscriptionData(); // Fetch subscription data once when component mounts
  }, [user]); // Re-fetch if user changes

  // Fetch data based on active tab
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      // Reset library state when tab changes
      setShowLibrary(false);
      setLibraryImages([]);
      setSelectedLibraryImages([]);
      // NEW: Reset TikTok form when tab changes or data is fetched
      // setShowAddTiktokAccountForm(false); // REMOVED
      // setNewTiktokAccount({ username: '' }); // REMOVED
      try {
        if (user) {
          if (activeTab === 'products') {
            await fetchUserData('products', setProducts, "createdAt", "desc");
          } else if (activeTab === 'tiktok') {
            // TikTok uses its own listener setup in another useEffect
            // await fetchTikTokAccounts(); // This is handled by its own useEffect
          } else if (activeTab === 'creators') {
            await fetchUserData('creators', setCreators, "createdAt", "desc");
          } else if (activeTab === 'backgrounds') {
            await fetchUserData('backgrounds', (data) => {
              setBackgrounds(data);
              setUserBackgroundUrls(new Set(data.map(bg => bg.imageUrl)));
            }, "createdAt", "desc");
          } else if (activeTab === 'featureRequests') {
            // No initial fetch needed here as it's handled by fetchFeatureRequests
          } else if (activeTab === 'plan') {
            await fetchSubscriptionData(); // Fetch subscription data when plan tab is active
          }
          // User tab data is fetched in its own useEffect
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        showCustomToast(`Error fetching ${activeTab} data: ${error.message}`, "error");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [activeTab, user]); // Removed fetchUserData from dependencies as it's stable

  // --- NEW: Fetch TikTok Accounts ---
  const fetchTikTokAccounts = async () => {
    if (!user) {
      setTiktokAccounts([]);
      return;
    }
    setIsLoadingTikTok(true);
    try {
      const q = query(collection(db, 'users', user.uid, 'tiktokAccounts'), orderBy("retrieved_at", "desc"));
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const accounts = [];
        querySnapshot.forEach((doc) => {
          accounts.push({ id: doc.id, ...doc.data() });
        });
        setTiktokAccounts(accounts);
        setIsLoadingTikTok(false);
      }, (error) => {
        console.error("Error fetching TikTok accounts: ", error);
        showCustomToast("Error fetching TikTok accounts.", "error");
        setTiktokAccounts([]);
        setIsLoadingTikTok(false);
      });
      return unsubscribe; // Return the unsubscribe function to be called on cleanup
    } catch (error) {
      console.error("Error setting up TikTok accounts listener: ", error);
      showCustomToast("Error setting up TikTok accounts listener.", "error");
      setTiktokAccounts([]);
      setIsLoadingTikTok(false);
    }
  };
  
  // Effect for fetching TikTok accounts when the tab is active or user changes
  // This ensures the listener is active when needed and cleaned up otherwise
  useEffect(() => {
    let unsubscribe = () => {};
    if (user && activeTab === 'tiktok') {
      const setupListener = async () => {
        unsubscribe = await fetchTikTokAccounts();
      };
      setupListener();
    }
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [user, activeTab]);

  // Fetch Feature Requests and User Votes
  const fetchFeatureRequests = async () => {
    if (!user) return;
    setIsFetchingRequests(true);
    try {
      // 1. Fetch the public feature requests document
      const requestsDocRef = doc(db, 'system', 'feature-requests');
      const requestsDocSnap = await getDoc(requestsDocRef);

      let featuresData = [];
      if (requestsDocSnap.exists()) {
        const data = requestsDocSnap.data();
        featuresData = Object.entries(data).map(([key, value]) => ({
          id: key, 
          title: key, 
          votes: value?.vote || 0 
        }));
      } else {
        console.log("No public feature requests document found!");
      }

      // 2. Fetch user's upvoted features (for public requests)
      const userVotesQuery = query(collection(db, 'users', user.uid, 'upvotedFeatures'));
      const userVotesSnap = await getDocs(userVotesQuery);
      const upvotedIds = new Set(userVotesSnap.docs.map(doc => doc.id));
      // setUserUpvotedFeatures(upvotedIds); // This state is still for public ones

      const combinedFeatures = featuresData.map(feature => ({
        ...feature,
        userUpvoted: upvotedIds.has(feature.id)
      })); 
      // SORT BY USER UPVOTED STATUS FIRST
      setFeatureRequests(combinedFeatures.sort((a, b) => (b.userUpvoted ? 1 : 0) - (a.userUpvoted ? 1 : 0)));
      // setFeatureRequests(combinedFeatures); // Set without sorting by votes

      // 3. Fetch user's own private feature requests
      const privateRequestsCollectionRef = collection(db, 'users', user.uid, 'featureRequests');
      const privateRequestsQuery = query(privateRequestsCollectionRef, orderBy('createdAt', 'desc'));
      const privateRequestsSnapshot = await getDocs(privateRequestsQuery);
      const fetchedPrivateRequests = privateRequestsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // No voting mechanism for private requests for now, but can be added
      }));
      setUserPrivateRequests(fetchedPrivateRequests);
      console.log("Fetched User Private Requests:", fetchedPrivateRequests);

    } catch (error) {
      console.error("Error fetching feature requests (public or private):", error);
    } finally {
      setIsFetchingRequests(false);
    }
  };

  // --- Handle Voting --- 
  const handleVote = async (featureId, currentVotes, isCurrentlyUpvoted) => {
    if (!user || votingCooldown[featureId]) return; // Check cooldown

    // Set cooldown for this feature
    setVotingCooldown(prev => ({ ...prev, [featureId]: true }));

    const featureDocRef = doc(db, 'system', 'feature-requests');
    const userVoteRef = doc(db, 'users', user.uid, 'upvotedFeatures', featureId);
    const change = isCurrentlyUpvoted ? -1 : 1;

    try {
      // 1. Update System Votes (using dot notation for map field)
      await updateDoc(featureDocRef, {
          [`${featureId}.vote`]: increment(change)
      });

      // 2. Update User's Vote Record
      if (isCurrentlyUpvoted) {
        await deleteDoc(userVoteRef);
      } else {
        await setDoc(userVoteRef, { votedAt: serverTimestamp() });
      }

      // 3. Update Local State Immediately
      setFeatureRequests(prev => 
        prev.map(f => 
          f.id === featureId ? { ...f, votes: f.votes + change, userUpvoted: !isCurrentlyUpvoted } : f
        )
        // RE-SORT AFTER VOTE BY USER UPVOTED STATUS
        .sort((a, b) => (b.userUpvoted ? 1 : 0) - (a.userUpvoted ? 1 : 0)) 
      );
      setUserUpvotedFeatures(prev => {
        const newSet = new Set(prev);
        if (isCurrentlyUpvoted) {
          newSet.delete(featureId);
        } else {
          newSet.add(featureId);
        }
        return newSet;
      });

      // Clear cooldown after 2 seconds
      setTimeout(() => {
        setVotingCooldown(prev => ({ ...prev, [featureId]: false }));
      }, 2000);

    } catch (error) {
      console.error("Error processing vote:", error);
      alert(`Failed to process vote: ${error.message}`);
      // Reset cooldown on error
      setVotingCooldown(prev => ({ ...prev, [featureId]: false }));
    }
  };

  // Generic file upload function
  const uploadFile = async (file, path, desiredFileName = null) => {
    if (!file) return null;
    
    let finalFileName;

    if (desiredFileName) {
      // If a desiredFileName is provided, use it directly.
      // This is crucial for product videos which expect a specific name like 'original_video.ext'
      finalFileName = desiredFileName;
    } else {
      // Fallback to generated name if desiredFileName is not provided
      // This can be used for logos, creator images, general backgrounds, etc.
      const originalFileExtension = file.name.split('.').pop().toLowerCase();
      let extension;
      if (file.type.startsWith('video/')) {
        extension = ['mp4', 'mov', 'avi', 'wmv', 'flv', 'webm'].includes(originalFileExtension) ? originalFileExtension : 'mp4';
        finalFileName = `generic_video_${Date.now()}.${extension}`;
      } else if (file.type.startsWith('image/')) {
        extension = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(originalFileExtension) ? originalFileExtension : 'png';
        finalFileName = `generic_image_${Date.now()}.${extension}`;
      } else {
        extension = originalFileExtension || 'bin'; // Fallback extension
        finalFileName = `generic_file_${Date.now()}.${extension}`;
      }
    }
    
    const fileRef = ref(storage, `${path}/${finalFileName}`); 

    console.log(`[uploadFile] Attempting to upload to: ${fileRef.fullPath}`);
    try {
      console.log(`[uploadFile] Calling uploadBytes for: ${finalFileName}...`); 
      const snapshot = await uploadBytes(fileRef, file);
      console.log(`[uploadFile] uploadBytes SUCCESS for: ${finalFileName}`, snapshot); 
      
      console.log(`[uploadFile] Calling getDownloadURL for: ${finalFileName}...`); 
      const downloadURL = await getDownloadURL(fileRef);
      console.log(`[uploadFile] getDownloadURL SUCCESS for: ${finalFileName}`, downloadURL); 
      return downloadURL;
    } catch (error) {
      console.error(`[uploadFile] Error during upload/getURL for ${finalFileName} at ${path}:`, error.code, error.message, error); 
      alert(`Upload failed for ${finalFileName}. Check console for details. Error: ${error.message}`); 
      return null; // Return null on error
    }
  };

  // --- Update User Profile ---
  const updateUserProfile = async (e) => {
    e.preventDefault();
    if (!user) return;
    
    setIsLoading(true);
    let newFirebasePhotoURL = photoURL; // Keep track of the URL that will be stored in Firestore/Auth

    try {
      if (photoFile) {
        const uploadedUrl = await uploadFile(photoFile, `users/${user.uid}/profileImages`); 
        if (!uploadedUrl) {
             throw new Error("Profile photo upload failed.");
        }
        newFirebasePhotoURL = uploadedUrl; // This is the new URL from Firebase Storage
      }
      
      const combinedDisplayName = `${firstName} ${lastName}`.trim();

      await updateProfile(user, {
        displayName: combinedDisplayName, 
        photoURL: newFirebasePhotoURL, // Use the definitive new URL for Auth
      });
      
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        firstName: firstName, 
        lastName: lastName,   
        photoURL: newFirebasePhotoURL, // Use the definitive new URL for Firestore
        displayName: combinedDisplayName, 
      });
      
      setPhotoURL(newFirebasePhotoURL); // Update main photoURL state with the new Firebase URL
      setPhotoFile(null);          // Clear the selected file
      setPreviewURL(null);         // Clear the preview URL
      alert('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      alert(`Failed to update profile: ${error.message}. Please try again.`);
      // On error, if a preview was showing for a new file, we might want to clear it
      // or leave it, depending on desired UX. For now, preview remains if upload fails.
    } finally {
      setIsLoading(false);
    }
  };

  // --- Handle Logout ---
  const handleLogout = async () => {
    setIsLoading(true); // Indicate loading
    try {
      await signOut(auth);
      console.log("User signed out successfully");
      // Redirect to login page or home page after logout
      navigate('/login'); // Or '/' depending on your routes
    } catch (error) {
      console.error("Error signing out: ", error);
      alert(`Failed to sign out: ${error.message}`);
      setIsLoading(false); // Stop loading on error
    }
    // No need to set isLoading to false if navigation happens
  };

  // --- Handle Delete Account --- (Shows confirmation modal)
  const handleDeleteAccountClick = () => {
    setShowDeleteAccountConfirmModal(true);
  };

  // --- Confirm Account Deletion --- (Actual deletion logic)
  const confirmDeleteAccount = async () => {
    if (!user) return;
    
    setShowDeleteAccountConfirmModal(false); // Close modal first
    setIsLoading(true);
    
    try {
      // IMPORTANT: Firebase requires recent sign-in for sensitive operations like deletion.
      // You might need to implement re-authentication here if the user hasn't signed in recently.
      // For simplicity, we'll proceed, but add a console warning.
      console.warn("Attempting account deletion. If this fails, it might be due to requiring recent authentication.");
      
      // TODO: Optionally delete associated Firestore data (products, creators, etc.) and Storage files here.
      // This requires careful planning and potentially a Cloud Function for atomicity.
      // Example (Conceptual - NEEDS proper implementation):
      // const deleteUserDataFunction = httpsCallable(functions, 'deleteUserData');
      // await deleteUserDataFunction(); 

      await deleteUser(user);
      console.log("User account deleted successfully.");
      alert("Your account has been permanently deleted.");
      navigate('/login'); // Redirect after deletion

    } catch (error) {
      console.error("Error deleting account:", error);
      // Handle specific errors like 'auth/requires-recent-login'
      if (error.code === 'auth/requires-recent-login') {
        alert("For security reasons, please sign out and sign back in before deleting your account.");
      } else {
        alert(`Failed to delete account: ${error.message}. Please try again or contact support.`);
      }
      setIsLoading(false); // Ensure loading stops on error
    }
  };

  // --- Add Product ---
  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!user) return; 

    // NEW CHECK: Prevent adding more than one product
    if (products.length >= 1 && !editingProduct) { // Check only if NOT editing
      alert('You can only add one product for now. To add a different one, please delete the existing product first.');
      setShowAddProductForm(false); // Close the form if it was open
      return;
    }

    if (!productNameForForm.trim()) {
      alert('Product name is required.');
      return;
    }
    // --- DESCRIPTION CHECK ---
    const trimmedDescription = productDescriptionForForm.trim();
    if (!trimmedDescription) {
      alert('Product description is required.');
      return;
    }
    if (trimmedDescription.length < 50) { // <-- CHANGED FROM 150 to 50
      alert(`Product description must be at least 50 characters long (currently ${trimmedDescription.length}).`); // Alert message will be updated manually by user if needed
      return;
    }
    // --- END DESCRIPTION CHECK ---
    
    // --- MANDATORY FILE CHECKS (for new product) ---
    if (!editingProduct) { // Only enforce if adding new
        if (!productLogoFileForForm) {
            alert('Product logo is required.');
            return;
        }
        if (!productMediaFileForForm) {
            alert('Product image or video is required.');
            return;
        }
    }
    // --------------------------
    
    setIsLoading(true);
    console.log('[handleSubmitProduct] Starting...'); // Log start
    
    if (editingProduct) {
      await handleUpdateProductLogic(productNameForForm, trimmedDescription);
    } else {
      await handleAddProductLogic(productNameForForm, trimmedDescription);
    }
    
    setIsLoading(false);
  };

  // --- NEW: Reset Product Form ---
  const resetProductForm = () => {
    setProductNameForForm('');
    setProductDescriptionForForm('');
    setProductLogoFileForForm(null);
    setProductMediaFileForForm(null);
    setCurrentLogoUrlInForm(null);
    setCurrentMediaUrlInForm(null);
    setCurrentMediaTypeInForm('image');
    setEditingProduct(null);
    setShowAddProductForm(false);
    if (productLogoInputRef.current) productLogoInputRef.current.value = "";
    if (productMediaInputRef.current) productMediaInputRef.current.value = "";
  };

  // --- NEW: Handle Edit Product Click ---
  const handleEditProductClick = (product) => {
    setEditingProduct(product);
    setProductNameForForm(product.name);
    setProductDescriptionForForm(product.description);
    // Files are not set here, user must select new ones if they want to change
    setProductLogoFileForForm(null); 
    setProductMediaFileForForm(null);
    setCurrentLogoUrlInForm(product.logoUrl);
    setCurrentMediaUrlInForm(product.mediaUrl);
    setCurrentMediaTypeInForm(product.mediaType || 'image'); // Ensure mediaType is set
    setShowAddProductForm(true); // Show the form for editing
  };
  
  // --- NEW: Add Product Logic (Refactored) ---
  const handleAddProductLogic = async (name, description) => {
    if (!user) {
      showCustomToast('You must be logged in to add products.', 'error');
      return;
    }
    if (!name.trim() || !description.trim()) {
      showCustomToast('Product name and description are required.', 'error');
      return;
    }
    if (description.trim().length < 50) {
        showCustomToast('Product description must be at least 50 characters.', 'error');
        return;
    }

    setIsLoading(true);
    showCustomToast('Adding product...', 'info');

    let logoUrl = null;
    let mediaUrl = null;
    let mediaType = null;
    let standardizationError = null;
    const newProductId = doc(collection(db, 'users', user.uid, 'products')).id; // Generate new product ID

    try {
      if (productLogoFileForForm) {
        const logoExtension = productLogoFileForForm.name.split('.').pop();
        logoUrl = await uploadFile(productLogoFileForForm, `users/${user.uid}/products/${newProductId}/logo`, `product_logo_${newProductId}.${logoExtension}`);
      }
      if (productMediaFileForForm) {
        const mediaExtension = productMediaFileForForm.name.split('.').pop();
        mediaUrl = await uploadFile(productMediaFileForForm, `users/${user.uid}/products/${newProductId}/media`, `original_video.${mediaExtension}`);
        mediaType = productMediaFileForForm.type.startsWith('video/') ? 'video' : 'image';

        if (mediaType === 'video' && mediaUrl) { // ADDED CHECK FOR mediaUrl
          const storagePath = `users/${user.uid}/products/${newProductId}/media/original_video.${mediaExtension}`; 
          console.log(`[Add Product] Video uploaded, calling manuallyStandardizeProductVideo for product ${newProductId}, path: ${storagePath}`);
          // DO NOT AWAIT HERE - Let it run in the background
          manuallyStandardizeProductVideo({
            userId: user.uid,
            productId: newProductId,
            originalVideoPathInStorage: storagePath, // Ensure this uses storagePath
            originalFileExtension: mediaExtension
          }).then(result => {
            console.log('[Add Product] manuallyStandardizeProductVideo call INITIATED (background).', result);
          }).catch(error => {
            console.error('[Add Product] Error INITIATING manuallyStandardizeProductVideo (background):', error);
            // Optionally, update Firestore with this initial error, though the function itself also logs errors
            // For now, the main product data is saved, and the function will try to update with its own status/error.
            standardizationError = error.message; // Capture error for initial doc write if needed
            showCustomToast(`Error starting video standardization: ${error.message}`, 'error');
          });
        }
      }
      
      const productData = {
        id: newProductId, // Store the auto-generated ID
        name: name,
        description: description,
        logoUrl: logoUrl, 
        mediaUrl: mediaUrl, 
        mediaType: mediaType,
        createdAt: serverTimestamp(), 
        userId: user.uid,
        isVideoStandardized: false, // Initially false
        standardizedVideoUrl: null, // Initially null
        ...(mediaType === 'video' && standardizationError && { standardizationError: standardizationError }), // Add error if present
        ...(mediaType === 'video' && !standardizationError && { standardizationAttemptTimestamp: serverTimestamp() }) // Add attempt timestamp if no immediate call error
      };
      
      console.log("[handleAddProductLogic] Product data to be saved:", JSON.stringify(productData, null, 2));
      
      await setDoc(doc(db, 'users', user.uid, 'products', newProductId), productData);
      
      setProducts(prev => [{ ...productData, createdAt: new Date() }, ...prev].sort((a, b) => b.createdAt - a.createdAt));
      showCustomToast('Product added successfully!', 'success');
      resetProductForm();
      setShowAddProductForm(false);
      refreshLayoutData(); 
    } catch (error) {
      console.error("Error adding product:", error);
      showCustomToast(`Failed to add product: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // --- NEW: Update Product Logic ---
  const handleUpdateProductLogic = async (name, description) => {
    if (!user || !editingProduct) {
      showCustomToast('No product selected for update or user not logged in.', 'error');
      return;
    }
    if (!name.trim() || !description.trim()) {
      showCustomToast('Product name and description are required.', 'error');
      return;
    }
    if (description.trim().length < 50) {
        showCustomToast('Product description must be at least 50 characters.', 'error');
        return;
    }

    setIsLoading(true);
    showCustomToast('Updating product...', 'info');

    const productRef = doc(db, 'users', user.uid, 'products', editingProduct.id);
    const updatedData = {
        name: name,
        description: description,
      updatedAt: serverTimestamp()
    };

    let newLogoUrl = editingProduct.logoUrl; // Keep old if not changed
    let newMediaUrl = editingProduct.mediaUrl; // Keep old if not changed
    let newMediaType = editingProduct.mediaType;
    let standardizationError = null;

    try {
      // Handle logo update
      if (productLogoFileForForm) {
        // If there was an old logo, delete it
        if (editingProduct.logoUrl) {
        try {
          const oldLogoRef = ref(storage, editingProduct.logoUrl);
          await deleteObject(oldLogoRef);
        } catch (deleteError) {
            console.warn("Old logo deletion failed (might not exist or protected):", deleteError);
          }
        }
        const logoExtension = productLogoFileForForm.name.split('.').pop();
        newLogoUrl = await uploadFile(productLogoFileForForm, `users/${user.uid}/products/${editingProduct.id}/logo`, `product_logo_${editingProduct.id}.${logoExtension}`);
        updatedData.logoUrl = newLogoUrl;
      }

      // Handle media update
      if (productMediaFileForForm) {
        // If there was old media, delete it
        if (editingProduct.mediaUrl) {
        try {
          const oldMediaRef = ref(storage, editingProduct.mediaUrl);
          await deleteObject(oldMediaRef);
        } catch (deleteError) {
            console.warn("Old media deletion failed (might not exist or protected):", deleteError);
          }
          // If the old media was a standardized video, attempt to delete that too
          if (editingProduct.mediaType === 'video' && editingProduct.standardizedVideoUrl) {
              try {
                  // Construct the storage path for the standardized video
                  // This assumes a fixed naming convention; adjust if your standardized video path is stored differently or derived
                  const oldStandardizedPath = `users/${user.uid}/products/${editingProduct.id}/standardized_video.mp4`;
                  const oldStandardizedRef = ref(storage, oldStandardizedPath);
                  await deleteObject(oldStandardizedRef);
                  console.log(`[Update Product] Deleted old standardized video: ${oldStandardizedPath}`);
                  updatedData.standardizedVideoUrl = null; // Clear old standardized URL
                  updatedData.isVideoStandardized = false; // Reset status
              } catch (deleteStdError) {
                  console.warn("Old standardized video deletion failed:", deleteStdError);
              }
          }
        }
        const mediaExtension = productMediaFileForForm.name.split('.').pop();
        // Upload the new file and get its download URL
        newMediaUrl = await uploadFile(productMediaFileForForm, `users/${user.uid}/products/${editingProduct.id}/media`, `original_video.${mediaExtension}`);
        newMediaType = productMediaFileForForm.type.startsWith('video/') ? 'video' : 'image';
        updatedData.mediaUrl = newMediaUrl;
        updatedData.mediaType = newMediaType;
        updatedData.isVideoStandardized = false; // Reset standardization status for new video
        updatedData.standardizationError = null; // Clear any previous errors
        updatedData.standardizationAttemptTimestamp = null; // Clear any previous attempt timestamp

        if (newMediaType === 'video' && newMediaUrl) { // ADDED CHECK FOR newMediaUrl
          const storagePath = `users/${user.uid}/products/${editingProduct.id}/media/original_video.${mediaExtension}`; 
          console.log(`[Update Product] New video uploaded, calling manuallyStandardizeProductVideo for product ${editingProduct.id}, path: ${storagePath}`);
          // DO NOT AWAIT HERE - Let it run in the background
          manuallyStandardizeProductVideo({
            userId: user.uid,
            productId: editingProduct.id,
            originalVideoPathInStorage: storagePath, // Ensure this uses storagePath
            originalFileExtension: mediaExtension
          }).then(result => {
            console.log('[Update Product] manuallyStandardizeProductVideo call INITIATED (background).', result);
          }).catch(error => {
            console.error('[Update Product] Error INITIATING manuallyStandardizeProductVideo (background):', error);
            standardizationError = error.message; // Capture error for initial doc write if needed
            showCustomToast(`Error starting video standardization: ${error.message}`, 'error');
          });
        }
      }
      
      if (newMediaType === 'video' && standardizationError) {
          updatedData.standardizationError = standardizationError;
      } else if (newMediaType === 'video' && !standardizationError && productMediaFileForForm) { // only add attempt timestamp if new video was uploaded and no immediate call error
          updatedData.standardizationAttemptTimestamp = serverTimestamp();
      }


      await updateDoc(productRef, updatedData);
      setProducts(prevProducts => prevProducts.map(p => p.id === editingProduct.id ? { ...p, ...updatedData, logoUrl: newLogoUrl, mediaUrl: newMediaUrl, mediaType: newMediaType } : p).sort((a,b) => b.createdAt - a.createdAt));
      showCustomToast('Product updated successfully!', 'success');
      resetProductForm();
      setShowAddProductForm(false);
      setEditingProduct(null); // Exit editing mode
      refreshLayoutData();
    } catch (error) {
      console.error("Error updating product:", error);
      showCustomToast(`Failed to update product: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // --- Delete Product (Modified: Show modal instead of window.confirm) ---
  const handleDeleteProduct = (productId, productLogoUrl, productMediaUrl, productName) => { // Accept name
    if (!user) return;
    // Set product details and show modal
    setProductToDelete({ 
      id: productId, 
      logoUrl: productLogoUrl, 
      mediaUrl: productMediaUrl, 
      name: productName 
    });
    setShowDeleteProductConfirmModal(true);
  };

  // --- NEW: Confirm Product Deletion (Called from Modal) ---
  const confirmProductDeletion = async () => {
    if (!user || !productToDelete) return;

    const { id, logoUrl, mediaUrl } = productToDelete;
    setShowDeleteProductConfirmModal(false); // Close modal first
    setIsLoading(true);

    try {
      // Delete Firestore document
      await deleteDoc(doc(db, 'users', user.uid, 'products', id));

      // Try deleting LOGO from Storage
      if (logoUrl && logoUrl.includes('firebasestorage.googleapis.com')) {
        try {
          const logoRef = ref(storage, logoUrl);
          await deleteObject(logoRef);
          console.log(`Deleted product logo from Storage: ${logoUrl}`);
        } catch (storageError) {
          console.warn(`Could not delete product logo from Storage (${logoUrl}):`, storageError);
        }
      }
      
      // Try deleting MEDIA from Storage
      if (mediaUrl && mediaUrl.includes('firebasestorage.googleapis.com')) {
        try {
          const mediaRef = ref(storage, mediaUrl);
          await deleteObject(mediaRef);
          console.log(`Deleted product media from Storage: ${mediaUrl}`);
        } catch (storageError) {
          console.warn(`Could not delete product media from Storage (${mediaUrl}):`, storageError);
        }
      }
      
      // Update local state
      setProducts(prev => prev.filter(p => p.id !== id));
      showCustomToast('Product deleted successfully!', 'success');
      if (refreshLayoutData) refreshLayoutData(); // <-- CALL REFRESH

    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Failed to delete product. Please try again.');
    } finally {
      setIsLoading(false);
      setProductToDelete(null); // Clear item after operation
    }
  };

  // --- Add Creator ---
  const handleAddCreator = async (e) => {
    e.preventDefault();
    if (!user) return; 
    if (!newCreatorName.trim()) {
      alert('Creator name is required.');
      return;
    }
    if (!newCreatorFile) {
        alert('Creator image is required.');
        return;
    }
    
    setIsLoading(true);
    try {
      let imageUrl = '';
      imageUrl = await uploadFile(newCreatorFile, `users/${user.uid}/creators/images`);
      if (!imageUrl) throw new Error('Creator image upload failed'); 

      const creatorData = {
        name: newCreatorName,
        imageUrl: imageUrl,
        createdAt: serverTimestamp(),
      };
      
      const docRef = await addDoc(collection(db, 'users', user.uid, 'creators'), creatorData);
      
      setCreators(prev => [...prev, { id: docRef.id, ...creatorData }]);
      
      // Reset form
      setNewCreatorName('');
      setNewCreatorFile(null);
      if (creatorFileInputRef.current) creatorFileInputRef.current.value = ""; 
      setShowAddCreatorForm(false); 
      showCustomToast('Creator added successfully!', 'success');
      if (refreshLayoutData) refreshLayoutData(); // <-- CALL REFRESH
      
    } catch (error) {
      console.error('Error adding creator:', error);
      alert(`Failed to add creator: ${error.message}. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Delete Creator (Modified: Use shared modal) ---
  const handleDeleteCreator = (creatorId, creatorImageUrl, creatorName) => {
    if (!user) return;
    
    // Set item details for the shared modal
    setItemToDelete({ 
        id: creatorId, 
        imageUrl: creatorImageUrl, 
        isFromLibrary: false, // Creators are never from library
        name: creatorName,
        type: 'creator' // Specify type
    });
    setShowDeleteConfirmModal(true); // Show the shared modal
  };

  // Render content based on active tab
  const renderTabContent = () => {
    switch(activeTab) {
      case 'user':
        return renderUserTab();
      case 'plan': // Add case for 'plan'
        return renderPlanTab();
      case 'products':
        return renderProductsTab();
      case 'tiktok':
        return renderTikTokTab();
      case 'creators':
        return renderCreatorsTab();
      case 'backgrounds':
        return renderBackgroundsTab();
      case 'featureRequests':
        return renderFeatureRequestsTab();
      default:
        return <div>Select a tab</div>;
    }
  };

  // --- User Profile Tab - MINIMALISTIC DESIGN (LIKE PRICING) ---
  const renderUserTab = () => (
    <div className="w-full"> 
      <div className="px-6 lg:px-0"> 
        <div className="text-left">
          <div className="flex items-center mb-4">
            <span className="text-sm font-medium text-gray-800 dark:text-zinc-200">
              User Profile
            </span>
            <span className="mx-2 h-1 w-1 rounded-full bg-gray-400 dark:bg-zinc-500"></span>
            <span className="text-sm text-gray-500 dark:text-zinc-400">
              Manage your personal information
            </span>
          </div>
          
          <p className="mb-8 text-base text-gray-600 dark:text-zinc-400 max-w-2xl">
            Update your profile details and manage your account settings.
          </p>
          
          <div className="mb-12 border-b border-gray-100 dark:border-zinc-800 pb-8">
            <div className="flex flex-col md:flex-row gap-8">
              {/* Make the parent div rounded for circular hover effect */}
              <div className="relative group flex-shrink-0 w-24 h-24 rounded-full">
                <img 
                  src={previewURL || photoURL || '/pp-placeholder.jpeg'} 
                  alt="Profile" 
                  className="w-24 h-24 rounded-full object-cover shadow-sm hover:shadow-md transition-all duration-200"
                />
                <label className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <PencilSimple size={22} className="text-white" />
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                          const file = e.target.files[0];
                          setPhotoFile(file);
                          setPreviewURL(URL.createObjectURL(file)); // Set preview URL
                      } else {
                          setPhotoFile(null);
                          setPreviewURL(null); // Clear preview if no file
                      }
                    }}
                  />
                </label>
              </div>
              
              <div className="space-y-6 flex-1 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                    First Name
                  </label>
                  <input 
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white dark:bg-zinc-900 text-gray-900 dark:text-white rounded-md border-0 shadow-sm ring-1 ring-inset ring-gray-200 dark:ring-zinc-800 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-black dark:focus:ring-white transition-all duration-200"
                    placeholder="First Name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                    Last Name
                  </label>
                  <input 
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white dark:bg-zinc-900 text-gray-900 dark:text-white rounded-md border-0 shadow-sm ring-1 ring-inset ring-gray-200 dark:ring-zinc-800 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-black dark:focus:ring-white transition-all duration-200"
                    placeholder="Last Name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                    Email Address
                  </label>
                  <div className="w-full px-4 py-2.5 bg-gray-50 dark:bg-zinc-900/50 text-gray-500 dark:text-zinc-400 rounded-md border-0 shadow-sm ring-1 ring-inset ring-gray-200 dark:ring-zinc-800 flex items-center">
                    {user?.email || 'No email available'}
                  </div>
                </div>
                
                <button
                  onClick={updateUserProfile}
                  disabled={isLoading}
                  className={`px-5 py-2.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center justify-center ${
                    isLoading 
                      ? 'bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-zinc-500 cursor-not-allowed' 
                      : 'bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-zinc-200 shadow-sm hover:shadow'
                  }`}
                >
                  {isLoading ? (
                     <>
                      <CircleNotch size={16} className="animate-spin mr-2" /> Saving...
                     </>
                  ) : (
                     'Save Changes'
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center mb-4">
                <span className="text-sm font-medium text-gray-800 dark:text-zinc-200">
                  Account Actions
                </span>
                <span className="mx-2 h-1 w-1 rounded-full bg-gray-400 dark:bg-zinc-500"></span>
                <span className="text-sm text-gray-500 dark:text-zinc-400">
                  Manage your account
                </span>
              </div>
              
              <div className="flex flex-wrap gap-4">
                <button
                  onClick={handleLogout}
                  disabled={isLoading}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium transition-all duration-200 ${
                    isLoading
                      ? 'bg-gray-50 dark:bg-zinc-900 text-gray-400 dark:text-zinc-500 cursor-not-allowed'
                      : 'bg-white dark:bg-zinc-900 shadow-sm hover:shadow text-gray-700 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-zinc-800 ring-1 ring-inset ring-gray-200 dark:ring-zinc-800 hover:ring-gray-300 dark:hover:ring-zinc-700'
                  }`}
                >
                  <SignOut size={18} weight="bold" />
                  Log Out
                </button>

                <button
                  onClick={handleDeleteAccountClick}
                  disabled={isLoading}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium transition-all duration-200 ${
                    isLoading
                      ? 'bg-red-50 dark:bg-red-900/10 text-red-300 dark:text-red-500 cursor-not-allowed'
                      : 'bg-white dark:bg-zinc-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 shadow-sm hover:shadow ring-1 ring-inset ring-red-200 dark:ring-red-900/30 hover:ring-red-300 dark:hover:ring-red-800/50'
                  }`}
                >
                  <Trash size={18} weight="bold" />
                  Delete Account
                </button>
              </div>
              
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-3">
                Deleting your account is permanent and cannot be undone. All associated data will be removed.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // --- NEW: Plan & Billing Tab ---
  const renderPlanTab = () => {
     // --- NEW: Handle Manage Billing Button Click ---
      const handleManageBilling = async () => {
         if (!userSubscription?.stripeCustomerId) {
             setPortalError("No active billing account found. Subscribe to a plan first.");
             return;
         }
         setIsPortalLoading(true);
         setPortalError(null);
         try {
             console.log("Calling createStripePortalSession...");
             const result = await createStripePortalSession();
             const portalUrl = result?.data?.url;
            // Add a stricter check to ensure portalUrl is a valid-looking string
            if (typeof portalUrl === 'string' && portalUrl.startsWith('http')) {
                 console.log("Redirecting to Stripe Portal:", portalUrl);
                 window.location.href = portalUrl;
             } else {
                console.error("Invalid or missing portal URL received from backend:", portalUrl);
                throw new Error("Could not retrieve a valid billing portal URL.");
             }
         } catch (error) {
             console.error("Error creating Stripe Portal session:", error);
             // Display specific error from Firebase function if available
             const message = error.message || "An unexpected error occurred.";
             setPortalError(`Failed to open billing portal: ${message}`);
         } finally {
             setIsPortalLoading(false);
         }
      };
     // --- End Handle Manage Billing --- 

    return (
      <div className="w-full"> {/* Add container */}
        <div className="px-6 lg:px-0"> {/* Add padding */}
          {/* Add header consistent with User tab */}
          <div className="text-left mb-8"> 
            <div className="flex items-center mb-4">
              <span className="text-sm font-medium text-gray-800 dark:text-zinc-200">
                Plan & Billing
              </span>
              <span className="mx-2 h-1 w-1 rounded-full bg-gray-400 dark:bg-zinc-500"></span>
              <span className="text-sm text-gray-500 dark:text-zinc-400">
                Manage your subscription and billing details
              </span>
            </div>
            <p className="text-base text-gray-600 dark:text-zinc-400 max-w-2xl">
           View your current plan, upgrade options, or manage your payment methods and billing history.
          </p>
          </div>
          {/* Render the PricingSection - Pass subscription data */}
          {isFetchingSubscription ? (
             <div className="flex justify-center items-center py-20">
                <CircleNotch size={28} weight="regular" className="animate-spin text-gray-400 dark:text-zinc-500 mr-3" />
                <span className="text-base text-gray-500 dark:text-zinc-400">Loading plan details...</span>
             </div>
          ) : (
             <PricingSection id="settings-pricing" subscriptionData={userSubscription} user={user} /> 
          )}

          {/* Manage Billing Button Area - Added below PricingSection */} 
          {!isFetchingSubscription && (
             <div className="mt-12 pt-8 border-t border-gray-100 dark:border-zinc-800 flex flex-col items-start">
                <h3 className="text-base font-medium text-gray-800 dark:text-zinc-200 mb-3">Manage Your Subscription</h3>
                <p className="text-sm text-gray-600 dark:text-zinc-400 mb-4 max-w-xl">
                   Need to update your payment method, view invoices, or cancel your plan? Access the secure customer portal.
                </p>
                <button 
                   onClick={handleManageBilling}
                   disabled={isPortalLoading || !userSubscription?.stripeCustomerId} // Disable if loading or no customer ID
                   className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm hover:shadow ${
                      isPortalLoading 
                         ? 'bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-zinc-500 cursor-wait' 
                         : !userSubscription?.stripeCustomerId
                            ? 'bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-zinc-500 cursor-not-allowed' // Disabled style if no customer ID
                            : 'bg-white dark:bg-zinc-900 text-black dark:text-white ring-1 ring-inset ring-gray-200 dark:ring-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800'
                   }`}
                >
                   {isPortalLoading ? (
                      <CircleNotch size={16} className="animate-spin" />
                   ) : (
                      <ArrowSquareOut size={16} />
                   )}
                   {isPortalLoading ? 'Opening Portal...' : 'Manage Billing'}
                </button>
                {portalError && (
                    <p className="mt-3 text-xs text-red-600 dark:text-red-400">{portalError}</p>
                )}
                {!userSubscription?.stripeCustomerId && !isFetchingSubscription && (
                     <p className="mt-3 text-xs text-gray-500 dark:text-zinc-500">Subscribe to a plan to manage billing.</p>
                )}
             </div>
          )}
        </div>
      </div>
    );
  };

  // Modified Products Tab
  const renderProductsTab = () => (
    <div className="w-full"> {/* Add container */}
     <div className="px-6 lg:px-0 space-y-6"> {/* Add padding and spacing */}
        {/* Header consistent with User tab */}
        <div className="text-left"> 
            <div className="flex items-center mb-4">
              <span className="text-sm font-medium text-gray-800 dark:text-zinc-200">
                Products
              </span>
              <span className="mx-2 h-1 w-1 rounded-full bg-gray-400 dark:bg-zinc-500"></span>
              <span className="text-sm text-gray-500 dark:text-zinc-400">
                Manage your product information
              </span>
            </div>
            <p className="text-base text-gray-600 dark:text-zinc-400 max-w-2xl mb-8">
              Add, edit, or remove products. This information is used to generate relevant TikTok content.
            </p>
        </div>

      {/* Action Button - Moved below header */}
      <div className="flex justify-end border-b border-gray-100 dark:border-zinc-800 pb-4">
        <button 
          onClick={() => {
            // If trying to open the form (i.e., showAddProductForm is currently false) 
            // and product limit is reached, prevent opening and show alert.
            if (!showAddProductForm && products.length >= 1) {
              alert('You can only add one product. Delete the existing one to add a new product.');
              return;
            }
            // Otherwise, toggle the form visibility as usual.
            setShowAddProductForm(!showAddProductForm);
          }}
          // Disable button if it's in the "Add Product" state (showAddProductForm is false)
          // AND the product limit (products.length >= 1) is reached.
          // The button acts as "Cancel" when showAddProductForm is true, so it shouldn't be disabled then based on product count.
          disabled={!showAddProductForm && products.length >= 1}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg transition-colors 
                      ${(!showAddProductForm && products.length >= 1) 
                        ? 'bg-gray-300 dark:bg-zinc-700 text-gray-500 dark:text-zinc-500 cursor-not-allowed' 
                        : 'bg-gray-900 text-white dark:bg-white dark:text-black hover:bg-gray-800 dark:hover:bg-zinc-200'}
                    `}
        >
          {showAddProductForm ? <X size={16} /> : <Plus size={16} />}
          {showAddProductForm ? 'Cancel' : 'Add Product'}
        </button>
      </div>
      
      {/* Add Product Form with improved layout */}
      {showAddProductForm && (
        <form onSubmit={handleAddProduct} className="p-6 border border-gray-100 dark:border-zinc-800 rounded-lg space-y-5 bg-gray-50/50 dark:bg-zinc-900/30 mb-6">
          <h3 className="text-lg font-medium text-black dark:text-white mb-2">
            {editingProduct ? 'Edit Product' : 'Add New Product'}
          </h3>
          <div>
            <label className="block text-sm text-gray-700 dark:text-zinc-300 mb-1.5">
              Product Name <span className="text-red-500">*</span>
            </label>
            <input 
              type="text"
              value={productNameForForm}
              onChange={(e) => setProductNameForForm(e.target.value)}
              placeholder="e.g., Super Widget"
              required
              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-zinc-600"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 dark:text-zinc-300 mb-1.5">
              Description <span className="text-red-500">*</span> <span className="text-xs text-gray-400 dark:text-zinc-500">(Min 50 chars)</span>
            </label>
            <textarea 
              value={productDescriptionForForm}
              onChange={(e) => setProductDescriptionForForm(e.target.value)}
              placeholder="Describe the product, its benefits, target audience, key selling points... Be detailed! (Min 50 chars)"
              rows={4}
              required
              minLength={50} // <-- CHANGED FROM 150 to 50
              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-zinc-600"
            />
             {/* Character Counter with improved visual feedback */}
            <p className={`text-xs mt-1.5 ${productDescriptionForForm.length >= 50 ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-zinc-400'}`}>
                {productDescriptionForForm.length} / 50 characters {productDescriptionForForm.length < 50 ? `(${50 - productDescriptionForForm.length} more needed)` : '✓'}
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm text-gray-700 dark:text-zinc-300 mb-1.5">
                Product Logo {editingProduct ? '(Optional: Change)' : <span className="text-red-500">*</span>}
              </label>
              {editingProduct && currentLogoUrlInForm && (
                <div className="mb-2">
                  <p className="text-xs text-gray-500 dark:text-zinc-400 mb-1">Current Logo:</p>
                  <img src={currentLogoUrlInForm} alt="Current product logo" className="max-h-20 rounded border border-gray-200 dark:border-zinc-700 p-1 bg-white dark:bg-zinc-800" />
                </div>
              )}
              <input 
                type="file" 
                accept="image/*" 
                ref={productLogoInputRef}
                onChange={(e) => setProductLogoFileForForm(e.target.files[0])}
                required={!editingProduct} // Required only if NOT editing
                className="w-full text-sm text-gray-500 dark:text-zinc-400
                           file:mr-4 file:py-2 file:px-4
                           file:rounded-lg file:border-0
                           file:text-sm file:font-semibold
                           file:bg-gray-100 file:dark:bg-zinc-800 
                           file:text-gray-700 file:dark:text-zinc-200
                           hover:file:bg-gray-200 hover:file:dark:bg-zinc-700
                           cursor-pointer"
              />
              {productLogoFileForForm && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-zinc-400">Selected Logo: {productLogoFileForForm.name}</p>
              )}
            </div>
            <div>
              <label className="block text-sm text-gray-700 dark:text-zinc-300 mb-1.5">
                Product Video {editingProduct ? '(Optional: Change)' : <span className="text-red-500">*</span>}
              </label>
               {editingProduct && currentMediaUrlInForm && (
                <div className="mb-2">
                  <p className="text-xs text-gray-500 dark:text-zinc-400 mb-1">Current Media:</p>
                  {currentMediaTypeInForm === 'video' ? (
                    <video src={currentMediaUrlInForm} controls className="max-h-28 rounded border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800"></video>
                  ) : (
                    <img src={currentMediaUrlInForm} alt="Current product media" className="max-h-28 rounded border border-gray-200 dark:border-zinc-700 p-1 bg-white dark:bg-zinc-800" />
                  )}
                </div>
              )}
              <input 
                type="file" 
                accept="video/*"
                ref={productMediaInputRef}
                onChange={(e) => setProductMediaFileForForm(e.target.files[0])}
                required={!editingProduct} // Required only if NOT editing
                className="w-full text-sm text-gray-500 dark:text-zinc-400
                           file:mr-4 file:py-2 file:px-4
                           file:rounded-lg file:border-0
                           file:text-sm file:font-semibold
                           file:bg-gray-100 file:dark:bg-zinc-800 
                           file:text-gray-700 file:dark:text-zinc-200
                           hover:file:bg-gray-200 hover:file:dark:bg-zinc-700
                           cursor-pointer"
              />
              {productMediaFileForForm && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-zinc-400">Selected Media: {productMediaFileForForm.name}</p>
              )}
            </div>
          </div>
          
          <p className="text-xs text-gray-500 dark:text-zinc-400 pt-1 p-2 border-l-2 border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/50 rounded">
            The logo and product image/video will be used directly in generated TikTok content. High-quality assets will significantly improve output quality.
          </p>
          
          <div className="flex justify-end gap-3 pt-2">
             <button
                type="button"
                onClick={resetProductForm} // Use new reset function
                className="px-4 py-2 text-sm text-gray-700 dark:text-zinc-300 bg-transparent hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
                Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 bg-gray-900 text-white dark:bg-white dark:text-black rounded-lg text-sm hover:bg-gray-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {isLoading 
                ? (editingProduct ? 'Saving...' : 'Adding...') 
                : (editingProduct ? 'Save Changes' : 'Add Product')}
            </button>
          </div>
        </form>
      )}
      
      {/* Products List with improved layout */}
      {isLoading && !showAddProductForm && activeTab === 'products' ? ( // Only show loading if this tab is active
        <div className="flex justify-center py-8 text-gray-500 dark:text-zinc-400">
          <div className="flex items-center gap-2">
             <CircleNotch size={18} className="animate-spin"/> Loading Products...
          </div>
        </div>
      ) : !isLoading && products.length === 0 && !showAddProductForm ? (
        <div className="py-16 flex flex-col items-center justify-center text-center border border-dashed border-gray-200 dark:border-zinc-800 rounded-lg">
          <Package size={36} className="text-gray-400 dark:text-zinc-600 mb-4" />
          <p className="text-gray-500 dark:text-zinc-400 mb-4">No products added yet.</p>
          {/* This button is only shown when products.length is 0, so no need for a disable check here based on count */}
          <button 
            onClick={() => setShowAddProductForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white dark:bg-white dark:text-black text-sm rounded-lg hover:bg-gray-800 dark:hover:bg-zinc-200 transition-colors"
          >
            <Plus size={16} />
            Add Your First Product
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {products.map(product => {
            // Truncate description
            let displayDescription = product.description || 'No description provided.';
            if (displayDescription.length > 50) {
              displayDescription = displayDescription.substring(0, 50) + '...';
            }

            return (
              <div key={product.id} className="flex gap-4 p-4 border border-gray-100 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-900/50 transition-colors rounded-lg items-center">
                <img 
                  src={product.logoUrl || 'https://via.placeholder.com/80?text=No+Logo'}
                  alt={`${product.name} logo`} 
                  className="w-16 h-auto max-h-16 object-contain rounded flex-shrink-0 bg-gray-50 dark:bg-zinc-800 p-1" 
                />
                <div className="flex-1 min-w-0 py-1">
                  <div className="flex justify-between items-start">
                    <h3 className="font-medium text-black dark:text-white truncate mr-2">{product.name}</h3>
                    <div className="flex gap-1 flex-shrink-0">
                      <button 
                          onClick={() => handleEditProductClick(product)} // <-- WIRE UP EDIT
                          className="p-1.5 text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded transition-colors"
                          aria-label={`Edit ${product.name}`}
                          title={`Edit ${product.name}`}
                      >
                        <PencilSimple size={16} />
                      </button>
                      <button 
                          onClick={() => handleDeleteProduct(product.id, product.logoUrl, product.mediaUrl, product.name)}
                          disabled={isLoading}
                          className="p-1.5 text-gray-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded transition-colors disabled:opacity-50"
                          aria-label={`Delete ${product.name}`}
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  </div>
                  {/* Removed line-clamp-2 and used displayDescription */}
                  <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">{displayDescription}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div> {/* Close padding container */}
    </div>
  );

  const renderTikTokTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100">TikTok Accounts</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Connect your TikTok accounts to enable direct posting and other features.
            </p>
        </div>

      <div className="mt-6">
        <button 
          onClick={handleConnectTikTokAccount}
          disabled={isLoadingTikTok}
          className="inline-flex items-center justify-center rounded-md border border-transparent bg-sky-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:opacity-50 dark:focus:ring-offset-gray-800"
        >
          {isLoadingTikTok && activeTab === 'tiktok' ? (
            <CircleNotch size={20} className="animate-spin mr-2" />
          ) : (
            <TiktokLogo size={20} className="mr-2" />
          )}
          Connect New TikTok Account
        </button>
      </div>
      
      {isLoadingTikTok && tiktokAccounts.length === 0 && (
        <div className="flex justify-center items-center py-10">
          <CircleNotch size={32} className="animate-spin text-sky-500" />
          <p className="ml-3 text-gray-600 dark:text-gray-400">Loading connected accounts...</p>
          </div>
      )}

      {!isLoadingTikTok && tiktokAccounts.length === 0 && (
        <div className="mt-6 text-center text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md p-8">
          <TiktokLogo size={48} className="mx-auto text-gray-400 dark:text-gray-500" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">No TikTok Accounts Connected</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Click the button above to connect your first TikTok account.</p>
        </div>
      )}

      {tiktokAccounts.length > 0 && (
        <div className="mt-6 flow-root">
          <ul role="list" className="-my-5 divide-y divide-gray-200 dark:divide-gray-700">
            {tiktokAccounts.map((account) => (
              <li key={account.id} className="py-5">
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    {account.user_info?.avatar_url ? (
                      <img className="h-10 w-10 rounded-full" src={account.user_info.avatar_url} alt={account.user_info.display_name || 'TikTok Avatar'} />
                    ) : (
                      <UserCircle size={40} className="text-gray-400 dark:text-gray-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate dark:text-gray-100">
                      {account.user_info?.display_name || account.id}
                    </p>
                    <p className="text-sm text-gray-500 truncate dark:text-gray-400">
                      Open ID: {account.open_id}
                    </p>
                     {account.expires_at && (
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          Access valid until: {new Date(account.expires_at.seconds * 1000).toLocaleDateString()}
                        </p>
                      )}
                  </div>
                  <div>
          <button 
                      onClick={() => handleDeleteTiktokAccount(account.id, account.user_info?.display_name)}
                      disabled={isLoadingTikTok}
                      className="inline-flex items-center justify-center rounded-md border border-transparent bg-red-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 dark:focus:ring-offset-gray-800"
          >
                      <Trash size={16} className="mr-1.5" />
                      Disconnect
          </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  // --- Modified Creators Tab ---
  const renderCreatorsTab = () => (
    <div className="w-full"> {/* Add container */}
      <div className="px-6 lg:px-0 space-y-6"> {/* Add padding and spacing */}
       {/* Header consistent with User tab */}
         <div className="text-left"> 
            <div className="flex items-center mb-4">
              <span className="text-sm font-medium text-gray-800 dark:text-zinc-200">
                UGC Creators
              </span>
              <span className="mx-2 h-1 w-1 rounded-full bg-gray-400 dark:bg-zinc-500"></span>
              <span className="text-sm text-gray-500 dark:text-zinc-400">
                Manage your UGC creator assets
              </span>
            </div>
            <p className="text-base text-gray-600 dark:text-zinc-400 max-w-2xl mb-8">
              Upload images of your User-Generated Content creators. These visuals can be used in generated videos.
            </p>
            <p className="text-xs text-gray-500 dark:text-zinc-400 -mt-6 mb-8 max-w-2xl">
              Tip: You can also generate unique UGC-style creator images using Lungo AI's image generation features and then add them here!
            </p>
        </div>

      {/* Action Button - Moved below header */}
      <div className="flex justify-end border-b border-gray-100 dark:border-zinc-800 pb-4">
        <button 
          onClick={() => setShowAddCreatorForm(!showAddCreatorForm)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-900 text-white dark:bg-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-zinc-200 transition-colors"
        >
          {showAddCreatorForm ? <X size={16} /> : <Plus size={16} />}
          {showAddCreatorForm ? 'Cancel' : 'Add Creator'}
        </button>
      </div>
      
      {/* Add Creator Form with improved layout */}
      {showAddCreatorForm && (
        <form onSubmit={handleAddCreator} className="p-6 border border-gray-100 dark:border-zinc-800 rounded-lg space-y-5 bg-gray-50/50 dark:bg-zinc-900/30 mb-6">
          <h3 className="text-lg font-medium text-black dark:text-white mb-2">Add New Creator</h3>
          <div>
            <label className="block text-sm text-gray-700 dark:text-zinc-300 mb-1.5">
              Creator Name <span className="text-red-500">*</span>
            </label>
            <input 
              type="text"
              value={newCreatorName}
              onChange={(e) => setNewCreatorName(e.target.value)}
              placeholder="e.g., Influencer Jane"
              required
              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-zinc-600"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 dark:text-zinc-300 mb-1.5">
              Creator Image <span className="text-red-500">*</span>
            </label>
            <input 
              type="file" 
              accept="image/*" 
              ref={creatorFileInputRef} 
              onChange={(e) => setNewCreatorFile(e.target.files[0])}
              required
              className="w-full text-sm text-gray-500 dark:text-zinc-400
                         file:mr-4 file:py-2 file:px-4
                         file:rounded-lg file:border-0
                         file:text-sm file:font-semibold
                         file:bg-gray-100 file:dark:bg-zinc-800 
                         file:text-gray-700 file:dark:text-zinc-200
                         hover:file:bg-gray-200 hover:file:dark:bg-zinc-700
                         cursor-pointer"
            />
            {newCreatorFile && (
                <p className="mt-2 text-xs text-gray-500 dark:text-zinc-400">Selected: {newCreatorFile.name}</p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
             <button
                type="button"
                onClick={() => setShowAddCreatorForm(false)}
                className="px-4 py-2 text-sm text-gray-700 dark:text-zinc-300 bg-transparent hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
                Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 bg-gray-900 text-white dark:bg-white dark:text-black rounded-lg text-sm hover:bg-gray-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Adding...' : 'Add Creator'}
            </button>
          </div>
        </form>
      )}
      
      {/* Creators List Grid */}
      {isLoading && !showAddCreatorForm && activeTab === 'creators' ? ( // Only show loading if this tab is active
        <div className="flex justify-center py-8 text-gray-500 dark:text-zinc-400">
           <div className="flex items-center gap-2">
             <CircleNotch size={18} className="animate-spin"/> Loading Creators...
          </div>
        </div>
      ) : !isLoading && creators.length === 0 && !showAddCreatorForm ? ( 
        <div className="py-16 flex flex-col items-center justify-center text-center border border-dashed border-gray-200 dark:border-zinc-800 rounded-lg">
          <Camera size={36} className="text-gray-400 dark:text-zinc-600 mb-4" />
          <p className="text-gray-500 dark:text-zinc-400 mb-4">No UGC creators added yet.</p>
          <button 
            onClick={() => setShowAddCreatorForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white dark:bg-white dark:text-black text-sm rounded-lg hover:bg-gray-800 dark:hover:bg-zinc-200 transition-colors"
          >
            <Plus size={16} />
            Add Your First Creator
          </button>
        </div>
      ) : (
        // --- Grid Layout similar to Backgrounds ---
        // Adjusted column count AGAIN for even larger items
        <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {creators.map(creator => (
            <div key={creator.id} className="relative aspect-[3/4] rounded-lg overflow-hidden group border border-gray-100 dark:border-zinc-800"> {/* Aspect ratio can be adjusted */}
              <img 
                src={creator.imageUrl || 'https://via.placeholder.com/150x200?text=No+Img'} 
                alt={creator.name} 
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {/* Hover Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3">
                 <p className="text-sm font-medium text-white truncate mb-1">{creator.name}</p>
                 {/* Action Buttons */}
                 <div className="absolute top-2 right-2 flex gap-1.5">
                   <button 
                       onClick={() => handleDeleteCreator(creator.id, creator.imageUrl, creator.name)} // Use updated handler
                       disabled={isLoading}
                       className="p-1.5 bg-black/50 text-white rounded-full hover:bg-red-600 transition-colors disabled:opacity-50"
                       aria-label={`Delete ${creator.name}`}
                       title="Delete Creator"
                   >
                     <Trash size={14} />
                   </button>
                 </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </div> {/* Close padding container */}
    </div>
  );

  // --- Modified Backgrounds Tab ---
  const renderBackgroundsTab = () => (
    <div className="w-full"> {/* Add container */}
      <div className="px-6 lg:px-0 space-y-6"> {/* Add padding and spacing */}
        {/* Header consistent with User tab */}
        <div className="text-left"> 
            <div className="flex items-center mb-4">
              <span className="text-sm font-medium text-gray-800 dark:text-zinc-200">
                Background Images
              </span>
              <span className="mx-2 h-1 w-1 rounded-full bg-gray-400 dark:bg-zinc-500"></span>
              <span className="text-sm text-gray-500 dark:text-zinc-400">
                Manage backgrounds for video generation
              </span>
            </div>
            <p className="text-base text-gray-600 dark:text-zinc-400 max-w-2xl mb-8">
              Upload your own background images or select from our library. These images will be used as backgrounds in generated TikToks.
            </p>
            <p className="text-xs text-gray-500 dark:text-zinc-400 -mt-6 mb-8 max-w-2xl">
              Tip: Don't forget, you can generate custom background scenes using Lungo AI's image generation, then upload them here or add directly from your generation history!
            </p>
        </div>

      {/* Header Area with action buttons - Moved below header */}
      <div className="flex flex-wrap justify-end items-center gap-2.5 border-b border-gray-100 dark:border-zinc-800 pb-4">
          {/* Library Button with improved spacing */}
          <button
            onClick={() => {
              if (showLibrary) {
                 setShowLibrary(false);
                 setSelectedLibraryImages([]);
              } else {
                 setShowLibrary(true);
                 setShowAddBackgroundForm(false);
                 fetchLibraryBackgrounds();
              }
            }}
            disabled={isLoadingLibrary || isLoading}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-zinc-100 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            {showLibrary ? <X size={16} /> : <ImageIcon size={16} />} 
            {showLibrary ? 'Cancel Library' : 'Add from Library'}
          </button>

           {/* Custom Upload Button */}
           {!showLibrary && (
             <button 
               onClick={() => setShowAddBackgroundForm(!showAddBackgroundForm)}
               disabled={isLoading}
               className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-900 text-white dark:bg-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
             >
               {showAddBackgroundForm ? <X size={16} /> : <Plus size={16} />}
               {showAddBackgroundForm ? 'Cancel Upload' : 'Upload Custom'}
             </button>
           )}
        </div>

      {/* Add Custom Background Form with improved layout */}
      {showAddBackgroundForm && !showLibrary && (
        <form onSubmit={handleAddCustomBackground} className="p-6 border border-gray-100 dark:border-zinc-800 rounded-lg space-y-5 bg-gray-50/50 dark:bg-zinc-900/30 mb-6">
           <h3 className="text-lg font-medium text-black dark:text-white mb-2">Upload Custom Background</h3>
           <div>
             <label className="block text-sm text-gray-700 dark:text-zinc-300 mb-1.5">
               Background Name <span className="text-red-500">*</span>
             </label>
             <input 
               type="text"
               value={newBackgroundName}
               onChange={(e) => setNewBackgroundName(e.target.value)}
               placeholder="e.g., Office Desk Setup"
               required
               className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-zinc-600"
             />
           </div>
           <div>
             <label className="block text-sm text-gray-700 dark:text-zinc-300 mb-1.5">
               Image File <span className="text-red-500">*</span> <span className="text-xs text-gray-400">(Recommended: 9:16 aspect ratio)</span>
             </label>
             <input 
               type="file" 
               accept="image/*" 
               ref={backgroundFileInputRef} 
               onChange={(e) => setNewBackgroundFile(e.target.files[0])}
               required
               className="w-full text-sm text-gray-500 dark:text-zinc-400
                          file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold
                          file:bg-gray-100 file:dark:bg-zinc-800 file:text-gray-700 file:dark:text-zinc-200
                          hover:file:bg-gray-200 hover:file:dark:bg-zinc-700 cursor-pointer"
             />
             {newBackgroundFile && (
                 <p className="mt-2 text-xs text-gray-500 dark:text-zinc-400">Selected: {newBackgroundFile.name}</p>
             )}
           </div>
           <div className="flex justify-end gap-3 pt-2">
             <button type="button" onClick={() => setShowAddBackgroundForm(false)} className="px-4 py-2 text-sm text-gray-700 dark:text-zinc-300 bg-transparent hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">Cancel</button>
             <button type="submit" disabled={isLoading} className="px-5 py-2 bg-gray-900 text-white dark:bg-white dark:text-black rounded-lg text-sm hover:bg-gray-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"> {isLoading ? 'Uploading...' : 'Add Background'} </button>
           </div>
        </form>
      )}

      {/* ---- Library View with improved grid layout ---- */}
      {showLibrary && (
          <div className="space-y-6">
              {/* Header and button with improved layout */}
              <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-black dark:text-white">Select Backgrounds from Library</h3>
                  {/* Save Button - improved visibility */}
                  {!isLoadingLibrary && libraryImages.length > 0 && (
                      <button
                          onClick={handleSaveSelectedLibraryImages}
                          disabled={isLoading || selectedLibraryImages.length === 0}
                          className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                          {isLoading ? 'Saving...' : `Add (${selectedLibraryImages.length}) Selected`}
                      </button>
                  )}
              </div>

              {isLoadingLibrary ? (
                  <div className="flex justify-center py-8 text-gray-500 dark:text-zinc-400">
                      <div className="flex items-center gap-2">
                          <CircleNotch size={18} className="animate-spin"/> Loading Library...
                      </div>
                  </div>
              ) : libraryImages.length === 0 ? (
                   <div className="py-12 flex flex-col items-center justify-center text-center border border-dashed border-gray-200 dark:border-zinc-800 rounded-lg">
                      <ImageIcon size={36} className="text-gray-400 dark:text-zinc-600 mb-4" />
                      <p className="text-gray-500 dark:text-zinc-400 mb-4">No images found in the library folder (`lungo-backgrounds`).</p>
                   </div>
              ) : (
                   <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {libraryImages.map(({ url, name, description }) => {
                          const isSelected = selectedLibraryImages.includes(url);
                          const isAlreadyAdded = userBackgroundUrls.has(url);
                          return (
                              <div 
                                  key={url} 
                                  className={`relative aspect-[9/16] rounded-lg overflow-hidden cursor-pointer group border-2 ${isSelected ? 'border-blue-500' : isAlreadyAdded ? 'border-green-500/50' : 'border-transparent hover:border-gray-300 dark:hover:border-zinc-600'}`}
                                  onClick={() => toggleLibrarySelection(url)}
                                  title={isAlreadyAdded ? `${name} (Already Added)` : name}
                              >
                                  <img 
                                      src={url} 
                                      alt={name || 'Library Background'}
                                      className="w-full h-full object-cover transition-transform duration-200"
                                      loading="lazy"
                                  />
                                  {/* Selection / Added Indicator */}
                                  {(isSelected || isAlreadyAdded) && (
                                      <div className={`absolute inset-0 flex items-center justify-center ${isSelected ? 'bg-blue-500/50' : 'bg-green-800/60'}`}>
                                           <CheckCircle size={24} weight="fill" className="text-white" />
                                      </div>
                                  )}
                                  {/* Dim overlay for added items */}
                                  {isAlreadyAdded && !isSelected && (
                                      <div className="absolute inset-0 bg-black/30"></div>
                                  )}
                              </div>
                          );
                      })}
                   </div>
              )}
          </div>
      )}

      {/* ---- User's Added Backgrounds List ---- */}
      {!showLibrary && !showAddBackgroundForm && (
          <>
            {isLoading && activeTab === 'backgrounds' ? ( // Only show loading if this tab is active
              <div className="flex justify-center py-8 text-gray-500 dark:text-zinc-400">
                 <div className="flex items-center gap-2">
                     <CircleNotch size={18} className="animate-spin"/> Loading Your Backgrounds...
                 </div>
              </div>
            ) : backgrounds.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-center border border-dashed border-gray-200 dark:border-zinc-800 rounded-lg">
                <ImageIcon size={40} className="text-gray-400 dark:text-zinc-600 mb-4" />
                <p className="text-gray-500 dark:text-zinc-400 mb-2">You haven't added any backgrounds yet.</p>
                <p className="text-xs text-gray-400 dark:text-zinc-500 mb-4">Upload your own or add from the library.</p>
                
                {/* Added buttons for quick action */}
                <div className="flex gap-3 mt-2">
                  <button 
                    onClick={() => {
                      setShowLibrary(true);
                      fetchLibraryBackgrounds();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-zinc-100 rounded-lg"
                  >
                    <ImageIcon size={14} />
                    Browse Library
                  </button>
                  <button 
                    onClick={() => setShowAddBackgroundForm(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-900 text-white dark:bg-white dark:text-black rounded-lg"
                  >
                    <Plus size={14} />
                    Upload Custom
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {backgrounds.map(bg => (
                      <div key={bg.id} className="relative aspect-[9/16] rounded-lg overflow-hidden group">
                           <img 
                               src={bg.imageUrl || 'https://via.placeholder.com/180x320?text=No+Img'} 
                               alt={bg.name || 'Background'}
                               className="w-full h-full object-cover" 
                               loading="lazy"
                           />
                           <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3">
                              <p className="text-sm font-medium text-white truncate mb-1">{bg.name}</p>
                              <button 
                                  onClick={() => handleDeleteBackground(bg.id, bg.imageUrl, bg.isFromLibrary, bg.name)} 
                                  disabled={isLoading}
                                  className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full hover:bg-red-600 transition-colors disabled:opacity-50"
                                  aria-label={`Delete ${bg.name}`}
                              >
                                <Trash size={14} />
                              </button>
                           </div>
                           {bg.isFromLibrary && (
                               <div className="absolute top-2 left-2 bg-blue-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-medium" title="Added from Library">
                                   Lib
                               </div>
                           )}
                      </div>
                  ))}
              </div>
            )}
         </>
      )}
      </div> {/* Close padding container */}
    </div>
  );

  // Renamed renderRequestsTab to renderFeatureRequestsTab
  const renderFeatureRequestsTab = () => (
     <div className="w-full"> 
      <div className="px-6 lg:px-0 space-y-6"> 
        <div className="text-left border-b border-gray-100 dark:border-zinc-800 pb-8 mb-8"> 
            <div className="flex items-center mb-4">
              <span className="text-sm font-medium text-gray-800 dark:text-zinc-200">
                Feature Requests
              </span>
              <span className="mx-2 h-1 w-1 rounded-full bg-gray-400 dark:bg-zinc-500"></span>
              <span className="text-sm text-gray-500 dark:text-zinc-400">
                Vote on upcoming features or submit your own
              </span>
            </div>
            <p className="text-base text-gray-600 dark:text-zinc-400 max-w-2xl">
              Help us prioritize what to build next by upvoting the features you want most, or let us know what you'd like to see!
            </p>
        </div>

        {/* --- NEW: Form to submit a new feature request --- */}
        <form onSubmit={handleNewFeatureRequestSubmit} className="mb-10 p-5 border border-gray-100 dark:border-zinc-800 rounded-lg bg-gray-50/50 dark:bg-zinc-900/30">
          <h3 className="text-md font-medium text-gray-800 dark:text-zinc-100 mb-3">Suggest a New Feature</h3>
          <p className="text-xs text-gray-500 dark:text-zinc-400 mb-3">
            Have an idea that's not on the list? Describe it below. Your suggestion will be private to you.
          </p>
          <textarea
            value={newFeatureRequestText}
            onChange={(e) => setNewFeatureRequestText(e.target.value)}
            placeholder="Describe your feature idea..."
            rows={3}
            className="w-full px-3 py-2 rounded-md bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-sm text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-zinc-600"
            required
          />
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={isSubmittingRequest || !newFeatureRequestText.trim()}
              className="px-4 py-2 bg-gray-800 text-white dark:bg-white dark:text-black rounded-md text-sm font-medium hover:bg-gray-700 dark:hover:bg-zinc-200 transition-colors disabled:opacity-60 flex items-center justify-center min-w-[110px]" // Added min-w for consistent size
            >
              {isSubmittingRequest ? (
                <CircleNotch size={18} className="animate-spin" /> // Only spinner when submitting
              ) : (
                'Submit Idea'
              )}
            </button>
          </div>
        </form>
        {/* --- End New Feature Request Form --- */}
      
      {isFetchingRequests ? (
        <div className="flex justify-center py-16 text-gray-500 dark:text-zinc-400">
          <div className="flex flex-col items-center">
            <CircleNotch size={24} className="animate-spin mb-4" />
            <p className="text-sm">Loading requests</p>
          </div>
        </div>
      ) : featureRequests.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 bg-gray-50 dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-full flex items-center justify-center mb-4 shadow-sm">
            <Sparkle size={22} weight="light" className="text-gray-400 dark:text-zinc-600" />
          </div>
          <p className="text-base text-gray-700 dark:text-zinc-300 font-medium mb-2">No feature requests yet</p>
          <p className="text-sm text-gray-500 dark:text-zinc-400 max-w-md">
            Feature requests will appear here. Upvote the ones you'd like to see implemented.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {/* Public feature requests list */}
          {featureRequests.length > 0 && (
            <>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-2 px-2 pt-2">Vote on Public Requests</h4>
          <div className="divide-y divide-gray-100 dark:divide-zinc-800">
            {featureRequests.map((request) => (
              <div 
                key={request.id} 
                className="flex items-center py-3.5 px-2 hover:bg-gray-50 dark:hover:bg-zinc-900/50 transition-colors"
              >
                <div className="mr-3">
                  <button 
                    onClick={() => handleVote(request.id, request.votes, request.userUpvoted)}
                        disabled={votingCooldown[request.id] || isLoading || isSubmittingRequest} // Also disable if submitting new
                    className={`relative flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200 
                      ${request.userUpvoted 
                        ? 'bg-gray-900 text-white dark:bg-white dark:text-black' 
                        : 'bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'} 
                      ${votingCooldown[request.id] ? 'opacity-50 cursor-not-allowed' : ''}`}
                    aria-label={request.userUpvoted ? "Remove vote" : "Upvote"}
                    title={request.userUpvoted ? "Remove vote" : "Upvote"}
                  >
                    <ArrowUp size={14} weight={request.userUpvoted ? "fill" : "regular"} />
                    
                    {votingCooldown[request.id] && (
                      <span className="absolute inset-0 rounded-md border-2 border-gray-900 dark:border-white animate-ping opacity-30"></span>
                    )}
                  </button>
                </div>
                
                <span className="text-sm text-gray-800 dark:text-zinc-200">
                  {request.title}
                </span>
                {/* REMOVE VOTE COUNT DISPLAY (Kept commented out) */}
                {/* 
                <span className="ml-auto text-xs font-medium text-gray-500 dark:text-zinc-400 pr-2">
                    {request.votes} {request.votes === 1 ? 'vote' : 'votes'}
                </span>
                */}
              </div>
            ))}
          </div>
          <div className="pt-3 px-2">
            <p className="text-xs text-gray-500 dark:text-zinc-500">
                  Upvoting helps us prioritize which features to implement.
            </p>
          </div>
            </>
          )}
          {/* End Public feature requests list */}

          {/* User's Private Submitted Requests List */}
          {userPrivateRequests.length > 0 && (
            <div className="mt-8 pt-6 border-t border-gray-100 dark:border-zinc-800">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-3 px-2">My Submitted Ideas</h4>
              <div className="divide-y divide-gray-100 dark:divide-zinc-800">
                {userPrivateRequests.map((request) => (
                  <div key={request.id} className="flex items-center justify-between py-3 px-2 hover:bg-gray-50 dark:hover:bg-zinc-900/50 transition-colors">
                    <span className="text-sm text-gray-700 dark:text-zinc-300">{request.title}</span>
                    <span className="text-xs text-gray-400 dark:text-zinc-500">
                      Submitted: {request.createdAt?.toDate ? request.createdAt.toDate().toLocaleDateString() : 'Recently'}
                    </span>
                    {/* Add delete button for private requests later if needed */}
                  </div>
                ))}
              </div>
        </div>
      )}
          {/* End User's Private Submitted Requests List */}
          
          {/* Show if no requests at all (public or private) */}
          {featureRequests.length === 0 && userPrivateRequests.length === 0 && (
             <div className="py-10 flex flex-col items-center justify-center text-center">
               <Sparkle size={28} weight="light" className="text-gray-400 dark:text-zinc-600 mb-3" />
               <p className="text-sm text-gray-500 dark:text-zinc-400">
                 No feature requests yet. Be the first to suggest something!
               </p>
             </div>
          )}

        </div>
      )}
      </div> 
    </div>
  );

  // --- Add Custom Background (Handle user uploads - Keep this functionality) ---
  const handleAddCustomBackground = async (e) => {
    e.preventDefault();
    if (!user || !newBackgroundFile || !newBackgroundName.trim()) {
      alert('Background name and image file are required.');
      return;
    }
    setIsLoading(true);
    let imageUrl = null;
    let description = 'Uploaded background image.'; // Default description

    try {
      imageUrl = await uploadFile(newBackgroundFile, `users/${user.uid}/backgrounds/uploads`);
      if (!imageUrl) throw new Error('Background image upload failed.');

      // --- NEW: Generate Description --- 
      try {
        console.log(`Calling generateImageDescription for uploaded image: ${imageUrl}`); // Replaced logger
        const result = await generateImageDescription({ imageUrl: imageUrl });
        if (result.data && result.data.success && result.data.description) {
          description = result.data.description;
          console.log(`Description generated for uploaded background: "${description}"`); // Replaced logger
        } else {
          console.warn('Failed to generate description for uploaded background, using default.', result.data); // Replaced logger
        }
      } catch (descError) {
        console.error('Error calling generateImageDescription for uploaded background:', descError); // Replaced logger
        // Proceed with default description
      }
      // --- END NEW: Generate Description ---

      const backgroundData = {
        name: newBackgroundName.trim(),
        imageUrl: imageUrl,
        description: description, // Add the generated or default description
        isFromLibrary: false, // Mark as custom upload
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'users', user.uid, 'backgrounds'), backgroundData);

      // Update local state and URL set
      const newBg = { id: docRef.id, ...backgroundData };
      setBackgrounds(prev => [...prev, newBg]);
      setUserBackgroundUrls(prev => new Set(prev).add(newBg.imageUrl));

      // Reset form
      setNewBackgroundName('');
      setNewBackgroundFile(null);
      if (backgroundFileInputRef.current) backgroundFileInputRef.current.value = "";
      setShowAddBackgroundForm(false);
      showCustomToast('Background added successfully!', 'success');
      if (refreshLayoutData) refreshLayoutData(); // <-- CALL REFRESH

    } catch (error) {
      console.error('Error adding custom background:', error);
      alert(`Failed to add background: ${error.message}. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Delete Background (Adjusted: Show modal instead of window.confirm) ---
  const handleDeleteBackground = (backgroundId, backgroundImageUrl, isFromLibrary, backgroundName) => {
    if (!user) return;

    // Set item details and show modal
    setItemToDelete({ 
        id: backgroundId, 
        imageUrl: backgroundImageUrl, 
        isFromLibrary: isFromLibrary, 
        name: backgroundName,
        type: 'background'
    });
    setShowDeleteConfirmModal(true);
  };

  // --- RENAMED & Updated: Confirm Item Deletion (Handles Backgrounds & Creators) ---
  const confirmItemDeletion = async () => {
    if (!user || !itemToDelete) return;

    const { id, imageUrl, isFromLibrary, type } = itemToDelete; // Destructure type
    setShowDeleteConfirmModal(false); // Close modal first
    setIsLoading(true);

    try {
      let collectionName = '';
      let deleteSuccessMessage = '';
      let deleteFailMessage = '';
      let storagePathPrefix = ''; // For deleting custom uploads

      // Configure based on type
      if (type === 'background') {
        collectionName = 'backgrounds';
        deleteSuccessMessage = 'Background removed successfully!';
        deleteFailMessage = 'Failed to remove background.';
        storagePathPrefix = `users/${user.uid}/backgrounds/uploads`; // Only custom backgrounds are in storage user folder
      } else if (type === 'creator') {
        collectionName = 'creators';
        deleteSuccessMessage = 'Creator deleted successfully!';
        deleteFailMessage = 'Failed to delete creator.';
        storagePathPrefix = `users/${user.uid}/creators/images`; // All creator images are uploaded
      } else {
        console.error("Invalid item type for deletion:", type);
        alert("Cannot delete item: Invalid type.");
        setIsLoading(false);
        setItemToDelete(null);
        return;
      }

      // 1. Delete Firestore document
      await deleteDoc(doc(db, 'users', user.uid, collectionName, id));

      // 2. Delete from Storage IF applicable
      // Backgrounds: only if !isFromLibrary (custom upload)
      // Creators: always try to delete (as they are always uploaded)
      const shouldDeleteFromStorage = (type === 'creator') || (type === 'background' && !isFromLibrary);

      if (shouldDeleteFromStorage && imageUrl && imageUrl.includes('firebasestorage.googleapis.com')) {
        try {
          // Construct the ref from the URL
          const imageRef = ref(storage, imageUrl); 
          await deleteObject(imageRef);
          console.log(`Deleted ${type} image from Storage: ${imageUrl}`);
        } catch (storageError) {
          // Log warning but continue - Firestore doc is already deleted
          console.warn(`Could not delete ${type} image from Storage (${imageUrl}):`, storageError); 
        }
      } else if (type === 'background' && isFromLibrary) {
           console.log(`Background ${id} is from library, not deleting from Storage.`);
      }

      // 3. Update local state
      if (type === 'background') {
        setBackgrounds(prev => prev.filter(b => b.id !== id));
        setUserBackgroundUrls(prev => {
          const newSet = new Set(prev);
          newSet.delete(imageUrl);
          return newSet;
        });
      } else if (type === 'creator') {
        setCreators(prev => prev.filter(c => c.id !== id));
      }
      
      // alert(deleteSuccessMessage);
      showCustomToast(deleteSuccessMessage, 'success'); // <-- UPDATED for generic item delete

    } catch (error) {
      console.error(`Error deleting ${type}:`, error);
      alert(`${deleteFailMessage} Please try again.`);
    } finally {
      setIsLoading(false);
      setItemToDelete(null); // Clear item after operation
    }
  };

  // --- Helper to Fetch Library Backgrounds ---
  const fetchLibraryBackgrounds = async () => {
      if (!user) return;
      setIsLoadingLibrary(true);
      try {
          const libraryRef = ref(storage, 'lungo-backgrounds'); // Path to your shared library folder
          const res = await listAll(libraryRef);
          const urls = await Promise.all(res.items.map(async (itemRef) => {
              const url = await getDownloadURL(itemRef);
              const name = itemRef.name; // Get the filename
              const description = libraryImageDescriptions[name] || `Library background image: ${name}`; // Get from map or fallback
              return { url, name, description }; // Store URL, name, and description
          }));
          setLibraryImages(urls);
          console.log("Fetched Library Backgrounds:", urls);
      } catch (error) {
          console.error("Error fetching library backgrounds:", error);
          setLibraryImages([]); // Clear on error
          // Potentially show an error message to the user
      } finally {
          setIsLoadingLibrary(false);
      }
  };
  
  // --- Helper to Toggle Library Selection ---
  const toggleLibrarySelection = (url) => {
      if (userBackgroundUrls.has(url)) return; // Don't allow selecting already added images
      setSelectedLibraryImages(prev => 
          prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]
      );
  };
  
  // --- Helper to Save Selected Library Images ---
  const handleSaveSelectedLibraryImages = async () => {
      if (!user || selectedLibraryImages.length === 0) return;
      setIsLoading(true);
      
      const batch = writeBatch(db);
      const newBackgroundsToAdd = []; // To update local state
      const newUrlsToAdd = new Set(userBackgroundUrls); // To update URL set
      
      selectedLibraryImages.forEach(url => {
          if (!userBackgroundUrls.has(url)) { // Double check it wasn't added concurrently
              const libraryImage = libraryImages.find(img => img.url === url);
              const docRef = doc(collection(db, 'users', user.uid, 'backgrounds')); // Generate new ID
              
              // --- UPDATED: Use fixed description from map or fallback ---
              const imageName = libraryImage?.name || url.substring(url.lastIndexOf('/') + 1).split('?')[0]; // Extract filename if name not in libraryImage state
              const descriptionToSave = libraryImageDescriptions[imageName] || `Library background image: ${imageName}`;
              // --- END UPDATED ---

              const bgData = {
                  name: libraryImage?.name || `Library Image ${Date.now()}`, // Use fetched name or fallback
                  imageUrl: url,
                  description: descriptionToSave, // Add the description from map or fallback
                  isFromLibrary: true,
                  createdAt: serverTimestamp(),
              };
              batch.set(docRef, bgData);
              newBackgroundsToAdd.push({ id: docRef.id, ...bgData });
              newUrlsToAdd.add(url);
          }
      });
      
      try {
          await batch.commit();
          setBackgrounds(prev => [...prev, ...newBackgroundsToAdd]);
          setUserBackgroundUrls(newUrlsToAdd);
          setSelectedLibraryImages([]); // Clear selection
          setShowLibrary(false); // Optionally close library view
          // alert(`Added ${newBackgroundsToAdd.length} background(s) from the library!`);
          showCustomToast(`Added ${newBackgroundsToAdd.length} background(s) from the library!`, 'success'); // <-- UPDATED
      } catch (error) {
          console.error("Error saving selected library images:", error);
          // alert("Failed to add selected backgrounds. Please try again.");
          showCustomToast("Failed to add selected backgrounds. Please try again.", 'error'); // <-- UPDATED for error
      } finally {
          setIsLoading(false);
      }
  };

  // --- NEW: Function to handle submitting a new feature request by the user ---
  const handleNewFeatureRequestSubmit = async (e) => {
    e.preventDefault();
    if (!user || !newFeatureRequestText.trim()) {
      // alert('Please enter your feature idea before submitting.');
      showCustomToast('Please enter your feature idea before submitting.', 'error');
      return;
    }

    setIsSubmittingRequest(true);
    try {
      const userRequestsCollectionRef = collection(db, 'users', user.uid, 'featureRequests');
      const newRequestData = {
        title: newFeatureRequestText.trim(),
        createdAt: serverTimestamp(),
        status: 'submitted', 
      };

      await addDoc(userRequestsCollectionRef, newRequestData);
      
      setNewFeatureRequestText(''); 
      // alert('Your feature idea has been submitted! Thank you.');
      showCustomToast('Your feature idea has been submitted! Thank you.', 'success');
      
      await fetchFeatureRequests(); 

    } catch (error) {
      console.error("Error submitting new feature request:", error);
      // alert(`Failed to submit your idea: ${error.message}. Please try again.`);
      showCustomToast(`Failed to submit your idea: ${error.message}. Please try again.`, 'error');
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  // NEW: Function to show custom toast
  const showCustomToast = (message, type = 'info') => { // type can be 'info', 'success', 'error'
    setToastMessage({ text: message, type: type });
    setShowToast(true);

    // Clear existing timeout if any
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }

    // Auto-hide after 3 seconds (adjust as needed)
    toastTimeoutRef.current = setTimeout(() => {
      setShowToast(false);
    }, 3000);
  };

  // --- Handle Add TikTok Account --- // REWRITTEN FOR OAUTH
  const handleConnectTikTokAccount = async () => {
    if (!user) {
      showCustomToast("You must be logged in to connect a TikTok account.", "error");
      return;
    }
    setIsLoadingTikTok(true);
    try {
      const clientState = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      
      const redirectUri = "https://app.lungoai.com/auth/tiktok/callback"; 
      
      console.log(`[TikTok OAuth] Initiating with redirectUri: ${redirectUri}, state: ${clientState}`);

      // Call the backend function to get the auth URL
      // codeVerifier is no longer returned or used for Web OAuth flow
      const result = await getTikTokAuthUrl({ redirectUri, state: clientState }); 
      
      // Destructure state from result.data (authorizationUrl and returnedState)
      // codeVerifier is removed.
      const { authorizationUrl, state: returnedState } = result.data; 

      if (authorizationUrl && returnedState) { // Check for authorizationUrl and returnedState
        // Store the state and code verifier (if any) in sessionStorage to verify on callback
        localStorage.setItem('tiktok_oauth_state', returnedState); // CHANGED to localStorage
        // sessionStorage.setItem('tiktok_code_verifier', codeVerifier); // No longer needed
        
        console.log(`[TikTok OAuth] Received auth URL: ${authorizationUrl}`);
        console.log(`[TikTok OAuth] Stored state in localStorage: ${returnedState}`);
        // console.log(`[TikTok OAuth] Stored codeVerifier (first 10): ${codeVerifier.substring(0,10)}...`); // No longer needed
        
        window.location.href = authorizationUrl; // Redirect user to TikTok
      } else {
        // Update error message to reflect missing authorizationUrl or state
        throw new Error("Could not retrieve TikTok authorization URL or state from backend."); 
      }
    } catch (error) {
      console.error("Error initiating TikTok OAuth:", error);
      showCustomToast(`Error connecting TikTok: ${error.message || 'Unknown error'}`, "error");
    } finally {
      setIsLoadingTikTok(false);
    }
  };

  // --- Handle Delete TikTok Account ---
  const handleDeleteTiktokAccount = async (accountId, accountUsername) => {
    if (!user || !accountId) {
      showCustomToast("User or Account ID missing.", "error");
      return;
    }
    // Using window.confirm for simplicity, replace with a custom modal if preferred
    const confirmDelete = window.confirm(`Are you sure you want to disconnect the TikTok account: ${accountUsername || accountId}?`);
    if (!confirmDelete) {
      return;
    }

    setIsLoadingTikTok(true);
    try {
      const accountRef = doc(db, 'users', user.uid, 'tiktokAccounts', accountId);
      await deleteDoc(accountRef);
      showCustomToast(`TikTok account ${accountUsername || accountId} disconnected successfully.`, "success");
      // setTiktokAccounts(prev => prev.filter(acc => acc.id !== accountId)); // State updates via listener
    } catch (error) {
      console.error("Error deleting TikTok account:", error);
      showCustomToast(`Error disconnecting TikTok account: ${error.message}`, "error");
    } finally {
      setIsLoadingTikTok(false);
    }
  };

  // Main component return - Notion-style with sidebar
  return (
    <div className="flex justify-center pt-4">
      {/* Main content container with Notion-style sidebar layout */}
      <div className="flex max-w-6xl w-full mx-auto">
        {/* Sidebar - clean borderless design */}
        <aside className="w-56 min-h-screen sticky top-0 pt-4">
          <div className="pr-4">            
            <nav className="space-y-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    w-full text-left px-3 py-2 rounded-md flex items-center gap-2.5 transition-colors duration-150 ease-in-out
                    ${activeTab === tab.id
                      ? 'bg-gray-100 dark:bg-zinc-800 text-black dark:text-white font-medium' 
                      : 'text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-900/50 hover:text-black dark:hover:text-white'}
                  `}
                  aria-current={activeTab === tab.id ? 'page' : undefined}
                >
                  {React.cloneElement(tab.icon, { weight: activeTab === tab.id ? 'fill' : 'regular' })} 
                  <span className="text-sm">{tab.label}</span>
                  
                  {activeTab === tab.id && (
                    <span className="ml-auto h-5 w-1 bg-black dark:bg-white rounded-full"></span> 
                  )}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        <main className="flex-1 py-4 px-8 border-l border-gray-100 dark:border-zinc-800/60 min-h-screen relative"> {/* Added relative for toast positioning */}
          <div>
            {renderTabContent()}
          </div>

          {/* --- NEW: Custom Toast Notification --- */}
          {showToast && toastMessage && (
            <div 
              className={`fixed top-5 right-5 z-[100] px-6 py-3 rounded-lg shadow-lg text-sm font-medium transition-all duration-300 ease-in-out transform ${showToast ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'} 
                          ${toastMessage.type === 'success' ? 'bg-green-500 text-white' : 
                            toastMessage.type === 'error' ? 'bg-red-500 text-white' : 
                            'bg-gray-800 text-white dark:bg-gray-100 dark:text-black'}`}
            >
              {toastMessage.text}
              <button 
                onClick={() => setShowToast(false)} 
                className="absolute top-1 right-1 p-0.5 text-current hover:opacity-75"
              >
                <X size={14} weight="bold"/>
              </button>
            </div>
          )}
          {/* --- End Custom Toast Notification --- */}
        </main>
      </div>

      {/* ---- Generic Delete Confirmation Modal (for Backgrounds & Creators) ---- */}
      {showDeleteConfirmModal && itemToDelete && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity duration-200"
          onClick={() => setShowDeleteConfirmModal(false)} // Close on backdrop click
        >
          <div 
            className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()} // Prevent closing modal when clicking inside
          >
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  {/* Dynamic Icon */}
                  {itemToDelete?.type === 'creator' ? (
                     <UserCircle size={24} className="text-red-600 dark:text-red-400" />
                  ) : (
                     <WarningCircle size={24} className="text-red-600 dark:text-red-400" />
                  )}
                </div>
                <div className="flex-1">
                   {/* Dynamic Title */}
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                     {itemToDelete?.type === 'creator' ? 'Delete Creator?' : 'Remove Background?'}
                  </h3>
                   {/* Dynamic Text */}
                  <p className="mt-2 text-sm text-gray-600 dark:text-zinc-400">
                    {itemToDelete?.type === 'creator' ? (
                        <>Are you sure you want to delete the creator "<span className="font-semibold">{itemToDelete.name || 'this creator'}</span>"? This will also permanently delete their image file.</>
                    ) : (
                        <>Are you sure you want to remove the background "<span className="font-semibold">{itemToDelete.name || 'this background'}</span>" from your list? 
                        {itemToDelete.isFromLibrary 
                          ? " It will remain in the shared library." 
                          : " This will also permanently delete the uploaded file."
                        }</>
                    )}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-zinc-800/50 px-6 py-4 flex flex-col sm:flex-row-reverse sm:gap-3">
              <button
                type="button"
                disabled={isLoading}
                onClick={confirmItemDeletion} // Use the updated handler
                className="w-full sm:w-auto inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:focus:ring-offset-zinc-900 sm:text-sm disabled:opacity-50"
              >
                 {/* Dynamic Button Text */}
                {isLoading ? 'Processing...' : (itemToDelete?.type === 'creator' ? 'Delete Creator' : 'Remove Background')}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirmModal(false)}
                disabled={isLoading}
                className="mt-3 w-full sm:mt-0 sm:w-auto inline-flex justify-center rounded-md border border-gray-300 dark:border-zinc-600 shadow-sm px-4 py-2 bg-white dark:bg-zinc-700 text-base font-medium text-gray-700 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-zinc-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 dark:focus:ring-offset-zinc-900 sm:text-sm disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Product Delete Confirmation Modal ---- */}
       {showDeleteProductConfirmModal && productToDelete && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity duration-200"
          onClick={() => setShowDeleteProductConfirmModal(false)} // Close on backdrop click
        >
          <div 
            className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()} // Prevent closing modal when clicking inside
          >
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <Package size={24} className="text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Delete Product?</h3>
                  <p className="mt-2 text-sm text-gray-600 dark:text-zinc-400">
                    Are you sure you want to delete the product "<span className="font-semibold">{productToDelete.name || 'this product'}</span>"? 
                    This will permanently delete the product data, its logo, and its associated media file. This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-zinc-800/50 px-6 py-4 flex flex-col sm:flex-row-reverse sm:gap-3">
              <button
                type="button"
                disabled={isLoading}
                onClick={confirmProductDeletion}
                className="w-full sm:w-auto inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:focus:ring-offset-zinc-900 sm:text-sm disabled:opacity-50"
              >
                {isLoading ? 'Deleting...' : 'Delete Product'}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteProductConfirmModal(false)}
                disabled={isLoading}
                className="mt-3 w-full sm:mt-0 sm:w-auto inline-flex justify-center rounded-md border border-gray-300 dark:border-zinc-600 shadow-sm px-4 py-2 bg-white dark:bg-zinc-700 text-base font-medium text-gray-700 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-zinc-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 dark:focus:ring-offset-zinc-900 sm:text-sm disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* ---- NEW: Account Delete Confirmation Modal ---- */}
       {showDeleteAccountConfirmModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity duration-200"
          onClick={() => setShowDeleteAccountConfirmModal(false)} 
        >
          <div 
            className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()} 
          >
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <WarningCircle size={24} className="text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Delete Your Account?</h3>
                  <p className="mt-2 text-sm text-gray-600 dark:text-zinc-400">
                    Are you absolutely sure you want to delete your account? This action is <span className="font-bold">permanent and cannot be undone</span>. 
                    All your data, including products, creators, generated content history, and settings will be permanently removed.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-zinc-800/50 px-6 py-4 flex flex-col sm:flex-row-reverse sm:gap-3">
              <button
                type="button"
                disabled={isLoading}
                onClick={confirmDeleteAccount}
                className="w-full sm:w-auto inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:focus:ring-offset-zinc-900 sm:text-sm disabled:opacity-50"
              >
                {isLoading ? (<><CircleNotch size={16} className="animate-spin mr-2" /> Deleting...</>) : 'Yes, Delete My Account'}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteAccountConfirmModal(false)}
                disabled={isLoading}
                className="mt-3 w-full sm:mt-0 sm:w-auto inline-flex justify-center rounded-md border border-gray-300 dark:border-zinc-600 shadow-sm px-4 py-2 bg-white dark:bg-zinc-700 text-base font-medium text-gray-700 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-zinc-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 dark:focus:ring-offset-zinc-900 sm:text-sm disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Settings; 