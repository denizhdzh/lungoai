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

// NEW: Initialize Firebase Functions
const functions = getFunctions();

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
    contentType: '', // Content type selection
    referralSource: '', // How they heard about us
    notifications: false,
    dataCollection: false
  });
  
  // Form validation state
  const [errors, setErrors] = useState({});

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateStep = () => {
    const newErrors = {};
    
    if (step === 1) {
      if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
      if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
    } 
    else if (step === 2) {
      if (!formData.jobTitle.trim()) newErrors.jobTitle = 'Job title is required';
      if (!formData.company.trim()) newErrors.company = 'Company is required';
    }
    else if (step === 3) {
      if (!formData.contentType) newErrors.contentType = 'Please select a content type';
    }
    else if (step === 4) {
      if (!formData.referralSource) newErrors.referralSource = 'Please select how you heard about us';
    }
    // Step 5 (Preferences) has no mandatory fields currently
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep()) {
      setStep(prev => prev + 1);
    }
  };

  const prevStep = () => {
    setStep(prev => prev - 1);
  };

  // Simplified save function - no product or background data
  const _saveOnboardingDetails = async () => {
    const user = auth.currentUser;
    if (!user) {
      console.error("[_saveOnboardingDetails] No user found, cannot save onboarding data.");
      alert("Error: No user session found. Please try logging in again.");
      return false;
    }

    console.log('[_saveOnboardingDetails] Attempting to save onboarding data for user:', user.uid);

    try {
      const userDocRef = doc(db, "users", user.uid); 
      const defaultPhotoURL = "https://firebasestorage.googleapis.com/v0/b/ugcai-f429e.firebasestorage.app/o/pp-placeholder.jpeg?alt=media";
      
      const userDataToSave = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        jobTitle: formData.jobTitle,
        company: formData.company,
        contentType: formData.contentType, // Save content type
        referralSource: formData.referralSource, // Save referral source
        notifications: formData.notifications,
        dataCollection: formData.dataCollection,
        onboardingCompleted: false, // Will be set to true later by finalizeOnboarding
        email: user.email,
        uid: user.uid,
        photoURL: defaultPhotoURL,
        createdAt: serverTimestamp(),
      };

      await setDoc(userDocRef, userDataToSave, { merge: true });
      console.log('[_saveOnboardingDetails] User onboarding data saved successfully.');
      
      if (auth.currentUser) {
        try {
          await updateProfile(auth.currentUser, { photoURL: defaultPhotoURL, displayName: `${formData.firstName} ${formData.lastName}`.trim() });
          console.log('[_saveOnboardingDetails] Firebase Auth user profile updated successfully!');
        } catch (authError) {
          console.error("[_saveOnboardingDetails] Error updating Firebase Auth user profile:", authError);
        }
      }

      return true;
    } catch (error) {
      console.error("[_saveOnboardingDetails] Error saving onboarding details:", error);
      alert("An error occurred while saving your onboarding information. Please try again.");
      return false;
    }
  };

  const handleComplete = async () => {
    if (!validateStep()) {
      return; 
    }
    setIsLoading(true);
    const detailsSaved = await _saveOnboardingDetails();
    setIsLoading(false);

    if (detailsSaved) {
      setShowOffer(true);
    } else {
      console.log("Onboarding details saving failed. Offer not shown.");
    }
  };
  
  const finalizeOnboarding = async () => {
    const user = auth.currentUser;
    if (!user) {
      console.error("No user found, cannot finalize onboarding.");
      return; 
    }

    console.log('Finalizing onboarding for user:', user.uid);
    try {
      const userDocRef = doc(db, "users", user.uid);
      
      // Get current user data to check existing credits
      const userDoc = await getDoc(userDocRef);
      const currentCredits = userDoc.exists() ? (userDoc.data().general_credits || 0) : 0;
      
      await updateDoc(userDocRef, {
        onboardingCompleted: true,
        general_credits: currentCredits + 200, // Add 200 credits for completing onboarding
      });
      console.log('User onboarding status marked as completed. Added 200 credits.');
      
      setOnboardingComplete(); 
      navigate('/'); 

    } catch (error) {
      console.error("Error marking onboarding as completed:", error);
      alert("An error occurred while finalizing your setup. Please try again.");
    }
  };
  
  const skipOffer = async () => {
    setIsSkipping(true);
    console.log("User is skipping the offer. Proceeding to finalize onboarding.");
    await finalizeOnboarding();
    setIsSkipping(false);
  };

  // Render different form based on current step
  const renderStep = () => {
    switch(step) {
      case 1:
        return (
          <>
            <h2 className="text-lg font-medium text-center mb-6 text-white">Let's get to know you</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="firstName" className="block text-sm text-neutral-300">First name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border ${errors.firstName ? 'border-red-500 bg-red-500/10' : 'border-neutral-600'} rounded-md focus:outline-none focus:ring-1 focus:ring-lime-500 bg-neutral-800 text-white placeholder-neutral-500`}
                  placeholder="Your first name"
                />
                {errors.firstName && <p className="text-xs text-red-500 mt-1">{errors.firstName}</p>}
              </div>
              
              <div className="space-y-2">
                <label htmlFor="lastName" className="block text-sm text-neutral-300">Last name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border ${errors.lastName ? 'border-red-500 bg-red-500/10' : 'border-neutral-600'} rounded-md focus:outline-none focus:ring-1 focus:ring-lime-500 bg-neutral-800 text-white placeholder-neutral-500`}
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
            <h2 className="text-lg font-medium text-center mb-6 text-white">What do you do?</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="jobTitle" className="block text-sm text-neutral-300">Job title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  id="jobTitle"
                  name="jobTitle"
                  value={formData.jobTitle}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border ${errors.jobTitle ? 'border-red-500 bg-red-500/10' : 'border-neutral-600'} rounded-md focus:outline-none focus:ring-1 focus:ring-lime-500 bg-neutral-800 text-white placeholder-neutral-500`}
                  placeholder="Your title or role"
                />
                {errors.jobTitle && <p className="text-xs text-red-500 mt-1">{errors.jobTitle}</p>}
              </div>
              
              <div className="space-y-2">
                <label htmlFor="company" className="block text-sm text-neutral-300">Company/Organization <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  id="company"
                  name="company"
                  value={formData.company}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border ${errors.company ? 'border-red-500 bg-red-500/10' : 'border-neutral-600'} rounded-md focus:outline-none focus:ring-1 focus:ring-lime-500 bg-neutral-800 text-white placeholder-neutral-500`}
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
            <h2 className="text-lg font-medium text-center mb-6 text-white">What type of content do you want to create?</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  {value: "marketing_ads", label: "Marketing & Ads"},
                  {value: "social_content", label: "Social Content"},
                  {value: "product_demos", label: "Product Demos"},
                  {value: "educational", label: "Educational"},
                  {value: "entertainment", label: "Entertainment"},
                  {value: "other", label: "Other"}
                ].map((contentType) => (
                  <button
                    key={contentType.value}
                    type="button"
                    onClick={() => {
                      setFormData({...formData, contentType: contentType.value});
                      if (errors.contentType) setErrors(prev => ({...prev, contentType: ''}));
                    }}
                    className={`p-4 text-sm text-left rounded-xl transition-all duration-200 ${
                      formData.contentType === contentType.value 
                        ? 'bg-neutral-700 ring-2 ring-lime-400/50 text-lime-300' 
                        : 'bg-neutral-800 border border-neutral-600 text-neutral-300 hover:border-neutral-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{contentType.label}</span>
                      {formData.contentType === contentType.value && (
                        <div className="w-5 h-5 bg-lime-400 rounded-full flex items-center justify-center flex-shrink-0">
                          <div className="w-2 h-2 bg-black rounded-full"></div>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              {errors.contentType && <p className="text-xs text-red-500 mt-1 text-center">{errors.contentType}</p>}
            </div>
          </>
        );
        
      case 4: // How did you hear about us?
        return (
          <>
            <h2 className="text-lg font-medium text-center mb-6 text-white">How did you hear about us?</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  {value: "search_engine", label: "Search Engine"},
                  {value: "social_media", label: "Social Media"},
                  {value: "friend_colleague", label: "Friend/Colleague"},
                  {value: "blog_article", label: "Blog/Article"},
                  {value: "podcast", label: "Podcast"},
                  {value: "other", label: "Other"}
                ].map((source) => (
                  <button
                    key={source.value}
                    type="button"
                    onClick={() => {
                      setFormData({...formData, referralSource: source.value});
                      if (errors.referralSource) setErrors(prev => ({...prev, referralSource: ''}));
                    }}
                    className={`p-4 text-sm text-left rounded-xl transition-all duration-200 ${
                      formData.referralSource === source.value 
                        ? 'bg-neutral-700 ring-2 ring-lime-400/50 text-lime-300' 
                        : 'bg-neutral-800 border border-neutral-600 text-neutral-300 hover:border-neutral-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{source.label}</span>
                      {formData.referralSource === source.value && (
                        <div className="w-5 h-5 bg-lime-400 rounded-full flex items-center justify-center flex-shrink-0">
                          <div className="w-2 h-2 bg-black rounded-full"></div>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              {errors.referralSource && <p className="text-xs text-red-500 mt-1 text-center">{errors.referralSource}</p>}
            </div>
          </>
        );
        
      case 5: // Preferences Step
        return (
          <>
            <h2 className="text-lg font-medium text-center mb-6 text-white">Almost done!</h2>
            <div className="space-y-4">
              <p className="text-sm text-neutral-300 mb-4">Please review the following preferences:</p>
              
              <div className="flex items-start p-4 rounded-lg hover:bg-neutral-700 transition-all bg-neutral-800">
                <input 
                  type="checkbox" id="notifications" name="notifications"
                  checked={formData.notifications} onChange={handleInputChange}
                  className="mt-1 h-4 w-4 text-lime-500 border-neutral-500 rounded focus:ring-lime-500"
                />
                <label htmlFor="notifications" className="ml-3 text-sm text-neutral-200">
                  I'd like to receive notifications about new features, updates, and events
                </label>
              </div>
              
              <div className="flex items-start p-4 rounded-lg hover:bg-neutral-700 transition-all bg-neutral-800">
                <input 
                  type="checkbox" id="dataCollection" name="dataCollection"
                  checked={formData.dataCollection} onChange={handleInputChange}
                  className="mt-1 h-4 w-4 text-lime-500 border-neutral-500 rounded focus:ring-lime-500"
                />
                <label htmlFor="dataCollection" className="ml-3 text-sm text-neutral-200">
                  I allow Lungo AI to collect usage data to improve my experience
                </label>
              </div>
              
              <p className="text-xs text-neutral-400 mt-2">
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
    <div className="w-full max-w-4xl bg-neutral-900 border border-neutral-700 rounded-lg mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-left mb-8 relative">
        <button 
          onClick={skipOffer}
          disabled={isSkipping || isLoading}
          className={`absolute top-0 right-0 text-sm transition-colors
                      ${(isSkipping || isLoading) 
                        ? 'text-neutral-500 cursor-not-allowed' 
                        : 'text-white hover:text-neutral-300'
                      }`}
        >
          {(isSkipping || isLoading) ? 'Processing...' : 'Skip for now'}
        </button>
        <h2 className="text-2xl font-medium text-white">You're all set! 🎉</h2>
        <p className="mt-2 text-neutral-300">Unlock the full potential of LungoAI with a premium plan</p>
      </div>
      
      <PricingSection 
        id="pricing" 
        subscriptionData={null} 
        user={auth.currentUser} 
        onSubscriptionSuccess={finalizeOnboarding}
      />
    </div>
  );

  const totalSteps = 5; // Updated total steps (added referral source step)

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans relative overflow-hidden">
      {/* Dot Grid Background */}
      <div className="absolute inset-0 h-full w-full bg-neutral-950 bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_60%,transparent_100%)]"></div>
      
      {!showOffer ? (
        <div className="max-w-md w-full relative z-10">
          {/* Logo and Header Section */}
          <div className="text-center mb-10">
            <img src="/logonaked.png" alt="Lungo AI Logo" className="h-8 mx-auto mb-5" />
            <h1 className="text-3xl font-normal tracking-wide text-white mb-2">Welcome to lungo</h1>
            <p className="text-base text-neutral-400">Let's get your account set up</p>
          </div>

          {/* Progress indicator */}
          <div className="flex justify-center space-x-1 mb-6">
            {[...Array(totalSteps).keys()].map((i) => (
              <div 
                key={i+1} 
                className={`h-1 rounded-full ${
                  (i + 1) === step ? 'w-8 bg-lime-500' : 
                  (i + 1) < step ? 'w-6 bg-lime-400' : 'w-6 bg-neutral-600'
                } transition-all duration-300`}
              ></div>
            ))}
          </div>

          {/* Main Content */}
          <div className="bg-neutral-900/60 border border-neutral-700 p-6 rounded-xl">
            {renderStep()}
            
            {/* Navigation buttons */}
            <div className="mt-8 flex justify-between items-center">
              {step > 1 ? (
                <button 
                  onClick={prevStep}
                  disabled={isLoading}
                  className="px-4 py-2 text-sm text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  Back
                </button>
              ) : (
                <div></div> 
              )}
              
              {step < totalSteps ? (
                <button
                  onClick={nextStep}
                  disabled={isLoading}
                  className="px-5 py-2 border border-neutral-600 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm text-white shadow-sm hover:shadow-md transition-all disabled:opacity-50"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleComplete}
                  disabled={isLoading}
                  className="px-5 py-2 bg-lime-500 text-black rounded-lg hover:bg-lime-400 text-sm shadow-sm hover:shadow-md transition-all disabled:opacity-50 flex items-center justify-center min-w-[120px]"
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
    </div>
  );
}

export default Onboarding;