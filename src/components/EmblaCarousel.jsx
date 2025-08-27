import React, { useCallback, useState, useEffect } from 'react'
import {
  PrevButton,
  NextButton,
  usePrevNextButtons
} from './EmblaCarouselArrowButtons'
import EditTransition from './EditTransition'
import Autoplay from 'embla-carousel-autoplay'
import useEmblaCarousel from 'embla-carousel-react'

const EmblaCarousel = (props) => {
  const { slides, options } = props
  const [emblaRef, emblaApi] = useEmblaCarousel(options, [Autoplay({ delay: 8000, stopOnInteraction: false })])
  const [loadedImages, setLoadedImages] = useState(new Set())
  const [connectionType, setConnectionType] = useState('fast')
  const [isLowBandwidth, setIsLowBandwidth] = useState(false)

  // Detect connection speed
  useEffect(() => {
    if ('connection' in navigator) {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (connection) {
        const updateConnection = () => {
          const effectiveType = connection.effectiveType;
          const isSlowConnection = effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g';
          setConnectionType(effectiveType);
          setIsLowBandwidth(isSlowConnection);
        };
        
        updateConnection();
        connection.addEventListener('change', updateConnection);
        return () => connection.removeEventListener('change', updateConnection);
      }
    }
    
    // Fallback: detect based on loading time
    const startTime = Date.now();
    const testImg = new Image();
    testImg.onload = () => {
      const loadTime = Date.now() - startTime;
      setIsLowBandwidth(loadTime > 2000); // If test image takes >2s, assume slow connection
    };
    testImg.src = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGRkqGx0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q==';
  }, [])

  // Get optimized image URL based on connection and device
  const getOptimizedImageUrl = (originalUrl, isMobile = false) => {
    if (!originalUrl) return originalUrl;
    
    let quality = 85; // Default quality
    let width = null;
    
    if (isLowBandwidth) {
      quality = isMobile ? 60 : 70; // Lower quality for slow connections
    } else {
      quality = isMobile ? 75 : 85; // Normal quality
    }
    
    // If using a service that supports URL parameters (like Firebase, Cloudinary, etc.)
    if (originalUrl.includes('firebasestorage.googleapis.com')) {
      return originalUrl; // Firebase doesn't support on-the-fly optimization
    }
    
    return originalUrl; // Return original if no optimization service
  }

  const onNavButtonClick = useCallback((emblaApi) => {
    const autoplay = emblaApi?.plugins()?.autoplay
    if (!autoplay) return

    const resetOrStop =
      autoplay.options.stopOnInteraction === false
        ? autoplay.reset
        : autoplay.stop

    resetOrStop()
  }, [])

  const {
    prevBtnDisabled,
    nextBtnDisabled,
    onPrevButtonClick,
    onNextButtonClick
  } = usePrevNextButtons(emblaApi, onNavButtonClick)

  return (
    <section className="embla">
      <div className="embla__viewport" ref={emblaRef}>
        <div className="embla__container">
          {slides.map((slide, index) => (
            <div className="embla__slide" key={index}>
              <a href={slide.link} className="block w-full relative cursor-pointer overflow-hidden shadow-2xl max-w-4xl mx-auto" style={{ aspectRatio: window.innerWidth < 1024 ? '1587/2245' : '16/9' }}>
                {/* Render based on type */}
                {slide.type === 'edit_demo' && slide.beforeImage && slide.afterImage ? (
                  <EditTransition 
                    beforeImage={(() => {
                      const isMobile = window.innerWidth < 1024;
                      const baseImage = isMobile && slide.mobileBeforeImage ? slide.mobileBeforeImage : slide.beforeImage;
                      return getOptimizedImageUrl(baseImage, isMobile);
                    })()} 
                    afterImage={(() => {
                      const isMobile = window.innerWidth < 1024;
                      const baseImage = isMobile && slide.mobileAfterImage ? slide.mobileAfterImage : slide.afterImage;
                      return getOptimizedImageUrl(baseImage, isMobile);
                    })()}
                    featureName={slide.featureName}
                    aiModel={slide.aiModel}
                    link={slide.link}
                    duration={4000}
                  />
                ) : slide.type === 'video' && slide.videoUrl ? (
                  <>
                    {(() => {
                      const isMobile = window.innerWidth < 1024;
                      const videoSrc = isMobile && slide.mobileVideoUrl ? slide.mobileVideoUrl : slide.videoUrl;
                      return (
                        <>
                          {/* Loading placeholder for video */}
                          {!loadedImages.has(videoSrc) && (
                            <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 via-neutral-700 to-neutral-600 animate-pulse" />
                          )}
                          <video
                            src={videoSrc}
                            className="absolute inset-0 w-full h-full object-cover"
                            autoPlay
                            muted
                            loop
                            playsInline
                            onLoadedData={() => setLoadedImages(prev => new Set([...prev, videoSrc]))}
                            style={{ display: loadedImages.has(videoSrc) ? 'block' : 'none' }}
                          />
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    {(() => {
                      const isMobile = window.innerWidth < 1024;
                      const baseImageSrc = isMobile && slide.mobileImageUrl ? slide.mobileImageUrl : slide.imageUrl;
                      const optimizedImageSrc = getOptimizedImageUrl(baseImageSrc, isMobile);
                      return (
                        <>
                          {/* Enhanced loading placeholder with connection info */}
                          {optimizedImageSrc && !loadedImages.has(optimizedImageSrc) && (
                            <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 via-neutral-700 to-neutral-600 animate-pulse">
                              {isLowBandwidth && (
                                <div className="absolute bottom-4 left-4 text-white/60 text-xs bg-black/50 px-2 py-1 rounded">
                                  Optimizing for slow connection...
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* Static Image with lazy loading */}
                          {optimizedImageSrc && (
                            <img
                              src={optimizedImageSrc}
                              alt={slide.featureName}
                              className="absolute inset-0 w-full h-full object-cover"
                              loading="eager"
                              decoding="async"
                              onLoad={() => setLoadedImages(prev => new Set([...prev, optimizedImageSrc]))}
                              style={{ display: loadedImages.has(optimizedImageSrc) ? 'block' : 'none' }}
                            />
                          )}
                        </>
                      );
                    })()}
                  </>
                )}
                
              </a>
            </div>
          ))}
        </div>
      </div>

      <div className="embla__controls">
        <div className="embla__buttons">
          <PrevButton onClick={onPrevButtonClick} disabled={prevBtnDisabled} />
          <NextButton onClick={onNextButtonClick} disabled={nextBtnDisabled} />
        </div>
      </div>
    </section>
  )
}

export default EmblaCarousel