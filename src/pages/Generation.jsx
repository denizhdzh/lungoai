import React, { useEffect, useState } from 'react';
import { useOutletContext, useNavigate, useLocation } from 'react-router-dom';
import { DownloadSimple, ArrowClockwise, ArrowLeft, FloppyDisk, UserPlus, Image } from '@phosphor-icons/react'; 

function Generation() {
  // Get the image generation status from the Layout context
  const { isGeneratingImage } = useOutletContext() || { isGeneratingImage: false }; 
  // Removed location and state management for image display
  
  // Step-based animation states (only used during loading)
  const [currentStep, setCurrentStep] = useState(0);
  const steps = [
    { id: 1, name: 'Analyzing', description: 'Processing your prompt' },
    { id: 2, name: 'Creating', description: 'Generating the image' },
    { id: 3, name: 'Finalizing', description: 'Applying final touches' },
  ];

  // Effect to handle step progression (only runs if isGeneratingImage is true)
  useEffect(() => {
    if (!isGeneratingImage) {
        setCurrentStep(0); // Reset step if not generating
        return; 
    }
    
    // Simulate the step progression with timers
    const timers = [];
    const stepDuration = 7000; // Each step takes 7 seconds
    
    steps.forEach((step, index) => {
      const timer = setTimeout(() => {
        setCurrentStep(index);
      }, index * stepDuration);
      timers.push(timer);
    });
    
    // Cleanup timers on unmount or when generation stops
    return () => timers.forEach(timer => clearTimeout(timer));
  }, [isGeneratingImage]);

  // --- Removed Action Handlers ---

  // --- Simplified Conditional Rendering Logic ---

  // 1. Show Loading Indicator if isGeneratingImage is true
  if (isGeneratingImage) {
  return (
      <div className="flex items-center justify-center h-full flex-grow p-8">
        {/* Keep the existing loading UI */}
        <div className="w-full max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-center gap-12">
          {/* 9:16 bordered frame - LEFT SIDE */}
          <div className="relative aspect-[9/16] w-full max-w-[280px] rounded-lg border border-gray-200 dark:border-zinc-700 overflow-hidden shadow-sm dark:shadow-md">
            <div className="absolute inset-0 p-1 grid grid-cols-10 gap-[1px]">
              {Array.from({ length: 180 }).map((_, i) => (
                <div 
                  key={i} 
                  className="w-full aspect-square rounded-md bg-gradient-to-br from-gray-100 to-gray-200 dark:from-zinc-800 dark:to-zinc-900" 
                  style={{ 
                    animation: `fade-in-out 3s infinite ease-in-out ${Math.random() * 3}s` 
                  }}
                />
              ))}
            </div>
          </div>
          {/* Progress indicators - RIGHT SIDE */}
          <div className="flex-1 space-y-6 max-w-sm w-full">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Creating your image
            </h2>
            <div className="relative h-[3px] bg-gray-200 dark:bg-zinc-800 overflow-hidden rounded-full">
              <div 
                className="h-full bg-gray-800 dark:bg-white transition-all duration-700 ease-in-out rounded-full"
                style={{ width: `${(currentStep + 1) * (100/steps.length)}%` }}
              ></div>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900">
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {steps[currentStep].name}
              </p>
              <p className="text-sm text-gray-700 dark:text-zinc-400 mt-2">
                {steps[currentStep].description}
              </p>
              <div className="flex gap-2 mt-4">
                {steps.map((step, index) => (
                  <div 
                    key={index}
                    className={`h-1 flex-1 rounded-full ${
                      index <= currentStep 
                        ? 'bg-gray-800 dark:bg-white' 
                        : 'bg-gray-200 dark:bg-zinc-800'
                    }`}
                />
              ))}
              </div>
            </div>
            
            <div className="flex flex-col gap-4">
              <p className="text-sm text-gray-700 dark:text-zinc-400">
                Please wait while we craft your image...
              </p>
              
              <div className="flex gap-2 mt-2">
                <button className="px-3 py-1.5 rounded text-sm font-medium bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-zinc-800">
                  <ArrowLeft size={16} weight="bold" className="inline mr-1" />
                  Back
                </button>
                <button className="px-3 py-1.5 rounded text-sm font-medium bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-zinc-800">
                  <DownloadSimple size={16} weight="bold" className="inline mr-1" />
                  Download
                </button>
                <button className="px-3 py-1.5 rounded text-sm font-medium bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-zinc-800">
                  <UserPlus size={16} weight="bold" className="inline mr-1" />
                  Save as Creator
                </button>
                <button className="px-3 py-1.5 rounded text-sm font-medium bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-zinc-800">
                  <Image size={16} weight="bold" className="inline mr-1" />
                  Save as Background
                </button>
              </div>
            </div>
            </div>
        </div>
      </div>
    );
  }

  // 2. Show Initial/Empty State otherwise (When not generating)
  return (
    <div className="flex flex-col items-center justify-center h-full flex-grow p-8 text-center">
        <h2 className="text-xl font-medium text-gray-600 dark:text-zinc-400">
            Start creating an image!
        </h2>
        <p className="text-gray-500 dark:text-zinc-500 mt-2">
            Use the command bar below to generate your first image.
        </p>
    </div>
  );
}

// Add CSS for the specific animations
const CustomStyles = () => (
  <style jsx="true">{`
    @keyframes fade-in-out {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
  `}</style>
);

export default function GenerationWithStyles() {
  return (
    <>
      <CustomStyles />
      <Generation />
    </>
  );
} 