
import { useOutletContext } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { db } from '../firebase.js';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';

const WelcomePage = () => {
  const { user, setIsPricingModalOpen, firestoreUserData } = useOutletContext() || {};
  const navigate = useNavigate();
  const [recentGenerations, setRecentGenerations] = useState([]);
  const [isLoadingGenerations, setIsLoadingGenerations] = useState(true);
  
  // Fetch recent generations for logged in users
  useEffect(() => {
    const fetchRecentGenerations = async () => {
      if (!user) {
        setIsLoadingGenerations(false);
        return;
      }
      
      try {
        const generationsRef = collection(db, 'users', user.uid, 'generations');
        const q = query(
          generationsRef,
          orderBy('timestamp', 'desc'),
          limit(7)
        );
        
        const querySnapshot = await getDocs(q);
        const generations = [];
        querySnapshot.forEach((doc) => {
          generations.push({
            id: doc.id,
            ...doc.data()
          });
        });
        
        setRecentGenerations(generations);
      } catch (error) {
        console.error('Error fetching recent generations:', error);
      } finally {
        setIsLoadingGenerations(false);
      }
    };
    
    fetchRecentGenerations();
  }, [user]);

  return (
    <div className="min-h-32 relative overflow-hidden">
      
      {/* Mobile Landing Page */}
      <div className="xl:hidden min-h-screen relative overflow-hidden">
        
        {/* Mobile Content */}
        <div className="px-3 pt-20 pb-12 space-y-3">
          
          {/* Mobile Title */}
          <div className="text-center mb-8">
            <div className="mb-2">
              <span className="text-lg font-light text-lime-400 tracking-[0.3em] uppercase">LUNGO</span>
            </div>
            <h1 className="text-4xl font-bold text-white mb-3 leading-tight">
              AI MEDIA<br/><span className="text-lime-400">STUDIO</span>
            </h1>
            <p className="text-sm text-neutral-400 max-w-xs mx-auto">
              Where creativity meets artificial intelligence — create stunning visuals in seconds
            </p>
          </div>

          {/* Generation Examples */}
          <div className="space-y-3">
            {/* Video 1 */}
            <div className="bg-neutral-950/40 backdrop-blur-xl p-4 rounded-3xl border border-neutral-700/50">
              <div className="flex items-center gap-4">
                <video 
                  src="/vid1.mp4" 
                  autoPlay 
                  loop 
                  muted 
                  className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-lg font-normal text-white">Motion <span className="text-lime-400 font-light">Video</span></h3>
                    <span className="text-xs text-neutral-500 uppercase tracking-wider font-light">AI_GENERATED</span>
                  </div>
                  <p className="text-sm text-neutral-400">Advanced video generation with AI models</p>
                </div>
              </div>
            </div>
            
            {/* Video 2 */}
            <div className="bg-neutral-950/40 backdrop-blur-xl p-4 rounded-3xl border border-neutral-700/50">
              <div className="flex items-center gap-4">
                <video 
                  src="/vid2.mp4" 
                  autoPlay 
                  loop 
                  muted 
                  className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-lg font-normal text-white">Text to <span className="text-lime-400 font-light">Video</span></h3>
                    <span className="text-xs text-neutral-500 uppercase tracking-wider font-light">TEXT_PROMPT</span>
                  </div>
                  <p className="text-sm text-neutral-400">From simple text to dynamic motion</p>
                </div>
              </div>
            </div>
            
            {/* Image */}
            <div className="bg-neutral-950/40 backdrop-blur-xl p-4 rounded-3xl border border-neutral-700/50">
              <div className="flex items-center gap-4">
                <img 
                  src="/image.png" 
                  alt="Generated image"
                  className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-lg font-normal text-white">HD <span className="text-lime-400 font-light">Images</span></h3>
                    <span className="text-xs text-neutral-500 uppercase tracking-wider font-light">4K_QUALITY</span>
                  </div>
                  <p className="text-sm text-neutral-400">High-resolution image generation</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Welcome Header Box */}
          <div className="bg-neutral-950/40 backdrop-blur-xl p-6 rounded-3xl border border-neutral-700/50">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-neutral-100 uppercase tracking-wider font-light">WELCOME_TO</span>
              <span className="text-xs text-neutral-100 uppercase tracking-wider font-light">LUNGO_AI</span>
            </div>
            
            <div className="mb-6">
              <h1 className="text-3xl font-normal text-white mb-1">
                Multi-Model <span className="text-lime-400 font-light tracking-wide">AI Platform</span>
              </h1>
              <div className="w-24 h-px bg-gradient-to-r from-lime-400 to-transparent mb-4"></div>
              <p className="text-sm text-neutral-400 leading-relaxed mb-3">
                Compare & create with 15+ AI models in one platform.
              </p>
              <p className="text-xs text-neutral-500">
                No switching between platforms. No per-model subscriptions.
              </p>
            </div>
            
            {/* Key Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center">
                <div className="text-xl font-normal text-white">15+</div>
                <div className="text-xs text-neutral-500 uppercase tracking-wider font-light">Models</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-normal text-lime-400">2</div>
                <div className="text-xs text-neutral-500 uppercase tracking-wider font-light">Types</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-normal text-white">1</div>
                <div className="text-xs text-neutral-500 uppercase tracking-wider font-light">Platform</div>
              </div>
            </div>
            
            {/* AI Models Grid */}
            <div>
              <h3 className="text-xs text-neutral-500 uppercase tracking-wider font-light mb-3">TOP_MODELS</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-light tracking-wide">
                <div className="text-neutral-400">google_imagen_4</div>
                <div className="text-neutral-400">flux_1.1_pro</div>
                <div className="text-neutral-400">google_veo_3</div>
                <div className="text-neutral-400">ideogram_v3</div>
                <div className="text-neutral-400">kling_v2.1</div>
                <div className="text-neutral-400">hailuo_02</div>
              </div>
            </div>
          </div>

          {/* How It Works Box */}
          <div className="bg-neutral-950/40 backdrop-blur-xl p-6 rounded-3xl border border-neutral-700/50">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-neutral-100 uppercase tracking-wider font-light">HOW_IT_WORKS</span>
              <span className="text-xs text-neutral-100 uppercase tracking-wider font-light">3_STEPS</span>
            </div>
            
            <div className="mb-6">
              <h2 className="text-2xl font-normal text-white mb-1">Simple <span className="text-lime-400 font-light tracking-wide">Workflow</span></h2>
              <div className="w-24 h-px bg-gradient-to-r from-lime-400 to-transparent mb-4"></div>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-6 h-6 bg-lime-400/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs text-lime-400 font-medium">1</span>
                </div>
                <div>
                  <div className="text-sm font-medium text-white mb-1">Write your prompt</div>
                  <div className="text-xs text-neutral-400">Describe what you want to create</div>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-6 h-6 bg-lime-400/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs text-lime-400 font-medium">2</span>
                </div>
                <div>
                  <div className="text-sm font-medium text-white mb-1">Choose AI models</div>
                  <div className="text-xs text-neutral-400">Select from 15+ cutting-edge models</div>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-6 h-6 bg-lime-400/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs text-lime-400 font-medium">3</span>
                </div>
                <div>
                  <div className="text-sm font-medium text-white mb-1">Compare & pick best</div>
                  <div className="text-xs text-neutral-400">See results side-by-side</div>
                </div>
              </div>
            </div>
          </div>

          {/* Platform Features Box */}
          <div className="bg-neutral-950/40 backdrop-blur-xl p-6 rounded-3xl border border-neutral-700/50">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-neutral-100 uppercase tracking-wider font-light">GENERATION_TYPES</span>
              <span className="text-xs text-neutral-100 uppercase tracking-wider font-light">ALL_IN_ONE</span>
            </div>
            
            <div className="mb-6">
              <h2 className="text-2xl font-normal text-white mb-1">IMG & VID <span className="text-lime-400 font-light tracking-wide">Generation</span></h2>
              <div className="w-24 h-px bg-gradient-to-r from-lime-400 to-transparent mb-4"></div>
              <p className="text-sm text-neutral-400 leading-relaxed">
                Create both images & videos with cutting-edge AI models.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-white">Image Generation</div>
                  <div className="text-xs text-neutral-400">4K quality, instant results</div>
                </div>
                <div className="text-xs text-lime-400 font-medium">10+ models</div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-white">Video Creation</div>
                  <div className="text-xs text-neutral-400">Up to 10s, 1080p output</div>
                </div>
                <div className="text-xs text-lime-400 font-medium">5+ models</div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-white">Batch Processing</div>
                  <div className="text-xs text-neutral-400">Multiple generations at once</div>
                </div>
                <div className="text-xs text-neutral-400">Desktop only</div>
              </div>
            </div>
          </div>

          {/* Pricing Teaser Box */}
          <div className="bg-neutral-950/40 backdrop-blur-xl p-6 rounded-3xl border border-neutral-700/50">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-neutral-100 uppercase tracking-wider font-light">PRICING_MODEL</span>
              <span className="text-xs text-neutral-100 uppercase tracking-wider font-light">SIMPLE</span>
            </div>
            
            <div className="mb-6">
              <h2 className="text-2xl font-normal text-white mb-1">Credit <span className="text-lime-400 font-light tracking-wide">System</span></h2>
              <div className="w-24 h-px bg-gradient-to-r from-lime-400 to-transparent mb-4"></div>
              <p className="text-sm text-neutral-400 leading-relaxed mb-4">
                Pay once, use any model. No per-model subscriptions.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 px-3 bg-neutral-900/30 rounded-xl">
                <span className="text-sm text-neutral-300">Images</span>
                <span className="text-xs text-lime-400">1-2 credits</span>
              </div>
              <div className="flex items-center justify-between py-2 px-3 bg-neutral-900/30 rounded-xl">
                <span className="text-sm text-neutral-300">Videos</span>
                <span className="text-xs text-lime-400">5-20 credits</span>
              </div>
              <div className="text-center pt-2">
                <span className="text-xs text-neutral-500">Starting at $14/month • 200 credits</span>
              </div>
            </div>
          </div>

          {/* Credits/Auth Box */}
          {user ? (
            <div 
              onClick={() => setIsPricingModalOpen && setIsPricingModalOpen(true)}
              className="bg-neutral-950/40 backdrop-blur-xl p-6 rounded-3xl border border-neutral-700/50 cursor-pointer hover:bg-neutral-950/60 hover:border-neutral-600/70 transition-all duration-300 relative"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-neutral-500 uppercase tracking-wider font-light">CREDITS_AVAILABLE</span>
                <span className="text-xs text-neutral-500 uppercase tracking-wider font-light">ACTIVE_PLAN</span>
              </div>
              
              <div className="mb-6">
                <div className="flex items-baseline justify-between mb-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-normal text-white">
                      {((firestoreUserData?.general_credits || 0) + (firestoreUserData?.one_time_credits || 0)).toLocaleString()}
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
              <div className="absolute bottom-3 right-3 w-2 h-2 bg-lime-400/60 rounded-full animate-pulse"></div>
            </div>
          ) : (
            <div className="bg-neutral-950/40 backdrop-blur-xl p-6 rounded-3xl border border-neutral-700/50">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-neutral-500 uppercase tracking-wider font-light">GET_STARTED</span>
                <span className="text-xs text-neutral-500 uppercase tracking-wider font-light">JOIN_NOW</span>
              </div>
              
              <div className="mb-6">
                <h2 className="text-2xl font-normal text-white mb-1">Sign <span className="text-lime-400 font-light tracking-wide">Up</span></h2>
                <div className="w-24 h-px bg-gradient-to-r from-lime-400 to-transparent mb-4"></div>
                <p className="text-sm text-neutral-400 leading-relaxed mb-4">
                  Start creating with 15+ AI models
                </p>
              </div>

              <div className="space-y-3">
                <button 
                  onClick={() => navigate('/signup')}
                  className="w-full bg-white/90 hover:bg-white text-black px-6 py-3 rounded-2xl font-normal tracking-wide transition-all hover:scale-105 shadow-lg"
                >
                  GET STARTED
                </button>
                <button 
                  onClick={() => navigate('/login')}
                  className="w-full bg-neutral-800/60 hover:bg-neutral-700/60 text-white px-6 py-3 rounded-2xl font-normal tracking-wide transition-all"
                >
                  SIGN IN
                </button>
              </div>
            </div>
          )}

          {/* Desktop Experience Note */}
          <div className="bg-neutral-950/40 backdrop-blur-xl p-4 rounded-3xl border border-neutral-700/50">
            <div className="text-center">
              <p className="text-xs text-neutral-500 uppercase tracking-wider font-light mb-2">BEST_EXPERIENCE</p>
              <p className="text-sm text-neutral-400">
                Advanced tools work best on desktop • Mobile app coming soon
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* Desktop Layout - Full Bento Grid Center */}
      <div className="hidden xl:block min-h-screen relative">
      
      {/* Center - Main Bento Grid (Everything Centered) */}
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[900px] z-30">
        <div className="grid grid-cols-4 gap-3">
          
          {/* Hero Platform Info - Full Width Top */}
          <div className="col-span-4 bg-neutral-950/40 backdrop-blur-xl p-6 rounded-3xl border border-neutral-700/50 relative">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="mb-3">
                  <div className="mb-2">
                    <span className="text-lg font-light text-lime-400 tracking-[0.4em] uppercase">LUNGO</span>
                  </div>
                  {user ? (
                    <h1 className="text-2xl font-bold text-white mb-2 leading-tight">
                      Welcome back, <span className="text-lime-400">{user.displayName?.split(' ')[0] || 'Creator'}</span>
                    </h1>
                  ) : (
                    <h1 className="text-2xl font-bold text-white mb-2 leading-tight">
                      All AI Models <span className="text-lime-400">In One Place</span>
                    </h1>
                  )}
                  <p className="text-sm text-neutral-300 max-w-md leading-relaxed">
                    {user ? 
                      'Ready to create something amazing? Your AI studio is waiting for you.' :
                      'Create amazing images and videos with 15+ top AI models. No need to switch between different apps.'
                    }
                  </p>
                </div>
              </div>
              
              <div className="flex-1 max-w-md">
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-neutral-800/50 p-3 rounded-2xl text-center">
                    <img src="/logos/google_logo.png" alt="Google" className="w-6 h-6 mx-auto mb-1 opacity-80"/>
                    <div className="text-[10px] text-neutral-400">Google</div>
                  </div>
                  <div className="bg-neutral-800/50 p-3 rounded-2xl text-center">
                    <img src="/logos/flux_logo.png" alt="Flux" className="w-6 h-6 mx-auto mb-1 opacity-80"/>
                    <div className="text-[10px] text-neutral-400">Flux</div>
                  </div>
                  <div className="bg-neutral-800/50 p-3 rounded-2xl text-center">
                    <img src="/logos/runway_logo.png" alt="Runway" className="w-6 h-6 mx-auto mb-1 opacity-80"/>
                    <div className="text-[10px] text-neutral-400">Runway</div>
                  </div>
                  <div className="bg-neutral-800/50 p-3 rounded-2xl text-center">
                    <img src="/logos/kling_logo.png" alt="Kling" className="w-6 h-6 mx-auto mb-1 opacity-80"/>
                    <div className="text-[10px] text-neutral-400">Kling</div>
                  </div>
                  <div className="bg-neutral-800/50 p-3 rounded-2xl text-center">
                    <img src="/logos/ideogram_logo.png" alt="Ideogram" className="w-6 h-6 mx-auto mb-1 opacity-80"/>
                    <div className="text-[10px] text-neutral-400">Ideogram</div>
                  </div>
                  <div className="bg-neutral-800/50 p-3 rounded-2xl text-center">
                    <img src="/logos/leonardo_logo.png" alt="Leonardo" className="w-6 h-6 mx-auto mb-1 opacity-80"/>
                    <div className="text-[10px] text-neutral-400">Leonardo</div>
                  </div>
                  <div className="bg-neutral-800/50 p-3 rounded-2xl text-center">
                    <img src="/logos/minimax_logo.png" alt="Minimax" className="w-6 h-6 mx-auto mb-1 opacity-80"/>
                    <div className="text-[10px] text-neutral-400">Minimax</div>
                  </div>
                  <div className="bg-lime-400/20 p-3 rounded-2xl text-center border border-lime-400/30">
                    <div className="w-6 h-6 mx-auto mb-1 rounded-full bg-lime-400/60 flex items-center justify-center">
                      <span className="text-[8px] text-white font-bold">+8</span>
                    </div>
                    <div className="text-[10px] text-lime-400">More</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="absolute bottom-3 right-3 w-2 h-2 bg-lime-400/60 rounded-full animate-pulse"></div>
          </div>

          {/* Latest AI Models News Feed or Recent Activity */}
          {user ? (
            <div 
              onClick={() => navigate('/studio')}
              className="bg-neutral-950/40 backdrop-blur-xl p-3 rounded-3xl border border-neutral-700/50 hover:bg-neutral-950/60 hover:border-neutral-600/70 transition-all duration-300 cursor-pointer relative"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-neutral-100 uppercase tracking-wider font-light">YOUR_ACTIVITY</span>
                <span className="text-[10px] text-lime-400 uppercase tracking-wider font-light">CREATE</span>
              </div>
              
              <div className="mb-2">
                <h2 className="text-sm font-normal text-white mb-1">Ready to <span className="text-lime-400 font-light">Create?</span></h2>
                <div className="w-12 mb-6 h-px bg-gradient-to-r from-lime-400 to-transparent mb-2"></div>
              </div>

              <div className="space-y-1.5">
                <div className="border-l-2 border-lime-400/30 pl-2">
                  <div className="flex items-center gap-1 mb-0.5">
                    <div className="w-1.5 h-1.5 bg-lime-400 rounded-full animate-pulse"></div>
                    <span className="text-xs font-medium text-white">Start New Project</span>
                  </div>
                  <p className="text-[9px] text-neutral-400">Create images & videos now</p>
                </div>
                
                <div className="border-l-2 border-neutral-600 pl-2">
                  <div className="flex items-center gap-1 mb-0.5">
                    <div className="w-1.5 h-1.5 bg-white/60 rounded-full"></div>
                    <span className="text-xs font-medium text-white">Credits Available</span>
                  </div>
                  <p className="text-[9px] text-neutral-400">{((firestoreUserData?.general_credits || 0) + (firestoreUserData?.one_time_credits || 0)).toLocaleString()} credits ready</p>
                </div>
                
                <div className="border-l-2 border-neutral-600 pl-2">
                  <div className="flex items-center gap-1 mb-0.5">
                    <div className="w-1.5 h-1.5 bg-white/60 rounded-full"></div>
                    <span className="text-xs font-medium text-white">All Models Ready</span>
                  </div>
                  <p className="text-[9px] text-neutral-400">15+ AI models at your service</p>
                </div>
                
                <div className="border-l-2 border-neutral-600 pl-2">
                  <div className="flex items-center gap-1 mb-0.5">
                    <div className="w-1.5 h-1.5 bg-white/60 rounded-full"></div>
                    <span className="text-xs font-medium text-white">Fast Generation</span>
                  </div>
                  <p className="text-[9px] text-neutral-400">Results in seconds</p>
                </div>
              </div>
            </div>
          ) : (
            <div 
              onClick={() => navigate('/models')}
              className="bg-neutral-950/40 backdrop-blur-xl p-3 rounded-3xl border border-neutral-700/50 hover:bg-neutral-950/60 hover:border-neutral-600/70 transition-all duration-300 cursor-pointer relative"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-neutral-100 uppercase tracking-wider font-light">NEW_MODELS</span>
                <span className="text-[10px] text-lime-400 uppercase tracking-wider font-light">CLICK</span>
              </div>
              
              <div className="mb-2">
                <h2 className="text-sm font-normal text-white mb-1">Latest <span className="text-lime-400 font-light">AI Models</span></h2>
                <div className="w-12 h-px bg-gradient-to-r from-lime-400 to-transparent mb-2"></div>
              </div>

              <div className="space-y-1.5">
                <div className="border-l-2 border-lime-400/30 pl-2">
                  <div className="flex items-center gap-1 mb-0.5">
                    <div className="w-1.5 h-1.5 bg-lime-400 rounded-full animate-pulse"></div>
                    <span className="text-xs font-medium text-white">Google Imagen 4</span>
                  </div>
                  <p className="text-[9px] text-neutral-400">Amazing photo-like images</p>
                </div>
                
                <div className="border-l-2 border-neutral-600 pl-2">
                  <div className="flex items-center gap-1 mb-0.5">
                    <div className="w-1.5 h-1.5 bg-white/60 rounded-full"></div>
                    <span className="text-xs font-medium text-white">Flux 1.1 Pro</span>
                  </div>
                  <p className="text-[9px] text-neutral-400">Best text understanding</p>
                </div>
                
                <div className="border-l-2 border-neutral-600 pl-2">
                  <div className="flex items-center gap-1 mb-0.5">
                    <div className="w-1.5 h-1.5 bg-white/60 rounded-full"></div>
                    <span className="text-xs font-medium text-white">Google Veo 3</span>
                  </div>
                  <p className="text-[9px] text-neutral-400">Next-level video creation</p>
                </div>
                
                <div className="border-l-2 border-neutral-600 pl-2">
                  <div className="flex items-center gap-1 mb-0.5">
                    <div className="w-1.5 h-1.5 bg-white/60 rounded-full"></div>
                    <span className="text-xs font-medium text-white">Kling v2.1</span>
                  </div>
                  <p className="text-[9px] text-neutral-400">Smooth realistic motion</p>
                </div>
                
                <div className="border-l-2 border-neutral-600 pl-2">
                  <div className="flex items-center gap-1 mb-0.5">
                    <div className="w-1.5 h-1.5 bg-white/60 rounded-full"></div>
                    <span className="text-xs font-medium text-white">Hailuo 02</span>
                  </div>
                  <p className="text-[9px] text-neutral-400">Real physics in videos</p>
                </div>
              </div>
            </div>
          )}

          {/* Pricing Spotlight or Plan Upgrade */}
          {user ? (
            <div 
              onClick={() => setIsPricingModalOpen && setIsPricingModalOpen(true)}
              className="bg-gradient-to-br from-lime-400/10 to-transparent backdrop-blur-xl p-3 rounded-3xl border border-lime-400/30 hover:border-lime-400/50 transition-all duration-300 cursor-pointer relative"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-lime-400 uppercase tracking-wider font-medium">YOUR_PLAN</span>
                <span className="text-[10px] text-lime-400 uppercase tracking-wider font-medium">UPGRADE</span>
              </div>
              
              {firestoreUserData?.subscription_status === 'active' ? (
                <>
                  <div className="mb-3">
                    <h2 className="text-base font-normal text-white mb-1">
                      <span className="text-lime-400">{((firestoreUserData?.general_credits || 0) + (firestoreUserData?.one_time_credits || 0)).toLocaleString()}</span> Credits
                    </h2>
                    <p className="text-[10px] text-neutral-300">
                      Premium plan active • Need more credits?
                    </p>
                  </div>
                    
                  <div className="space-y-1.5 mb-3">
                    <div className="bg-neutral-800/30 rounded-lg p-2 text-center">
                      <div className="text-xs text-white font-medium">Extra Credits</div>
                      <div className="text-[10px] text-lime-400">$15 per 1,000 credits</div>
                    </div>
                    <div className="bg-neutral-800/30 rounded-lg p-2 text-center">
                      <div className="text-xs text-white font-medium">Instant Top-up</div>
                      <div className="text-[10px] text-lime-400">Available 24/7</div>
                    </div>
                  </div>
                  
                  <button className="w-full bg-lime-400 hover:bg-lime-300 text-black px-3 py-2 rounded-xl font-medium text-xs transition-all">
                    BUY EXTRA CREDITS
                  </button>
                </>
              ) : (
                <>
                  <div className="mb-3">
                    <h2 className="text-base font-normal text-white mb-1">From <span className="text-lime-400">$14</span>/mo</h2>
                    <p className="text-[10px] text-neutral-300">
                      Upgrade to unlock everything
                    </p>
                  </div>
                    
                  <div className="space-y-1.5 mb-3">
                    <div className="bg-neutral-800/30 rounded-lg p-2 text-center">
                      <div className="text-xs text-white font-medium">10,000 Credits</div>
                      <div className="text-[10px] text-lime-400">Every month</div>
                    </div>
                    <div className="bg-neutral-800/30 rounded-lg p-2 text-center">
                      <div className="text-xs text-white font-medium">All Models</div>
                      <div className="text-[10px] text-lime-400">Premium access</div>
                    </div>
                  </div>
                  
                  <button className="w-full bg-lime-400 hover:bg-lime-300 text-black px-3 py-2 rounded-xl font-medium text-xs transition-all">
                    UPGRADE PLAN
                  </button>
                </>
              )}
            </div>
          ) : (
            <div 
              onClick={() => setIsPricingModalOpen && setIsPricingModalOpen(true)}
              className="bg-gradient-to-br from-lime-400/10 to-transparent backdrop-blur-xl p-3 rounded-3xl border border-lime-400/30 hover:border-lime-400/50 transition-all duration-300 cursor-pointer relative flex flex-col"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-lime-400 uppercase tracking-wider font-medium">PRICING</span>
                <span className="text-[10px] text-lime-400 uppercase tracking-wider font-medium">SIMPLE</span>
              </div>
              
              <div className="mb-3">
                <h2 className="text-base font-normal text-white mb-1">From <span className="text-lime-400">$14</span>/mo</h2>
                <p className="text-[10px] text-neutral-300">
                  200 credits every month • Works with all AI models
                </p>
              </div>
                
              <div className="space-y-1.5 mb-3 flex-1">
                <div className="bg-neutral-800/30 rounded-lg p-2 text-center">
                  <div className="text-xs text-white font-medium">Amazing Images</div>
                  <div className="text-[10px] text-lime-400">1-2 credits each</div>
                </div>
                <div className="bg-neutral-800/30 rounded-lg p-2 text-center">
                  <div className="text-xs text-white font-medium">Cool Videos</div>
                  <div className="text-[10px] text-lime-400">5-20 credits each</div>
                </div>
              </div>
              
              <button className="w-full bg-white hover:bg-neutral-100 text-black px-3 py-2 rounded-xl font-medium text-xs transition-all mt-auto">
                VIEW PLANS
              </button>
            </div>
          )}

          {/* Live Examples or Latest Generations */}
          {user ? (
            <div 
              onClick={() => navigate('/history')}
              className="bg-neutral-950/40 backdrop-blur-xl p-3 rounded-3xl border border-neutral-700/50 hover:bg-neutral-950/60 hover:border-neutral-600/70 transition-all duration-300 cursor-pointer relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-neutral-100 uppercase tracking-wider font-light">LATEST_WORK</span>
                <span className="text-[10px] text-lime-400 uppercase tracking-wider font-light">VIEW_ALL</span>
              </div>
              
              <div className="space-y-1.5">
                {isLoadingGenerations ? (
                  <>
                    <div className="aspect-[5/3] rounded-lg bg-neutral-800/50 animate-pulse"></div>
                    <div className="aspect-[5/3] rounded-lg bg-neutral-800/50 animate-pulse"></div>
                  </>
                ) : recentGenerations.length > 0 ? (
                  recentGenerations.slice(0, 2).map((generation) => (
                    <div key={generation.id} className="aspect-[5/3] rounded-lg overflow-hidden bg-neutral-800">
                      {generation.type === 'video' && generation.videoUrl ? (
                        <video src={generation.videoUrl} autoPlay loop muted className="w-full h-full object-cover"/>
                      ) : generation.type === 'image' && generation.imageUrl ? (
                        <img src={generation.imageUrl} alt="Generated content" className="w-full h-full object-cover"/>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-neutral-800 text-neutral-500 text-xs">
                          {generation.type === 'video' ? 'Video' : 'Image'}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <>
                    <div className="aspect-[5/3] rounded-lg overflow-hidden bg-neutral-800">
                      <video src="/vid1.mp4" autoPlay loop muted className="w-full h-full object-cover"/>
                    </div>
                    <div className="aspect-[5/3] rounded-lg overflow-hidden bg-neutral-800">
                      <video src="/vid2.mp4" autoPlay loop muted className="w-full h-full object-cover"/>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div 
              onClick={() => navigate('/studio')}
              className="bg-neutral-950/40 backdrop-blur-xl p-3 rounded-3xl border border-neutral-700/50 hover:bg-neutral-950/60 hover:border-neutral-600/70 transition-all duration-300 cursor-pointer relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-neutral-100 uppercase tracking-wider font-light">EXAMPLES</span>
                <span className="text-[10px] text-lime-400 uppercase tracking-wider font-light">TRY_NOW</span>
              </div>
              
              <div className="space-y-1.5">
                <div className="aspect-[5/3] rounded-lg overflow-hidden bg-neutral-800">
                  <video src="/vid1.mp4" autoPlay loop muted className="w-full h-full object-cover"/>
                </div>
                <div className="aspect-[5/3] rounded-lg overflow-hidden bg-neutral-800">
                  <video src="/vid2.mp4" autoPlay loop muted className="w-full h-full object-cover"/>
                </div>
              </div>
            </div>
          )}

          {/* User Account Status */}
          {user ? (
            <div className="bg-neutral-950/40 backdrop-blur-xl p-3 rounded-3xl border border-neutral-700/50 relative">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-neutral-100 uppercase tracking-wider font-light">SHORTCUTS</span>
                <span className="text-[10px] text-lime-400 uppercase tracking-wider font-light">QUICK_ACCESS</span>
              </div>
              
              <div className="mb-3">
                <h2 className="text-sm font-normal text-white mb-1">Settings <span className="text-lime-400 font-light">& More</span></h2>
                <div className="w-12 mb-6 h-px bg-gradient-to-r from-lime-400 to-transparent mb-2"></div>
              </div>

              <div className="space-y-1.5">
                <div 
                  onClick={() => navigate('/settings#user')}
                  className="border-l-2 border-lime-400/30 pl-2 cursor-pointer hover:border-lime-400/60 transition-colors"
                >
                  <div className="flex items-center gap-1 mb-0.5">
                    <div className="w-1.5 h-1.5 bg-lime-400 rounded-full"></div>
                    <span className="text-xs font-medium text-white">User Profile</span>
                  </div>
                  <p className="text-[9px] text-neutral-400">Manage your profile & account</p>
                </div>
                
                <div 
                  onClick={() => navigate('/settings#billing')}
                  className="border-l-2 border-neutral-600 pl-2 cursor-pointer hover:border-lime-400/30 transition-colors"
                >
                  <div className="flex items-center gap-1 mb-0.5">
                    <div className="w-1.5 h-1.5 bg-white/60 rounded-full"></div>
                    <span className="text-xs font-medium text-white">Manage Billing</span>
                  </div>
                  <p className="text-[9px] text-neutral-400">Subscription & payments</p>
                </div>
                
                <div 
                  onClick={() => navigate('/settings#featureRequests')}
                  className="border-l-2 border-neutral-600 pl-2 cursor-pointer hover:border-lime-400/30 transition-colors"
                >
                  <div className="flex items-center gap-1 mb-0.5">
                    <div className="w-1.5 h-1.5 bg-white/60 rounded-full"></div>
                    <span className="text-xs font-medium text-white">Feature Requests</span>
                  </div>
                  <p className="text-[9px] text-neutral-400">Tell us what you need</p>
                </div>
                
                <div 
                  onClick={() => navigate('/settings#legal')}
                  className="border-l-2 border-neutral-600 pl-2 cursor-pointer hover:border-lime-400/30 transition-colors"
                >
                  <div className="flex items-center gap-1 mb-0.5">
                    <div className="w-1.5 h-1.5 bg-white/60 rounded-full"></div>
                    <span className="text-xs font-medium text-white">Legal & Privacy</span>
                  </div>
                  <p className="text-[9px] text-neutral-400">Terms & privacy policy</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-neutral-950/40 backdrop-blur-xl p-3 rounded-3xl border border-neutral-700/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-neutral-100 uppercase tracking-wider font-light">PLATFORM_STATS</span>
                <span className="text-[10px] text-lime-400 uppercase tracking-wider font-light">GROWING</span>
              </div>
              
              <div className="text-center mb-3">
                <div className="text-xl font-bold text-white mb-1">1000+</div>
                <div className="text-sm text-lime-400 font-light mb-1">Happy Users</div>
                <div className="text-[9px] text-neutral-400">
                  Making amazing content every day
                </div>
              </div>

              <div className="space-y-1.5 mb-3">
                <div className="bg-neutral-800/30 rounded-lg p-2 text-center">
                  <div className="text-xs text-white font-medium">Everything Here</div>
                  <div className="text-[10px] text-lime-400">No switching apps</div>
                </div>
                <div className="bg-neutral-800/30 rounded-lg p-2 text-center">
                  <div className="text-xs text-white font-medium">One Simple Plan</div>
                  <div className="text-[10px] text-lime-400">All models included</div>
                </div>
                
              </div>
              
              <div className="text-center">
                <div className="inline-flex items-center px-3 py-1 bg-lime-400/10 rounded-full border border-lime-400/30">
                  <span className="text-[10px] text-lime-400 font-medium">Join the community</span>
                </div>
              </div>
            </div>
          )}

          {/* Full Width Bottom Action */}
          <div className="col-span-4">
            {user ? (
              <div 
                onClick={() => navigate('/studio')}
                className="bg-gradient-to-r from-lime-400/10 to-transparent backdrop-blur-xl p-4 rounded-3xl border border-lime-400/30 hover:border-lime-400/50 transition-all duration-300 cursor-pointer relative"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-light">READY_TO_CREATE</span>
                    <div className="w-6 h-px bg-gradient-to-r from-lime-400 to-transparent"></div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-neutral-300">Access to</span>
                      <span className="text-lime-400 font-semibold">15+ AI models</span>
                      <span className="text-neutral-300">•</span>
                      <span className="text-neutral-300">Images & Videos</span>
                      <span className="text-neutral-300">•</span>
                      <span className="text-neutral-300">Compare results</span>
                    </div>
                  </div>
                  
                  <button className="bg-lime-400 hover:bg-lime-300 text-black px-6 py-2 rounded-2xl font-semibold text-sm transition-all hover:scale-105 shadow-lg">
                    GENERATE NOW
                  </button>
                </div>
                
                <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-lime-400 rounded-full animate-pulse"></div>
              </div>
            ) : (
              <div 
                onClick={() => navigate('/signup')}
                className="bg-gradient-to-r from-lime-400/10 to-transparent backdrop-blur-xl p-4 rounded-3xl border border-lime-400/30 hover:border-lime-400/50 transition-all duration-300 cursor-pointer relative"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-light">MULTI_MODEL_AI</span>
                    <div className="w-6 h-px bg-gradient-to-r from-lime-400 to-transparent"></div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-neutral-300">Compare results from</span>
                      <span className="text-lime-400 font-semibold">15+ AI models</span>
                      <span className="text-neutral-300">•</span>
                      <span className="text-neutral-300">Same prompt, different outputs</span>
                      <span className="text-neutral-300">•</span>
                      <span className="text-neutral-300">Choose the best</span>
                    </div>
                  </div>
                  
                  <button className="bg-lime-400 hover:bg-lime-300 text-black px-6 py-2 rounded-2xl font-semibold text-sm transition-all hover:scale-105 shadow-lg">
                    GET STARTED FREE
                  </button>
                </div>
                
                <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-lime-400 rounded-full animate-pulse"></div>
              </div>
            )}
          </div>
          
        </div>
      </div>
      
      </div> {/* End Desktop Layout */}
    </div>
  );
};

export default WelcomePage;