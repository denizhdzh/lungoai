
import { useOutletContext } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';

const WelcomePage = () => {
  const { user, setIsPricingModalOpen, firestoreUserData } = useOutletContext() || {};
  const navigate = useNavigate();

  return (
    <div className="min-h-32 relative overflow-hidden">
      
      {/* Right Side - Control Panel (3 Box Bento) */}
      <div className="fixed top-16 right-3 w-[420px] space-y-2 z-40">
          {/* Top Box - AI Platform Info */}
          <div 
            onClick={() => navigate('/models')}
            className="bg-neutral-950/40 backdrop-blur-xl p-6 rounded-3xl border border-neutral-700/50 flex-1 hover:bg-neutral-950/60 hover:border-neutral-600/70 transition-all duration-300 cursor-pointer relative"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-neutral-100 uppercase tracking-wider font-light tracking-wide">AI_PLATFORM</span>
              <span className="text-xs text-neutral-100 uppercase tracking-wider font-light tracking-wide">MODELS_AVAILABLE</span>
            </div>
            
            <div className="mb-6">
              <h2 className="text-2xl font-normal text-white mb-1">IMG & VID <span className="text-lime-400 font-light tracking-wide">Generation</span></h2>
              <div className="w-24 h-px bg-gradient-to-r from-lime-400 to-transparent mb-4"></div>
              <p className="text-sm text-neutral-400 leading-relaxed mb-2">
                Access cutting-edge models from OpenAI, Google, Flux & more.
              </p>
              <p className="text-sm text-neutral-400">
                No per-use fees. Single subscription.
              </p>
            </div>
            
            {/* Supported Models */}
            <div>
              <h3 className="text-xs text-neutral-500 uppercase tracking-wider font-light tracking-wide mb-3">SUPPORTED_MODELS</h3>
              <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-xs font-light tracking-wide">
                <div className="text-neutral-400">imagen_4</div>
                <div className="text-neutral-400">flux_1.1_pro</div>
                <div className="text-neutral-400">veo_3</div>
                <div className="text-neutral-400">ideogram_v3</div>
                <div className="text-neutral-400">kling_v2.1</div>
                <div className="text-neutral-400">hailuo_02</div>
                <div className="text-neutral-400">leonardo_motion</div>
                <div className="text-neutral-400">gen4_turbo</div>
                <div className="text-neutral-400">+6_more</div>
              </div>
            </div>
            {/* Click indicator */}
            <div className="absolute bottom-3 right-3 w-2 h-2 bg-lime-400/60 rounded-full animate-pulse"></div>
          </div>
          
          {/* Middle Box - Platform Introduction */}
          <div className="bg-neutral-950/40 backdrop-blur-xl p-6 rounded-3xl border border-neutral-700/50 flex-1">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-neutral-100 uppercase tracking-wider font-light tracking-wide">LUNGO_AI_PLATFORM</span>
              <span className="text-xs text-neutral-100 uppercase tracking-wider font-light tracking-wide">UNIFIED_EXPERIENCE</span>
            </div>
            
            <div className="mb-6">
              <h2 className="text-2xl font-normal text-white mb-1">Multi-Model <span className="text-lime-400 font-light tracking-wide">Studio</span></h2>
              <div className="w-24 h-px bg-gradient-to-r from-lime-400 to-transparent mb-4"></div>
              <p className="text-sm text-neutral-400">
                Test multiple AI models with one prompt, choose the best result.
              </p>
            </div>
            
            <div className="flex items-center justify-between text-xs font-light tracking-wide">
              <span className="text-neutral-500 uppercase tracking-wider">ONE_PROMPT → MULTIPLE_RESULTS</span>
            </div>
          </div>
          
          {/* Bottom Box - Credits or Pricing */}
          {user ? (
            // Credits for logged in users
            <div 
              onClick={() => setIsPricingModalOpen && setIsPricingModalOpen(true)}
              className="bg-neutral-950/40 backdrop-blur-xl p-6 rounded-3xl border border-neutral-700/50 flex-1 cursor-pointer hover:bg-neutral-950/60 hover:border-neutral-600/70 transition-all duration-300 relative"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-neutral-500 uppercase tracking-wider font-light tracking-wide">CREDITS_AVAILABLE</span>
                <span className="text-xs text-neutral-500 uppercase tracking-wider font-light tracking-wide">ACTIVE_PLAN</span>
              </div>
              
              <div className="mb-6">
                <div className="flex items-baseline justify-between mb-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-normal text-white">
                      {firestoreUserData?.general_credits?.toLocaleString() || '0'}
                    </span>
                    <span className="text-lg text-neutral-500 font-light tracking-wide">CR</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="text-2xl text-lime-400 font-normal">+</div>
                    <span className="text-xs text-neutral-500 uppercase font-light tracking-wide">TOP_UP</span>
                  </div>
                </div>
                <div className="w-24 h-px bg-gradient-to-r from-lime-400 to-transparent mb-6"></div>
              </div>
              
              <div className="flex items-center justify-between text-xs font-light tracking-wide">
                <span className="text-neutral-500 uppercase tracking-wider">
                  USAGE_TODAY: {firestoreUserData?.daily_credits_used?.toLocaleString() || '0'}CR
                </span>
              </div>
              {/* Click indicator */}
              <div className="absolute bottom-3 right-3 w-2 h-2 bg-lime-400/60 rounded-full animate-pulse"></div>
            </div>
          ) : (
            // Sign Up for non-logged users
            <div 
              onClick={() => navigate('/signup')}
              className="bg-neutral-950/40 backdrop-blur-xl p-6 rounded-3xl border border-neutral-700/50 flex-1 cursor-pointer hover:bg-neutral-950/60 hover:border-neutral-600/70 transition-all duration-300 relative"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-neutral-500 uppercase tracking-wider font-light tracking-wide">GET_STARTED</span>
                <span className="text-xs text-neutral-500 uppercase tracking-wider font-light tracking-wide">JOIN_NOW</span>
              </div>
              
              <div>
                <h2 className="text-2xl font-normal text-white mb-1">Sign <span className="text-lime-400 font-light tracking-wide">Up</span></h2>
                <div className="w-24 h-px bg-gradient-to-r from-lime-400 to-transparent"></div>
              </div>
              {/* Click indicator */}
              <div className="absolute bottom-3 right-3 w-2 h-2 bg-lime-400/60 rounded-full animate-pulse"></div>
            </div>
          )}
        </div>


      {/* Welcome Text and Bottom Action Section */}
      <div className="fixed bottom-0 left-0 right-0 z-10">

                
      {/* Generation Examples */}
      <div className="relative z-30 px-3 pb-3 space-y-2">
        {/* Video 1 */}
        <div className="bg-neutral-950/40 backdrop-blur-xl p-4 rounded-2xl border border-neutral-700/50 w-80">
          <div className="flex items-center gap-4">
            <video 
              src="/vid1.mp4" 
              autoPlay 
              loop 
              muted 
              className="w-16 h-16 rounded-xl object-cover"
            />
            <div>
              <h3 className="text-lg font-normal text-white mb-1">Motion <span className="text-lime-400 font-light">Video</span></h3>
              <p className="text-sm text-neutral-400">AI-powered video generation</p>
            </div>
          </div>
        </div>
        
        {/* Video 2 */}
        <div className="bg-neutral-950/40 backdrop-blur-xl p-4 rounded-2xl border border-neutral-700/50 w-80">
          <div className="flex items-center gap-4">
            <video 
              src="/vid2.mp4" 
              autoPlay 
              loop 
              muted 
              className="w-16 h-16 rounded-xl object-cover"
            />
            <div>
              <h3 className="text-lg font-normal text-white mb-1">Text to <span className="text-lime-400 font-light">Video</span></h3>
              <p className="text-sm text-neutral-400">From prompt to motion</p>
            </div>
          </div>
        </div>
        
        {/* Image */}
        <div className="bg-neutral-950/40 backdrop-blur-xl p-4 rounded-2xl border border-neutral-700/50 w-80">
          <div className="flex items-center gap-4">
            <img 
              src="/image.png" 
              alt="Generated image"
              className="w-16 h-16 rounded-xl object-cover"
            />
            <div>
              <h3 className="text-lg font-normal text-white mb-1">HD <span className="text-lime-400 font-light">Images</span></h3>
              <p className="text-sm text-neutral-400">Multi-model generation</p>
            </div>
          </div>
        </div>
      </div>
        
        {/* Welcome Text */}
        <div className="px-3 pb-1">
          <h1 className="text-6xl font-bold text-white mb-4">
            WELCOME TO LUNGO AI
          </h1>
        </div>
        
        {/* Bottom Action Bar - Only show if user is logged in */}
        {user ? (
          <div className="mx-3 mb-3 bg-neutral-950/40 backdrop-blur-xl border border-neutral-700/50 rounded-3xl">
          <div className="flex items-center justify-between px-8 py-6">
            {/* Left Side - Quick Actions */}
            <div className="flex items-center gap-6">
              <span className="text-xs text-neutral-500 uppercase tracking-wider font-light">QUICK_ACTIONS</span>
              <div className="w-8 h-px bg-gradient-to-r from-lime-400 to-transparent"></div>
              <div className="flex gap-3">
                <button className="bg-neutral-800/60 hover:bg-neutral-700/60 px-4 py-2 rounded-xl text-white text-sm font-light tracking-wide transition-all hover:scale-105">
                  text → img
                </button>
                <button className="bg-neutral-800/60 hover:bg-neutral-700/60 px-4 py-2 rounded-xl text-white text-sm font-light tracking-wide transition-all hover:scale-105">
                  img → vid
                </button>
                <button className="bg-neutral-800/60 hover:bg-neutral-700/60 px-4 py-2 rounded-xl text-white text-sm font-light tracking-wide transition-all hover:scale-105">
                  text → vid
                </button>
                <button className="bg-lime-500/80 hover:bg-lime-400/80 px-4 py-2 rounded-xl text-black text-sm font-medium tracking-wide transition-all hover:scale-105">
                  upscale
                </button>
              </div>
            </div>
            
            {/* Right Side - Start Button */}
            <div className="flex items-center gap-6">
              <span className="text-xs text-neutral-500 uppercase tracking-wider font-light">GENERATION_FLOW</span>
              <div className="w-8 h-px bg-gradient-to-r from-lime-400 to-transparent"></div>
              <button 
                onClick={() => navigate('/studio')}
                className="bg-white/90 hover:bg-white text-black px-8 py-3 rounded-2xl font-normal tracking-wide transition-all hover:scale-105 shadow-lg"
              >
                START
              </button>
            </div>
          </div>
        </div>
        ) : (
          // Sign Up Button for non-logged in users
          <div className="mx-3 mb-3 bg-neutral-950/40 backdrop-blur-xl border border-neutral-700/50 rounded-3xl">
            <div className="flex items-center justify-between px-8 py-6">
              <div className="flex items-center gap-4">
                <span className="text-xs text-neutral-500 uppercase tracking-wider font-light">MULTI_AI_GENERATION</span>
                <div className="w-6 h-px bg-gradient-to-r from-lime-400 to-transparent"></div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-neutral-300">Compare & choose from</span>
                  <span className="text-lime-400 font-medium">15+ AI models</span>
                  <span className="text-neutral-300">•</span>
                  <span className="text-neutral-300">Same prompt, different results</span>
                  <span className="text-neutral-300">•</span>
                  <span className="text-neutral-300">Best of OpenAI, Google, Flux</span>
                </div>
              </div>
              
              <button 
                onClick={() => navigate('/signup')}
                className="bg-white/90 hover:bg-white text-black px-8 py-3 rounded-2xl font-normal tracking-wide transition-all hover:scale-105 shadow-lg"
              >
                GET STARTED
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WelcomePage;