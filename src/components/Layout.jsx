import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../firebase'; // Import db
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  getDocs, 
  Timestamp, 
  where, 
  doc, 
  getDoc 
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions"; // Import functions SDK
import { 
  Plus, ArrowRight, ArrowUpRight, 
  User as UserIcon, // Aliased for consistency 
  User,
  ImageSquare as ImageIcon, // Aliased
  ImageSquare,
  Code, Sparkle, /* Calendar, */ // <-- Calendar ikonunu siliyorum
  FilmSlate as VideoIcon, // Aliased
  PencilSimple, Database, Compass, Power, ChatText, XCircle, BookOpen, X, Camera, UserSquare, 
  Mountains as BackgroundPlaceholderIcon, // Aliased
  PenNib, Timer, Package, Gauge, 
  Slideshow as SlideshowIcon, // Aliased
  Check, Calendar,
  ListNumbers, ArrowsClockwise, Steps, Question, ChatCircle, Lightbulb, UploadSimple
} from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion'; // Import framer-motion
import { commandDefinitions } from '../command'; 
import { DotLottieReact } from '@lottiefiles/dotlottie-react'; // Import DotLottieReact
import Fuse from 'fuse.js'; // Import Fuse.js for fuzzy matching
import DynamicIsland from './DynamicIsland'; // <-- IMPORT DynamicIsland
import CustomDropdown from './CustomDropdown'; // <-- IMPORT CustomDropdown
import PricingSection from './PricingSection'; // <-- IMPORT PricingSection

// Initialize Firebase Functions
const functions = getFunctions();
// Define callable functions for saving generated items
const saveCreatorFromGenCallable = httpsCallable(functions, 'saveCreatorFromGeneration');
const saveBackgroundFromGenCallable = httpsCallable(functions, 'saveBackgroundFromGeneration');
// Add createStripePortalSession callable for Layout
const createStripePortalSessionCallableLayout = httpsCallable(functions, 'createStripePortalSession');
// Add createOneTimeCheckoutSession callable for extra credits
const createOneTimeCheckoutSession = httpsCallable(functions, 'createOneTimeCheckoutSession');

// --- ADD NEW DIRECT CALLABLE ---
const generateImageCallable = httpsCallable(functions, 'generateImage', {
  timeout: 540000, // 9 minutes timeout
});

// --- Plan Price Mapping (Moved from Dashboard) ---
const planPriceMap = {
  "price_1RMqEZDf8kAOBAT3ltD6n2lX": "Basic (Monthly)",
  "price_1RMqGbDf8kAOBAT3vgwkWLr6": "Basic (Yearly)",
  "price_1RY4EwDf8kAOBAT3qMaIMcdO": "Pro (Monthly)",
  "price_1RY4F6Df8kAOBAT34O2CKeCM": "Pro (Yearly)",
  "price_1RMqHgDf8kAOBAT3m6kthIND": "Business (Monthly)",
  "price_1RMqI1Df8kAOBAT3Xoy3M7Ho": "Business (Yearly)",
};
// --- End Plan Price Mapping ---

function Layout() {
  const user = auth.currentUser;
  const navigate = useNavigate();
  const location = useLocation(); // Mevcut konum bilgisini almak için
  const chatInputRef = useRef(null);
  const [isChatInputVisible, setIsChatInputVisible] = useState(false); // State for chat input visibility
  const [plan] = useState('Free'); // Add plan state (can be fetched later)

  // --- NEW: State for Firestore user data ---
  const [firestoreUserData, setFirestoreUserData] = useState(null);
  // --- END NEW ---

  // --- Command & Interaction State ---
  const [commandQueue, setCommandQueue] = useState([]);
  const [currentlyExecuting, setCurrentlyExecuting] = useState(null); // Store the command object being executed
  const [pendingConfirmation, setPendingConfirmation] = useState(null); // { type, options?, identifier?, command?, item? }

  // --- Data State ---
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [creators, setCreators] = useState([]); // To store fetched creators
  const [backgrounds, setBackgrounds] = useState([]); // To store fetched backgrounds
  const [products, setProducts] = useState([]); // Add state for products
  const [tiktokAccounts, setTiktokAccounts] = useState([]); // To store fetched TikTok accounts
  const [isLoadingSuggestionsData, setIsLoadingSuggestionsData] = useState(false); // Loading state for suggestions data
  const [generatedImageUrl, setGeneratedImageUrl] = useState(null); // <-- ADD State for image URL
  const [isGeneratingImage, setIsGeneratingImage] = useState(false); // <-- State for image generation loading
  // --- Modal State ---
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [modalImageUrl, setModalImageUrl] = useState(null);
  // -----------------
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0); // <-- Refresh key state
  const [activeImageData, setActiveImageData] = useState(null); // { url, commandCode, generationData }
  const [isInitialDataLoaded, setIsInitialDataLoaded] = useState(false);
  const [generatingItem, setGeneratingItem] = useState(null); // <-- NEW STATE for loading item info
  const [isPollingActive, setIsPollingActive] = useState(false); // For Firestore listener state

  // --- Billing Modal States (Moved from Dashboard) ---
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState(null);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false); // <-- NEW state for Pricing Modal
  // --- Extra Credit Purchase States ---
  const [creditQuantity, setCreditQuantity] = useState(1); // Number of 1000-credit packs
  const [isPurchasingCredits, setIsPurchasingCredits] = useState(false);
  const [creditPurchaseError, setCreditPurchaseError] = useState(null);
  // --- End Billing Modal States ---

  // --- Canvas Status State ---
  const [canvasStatus, setCanvasStatus] = useState({
    isAutoSaving: false,
    lastSaved: null,
    nodeCount: 0,
    edgeCount: 0
  });

  // --- NEW: Load state from localStorage on component mount ---
  useEffect(() => {
    try {
      const savedGeneratingItem = localStorage.getItem('lungoai_generatingItem');
      const savedCommandQueue = localStorage.getItem('lungoai_commandQueue');
      
      if (savedGeneratingItem) {
        let parsedGeneratingItem = JSON.parse(savedGeneratingItem);
        // console.log('[Layout] Attempting to restore generatingItem from localStorage:', parsedGeneratingItem);

        const nonVideoTypes = ['image', 'slideshow', 'image_edit', 'task']; 
        const activeGenerationStates = ['initiating', 'generating', 'processing', 'editing'];

        if (parsedGeneratingItem && parsedGeneratingItem.type && parsedGeneratingItem.status) {
          const isNonVideo = nonVideoTypes.includes(parsedGeneratingItem.type);
          const isActiveState = activeGenerationStates.includes(parsedGeneratingItem.status);

          if (isNonVideo && isActiveState) {
            console.warn('[Layout] Stale non-video generatingItem found in localStorage, clearing it:', parsedGeneratingItem);
            localStorage.removeItem('lungoai_generatingItem');
            parsedGeneratingItem = null; 
          } else if (parsedGeneratingItem.type === 'video' && isActiveState && !parsedGeneratingItem.firestoreDocId) {
            console.warn('[Layout] Stale video generatingItem (active but no firestoreDocId) found, clearing it:', parsedGeneratingItem);
            localStorage.removeItem('lungoai_generatingItem');
            parsedGeneratingItem = null;
          }
        }
        
        // Set state based on whether parsedGeneratingItem is now null or still valid
        setGeneratingItem(parsedGeneratingItem);
        if (parsedGeneratingItem) {
          // console.log('[Layout] Restored generatingItem to state:', parsedGeneratingItem);
        } else if (savedGeneratingItem) { // Only log if it was cleared
          // console.log('[Layout] Cleared stale generatingItem, state is now null.');
        }

      } else {
        setGeneratingItem(null); // Ensure it's null if not found in localStorage
      }
      
      if (savedCommandQueue) {
        const parsedCommandQueue = JSON.parse(savedCommandQueue);
        setCommandQueue(parsedCommandQueue);
        // console.log('[Layout] Restored commandQueue from localStorage:', parsedCommandQueue);
      }
    } catch (error) {
      console.error('[Layout] Error loading state from localStorage:', error);
      // Clear potentially corrupted data
      localStorage.removeItem('lungoai_generatingItem');
      localStorage.removeItem('lungoai_commandQueue');
      setGeneratingItem(null); // Reset state
      setCommandQueue([]);     // Reset state
    }
  }, []); // Empty dependency array - only run on mount

  // --- NEW: Save state to localStorage when it changes ---
  useEffect(() => {
    try {
      if (generatingItem) {
        localStorage.setItem('lungoai_generatingItem', JSON.stringify(generatingItem));
      } else {
        localStorage.removeItem('lungoai_generatingItem');
      }
    } catch (error) {
      console.error('[Layout] Error saving generatingItem to localStorage:', error);
    }
  }, [generatingItem]);

  useEffect(() => {
    try {
      if (commandQueue.length > 0) {
        localStorage.setItem('lungoai_commandQueue', JSON.stringify(commandQueue));
      } else {
        localStorage.removeItem('lungoai_commandQueue');
      }
    } catch (error) {
      console.error('[Layout] Error saving commandQueue to localStorage:', error);
    }
  }, [commandQueue]);

  // State for the new Asset Selection mechanism
  const [selectedAsset, setSelectedAsset] = useState(null); // { id, name, type, imageUrl }
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);

  // NEW: State for dynamic header content
  const [pageTitle, setPageTitle] = useState('');
  const [pageSubtitle, setPageSubtitle] = useState('');

  // --- NEW: State for Create+ Dropdown and Creation Mode ---
  const [isCreateDropdownOpen, setIsCreateDropdownOpen] = useState(false);
  const [creationMode, setCreationMode] = useState(null); // 'video', 'image', 'slideshow', 'schedule'

  const dropdownHoverTimeoutRef = useRef(null); // For delayed close on trigger leave
  const menuHoverTimeoutRef = useRef(null); // For delayed close on menu leave

  // --- NEW: Step-by-step creation states ---
  const [creationStep, setCreationStep] = useState(1); // 1: source selection, 2: configuration
  const [creationSource, setCreationSource] = useState(''); // 'custom', 'library'

  // --- NEW: States and Refs for sub-option dropdowns ---
  const [selectedVideoType, setSelectedVideoType] = useState('');
  const [selectedVideoLength, setSelectedVideoLength] = useState(''); // Kept for potential future use, though not in current UI spec
  const [selectedVideoProduct, setSelectedVideoProduct] = useState('');
  const [selectedVideoLanguage, setSelectedVideoLanguage] = useState('en'); // Default to English
  const [selectedImageType, setSelectedImageType] = useState('');
  const [selectedImageQuality, setSelectedImageQuality] = useState('high'); // Default to high quality
  const [selectedImageProduct, setSelectedImageProduct] = useState(''); // NEW: For Image Ads Product
  const [selectedSlideshowProduct, setSelectedSlideshowProduct] = useState('');
  const [selectedSlideshowBackground, setSelectedSlideshowBackground] = useState('');
  const [selectedSlideshowType, setSelectedSlideshowType] = useState(''); // NEW: For Slideshow Type
  const [selectedSlideshowTopic, setSelectedSlideshowTopic] = useState(''); // NEW: For Topic Selection
  const [selectedSlideshowLanguage, setSelectedSlideshowLanguage] = useState('en'); // Default to English
  // --- NEW: Campaign specific states ---
  // const [selectedCampaignTikTok, setSelectedCampaignTikTok] = useState(''); // REMOVED
  // const [selectedCampaignProduct, setSelectedCampaignProduct] = useState(''); // REMOVED
  // const [selectedCampaignSlideshowType, setSelectedCampaignSlideshowType] = useState(''); // REMOVED
  // const [selectedCampaignBackgrounds, setSelectedCampaignBackgrounds] = useState([]); // REMOVED
  // const [selectedCampaignLanguage, setSelectedCampaignLanguage] = useState('en'); // REMOVED
  // --- END NEW STATES ---

  // --- Fuzzy Match Options for Yes/No ---
  const yesNoOptions = ["yes", "no", "y", "n", "evet", "hayır", "e", "h"];
  const fuseYesNo = new Fuse(yesNoOptions, { includeScore: true, threshold: 0.4 }); // Adjust threshold as needed

  // Helper function to check if required sub-options are missing for the current creationMode
  const areSubOptionsRequiredAndMissing = () => {
    if (creationMode === 'video') {
      return !selectedVideoProduct || !selectedVideoType || !selectedVideoLanguage || 
             selectedVideoProduct === '' || selectedVideoType === '' || selectedVideoLanguage === ''; // Video Product, UGC Model and Language
    }
    if (creationMode === 'image') {
      if (!selectedImageType || selectedImageType === '') return true; // Image Type is a required dropdown itself
      if (!selectedImageQuality || selectedImageQuality === '') return true; // Quality is required
      // if (selectedImageType === 'ads' && !selectedImageProduct) return true; // Ads option removed
      return false; // No image type requires a sub-product selection anymore
    }
    if (creationMode === 'slideshow') {
      return !selectedSlideshowProduct || !selectedSlideshowBackground || !selectedSlideshowType || !selectedSlideshowLanguage ||
             selectedSlideshowProduct === '' || selectedSlideshowBackground === '' || selectedSlideshowType === '' || selectedSlideshowLanguage === '';
    }
    // if (creationMode === 'campaign') { // REMOVED CAMPAIGN CHECK
    //   return !selectedCampaignTikTok || !selectedCampaignProduct || !selectedCampaignSlideshowType || selectedCampaignBackgrounds.length === 0 || !selectedCampaignLanguage ||
    //          selectedCampaignTikTok === '' || selectedCampaignProduct === '' || selectedCampaignSlideshowType === '' || selectedCampaignLanguage === '';
    // }
    return false; // No sub-options for other modes or if no creationMode
  };

  // --- NEW: Dropdown Options ---
  const imageTypeOptions = [
    { id: 'ugc_model', name: 'UGC Model' },
    // { id: 'ads', name: 'Ads' }, // Removed Ads
    { id: 'background', name: 'Background' },
  ];

  const imageQualityOptions = [
    { id: 'standard', name: 'Medium Quality', credits: 50 },
    { id: 'high', name: 'High Quality', credits: 90 },
  ];

  const videoProductOptions = useMemo(() => (
    products.map(p => ({ id: p.id, name: p.name, imageUrl: p.logoUrl }))
  ), [products]);

  const videoCreatorOptions = useMemo(() => (
    creators.map(c => ({ id: c.id, name: c.name, imageUrl: c.imageUrl }))
  ), [creators]);

  const slideshowProductOptions = useMemo(() => (
    products.map(p => ({ id: p.id, name: p.name, imageUrl: p.logoUrl }))
  ), [products]);
  
  const slideshowBackgroundOptions = useMemo(() => (
    backgrounds.map(b => ({ id: b.id, name: b.name, imageUrl: b.imageUrl }))
  ), [backgrounds]);

  const slideshowTypeOptions = [
    { id: 'top_3_lists', name: 'Top 3 Lists', icon: <ListNumbers size={16} /> },
    { id: 'before_after', name: 'Before & After', icon: <ArrowsClockwise size={16} /> },
    { id: 'step_by_step', name: 'Step-by-Step Guide', icon: <Steps size={16} /> },
    { id: 'question_reveal', name: 'Question & Reveal', icon: <Question size={16} /> },
    { id: 'personal_story', name: 'Personal Story', icon: <ChatCircle size={16} /> },
    { id: 'problem_solution', name: 'Problem & Solution', icon: <Lightbulb size={16} /> },
  ];

  // TikTok accounts options for campaigns
  // const tiktokAccountOptions = useMemo(() => ( // REMOVED
  //   tiktokAccounts.map(account => ({ 
  //     id: account.id, 
  //     name: account.name,
  //     imageUrl: account.user_info?.avatar_url
  //   }))
  // ), [tiktokAccounts]); // REMOVED

  // Language options with flag emojis
  const languageOptions = [
    { id: 'en', name: 'English', flag: '🇺🇸' },
    { id: 'tr', name: 'Türkçe', flag: '🇹🇷' },
    { id: 'es', name: 'Español', flag: '🇪🇸' },
    { id: 'fr', name: 'Français', flag: '🇫🇷' },
    { id: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { id: 'it', name: 'Italiano', flag: '🇮🇹' },
    { id: 'pt', name: 'Português', flag: '🇵🇹' },
    { id: 'ru', name: 'Русский', flag: '🇷🇺' },
    { id: 'ja', name: '日本語', flag: '🇯🇵' },
    { id: 'ko', name: '한국어', flag: '🇰🇷' },
    { id: 'zh', name: '中文', flag: '🇨🇳' },
    { id: 'ar', name: 'العربية', flag: '🇸🇦' },
    { id: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
    { id: 'nl', name: 'Nederlands', flag: '🇳🇱' },
    { id: 'sv', name: 'Svenska', flag: '🇸🇪' },
    { id: 'da', name: 'Dansk', flag: '🇩🇰' },
    { id: 'no', name: 'Norsk', flag: '🇳🇴' },
    { id: 'fi', name: 'Suomi', flag: '🇫🇮' },
    { id: 'pl', name: 'Polski', flag: '🇵🇱' },
    { id: 'cs', name: 'Čeština', flag: '🇨🇿' },
    { id: 'sk', name: 'Slovenčina', flag: '🇸🇰' },
    { id: 'hu', name: 'Magyar', flag: '🇭🇺' },
    { id: 'ro', name: 'Română', flag: '🇷🇴' },
    { id: 'bg', name: 'Български', flag: '🇧🇬' },
    { id: 'hr', name: 'Hrvatski', flag: '🇭🇷' },
    { id: 'sr', name: 'Српски', flag: '🇷🇸' },
    { id: 'sl', name: 'Slovenščina', flag: '🇸🇮' },
    { id: 'et', name: 'Eesti', flag: '🇪🇪' },
    { id: 'lv', name: 'Latviešu', flag: '🇱🇻' },
    { id: 'lt', name: 'Lietuvių', flag: '🇱🇹' },
    { id: 'el', name: 'Ελληνικά', flag: '🇬🇷' },
    { id: 'he', name: 'עברית', flag: '🇮🇱' },
    { id: 'th', name: 'ไทย', flag: '🇹🇭' },
    { id: 'vi', name: 'Tiếng Việt', flag: '🇻🇳' },
    { id: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩' },
    { id: 'ms', name: 'Bahasa Melayu', flag: '🇲🇾' },
    { id: 'tl', name: 'Filipino', flag: '🇵🇭' },
    { id: 'uk', name: 'Українська', flag: '🇺🇦' },
  ];
  
  const imageProductOptions = useMemo(() => ([
    ...products.map(p => ({ id: p.id, name: p.name, imageUrl: p.logoUrl })),
    { id: 'upload_new', name: 'Upload New Image...' } // Special option
  ]), [products]);

  const itemRenderer = (option, isSelected) => (
    <div className="flex items-center gap-3 flex-grow">
      {option.imageUrl ? (
        <div className="w-8 h-8 rounded-lg overflow-hidden border border-stone-200/50 dark:border-stone-700/50 flex-shrink-0">
          <img 
            src={option.imageUrl} 
            alt={option.name} 
            className="w-full h-full object-cover"
          />
        </div>
      ) : option.id === 'upload_new' ? (
        <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-neutral-50 dark:bg-neutral-800/50 text-red-500 border border-stone-200/50 dark:border-stone-700/50 flex-shrink-0">
          <UploadSimple size={15} className="text-red-500" />
        </div>
      ) : option.icon ? (
        <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-neutral-50 dark:bg-neutral-800/50 text-stone-600 dark:text-stone-400 border border-stone-200/50 dark:border-stone-700/50 flex-shrink-0">
          {React.cloneElement(option.icon, { size: 16 })}
        </div>
      ) : (
        // Placeholder for items without image, icon and not 'upload_new'
        <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-neutral-50 dark:bg-neutral-800/50 text-stone-400 dark:text-stone-500 border border-stone-200/50 dark:border-stone-700/50 flex-shrink-0">
          {/* Optionally, render a generic icon from the parent dropdown if available */}
          {/* This part depends on how you want to display items without their own specific icon/image */}
        </div>
      )}
      <div className="flex flex-grow items-center justify-between min-w-0">
        <span className={`truncate pr-2 text-stone-900 dark:text-stone-100 text-xs font-medium ${isSelected ? 'font-semibold' : ''}`}>
          {option.name}
        </span>
        {isSelected && (
          <Check size={13} weight="bold" className="text-red-500 flex-shrink-0" />
        )}
      </div>
    </div>
  );

  // Language item renderer with flag emojis
  const languageItemRenderer = (option, isSelected) => (
    <div className="flex items-center gap-3 flex-grow">
      <div className="w-8 h-8 flex items-center justify-center rounded-lg text-lg flex-shrink-0 bg-neutral-50 dark:bg-neutral-800/50 border border-stone-200/50 dark:border-stone-700/50">
        {option.flag}
      </div>
      <div className="flex flex-grow items-center justify-between min-w-0">
        <span className={`truncate pr-2 text-stone-900 dark:text-stone-100 text-xs font-medium ${isSelected ? 'font-semibold' : ''}`}>
          {option.name}
        </span>
        {isSelected && (
          <Check size={13} weight="bold" className="text-red-500 flex-shrink-0" />
        )}
      </div>
    </div>
  );

  // Grid item renderer for images (9:16 aspect ratio with name below)
  const gridItemRenderer = (option, isSelected) => (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className={`relative w-full aspect-[9/16] rounded-xl overflow-hidden border-2 transition-all ${
        isSelected ? 'border-stone-600 dark:border-stone-400 shadow-lg' : 'border-stone-200/50 dark:border-stone-700/50'
      }`}>
        {option.imageUrl ? (
          <img 
            src={option.imageUrl} 
            alt={option.name} 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 text-stone-400 dark:text-stone-500">
            <ImageSquare size={24} className="opacity-50" />
          </div>
        )}
        {isSelected && (
                                <div className="absolute top-2 right-2 bg-neutral-950/80 dark:bg-neutral-100/80 rounded-full p-1">
                        <Check size={12} weight="bold" className="text-white dark:text-stone-900" />
                      </div>
        )}
      </div>
      <span className={`text-center text-xs font-medium w-full truncate ${
        isSelected ? 'text-stone-900 dark:text-stone-100' : 'text-stone-700 dark:text-stone-300'
      }`}>
        {option.name}
      </span>
    </div>
  );


  // --- END NEW: Dropdown Options ---

  // --- Function to trigger dashboard refresh ---
  const refreshDashboardGenerations = useCallback(() => {
    setDashboardRefreshKey(prevKey => prevKey + 1);
  }, []); // Wrap with useCallback and provide an empty dependency array

  // --- NEW: notifyGenerationComplete Function ---
  const notifyGenerationComplete = useCallback((itemType, itemId) => {
    console.log(`[Layout] Received notification: ${itemType} ${itemId} complete.`);
    setGeneratingItem(null); // Clear the generating item
    refreshDashboardGenerations(); // Trigger dashboard refresh
    
    // Clear localStorage when generation completes
    try {
      localStorage.removeItem('lungoai_generatingItem');
      console.log('[Layout] Cleared generatingItem from localStorage after completion');
    } catch (error) {
      console.error('[Layout] Error clearing localStorage after completion:', error);
    }
  }, [refreshDashboardGenerations, setGeneratingItem]);
  // --- END NEW: notifyGenerationComplete Function ---

  // --- Refactored Data Fetching Functions ---
  const fetchCreatorsAndBackgrounds = useCallback(async () => {
    if (!user) return;
        setIsLoadingSuggestionsData(true);
        try {
            const creatorsQuery = query(collection(db, 'users', user.uid, 'creators'));
            const creatorsSnapshot = await getDocs(creatorsQuery);
            const fetchedCreators = creatorsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setCreators(fetchedCreators);

            const backgroundsQuery = query(collection(db, 'users', user.uid, 'backgrounds'));
            const backgroundsSnapshot = await getDocs(backgroundsQuery);
            const fetchedBackgrounds = backgroundsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
            setBackgrounds(fetchedBackgrounds);
        // console.log("Fetched/Refetched creators and backgrounds.");
        } catch (error) {
        console.error("Error fetching/refetching creators/backgrounds:", error);
        } finally {
            setIsLoadingSuggestionsData(false);
        }
  }, [user]); // Removed db from deps as it's stable from firebase import

  const fetchProducts = useCallback(async () => {
        if (!user) return;
    // Consider setIsLoadingSuggestionsData if this fetch is slow and part of initial load indication
        try {
            const productsQuery = query(collection(db, 'users', user.uid, 'products')); 
            const productsSnapshot = await getDocs(productsQuery);
            const fetchedProducts = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setProducts(fetchedProducts);
        // console.log("Fetched/Refetched Products:", fetchedProducts);
        } catch (error) {
        console.error("Error fetching/refetching products:", error);
    }
  }, [user]); // Removed db from deps

  // const fetchTikTokAccounts = useCallback(async () => { // REMOVED
  //   if (!user) return;
  //   try {
  //     const tiktokQuery = query(
  //       collection(db, 'users', user.uid, 'integrations'),
  //       where('type', '==', 'tiktok')
  //     );
  //     const tiktokSnapshot = await getDocs(tiktokQuery);
  //     const fetchedTikTok = tiktokSnapshot.docs.map(doc => ({ 
  //       id: doc.id, 
  //       ...doc.data(),
  //       name: doc.data().user_info?.display_name || `TikTok Account ${doc.id.slice(-4)}`
  //     }));
  //     setTiktokAccounts(fetchedTikTok);
  //     // console.log("Fetched/Refetched TikTok Accounts:", fetchedTikTok);
  //   } catch (error) {
  //     console.error("Error fetching/refetching TikTok accounts:", error);
  //   }
  // }, [user]); // REMOVED

  // --- NEW: refreshLayoutData Function ---
  const refreshLayoutData = useCallback(async () => {
    // console.log("[Layout] Refreshing layout data...");
    try {
      await fetchProducts();
      await fetchCreatorsAndBackgrounds();
      // await fetchTikTokAccounts(); // REMOVED
      // Potentially add other data refresh calls here if needed
      // console.log("[Layout] Layout data refreshed.");
    } catch (error) {
      console.error("[Layout] Error refreshing layout data:", error);
    }
  }, [fetchProducts, fetchCreatorsAndBackgrounds]); // REMOVED fetchTikTokAccounts
  // --- END NEW: refreshLayoutData Function ---

  // --- Fetch Initial Data ---
  useEffect(() => {
    if (user) {
    setIsInitialDataLoaded(false); // Reset on user change
      setIsLoadingSuggestionsData(true);
      Promise.all([fetchCreatorsAndBackgrounds(), fetchProducts()]) // REMOVED fetchTikTokAccounts()
      .finally(() => {
          setIsLoadingSuggestionsData(false);
            setIsInitialDataLoaded(true);
            // console.log('[Layout Data Fetch] All initial data fetches completed. isInitialDataLoaded set to true.');
        });
    } else {
        // Clear data if user logs out
        setCreators([]);
        setBackgrounds([]);
        setProducts([]);
        // setTiktokAccounts([]); // REMOVED
        setIsInitialDataLoaded(false);
    }
  }, [user, fetchCreatorsAndBackgrounds, fetchProducts]); // REMOVED fetchTikTokAccounts

  // --- NEW: Effect to fetch Firestore user data ---
  useEffect(() => {
    if (user && user.uid) {
      const userDocRef = doc(db, 'users', user.uid);
      const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          setFirestoreUserData(docSnap.data());
        } else {
          console.log("User document not found in Firestore for layout header.");
          setFirestoreUserData(null); // Clear if not found
        }
      }, (error) => {
        console.error("Error fetching user document from Firestore for layout header:", error);
        setFirestoreUserData(null); // Clear on error
      });
      return () => unsubscribe(); // Cleanup listener on unmount or user change
    } else {
      setFirestoreUserData(null); // Clear if no user
    }
  }, [user]); // Rerun if user object changes
  // --- END NEW ---

  // --- NEW: Onboarding check effect ---
  useEffect(() => {
    // Protected routes that require authentication
    const protectedRoutes = ['/generation', '/studio', '/settings', '/history'];
    const currentPath = location.pathname;
    
    if (protectedRoutes.includes(currentPath) && !user) {
      console.log('Protected route accessed without authentication, redirecting to signup');
      navigate('/signup');
    }
  }, [user, location.pathname, navigate]);
  // --- END NEW ---

  // Effect to update header based on location
  useEffect(() => {
    const path = location.pathname;
    switch (path) {
      case '/':
        setPageTitle(`Recent Generations`);
        setPageSubtitle('Overview of your latest creations.');
        break;
      case '/studio':
        setPageTitle('AI Content Studio');
        setPageSubtitle('Create TikTok and Instagram content with AI.');
        break;
      case '/calendar':
        setPageTitle('Content Calendar');
        setPageSubtitle('Plan and view your generated content.');
        break;
      case '/settings':
        setPageTitle('Settings');
        setPageSubtitle('Manage your profile, products, and assets.');
        break;
      default:
        setPageTitle('Lungo AI'); // Fallback title
        setPageSubtitle('');
    }
  }, [location, user?.displayName, firestoreUserData]); // MODIFIED: Added firestoreUserData to dependencies

  // --- Handle Manage Billing (Moved from Dashboard) ---
  const handleManageBilling = async () => {
    setIsPortalLoading(true);
    setPortalError(null);

    try {
        const result = await createStripePortalSessionCallableLayout();
      if (result.data && result.data.url) {
        window.open(result.data.url, '_blank');
        } else {
        throw new Error('No portal URL received');
        }
    } catch (error) {
      console.error('Error opening billing portal:', error);
      setPortalError('Failed to open billing portal. Please try again.');
    } finally {
        setIsPortalLoading(false);
    }
  };

  // --- NEW: Handle Extra Credit Purchase ---
  const handlePurchaseCredits = async () => {
    if (!user?.email || creditQuantity < 1) return;
    
    setIsPurchasingCredits(true);
    setCreditPurchaseError(null);

    try {
      const result = await createOneTimeCheckoutSession({
        quantity: creditQuantity,
        userEmail: user.email
      });

      if (result.data?.url) {
        // Use the session URL directly from Stripe
        window.location.href = result.data.url;
      } else if (result.data?.sessionId) {
        // Fallback to constructing URL if only sessionId is provided
        const checkoutUrl = `https://checkout.stripe.com/c/pay/${result.data.sessionId}`;
        window.location.href = checkoutUrl;
      } else {
        throw new Error('No session URL or ID received');
      }
    } catch (error) {
      console.error('Error purchasing credits:', error);
      setCreditPurchaseError('Failed to initiate credit purchase. Please try again.');
    } finally {
      setIsPurchasingCredits(false);
    }
  };
  // --- END NEW ---

  // --- Toggle Chat Input Visibility --- (Modified to clear mention on close)
  const toggleChatInput = () => {
    setIsChatInputVisible(prev => {
      const nextVisibleState = !prev;
      if (nextVisibleState) {
        // Focus the input shortly after it becomes visible
        setTimeout(() => {
          chatInputRef.current?.focus();
        }, 50); // Small delay to ensure element is ready
      } else {
        // Blur the input and clear any selected mention when hiding
        chatInputRef.current?.blur();
        setCreationMode(null); // Reset creation mode when chat input is closed
        // Reset step states
        setCreationStep(1);
        setCreationSource('');
        // Optionally reset sub-option states here as well
        setSelectedVideoType('');
        setSelectedVideoLength('');
        setSelectedVideoProduct('');
        setSelectedImageType('');
        setSelectedImageQuality('');
        setSelectedSlideshowProduct('');
        setSelectedSlideshowBackground('');
        setSelectedSlideshowType('');
        setSelectedSlideshowLanguage('en');
        // setSelectedCampaignTikTok(''); // REMOVED
        // setSelectedCampaignProduct(''); // REMOVED
        // setSelectedCampaignSlideshowType(''); // REMOVED
        // setSelectedCampaignBackgrounds([]); // REMOVED
        // setSelectedCampaignLanguage('en'); // REMOVED
      }
      return nextVisibleState;
    });
  };

  // --- Handle Input Change --- (REMOVED @ MENTION LOGIC)
  const handleInputChange = (event) => {
    const value = event.target.value;
    setInputValue(value);
    // Simplified suggestion logic: only show suggestions if input is not empty
    // and not in a creation mode that uses the input for free text.
    if (value.trim() && !creationMode) { 
      const fuse = new Fuse(commandDefinitions, { keys: ['name', 'description'], threshold: 0.3 });
      const results = fuse.search(value).map(result => result.item);
      // Filter out commands that don't have a commandCode (client-side only, e.g., old logout)
      setSuggestions(results.filter(cmd => cmd.code !== undefined && cmd.code !== 0));
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // --- Handle Command Submission --- (Integrates selectedAsset)
  const handleCommandSubmit = async () => {
    // event.preventDefault(); // If needed

    if (!user) {
      alert("Please log in to use commands.");
      return;
    }

    const finalCommandText = inputValue.trim();
    let itemName = "Task"; // Default for generatingItem

    if (pendingConfirmation) setPendingConfirmation(null);

    let operationPayload = {
      text: finalCommandText || "", // Always send text, even if empty
      chatHistory: [], // Add chat history if available and needed by backend
      // Frontend's inferred command and params, backend will make final decision
      // but these can guide it or be used if text is ambiguous.
      commandCode: 0, 
      parameters: { userId: user.uid } // Always include userId
    };

    if (creationMode) {
      // For creation modes, set the command code and required parameters
      if (finalCommandText) {
        operationPayload.parameters.user_prompt = finalCommandText;
      }

      if (creationMode === 'video') {
        alert("Video generation is temporarily disabled.");
        return;
        // Video logic that used parseUserCommandCallable is commented out
      } else if (creationMode === 'image') {
        itemName = 'Image';
        
        const imageGenPayload = {
          userInput: finalCommandText || 'a random image',
          imageType: selectedImageType === 'background' ? 'background_image' : 'ugc_image',
          // gender, age, ethnicity could be added here from state if available
          style: selectedImageQuality === 'high' ? 'high quality realistic photo' : 'photorealistic',
        };

        console.log(`[Layout] Calling generateImageCallable with payload:`, imageGenPayload);

        // Set generating state for UI
        setIsGeneratingImage(true);
        setGeneratingItem({
          type: itemName.toLowerCase(),
          status: 'initiating',
          name: finalCommandText || `New ${itemName}`
        });

        // Set up Firestore listener for real-time status updates
        let statusUnsubscribe = null;
        const setupStatusListener = (userId) => {
          const statusRef = collection(db, 'users', userId, 'generation_status');
          const statusQuery = query(statusRef, orderBy('createdAt', 'desc'), limit(1));
          
          statusUnsubscribe = onSnapshot(statusQuery, (snapshot) => {
            if (!snapshot.empty) {
              const statusDoc = snapshot.docs[0];
              const statusData = statusDoc.data();
              
              console.log('[Layout] Real-time status update:', statusData);
              
              setGeneratingItem(prev => ({
                ...prev,
                status: statusData.status,
                message: statusData.message,
                step: statusData.step,
                totalSteps: statusData.totalSteps
              }));
            }
          });
        };

        setupStatusListener(user.uid);

        try {
          // Token refresh logic
          if (user && user.getIdToken) {
             try {
                await user.getIdToken(true); 
                console.log(`[Layout] Token refreshed for image generation.`);
             } catch (tokenError) {
                console.warn('[Layout] Optional token refresh failed:', tokenError);
             }
          }

          // DIRECTLY CALL THE NEW FUNCTION - Real status updates come from Firestore
          const result = await generateImageCallable(imageGenPayload);
          console.log('[Layout] generateImageCallable result:', result);

          if (result.data?.success) {
            // Don't navigate - just show success and refresh data
            console.log('[Layout] Image generated successfully:', result.data.image);
            // Optionally refresh user data to show updated credits
            refreshLayoutData(); 
          } else {
            // Handle specific errors from backend
            const errorMessage = result.data?.message || 'Unknown error from backend.';
            alert(`Error generating Image: ${errorMessage}`);
          }

        } catch (error) {
          console.error('Error calling generateImageCallable:', error);
          // Handle callable function errors (e.g., insufficient credits)
          let userErrorMessage = error.message;
          if (error.code === 'resource-exhausted') {
            userErrorMessage = `Oops! You're out of credits for this action. Please buy more or upgrade your plan.`;
          }
          alert(`Error: ${userErrorMessage}`);
        } finally {
          // Clean up Firestore listener
          if (statusUnsubscribe) {
            statusUnsubscribe();
          }
          
          // Reset generating state regardless of outcome
          setTimeout(() => {
            setGeneratingItem(null);
            setIsGeneratingImage(false);
          }, 2000); // Keep status visible for 2 seconds after completion
          
          // UI cleanup
          setInputValue('');
          setSuggestions([]);
          setShowSuggestions(false);
          setCreationMode(null);
          setSelectedImageType('');
          setSelectedImageProduct('');
          setSelectedImageQuality('high');
          setIsChatInputVisible(false);
        }
        
        return; // IMPORTANT: Return here to prevent falling through to old logic

      } else if (creationMode === 'slideshow') {
        alert("Slideshow generation is temporarily disabled.");
        return;
        // Slideshow logic that used parseUserCommandCallable is commented out
      }

    } else if (finalCommandText) {
       alert("Text-based commands are temporarily disabled.");
       return;
      // Text-only command logic commented out
    } else if (selectedAsset) {
      // This part might be deprecated or integrated differently
      alert("Asset selection action is not fully implemented yet.");
      setSelectedAsset(null);
      // Cleanup
      setInputValue(''); setSuggestions([]); setShowSuggestions(false); setIsChatInputVisible(false);
      return;

    } else {
      // No input, no creation mode, no asset selected - just toggle input open
      if (!isChatInputVisible) {
        toggleChatInput();
      }
      chatInputRef.current?.focus();
      return; 
    }
  };

  // Handle Enter key press in input
  const handleKeyDownInput = (event) => {
    if (event.key === 'Enter') {
      handleCommandSubmit();
    }
    // Allow suggestion navigation (if implemented)
  };

  // --- Handle Suggestion Click --- (Keeps input value clean)
  const handleSuggestionClick = (suggestion) => {
    if (suggestion.type === 'command') {
        setInputValue('/' + suggestion.name + ' '); 
        setShowSuggestions(false);
    } else if (suggestion.type === 'creator' || suggestion.type === 'background') {
        const currentFullInputValue = inputValue; // e.g., "Hello @initial_word rest of line"
        const atIndex = currentFullInputValue.lastIndexOf('@');

        if (atIndex !== -1) {
            const textAfterAtSymbol = currentFullInputValue.substring(atIndex + 1); // e.g., "initial_word rest of line"
            
            const parts = textAfterAtSymbol.split(' ');
            // const matchedToken = parts[0]; // This was used for suggestion matching

            let textToPreserveAfterMention = "";
            if (parts.length > 1) {
                textToPreserveAfterMention = parts.slice(1).join(' '); // e.g., "rest of line"
            }

            // The inputValue state should hold the text to be displayed *after* the pill
            setInputValue(textToPreserveAfterMention ? ` ${textToPreserveAfterMention}` : '');
        } else {
            // Fallback, though this path should ideally not be hit if a suggestion was clicked
            setInputValue('');
        }
    }
    setShowSuggestions(false);
    setSuggestions([]);
    // Use setTimeout to ensure focus happens after state updates and potential re-renders
    setTimeout(() => chatInputRef.current?.focus(), 0); 
  };

  // --- Helper Functions for Suggestions --- (Larger, square icons)
  const getSuggestionIcon = (suggestion) => {
    const iconSizeClass = "w-9 h-16"; // Increased size to w-6 h-6

    if (suggestion.type === 'command') {
      const colorClass = getCommandColor(suggestion.id);
      let IconComponent = Code; 
      
      // Determine icon based on command code range
      if (suggestion.id < 100) IconComponent = Sparkle; // Planning (Calendar yerine Sparkle)
      else if (suggestion.id < 200) IconComponent = VideoIcon; // Video Generation
      else if (suggestion.id < 300) IconComponent = ImageIcon; // Image Generation
      else if (suggestion.id < 400) IconComponent = VideoIcon; // Slideshow (using VideoIcon for now)
      else if (suggestion.id < 500) IconComponent = PencilSimple; // Editing
      else if (suggestion.id < 600) IconComponent = Database;    // Data Management
      else if (suggestion.id < 700) IconComponent = Compass;     // UI Control
      else if (suggestion.id < 800) IconComponent = Power;       // Authentication
      // Add more specific checks if needed, e.g., for TOGGLE_THEME

      // Use larger size class for command icon container
      return <span className={`flex items-center justify-center ${iconSizeClass} rounded ${colorClass}`}><IconComponent size={14} weight="bold" /></span>; // Slightly bigger inner icon too
    } else if (suggestion.type === 'creator') {
      return suggestion.imageUrl 
        // Use larger size class, use 'rounded' instead of 'rounded-full'
        ? <img src={suggestion.imageUrl} alt={suggestion.name} className={`${iconSizeClass} rounded object-cover`} /> 
        // Use larger size class for fallback span
        : <span className={`flex items-center justify-center ${iconSizeClass} rounded bg-blue-500/20 text-blue-400`}><UserIcon size={14} weight="bold" /></span>;
    } else { // background
      return suggestion.imageUrl 
        // Use larger size class
        ? <img src={suggestion.imageUrl} alt={suggestion.name} className={`${iconSizeClass} rounded object-cover`} /> 
        // Use larger size class for fallback span
        : <span className={`flex items-center justify-center ${iconSizeClass} rounded bg-lime-500/20 text-lime-400`}><ImageIcon size={14} weight="bold" /></span>;
    }
  };

  // --- Command Queue Processing Effect --- (Update generatingItem handling)
  useEffect(() => {
    if (!isInitialDataLoaded || currentlyExecuting || commandQueue.length === 0 || pendingConfirmation) {
        return;
    }

    const nextInQueueItem = commandQueue[0]; // This item now includes .mentionInfo
    setCurrentlyExecuting(nextInQueueItem); 

    const processNextInQueueItem = async () => {
        // Make a mutable copy for command execution, ensuring parameters object exists
        let commandToExecute = {
            ...nextInQueueItem, // Spread all properties from the queue item
            parameters: { ...(nextInQueueItem.parameters || {}) } // Ensure parameters is an object
        };

        try {
            // --- Inject baseImageUrl for creators for video generation command ---
            if (
                commandToExecute.commandCode === 101 &&
                commandToExecute.mentionInfo &&
                commandToExecute.mentionInfo.type === 'creator' &&
                commandToExecute.mentionInfo.id // Check for ID instead of imageUrl
            ) {
                commandToExecute.parameters.mentionedCreatorId = commandToExecute.mentionInfo.id;
                
                // Find the creator and set baseImageUrl if needed
                const creator = creators.find(c => c.id === commandToExecute.mentionInfo.id);
                if (creator && creator.imageUrl) {
                    commandToExecute.parameters.baseImageUrl = creator.imageUrl;
                }
                
                // Clean up old parameters that are no longer needed
                delete commandToExecute.parameters.creatorNameMentioned;
                // console.log(`[Layout Queue] Added mentionedCreatorId ${commandToExecute.mentionInfo.id} and baseImageUrl for command 101.`);
            }
            // --- END Inject baseImageUrl ---

            if (commandToExecute.action === 'SAVE_GENERATED_IMAGE') {
                const { itemType, name, imageUrl, generationData } = commandToExecute.payload;
                console.log(`Saving ${itemType} "${name}"...`);

                let savePromise;
                if (itemType === 'Creator') {
                    savePromise = saveCreatorFromGenCallable({ 
                        creator_name: name, 
                        imageUrl: imageUrl, 
                        original_generation_data: generationData 
                    });
                } else if (itemType === 'Background') {
                    savePromise = saveBackgroundFromGenCallable({ 
                        background_name: name, 
                        imageUrl: imageUrl, 
                        original_generation_data: generationData 
                    });
                } else {
                    console.error(`Error: Unknown item type "${itemType}" for saving.`);
                    return; // Exit if unknown type
                }

                const result = await savePromise;
                if (result.data.success) {
                    console.log(`${itemType} "${name}" saved successfully! ${result.data.message || ''}`);
                    if (itemType === 'Creator' || itemType === 'Background') {
                        fetchCreatorsAndBackgrounds(); 
                    }
                } else {
                    console.error(`Failed to save ${itemType}: ${result.data.message || 'Unknown error from backend.'}`);
                }
                setActiveImageData(null); 

            } else if (commandToExecute.commandCode) { // Check if it's a command with a code
                // --- NEW: Use parseUserCommand instead of handleCommandExecution ---
                console.log(`[Layout Queue] Processing command ${commandToExecute.commandCode} via parseUserCommand`);
                
                const operationPayload = {
                    text: commandToExecute.text || "",
                    chatHistory: [],
                    commandCode: commandToExecute.commandCode,
                    parameters: {
                        userId: user.uid,
                        ...commandToExecute.parameters
                    }
                };

                try {
                    // Temporarily disable other commands until they are re-implemented
                    console.warn(`[Layout Queue] Command ${commandToExecute.commandCode} is temporarily disabled (parseUserCommand removed)`);
                    setGeneratingItem(null);
                } catch (parseError) {
                    console.error(`[Layout Queue] Error processing command ${commandToExecute.commandCode}:`, parseError);
                    throw parseError; // Re-throw to be handled by outer catch
                }
                // --- END NEW: Use parseUserCommand ---
            } else {
                console.warn("[Layout Queue Effect] Queue item is not a recognized action or command:", commandToExecute);
            }
        } catch (error) {
            console.error("[Layout Queue Effect] Error during command/action execution:", error);
          let userErrorMessage = `Sorry, there was an issue processing your request.`;
          if (error.code === 'resource-exhausted') {
               let creditType = 'Credits';
                 const code = nextInQueueItem?.commandCode; // Use nextInQueue here
               if (code >= 200 && code < 300) creditType = 'Image Credits';
               else if (code >= 100 && code < 200) creditType = 'Video Credits';
               else if (code >= 300 && code < 400) creditType = 'Slideshow Credits';
               userErrorMessage = `Oops! It looks like you're out of ${creditType} for this action. Please upgrade your plan to get more.`;
          } else if (error.message) {
              userErrorMessage = `Error: ${error.message}`;
          }
          console.error("Error during command execution in queue:", userErrorMessage);
          setGeneratingItem(null); 
        } finally {
            // console.log(`[Layout Queue Effect] Finished processing item from queue. Clearing currentlyExecuting.`);
          setCurrentlyExecuting(null);
            setCommandQueue(prev => prev.slice(1)); // Remove processed item from queue
        }
    };

    processNextInQueueItem();

  }, [isInitialDataLoaded, commandQueue, currentlyExecuting, pendingConfirmation, navigate, products, creators, backgrounds, user, refreshDashboardGenerations, setGeneratingItem, fetchCreatorsAndBackgrounds, fetchProducts, setActiveImageData, auth, db, setPendingConfirmation, refreshLayoutData]);

  // --- NEW: Video Status Polling Effect (using Firestore onSnapshot) ---
  useEffect(() => {
    const shouldPoll = generatingItem && generatingItem.type === 'video' && generatingItem.firestoreDocId && user && user.uid;
    let unsubscribeFromDoc = null; // Initialize with null

    if (shouldPoll) {
        if (!isPollingActive) {
            console.log(`[Layout Polling Firestore] Starting listener for Doc ID: ${generatingItem.firestoreDocId} for user ${user.uid}`);
            setIsPollingActive(true);
            const docRef = doc(db, 'users', user.uid, 'tiktok-posts', generatingItem.firestoreDocId);

            unsubscribeFromDoc = onSnapshot(docRef, (docSnap) => {
                console.log('[Layout Polling Firestore] Snapshot received. Current generatingItem:', JSON.parse(JSON.stringify(generatingItem)), 'Doc ID:', docSnap.id); // DETAILED LOG
                // Check if still supposed to be polling this item (it might have changed or been cleared)
                if (!generatingItem || generatingItem.firestoreDocId !== docSnap.id) {
                    console.warn('[Layout Polling Firestore] generatingItem changed or cleared during snapshot. Current generatingItem:', generatingItem, 'Snapshot for:', docSnap.id);
                    if (unsubscribeFromDoc) {
                        unsubscribeFromDoc();
                        // setIsPollingActive(false); // Let the main effect logic handle this based on shouldPoll
                    }
                    return; // Stop processing this snapshot
                }

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    console.log(`[Layout Polling Firestore] Doc ${docSnap.id} exists. Data status: ${data.status}, Current generatingItem status: ${generatingItem?.status}`); // DETAILED LOG

                    const terminalSuccessStatuses = ['completed', 'concatenated'];
                    const terminalErrorStatuses = [
                        'failed', 'runway_failed', 'upload_failed', 'image_gen_failed',
                        'runway_timeout', 'concatenation_failed', 'completed_concat_failed',
                        'pipeline_error_no_image', 'pipeline_error_openai_init',
                        'pipeline_error_credits', 'pipeline_internal_error',
                        'image_generated_pipeline_failed_to_start',
                        'image_gen_timeout', 'scheduling_failed', 'internal_error'
                    ];

                    if (terminalSuccessStatuses.includes(data.status)) {
                        console.log(`[Layout Polling Firestore] Video success for ${generatingItem.firestoreDocId}, status: ${data.status}.`);
                        notifyGenerationComplete('video', generatingItem.firestoreDocId);
                    } else if (terminalErrorStatuses.includes(data.status)) {
                        console.error(`[Layout Polling Firestore] Video failed for ${generatingItem.firestoreDocId}, status: ${data.status}, error: ${data.error || 'Unknown'}`);
                        notifyGenerationComplete('video', generatingItem.firestoreDocId);
                    } else {
                        // If not a terminal status
                        if (generatingItem.status !== data.status || generatingItem.statusDisplay !== data.status) {
                             console.log(`[Layout Polling Firestore] Updating generatingItem status from ${generatingItem.status} to ${data.status} for doc ${docSnap.id}`); // DETAILED LOG
                             setGeneratingItem(prev => prev ? ({ ...prev, status: data.status, statusDisplay: data.status }) : null);
                        } else {
                             console.log(`[Layout Polling Firestore] Status unchanged for doc ${docSnap.id}. Current: ${data.status}`); // DETAILED LOG
                        }
                    }
                } else {
                    console.error(`[Layout Polling Firestore] Document ${generatingItem.firestoreDocId} does not exist.`);
                    notifyGenerationComplete('video', generatingItem?.firestoreDocId || 'unknown_id_on_missing_doc');
                }
            }, (error) => {
                console.error('[Layout Polling Firestore] Error listening to document:', error);
                notifyGenerationComplete('video', generatingItem?.firestoreDocId || 'unknown_id_on_error');
            });
        } 
    } else {
        // Not supposed to poll (generatingItem is null, not video, no user, etc.)
        if (isPollingActive && unsubscribeFromDoc) {
            // console.log('[Layout Polling Firestore] shouldPoll is false, but a listener was active. Cleaning up.');
            unsubscribeFromDoc();
            setIsPollingActive(false); 
        }
    }

    return () => {
        if (unsubscribeFromDoc) {
            // console.log('[Layout Polling Firestore] Cleanup: Detaching Firestore listener for:', generatingItem?.firestoreDocId || 'N/A');
            unsubscribeFromDoc();
            setIsPollingActive(false); 
        }
    };
  // Make sure all dependencies are correctly listed, especially those used inside the effect.
  // db is generally stable, user object reference might change, generatingItem reference will change.
  }, [generatingItem, user, isPollingActive, notifyGenerationComplete, db]); // Added db back as it is used, isPollingActive to re-evaluate when it changes externally

  // Memoize the context value
  const outletContextValue = useMemo(() => ({
    dashboardRefreshKey,
    generatingItem,
    commandQueue, // <-- ADDED for canvas
    pageTitle,
    pageSubtitle,
    navigate,
    creators,
    backgrounds,
    products,
    user,
    firestoreUserData, // <-- ADDED for user data
    refreshLayoutData,
    refreshDashboardGenerations,
    notifyGenerationComplete, // <-- ADDED
    slideshowTypeOptions, // Pass down slideshow options
    languageOptions, // Pass down language options
    setCanvasStatus, // <-- ADDED for canvas status
    setIsPricingModalOpen, // <-- ADDED for pricing modal
  }), [
    dashboardRefreshKey,
    generatingItem, // If generatingItem is an object, its reference changing will still trigger this
    commandQueue, // <-- ADDED
    pageTitle,
    pageSubtitle,
    // navigate, // Stable from react-router-dom
    creators, // Array reference
    backgrounds, // Array reference
    products, // Array reference
    user, // User object reference
    firestoreUserData, // <-- ADDED for user data
    // refreshLayoutData, // Assuming this is stable (useCallback)
    // refreshDashboardGenerations // Stable (useCallback)
    // For functions like navigate, refreshLayoutData, refreshDashboardGenerations,
    // if they are guaranteed stable (e.g., from useCallback with empty deps, or from libraries),
    // they don't strictly need to be in the useMemo dep array if we trust their stability.
    // However, including them is safer if there's any doubt. For now, let's include potentially changing objects/values.
    // For simplicity in this first pass, including all.
    // We need to ensure refreshLayoutData, refreshDashboardGenerations are stable via useCallback.
    // navigate from react-router-dom is stable.
    refreshLayoutData, // Assuming stable due to useCallback
    refreshDashboardGenerations, // Stable (useCallback)
    notifyGenerationComplete, // <-- ADDED
    slideshowTypeOptions, // Add to dependency array
    languageOptions, // Add to dependency array
  ]);

  // Function to get dynamic title and subtitle based on current route
  const getPageTitleAndSubtitle = () => {
    const path = location.pathname;
    
    switch (path) {
      case '/':
      case '/dashboard':
        return {
          title: 'Home',
          subtitle: 'Create amazing content with AI'
        };
      case '/studio':
        return {
          title: 'AI Content Studio',
          subtitle: 'Create TikTok and Instagram content with AI'
        };
      case '/calendar':
        return {
          title: 'Schedule',
          subtitle: 'Plan and organize your content'
        };
      case '/settings':
        return {
          title: 'Settings',
          subtitle: 'Manage your products, creators & preferences'
        };
      default:
        return {
          title: 'Lungo AI',
          subtitle: 'AI-powered content creation'
        };
    }
  };

  const { title: currentTitle, subtitle: currentSubtitle } = getPageTitleAndSubtitle();

  // Canvas sayfasında iken dot background'ı gizle
  const isCanvasPage = location.pathname === '/studio';

  return (
    <div className="h-screen bg-neutral-100 dark:bg-neutral-950 font-sans relative transition-colors duration-200 overflow-hidden">
      {/* Conditional Background */}
      {location.pathname === '/' ? (
        // Image background for index pages
        <div className="fixed inset-0 h-full w-full">
          <img 
            src="/im10.png" 
            alt="Background" 
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/30" />
        </div>
      ) : location.pathname === '/history' ? (
        // Solid neutral-950 background for history page
        <div className="absolute inset-0 h-full w-full bg-neutral-950" />
      ) : location.pathname === '/studio' ? (
        // White dot grid background for studio page
        <div className="absolute inset-0 h-full w-full bg-neutral-950 bg-[radial-gradient(#303030_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_60%,transparent_100%)]"></div>
      ) : !isCanvasPage ? (
        // Dot grid background for other pages (except canvas and studio)
        <div className="absolute inset-0 h-full w-full bg-white dark:bg-neutral-950 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_60%,transparent_100%)]"></div>
      ) : null}
      
      {/* Main content container with relative positioning */}
      <div className="relative z-10 flex flex-col h-full"> {/* Ensure layout fills height */}
        
        {/* --- Top Navigation Bar --- */}
        <header className="fixed top-3 left-3 right-3 z-40 bg-neutral-900/40 backdrop-blur-xl transition-colors duration-200 rounded-2xl h-12">
          <div className="flex items-center justify-between h-full px-5">
            {/* Left: Logo */}
            <button 
              onClick={() => navigate('/')}
              className="flex items-center group"
            >
              <img 
                src="/logonaked.png"
                alt="Lungo AI Logo"
                className="h-4 w-auto"
              />
            </button>
            
            {/* Right: Credits/Pricing/Settings for desktop only, Sign Up for guests */}
            <div className="flex items-center gap-3">
              {user ? (
                <>
                  {/* Credit Display */}
                  {firestoreUserData && (
                    <div 
                      onClick={() => setIsPricingModalOpen(true)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg cursor-pointer transition-colors"
                    >
                      <img 
                        src="/logonaked.png"
                        alt="Lungo AI Logo"
                        className="h-2.5 w-auto"
                      />
                      <span className="text-sm font-medium text-white">
                        {firestoreUserData.general_credits?.toLocaleString() || '0'}
                      </span>
                    </div>
                  )}

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
                  
                  {/* Settings */}
                  <button
                    onClick={() => navigate('/settings')}
                    className="p-2 rounded-full text-white hover:bg-neutral-800 transition-colors"
                    aria-label="Settings"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                    </svg>
                  </button>
                </>
              ) : (
                <>
                  {/* Models Button for non-authenticated users */}
                  <button
                    onClick={() => navigate('/models')}
                    className="px-3 py-1.5 text-white hover:bg-neutral-800 rounded-lg text-sm font-medium transition-colors"
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
                  {/* Sign Up button for non-authenticated users */}
                  <button
                    onClick={() => navigate('/signup')}
                    className="px-4 py-1.5 bg-white hover:bg-neutral-100 text-black rounded-xl text-sm font-medium transition-colors"
                  >
                    Sign Up
                  </button>
                </>
              )}
            </div>
          </div>
        </header>
        {/* --- End Top Navigation Bar --- */}

        {/* Render the child route's component */}
        <main className={`flex-grow w-full ${isCanvasPage ? 'pt-20' : 'max-w-6xl mx-auto px-4 xl:px-0 pt-24'}`}> 
          <Outlet context={outletContextValue} /> 
        </main>

        {/* Remove User Messages Display from here */}
        {/* 
        <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 w-full max-w-4xl px-4 z-10 pointer-events-none"> 
             <div className="max-h-40 overflow-y-auto bg-neutral-50/80 dark:bg-neutral-800/80 backdrop-blur-md p-3 rounded-lg border border-stone-200 dark:border-stone-700 shadow-sm text-xs pointer-events-auto flex flex-col-reverse">
                {[...userMessages].reverse().map((msg, index) => (
                    <p key={userMessages.length - 1 - index} className={`mt-1 ${msg.startsWith('>') ? 'text-stone-600 dark:text-stone-400' : 'text-black dark:text-white'}`}>
                        {msg}
                    </p>
                ))}
            </div>
        </div>
        */}
      </div>


      
      <style>{`
        @keyframes dropdown-open {
          from {
            opacity: 0;
            transform: translateY(10px) translateX(-50%);
          }
          to {
            opacity: 1;
            transform: translateY(0) translateX(-50%);
          }
        }

        /* Slider thumb styling */
        .slider-red::-webkit-slider-thumb {
          appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #ef4444;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .slider-red::-moz-range-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #ef4444;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
      `}</style>
      
      {isImageModalOpen && modalImageUrl && (
          <div 
              className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity duration-300"
              onClick={() => setIsImageModalOpen(false)}
          >
              <div 
                  className="relative max-w-4xl max-h-[90vh] bg-white dark:bg-neutral-900 rounded-lg shadow-xl overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
              >
                  <img 
                      src={modalImageUrl}
                      alt="Generated Content Enlarged"
                      className="block max-w-full max-h-[85vh] object-contain"
                  />
                  <button 
                      onClick={() => setIsImageModalOpen(false)}
                      className="absolute top-2 right-2 p-1.5 bg-neutral-900/50 text-white rounded-full hover:bg-neutral-900/70 transition-colors z-10"
                      aria-label="Close image modal"
                  >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                  </button>
              </div>
          </div>
      )}
      {/* --- End Image Modal --- */} 

      {/* --- NEW: Asset Selection Modal --- */}
      {isAssetModalOpen && (
        <div 
          className="fixed inset-0 z-40 bg-neutral-900/70 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity duration-300"
          onClick={() => setIsAssetModalOpen(false)} // Close on overlay click
        >
          <div 
            className="relative w-full max-w-md bg-white dark:bg-neutral-900 rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[70vh]"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside modal
          >
            <div className="flex items-center justify-between p-4 border-b border-stone-200 dark:border-stone-700">
              <h3 className="text-lg font-semibold text-stone-800 dark:text-white">Select an Asset</h3>
              <button 
                onClick={() => setIsAssetModalOpen(false)}
                className="p-1.5 text-stone-500 dar00k:text-stone-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full"
                aria-label="Close asset selection modal"
              >
                <XCircle size={20} />
              </button>
            </div>
            
            {/* Todo: Add Search/Filter Input Here if desired */}
            {/* <div className="p-3 border-b border-stone-200 dark:border-stone-700"> */}
            {/*   <input type="text" placeholder="Search assets..." className="w-full p-2 rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-neutral-800 text-sm" /> */}
            {/* </div> */}

            <div className="overflow-y-auto flex-grow p-2">
              {creators.length === 0 && backgrounds.length === 0 ? (
                <p className="text-center text-stone-500 dark:text-stone-400 py-8">No creators or backgrounds found. Add them in Settings.</p>
              ) : (
                <ul>
                  {/* Display Creators */}
                  {creators.length > 0 && (
                    <li className="px-2 py-1.5 text-xs text-stone-400 dark:text-stone-500 font-semibold">CREATORS</li>
                  )}
                  {creators.map(creator => (
                    <li key={`asset-creator-${creator.id}`} className="mb-1 last:mb-0">
                      <button 
                        onClick={() => {
                          setSelectedAsset({ ...creator, type: 'creator' });
                          setIsAssetModalOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors rounded-md"
                      >
                        <div className="flex items-center gap-3">
                          {getSuggestionIcon({ ...creator, type: 'creator' })}
                          <span className="text-stone-800 dark:text-stone-200 text-sm truncate">{creator.name}</span>
                        </div>
                        <ArrowRight size={16} className="text-stone-400 dark:text-stone-500" />
                      </button>
                    </li>
                  ))}

                  {/* Display Backgrounds */}
                  {backgrounds.length > 0 && (
                    <li className="px-2 py-1.5 mt-3 text-xs text-stone-400 dark:text-stone-500 font-semibold">BACKGROUNDS</li>
                  )}
                  {backgrounds.map(background => (
                    <li key={`asset-background-${background.id}`} className="mb-1 last:mb-0">
                      <button 
                        onClick={() => {
                          setSelectedAsset({ ...background, type: 'background' });
                          setIsAssetModalOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors rounded-md"
                      >
                        <div className="flex items-center gap-3">
                          {getSuggestionIcon({ ...background, type: 'background' })}
                          <span className="text-stone-800 dark:text-stone-200 text-sm truncate">{background.name}</span>
                        </div>
                        <ArrowRight size={16} className="text-stone-400 dark:text-stone-500" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}


      {/* --- Billing Modal (Moved from Dashboard) --- */}
      <AnimatePresence>
        {isBillingModalOpen && firestoreUserData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            onClick={() => setIsBillingModalOpen(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-xl" />
            
            {/* Modal Content */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-lg bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-stone-100 dark:border-stone-800">
                <div className="flex items-center gap-6">
                  <button className="text-sm font-medium text-stone-500 dark:text-stone-400">Account Settings</button>
                  <button className="text-sm font-medium text-black dark:text-white">Credits & Billing</button>
                </div>
                <button 
                  onClick={() => setIsBillingModalOpen(false)}
                  className="p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-stone-400 dark:text-stone-500 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Current Subscription */}
                <div>
                  <h3 className="text-xl font-semibold text-black dark:text-white mb-1">
                    {firestoreUserData.stripePriceId ? planPriceMap[firestoreUserData.stripePriceId]?.split(' ')[0] || 'Pro' : 'Starter'}
                  </h3>
                  <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">Current Subscription</p>
                  
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <p className="text-sm text-stone-500 dark:text-stone-400">Current credits</p>
                      <p className="text-lg font-medium text-black dark:text-white">
                        {firestoreUserData.general_credits?.toLocaleString() || '0'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-stone-500 dark:text-stone-400">Renewal date</p>
                      <p className="text-lg font-medium text-black dark:text-white">
                        {firestoreUserData.subscriptionStatus === 'active' && firestoreUserData.currentPeriodEnd
                          ? new Date(firestoreUserData.currentPeriodEnd * 1000).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : 'N/A'}
                      </p>
                    </div>
                  </div>

                  <button 
                    onClick={() => {
                      if (firestoreUserData && (firestoreUserData.subscriptionStatus === 'active' || firestoreUserData.subscriptionStatus === 'trialing')) {
                        handleManageBilling();
                      } else {
                        setIsBillingModalOpen(false); // Close current modal
                        setIsPricingModalOpen(true); // Open pricing modal
                      }
                    }}
                    disabled={isPortalLoading}
                    className={`w-full py-3 font-medium rounded-xl transition-colors ${
                      isPortalLoading 
                        ? 'bg-neutral-300 dark:bg-neutral-700 text-stone-500 dark:text-stone-500 cursor-not-allowed'
                        : 'bg-lime-500 hover:bg-lime-600 text-white'
                    }`}>
                    {isPortalLoading ? 'Opening...' : 'Get 10,000 Credits $89/m'}
                  </button>
                </div>

                {/* Extra Credits Purchase */}
                <div className="border-t border-stone-100 dark:border-stone-800 pt-6">
                  <h3 className="text-lg font-semibold text-black dark:text-white mb-3">Buy Extra Credits</h3>
                  <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">
                    Purchase additional credits at $15 per 1,000 credits. <span className="text-xs opacity-75">(Monthly plans offer better value!)</span>
                  </p>
                  
                  {/* --- NEW: Slider for Credit Quantity --- */}
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                        <label htmlFor="creditSlider" className="text-sm text-stone-600 dark:text-stone-400">
                            Credit Packs (1 pack = 1,000 credits):
                        </label>
                        <span className="text-sm font-medium text-black dark:text-white">
                            {creditQuantity} pack(s) / {(creditQuantity * 1000).toLocaleString()} credits
                        </span>
                    </div>
                    <input 
                        type="range"
                        id="creditSlider"
                        min="1"
                        max="100" // Max 100 packs (100,000 credits)
                        step="1"
                        value={creditQuantity}
                        onChange={(e) => setCreditQuantity(Number(e.target.value))}
                        className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer slider-red"
                    />
                  </div>
                  {/* --- END: Slider for Credit Quantity --- */}

                  <div className="flex items-center justify-between mb-4 p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
                    <span className="text-sm text-stone-600 dark:text-stone-400">Total:</span>
                    <span className="text-lg font-semibold text-black dark:text-white">
                      ${(creditQuantity * 15).toFixed(2)}
                    </span>
                  </div>

                  <button
                    onClick={handlePurchaseCredits}
                    disabled={isPurchasingCredits || creditQuantity < 1}
                    className={`w-full py-3 font-medium rounded-xl transition-colors ${
                      isPurchasingCredits || creditQuantity < 1
                        ? 'bg-neutral-300 dark:bg-neutral-700 text-stone-500 dark:text-stone-500 cursor-not-allowed'
                        : 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-stone-900 hover:bg-neutral-800 dark:hover:bg-neutral-200'
                    }`}
                  >
                    {isPurchasingCredits ? 'Processing...' : `Purchase ${(creditQuantity * 1000).toLocaleString()} Credits`}
                  </button>

                  {creditPurchaseError && (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400">{creditPurchaseError}</p>
                  )}
                </div>

                {/* Usage Stats */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-4xl font-bold text-black dark:text-white">{firestoreUserData.general_credits?.toLocaleString() || '0'}</h2>
                      <p className="text-sm text-stone-500 dark:text-stone-400">Credits remaining</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-medium text-black dark:text-white">{firestoreUserData.general_credits_limit?.toLocaleString() || '0'}</p>
                      <p className="text-sm text-stone-500 dark:text-stone-400">Total limit</p>
                    </div>
                  </div>
                </div>

                {portalError && (
                  <p className="mt-4 text-xs text-center text-red-600 dark:text-red-400">{portalError}</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* --- End Billing Modal --- */}

      {/* --- NEW: Pricing Modal --- */}
      <AnimatePresence>
        {isPricingModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-white dark:bg-neutral-950"
            onClick={() => setIsPricingModalOpen(false)} // Close on backdrop click
          >
            {/* Close button for the pricing modal itself */}
            <button 
              onClick={() => setIsPricingModalOpen(false)}
              className="fixed top-6 right-6 z-20 p-3 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-full text-stone-800 dark:text-stone-200 transition-colors shadow-lg"
              aria-label="Close pricing plans"
            >
              <X size={24} />
            </button>
            
            {/* Full Page Content */}
            <div 
              className="h-full w-full overflow-y-auto"
              onClick={(e) => e.stopPropagation()} // Prevent close on content click
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
      {/* --- End Pricing Modal --- */}

    </div>
  );
}

export default Layout; 