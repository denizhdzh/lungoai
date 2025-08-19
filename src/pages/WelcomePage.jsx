import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { models, getModelById, getModelsByCategory } from '../config/models.js';
import LazyVideo from '../components/LazyVideo.jsx';
import Header from '../components/Header.jsx';
import PricingSection from '../components/PricingSection.jsx';
import { auth, db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';

const WelcomePage = () => {
  const user = auth.currentUser;
  const navigate = useNavigate();
  const [firestoreUserData, setFirestoreUserData] = useState(null);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);

  // Generation state
  const [activeType, setActiveType] = useState('image');
  const [selectedModel, setSelectedModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('4:3');
  const [uploadedImage, setUploadedImage] = useState(null);
  
  // Progress state
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [generatedResult, setGeneratedResult] = useState(null);
  const [showResultModal, setShowResultModal] = useState(false);
  
  // User generations state
  const [userGenerations, setUserGenerations] = useState([]);
  const [loadingGenerations, setLoadingGenerations] = useState(true);
  
  
  // Get available models based on active type (copied from GenerationPage.jsx)
  const availableModels = getModelsByCategory(activeType);
  
  // Check if current model supports image input (copied from GenerationPage.jsx)
  const modelConfig = getModelById(selectedModel);
  const supportsImageInput = modelConfig && Object.keys(modelConfig?.params || {})
    .some(key => key.includes('image') || key === 'start_image' || key === 'first_frame_image' || key === 'subject_reference');
  
  // Set default model when type changes (copied from GenerationPage.jsx)
  useEffect(() => {
    if (activeType === 'image') {
      setSelectedModel('black-forest-labs/flux-kontext-max');
    } else if (activeType === 'video') {
      setSelectedModel('google/veo-3-fast');
    }
  }, [activeType]);

  // Fetch Firestore user data
  useEffect(() => {
    if (user && user.uid) {
      const userDocRef = doc(db, 'users', user.uid);
      const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          setFirestoreUserData(docSnap.data());
        } else {
          console.log("User document not found in Firestore for WelcomePage.");
          setFirestoreUserData(null);
        }
      }, (error) => {
        console.error("Error fetching user document from Firestore for WelcomePage:", error);
        setFirestoreUserData(null);
      });
      return () => unsubscribe();
    } else {
      setFirestoreUserData(null);
    }
  }, [user]);
  
  // Fetch user's recent generations
  useEffect(() => {
    const fetchUserGenerations = async () => {
      if (!user) {
        setLoadingGenerations(false);
        return;
      }
      
      try {
        setLoadingGenerations(true);
        const { collection, query, where, orderBy, limit, getDocs, Timestamp } = await import('firebase/firestore');
        const { db } = await import('../firebase.js');
        
        const generationsRef = collection(db, 'users', user.uid, 'generations');
        const recentQuery = query(
          generationsRef,
          orderBy('timestamp', 'desc'),
          limit(6) // Get 6 most recent
        );
        
        const querySnapshot = await getDocs(recentQuery);
        const generations = [];
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const timestamp = data.timestamp instanceof Timestamp 
            ? data.timestamp.toDate() 
            : (data.timestamp ? new Date(data.timestamp) : new Date());
            
          generations.push({
            id: doc.id,
            ...data,
            timestamp,
            url: data.imageUrl || data.videoUrl || data.url // Handle different URL field names
          });
        });
        
        setUserGenerations(generations.filter(gen => gen.url)); // Only include ones with valid URLs
        console.log('📸 Fetched user generations:', generations.length);
        
      } catch (error) {
        console.error('❌ Error fetching user generations:', error);
      } finally {
        setLoadingGenerations(false);
      }
    };
    
    fetchUserGenerations();
  }, [user]);
  
  
  // Calculate credits (copied from GenerationPage.jsx)
  const calculateCredits = () => {
    if (!modelConfig) return 0;
    
    // For image models
    if (modelConfig.credits !== undefined) {
      const baseCredits = modelConfig.credits;
      const numImages = 1; // Always 1 for quick generation
      return baseCredits * numImages;
    }
    
    // For video models with creditsPerSecond
    if (modelConfig.creditsPerSecond !== undefined) {
      const duration = 5; // Default duration for quick generation
      
      // Handle object-based creditsPerSecond
      if (typeof modelConfig.creditsPerSecond === 'object') {
        const firstKey = Object.keys(modelConfig.creditsPerSecond)[0];
        return modelConfig.creditsPerSecond[firstKey] * duration;
      }
      
      // Handle simple number creditsPerSecond
      return modelConfig.creditsPerSecond * duration;
    }
    
    return 0;
  };
  
  // Handle real generation
  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    setProgress(0);
    
    // Determine duration based on type for progress simulation
    const estimatedDuration = activeType === 'image' ? 20000 : 240000; // 20s for images, 4min for videos
    const steps = 100;
    const stepDuration = estimatedDuration / steps;
    
    const statusMessages = activeType === 'image' 
      ? [
          'Initializing AI model...',
          'Processing your prompt...',
          'Understanding context...',
          'Generating base composition...',
          'Adding fine details...',
          'Applying artistic style...',
          'Enhancing colors and lighting...',
          'Finalizing your image...',
          'Almost ready...'
        ]
      : [
          'Initializing video model...',
          'Processing your prompt...',
          'Planning video sequence...',
          'Generating first frames...',
          'Creating motion paths...',
          'Rendering intermediate frames...',
          'Adding smooth transitions...',
          'Optimizing video quality...',
          'Finalizing video...'
        ];
    
    // Start progress animation
    let currentStep = 0;
    const progressInterval = setInterval(() => {
      currentStep++;
      const newProgress = (currentStep / steps) * 100;
      setProgress(newProgress);
      
      // Update status text based on progress
      const messageIndex = Math.floor((newProgress / 100) * (statusMessages.length - 1));
      setProgressText(statusMessages[messageIndex] || statusMessages[statusMessages.length - 1]);
      
      if (currentStep >= steps) {
        clearInterval(progressInterval);
      }
    }, stepDuration);
    
    try {
      // Prepare generation data
      const generationData = {
        model: selectedModel,
        prompt: prompt.trim(),
        ...(activeType === 'image' && { aspect_ratio: aspectRatio })
      };
      
      // Add image input if uploaded
      if (uploadedImage && supportsImageInput) {
        if (uploadedImage.file) {
          const base64DataUri = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(uploadedImage.file);
          });
          
          // Find the image parameter for this model
          const imageParams = Object.keys(modelConfig?.params || {}).filter(key => 
            key.includes('image') || key === 'start_image' || key === 'first_frame_image' || key === 'subject_reference'
          );
          
          if (imageParams.length > 0) {
            generationData[imageParams[0]] = base64DataUri;
          }
        }
      }
      
      console.log('🔥 Starting real generation with data:', generationData);
      
      // Call Firebase function
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('../firebase.js');
      
      let result;
      if (activeType === 'image') {
        const generateImage = httpsCallable(functions, 'generateImage');
        result = await generateImage(generationData);
      } else {
        const generateVideo = httpsCallable(functions, 'generateVideo');
        result = await generateVideo(generationData);
      }
      
      console.log('✅ Generation result:', result.data);
      
      if (result.data.success) {
        clearInterval(progressInterval);
        setProgress(100);
        setProgressText('Complete!');
        
        const generatedResult = {
          type: activeType,
          url: result.data.imageUrl || result.data.videoUrl,
          prompt: prompt.trim(),
          model: selectedModel,
          timestamp: new Date()
        };
        
        setGeneratedResult(generatedResult);
        setIsGenerating(false);
        setShowResultModal(true);
        setPrompt(''); // Clear prompt
      } else {
        throw new Error(result.data.error || 'Generation failed');
      }
      
    } catch (error) {
      console.error('❌ Generation error:', error);
      clearInterval(progressInterval);
      setIsGenerating(false);
      setProgress(0);
      alert(`Generation failed: ${error.message}`);
    }
  };

  return (
    <>
      <style>{`
        @keyframes imageSwap1 {
          0%, 45% { 
            opacity: 1; 
            transform: scale(1); 
          }
          50%, 95% { 
            opacity: 0; 
            transform: scale(1.05); 
          }
          100% { 
            opacity: 1; 
            transform: scale(1); 
          }
        }
        
        @keyframes imageSwap2 {
          0%, 45% { 
            opacity: 0; 
            transform: scale(1.05); 
          }
          50%, 95% { 
            opacity: 1; 
            transform: scale(1); 
          }
          100% { 
            opacity: 0; 
            transform: scale(1.05); 
          }
        }
        
        @keyframes editSweep {
          0%, 40% { 
            opacity: 0; 
            transform: translateX(-100%) skewX(-12deg); 
          }
          45% { 
            opacity: 1; 
            transform: translateX(-50%) skewX(-12deg); 
          }
          55% { 
            opacity: 1; 
            transform: translateX(50%) skewX(-12deg); 
          }
          60%, 100% { 
            opacity: 0; 
            transform: translateX(100%) skewX(-12deg); 
          }
        }
        
        @keyframes videoPlay {
          0%, 80% { 
            opacity: 1; 
            transform: scale(1);
          }
          85%, 95% { 
            opacity: 0.3; 
            transform: scale(1.05);
          }
          100% { 
            opacity: 1; 
            transform: scale(1);
          }
        }
        
        @keyframes playButton {
          0%, 80% { 
            opacity: 0; 
            transform: scale(0.8);
          }
          85%, 95% { 
            opacity: 1; 
            transform: scale(1);
          }
          100% { 
            opacity: 0; 
            transform: scale(0.8);
          }
        }
      `}</style>
      
      <div className="font-sans min-h-screen bg-neutral-950 relative">
        {/* Image Background */}
        <div className="fixed inset-0 w-full h-full z-0">
          <img 
            src="/Glowing Abstract Flower.png" 
            alt="Background" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/30" />
        </div>
        
        {/* Header Component */}
        <Header />
      
        {/* Desktop Layout - Boxes */}
        <div className="hidden md:block">
            <div className="md:fixed bottom-4 md:bottom-8 left-4 md:left-8 right-4 md:right-8 z-20 flex flex-col lg:flex-row gap-4 lg:items-end py-16 md:p-0 relative mt-16 md:mt-0">
              
              {!user ? (
                <>
                  {/* Left Side - All-in-one Studio Box */}
                  <div className="w-full lg:flex-1 lg:order-1 order-1 space-y-2">
                    
                    {/* All-in-one Studio Box */}
                    <div className="w-full bg-neutral-900/5 backdrop-blur-sm p-4 md:p-6 rounded-3xl">
                      <h2 className="text-2xl md:text-4xl lg:text-6xl font-light text-white mb-2 md:mb-3">All-in-one AI Studio</h2>
                      <p className="text-sm md:text-lg lg:text-xl text-white/60 leading-relaxed">
                        Introducing <span className="text-white">Lungo AI</span>, the <span className="text-white">all-in-one studio</span> to create <span className="text-white">images & videos</span> in seconds, <span className="text-white">no tabs</span> to switch, <span className="text-white">no setups</span> needed.
                      </p>
                    </div>
                    
                    
                  </div>
                  
                  {/* Right Side - 3 Feature Boxes */}
                  <div className="space-y-4 w-full lg:max-w-lg lg:order-2 order-2">
                
                {/* 1. Advanced Image Editing */}
                <div className="w-full bg-neutral-900/70 backdrop-blur-sm p-3 rounded-3xl border border-neutral-100/20 hover:border-lime-400 cursor-pointer transition-colors group">
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
                    {/* Title & Subtitle - Left */}
                    <div className="flex-1 order-1">
                      <h3 className="text-base md:text-lg font-semibold text-white mb-1">Advanced Image Editing</h3>
                      <p className="text-xs text-neutral-400 mb-2">Edit any part of your image while maintaining perfect coherence</p>
                      {/* Model Logos Row */}
                      <div className="flex items-center gap-2">
                        <img src="/logos/flux_logo.webp" alt="Flux" className="w-4 h-4 opacity-60"/>
                        <img src="/logos/ideogram_logo.webp" alt="Ideogram" className="w-4 h-4 opacity-60"/>
                      </div>
                    </div>
                    
                    {/* Visual Content - Right */}
                    <div className="w-full md:w-48 lg:w-64 h-32 md:h-48 lg:h-64 relative overflow-hidden rounded-lg md:flex-shrink-0 order-2">
                      <img 
                        src="/Futuristic Pod in Urban Jungle copy.webp" 
                        alt="AI Model Example" 
                        className="w-full h-full object-cover absolute inset-0 transition-all duration-1000"
                        style={{
                          animation: 'imageSwap1 8s infinite ease-in-out'
                        }}
                      />
                      <img 
                        src="/generation-d5d746f2-bd7e-40ba-a093-04ced3885491 copy.png" 
                        alt="Generated Example" 
                        className="w-full h-full object-cover absolute inset-0 transition-all duration-1000"
                        style={{
                          animation: 'imageSwap2 8s infinite ease-in-out'
                        }}
                      />
                      {/* Edit effect overlay */}
                      <div 
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 opacity-0"
                        style={{
                          animation: 'editSweep 8s infinite ease-in-out',
                          animationDelay: '3.5s'
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
                
                {/* 2. Professional Video Creation */}
                <div className="w-full bg-neutral-900/70 backdrop-blur-sm p-3 rounded-3xl border border-neutral-100/20 hover:border-lime-400 cursor-pointer transition-colors group">
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
                    {/* Visual Content - Left */}
                    <div className="w-full md:w-48 lg:w-64 h-32 md:h-32 lg:h-48 relative overflow-hidden rounded-lg md:flex-shrink-0 order-2 md:order-1">
                      <video 
                        autoPlay 
                        muted 
                        loop 
                        playsInline
                        className="w-full h-full object-cover"
                      >
                        <source src="/vid1.mp4" type="video/mp4" />
                      </video>
                    </div>
                    
                    {/* Title & Subtitle - Right */}
                    <div className="flex-1 order-1 md:order-2">
                      <h3 className="text-base md:text-lg font-semibold text-white mb-1">Professional Video Creation</h3>
                      <p className="text-xs text-neutral-400 mb-2">Generate high-quality videos from text prompts in minutes</p>
                      {/* Model Logos Row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <img src="/logos/google_logo.webp" alt="Google" className="w-4 h-4 opacity-60"/>
                        <img src="/logos/bytedance_logo.webp" alt="ByteDance" className="w-4 h-4 opacity-60"/>
                        <img src="/logos/kling_logo.webp" alt="Kling" className="w-4 h-4 opacity-60"/>
                        <img src="/logos/minimax_logo.webp" alt="Minimax" className="w-4 h-4 opacity-60"/>
                        <img src="/logos/leonardo_logo.webp" alt="Leonardo" className="w-4 h-4 opacity-60"/>
                        <img src="/logos/runway_logo.webp" alt="Runway" className="w-4 h-4 opacity-60"/>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* 3. Stunning Image Generation */}
                <div className="w-full bg-neutral-900/70 backdrop-blur-sm p-3 rounded-3xl border border-neutral-100/20 hover:border-lime-400 cursor-pointer transition-colors group">
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
                    {/* Title & Subtitle - Left */}
                    <div className="flex-1 order-1">
                      <h3 className="text-base md:text-lg font-semibold text-white mb-1">Stunning Image Generation</h3>
                      <p className="text-xs text-neutral-400 mb-2">Create ultra-high quality images with perfect prompt understanding</p>
                      {/* Model Logos Row */}
                      <div className="flex items-center gap-2">
                        <img src="/logos/google_logo.webp" alt="Google" className="w-4 h-4 opacity-60"/>
                        <img src="/logos/flux_logo.webp" alt="Flux" className="w-4 h-4 opacity-60"/>
                        <img src="/logos/ideogram_logo.webp" alt="Ideogram" className="w-4 h-4 opacity-60"/>
                      </div>
                    </div>
                    
                    {/* Visual Content - Right */}
                    <div className="w-full md:w-48 lg:w-64 h-32 md:h-32 lg:h-48 relative overflow-hidden rounded-lg md:flex-shrink-0 order-2">
                      <img 
                        src="/im10.webp" 
                        alt="Generated Image Example" 
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                </div>
                
                  </div>
                </>
              ) : (
                <>
                  {/* Left Side - Welcome Box for logged in users */}
                  <div className="w-full lg:flex-1 lg:order-1 order-1 space-y-2">
                    
                    {/* Welcome Box */}
                    <div className="w-full bg-neutral-900/5 backdrop-blur-sm p-4 md:p-6 rounded-3xl">
                      <h2 className="text-2xl md:text-4xl lg:text-6xl font-light text-white mb-2 md:mb-3">
                        Welcome back, {(user?.displayName || user?.email?.split('@')[0] || 'Creator').split(' ')[0]}
                      </h2>
                      <p className="text-sm md:text-lg lg:text-xl text-white/60 leading-relaxed">
                        Ready to create amazing <span className="text-white">images & videos</span> with AI? Your creative workspace awaits.
                      </p>
                    </div>
                    
                  </div>
                  
                  {/* Right Side - Credits & Generations */}
                  <div className="space-y-4 w-full lg:max-w-lg lg:order-2 order-2 flex flex-col items-end">
                    
                    {/* Credits Box */}
                    <div 
                      onClick={() => setIsPricingModalOpen(true)}
                      className="aspect-square w-64 bg-neutral-900/70 backdrop-blur-sm rounded-3xl border border-neutral-100/20 hover:border-lime-400 cursor-pointer transition-colors group relative overflow-hidden"
                    >
                      <div 
                        className="absolute inset-4 bg-cover bg-center opacity-100"
                        style={{backgroundImage: 'url(/Union.webp)'}}
                      ></div>
                      <div className="relative z-10 p-4 h-full flex flex-col items-center justify-center text-center">
                        <div className="text-5xl font-bold text-white mb-1">
                          {(firestoreUserData?.general_credits || 0) + (firestoreUserData?.one_time_credits || 0)}
                        </div>
                        <div className="text-xs text-white/60 font-medium mb-2">
                          credits
                        </div>
                        <div className="text-xs text-lime-400 font-medium">
                          {!firestoreUserData?.subscriptionStatus || firestoreUserData?.subscriptionStatus !== 'active' 
                            ? 'UPGRADE' 
                            : 'Get More Credits'
                          }
                        </div>
                      </div>
                    </div>
                    
                    {/* Last Generations Box */}
                    <div 
                      onClick={() => navigate('/history')}
                      className="w-full bg-neutral-900/70 backdrop-blur-sm p-4 rounded-3xl border border-neutral-100/20 hover:border-lime-400 cursor-pointer transition-all duration-300 group hover:scale-[1.02]"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-base font-semibold text-white group-hover:text-lime-400 transition-colors">
                          Recent Creations
                        </h3>
                        <div className="text-xs text-white/60 bg-white/10 px-2 py-1 rounded-full">
                          {userGenerations.length} total
                        </div>
                      </div>
                      
                      {loadingGenerations ? (
                        <div className="flex items-center justify-center h-20">
                          <div className="w-5 h-5 border-2 border-lime-400/30 border-t-lime-400 rounded-full animate-spin"></div>
                        </div>
                      ) : userGenerations.length > 0 ? (
                        <div className="grid grid-cols-3 gap-2">
                          {userGenerations.slice(0, 3).map((gen, index) => (
                            <div key={gen.id} className="aspect-square bg-neutral-800 rounded-xl overflow-hidden hover:ring-2 hover:ring-lime-400/50 transition-all duration-200 group-hover:scale-[1.02]">
                              {gen.type === 'video' ? (
                                <video 
                                  src={gen.url} 
                                  className="w-full h-full object-cover"
                                  muted
                                />
                              ) : (
                                <img 
                                  src={gen.url} 
                                  alt={`Generation ${index + 1}`}
                                  className="w-full h-full object-cover"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-white/50 text-sm">
                          <div className="mb-2">🎨</div>
                          <div>No creations yet</div>
                          <div className="text-xs text-white/30 mt-1">Start creating to see your work here</div>
                        </div>
                      )}
                    </div>
                    
                  </div>
                </>
              )}
              
            </div>
        </div>

        {/* Mobile Landing Layout */}
        <div className="md:hidden relative z-10 px-6 py-16 mt-16 space-y-12">
        {!user ? (
          <>
            {/* Hero Section */}
            <div className="text-center space-y-6">
              <h1 className="text-4xl font-light text-white">All-in-one AI Studio</h1>
              <p className="text-lg text-white/70 leading-relaxed max-w-md mx-auto">
                Create <span className="text-white">images & videos</span> in seconds with <span className="text-white">Lungo AI</span>. No tabs to switch, no setups needed.
              </p>
            </div>

            {/* Features Section */}
            <div className="space-y-12">
              
              {/* Feature 1: Image Generation */}
              <div className="space-y-4">
                <div className="w-full h-64 relative overflow-hidden rounded-2xl">
                  <img 
                    src="/im10.webp" 
                    alt="Generated Image Example" 
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="text-center space-y-3">
                  <h3 className="text-xl font-semibold text-white">Stunning Image Generation</h3>
                  <p className="text-sm text-white/60 leading-relaxed">
                    Create ultra-high quality images with perfect prompt understanding
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <img src="/logos/google_logo.webp" alt="Google" className="w-6 h-6 opacity-60"/>
                    <img src="/logos/flux_logo.webp" alt="Flux" className="w-6 h-6 opacity-60"/>
                    <img src="/logos/ideogram_logo.webp" alt="Ideogram" className="w-6 h-6 opacity-60"/>
                  </div>
                </div>
              </div>

              {/* Feature 2: Video Creation */}
              <div className="space-y-4">
                <div className="w-full h-64 relative overflow-hidden rounded-2xl">
                  <video 
                    autoPlay 
                    muted 
                    loop 
                    playsInline
                    className="w-full h-full object-cover"
                  >
                    <source src="/vid1.mp4" type="video/mp4" />
                  </video>
                </div>
                <div className="text-center space-y-3">
                  <h3 className="text-xl font-semibold text-white">Professional Video Creation</h3>
                  <p className="text-sm text-white/60 leading-relaxed">
                    Generate high-quality videos from text prompts in minutes
                  </p>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <img src="/logos/google_logo.webp" alt="Google" className="w-5 h-5 opacity-60"/>
                    <img src="/logos/bytedance_logo.webp" alt="ByteDance" className="w-5 h-5 opacity-60"/>
                    <img src="/logos/kling_logo.webp" alt="Kling" className="w-5 h-5 opacity-60"/>
                    <img src="/logos/minimax_logo.webp" alt="Minimax" className="w-5 h-5 opacity-60"/>
                    <img src="/logos/leonardo_logo.webp" alt="Leonardo" className="w-5 h-5 opacity-60"/>
                    <img src="/logos/runway_logo.webp" alt="Runway" className="w-5 h-5 opacity-60"/>
                  </div>
                </div>
              </div>

              {/* Feature 3: Image Editing */}
              <div className="space-y-4">
                <div className="w-full h-64 relative overflow-hidden rounded-2xl">
                  <img 
                    src="/Futuristic Pod in Urban Jungle copy.webp" 
                    alt="AI Model Example" 
                    className="w-full h-full object-cover absolute inset-0 transition-all duration-1000"
                    style={{
                      animation: 'imageSwap1 8s infinite ease-in-out'
                    }}
                  />
                  <img 
                    src="/generation-d5d746f2-bd7e-40ba-a093-04ced3885491 copy.png" 
                    alt="Generated Example" 
                    className="w-full h-full object-cover absolute inset-0 transition-all duration-1000"
                    style={{
                      animation: 'imageSwap2 8s infinite ease-in-out'
                    }}
                  />
                  <div 
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 opacity-0"
                    style={{
                      animation: 'editSweep 8s infinite ease-in-out',
                      animationDelay: '3.5s'
                    }}
                  ></div>
                </div>
                <div className="text-center space-y-3">
                  <h3 className="text-xl font-semibold text-white">Advanced Image Editing</h3>
                  <p className="text-sm text-white/60 leading-relaxed">
                    Edit any part of your image while maintaining perfect coherence
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <img src="/logos/flux_logo.webp" alt="Flux" className="w-6 h-6 opacity-60"/>
                    <img src="/logos/ideogram_logo.webp" alt="Ideogram" className="w-6 h-6 opacity-60"/>
                  </div>
                </div>
              </div>

            </div>

            {/* Models Section */}
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-2xl font-semibold text-white mb-2">Powered by Leading AI Models</h3>
                <p className="text-sm text-white/60">Access the most advanced AI models from top companies</p>
              </div>
              
              {/* Image Models */}
              <div className="space-y-4">
                <h4 className="text-lg font-medium text-white text-center">Image Generation</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-neutral-900/40 p-3 rounded-xl border border-neutral-700/50 text-center">
                    <img src="/logos/google_logo.webp" alt="Google" className="w-8 h-8 mx-auto mb-2 opacity-70"/>
                    <p className="text-xs text-white font-medium">Imagen 4</p>
                    <p className="text-xs text-white/50">Ultra</p>
                  </div>
                  <div className="bg-neutral-900/40 p-3 rounded-xl border border-neutral-700/50 text-center">
                    <img src="/logos/flux_logo.webp" alt="Flux" className="w-8 h-8 mx-auto mb-2 opacity-70"/>
                    <p className="text-xs text-white font-medium">Flux Kontext</p>
                    <p className="text-xs text-white/50">Max & Pro</p>
                  </div>
                  <div className="bg-neutral-900/40 p-3 rounded-xl border border-neutral-700/50 text-center">
                    <img src="/logos/ideogram_logo.webp" alt="Ideogram" className="w-8 h-8 mx-auto mb-2 opacity-70"/>
                    <p className="text-xs text-white font-medium">Ideogram V3</p>
                    <p className="text-xs text-white/50">Balanced</p>
                  </div>
                  <div className="bg-neutral-900/40 p-3 rounded-xl border border-neutral-700/50 text-center">
                    <img src="/logos/google_logo.webp" alt="Google" className="w-8 h-8 mx-auto mb-2 opacity-70"/>
                    <p className="text-xs text-white font-medium">Imagen 4</p>
                    <p className="text-xs text-white/50">Fast</p>
                  </div>
                </div>
              </div>

              {/* Video Models */}
              <div className="space-y-4">
                <h4 className="text-lg font-medium text-white text-center">Video Generation</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-neutral-900/40 p-3 rounded-xl border border-neutral-700/50 text-center">
                    <img src="/logos/google_logo.webp" alt="Google" className="w-8 h-8 mx-auto mb-2 opacity-70"/>
                    <p className="text-xs text-white font-medium">Veo 3</p>
                    <p className="text-xs text-white/50">Fast & Ultra</p>
                  </div>
                  <div className="bg-neutral-900/40 p-3 rounded-xl border border-neutral-700/50 text-center">
                    <img src="/logos/bytedance_logo.webp" alt="ByteDance" className="w-8 h-8 mx-auto mb-2 opacity-70"/>
                    <p className="text-xs text-white font-medium">Seedance</p>
                    <p className="text-xs text-white/50">Pro</p>
                  </div>
                  <div className="bg-neutral-900/40 p-3 rounded-xl border border-neutral-700/50 text-center">
                    <img src="/logos/kling_logo.webp" alt="Kling" className="w-8 h-8 mx-auto mb-2 opacity-70"/>
                    <p className="text-xs text-white font-medium">Kling v2.1</p>
                    <p className="text-xs text-white/50">Standard & Pro</p>
                  </div>
                  <div className="bg-neutral-900/40 p-3 rounded-xl border border-neutral-700/50 text-center">
                    <img src="/logos/minimax_logo.webp" alt="Minimax" className="w-8 h-8 mx-auto mb-2 opacity-70"/>
                    <p className="text-xs text-white font-medium">Hailuo 02</p>
                    <p className="text-xs text-white/50">768p & 1080p</p>
                  </div>
                  <div className="bg-neutral-900/40 p-3 rounded-xl border border-neutral-700/50 text-center">
                    <img src="/logos/leonardo_logo.webp" alt="Leonardo" className="w-8 h-8 mx-auto mb-2 opacity-70"/>
                    <p className="text-xs text-white font-medium">Motion 2.0</p>
                    <p className="text-xs text-white/50">Text & Image</p>
                  </div>
                  <div className="bg-neutral-900/40 p-3 rounded-xl border border-neutral-700/50 text-center">
                    <img src="/logos/runway_logo.webp" alt="Runway" className="w-8 h-8 mx-auto mb-2 opacity-70"/>
                    <p className="text-xs text-white font-medium">Gen4 Turbo</p>
                    <p className="text-xs text-white/50">Image to Video</p>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA Section */}
            <div className="bg-white/95 backdrop-blur-sm p-6 rounded-2xl border border-white/20 text-center space-y-4">
              <h3 className="text-xl font-semibold text-black">Start Creating Now</h3>
              <p className="text-sm text-black/70">
                ⚠️ Currently works best on desktop. Mobile experience coming soon!
              </p>
            </div>
          </>
        ) : (
          <div className="text-center space-y-6">
            <h1 className="text-4xl font-light text-white">Welcome back!</h1>
            <p className="text-lg text-white/70 leading-relaxed max-w-md mx-auto">
              Ready to create amazing content with AI? Use desktop for full experience.
            </p>
            <button
              onClick={() => navigate('/generation')}
              className="bg-lime-400 text-black px-6 py-3 rounded-xl text-lg font-medium"
            >
              Start Creating
            </button>
          </div>
        )}
        </div>
        
        {/* Pricing Modal */}
        <AnimatePresence>
        {isPricingModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-white dark:bg-neutral-950"
            onClick={() => setIsPricingModalOpen(false)}
          >
            {/* Close button */}
            <button 
              onClick={() => setIsPricingModalOpen(false)}
              className="fixed top-6 right-6 z-20 p-3 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-full text-stone-800 dark:text-stone-200 transition-colors shadow-lg"
              aria-label="Close pricing plans"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            {/* Full Page Content */}
            <div 
              className="h-full w-full overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
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
      </div>
    </>
  );
};

export default WelcomePage;