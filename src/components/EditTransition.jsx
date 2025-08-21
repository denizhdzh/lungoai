import { useState, useEffect } from 'react';

const EditTransition = ({ beforeImage, afterImage, featureName, aiModel, link, duration = 3000 }) => {
  const [showAfter, setShowAfter] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setShowAfter(prev => !prev);
    }, duration);

    return () => clearInterval(interval);
  }, [duration]);

  return (
    <a href={link} className="relative w-full h-full overflow-hidden block">
      {/* Before Image */}
      <img
        src={beforeImage}
        alt="Before edit"
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
          showAfter ? 'opacity-0' : 'opacity-100'
        }`}
      />
      
      {/* After Image */}
      <img
        src={afterImage}
        alt="After edit"
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
          showAfter ? 'opacity-100' : 'opacity-0'
        }`}
      />
      
      
    </a>
  );
};

export default EditTransition;