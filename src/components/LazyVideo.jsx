import { useState, useRef, useEffect } from 'react';

const LazyVideo = ({ src, className, alt, ...props }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (videoRef.current) {
      observer.observe(videoRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const handleLoadStart = () => {
    setIsLoaded(true);
  };

  return (
    <div ref={videoRef} className={className}>
      {isInView ? (
        <>
          {!isLoaded && (
            <div className="absolute inset-0 bg-neutral-800 animate-pulse rounded-xl flex items-center justify-center">
              <div className="text-neutral-500 text-xs">Loading video...</div>
            </div>
          )}
          <video
            src={src}
            onLoadStart={handleLoadStart}
            className={`${className} ${!isLoaded ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
            {...props}
          />
        </>
      ) : (
        <div className={`${className} bg-neutral-800 animate-pulse rounded-xl flex items-center justify-center`}>
          <div className="text-neutral-500 text-xs">📹</div>
        </div>
      )}
    </div>
  );
};

export default LazyVideo;