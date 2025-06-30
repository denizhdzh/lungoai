import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Spinner, Info, CheckCircle, XCircle, FilmSlate, ImageSquare, Slideshow as SlideshowIcon } from '@phosphor-icons/react';

// --- SVG'yi React komponenti olarak ekleyelim ---
const LungoLogoIcon = ({ className }) => (
  <svg 
    className={className} 
    viewBox="0 0 566 399" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect x="35" y="35" width="496" height="329" rx="93" stroke="currentColor" strokeWidth="70"/>
  </svg>
);

const DotLoader = ({ isDarkMode }) => (
  <span className={`inline-flex ml-1 ${isDarkMode ? 'text-slate-950' : 'text-slate-50'}`}>
    <style>
      {`
        @keyframes blink {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 1; }
        }
        .dot-loader span {
          animation: blink 1.4s infinite both;
          font-size: 14px;
          font-weight: bold;
        }
        .dot-loader span:nth-child(1) {
          animation-delay: 0s;
        }
        .dot-loader span:nth-child(2) {
          animation-delay: 0.2s;
        }
        .dot-loader span:nth-child(3) {
          animation-delay: 0.4s;
        }
      `}
    </style>
    <span className="dot-loader">
      <span>•</span>
      <span>•</span>
      <span>•</span>
    </span>
  </span>
);

const DynamicIsland = ({ generatingItem, commandQueue = [], isDarkMode }) => {
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

  const getIcon = (item) => {
    const iconColor = isDarkMode ? "text-slate-950" : "text-slate-50";

    if (!item) return <Info size={16} className={iconColor} />;
    const iconProps = { size: 16, className: `flex-shrink-0 ${iconColor}` }; 
    
    switch (item.type) {
      case 'video': return <FilmSlate {...iconProps} />;
      case 'image': return null;
      case 'slideshow': return <SlideshowIcon {...iconProps} />;
      default: return <Info {...iconProps} />;
    }
  };
  
  const getStatusText = (item) => {
    if (!item) return null;

    const textColorClass = isDarkMode ? "text-slate-950" : "text-slate-50";

    let typeText = '';
    let descriptiveText = '';

    if (item.type === 'video') {
      typeText = 'Video';
      // Use Firestore status for more descriptive text
      switch (item.status) {
        case 'image_generation_pending':
        case 'image_generating':
          descriptiveText = 'Generating scenes';
          break;
        case 'image_generated':
          descriptiveText = 'Rendering video';
          break;
        case 'processing': // Runway processing
          descriptiveText = 'Processing video';
          break;
        case 'pending_concatenation':
        case 'processing_concatenation':
          descriptiveText = 'Finalizing video';
          break;
        case 'completed':
        case 'assets_ready_for_review': // Consider this as completed for island view
          descriptiveText = 'Video ready';
          break;
        case 'failed':
        case 'runway_failed':
        case 'runway_timeout':
        case 'runway_max_attempts':
        case 'runway_success_no_video':
        case 'polling_internal_error':
        case 'polling_error_config':
          descriptiveText = 'Video generation error';
          break;
        default:
          descriptiveText = 'Video content';
      }
    } else if (item.type === 'image') {
      typeText = 'Image';
      // More detailed status for image generation
      switch (item.status) {
        case 'creating_prompt':
          descriptiveText = 'Creating detailed prompt';
          break;
        case 'generating_image':
          descriptiveText = 'Generating with Flux AI';
          break;
        case 'saving_image':
          descriptiveText = 'Saving to cloud storage';
          break;
        case 'updating_credits':
          descriptiveText = 'Updating credits';
          break;
        case 'completed':
          descriptiveText = 'Image ready';
          break;
        case 'failed':
        case 'error':
          descriptiveText = 'Image generation error';
          break;
        default:
          descriptiveText = 'Generating AI image';
      }
    } else if (item.type === 'slideshow') {
      typeText = 'Slideshow';
      descriptiveText = 'Generating Tiktok slideshow';
    } else if (item.type) {
      typeText = item.type.charAt(0).toUpperCase() + item.type.slice(1);
      descriptiveText = 'content';
    }

    const name = item.name || (item.isMain && typeText ? typeText : (item.isMain ? 'Task' : 'Queued task'));

    // Centralized active states for loader
    const activeStatusesForLoader = [
      'initiating', 'generating', 'processing', 'uploading',
      'image_generation_pending', 'image_generating', 'image_generated',
      'pending_concatenation', 'processing_concatenation',
      // New image generation steps
      'creating_prompt', 'generating_image', 'saving_image', 'updating_credits'
    ];

    if (item.isMain && activeStatusesForLoader.includes(item.status)) {
      const stepText = item.step && item.totalSteps ? ` (${item.step}/${item.totalSteps})` : '';
      return (
        <span className={`${textColorClass} font-medium`}>
          {item.message || descriptiveText || `Generating ${name.toLowerCase()}`}{stepText}
          <DotLoader isDarkMode={isDarkMode} />
        </span>
      );
    }
    
    if (item.isMain && (item.status === 'completed' || item.status === 'failed' || item.status === 'error' || item.status === 'assets_ready_for_review')) {
      // For "assets_ready_for_review", we'll use the specific descriptiveText from video logic
      return <span className={`${textColorClass} font-medium`}>{descriptiveText || `Completed: ${name}`}</span>;
    }

    const statusInfo = item.isMain ? '' : ' (in queue)'; 
    return <span className={`${textColorClass} font-medium`}>{descriptiveText || name}{statusInfo}</span>;
  };

  if ((generatingItem || commandQueue.length > 0) && !currentDisplayItem) {
    return (
      <motion.div
        className={`flex items-center justify-center px-6 py-4 rounded-lg shadow-2xl transition-colors duration-200 ${isDarkMode ? 'bg-white/5 text-slate-950 border-2 border-white/20' : 'bg-white/5 text-slate-50 border-2 border-white/20'} backdrop-blur-xl`}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.3 }}
        style={{ width: 'fit-content', minWidth: 180 }}
      >
        <LungoLogoIcon className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 animate-pulse" />
        <span className="text-sm font-medium">Loading tasks...</span>
      </motion.div>
    );
  }

  // Her zaman göster, ama state'e göre opacity değişsin
  const hasActiveTask = !!currentDisplayItem;
  const isLoading = (generatingItem || commandQueue.length > 0) && !currentDisplayItem;

  return (
    <motion.div
      className="relative flex justify-center items-start"
      style={{ height: 40, zIndex: 20 }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ 
        opacity: hasActiveTask ? 1 : 0.4, 
        scale: hasActiveTask ? 1 : 0.9 
      }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className={`relative flex flex-col overflow-hidden ${isDarkMode ? 'bg-white/5 text-slate-950 border-2 border-white/20' : 'bg-white/5 text-slate-50 border-2 border-white/20'} rounded-lg px-6 py-4 backdrop-blur-xl shadow-2xl`}
        style={{ width: 'fit-content', minWidth: hasActiveTask ? 200 : 140 }}
        whileHover={{ scale: hasActiveTask ? 1.02 : 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        <motion.div 
          className="flex items-center w-full"
        >
          <LungoLogoIcon className={`w-4 h-4 text-green-500 mr-2 flex-shrink-0 ${hasActiveTask ? 'animate-pulse' : ''}`} />
          <div className="flex-grow flex items-center gap-2 overflow-hidden">
            {hasActiveTask && getIcon(currentDisplayItem)}
            <span className={`text-sm font-medium text-ellipsis overflow-hidden ${hasActiveTask ? '' : 'text-xs'}`}>
              {hasActiveTask ? getStatusText(currentDisplayItem) : (
                isLoading ? (
                  <span className={isDarkMode ? "text-slate-600" : "text-slate-400"}>
                    Loading tasks...
                  </span>
                ) : (
                  <span className={isDarkMode ? "text-slate-600" : "text-slate-400"}>
                    Waiting for tasks
                  </span>
                )
              )}
            </span>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

export default DynamicIsland; 