import { useState, useEffect } from 'react';

const EditTransition = ({ beforeImage, afterImage, featureName, aiModel, link, duration = 4000 }) => {
  const [sliderValue, setSliderValue] = useState(0);
  const [beforeLoaded, setBeforeLoaded] = useState(false);
  const [afterLoaded, setAfterLoaded] = useState(false);

  // Automatic slider animation
  useEffect(() => {
    const interval = setInterval(() => {
      setSliderValue(prev => {
        // Smooth ping-pong animation: 0 -> 100 -> 0
        const progress = (Date.now() % duration) / duration;
        const pingPong = progress <= 0.5 
          ? progress * 2 * 100  // 0 to 100
          : (2 - progress * 2) * 100;  // 100 to 0
        return pingPong;
      });
    }, 16); // ~60fps

    return () => clearInterval(interval);
  }, [duration]);

  return (
    <div 
      className="relative w-full h-full overflow-hidden cursor-pointer"
    >
      {/* Loading placeholder */}
      {(!beforeLoaded || !afterLoaded) && (
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 via-neutral-700 to-neutral-600 animate-pulse" />
      )}
      

      {/* Before Image */}
      <img
        src={beforeImage}
        alt="Before edit"
        className="absolute inset-0 w-full h-full object-cover"
        loading="eager"
        decoding="async"
        onLoad={() => setBeforeLoaded(true)}
        onError={() => console.error('Before image failed:', beforeImage)}
        style={{ display: beforeLoaded ? 'block' : 'none' }}
      />
      
      {/* After Image with clip-path based on slider */}
      <img
        src={afterImage}
        alt="After edit"
        className="absolute inset-0 w-full h-full object-cover"
        loading="eager"
        decoding="async"
        onLoad={() => setAfterLoaded(true)}
        onError={() => console.error('After image failed:', afterImage)}
        style={{ 
          display: afterLoaded ? 'block' : 'none',
          clipPath: `inset(0 ${100 - sliderValue}% 0 0)`
        }}
      />
      
      {/* Vertical divider line */}
      <div 
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none"
        style={{ left: `${sliderValue}%` }}
      />
      
      {/* Slider handle */}
      <div 
        className="absolute top-1/2 transform -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-white rounded-full shadow-lg border-2 border-gray-300 pointer-events-none flex items-center justify-center"
        style={{ left: `${sliderValue}%` }}
      >
        <div className="w-1 h-4 bg-gray-400 rounded"></div>
      </div>
      
      {/* Labels */}
      <div className="absolute top-4 left-4 text-white text-sm font-medium bg-black/50 px-2 py-1 rounded pointer-events-none">
        Before
      </div>
      <div className="absolute top-4 right-4 text-white text-sm font-medium bg-black/50 px-2 py-1 rounded pointer-events-none">
        After
      </div>
      
    </div>
  );
};

export default EditTransition;