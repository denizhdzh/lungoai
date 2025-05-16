import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../firebase'; // Import db
import { useOutletContext } from 'react-router-dom';
import { getFunctions, httpsCallable } from "firebase/functions"; // Import functions SDK
// Keep only necessary icons + add Sun/Moon
import { ArrowRight, Sparkle, FileText, Lightning, Question, ChartLine, BookmarkSimple, Plugs, Gear, ImageSquare, FilmSlate, Lightbulb, BookOpen, Fire, ChatText, Translate, Calendar, Info, Sun, Moon, DownloadSimple, Compass, User, ArrowSquareOut, CircleNotch, CalendarBlank, X as CloseIcon, ArrowLeft, Trash, UserPlus, PlusSquare, Slideshow } from '@phosphor-icons/react'; 
// Keep only necessary Firestore functions
import { collection, query, orderBy, getDocs, Timestamp, doc, getDoc, limit, startAfter, deleteDoc, where, updateDoc } from "@firebase/firestore"; // Added doc, getDoc, limit, startAfter, deleteDoc, where, updateDoc
import JSZip from 'jszip'; // <-- Import JSZip
// Remove Link and useNavigate

// --- Plan Data (Simplified, only for mapping Price ID to Name) ---
// Consider importing this from a shared location if used elsewhere
const planPriceMap = {
  "price_1RMqEZDf8kAOBAT3ltD6n2lX": "Basic (Monthly)",
  "price_1RMqGbDf8kAOBAT3vgwkWLr6": "Basic (Yearly)",
  "price_1RMqH7Df8kAOBAT30BGfHv66": "Pro (Monthly)",
  "price_1RMqHMDf8kAOBAT3bCTcdNwq": "Pro (Yearly)",
  "price_1RMqHgDf8kAOBAT3m6kthIND": "Business (Monthly)",
  "price_1RMqI1Df8kAOBAT3Xoy3M7Ho": "Business (Yearly)",
};
// -------------------------------------------------------------------

// Initialize Firebase Functions
const functionsInstance = getFunctions(); // Initialize functions instance once
const createStripePortalSessionCallable = httpsCallable(functionsInstance, 'createStripePortalSession');

// --- NEW: Plan Credit Limits ---
const planCreditLimits = {
  // Basic Plan
  "price_1RMqEZDf8kAOBAT3ltD6n2lX": { images: 15, videos: 10, slideshows: 30 }, // Monthly
  "price_1RMqGbDf8kAOBAT3vgwkWLr6": { images: 15, videos: 10, slideshows: 30 }, // Yearly
  // Pro Plan
  "price_1RMqH7Df8kAOBAT30BGfHv66": { images: 50, videos: 40, slideshows: 100 }, // Monthly
  "price_1RMqHMDf8kAOBAT3bCTcdNwq": { images: 50, videos: 40, slideshows: 100 }, // Yearly
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
    case 202: return 'UGC Photo';
    case 203: return 'Custom Image';
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

// --- Generation Card Component ---
function GenerationCard({ generation, onOpenDeleteModal, isDarkMode, onScheduleSubmit, onShowSuccessNotification, creators, backgrounds, onAssetSaved }) { // Added onShowSuccessNotification
  const videoRef = useRef(null); // NEW: Ref for video element
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [textOpacity, setTextOpacity] = useState(1); // For fade animation of old text overlay (will be removed for new slideshow)

  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [saveActionType, setSaveActionType] = useState(null); // 'creator' or 'background'
  const [isSavingFromGen, setIsSavingFromGen] = useState(false);

  // --- NEW: Schedule Modal State ---
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [selectedScheduleDateTime, setSelectedScheduleDateTime] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);
  // --- END NEW: Schedule Modal State ---

  // --- NEW: Custom Date Picker States ---
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedHour, setSelectedHour] = useState(12);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState('PM');
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [showCalendar, setShowCalendar] = useState(true);
  const [showTimePicker, setShowTimePicker] = useState(false);
  // --- END Custom Date Picker States ---

  // Determine if this generation is already saved as a creator or background
  const isCreatorSaved = creators.some(
    (creator) => creator.sourceGenerationId === generation.id || creator.imageUrl === generation.imageUrl
  );
  const isBackgroundSaved = backgrounds.some(
    (bg) => bg.sourceGenerationId === generation.id || bg.imageUrl === generation.imageUrl
  );

  const handleOpenNameModal = (actionType) => {
    setSaveActionType(actionType);
    setNewItemName('');
    setIsNameModalOpen(true);
  };

  const handleCloseNameModal = () => {
    setIsNameModalOpen(false);
    setSaveActionType(null);
  };

  // --- NEW: Schedule Modal Handlers ---
  const handleOpenScheduleModal = () => {
    // Initialize the date, time and calendar states
    const now = new Date();
    
    // If scheduledAt exists, use it to set initial state
    if (generation.scheduledAt) {
      let scheduleDate;
      if (generation.scheduledAt.toDate) {
        // It's a Firestore timestamp
        scheduleDate = generation.scheduledAt.toDate();
      } else if (!isNaN(new Date(generation.scheduledAt).getTime())) {
        // It's a valid date string/number
        scheduleDate = new Date(generation.scheduledAt);
      } else {
        scheduleDate = now;
      }
      
      setSelectedDate(scheduleDate);
      setCalendarMonth(scheduleDate.getMonth());
      setCalendarYear(scheduleDate.getFullYear());
      
      let hours = scheduleDate.getHours();
      const mins = scheduleDate.getMinutes();
      const period = hours >= 12 ? 'PM' : 'AM';
      
      // Convert to 12-hour format
      hours = hours % 12;
      hours = hours ? hours : 12; // 0 should be 12 in 12-hour format
      
      setSelectedHour(hours);
      setSelectedMinute(mins);
      setSelectedPeriod(period);
      
      // Also set the ISO string for backward compatibility
      setSelectedScheduleDateTime(scheduleDate.toISOString().slice(0, 16));
    } else {
      // Default to now
      setSelectedDate(now);
      setCalendarMonth(now.getMonth());
      setCalendarYear(now.getFullYear());
      
      let hours = now.getHours();
      const mins = now.getMinutes();
      const period = hours >= 12 ? 'PM' : 'AM';
      
      hours = hours % 12;
      hours = hours ? hours : 12;
      
      setSelectedHour(hours);
      setSelectedMinute(mins);
      setSelectedPeriod(period);
      
      // Default ISO string for backward compatibility
      setSelectedScheduleDateTime(now.toISOString().slice(0, 16));
    }
    
    setShowCalendar(true);
    setShowTimePicker(false);
    setIsScheduleModalOpen(true);
  };

  const handleCloseScheduleModal = () => {
    setIsScheduleModalOpen(false);
    setShowCalendar(true);
    setShowTimePicker(false);
  };

  // Handle date selection in custom calendar
  const handleDateSelect = (day) => {
    const newDate = new Date(calendarYear, calendarMonth, day);
    setSelectedDate(newDate);
    
    // Update the ISO string for backward compatibility
    const updatedDate = new Date(
      newDate.getFullYear(),
      newDate.getMonth(),
      newDate.getDate(),
      selectedPeriod === 'PM' ? (selectedHour % 12) + 12 : selectedHour % 12,
      selectedMinute
    );
    setSelectedScheduleDateTime(updatedDate.toISOString().slice(0, 16));
    
    // Automatically switch to time picker after selecting a date
    setShowCalendar(false);
    setShowTimePicker(true);
  };

  // Handle time selection in custom time picker
  const handleTimeUpdate = () => {
    // Convert selected time to 24-hour format
    const hours24 = selectedPeriod === 'PM' ? 
      (selectedHour === 12 ? 12 : selectedHour + 12) : 
      (selectedHour === 12 ? 0 : selectedHour);
    
    // Create a new date object with the selected date and time
    const updatedDate = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      hours24,
      selectedMinute
    );
    
    // Update the ISO string for backward compatibility
    setSelectedScheduleDateTime(updatedDate.toISOString().slice(0, 16));
  };

  // Switch between calendar and time picker
  const toggleCalendarTimePicker = () => {
    setShowCalendar(!showCalendar);
    setShowTimePicker(!showTimePicker);
  };

  // Update time whenever hour, minute, or period changes
  useEffect(() => {
    if (isScheduleModalOpen) {
      handleTimeUpdate();
    }
  }, [selectedHour, selectedMinute, selectedPeriod]);

  const handleConfirmScheduleClick = async () => {
    if (!selectedScheduleDateTime) {
      window.alert("Please select a date and time.");
      return;
    }
    if (!onScheduleSubmit) {
        console.error("onScheduleSubmit prop is not provided to GenerationCard");
        window.alert("Scheduling function not available.");
        return;
    }

    setIsScheduling(true);
    try {
      // Convert local datetime-string to a JavaScript Date object
      const localDate = new Date(selectedScheduleDateTime);
      // The input is already in local time, so this Date object represents local time.
      // Firestore Timestamps are timezone-agnostic (UTC internally).
      // When converting this localDate to a Firestore Timestamp, it will be correctly stored.
      await onScheduleSubmit(generation.id, generation.type, localDate); // Pass JS Date
      // User feedback is handled by the onScheduleSubmit function in Dashboard
      handleCloseScheduleModal();
    } catch (error) {
      console.error("Error scheduling generation:", error);
      window.alert(`Error scheduling: ${error.message || 'Please try again.'}`);
    } finally {
      setIsScheduling(false);
    }
  };
  // --- END NEW: Schedule Modal Handlers ---

  const handleSaveFromGeneration = async () => {
    if (!newItemName.trim()) {
      window.alert("Please enter a name.");
      return;
    }
    setIsSavingFromGen(true);
    const functionName = saveActionType === 'creator' ? 'saveCreatorFromGeneration' : 'saveBackgroundFromGeneration';
    const payload = {
      imageUrl: generation.imageUrl,
      original_generation_data: generation.originalParameters || generation.parameters || {},
      sourceGenerationId: generation.id, // <-- ADDED sourceGenerationId
      sourceImageUrl: generation.imageUrl // <-- ADDED sourceImageUrl (optional, if useful for backend)
    };
    if (saveActionType === 'creator') {
      payload.creator_name = newItemName.trim();
    } else {
      payload.background_name = newItemName.trim();
    }

    try {
      const callableFunc = httpsCallable(functionsInstance, functionName);
      const result = await callableFunc(payload); 
      if (onShowSuccessNotification) {
        onShowSuccessNotification(`${saveActionType === 'creator' ? 'Creator' : 'Background'} "${newItemName.trim()}" saved successfully!`);
      }
      if (result && result.data && result.data.success) {
        // setSavedAssetType(saveActionType); // No longer needed
        if (onAssetSaved) {
          onAssetSaved(); // Call the refresh function passed from Layout
        }
      }
      handleCloseNameModal();
    } catch (error) {
      console.error(`Error saving ${saveActionType}:`, error);
      window.alert(`Error saving ${saveActionType}: ${error.message}`);
    } finally {
      setIsSavingFromGen(false);
    }
  };

  const handleSlideChange = (direction) => {
    // For new slideshows with baked-in images, we just change the index
    // For old slideshows (if any left) or if processedImageUrls is missing, use text fade logic
    const hasProcessedImages = generation.type === 'slideshow' && generation.processedImageUrls && generation.processedImageUrls.length > 0;

    if (hasProcessedImages) {
        setCurrentSlideIndex(prevIndex => {
            let newIndex = prevIndex + direction;
            if (newIndex < 0) newIndex = 0;
            else if (newIndex >= generation.processedImageUrls.length) newIndex = generation.processedImageUrls.length - 1;
            return newIndex;
        });
    } else if (generation.type === 'slideshow' && generation.slideTexts && generation.slideTexts.length > 0) {
      // Legacy text fade logic (should ideally not be needed if all slideshows have processedImageUrls)
      setTextOpacity(0); 
      setTimeout(() => {
        setCurrentSlideIndex(prevIndex => {
          let newIndex = prevIndex + direction;
          if (newIndex < 0) newIndex = 0;
          else if (newIndex >= generation.slideTexts.length) newIndex = generation.slideTexts.length - 1;
          return newIndex;
        });
        setTextOpacity(1); 
      }, 150); 
    }
  };

  // NEW: Handler for video play/pause
  const handleVideoToggle = (e) => {
    e.stopPropagation(); // Prevent click from bubbling up
    if (videoRef.current) {
      if (videoRef.current.paused || videoRef.current.ended) {
        videoRef.current.play().catch(error => {
          console.error("Error attempting to play video:", error);
          // Autoplay restrictions might prevent play, e.g., if tab not active
        });
      } else {
        videoRef.current.pause();
      }
    }
  };

  const canGoPrevious = generation.type === 'slideshow' && currentSlideIndex > 0;
  const canGoNext = 
    generation.type === 'slideshow' && 
    (((generation.processedImageUrls && generation.processedImageUrls.length > 0 && currentSlideIndex < generation.processedImageUrls.length - 1))
    || ((!generation.processedImageUrls && generation.slideTexts && currentSlideIndex < generation.slideTexts.length - 1)));
  
  const numSlides = 
    (generation.type === 'slideshow' && generation.processedImageUrls && generation.processedImageUrls.length > 0) 
        ? generation.processedImageUrls.length 
        : (generation.type === 'slideshow' && generation.slideTexts && generation.slideTexts.length > 0) 
            ? generation.slideTexts.length 
            : 1;

  // Determine if already scheduled
  const isScheduled = generation.scheduledAt;

  // --- Utility functions for calendar ---
  // Get days in a month
  const getDaysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate();
  };

  // Get the day of week for the first day of the month (0 = Sunday, 6 = Saturday)
  const getFirstDayOfMonth = (year, month) => {
    return new Date(year, month, 1).getDay();
  };

  // Generate calendar days
  const generateCalendarDays = () => {
    const daysInMonth = getDaysInMonth(calendarYear, calendarMonth);
    const firstDayOfMonth = getFirstDayOfMonth(calendarYear, calendarMonth);
    
    const days = [];
    
    // Add empty cells for days before the first of the month
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null);
    }
    
    // Add days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    
    return days;
  };

  // Get month name
  const getMonthName = (month) => {
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return monthNames[month];
  };

  // Navigate to previous month
  const goToPrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(calendarYear - 1);
    } else {
      setCalendarMonth(calendarMonth - 1);
    }
  };

  // Navigate to next month
  const goToNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(calendarYear + 1);
    } else {
      setCalendarMonth(calendarMonth + 1);
    }
  };

  // Check if a day is the currently selected date
  const isSelectedDay = (day) => {
    return selectedDate && 
           selectedDate.getDate() === day && 
           selectedDate.getMonth() === calendarMonth && 
           selectedDate.getFullYear() === calendarYear;
  };

  // Check if a day is today
  const isToday = (day) => {
    const today = new Date();
    return today.getDate() === day && 
           today.getMonth() === calendarMonth && 
           today.getFullYear() === calendarYear;
  };

  // --- End NEW utility functions ---

  return (
    <div 
      className="relative rounded-xl overflow-hidden border border-gray-100 dark:border-zinc-800 group shadow-sm hover:shadow-md transition-all duration-300 bg-gray-50 dark:bg-zinc-800"
      style={{ paddingTop: '177.77%' }} // 9:16 aspect ratio
    >
      {/* Background Image Area */} 
      <div className="absolute inset-0 w-full h-full overflow-hidden">
        {generation.type === 'image' && generation.imageUrl && (
          <img 
            src={generation.imageUrl} 
            alt={generation.prompt || 'Generated image'} 
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}
        {/* MODIFIED: Render video if videoUrl exists, regardless of type */} 
        {generation.videoUrl && (
           <video 
            ref={videoRef} // NEW: Assign ref
            src={`${generation.videoUrl}#t=0.1`} 
            className="w-full h-full object-contain bg-black" 
            preload="metadata"
            playsInline
          ></video>
        )}
        
        {/* UPDATED SLIDESHOW RENDERING: Uses processedImageUrls if available */}
        {generation.type === 'slideshow' && generation.processedImageUrls && generation.processedImageUrls.length > 0 ? (
            // New: Display pre-rendered images from processedImageUrls
            <div 
              className="flex h-full transition-transform duration-300 ease-in-out" // Sliding track
              style={{ 
                width: `${numSlides * 100}%`, 
                transform: `translateX(-${(currentSlideIndex / numSlides) * 100}%)` 
              }}
            >
              {generation.processedImageUrls.map((imageUrl, index) => (
                <img
                  key={index} 
                  src={imageUrl}
                  alt={`Slideshow image ${index + 1}`}
                  className="h-full object-cover" 
                  style={{ width: `${100 / numSlides}%` }} 
                />
              ))}
            </div>
        ) : generation.type === 'slideshow' && generation.selectedBackgroundUrl && generation.slideTexts && generation.slideTexts.length > 0 ? (
           // Legacy/Fallback: Display single background with text overlay (if processedImageUrls is missing)
           <div 
              className="flex h-full transition-transform duration-500 ease-in-out" // The sliding track
              style={{ 
                width: `${numSlides * 100}%`, // Track is wide enough for all (repeated) images
                transform: `translateX(-${(currentSlideIndex / numSlides) * 100}%)` // Move track
              }}
            >
              {Array.from({ length: numSlides }).map((_, index) => (
                <img
                  key={index} // Use index as key since images are identical for this visual effect
                  src={generation.selectedBackgroundUrl} // ALWAYS use selectedBackgroundUrl
                  alt={`Slideshow background instance ${index + 1}`}
                  className="h-full object-cover" // Each image instance fills its slot
                  style={{ width: `${100 / numSlides}%` }} // Each instance takes up its portion of the track
                />
              ))}
            </div>
        ) : generation.type === 'slideshow' ? ( 
          // Fallback for slideshow if no selectedBackgroundUrl or no slideTexts
          <div className="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-zinc-700">
            <ImageSquare size={48} className="text-gray-400 dark:text-zinc-500" />
          </div>
        ) : null}
        {/* END UPDATED SLIDESHOW RENDERING */}

      </div> {/* Closing tag for 'absolute inset-0 w-full h-full overflow-hidden' */}

      {/* Slideshow Text Overlay & Navigation (Only for slideshow type) */} 
      {generation.type === 'slideshow' && (
        <>
          {/* Centered Text Overlay - ONLY if processedImageUrls is NOT present (legacy) */}
          {!(generation.processedImageUrls && generation.processedImageUrls.length > 0) && generation.slideTexts && generation.slideTexts.length > 0 && (
            <div className="absolute inset-0 flex items-center justify-center p-4 z-10 pointer-events-none">
              <div 
                className="transition-opacity duration-150 ease-in-out max-w-[80%] pioneering]"
                style={{ opacity: textOpacity }}
              >
                <p 
                  className="text-xl text-white font-bold text-center line-clamp-3"
                  style={{ 
                    textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, -2px 0 0 #000, 2px 0 0 #000, 0 -2px 0 #000, 0 2px 0 #000' 
                  }}
                >
                  {generation.slideTexts[currentSlideIndex]}
                </p>
              </div>
            </div>
          )}

          {/* Navigation Buttons (Visible on hover, conditionally enabled) */} 
          {/* Show navigation if there are processedImageUrls OR legacy slideTexts */} 
          {( (generation.processedImageUrls && generation.processedImageUrls.length > 0) || (generation.slideTexts && generation.slideTexts.length > 0) ) && (
            <div className="absolute inset-0 flex items-center justify-between p-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <button 
                onClick={(e) => { e.stopPropagation(); handleSlideChange(-1); }}
                disabled={!canGoPrevious}
                className={`p-2 bg-black/40 text-white rounded-full backdrop-blur-sm transition-all ${canGoPrevious ? 'hover:bg-black/60' : 'opacity-30 cursor-not-allowed'}`}
                title="Previous Slide"
              >
                <ArrowLeft size={18} weight="bold" />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); handleSlideChange(1); }}
                disabled={!canGoNext}
                className={`p-2 bg-black/40 text-white rounded-full backdrop-blur-sm transition-all ${canGoNext ? 'hover:bg-black/60' : 'opacity-30 cursor-not-allowed'}`}
                title="Next Slide"
              >
                <ArrowRight size={18} weight="bold" /> 
              </button>
            </div>
          )}
        </>
      )}

      {/* General Overlays (Play icon, Download, etc.) - Placed below slideshow specific nav */} 
      {generation.type === 'video' && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer" // Added cursor-pointer
          onClick={handleVideoToggle} // NEW: Added onClick handler
        >
          {/* TODO: Could change icon based on videoRef.current?.paused state */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-white/80"><path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" /></svg>
        </div>
      )}
      {/* MODIFIED: Show ImageSquare overlay for slideshows ONLY IF (processedImageUrls is MISSING AND selectedBackgroundUrl is MISSING) */}
      {generation.type === 'slideshow' && 
        !(generation.processedImageUrls && generation.processedImageUrls.length > 0) && 
        !generation.selectedBackgroundUrl && 
        generation.slideTexts && 
        generation.slideTexts.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
             <ImageSquare size={32} weight="fill" className="text-white/80" />
          </div>
      )}
      
      <div className="absolute top-2 right-2 z-30 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        {/* Download button logic now primarily relies on handleGenerationDownload which checks for processedImageUrls for slideshows */}
        {(generation.type === 'image' || generation.type === 'video' || 
         (generation.type === 'slideshow' && ((generation.processedImageUrls && generation.processedImageUrls.length > 0) || (generation.selectedBackgroundUrl && generation.slideTexts && generation.slideTexts.length > 0))) ) && (
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              handleGenerationDownload(generation);
            }}
            className="p-1.5 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-sm transition-colors"
            title="Download"
          >
            <DownloadSimple size={16} weight="bold" />
          </button>
        )}
        {/* Add as Creator Button - MOVED HERE */}
        {generation.commandCode === 202 && generation.imageUrl && (
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                handleOpenNameModal('creator');
              }}
              disabled={isCreatorSaved} // <-- Use isCreatorSaved
              className={`p-1.5 rounded-full backdrop-blur-sm transition-colors ${
                isCreatorSaved 
                  ? 'bg-green-500/80 text-white cursor-not-allowed' 
                  : 'bg-black/40 hover:bg-black/60 text-white'
              }`}
              title={isCreatorSaved ? "Saved as Creator" : "Save as Creator"}
            >
              {isCreatorSaved ? <User size={16} weight="bold" /> : <UserPlus size={16} weight="bold" />}
            </button>
        )}
        {/* Add as Background Button - MOVED HERE */}
        {generation.commandCode === 201 && generation.imageUrl && (
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                handleOpenNameModal('background');
              }}
              disabled={isBackgroundSaved} // <-- Use isBackgroundSaved
              className={`p-1.5 rounded-full backdrop-blur-sm transition-colors ${
                isBackgroundSaved
                  ? 'bg-green-500/80 text-white cursor-not-allowed'
                  : 'bg-black/40 hover:bg-teal-500/70 text-white'
              }`}
              title={isBackgroundSaved ? "Saved as Background" : "Save as Background"}
            >
              {isBackgroundSaved ? <ImageSquare size={16} weight="bold" /> : <PlusSquare size={16} weight="bold" />}
            </button>
        )}
        {(generation.type === 'video' || generation.type === 'slideshow') && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              handleOpenScheduleModal(); // Call new handler
            }}
            className={`p-1.5 rounded-full backdrop-blur-sm transition-colors ${
              isScheduled 
                ? 'bg-green-500/80 hover:bg-green-600/80 text-white' // Green if scheduled
                : 'bg-black/40 hover:bg-black/60 text-white' // Default
            }`}
            title={isScheduled ? `Scheduled: ${generation.scheduledAt.toDate ? generation.scheduledAt.toDate().toLocaleString() : new Date(generation.scheduledAt).toLocaleString()}` : "Schedule Generation"} // Dynamic title
          >
            <CalendarBlank size={16} weight="bold" />
          </button>
        )}
        <button 
          onClick={(e) => { 
            e.stopPropagation(); 
            onOpenDeleteModal(generation.id);
          }}
          className="p-1.5 bg-red-600/70 hover:bg-red-500/90 text-white rounded-full backdrop-blur-sm transition-colors"
          title="Delete Generation"
        >
          <Trash size={16} weight="bold" />
        </button>
      </div>
      
      {/* REMOVED Save as Creator/Background Buttons from bottom-left */}
      
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none">
         {/* Display title/keywords if NOT a slideshow. For slideshows, text is baked in or (legacy) centered. */}
         {!(generation.type === 'slideshow' && generation.processedImageUrls && generation.processedImageUrls.length > 0) && 
          !(generation.type === 'slideshow' && !(generation.processedImageUrls && generation.processedImageUrls.length > 0) && generation.slideTexts && generation.slideTexts.length > 0) && (
             generation.type === 'video' && generation.hookText ? (
                <p className="text-xs text-white font-medium line-clamp-1" title={generation.hookText}>
                 {generation.hookText}
               </p>
             ) : (
               <p className="text-xs text-white font-medium line-clamp-1" title={getKeywords(generation)}>
                 {getKeywords(generation)}
               </p>
             )
         )}
         
         <div className={`flex items-center justify-between ${ /* Adjust margin based on whether title/text is shown */
            !(generation.type === 'slideshow' && generation.processedImageUrls && generation.processedImageUrls.length > 0) && 
            !(generation.type === 'slideshow' && !(generation.processedImageUrls && generation.processedImageUrls.length > 0) && generation.slideTexts && generation.slideTexts.length > 0)
             ? 'mt-1' : 'mt-0'}`}> 
           <span className="text-[10px] text-zinc-300">
             {generation.timestamp && generation.timestamp instanceof Date 
               ? generation.timestamp.toLocaleDateString() 
               : 'Unknown date'}
           </span>
           <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
             {generation.type === 'slideshow' ? 'Slideshow' : (getFriendlyGenerationType(generation.commandCode) || generation.type || 'unknown')}
           </span>
         </div>
       </div>

      {/* Tailwind Modal for Naming Creator/Background */}
      {isNameModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-300 ease-in-out" onClick={handleCloseNameModal}>
          <div 
            className="rounded-lg overflow-hidden max-w-sm w-full max-h-[80vh] relative"
            onClick={(e) => e.stopPropagation()} 
            style={{ aspectRatio: "9/16" }}
          >
            {/* Image as background */}
            {generation.imageUrl && (
              <div className="absolute inset-0 w-full h-full">
                <img 
                  src={generation.imageUrl} 
                  alt="Selected generation preview" 
                  className="w-full h-full object-cover"
                />
                {/* Gradient overlay for readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
              </div>
            )}
            
            {/* Header - small and minimal on top */}
            <div className="absolute top-0 left-0 right-0 p-3 flex justify-between items-center z-10">
              <h3 className="text-sm font-medium text-white/90 drop-shadow-sm">
                Save as {saveActionType === 'creator' ? 'Creator' : 'Background'}
              </h3>
              <button onClick={handleCloseNameModal} className="p-1 rounded-full bg-black/30 hover:bg-black/50 text-white/90 transition-colors backdrop-blur-sm">
                <CloseIcon size={16} />
              </button>
            </div>
            
            {/* Form at the bottom over the image */}
            <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
              <div className="space-y-4">
                <input 
                  type="text" 
                  id="newItemNameInput"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder={`Enter a name for this ${saveActionType}`}
                  className="w-full px-3 py-2 rounded-md border border-white/20 bg-black/40 backdrop-blur-sm focus:outline-none focus:ring-1 focus:ring-white/30 text-white placeholder-white/60 text-sm"
                  autoFocus
                />
                
                <div className="flex justify-end gap-2">
                  <button 
                    onClick={handleCloseNameModal}
                    className="px-3 py-1.5 text-xs font-medium rounded bg-black/40 hover:bg-black/60 text-white/80 backdrop-blur-sm transition-colors"
                    disabled={isSavingFromGen}
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSaveFromGeneration} 
                    disabled={!newItemName.trim() || isSavingFromGen}
                    className={`px-3 py-1.5 text-xs font-medium rounded flex items-center justify-center backdrop-blur-sm transition-colors 
                                bg-white/20 hover:bg-white/30 text-white
                                ${(!newItemName.trim() || isSavingFromGen) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isSavingFromGen ? (
                      <>
                        <CircleNotch size={14} className="animate-spin mr-1.5" />
                        Saving...
                      </>
                    ) : (
                      'Save'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* END Name Modal */}

      {/* --- NEW: Schedule Modal --- */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 transition-opacity duration-300 ease-in-out" onClick={handleCloseScheduleModal}>
          <div 
            className="rounded-lg overflow-hidden max-w-[280px] w-full bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 shadow-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header - Clean and minimal */}
            <div className="flex justify-between items-center p-3 border-b border-gray-100 dark:border-zinc-800/70">
              <h3 className="text-sm font-medium text-gray-800 dark:text-zinc-200">Schedule Post</h3>
              <button onClick={handleCloseScheduleModal} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 dark:text-zinc-500 transition-colors">
                <CloseIcon size={14} />
              </button>
            </div>
            
            {/* Tabs for Date/Time */}
            <div className="flex border-b border-gray-100 dark:border-zinc-800/70">
              <button
                className={`flex-1 py-2 text-[11px] font-medium transition-colors ${
                  showCalendar ? 'text-black dark:text-white border-b-2 border-black dark:border-white' : 'text-gray-500 dark:text-zinc-400'
                }`}
                onClick={() => {
                  setShowCalendar(true);
                  setShowTimePicker(false);
                }}
              >
                Date
              </button>
              <button
                className={`flex-1 py-2 text-[11px] font-medium transition-colors ${
                  showTimePicker ? 'text-black dark:text-white border-b-2 border-black dark:border-white' : 'text-gray-500 dark:text-zinc-400'
                }`}
                onClick={() => {
                  setShowCalendar(false);
                  setShowTimePicker(true);
                }}
              >
                Time
              </button>
            </div>

            {/* Date Picker - Custom Calendar */}
            {showCalendar && (
              <div className="p-3">
                {/* Month and Year Navigation */}
                <div className="flex justify-between items-center mb-3">
                  <button 
                    onClick={goToPrevMonth}
                    className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 dark:text-zinc-400"
                  >
                    <ArrowLeft size={14} />
                  </button>
                  <span className="text-sm font-medium text-gray-800 dark:text-zinc-200">
                    {getMonthName(calendarMonth)} {calendarYear}
                  </span>
                  <button 
                    onClick={goToNextMonth}
                    className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 dark:text-zinc-400"
                  >
                    <ArrowRight size={14} />
                  </button>
                </div>
                
                {/* Day of Week Headers */}
                <div className="grid grid-cols-7 mb-1">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                    <div key={index} className="h-6 flex items-center justify-center">
                      <span className="text-[10px] font-medium text-gray-400 dark:text-zinc-500">{day}</span>
                    </div>
                  ))}
                </div>
                
                {/* Calendar Days */}
                <div className="grid grid-cols-7 gap-1">
                  {generateCalendarDays().map((day, index) => (
                    <div key={index} className="h-7 flex items-center justify-center">
                      {day !== null ? (
                        <button
                          onClick={() => handleDateSelect(day)}
                          className={`w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-medium transition-colors ${
                            isSelectedDay(day) 
                              ? 'bg-black dark:bg-white text-white dark:text-black'
                              : isToday(day)
                                ? 'bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-zinc-200'
                                : 'hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-800 dark:text-zinc-200'
                          }`}
                        >
                          {day}
                        </button>
                      ) : (
                        <span></span> // Empty cell
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Time Picker - Custom */}
            {showTimePicker && (
              <div className="p-4">
                <div className="flex justify-center items-center space-x-1">
                  {/* Hour Selector */}
                  <div className="relative">
                    <div className="flex flex-col items-center">
                      <button
                        onClick={() => setSelectedHour(prev => (prev === 12 ? 1 : prev + 1))}
                        className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 dark:text-zinc-400"
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none">
                          <path d="M18 15l-6-6-6 6" />
                        </svg>
                      </button>
                      <div className="w-12 h-10 flex items-center justify-center bg-gray-50 dark:bg-zinc-800 rounded text-base font-medium text-gray-800 dark:text-zinc-200 my-1">
                        {selectedHour.toString().padStart(2, '0')}
                      </div>
                      <button
                        onClick={() => setSelectedHour(prev => (prev === 1 ? 12 : prev - 1))}
                        className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 dark:text-zinc-400"
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none">
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  
                  <span className="text-xl text-gray-500 dark:text-zinc-400">:</span>
                  
                  {/* Minute Selector */}
                  <div className="relative">
                    <div className="flex flex-col items-center">
                      <button
                        onClick={() => setSelectedMinute(prev => (prev === 59 ? 0 : prev + 1))}
                        className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 dark:text-zinc-400"
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none">
                          <path d="M18 15l-6-6-6 6" />
                        </svg>
                      </button>
                      <div className="w-12 h-10 flex items-center justify-center bg-gray-50 dark:bg-zinc-800 rounded text-base font-medium text-gray-800 dark:text-zinc-200 my-1">
                        {selectedMinute.toString().padStart(2, '0')}
                      </div>
                      <button
                        onClick={() => setSelectedMinute(prev => (prev === 0 ? 59 : prev - 1))}
                        className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 dark:text-zinc-400"
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none">
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  
                  {/* AM/PM Selector */}
                  <div className="flex flex-col ml-2">
                    <button
                      onClick={() => setSelectedPeriod('AM')}
                      className={`px-2 py-1 mb-1 rounded text-[11px] font-medium ${
                        selectedPeriod === 'AM' 
                          ? 'bg-black dark:bg-white text-white dark:text-black' 
                          : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
                      }`}
                    >
                      AM
                    </button>
                    <button
                      onClick={() => setSelectedPeriod('PM')}
                      className={`px-2 py-1 rounded text-[11px] font-medium ${
                        selectedPeriod === 'PM' 
                          ? 'bg-black dark:bg-white text-white dark:text-black' 
                          : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
                      }`}
                    >
                      PM
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Selected Date & Time Display */}
            <div className="px-3 py-2 border-t border-gray-100 dark:border-zinc-800/70 bg-gray-50 dark:bg-zinc-800/70">
              <div className="flex items-center justify-center text-xs text-gray-600 dark:text-zinc-300">
                <CalendarBlank size={12} className="mr-1.5" />
                <span>
                  {selectedDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
                <span className="mx-1">•</span>
                <span>
                  {`${selectedHour}:${selectedMinute.toString().padStart(2, '0')} ${selectedPeriod}`}
                </span>
              </div>
            </div>
            
            {/* Footer with buttons */}
            <div className="flex justify-end gap-2 p-3 border-t border-gray-100 dark:border-zinc-800/70 bg-white dark:bg-zinc-900">
              <button 
                onClick={handleCloseScheduleModal}
                className="px-3 py-1.5 text-[11px] font-medium rounded transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-600 dark:text-zinc-400"
                disabled={isScheduling}
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmScheduleClick} 
                disabled={isScheduling}
                className={`px-3 py-1.5 text-[11px] font-medium rounded flex items-center justify-center transition-colors 
                          bg-black dark:bg-white text-white dark:text-black ${isScheduling ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isScheduling ? (
                  <>
                    <CircleNotch size={10} className="animate-spin mr-1.5" />
                    <span>Scheduling...</span>
                  </>
                ) : (
                  'Confirm'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* --- END NEW: Schedule Modal --- */}
    </div>
  );
}
// --- End Generation Card Component ---

function Dashboard() {
  const user = auth.currentUser;
  // Remove isDarkMode state, get from context
  const [generations, setGenerations] = useState([]); // State for generations
  const [isLoadingGenerations, setIsLoadingGenerations] = useState(true); // Loading state
  // Remove plan state if not used elsewhere in Dashboard
  // Remove isChatInputVisible state
  // Remove navigate hook

  // State for credits - Threshold will be fetched from Firebase
  const [imageCredits, setImageCredits] = useState({ used: 0, total: defaultCreditValues.images }); 
  const [videoCredits, setVideoCredits] = useState({ used: 0, total: defaultCreditValues.videos }); 
  const [slideshowCredits, setSlideshowCredits] = useState({ used: 0, total: defaultCreditValues.slideshows }); 

  // --- NEW Subscription State ---
  const [userSubscription, setUserSubscription] = useState(null);
  const [isFetchingSubscription, setIsFetchingSubscription] = useState(true); // Start as true
  // --- End Subscription State ---

  // --- NEW Portal State ---
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState(null);
  // --- End Portal State ---

  // --- Get data from Layout context --- 
  const {
    dashboardRefreshKey,
    generatingItem,
    pageTitle,
    pageSubtitle,
    isDarkMode,
    toggleDarkMode,
    navigate, // Get navigate from context
    notifyGenerationComplete, // Added notifyGenerationComplete from context
    refreshLayoutData, // This is Layout's own data refresh function
    refreshDashboardGenerations, // ADDED: This is the function to refresh Dashboard's generations
    user: contextUser, // Get user from context, aliased to avoid conflict with local `user`
    creators, // <-- Destructure creators
    backgrounds, // <-- Destructure backgrounds
    products // Destructure products if needed by Dashboard directly, or just pass through
  } = useOutletContext() || {
    // Provide default values in case context is not available
    dashboardRefreshKey: 0,
    generatingItem: null,
    pageTitle: 'Dashboard',
    pageSubtitle: 'Overview',
    isDarkMode: false,
    toggleDarkMode: () => {},
    navigate: () => {},
    notifyGenerationComplete: () => {},
    refreshLayoutData: () => {},
    refreshDashboardGenerations: () => {}, 
    user: null,
    creators: [], // <-- Default for creators
    backgrounds: [], // <-- Default for backgrounds
    products: [] // <-- Default for products
  };

  // --- Animated Values ---
  const animatedImageUsed = usePercentageAnimation(imageCredits.used, 800); // Animate 'used' credits
  const animatedVideoUsed = usePercentageAnimation(videoCredits.used, 800); // Animate 'used' credits
  const animatedSlideshowUsed = usePercentageAnimation(slideshowCredits.used, 800); // ADDED Animation for Slideshow Credits

  // --- Pagination State ---
  // const [lastVisible, setLastVisible] = useState(null); // Stores the last document snapshot for pagination - REMOVED
  const [lastTimestampForPagination, setLastTimestampForPagination] = useState(null); // Store the timestamp of the last fetched item
  const [hasMore, setHasMore] = useState(true); // Tracks if there are more generations to load
  const [isLoadingMore, setIsLoadingMore] = useState(false); // Tracks loading state for subsequent fetches

  // --- NEW: Delete Confirmation Modal --- (Styling can be improved later)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [generationToDeleteId, setGenerationToDeleteId] = useState(null);
  const [isDeletingGeneration, setIsDeletingGeneration] = useState(false); // For loading state on delete button in modal

  // --- NEW: State for Image/Slideshow Polling Interval --- 
  const [imagePollingIntervalId, setImagePollingIntervalId] = useState(null);
  // --- END NEW State ---

  // --- NEW: Success Modal State ---
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [successModalMessage, setSuccessModalMessage] = useState('');
  // --- END NEW: Success Modal State ---

  // --- NEW: Success Modal Handlers ---
  const showSuccessNotification = (message) => {
    setSuccessModalMessage(message);
    setIsSuccessModalOpen(true);
    // Optional: Auto-close after a few seconds
    setTimeout(() => {
        if (setIsSuccessModalOpen) { // Check if component is still mounted / state updater exists
            setIsSuccessModalOpen(false);
        }
        // No need to clear message here if modal is simply hidden
    }, 3000);
  };

  const handleCloseSuccessModal = () => {
    setIsSuccessModalOpen(false);
    // setSuccessModalMessage(''); // Clear message when explicitly closed or on timeout
  };
  // --- END NEW: Success Modal Handlers ---

  // --- Fetch Generations, Credit Thresholds, and Subscription Data --- 
  useEffect(() => {
    if (!user) {
      setIsLoadingGenerations(false);
      setIsFetchingSubscription(false); // Stop fetching if no user
      return; // Exit if no user
    }
    console.log(`[Dashboard] useEffect for user/dashboardRefreshKey fired. Key: ${dashboardRefreshKey}, User: ${user.uid}`);

    // Fetch Generations (NEW STRATEGY: Fetch from both collections)
    const fetchGenerations = async () => {
      console.log(`[Dashboard] fetchGenerations starting...`);
      setIsLoadingGenerations(true);
      setHasMore(true); // Assume more initially
      setLastTimestampForPagination(null); // Reset pagination timestamp
      const fetchLimit = 9;

      try {
        // 1. Define queries for both collections
        const generationsColRef = collection(db, 'users', user.uid, 'generations');
        const generationsQuery = query(
          generationsColRef,
          orderBy('timestamp', 'desc'),
          limit(fetchLimit)
        );

        const tiktokPostsColRef = collection(db, 'users', user.uid, 'tiktok-posts');
        // *** ASSUMPTION: tiktok-posts has a 'timestamp' field for ordering ***
        // *** NOTE: Requires a descending index on 'timestamp' in 'tiktok-posts' ***
        const tiktokPostsQuery = query(
          tiktokPostsColRef,
          orderBy('timestamp', 'desc'),
          limit(fetchLimit)
        );

        // 2. Execute queries concurrently
        const [generationsSnapshots, tiktokPostsSnapshots] = await Promise.all([
          getDocs(generationsQuery),
          getDocs(tiktokPostsQuery)
        ]);

        // 3. Process results from 'generations'
        const processedGenerations = generationsSnapshots.docs.map(docSnapshot => {
          const data = docSnapshot.data();
          const timestamp = data.timestamp instanceof Timestamp
            ? data.timestamp.toDate()
            : (data.timestamp ? new Date(data.timestamp) : new Date());
          return { id: docSnapshot.id, ...data, timestamp };
          // NOTE: Removed the previous nested lookup logic here
        });

        // 4. Process results from 'tiktok-posts'
        const processedTiktokPosts = tiktokPostsSnapshots.docs.map(docSnapshot => {
          const data = docSnapshot.data();
          const timestamp = data.timestamp instanceof Timestamp
            ? data.timestamp.toDate()
            : (data.timestamp ? new Date(data.timestamp) : new Date()); // Assuming timestamp exists
          // Add type: 'video' and ensure essential fields for GenerationCard exist
          return {
            id: docSnapshot.id,
            ...data, // Spread existing data like videoUrl, etc.
            timestamp,
            type: 'video' // Explicitly set type for rendering
          };
        }).filter(post => post.videoUrl && typeof post.videoUrl === 'string' && post.videoUrl.trim() !== ''); // ADDED: Filter out posts without a valid videoUrl

        // 5. Combine, Sort, and Limit
        const combinedItems = [...processedGenerations, ...processedTiktokPosts];
        combinedItems.sort((a, b) => b.timestamp - a.timestamp); // Sort descending by date

        const finalItems = combinedItems.slice(0, fetchLimit);

        // 6. Update State
        console.log(`[Dashboard] fetchGenerations - finalItems to be set (first 3 IDs):`, finalItems.slice(0,3).map(item => ({id: item.id, type: item.type, timestamp: item.timestamp})));
        // For more detail on a specific ID if testing:
        // const testId = "YOUR_EXPECTED_IMAGE_ID_HERE"; 
        // console.log(`[Dashboard] fetchGenerations - specific item check (${testId}):`, finalItems.find(item => item.id === testId));
        setGenerations(finalItems);

        // 7. Update Pagination State
        if (finalItems.length > 0) {
          // Store the actual Firestore Timestamp object if possible, otherwise JS Date
          const lastItem = finalItems[finalItems.length - 1];
          const originalDoc = [...generationsSnapshots.docs, ...tiktokPostsSnapshots.docs].find(d => d.id === lastItem.id);
          setLastTimestampForPagination(originalDoc?.data()?.timestamp || lastItem.timestamp); // Prefer Firestore timestamp
        } else {
          setLastTimestampForPagination(null);
        }

        // 8. Update hasMore (Simple check for now)
        setHasMore(finalItems.length === fetchLimit);

      } catch (error) {
        console.error("Error fetching combined generations and posts:", error);
        // Consider setting a specific error state to show the user
        setHasMore(false); // Assume no more on error
      } finally {
        setIsLoadingGenerations(false);
      }
    };

    // Fetch Credit Settings from user document (fetches USED credits)
    const fetchCreditSettings = async () => {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
          const userData = docSnap.data();
          const usedImage = userData.image_credit ?? 0; 
          const usedVideo = userData.video_credit ?? 0;
          const usedSlideshow = userData.slideshow_credit ?? 0; // ADDED Slideshow Credits
          
          // Update only the 'used' part of the state
          setImageCredits(prev => ({ ...prev, used: usedImage }));
          setVideoCredits(prev => ({ ...prev, used: usedVideo }));
          setSlideshowCredits(prev => ({ ...prev, used: usedSlideshow })); // ADDED Slideshow Credits
        } else {
          console.log("User document not found, using default used credits (0).");
          setImageCredits(prev => ({ ...prev, used: 0 }));
          setVideoCredits(prev => ({ ...prev, used: 0 }));
          setSlideshowCredits(prev => ({ ...prev, used: 0 })); // ADDED Slideshow Credits
        }
      } catch (error) {
        console.error("Error fetching credit settings:", error);
        setImageCredits(prev => ({ ...prev, used: 0 }));
        setVideoCredits(prev => ({ ...prev, used: 0 }));
        setSlideshowCredits(prev => ({ ...prev, used: 0 })); // ADDED Slideshow Credits
      }
    };

    // --- NEW: Fetch Subscription Data --- 
    const fetchSubscriptionData = async () => {
      setIsFetchingSubscription(true);
      try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
              const data = userDocSnap.data();
              const currentSubscription = {
                  stripeCustomerId: data.stripeCustomerId || null,
                  stripePriceId: data.stripePriceId || null,
                  subscriptionStatus: data.subscriptionStatus || null,
              };
              setUserSubscription(currentSubscription);
              console.log("[Dashboard] Fetched subscription data:", { status: data.subscriptionStatus, priceId: data.stripePriceId });

              // Determine total credits based on plan
              const planLimits = planCreditLimits[currentSubscription.stripePriceId] || defaultCreditValues; // MODIFIED FALLBACK
              setImageCredits(prev => ({ ...prev, total: planLimits.images }));
              setVideoCredits(prev => ({ ...prev, total: planLimits.videos }));
              setSlideshowCredits(prev => ({ ...prev, total: planLimits.slideshows })); 
          } else {
              console.log("[Dashboard] User document not found, assuming no subscription (using 0 credit limits)."); // Log message updated
              setUserSubscription(null); // No document, no subscription
              // Set totals to default (0) if no document
              setImageCredits(prev => ({ ...prev, total: defaultCreditValues.images }));
              setVideoCredits(prev => ({ ...prev, total: defaultCreditValues.videos }));
              setSlideshowCredits(prev => ({ ...prev, total: defaultCreditValues.slideshows })); 
          }
      } catch (error) {
          console.error("[Dashboard] Error fetching user subscription data:", error);
          setUserSubscription(null); // Set to null on error
          // Set totals to default (0) on error
          setImageCredits(prev => ({ ...prev, total: defaultCreditValues.images }));
          setVideoCredits(prev => ({ ...prev, total: defaultCreditValues.videos }));
          setSlideshowCredits(prev => ({ ...prev, total: defaultCreditValues.slideshows })); 
      } finally {
          setIsFetchingSubscription(false);
      }
    };

    // Call all fetches
    // Fetch subscription first to set totals, then credits for used amounts
    // Order matters if fetchCreditSettings depends on totals from subscription,
    // but here we update `used` and `total` separately.
    // For a more robust approach, you might chain them or use a combined state update.
    (async () => {
      try {
        await fetchSubscriptionData(); // Wait for subscription to set totals
        await fetchCreditSettings();   // Then fetch used credits
        await fetchGenerations();      // Now, fetch generations
      } catch (error) {
        console.error("Error during dashboard data fetch sequence:", error);
        // Ensure loading states are reset if the sequence fails
        setIsLoadingGenerations(false);
        setIsFetchingSubscription(false);
      }
    })();

  }, [user, dashboardRefreshKey]); // Re-run if user changes or dashboard is refreshed

  // --- NEW: useEffect for Image/Slideshow Generation Polling --- 
  useEffect(() => {
    // Removed: useOutletContext call from here

    // Capture the generatingItem for this specific execution of the useEffect hook.
    // This `itemToPoll` will be stable within the setInterval callback's closure.
    const itemToPoll = generatingItem;

    const shouldPollItem = itemToPoll &&
      contextUser && // Use contextUser from top-level scope
      (itemToPoll.type === 'image' || itemToPoll.type === 'slideshow') &&
      (itemToPoll.status === 'generating_direct' || itemToPoll.status === 'generating_slideshow' || itemToPoll.status === 'generating_firestore') &&
      itemToPoll.firestoreDocId;

    if (shouldPollItem && imagePollingIntervalId === null) {
      console.log(`[Dashboard Poll] Starting polling for type: ${itemToPoll.type}, ID: ${itemToPoll.firestoreDocId}`);
      
      const intervalId = setInterval(async () => {
        // This interval is for `itemToPoll`.
        // Basic check: If `itemToPoll` itself is invalid or contextUser is lost, stop this interval.
        if (!itemToPoll || !itemToPoll.firestoreDocId || !contextUser) {
          console.log('[Dashboard Poll] Interval stopping: itemToPoll or contextUser became invalid.', itemToPoll);
          clearInterval(intervalId); // Stop this specific interval instance.
          return;
        }

        try {
          const docRef = doc(db, 'users', contextUser.uid, 'generations', itemToPoll.firestoreDocId);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            let isReady = false;
            let itemName = 'item';

            if (itemToPoll.type === 'image' && data.imageUrl) {
              isReady = true;
              itemName = 'image';
            } else if (itemToPoll.type === 'slideshow' && data.processedImageUrls && data.processedImageUrls.length > 0 && data.processedImageUrls.every(url => typeof url === 'string' && url.startsWith('http'))) {
              isReady = true;
              itemName = 'slideshow';
            }

            if (isReady) {
              console.log(`[Dashboard Poll] ${itemName} (ID: ${itemToPoll.firestoreDocId}) is ready.`);
              clearInterval(intervalId); // Stop this specific interval instance as its job is done.
              // setImagePollingIntervalId(null); // Let the useEffect cleanup or next state change handle this.
              
              if (notifyGenerationComplete) {
                notifyGenerationComplete(itemToPoll.type, itemToPoll.firestoreDocId); 
              }
              // refreshDashboardGenerations is now called by notifyGenerationComplete
            } else {
              console.log(`[Dashboard Poll] ${itemToPoll.type} (ID: ${itemToPoll.firestoreDocId}) not ready yet. Data:`, data);
            }
          } else {
            console.warn(`[Dashboard Poll] Document ${itemToPoll.firestoreDocId} not found. This interval for ${itemToPoll.type} will stop.`);
            clearInterval(intervalId); // Stop this interval if document is not found.
          }
        } catch (error) {
          console.error(`[Dashboard Poll] Error fetching status for ${itemToPoll.type} ID ${itemToPoll.firestoreDocId}:`, error);
          // clearInterval(intervalId); // Optionally stop on error, or let it retry.
        }
      }, 7000); // Poll every 7 seconds

      setImagePollingIntervalId(intervalId);
    }

    // Cleanup function: This is crucial. It runs when `generatingItem` (from context) changes,
    // or when the component unmounts.
    return () => {
      if (imagePollingIntervalId !== null) {
        console.log('[Dashboard Poll] useEffect cleanup: Clearing interval ID:', imagePollingIntervalId);
        clearInterval(imagePollingIntervalId);
        setImagePollingIntervalId(null); // Reset state after clearing.
      }
    };
  }, [generatingItem, imagePollingIntervalId, contextUser, notifyGenerationComplete, refreshDashboardGenerations]); // MODIFIED: Added refreshDashboardGenerations to dependencies
  // --- END NEW Polling useEffect ---

  // --- Fetch More Generations (Pagination) --- TODO: UPDATE THIS FUNCTION
  const fetchMoreGenerations = async () => {
    // if (!user || !lastVisible || !hasMore) return; // Exit conditions - NEEDS UPDATE
    if (!user || !lastTimestampForPagination || !hasMore) {
        console.log("Fetch More: Conditions not met", { user: !!user, lastTimestampForPagination: !!lastTimestampForPagination, hasMore });
        return;
    }

    console.log("Fetch More: Triggered with last timestamp:", lastTimestampForPagination);
    setIsLoadingMore(true);
    const fetchLimit = 9;

    try {
      // --- THIS LOGIC NEEDS TO BE UPDATED to match the new combined fetch strategy ---
      // --- Placeholder: Keeping old logic temporarily to avoid breaking entirely ---
      // --- but it will only fetch from 'generations' and is INCORRECT --- 
      console.warn("fetchMoreGenerations logic is outdated and needs replacement!");

      const generationsColRef = collection(db, 'users', user.uid, 'generations');
      // Query starting after the last visible document - NEEDS UPDATE TO USE TIMESTAMP
      const nextBatchQuery = query(
        generationsColRef,
        orderBy('timestamp', 'desc'),
        // startAfter(lastVisible), // OLD
        startAfter(lastTimestampForPagination), // TENTATIVE: Using timestamp directly
        limit(fetchLimit)
      );

      const documentSnapshots = await getDocs(nextBatchQuery);

      const resolvedNewGenerations = documentSnapshots.docs.map(docSnapshot => { // Simplified processing
        const data = docSnapshot.data();
        const id = docSnapshot.id;
        const timestamp = data.timestamp instanceof Timestamp
          ? data.timestamp.toDate()
          : (data.timestamp ? new Date(data.timestamp) : new Date());
        return { id, ...data, timestamp };
        // NOTE: This is missing the tiktok-posts fetch and merge!
      });

      console.log("Fetch More: Fetched", resolvedNewGenerations.length, "new items (incomplete logic)");

      // Append new generations to the existing list
      setGenerations(prevGenerations => [...prevGenerations, ...resolvedNewGenerations]);

      // Update the last visible document/timestamp - NEEDS UPDATE
      if (resolvedNewGenerations.length > 0) {
        const lastItem = resolvedNewGenerations[resolvedNewGenerations.length - 1];
        const originalDoc = documentSnapshots.docs.find(d => d.id === lastItem.id);
        setLastTimestampForPagination(originalDoc?.data()?.timestamp || lastItem.timestamp);
      } else {
         // If no new items fetched, maybe set hasMore to false?
      }

      // Check if there are still more documents - NEEDS UPDATE
      setHasMore(resolvedNewGenerations.length === fetchLimit);

    } catch (error) {
      console.error("Error fetching more generations (incomplete logic):", error);
      setHasMore(false); // Assume no more on error
    } finally {
      setIsLoadingMore(false);
    }
  };

  // --- Effect to Scroll to Top on Generation Start ---
  useEffect(() => {
    if (generatingItem) {
      console.log('Generation started, scrolling to top...');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [generatingItem]);
  // --- End Scroll Effect ---

  // --- Loading Card Component ---
  const LoadingGenerationCard = ({ itemType }) => (
    <div 
      className="relative rounded-xl overflow-hidden border border-gray-100 dark:border-zinc-800 group shadow-sm bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm flex items-center justify-center"
      style={{ paddingTop: '150%' }}
    >
      <div className="absolute inset-0 flex items-center justify-center p-1">
         <div className="relative aspect-[9/16] w-full h-full rounded-lg overflow-hidden">
           <div className="absolute inset-0 p-1 grid grid-cols-10 gap-[1px]">
             {Array.from({ length: 180 }).map((_, i) => (
               <div 
                 key={i} 
                 className="w-full aspect-square rounded-md bg-gradient-to-br from-gray-100 to-gray-200 dark:from-zinc-800 dark:to-zinc-900"
                 style={{ 
                   animation: `fade-in-out 3s infinite ease-in-out ${Math.random() * 3}s`, 
                   animationFillMode: 'backwards',
                 }}
               />
             ))}
           </div>
         </div>
      </div>

      <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 text-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-sm rounded-xl">
         <p className="text-sm font-medium text-white drop-shadow-md">
           {itemType === 'video' ? 'Video' : (itemType || 'Content')} generation in progress...
         </p>
      </div>
    </div>
  );

  // --- NEW: Handle Manage Billing Button Click (Copied from Settings.jsx) ---
  const handleManageBilling = async () => {
     if (!userSubscription?.stripeCustomerId) {
         setPortalError("No active billing account found. Subscribe to a plan first.");
         return;
     }
     setIsPortalLoading(true);
     setPortalError(null);
     try {
         console.log("[Dashboard] Calling createStripePortalSessionCallable...");
         const result = await createStripePortalSessionCallable(); // Use the callable reference
         const portalUrl = result?.data?.url;
         if (portalUrl) {
             console.log("[Dashboard] Redirecting to Stripe Portal:", portalUrl);
             window.location.href = portalUrl;
             // No need to set loading false if redirect happens
         } else {
             throw new Error("Could not retrieve billing portal URL.");
         }
     } catch (error) {
         console.error("[Dashboard] Error creating Stripe Portal session:", error);
         const message = error.message || "An unexpected error occurred.";
         setPortalError(`Failed to open billing portal: ${message}`);
         setIsPortalLoading(false); // Set loading false on error
     } 
     // No finally block needed here as loading is handled in success/error cases
  };
 // --- End Handle Manage Billing ---

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
      // Find the generation object to check its type
      const generationToDelete = generations.find(gen => gen.id === generationToDeleteId);

      if (!generationToDelete) {
        throw new Error("Generation to delete not found in state.");
      }

      // Determine the correct collection path based on the type
      const collectionPath = generationToDelete.type === 'video' ? 'tiktok-posts' : 'generations';
      const genRef = doc(db, 'users', user.uid, collectionPath, generationToDeleteId);
      
      console.log(`Attempting to delete document with ID ${generationToDeleteId} from collection ${collectionPath}`);

      await deleteDoc(genRef);
      console.log('Generation deleted successfully:', generationToDeleteId);
      // Refresh generations list
      setGenerations(prevGenerations => prevGenerations.filter(gen => gen.id !== generationToDeleteId));
      handleCloseDeleteModal();
    } catch (error) {
      console.error('Error deleting generation:', error);
      window.alert("Error deleting generation. Please try again."); // User feedback
      // TODO: Show user-friendly error message in the modal or as a toast
    } finally {
      setIsDeletingGeneration(false);
    }
  };

  // --- NEW: Handle Schedule Generation Submit ---
  const handleScheduleGenerationSubmit = async (generationId, generationType, scheduledDateTime) => {
    if (!user || !generationId || !scheduledDateTime) {
      window.alert("Missing information for scheduling.");
      console.error("Missing user, generationId, or scheduledDateTime for scheduling.");
      throw new Error("Missing information for scheduling."); // Throw to be caught by GenerationCard
    }

    // Convert JS Date to Firestore Timestamp
    const scheduledTimestamp = Timestamp.fromDate(scheduledDateTime);

    const collectionName = generationType === 'video' ? 'tiktok-posts' : 'generations';
    const docRef = doc(db, 'users', user.uid, collectionName, generationId);

    console.log(`Attempting to schedule generation ${generationId} in ${collectionName} to ${scheduledTimestamp.toDate().toLocaleString()}`);

    try {
      await updateDoc(docRef, {
        scheduledAt: scheduledTimestamp,
        // Potentially add other fields like:
        // scheduleStatus: 'pending' 
      });
      console.log(`Generation ${generationId} scheduled successfully.`);
      // window.alert("Generation scheduled successfully!");
      showSuccessNotification("Generation scheduled successfully!");
      refreshDashboardGenerations();
    } catch (error) {
      console.error("Error updating document for scheduling:", error);
      window.alert(`Failed to schedule generation: ${error.message}`);
      throw error; // Re-throw to be caught by GenerationCard if needed
    }
  };
  // --- END NEW: Handle Schedule Generation Submit ---

  console.log(`[Dashboard] Rendering. Context generatingItem:`, generatingItem, `Local generations state (first 3 IDs):`, generations.slice(0,3).map(g => ({id: g.id, type: g.type})));

  return (
    <div className="max-w-6xl mx-auto">
      
      {/* --- REMOVE DUPLICATE Fixed Header Area --- */}
      {/* 
      <header className="mb-8 flex justify-between items-start"> 
        <div> ... title ... </div>
        <div> ... buttons ... </div>
      </header>
      */}
      {/* --- End REMOVED Header Area --- */}

      {/* Informational Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {/* Image Credits Card */}
        <div className="p-4 border border-gray-100 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900/70 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-700 dark:text-zinc-300">Image Credits</span>
            <span className="p-1.5 flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300">
              <ImageSquare size={14} weight="bold" /> {/* CHANGED ICON HERE */}
            </span>
          </div>
          
          <div className="mb-3"> {/* Add margin below the number */} 
             <span className="font-medium text-2xl text-gray-800 dark:text-zinc-200"> {/* Increased font size */} 
               {Math.round(animatedImageUsed)}
               <span className="text-lg text-gray-500 dark:text-zinc-400">/{imageCredits.total}</span> {/* Adjusted size & dynamic total */} 
             </span>
          </div>

          {/* Segmented bars, distributed across the container width */}
          <div className="flex items-center justify-between w-full mb-2">
            {Array.from({ length: 30 }).map((_, i) => { 
              const filledPercentage = imageCredits.total > 0 ? (imageCredits.used / imageCredits.total) * 100 : 0;
              const filledBars = Math.floor((filledPercentage / 100) * 30);
              return (
                <div 
                  key={i} 
                  className={`h-4 w-1 rounded-sm ${i < filledBars ? 'bg-black dark:bg-white' : 'bg-gray-300 dark:bg-zinc-700'}`}
                ></div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-gray-500 dark:text-zinc-500">low</span>
            <span className="text-[10px] text-gray-500 dark:text-zinc-500">full</span>
          </div>
        </div>

        {/* Video Credits Card */}
        <div className="p-4 border border-gray-100 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900/70 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-700 dark:text-zinc-300">Video Credits</span>
            <span className="p-1.5 flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300">
              <FilmSlate size={14} weight="bold" /> {/* CHANGED ICON HERE */}
            </span>
          </div>
          
          <div className="mb-3"> {/* Add margin below the number */} 
             <span className="font-medium text-2xl text-gray-800 dark:text-zinc-200"> {/* Increased font size */} 
               {Math.round(animatedVideoUsed)}
               <span className="text-lg text-gray-500 dark:text-zinc-400">/{videoCredits.total}</span> {/* Adjusted size & dynamic total */} 
             </span>
          </div>

          {/* Segmented bars, distributed across the container width */}
          <div className="flex items-center justify-between w-full mb-2">
            {Array.from({ length: 30 }).map((_, i) => { 
              const filledPercentage = videoCredits.total > 0 ? (videoCredits.used / videoCredits.total) * 100 : 0;
              const filledBars = Math.floor((filledPercentage / 100) * 30);
              return (
                <div 
                  key={i} 
                  className={`h-4 w-1 rounded-sm ${i < filledBars ? 'bg-black dark:bg-white' : 'bg-gray-300 dark:bg-zinc-700'}`}
                ></div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-gray-500 dark:text-zinc-500">low</span>
            <span className="text-[10px] text-gray-500 dark:text-zinc-500">full</span>
          </div>
        </div>
        
        {/* Slideshow Credits Card (Replacing Daily Tip) */}
        <div className="p-4 border border-gray-100 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900/70 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-700 dark:text-zinc-300">Slideshow Credits</span>
            <span className="p-1.5 flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300">
              <Slideshow size={14} weight="bold" /> {/* CHANGED ICON HERE */}
            </span>
          </div>
          
          <div className="mb-3">
             <span className="font-medium text-2xl text-gray-800 dark:text-zinc-200">
               {Math.round(animatedSlideshowUsed)}
               <span className="text-lg text-gray-500 dark:text-zinc-400">/{slideshowCredits.total}</span>
             </span>
          </div>

          <div className="flex items-center justify-between w-full mb-2">
            {Array.from({ length: 30 }).map((_, i) => { 
              const filledPercentage = slideshowCredits.total > 0 ? (slideshowCredits.used / slideshowCredits.total) * 100 : 0;
              const filledBars = Math.floor((filledPercentage / 100) * 30);
              return (
                <div 
                  key={i} 
                  className={`h-4 w-1 rounded-sm ${i < filledBars ? 'bg-black dark:bg-white' : 'bg-gray-300 dark:bg-zinc-700'}`}
                ></div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-gray-500 dark:text-zinc-500">low</span>
            <span className="text-[10px] text-gray-500 dark:text-zinc-500">full</span>
          </div>
        </div>
        
        {/* Account Status Card */}
        <div className="p-4 border border-gray-100 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900/70 backdrop-blur-sm">
          {/* Account Status Content */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-700 dark:text-zinc-300">Account Status</span>
            <span className="p-1.5 flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300">
              <User size={14} weight="bold" />
            </span>
          </div>
          
          {isFetchingSubscription ? (
            <p className="text-xs text-gray-500 dark:text-zinc-400 mb-3 animate-pulse">
              Loading account details...
            </p>
          ) : (
            <div className='min-h-[28px] mb-3'> { /* Add min-height to prevent layout shift */ }
              {userSubscription && userSubscription.subscriptionStatus ? (
                <p className="text-sm text-gray-800 dark:text-zinc-200">
                  Plan: <span className='font-semibold'>{planPriceMap[userSubscription.stripePriceId] || 'Unknown'}</span>
                  <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${ 
                    userSubscription.subscriptionStatus === 'active' || userSubscription.subscriptionStatus === 'trialing' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400'
                  }`}> 
                    {userSubscription.subscriptionStatus.charAt(0).toUpperCase() + userSubscription.subscriptionStatus.slice(1)}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-gray-800 dark:text-zinc-200">
                  Plan: <span className='font-semibold'>Free Tier</span>
                </p>
              )}
            </div>
          )}
          
          <button 
            onClick={handleManageBilling} // Use the new handler
            disabled={isPortalLoading || isFetchingSubscription || (!isFetchingSubscription && !userSubscription?.stripeCustomerId)} // Disable if loading, fetching, or no subscription
            className={`w-full flex items-center justify-center gap-1 text-center text-xs px-2 py-1.5 rounded transition-colors ${ 
              (isPortalLoading || isFetchingSubscription)
                ? 'bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-zinc-500 cursor-wait' 
                : (!userSubscription?.stripeCustomerId) 
                  ? 'bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-zinc-500 cursor-not-allowed'
                  : 'bg-gray-100 dark:bg-zinc-800/50 hover:bg-gray-200 dark:hover:bg-zinc-700/50 text-gray-700 dark:text-zinc-300'
            }`}
          >
            {isPortalLoading ? (
              <CircleNotch size={12} className="animate-spin" /> 
            ) : (
              <ArrowSquareOut size={12} weight="bold" />
            )}
            {isPortalLoading ? 'Opening Portal...' : 'Manage Plan'}
          </button>
          {/* Display Portal Error */}
          {portalError && (
              <p className="mt-2 text-[10px] text-red-600 dark:text-red-400 text-center">{portalError}</p>
          )}
        </div>
          </div>

      {/* Recent generations (Keep as is) */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-medium text-black dark:text-zinc-100">Recent Generations</h2>
            </div>
            
            {isLoadingGenerations && generations.length === 0 && !generatingItem ? (
              <div className="w-full h-48 rounded-xl border border-gray-100 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm flex items-center justify-center">
                <div className="animate-pulse flex space-x-4">
                  <div className="flex-1 space-y-4 py-1">
                    <div className="h-2 bg-gray-200 dark:bg-zinc-700 rounded w-3/4"></div>
                    <div className="space-y-2">
                      <div className="h-2 bg-gray-200 dark:bg-zinc-700 rounded"></div>
                      <div className="h-2 bg-gray-200 dark:bg-zinc-700 rounded w-5/6"></div>
                    </div>
                  </div>
                </div>
              </div>
            ) : generations.length === 0 && !generatingItem ? (
              <div className="w-full h-48 rounded-xl border border-gray-100 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6">
            <p className="text-gray-500 dark:text-zinc-400">You haven't created any generations yet</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {/* Loading Card for item being generated - UPDATED CONDITION */}
                  {isGenerationActive(generatingItem) && (
                      <LoadingGenerationCard itemType={generatingItem.type} />
                  )}
                  {/* MODIFIED: Render existing generations using the new component */}
                  {generations.map((gen) => (
                    <GenerationCard 
                      key={gen.id} 
                      generation={gen} 
                      onOpenDeleteModal={handleOpenDeleteModal}
                      isDarkMode={isDarkMode} // Pass isDarkMode to GenerationCard
                      onScheduleSubmit={handleScheduleGenerationSubmit} // Pass the new handler
                      onShowSuccessNotification={showSuccessNotification} // Pass new prop
                      creators={creators} // <-- Pass creators
                      backgrounds={backgrounds} // <-- Pass backgrounds
                      onAssetSaved={refreshLayoutData} // <-- Pass refreshLayoutData as onAssetSaved
                    />
                  ))}
                </div>

                {/* Load More Button */} 
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
                      {isLoadingMore ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Loading...
                        </>
                      ) : (
                        'Load More'
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>

      {/* --- NEW: Delete Confirmation Modal --- */} 
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
                className="px-4 py-2 text-sm rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors flex items-center justify-center disabled:opacity-50"
              >
                {isDeletingGeneration ? (
                  <>
                    <CircleNotch size={18} className="animate-spin mr-2" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* --- End Delete Confirmation Modal --- */}

      {/* --- NEW: Success Notification Modal --- */}
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
              <p className="text-xs font-medium">Success</p>
              <p className="text-[11px] text-gray-500 dark:text-zinc-400 mt-0.5">{successModalMessage}</p>
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
      {/* --- END NEW: Success Notification Modal --- */}

    </div>
  );
}

// Add CSS for the specific animations (EXACTLY from Generation.jsx, including jsx prop)
const CustomStyles = () => (
  <style jsx="true">{` 
    @keyframes fade-in-out {
      0% { opacity: 0; }     /* Start invisible */
      50% { opacity: 1; }     /* Fade in to full opacity */
      100% { opacity: 0; }    /* Fade out again */
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