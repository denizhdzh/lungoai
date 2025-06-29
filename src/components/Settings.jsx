import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation, useOutletContext } from 'react-router-dom';
import { auth, db, storage, functions } from '../firebase';
import { updateProfile, updatePassword as firebaseUpdatePassword, reauthenticateWithCredential, EmailAuthProvider, deleteUser as firebaseDeleteUser } from 'firebase/auth';
import { doc, collection, addDoc, getDocs, updateDoc, deleteDoc, setDoc, query, orderBy, where, Timestamp, onSnapshot, serverTimestamp, getDoc } from '@firebase/firestore';
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from '@firebase/storage';
// Import Firebase Functions
import { getFunctions, httpsCallable } from 'firebase/functions'; 
import { Sun, Moon, X, Plus, PencilSimple, Trash, User, Package, Camera, Image as ImageIcon, TiktokLogo, ClockCounterClockwise, CaretRight, CheckCircle, ImagesSquare, WarningCircle, FilmSlate, UserCircle, ArrowUp, Star, MagnifyingGlass, Sparkle, CircleNotch, SignOut, CreditCard, ArrowSquareOut, AppWindow, UserFocus, Mountains as BackgroundPlaceholderIcon, Lightbulb, UploadSimple, LinkBreak, Link as LinkIcon, Palette, Lock, Check, Info, Cube, UserPlus, ImageSquare as TikTokImageIcon, UsersThree, Eye, EyeSlash } from '@phosphor-icons/react';
import PricingSection from './PricingSection'; // Import the PricingSection component

// Helper to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Initialize Firebase Functions (if not already initialized in firebase.js)
// const functions = getFunctions(); // Assuming functions is already exported from firebase.js
const createStripePortalSessionCallable = httpsCallable(functions, 'createStripePortalSession');
const connectTikTokAccountCallable = httpsCallable(functions, 'connectTikTokAccount');
const getTikTokUserDetailsCallable = httpsCallable(functions, 'getTikTokUserDetails');
const requestTikTokVideoUploadCallable = httpsCallable(functions, 'requestTikTokVideoUpload');
const getPexelsImagesCallable = httpsCallable(functions, 'getPexelsImages'); 
const submitFeatureRequestCallable = httpsCallable(functions, 'submitFeatureRequest');
const voteFeatureRequestCallable = httpsCallable(functions, 'voteFeatureRequest');
const deleteTikTokIntegrationCallable = httpsCallable(functions, 'deleteTikTokIntegration');
const generateProductTopicsCallable = httpsCallable(functions, 'generateProductTopics');
const generateImageDescription = httpsCallable(functions, 'generateImageDescription');
const manuallyStandardizeProductVideo = httpsCallable(functions, 'manuallyStandardizeProductVideo');

function Settings() {
  const { user, isDarkMode, products, creators, backgrounds, refreshLayoutData, firestoreUserData: layoutFirestoreUserData, handleManageBilling: layoutHandleManageBilling, setIsPricingModalOpen: layoutSetIsPricingModalOpen } = useOutletContext() || {};
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState('user'); // Default to user tab
  
  // --- Profile States ---
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [previewURL, setPreviewURL] = useState('');
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  
  // --- Modal States ---
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [showDeleteProductConfirmModal, setShowDeleteProductConfirmModal] = useState(false);
  const [showDeleteAccountConfirmModal, setShowDeleteAccountConfirmModal] = useState(false);
  const [showDeleteTikTokConfirmModal, setShowDeleteTikTokConfirmModal] = useState(false);

  const [isLoading, setIsLoading] = useState(true); // For initial data loading
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('info'); // 'info', 'success', 'error', 'warning'

  // --- Product States ---
  const [userProducts, setUserProducts] = useState([]);
  const [showAddProductForm, setShowAddProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productToDelete, setProductToDelete] = useState(null);
  const [shouldOpenAddProductForm, setShouldOpenAddProductForm] = useState(false);
  
  // --- Form-specific states for Product ---
  const [productNameForForm, setProductNameForForm] = useState('');
  const [productDescriptionForForm, setProductDescriptionForForm] = useState('');
  const [productLogoFileForForm, setProductLogoFileForForm] = useState(null);
  const [productMediaFileForForm, setProductMediaFileForForm] = useState(null);
  const [currentLogoUrlInForm, setCurrentLogoUrlInForm] = useState(null);
  const [currentMediaUrlInForm, setCurrentMediaUrlInForm] = useState(null);
  const [currentMediaTypeInForm, setCurrentMediaTypeInForm] = useState('image');
  const [isGeneratingTopics, setIsGeneratingTopics] = useState(false);
  const [topicsForEditingProduct, setTopicsForEditingProduct] = useState([]);

  // App Persona States (Formerly Creators)
  const [userAppPersonas, setUserAppPersonas] = useState([]);
  const [newAppPersonaName, setNewAppPersonaName] = useState('');
  const [newAppPersonaImage, setNewAppPersonaImage] = useState(null);
  const [newAppPersonaImagePreview, setNewAppPersonaImagePreview] = useState(null);
  const [isUploadingAppPersona, setIsUploadingAppPersona] = useState(false);
  const [isAddingAppPersona, setIsAddingAppPersona] = useState(false);
  const [showDeleteAppPersonaModal, setShowDeleteAppPersonaModal] = useState(false);
  const [appPersonaToDelete, setAppPersonaToDelete] = useState(null);
  const [isDeletingAppPersona, setIsDeletingAppPersona] = useState(false);

  // Creator States
  const [userCreators, setUserCreators] = useState(creators || []);
  const [newCreatorName, setNewCreatorName] = useState('');
  const [newCreatorFile, setNewCreatorFile] = useState(null);
  const [newCreatorImagePreview, setNewCreatorImagePreview] = useState(null);
  const [isUploadingCreator, setIsUploadingCreator] = useState(false);
  const [isAddingCreator, setIsAddingCreator] = useState(false);
  const [showDeleteCreatorModal, setShowDeleteCreatorModal] = useState(false);
  const [creatorToDelete, setCreatorToDelete] = useState(null);
  const [isDeletingCreator, setIsDeletingCreator] = useState(false);
  const [showAddCreatorForm, setShowAddCreatorForm] = useState(false);

  // TikTok Background States (Formerly Backgrounds)
  const [userTikTokBackgrounds, setUserTikTokBackgrounds] = useState([]);
  const [newTikTokBackgroundName, setNewTikTokBackgroundName] = useState('');
  const [newTikTokBackgroundImage, setNewTikTokBackgroundImage] = useState(null);
  const [newTikTokBackgroundImagePreview, setNewTikTokBackgroundImagePreview] = useState(null);
  const [isUploadingTikTokBackground, setIsUploadingTikTokBackground] = useState(false);
  const [isAddingTikTokBackground, setIsAddingTikTokBackground] = useState(false);
  const [showDeleteTikTokBackgroundModal, setShowDeleteTikTokBackgroundModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null); // Generic for background or library image deletion
  const [isDeletingTikTokBackground, setIsDeletingTikTokBackground] = useState(false);
  const [tikTokBackgroundSearchTerm, setTikTokBackgroundSearchTerm] = useState('');
  
  // --- Background States ---
  const [userBackgrounds, setUserBackgrounds] = useState(backgrounds || []);
  const [userBackgroundUrls, setUserBackgroundUrls] = useState(new Set());
  const [newBackgroundName, setNewBackgroundName] = useState('');
  const [newBackgroundFile, setNewBackgroundFile] = useState(null);
  const [showAddBackgroundForm, setShowAddBackgroundForm] = useState(false);

  // --- Library States ---
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryImages, setLibraryImages] = useState([]);
  const [selectedLibraryImages, setSelectedLibraryImages] = useState([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  
  const [libraryTikTokBackgrounds, setLibraryTikTokBackgrounds] = useState([]);
  const [selectedLibraryTikTokImages, setSelectedLibraryTikTokImages] = useState([]);
  const [isLoadingTikTokLibrary, setIsLoadingTikTokLibrary] = useState(false);

  // Billing & Plan States
  const [userSubscription, setUserSubscription] = useState(null);
  const [isFetchingSubscription, setIsFetchingSubscription] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState(null);

  // TikTok Accounts State
  const [tiktokAccounts, setTiktokAccounts] = useState([]);
  const [isLoadingTikTok, setIsLoadingTikTok] = useState(false);
  const [isLoadingAction, setIsLoadingAction] = useState({}); // For individual account actions
  const [showDeleteTikTokAccountModal, setShowDeleteTikTokAccountModal] = useState(false);
  const [tikTokAccountToDelete, setTikTokAccountToDelete] = useState(null);
  const [isDeletingTikTokAccount, setIsDeletingTikTokAccount] = useState(false);

  // Feature Requests State
  const [featureRequests, setFeatureRequests] = useState([]);
  const [newFeatureTitle, setNewFeatureTitle] = useState('');
  const [newFeatureDescription, setNewFeatureDescription] = useState('');
  const [newFeatureRequestText, setNewFeatureRequestText] = useState('');
  const [isSubmittingFeature, setIsSubmittingFeature] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [userVotes, setUserVotes] = useState({}); // Store user's votes {requestId: true}
  const [votingCooldown, setVotingCooldown] = useState({});
  const [userPrivateRequests, setUserPrivateRequests] = useState([]);
  const [isFetchingRequests, setIsFetchingRequests] = useState(false);

  // UI Refs
  const toastTimeoutRef = useRef(null); 

  // For managing image uploads and previews
  const logoInputRef = useRef(null);
  const mediaInputRef = useRef(null);
  const productLogoInputRef = useRef(null);
  const productMediaInputRef = useRef(null);
  const personaImageInputRef = useRef(null);
  const tikTokBgImageInputRef = useRef(null);
  const creatorFileInputRef = useRef(null);
  const backgroundFileInputRef = useRef(null);

  const showCustomToast = useCallback((message, type = 'info', duration = 3000) => {
    setToastMessage({ text: message, type: type });
    setShowToast(true);

    // Clear existing timeout if any
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }

    // Auto-hide after 3 seconds (adjust as needed)
    toastTimeoutRef.current = setTimeout(() => {
      setShowToast(false);
    }, duration);
  }, []);

  // --- NEW: useEffect to load user data from Firestore for the profile form ---
  useEffect(() => {
    if (user && user.uid) {
      const userDocRef = doc(db, 'users', user.uid);
      const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setFirstName(data.firstName || '');
          setLastName(data.lastName || '');
          setEmail(data.email || '');
          setPhotoURL(data.photoURL || user.photoURL || ''); // Fallback to auth user photoURL
          // If displayName was used to prefill and now we have specific fields:
          // No, displayName is constructed, so this is fine.
        } else {
          // Document doesn't exist, try to populate from auth.currentUser if available
          console.log("User document not found in Firestore for settings, attempting to populate from auth profile.");
          if (user.displayName) {
            const nameParts = user.displayName.split(' ');
            setFirstName(nameParts[0] || '');
            setLastName(nameParts.slice(1).join(' ') || '');
          } else {
            setFirstName('');
            setLastName('');
          }
          setPhotoURL(user.photoURL || '');
        }
      }, (error) => {
        console.error("Error fetching user document from Firestore for settings:", error);
        // Fallback to auth user details on error
        if (user.displayName) {
          const nameParts = user.displayName.split(' ');
          setFirstName(nameParts[0] || '');
          setLastName(nameParts.slice(1).join(' ') || '');
        }
        setPhotoURL(user.photoURL || '');
      });
      return () => unsubscribe(); // Cleanup listener
    } else {
      // No user, clear fields
      setFirstName('');
      setLastName('');
      setEmail('');
      setPhotoURL('');
    }
  }, [user]); // Rerun if user object changes
  // --- END NEW useEffect ---

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

  // --- NEW: useEffect to set activeTab from URL hash and update hash on tab click ---
  useEffect(() => {
    const hash = location.hash.replace('#', '');
    const params = new URLSearchParams(location.search);
    const action = params.get('action');

    const isValidTab = tabs.some(tab => tab.id === hash);
    if (hash && isValidTab) {
      setActiveTab(hash);
      if (hash === 'products' && action === 'add') {
        setShouldOpenAddProductForm(true);
        // Clear the action param from URL
        navigate(`${location.pathname}#${hash}`, { replace: true }); 
      }
    } else if (!hash && location.pathname === '/settings') {
      navigate('#user', { replace: true });
      setActiveTab('user');
    }
  }, [location.hash, location.search, navigate, tabs]);

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    navigate(`#${tabId}`); // Update URL hash
  };
  // --- END NEW useEffect ---

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
      
      // Open add product form if directed from URL and tab is products
      if (activeTab === 'products' && shouldOpenAddProductForm) {
        setShowAddProductForm(true);
        setShouldOpenAddProductForm(false); // Reset the flag
      }

      // NEW: Reset TikTok form when tab changes or data is fetched
      // setShowAddTiktokAccountForm(false); // REMOVED
      // setNewTiktokAccount({ username: '' }); // REMOVED
      try {
        if (user) {
          if (activeTab === 'products') {
            await fetchUserData('products', setUserProducts, "createdAt", "desc");
          } else if (activeTab === 'tiktok') {
            // TikTok uses its own listener setup in another useEffect
            // await fetchTikTokAccounts(); // This is handled by its own useEffect
          } else if (activeTab === 'creators') {
            await fetchUserData('creators', setUserCreators, "createdAt", "desc");
          } else if (activeTab === 'backgrounds') {
            await fetchUserData('backgrounds', (data) => {
              setUserBackgrounds(data);
              setUserBackgroundUrls(new Set(data.map(bg => bg.imageUrl)));
            }, "createdAt", "desc");
          } else if (activeTab === 'featureRequests') {
            // No initial fetch needed here as it's handled by fetchFeatureRequests
            await fetchFeatureRequests(); // Fetch features when tab is active
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
  }, [activeTab, user, shouldOpenAddProductForm]); // Removed fetchUserData from dependencies as it's stable, added shouldOpenAddProductForm

  // --- NEW: Fetch TikTok Accounts ---
  useEffect(() => {
    if (activeTab !== 'tiktok' || !user) {
      // If the tab is not 'tiktok', or no user, ensure to clean up any previous listener
      // and clear the accounts data.
      if (typeof window.unsubscribeTikTok === 'function') {
        window.unsubscribeTikTok();
        window.unsubscribeTikTok = null; // Clear the global reference
      }
      setTiktokAccounts([]);
      return;
    }

    setIsLoadingTikTok(true);
    // Query for all TikTok integrations
    const q = query(collection(db, 'users', user.uid, 'integrations'), where('type', '==', 'tiktok'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const accounts = [];
      querySnapshot.forEach((doc) => {
        accounts.push({ id: doc.id, ...doc.data() });
      });
      setTiktokAccounts(accounts);
      setIsLoadingTikTok(false);
      if (accounts.length > 0) {
        console.log("[Settings - TikTok] Fetched TikTok integrations:", accounts);
      } else {
        console.log("[Settings - TikTok] No TikTok integrations found for this user.");
      }
    }, (error) => {
      console.error("[Settings - TikTok] Error fetching TikTok integrations: ", error);
      showCustomToast("Error fetching TikTok accounts.", "error");
      setTiktokAccounts([]);
      setIsLoadingTikTok(false);
    });

    // Store the unsubscribe function on a global or ref to call it on cleanup or when tab changes
    window.unsubscribeTikTok = unsubscribe;

    return () => {
      if (typeof window.unsubscribeTikTok === 'function') {
        window.unsubscribeTikTok();
        window.unsubscribeTikTok = null;
      }
    };
  }, [activeTab, user]); // Re-run when activeTab or user changes

  // --- END NEW/REVISED TIKTOK ACCOUNT FETCHING LOGIC ---

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
    if (userProducts.length >= 1 && !editingProduct) { // Check only if NOT editing
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
            // Check if it's a timeout error vs a real error
            if (error.code === 'deadline-exceeded') {
              console.log('[Add Product] Video standardization taking longer than expected, but continuing in background');
              showCustomToast('Video uploaded successfully! Video processing is continuing in the background.', 'info');
            } else {
              standardizationError = error.message; // Capture real error for initial doc write if needed
              showCustomToast(`Error starting video standardization: ${error.message}`, 'error');
            }
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
      
      // Generate topics for the product in background
      generateProductTopicsCallable({
        userId: user.uid,
        productId: newProductId,
        productName: name,
        productDescription: description
      }).then(result => {
        console.log('[Add Product] Topic generation INITIATED (background).', result);
        if (result.data && result.data.success) {
          showCustomToast('Product topics generated!', 'success');
        }
      }).catch(error => {
        console.error('[Add Product] Error generating topics (background):', error);
        // Don't show error to user, it's background process
      });
      
      setUserProducts(prev => {
        // Check if product already exists to avoid duplicates
        const productExists = prev.some(p => p.id === newProductId);
        if (productExists) {
          return prev.map(p => p.id === newProductId ? { ...productData, createdAt: new Date() } : p)
            .sort((a, b) => b.createdAt - a.createdAt);
        } else {
          return [{ ...productData, createdAt: new Date() }, ...prev]
            .sort((a, b) => b.createdAt - a.createdAt);
        }
      });
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
            // Check if it's a timeout error vs a real error
            if (error.code === 'deadline-exceeded') {
              console.log('[Update Product] Video standardization taking longer than expected, but continuing in background');
              showCustomToast('Video updated successfully! Video processing is continuing in the background.', 'info');
            } else {
              standardizationError = error.message; // Capture real error for initial doc write if needed
              showCustomToast(`Error starting video standardization: ${error.message}`, 'error');
            }
          });
        }
      }
      
      if (newMediaType === 'video' && standardizationError) {
          updatedData.standardizationError = standardizationError;
      } else if (newMediaType === 'video' && !standardizationError && productMediaFileForForm) { // only add attempt timestamp if new video was uploaded and no immediate call error
          updatedData.standardizationAttemptTimestamp = serverTimestamp();
      }


      await updateDoc(productRef, updatedData);
      setUserProducts(prevProducts => prevProducts.map(p => p.id === editingProduct.id ? { ...p, ...updatedData, logoUrl: newLogoUrl, mediaUrl: newMediaUrl, mediaType: newMediaType } : p).sort((a,b) => b.createdAt - a.createdAt));
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

    if (userProducts.length === 1) {
      showCustomToast('You cannot delete your last product. You must have at least one product.', 'error');
      return;
    }

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
      setUserProducts(prev => prev.filter(p => p.id !== id));
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
      
      setUserCreators(prev => [...prev, { id: docRef.id, ...creatorData }]);
      
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
            <span className="text-sm font-medium text-stone-800 dark:text-stone-200">
              User Profile
            </span>
            <span className="mx-2 h-1 w-1 rounded-full bg-neutral-400 dark:bg-neutral-500"></span>
            <span className="text-sm text-stone-500 dark:text-stone-400">
              Manage your personal information
            </span>
          </div>
          
          <p className="mb-8 text-base text-stone-600 dark:text-stone-400 max-w-2xl">
            Update your profile details and manage your account settings.
          </p>
          
          <div className="mb-12 border-b border-stone-100 dark:border-stone-800 pb-8">
            <div className="flex flex-col md:flex-row gap-8">
              {/* Make the parent div rounded for circular hover effect */}
              <div className="relative group flex-shrink-0 w-24 h-24 rounded-full">
                <img 
                  src={previewURL || photoURL || '/pp-placeholder.jpeg'} 
                  alt="Profile" 
                  className="w-24 h-24 rounded-full object-cover shadow-sm hover:shadow-md transition-all duration-200"
                />
                <label className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <PencilSimple size={22} className="text-stone-100" />
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
                  <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
                    First Name
                  </label>
                  <input 
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-neutral-100 dark:bg-neutral-900 text-stone-900 dark:text-stone-100 rounded-md border-0 shadow-sm ring-1 ring-inset ring-stone-200 dark:ring-stone-800 placeholder:text-stone-400 focus:ring-2 focus:ring-inset focus:ring-black dark:focus:ring-stone-100 transition-all duration-200"
                    placeholder="First Name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
                    Last Name
                  </label>
                  <input 
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-neutral-100 dark:bg-neutral-900 text-stone-900 dark:text-stone-100 rounded-md border-0 shadow-sm ring-1 ring-inset ring-stone-200 dark:ring-stone-800 placeholder:text-stone-400 focus:ring-2 focus:ring-inset focus:ring-black dark:focus:ring-stone-100 transition-all duration-200"
                    placeholder="Last Name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
                    Email Address
                  </label>
                  <div className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-900/50 text-stone-500 dark:text-stone-400 rounded-md border-0 shadow-sm ring-1 ring-inset ring-stone-200 dark:ring-stone-800 flex items-center">
                    {user?.email || 'No email available'}
                  </div>
                </div>
                
                <button
                  onClick={updateUserProfile}
                  disabled={isLoading}
                  className={`px-5 py-2.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center justify-center ${
                    isLoading 
                      ? 'bg-neutral-100 dark:bg-neutral-800 text-stone-400 dark:text-stone-500 cursor-not-allowed' 
                      : 'bg-black dark:bg-neutral-100 text-stone-100 dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-200 shadow-sm hover:shadow'
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
                <span className="text-sm font-medium text-stone-800 dark:text-stone-200">
                  Account Actions
                </span>
                <span className="mx-2 h-1 w-1 rounded-full bg-neutral-400 dark:bg-neutral-500"></span>
                <span className="text-sm text-stone-500 dark:text-stone-400">
                  Manage your account
                </span>
              </div>
              
              <div className="flex flex-wrap gap-4">
                <button
                  onClick={handleLogout}
                  disabled={isLoading}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium transition-all duration-200 ${
                    isLoading
                      ? 'bg-neutral-50 dark:bg-neutral-900 text-stone-400 dark:text-stone-500 cursor-not-allowed'
                      : 'bg-neutral-100 dark:bg-neutral-900 shadow-sm hover:shadow text-stone-700 dark:text-stone-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 ring-1 ring-inset ring-stone-200 dark:ring-stone-800 hover:ring-stone-300 dark:hover:ring-stone-700'
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
                      : 'bg-neutral-100 dark:bg-neutral-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 shadow-sm hover:shadow ring-1 ring-inset ring-red-200 dark:ring-red-900/30 hover:ring-red-300 dark:hover:ring-red-800/50'
                  }`}
                >
                  <Trash size={18} weight="bold" />
                  Delete Account
                </button>
              </div>
              
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-3">
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
             const result = await createStripePortalSessionCallable();
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
              <span className="text-sm font-medium text-stone-800 dark:text-stone-200">
                Plan & Billing
              </span>
              <span className="mx-2 h-1 w-1 rounded-full bg-neutral-400 dark:bg-neutral-500"></span>
              <span className="text-sm text-stone-500 dark:text-stone-400">
                Manage your subscription and billing details
              </span>
            </div>
            <p className="text-base text-stone-600 dark:text-stone-400 max-w-2xl">
           View your current plan, upgrade options, or manage your payment methods and billing history.
          </p>
          </div>
          {/* Render the PricingSection - Pass subscription data */}
          {isFetchingSubscription ? (
             <div className="flex justify-center items-center py-20">
                <CircleNotch size={28} weight="regular" className="animate-spin text-stone-400 dark:text-stone-500 mr-3" />
                <span className="text-base text-stone-500 dark:text-stone-400">Loading plan details...</span>
             </div>
          ) : (
             <PricingSection id="settings-pricing" subscriptionData={userSubscription} user={user} /> 
          )}

          {/* Manage Billing Button Area - Added below PricingSection */} 
          {!isFetchingSubscription && userSubscription?.stripeCustomerId && (userSubscription?.subscriptionStatus === 'active' || userSubscription?.subscriptionStatus === 'trialing') && (
             <div className="mt-12 pt-8 border-t border-stone-100 dark:border-stone-800 flex flex-col items-start">
                <h3 className="text-base font-medium text-stone-800 dark:text-stone-200 mb-3">Manage Your Subscription</h3>
                <p className="text-sm text-stone-600 dark:text-stone-400 mb-4 max-w-xl">
                   Need to update your payment method, view invoices, or cancel your plan? Access the secure customer portal.
                </p>
                <button 
                   onClick={handleManageBilling}
                   disabled={isPortalLoading || !userSubscription?.stripeCustomerId} // Disable if loading or no customer ID
                   className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm hover:shadow ${
                      isPortalLoading 
                         ? 'bg-neutral-100 dark:bg-neutral-800 text-stone-400 dark:text-stone-500 cursor-wait' 
                         : !userSubscription?.stripeCustomerId
                            ? 'bg-neutral-100 dark:bg-neutral-800 text-stone-400 dark:text-stone-500 cursor-not-allowed' // Disabled style if no customer ID
                            : 'bg-neutral-100 dark:bg-neutral-900 text-black dark:text-stone-100 ring-1 ring-inset ring-stone-200 dark:ring-stone-700 hover:bg-neutral-50 dark:hover:bg-neutral-800'
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
                     <p className="mt-3 text-xs text-stone-500 dark:text-stone-500">Subscribe to a plan to manage billing.</p>
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
              <span className="text-sm font-medium text-stone-800 dark:text-stone-200">
                Products
              </span>
              <span className="mx-2 h-1 w-1 rounded-full bg-neutral-400 dark:bg-neutral-500"></span>
              <span className="text-sm text-stone-500 dark:text-stone-400">
                Manage your product information
              </span>
            </div>
            <p className="text-base text-stone-600 dark:text-stone-400 max-w-2xl mb-8">
              Add, edit, or remove products. This information is used to generate relevant TikTok content.
            </p>
        </div>

      {/* Action Button - Moved below header */}
      <div className="flex justify-end border-b border-stone-100 dark:border-stone-800 pb-4">
        <button 
          onClick={() => {
            // If trying to open the form (i.e., showAddProductForm is currently false) 
            // and product limit is reached, prevent opening and show alert.
            if (!showAddProductForm && userProducts.length >= 1) {
              alert('You can only add one product. Delete the existing one to add a new product.');
              return;
            }
            // Otherwise, toggle the form visibility as usual.
            setShowAddProductForm(!showAddProductForm);
            if (editingProduct) { // If was editing, reset form when cancelling
              resetProductForm();
            }
          }}
          // Disable button if it's in the "Add Product" state (showAddProductForm is false)
          // AND the product limit (userProducts.length >= 1) is reached.
          // The button acts as "Cancel" when showAddProductForm is true, so it shouldn't be disabled then based on product count.
          // disabled={!showAddProductForm && userProducts.length >= 1}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg transition-colors 
                      bg-neutral-900 text-stone-100 dark:bg-neutral-100 dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-200
                    `}
        >
          {showAddProductForm ? <X size={16} /> : <Plus size={16} />}
          {showAddProductForm ? 'Cancel' : 'Add Product'}
        </button>
      </div>
      
      {/* Add Product Form with improved layout */}
      {showAddProductForm && (
        <form onSubmit={handleAddProduct} className="p-6 border border-stone-100 dark:border-stone-800 rounded-lg space-y-5 bg-neutral-50/50 dark:bg-neutral-900/30 mb-6">
          <h3 className="text-lg font-medium text-black dark:text-stone-100 mb-2">
            {editingProduct ? 'Edit Product' : 'Add New Product'}
          </h3>
          <div>
            <label className="block text-sm text-stone-700 dark:text-stone-300 mb-1.5">
              Product Name <span className="text-red-500">*</span>
            </label>
            <input 
              type="text"
              value={productNameForForm}
              onChange={(e) => setProductNameForForm(e.target.value)}
              placeholder="e.g., Super Widget"
              required
              className="w-full px-3 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-stone-200 dark:border-stone-700 text-black dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-stone-300 dark:focus:ring-stone-600"
            />
          </div>
          <div>
            <label className="block text-sm text-stone-700 dark:text-stone-300 mb-1.5">
              Description <span className="text-red-500">*</span> <span className="text-xs text-stone-400 dark:text-stone-500">(Min 50 chars)</span>
            </label>
            <textarea 
              value={productDescriptionForForm}
              onChange={(e) => setProductDescriptionForForm(e.target.value)}
              placeholder="Describe the product, its benefits, target audience, key selling points... Be detailed! (Min 50 chars)"
              rows={4}
              required
              minLength={50} // <-- CHANGED FROM 150 to 50
              className="w-full px-3 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-stone-200 dark:border-stone-700 text-black dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-stone-300 dark:focus:ring-stone-600"
            />
             {/* Character Counter with improved visual feedback */}
            <p className={`text-xs mt-1.5 ${productDescriptionForForm.length >= 50 ? 'text-green-600 dark:text-green-400' : 'text-stone-500 dark:text-stone-400'}`}>
                {productDescriptionForForm.length} / 50 characters {productDescriptionForForm.length < 50 ? `(${50 - productDescriptionForForm.length} more needed)` : '✓'}
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm text-stone-700 dark:text-stone-300 mb-1.5">
                Product Logo {editingProduct ? '(Optional: Change)' : <span className="text-red-500">*</span>}
              </label>
              {editingProduct && currentLogoUrlInForm && (
                <div className="mb-2">
                  <p className="text-xs text-stone-500 dark:text-stone-400 mb-1">Current Logo:</p>
                  <img src={currentLogoUrlInForm} alt="Current product logo" className="max-h-20 rounded border border-stone-200 dark:border-stone-700 p-1 bg-neutral-100 dark:bg-neutral-800" />
                </div>
              )}
              <input 
                type="file" 
                accept="image/*" 
                ref={productLogoInputRef}
                onChange={(e) => setProductLogoFileForForm(e.target.files[0])}
                required={!editingProduct} // Required only if NOT editing
                className="w-full text-sm text-stone-500 dark:text-stone-400
                           file:mr-4 file:py-2 file:px-4
                           file:rounded-lg file:border-0
                           file:text-sm file:font-semibold
                           file:bg-neutral-100 file:dark:bg-neutral-800 
                           file:text-stone-700 file:dark:text-stone-200
                           hover:file:bg-neutral-200 hover:file:dark:bg-neutral-700
                           cursor-pointer"
              />
              {productLogoFileForForm && (
                  <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">Selected Logo: {productLogoFileForForm.name}</p>
              )}
            </div>
            <div>
              <label className="block text-sm text-stone-700 dark:text-stone-300 mb-1.5">
                Product Video {editingProduct ? '(Optional: Change)' : <span className="text-red-500">*</span>}
              </label>
               {editingProduct && currentMediaUrlInForm && (
                <div className="mb-2">
                  <p className="text-xs text-stone-500 dark:text-stone-400 mb-1">Current Media:</p>
                  {currentMediaTypeInForm === 'video' ? (
                    <video src={currentMediaUrlInForm} controls className="max-h-28 rounded border border-stone-200 dark:border-stone-700 bg-neutral-100 dark:bg-neutral-800"></video>
                  ) : (
                    <img src={currentMediaUrlInForm} alt="Current product media" className="max-h-28 rounded border border-stone-200 dark:border-stone-700 p-1 bg-neutral-100 dark:bg-neutral-800" />
                  )}
                </div>
              )}
              <input 
                type="file" 
                accept="video/*"
                ref={productMediaInputRef}
                onChange={(e) => setProductMediaFileForForm(e.target.files[0])}
                required={!editingProduct} // Required only if NOT editing
                className="w-full text-sm text-stone-500 dark:text-stone-400
                           file:mr-4 file:py-2 file:px-4
                           file:rounded-lg file:border-0
                           file:text-sm file:font-semibold
                           file:bg-neutral-100 file:dark:bg-neutral-800 
                           file:text-stone-700 file:dark:text-stone-200
                           hover:file:bg-neutral-200 hover:file:dark:bg-neutral-700
                           cursor-pointer"
              />
              {productMediaFileForForm && (
                  <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">Selected Media: {productMediaFileForForm.name}</p>
              )}
            </div>
          </div>
          
          <p className="text-xs text-stone-500 dark:text-stone-400 pt-1 p-2 border-l-2 border-stone-200 dark:border-stone-700 bg-neutral-50 dark:bg-neutral-800/50 rounded">
            The logo and product image/video will be used directly in generated TikTok content. High-quality assets will significantly improve output quality.
          </p>
          
          <div className="flex justify-end gap-3 pt-2">
             <button
                type="button"
                onClick={resetProductForm} // Use new reset function
                className="px-4 py-2 text-sm text-stone-700 dark:text-stone-300 bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            >
                Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 bg-neutral-900 text-stone-100 dark:bg-neutral-100 dark:text-black rounded-lg text-sm hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors disabled:opacity-50"
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
        <div className="flex justify-center py-8 text-stone-500 dark:text-stone-400">
          <div className="flex items-center gap-2">
             <CircleNotch size={18} className="animate-spin"/> Loading Products...
          </div>
        </div>
      ) : !isLoading && userProducts.length === 0 && !showAddProductForm ? (
        <div className="py-16 flex flex-col items-center justify-center text-center border border-dashed border-stone-200 dark:border-stone-800 rounded-lg">
          <Package size={36} className="text-stone-400 dark:text-stone-600 mb-4" />
          <p className="text-stone-500 dark:text-stone-400 mb-4">No products added yet.</p>
          {/* This button is only shown when userProducts.length is 0, so no need for a disable check here based on count */}
          <button 
            onClick={() => setShowAddProductForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-neutral-900 text-stone-100 dark:bg-neutral-100 dark:text-black text-sm rounded-lg hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
          >
            <Plus size={16} />
            Add Your First Product
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {userProducts.map(product => {
            // Truncate description
            let displayDescription = product.description || 'No description provided.';
            if (displayDescription.length > 50) {
              displayDescription = displayDescription.substring(0, 50) + '...';
            }

            return (
              <div key={product.id} className="flex gap-4 p-4 border border-stone-100 dark:border-stone-800 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors rounded-lg items-center">
                <img 
                  src={product.logoUrl || 'https://via.placeholder.com/80?text=No+Logo'}
                  alt={`${product.name} logo`} 
                  className="w-16 h-auto max-h-16 object-contain rounded flex-shrink-0 bg-neutral-50 dark:bg-neutral-800 p-1" 
                />
                <div className="flex-1 min-w-0 py-1">
                  <div className="flex justify-between items-start">
                    <h3 className="font-medium text-black dark:text-stone-100 truncate mr-2">{product.name}</h3>
                    <div className="flex gap-1 flex-shrink-0">
                      <button 
                          onClick={() => handleEditProductClick(product)} // <-- WIRE UP EDIT
                          className="p-1.5 text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                          aria-label={`Edit ${product.name}`}
                          title={`Edit ${product.name}`}
                      >
                        <PencilSimple size={16} />
                      </button>
                      <button 
                          onClick={() => handleDeleteProduct(product.id, product.logoUrl, product.mediaUrl, product.name)}
                          disabled={isLoading}
                          className="p-1.5 text-stone-500 dark:text-stone-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors disabled:opacity-50"
                          aria-label={`Delete ${product.name}`}
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  </div>
                  {/* Removed line-clamp-2 and used displayDescription */}
                  <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">{displayDescription}</p>
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
    <div className="w-full"> {/* ADDED for consistency */}
      <div className="px-6 lg:px-0 space-y-6"> {/* MODIFIED for consistency, kept space-y-6 */}
        {/* NEW HEADER SECTION */}
        <div className="text-left mb-8">
          <div className="flex items-center mb-4">
            <span className="text-sm font-medium text-stone-800 dark:text-stone-200">
              TikTok Accounts
            </span>
            <span className="mx-2 h-1 w-1 rounded-full bg-neutral-400 dark:bg-neutral-500"></span>
            <span className="text-sm text-stone-500 dark:text-stone-400">
              Manage your TikTok account integrations
            </span>
          </div>
          <p className="text-base text-stone-600 dark:text-stone-400 max-w-2xl">
             Connect one or more TikTok accounts to enable posting features.
          </p>
        </div>
        {/* END NEW HEADER SECTION */}

        {/* Original content starts here, the first div containing h3 and p is now replaced by the new header. */}
        {/* The button section should directly follow */}
        <div className="mt-4 flex justify-start">
          <button 
            onClick={handleConnectTikTokAccount}
            disabled= {true} // Disable while main connection is in progress
            className="inline-flex items-center justify-center rounded-md border-0 bg-neutral-900 dark:bg-neutral-100 px-4 py-2 text-sm font-medium text-stone-100 dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors disabled:opacity-50"
          >
            {isLoadingTikTok ? (
              <CircleNotch size={20} className="mr-2 animate-spin" />
            ) : (
              <TiktokLogo size={20} className="mr-2" />
            )}
            Connect New TikTok Account
          </button>
        </div>
        
        {isLoadingTikTok && tiktokAccounts.length === 0 && (
          <div className="flex justify-center items-center py-10">
            <CircleNotch size={24} className="animate-spin text-stone-500 dark:text-stone-400 mr-3" />
            <p className="text-stone-600 dark:text-stone-400">Loading connected accounts...</p>
          </div>
        )}

        {!isLoadingTikTok && tiktokAccounts.length === 0 && (
          <div className="mt-6 text-center text-stone-500 dark:text-stone-400 border border-dashed border-stone-200 dark:border-stone-700 rounded-lg p-8">
            <TiktokLogo size={40} className="mx-auto text-stone-400 dark:text-stone-500" />
            <h3 className="mt-2 text-sm font-medium text-stone-900 dark:text-stone-100">No TikTok Accounts Connected</h3>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">Direct posting to TikTok is coming soon. Check back later!</p> {/* MODIFIED Message */}
          </div>
        )}

        {tiktokAccounts.length > 0 && !isLoadingTikTok && (
          <div className="mt-6 space-y-4">
            {tiktokAccounts.map(account => (
              <div key={account.id} className="bg-neutral-100 dark:bg-neutral-900 border border-stone-100 dark:border-stone-800 rounded-lg overflow-hidden"> {/* REMOVED opacity and pointer-events */}
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      {account.user_info?.avatar_url ? (
                        <img className="h-12 w-12 rounded-full mr-3" src={account.user_info.avatar_url} alt="Avatar" />
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mr-3">
                          <UserCircle size={24} className="text-stone-400 dark:text-stone-500" />
                        </div>
                      )}
                      <div>
                        <h3 className="text-base font-medium text-stone-900 dark:text-stone-100">
                          {account.user_info?.display_name || 'TikTok Account'}
                          {account.user_info === null && <span className="ml-2 text-xs text-yellow-500">(Sync pending...)</span>}
                        </h3>
                        
                        <div className="flex space-x-4 mt-1">
                          {account.user_info?.follower_count !== undefined && (
                            <p className="text-sm text-stone-500 dark:text-stone-400">
                              {account.user_info.follower_count.toLocaleString()} followers
                            </p>
                          )}
                          {account.user_info?.video_count !== undefined && (
                            <p className="text-sm text-stone-500 dark:text-stone-400">
                              {account.user_info.video_count.toLocaleString()} videos
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleSyncTikTokDetails(account.id)}
                        disabled={isLoadingAction[account.id]?.sync || isLoadingAction[account.id]?.delete}
                        className="inline-flex items-center px-3 py-1.5 text-sm border border-stone-200 dark:border-stone-700 rounded-md text-stone-700 dark:text-stone-200 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50"
                      >
                        {isLoadingAction[account.id]?.sync ? (
                           <CircleNotch size={16} className="mr-1.5 animate-spin" />
                        ) : (
                           <ClockCounterClockwise size={16} className="mr-1.5" />
                        )}
                        Sync
                      </button>
                      <button 
                        onClick={() => handleDeleteTikTokAccountClick(account.id, account.user_info?.display_name || 'this account')}
                        disabled={isLoadingAction[account.id]?.sync || isLoadingAction[account.id]?.delete}
                        className="inline-flex items-center px-3 py-1.5 text-sm border border-transparent rounded-md text-stone-100 bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
                      >
                        {isLoadingAction[account.id]?.delete ? (
                          <CircleNotch size={16} className="mr-1.5 animate-spin" />
                        ) : (
                          <Trash size={16} className="mr-1.5" />
                        )}
                        Disconnect
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div> {/* Close padding container */}
    </div>
  );

  // --- NEW: Handler to Sync TikTok User Details (Disabled Version) ---
  const handleSyncTikTokDetails = async (integrationId) => {
    if (!integrationId) {
      showCustomToast("Cannot sync: Integration ID is missing.", "error");
      return;
    }
    setIsLoadingAction(prevState => ({ ...prevState, [integrationId]: { ...prevState[integrationId], sync: true } }));
    showCustomToast("Syncing TikTok account details...", "info");

    const updateTikTokUserDetails = httpsCallable(functions, 'updateTikTokUserDetails');
    try {
      const result = await updateTikTokUserDetails({ integrationId: integrationId });
      if (result.data.success) {
        showCustomToast(result.data.message || "TikTok details synced successfully!", "success");
      } else {
        throw new Error(result.data.message || "Failed to sync TikTok details.");
      }
    } catch (error) {
      console.error("Error syncing TikTok details:", error);
      showCustomToast(`Error syncing: ${error.message}`, "error");
    } finally {
      setIsLoadingAction(prevState => ({ ...prevState, [integrationId]: { ...prevState[integrationId], sync: false } }));
    }
  };

  const handleDeleteTikTokAccountClick = (integrationId, accountName) => {
    if (!integrationId) {
        showCustomToast("Cannot delete: Integration ID is missing.", "error");
        return;
    }
    setTikTokAccountToDelete({ id: integrationId, name: accountName || 'this account' });
    setShowDeleteTikTokConfirmModal(true);
  };

  const confirmDeleteTikTokAccount = async () => {
    if (!tikTokAccountToDelete || !tikTokAccountToDelete.id) {
      showCustomToast("Deletion failed: No account selected or ID missing.", "error");
      return;
    }
    const { id: integrationId } = tikTokAccountToDelete;

    setIsLoadingAction(prevState => ({ ...prevState, [integrationId]: { ...prevState[integrationId], delete: true } }));
    showCustomToast("Disconnecting TikTok account...", "info");

    const deleteTikTokIntegration = httpsCallable(functions, 'deleteTikTokIntegration'); 
    try {
      const result = await deleteTikTokIntegration({ integrationId: integrationId });
      if (result.data.success) {
        showCustomToast(result.data.message || "TikTok account disconnected successfully.", "success");
        setTiktokAccounts(prevAccounts => prevAccounts.filter(acc => acc.id !== integrationId));
      } else {
        throw new Error(result.data.message || "Failed to disconnect TikTok account.");
      }
    } catch (error) {
      console.error("Error deleting TikTok integration:", error);
      showCustomToast(`Error disconnecting: ${error.message}`, "error");
    } finally {
      setShowDeleteTikTokConfirmModal(false);
      setTikTokAccountToDelete(null);
      setIsLoadingAction(prevState => ({ ...prevState, [integrationId]: { ...prevState[integrationId], delete: false } }));
    }
  };

  // --- Modified Creators Tab ---
  const renderCreatorsTab = () => (
    <div className="w-full"> {/* Add container */}
      <div className="px-6 lg:px-0 space-y-6"> {/* Add padding and spacing */}
       {/* Header consistent with User tab */}
         <div className="text-left"> 
            <div className="flex items-center mb-4">
              <span className="text-sm font-medium text-stone-800 dark:text-stone-200">
                UGC Creators
              </span>
              <span className="mx-2 h-1 w-1 rounded-full bg-neutral-400 dark:bg-neutral-500"></span>
              <span className="text-sm text-stone-500 dark:text-stone-400">
                Manage your UGC creator assets
              </span>
            </div>
            <p className="text-base text-stone-600 dark:text-stone-400 max-w-2xl mb-8">
              Upload images of your User-Generated Content creators. These visuals can be used in generated videos.
            </p>
            <p className="text-xs text-stone-500 dark:text-stone-400 -mt-6 mb-8 max-w-2xl">
              Tip: You can also generate unique UGC-style creator images using Lungo AI's image generation features and then add them here!
            </p>
        </div>

      {/* Action Button - Moved below header */}
      <div className="flex justify-end border-b border-stone-100 dark:border-stone-800 pb-4">
        <button 
          onClick={() => setShowAddCreatorForm(!showAddCreatorForm)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-neutral-900 text-stone-100 dark:bg-neutral-100 dark:text-black rounded-lg hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
        >
          {showAddCreatorForm ? <X size={16} /> : <Plus size={16} />}
          {showAddCreatorForm ? 'Cancel' : 'Add Creator'}
        </button>
      </div>
      
      {/* Add Creator Form with improved layout */}
      {showAddCreatorForm && (
        <form onSubmit={handleAddCreator} className="p-6 border border-stone-100 dark:border-stone-800 rounded-lg space-y-5 bg-neutral-50/50 dark:bg-neutral-900/30 mb-6">
          <h3 className="text-lg font-medium text-black dark:text-stone-100 mb-2">Add New Creator</h3>
          <div>
            <label className="block text-sm text-stone-700 dark:text-stone-300 mb-1.5">
              Creator Name <span className="text-red-500">*</span>
            </label>
            <input 
              type="text"
              value={newCreatorName}
              onChange={(e) => setNewCreatorName(e.target.value)}
              placeholder="e.g., Influencer Jane"
              required
              className="w-full px-3 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-stone-200 dark:border-stone-700 text-black dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-stone-300 dark:focus:ring-stone-600"
            />
          </div>
          <div>
            <label className="block text-sm text-stone-700 dark:text-stone-300 mb-1.5">
              Creator Image <span className="text-red-500">*</span>
            </label>
            <input 
              type="file" 
              accept="image/*" 
              ref={creatorFileInputRef} 
              onChange={(e) => setNewCreatorFile(e.target.files[0])}
              required
              className="w-full text-sm text-stone-500 dark:text-stone-400
                         file:mr-4 file:py-2 file:px-4
                         file:rounded-lg file:border-0
                         file:text-sm file:font-semibold
                         file:bg-neutral-100 file:dark:bg-neutral-800 
                         file:text-stone-700 file:dark:text-stone-200
                         hover:file:bg-neutral-200 hover:file:dark:bg-neutral-700
                         cursor-pointer"
            />
            {newCreatorFile && (
                <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">Selected: {newCreatorFile.name}</p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
             <button
                type="button"
                onClick={() => setShowAddCreatorForm(false)}
                className="px-4 py-2 text-sm text-stone-700 dark:text-stone-300 bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            >
                Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 bg-neutral-900 text-stone-100 dark:bg-neutral-100 dark:text-black rounded-lg text-sm hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Adding...' : 'Add Creator'}
            </button>
          </div>
        </form>
      )}
      
      {/* Creators List Grid */}
      {isLoading && !showAddCreatorForm && activeTab === 'creators' ? ( // Only show loading if this tab is active
        <div className="flex justify-center py-8 text-stone-500 dark:text-stone-400">
           <div className="flex items-center gap-2">
             <CircleNotch size={18} className="animate-spin"/> Loading Creators...
          </div>
        </div>
      ) : !isLoading && userCreators.length === 0 && !showAddCreatorForm ? ( 
        <div className="py-16 flex flex-col items-center justify-center text-center border border-dashed border-stone-200 dark:border-stone-800 rounded-lg">
          <Camera size={36} className="text-stone-400 dark:text-stone-600 mb-4" />
          <p className="text-stone-500 dark:text-stone-400 mb-4">No UGC creators added yet.</p>
          <button 
            onClick={() => setShowAddCreatorForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-neutral-900 text-stone-100 dark:bg-neutral-100 dark:text-black text-sm rounded-lg hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
          >
            <Plus size={16} />
            Add Your First Creator
          </button>
        </div>
      ) : (
        // --- Grid Layout similar to Backgrounds ---
        // Adjusted column count AGAIN for even larger items
        <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {userCreators.map(creator => (
            <div key={creator.id} className="relative aspect-[3/4] rounded-lg overflow-hidden group border border-stone-100 dark:border-stone-800"> {/* Aspect ratio can be adjusted */}
              <img 
                src={creator.imageUrl || 'https://via.placeholder.com/150x200?text=No+Img'} 
                alt={creator.name} 
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {/* Hover Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3">
                 <p className="text-sm font-medium text-stone-100 truncate mb-1">{creator.name}</p>
                 {/* Action Buttons */}
                 <div className="absolute top-2 right-2 flex gap-1.5">
                   <button 
                       onClick={() => handleDeleteCreator(creator.id, creator.imageUrl, creator.name)} // Use updated handler
                       disabled={isLoading}
                       className="p-1.5 bg-black/50 text-stone-100 rounded-full hover:bg-red-600 transition-colors disabled:opacity-50"
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
              <span className="text-sm font-medium text-stone-800 dark:text-stone-200">
                Background Images
              </span>
              <span className="mx-2 h-1 w-1 rounded-full bg-neutral-400 dark:bg-neutral-500"></span>
              <span className="text-sm text-stone-500 dark:text-stone-400">
                Manage backgrounds for video generation
              </span>
            </div>
            <p className="text-base text-stone-600 dark:text-stone-400 max-w-2xl mb-8">
              Upload your own background images or select from our library. These images will be used as backgrounds in generated TikToks.
            </p>
            <p className="text-xs text-stone-500 dark:text-stone-400 -mt-6 mb-8 max-w-2xl">
              Tip: Don't forget, you can generate custom background scenes using Lungo AI's image generation, then upload them here or add directly from your generation history!
            </p>
        </div>

      {/* Header Area with action buttons - Moved below header */}
      <div className="flex flex-wrap justify-end items-center gap-2.5 border-b border-stone-100 dark:border-stone-800 pb-4">
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
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-neutral-100 text-stone-800 dark:bg-neutral-800 dark:text-stone-100 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50"
          >
            {showLibrary ? <X size={16} /> : <ImageIcon size={16} />} 
            {showLibrary ? 'Cancel Library' : 'Add from Library'}
          </button>

           {/* Custom Upload Button */}
           {!showLibrary && (
             <button 
               onClick={() => setShowAddBackgroundForm(!showAddBackgroundForm)}
               disabled={isLoading}
               className="flex items-center gap-1.5 px-4 py-2 text-sm bg-neutral-900 text-stone-100 dark:bg-neutral-100 dark:text-black rounded-lg hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors disabled:opacity-50"
             >
               {showAddBackgroundForm ? <X size={16} /> : <Plus size={16} />}
               {showAddBackgroundForm ? 'Cancel Upload' : 'Upload Custom'}
             </button>
           )}
        </div>

      {/* Add Custom Background Form with improved layout */}
      {showAddBackgroundForm && !showLibrary && (
        <form onSubmit={handleAddCustomBackground} className="p-6 border border-stone-100 dark:border-stone-800 rounded-lg space-y-5 bg-neutral-50/50 dark:bg-neutral-900/30 mb-6">
           <h3 className="text-lg font-medium text-black dark:text-stone-100 mb-2">Upload Custom Background</h3>
           <div>
             <label className="block text-sm text-stone-700 dark:text-stone-300 mb-1.5">
               Background Name <span className="text-red-500">*</span>
             </label>
             <input 
               type="text"
               value={newBackgroundName}
               onChange={(e) => setNewBackgroundName(e.target.value)}
               placeholder="e.g., Office Desk Setup"
               required
               className="w-full px-3 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-stone-200 dark:border-stone-700 text-black dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-stone-300 dark:focus:ring-stone-600"
             />
           </div>
           <div>
             <label className="block text-sm text-stone-700 dark:text-stone-300 mb-1.5">
               Image File <span className="text-red-500">*</span> <span className="text-xs text-stone-400">(Recommended: 9:16 aspect ratio)</span>
             </label>
             <input 
               type="file" 
               accept="image/*" 
               ref={backgroundFileInputRef} 
               onChange={(e) => setNewBackgroundFile(e.target.files[0])}
               required
               className="w-full text-sm text-stone-500 dark:text-stone-400
                          file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold
                          file:bg-neutral-100 file:dark:bg-neutral-800 file:text-stone-700 file:dark:text-stone-200
                          hover:file:bg-neutral-200 hover:file:dark:bg-neutral-700 cursor-pointer"
             />
             {newBackgroundFile && (
                 <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">Selected: {newBackgroundFile.name}</p>
             )}
           </div>
           <div className="flex justify-end gap-3 pt-2">
             <button type="button" onClick={() => setShowAddBackgroundForm(false)} className="px-4 py-2 text-sm text-stone-700 dark:text-stone-300 bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors">Cancel</button>
             <button type="submit" disabled={isLoading} className="px-5 py-2 bg-neutral-900 text-stone-100 dark:bg-neutral-100 dark:text-black rounded-lg text-sm hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors disabled:opacity-50"> {isLoading ? 'Uploading...' : 'Add Background'} </button>
           </div>
        </form>
      )}

      {/* ---- Library View with improved grid layout ---- */}
      {showLibrary && (
          <div className="space-y-6">
              {/* Header and button with improved layout */}
              <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-black dark:text-stone-100">Select Backgrounds from Library</h3>
                  {/* Save Button - improved visibility */}
                  {!isLoadingLibrary && libraryImages.length > 0 && (
                      <button
                          onClick={handleSaveSelectedLibraryImages}
                          disabled={isLoading || selectedLibraryImages.length === 0}
                          className="px-4 py-1.5 bg-blue-600 text-stone-100 rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                          {isLoading ? 'Saving...' : `Add (${selectedLibraryImages.length}) Selected`}
                      </button>
                  )}
              </div>

              {isLoadingLibrary ? (
                  <div className="flex justify-center py-8 text-stone-500 dark:text-stone-400">
                      <div className="flex items-center gap-2">
                          <CircleNotch size={18} className="animate-spin"/> Loading Library...
                      </div>
                  </div>
              ) : libraryImages.length === 0 ? (
                   <div className="py-12 flex flex-col items-center justify-center text-center border border-dashed border-stone-200 dark:border-stone-800 rounded-lg">
                      <ImageIcon size={36} className="text-stone-400 dark:text-stone-600 mb-4" />
                      <p className="text-stone-500 dark:text-stone-400 mb-4">No images found in the library folder (`lungo-backgrounds`).</p>
                   </div>
              ) : (
                   <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {libraryImages.map(({ url, name, description }) => {
                          const isSelected = selectedLibraryImages.includes(url);
                          const isAlreadyAdded = userBackgroundUrls.has(url);
                          return (
                              <div 
                                  key={url} 
                                  className={`relative aspect-[9/16] rounded-lg overflow-hidden cursor-pointer group border-2 ${isSelected ? 'border-blue-500' : isAlreadyAdded ? 'border-green-500/50' : 'border-transparent hover:border-stone-300 dark:hover:border-stone-600'}`}
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
                                           <CheckCircle size={24} weight="fill" className="text-stone-100" />
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
              <div className="flex justify-center py-8 text-stone-500 dark:text-stone-400">
                 <div className="flex items-center gap-2">
                     <CircleNotch size={18} className="animate-spin"/> Loading Your Backgrounds...
                 </div>
              </div>
            ) : userBackgrounds.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-center border border-dashed border-stone-200 dark:border-stone-800 rounded-lg">
                <ImageIcon size={40} className="text-stone-400 dark:text-stone-600 mb-4" />
                <p className="text-stone-500 dark:text-stone-400 mb-2">You haven't added any backgrounds yet.</p>
                <p className="text-xs text-stone-400 dark:text-stone-500 mb-4">Upload your own or add from the library.</p>
                
                {/* Added buttons for quick action */}
                <div className="flex gap-3 mt-2">
                  <button 
                    onClick={() => {
                      setShowLibrary(true);
                      fetchLibraryBackgrounds();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-neutral-100 text-stone-800 dark:bg-neutral-800 dark:text-stone-100 rounded-lg"
                  >
                    <ImageIcon size={14} />
                    Browse Library
                  </button>
                  <button 
                    onClick={() => setShowAddBackgroundForm(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-neutral-900 text-stone-100 dark:bg-neutral-100 dark:text-black rounded-lg"
                  >
                    <Plus size={14} />
                    Upload Custom
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {userBackgrounds.map(bg => (
                      <div key={bg.id} className="relative aspect-[9/16] rounded-lg overflow-hidden group">
                           <img 
                               src={bg.imageUrl || 'https://via.placeholder.com/180x320?text=No+Img'} 
                               alt={bg.name || 'Background'}
                               className="w-full h-full object-cover" 
                               loading="lazy"
                           />
                           <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3">
                              <p className="text-sm font-medium text-stone-100 truncate mb-1">{bg.name}</p>
                              <button 
                                  onClick={() => handleDeleteBackground(bg.id, bg.imageUrl, bg.isFromLibrary, bg.name)} 
                                  disabled={isLoading}
                                  className="absolute top-2 right-2 p-1.5 bg-black/50 text-stone-100 rounded-full hover:bg-red-600 transition-colors disabled:opacity-50"
                                  aria-label={`Delete ${bg.name}`}
                              >
                                <Trash size={14} />
                              </button>
                           </div>
                           {bg.isFromLibrary && (
                               <div className="absolute top-2 left-2 bg-blue-500 text-stone-100 text-[9px] px-1.5 py-0.5 rounded-full font-medium" title="Added from Library">
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
        <div className="text-left border-b border-stone-100 dark:border-stone-800 pb-8 mb-8"> 
            <div className="flex items-center mb-4">
              <span className="text-sm font-medium text-stone-800 dark:text-stone-200">
                Feature Requests
              </span>
              <span className="mx-2 h-1 w-1 rounded-full bg-neutral-400 dark:bg-neutral-500"></span>
              <span className="text-sm text-stone-500 dark:text-stone-400">
                Vote on upcoming features or submit your own
              </span>
            </div>
            <p className="text-base text-stone-600 dark:text-stone-400 max-w-2xl">
              Help us prioritize what to build next by upvoting the features you want most, or let us know what you'd like to see!
            </p>
        </div>

        {/* --- NEW: Form to submit a new feature request --- */}
        <form onSubmit={handleNewFeatureRequestSubmit} className="mb-10 p-5 border border-stone-100 dark:border-stone-800 rounded-lg bg-neutral-50/50 dark:bg-neutral-900/30">
          <h3 className="text-md font-medium text-stone-800 dark:text-stone-100 mb-3">Suggest a New Feature</h3>
          <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">
            Have an idea that's not on the list? Describe it below. Your suggestion will be private to you.
          </p>
          <textarea
            value={newFeatureRequestText}
            onChange={(e) => setNewFeatureRequestText(e.target.value)}
            placeholder="Describe your feature idea..."
            rows={3}
            className="w-full px-3 py-2 rounded-md bg-neutral-100 dark:bg-neutral-800 border border-stone-200 dark:border-stone-700 text-sm text-black dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-stone-300 dark:focus:ring-stone-600"
            required
          />
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={isSubmittingRequest || !newFeatureRequestText.trim()}
              className="px-4 py-2 bg-neutral-800 text-stone-100 dark:bg-neutral-100 dark:text-black rounded-md text-sm font-medium hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors disabled:opacity-60 flex items-center justify-center min-w-[110px]" // Added min-w for consistent size
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
        <div className="flex justify-center py-16 text-stone-500 dark:text-stone-400">
          <div className="flex flex-col items-center">
            <CircleNotch size={24} className="animate-spin mb-4" />
            <p className="text-sm">Loading requests</p>
          </div>
        </div>
      ) : featureRequests.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 bg-neutral-50 dark:bg-neutral-900 border border-stone-100 dark:border-stone-800 rounded-full flex items-center justify-center mb-4 shadow-sm">
            <Sparkle size={22} weight="light" className="text-stone-400 dark:text-stone-600" />
          </div>
          <p className="text-base text-stone-700 dark:text-stone-300 font-medium mb-2">No feature requests yet</p>
          <p className="text-sm text-stone-500 dark:text-stone-400 max-w-md">
            Feature requests will appear here. Upvote the ones you'd like to see implemented.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {/* Public feature requests list */}
          {featureRequests.length > 0 && (
            <>
              <h4 className="text-sm font-semibold text-stone-700 dark:text-stone-300 mb-2 px-2 pt-2">Vote on Public Requests</h4>
          <div className="divide-y divide-stone-100 dark:divide-stone-800">
            {featureRequests.map((request) => (
              <div 
                key={request.id} 
                className="flex items-center py-3.5 px-2 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors"
              >
                <div className="mr-3">
                  <button 
                    onClick={() => handleVote(request.id, request.votes, request.userUpvoted)}
                        disabled={votingCooldown[request.id] || isLoading || isSubmittingRequest} // Also disable if submitting new
                    className={`relative flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200 
                      ${request.userUpvoted 
                        ? 'bg-neutral-900 text-stone-100 dark:bg-neutral-100 dark:text-black' 
                        : 'bg-neutral-50 hover:bg-neutral-100 text-stone-500 hover:text-stone-800 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-stone-400 dark:hover:text-stone-200'} 
                      ${votingCooldown[request.id] ? 'opacity-50 cursor-not-allowed' : ''}`}
                    aria-label={request.userUpvoted ? "Remove vote" : "Upvote"}
                    title={request.userUpvoted ? "Remove vote" : "Upvote"}
                  >
                    <ArrowUp size={14} weight={request.userUpvoted ? "fill" : "regular"} />
                    
                    {votingCooldown[request.id] && (
                      <span className="absolute inset-0 rounded-md border-2 border-stone-900 dark:border-stone-100 animate-ping opacity-30"></span>
                    )}
                  </button>
                </div>
                
                <span className="text-sm text-stone-800 dark:text-stone-200">
                  {request.title}
                </span>
                {/* REMOVE VOTE COUNT DISPLAY (Kept commented out) */}
                {/* 
                <span className="ml-auto text-xs font-medium text-stone-500 dark:text-stone-400 pr-2">
                    {request.votes} {request.votes === 1 ? 'vote' : 'votes'}
                </span>
                */}
              </div>
            ))}
          </div>
          <div className="pt-3 px-2">
            <p className="text-xs text-stone-500 dark:text-stone-500">
                  Upvoting helps us prioritize which features to implement.
            </p>
          </div>
            </>
          )}
          {/* End Public feature requests list */}

          {/* User's Private Submitted Requests List */}
          {userPrivateRequests.length > 0 && (
            <div className="mt-8 pt-6 border-t border-stone-100 dark:border-stone-800">
              <h4 className="text-sm font-semibold text-stone-700 dark:text-stone-300 mb-3 px-2">My Submitted Ideas</h4>
              <div className="divide-y divide-stone-100 dark:divide-stone-800">
                {userPrivateRequests.map((request) => (
                  <div key={request.id} className="flex items-center justify-between py-3 px-2 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors">
                    <span className="text-sm text-stone-700 dark:text-stone-300">{request.title}</span>
                    <span className="text-xs text-stone-400 dark:text-stone-500">
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
               <Sparkle size={28} weight="light" className="text-stone-400 dark:text-stone-600 mb-3" />
               <p className="text-sm text-stone-500 dark:text-stone-400">
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
      setUserBackgrounds(prev => [...prev, newBg]);
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
        setUserBackgrounds(prev => prev.filter(b => b.id !== id));
        setUserBackgroundUrls(prev => {
          const newSet = new Set(prev);
          newSet.delete(imageUrl);
          return newSet;
        });
      } else if (type === 'creator') {
        setUserCreators(prev => prev.filter(c => c.id !== id));
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
          setUserBackgrounds(prev => [...prev, ...newBackgroundsToAdd]);
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

  // --- Handle Add TikTok Account --- // REWRITTEN FOR OAUTH (Disabled Version)
  const handleConnectTikTokAccount = async () => {
    setIsLoadingTikTok(true); // Use a specific loader for this action
    showCustomToast("Preparing to connect with TikTok...", "info");

    try {
      // 1. Generate a unique state string for CSRF protection
      const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('tiktok_auth_state', state);

      // 2. Define the redirect URI (must match TikTok App config and callback component)
      const REDIRECT_URI = `${window.location.origin}/auth/tiktok/callback`;
      
      // 3. Call the Firebase Function to get the TikTok Auth URL
      const getTikTokAuthUrl = httpsCallable(functions, 'getTikTokAuthUrl');
      const result = await getTikTokAuthUrl({ redirectUri: REDIRECT_URI, state: state });

      if (result.data.authorizationUrl) {
        // 4. Redirect the user to TikTok's authorization page
        window.location.href = result.data.authorizationUrl;
      } else {
        throw new Error("Could not retrieve TikTok authorization URL.");
      }
    } catch (error) {
      console.error("Error initiating TikTok connection:", error);
      showCustomToast(`Error connecting to TikTok: ${error.message}`, "error");
      setIsLoadingTikTok(false);
    }
  };

  // --- Handle Delete TikTok Account (This one might be a general delete, ensure it's also disabled or removed if not used elsewhere) ---
  // Assuming this was handleDeleteTikTokAccounts (plural) and is now fully covered by the individual disabled ones or not needed.
  // If it was a different function, it should also be disabled if it pertains to TikTok.
  // For now, I will comment it out to avoid conflicts if it's a duplicate or no longer relevant.
  /*
  const handleDeleteTikTokAccounts = async (accountIds) => { 
    // DISABLED
    showCustomToast("Disconnecting TikTok accounts is temporarily disabled.", "info");
    return;
  };
  */

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
                  onClick={() => handleTabClick(tab.id)} // Use new handler
                  className={`
                    w-full text-left px-3 py-2 rounded-md flex items-center gap-2.5 transition-colors duration-150 ease-in-out
                    ${activeTab === tab.id
                      ? 'bg-neutral-100 dark:bg-neutral-800 text-black dark:text-stone-100 font-medium' 
                      : 'text-stone-600 dark:text-stone-400 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 hover:text-black dark:hover:text-stone-100'}
                  `}
                  aria-current={activeTab === tab.id ? 'page' : undefined}
                >
                  {React.cloneElement(tab.icon, { weight: activeTab === tab.id ? 'fill' : 'regular' })} 
                  <span className="text-sm">{tab.label}</span>
                  
                  {activeTab === tab.id && (
                    <span className="ml-auto h-5 w-1 bg-black dark:bg-neutral-100 rounded-full"></span> 
                  )}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        <main className="flex-1 py-4 px-8 border-l border-stone-100 dark:border-stone-800/60 min-h-screen relative"> {/* Added relative for toast positioning */}
          <div>
            {renderTabContent()}
          </div>

          {/* --- NEW: Custom Toast Notification --- */}
          {showToast && toastMessage && (
            <div 
              className={`fixed top-5 right-5 z-[100] px-6 py-3 rounded-lg shadow-lg text-sm font-medium transition-all duration-300 ease-in-out transform ${showToast ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'} 
                          ${toastMessage.type === 'success' ? 'bg-green-500 text-stone-100' : 
                            toastMessage.type === 'error' ? 'bg-red-500 text-stone-100' : 
                            'bg-neutral-800 text-stone-100 dark:bg-neutral-100 dark:text-black'}`}
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
            className="bg-neutral-100 dark:bg-neutral-900 rounded-lg shadow-xl w-full max-w-md overflow-hidden"
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
                  <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100">
                     {itemToDelete?.type === 'creator' ? 'Delete Creator?' : 'Remove Background?'}
                  </h3>
                   {/* Dynamic Text */}
                  <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
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
            <div className="bg-neutral-50 dark:bg-neutral-800/50 px-6 py-4 flex flex-col sm:flex-row-reverse sm:gap-3">
              <button
                type="button"
                disabled={isLoading}
                onClick={confirmItemDeletion} // Use the updated handler
                className="w-full sm:w-auto inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-stone-100 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:focus:ring-offset-stone-900 sm:text-sm disabled:opacity-50"
              >
                 {/* Dynamic Button Text */}
                {isLoading ? 'Processing...' : (itemToDelete?.type === 'creator' ? 'Delete Creator' : 'Remove Background')}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirmModal(false)}
                disabled={isLoading}
                className="mt-3 w-full sm:mt-0 sm:w-auto inline-flex justify-center rounded-md border border-stone-300 dark:border-stone-600 shadow-sm px-4 py-2 bg-neutral-100 dark:bg-neutral-700 text-base font-medium text-stone-700 dark:text-stone-200 hover:bg-neutral-50 dark:hover:bg-neutral-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-400 dark:focus:ring-offset-stone-900 sm:text-sm disabled:opacity-50"
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
            className="bg-neutral-100 dark:bg-neutral-900 rounded-lg shadow-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()} // Prevent closing modal when clicking inside
          >
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <Package size={24} className="text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100">Delete Product?</h3>
                  <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
                    Are you sure you want to delete the product "<span className="font-semibold">{productToDelete.name || 'this product'}</span>"? 
                    This will permanently delete the product data, its logo, and its associated media file. This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-neutral-50 dark:bg-neutral-800/50 px-6 py-4 flex flex-col sm:flex-row-reverse sm:gap-3">
              <button
                type="button"
                disabled={isLoading}
                onClick={confirmProductDeletion}
                className="w-full sm:w-auto inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-stone-100 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:focus:ring-offset-stone-900 sm:text-sm disabled:opacity-50"
              >
                {isLoading ? 'Deleting...' : 'Delete Product'}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteProductConfirmModal(false)}
                disabled={isLoading}
                className="mt-3 w-full sm:mt-0 sm:w-auto inline-flex justify-center rounded-md border border-stone-300 dark:border-stone-600 shadow-sm px-4 py-2 bg-neutral-100 dark:bg-neutral-700 text-base font-medium text-stone-700 dark:text-stone-200 hover:bg-neutral-50 dark:hover:bg-neutral-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-400 dark:focus:ring-offset-stone-900 sm:text-sm disabled:opacity-50"
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
            className="bg-neutral-100 dark:bg-neutral-900 rounded-lg shadow-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()} 
          >
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <WarningCircle size={24} className="text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100">Delete Your Account?</h3>
                  <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
                    Are you absolutely sure you want to delete your account? This action is <span className="font-bold">permanent and cannot be undone</span>. 
                    All your data, including products, creators, generated content history, and settings will be permanently removed.
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-neutral-50 dark:bg-neutral-800/50 px-6 py-4 flex flex-col sm:flex-row-reverse sm:gap-3">
              <button
                type="button"
                disabled={isLoading}
                onClick={confirmDeleteAccount}
                className="w-full sm:w-auto inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-stone-100 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:focus:ring-offset-stone-900 sm:text-sm disabled:opacity-50"
              >
                {isLoading ? (<><CircleNotch size={16} className="animate-spin mr-2" /> Deleting...</>) : 'Yes, Delete My Account'}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteAccountConfirmModal(false)}
                disabled={isLoading}
                className="mt-3 w-full sm:mt-0 sm:w-auto inline-flex justify-center rounded-md border border-stone-300 dark:border-stone-600 shadow-sm px-4 py-2 bg-neutral-100 dark:bg-neutral-700 text-base font-medium text-stone-700 dark:text-stone-200 hover:bg-neutral-50 dark:hover:bg-neutral-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-400 dark:focus:ring-offset-stone-900 sm:text-sm disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete TikTok Account Confirmation Modal */}
      {showDeleteTikTokConfirmModal && tikTokAccountToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
          <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100">Confirm Disconnect (Disabled)</h3> {/* MODIFIED */}
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
               Disconnecting TikTok accounts (<strong className="font-semibold">{tikTokAccountToDelete.name || tikTokAccountToDelete.id}</strong>) is temporarily disabled.
            </p>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteTikTokConfirmModal(false);
                  setTikTokAccountToDelete(null);
                }}
                className="px-4 py-2 text-sm font-medium text-stone-700 dark:text-stone-300 bg-neutral-100 dark:bg-neutral-700 border border-stone-300 dark:border-stone-600 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 dark:focus:ring-offset-stone-800"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteTikTokAccount} // This will now show a toast and do nothing
                disabled // MODIFIED: Button itself disabled too
                className="px-4 py-2 text-sm font-medium text-stone-100 bg-red-600 border border-transparent rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:focus:ring-offset-stone-800 disabled:opacity-50"
              >
                Disconnect Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings; 