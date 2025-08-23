import { useState, useEffect } from 'react';

const EditTransition = ({ beforeImage, afterImage, featureName, aiModel, link, duration = 3000 }) => {
  const [showAfter, setShowAfter] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [beforeLoaded, setBeforeLoaded] = useState(false);
  const [afterLoaded, setAfterLoaded] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setShowAfter(prev => !prev);
    }, duration);

    return () => clearInterval(interval);
  }, [duration]);

  return (
    <a href={link} className="relative w-full h-full overflow-hidden block">
      {/* Loading placeholder */}
      {(!beforeLoaded || !afterLoaded) && (
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 via-neutral-700 to-neutral-600 animate-pulse" />
      )}
      
      {/* Before Image */}
      <img
        src={beforeImage}
        alt="Before edit"
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
          showAfter ? 'opacity-0' : 'opacity-100'
        }`}
        onLoad={() => setBeforeLoaded(true)}
        style={{ display: beforeLoaded ? 'block' : 'none' }}
      />
      
      {/* After Image */}
      <img
        src={afterImage}
        alt="After edit"
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
          showAfter ? 'opacity-100' : 'opacity-0'
        }`}
        onLoad={() => setAfterLoaded(true)}
        style={{ display: afterLoaded ? 'block' : 'none' }}
      />
      
      
    </a>
  );
};

export default EditTransition;