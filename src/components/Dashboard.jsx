import React, { useState, useEffect, useRef, useMemo } from 'react';
import { auth, db } from '../firebase'; // Import db
import { useOutletContext } from 'react-router-dom';
import { getFunctions, httpsCallable } from "firebase/functions"; // Import functions SDK
// Keep only necessary icons + add Sun/Moon
import { ArrowRight, Sparkle, FileText, Lightning, Question, ChartLine, BookmarkSimple, Plugs, Gear, ImageSquare, FilmSlate, Lightbulb, BookOpen, Fire, ChatText, Translate, Calendar, Info, Sun, Moon, DownloadSimple, Compass, User, ArrowSquareOut, CircleNotch, CalendarBlank, X as CloseIcon, ArrowLeft, Trash, UserPlus, PlusSquare, Slideshow, Play, Pause, Pencil, Check } from '@phosphor-icons/react'; 
// Keep only necessary Firestore functions
import { collection, query, orderBy, getDocs, Timestamp, doc, getDoc, limit, startAfter, deleteDoc, where, updateDoc } from "@firebase/firestore"; // Added doc, getDoc, limit, startAfter, deleteDoc, where, updateDoc
import JSZip from 'jszip'; // <-- Import JSZip
import { motion, AnimatePresence } from 'framer-motion';

// --- NEW: Plan Credit Limits ---
const planCreditLimits = {
  // Basic Plan
  "price_1RMqEZDf8kAOBAT3ltD6n2lX": { images: 15, videos: 10, slideshows: 30 }, // Monthly
  "price_1RMqGbDf8kAOBAT3vgwkWLr6": { images: 15, videos: 10, slideshows: 30 }, // Yearly
  // Pro Plan
  "price_1RRJ8tDf8kAOBAT3qBwC6qpM": { images: 50, videos: 40, slideshows: 100 }, // Monthly
  "price_1RRJ9SDf8kAOBAT3bA8Xbriq": { images: 50, videos: 40, slideshows: 100 }, // Yearly
  // Business Plan
  "price_1RMqHgDf8kAOBAT3m6kthIND": { images: 120, videos: 90, slideshows: 250 }, // Monthly
  "price_1RMqI1Df8kAOBAT3Xoy3M7Ho": { images: 120, videos: 90, slideshows: 250 } // Yearly

};
// --- End Plan Credit Limits ---

// --- NEW: Default values for users with no active plan ---
const defaultCreditValues = { images: 0, videos: 0, slideshows: 0 };
// --- End Default Values ---

// --- Helper for Friendly Generation Type ---
const getFriendlyGenerationType = (commandCode) => {
  switch (commandCode) {
    case 101: return 'TikTok Video';
    case 201: return 'Background Image';
    case 202: return 'Custom Image';
    case 301: return 'Slideshow';
    case 401: return 'Edited Image';
    // Add more cases if other commands generate visual output shown here
    default: return 'Generated Content'; // Fallback
  }
};

// --- NEW Helper to Determine if a Generation is Actively Processing for UI ---
const isGenerationActive = (item) => {
  if (!item || !item.status) return false;

  // Client-side statuses indicating active generation before polling or for direct calls
  const activeClientManagedStatuses = [
    'generating_direct',        // For direct image generation (e.g., commands 202, 203)
    'generating_slideshow',     // For slideshow generation (e.g., command 301)
    'generating',               // Generic status for image/slideshow from commandHandler
    'image_generation_initiated', // For video, initial client status before first poll
  ];

  // Statuses from Firestore (polled) for the video pipeline that mean "still working"
  const activePolledVideoStatuses = [
    'image_generation_pending',   // Video's image task enqueued
    'image_generating',           // Video's image task running
    'image_generated',            // Image part of video is done, video pipeline continues
    'processing',                 // Runway video generation for the video pipeline
    'pending_concatenation',    // Video ready for concatenation step
    'processing_concatenation', // Concatenation in progress
  ];

  if (activeClientManagedStatuses.includes(item.status)) {
    return true;
  }

  // For videos, several polled statuses mean it's still actively working on the backend
  if (item.type === 'video' && activePolledVideoStatuses.includes(item.status)) {
    return true;
  }
  
  // Add other types if they have specific polled active statuses, e.g.:
  // if (item.type === 'slideshow' && item.status === 'slideshow_processing_step_1') {
  //   return true;
  // }

  return false;
};
// --- END isGenerationActive Helper ---

// --- NEW Helper to Extract Keywords ---
const getKeywords = (gen) => {
  const params = gen.originalParameters || gen.parameters || {};
  let keywords = [];

  // Prioritize subject/topic descriptions
  const subject = params.subject_description || params.image_subject || params.topic;
  if (subject && typeof subject === 'string') {
    // Take first few words or comma-separated terms
    keywords = subject.split(/[\s,]+/).slice(0, 4); // Split by comma or space, take max 4
  }

  // Add style if available and keywords are few
  if (keywords.length < 3 && params.image_style && typeof params.image_style === 'string') {
    keywords.push(...params.image_style.split(/[\s,]+/).slice(0, 2));
  }
  
  // Add setting if still few keywords
  if (keywords.length < 3 && params.setting_description && typeof params.setting_description === 'string') {
      keywords.push(...params.setting_description.split(/[\s,]+/).slice(0, 2));
  }

  // Format and return, or fallback
  if (keywords.length > 0) {
    // Capitalize first letter of each keyword
    const formattedKeywords = keywords
                                .filter(kw => kw.length > 1) // Remove very short words/artifacts
                                .map(kw => kw.charAt(0).toUpperCase() + kw.slice(1).toLowerCase());
    return formattedKeywords.join(', ');
  } else {
    // Fallback to command name if no keywords found
    return getFriendlyGenerationType(gen.commandCode);
  }
};

// --- Animation Hook (Revised) ---
function usePercentageAnimation(targetValue, duration = 800) {
  const [animatedValue, setAnimatedValue] = useState(0);
  // Ref to track if this is the initial mount vs a target value update
  const isInitialMount = useRef(true);
  // Ref to store the animation frame ID
  const animationFrameIdRef = useRef(null);
  // Ref to store the start value for the current animation cycle
  const startValueRef = useRef(0);
  // Ref to store the start time for the current animation cycle
  const startTimeRef = useRef(0);

  useEffect(() => {
    // Cancel any ongoing animation when targetValue or duration changes
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
    }

    // Determine the starting value for this animation
    // If it's the initial mount, start from 0. Otherwise, start from the current animated value.
    const effectiveStartValue = isInitialMount.current ? 0 : animatedValue;
    startValueRef.current = effectiveStartValue; // Store for use in animation frame
    startTimeRef.current = performance.now(); // Store start time

    // Mark initial mount as false after the first run
    isInitialMount.current = false;

    const updateValue = (currentTime) => {
      const elapsedTime = currentTime - startTimeRef.current;
      const progress = Math.min(elapsedTime / duration, 1);
      const easeOutQuad = 1 - Math.pow(1 - progress, 2);
      const nextValue = startValueRef.current + (targetValue - startValueRef.current) * easeOutQuad;

      setAnimatedValue(nextValue);

      if (progress < 1) {
        animationFrameIdRef.current = requestAnimationFrame(updateValue);
      } else {
        setAnimatedValue(targetValue); // Ensure exact end value
        animationFrameIdRef.current = null;
      }
    };

    // Start the animation only if the target isn't already the start value
    if (targetValue !== effectiveStartValue) {
      animationFrameIdRef.current = requestAnimationFrame(updateValue);
    } else {
      // If target is already the start value, just set it directly
      // This handles the case where the initial targetValue is 0
      setAnimatedValue(targetValue);
    }

    // Cleanup function
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
    // Dependencies: Re-run effect only if targetValue or duration changes
  }, [targetValue, duration, animatedValue]); // Added animatedValue

  return animatedValue;
}

// --- Updated Standalone Download Helper ---
const handleGenerationDownload = async (generation) => {
  if (!generation) return;

  if (generation.type === 'slideshow' && generation.processedImageUrls && generation.processedImageUrls.length > 0) {
    // --- Slideshow ZIP Download Logic ---
    console.log(`Initiating ZIP download for slideshow: ${generation.id} using processedImageUrls`);
    const zip = new JSZip();
    try {
      // Fetch all images as blobs
      const imageFetchPromises = generation.processedImageUrls.map(async (url, index) => {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status} for image ${index + 1}`);
            const blob = await response.blob();
            // Try to determine a better filename/extension from blob type
            let extension = 'png'; 
            if (blob.type && blob.type.startsWith('image/')) {
               extension = blob.type.split('/')[1] || 'png';
            }
            return { blob, filename: `slide_${index + 1}.${extension}` };
        } catch(fetchError) {
            console.error(`Error fetching image ${index+1} (${url}) for zip:`, fetchError);
            throw fetchError; // Re-throw to fail Promise.all if one image fails
        }
      });

      const imageDatas = await Promise.all(imageFetchPromises);

      // Add images to zip
      imageDatas.forEach(imageData => {
          zip.file(imageData.filename, imageData.blob);
          console.log(`Added ${imageData.filename} to zip.`);
      });

      // Generate zip file blob
      console.log('Generating zip file...');
      const zipBlob = await zip.generateAsync({ type: "blob" });
      console.log(`Zip file generated (Size: ${zipBlob.size} bytes).`);

      // Trigger download
      const zipUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = zipUrl;
      link.download = `slideshow-${generation.id}.zip`; 
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(zipUrl), 100); 
      console.log(`Zip download triggered for ${link.download}`);

    } catch (error) {
      console.error("Error creating or downloading ZIP file for slideshow:", error);
      window.alert("Error creating ZIP for slideshow. Please try again.");
    }

  } else if (generation.type === 'image' || generation.type === 'video') {
    // --- Single Image/Video Download Logic (Existing) ---
    const urlToDownload = generation.type === 'video' ? generation.videoUrl : generation.imageUrl;
    if (!urlToDownload) {
      console.error("Download failed: No URL found.");
      window.alert("Download failed: No URL found.");
      return; 
    }
    console.log(`Attempting to download single file: ${urlToDownload}`);
    try {
      const response = await fetch(urlToDownload);
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl; 
      let filename = `generation-${generation.id}.${blob.type.split('/')[1] || (generation.type === 'video' ? 'mp4' : 'png')}`;
      try {
         const urlParts = new URL(urlToDownload).pathname.split('/');
         const potentialFilename = decodeURIComponent(urlParts[urlParts.length - 1].split('?')[0]);
         if (potentialFilename.includes('.')) filename = potentialFilename;
      } catch (urlError) { console.warn("Could not parse filename, using default.", urlError); }
      link.download = filename; 
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100); 
    } catch (error) { 
        console.error("Error during single file download process:", error); 
        window.alert("Error during download. Please try again.");
    }
  } else {
     console.warn(`Download not supported for generation type: ${generation.type}`);
     window.alert(`Download not supported for this content type.`);
  }
};
// --- End Updated Standalone Download Helper ---

// --- NEW: Comprehensive Edit Popup Component ---
function GenerationEditPopup({ generation, onClose, isDarkMode, onScheduleSubmit, onShowSuccessNotification, creators, backgrounds, onAssetSaved, onGenerationUpdated, onGenerationDeleted }) {
  console.log('[GenerationEditPopup] Opened with generation:', JSON.parse(JSON.stringify(generation)));

  const [isEditing, setIsEditing] = useState(false);
  const [editedHookText, setEditedHookText] = useState(generation.hookText || '');
  const [editedSlideTexts, setEditedSlideTexts] = useState([...(generation.slideTexts || [])]);
  const [selectedBackgroundId, setSelectedBackgroundId] = useState(generation.selectedBackgroundId || '');
  const [selectedTextColor, setSelectedTextColor] = useState(generation.textColor || 'white');
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [textOpacity, setTextOpacity] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingAsset, setIsSavingAsset] = useState(false);
  const [showSaveCreatorInput, setShowSaveCreatorInput] = useState(false);
  const [showSaveBackgroundInput, setShowSaveBackgroundInput] = useState(false);
  const [creatorAssetName, setCreatorAssetName] = useState('');
  const [backgroundAssetName, setBackgroundAssetName] = useState('');
  const [activeEditTab, setActiveEditTab] = useState('background'); // New state for tab system

  const videoRef = useRef(null);

  // Initial state for comparison
  const [initialGenerationStateForEdit, setInitialGenerationStateForEdit] = useState(null);

  useEffect(() => {
    if (generation) {
      const initialState = {
        selectedBackgroundId: generation.selectedBackgroundId || '',
        textColor: generation.textColor || 'white',
        slideTexts: [...(generation.slideTexts || [])],
        hookText: generation.hookText || '',
      };
      setInitialGenerationStateForEdit(initialState);
      
      // Reset editing states
      setEditedHookText(generation.hookText || '');
      setEditedSlideTexts([...(generation.slideTexts || [])]);
      setSelectedBackgroundId(generation.selectedBackgroundId || '');
      setSelectedTextColor(generation.textColor || 'white');
      
      // Reset slide index to start from first slide
      setCurrentSlideIndex(0);
    }
  }, [generation.id]);

  const isAlreadySavedAsCreator = useMemo(() => {
    if (generation.commandCode === 202 && generation.imageUrl && creators) {
      return creators.some(creator => creator.imageUrl === generation.imageUrl);
    }
    return false;
  }, [generation, creators]);

  const existingCreator = useMemo(() => {
    if (isAlreadySavedAsCreator) {
      return creators.find(creator => creator.imageUrl === generation.imageUrl);
    }
    return null;
  }, [isAlreadySavedAsCreator, creators, generation]);

  const isAlreadySavedAsBackground = useMemo(() => {
    if (generation.commandCode === 201 && generation.imageUrl && backgrounds) {
      return backgrounds.some(bg => bg.imageUrl === generation.imageUrl);
    }
    return false;
  }, [generation, backgrounds]);

  const existingBackground = useMemo(() => {
    if (isAlreadySavedAsBackground) {
      return backgrounds.find(bg => bg.imageUrl === generation.imageUrl);
    }
    return null;
  }, [isAlreadySavedAsBackground, backgrounds, generation]);

  const handleSaveAsAsset = async (assetType) => {
    const assetName = assetType === 'creator' ? creatorAssetName : backgroundAssetName;
    if (!assetName.trim() || !generation.imageUrl) {
      window.alert("Please provide a name and ensure there's an image for the asset.");
      return;
    }
    
    setIsSavingAsset(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("User not authenticated");

      const functions = getFunctions();
      const functionName = assetType === 'creator' ? 'saveCreatorFromGeneration' : 'saveBackgroundFromGeneration';
      const payload = {
        imageUrl: generation.imageUrl,
        original_generation_data: generation.originalParameters || generation.parameters || {},
        sourceGenerationId: generation.id, 
      };

      if (assetType === 'creator') {
        payload.creator_name = assetName.trim();
      } else {
        payload.background_name = assetName.trim();
      }

      const saveAssetCallable = httpsCallable(functions, functionName);
      await saveAssetCallable(payload);
      
      onShowSuccessNotification(`${assetType.charAt(0).toUpperCase() + assetType.slice(1)} saved successfully!`);
      if (onAssetSaved) onAssetSaved(); 
      
      if (assetType === 'creator') {
        setCreatorAssetName('');
        setShowSaveCreatorInput(false);
      } else {
        setBackgroundAssetName('');
        setShowSaveBackgroundInput(false);
      }
    } catch (error) {
      console.error(`Error saving ${assetType} from generation:`, error);
      const errorMessage = error.message || 'Please try again.';
      window.alert(`Error saving ${assetType}: ${errorMessage}`);
    } finally {
      setIsSavingAsset(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this generation?')) return;
    
    setIsDeleting(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("User not authenticated");
      
      const collectionPath = generation.type === 'video' ? 'tiktok-posts' : 'generations';
      await deleteDoc(doc(db, 'users', user.uid, collectionPath, generation.id));
      
      onShowSuccessNotification('Generation deleted successfully!');
      onGenerationDeleted(generation.id);
      onClose();
    } catch (error) {
      console.error('Error deleting generation:', error);
      window.alert("Error deleting. Try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("User not authenticated");

      if (generation.type === 'video') {
        const functions = getFunctions();
        const performVideoConcatenation = httpsCallable(functions, 'performVideoConcatenation');
        
        await performVideoConcatenation({
          userId: user.uid,
          firestoreDocId: generation.id,
          runwayVideoUrl: generation.runwayVideoUrl || generation.videoUrl,
          productMediaUrl: generation.productToAppendUrl,
          productMediaType: generation.productToAppendType
        });
        
        onShowSuccessNotification('Video rendering started! It will be ready for download shortly.');
        
      } else if (generation.type === 'slideshow') {
        console.log('[renderSlideshow] Starting slideshow render...');
        console.log('[renderSlideshow] selectedBackgroundId:', selectedBackgroundId);
        console.log('[renderSlideshow] generation.selectedBackgroundId:', generation.selectedBackgroundId);
        console.log('[renderSlideshow] generation.aiSelectedBackgroundId:', generation.aiSelectedBackgroundId);
        console.log('[renderSlideshow] editedSlideTexts:', editedSlideTexts);
        console.log('[renderSlideshow] generation.slideTexts:', generation.slideTexts);
        
        const functions = getFunctions();
        const renderSlideshow = httpsCallable(functions, 'renderSlideshow');
        
        // Validate backgroundId before sending
        const finalBackgroundId = selectedBackgroundId || generation.selectedBackgroundId;
        console.log('[renderSlideshow] finalBackgroundId:', finalBackgroundId);
        
        if (!finalBackgroundId) {
          throw new Error('No background selected for slideshow rendering');
        }

        const payload = {
          slideshowId: generation.id,
          slideTexts: editedSlideTexts.length > 0 ? editedSlideTexts : generation.slideTexts,
          backgroundId: finalBackgroundId,
          textColor: selectedTextColor || generation.textColor || 'white'
        };

        console.log('[renderSlideshow] Sending payload:', payload);
        console.log('[renderSlideshow] Generation data:', {
          id: generation.id,
          selectedBackgroundId: generation.selectedBackgroundId,
          aiSelectedBackgroundId: generation.aiSelectedBackgroundId,
          slideTexts: generation.slideTexts,
          textColor: generation.textColor
        });
        
        try {
          const result = await renderSlideshow(payload);
          console.log('[renderSlideshow] Success result:', result);
        onShowSuccessNotification('Slideshow rendering started! It will be ready for download shortly.');
        } catch (renderError) {
          console.error('[renderSlideshow] Error details:', renderError);
          console.error('[renderSlideshow] Error code:', renderError.code);
          console.error('[renderSlideshow] Error message:', renderError.message);
          throw new Error(`Slideshow rendering failed: ${renderError.message || renderError.code || 'Unknown error'}`);
        }
        
      } else {
        await handleGenerationDownload(generation);
      }
    } catch (error) {
      console.error('Download/render error:', error);
      window.alert(`Error: ${error.message}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleVideoToggle = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  };

  const handleSlideChange = (direction) => {
    setTextOpacity(0);
    setTimeout(() => {
      setCurrentSlideIndex(prev => {
        const newIndex = prev + direction;
        const maxIndex = numSlides - 1;
        return Math.max(0, Math.min(newIndex, maxIndex));
      });
      setTextOpacity(1);
    }, 150);
  };

  const handleSaveEdits = async () => {
    console.log('[handleSaveEdits] Called. generation.type:', generation.type, 'generation.id:', generation.id);
    
    setIsSaving(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("User not authenticated");

      const collectionPath = generation.type === 'video' ? 'tiktok-posts' : 'generations';
      const docRef = doc(db, 'users', user.uid, collectionPath, generation.id);

      const updateData = {};
      
      if (!initialGenerationStateForEdit) {
        console.error("[handleSaveEdits] initialGenerationStateForEdit is not set. Aborting save.");
        setIsSaving(false);
        return;
      }

      // Check for changes and build update data
      if (generation.type === 'video' && editedHookText !== initialGenerationStateForEdit.hookText) {
        updateData.hookText = editedHookText;
      }
      
      if (generation.type === 'slideshow') {
        if (selectedBackgroundId !== initialGenerationStateForEdit.selectedBackgroundId) {
          updateData.selectedBackgroundId = selectedBackgroundId;
          if (selectedBackgroundId) {
            const foundBackground = backgrounds.find(bg => bg.id === selectedBackgroundId);
            if (foundBackground) {
              updateData.selectedBackgroundUrl = foundBackground.imageUrl;
            }
          } else {
            updateData.selectedBackgroundUrl = '';
          }
        }

        if (selectedTextColor !== initialGenerationStateForEdit.textColor) {
          updateData.textColor = selectedTextColor;
        }
        
        if (JSON.stringify(editedSlideTexts) !== JSON.stringify(initialGenerationStateForEdit.slideTexts)) {
          updateData.slideTexts = editedSlideTexts;
        }
      }
      
      console.log('[handleSaveEdits] Constructed updateData:', JSON.parse(JSON.stringify(updateData)));

      if (Object.keys(updateData).length === 0) {
        onShowSuccessNotification('No changes to save.');
        setIsSaving(false);
        return;
      }

      await updateDoc(docRef, updateData);
      
      // Update the initial state to reflect the saved changes
      setInitialGenerationStateForEdit(prev => ({
        ...prev,
        selectedBackgroundId: selectedBackgroundId,
        textColor: selectedTextColor,
        slideTexts: [...editedSlideTexts],
        hookText: editedHookText,
      }));
      
      const updatedGenerationData = { 
        id: generation.id, 
        // Spread existing generation data first to retain other fields
        ...generation,
        // Then overwrite with new/changed data
        ...updateData 
      };

      // If slideshow content was changed, invalidate processedImageUrls for card preview
      if (generation.type === 'slideshow' && 
          (updateData.hasOwnProperty('slideTexts') || 
           updateData.hasOwnProperty('selectedBackgroundId') || 
           updateData.hasOwnProperty('textColor'))) {
        updatedGenerationData.processedImageUrls = []; // or null, to trigger re-render logic in card
        console.log('[handleSaveEdits] Invalidated processedImageUrls because slideshow content changed.');
      }

      // If slideTexts was updated, ensure it's part of updatedGenerationData (already handled by ...updateData if key exists)
      // if (updateData.slideTexts) {
      //   updatedGenerationData.slideTexts = updateData.slideTexts;
      // }
      // If selectedBackgroundUrl was updated, ensure it's part of updatedGenerationData (already handled by ...updateData if key exists)
      // if (updateData.hasOwnProperty('selectedBackgroundUrl')) { 
      //     updatedGenerationData.selectedBackgroundUrl = updateData.selectedBackgroundUrl;
      // }

      // Add a more detailed log for the data being passed to onGenerationUpdated
      console.log('[handleSaveEdits] Updated generation data:', updatedGenerationData);

      onGenerationUpdated(updatedGenerationData); 
      
      onShowSuccessNotification('Changes saved successfully!');
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving edits:', error);
      window.alert("Error saving changes. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const canGoPrevious = generation.type === 'slideshow' && currentSlideIndex > 0;
  
  // Fix navigation logic to work for both processed images and text-based slides
  const canGoNext = generation.type === 'slideshow' && (() => {
    // If we have processed images (rendered slideshow), use their count
    if (generation.processedImageUrls && generation.processedImageUrls.length > 0 && !isEditing) {
      return currentSlideIndex < generation.processedImageUrls.length - 1;
    }
    // Otherwise, use slide texts count
    const slideTextsToUse = generation.slideTexts || [];
    return slideTextsToUse.length > 0 && currentSlideIndex < slideTextsToUse.length - 1;
  })();
  
  // Fix numSlides calculation to work for both cases
  const numSlides = (() => {
    if (generation.type !== 'slideshow') return 1;
    // If we have processed images (rendered slideshow) and not editing, use their count
    if (generation.processedImageUrls && generation.processedImageUrls.length > 0 && !isEditing) {
      return generation.processedImageUrls.length;
    }
    // Otherwise, use slide texts count
    const slideTextsToUse = generation.slideTexts || [];
    return slideTextsToUse.length || 1;
  })();

  // Computed property to check if there are changes
  const hasChanges = useMemo(() => {
    if (!initialGenerationStateForEdit) return false;
    
    const currentState = {
      selectedBackgroundId,
      textColor: selectedTextColor,
      slideTexts: editedSlideTexts,
      hookText: editedHookText,
    };
    
    return JSON.stringify(currentState) !== JSON.stringify(initialGenerationStateForEdit);
  }, [initialGenerationStateForEdit, selectedBackgroundId, selectedTextColor, editedSlideTexts, editedHookText]);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={onClose}>
        <motion.div 
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="bg-neutral-100 dark:bg-neutral-800 rounded-lg shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[85vh] w-full max-w-4xl" 
          onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
        >
          {/* Left side - Preview - Aspect ratio 9:16 and smaller size */}
          <div className="relative w-full md:w-80 aspect-[9/16] bg-black overflow-hidden flex-shrink-0">
            {generation.type === 'image' && generation.imageUrl && (
              <motion.img 
                initial={{ scale: 0.98, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 }}
                src={generation.imageUrl} 
                alt={generation.prompt || 'Generated image'} 
                className="w-full h-full object-cover"
              />
            )}
            
            {generation.type === 'video' && generation.videoUrl && (
              <motion.div 
                initial={{ scale: 0.98, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="relative w-full h-full"
              >
                {/* Show video with thumbnail and play button */}
                    <video 
                      ref={videoRef}
                  src={`${generation.finalVideoUrl || generation.runwayVideoUrl || generation.videoUrl}#t=0.1`} 
                      className="w-full h-full object-cover" 
                      preload="metadata"
                      playsInline
                  muted
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                    />
                
                {/* Hook text overlay - only show if not using finalVideoUrl (which already has text) */}
                {generation.hookText && !generation.finalVideoUrl && (
                  <div className="absolute inset-0 flex items-center justify-start p-6 z-10">
                    <p
                      className="text-white text-left font-normal text-lg max-w-[85%] leading-relaxed"
                      style={{ 
                        textShadow: '0 1px 3px rgba(0,0,0,0.8)' 
                      }}
                    >
                      {generation.hookText}
                    </p>
                  </div>
                )}
                
                {/* Play button overlay */}
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleVideoToggle}
                  className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors group z-20"
                    >
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {isPlaying ? (
                        <Pause size={32} className="text-white/80" weight="fill" />
                      ) : (
                        <Play size={32} className="text-white/80" weight="fill" />
                      )}
                  </div>
                    </motion.button>
              </motion.div>
            )}
            
            {generation.type === 'slideshow' && (
              <motion.div
                initial={{ scale: 0.98, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="w-full h-full"
              >
                {generation.processedImageUrls && generation.processedImageUrls.length > 0 && !isEditing ? (
                  <img
                    src={generation.processedImageUrls[currentSlideIndex]}
                    alt={`Slideshow image ${currentSlideIndex + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : generation.selectedBackgroundUrl && generation.slideTexts ? (
                  <div className="relative w-full h-full">
                    <img
                      src={(() => {
                        const url = selectedBackgroundId 
                          ? backgrounds.find(bg => bg.id === selectedBackgroundId)?.imageUrl 
                          : generation.selectedBackgroundUrl;
                        return url;
                      })()}
                      alt="Slideshow background"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center p-4 z-10">
                      <motion.div 
                        key={currentSlideIndex}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: textOpacity, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="max-w-[90%]"
                      >
                        <p 
                          className={`text-base font-medium text-center ${selectedTextColor === 'white' ? 'text-white' : 'text-black'}`}
                          style={{ 
                            textShadow: selectedTextColor === 'white' 
                              ? '0 1px 2px rgba(0,0,0,0.8)' 
                              : '0 1px 2px rgba(255,255,255,0.8)'
                          }}
                        >
                          {(() => {
                            const textsToUse = isEditing ? editedSlideTexts : generation.slideTexts;
                            const currentText = textsToUse?.[currentSlideIndex];
                            console.log('Debug slideshow text:', { 
                              currentSlideIndex, 
                              isEditing, 
                              editedSlideTexts: editedSlideTexts, 
                              generationSlideTexts: generation.slideTexts,
                              textsToUse,
                              currentText,
                              numSlides
                            });
                            return currentText || `Slide ${currentSlideIndex + 1}`;
                          })()}
                        </p>
                      </motion.div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-neutral-200 dark:bg-neutral-700">
                    <Slideshow size={40} className="text-neutral-400 dark:text-neutral-500" />
                  </div>
                )}

                {/* Slideshow navigation - Smaller */}
                {numSlides > 1 && (
                  <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between p-2">
                    <motion.button 
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleSlideChange(-1)}
                      disabled={!canGoPrevious}
                      className={`p-1.5 bg-black/40 text-white rounded-full backdrop-blur-sm transition-all ${canGoPrevious ? 'hover:bg-black/60' : 'opacity-30 cursor-not-allowed'}`}
                    >
                      <ArrowLeft size={16} weight="bold" />
                    </motion.button>
                    <motion.button 
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleSlideChange(1)}
                      disabled={!canGoNext}
                      className={`p-1.5 bg-black/40 text-white rounded-full backdrop-blur-sm transition-all ${canGoNext ? 'hover:bg-black/60' : 'opacity-30 cursor-not-allowed'}`}
                    >
                      <ArrowRight size={16} weight="bold" />
                    </motion.button>
                  </div>
                )}
              </motion.div>
            )}
          </div>
          
          {/* Right side - Controls and info - Much more compact */}
          <motion.div 
            initial={{ x: 16, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.25 }}
            className="flex-1 flex flex-col bg-white dark:bg-neutral-900 min-w-0"
          >
            {/* Header - Very compact */}
            <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between flex-shrink-0">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                  {getFriendlyGenerationType(generation.commandCode)}
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {generation.timestamp && generation.timestamp instanceof Date 
                    ? generation.timestamp.toLocaleDateString() 
                    : 'Unknown date'}
                </p>
              </div>
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onClose}
                className="p-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors flex-shrink-0"
              >
                <CloseIcon size={16} />
              </motion.button>
            </div>
            
            {/* Content - Compact scrollable */}
            <div className="flex-1 p-3 space-y-3 overflow-y-auto min-h-0">
              {/* Editing Section */}
              {generation.type !== 'image' && (
                <motion.div 
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.15 }}
                  className="space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Edit Content</h4>
                    <motion.button 
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        if (isEditing) {
                          setIsEditing(false);
                          setEditedHookText(generation.hookText || '');
                          setEditedSlideTexts([...(generation.slideTexts || [])]);
                          setSelectedBackgroundId(generation.selectedBackgroundId || '');
                          setSelectedTextColor(generation.textColor || 'white');
                        } else {
                          setIsEditing(true);
                        }
                      }}
                      className={`p-1 rounded-md transition-all ${isEditing 
                        ? 'bg-neutral-900 dark:bg-neutral-100 text-neutral-100 dark:text-neutral-900' 
                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400'
                      }`}
                    >
                      <Pencil size={12} />
                    </motion.button>
                  </div>
                  
                  {/* Video hook text editing */}
                  {generation.type === 'video' && (
                    <motion.div 
                      initial={{ y: 4, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className="space-y-1.5"
                    >
                      <label className="text-xs text-neutral-600 dark:text-neutral-400">Hook Text</label>
                      {isEditing ? (
                        <motion.textarea
                          initial={{ scale: 0.99 }}
                          animate={{ scale: 1 }}
                          value={editedHookText}
                          onChange={(e) => setEditedHookText(e.target.value)}
                          className="w-full p-2 border border-neutral-200 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-neutral-100 focus:ring-1 focus:ring-neutral-400 focus:border-transparent transition-all resize-none"
                          rows={2}
                          placeholder="Enter hook text..."
                        />
                      ) : (
                        <p className="text-xs text-neutral-600 dark:text-neutral-400 p-2 bg-neutral-50 dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700">
                          {generation.hookText || 'No hook text'}
                        </p>
                      )}
                    </motion.div>
                  )}
                  
                  {/* Slideshow editing */}
                  {generation.type === 'slideshow' && (
                    <motion.div 
                      initial={{ y: 4, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className="space-y-3"
                    >
                      {/* Tab Navigation */}
                      <div className="flex border-b border-neutral-200 dark:border-neutral-700">
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => setActiveEditTab('background')}
                          className={`flex-1 py-2 px-3 text-xs font-medium transition-all ${
                            activeEditTab === 'background'
                              ? 'text-neutral-900 dark:text-neutral-100 border-b-2 border-neutral-900 dark:border-neutral-100'
                              : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
                          }`}
                        >
                          Background & Color
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => setActiveEditTab('texts')}
                          className={`flex-1 py-2 px-3 text-xs font-medium transition-all ${
                            activeEditTab === 'texts'
                              ? 'text-neutral-900 dark:text-neutral-100 border-b-2 border-neutral-900 dark:border-neutral-100'
                              : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
                          }`}
                        >
                          Slide Texts
                        </motion.button>
                      </div>

                      {/* Tab Content */}
                      <AnimatePresence mode="wait">
                        {activeEditTab === 'background' && (
                          <motion.div
                            key="background-tab"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-3"
                          >
                            {/* Background selection */}
                            <div className="space-y-1.5">
                              <label className="text-xs text-neutral-600 dark:text-neutral-400">Background</label>
                              {isEditing ? (
                                <motion.div 
                                  initial={{ scale: 0.99 }}
                                  animate={{ scale: 1 }}
                                  className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto"
                                >
                                  {backgrounds.map((bg, index) => (
                                    <motion.div
                                      key={bg.id}
                                      initial={{ opacity: 0, y: 4 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      transition={{ delay: 0.03 * index }}
                                      whileHover={{ scale: 1.02 }}
                                      whileTap={{ scale: 0.98 }}
                                      onClick={() => {
                                        setSelectedBackgroundId(bg.id);
                                      }}
                                      className={`relative cursor-pointer rounded-md overflow-hidden border transition-all ${
                                        selectedBackgroundId === bg.id
                                          ? 'border-neutral-900 dark:border-neutral-100 ring-1 ring-neutral-900 dark:ring-neutral-100'
                                          : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
                                      }`}
                                    >
                                      <div className="aspect-[9/16]">
                                        <img
                                          src={bg.imageUrl}
                                          alt={bg.name}
                                          className="w-full h-full object-cover"
                                        />
                                      </div>
                                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                                        <p className="text-white text-xs truncate">
                                          {bg.name}
                                        </p>
                                      </div>
                                      {selectedBackgroundId === bg.id && (
                                        <motion.div 
                                          initial={{ scale: 0 }}
                                          animate={{ scale: 1 }}
                                          className="absolute top-1 right-1 w-3 h-3 bg-neutral-900 dark:bg-neutral-100 rounded-full flex items-center justify-center"
                                        >
                                          <Check size={8} className="text-neutral-100 dark:text-neutral-900" />
                                        </motion.div>
                                      )}
                                    </motion.div>
                                  ))}
                                </motion.div>
                              ) : (
                                <p className="text-xs text-neutral-600 dark:text-neutral-400 p-2 bg-neutral-50 dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700">
                                  {(() => {
                                    if (generation.selectedBackgroundId) {
                                      const bgById = backgrounds.find(bg => bg.id === generation.selectedBackgroundId);
                                      if (bgById) return bgById.name;
                                    }
                                    if (generation.selectedBackgroundUrl) {
                                      const bgByUrl = backgrounds.find(bg => bg.imageUrl === generation.selectedBackgroundUrl);
                                      if (bgByUrl) return bgByUrl.name;
                                    }
                                    return 'Background selected';
                                  })()}
                                </p>
                              )}
                            </div>
                     
                            {/* Text color selection */}
                            <div className="space-y-1.5">
                              <label className="text-xs text-neutral-600 dark:text-neutral-400">Text Color</label>
                              {isEditing ? (
                                <motion.div 
                                  initial={{ scale: 0.99 }}
                                  animate={{ scale: 1 }}
                                  className="flex gap-1.5"
                                >
                                  <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => setSelectedTextColor('white')}
                                    className={`flex-1 p-2 rounded-md border transition-all ${
                                      selectedTextColor === 'white'
                                        ? 'border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-800 ring-1 ring-neutral-900 dark:ring-neutral-100'
                                        : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
                                    }`}
                                  >
                                    <div className="flex items-center justify-center gap-1.5">
                                      <div className="w-2.5 h-2.5 bg-white border border-neutral-300 rounded-full"></div>
                                      <span className="text-xs text-neutral-900 dark:text-neutral-100">White</span>
                                    </div>
                                  </motion.button>
                                  <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => setSelectedTextColor('black')}
                                    className={`flex-1 p-2 rounded-md border transition-all ${
                                      selectedTextColor === 'black'
                                        ? 'border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-800 ring-1 ring-neutral-900 dark:ring-neutral-100'
                                        : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
                                    }`}
                                  >
                                    <div className="flex items-center justify-center gap-1.5">
                                      <div className="w-2.5 h-2.5 bg-black rounded-full"></div>
                                      <span className="text-xs text-neutral-900 dark:text-neutral-100">Black</span>
                                    </div>
                                  </motion.button>
                                </motion.div>
                              ) : (
                                <p className="text-xs text-neutral-600 dark:text-neutral-400 p-2 bg-neutral-50 dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700">
                                  {selectedTextColor === 'white' ? 'White text' : 'Black text'}
                                </p>
                              )}
                            </div>
                          </motion.div>
                        )}

                        {activeEditTab === 'texts' && (
                          <motion.div
                            key="texts-tab"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-1.5"
                          >
                            {/* Slide texts editing */}
                            <div className="space-y-1.5">
                              <label className="text-xs text-neutral-600 dark:text-neutral-400">Slide Texts</label>
                              {isEditing ? (
                                <motion.div 
                                  initial={{ scale: 0.99 }}
                                  animate={{ scale: 1 }}
                                  className="space-y-2 max-h-64 overflow-y-auto"
                                >
                                  {editedSlideTexts.map((text, index) => (
                                    <motion.textarea
                                      key={index}
                                      initial={{ opacity: 0, x: -4 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: 0.03 * index }}
                                      value={text}
                                      onChange={(e) => {
                                        const newTexts = [...editedSlideTexts];
                                        newTexts[index] = e.target.value;
                                        setEditedSlideTexts(newTexts);
                                      }}
                                      className="w-full p-2 border border-neutral-200 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-neutral-100 focus:ring-1 focus:ring-neutral-400 focus:border-transparent transition-all resize-none"
                                      rows={3}
                                      placeholder={`Slide ${index + 1} text...`}
                                    />
                                  ))}
                                </motion.div>
                              ) : (
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                  {generation.slideTexts.map((text, index) => (
                                    <motion.p 
                                      key={index}
                                      initial={{ opacity: 0, x: -4 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: 0.03 * index }}
                                      className="text-xs text-neutral-600 dark:text-neutral-400 p-2 bg-neutral-50 dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700"
                                    >
                                      {index + 1}. {text}
                                    </motion.p>
                                  ))}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </motion.div>
              )}
              
              {/* Save as Creator/Background Section */}
              {generation.type === 'image' && generation.imageUrl && (generation.commandCode === 202 || generation.commandCode === 201) && (
                <motion.div 
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.25 }}
                  className="space-y-2 border-t border-neutral-200 dark:border-neutral-800 pt-3"
                >
                  <h4 className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Save as Asset</h4>
                  
                  {/* Creator Section */}
                  {generation.commandCode === 202 && (
                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-600 dark:text-neutral-400">UGC Creator</label>
                      {isAlreadySavedAsCreator ? (
                        <motion.div 
                          initial={{ scale: 0.99 }}
                          animate={{ scale: 1 }}
                          className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md flex items-center justify-between"
                        >
                          <div className="flex items-center gap-1.5">
                            <Check size={12} className="text-green-600 dark:text-green-400" />
                            <span className="text-xs text-green-700 dark:text-green-300">
                              Saved as "{existingCreator?.name}"
                            </span>
                          </div>
                          <User size={12} className="text-green-600 dark:text-green-400" />
                        </motion.div>
                      ) : showSaveCreatorInput ? (
                        <motion.div 
                          initial={{ scale: 0.99, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="space-y-1.5"
                        >
                          <input
                            type="text"
                            value={creatorAssetName}
                            onChange={(e) => setCreatorAssetName(e.target.value)}
                            placeholder="Enter creator name..."
                            className="w-full p-2 border border-neutral-200 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-neutral-100 focus:ring-1 focus:ring-neutral-400 focus:border-transparent transition-all"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && creatorAssetName.trim()) {
                                handleSaveAsAsset('creator');
                              }
                            }}
                          />
                          <div className="flex gap-1.5">
                            <motion.button
                              whileHover={{ scale: 1.01 }}
                              whileTap={{ scale: 0.99 }}
                              onClick={() => setShowSaveCreatorInput(false)}
                              disabled={isSavingAsset}
                              className="flex-1 py-1.5 px-2 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all disabled:opacity-50"
                            >
                              Cancel
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.01 }}
                              whileTap={{ scale: 0.99 }}
                              onClick={() => handleSaveAsAsset('creator')}
                              disabled={isSavingAsset || !creatorAssetName.trim()}
                              className="flex-1 py-1.5 px-2 bg-neutral-900 dark:bg-neutral-100 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:bg-neutral-400 text-neutral-100 dark:text-neutral-900 text-xs rounded-md transition-all flex items-center justify-center"
                            >
                              {isSavingAsset ? <CircleNotch size={10} className="animate-spin" /> : 'Save'}
                            </motion.button>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => {
                            setShowSaveCreatorInput(true);
                            setShowSaveBackgroundInput(false);
                            setCreatorAssetName('');
                          }}
                          className="w-full p-2 border border-neutral-200 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-xs text-neutral-900 dark:text-neutral-100 transition-all flex items-center justify-center gap-1.5"
                        >
                          <UserPlus size={12} />
                          Save as Creator
                        </motion.button>
                      )}
                    </div>
                  )}

                  {/* Background Section */}
                  {generation.commandCode === 201 && (
                    <div className="space-y-1.5">
                      <label className="text-xs text-neutral-600 dark:text-neutral-400">Background</label>
                      {isAlreadySavedAsBackground ? (
                        <motion.div 
                          initial={{ scale: 0.99 }}
                          animate={{ scale: 1 }}
                          className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md flex items-center justify-between"
                        >
                          <div className="flex items-center gap-1.5">
                            <Check size={12} className="text-green-600 dark:text-green-400" />
                            <span className="text-xs text-green-700 dark:text-green-300">
                              Saved as "{existingBackground?.name}"
                            </span>
                          </div>
                          <ImageSquare size={12} className="text-green-600 dark:text-green-400" />
                        </motion.div>
                      ) : showSaveBackgroundInput ? (
                        <motion.div 
                          initial={{ scale: 0.99, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="space-y-1.5"
                        >
                          <input
                            type="text"
                            value={backgroundAssetName}
                            onChange={(e) => setBackgroundAssetName(e.target.value)}
                            placeholder="Enter background name..."
                            className="w-full p-2 border border-neutral-200 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-neutral-100 focus:ring-1 focus:ring-neutral-400 focus:border-transparent transition-all"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && backgroundAssetName.trim()) {
                                handleSaveAsAsset('background');
                              }
                            }}
                          />
                          <div className="flex gap-1.5">
                            <motion.button
                              whileHover={{ scale: 1.01 }}
                              whileTap={{ scale: 0.99 }}
                              onClick={() => setShowSaveBackgroundInput(false)}
                              disabled={isSavingAsset}
                              className="flex-1 py-1.5 px-2 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all disabled:opacity-50"
                            >
                              Cancel
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.01 }}
                              whileTap={{ scale: 0.99 }}
                              onClick={() => handleSaveAsAsset('background')}
                              disabled={isSavingAsset || !backgroundAssetName.trim()}
                              className="flex-1 py-1.5 px-2 bg-neutral-900 dark:bg-neutral-100 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:bg-neutral-400 text-neutral-100 dark:text-neutral-900 text-xs rounded-md transition-all flex items-center justify-center"
                            >
                              {isSavingAsset ? <CircleNotch size={10} className="animate-spin" /> : 'Save'}
                            </motion.button>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => {
                            setShowSaveBackgroundInput(true);
                            setShowSaveCreatorInput(false);
                            setBackgroundAssetName('');
                          }}
                          className="w-full p-2 border border-neutral-200 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-xs text-neutral-900 dark:text-neutral-100 transition-all flex items-center justify-center gap-1.5"
                        >
                          <PlusSquare size={12} />
                          Save as Background
                        </motion.button>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </div>
              
            {/* Footer actions - Very compact */}
            <motion.div 
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="p-3 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex-shrink-0"
            >
              {/* Save button for editing mode - ALWAYS show when editing and has changes */}
              {isEditing && hasChanges && (
                <motion.button 
                  initial={{ scale: 0.99, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={handleSaveEdits}
                  disabled={isSaving}
                  className="w-full py-2 px-3 bg-neutral-900 dark:bg-neutral-100 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:bg-neutral-400 text-neutral-100 dark:text-neutral-900 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5 mb-2"
                >
                  {isSaving ? (
                    <>
                      <CircleNotch size={12} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check size={12} />
                      Save Changes
                    </>
                  )}
                </motion.button>
              )}
              
              {/* Action buttons - only show when not in editing mode or no changes */}
              {(!isEditing || !hasChanges) && (
                <motion.div 
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="space-y-2"
                >
                  {/* Render button for videos and slideshows - only show if not rendered yet */}
                  {(generation.type === 'video' && !generation.finalVideoUrl) && (
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={handleDownload}
                      disabled={isDownloading}
                      className="w-full py-2 px-3 bg-neutral-900 dark:bg-neutral-100 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:bg-neutral-400 text-neutral-100 dark:text-neutral-900 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5"
                    >
                      {isDownloading ? (
                        <>
                          <CircleNotch size={12} className="animate-spin" />
                          Rendering...
                        </>
                      ) : (
                        <>
                          <FilmSlate size={12} />
                          Render with My Product Video
                        </>
                      )}
                    </motion.button>
                  )}
                  
                  {(generation.type === 'slideshow' && (!generation.processedImageUrls || generation.processedImageUrls.length === 0)) && (
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={handleDownload}
                      disabled={isDownloading}
                      className="w-full py-2 px-3 bg-neutral-900 dark:bg-neutral-100 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:bg-neutral-400 text-neutral-100 dark:text-neutral-900 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5"
                >
                      {isDownloading ? (
                        <>
                          <CircleNotch size={12} className="animate-spin" />
                          Rendering...
                        </>
                      ) : (
                        <>
                          <FilmSlate size={12} />
                          Render and Ready to Download
                        </>
                      )}
                    </motion.button>
                  )}
                  
                  <div className="grid grid-cols-2 gap-1.5">
                    {/* Show download button for rendered videos and slideshows */}
                    {((generation.type === 'video' && generation.finalVideoUrl) || 
                      (generation.type === 'slideshow' && generation.processedImageUrls && generation.processedImageUrls.length > 0)) && (
                      <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => handleGenerationDownload(generation)}
                        disabled={isDownloading}
                        className="py-2 px-3 bg-neutral-900 dark:bg-neutral-100 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:bg-neutral-400 text-neutral-100 dark:text-neutral-900 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1"
                      >
                        <>
                          <DownloadSimple size={10} />
                          Download
                        </>
                      </motion.button>
                    )}
                    
                    {/* For images, always show download */}
                    {generation.type === 'image' && (
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="py-2 px-3 bg-neutral-900 dark:bg-neutral-100 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:bg-neutral-400 text-neutral-100 dark:text-neutral-900 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1"
                  >
                    {isDownloading ? (
                      <CircleNotch size={10} className="animate-spin" />
                    ) : (
                      <>
                        <DownloadSimple size={10} />
                        Download
                      </>
                    )}
                  </motion.button>
                    )}
                  
                  <motion.button 
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={handleDelete}
                    disabled={isDeleting}
                      className={`py-2 px-3 bg-red-600 hover:bg-red-500 disabled:bg-neutral-400 text-white text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1 ${
                        ((generation.type === 'video' && !generation.finalVideoUrl) || 
                         (generation.type === 'slideshow' && (!generation.processedImageUrls || generation.processedImageUrls.length === 0))) ? 'col-span-2' : ''
                      }`}
                  >
                    {isDeleting ? (
                      <CircleNotch size={10} className="animate-spin" />
                    ) : (
                      <>
                        <Trash size={10} />
                        Delete
                      </>
                    )}
                  </motion.button>
                  </div>
                  
                  {/* Note about editing limitations after rendering */}
                  {(generation.type === 'video' || generation.type === 'slideshow') && (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 text-center mt-2">
                      Note: Content cannot be edited after rendering
                    </p>
                  )}
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
// --- End Edit Popup Component ---

// --- NEW: Video Preview Component for TikTok Videos ---
function VideoPreview({ generation, className = "" }) {
  const [currentPhase, setCurrentPhase] = useState('runway'); // 'runway' or 'product'
  const [showText, setShowText] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const runwayVideoRef = useRef(null);
  const productVideoRef = useRef(null);
  const timeoutRef = useRef(null);

  const hasProductVideo = generation.productToAppendUrl && generation.productToAppendType === 'video';

  useEffect(() => {
    setCurrentPhase('runway');
    setShowText(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, [generation.id]);

  const handlePlay = () => {
    setIsPlaying(true);
    if (currentPhase === 'runway' && runwayVideoRef.current) {
      runwayVideoRef.current.play();
      // Hide text after 5 seconds
      timeoutRef.current = setTimeout(() => {
        setShowText(false);
        if (hasProductVideo) {
          setTimeout(() => {
            setCurrentPhase('product');
            if (productVideoRef.current) {
              productVideoRef.current.currentTime = 0;
              productVideoRef.current.play();
            }
          }, 500);
        }
      }, 5000);
    }
  };

  const handleVideoEnd = () => {
    if (currentPhase === 'runway' && hasProductVideo) {
      setShowText(false);
      setTimeout(() => {
        setCurrentPhase('product');
        if (productVideoRef.current) {
          productVideoRef.current.currentTime = 0;
          productVideoRef.current.play();
        }
      }, 500);
    } else if (currentPhase === 'product') {
      setCurrentPhase('runway');
      setShowText(true);
      setIsPlaying(false);
    } else {
      setIsPlaying(false);
    }
  };

  return (
    <div className={`relative w-full h-full ${className}`}>
      {/* Runway Video */}
      <video
        ref={runwayVideoRef}
        src={`${generation.runwayVideoUrl || generation.videoUrl}#t=0.1`}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
          currentPhase === 'runway' ? 'opacity-100' : 'opacity-0'
        }`}
        preload="metadata"
        playsInline
        muted
        onEnded={handleVideoEnd}
      />

      {/* Product Video */}
      {hasProductVideo && (
        <video
          ref={productVideoRef}
          src={`${generation.productToAppendUrl}#t=0.1`}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
            currentPhase === 'product' ? 'opacity-100' : 'opacity-0'
          }`}
          preload="metadata"
          playsInline
          muted
          onEnded={handleVideoEnd}
        />
      )}

      {/* Text Overlay */}
      {generation.hookText && currentPhase === 'runway' && (
        <div
          className={`absolute inset-0 flex items-center justify-start p-6 z-10 transition-opacity duration-500 ${
            showText ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <p
            className="text-white text-left font-normal text-lg max-w-[85%] leading-relaxed"
            style={{ 
              textShadow: '0 1px 3px rgba(0,0,0,0.8)' 
            }}
          >
            {generation.hookText}
          </p>
        </div>
      )}

      {/* Play Button on Hover */}
      {!isPlaying && (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handlePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors group"
        >
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <Play size={32} className="text-white/80" weight="fill" />
      </div>
        </motion.button>
      )}
    </div>
  );
}

function GenerationCard({ generation, onClick, creators, backgrounds }) { // Added creators and backgrounds props
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  // --- NEW: Check if already saved as Creator or Background and get their names ---
  const existingCreator = useMemo(() => {
    if (generation.commandCode === 202 && generation.imageUrl && creators) {
      return creators.find(creator => creator.imageUrl === generation.imageUrl);
    }
    return null;
  }, [generation, creators]);

  const existingBackground = useMemo(() => {
    if (generation.commandCode === 201 && generation.imageUrl && backgrounds) {
      return backgrounds.find(bg => bg.imageUrl === generation.imageUrl);
    }
    return null;
  }, [generation, backgrounds]);
  // --- END NEW ---

  // For slideshows, we'll show a preview of the content
  const getPreviewContent = () => {
    if (generation.type === 'image' && generation.imageUrl) {
      return (
        <img 
          src={generation.imageUrl} 
          alt={generation.prompt || 'Generated image'} 
          className="w-full h-full object-cover"
        />
      );
    }
    
    if (generation.type === 'video') {
      // Use initialImageUrl if available, with hookText overlay
      if (generation.initialImageUrl && generation.hookText) {
        return (
          <div className="relative w-full h-full">
            <img 
              src={generation.initialImageUrl} 
              alt={generation.prompt || 'Video preview'} 
              className="w-full h-full object-cover"
            />
            <div
              className="absolute inset-0 flex items-center justify-start p-6 z-10 bg-gradient-to-t from-black/30 to-transparent"
            >
              <p
                className="text-white text-left font-normal text-lg max-w-[85%] leading-relaxed"
                style={{ 
                  textShadow: '0 1px 3px rgba(0,0,0,0.8)' 
                }}
              >
                {generation.hookText}
              </p>
            </div>
          </div>
        );
      }
      // Fallback to initialImageUrl without text if no hookText
      else if (generation.initialImageUrl) {
        return (
          <img 
            src={generation.initialImageUrl} 
            alt={generation.prompt || 'Video preview'} 
            className="w-full h-full object-cover"
          />
        );
      }
      // Fallback to showing a thumbnail with a play icon and small hook text if available
      else if (generation.imageUrl) {
        return (
          <div className="relative w-full h-full">
            <img 
              src={generation.imageUrl} 
              alt="Video thumbnail" 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
              <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center">
                <Play size={24} className="text-black ml-1" weight="fill" />
              </div>
            </div>
            {generation.hookText && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                <p className="text-white text-xs font-medium line-clamp-2">
                  {generation.hookText}
                </p>
              </div>
            )}
          </div>
        );
      } else {
        return (
          <div className="w-full h-full bg-black flex items-center justify-center">
            <div className="text-center">
              <FilmSlate size={32} className="text-white/60 mx-auto mb-2" />
              <p className="text-white/80 text-xs">Video</p>
            </div>
          </div>
        );
      }
    }
    
    if (generation.type === 'slideshow') {
      // ALWAYS show custom preview with selected background and first slide text
      if (generation.selectedBackgroundUrl && generation.slideTexts && generation.slideTexts.length > 0) {
        // Determine effective text color, defaulting to 'white'
        const effectiveTextColor = generation.textColor || 'white';
        return (
          <div className="relative w-full h-full">
            <img
              src={generation.selectedBackgroundUrl}
              alt="Slideshow background"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-start p-4"> {/* Changed to justify-start for left align */}
              <p 
                className={`text-sm md:text-base font-bold text-left ${effectiveTextColor === 'white' ? 'text-white' : 'text-black'}`}
                style={{ 
                  textShadow: effectiveTextColor === 'white' 
                    ? '0 1px 2px rgba(0,0,0,0.8)' 
                    : '0 1px 2px rgba(255,255,255,0.8)'
                }}
              >
                {generation.slideTexts[0]}
              </p>
            </div>
          </div>
        );
      } else {
        // Fallback if essential slideshow data is missing for the preview
        return (
          <div className="w-full h-full bg-gray-200 dark:bg-zinc-700 flex items-center justify-center">
            <Slideshow size={32} className="text-gray-400 dark:text-zinc-500" />
          </div>
        );
      }
    }
    
    // Fallback
    return (
      <div className="w-full h-full bg-gray-200 dark:bg-zinc-700 flex items-center justify-center">
        <ImageSquare size={32} className="text-gray-400 dark:text-zinc-500" />
      </div>
    );
  };

  // Determine selectedTextColor for slideshow preview (used in GenerationCard)
  // This is a simplified assumption. For full accuracy, this logic might need to be passed down or
  // the GenerationCard might need access to the 'backgrounds' prop if it needs to derive text color
  // based on background properties. Here, we'll assume 'white' as a default if not specified.
  const selectedTextColor = generation.textColor || 'white';


  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      whileHover={{ scale: 1.01 }}
      transition={{ 
        duration: 0.4, 
        ease: "easeOut",
        scale: { type: "spring", stiffness: 400, damping: 25 }
      }}
      className="relative rounded-lg overflow-hidden border border-gray-100 dark:border-zinc-800 group shadow-sm hover:shadow-md transition-all duration-300 bg-gray-50 dark:bg-zinc-800 cursor-pointer"
      style={{ paddingTop: '177.77%' }} // 9:16 aspect ratio
      onClick={onClick}
    >
      {/* Background Image Area */} 
      <div className="absolute inset-0 w-full h-full overflow-hidden">
        {getPreviewContent()}
                  </div>
                  
      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center z-20">
        <div className="bg-neutral-800/70 px-3 py-1.5 rounded-full">
          <span className="text-sm font-medium text-white">
            View & Edit
          </span>
        </div>
      </div>
      
      {/* Creator/Background save buttons - top right */}
      {generation.imageUrl && (
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {generation.commandCode === 202 && (
            existingCreator ? (
              <div className="px-2 py-1 bg-black text-white text-[10px] rounded-full backdrop-blur-sm font-medium">
                {existingCreator.name}
              </div>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // Open creator save modal by setting selected generation and triggering save mode
                  onClick(); // This will open the main popup
                  // TODO: Add specific creator save trigger
                }}
                className="w-8 h-8 bg-neutral-900/90 hover:bg-neutral-800 dark:bg-neutral-100/90 dark:hover:bg-neutral-200 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors"
                title="Save as Creator"
              >
                <UserPlus size={14} className="text-neutral-100 dark:text-neutral-900" />
              </button>
            )
          )}
          {generation.commandCode === 201 && (
            existingBackground ? (
              <div className="px-2 py-1 bg-black text-white text-[10px] rounded-full backdrop-blur-sm font-medium">
                {existingBackground.name}
              </div>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // Open background save modal by setting selected generation and triggering save mode
                  onClick(); // This will open the main popup
                  // TODO: Add specific background save trigger
                }}
                className="w-8 h-8 bg-neutral-900/90 hover:bg-neutral-800 dark:bg-neutral-100/90 dark:hover:bg-neutral-200 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors"
                title="Save as Background"
              >
                <PlusSquare size={14} className="text-neutral-100 dark:text-neutral-900" />
              </button>
            )
          )}
        </div>
      )}
      
      {/* Info overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-300">
            {generation.timestamp && generation.timestamp instanceof Date 
              ? generation.timestamp.toLocaleDateString() 
              : 'Unknown date'}
                </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
            {getFriendlyGenerationType(generation.commandCode) || generation.type || 'unknown'}
                </span>
              </div>
            </div>
    </motion.div>
  );
}
// --- End Simplified Generation Card Component ---

function Dashboard() {
  const user = auth.currentUser;
  const [generations, setGenerations] = useState([]);
  const [isLoadingGenerations, setIsLoadingGenerations] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedGeneration, setSelectedGeneration] = useState(null);

  const {
    dashboardRefreshKey,
    generatingItem,
    isDarkMode,
    user: contextUser, 
    creators,
    backgrounds,
    products,
    refreshLayoutData,
    notifyGenerationComplete,
    refreshDashboardGenerations
  } = useOutletContext() || {
    dashboardRefreshKey: 0,
    generatingItem: null,
    isDarkMode: false,
    user: null,
    creators: [],
    backgrounds: [],
    products: [],
    refreshLayoutData: () => {},
    notifyGenerationComplete: () => {},
    refreshDashboardGenerations: () => {},
  };

  const generationCounts = React.useMemo(() => {
    let images = 0;
    let videos = 0;
    let slideshows = 0;
    for (const gen of generations) {
      if (gen.type === 'image') images++;
      else if (gen.type === 'video') videos++;
      else if (gen.type === 'slideshow') slideshows++;
    }
    return { images, videos, slideshows, total: images + videos + slideshows };
  }, [generations]);

  const [lastTimestampForPagination, setLastTimestampForPagination] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [generationToDeleteId, setGenerationToDeleteId] = useState(null);
  const [isDeletingGeneration, setIsDeletingGeneration] = useState(false);
  const [imagePollingIntervalId, setImagePollingIntervalId] = useState(null);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [successModalMessage, setSuccessModalMessage] = useState('');

  const showSuccessNotification = (message) => {
    setSuccessModalMessage(message);
    setIsSuccessModalOpen(true);
    setTimeout(() => {
      if (setIsSuccessModalOpen) { // Check if component is still mounted or setter is available
        setIsSuccessModalOpen(false);
      }
    }, 3000);
  };

  const handleCloseSuccessModal = () => {
    setIsSuccessModalOpen(false);
  };

  useEffect(() => {
    if (!user) {
      setIsLoadingGenerations(false);
      return;
    }

    const fetchGenerations = async () => {
      setIsLoadingGenerations(true);
      setHasMore(true);
      setLastTimestampForPagination(null);
      const fetchLimit = 9;

      try {
        const generationsColRef = collection(db, 'users', user.uid, 'generations');
        const generationsQuery = query(generationsColRef, orderBy('timestamp', 'desc'), limit(fetchLimit));
        const tiktokPostsColRef = collection(db, 'users', user.uid, 'tiktok-posts');
        const tiktokPostsQuery = query(tiktokPostsColRef, orderBy('timestamp', 'desc'), limit(fetchLimit));

        const [generationsSnapshots, tiktokPostsSnapshots] = await Promise.all([
          getDocs(generationsQuery),
          getDocs(tiktokPostsQuery)
        ]);

        const processedGenerations = generationsSnapshots.docs.map(docSnapshot => {
          const data = docSnapshot.data();
          const timestamp = data.timestamp instanceof Timestamp ? data.timestamp.toDate() : (data.timestamp ? new Date(data.timestamp) : new Date());
          return { id: docSnapshot.id, ...data, timestamp };
        });

        const processedTiktokPosts = tiktokPostsSnapshots.docs.map(docSnapshot => {
          const data = docSnapshot.data();
          const timestamp = data.timestamp instanceof Timestamp ? data.timestamp.toDate() : (data.timestamp ? new Date(data.timestamp) : new Date());
          return { id: docSnapshot.id, ...data, timestamp, type: 'video', videoUrl: data.finalVideoUrl || null };
        }).filter(post => post.videoUrl && (post.status === 'completed' || post.status === 'assets_ready_for_review')); // Only show completed videos

        const combinedItems = [...processedGenerations, ...processedTiktokPosts];
        combinedItems.sort((a, b) => b.timestamp - a.timestamp);
        const finalItems = combinedItems.slice(0, fetchLimit);
        setGenerations(finalItems);

        if (finalItems.length > 0) {
          const lastItem = finalItems[finalItems.length - 1];
          const originalDoc = [...generationsSnapshots.docs, ...tiktokPostsSnapshots.docs].find(d => d.id === lastItem.id);
          setLastTimestampForPagination((originalDoc?.data()?.timestamp || lastItem.timestamp));
        }
        setHasMore(finalItems.length === fetchLimit);

      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        setHasMore(false);
      } finally {
        setIsLoadingGenerations(false);
      }
    };

    fetchGenerations();
  }, [user, dashboardRefreshKey]);

  useEffect(() => {
    const itemToPoll = generatingItem;
    const shouldPollItem = itemToPoll && contextUser &&
      (itemToPoll.type === 'image' || itemToPoll.type === 'slideshow') &&
      (itemToPoll.status === 'generating_direct' || itemToPoll.status === 'generating_slideshow' || itemToPoll.status === 'generating_firestore') &&
      itemToPoll.firestoreDocId;

    if (shouldPollItem && imagePollingIntervalId === null) {
      const intervalId = setInterval(async () => {
        if (!itemToPoll || !itemToPoll.firestoreDocId || !contextUser) {
          clearInterval(intervalId);
          return;
        }
        try {
          const docRef = doc(db, 'users', contextUser.uid, 'generations', itemToPoll.firestoreDocId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            let isReady = false;
            if (itemToPoll.type === 'image' && data.imageUrl) isReady = true;
            else if (itemToPoll.type === 'slideshow' && data.processedImageUrls && data.processedImageUrls.length > 0 && data.processedImageUrls.every(url => typeof url === 'string' && url.startsWith('http'))) isReady = true;
            
            if (isReady) {
              clearInterval(intervalId);
              if (notifyGenerationComplete) notifyGenerationComplete(itemToPoll.type, itemToPoll.firestoreDocId); 
            }
          } else {
            clearInterval(intervalId);
          }
        } catch (error) {
          console.error(`Polling error for ${itemToPoll.type} ID ${itemToPoll.firestoreDocId}:`, error);
        }
      }, 7000);
      setImagePollingIntervalId(intervalId);
    }
    return () => {
      if (imagePollingIntervalId !== null) {
        clearInterval(imagePollingIntervalId);
        setImagePollingIntervalId(null);
      }
    };
  }, [generatingItem, imagePollingIntervalId, contextUser, notifyGenerationComplete, refreshDashboardGenerations]);

  const fetchMoreGenerations = async () => {
    if (!user || !lastTimestampForPagination || !hasMore) return;
    setIsLoadingMore(true);
    const fetchLimit = 9;
    try {
      const generationsColRef = collection(db, 'users', user.uid, 'generations');
      const tiktokPostsColRef = collection(db, 'users', user.uid, 'tiktok-posts');
      
      const qGenerations = query(
        generationsColRef,
        orderBy('timestamp', 'desc'),
        startAfter(lastTimestampForPagination),
        limit(fetchLimit)
      );
      const qTiktokPosts = query(
        tiktokPostsColRef,
        orderBy('timestamp', 'desc'),
        startAfter(lastTimestampForPagination),
        limit(fetchLimit) 
      );

      const [generationsSnapshots, tiktokPostsSnapshots] = await Promise.all([
        getDocs(qGenerations),
        getDocs(qTiktokPosts)
      ]);

      const newGenerations = generationsSnapshots.docs.map(docSnapshot => {
        const data = docSnapshot.data();
        return { id: docSnapshot.id, ...data, timestamp: data.timestamp.toDate() };
      });
      const newTiktokPosts = tiktokPostsSnapshots.docs.map(docSnapshot => {
        const data = docSnapshot.data();
        return { id: docSnapshot.id, ...data, timestamp: data.timestamp.toDate(), type: 'video', videoUrl: data.finalVideoUrl || null };
      }).filter(post => post.videoUrl && (post.status === 'completed' || post.status === 'assets_ready_for_review')); // Only show completed videos

      const combinedNewItems = [...newGenerations, ...newTiktokPosts];
      combinedNewItems.sort((a, b) => b.timestamp - a.timestamp);
      const finalNewItems = combinedNewItems.slice(0, fetchLimit); 

      setGenerations(prev => [...prev, ...finalNewItems]);
      if (finalNewItems.length > 0) {
        const lastItem = finalNewItems[finalNewItems.length - 1];
        const originalDocFromGen = generationsSnapshots.docs.find(d => d.id === lastItem.id);
        const originalDocFromTiktok = tiktokPostsSnapshots.docs.find(d => d.id === lastItem.id);
        setLastTimestampForPagination((originalDocFromGen || originalDocFromTiktok)?.data()?.timestamp || lastItem.timestamp);
      }
      setHasMore(finalNewItems.length === fetchLimit);
    } catch (error) {
      console.error("Error fetching more generations:", error);
      setHasMore(false);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (generatingItem) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [generatingItem]);

  const handleOpenDeleteModal = (genId) => {
    setGenerationToDeleteId(genId);
    setIsDeleteModalOpen(true);
  };
  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setGenerationToDeleteId(null);
  };
  const handleConfirmDelete = async () => {
    if (!generationToDeleteId || !user) return;
    setIsDeletingGeneration(true);
    try {
      const generationToDelete = generations.find(gen => gen.id === generationToDeleteId);
      if (!generationToDelete) throw new Error("Generation not found.");
      const collectionPath = generationToDelete.type === 'video' ? 'tiktok-posts' : 'generations';
      await deleteDoc(doc(db, 'users', user.uid, collectionPath, generationToDeleteId));
      setGenerations(prev => prev.filter(gen => gen.id !== generationToDeleteId));
      handleCloseDeleteModal();
    } catch (error) {
      console.error('Error deleting generation:', error);
      window.alert("Error deleting. Try again.");
    } finally {
      setIsDeletingGeneration(false);
    }
  };

  const handleScheduleGenerationSubmit = async (generationId, generationType, scheduledDateTime) => {
    if (!user || !scheduledDateTime) {
      throw new Error("Missing info for scheduling.");
    }
    const scheduledTimestamp = Timestamp.fromDate(scheduledDateTime);
    const collectionName = generationType === 'video' ? 'tiktok-posts' : 'generations';
    const docRef = doc(db, 'users', user.uid, collectionName, generationId);
    try {
      await updateDoc(docRef, { scheduledAt: scheduledTimestamp });
      showSuccessNotification("Generation scheduled!");
      refreshDashboardGenerations(); 
    } catch (error) {
      console.error("Error scheduling:", error);
      window.alert(`Failed to schedule: ${error.message}`);
      throw error;
    }
  };

  // Filtered generations based on activeFilter
  const displayedGenerations = useMemo(() => {
    if (activeFilter === 'all') {
      return generations;
    }
    return generations.filter(gen => gen.type === activeFilter);
  }, [generations, activeFilter]);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Recent generations section */}
      <section className="mb-8">
            <div className="flex items-center justify-between mb-6">
              
              {/* Filters */}
              <div className="inline-flex items-center p-1 bg-gray-100 dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700">
                <button
                  onClick={() => setActiveFilter('all')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-1.5 transition-all duration-200 ${ 
                    activeFilter === 'all'
                      ? 'bg-white dark:bg-zinc-700 text-black dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                  }`}
                >
                  All
                  <span className={`flex items-center justify-center w-4 h-4 text-[10px] rounded-full transition-colors ${
                    activeFilter === 'all'
                      ? 'bg-gray-100 dark:bg-zinc-600 text-gray-700 dark:text-zinc-300'
                      : 'bg-gray-200 dark:bg-zinc-700 text-gray-500 dark:text-zinc-500'
                  }`}>
                    {generations.length} 
             </span>
                </button>
                <button
                  onClick={() => setActiveFilter('video')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-1.5 transition-all duration-200 ${ 
                    activeFilter === 'video'
                      ? 'bg-white dark:bg-zinc-700 text-black dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                  }`}
                >
                  Videos
                  <span className={`flex items-center justify-center w-4 h-4 text-[10px] rounded-full transition-colors ${
                    activeFilter === 'video'
                      ? 'bg-gray-100 dark:bg-zinc-600 text-gray-700 dark:text-zinc-300'
                      : 'bg-gray-200 dark:bg-zinc-700 text-gray-500 dark:text-zinc-500'
                  }`}>
                    {generationCounts.videos}
              </span>
                </button>
                <button
                  onClick={() => setActiveFilter('image')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-1.5 transition-all duration-200 ${ 
                    activeFilter === 'image'
                      ? 'bg-white dark:bg-zinc-700 text-black dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                  }`}
                >
                  Images
                  <span className={`flex items-center justify-center w-4 h-4 text-[10px] rounded-full transition-colors ${
                    activeFilter === 'image'
                      ? 'bg-gray-100 dark:bg-zinc-600 text-gray-700 dark:text-zinc-300'
                      : 'bg-gray-200 dark:bg-zinc-700 text-gray-500 dark:text-zinc-500'
                  }`}>
                    {generationCounts.images}
                      </span>
                </button>
            <button 
                  onClick={() => setActiveFilter('slideshow')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-1.5 transition-all duration-200 ${ 
                    activeFilter === 'slideshow'
                      ? 'bg-white dark:bg-zinc-700 text-black dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                  }`}
                >
                  Slideshows
                  <span className={`flex items-center justify-center w-4 h-4 text-[10px] rounded-full transition-colors ${
                    activeFilter === 'slideshow'
                      ? 'bg-gray-100 dark:bg-zinc-600 text-gray-700 dark:text-zinc-300'
                      : 'bg-gray-200 dark:bg-zinc-700 text-gray-500 dark:text-zinc-500'
                  }`}>
                    {generationCounts.slideshows}
                  </span>
            </button>
        </div>
      </div>
            {isLoadingGenerations && displayedGenerations.length === 0 ? (
              <div className="w-full h-48 rounded-xl border border-gray-100 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm flex items-center justify-center">
                <div className="animate-pulse flex space-x-4 w-3/4">
                  <div className="flex-1 space-y-4 py-1">
                    <div className="h-3 bg-gray-200 dark:bg-zinc-700 rounded w-3/4"></div>
                    <div className="space-y-3">
                      <div className="h-3 bg-gray-200 dark:bg-zinc-700 rounded"></div>
                      <div className="h-3 bg-gray-200 dark:bg-zinc-700 rounded w-5/6"></div>
                    </div>
                  </div>
                </div>
              </div>
            ) : displayedGenerations.length === 0 && !generatingItem ? (
              <div className="w-full h-48 rounded-xl border border-gray-100 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6">
                <p className="text-gray-500 dark:text-zinc-400">No {activeFilter !== 'all' ? activeFilter : ''} generations found.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {displayedGenerations.map((gen) => (
                    <GenerationCard 
                      key={gen.id} 
                      generation={gen} 
                      onClick={() => setSelectedGeneration(gen)}
                      creators={creators} // Pass creators
                      backgrounds={backgrounds} // Pass backgrounds
                    />
                  ))}
                </div>
                {hasMore && (
                  <div className="mt-8 flex justify-center">
                    <button
                      onClick={fetchMoreGenerations}
                      disabled={isLoadingMore}
                      className={`px-6 py-2 rounded-full text-sm font-medium transition-colors duration-200 flex items-center justify-center ${isLoadingMore
                        ? 'bg-gray-200 dark:bg-zinc-700 text-gray-500 dark:text-zinc-400 cursor-not-allowed'
                        : 'bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-200'
                      }`}
                    >
                      {isLoadingMore ? (<> <CircleNotch size={16} className="animate-spin mr-2" /> Loading...</> ) : ( 'Load More' )}
                    </button>
                  </div>
                )}
              </>
            )}
      </section>

      {/* Modals (Delete, Success) */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-zinc-800 p-6 rounded-lg shadow-xl max-w-sm w-full">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-zinc-100">Confirm Deletion</h3>
                <button onClick={handleCloseDeleteModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300">
                  <CloseIcon size={20} />
                </button>
              </div>
              <p className="text-sm text-gray-600 dark:text-zinc-300 mb-6">
                Are you sure you want to delete this generation? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button 
                  onClick={handleCloseDeleteModal}
                  disabled={isDeletingGeneration}
                  className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-zinc-600 hover:bg-gray-50 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-200 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleConfirmDelete}
                  disabled={isDeletingGeneration}
                  className="px-4 py-2 text-sm rounded-md bg-red-600 hover:bg-red-500/90 text-white transition-colors flex items-center justify-center disabled:opacity-50"
                >
                  {isDeletingGeneration ? ( <><CircleNotch size={18} className="animate-spin mr-2" />Deleting...</> ) : ( 'Delete' )}
                </button>
              </div>
            </div>
        </div>
      )}
      {isSuccessModalOpen && (
        <div 
          className="fixed top-5 right-5 z-[100] p-4 max-w-sm w-full transition-all duration-300 ease-in-out"
          style={{ transform: isSuccessModalOpen ? 'translateX(0)' : 'translateX(100%)' }}
        >
            <div 
              className={`rounded-md shadow-lg p-3 flex items-start space-x-3 ${isDarkMode ? 'bg-zinc-800 text-white border border-zinc-700' : 'bg-white text-gray-900 border border-gray-200'}`}
            >
              <div className={`flex-shrink-0 p-1.5 rounded-full ${isDarkMode ? 'bg-green-600/30' : 'bg-green-100'}`}>
                  <svg className={`w-4 h-4 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
              </div>
              <div className="flex-1 pt-0.5">
                <p className="text-sm font-medium">
                  {successModalMessage}
                </p>
              </div>
              <button 
                onClick={handleCloseSuccessModal}
                className={`p-1 rounded-full ${isDarkMode ? 'hover:bg-zinc-700' : 'hover:bg-gray-100'} text-gray-400 dark:text-zinc-500`}
                aria-label="Close notification"
              >
                <CloseIcon size={14} />
              </button>
            </div>
        </div>
      )}

      {/* Edit Popup */}
      {selectedGeneration && (
        <GenerationEditPopup
          generation={selectedGeneration}
          onClose={() => setSelectedGeneration(null)}
          isDarkMode={isDarkMode}
          onScheduleSubmit={handleScheduleGenerationSubmit}
          onShowSuccessNotification={showSuccessNotification}
          creators={creators}
          backgrounds={backgrounds}
          onAssetSaved={refreshLayoutData}
          onGenerationUpdated={(updatedGeneration) => {
            setGenerations(prevGenerations =>
              prevGenerations.map(gen =>
                gen.id === updatedGeneration.id ? updatedGeneration : gen
              )
            );
            // Don't close popup after saving - keep it open for further editing
            // setSelectedGeneration(null);
          }}
          onGenerationDeleted={(deletedId) => {
            setGenerations(prevGenerations =>
              prevGenerations.filter(gen => gen.id !== deletedId)
            );
            setSelectedGeneration(null);
          }}
        />
      )}
    </div>
  );
}

const CustomStyles = () => (
  <style jsx="true">{` 
    @keyframes fade-in-out {
      0% { opacity: 0; }     
      50% { opacity: 1; }     
      100% { opacity: 0; }    
    }
  `}</style>
);

export default function DashboardWithStyles() {
  return (
    <>
      <CustomStyles />
      <Dashboard />
    </>
  );
} 