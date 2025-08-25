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
      
      // Check cache first
      const cacheKey = 'lungo_features_cache';
      const cached = localStorage.getItem(cacheKey);
      
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        // Use cache if less than 10 minutes old
        if (Date.now() - timestamp < 10 * 60 * 1000) {
          setFeatures(data);
          console.log(`⚡ Features loaded from cache: ${data.length} items`);
          return;
        }
      }
      
      try {
        const featuresRef = collection(db, 'system', 'features', 'items');
        const q = query(featuresRef, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        
        const featuresData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Cache the data
        localStorage.setItem(cacheKey, JSON.stringify({
          data: featuresData,
          timestamp: Date.now()
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
          console.log(`❌ Failed to preload:`, feature.featureName);
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
      <div className="py-6 px-4 md:px-10 mt-4">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-light text-white mb-4 mt-24 font-['Oswald']">
            Easiest way to generate with AI
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

    </div>
  );
};

export default WelcomePage;