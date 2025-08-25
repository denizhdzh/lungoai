import React, { useCallback } from 'react'
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
  const [loadedImages, setLoadedImages] = React.useState(new Set())

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
                    beforeImage={window.innerWidth < 1024 && slide.mobileBeforeImage ? slide.mobileBeforeImage : slide.beforeImage} 
                    afterImage={window.innerWidth < 1024 && slide.mobileAfterImage ? slide.mobileAfterImage : slide.afterImage}
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
                      const imageSrc = isMobile && slide.mobileImageUrl ? slide.mobileImageUrl : slide.imageUrl;
                      return (
                        <>
                          {/* Loading placeholder */}
                          {imageSrc && !loadedImages.has(imageSrc) && (
                            <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 via-neutral-700 to-neutral-600 animate-pulse" />
                          )}
                          
                          {/* Static Image */}
                          {imageSrc && (
                            <img
                              src={imageSrc}
                              alt={slide.featureName}
                              className="absolute inset-0 w-full h-full object-cover"
                              onLoad={() => setLoadedImages(prev => new Set([...prev, imageSrc]))}
                              style={{ display: loadedImages.has(imageSrc) ? 'block' : 'none' }}
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