import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc } from "@firebase/firestore"; // Import Firestore functions
import { auth, db } from '../firebase'; // Import auth and db
import PricingSection from './PricingSection'; // Import PricingSection

// Accept the setOnboardingComplete prop
function Onboarding({ setOnboardingComplete }) { 
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [showOffer, setShowOffer] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    jobTitle: '',
    company: '',
    referralSource: '',
    interests: [],
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
    
    // Clear error for this field when user types
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
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

  const handleComplete = async () => {
    if (!validateStep()) {
      return; // Don't proceed if validation fails
    }
    
    // Instead of completing onboarding, show the offer
    setShowOffer(true);
  };
  
  const finalizeOnboarding = async () => {
    const user = auth.currentUser;
    if (!user) {
      console.error("No user found, cannot save onboarding data.");
      return; 
    }

    console.log('Attempting to save onboarding data for user:', user.uid);
    console.log('Onboarding data:', formData);

    try {
      // Create a reference to the user's document in the 'users' collection
      const userDocRef = doc(db, "users", user.uid); 
      
      // Save the form data along with an onboarding completed flag and default photoURL
      const defaultPhotoURL = "https://firebasestorage.googleapis.com/v0/b/ugcai-f429e.firebasestorage.app/o/pp-placeholder.jpeg?alt=media";
      
      await setDoc(userDocRef, {
        ...formData,
        onboardingCompleted: true,
        email: user.email, // Optionally save email for easier lookup
        uid: user.uid,
        photoURL: defaultPhotoURL, // Add the default photo URL here
        createdAt: new Date(), // Timestamp for when profile was created/onboarded
      }, { merge: true }); // Use merge: true to avoid overwriting existing user data if any

      console.log('Onboarding data saved successfully with default photoURL!');
      
      // Call the function passed from AppRouter to update the local state/localStorage
      setOnboardingComplete(); 

    } catch (error) {
      console.error("Error saving onboarding data to Firestore:", error);
      // Handle error - show a message to the user?
    }
  };
  
  const skipOffer = async () => {
    setIsSkipping(true);
    try {
      await finalizeOnboarding();
      navigate('/');
    } catch (error) {
      console.error("Error finalizing onboarding:", error);
      setIsSkipping(false);
    }
  };

  // Render different form based on current step
  const renderStep = () => {
    switch(step) {
      case 1:
        return (
          <>
            <h2 className="text-lg font-medium text-center mb-6">Let's get to know you</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="firstName" className="block text-sm text-gray-700">First name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border ${errors.firstName ? 'border-red-300 bg-red-50' : 'border-gray-100'} rounded-md focus:outline-none focus:ring-1 focus:ring-gray-200`}
                  placeholder="Your first name"
                />
                {errors.firstName && <p className="text-xs text-red-500 mt-1">{errors.firstName}</p>}
              </div>
              
              <div className="space-y-2">
                <label htmlFor="lastName" className="block text-sm text-gray-700">Last name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border ${errors.lastName ? 'border-red-300 bg-red-50' : 'border-gray-100'} rounded-md focus:outline-none focus:ring-1 focus:ring-gray-200`}
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
                <label htmlFor="jobTitle" className="block text-sm text-gray-700">Job title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  id="jobTitle"
                  name="jobTitle"
                  value={formData.jobTitle}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border ${errors.jobTitle ? 'border-red-300 bg-red-50' : 'border-gray-100'} rounded-md focus:outline-none focus:ring-1 focus:ring-gray-200`}
                  placeholder="Your title or role"
                />
                {errors.jobTitle && <p className="text-xs text-red-500 mt-1">{errors.jobTitle}</p>}
              </div>
              
              <div className="space-y-2">
                <label htmlFor="company" className="block text-sm text-gray-700">Company/Organization <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  id="company"
                  name="company"
                  value={formData.company}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border ${errors.company ? 'border-red-300 bg-red-50' : 'border-gray-100'} rounded-md focus:outline-none focus:ring-1 focus:ring-gray-200`}
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
                <label className="block text-sm text-gray-700">Select an option <span className="text-red-500">*</span></label>
                <div className="space-y-3 max-h-64 overflow-y-auto">
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
                      onClick={() => setFormData({...formData, referralSource: source.value})}
                      className={`p-3 border ${formData.referralSource === source.value ? 'border-black' : 'border-gray-100'} rounded-md cursor-pointer hover:border-gray-300 transition-all`}
                    >
                      <div className="flex items-center">
                        <div className={`w-4 h-4 rounded-full border ${formData.referralSource === source.value ? 'bg-black border-black' : 'border-gray-300'}`}></div>
                        <span className="ml-3 text-sm">
                          <span className="font-medium">{source.label}</span> <span className="text-gray-500">{source.description}</span>
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
        
      case 4:
        return (
          <>
            <h2 className="text-lg font-medium text-center mb-6">Almost done!</h2>
            <div className="space-y-4">
              <p className="text-sm text-gray-600 mb-4">Please review the following preferences:</p>
              
              <div className="flex items-start p-4 border border-gray-100 rounded-md hover:border-gray-200 transition-all">
                <input 
                  type="checkbox" 
                  id="notifications" 
                  name="notifications"
                  checked={formData.notifications}
                  onChange={handleInputChange}
                  className="mt-1 h-4 w-4 text-black border-gray-300 rounded"
                />
                <label htmlFor="notifications" className="ml-3 text-sm text-gray-700">
                  I'd like to receive notifications about new features, updates, and events
                </label>
              </div>
              
              <div className="flex items-start p-4 border border-gray-100 rounded-md hover:border-gray-200 transition-all">
                <input 
                  type="checkbox" 
                  id="dataCollection" 
                  name="dataCollection"
                  checked={formData.dataCollection}
                  onChange={handleInputChange}
                  className="mt-1 h-4 w-4 text-black border-gray-300 rounded"
                />
                <label htmlFor="dataCollection" className="ml-3 text-sm text-gray-700">
                  I allow lungo to collect usage data to improve my experience
                </label>
              </div>
              
              <p className="text-xs text-gray-500 mt-2">
                You can change these preferences at any time in your account settings
              </p>
            </div>
          </>
        );
        
      default:
        return null;
    }
  };

  const renderOffer = () => (
    <div className="w-full max-w-4xl bg-white rounded-lg mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-left mb-8">
        <h2 className="text-2xl font-medium text-gray-900">You're all set! 🎉</h2>
        <p className="mt-2 text-gray-600">Unlock the full potential of LungoAI with a premium plan</p>
      </div>
      
      <PricingSection id="pricing" subscriptionData={null} />
      
      <div className="text-left mt-8">
        <button 
          onClick={skipOffer}
          disabled={isSkipping}
          className={`px-5 py-2 flex items-center text-sm ${isSkipping ? 'opacity-70 cursor-not-allowed' : 'hover:text-black'} text-gray-600 transition-colors`}
        >
          {isSkipping ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </>
          ) : (
            'Skip for now and continue to dashboard'
          )}
        </button>
      </div>
    </div>
  );

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
            <img src="/logonaked-black.png" alt="Lungo AI Logo" className="h-16 mx-auto mb-5" />
            <h1 className="text-3xl font-normal tracking-wide text-black mb-2">welcome to lungo</h1>
            <p className="text-base text-gray-500">Let's get your account set up</p>
          </div>

          {/* Progress indicator */}
          <div className="flex justify-center space-x-1 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <div 
                key={i} 
                className={`h-1 rounded-full ${
                  i === step ? 'w-8 bg-black' : 
                  i < step ? 'w-6 bg-gray-300' : 'w-6 bg-gray-100'
                } transition-all duration-300`}
              ></div>
            ))}
          </div>

          {/* Main Content */}
          <div className="bg-white/50 backdrop-blur-sm p-8 rounded-lg">
            {renderStep()}
            
            {/* Navigation buttons */}
            <div className="mt-8 flex justify-between">
              {step > 1 ? (
                <button 
                  onClick={prevStep}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-black transition-colors"
                >
                  Back
                </button>
              ) : (
                <div></div> // Empty div for spacing
              )}
              
              {step < 4 ? (
                <button
                  onClick={nextStep}
                  className="px-5 py-2 border border-gray-100 rounded-md bg-white hover:border-gray-300 text-sm transition-all"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleComplete}
                  className="px-5 py-2 bg-black text-white rounded-md hover:bg-gray-800 text-sm transition-all"
                >
                  Complete Setup
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