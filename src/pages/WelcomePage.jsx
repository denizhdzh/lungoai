import { useState, useEffect } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import Header from '../components/Header.jsx';
import EmblaCarousel from '../components/EmblaCarousel';
import '../styles/embla.css';

const WelcomePage = () => {
  const [features, setFeatures] = useState([]);
  const [loadedImages, setLoadedImages] = useState(new Set());
  useEffect(() => {
    const fetchFeatures = async () => {
      const startTime = performance.now();
      
      try {
        const featuresRef = collection(db, 'system', 'features', 'items');
        const q = query(featuresRef, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        
        const featuresData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setFeatures(featuresData);
        
        const loadTime = performance.now() - startTime;
        console.log(`🚀 Features loaded from Firestore in ${Math.round(loadTime)}ms:`, featuresData.length);
      } catch (error) {
        console.error('❌ Features error:', error);
        setFeatures([]);
      }
    };

    fetchFeatures();
  }, []);

  // Sequential image preloading to avoid bandwidth bottleneck
  useEffect(() => {
    if (features.length === 0) return;
    
    let currentIndex = 0;
    
    const loadNextImage = () => {
      if (currentIndex >= features.length) return;
      
      const feature = features[currentIndex];
      if (feature.imageUrl && !loadedImages.has(feature.imageUrl)) {
        const img = new Image();
        img.onload = () => {
          setLoadedImages(prev => new Set([...prev, feature.imageUrl]));
          currentIndex++;
          setTimeout(loadNextImage, 200); // Small delay between loads
        };
        img.onerror = () => {
          console.error(`❌ Failed to preload "${feature.featureName}":`, feature.imageUrl);
          currentIndex++;
          setTimeout(loadNextImage, 100);
        };
        img.src = feature.imageUrl;
      } else {
        currentIndex++;
        loadNextImage();
      }
    };
    
    loadNextImage();
  }, [features]);


  return (
    <div className="bg-neutral-950 relative">
      <Header />
      
      {/* Hero Section */}
      <div className="py-6 px-4 md:px-10 mt-2 md:mt-4">
        <div className="text-center mb-8 md:mb-12">
          <h1 className="text-4xl md:text-6xl font-light text-white mb-3 md:mb-4 mt-12 md:mt-24 font-['Oswald']">
            Generate stunning AI visuals
          </h1>
          <div className="flex items-center justify-center gap-2">
            <a href="/signup" className="text-sm text-white/60 hover:text-white transition-colors cursor-pointer">
              Join 4600+ Creators 
            </a>
            <svg className="w-4 h-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17L17 7M17 7H7M17 7V17" />
            </svg>
          </div>
        </div>
      </div>
      
      {/* Full Width Features Slideshow */}
      {features.length > 0 ? (
        <EmblaCarousel 
          slides={features} 
          options={{ loop: true, dragFree: true }}
        />
      ) : null}

      {/* How It Works - Balanced Minimal */}
      <div className="py-24 px-4 md:px-10">
        <div className="max-w-6xl mx-auto">
          
          {/* Section header */}
          <div className="mb-20">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-8 h-px bg-white/20"></div>
              <h2 className="text-3xl md:text-5xl font-light text-white">How it works</h2>
            </div>
            <p className="text-white/50 text-lg max-w-2xl">
              Create stunning images and videos in seconds with our premium AI models
            </p>
          </div>
          
          {/* Steps grid */}
          <div className="grid md:grid-cols-3 gap-12 md:gap-16">
            
            {/* Step 1 */}
            <div className="group">
              <div className="mb-6">
                <div className="text-6xl font-thin text-white/10 mb-4">01</div>
                <h3 className="text-2xl font-light text-white mb-4">Choose Your Creation Type</h3>
                <p className="text-white/60 leading-relaxed">
                  Text-to-image, text-to-video, image-to-video, or face swapping. Upload your content or describe your vision in plain text.
                </p>
              </div>
              <div className="w-full h-px bg-white/5 group-hover:bg-white/20 transition-colors duration-300"></div>
            </div>

            {/* Step 2 */}
            <div className="group">
              <div className="mb-6">
                <div className="text-6xl font-thin text-white/10 mb-4">02</div>
                <h3 className="text-2xl font-light text-white mb-4">Select Premium AI Model</h3>
                <p className="text-white/60 leading-relaxed">
                  Choose from Google Imagen 4, Flux, Ideogram V3, Google Veo for video, and 20+ other cutting-edge models. Each optimized for different styles and outputs.
                </p>
              </div>
              <div className="w-full h-px bg-white/5 group-hover:bg-white/20 transition-colors duration-300"></div>
            </div>

            {/* Step 3 */}
            <div className="group">
              <div className="mb-6">
                <div className="text-6xl font-thin text-white/10 mb-4">03</div>
                <h3 className="text-2xl font-light text-white mb-4">Generate & Export</h3>
                <p className="text-white/60 leading-relaxed">
                  Get 4K images or 1080p videos in multiple aspect ratios. Cost: 1-3 credits for images, varies for videos. Download instantly or iterate with variations.
                </p>
              </div>
              <div className="w-full h-px bg-white/5 group-hover:bg-white/20 transition-colors duration-300"></div>
            </div>
            
          </div>
        </div>
      </div>

      {/* FAQ Section - Balanced */}
      <div className="py-24 px-4 md:px-10">
        <div className="max-w-4xl mx-auto">
          
          {/* Section header */}
          <div className="mb-16">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-8 h-px bg-white/20"></div>
              <h2 className="text-3xl md:text-5xl font-light text-white">Frequently asked</h2>
            </div>
          </div>
          
          {/* FAQ Grid */}
          <div className="grid md:grid-cols-2 gap-8 md:gap-12">
            
            <div className="space-y-8">
              <div className="group">
                <h4 className="text-xl font-light text-white mb-3 cursor-pointer group-hover:text-white/70 transition-colors">
                  What subscription plans do you offer?
                </h4>
                <p className="text-white/50 leading-relaxed">
                  Starter ($14/month, 200 credits), Creator ($30/month, 500 credits), and Pro ($150/month, 3000 credits). All plans include premium AI models.
                </p>
                <div className="w-full h-px bg-white/5 mt-4"></div>
              </div>

              <div className="group">
                <h4 className="text-xl font-light text-white mb-3 cursor-pointer group-hover:text-white/70 transition-colors">
                  Which AI models are available?
                </h4>
                <p className="text-white/50 leading-relaxed">
                  20+ premium models including Google Imagen 4, Flux, Ideogram V3, Google Veo for video, and specialized face swap models.
                </p>
                <div className="w-full h-px bg-white/5 mt-4"></div>
              </div>

              <div className="group">
                <h4 className="text-xl font-light text-white mb-3 cursor-pointer group-hover:text-white/70 transition-colors">
                  Can I buy credits without a subscription?
                </h4>
                <p className="text-white/50 leading-relaxed">
                  Yes! One-time credit packages from 200-2000 credits. Credits never expire and subscribers get discounts.
                </p>
                <div className="w-full h-px bg-white/5 mt-4"></div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="group">
                <h4 className="text-xl font-light text-white mb-3 cursor-pointer group-hover:text-white/70 transition-colors">
                  How much do generations cost?
                </h4>
                <p className="text-white/50 leading-relaxed">
                  Images: 1-3 credits depending on model. Videos: varies by duration and quality. Face swaps: 3 credits each.
                </p>
                <div className="w-full h-px bg-white/5 mt-4"></div>
              </div>

              <div className="group">
                <h4 className="text-xl font-light text-white mb-3 cursor-pointer group-hover:text-white/70 transition-colors">
                  What can I create?
                </h4>
                <p className="text-white/50 leading-relaxed">
                  Text-to-image, text-to-video, image-to-video, face swapping. Output in 4K images and 1080p videos with multiple aspect ratios.
                </p>
                <div className="w-full h-px bg-white/5 mt-4"></div>
              </div>

              <div className="group">
                <h4 className="text-xl font-light text-white mb-3 cursor-pointer group-hover:text-white/70 transition-colors">
                  Is there a free trial?
                </h4>
                <p className="text-white/50 leading-relaxed">
                  Sign up for free to explore the platform. No credit card required to get started.
                </p>
                <div className="w-full h-px bg-white/5 mt-4"></div>
              </div>
            </div>
            
          </div>
        </div>
      </div>


    </div>
  );
};

export default WelcomePage;