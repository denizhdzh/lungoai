import { useState } from 'react';

const InteractiveFaceSwapDemo = () => {
  const [demoState, setDemoState] = useState('ready'); // ready, generating, result
  
  // Demo images - you'll replace these with your actual images
  const sourceImage = "/demo/character-source.jpg"; // Original person's face
  const resultImages = [
    "/demo/character-medieval.jpg",    // Medieval knight
    "/demo/character-cyberpunk.jpg",   // Cyberpunk style
    "/demo/character-anime.jpg",       // Anime style
    "/demo/character-vintage.jpg",     // Vintage portrait
    "/demo/character-fantasy.jpg",     // Fantasy character
    "/demo/character-modern.jpg"       // Modern professional
  ];
  
  const handleTryDemo = () => {
    setDemoState('generating');
    
    // Simulate AI processing time
    setTimeout(() => {
      setDemoState('result');
    }, 3500);
  };
  
  const resetDemo = () => {
    setDemoState('ready');
  };
  
  return (
    <div className="py-24 px-4 md:px-10">
      <div className="max-w-6xl mx-auto">
        
        {/* Section header */}
        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-4 mb-8">
            <div className="w-8 h-px bg-white/20"></div>
            <h2 className="text-3xl md:text-5xl font-light text-white">Character consistency with face swap</h2>
            <div className="w-8 h-px bg-white/20"></div>
          </div>
          <p className="text-white/50 text-lg max-w-2xl mx-auto">
            Transform one face into multiple characters while maintaining identity and expressions
          </p>
        </div>

        {/* Demo Area */}
        <div className="bg-neutral-900/50 rounded-lg p-8 md:p-12">
          
          {demoState === 'ready' && (
            <div>
              {/* Input and Preview */}
              <div className="grid lg:grid-cols-3 gap-8 mb-8">
                {/* Source Face - Left Side */}
                <div className="text-center">
                  <div className="relative mb-4">
                    <img 
                      src={sourceImage} 
                      alt="Original face" 
                      className="w-full h-80 object-cover rounded-lg"
                    />
                    <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                      Original face
                    </div>
                  </div>
                  <p className="text-white/60">Upload your photo</p>
                </div>
                
                {/* Arrow */}
                <div className="hidden lg:flex items-center justify-center">
                  <div className="text-white/40 text-4xl">→</div>
                </div>
                
                {/* Character Styles - Right Side */}
                <div className="lg:col-span-1">
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {Array.from({length: 6}).map((_, index) => (
                      <div key={index} className="relative">
                        <div className="w-full h-24 bg-neutral-800/50 rounded-lg flex items-center justify-center border-2 border-dashed border-white/10">
                          <span className="text-white/30 text-xs">Style {index + 1}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-white/60 text-center">6 character variations</p>
                </div>
              </div>
              
              {/* Try Button */}
              <div className="text-center">
                <button
                  onClick={handleTryDemo}
                  className="bg-white text-neutral-950 px-8 py-4 text-lg font-medium hover:bg-white/90 transition-colors duration-300 group"
                >
                  <span className="group-hover:tracking-wide transition-all duration-300">✨ Generate character variations</span>
                </button>
                <p className="text-white/40 text-sm mt-2">Takes ~4 seconds • Uses 3 credits per style</p>
              </div>
            </div>
          )}

          {demoState === 'generating' && (
            <div className="text-center py-16">
              <div className="mb-8">
                <div className="animate-spin w-16 h-16 border-4 border-white/10 border-t-white rounded-full mx-auto mb-4"></div>
                <h3 className="text-2xl font-light text-white mb-2">Creating character variations...</h3>
                <p className="text-white/60">Generating 6 unique styles while preserving facial identity</p>
              </div>
              
              {/* Processing steps */}
              <div className="max-w-md mx-auto space-y-2">
                <div className="flex items-center justify-between text-sm text-white/50">
                  <span>Analyzing facial features</span>
                  <span>✓</span>
                </div>
                <div className="flex items-center justify-between text-sm text-white/50">
                  <span>Mapping identity markers</span>
                  <span>✓</span>
                </div>
                <div className="flex items-center justify-between text-sm text-white/70">
                  <span>Generating character styles...</span>
                  <div className="w-3 h-3 bg-white/70 rounded-full animate-pulse"></div>
                </div>
                <div className="flex items-center justify-between text-sm text-white/30">
                  <span>Finalizing variations</span>
                  <span>⏳</span>
                </div>
              </div>
            </div>
          )}

          {demoState === 'result' && (
            <div>
              {/* Result */}
              <div className="mb-8">
                <h3 className="text-2xl font-light text-white mb-6 text-center">✨ Character variations generated!</h3>
                
                <div className="grid lg:grid-cols-3 gap-8">
                  {/* Original */}
                  <div className="text-center">
                    <div className="relative mb-4">
                      <img 
                        src={sourceImage} 
                        alt="Original" 
                        className="w-full h-80 object-cover rounded-lg opacity-50"
                      />
                      <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                        Original
                      </div>
                    </div>
                    <p className="text-white/40">Input photo</p>
                  </div>
                  
                  {/* Arrow */}
                  <div className="hidden lg:flex items-center justify-center">
                    <div className="text-green-400 text-4xl">→</div>
                  </div>
                  
                  {/* Generated Variations */}
                  <div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {resultImages.map((image, index) => (
                        <div key={index} className="relative">
                          <img 
                            src={image} 
                            alt={`Character style ${index + 1}`}
                            className="w-full h-24 object-cover rounded-lg"
                          />
                          <div className="absolute top-1 left-1 bg-green-600/80 text-white text-xs px-1 py-0.5 rounded">
                            Style {index + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-green-400 text-center text-sm font-medium">Identity preserved across all styles</p>
                  </div>
                </div>
              </div>
              
              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <a 
                  href="/signup" 
                  className="bg-white text-neutral-950 px-8 py-4 text-lg font-medium hover:bg-white/90 transition-colors duration-300"
                >
                  Create your character variations
                </a>
                <button
                  onClick={resetDemo}
                  className="text-white/60 hover:text-white transition-colors border-b border-white/20 hover:border-white/60 pb-1"
                >
                  Try demo again
                </button>
              </div>
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
};

export default InteractiveFaceSwapDemo;