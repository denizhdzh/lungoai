// AI Models Configuration
// This file contains all model definitions with their parameters and requirements

export const models = {
  image: {
    "google/imagen-4": {
      name: "Google Imagen 4",
      type: "image",
      credits: 1,
      params: {
        prompt: { required: true, type: "string" },
        aspect_ratio: { required: false, type: "string", default: "1:1" },
        image: { required: false, type: "string", description: "Input image for img2img" }
      },
      options: {
        aspect_ratio: ["1:1", "3:4", "4:3", "9:16", "16:9"]
      }
    },
   "imagen/imagen-4-fast": {
  name: "Imagen 4 Fast",
  type: "image",
  credits: 1,
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
    "black-forest-labs/flux-1.1-pro": {
      name: "Flux 1.1 Pro",
      type: "image", 
      credits: 1,
      params: {
        prompt: { required: true, type: "string" },
        aspect_ratio: { required: false, type: "string", default: "1:1" },
        image: { required: false, type: "string", description: "Input image for img2img" }
      },
      options: {
        aspect_ratio: ["1:1", "3:4", "4:3", "9:16", "16:9"]
      }
    },
"black-forest-labs/flux-kontext-max": {
  name: "Flux Kontext Max",
  type: "image",
  credits: 2,
  params: {
    prompt: { required: true, type: "string" },
    input_image: { required: false, type: "string", description: "Image to use as reference. Must be jpeg, png, gif, or webp." },
    aspect_ratio: { required: false, type: "string", default: "1:1" },
    prompt_upsampling: { required: false, type: "boolean", default: false },
    seed: { required: false, type: "integer" },
    output_format: { required: false, type: "string", default: "png" },
    safety_tolerance: { required: false, type: "integer", default: 2 }
  },
  options: {
    aspect_ratio: [
      "1:1", "16:9", "9:16", "4:3", "3:4", "3:2",
      "2:3", "4:5", "5:4", "21:9", "9:21", "2:1", "1:2"
    ],
    output_format: ["jpg", "png"]
  }
}

  },
  
  video: {
    "google/veo-3-fast": {
      name: "Google Veo 3 Fast",
      type: "text_to_video", // Primary mode is text-to-video
      creditsPerSecond: 10,
      params: {
        prompt: { required: true, type: "string" },
        negative_prompt: { required: false, type: "string" },
        duration: { required: false, type: "number", default: 8 },
        aspect_ratio: { required: false, type: "string", default: "9:16" },
      },
      options: {
        duration: [8], // Fixed duration
        aspect_ratio: ["9:16", "16:9", "1:1"]
      }
    },
    
    "google/veo-3": {
      name: "Google Veo 3",
      type: "text_to_video", // Primary mode is text-to-video
      creditsPerSecond: 20,
      params: {
        prompt: { required: true, type: "string" },
        negative_prompt: { required: false, type: "string" },
        duration: { required: false, type: "number", default: 8 },
        aspect_ratio: { required: false, type: "string", default: "9:16" },
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
        duration: [6, 10],
        prompt_optimizer: [true, false]
      }
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