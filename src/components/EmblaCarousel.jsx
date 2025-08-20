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
              <div className="w-full h-80 md:h-[480px] relative cursor-pointer overflow-hidden shadow-2xl">
                {/* Render based on type */}
                {slide.type === 'edit_demo' && slide.beforeImage && slide.afterImage ? (
                  <EditTransition 
                    beforeImage={slide.beforeImage} 
                    afterImage={slide.afterImage}
                    featureName={slide.featureName}
                    aiModel={slide.aiModel}
                    cta={slide.cta}
                    link={slide.link}
                    duration={4000}
                  />
                ) : slide.type === 'video' && slide.imageUrl ? (
                  <video
                    src={slide.imageUrl}
                    className="absolute inset-0 w-full h-full object-cover"
                    autoPlay
                    muted
                    loop
                    playsInline
                  />
                ) : (
                  <>
                    {/* Loading placeholder */}
                    {slide.imageUrl && !loadedImages.has(slide.imageUrl) && (
                      <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 via-neutral-700 to-neutral-600 animate-pulse" />
                    )}
                    
                    {/* Static Image */}
                    {slide.imageUrl && (
                      <img
                        src={slide.imageUrl}
                        alt={slide.featureName}
                        className="absolute inset-0 w-full h-full object-cover"
                        onLoad={() => setLoadedImages(prev => new Set([...prev, slide.imageUrl]))}
                        style={{ display: loadedImages.has(slide.imageUrl) ? 'block' : 'none' }}
                      />
                    )}
                  </>
                )}
                
                <div className="absolute inset-0 bg-black/10 transition-colors" />
                <div className="relative z-10 h-full flex flex-col items-center justify-center text-center p-8">
                  <h3 className="text-5xl md:text-8xl font-bold text-yellow-400 mb-2 uppercase tracking-wide font-serif">
                    {slide.featureName}
                  </h3>
                  <p className="text-lg text-white/80 mb-6">
                    {slide.aiModel}
                  </p>
                  {slide.cta && slide.link && (
                    <a 
                      href={slide.link}
                      className="bg-lime-400 text-black px-6 py-3 rounded-lg font-medium hover:bg-lime-300 transition-colors"
                    >
                      {slide.cta}
                    </a>
                  )}
                </div>
              </div>
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