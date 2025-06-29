import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, collection, writeBatch, serverTimestamp, updateDoc, getDoc } from "@firebase/firestore"; // Import Firestore functions
import { updateProfile } from "firebase/auth"; // <-- ADD THIS IMPORT
import { auth, db, storage } from '../firebase'; // Import auth, db, and storage
import { getFunctions, httpsCallable } from 'firebase/functions'; // NEW: Import Firebase Functions
import PricingSection from './PricingSection'; // Import PricingSection
import { Plus, X, Package, Image as ImageIcon, CheckCircle, CircleNotch, FilmSlate } from '@phosphor-icons/react'; // Added icons
import { ref, uploadBytes, getDownloadURL, listAll } from "firebase/storage"; // Added Firebase storage functions
import { motion } from 'framer-motion'; // NEW: Import motion

// --- NEW: Fixed Descriptions for Library Images (same as Settings.jsx) ---
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

// NEW: Initialize Firebase Functions
const functions = getFunctions();
const manuallyStandardizeProductVideo = httpsCallable(functions, 'manuallyStandardizeProductVideo');

// Accept the setOnboardingComplete prop
function Onboarding({ setOnboardingComplete }) { 
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [showOffer, setShowOffer] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isLoading, setIsLoading] = useState(false); // General loading state for async operations

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    jobTitle: '',
    company: '',
    referralSource: '',
    interests: [],
    notifications: false,
    dataCollection: false,

    // New Product States for Onboarding
    productName: '',
    productDescription: '',
    productLogoFile: null,
    productMediaFile: null,

    // New Background States for Onboarding
    backgroundName: '', // For custom upload
    backgroundFile: null, // For custom upload
    selectedLibraryBackgroundUrl: '', // For library selection
    backgroundChoice: '' // 'upload' or 'library'
  });

  const productLogoInputRef = useRef(null);
  const productMediaInputRef = useRef(null);
  const backgroundFileInputRef = useRef(null);
  
  // Form validation state
  const [errors, setErrors] = useState({});

  // Library Backgrounds State (for onboarding)
  const [libraryImages, setLibraryImages] = useState([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);

  const handleInputChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    if (type === 'file') {
      setFormData(prev => ({ ...prev, [name]: files[0] || null }));
    } else {
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    }
    
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleInterestToggle = (interest) => {
    setFormData(prev => {
      const interests = [...prev.interests];
      if (interests.includes(interest)) {
        return { ...prev, interests: interests.filter(i => i !== interest) };
      } else {
        return { ...prev, interests: [...interests, interest] };
      }
    });
    
    // Clear interest error when user selects an interest
    if (errors.interests) {
      setErrors(prev => ({
        ...prev,
        interests: ''
      }));
    }
  };

  const validateStep = () => {
    const newErrors = {};
    const user = auth.currentUser;
    
    if (step === 1) {
      if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
      if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
    } 
    else if (step === 2) {
      if (!formData.jobTitle.trim()) newErrors.jobTitle = 'Job title is required';
      if (!formData.company.trim()) newErrors.company = 'Company is required';
    }
    else if (step === 3) {
      if (!formData.referralSource) newErrors.referralSource = 'Please select how you heard about us';
    }
    else if (step === 4) { // Product Step Validation
      if (!formData.productName.trim()) newErrors.productName = 'Product name is required';
      if (!formData.productDescription.trim()) newErrors.productDescription = 'Product description is required';
      else if (formData.productDescription.trim().length < 50) newErrors.productDescription = 'Min 50 characters';
      if (!formData.productLogoFile) newErrors.productLogoFile = 'Product logo is required';
      if (!formData.productMediaFile) newErrors.productMediaFile = 'Product video is required';
    }
    else if (step === 5) { // Background Step Validation
      if (!formData.backgroundChoice) {
        newErrors.backgroundChoice = 'Please choose to upload or select from library.';
      } else if (formData.backgroundChoice === 'upload') {
        if (!formData.backgroundName.trim()) newErrors.backgroundName = 'Background name is required for upload.';
        if (!formData.backgroundFile) newErrors.backgroundFile = 'Background image file is required for upload.';
      } else if (formData.backgroundChoice === 'library') {
        if (!formData.selectedLibraryBackgroundUrl) newErrors.selectedLibraryBackgroundUrl = 'Please select a background from the library.';
      }
    }
    // Step 6 (Preferences) has no mandatory fields currently
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = async () => {
    if (validateStep()) {
      if (step === 5 && formData.backgroundChoice === 'library' && !formData.selectedLibraryBackgroundUrl) {
        // If "select from library" is chosen but no image is selected yet, don't advance
        // This case should ideally be caught by validateStep, but good to double check
        return;
      }
      setStep(prev => prev + 1);
      if (step === 4) { // About to go to Background step
        await fetchLibraryBackgroundsOnboarding(); // Pre-fetch library images
      }
    }
  };

  const prevStep = () => {
    setStep(prev => prev - 1);
  };

  // NEW: Extracted function to save core onboarding details
  const _saveOnboardingDetails = async () => {
    const user = auth.currentUser;
    if (!user) {
      console.error("[_saveOnboardingDetails] No user found, cannot save onboarding data.");
      alert("Error: No user session found. Please try logging in again.");
      return false; // Indicate failure
    }

    console.log('[_saveOnboardingDetails] Attempting to save onboarding data for user:', user.uid);
    console.log('[_saveOnboardingDetails] Onboarding data:', formData);

    try {
      const userDocRef = doc(db, "users", user.uid); 
      const defaultPhotoURL = "https://firebasestorage.googleapis.com/v0/b/ugcai-f429e.firebasestorage.app/o/pp-placeholder.jpeg?alt=media";
      
      const userDataToSave = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        jobTitle: formData.jobTitle,
        company: formData.company,
        referralSource: formData.referralSource,
        interests: formData.interests,
        notifications: formData.notifications,
        dataCollection: formData.dataCollection,
        onboardingCompleted: false, // Will be set to true later by finalizeOnboarding
        email: user.email,
        uid: user.uid,
        photoURL: defaultPhotoURL,
        createdAt: serverTimestamp(),
      };

      await setDoc(userDocRef, userDataToSave, { merge: true });
      console.log('[_saveOnboardingDetails] Base user onboarding data saved successfully.');
      
      if (auth.currentUser) {
        try {
          await updateProfile(auth.currentUser, { photoURL: defaultPhotoURL, displayName: `${formData.firstName} ${formData.lastName}`.trim() });
          console.log('[_saveOnboardingDetails] Firebase Auth user profile updated successfully!');
        } catch (authError) {
          console.error("[_saveOnboardingDetails] Error updating Firebase Auth user profile:", authError);
        }
      }

      if (formData.productName && formData.productLogoFile && formData.productMediaFile) {
        const newProductId = doc(collection(db, 'users', user.uid, 'products')).id;
        let logoUrl = null;
        let mediaUrl = null;
        let mediaType = null;

        try {
          const logoExtension = formData.productLogoFile.name.split('.').pop();
          logoUrl = await uploadFileOnboarding(formData.productLogoFile, `users/${user.uid}/products/${newProductId}/logo`, `product_logo_${newProductId}.${logoExtension}`);
          
          const mediaExtension = formData.productMediaFile.name.split('.').pop();
          mediaUrl = await uploadFileOnboarding(formData.productMediaFile, `users/${user.uid}/products/${newProductId}/media`, `original_video.${mediaExtension}`);
          mediaType = formData.productMediaFile.type.startsWith('video/') ? 'video' : 'image';

          const productData = {
            id: newProductId,
            name: formData.productName,
            description: formData.productDescription,
            logoUrl: logoUrl,
            mediaUrl: mediaUrl,
            mediaType: mediaType,
            createdAt: serverTimestamp(),
            userId: user.uid,
            isVideoStandardized: false, 
            standardizedVideoUrl: null,
          };
          await setDoc(doc(db, 'users', user.uid, 'products', newProductId), productData);
          console.log('[_saveOnboardingDetails] Product data saved successfully.');
          
          if (mediaType === 'video' && mediaUrl) {
            const storagePath = `users/${user.uid}/products/${newProductId}/media/original_video.${mediaExtension}`;
            console.log(`[_saveOnboardingDetails] Video uploaded, calling manuallyStandardizeProductVideo for product ${newProductId}, path: ${storagePath}`);
            manuallyStandardizeProductVideo({
              userId: user.uid,
              productId: newProductId,
              originalVideoPathInStorage: storagePath,
              originalFileExtension: mediaExtension
            }).then(result => {
              console.log('[_saveOnboardingDetails] manuallyStandardizeProductVideo call INITIATED (background).', result);
            }).catch(error => {
              console.error('[_saveOnboardingDetails] Error INITIATING manuallyStandardizeProductVideo (background):', error);
            });
          }
        } catch (productError) {
          console.error("[_saveOnboardingDetails] Error saving product:", productError);
          alert("There was an error saving your product information. Please try adding it later from settings.");
          return false; // Indicate failure
        }
      }
      
      let finalBackgroundUrl = null;
      let finalBackgroundName = null;
      let finalBackgroundDescription = 'Onboarding background.';
      let finalIsFromLibrary = false;

      if (formData.backgroundChoice === 'upload' && formData.backgroundFile && formData.backgroundName) {
        try {
          finalBackgroundUrl = await uploadFileOnboarding(formData.backgroundFile, `users/${user.uid}/backgrounds/uploads`);
          finalBackgroundName = formData.backgroundName;
          finalIsFromLibrary = false;
        } catch (bgUploadError) {
          console.error("[_saveOnboardingDetails] Error uploading custom background:", bgUploadError);
          alert("Error uploading your custom background. Please try again from settings.");
          return false; // Indicate failure
        }
      } else if (formData.backgroundChoice === 'library' && formData.selectedLibraryBackgroundUrl) {
        finalBackgroundUrl = formData.selectedLibraryBackgroundUrl;
        const selectedLibImg = libraryImages.find(img => img.url === finalBackgroundUrl);
        finalBackgroundName = selectedLibImg?.name || 'Library Background';
        finalBackgroundDescription = selectedLibImg?.description || `Library background: ${finalBackgroundName}`;
        finalIsFromLibrary = true;
      }

      if (finalBackgroundUrl && finalBackgroundName) {
        try {
          const backgroundDocRef = doc(collection(db, 'users', user.uid, 'backgrounds'));
          const backgroundData = {
            name: finalBackgroundName,
            imageUrl: finalBackgroundUrl,
            description: finalBackgroundDescription,
            isFromLibrary: finalIsFromLibrary,
            createdAt: serverTimestamp(),
          };
          await setDoc(backgroundDocRef, backgroundData);
          console.log('[_saveOnboardingDetails] Background data saved successfully.');
        } catch (bgSaveError) {
          console.error("[_saveOnboardingDetails] Error saving background data:", bgSaveError);
          alert("Error saving your background choice. Please try again from settings.");
          return false; // Indicate failure
        }
      }
      console.log('[_saveOnboardingDetails] All details saved successfully.');
      return true; // Indicate success
    } catch (error) {
      console.error("[_saveOnboardingDetails] Error saving onboarding details:", error);
      alert("An error occurred while saving your onboarding information. Please try again.");
      return false; // Indicate failure
    }
  };

  const handleComplete = async () => {
    if (!validateStep()) {
      return; 
    }
    setIsLoading(true); // Start loading before saving details
    const detailsSaved = await _saveOnboardingDetails();
    setIsLoading(false); // Stop loading after attempt

    if (detailsSaved) {
      setShowOffer(true);
    } else {
      // Handle the case where saving details failed (error already alerted in _saveOnboardingDetails)
      console.log("Onboarding details saving failed. Offer not shown.");
    }
  };
  
  const finalizeOnboarding = async () => {
    const user = auth.currentUser;
    if (!user) {
      console.error("No user found, cannot finalize onboarding.");
      // alert("Error: No user session found. Please try logging in again."); // Already handled by _saveOnboardingDetails generally
      return; 
    }
    // setIsLoading(true); // isLoading is now handled by handleComplete and skipOffer

    console.log('Finalizing onboarding for user:', user.uid);
    // The core data (profile, product, background) is now assumed to be saved by _saveOnboardingDetails.
    // This function now only needs to mark onboarding as completed and navigate.
    try {
      const userDocRef = doc(db, "users", user.uid);
      
      // Get current user data to check existing credits
      const userDoc = await getDoc(userDocRef);
      const currentCredits = userDoc.exists() ? (userDoc.data().general_credits || 0) : 0;
      
      await updateDoc(userDocRef, {
        onboardingCompleted: true,
        general_credits: currentCredits + 200, // Add 50 credits for completing onboarding
        // Other fields like lastOnboardingFinalizedAt: serverTimestamp() could be added here if needed.
      });
      console.log('User onboarding status marked as completed. Added 50 credits.');
      
      setOnboardingComplete(); 
      navigate('/'); 

    } catch (error) {
      console.error("Error marking onboarding as completed:", error);
      alert("An error occurred while finalizing your setup. Please try again.");
    } 
    // finally { // setIsLoading(false); // isLoading is now handled by handleComplete and skipOffer }
  };
  
  const skipOffer = async () => {
    setIsSkipping(true); // Use isSkipping to disable button and show loader
    // setIsLoading(true); // setIsLoading is managed by handleComplete or if _saveOnboardingDetails was called directly here before offer
    
    // Since _saveOnboardingDetails is now called *before* showing the offer (in handleComplete),
    // we can assume the core details are saved if the user reaches this point.
    // We just need to finalize by marking onboarding complete and navigating.
    console.log("User is skipping the offer. Proceeding to finalize onboarding.");
    await finalizeOnboarding(); // This function now only marks as complete and navigates

    // No direct need to setIsLoading(false) here as finalizeOnboarding doesn't manage it,
    // and the loading state for the skip button (isSkipping) is handled locally.
    setIsSkipping(false);
  };

  // --- Helper to Fetch Library Backgrounds for Onboarding ---
  const fetchLibraryBackgroundsOnboarding = async () => {
      const user = auth.currentUser;
      if (!user) return;
      setIsLoadingLibrary(true);
      try {
          const libraryRef = ref(storage, 'lungo-backgrounds');
          const res = await listAll(libraryRef);
          const urls = await Promise.all(res.items.map(async (itemRef) => {
              const url = await getDownloadURL(itemRef);
              const name = itemRef.name;
              const description = libraryImageDescriptions[name] || `Library background image: ${name}`;
              return { url, name, description };
          }));
          setLibraryImages(urls);
          console.log("Fetched Library Backgrounds for Onboarding:", urls);
      } catch (error) {
          console.error("Error fetching library backgrounds for onboarding:", error);
          setLibraryImages([]);
      } finally {
          setIsLoadingLibrary(false);
      }
  };

  // --- NEW: Helper function to upload files during onboarding ---
  const uploadFileOnboarding = async (file, path, desiredFileName = null) => {
    if (!file) return null;
    
    let finalFileName;

    if (desiredFileName) {
      finalFileName = desiredFileName;
    } else {
      const originalFileExtension = file.name.split('.').pop().toLowerCase();
      let extension;
      if (file.type.startsWith('video/')) {
        extension = ['mp4', 'mov', 'avi', 'wmv', 'flv', 'webm'].includes(originalFileExtension) ? originalFileExtension : 'mp4';
        finalFileName = `onboarding_video_${Date.now()}.${extension}`;
      } else if (file.type.startsWith('image/')) {
        extension = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(originalFileExtension) ? originalFileExtension : 'png';
        finalFileName = `onboarding_image_${Date.now()}.${extension}`;
      } else {
        extension = originalFileExtension || 'bin';
        finalFileName = `onboarding_file_${Date.now()}.${extension}`;
      }
    }
    
    const fileRef = ref(storage, `${path}/${finalFileName}`);

    console.log(`[uploadFileOnboarding] Attempting to upload to: ${fileRef.fullPath}`);
    try {
      console.log(`[uploadFileOnboarding] Calling uploadBytes for: ${finalFileName}...`);
      const snapshot = await uploadBytes(fileRef, file);
      console.log(`[uploadFileOnboarding] uploadBytes SUCCESS for: ${finalFileName}`, snapshot);
      
      console.log(`[uploadFileOnboarding] Calling getDownloadURL for: ${finalFileName}...`);
      const downloadURL = await getDownloadURL(fileRef);
      console.log(`[uploadFileOnboarding] getDownloadURL SUCCESS for: ${finalFileName}`, downloadURL);
      return downloadURL;
    } catch (error) {
      console.error(`[uploadFileOnboarding] Error during upload/getURL for ${finalFileName} at ${path}:`, error.code, error.message, error);
      // Do not alert here, let the calling function (finalizeOnboarding) handle user notification
      throw error; // Re-throw the error to be caught by finalizeOnboarding
    }
  };

  useEffect(() => {
    // Fetch library images when the background step (step 5) is about to be shown or is current
    // This ensures images are ready if user navigates back and forth
    if (step === 5 && libraryImages.length === 0) {
      fetchLibraryBackgroundsOnboarding();
    }
  }, [step]);

  // Render different form based on current step
  const renderStep = () => {
    switch(step) {
      case 1:
        return (
          <>
            <h2 className="text-lg font-medium text-center mb-6">Let's get to know you</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="firstName" className="block text-sm text-gray-700 dark:text-neutral-300">First name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border ${errors.firstName ? 'border-red-300 bg-red-50' : 'border-gray-300 dark:border-neutral-600'} rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:focus:ring-emerald-400 bg-white dark:bg-neutral-800 text-black dark:text-white placeholder-gray-400 dark:placeholder-neutral-500`}
                  placeholder="Your first name"
                />
                {errors.firstName && <p className="text-xs text-red-500 mt-1">{errors.firstName}</p>}
              </div>
              
              <div className="space-y-2">
                <label htmlFor="lastName" className="block text-sm text-gray-700 dark:text-neutral-300">Last name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border ${errors.lastName ? 'border-red-300 bg-red-50' : 'border-gray-300 dark:border-neutral-600'} rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:focus:ring-emerald-400 bg-white dark:bg-neutral-800 text-black dark:text-white placeholder-gray-400 dark:placeholder-neutral-500`}
                  placeholder="Your last name"
                />
                {errors.lastName && <p className="text-xs text-red-500 mt-1">{errors.lastName}</p>}
              </div>
            </div>
          </>
        );
      
      case 2:
        return (
          <>
            <h2 className="text-lg font-medium text-center mb-6">What do you do?</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="jobTitle" className="block text-sm text-gray-700 dark:text-neutral-300">Job title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  id="jobTitle"
                  name="jobTitle"
                  value={formData.jobTitle}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border ${errors.jobTitle ? 'border-red-300 bg-red-50' : 'border-gray-300 dark:border-neutral-600'} rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:focus:ring-emerald-400 bg-white dark:bg-neutral-800 text-black dark:text-white placeholder-gray-400 dark:placeholder-neutral-500`}
                  placeholder="Your title or role"
                />
                {errors.jobTitle && <p className="text-xs text-red-500 mt-1">{errors.jobTitle}</p>}
              </div>
              
              <div className="space-y-2">
                <label htmlFor="company" className="block text-sm text-gray-700 dark:text-neutral-300">Company/Organization <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  id="company"
                  name="company"
                  value={formData.company}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border ${errors.company ? 'border-red-300 bg-red-50' : 'border-gray-300 dark:border-neutral-600'} rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:focus:ring-emerald-400 bg-white dark:bg-neutral-800 text-black dark:text-white placeholder-gray-400 dark:placeholder-neutral-500`}
                  placeholder="Where you work"
                />
                {errors.company && <p className="text-xs text-red-500 mt-1">{errors.company}</p>}
              </div>
            </div>
          </>
        );
        
      case 3:
        return (
          <>
            <h2 className="text-lg font-medium text-center mb-6">How did you hear about us?</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm text-gray-700 dark:text-neutral-300">Select an option <span className="text-red-500">*</span></label>
                <div className="space-y-3 max-h-64 overflow-y-auto px-2">
                  {[
                    {value: "search_engine", label: "Search Engine", description: "(Google, Bing, Yandex, etc.)"},
                    {value: "social_media", label: "Social Media", description: "(Instagram, Twitter, LinkedIn, etc.)"},
                    {value: "friend_colleague", label: "Friend or Colleague", description: "(Word of mouth)"},
                    {value: "blog_article", label: "Blog or Article", description: "(Online publication)"},
                    {value: "podcast", label: "Podcast", description: "(Audio content)"},
                    {value: "advertisement", label: "Advertisement", description: "(Online or physical ad)"},
                    {value: "other", label: "Other", description: "(Please specify)"}
                  ].map((source) => (
                    <div 
                      key={source.value}
                      onClick={() => {
                        setFormData({...formData, referralSource: source.value});
                        if (errors.referralSource) setErrors(prev => ({...prev, referralSource: ''}));
                      }}
                      className={`px-4 py-5 border ${formData.referralSource === source.value ? 'border-emerald-500 dark:border-emerald-400 ring-1 ring-emerald-500 dark:ring-emerald-400' : 'border-gray-300 dark:border-neutral-600'} rounded-lg cursor-pointer hover:border-gray-500 dark:hover:border-neutral-500 transition-all bg-white dark:bg-neutral-800`}
                    >
                      <div className="flex items-center">
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${formData.referralSource === source.value ? 'bg-emerald-500 dark:bg-emerald-400 border-emerald-500 dark:border-emerald-400' : 'border-gray-400 dark:border-neutral-500'}`}>
                          {formData.referralSource === source.value && <div className="w-2 h-2 bg-white dark:bg-white rounded-full"></div>}
                        </div>
                        <span className="ml-3 text-sm text-black dark:text-white">
                          <span className="font-medium">{source.label}</span> <span className="text-gray-500 dark:text-neutral-400">{source.description}</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {errors.referralSource && <p className="text-xs text-red-500 mt-1">{errors.referralSource}</p>}
              </div>
            </div>
          </>
        );
        
      case 4: // Add Product Step
        return (
          <>
            <h2 className="text-lg font-medium text-center mb-1">Add Your First Product</h2>
            <p className="text-sm text-gray-500 text-center mb-6">This helps us tailor content for you.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-700 dark:text-neutral-300">Product Name <span className="text-red-500">*</span></label>
                <input 
                  type="text" name="productName" value={formData.productName} onChange={handleInputChange}
                  className={`mt-1 w-full px-3 py-2 border ${errors.productName ? 'border-red-300 bg-red-50' : 'border-gray-300 dark:border-neutral-600'} rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:focus:ring-emerald-400 bg-white dark:bg-neutral-800 text-black dark:text-white placeholder-gray-400 dark:placeholder-neutral-500`}
                  placeholder="e.g., Super Widget"
                />
                {errors.productName && <p className="text-xs text-red-500 mt-1">{errors.productName}</p>}
              </div>
              <div>
                <label className="block text-sm text-gray-700 dark:text-neutral-300">Description <span className="text-red-500">*</span> <span className="text-xs text-gray-400 dark:text-neutral-500">(Min 50 chars)</span></label>
                <textarea 
                  name="productDescription" value={formData.productDescription} onChange={handleInputChange}
                  rows={3}
                  className={`mt-1 w-full px-3 py-2 border ${errors.productDescription ? 'border-red-300 bg-red-50' : 'border-gray-300 dark:border-neutral-600'} rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:focus:ring-emerald-400 bg-white dark:bg-neutral-800 text-black dark:text-white placeholder-gray-400 dark:placeholder-neutral-500`}
                  placeholder="Describe the product, its benefits, target audience..."
                />
                {errors.productDescription && <p className="text-xs text-red-500 mt-1">{errors.productDescription}</p>}
                 <p className={`text-xs mt-1 ${formData.productDescription.length >= 50 ? 'text-black dark:text-white' : 'text-gray-500 dark:text-neutral-400'}`}>
                    {formData.productDescription.length} / 50 characters
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-700 dark:text-neutral-300">Product Logo <span className="text-red-500">*</span></label>
                <div className="mt-1">
                  <input 
                    type="file" 
                    name="productLogoFile" 
                    accept="image/*" 
                    onChange={handleInputChange} 
                    ref={productLogoInputRef}
                    className="hidden"
                    id="productLogoFile"
                  />
                  <label 
                    htmlFor="productLogoFile"
                    className="w-full inline-flex items-center justify-center px-4 py-2 border border-black dark:border-white rounded-lg bg-white dark:bg-neutral-900 text-black dark:text-white hover:bg-gray-50 dark:hover:bg-neutral-800 cursor-pointer transition-colors"
                  >
                    <Package size={16} className="mr-2" />
                    {formData.productLogoFile ? `Selected: ${formData.productLogoFile.name}` : 'Choose Logo File'}
                  </label>
                </div>
                {errors.productLogoFile && <p className="text-xs text-red-500 mt-1">{errors.productLogoFile}</p>}
              </div>
              <div>
                <label className="block text-sm text-gray-700 dark:text-neutral-300">Product Video <span className="text-red-500">*</span></label>
                <div className="mt-1">
                  <input 
                    type="file" 
                    name="productMediaFile" 
                    accept="video/*" 
                    onChange={handleInputChange} 
                    ref={productMediaInputRef}
                    className="hidden"
                    id="productMediaFile"
                  />
                  <label 
                    htmlFor="productMediaFile"
                    className="w-full inline-flex items-center justify-center px-4 py-2 border border-black dark:border-white rounded-lg bg-white dark:bg-neutral-900 text-black dark:text-white hover:bg-gray-50 dark:hover:bg-neutral-800 cursor-pointer transition-colors"
                  >
                    <FilmSlate size={16} className="mr-2" />
                    {formData.productMediaFile ? `Selected: ${formData.productMediaFile.name}` : 'Choose Video File'}
                  </label>
                </div>
                {errors.productMediaFile && <p className="text-xs text-red-500 mt-1">{errors.productMediaFile}</p>}
              </div>
            </div>
          </>
        );

      case 5: // Add Background Step
        return (
          <>
            <h2 className="text-lg font-medium text-center mb-1">Choose a Background</h2>
            <p className="text-sm text-gray-500 text-center mb-6">This will be used for your video generations.</p>
            {errors.backgroundChoice && <p className="text-xs text-red-500 mb-2 text-center">{errors.backgroundChoice}</p>}
            
            <div className="space-y-5">
              {/* Option 1: Upload Custom */}
              <div>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, backgroundChoice: 'upload', selectedLibraryBackgroundUrl: '' }))}
                  className={`w-full p-4 rounded-lg text-left transition-all ${formData.backgroundChoice === 'upload' ? 'bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-500 dark:ring-emerald-400' : 'hover:bg-gray-50 dark:hover:bg-neutral-800'} bg-white dark:bg-neutral-800`}
                >
                  <div className="flex items-center">
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${formData.backgroundChoice === 'upload' ? 'bg-emerald-500 dark:bg-emerald-400 border-emerald-500 dark:border-emerald-400' : 'border-gray-400 dark:border-neutral-500'}`}>
                      {formData.backgroundChoice === 'upload' && <div className="w-2 h-2 bg-white dark:bg-white rounded-full"></div>}
                    </div>
                    <span className="ml-3 text-sm font-medium text-black dark:text-white">Upload Custom Background</span>
                  </div>
                </button>
                {formData.backgroundChoice === 'upload' && (
                  <div className="mt-3 pl-8 space-y-3">
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-neutral-400">Background Name <span className="text-red-500">*</span></label>
                      <input 
                        type="text" name="backgroundName" value={formData.backgroundName} onChange={handleInputChange}
                        className={`mt-1 w-full px-3 py-1.5 border text-sm ${errors.backgroundName ? 'border-red-300 bg-red-50' : 'border-gray-300 dark:border-neutral-600'} rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:focus:ring-emerald-400 bg-white dark:bg-neutral-700 text-black dark:text-white placeholder-gray-400 dark:placeholder-neutral-500`}
                        placeholder="e.g., Office Desk"
                      />
                      {errors.backgroundName && <p className="text-xs text-red-500 mt-0.5">{errors.backgroundName}</p>}
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-neutral-400">Image File <span className="text-red-500">*</span></label>
                      <div className="mt-1">
                        <input 
                          type="file" 
                          name="backgroundFile" 
                          accept="image/*" 
                          onChange={handleInputChange} 
                          ref={backgroundFileInputRef}
                          className="hidden"
                          id="backgroundFile"
                        />
                        <label 
                          htmlFor="backgroundFile"
                          className="w-full inline-flex items-center justify-center px-3 py-1.5 border border-black dark:border-white rounded-lg bg-white dark:bg-neutral-900 text-black dark:text-white hover:bg-gray-50 dark:hover:bg-neutral-800 cursor-pointer transition-colors text-sm"
                        >
                          <ImageIcon size={14} className="mr-2" />
                          {formData.backgroundFile ? `Selected: ${formData.backgroundFile.name}` : 'Choose Image File'}
                        </label>
                      </div>
                      {errors.backgroundFile && <p className="text-xs text-red-500 mt-0.5">{errors.backgroundFile}</p>}
                    </div>
                  </div>
                )}
              </div>

              {/* Option 2: Select from Library */}
              <div>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, backgroundChoice: 'library', backgroundName: '', backgroundFile: null }))}
                  className={`w-full p-4 rounded-lg text-left transition-all ${formData.backgroundChoice === 'library' ? 'bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-500 dark:ring-emerald-400' : 'hover:bg-gray-50 dark:hover:bg-neutral-800'} bg-white dark:bg-neutral-800`}
                >
                  <div className="flex items-center">
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${formData.backgroundChoice === 'library' ? 'bg-emerald-500 dark:bg-emerald-400 border-emerald-500 dark:border-emerald-400' : 'border-gray-400 dark:border-neutral-500'}`}>
                      {formData.backgroundChoice === 'library' && <div className="w-2 h-2 bg-white dark:bg-white rounded-full"></div>}
                    </div>
                    <span className="ml-3 text-sm font-medium text-black dark:text-white">Select from Library</span>
                  </div>
                </button>
                {formData.backgroundChoice === 'library' && (
                  <div className="mt-3 pl-2">
                    {isLoadingLibrary ? (
                      <div className="flex justify-center items-center py-6">
                        <CircleNotch size={20} className="animate-spin text-gray-400 mr-2" />
                        <span className="text-xs text-gray-500">Loading library...</span>
                      </div>
                    ) : libraryImages.length === 0 ? (
                      <p className="text-xs text-gray-500 py-4 text-center">Library is currently empty.</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-3 max-h-64 overflow-y-auto px-2 py-1">
                        {libraryImages.map(img => (
                          <div 
                            key={img.url}
                            onClick={() => {
                              setFormData(prev => ({ ...prev, selectedLibraryBackgroundUrl: img.url }));
                              if (errors.selectedLibraryBackgroundUrl) setErrors(prevErrors => ({...prevErrors, selectedLibraryBackgroundUrl: ''}));
                            }}
                            className={`relative aspect-[4/5] rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-all
                                        ${formData.selectedLibraryBackgroundUrl === img.url ? 'ring-2 ring-emerald-500 dark:ring-emerald-400 ring-offset-1 dark:ring-offset-neutral-800' : ''}`}
                          >
                            <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                            {formData.selectedLibraryBackgroundUrl === img.url && (
                              <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                                <CheckCircle size={24} weight="fill" className="text-emerald-500" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {errors.selectedLibraryBackgroundUrl && <p className="text-xs text-red-500 mt-1 pl-6">{errors.selectedLibraryBackgroundUrl}</p>}
                  </div>
                )}
              </div>
            </div>
          </>
        );
        
      case 6: // Preferences Step (was step 4)
        return (
          <>
            <h2 className="text-lg font-medium text-center mb-6">Almost done!</h2>
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-neutral-300 mb-4">Please review the following preferences:</p>
              
              <div className="flex items-start p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-700 transition-all bg-white dark:bg-neutral-800">
                <input 
                  type="checkbox" id="notifications" name="notifications"
                  checked={formData.notifications} onChange={handleInputChange}
                  className="mt-1 h-4 w-4 text-emerald-500 border-gray-300 dark:border-neutral-500 rounded focus:ring-emerald-500 dark:focus:ring-emerald-400"
                />
                <label htmlFor="notifications" className="ml-3 text-sm text-gray-700 dark:text-neutral-200">
                  I'd like to receive notifications about new features, updates, and events
                </label>
              </div>
              
              <div className="flex items-start p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-700 transition-all bg-white dark:bg-neutral-800">
                <input 
                  type="checkbox" id="dataCollection" name="dataCollection"
                  checked={formData.dataCollection} onChange={handleInputChange}
                  className="mt-1 h-4 w-4 text-emerald-500 border-gray-300 dark:border-neutral-500 rounded focus:ring-emerald-500 dark:focus:ring-emerald-400"
                />
                <label htmlFor="dataCollection" className="ml-3 text-sm text-gray-700 dark:text-neutral-200">
                  I allow Lungo AI to collect usage data to improve my experience
                </label>
              </div>
              
              <p className="text-xs text-gray-500 dark:text-neutral-400 mt-2">
                You can change these preferences at any time in your account settings.
              </p>
            </div>
          </>
        );
        
      default:
        return null;
    }
  };

  const renderOffer = () => (
    <div className="w-full max-w-4xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-left mb-8 relative">
        <button 
          onClick={skipOffer}
          disabled={isSkipping || isLoading}
          className={`absolute top-0 right-0 text-sm transition-colors
                      ${(isSkipping || isLoading) 
                        ? 'text-gray-400 dark:text-neutral-500 cursor-not-allowed' 
                        : 'text-black dark:text-white hover:text-gray-600 dark:hover:text-neutral-300'
                      }`}
        >
          {(isSkipping || isLoading) ? 'Processing...' : 'Skip for now'}
        </button>
        <h2 className="text-2xl font-medium text-gray-900 dark:text-white">You're all set! 🎉</h2>
        <p className="mt-2 text-gray-600 dark:text-neutral-300">Unlock the full potential of LungoAI with a premium plan</p>
      </div>
      
      <PricingSection 
        id="pricing" 
        subscriptionData={null} 
        user={auth.currentUser} 
        onSubscriptionSuccess={finalizeOnboarding}
      />
    </div>
  );

  const totalSteps = 6; // Updated total steps

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans relative overflow-hidden">
      {/* Animated background grid */}
      <div className="absolute inset-0 z-0">
        <div className="grid-animation"></div>
      </div>
      
      {!showOffer ? (
        <div className="max-w-md w-full relative z-10">
          {/* Logo and Header Section */}
          <div className="text-center mb-10">
            <img src="/logonaked-black.png" alt="Lungo AI Logo" className="h-8 mx-auto mb-5" />
            <h1 className="text-3xl font-normal tracking-wide text-black dark:text-white mb-2">Welcome to lungo</h1>
            <p className="text-base text-gray-500 dark:text-neutral-400">Let's get your account set up</p>
          </div>

          {/* Progress indicator */}
          <div className="flex justify-center space-x-1 mb-6">
            {[...Array(totalSteps).keys()].map((i) => ( // Use totalSteps
              <div 
                key={i+1} 
                className={`h-1 rounded-full ${
                  (i + 1) === step ? 'w-8 bg-emerald-500' : 
                  (i + 1) < step ? 'w-6 bg-emerald-300' : 'w-6 bg-gray-100'
                } transition-all duration-300`}
              ></div>
            ))}
          </div>

          {/* Main Content */}
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-xl">
            {renderStep()}
            
            {/* Navigation buttons */}
            <div className="mt-8 flex justify-between items-center">
              {step > 1 ? (
                <button 
                  onClick={prevStep}
                  disabled={isLoading}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-black transition-colors disabled:opacity-50"
                >
                  Back
                </button>
              ) : (
                <div></div> 
              )}
              
              {step < totalSteps ? ( // Use totalSteps
                <button
                  onClick={nextStep}
                  disabled={isLoading}
                  className="px-5 py-2 border border-gray-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-700 text-sm text-black dark:text-white shadow-sm hover:shadow-md transition-all disabled:opacity-50"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleComplete}
                  disabled={isLoading}
                  className="px-5 py-2 bg-emerald-500 dark:bg-emerald-500 text-white dark:text-white rounded-lg hover:bg-emerald-600 dark:hover:bg-emerald-600 text-sm shadow-sm hover:shadow-md transition-all disabled:opacity-50 flex items-center justify-center min-w-[120px]"
                >
                  {isLoading ? <CircleNotch className="animate-spin h-4 w-4" /> : 'Complete Setup'}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full relative z-10">
          {renderOffer()}
        </div>
      )}

      {/* CSS for the animated background */}
      <style>{`
        .grid-animation {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-image: 
            linear-gradient(rgba(200, 200, 200, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(200, 200, 200, 0.02) 1px, transparent 1px);
          background-size: 40px 40px;
          background-position: center center;
          animation: grid-move 20s linear infinite;
        }
        
        .grid-animation::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-image: 
            radial-gradient(circle, rgba(240, 240, 240, 0.1) 1px, transparent 1px);
          background-size: 60px 60px;
          background-position: center center;
          animation: dots-pulse 15s ease-in-out infinite alternate;
        }

        @keyframes grid-move {
          0% {
            background-position: 0 0;
          }
          100% {
            background-position: 40px 40px;
          }
        }
        
        @keyframes dots-pulse {
          0% {
            opacity: 0.2;
          }
          50% {
            opacity: 0.3;
          }
          100% {
            opacity: 0.2;
          }
        }
      `}</style>
    </div>
  );
}

export default Onboarding; 