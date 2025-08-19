import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { models } from '../config/models.js';
import Header from '../components/Header';

const ModelsPage = () => {
  const { user } = useOutletContext() || {};
  
  const [imageModels, setImageModels] = useState([]);
  const [videoModels, setVideoModels] = useState([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [loadingVideos, setLoadingVideos] = useState(true);

  // Simulate async loading for image models
  useEffect(() => {
    const loadImageModels = async () => {
      setLoadingImages(true);
      await new Promise(resolve => setTimeout(resolve, 800)); // Simulate API delay
      setImageModels(Object.entries(models.image || {}));
      setLoadingImages(false);
    };
    
    loadImageModels();
  }, []);

  // Simulate async loading for video models with different delay
  useEffect(() => {
    const loadVideoModels = async () => {
      setLoadingVideos(true);
      await new Promise(resolve => setTimeout(resolve, 1200)); // Different delay
      setVideoModels(Object.entries(models.video || {}));
      setLoadingVideos(false);
    };
    
    loadVideoModels();
  }, []);

  const LoadingBento = ({ height = "h-80" }) => (
    <div className={`bg-neutral-900/40 backdrop-blur-xl p-6 rounded-3xl border border-neutral-700/50 ${height} animate-pulse`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 bg-neutral-800 rounded-2xl"></div>
        <div className="space-y-2">
          <div className="h-4 bg-neutral-800 rounded w-32"></div>
          <div className="h-3 bg-neutral-800 rounded w-20"></div>
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-3 bg-neutral-800 rounded w-full"></div>
        <div className="h-3 bg-neutral-800 rounded w-3/4"></div>
        <div className="h-3 bg-neutral-800 rounded w-1/2"></div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-950 relative">
      {/* Background */}
      <div className="fixed inset-0 w-full h-full z-0">
        <img src="/Glowing Abstract Flower.png" alt="Background" className="w-full h-full object-cover"/>
        <div className="absolute inset-0 bg-black/30" />
      </div>
      <Header />
      <div className="relative z-10 pt-20 p-6">
        {/* Header */}
        <div className="max-w-7xl mx-auto mb-12">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-medium text-white mb-4">AI Models</h1>
            <p className="text-neutral-400">
              Available AI models with specifications and technical details
            </p>
          </div>
        </div>

      {/* Bento Grid Layout */}
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-12 gap-4">
          
          {/* Stats Overview - Top Row */}
          <div className="col-span-12 lg:col-span-4">
            <div className="bg-neutral-900/50 backdrop-blur-xl p-8 rounded-3xl border border-neutral-700/50 h-full">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-neutral-500 uppercase tracking-wider font-light">MODEL_COUNT</span>
                <span className="text-xs text-neutral-500 uppercase tracking-wider font-light">AVAILABLE_NOW</span>
              </div>
              <div className="mb-6">
                <h2 className="text-3xl font-normal text-white mb-1">
                  {!loadingImages && !loadingVideos ? imageModels.length + videoModels.length : '...'} 
                  <span className="text-lime-400 font-light tracking-wide"> AI</span>
                </h2>
                <div className="w-24 h-px bg-gradient-to-r from-lime-400 to-transparent mb-4"></div>
                <p className="text-sm text-neutral-400 leading-relaxed">
                  Image & video generation models from leading AI providers.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs font-light tracking-wide">
                <div className="text-neutral-400">
                  {loadingImages ? '...' : imageModels.length} image models
                </div>
                <div className="text-neutral-400">
                  {loadingVideos ? '...' : videoModels.length} video models
                </div>
                <div className="text-neutral-400">4K max resolution</div>
                <div className="text-neutral-400">10s+ duration</div>
              </div>
            </div>
          </div>

          {/* Image Models Section */}
          <div className="col-span-12 lg:col-span-8">
            <div className="bg-neutral-900/50 backdrop-blur-xl p-8 rounded-3xl border border-neutral-700/50 h-full">
              <div className="flex items-center justify-between mb-6">
                <span className="text-xs text-neutral-500 uppercase tracking-wider font-light">IMAGE_GENERATION</span>
                <span className="text-xs text-neutral-500 uppercase tracking-wider font-light">
                  {loadingImages ? 'LOADING...' : `${imageModels.length}_MODELS`}
                </span>
              </div>
              
              <div className="mb-6">
                <h2 className="text-2xl font-normal text-white mb-1">IMG <span className="text-neutral-500">&</span> TXT</h2>
                <div className="w-24 h-px bg-gradient-to-r from-lime-400 to-transparent mb-4"></div>
              </div>

              {loadingImages ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="bg-neutral-800/40 p-4 rounded-2xl animate-pulse">
                      <div className="h-3 bg-neutral-700 rounded w-3/4 mb-2"></div>
                      <div className="h-2 bg-neutral-700 rounded w-1/2"></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {imageModels.slice(0, 6).map(([modelId, model]) => (
                    <div key={modelId} className="bg-neutral-800/40 hover:bg-neutral-800/60 p-4 rounded-2xl transition-colors group">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 bg-white/10 rounded-lg flex items-center justify-center p-1">
                          <img 
                            src={`/logos/${
                              modelId.includes('google') ? 'google_logo.webp' :
                              modelId.includes('flux') ? 'flux_logo.webp' :
                              modelId.includes('ideogram') ? 'ideogram_logo.webp' :
                              modelId.includes('minimax') ? 'minimax_logo.webp' :
                              'google_logo.webp'
                            }`}
                            alt={model.name}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                          <span className="text-lime-400 text-xs font-bold hidden">{model.name.charAt(0)}</span>
                        </div>
                        <span className="text-white text-sm font-medium truncate">{model.name}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-400">{model.credits} CR</span>
                        <span className="text-lime-400 group-hover:text-lime-300">
                          {modelId.includes('fast') ? '~15s' : 
                           modelId.includes('ultra') ? '~35s' : 
                           modelId.includes('ideogram') ? '~25s' :
                           modelId.includes('minimax') ? '~10s' : '~20s'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Video Models Section - Wide */}
          <div className="col-span-12">
            <div className="bg-neutral-900/50 backdrop-blur-xl p-8 rounded-3xl border border-neutral-700/50">
              <div className="flex items-center justify-between mb-6">
                <span className="text-xs text-neutral-500 uppercase tracking-wider font-light">VIDEO_GENERATION</span>
                <span className="text-xs text-neutral-500 uppercase tracking-wider font-light">
                  {loadingVideos ? 'LOADING...' : `${videoModels.length}_MODELS`}
                </span>
              </div>
              
              <div className="mb-8">
                <h2 className="text-3xl font-normal text-white mb-1">VID <span className="text-neutral-500">&</span> MOTION</h2>
                <div className="w-32 h-px bg-gradient-to-r from-lime-400 to-transparent mb-4"></div>
                <p className="text-sm text-neutral-400 max-w-2xl">
                  Text-to-video and image-to-video models with generation times and technical specs.
                </p>
              </div>

              {loadingVideos ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[...Array(6)].map((_, i) => (
                    <LoadingBento key={i} height="h-64" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {videoModels.map(([modelId, model]) => (
                    <div key={modelId} className="bg-neutral-800/40 backdrop-blur-xl p-6 rounded-3xl border border-neutral-700/30 hover:bg-neutral-800/60 hover:border-neutral-600/50 transition-all duration-300 group">
                      {/* Model Header */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center p-2">
                          <img 
                            src={`/logos/${
                              modelId.includes('google') ? 'google_logo.webp' :
                              modelId.includes('bytedance') ? 'bytedance_logo.webp' :
                              modelId.includes('kling') ? 'kling_logo.webp' :
                              modelId.includes('minimax') ? 'minimax_logo.webp' :
                              modelId.includes('runway') ? 'runway_logo.webp' :
                              'google_logo.webp'
                            }`}
                            alt={model.name}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                          <span className="text-lime-400 font-bold text-lg hidden">{model.name.charAt(0)}</span>
                        </div>
                        <div>
                          <h3 className="text-white font-semibold text-lg mb-1">{model.name}</h3>
                          <span className="text-xs text-neutral-400 uppercase tracking-wider">
                            {typeof model.credits === 'number' ? 
                              `${model.credits} CREDITS` : 
                              `${model.creditsPerSecond || Object.values(model.creditsPerSecond || {})[0]} CR/SEC`
                            }
                          </span>
                        </div>
                      </div>

                      {/* Capabilities */}
                      <div className="flex flex-wrap gap-1 mb-4">
                        {(model.type === 'text_to_video' || model.type === 'both') && (
                          <span className="bg-neutral-700/60 px-2 py-1 rounded-full text-xs text-white font-medium">TXT→VID</span>
                        )}
                        {(model.type === 'image_to_video' || model.type === 'both') && (
                          <span className="bg-lime-400/20 px-2 py-1 rounded-full text-xs text-lime-400 font-medium">IMG→VID</span>
                        )}
                      </div>

                      {/* Technical Specs */}
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Duration:</span>
                          <span className="text-white font-medium">
                            {model.options?.duration ? `${Math.max(...model.options.duration)}s` : '10s'} max
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Resolution:</span>
                          <span className="text-white font-medium">
                            {modelId.includes('veo-3') ? '1080P' :
                             modelId.includes('gen4') ? '4K' : '1080P'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-500">Generation:</span>
                          <span className="text-lime-400 font-bold group-hover:text-lime-300">
                            {modelId.includes('veo-3-fast') ? '~1MIN' : 
                             modelId.includes('veo-3') ? '~4MIN' :
                             modelId.includes('kling') ? '~6MIN' :
                             modelId.includes('hailuo') ? '~4MIN' :
                             modelId.includes('seedance') ? '~3MIN' :
                             modelId.includes('motion') ? '~2MIN' :
                             modelId.includes('gen4') ? '~5MIN' : '~3MIN'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Model Categories - Bottom Row */}
          <div className="col-span-12 md:col-span-6">
            <div className="bg-neutral-900/50 backdrop-blur-xl p-6 rounded-3xl border border-neutral-700/50 h-full">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-neutral-500 uppercase tracking-wider font-light">CATEGORIES</span>
                <span className="text-xs text-neutral-500 uppercase tracking-wider font-light">SPECIALIZED</span>
              </div>
              
              <div className="mb-4">
                <h2 className="text-2xl font-normal text-white mb-1">USE <span className="text-lime-400 font-light tracking-wide">CASES</span></h2>
                <div className="w-24 h-px bg-gradient-to-r from-lime-400 to-transparent mb-4"></div>
              </div>
              
              <div className="space-y-3 text-sm font-light tracking-wide">
                <div className="flex justify-between text-neutral-400">
                  <span>Photorealistic Portraits</span>
                  <span className="text-lime-400">Imagen 4</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Typography & Logos</span>
                  <span className="text-lime-400">Ideogram V3</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Cinematic Videos</span>
                  <span className="text-lime-400">Veo 3</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Animation</span>
                  <span className="text-lime-400">Kling v2.1</span>
                </div>
              </div>
            </div>
          </div>

          <div className="col-span-12 md:col-span-6">
            <div className="bg-neutral-900/50 backdrop-blur-xl p-6 rounded-3xl border border-neutral-700/50 h-full">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-neutral-500 uppercase tracking-wider font-light">PERFORMANCE</span>
                <span className="text-xs text-neutral-500 uppercase tracking-wider font-light">METRICS</span>
              </div>
              
              <div className="mb-4">
                <h2 className="text-2xl font-normal text-white mb-1">SPEED <span className="text-neutral-500">&</span> COST</h2>
                <div className="w-24 h-px bg-gradient-to-r from-lime-400 to-transparent mb-4"></div>
              </div>
              
              <div className="space-y-3 text-sm font-light tracking-wide">
                <div className="flex justify-between text-neutral-400">
                  <span>Fastest Image Gen</span>
                  <span className="text-lime-400">~10s</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Fastest Video Gen</span>
                  <span className="text-lime-400">~1min</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Lowest Cost</span>
                  <span className="text-lime-400">0.25 CR</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Max Resolution</span>
                  <span className="text-white">4K</span>
                </div>
              </div>
            </div>
          </div>

        </div>
        </div>
      </div>
    </div>
  );
};

export default ModelsPage;