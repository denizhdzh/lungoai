import { useState, useEffect } from 'react';

const EditTransition = ({ beforeImage, afterImage, featureName, aiModel, cta, link, duration = 3000 }) => {
  const [showAfter, setShowAfter] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setShowAfter(prev => !prev);
    }, duration);

    return () => clearInterval(interval);
  }, [duration]);

  return (
    <div className="relative w-full h-full overflow-hidden">
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
      
      {/* Edit indicator */}
      <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${
          showAfter ? 'bg-lime-400' : 'bg-white/60'
        }`} />
        <span className="text-xs text-white font-medium">
          {showAfter ? 'AFTER' : 'BEFORE'}
        </span>
      </div>
      
      {/* Content overlay */}
      <div className="absolute inset-0 bg-black/10 transition-colors" />
      <div className="relative z-10 h-full flex flex-col items-center justify-center text-center p-8">
        <h3 className="text-5xl md:text-8xl font-bold text-yellow-400 mb-2 uppercase tracking-wide font-serif">
          {featureName}
        </h3>
        <p className="text-lg text-white/80 mb-6">
          {aiModel}
        </p>
        {cta && link && (
          <a 
            href={link}
            className="bg-lime-400 text-black px-6 py-3 rounded-lg font-medium hover:bg-lime-300 transition-colors"
          >
            {cta}
          </a>
        )}
      </div>
    </div>
  );
};

export default EditTransition;