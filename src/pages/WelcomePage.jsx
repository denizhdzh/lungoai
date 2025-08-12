import { useOutletContext } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';

const WelcomePage = () => {
  const { user, setIsPricingModalOpen, firestoreUserData } = useOutletContext() || {};
  const navigate = useNavigate();

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Mobile Layout */}
      <div className="xl:hidden min-h-screen relative overflow-hidden">
        {/* Mobile - Simple centered layout */}
        <div className="flex items-center justify-center min-h-screen px-4">
          <div className="text-center space-y-6 max-w-md">
            <div className="mb-8">
              <h1 className="text-4xl font-bold text-white mb-4">
                Introducing <span className="text-lime-400">Lungo AI</span>
              </h1>
              <p className="text-lg text-neutral-300 mb-6">
                The all-in-one studio to create images and videos in seconds, no tabs to switch, no setups needed.
              </p>
            </div>
            
            <div className="space-y-4">
              <button 
                onClick={() => user ? navigate('/generation') : navigate('/signup')}
                className="w-full bg-lime-400 hover:bg-lime-300 text-black px-8 py-4 rounded-2xl font-semibold text-lg transition-all"
              >
                {user ? 'START CREATING' : 'GET STARTED FREE'}
              </button>
              
              {!user && (
                <button 
                  onClick={() => setIsPricingModalOpen && setIsPricingModalOpen(true)}
                  className="w-full border border-white/20 text-white px-8 py-4 rounded-2xl font-medium transition-all hover:bg-white/5"
                >
                  View Pricing
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden xl:block min-h-screen relative">
        
        {/* Ana Container - Yan Yana 2 Div */}
        {!user && (
          <div className="fixed bottom-8 left-8 right-8 z-20 flex gap-2 items-end">
          
          {/* Sol Taraf - All Models Included Box (Full Width) */}
          <div className="flex-1">
            <div className="bg-neutral-900/70 backdrop-blur-sm p-6 rounded-3xl border border-neutral-100/20">
              <div className="flex items-center gap-4">
                <span className="text-md text-neutral-300 font-medium uppercase tracking-wider">ALL MODELS INCLUDED</span>
                <div className="w-1.5 h-1.5 bg-neutral-500 rounded-full"></div>
                <div className="flex items-center gap-6">
                  <img src="/logos/google_logo.png" alt="Google" className="w-12 h-12 opacity-80"/>
                  <img src="/logos/flux_logo.png" alt="Flux" className="w-12 h-12 opacity-80"/>
                  <img src="/logos/runway_logo.png" alt="Runway" className="w-12 h-12 opacity-80"/>
                  <img src="/logos/kling_logo.png" alt="Kling" className="w-12 h-12 opacity-80"/>
                  <img src="/logos/bytedance_logo.png" alt="ByteDance" className="w-12 h-12 opacity-80"/>
                  <img src="/logos/ideogram_logo.png" alt="Ideogram" className="w-12 h-12 opacity-80"/>
                  <img src="/logos/leonardo_logo.png" alt="Leonardo" className="w-12 h-12 opacity-80"/>
                  <img src="/logos/minimax_logo.png" alt="Minimax" className="w-12 h-12 opacity-80"/>
                </div>
              </div>
            </div>
          </div>
          
          {/* Sağ Taraf - 3 Kutu Alt Alta */}
          <div className="space-y-2 max-w-lg">
            
            {/* 1. Introducing Box - Regular Text */}
            <div className="bg-neutral-900/70 backdrop-blur-sm p-6 rounded-3xl border border-neutral-100/20">
              <p className="text-xl text-white/60 leading-relaxed">
                Introducing <span className="text-white">Lungo AI</span>, the <span className="text-white">all-in-one studio</span> to create <span className="text-white">images & videos</span> in seconds, <span className="text-white">no tabs</span> to switch, <span className="text-white">no setups</span> needed.
              </p>
            </div>
            
            {/* 2. Latest AI Model Box */}
            <div 
              className="bg-neutral-900/70 backdrop-blur-sm p-6 rounded-3xl border border-neutral-100/20 hover:border-lime-400 cursor-pointer transition-colors"
              onClick={() => navigate('/models')}
            >
              {/* Header with pulse and title */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-2 h-2 bg-lime-400 rounded-full animate-pulse"></div>
                <div className="text-sm text-neutral-400 uppercase tracking-wider">LATEST AI MODEL</div>
              </div>
              
              {/* Content area with 2 divs */}
              <div className="flex gap-6 items-center">
                {/* Left content */}
                <div className="flex-1">
                  <h3 className="text-2xl font-semibold text-white mb-2">Flux Kontext</h3>
                  <h4 className="text-2xl font-semibold text-white mb-2">Max</h4>
                  <p className="text-base text-neutral-400 mb-3">Best Model for editing</p>
                  <div className="inline-block px-3 py-1 bg-neutral-800 border border-neutral-700 rounded-lg text-xs text-neutral-300 font-medium uppercase tracking-wider">
                    IMAGE MODEL
                  </div>
                </div>
                
                {/* Right image */}
                <div className="w-48 h-48 flex-shrink-0">
                  <img src="/Futuristic Pod in Urban Jungle copy.png" alt="AI Model Example" className="w-full h-full object-cover rounded-xl"/>
                </div>
              </div>
            </div>
            
            {/* 3. Simple Pricing Box */}
            <div 
              className="bg-neutral-900/70 backdrop-blur-sm p-6 rounded-3xl border border-neutral-100/20 hover:border-lime-400 cursor-pointer transition-colors"
              onClick={() => setIsPricingModalOpen(true)}
            >
              <div className="text-sm text-neutral-400 mb-6 uppercase tracking-wider text-left font-medium">SIMPLE PRICING FOR ALL MODELS</div>
              
              <div className="grid grid-cols-3 gap-6">
                <div className="text-left">
                  <div className="text-sm text-neutral-400 mb-2">STARTER</div>
                  <div className="text-xs text-white mb-2">~200 images</div>
                  <div className="text-xs text-white mb-2">~40 videos</div>

                  <div className="text-lg font-bold text-lime-500">$11.00*<span className="text-sm font-normal">/mo</span></div>
                </div>
                <div className="text-left">
                  <div className="text-sm text-neutral-400 mb-2">PRO</div>
                  <div className="text-xs text-white mb-2">~500 images</div>
                  <div className="text-xs text-white mb-2">~100 videos</div>
                  <div className="text-lg font-bold text-lime-500">$24.00*<span className="text-sm font-normal">/mo</span></div>
                </div>
                <div className="text-left">
                  <div className="text-sm text-neutral-400 mb-2">CREATOR</div>
                  <div className="text-xs text-white mb-2">~3000 images</div>
                  <div className="text-xs text-white mb-2">~600 videos</div>
                  <div className="text-lg font-bold text-lime-500">$113.00*<span className="text-sm font-normal">/mo</span></div>
                </div>
              </div>
              
              <div className="mt-4 text-center">
                <p className="text-neutral-500" style={{fontSize: '10px'}}>*Prices shown are for annual billing plans</p>
              </div>
            </div>
            
          </div>
          
        </div>
        )}
        
        {/* Logged In User Layout */}
        {user && (
          <div className="fixed bottom-8 inset-x-0 z-20 px-4">
            
            {/* Top Section - Right Aligned Boxes */}
            <div className="flex justify-end mb-6">
              <div className="w-full max-w-md space-y-4 flex flex-col items-end">
                
                {/* Credits Box */}
                <div 
                  className="bg-neutral-900/70 max-w-xs backdrop-blur-sm p-6 rounded-3xl border border-neutral-100/20 hover:border-lime-400 cursor-pointer transition-colors"
                  onClick={() => setIsPricingModalOpen(true)}
                >
                  <h3 className="text-white text-lg font-semibold mb-4 text-center">Credits</h3>
                  <div className="flex items-center justify-center">
                    <div className="relative">
                      <img 
                        src="/Union.png" 
                        alt="Credits" 
                        className="w-36 h-36"
                      />
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-white text-3xl font-bold z-10">
                          {((firestoreUserData?.general_credits || 0) + (firestoreUserData?.one_time_credits || 0)).toLocaleString()}
                        </span>
                        <span className="text-white/50 text-xs font-medium mt-1">
                          Get more
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Recent Generations Box */}
                <div className="bg-neutral-900/70 backdrop-blur-sm p-6 rounded-3xl border border-neutral-100/20 max-w-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white text-lg font-semibold">Recent Generations</h3>
                    <button 
                      onClick={() => navigate('/history')}
                      className="text-lime-400 text-sm hover:text-lime-300 transition-colors"
                    >
                      View All
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-3">
                    {/* Mock generated images - replace with real data */}
                    <div className="aspect-square bg-neutral-800/50 rounded-2xl overflow-hidden hover:scale-105 transition-transform cursor-pointer">
                      <img 
                        src="/im8.png" 
                        alt="Generated content" 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="aspect-square bg-neutral-800/50 rounded-2xl overflow-hidden hover:scale-105 transition-transform cursor-pointer">
                      <img 
                        src="/Futuristic Pod in Urban Jungle copy.png" 
                        alt="Generated content" 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="aspect-square bg-neutral-800/50 rounded-2xl overflow-hidden hover:scale-105 transition-transform cursor-pointer">
                      <div className="w-full h-full bg-gradient-to-br from-neutral-800 to-neutral-700 flex items-center justify-center">
                        <span className="text-neutral-500 text-xs text-center">+12<br/>more</span>
                      </div>
                    </div>
                  </div>
                </div>
                
              </div>
            </div>
            
            {/* Bottom Bar - Generation Interface */}
            <div className="bg-neutral-900/70 backdrop-blur-sm p-4 rounded-3xl border border-neutral-100/20">
              <div className="flex items-center gap-4">
                
                {/* Type Toggle */}
                <div className="flex gap-2">
                  <button className="px-3 py-2 bg-white text-black text-xs font-medium rounded-xl">
                    Image
                  </button>
                  <button className="px-3 py-2 bg-neutral-800/50 text-white text-xs rounded-xl hover:bg-neutral-700">
                    Video
                  </button>
                </div>
                
                {/* Model Selector */}
                <div className="relative">
                  <select className="bg-neutral-800/50 text-white text-sm rounded-xl px-3 py-2 border border-neutral-700/50 focus:outline-none focus:border-lime-400">
                    <option>Imagen 4</option>
                    <option>Flux Dev</option>
                    <option>Ideogram V3</option>
                  </select>
                </div>
                
                {/* Prompt Input */}
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Describe what you want to create..."
                    className="w-full bg-transparent text-white placeholder-neutral-500 text-sm focus:outline-none"
                  />
                </div>
                
                {/* Generate Button */}
                <div className="flex items-center gap-3">
                  <div className="text-lime-400 text-xs font-medium">90 CR</div>
                  <button className="px-6 py-2.5 bg-lime-400 hover:bg-lime-300 text-black font-semibold text-sm rounded-xl transition-colors">
                    Generate
                  </button>
                </div>
                
              </div>
            </div>
            
          </div>
        )}
        
      </div>
    </div>
  );
};

export default WelcomePage;