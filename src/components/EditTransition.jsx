import { useState } from 'react';

const EditTransition = ({ beforeImage, afterImage, featureName, aiModel, link, duration = 3000 }) => {
  const [sliderValue, setSliderValue] = useState(0);
  const [beforeLoaded, setBeforeLoaded] = useState(false);
  const [afterLoaded, setAfterLoaded] = useState(false);

  const handleSliderChange = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSliderValue(Number(e.target.value));
  };

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    setSliderValue(Math.max(0, Math.min(100, percentage)));
  };

  return (
    <div 
      className="relative w-full h-full overflow-hidden cursor-col-resize"
      onMouseMove={handleMouseMove}
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
        onLoad={() => setBeforeLoaded(true)}
        style={{ display: beforeLoaded ? 'block' : 'none' }}
      />
      
      {/* After Image with clip-path based on slider */}
      <img
        src={afterImage}
        alt="After edit"
        className="absolute inset-0 w-full h-full object-cover"
        onLoad={() => setAfterLoaded(true)}
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
      
      {/* Link overlay */}
      <a href={link} className="absolute inset-0 z-10" aria-label={`View ${featureName}`} />
    </div>
  );
};

export default EditTransition;