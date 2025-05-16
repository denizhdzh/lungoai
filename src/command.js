// Command definitions with codes, descriptions, and parameters
export const commandDefinitions = [
  // --- PLANNING COMMANDS (001-099) ---
  {
    "code": 1,
    "name": "GENERATE_MONTHLY_PLAN",
    "description": "Generates a 30-day content plan suggestion based on an optional focus topic.",
    "parameters": [
        {
            "name": "focus_topic",
            "type": "string",
            "description": "Optional. A central theme or product to focus the plan around.",
            "required": false
        }
        // start_date and end_date are implicit (now and +30 days)
    ]
  },
  {
    "code": 2,
    "name": "GENERATE_WEEKLY_PLAN",
    "description": "Generates a 7-day content plan suggestion based on an optional focus topic.",
    "parameters": [
        {
            "name": "focus_topic",
            "type": "string",
            "description": "Optional. A central theme or product to focus the plan around.",
            "required": false
        }
        // start_date and end_date are implicit (now and +7 days)
    ]
  },
  
  // --- VIDEO GENERATION COMMANDS (100-199) ---
  {
    "code": 101,
    "name": "GENERATE_UGC_TIKTOK_VIDEO",
    "description": "Creates a short UGC style video suitable for TikTok, usually featuring a character speaking or interacting.",
    "parameters": [
      {
        "name": "subject_description",
        "type": "string",
        "description": "Physical description of the main character (e.g., 'blonde woman', 'man with beard', 'smiling girl'). Can contain @creator_name reference.",
        "required": false
      },
      {
        "name": "action_description",
        "type": "string",
        "description": "What the character should be doing (e.g., 'holding the product', 'talking to the camera', 'looking surprised'). Default: 'talking to camera'. Used for video prompt.",
        "required": false
      },
      {
          "name": "setting_description",
          "type": "string",
          "description": "The background or environment (e.g., 'in a bright kitchen', 'against a plain background', 'outdoors'). Default: 'neutral studio background'.",
          "required": false
      },
      {
        "name": "hook_text",
        "type": "string",
        "description": "A short, engaging text hook or caption for the video. If omitted, one will be generated.",
        "required": false
      },
      {
          "name": "character_reaction",
          "type": "string",
          "description": "The facial expression or emotion of the character (e.g., 'happy', 'surprised', 'neutral', 'thoughtful'). Default: 'neutral'.",
          "required": false
      },
      {
          "name": "language",
          "type": "string",
          "description": "Optional. The language for the generated hook text (e.g., 'en', 'es'). Default: 'en'.",
          "required": false
      }
    ]
  },
  
  // --- IMAGE GENERATION COMMANDS (200-299) ---
  {
    "code": 201,
    "name": "GENERATE_BACKGROUND_IMAGE",
    "description": "Generates a background image based on a description.",
    "parameters": [
      {
        "name": "scene_description",
        "type": "string",
        "description": "Description of the background scene (e.g., 'serene beach at sunset', 'modern minimalist office', 'abstract colorful pattern').",
        "required": true
      },
      {
        "name": "image_style",
        "type": "string",
        "description": "Artistic or stylistic direction (e.g., 'photorealistic', 'watercolor', 'cartoonish', 'cinematic lighting'). Default: 'photorealistic'.",
        "required": false
      }
    ]
  },
  {
    "code": 202,
    "name": "GENERATE_UGC_IMAGE",
    "description": "Generates a highly detailed and realistic image of a person, typically in a modern UGC or influencer style.",
    "parameters": [
       {
        "name": "subject_description",
        "type": "string",
        "description": "Detailed physical description of the character. Specify ethnicity, hair style/color, eye color, general body type (e.g., slim, athletic), and desired facial features (e.g., small face, specific nose shape). Include realistic details like freckles, moles, slight skin imperfections, vellus hair if desired for higher realism. Use existing creator name if specified.",
        "required": true
      },
       {
        "name": "clothing_description",
        "type": "string",
        "description": "Describe the clothing. For women, specify modern styles like 'off-the-shoulder crop top', 'scoop neck', 'asymmetric top', 'v-neck', 'sports bra' paired with 'plain skirt', 'pants', or 'gym tights'. For men, suggest 'modern shirt' or similar contemporary attire. Keep clothing relatively basic, prints are okay. Mention preference for body jewelry over clothing-dependent jewelry.",
        "required": false
      },
      {
        "name": "setting_description",
        "type": "string",
        "description": "Background/environment for the character (e.g., 'in a cafe', 'plain white background', 'urban street'). Default: 'neutral studio background'.",
        "required": false
      },
      {
        "name": "image_style",
        "type": "string",
        "description": "Overall image style and quality. Aim for 'high quality realistic photo', 'UGC style photo', 'influencer portrait'. Specify lighting like 'soft natural light' or 'studio lighting'. Default: 'high quality realistic photo'.",
        "required": false
      }
    ]
  },
  {
    "code": 203,
    "name": "GENERATE_RANDOM_IMAGE",
    "description": "Generates a general image based on the provided subject and style.",
    "parameters": [
      {
        "name": "image_subject",
        "type": "string",
        "description": "The main subject or concept for the image (e.g., 'a cat wearing a hat', 'futuristic cityscape', 'a detailed product shot').",
        "required": true
      },
      {
        "name": "image_style",
        "type": "string",
        "description": "Artistic or stylistic direction (e.g., 'photorealistic', 'oil painting', 'vector art', 'macro shot'). Default: 'photorealistic'.",
        "required": false
      }
    ]
  },
  
  // --- SLIDESHOW GENERATION COMMANDS (300-399) ---
  {
    "code": 301,
    "name": "GENERATE_IMAGE_TIKTOK_SLIDESHOW",
    "description": "Generates a sequence of images for a TikTok-style slideshow video.",
     "parameters": [
       {
        "name": "topic",
        "type": "string",
        "description": "The central theme or subject for the slideshow.",
        "required": true
      },
      {
        "name": "num_images",
        "type": "integer",
        "description": "Number of images to generate. Default: 7.",
        "required": false
      },
      {
        "name": "image_style",
        "type": "string",
        "description": "Consistent artistic style for all images, often more casual or trendy for TikTok.",
        "required": false
      }
    ]
  },
  
  // --- EDITING COMMANDS (400-499) ---
  {
    "code": 401,
    "name": "EDIT_IMAGE",
    "description": "Applies edits to a previously generated image.",
    "parameters": [
      {
        "name": "image_id",
        "type": "string",
        "description": "The ID of the image to be edited (from the gallery).",
        "required": true
      },
      {
        "name": "edit_instructions",
        "type": "string",
        "description": "Detailed instructions on how to modify the image (e.g., 'change background color to blue', 'add sunglasses to the person', 'make it look more cartoonish').",
        "required": true
      }
    ]
  },
  
  // --- DATA MANAGEMENT COMMANDS (500-599) ---
  {
    "code": 501,
    "name": "ADD_PRODUCT",
    "description": "Adds a new product to the user's settings.",
    "parameters": [
      {
        "name": "product_name",
        "type": "string",
        "description": "The name of the product.",
        "required": true
      },
      {
        "name": "product_description",
        "type": "string",
        "description": "A description of the product.",
        "required": true
      },
      {
        "name": "product_image_url",
        "type": "string",
        "description": "Optional URL for the product image.",
        "required": false
      }
    ]
  },
  {
    "code": 502,
    "name": "DELETE_PRODUCT",
    "description": "Deletes a product from the user's settings.",
    "parameters": [
      {
        "name": "product_identifier",
        "type": "string",
        "description": "The name or ID of the product to delete.",
        "required": true
      }
    ]
  },
  {
    "code": 503,
    "name": "ADD_CREATOR",
    "description": "Adds a new UGC creator profile to the user's settings.",
    "parameters": [
      {
        "name": "creator_name",
        "type": "string",
        "description": "The name of the UGC creator.",
        "required": true
      },
      {
        "name": "creator_image_url",
        "type": "string",
        "description": "Optional URL for the creator's image.",
        "required": false
      }
    ]
  },
  {
    "code": 504,
    "name": "DELETE_CREATOR",
    "description": "Deletes a UGC creator profile from the user's settings.",
    "parameters": [
      {
        "name": "creator_identifier",
        "type": "string",
        "description": "The name or ID of the creator to delete.",
        "required": true
      }
    ]
  },
   {
    "code": 505,
    "name": "ADD_BACKGROUND",
    "description": "Adds a new background image to the user's settings using a previously generated image ID.",
    "parameters": [
      {
        "name": "image_id",
        "type": "string",
        "description": "The ID of the previously generated image to add as a background.",
        "required": true
      }
    ]
  },
  {
    "code": 506,
    "name": "DELETE_BACKGROUND",
    "description": "Deletes a background image from the user's settings.",
    "parameters": [
      {
        "name": "background_identifier",
        "type": "string",
        "description": "The ID of the background image to delete.",
        "required": true
      }
    ]
  },
  
  // --- UI CONTROL COMMANDS (600-699) ---
   {
    "code": 601,
    "name": "NAVIGATE_VIEW",
    "description": "Changes the main view of the application.",
    "parameters": [
      {
        "name": "target_view",
        "type": "string",
        "description": "The view to navigate to. Must be one of: 'generator', 'calendar', 'settings'.",
        "required": true
      }
    ]
  },
   {
    "code": 602,
    "name": "NAVIGATE_SETTINGS_TAB",
    "description": "Navigates to a specific tab within the Settings page.",
    "parameters": [
      {
        "name": "tab_name",
        "type": "string",
        "description": "The settings tab to navigate to. Must be one of: 'Product', 'Creators', 'Backgrounds', 'Features', 'General'.",
        "required": true
      }
    ]
  },
  {
    "code": 603,
    "name": "TOGGLE_THEME",
    "description": "Switches the application theme between light and dark mode.",
    "parameters": [
        {
          "name": "target_mode",
          "type": "string",
          "description": "Optional. Specify 'light' or 'dark'. If omitted, it toggles the current mode.",
          "required": false
        }
    ] 
  },
  
  // --- AUTHENTICATION COMMANDS (700-799) ---
  {
    "code": 701,
    "name": "LOG_OUT",
    "description": "Logs the user out of the application.",
    "parameters": [] // No parameters needed for logout
  }
];

// Export individual command codes for convenience
export const GENERATE_MONTHLY_PLAN_COMMAND = 1;
export const GENERATE_WEEKLY_PLAN_COMMAND = 2;

export const GENERATE_UGC_TIKTOK_VIDEO_COMMAND = 101;

export const GENERATE_BACKGROUND_IMAGE_COMMAND = 201;
export const GENERATE_UGC_IMAGE_COMMAND = 202;
export const GENERATE_RANDOM_IMAGE_COMMAND = 203;

export const GENERATE_IMAGE_TIKTOK_SLIDESHOW_COMMAND = 301;

export const EDIT_IMAGE_COMMAND = 401;

export const ADD_PRODUCT_COMMAND = 501;
export const DELETE_PRODUCT_COMMAND = 502;
export const ADD_CREATOR_COMMAND = 503;
export const DELETE_CREATOR_COMMAND = 504;
export const ADD_BACKGROUND_COMMAND = 505;
export const DELETE_BACKGROUND_COMMAND = 506;

export const NAVIGATE_VIEW_COMMAND = 601;
export const NAVIGATE_SETTINGS_TAB_COMMAND = 602;
export const TOGGLE_THEME_COMMAND = 603;


export const LOG_OUT_COMMAND = 701;

// You might not need the old COMMANDS object anymore
// export const COMMANDS = { ... };