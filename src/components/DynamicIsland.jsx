import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Spinner, Info, CheckCircle, XCircle, FilmSlate, ImageSquare, Slideshow as SlideshowIcon } from '@phosphor-icons/react';

const DotLoader = ({ isDarkMode }) => (
  <span className={`inline-flex ml-1 ${isDarkMode ? 'text-black' : 'text-white'}`}>
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
    const iconColor = isDarkMode ? "text-black" : "text-white";

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
    if (!item) return <span className={isDarkMode ? "text-black" : "text-white"}>              Welcome, Deniz! No active tasks for now!\n</span>;

    const textColorClass = isDarkMode ? "text-black" : "text-white";

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
      descriptiveText = 'Generating AI image';
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
      'pending_concatenation', 'processing_concatenation'
    ];

    if (item.isMain && activeStatusesForLoader.includes(item.status)) {
      return (
        <span className={`${textColorClass} font-medium`}>
          {descriptiveText || `Generating ${name.toLowerCase()}`}
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
        className={`flex items-center justify-center h-8 px-4 rounded-full shadow-lg transition-colors duration-200 ${isDarkMode ? 'bg-white text-black' : 'bg-black text-white'}`}
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ width: 'fit-content', minWidth: 150 }}
      >
        <div className="w-2 h-2 bg-green-500 rounded-full mr-2 flex-shrink-0 animate-pulse"></div>
        <span className="text-xs font-medium">Loading tasks...</span>
      </motion.div>
    );
  }

  if (!currentDisplayItem) {
    return (
      <motion.div
        className="relative flex justify-center items-start"
        style={{ height: 32, zIndex: 20 }}
      >
        <motion.div
          className={`relative flex flex-col overflow-hidden ${isDarkMode ? 'bg-white text-black' : 'bg-black text-white'} rounded-full px-3 opacity-60`}
          style={{ width: 'fit-content', height: 32, minHeight: 32 }}
        >
          <motion.div 
            className="flex items-center h-8 w-full flex-shrink-0"
          >
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2 flex-shrink-0 animate-pulse"></div>
            <div className="flex-grow flex items-center gap-2 overflow-hidden whitespace-nowrap">
              <span className={`text-xs text-ellipsis overflow-hidden ${isDarkMode ? "text-black" : "text-white"} font-medium`}>
              No active tasks!
              </span>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="relative flex justify-center items-start"
      style={{ height: 32, zIndex: 20 }}
    >
      <motion.div
        className={`relative flex flex-col overflow-hidden ${isDarkMode ? 'bg-white text-black' : 'bg-black text-white'} rounded-full px-3`}
        style={{ width: 'fit-content', height: 32, minHeight: 32, minWidth: 150 }}
      >
        <motion.div 
          className="flex items-center h-8 w-full flex-shrink-0"
        >
          {(currentDisplayItem && (currentDisplayItem.isMain || commandQueue.length > 0)) && 
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2 flex-shrink-0 animate-pulse"></div>
          }
          <div className="flex-grow flex items-center gap-2 overflow-hidden whitespace-nowrap">
            {getIcon(currentDisplayItem)} 
            <span className="text-xs text-ellipsis overflow-hidden">
              {getStatusText(currentDisplayItem)}
            </span>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

export default DynamicIsland; 