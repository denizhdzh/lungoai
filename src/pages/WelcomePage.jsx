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
        // Use get() instead of getDocs() for faster single read
        const featuresRef = collection(db, 'system', 'features', 'items');
        const q = query(featuresRef, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        
        // Process data more efficiently
        const featuresData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setFeatures(featuresData);
        
        const loadTime = performance.now() - startTime;
        console.log(`🚀 Features loaded in ${Math.round(loadTime)}ms:`, featuresData.length);
      } catch (error) {
        console.error('❌ Features error:', error);
        setFeatures([]);
      }
    };

    fetchFeatures();
  }, []);

  // Aggressive preload images for instant display
  useEffect(() => {
    if (features.length > 0) {
      // Preload ALL images simultaneously with high priority
      features.forEach((feature) => {
        if (feature.imageUrl && !loadedImages.has(feature.imageUrl)) {
          const img = new Image();
          img.onload = () => setLoadedImages(prev => new Set([...prev, feature.imageUrl]));
          img.onerror = () => console.log(`❌ Failed to preload:`, feature.featureName);
          // Start loading immediately, no delays
          img.src = feature.imageUrl;
        }
      });
    }
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