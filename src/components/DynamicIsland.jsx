import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Spinner, Info, CheckCircle, XCircle, FilmSlate, ImageSquare, Slideshow as SlideshowIcon, Clock, Play } from '@phosphor-icons/react';

const DotLoader = () => (
  <motion.div 
    className="flex space-x-1 ml-2"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
  >
    {[0, 1, 2].map((i) => (
      <motion.div
        key={i}
        className="w-1 h-1 bg-white rounded-full"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.5, 1, 0.5]
        }}
        transition={{
          duration: 1.2,
          repeat: Infinity,
          delay: i * 0.2
        }}
      />
    ))}
  </motion.div>
);

const DynamicIsland = ({ generatingItem, commandQueue = [], isDarkMode, position = 'top-center' }) => {
  const [currentDisplayItem, setCurrentDisplayItem] = useState(null);

  useEffect(() => {
    if (generatingItem) {
      setCurrentDisplayItem({ ...generatingItem, isMain: true });
    } else if (commandQueue.length > 0) {
      setCurrentDisplayItem({
        type: commandQueue[0].commandCode === 101 ? 'video' : commandQueue[0].commandCode >= 200 && commandQueue[0].commandCode < 300 ? 'image' : commandQueue[0].commandCode === 301 ? 'slideshow' : 'task',
        name: commandQueue[0].parameters?.subject_description || commandQueue[0].parameters?.image_subject || commandQueue[0].parameters?.topic || 'Processing...',
        status: 'queued',
        isMain: false
      });
    } else {
      setCurrentDisplayItem(null);
    }
  }, [generatingItem, commandQueue]);

  const getIcon = (item, status) => {
    if (!item) return <Info size={14} className="text-white/60" />;
    
    const iconProps = { size: 14, className: "flex-shrink-0 text-white" };
    
    // Status-based icons
    if (status === 'completed' || status === 'succeeded') {
      return <CheckCircle {...iconProps} className="flex-shrink-0 text-lime-400" />;
    }
    if (status === 'failed' || status === 'error') {
      return <XCircle {...iconProps} className="flex-shrink-0 text-red-400" />;
    }
    if (status === 'starting' || status === 'processing') {
      return <Spinner {...iconProps} className="flex-shrink-0 text-white animate-spin" />;
    }
    
    // Type-based icons
    switch (item.type) {
      case 'video': return <FilmSlate {...iconProps} />;
      case 'image': return <ImageSquare {...iconProps} />;
      case 'slideshow': return <SlideshowIcon {...iconProps} />;
      default: return <Info {...iconProps} />;
    }
  };
  
  const getStatusText = (item) => {
    if (!item) return null;

    let descriptiveText = '';

    // Handle async prediction statuses first
    if (item.status === 'starting') {
      descriptiveText = 'Starting generation...';
    } else if (item.status === 'processing') {
      descriptiveText = 'AI is processing...';
    } else if (item.status === 'succeeded' || item.status === 'completed') {
      descriptiveText = item.type === 'video' ? 'Video ready!' : 'Image ready!';
    } else if (item.status === 'failed' || item.status === 'error') {
      descriptiveText = 'Generation failed';
    } else if (item.type === 'video') {
      // Legacy video statuses
      switch (item.status) {
        case 'image_generation_pending':
        case 'image_generating':
          descriptiveText = 'Generating scenes';
          break;
        case 'image_generated':
          descriptiveText = 'Rendering video';
          break;
        case 'pending_concatenation':
        case 'processing_concatenation':
          descriptiveText = 'Finalizing video';
          break;
        case 'assets_ready_for_review':
          descriptiveText = 'Video ready';
          break;
        default:
          descriptiveText = 'Generating video';
      }
    } else if (item.type === 'image') {
      // Legacy image statuses
      switch (item.status) {
        case 'creating_prompt':
          descriptiveText = 'Creating prompt';
          break;
        case 'generating_image':
          descriptiveText = 'Generating image';
          break;
        case 'saving_image':
          descriptiveText = 'Saving image';
          break;
        default:
          descriptiveText = 'Generating image';
      }
    } else {
      descriptiveText = item.name || 'Processing...';
    }

    // Active states that should show loader
    const activeStatuses = [
      'starting', 'processing', 'initiating', 'generating', 'uploading',
      'image_generation_pending', 'image_generating', 'image_generated',
      'pending_concatenation', 'processing_concatenation',
      'creating_prompt', 'generating_image', 'saving_image', 'updating_credits'
    ];

    const isActive = activeStatuses.includes(item.status);
    const isCompleted = ['completed', 'succeeded', 'assets_ready_for_review'].includes(item.status);
    const isFailed = ['failed', 'error'].includes(item.status);

    return (
      <div className="flex items-center">
        <span className="text-white text-sm font-medium">
          {descriptiveText}
        </span>
        {isActive && <DotLoader />}
      </div>
    );
  };

  const hasActiveTask = !!currentDisplayItem;

  if (!hasActiveTask) {
    return null; // Don't show anything when no active tasks
  }

  // Position classes based on prop
  const getPositionClasses = () => {
    switch (position) {
      case 'bottom-right':
        return 'fixed bottom-6 right-6 z-50';
      case 'top-center':
      default:
        return 'fixed top-4 left-1/2 transform -translate-x-1/2 z-50';
    }
  };

  // Animation direction based on position
  const getAnimationProps = () => {
    switch (position) {
      case 'bottom-right':
        return {
          initial: { opacity: 0, x: 20, y: 20 },
          animate: { opacity: 1, x: 0, y: 0 },
          exit: { opacity: 0, x: 20, y: 20 }
        };
      case 'top-center':
      default:
        return {
          initial: { opacity: 0, y: -20 },
          animate: { opacity: 1, y: 0 },
          exit: { opacity: 0, y: -20 }
        };
    }
  };

  return (
    <motion.div
      className={getPositionClasses()}
      {...getAnimationProps()}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="bg-neutral-900 text-white rounded-full px-4 py-2 shadow-2xl backdrop-blur-xl border border-neutral-700/50"
        style={{ minWidth: 200 }}
        whileHover={{ scale: 1.02 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        <div className="flex items-center gap-3">
          {getIcon(currentDisplayItem, currentDisplayItem?.status)}
          <div className="flex-1 min-w-0">
            {getStatusText(currentDisplayItem)}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default DynamicIsland; 