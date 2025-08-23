import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, Plus } from '@phosphor-icons/react';
import { auth, db } from '../firebase.js';
import { doc, onSnapshot } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import Header from '../components/Header.jsx';
import DynamicIsland from '../components/DynamicIsland.jsx';

const PortraitPage = () => {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [characterImage, setCharacterImage] = useState(null);
  const [targetImage, setTargetImage] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDragOverCharacter, setIsDragOverCharacter] = useState(false);
  const [isDragOverTarget, setIsDragOverTarget] = useState(false);
  const [generatedImage, setGeneratedImage] = useState(null);
  const [generatingItem, setGeneratingItem] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [currentPredictionId, setCurrentPredictionId] = useState(null);
  const characterInputRef = useRef(null);
  const targetInputRef = useRef(null);
  const navigate = useNavigate();

  // Add notification
  const addNotification = (message, type = 'info') => {
    const id = Date.now() + Math.random();
    const notification = { id, message, type, timestamp: new Date() };
    setNotifications(prev => [...prev, notification]);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  // Poll prediction status
  const pollPrediction = async (predictionId) => {
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes max (5 second intervals)
    
    const poll = async () => {
      attempts++;
      
      try {
        const { httpsCallable } = await import('firebase/functions');
        const { functions } = await import('../firebase.js');
        const pollPredictions = httpsCallable(functions, 'pollPredictions');
        
        const result = await pollPredictions({ predictionId });
        console.log('Poll result:', result.data);
        
        if (result.data.success) {
          const { status, output, error } = result.data;
          
          // Update DynamicIsland status
          setGeneratingItem(prev => prev ? {
            ...prev,
            status: status
          } : null);
          
          if (status === 'succeeded' && output) {
            console.log('Face swap completed!', output);
            
            // Handle the completed generation
            const contentUrl = Array.isArray(output) ? output[0] : output;
            
            const newGeneratedImage = {
              url: contentUrl,
              prompt: 'Face Swap Result',
              model: 'fofr/face-swap-with-ideogram',
              timestamp: new Date()
            };
            
            setGeneratedImage(newGeneratedImage);
            
            // Update to completed status
            setGeneratingItem(prev => prev ? {
              ...prev,
              status: 'completed'
            } : null);
            
            addNotification('Face swap generated successfully!', 'success');
            
            // Clear generating item after 3 seconds
            setTimeout(() => setGeneratingItem(null), 3000);
            
          } else if (status === 'failed') {
            console.error('Face swap failed:', error);
            
            setGeneratingItem(prev => prev ? {
              ...prev,
              status: 'failed'
            } : null);
            
            addNotification(`Face swap failed: ${error || 'Unknown error'}`, 'error');
            
            // Clear generating item after 5 seconds
            setTimeout(() => setGeneratingItem(null), 5000);
            
          } else if (status === 'starting' || status === 'processing') {
            // Continue polling
            if (attempts < maxAttempts) {
              setTimeout(poll, 5000); // Poll every 5 seconds
            } else {
              console.error('Polling timeout reached');
              addNotification('Face swap is taking longer than expected. Please check back later.', 'warning');
              setGeneratingItem(null);
            }
          }
        }
      } catch (error) {
        console.error('Error polling prediction:', error);
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000); // Longer interval on error
        } else {
          addNotification('Error checking generation status', 'error');
          setGeneratingItem(null);
        }
      }
    };
    
    // Start polling
    setTimeout(poll, 5000); // First poll after 5 seconds
  };

  // Check authentication
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthChecked(true);
    });
    return () => unsubscribe();
  }, []);

  // Handle file upload for character image
  const handleCharacterFileUpload = (files) => {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    
    const file = imageFiles[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const aspectRatio = img.width / img.height;
        const newImage = {
          id: Date.now() + Math.random(),
          file: file,
          url: e.target.result,
          name: file.name,
          aspectRatio: aspectRatio
        };
        setCharacterImage(newImage);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Handle file upload for target image
  const handleTargetFileUpload = (files) => {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    
    const file = imageFiles[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const aspectRatio = img.width / img.height;
        const newImage = {
          id: Date.now() + Math.random(),
          file: file,
          url: e.target.result,
          name: file.name,
          aspectRatio: aspectRatio
        };
        setTargetImage(newImage);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Handle drag events for character image
  const handleCharacterDragOver = (e) => {
    e.preventDefault();
    setIsDragOverCharacter(true);
  };

  const handleCharacterDragLeave = (e) => {
    e.preventDefault();
    setIsDragOverCharacter(false);
  };

  const handleCharacterDrop = (e) => {
    e.preventDefault();
    setIsDragOverCharacter(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleCharacterFileUpload(files);
    }
  };

  // Handle drag events for target image
  const handleTargetDragOver = (e) => {
    e.preventDefault();
    setIsDragOverTarget(true);
  };

  const handleTargetDragLeave = (e) => {
    e.preventDefault();
    setIsDragOverTarget(false);
  };

  const handleTargetDrop = (e) => {
    e.preventDefault();
    setIsDragOverTarget(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleTargetFileUpload(files);
    }
  };

  // Handle generate
  const handleGenerate = async () => {
    if (!user) {
      navigate('/signup');
      return;
    }

    if (!characterImage || !targetImage) {
      alert('Please upload both character and target images');
      return;
    }

    try {
      setIsGenerating(true);
      setGeneratedImage(null); // Clear previous result
      
      // Set generating item for DynamicIsland
      setGeneratingItem({
        type: 'faceswap',
        name: 'Face Swap',
        status: 'generating',
        model: 'fofr/face-swap-with-ideogram'
      });
      
      // Prepare data for Firebase function
      const generationData = {
        model: 'fofr/face-swap-with-ideogram',
        prompt: prompt.trim() || undefined
      };

      // Convert local files to base64 data URI for Firebase function
      const characterBase64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(characterImage.file);
      });

      const targetBase64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(targetImage.file);
      });

      generationData.character_image = characterBase64;
      generationData.target_image = targetBase64;

      console.log('🔥 FACE SWAP DEBUG - Sending generation request:', generationData);

      // Call Firebase function
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('../firebase.js');
      const generateImage = httpsCallable(functions, 'generateImage');
      const result = await generateImage(generationData);

      console.log('Face swap result:', result?.data);

      if (result?.data?.success) {
        // Handle async prediction
        if (result.data.isAsync && result.data.predictionId) {
          console.log(`Face swap prediction created: ${result.data.predictionId}`);
          setCurrentPredictionId(result.data.predictionId);
          addNotification('Face swap started. This may take a few minutes...', 'info');
          
          // Start polling for async prediction
          pollPrediction(result.data.predictionId);
          // Keep generating state - polling will handle completion
          return;
        }
        // Handle sync result (if any)
        else if (result.data.imageUrl) {
          console.log(`Face swap generated successfully! URL: ${result.data.imageUrl}`);
          
          // Set the generated image to display
          const newGeneratedImage = {
            url: result.data.imageUrl,
            prompt: 'Face Swap Result',
            model: 'fofr/face-swap-with-ideogram',
            timestamp: new Date()
          };
          
          setGeneratedImage(newGeneratedImage);
          
          // Update DynamicIsland to completed
          setGeneratingItem({
            type: 'faceswap',
            name: 'Face Swap',
            status: 'completed',
            model: 'fofr/face-swap-with-ideogram'
          });
          
          addNotification('Face swap generated successfully!', 'success');
          
          // Clear generating item after 3 seconds
          setTimeout(() => setGeneratingItem(null), 3000);
          
        } else {
          throw new Error('No image URL returned');
        }
      } else {
        console.error('Face swap failed:', result?.data);
        
        setGeneratingItem({
          type: 'faceswap',
          name: 'Face Swap',
          status: 'failed',
          model: 'fofr/face-swap-with-ideogram'
        });
        
        addNotification(`Face swap failed: ${result?.data?.error || 'Unknown error'}`, 'error');
        
        // Clear generating item after 5 seconds
        setTimeout(() => setGeneratingItem(null), 5000);
      }

    } catch (error) {
      console.error('Face swap error:', error);
      
      setGeneratingItem({
        type: 'faceswap',
        name: 'Face Swap',
        status: 'failed',
        model: 'fofr/face-swap-with-ideogram'
      });
      
      addNotification(`Face swap failed: ${error.message}`, 'error');
      
      // Clear generating item after 5 seconds
      setTimeout(() => setGeneratingItem(null), 5000);
    } finally {
      setIsGenerating(false);
    }
  };

  // Show loading while checking auth
  if (!authChecked) {
    return (
      <div className="h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  // Don't render if not authenticated
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-neutral-950 relative">
      {/* Header Component */}
      <Header />
      
      {/* DynamicIsland */}
      <DynamicIsland 
        generatingItem={generatingItem}
        isDarkMode={true}
        position="bottom-right"
      />

      {/* Main Content */}
      <div className="flex items-center justify-center min-h-[calc(100vh-200px)] px-4">
        

        {generatedImage ? (
          /* Generated Result Display */
          <div className="relative bg-transparent p-4 w-full max-w-4xl">
            <div className="w-full h-full rounded-[60px] overflow-hidden bg-neutral-900 shadow-2xl relative group">
              <img 
                src={generatedImage.url} 
                alt={generatedImage.prompt}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              
              {/* Generated image overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="text-white text-sm font-medium mb-1">{generatedImage.model}</div>
                <div className="text-white/80 text-xs truncate">Face Swap Complete</div>
              </div>
              
              {/* Action Buttons */}
              <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 z-10">
                {/* Clear/New Generation Button */}
                <button
                  onClick={() => {
                    setGeneratedImage(null);
                    setPrompt('');
                    setCharacterImage(null);
                    setTargetImage(null);
                  }}
                  title="Clear and start new face swap"
                  className="w-10 h-10 bg-neutral-800/80 hover:bg-neutral-700 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110"
                >
                  <X size={20} className="text-white" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Image Upload Areas */
          <div className="grid md:grid-cols-2 gap-8 w-full max-w-6xl">
          
          {/* Character Image Upload */}
          <div className="flex flex-col">
            <label className="text-white text-sm font-medium mb-3">Character Face (Reference)</label>
            <div 
              className={`relative aspect-[4/3] rounded-3xl border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden ${
                isDragOverCharacter 
                  ? 'border-lime-400 bg-neutral-800' 
                  : characterImage 
                    ? 'border-neutral-600 bg-neutral-900' 
                    : 'border-neutral-700 bg-neutral-900 hover:border-neutral-600 hover:bg-neutral-800'
              }`}
              onDragOver={handleCharacterDragOver}
              onDragLeave={handleCharacterDragLeave}
              onDrop={handleCharacterDrop}
              onClick={() => characterInputRef.current?.click()}
            >
              {characterImage ? (
                <>
                  <img 
                    src={characterImage.url} 
                    alt={characterImage.name}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCharacterImage(null);
                    }}
                    className="absolute top-4 right-4 w-8 h-8 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 z-10"
                  >
                    <X size={16} className="text-white" />
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className={`mb-4 transition-colors ${isDragOverCharacter ? 'text-lime-400' : 'text-neutral-400'}`}>
                    <Upload size={48} className="mx-auto mb-2" />
                    <div className="text-lg font-medium mb-2">
                      {isDragOverCharacter ? 'Drop character image here' : 'Upload Character Face'}
                    </div>
                    <div className="text-sm text-neutral-500">
                      The face that will be used as reference
                    </div>
                  </div>
                </div>
              )}
            </div>
            <input
              ref={characterInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleCharacterFileUpload(e.target.files)}
            />
          </div>

          {/* Target Image Upload */}
          <div className="flex flex-col">
            <label className="text-white text-sm font-medium mb-3">Target Image (Environment)</label>
            <div 
              className={`relative aspect-[4/3] rounded-3xl border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden ${
                isDragOverTarget 
                  ? 'border-lime-400 bg-neutral-800' 
                  : targetImage 
                    ? 'border-neutral-600 bg-neutral-900' 
                    : 'border-neutral-700 bg-neutral-900 hover:border-neutral-600 hover:bg-neutral-800'
              }`}
              onDragOver={handleTargetDragOver}
              onDragLeave={handleTargetDragLeave}
              onDrop={handleTargetDrop}
              onClick={() => targetInputRef.current?.click()}
            >
              {targetImage ? (
                <>
                  <img 
                    src={targetImage.url} 
                    alt={targetImage.name}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setTargetImage(null);
                    }}
                    className="absolute top-4 right-4 w-8 h-8 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 z-10"
                  >
                    <X size={16} className="text-white" />
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className={`mb-4 transition-colors ${isDragOverTarget ? 'text-lime-400' : 'text-neutral-400'}`}>
                    <Upload size={48} className="mx-auto mb-2" />
                    <div className="text-lg font-medium mb-2">
                      {isDragOverTarget ? 'Drop target image here' : 'Upload Target Image'}
                    </div>
                    <div className="text-sm text-neutral-500">
                      The image where the face will be placed
                    </div>
                  </div>
                </div>
              )}
            </div>
            <input
              ref={targetInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleTargetFileUpload(e.target.files)}
            />
          </div>

          </div>
        )}
      </div>

      {/* Bottom Bar */}
      <div className="fixed bottom-3 md:bottom-5 left-1/2 transform -translate-x-1/2 rounded-2xl md:rounded-3xl p-2 md:p-4 bg-neutral-950/40 backdrop-blur-xl border border-neutral-700/50 w-[95%] md:w-full max-w-4xl">
        <div className="flex items-center gap-4">
          {/* Prompt Input */}
          <div className="flex-1">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Optional: Describe specific adjustments or style preferences..."
              className="w-full bg-transparent border-none rounded-xl px-3 py-3 text-white placeholder-neutral-500 resize-none focus:outline-none text-sm font-light tracking-wide h-16"
            />
          </div>
          
          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={!characterImage || !targetImage || isGenerating}
            className="px-8 py-4 bg-lime-400 hover:bg-lime-300 text-black font-medium tracking-wide rounded-xl disabled:bg-neutral-700/50 disabled:text-neutral-500 transition-all shadow-lg text-sm flex flex-col items-center justify-center gap-1"
          >
            <span>{isGenerating ? 'GENERATING...' : 'GENERATE'}</span>
            <span className="text-black font-bold text-xs tracking-wider uppercase">
              2 CREDITS
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PortraitPage;