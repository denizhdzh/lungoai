
const WelcomePage = () => {
  return (
    <div className="min-h-32 relative overflow-hidden">
      {/* Left Side - Welcome Text */}
      <div className="absolute left-16 top-1/2 transform -translate-y-1/2 z-10">
        <h1 className="text-6xl font-bold text-white mb-4">
          WELCOME TO LUNGO AI
        </h1>
      </div>
      
      {/* Right Side - Control Panel (3 Box Bento) */}
      <div className="fixed top-20 right-3 w-[420px] space-y-3 z-40 max-h-[calc(100vh-180px)] overflow-y-auto">
        {/* Top Box - AI Platform Info */}
        <div className="bg-neutral-950/40 backdrop-blur-xl p-6 rounded-3xl border border-neutral-700/50 flex-1">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-neutral-500 uppercase tracking-wider font-light tracking-wide">AI_PLATFORM</span>
            <span className="text-xs text-neutral-500 uppercase tracking-wider font-light tracking-wide">MODELS_AVAILABLE</span>
          </div>
          
          <div className="mb-6">
            <h2 className="text-2xl font-normal text-white mb-1">Premium <span className="text-lime-400 font-light tracking-wide">AI</span></h2>
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
        </div>
        
        {/* Middle Box - Content Types */}
        <div className="bg-neutral-950/40 backdrop-blur-xl p-6 rounded-3xl border border-neutral-700/50 flex-1">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-neutral-500 uppercase tracking-wider font-light tracking-wide">CONTENT_TYPES</span>
            <span className="text-xs text-neutral-500 uppercase tracking-wider font-light tracking-wide">OUTPUT_QUALITY</span>
          </div>
          
          <div className="mb-6">
            <h2 className="text-2xl font-normal text-white mb-1">IMG <span className="text-neutral-500">&</span> VID</h2>
            <div className="w-24 h-px bg-gradient-to-r from-lime-400 to-transparent mb-6"></div>
          </div>
          
          <div className="flex items-center justify-between text-xs font-light tracking-wide">
            <span className="text-neutral-500 uppercase tracking-wider">RESOLUTION: 4K_MAX</span>
            <span className="text-neutral-500 uppercase tracking-wider">DURATION: 10S_MAX</span>
          </div>
        </div>
        
        {/* Bottom Box - Credits */}
        <div className="bg-neutral-950/40 backdrop-blur-xl p-6 rounded-3xl border border-neutral-700/50 flex-1">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-neutral-500 uppercase tracking-wider font-light tracking-wide">CREDITS_AVAILABLE</span>
            <span className="text-xs text-neutral-500 uppercase tracking-wider font-light tracking-wide">ACTIVE_PLAN</span>
          </div>
          
          <div className="mb-6">
            <div className="flex items-baseline justify-between mb-1">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-normal text-white">187</span>
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
            <span className="text-neutral-500 uppercase tracking-wider">USAGE_TODAY: 23CR</span>
            <span className="text-neutral-500 uppercase tracking-wider">EST_REMAINING: ~8D</span>
          </div>
        </div>
      </div>
      
      {/* Bottom Action Bar */}
      <div className="fixed bottom-3 left-3 right-3 z-40 bg-neutral-950/40 backdrop-blur-xl border border-neutral-700/50 rounded-3xl">
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
            <button className="bg-white/90 hover:bg-white text-black px-8 py-3 rounded-2xl font-normal tracking-wide transition-all hover:scale-105 shadow-lg">
              START
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomePage;