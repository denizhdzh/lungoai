import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DownloadSimple, Heart, Trash, X as CloseIcon, CircleNotch } from '@phosphor-icons/react';
import { auth, db } from '../firebase';
import { deleteDoc, doc } from '@firebase/firestore';

function SimpleImageModal({ generation, onClose, onToggleFavorite, onGenerationDeleted, onShowSuccessNotification }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const videoRef = useRef(null);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const urlToDownload = generation.type === 'video' ? 
        (generation.finalVideoUrl || generation.runwayVideoUrl || generation.videoUrl) : 
        generation.imageUrl;
      
      if (urlToDownload) {
        const response = await fetch(urlToDownload);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `generation-${generation.id}.${generation.type === 'video' ? 'mp4' : 'png'}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        onShowSuccessNotification?.('Download started!');
      }
    } catch (error) {
      console.error('Error downloading:', error);
      onShowSuccessNotification?.('Download failed. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this generation?')) return;
    
    setIsDeleting(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("User not authenticated");
      
      const collectionPath = generation.type === 'video' ? 'tiktok-posts' : 'generations';
      await deleteDoc(doc(db, 'users', user.uid, collectionPath, generation.id));
      
      onShowSuccessNotification?.('Generation deleted successfully!');
      onGenerationDeleted?.(generation.id);
      onClose();
    } catch (error) {
      console.error('Error deleting generation:', error);
      onShowSuccessNotification?.("Error deleting. Try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center p-6 z-50" onClick={onClose}>
        {/* Main Image/Video Display */}
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="relative max-w-4xl max-h-[75vh] bg-black rounded-2xl overflow-hidden shadow-2xl mb-6" 
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative w-full h-full">
            {generation.type === 'image' && generation.imageUrl && (
              <img 
                src={generation.imageUrl} 
                alt={generation.prompt || 'Generated image'} 
                className="w-full h-full object-contain"
              />
            )}
            
            {generation.type === 'video' && generation.videoUrl && (
              <video 
                ref={videoRef}
                src={`${generation.finalVideoUrl || generation.runwayVideoUrl || generation.videoUrl}`} 
                className="w-full h-full object-contain" 
                controls
                preload="metadata"
                playsInline
                poster={generation.thumbnailUrl || undefined}
                onLoadedMetadata={() => {
                  if (videoRef.current && !generation.thumbnailUrl) {
                    videoRef.current.currentTime = 0.1;
                  }
                }}
              />
            )}
            
            {generation.type === 'slideshow' && generation.processedImageUrls && generation.processedImageUrls.length > 0 && (
              <img 
                src={generation.processedImageUrls[0]} 
                alt="Slideshow preview"
                className="w-full h-full object-contain"
              />
            )}
          </div>
        </motion.div>
        
        {/* Action Buttons - Below the image/video */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="flex items-center gap-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Download Button */}
          {(generation.type === 'image' || 
            (generation.type === 'video' && (generation.finalVideoUrl || generation.videoUrl)) || 
            (generation.type === 'slideshow' && generation.processedImageUrls && generation.processedImageUrls.length > 0)) && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex items-center gap-2 px-6 py-3 bg-lime-500 hover:bg-lime-400 disabled:bg-neutral-600 text-black disabled:text-neutral-400 font-medium rounded-xl transition-all shadow-lg"
            >
              {isDownloading ? (
                <CircleNotch size={20} className="animate-spin" />
              ) : (
                <>
                  <DownloadSimple size={20} />
                  Download
                </>
              )}
            </motion.button>
          )}
          
          {/* Favorite Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onToggleFavorite?.(generation.id)}
            className={`flex items-center gap-2 px-6 py-3 ${
              generation.isFavorite 
                ? 'bg-red-500 hover:bg-red-400 text-white' 
                : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
            } font-medium rounded-xl transition-all shadow-lg`}
          >
            <Heart size={20} weight={generation.isFavorite ? 'fill' : 'regular'} />
            {generation.isFavorite ? 'Unfavorite' : 'Favorite'}
          </motion.button>
          
          {/* Delete Button */}
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 disabled:bg-neutral-600 text-white disabled:text-neutral-400 font-medium rounded-xl transition-all shadow-lg"
          >
            {isDeleting ? (
              <CircleNotch size={20} className="animate-spin" />
            ) : (
              <>
                <Trash size={20} />
                Delete
              </>
            )}
          </motion.button>
          
          {/* Close Button */}
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="flex items-center gap-2 px-6 py-3 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 font-medium rounded-xl transition-all shadow-lg"
          >
            <CloseIcon size={20} />
            Close
          </motion.button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default SimpleImageModal;