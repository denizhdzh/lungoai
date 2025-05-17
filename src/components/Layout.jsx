import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../firebase'; // Import db
import { getFunctions, httpsCallable } from "firebase/functions"; // Import functions SDK
import { Sun, Moon, Plus, ArrowRight, ArrowUpRight, User, ImageSquare, Code, Sparkle, Calendar, FilmSlate, PencilSimple, Database, Compass, Power, ChatText, XCircle, BookOpen } from '@phosphor-icons/react';
import { collection, query, getDocs, Timestamp } from "@firebase/firestore"; 
import { commandDefinitions } from '../command'; 
import { handleCommandExecution, performDelete } from '../commandHandler'; // Go up one level
import { DotLottieReact } from '@lottiefiles/dotlottie-react'; // Import DotLottieReact
import Fuse from 'fuse.js'; // Import Fuse.js for fuzzy matching
import { doc, onSnapshot, getDoc } from "firebase/firestore"; 

// Initialize Firebase Functions
const functions = getFunctions();
// Define callable functions for saving generated items
const saveCreatorFromGenCallable = httpsCallable(functions, 'saveCreatorFromGeneration');
const saveBackgroundFromGenCallable = httpsCallable(functions, 'saveBackgroundFromGeneration');

// --- REMOVE COPIED CREDIT CONSTANTS ---
// const planCreditLimits = { ... };
// const defaultCreditValues = { ... };
// --- END REMOVED CREDIT CONSTANTS ---

function Layout() {
  const user = auth.currentUser;
  const navigate = useNavigate();
  const location = useLocation(); // Mevcut konum bilgisini almak için
  const chatInputRef = useRef(null);
  const messagesContainerRef = useRef(null); // <-- ADDED: Ref for messages container
  const previousLocationRef = useRef(null); // Ensure definition is here, within Layout scope
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isChatInputVisible, setIsChatInputVisible] = useState(false); // State for chat input visibility
  const [plan] = useState('Free'); // Add plan state (can be fetched later)

  // --- Command & Interaction State ---
  const [commandQueue, setCommandQueue] = useState([]);
  const [currentlyExecuting, setCurrentlyExecuting] = useState(null); // Store the command object being executed
  const [userMessages, setUserMessages] = useState([]);
  const [pendingConfirmation, setPendingConfirmation] = useState(null); // { type, options?, identifier?, command?, item? }

  // --- Data State ---
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [creators, setCreators] = useState([]); // To store fetched creators
  const [backgrounds, setBackgrounds] = useState([]); // To store fetched backgrounds
  const [products, setProducts] = useState([]); // Add state for products
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

  // State for the new Asset Selection mechanism
  const [selectedAsset, setSelectedAsset] = useState(null); // { id, name, type, imageUrl }
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);

  // NEW: State for dynamic header content
  const [pageTitle, setPageTitle] = useState('');
  const [pageSubtitle, setPageSubtitle] = useState('');

  // --- Fuzzy Match Options for Yes/No ---
  const yesNoOptions = ["yes", "no", "y", "n", "evet", "hayır", "e", "h"];
  const fuseYesNo = new Fuse(yesNoOptions, { includeScore: true, threshold: 0.4 }); // Adjust threshold as needed

  // --- Function to trigger dashboard refresh ---
  const refreshDashboardGenerations = useCallback(() => {
    setDashboardRefreshKey(prevKey => prevKey + 1);
  }, []); // Wrap with useCallback and provide an empty dependency array

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

  // --- NEW: refreshLayoutData Function ---
  const refreshLayoutData = useCallback(async () => {
    // console.log("[Layout] Refreshing layout data...");
    try {
      await fetchProducts();
      await fetchCreatorsAndBackgrounds();
      // Potentially add other data refresh calls here if needed
      // console.log("[Layout] Layout data refreshed.");
    } catch (error) {
      console.error("[Layout] Error refreshing layout data:", error);
    }
  }, [fetchProducts, fetchCreatorsAndBackgrounds]);
  // --- END NEW: refreshLayoutData Function ---

  // --- Fetch Initial Data ---
  useEffect(() => {
    if (user) {
    setIsInitialDataLoaded(false); // Reset on user change
      setIsLoadingSuggestionsData(true);
      Promise.all([fetchCreatorsAndBackgrounds(), fetchProducts()])
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
        setIsInitialDataLoaded(false);
    }
  }, [user, fetchCreatorsAndBackgrounds, fetchProducts]);

  // Effect to update header based on location
  useEffect(() => {
    const path = location.pathname;
    // Store previous location *unless* navigating to aiguide
    if (path !== '/aiguide' && previousLocationRef.current?.pathname !== path) { // Avoid overwriting with same location
        previousLocationRef.current = location;
    }
    switch (path) {
      case '/':
        setPageTitle(`Welcome, ${user?.displayName || 'User'}`);
        setPageSubtitle('Ready to create something amazing?');
        break;
      case '/calendar':
        setPageTitle('Content Calendar');
        setPageSubtitle('Plan and view your generated content.');
        break;
      case '/settings':
        setPageTitle('Settings');
        setPageSubtitle('Manage your profile, products, and assets.');
        break;
      case '/aiguide':
        setPageTitle('How to Talk to Lungo AI');
        setPageSubtitle('Tips for getting the best results.');
        break;
      default:
        setPageTitle('Lungo AI'); // Fallback title
        setPageSubtitle('');
    }
  }, [location, user?.displayName]); // Update on path or name change

  // Dark mode effect
  useEffect(() => {
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
      }
      return nextVisibleState;
    });
  };

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Cmd+K or Ctrl+K for toggling chat input
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault(); 
        toggleChatInput();
      }
      
      // Cmd+M or Ctrl+M for toggling dark mode
      if ((event.metaKey || event.ctrlKey) && event.key === 'm') {
        event.preventDefault();
        toggleDarkMode();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [toggleDarkMode]); // Add toggleDarkMode to dependency array

  // --- Handle Input Change --- (REMOVED @ MENTION LOGIC)
  const handleInputChange = (event) => {
    const value = event.target.value;
    setInputValue(value);
    // Suggestions are no longer triggered by typing '@' in the main input.
    // setShowSuggestions(false); // Decide if this is needed or if modal controls it
    // setSuggestions([]);      // Decide if this is needed or if modal controls it
  };

  // --- Handle Command Submission --- (Integrates selectedAsset)
  const handleCommandSubmit = async () => {
    let commandTextForParsing = inputValue.trim();
    const finalCommandText = commandTextForParsing;

    const assetMentionForCommand = selectedAsset; 
    const mentionTypeAtSubmit = assetMentionForCommand ? assetMentionForCommand.type : null;
    const mentionNameAtSubmitIfAny = assetMentionForCommand ? assetMentionForCommand.name : null;
    
    setInputValue(''); 
    if (!finalCommandText && !pendingConfirmation && !assetMentionForCommand) { // Only proceed if there's text, a pending confirmation, or an asset selected (for asset-only commands perhaps in future)
       return;
    }

    // Construct the displayed message, including asset info if present
    let displayedMessage = `> ${finalCommandText}`;
    if (assetMentionForCommand) {
      displayedMessage = `> ${finalCommandText || 'Use asset'} (with @${assetMentionForCommand.name})`;
      if (!finalCommandText) { // If only an asset was selected and no text typed
        // The backend will need to know what to do with just an asset.
        // For now, we ensure finalCommandText isn't empty for parsing if an asset is present.
        // commandTextForParsing = `trigger_asset_action_for_${assetMentionForCommand.type}`;
      }
    }
    setUserMessages(prev => [...prev, displayedMessage]); 

    // Clear the selected asset from the button area *immediately after* it has been used for the current command submission's display
    setSelectedAsset(null); 
    
    if (pendingConfirmation) {
        let confirmationProcessed = false;
        let needsCleanup = true; 
        const userResponse = finalCommandText.toLowerCase(); 

        // --- Confirm Delete Flow (Existing) ---
        if (pendingConfirmation.type === 'confirm_delete') {
            if (userResponse === 'yes') { 
                setUserMessages(prev => [...prev, `Okay, deleting ${pendingConfirmation.identifier}...`]);
                const deleteSuccess = await performDelete(
                    pendingConfirmation.item, 
                    pendingConfirmation.command.commandCode === 502 ? 'product' :
                    pendingConfirmation.command.commandCode === 504 ? 'creator' :
                    pendingConfirmation.command.commandCode === 506 ? 'background' : null,
                    setUserMessages,
                    user?.uid
                );
                if (deleteSuccess) {
                    if (pendingConfirmation.command.commandCode === 502) fetchProducts(); 
                    else if (pendingConfirmation.command.commandCode === 504) fetchCreatorsAndBackgrounds();
                    else if (pendingConfirmation.command.commandCode === 506) fetchCreatorsAndBackgrounds();
                }
                confirmationProcessed = true;
            } else if (userResponse === 'no') { 
                 setUserMessages(prev => [...prev, `Deletion cancelled.`]);
                confirmationProcessed = true;
            } else {
                 setUserMessages(prev => [...prev, `Deletion cancelled.`]);
                 confirmationProcessed = true;
            }
        // --- Select Item to Delete Flow (Existing) ---
        } else if (pendingConfirmation.type.startsWith('delete_')) { 
            const selectedOption = pendingConfirmation.options.find(opt => opt.name?.toLowerCase() === userResponse); 
            if (selectedOption) {
                setPendingConfirmation({ 
                    type: 'confirm_delete', 
                    identifier: selectedOption.name, 
                    command: pendingConfirmation.command, 
                    item: selectedOption 
                });
                setUserMessages(prev => [
                    ...prev,
                    `Are you sure you want to delete ${pendingConfirmation.type.split('_')[1]} '${selectedOption.name}'? (yes/no)`
                ]);
                confirmationProcessed = true;
                needsCleanup = false; 
            } else if (userResponse === 'cancel') { 
                 setUserMessages(prev => [...prev, `Operation cancelled.`]);
                 confirmationProcessed = true;
            } else {
                 setUserMessages(prev => [...prev, `Invalid option. Please type the exact name or 'cancel'.`]);
                 confirmationProcessed = true;
                 needsCleanup = false; 
            }
        // --- NEW: Confirm Save Image Flow ---
        } else if (pendingConfirmation.type === 'confirm_save_image') {
            const match = fuseYesNo.search(userResponse); 
            const bestMatch = match.length > 0 ? match[0].item : null;

            if (bestMatch === 'yes' || bestMatch === 'y' || bestMatch === 'evet' || bestMatch === 'e') {
                setUserMessages(prev => [
                    ...prev.filter(msg => !msg.includes('Would you like to save')), 
                    `Great! Please enter a name for this ${pendingConfirmation.itemType}:`
                ]);
                setPendingConfirmation({
                    type: 'prompt_save_name',
                    itemType: pendingConfirmation.itemType,
                    imageUrl: pendingConfirmation.imageUrl,
                    generationData: pendingConfirmation.generationData
                });
                confirmationProcessed = true;
                needsCleanup = false; 
            } else if (bestMatch === 'no' || bestMatch === 'n' || bestMatch === 'hayır' || bestMatch === 'h') {
                setUserMessages(prev => [
                     ...prev.filter(msg => !msg.includes('Would you like to save')), 
                     `Okay, the image was not saved.`
                ]);
                setActiveImageData(null); 
                confirmationProcessed = true;
            } else {
                 setUserMessages(prev => [
                     ...prev,
                     `Sorry, I didn't understand. Please answer with 'yes' or 'no'. Would you like to save the image as a ${pendingConfirmation.itemType}?`
                 ]);
                 confirmationProcessed = true;
                 needsCleanup = false; 
            }
        // --- NEW: Prompt Save Name Flow ---
        } else if (pendingConfirmation.type === 'prompt_save_name') {
            const name = userResponse; 
            setUserMessages(prev => [
                ...prev.filter(msg => !msg.includes('Please enter a name')), 
                `Okay, preparing to save ${pendingConfirmation.itemType} '${name}'...'` 
            ]);

            const saveActionPayload = {
                itemType: pendingConfirmation.itemType, 
                name: name,
                imageUrl: pendingConfirmation.imageUrl, 
                generationData: pendingConfirmation.generationData 
            };
            setCommandQueue(prev => [...prev, { action: 'SAVE_GENERATED_IMAGE', payload: saveActionPayload }]);

            setActiveImageData(null); 
            confirmationProcessed = true;
        }

        if (confirmationProcessed && needsCleanup) {
            setPendingConfirmation(null);
        }

        if (confirmationProcessed) {
            // If confirmation was processed, the selectedAsset (if any) was for the *next* command,
            // not this confirmation, so don't clear it here.
            return; 
        }
    }

    const processingMessage = `Got it, processing your request...`;
    setUserMessages(prev => [...prev, processingMessage]);

    // Don't clear selectedAsset here. It persists until explicitly changed or cleared by its own X button.
    // The command should use the asset that *was* selected at the time of submit.

    try {
      const parseUserCommand = httpsCallable(functions, 'parseUserCommand');
      // console.log(`Calling parseUserCommand with text: "${finalCommandText}", and asset:`, assetMentionForCommand);
      const result = await parseUserCommand({ 
          text: finalCommandText, 
          selectedAssetId: assetMentionForCommand ? assetMentionForCommand.id : null,
          selectedAssetType: assetMentionForCommand ? assetMentionForCommand.type : null,
      }); 
      const command = result.data; 

      let proceed = true;
      let validationMessage = '';

      // --- NEW: Frontend Credit & Resource Checks ---
      if (command && command.commandCode) {
        const userDocForCreditCheck = await getDoc(doc(db, 'users', user.uid)); // Fetch fresh user data
        const firestoreUser = userDocForCreditCheck.exists() ? userDocForCreditCheck.data() : {};
        
        if (command.commandCode === 101) { // UGC Video
          const videoCreditsAvailable = firestoreUser.video_credit || 0;
          if (videoCreditsAvailable <= 0) {
            proceed = false;
            validationMessage = "Oops! It looks like you're out of Video Credits. Please upgrade your plan.";
          }
          if (proceed && products.length === 0 && mentionTypeAtSubmit !== 'creator') {
            proceed = false;
            validationMessage = "To generate video, please add at least one Product (in Settings > Products).";
          }
        } else if (command.commandCode === 301) { // Slideshow
          const slideshowCreditsAvailable = firestoreUser.slideshow_credit || 0;
          if (slideshowCreditsAvailable <= 0) {
            proceed = false;
            validationMessage = "Oops! It looks like you're out of Slideshow Credits. Please upgrade your plan.";
          } else {
            const hasProducts = products.length > 0;
            const hasBackgrounds = backgrounds.length > 0;
            const isBackgroundAssetSelected = assetMentionForCommand && assetMentionForCommand.type === 'background';
            const hasTopic = command.parameters && command.parameters.topic;

            // If the command is not specific enough (no selected background asset to drive content AND no topic provided AND no products to use)
            if (!isBackgroundAssetSelected && !hasTopic && !hasProducts) {
              proceed = false; // Mark to stop processing and show a message
              // The messages below are now more specific to the case where *all* are missing.
              // If only topic/background is missing but products exist, proceed = true.
              if (!hasProducts && !hasBackgrounds) { // This condition remains, but proceed is false only if hasTopic is also false
                validationMessage = "To create a slideshow, please add Products (in Settings > Products) and Backgrounds (in Settings > Backgrounds), or specify a topic.";
              } else if (!hasProducts) { // Backgrounds exist, products do not, topic is missing
                validationMessage = "For a product-based slideshow, add a Product (Settings > Products). To use your existing Backgrounds for this slideshow, please specify a topic or select a background asset.";
              } else if (!hasBackgrounds && !isBackgroundAssetSelected) { // Products exist, backgrounds do not, topic is missing, no background asset selected
                validationMessage = "To use custom images in the slideshow, add a Background (Settings > Backgrounds) or select one. With only products, please specify a topic if you don't want a product-focused slideshow.";
              } else { // Products and backgrounds exist, but still ambiguous (no topic, no selected background)
                // This message implies products exist, so if we reach here and !hasTopic && !isBackgroundAssetSelected,
                // the new logic should allow proceeding if hasProducts is true.
                // So this specific 'else' might need adjustment or removal if proceeding with product is the default.
                // For now, let's refine the message for the truly ambiguous case where all guiding inputs are missing.
                validationMessage = "Please specify a topic for the slideshow, select a Background asset to use, or ensure you have Products added (in Settings > Products) for a product-based slideshow.";
              }
            }
            // If isBackgroundAssetSelected is true, or hasTopic is true, or hasProducts is true (implicit for product-driven slideshow)
            // the command is considered specific enough from the frontend's asset/topic/product perspective.
            // `proceed` remains true unless set false by credit check or the block above.
          }
        }
      }
      // --- END NEW: Frontend Credit & Resource Checks ---

      if (!proceed) { // If frontend checks failed
        setUserMessages(prev => prev.filter(msg => msg !== processingMessage));
        setUserMessages(prev => [...prev, validationMessage]);
        console.error("Command blocked by frontend validation:", { command, validationMessage });
        return; // Stop further processing
      }

      // Original validation logic based on selected asset type and command (can stay as is or be merged)
      if (command && command.commandCode) {
        const commandCode = command.commandCode;
        // Validation using mentionTypeAtSubmit (derived from selectedAsset)
        if (mentionTypeAtSubmit === 'creator' && commandCode !== 101 && commandCode !== 401) {
            proceed = false;
            validationMessage = `When a Creator (@${mentionNameAtSubmitIfAny || 'selected'}) is selected, you can generally only generate a UGC video (command 101) or edit an image (command 401).`;
        } else if (mentionTypeAtSubmit === 'background' && commandCode !== 301 && commandCode !== 401) {
            proceed = false;
            validationMessage = `When a Background (@${mentionNameAtSubmitIfAny || 'selected'}) is selected, you can generally only generate a slideshow (command 301) or edit an image (command 401).`;
        }
      } else {
          if (mentionTypeAtSubmit) {
               proceed = false; 
               validationMessage = `Hmm, I couldn't understand that request with the selected ${mentionTypeAtSubmit} (@${mentionNameAtSubmitIfAny || 'selected'}). Try a different command.`;
          } else {
               proceed = false; // Standard parsing failure
          }
      }

      setUserMessages(prev => prev.filter(msg => msg !== processingMessage));

      if (command && command.commandCode === 0) {
          // console.log("Received command code 0 from backend (unknown/removed command).");
          setUserMessages(prev => [
              ...prev,
              "This feature is not currently available. If you'd like to request a new feature, please visit the Settings > Feature Requests section."
          ]);
          return;
      }

      if (proceed && command && command.commandCode) {
        // console.log('Cloud Function Response (Validated):', command);
        const queueItem = {
          ...command, 
          mentionInfo: assetMentionForCommand 
        };
        setCommandQueue(prev => [...prev, queueItem]);
      } else {
         const errorMessage = validationMessage || `Hmm, I couldn't quite understand that. Could you try phrasing it differently?`;
         setUserMessages(prev => [...prev, errorMessage]);
         console.error("Command blocked by validation or parsing failed:", { command, mentionTypeAtSubmit, validationMessage });
      }
    } catch (error) {
      setUserMessages(prev => prev.filter(msg => msg !== processingMessage));
      console.error("Error calling parseUserCommand function:", error);
      setUserMessages(prev => [...prev, `Sorry, there was an issue understanding your request. (Details: ${error.message || 'Unknown Error'})`]);
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
      if (suggestion.id < 100) IconComponent = Calendar;      // Planning
      else if (suggestion.id < 200) IconComponent = FilmSlate; // Video Generation
      else if (suggestion.id < 300) IconComponent = ImageSquare; // Image Generation
      else if (suggestion.id < 400) IconComponent = FilmSlate; // Slideshow (using FilmSlate for now)
      else if (suggestion.id < 500) IconComponent = PencilSimple; // Editing
      else if (suggestion.id < 600) IconComponent = Database;    // Data Management
      else if (suggestion.id < 700) IconComponent = Compass;     // UI Control
      else if (suggestion.id < 800) IconComponent = Power;       // Authentication
      // Add more specific checks if needed, e.g., for TOGGLE_THEME
      // if (suggestion.id === 603) IconComponent = Sun; // Or Moon depending on state?

      // Use larger size class for command icon container
      return <span className={`flex items-center justify-center ${iconSizeClass} rounded ${colorClass}`}><IconComponent size={14} weight="bold" /></span>; // Slightly bigger inner icon too
    } else if (suggestion.type === 'creator') {
      return suggestion.imageUrl 
        // Use larger size class, use 'rounded' instead of 'rounded-full'
        ? <img src={suggestion.imageUrl} alt={suggestion.name} className={`${iconSizeClass} rounded object-cover`} /> 
        // Use larger size class for fallback span
        : <span className={`flex items-center justify-center ${iconSizeClass} rounded bg-blue-500/20 text-blue-400`}><User size={14} weight="bold" /></span>;
    } else { // background
      return suggestion.imageUrl 
        // Use larger size class
        ? <img src={suggestion.imageUrl} alt={suggestion.name} className={`${iconSizeClass} rounded object-cover`} /> 
        // Use larger size class for fallback span
        : <span className={`flex items-center justify-center ${iconSizeClass} rounded bg-green-500/20 text-green-400`}><ImageSquare size={14} weight="bold" /></span>;
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
                // No longer sending baseImageUrl or creatorNameMentioned directly from here for this case
                // The backend will use mentionedCreatorId to fetch the image.
                // If baseImageUrl was used for other purposes in command 101, that needs review.
                // Assuming for now it was primarily for the @creator's image.
                delete commandToExecute.parameters.baseImageUrl; 
                delete commandToExecute.parameters.creatorNameMentioned;
                // console.log(`[Layout Queue] Added mentionedCreatorId ${commandToExecute.mentionInfo.id} for command 101.`);
            }
            // --- END Inject baseImageUrl ---

            if (commandToExecute.action === 'SAVE_GENERATED_IMAGE') {
                const { itemType, name, imageUrl, generationData } = commandToExecute.payload;
                let saveInProgressMessage = `Saving ${itemType} "${name}"...`;
                setUserMessages(prev => [...prev, saveInProgressMessage]);

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
                    setUserMessages(prev => [...prev.filter(msg => msg !== saveInProgressMessage), `Error: Unknown item type "${itemType}" for saving.`]);
                    return; // Exit if unknown type
                }

                const result = await savePromise;
                setUserMessages(prev => prev.filter(msg => msg !== saveInProgressMessage));
                if (result.data.success) {
                    setUserMessages(prev => [...prev, `${itemType} "${name}" saved successfully! ${result.data.message || ''}`.trim()]);
                    if (itemType === 'Creator' || itemType === 'Background') {
                        fetchCreatorsAndBackgrounds(); 
                    }
                } else {
                    setUserMessages(prev => [...prev, `Failed to save ${itemType}: ${result.data.message || 'Unknown error from backend.'}`]);
                }
                setActiveImageData(null); 

            } else if (commandToExecute.commandCode) { // Check if it's a command with a code
                const commandDef = commandDefinitions.find(cmd => cmd.code === commandToExecute.commandCode);

                // --- FETCH USER'S FIRESTORE DOCUMENT FOR CREDITS ---
                let firestoreUserDataForCommand = null; // Changed variable name
                if (user && user.uid) {
                    try {
                        const userDocRef = doc(db, 'users', user.uid);
                        const userDocSnap = await getDoc(userDocRef);
                        if (userDocSnap.exists()) {
                            firestoreUserDataForCommand = userDocSnap.data(); // Changed variable name
                            // console.log("[Layout Queue Effect] Fetched Firestore user data for credits:", firestoreUserDataForCommand);
                        } else {
                            console.warn("[Layout Queue Effect] Firestore user document not found for UID:", user.uid);
                        }
                    } catch (error) {
                        console.error("[Layout Queue Effect] Error fetching Firestore user document:", error);
                    }
                } else {
                    console.warn("[Layout Queue Effect] No authenticated user (user or user.uid is null) to fetch Firestore data for.");
                }
                // --- END FETCH USER'S FIRESTORE DOCUMENT ---

    const executionContext = {
        navigate,
        auth,
        db,
                    user, 
                    firestoreUserData: firestoreUserDataForCommand, // Use the locally fetched data
        setUserMessages,
        setPendingConfirmation,
        toggleDarkMode,
        products,
        creators,
        backgrounds,
        commandDef,
                    setGeneratingItem,
        refreshDashboardGenerations,
                    setActiveImageData,
                    fetchProducts,
                    fetchCreatorsAndBackgrounds,
                    refreshLayoutData, // Added from previous summary
                    isDarkMode,        // Added from previous summary
                    pageTitle,         // Added from previous summary
                    pageSubtitle,      // Added from previous summary
                    dashboardRefreshKey// Added from previous summary
                };

                // Pass the potentially modified commandToExecute
                await handleCommandExecution(commandToExecute, executionContext);
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
          setUserMessages(prev => [...prev.filter(msg => !msg.includes('processing your request')), userErrorMessage]);
          setGeneratingItem(null); 
        } finally {
            // console.log(`[Layout Queue Effect] Finished processing item from queue. Clearing currentlyExecuting.`);
          setCurrentlyExecuting(null);
            setCommandQueue(prev => prev.slice(1)); // Remove processed item from queue
        }
    };

    processNextInQueueItem();

  }, [isInitialDataLoaded, commandQueue, currentlyExecuting, pendingConfirmation, navigate, products, creators, backgrounds, user, toggleDarkMode, refreshDashboardGenerations, setGeneratingItem, fetchCreatorsAndBackgrounds, fetchProducts, setActiveImageData, auth, db, setUserMessages, refreshLayoutData]);

  // --- NEW: Video Status Polling Effect (using Firestore onSnapshot) ---
  useEffect(() => {
    const shouldPoll = generatingItem && generatingItem.type === 'video' && generatingItem.firestoreDocId;
    let unsubscribeFromDoc; 

    if (shouldPoll && !isPollingActive) {
        // console.log(`[Layout Polling Firestore] Starting listener for Doc ID: ${generatingItem.firestoreDocId}`);
        setIsPollingActive(true);
        
        // Ensure user and user.uid are available
        if (!user || !user.uid) {
            console.error("[Layout Polling Firestore] User or user.uid is not available. Cannot set up listener.");
            setIsPollingActive(false); // Reset flag
                 return;
            }
        const docRef = doc(db, 'users', user.uid, 'tiktok-posts', generatingItem.firestoreDocId);

        unsubscribeFromDoc = onSnapshot(docRef, (docSnap) => {
            // Check if still supposed to be polling this item, it might have changed
            if (!generatingItem || generatingItem.firestoreDocId !== docSnap.id) {
                console.warn('[Layout Polling Firestore] generatingItem changed or cleared during snapshot. Detaching this listener.');
                if (unsubscribeFromDoc) unsubscribeFromDoc(); // Unsubscribe this specific listener
                // isPollingActive will be reset by the effect cleanup if generatingItem leads to shouldPoll becoming false
                return;
            }

            if (docSnap.exists()) {
                const data = docSnap.data();
                // console.log('[Layout Polling Firestore] Received status update:', data.status, data);

                const terminalSuccessStatuses = ['completed'];
                const terminalErrorStatuses = [
                    'failed', 'runway_failed', 'upload_failed', 'image_gen_failed', 
                    'runway_timeout', 'concatenation_failed', 'completed_concat_failed',
                    'pipeline_error_no_image', 'pipeline_error_openai_init', 
                    'pipeline_error_credits', 'pipeline_internal_error',
                    'image_generated_pipeline_failed_to_start',
                    'image_gen_timeout', // From index.js
                    'scheduling_failed', // From index.js
                    'internal_error' // From index.js handleVideoPollingTask
                ];

                if (terminalSuccessStatuses.includes(data.status)) {
                    setUserMessages(prev => [...prev, `Video generation complete! You can view it in the Home tab.`]);
                    // console.log(`[Layout Polling Firestore] Video completed for ${generatingItem.firestoreDocId}.`);
                    setGeneratingItem(null); // This will trigger effect cleanup
                    refreshDashboardGenerations();
                } else if (terminalErrorStatuses.includes(data.status)) {
                    setUserMessages(prev => [...prev, `Video generation failed: ${data.error || data.status || 'Unknown reason'}`]);
                    console.error(`[Layout Polling Firestore] Video failed for ${generatingItem.firestoreDocId}. Error: ${data.error || data.status}.`);
                    setGeneratingItem(null); // This will trigger effect cleanup
                } else { 
                    // console.log(`[Layout Polling Firestore] Video for ${generatingItem.firestoreDocId} still processing with status: ${data.status}`);
                    // Optionally update generatingItem's status if UI needs to reflect intermediate states
                    // setGeneratingItem(prev => prev ? ({ ...prev, statusDisplay: data.status }) : null);
                }
            } else {
                console.error(`[Layout Polling Firestore] Document ${generatingItem.firestoreDocId} does not exist.`);
                setUserMessages(prev => [...prev, `Error: Video tracking document disappeared.`]);
                setGeneratingItem(null); // This will trigger effect cleanup
            }
        }, (error) => {
            console.error('[Layout Polling Firestore] Error listening to document:', error);
            setUserMessages(prev => [...prev, `Error checking video status: ${error.message}`]);
            setGeneratingItem(null); // This will trigger effect cleanup
        });
    }

    // Cleanup function
    return () => {
        if (unsubscribeFromDoc) {
            // console.log('[Layout Polling Firestore] Cleanup: Detaching Firestore listener for:', generatingItem?.firestoreDocId || 'N/A');
            unsubscribeFromDoc();
        }
        // Reset isPollingActive only if we are certain we are stopping polling for the current generatingItem
        // If generatingItem becomes null or changes, shouldPoll becomes false, and this cleanup runs.
        // The next effect run will then decide if a new listener is needed.
        if (!shouldPoll || (generatingItem && generatingItem.firestoreDocId !== (unsubscribeFromDoc ? unsubscribeFromDoc._listeners?.[0]?.doc.id : null ))) {
             setIsPollingActive(false);
        }
    };
  }, [
      generatingItem?.firestoreDocId, 
      generatingItem?.type,           
      user?.uid,                      
      // db, // Intentionally removed for diagnostics
      refreshDashboardGenerations,    
      setUserMessages,                
      setGeneratingItem               
  ]);
  // --- End Polling Effect ---

  // --- Effect to scroll messages to bottom ---
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [userMessages]);
  // --- End effect to scroll messages to bottom ---

  // --- AI Guide Button Click Handler (defined after previousLocationRef) ---
  const handleGuideClick = () => {
    if (location.pathname === '/aiguide') {
      // Use the stored ref value for navigation
      navigate(previousLocationRef.current?.pathname || '/');
    } else {
      // Store current location *before* navigating
      // No need to store again here, useEffect handles it
      navigate('/aiguide');
    }
  };

  // Memoize the context value
  const outletContextValue = useMemo(() => ({
    dashboardRefreshKey,
    generatingItem,
    pageTitle,
    pageSubtitle,
    isDarkMode,
    toggleDarkMode,
    navigate,
    creators,
    backgrounds,
    products,
    user,
    refreshLayoutData,
    refreshDashboardGenerations
  }), [
    dashboardRefreshKey,
    generatingItem, // If generatingItem is an object, its reference changing will still trigger this
    pageTitle,
    pageSubtitle,
    isDarkMode,
    // toggleDarkMode, // Assuming this is stable (useCallback)
    // navigate, // Stable from react-router-dom
    creators, // Array reference
    backgrounds, // Array reference
    products, // Array reference
    user, // User object reference
    // refreshLayoutData, // Assuming this is stable (useCallback)
    // refreshDashboardGenerations // Stable (useCallback)
    // For functions like toggleDarkMode, navigate, refreshLayoutData, refreshDashboardGenerations,
    // if they are guaranteed stable (e.g., from useCallback with empty deps, or from libraries),
    // they don't strictly need to be in the useMemo dep array if we trust their stability.
    // However, including them is safer if there's any doubt. For now, let's include potentially changing objects/values.
    // For simplicity in this first pass, including all.
    // We need to ensure toggleDarkMode, refreshLayoutData, refreshDashboardGenerations are stable via useCallback.
    // navigate from react-router-dom is stable.
    toggleDarkMode, // Assuming stable due to useCallback
    refreshLayoutData, // Assuming stable due to useCallback
    refreshDashboardGenerations // Assuming stable due to useCallback
  ]);

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 font-sans relative overflow-hidden transition-colors duration-200">
      {/* Animated background grid - Now only in Layout */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="grid-animation"></div>
      </div>
      
      {/* Main content container with relative positioning */}
      <div className="relative z-10 pb-28 flex flex-col min-h-screen"> {/* Ensure layout fills height */}
        
        {/* --- RE-ADD Fixed Header Area --- */}
        <header className=" mt-12 mb-12"> 
          <div className="max-w-6xl mx-auto flex justify-between items-start"> 
            {/* Left: Title & Subtitle */}
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 dark:text-white mb-1">
                {pageTitle}
              </h1>
              <p className="text-gray-500 dark:text-zinc-400">
                {pageSubtitle}
              </p>
            </div>

            {/* Right: Action Buttons */}
            <div className="flex items-center gap-3 pt-1"> 
              {/* AI Guide Button */} 
              <button 
                className={`p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-sm font-medium flex items-center gap-1.5 ${location.pathname === '/aiguide' ? 'text-black dark:text-white' : 'text-gray-500 dark:text-zinc-400'}`}
                onClick={handleGuideClick} // Ensure this uses the handler defined above
                title="AI Guide"
                aria-label="AI Guide"
              >
                <Compass size={18} />
                <span>Guide</span>
              </button>
              {/* Dark Mode Toggle Button */}
              <button
                onClick={toggleDarkMode} // Use toggleDarkMode from Layout
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-600 dark:text-zinc-300 transition-colors flex items-center gap-1.5"
                aria-label="Toggle dark mode"
              >
                {isDarkMode ? <Sun size={18} /> : <Moon size={18} />} 
                <span className="text-xs text-gray-400 dark:text-zinc-500">(⌘M)</span>
              </button>
            </div>
          </div>
        </header>
        {/* --- End Fixed Header Area --- */}

        {/* Render the child route's component */}
        <main className="flex-grow max-w-6xl mx-auto w-full"> {/* Remove pt-8 from main */} 
          <Outlet context={outletContextValue} /> 
        </main>

        {/* Remove User Messages Display from here */}
        {/* 
        <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 w-full max-w-4xl px-4 z-10 pointer-events-none"> 
             <div className="max-h-40 overflow-y-auto bg-gray-50/80 dark:bg-zinc-800/80 backdrop-blur-md p-3 rounded-lg border border-gray-200 dark:border-zinc-700 shadow-sm text-xs pointer-events-auto flex flex-col-reverse">
                {[...userMessages].reverse().map((msg, index) => (
                    <p key={userMessages.length - 1 - index} className={`mt-1 ${msg.startsWith('>') ? 'text-gray-600 dark:text-zinc-400' : 'text-black dark:text-white'}`}>
                        {msg}
                    </p>
                ))}
            </div>
        </div>
        */}
      </div>

      {/* --- Bottom Menu --- */}
      <div className={`fixed bottom-5 left-1/2 transform -translate-x-1/2 z-20 w-full px-4 ${isChatInputVisible ? 'max-w-4xl' : 'max-w-lg'} transition-all duration-300`}>
        <div className="flex flex-col items-center p-4 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-xl border border-gray-100 dark:border-zinc-800 rounded-2xl shadow-md">
          
          {/* New Wrapper Div for Chat Area Content */}
          <div 
            className={`w-full flex flex-col items-center overflow-hidden transition-all duration-300 ease-in-out ${isChatInputVisible ? 'max-h-[70vh] opacity-100 mb-4' : 'max-h-0 opacity-0 mb-0'}`}
          >
            {/* --- Suggestions List --- */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="w-full mb-2 overflow-hidden max-h-60 overflow-y-auto border-b border-gray-200 dark:border-zinc-700">
                <ul>
                  {suggestions.map((suggestion) => (
                    <li key={`${suggestion.type}-${suggestion.id}`} className="mb-1 last:mb-0"> 
                      <button 
                        onClick={() => handleSuggestionClick(suggestion)} 
                        className="w-full flex items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors rounded-md"
                      >
                        <div className="flex items-center gap-3">
                          {getSuggestionIcon(suggestion)}
                          <span className="text-zinc-800 dark:text-zinc-200 text-sm truncate">{suggestion.name}</span>
                        </div>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-3">
                          {suggestion.type === 'command' ? 'Command' : 
                          suggestion.type === 'creator' ? 'Creator' : 'Background'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* --- User Messages Display (Outer Box Restored) --- */}
            {userMessages.length > 0 && (
              <div 
                ref={messagesContainerRef}
                className="w-full mb-3 overflow-hidden max-h-48 overflow-y-auto rounded-lg border border-gray-100 dark:border-zinc-700/50 bg-white/30 dark:bg-zinc-800/30 p-3 text-xs scrollbar-hide"
              >
                  {userMessages.map((msg, index) => {
                    const isUser = msg.startsWith('> '); 
                    const messageText = isUser ? msg.substring(2) : msg;
                    // Determine if the previous message was from the user
                    const previousMessageIsUser = index > 0 && userMessages[index - 1].startsWith('> ');
                    // Show avatar only for the first AI message in a sequence
                    const showAvatar = !isUser && (index === 0 || previousMessageIsUser);

                    return (
                      <div key={index} className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'} mb-1 last:mb-0`}>
                        {showAvatar && (
                          <div className="flex-shrink-0 w-6 h-6"> 
                            <DotLottieReact
                              src="https://lottie.host/f5046ffa-160b-4e7b-9d11-1c8f4fe34e04/eppkYXQ80Y.lottie"
                              loop
                              autoplay
                              style={{ width: '24px', height: '24px' }}
                            />
                          </div>
                        )}
                        {!isUser && !showAvatar && <div className="w-6 h-6 flex-shrink-0"></div>}

                        <div className={`max-w-[75%] px-1 py-0.5 ${isUser ? 'text-black dark:text-white font-medium' : 'text-black dark:text-white'}`}>
                          {messageText}
                        </div>

                        {isUser && auth.currentUser?.photoURL && (
                          <img 
                              src={auth.currentUser.photoURL} 
                              alt="User" 
                              className="w-6 h-6 rounded-full flex-shrink-0"
                          />
                        )}
                        {isUser && !auth.currentUser?.photoURL && (
                            <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-zinc-600 flex-shrink-0"></div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}

            {/* --- Input Area Wrapper --- */}
            <div className="relative w-full"> 
              <div className="w-full flex flex-col gap-2">
                <div className="w-full flex items-center rounded-lg px-2 py-1"> 
                  {/* --- Actual Input --- */}
                  <input 
                    type="text"
                    placeholder={
                        !inputValue 
                            ? "Plan, create, or ask..." 
                            : ''
                    } 
                    className={`flex-grow bg-transparent focus:outline-none text-sm text-black dark:text-zinc-100 placeholder-gray-500 dark:placeholder-zinc-400`} 
                    value={inputValue} 
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDownInput}
                    ref={chatInputRef}
                  />
                  <button 
                    className="p-1.5 rounded-full text-gray-500 dark:text-zinc-400 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                    onClick={handleCommandSubmit}
                  >
                    <ArrowUpRight size={16} />
                  </button>
                </div>
                {/* --- MODIFIED Asset Selection Button --- */}
                <div className="w-full flex items-center px-2 py-1">
                  {!selectedAsset ? (
                    <button 
                      onClick={() => setIsAssetModalOpen(true)} 
                      className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg px-2.5 py-1.5 transition-colors">
                      <Database size={16} /> 
                      <span>Select Asset</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-white bg-blue-500 dark:bg-blue-600 rounded-lg px-2.5 py-1.5">
                      {selectedAsset.imageUrl && (
                        <img src={selectedAsset.imageUrl} alt={selectedAsset.name} className="w-5 h-5 rounded object-cover" />
                      )}
                      {!selectedAsset.imageUrl && selectedAsset.type === 'creator' && (
                        <User size={16} />
                      )}
                      {!selectedAsset.imageUrl && selectedAsset.type === 'background' && (
                        <ImageSquare size={16} />
                      )}
                      <span className="font-medium">{selectedAsset.name}</span>
                      <button 
                        onClick={() => setSelectedAsset(null)} 
                        className="ml-1 p-0.5 rounded-full hover:bg-white/20 text-white">
                        <XCircle size={14} weight="fill" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>{/* End Input Area Wrapper */}
          </div> { /* End of Chat Area Content */}

          {/* Navigation Buttons Row (Removed AI Guide Button) */}
          <nav className="w-full">
            <div className="flex justify-between items-center px-2">
              <div className="flex items-center space-x-3">
                 <div className="flex items-center space-x-1"> {/* Reduced space for logo area */}
                   <img
                     src={isDarkMode ? "/logonaked-white.png" : "/logonaked-black.png"}
                     alt="Lungo AI Logo"
                     className="h-5 w-auto mr-2" // Added margin-right
                   />
                   <button 
                     className={`text-sm font-medium px-3 py-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors ${location.pathname === '/' ? 'text-black dark:text-white' : 'text-gray-500 dark:text-zinc-400'}`}
                     onClick={() => navigate('/')}
                   >
                     Home
                   </button>
                 </div>
                 <button 
                   className={`text-sm font-medium px-3 py-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors ${location.pathname === '/calendar' ? 'text-black dark:text-white' : 'text-gray-500 dark:text-zinc-400'}`}
                   onClick={() => navigate('/calendar')}
                 >
                   Calendar
                 </button>
                 <button 
                   className={`text-sm font-medium px-3 py-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors ${location.pathname === '/settings' ? 'text-black dark:text-white' : 'text-gray-500 dark:text-zinc-400'}`}
                   onClick={() => navigate('/settings')}
                 >
                   Settings
                 </button>
              </div>

              <div className="flex items-center gap-3"> 
                  <button 
                    onClick={toggleChatInput} 
                    className={`text-sm font-medium px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 ${isChatInputVisible 
                        ? 'bg-black/10 dark:bg-white/10 text-black dark:text-white' 
                        : 'hover:bg-black/10 dark:hover:bg-white/10 text-gray-500 dark:text-zinc-400'
                    }`}
                  >
                    {isChatInputVisible ? 'Lungo AI' : 'Lungo AI'} 
                    <span className="text-xs text-gray-900 dark:text-zinc-500">(⌘K)</span>
                  </button>
              </div>
            </div>
          </nav>
        </div>
      </div>
      
      {/* Style Block for Grid Animation - Now only in Layout */}
      <style>{`
        .grid-animation {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          /* Use a subtle black for light mode grid lines */
          background-image: 
            linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px);
          background-size: 40px 40px;
          background-position: center center;
          animation: grid-move 40s linear infinite;
        }
        
        .grid-animation::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          /* Use a subtle light gray for light mode dots */
          background-image: 
            radial-gradient(circle, rgba(0, 0, 0, 0.04) 1px, transparent 1px);
          background-size: 60px 60px;
          background-position: center center;
          animation: dots-pulse 15s ease-in-out infinite alternate;
        }

        @keyframes grid-move { 0% { background-position: 0 0; } 100% { background-position: 40px 40px; } }
        @keyframes dots-pulse { 0% { opacity: 0.2; } 50% { opacity: 0.3; } 100% { opacity: 0.2; } }

        /* Dark mode overrides */
        .dark .grid-animation {
          background-image: 
            /* Increased opacity from 0.03 to 0.06 */
            linear-gradient(rgba(228, 228, 231, 0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(228, 228, 231, 0.06) 1px, transparent 1px);
        }
        
        .dark .grid-animation::before {
          background-image: 
            radial-gradient(circle, rgba(161, 161, 170, 0.05) 1px, transparent 1px);
        }
      `}</style>
      
      {/* --- Image Modal --- */} 
      {isImageModalOpen && modalImageUrl && (
          <div 
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity duration-300"
              onClick={() => setIsImageModalOpen(false)}
          >
              <div 
                  className="relative max-w-4xl max-h-[90vh] bg-white dark:bg-zinc-900 rounded-lg shadow-xl overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
              >
                  <img 
                      src={modalImageUrl}
                      alt="Generated Content Enlarged"
                      className="block max-w-full max-h-[85vh] object-contain"
                  />
                  <button 
                      onClick={() => setIsImageModalOpen(false)}
                      className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors z-10"
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
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity duration-300"
          onClick={() => setIsAssetModalOpen(false)} // Close on overlay click
        >
          <div 
            className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[70vh]"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside modal
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-zinc-700">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Select an Asset</h3>
              <button 
                onClick={() => setIsAssetModalOpen(false)}
                className="p-1.5 text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full"
                aria-label="Close asset selection modal"
              >
                <XCircle size={20} />
              </button>
            </div>
            
            {/* Todo: Add Search/Filter Input Here if desired */}
            {/* <div className="p-3 border-b border-gray-200 dark:border-zinc-700"> */}
            {/*   <input type="text" placeholder="Search assets..." className="w-full p-2 rounded-md border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm" /> */}
            {/* </div> */}

            <div className="overflow-y-auto flex-grow p-2">
              {creators.length === 0 && backgrounds.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-zinc-400 py-8">No creators or backgrounds found. Add them in Settings.</p>
              ) : (
                <ul>
                  {/* Display Creators */}
                  {creators.length > 0 && (
                    <li className="px-2 py-1.5 text-xs text-gray-400 dark:text-zinc-500 font-semibold">CREATORS</li>
                  )}
                  {creators.map(creator => (
                    <li key={`asset-creator-${creator.id}`} className="mb-1 last:mb-0">
                      <button 
                        onClick={() => {
                          setSelectedAsset({ ...creator, type: 'creator' });
                          setIsAssetModalOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors rounded-md"
                      >
                        <div className="flex items-center gap-3">
                          {getSuggestionIcon({ ...creator, type: 'creator' })}
                          <span className="text-zinc-800 dark:text-zinc-200 text-sm truncate">{creator.name}</span>
                        </div>
                        <ArrowRight size={16} className="text-zinc-400 dark:text-zinc-500" />
                      </button>
                    </li>
                  ))}

                  {/* Display Backgrounds */}
                  {backgrounds.length > 0 && (
                    <li className="px-2 py-1.5 mt-3 text-xs text-gray-400 dark:text-zinc-500 font-semibold">BACKGROUNDS</li>
                  )}
                  {backgrounds.map(background => (
                    <li key={`asset-background-${background.id}`} className="mb-1 last:mb-0">
                      <button 
                        onClick={() => {
                          setSelectedAsset({ ...background, type: 'background' });
                          setIsAssetModalOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors rounded-md"
                      >
                        <div className="flex items-center gap-3">
                          {getSuggestionIcon({ ...background, type: 'background' })}
                          <span className="text-zinc-800 dark:text-zinc-200 text-sm truncate">{background.name}</span>
                        </div>
                        <ArrowRight size={16} className="text-zinc-400 dark:text-zinc-500" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Layout; 