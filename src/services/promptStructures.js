// AI-Powered Prompt Structuring Templates
// This file contains structure templates for different content types

// Video Generation Structure Template
export const VIDEO_STRUCTURE_TEMPLATE = {
  "description": "", // AI will fill based on user input
  "style": "", // cinematic, documentary, commercial, etc.
  "camera": "", // fixed wide angle, handheld, tracking, etc.
  "lighting": "", // natural warm, studio, dramatic, etc.
  "setting": "", // location/environment description
  "elements": [], // key visual elements to include
  "motion": "", // movement and action description
  "timeline": {
    // AI will break down based on duration
    // "0-1s": "opening action",
    // "1-3s": "main action",
    // "3-5s": "conclusion"
  },
  "ending": "", // how the video concludes
  "mood": "", // overall emotional tone
  "text": "none", // text overlays if any
  "keywords": [] // technical keywords (16:9, brand names, etc.)
};

// Image Generation Structure Template
export const IMAGE_STRUCTURE_TEMPLATE = {
  "image_type": "", // portrait, product, lifestyle, etc.
  "composition_and_perspective": {
    "camera_type": "",
    "focal_length_mm": "",
    "aperture_range": "",
    "focus_mode": "",
    "framing": "",
    "orientation": "",
    "camera_position": ""
  },
  "location_and_background": {
    "setting": "",
    "background_elements": "",
    "background_blur": "",
    "depth_of_field": ""
  },
  "lighting": {
    "lighting_type": "",
    "white_balance": "",
    "exposure_compensation": "",
    "ISO_setting": "",
    "shutter_speed": ""
  },
  "subject_details": {
    "poses": "",
    "facial_expression": "",
    "gaze_direction": "",
    "styling": ""
  },
  "visual_treatment": {
    "filter_style": "",
    "color_toning": "",
    "contrast": "",
    "sharpness": "",
    "mood": ""
  },
  "technical_specs": {
    "aspect_ratio": "",
    "resolution": "",
    "quality_level": ""
  },
  "enhancement_keywords": [], // technical enhancement terms
  "negatives": [] // things to avoid
};

// Content Analysis Categories
export const CONTENT_CATEGORIES = {
  VIDEO: {
    COMMERCIAL: "commercial",
    LIFESTYLE: "lifestyle", 
    PRODUCT_DEMO: "product_demo",
    SOCIAL_MEDIA: "social_media",
    CINEMATIC: "cinematic",
    EDUCATIONAL: "educational"
  },
  IMAGE: {
    PORTRAIT: "portrait",
    PRODUCT: "product",
    LIFESTYLE: "lifestyle",
    ARCHITECTURAL: "architectural",
    FOOD: "food",
    FASHION: "fashion"
  }
};

// AI Analysis Prompts for different content types
export const AI_ANALYSIS_PROMPTS = {
  VIDEO: {
    ANALYSIS: `Analyze this video request and identify:
1. Content category (commercial, lifestyle, product, etc.)
2. Missing elements (lighting, camera work, timing, brand elements)
3. Technical requirements (aspect ratio, duration, style)
4. Key visual elements needed
5. Timeline breakdown for the specified duration

User request: {USER_INPUT}
Duration: {DURATION} seconds

Return analysis focusing on what needs to be enhanced or added.`,

    ENHANCEMENT: `Transform this basic video request into a detailed, professional prompt structure.

User request: {USER_INPUT}
Duration: {DURATION} seconds
Category: {CATEGORY}
Missing elements: {MISSING_ELEMENTS}

Create a JSON structure following the VIDEO_STRUCTURE_TEMPLATE format, filling in all missing details professionally. Include timeline breakdown by seconds.`
  },

  IMAGE: {
    ANALYSIS: `Analyze this image request and identify:
1. Image category (portrait, product, lifestyle, etc.)
2. Missing technical details (camera, lighting, composition)
3. Style and mood requirements
4. Subject and background needs
5. Visual treatment preferences

User request: {USER_INPUT}

Return analysis focusing on technical and creative gaps that need to be filled.`,

    ENHANCEMENT: `Transform this basic image request into a detailed, professional prompt structure.

User request: {USER_INPUT}
Category: {CATEGORY}
Missing elements: {MISSING_ELEMENTS}

Create a JSON structure following the IMAGE_STRUCTURE_TEMPLATE format, filling in all technical camera settings, lighting, composition, and styling details professionally.`
  }
};

// Default enhancement rules by category
export const ENHANCEMENT_RULES = {
  VIDEO: {
    COMMERCIAL: {
      defaultStyle: "cinematic",
      defaultLighting: "professional studio lighting with key and fill",
      defaultCamera: "locked off tripod with smooth movements",
      requiredElements: ["brand integration", "call to action", "professional audio"]
    },
    LIFESTYLE: {
      defaultStyle: "natural documentary",
      defaultLighting: "natural lighting with soft fill",
      defaultCamera: "handheld for authenticity",
      requiredElements: ["real environments", "natural interactions", "lifestyle context"]
    }
  },
  IMAGE: {
    PORTRAIT: {
      defaultLighting: "soft key light with subtle fill",
      defaultCamera: "85mm equivalent, f/2.8-f/4",
      defaultComposition: "rule of thirds, eye-level",
      requiredElements: ["proper exposure on face", "controlled background", "natural expression"]
    },
    PRODUCT: {
      defaultLighting: "controlled studio lighting, minimal shadows",
      defaultCamera: "macro or standard lens, f/8-f/11 for sharpness",
      defaultComposition: "centered, clean background",
      requiredElements: ["product hero shot", "clean background", "sharp focus", "proper white balance"]
    }
  }
};

// Export all structures for use in AI service
export const PROMPT_STRUCTURES = {
  VIDEO_STRUCTURE_TEMPLATE,
  IMAGE_STRUCTURE_TEMPLATE,
  CONTENT_CATEGORIES,
  AI_ANALYSIS_PROMPTS,
  ENHANCEMENT_RULES
};