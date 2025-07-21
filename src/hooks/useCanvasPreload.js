import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

export const useCanvasPreload = () => {
  const [canvasData, setCanvasData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadCanvasData = useCallback(async (user) => {
    if (!user) return null;
    
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('🔄 Preloading canvas data for user:', user.uid);
      
      const canvasRef = doc(db, 'canvases', user.uid);
      const canvasSnap = await getDoc(canvasRef);
      
      if (canvasSnap.exists()) {
        const data = canvasSnap.data();
        const processedData = {
          nodes: data.nodes || [],
          edges: data.edges || [],
          timestamp: data.timestamp || data.updatedAt?.toMillis() || Date.now()
        };
        
        console.log('✅ Canvas data preloaded successfully');
        setCanvasData(processedData);
        return processedData;
      } else {
        console.log('📝 No existing canvas data, will start fresh');
        setCanvasData({ nodes: [], edges: [], timestamp: Date.now() });
        return { nodes: [], edges: [], timestamp: Date.now() };
      }
    } catch (err) {
      console.error('❌ Failed to preload canvas data:', err);
      setError(err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const preloadForCurrentUser = useCallback(async () => {
    const user = auth.currentUser;
    if (user) {
      return await loadCanvasData(user);
    }
    return null;
  }, [loadCanvasData]);

  return {
    canvasData,
    isLoading,
    error,
    loadCanvasData,
    preloadForCurrentUser
  };
};