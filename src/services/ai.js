import { getFunctions, httpsCallable } from 'firebase/functions';
import imageRules from './imageRules.json';

const functions = getFunctions();

// Credit costs for different quality levels
const QUALITY_CREDITS = {
  low: 30,
  medium: 60,
  high: 90
};

// Firebase Functions for secure API calls
const generateImageFunction = httpsCallable(functions, 'generateImage');
const generateVideoFunction = httpsCallable(functions, 'generateVideo');
const generateSlideshowFunction = httpsCallable(functions, 'generateSlideshow');

// Helper function to get random rules from a category
const getRandomRules = (category, count = 2) => {
  if (!category || !Array.isArray(category)) return [];
  const shuffled = [...category].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

// Helper function to get random image set rules
const getRandomImageSetRules = () => {
  if (!imageRules.image_sets || imageRules.image_sets.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * imageRules.image_sets.length);
  return imageRules.image_sets[randomIndex];
};

// Helper function to get specific image set rules by frame ID
const getImageSetRulesByFrameId = (frameId) => {
  if (!imageRules.image_sets || imageRules.image_sets.length === 0) return null;
  
  // Map frame IDs to image set names
  const frameToImageSetMap = {
    'car_selfie_glow': 'Car Selfie Glow',
    'late_night_lofi': 'Late Night Lo-Fi Vibes',
    'forced_perspective': 'Forced Perspective Play',
    'wide_angle_pov': 'Wide-Angle POV Walk',
    'city_street_style': 'City Street Style',
    'solo_snap_vibe': 'Solo Snap Vibe',
    'warm_moments': 'Warm Moments',
    'urban_motion_girl': 'Urban Motion Girl',
    'vintage_buddy_vibes': '90s Vintage Buddy Vibes'
  };
  
  const imageSetName = frameToImageSetMap[frameId];
  if (!imageSetName) return null;
  
  return imageRules.image_sets.find(set => set.image_set_name === imageSetName);
};

// Helper function to enhance prompt with rules
const enhancePromptWithRules = (basePrompt, options = {}) => {
  const {
    useGeneralRules = true,
    useImageSetRules = true,
    selectedFrame = null,
    customRules = []
  } = options;

  let enhancedPrompt = basePrompt;
  let rules = [];

  // Add general rules
  if (useGeneralRules && imageRules.general_rules) {
    const generalRules = imageRules.general_rules;
    
    // Add lighting rules
    if (generalRules.lighting) {
      rules.push(generalRules.lighting.style);
    }
    
    // Add color palette rules
    if (generalRules.color_palette) {
      rules.push(generalRules.color_palette.general_mood);
    }
    
    // Add composition rules
    if (generalRules.composition) {
      rules.push(generalRules.composition.framing);
    }
    
    // Add style and pose rules
    if (generalRules.style_and_pose) {
      rules.push(generalRules.style_and_pose.poses);
      rules.push(generalRules.style_and_pose.expression);
    }
  }

  // Add specific image set rules
  if (useImageSetRules) {
    // Use selected frame rules if provided, otherwise random
    const imageSet = selectedFrame 
      ? getImageSetRulesByFrameId(selectedFrame) 
      : getRandomImageSetRules();
    if (imageSet && imageSet.image_specific_rules) {
      const specificRules = imageSet.image_specific_rules;
      
      // Add camera and composition rules
      if (specificRules.composition_and_perspective) {
        rules.push(`Camera: ${specificRules.composition_and_perspective.camera_type}`);
        rules.push(`Framing: ${specificRules.composition_and_perspective.framing}`);
      }
      
      // Add lighting rules
      if (specificRules.lighting) {
        rules.push(`Lighting: ${specificRules.lighting.lighting_type}`);
      }
      
      // Add visual treatment rules
      if (specificRules.visual_treatment) {
        rules.push(`Style: ${specificRules.visual_treatment.filter_style}`);
      }
      
      // Add fashion rules
      if (specificRules.fashion_and_style) {
        rules.push(`Fashion: ${specificRules.fashion_and_style.clothing}`);
      }
    }
  }

  // Add custom rules
  if (customRules.length > 0) {
    rules.push(...customRules);
  }

  // Combine prompt with rules
  if (rules.length > 0) {
    enhancedPrompt = `${basePrompt}. ${rules.join('. ')}.`;
  }

  return enhancedPrompt;
};

// Helper function to enhance prompt with background image rules
const enhancePromptWithBackgroundRules = (basePrompt) => {
  if (!imageRules.background_image_rules || !imageRules.background_image_rules.image_specific_rules) {
    return basePrompt;
  }

  const bgRules = imageRules.background_image_rules.image_specific_rules;
  let rules = [];

  // Add composition and perspective rules
  if (bgRules.composition_and_perspective) {
    rules.push(`Camera: ${bgRules.composition_and_perspective.camera_type}`);
    rules.push(`Focal length: ${bgRules.composition_and_perspective.focal_length_mm}`);
    rules.push(`Framing: ${bgRules.composition_and_perspective.framing}`);
    rules.push(`Orientation: ${bgRules.composition_and_perspective.orientation}`);
  }

  // Add lighting rules
  if (bgRules.lighting) {
    rules.push(`Lighting: ${bgRules.lighting.lighting_type}`);
    rules.push(`White balance: ${bgRules.lighting.white_balance}`);
    rules.push(`ISO: ${bgRules.lighting.ISO_setting}`);
  }

  // Add location and background rules
  if (bgRules.location_and_background) {
    if (bgRules.location_and_background.primary_environment_types) {
      const randomEnv = bgRules.location_and_background.primary_environment_types[
        Math.floor(Math.random() * bgRules.location_and_background.primary_environment_types.length)
      ];
      rules.push(`Environment: ${randomEnv}`);
    }
    rules.push(`Depth of field: ${bgRules.location_and_background.depth_of_field}`);
  }

  // Add visual treatment rules
  if (bgRules.visual_treatment) {
    rules.push(`Style: ${bgRules.visual_treatment.filter_style}`);
    rules.push(`Color toning: ${bgRules.visual_treatment.color_toning}`);
    rules.push(`Contrast: ${bgRules.visual_treatment.contrast}`);
  }

  // Add negatives (what to avoid)
  if (bgRules.negatives && bgRules.negatives.do_not_use) {
    const avoidRules = bgRules.negatives.do_not_use.slice(0, 3); // Take first 3 to avoid
    rules.push(`Avoid: ${avoidRules.join(', ')}`);
  }

  // Combine prompt with background-specific rules
  const enhancedPrompt = `${basePrompt}. ${rules.join('. ')}.`;
  
  return enhancedPrompt;
};

// Image Generation Service (using Firebase Functions)
export const generateImage = async ({ 
  style, 
  quality = 'high', 
  prompt, // New simple prompt parameter
  subtype, // New subtype parameter (ugc_character, background, general)
  selectedFrame = null, // Selected frame for style rules
  connectedImages = [], // Array of connected image URLs
  // Legacy parameters for backward compatibility
  image_subject, 
  subject_description, 
  clothing_description, 
  setting_description, 
  scene_description
}) => {
  try {
    console.log('REQUESTING image generation with params:', { prompt, subtype, selectedFrame, quality });

    // Use the direct synchronous image generation function
    const generateImageFn = httpsCallable(functions, 'generateImage');

    // Determine commandCode for logging/legacy purposes, though the new flow
    // primarily relies on subtype.
    let commandCode;
    if (subtype === 'ugc_character') commandCode = 202;
    else if (subtype === 'background') commandCode = 201;
    else if (subtype === 'general') commandCode = 203;
    else if (subject_description) commandCode = 202; // Legacy fallback
    else if (scene_description) commandCode = 201;   // Legacy fallback
    else if (image_subject) commandCode = 203;     // Legacy fallback

    const requestData = {
      style,
      quality,
      connectedImages,
      commandCode, // Pass for potential routing/logging in the backend
      // --- New, clean parameters for the modern enhancement flow ---
      originalPrompt: prompt,
      subtype: subtype,
      selectedFrame: selectedFrame,
    };

    console.log('Sending request to `generateImage` with data:', requestData);
    const result = await generateImageFn(requestData);

    // The backend returns the direct result (synchronous)
    if (!result.data.success) {
        throw new Error(result.data.message || 'Backend failed to generate image.');
    }

    console.log('✅ Image generation completed. Result:', result.data);

    // Return the direct result with imageUrl
    return {
      success: true,
      imageUrl: result.data.data?.imageUrl || result.data.imageUrl,
      data: result.data.data || result.data,
      message: "Image generation completed."
    };

  } catch (error) {
    console.error('Error requesting image generation:', error);
    throw new Error(error.message || 'Failed to start image generation task.');
  }
};

// Video Generation Service (using Firebase Functions)
export const generateVideo = async ({ prompt, imageUrl, aspectRatio, duration, model }) => {
  try {
    console.log('Generating video with Firebase Functions:', { prompt, imageUrl, aspectRatio, duration, model });

    const result = await generateVideoFunction({
      prompt: prompt,
      imageUrl: imageUrl,
      aspectRatio: aspectRatio || '9:16',
      duration: parseInt(duration) || 5,
      model: model || 'zeroscope_v2_xl'
    });

    if (!result.data.success || !result.data.data.videoUrl) {
        throw new Error(result.data.message || 'Backend returned an error for video generation.');
    }
    
    return {
      success: true,
      videoUrl: result.data.data.videoUrl,
      data: result.data.data
    };

  } catch (error) {
    console.error('Video generation error:', error);
    const errorMessage = error.details?.message || error.message;
    return {
      success: false,
      error: errorMessage
    };
  }
};

// NEW: Slideshow Generation Service
export const generateSlideshow = async ({ topic, slideshowType, language, background }) => {
  try {
    console.log('🎬 AI Service: Generating slideshow with params:', { topic, slideshowType, language, background });
    
    const generateSlideshowFn = httpsCallable(functions, 'generateImageSlideshow');
    const result = await generateSlideshowFn({
      topic,
      _slideshow_type_context: slideshowType,
      language,
      background_name: background
    });

    console.log('🎬 AI Service: Backend response:', result);

    // Check if the result has the expected structure
    if (!result || !result.data) {
      throw new Error('Invalid response from backend');
    }

    // Return standardized response based on actual backend structure
    return {
      success: true,
      content: result.data.data, // Backend wraps data in .data.data
      slideTexts: result.data.data?.slideTexts || [],
      slideshowUrl: result.data.data?.selectedBackgroundUrl || null,
      processedImageUrls: result.data.data?.processedImageUrls || [],
      generationId: result.data.data?.generationId || null,
      message: result.data.message
    };

  } catch (error) {
    console.error('🎬 AI Service: Slideshow generation error:', error);
    
    // Return structured error instead of throwing
    return {
      success: false,
      error: error.message || 'Slideshow generation failed',
      message: error.message || 'Slideshow generation failed'
    };
  }
};

// Check Firebase Functions availability
export const checkApiKey = () => {
  // Since we're using Firebase Functions, we don't need to check API keys on frontend
  // The API keys are securely stored in Firebase Functions environment
  return true;
};

// Available generation types for dropdown
export const GENERATION_TYPES = {
  ugc_character: {
    label: 'UGC Character',
    commandCode: 202,
    description: 'Generate realistic person images for UGC content'
  },
  background: {
    label: 'Background Scene',
    commandCode: 201,
    description: 'Generate background scenes and environments'
  },
  general: {
    label: 'General Image',
    commandCode: 203,
    description: 'Generate any type of image'
  }
};

// Available styles
export const IMAGE_STYLES = [
  'photorealistic',
  'cartoon',
  'artistic',
  'cinematic',
  'vintage',
  'modern'
];

// Available quality options
export const QUALITY_OPTIONS = [
  { value: 'low', label: 'Low (30 credits)', credits: 30 },
  { value: 'medium', label: 'Medium (60 credits)', credits: 60 },
  { value: 'high', label: 'High (90 credits)', credits: 90 }
];

export { QUALITY_CREDITS }; 