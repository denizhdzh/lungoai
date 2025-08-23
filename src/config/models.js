// AI Models Configuration
// This file contains all model definitions with their parameters and requirements

export const models = {
  image: {
    "google/imagen-4": {
      name: "Google Imagen 4",
      type: "image",
      credits: 1,
      tier: 1,
      params: {
        prompt: { required: true, type: "string" },
        aspect_ratio: { required: false, type: "string", default: "1:1" },
      },
      options: {
        aspect_ratio: ["1:1", "3:4", "4:3", "9:16", "16:9"]
      }
    },
    
    "google/imagen-4-ultra": {
      name: "Google Imagen 4 Ultra",
      type: "image",
      credits: 2,
      tier: 2,
      params: {
        prompt: { required: true, type: "string" },
        aspect_ratio: { required: false, type: "string", default: "1:1" },
        safety_filter_level: { required: false, type: "string", default: "block_only_high" },
        output_format: { required: false, type: "string", default: "jpg" }
      },
      options: {
        aspect_ratio: ["1:1", "9:16", "16:9", "3:4", "4:3"],
        safety_filter_level: ["block_low_and_above", "block_medium_and_above", "block_only_high"],
        output_format: ["jpg", "png"]
      }
    },
   "imagen/imagen-4-fast": {
  name: "Imagen 4 Fast",
  type: "image",
  credits: 1,
  tier: 1,
  params: {
    prompt: { required: true, type: "string" },
    aspect_ratio: { required: false, type: "string", default: "1:1" },
    safety_filter_level: { required: false, type: "string", default: "block_only_high" },
    output_format: { required: false, type: "string", default: "jpg" }
  },
  options: {
    aspect_ratio: ["1:1", "3:4", "4:3", "9:16", "16:9"],
    safety_filter_level: ["block_low_and_above", "block_medium_and_above", "block_only_high"],
    output_format: ["jpg", "png"]
  }
},
    
    "ideogram-ai/ideogram-v3-balanced": {
      name: "Ideogram V3 Balanced",
      type: "image",
      credits: 2,
      tier: 2,
      params: {
        prompt: { required: true, type: "string" },
        aspect_ratio: { required: false, type: "string", default: "1:1" },
        resolution: { required: false, type: "string", default: "None" },
        magic_prompt_option: { required: false, type: "string", default: "Auto" },
        seed: { required: false, type: "integer" }
      },
      options: {
        aspect_ratio: [
          "1:3", "3:1", "1:2", "2:1", "9:16", "16:9", "10:16", "16:10", 
          "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "1:1"
        ],
        magic_prompt_option: ["Auto", "On", "Off"],
        style_type: ["None", "Auto", "General", "Realistic", "Design"]
      }
    },

    
"black-forest-labs/flux-kontext-max": {
  name: "Flux Kontext Max",
  type: "image",
  credits: 2,
  tier: 3,
  params: {
    prompt: { required: true, type: "string" },
    input_image: { required: false, type: "string", description: "Image to use as reference. Must be jpeg, png, gif, or webp." },
    aspect_ratio: { required: false, type: "string", default: "match_input_image" },
    prompt_upsampling: { required: false, type: "boolean", default: false },
    seed: { required: false, type: "integer" },
    output_format: { required: false, type: "string", default: "png" },
    safety_tolerance: { required: false, type: "integer", default: 2 }
  },
  options: {
    aspect_ratio: [
      "match_input_image", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2",
      "2:3", "4:5", "5:4", "21:9", "9:21", "2:1", "1:2"
    ],
    output_format: ["jpg", "png"]
  }
},

"black-forest-labs/flux-kontext-pro": {
  name: "Flux Kontext Pro",
  type: "image",
  credits: 1,
  tier: 2,
  params: {
    prompt: { required: true, type: "string" },
    input_image: { required: false, type: "string", description: "Image to use as reference. Must be jpeg, png, gif, or webp." },
    aspect_ratio: { required: false, type: "string", default: "match_input_image" },
    prompt_upsampling: { required: false, type: "boolean", default: false },
    seed: { required: false, type: "integer" },
    output_format: { required: false, type: "string", default: "png" },
    safety_tolerance: { required: false, type: "integer", default: 2 }
  },
  options: {
    aspect_ratio: [
      "match_input_image", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2",
      "2:3", "4:5", "5:4", "21:9", "9:21", "2:1", "1:2"
    ],
    output_format: ["jpg", "png"]
  }
}

  },
  
  video: {
    "google/veo-3-fast": {
      name: "Google Veo 3 Fast",
      type: "both", // Supports both text-to-video and image-to-video
      creditsPerSecond: 10,
      params: {
        prompt: { required: true, type: "string" },
        negative_prompt: { required: false, type: "string" },
        duration: { required: false, type: "number", default: 8 },
        aspect_ratio: { required: false, type: "string", default: "9:16" },
        image: { required: false, type: "string", description: "Input image for image-to-video generation" }
      },
      options: {
        duration: [8], // Fixed duration
        aspect_ratio: ["9:16", "16:9", "1:1"]
      }
    },
    
    "google/veo-3": {
      name: "Google Veo 3",
      type: "both", // Supports both text-to-video and image-to-video
      creditsPerSecond: 20,
      params: {
        prompt: { required: true, type: "string" },
        negative_prompt: { required: false, type: "string" },
        duration: { required: false, type: "number", default: 8 },
        aspect_ratio: { required: false, type: "string", default: "9:16" },
        image: { required: false, type: "string", description: "Input image for image-to-video generation" }
      },
      options: {
        duration: [8], // Fixed duration
        aspect_ratio: ["9:16", "16:9", "1:1"]
      }
    },

    "bytedance/seedance-1-pro": {
      name: "ByteDance Seedance Pro",
      type: "both", // Supports both text-to-video and image-to-video
      creditsPerSecond: { "480p": 1, "1080p": 4 },
      params: {
        fps: { required: false, type: "number", default: 24 },
        prompt: { required: true, type: "string" },
        duration: { required: false, type: "number", default: 5 },
        resolution: { required: false, type: "string", default: "480p" },
        aspect_ratio: { required: false, type: "string", default: "16:9" },
        camera_fixed: { required: false, type: "boolean", default: false },
        image: { required: false, type: "string", description: "Input image for image-to-video generation" }
      },
      options: {
        duration: [5,10], // only 5 and 10 seconds
        resolution: ["480p", "1080p"],
        aspect_ratio: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "9:21"],
        camera_fixed: [true, false]
      }
    },

    "kwaivgi/kling-v2.1": {
      name: "KwaiVGI Kling v2.1",
      type: "image_to_video", // Primarily image-to-video
      creditsPerSecond: { "standard": 2, "pro": 3 },
      params: {
        prompt: { required: true, type: "string" },
        negative_prompt: { required: false, type: "string" },
        start_image: { required: true, type: "string", description: "Starting image for video generation" },
        mode: { required: false, type: "string", default: "standard" },
        duration: { required: false, type: "number", default: 5 }
      },
      options: {
        mode: ["standard", "pro"],
        duration: [5, 10] // only 5 and 10 seconds
      }
    },

    "minimax/hailuo-02": {
      name: "MiniMax Hailuo 02",
      type: "both", // Supports both text-to-video and image-to-video
      creditsPerSecond: { "768p": 1, "1080p": 2 },
      params: {
        prompt: { required: true, type: "string" },
        first_frame_image: { required: false, type: "string", description: "First frame image for video generation" },
        duration: { required: false, type: "number", default: 6 },
        resolution: { required: false, type: "string", default: "768p" },
        prompt_optimizer: { required: false, type: "boolean", default: true }
      },
      options: {
        duration: [6, 10], // 10 seconds only available for 768p resolution
        resolution: ["768p", "1080p"],
        prompt_optimizer: [true, false]
      },
      constraints: {
        // 10 second duration is only available for 768p resolution
        duration_resolution: {
          10: ["768p"], // 10 seconds only works with 768p
          6: ["768p", "1080p"] // 6 seconds works with both resolutions
        }
      }
    },

    "leonardoai/motion-2.0": {
      name: "Leonardo Motion 2.0",
      type: "both", // Supports both text-to-video and image-to-video
      credits: 3, // $0.30 = ~3 credits
      params: {
        prompt: { required: true, type: "string" },
        image: { required: false, type: "string", description: "Image to use for the first frame of the video" },
        aspect_ratio: { required: false, type: "string", default: "16:9" },
        frame_interpolation: { required: false, type: "boolean", default: true },
        prompt_enhance: { required: false, type: "boolean", default: true },
        negative_prompt: { required: false, type: "string" },
        vibe_style: { required: false, type: "string", default: "None" },
        lighting_style: { required: false, type: "string", default: "None" },
        shot_type_style: { required: false, type: "string", default: "None" },
        color_theme_style: { required: false, type: "string", default: "None" }
      },
      options: {
        aspect_ratio: ["9:16", "16:9", "2:3", "4:5"],
        vibe_style: ["None", "clay", "color_sketch", "logo", "papercraft", "pro_photo", "sci_fi", "sketch", "stock_footage", "streetshot"],
        lighting_style: ["None", "backlight", "candle_lit", "chiaroscuro", "film_haze", "foggy", "golden_hour", "hardlight", "lens_flare", "light_art", "low_key", "luminous", "mystical", "rainy", "soft_light", "volumetric"],
        shot_type_style: ["None", "bokeh", "cinematic", "close_up", "overhead", "spiritual", "spooky"],
        color_theme_style: ["None", "autumn", "complimentary", "cool", "dark", "earthy", "electric", "iridescent", "pastel", "split", "terracotta_teal", "ultraviolet", "vibrant", "warm"],
        frame_interpolation: [true, false],
        prompt_enhance: [true, false]
      }
    },

    "runwayml/gen4-turbo": {
      name: "Runway Gen4 Turbo", 
      type: "image_to_video", // Requires image input
      creditsPerSecond: 15, // Expensive model
      params: {
        prompt: { required: true, type: "string" },
        image: { required: true, type: "string", description: "Initial image for video generation (first frame)" },
        aspect_ratio: { required: false, type: "string", default: "16:9" },
        duration: { required: false, type: "integer", default: 5 },
        seed: { required: false, type: "integer" }
      },
      options: {
        aspect_ratio: ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"],
        duration: [5, 10]
      }
    }
  },

  faceswap: {
    "fofr/face-swap-with-ideogram": {
      name: "Face Swap with Ideogram",
      type: "faceswap",
      credits: 3,
      tier: 2,
      params: {
        character_image: { required: true, type: "string", description: "Reference image of the character whose face to swap" },
        target_image: { required: true, type: "string", description: "Target image where the character's face will be placed" },
        prompt: { required: false, type: "string", description: "Optional custom prompt for the face swap. If not provided, Claude will analyze the target image to generate one" }
      },
      options: {}
    }
  }
};

// Helper functions
export const getModelById = (modelId) => {
  for (const category in models) {
    if (models[category][modelId]) {
      return { ...models[category][modelId], id: modelId, category };
    }
  }
  return null;
};

export const getModelsByCategory = (category) => {
  return models[category] || {};
};

export const requiresImage = (modelId) => {
  const model = getModelById(modelId);
  if (!model) return false;
  
  // Check if any image parameter is required
  for (const paramName in model.params) {
    const param = model.params[paramName];
    if (param.required && (paramName.includes('image') || paramName === 'start_image' || paramName === 'first_frame_image')) {
      return true;
    }
  }
  return false;
};

export const supportsImageInput = (modelId) => {
  const model = getModelById(modelId);
  if (!model) return false;
  
  // Check if model has any image input parameters (required or optional)
  for (const paramName in model.params) {
    if (paramName.includes('image') || paramName === 'start_image' || paramName === 'first_frame_image') {
      return true;
    }
  }
  return false;
};

export const getModelType = (modelId) => {
  const model = getModelById(modelId);
  return model?.type || null;
};

// Tier hierarchy: 1 = Basic, 2 = Creator, 3 = Pro
export const getUserTier = (subscriptionData) => {
  if (!subscriptionData || !subscriptionData.subscriptionStatus || subscriptionData.subscriptionStatus !== 'active') {
    return 0; // No subscription
  }
  
  const planPriceId = subscriptionData.stripePriceId;
  
  // Starter plans
  if (planPriceId === "price_1RMqEZDf8kAOBAT3ltD6n2lX" || planPriceId === "price_1RMqGbDf8kAOBAT3vgwkWLr6") {
    return 1;
  }
  
  // Creator plans
  if (planPriceId === "price_1RRJ8tDf8kAOBAT3qBwC6qpM" || planPriceId === "price_1RRJ9SDf8kAOBAT3bA8Xbriq") {
    return 2;
  }
  
  // Pro plans
  if (planPriceId === "price_1RMqHgDf8kAOBAT3m6kthIND" || planPriceId === "price_1RMqI1Df8kAOBAT3Xoy3M7Ho") {
    return 3;
  }
  
  return 0; // Unknown plan
};

export const canAccessModel = () => {
  // Everyone can access all models now
  return true;
};