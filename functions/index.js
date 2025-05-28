const functions = require('firebase-functions'); // <-- ADD THIS LINE
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onRequest } = require("firebase-functions/v2/https"); // Keep for the new task handler
const { onSchedule } = require("firebase-functions/v2/scheduler"); // <-- Import onSchedule
const { onObjectFinalized } = require("firebase-functions/v2/storage"); // <<< ADDED THIS LINE
const { logger } = require("firebase-functions");
const { OpenAI, toFile } = require("openai");
const admin = require("firebase-admin");
const { getStorage } = require('firebase-admin/storage');
const axios = require('axios');
const { CloudTasksClient } = require('@google-cloud/tasks'); // <-- ADD Cloud Tasks Client
const fs = require('fs').promises; // For async file operations
const path = require('path'); // For path manipulation
const os = require('os'); // Added for tmpdir access in renderAndReplaceGenerationImage
const ffmpeg = require('fluent-ffmpeg'); // MOVED TO GLOBAL SCOPE
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path; // MOVED TO GLOBAL SCOPE
ffmpeg.setFfmpegPath(ffmpegPath); // MOVED TO GLOBAL SCOPE
// const stripe = require('stripe')(process.env.STRIPE_SECRET); // <-- REMOVE Global Stripe import and initialize

// Initialize Firebase Admin SDK (once)
admin.initializeApp();
const db = admin.firestore(); // Firestore instance
const bucket = getStorage().bucket(); // Default Firebase Storage bucket
const tasksClient = new CloudTasksClient(); // <-- Initialize Tasks Client

// --- NEW: Plan Credit Allocations (Backend) ---
const planCreditAllocations = {
  // Basic Plan
  "price_1RMqEZDf8kAOBAT3ltD6n2lX": { general_credits: 2500 }, // Monthly Basic
  "price_1RMqGbDf8kAOBAT3vgwkWLr6": { general_credits: 2500 }, // Yearly Basic
  // Pro Plan
  "price_1RRJ8tDf8kAOBAT3qBwC6qpM": { general_credits: 1200 }, // Monthly Pro
  "price_1RRJ9SDf8kAOBAT3bA8Xbriq": { general_credits: 1200 }, // Yearly Pro
  // Business Plan
  "price_1RMqHgDf8kAOBAT3m6kthIND": { general_credits: 30000 }, // Monthly Business
  "price_1RMqI1Df8kAOBAT3Xoy3M7Ho": { general_credits: 30000 }  // Yearly Business
};
// --- End Plan Credit Allocations ---

// --- Cloud Tasks Configuration ---
// TODO: Replace with your actual project ID, location, and queue name if different
const tasksProjectId = process.env.GCLOUD_PROJECT || 'ugcai-f429e'; // Use environment variable or verify hardcoded ID
const tasksLocation = 'us-central1'; // Match your function region
const runwayTasksQueueName = 'runway-polling-queue'; // The queue you created in Cloud Console for Runway polling
const runwayTaskHandlerUrl = `https://${tasksLocation}-${tasksProjectId}.cloudfunctions.net/handleVideoPollingTask`; // URL of the Runway polling function
const MAX_POLLING_DURATION_SECONDS = 10 * 60; // 10 minutes
const POLLING_INTERVAL_SECONDS = 60; // 1 minute

// --- NEW: Missing constants for polling ---
const RUNWAY_POLLING_TIMEOUT_MS = MAX_POLLING_DURATION_SECONDS * 1000; // Convert to milliseconds
const MAX_POLLING_ATTEMPTS = 5; // Max polling attempts for a task
const MAX_POLLING_BACKOFF_SECONDS = 300; // 5 minutes max backoff
// --- END NEW ---

// --- NEW: Cloud Tasks Configuration for Image Generation ---
const imageGenTasksQueueName = 'image-generation-queue'; // New queue for image generation tasks
const imageGenTaskHandlerUrl = `https://${tasksLocation}-${tasksProjectId}.cloudfunctions.net/performImageGenerationTask`; // URL for the new image generation handler
const IMAGE_GEN_TIMEOUT_SECONDS = 540; // 8 minutes for image generation, adjust as needed

// --- NEW: Cloud Tasks Configuration for Video Concatenation ---
const concatTasksQueueName = 'video-concatenation-queue'; // New queue for concatenation tasks
const concatTaskHandlerUrl = `https://${tasksLocation}-${tasksProjectId}.cloudfunctions.net/performVideoConcatenation`; // URL for the new concatenation handler
const VIDEO_CONCAT_TIMEOUT_SECONDS = 15 * 60; // 15 minutes for concatenation, adjust as needed

// --- NEW: Cloud Tasks Configuration for Video Pipeline Initiation ---
const videoPipelineTasksQueueName = 'video-pipeline-queue'; // New queue for starting video pipeline
const videoPipelineTaskHandlerUrl = `https://${tasksLocation}-${tasksProjectId}.cloudfunctions.net/startVideoPipeline`;
const VIDEO_PIPELINE_TIMEOUT_SECONDS = 540; // Timeout for the pipeline initiation function

// --- NEW: Cloud Tasks Configuration for Direct Image Generation ---
const directImageGenTasksQueueName = 'direct-image-gen-queue';
const directImageGenTaskHandlerUrl = `https://${tasksLocation}-${tasksProjectId}.cloudfunctions.net/performDirectImageGenerationTask`;
const DIRECT_IMAGE_GEN_TIMEOUT_SECONDS = IMAGE_GEN_TIMEOUT_SECONDS; // Reuse existing timeout

// --- NEW: Cloud Tasks Configuration for Slideshow Generation ---
const slideshowTasksQueueName = 'slideshow-generation-queue';
const slideshowTaskHandlerUrl = `https://${tasksLocation}-${tasksProjectId}.cloudfunctions.net/performSlideshowGenerationTask`;
const SLIDESHOW_GEN_TIMEOUT_SECONDS = 540; // Timeout for slideshow generation, adjust as needed

// command.js içeriğini buraya alalım (veya ortak bir modülden import edelim)
// !! ÖNEMLİ: Bu komut listesini src/command.js ile senkronize tutmalısın!
const commandDefinitions = [
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
      // Note: baseImageUrl is not a direct user parameter, added internally if creator is mentioned
    ]
  },
  // --- IMAGE GENERATION COMMANDS (200-299) ---
  {
    "code": 201,
    "name": "GENERATE_BACKGROUND_IMAGE",
    "description": "Generates a background image based on a description.",
    "parameters": [
      { "name": "scene_description", "type": "string", "description": "Description of the background scene (e.g., 'serene beach at sunset', 'modern minimalist office', 'abstract colorful pattern').", "required": true },
      { "name": "image_style", "type": "string", "description": "Artistic or stylistic direction (e.g., 'photorealistic', 'watercolor', 'cartoonish', 'cinematic lighting'). Default: 'photorealistic'.", "required": false }
    ]
  },
  {
    "code": 202,
    "name": "GENERATE_UGC_IMAGE",
    "description": "Generates a highly detailed and realistic image of a person, typically in a modern UGC or influencer style.",
    "parameters": [
       { "name": "subject_description", "type": "string", "description": "Detailed physical description of the character. Specify ethnicity, hair style/color, eye color, general body type (e.g., slim, athletic), and desired facial features (e.g., small face, specific nose shape). Include realistic details like freckles, moles, slight skin imperfections, vellus hair if desired for higher realism. Use existing creator name if specified.", "required": true },
       { "name": "clothing_description", "type": "string", "description": "Describe the clothing. For women, specify modern styles like 'off-the-shoulder crop top', 'scoop neck', 'asymmetric top', 'v-neck', 'sports bra' paired with 'plain skirt', 'pants', or 'gym tights'. For men, suggest 'modern shirt' or similar contemporary attire. Keep clothing relatively basic, prints are okay. Mention preference for body jewelry over clothing-dependent jewelry.", "required": false },
       { "name": "setting_description", "type": "string", "description": "Background/environment for the character (e.g., 'in a cafe', 'plain white background', 'urban street'). Default: 'neutral studio background'.", "required": false },
       { "name": "image_style", "type": "string", "description": "Overall image style and quality. Aim for 'high quality realistic photo', 'UGC style photo', 'influencer portrait'. Specify lighting like 'soft natural light' or 'studio lighting'. Default: 'high quality realistic photo'.", "required": false },
       { "name": "age", "type": "integer", "description": "Optional. Specify the approximate age of the character. Must be 18 or older.", "required": false },
       { "name": "gender", "type": "string", "description": "Optional. Specify the gender of the character (e.g., 'woman', 'man').", "required": false }
    ]
  },
  {
    "code": 203,
    "name": "GENERATE_RANDOM_IMAGE",
    "description": "Generates a general image based on the provided subject and style.",
    "parameters": [
      { "name": "image_subject", "type": "string", "description": "The main subject or concept for the image (e.g., 'a cat wearing a hat', 'futuristic cityscape', 'a detailed product shot').", "required": true },
      { "name": "image_style", "type": "string", "description": "Artistic or stylistic direction (e.g., 'photorealistic', 'oil painting', 'vector art', 'macro shot'). Default: 'photorealistic'.", "required": false }
    ]
  },
  // --- SLIDESHOW GENERATION COMMANDS (300-399) ---
  {
    "code": 301,
    "name": "GENERATE_IMAGE_TIKTOK_SLIDESHOW",
    "description": "Generates a 4-slide TikTok-style slideshow using a product, background, and specified type.",
     "parameters": [
      { "name": "user_prompt", "type": "string", "description": "The user's textual description or topic for the slideshow content.", "required": false },
      { "name": "product_id", "type": "string", "description": "The ID of the user's product to be featured or used as context.", "required": true },
      { "name": "background_id", "type": "string", "description": "The ID of the user's background image to be used for the slideshow.", "required": true },
      { "name": "slideshow_type", "type": "string", "description": "The type of slideshow to generate: 'safe_secure' (comfort and trust), 'learn_grow' (educational content), 'viral_fun' (trendy and engaging), or 'personal_stories' (relatable experiences).", "required": true },
       { "name": "language", "type": "string", "description": "Optional. The language for the generated slide text (e.g., 'en', 'es', 'tr'). Default: 'en'.", "required": false }
    ],
    "jobType": "slideshow_generation",
    "estimated_cost": 50
  },
  // --- EDITING COMMANDS (400-499) ---
  {
    "code": 401,
    "name": "EDIT_IMAGE",
    "description": "Applies edits to a previously generated image.",
    "parameters": [
      { "name": "image_id", "type": "string", "description": "The ID of the image to be edited (from the gallery).", "required": true },
      { "name": "edit_instructions", "type": "string", "description": "Detailed instructions on how to modify the image (e.g., 'change background color to blue', 'add sunglasses to the person', 'make it look more cartoonish').", "required": true }
    ]
  },
  // --- DATA MANAGEMENT COMMANDS (500-599) ---
  {
    "code": 501,
    "name": "ADD_PRODUCT",
    "description": "Adds a new product to the user's settings.",
    "parameters": [
      { "name": "product_name", "type": "string", "description": "The name of the product.", "required": true },
      { "name": "product_description", "type": "string", "description": "A description of the product.", "required": true },
      { "name": "product_logo_url", "type": "string", "description": "Optional URL for the product image.", "required": false },
      { "name": "product_image_url", "type": "string", "description": "Optional URL for the product image.", "required": false }

    ]
  },
  {
    "code": 502,
    "name": "DELETE_PRODUCT",
    "description": "Deletes a product from the user's settings.",
    "parameters": [ { "name": "product_identifier", "type": "string", "description": "The name or ID of the product to delete.", "required": true } ]
  },
  {
    "code": 503,
    "name": "ADD_CREATOR",
    "description": "Adds a new UGC creator profile to the user's settings.",
    "parameters": [
      { "name": "creator_name", "type": "string", "description": "The name of the UGC creator.", "required": true },
      { "name": "creator_image_url", "type": "string", "description": "Optional URL for the creator's image.", "required": false }
    ]
  },
  {
    "code": 504,
    "name": "DELETE_CREATOR",
    "description": "Deletes a UGC creator profile from the user's settings.",
    "parameters": [ { "name": "creator_identifier", "type": "string", "description": "The name or ID of the creator to delete.", "required": true } ]
  },
   {
    "code": 505,
    "name": "ADD_BACKGROUND",
    "description": "Adds a new background image to the user's settings using a previously generated image ID.",
    "parameters": [ { "name": "image_id", "type": "string", "description": "The ID of the previously generated image to add as a background.", "required": true } ]
  },
  {
    "code": 506,
    "name": "DELETE_BACKGROUND",
    "description": "Deletes a background image from the user's settings.",
    "parameters": [ { "name": "background_identifier", "type": "string", "description": "The ID of the background image to delete.", "required": true } ]
  },
  // --- UI CONTROL COMMANDS (600-699) ---
   {
    "code": 601,
    "name": "NAVIGATE_VIEW",
    "description": "Changes the main view of the application.",
    "parameters": [ { "name": "target_view", "type": "string", "description": "The view to navigate to. Must be one of: 'generator', 'calendar', 'settings'.", "required": true } ]
  },
   {
    "code": 602,
    "name": "NAVIGATE_SETTINGS_TAB",
    "description": "Navigates to a specific tab within the Settings page.",
    "parameters": [ { "name": "tab_name", "type": "string", "description": "The settings tab to navigate to. Must be one of: 'Product', 'Creators', 'Backgrounds', 'Features', 'General'.", "required": true } ]
  },
  {
    "code": 603,
    "name": "TOGGLE_THEME",
    "description": "Switches the application theme between light and dark mode.",
    "parameters": [ { "name": "target_mode", "type": "string", "description": "Optional. Specify 'light' or 'dark'. If omitted, it toggles the current mode.", "required": false } ]
  },


  // --- INTERNAL COMMANDS (Not directly parsed from user text) ---
  {
    "code": 507,
    "name": "SAVE_CREATOR_FROM_GEN",
    "description": "Internal: Saves a generated image as a creator.",
    "parameters": [
      { "name": "creator_name", "type": "string", "required": true },
      { "name": "imageUrl", "type": "string", "required": true },
      { "name": "original_generation_data", "type": "object", "required": true }
    ]
  },
  {
    "code": 508,
    "name": "SAVE_BACKGROUND_FROM_GEN",
    "description": "Internal: Saves a generated image as a background.",
    "parameters": [
      { "name": "background_name", "type": "string", "required": true },
      { "name": "imageUrl", "type": "string", "required": true },
      { "name": "original_generation_data", "type": "object", "required": true }
    ]
  }
];

// ----- SENİN EKLEYECEĞİN KISIM BAŞLANGICI -----
// OpenAI API Anahtarını Environment Variables'dan al
// Firebase CLI ile: firebase functions:config:set openai.key="YOUR_API_KEY"
// Eğer emülatör kullanıyorsan, .runtimeconfig.json dosyasına ekleyebilirsin.
// Global 'openai' değişkenini kaldırıyoruz. Her çağrıda yeniden oluşturulacak.
// ----- SENİN EKLEYECEĞİN KISIM SONU -----

// ----- Runway Client (Placeholder - Configure with your SDK/API details) -----
// const { RunwayClient } = require("@runwayml/hosted-models"); // Example
// let runway;
// try {
//   // Read key using user-specified name (likely lowercased)
//   const runwayApiKey = functions.config().runway_key;
//   // const runwayApiKey = functions.config().runway?.key; // Old line
//
//   if (runwayApiKey) {
//      // Initialize Runway client here using only the API Key
//      // runway = new RunwayClient({ apiKey: runwayApiKey }); // Example
//      console.log("Runway client would be initialized here.");
//   } else {
//      console.warn("Runway API key not configured (checked runway_key).");
//   }
// } catch (error) {
//    console.error("Error initializing Runway Client:", error);
// }

exports.parseUserCommand = onCall({ region: 'us-central1', timeoutSeconds: 540, memory: '1GB' }, async (request) => { // ADDED memory: '1GB'
  // --- Authentication Check ---
  const userId = request.auth?.uid;
  if (!userId) {
    logger.error("parseUserCommand called without authentication.");
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const data = request.data;
  
  // --- Initialize OpenAI Client (only if text processing is needed) ---
  let openai;
  try {
    const apiKey = process.env.OPENAI_KEY; 
    if (!apiKey) {
      logger.error("OpenAI API Key not found in environment variables (OPENAI_KEY).");
      throw new HttpsError('internal', 'OpenAI service is not available due to missing configuration.');
    }
    openai = new OpenAI({ apiKey: apiKey });
    logger.info("OpenAI SDK initialized successfully for this invocation.");
  } catch (error) {
    logger.error("Error initializing OpenAI within handler:", error);
    throw new HttpsError('internal', 'Failed to initialize OpenAI service.');
  }

  // --- NEW FLOW: Check if frontend sent a fixed command code ---
  if (data.commandCode && typeof data.commandCode === 'number' && data.commandCode !== 0) {
    logger.info(`[parseUserCommand User ${userId}] Frontend sent fixed commandCode: ${data.commandCode}`);
    
    const commandDef = commandDefinitions.find(cmd => cmd.code === data.commandCode);
    if (!commandDef) {
      logger.error(`[parseUserCommand User ${userId}] Invalid command code received from frontend: ${data.commandCode}`);
      throw new HttpsError('invalid-argument', `Invalid command code: ${data.commandCode}`);
    }

    // Use client-sent parameters directly
    const finalParameters = data.parameters || {};
    
    logger.info(`[parseUserCommand User ${userId}] Using frontend parameters for command ${data.commandCode}:`, finalParameters);

    // --- EXECUTE THE COMMAND ---
    logger.info(`[parseUserCommand User ${userId}] Executing command ${data.commandCode} with final parameters:`, finalParameters);
    
    // Call the appropriate generation function based on command code
    switch (data.commandCode) {
      case 101: // GENERATE_UGC_TIKTOK_VIDEO
        logger.info(`[parseUserCommand User ${userId}] Calling requestImageGeneration for video`);
        try {
          // Destructure mentionedCreatorId instead of creator_id from finalParameters
          const { product_id, mentionedCreatorId, user_prompt, language } = finalParameters;

          // Update the check to use mentionedCreatorId
          if (!product_id || !mentionedCreatorId) {
            logger.error(`[parseUserCommand User ${userId}] Missing required parameters for video: product_id=${product_id}, mentionedCreatorId=${mentionedCreatorId}`);
            throw new HttpsError('invalid-argument', "Video generation requires Product and UGC Model selection.");
          }
          
          const videoRequest = {
            auth: request.auth,
            data: finalParameters,
            rawRequest: request.rawRequest || {}
          };

          const videoResult = await exports.requestImageGeneration.run(videoRequest);
          logger.info(`[parseUserCommand User ${userId}] requestImageGeneration returned:`, videoResult);
          return videoResult;

        } catch (videoError) {
          logger.error(`[parseUserCommand User ${userId}] Error in video generation:`, videoError);
          if (videoError instanceof HttpsError) throw videoError;
          throw new HttpsError('internal', `Video generation failed: ${videoError.message}`);
        }

      case 201: // GENERATE_BACKGROUND_IMAGE
      case 202: // GENERATE_UGC_IMAGE  
        logger.info(`[parseUserCommand User ${userId}] Calling generateImage for image command ${data.commandCode}`);
        try {
          const imageRequest = {
            auth: request.auth,
            data: { ...finalParameters, commandCode: data.commandCode }, // Pass commandCode here
            rawRequest: request.rawRequest || {}
          };

          const imageResult = await exports.generateImage.run(imageRequest);
          logger.info(`[parseUserCommand User ${userId}] generateImage returned:`, imageResult);
          return imageResult;

        } catch (imageError) {
          logger.error(`[parseUserCommand User ${userId}] Error in image generation:`, imageError);
          if (imageError instanceof HttpsError) throw imageError;
          throw new HttpsError('internal', `Image generation failed: ${imageError.message}`);
        }

      case 301: // GENERATE_IMAGE_TIKTOK_SLIDESHOW
        logger.info(`[parseUserCommand User ${userId}] Calling generateImageSlideshow for slideshow`);
        try {
          const { product_id, background_id, slideshow_type, user_prompt, language } = finalParameters;

          if (!product_id || !background_id || !slideshow_type) {
            logger.error(`[parseUserCommand User ${userId}] Missing required parameters for slideshow: product_id=${product_id}, background_id=${background_id}, slideshow_type=${slideshow_type}`);
            throw new HttpsError('invalid-argument', "Slideshow generation requires Product, Background, and Type selection.");
          }
          
          const productDoc = await db.collection('users').doc(userId).collection('products').doc(product_id).get();
          if (!productDoc.exists) {
            logger.error(`[parseUserCommand User ${userId}] Product with ID ${product_id} not found for slideshow.`);
            throw new HttpsError('not-found', `Product not found: ${product_id}.`);
          }
          const productData = productDoc.data();

          const backgroundDoc = await db.collection('users').doc(userId).collection('backgrounds').doc(background_id).get();
          if (!backgroundDoc.exists) {
            logger.error(`[parseUserCommand User ${userId}] Background with ID ${background_id} not found for slideshow.`);
            throw new HttpsError('not-found', `Background not found: ${background_id}.`);
          }
          const backgroundData = backgroundDoc.data();
          
          const effectiveTopic = user_prompt || productData.name || 'AI Generated Slideshow Content';
          
          const slideshowParams = {
            topic: effectiveTopic,
            background_name: backgroundData.name, 
            language: language || 'en',
            _product_context: productData, 
            _slideshow_type_context: slideshow_type,
            product_id: product_id,
            background_id: background_id,
          };

          logger.info(`[parseUserCommand User ${userId}] Final slideshow parameters:`, slideshowParams);

          const slideshowRequest = {
            auth: request.auth,
            data: slideshowParams,
            rawRequest: request.rawRequest || {}
          };

          const slideshowResult = await exports.generateImageSlideshow.run(slideshowRequest);
          logger.info(`[parseUserCommand User ${userId}] generateImageSlideshow returned:`, slideshowResult);
          return slideshowResult;

        } catch (slideshowError) {
          logger.error(`[parseUserCommand User ${userId}] Error in slideshow generation:`, slideshowError);
          if (slideshowError instanceof HttpsError) throw slideshowError;
          throw new HttpsError('internal', `Slideshow generation failed: ${slideshowError.message}`);
        }

      default:
        logger.error(`[parseUserCommand User ${userId}] No handler for command code ${data.commandCode}`);
        throw new HttpsError('invalid-argument', `Command ${data.commandCode} is not supported for direct execution.`);
    }

  } else {
    // --- LEGACY TEXT-ONLY FLOW (for backwards compatibility) ---
    const userText = data.text;
    if (!userText || typeof userText !== 'string' || userText.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'Either a valid command code with parameters, or non-empty text is required.');
    }

    logger.info(`[parseUserCommand User ${userId}] Using legacy text-only parsing for: "${userText}"`);
    
    // [Keep the existing OpenAI parsing logic for text-only commands]
    // This would be the original AI parsing code for backwards compatibility
    // For now, return a simple response
    return { 
      commandCode: 0, 
      parameters: {}, 
      message: "Text-only commands are not fully implemented in the new flow. Please use the creation interface." 
    };
  }
});

// Helper function to generate the detailed prompt using GPT-4o
async function generateDetailedUgcPrompt(params, openaiInstance) {
    // Destructure params
    const { subject_description, clothing, setting, style, age, gender } = params; 

    // --- Age Check --- 
    if (age !== undefined && age !== null) {
        const parsedAge = parseInt(age, 10);
        if (!isNaN(parsedAge) && parsedAge < 18) {
             logger.warn(`Attempted to generate image for age ${parsedAge}. Blocked.`);
             throw new HttpsError('invalid-argument', 'Cannot generate images of individuals under 18.');
        }
    }

    const femaleClothingExamples = [
        "in a black backless crop top highlighting cleavage",
        "in a white halter neck top showing shoulders and subtle cleavage",
        "in a red asymmetric one-shoulder top with a plunging neckline",
        "in a sheer black mesh top over a visible bralette showing cleavage",
        "in a structured navy blue corset top with bust-enhancing design, paired with jeans",
        "in a charcoal twist-front crop top that subtly reveals cleavage",
        "in a grey long sleeve top with bust-level cut-out details",
        "in a white tie-front blouse revealing a hint of cleavage",
        "in a black tube top (bandeau style) with chest exposure",
        "in an oversized sleeveless knitted top in off-black with visible neckline",
        "in a satin cowl neck top in pearl grey, softly draping around the chest",
        "in a fitted 90s-style baby tee in off-white, slightly low-cut",
        "in a bralette top with matching mini shrug in graphite grey, showing cleavage",
        "in a layered sheer mesh long sleeve top in black over a low-cut bra",
        "in a puff sleeve off-the-shoulder top in soft white with romantic cleavage reveal",
        "in a wrap crop top tied at the side in deep red, exposing bust line",
        "in a ribbed tank top in charcoal with modest chest exposure",
      
        "in a black asymmetric strappy top and high-waisted wide-leg trousers, showing bustline",
        "in a silk camisole top in deep wine with lace trim and cleavage, paired with shorts",
        "in an oversized white band t-shirt tucked into faux leather leggings, slightly lifted to show neckline",
        "in a matching activewear set by Nike — black sports bra with cleavage and high-waisted leggings",
        "in a floral print sundress in navy with thin straps and open neckline",
        "in a modern blazer in dove grey (worn open) over a white bralette and biker shorts",
        "in a sky blue button-down shirt tied at the waist over denim shorts, unbuttoned to reveal bust",
        "in a black mini dress with a thigh slit and plunging neckline",
      
        "in a cropped zip-up hoodie by Adidas (black) layered over a ribbed white crop top showing cleavage, with high-waisted jeans",
        "in a black Adidas cropped hoodie with mesh panels and visible cleavage, paired with leggings",
        "in a white Nike crop hoodie with bold logo and open zipper revealing bustline, worn with joggers",
      
        "in a sheer zip-up hoodie in smoke grey over a lace bralette showing full cleavage, with cargo pants",
        "in a cropped leather moto jacket (black) over a red lace cami with deep neckline and ripped jeans",
        "in a distressed denim zip-up jacket over a white ribbed crop tank showing bust, with biker shorts",
        "in a lightweight bomber hoodie in slate grey with sheer paneling and strappy low-cut crop top",
        "in an oversized varsity zip jacket in black over a bralette trimmed with lace, revealing cleavage, paired with denim cutoffs",
        "in a tech-fabric zip hoodie in deep grey over a mesh reflective crop top with visible bustline and cargo pants",
        "in a sporty black mesh-panel zip hoodie over a bandeau top with cleavage, paired with leggings",
        "in a cropped black track jacket by Nike, paired with a ribbed tube top showing bust and matching pants",
      
        "in a cropped grey fleece hoodie (unzipped slightly to show neckline) and black jogger pants",
        "in a tailored oversized blazer in dark charcoal over a low-cut knit cami and straight-leg jeans",
        "in a belted shirt dress in steel blue with a soft V-neckline revealing cleavage, paired with ankle boots"
      ];
    // --- REVISED CLOTHING LISTS (TOPS & BOTTOMS) ---
    const femaleTops = [
        // --- Trendy Tops (2025 Inspired) ---
        "stylish backless crop top", "chic halter neck top showing shoulders", "asymmetric one-shoulder top",
        "delicate sheer mesh top over a simple bralette", "structured corset top", "trendy twist-front crop top",
        "long sleeve top with subtle cut-out details at the waist", "light tie-front blouse", "simple tube top (bandeau style)",
        "oversized knitted sleeveless top", "smooth satin cowl neck top", "fitted 90s style baby tee",
        "bralette top with a matching mini shrug", "layered sheer mesh long sleeve top", "romantic off-the-shoulder puff sleeve top",
        "wrap crop top tied at the side", "basic ribbed tank top", "silk camisole top with delicate lace trim",
        "oversized band t-shirt", "stylish sports bra (as part of activewear set)", "button-down shirt (can be tied)",
        "cropped zip-up hoodie", "Adidas cropped zip-up hoodie with mesh panels", "Nike crop hoodie with bold logo",
        "sheer mesh zip-up hoodie over a lace bralette", "cropped leather moto jacket over a black lace cami",
        "distressed denim zip-up jacket with a white ribbed crop tank", "lightweight bomber zip-up hoodie with sheer paneling over a strappy crop top",
        "oversized varsity-style zip jacket over a lace-trimmed bralette", "tech-fabric windcheater zip-up hoodie with a mesh-reflective crop top",
        "sporty mesh-panel zip hoodie over a bandeau", "cropped track jacket", "knit cami", "ribbed mock-neck tank",
        "comfortable grey fleece hoodie (slightly cropped)", "plain white crew-neck t-shirt", // Added basics
        "black v-neck t-shirt" // Added basics
    ];
    const femaleBottoms = [
        "high-waisted wide-leg trousers", "tailored shorts", "faux leather leggings", "high-waisted jeans",
        "matching leggings (for activewear set)", "denim shorts", "biker shorts", "plain skirt",
        "pants", "gym tights", "ripped skinny jeans", "high-waisted cargo pants", "denim cutoffs",
        "joggers", "track pants", "straight-leg jeans", "high-waisted midi skirt"
        // Sundress/minidress/gown examples removed as they are full outfits
    ];

    // --- NEW: Combined Male Clothing Examples ---
    const maleClothingExamples = [
        "in a well-fitting plain white crew-neck t-shirt and dark wash jeans",
        "in a classic black v-neck t-shirt and chino pants",
        "in a light blue button-down shirt (top button undone) and beige shorts",
        "in a grey Henley shirt with sleeves rolled up and dark jeans",
        "in a fitted dark grey polo shirt and comfortable trousers",
        "in a simple black tank top (showing athletic arms) and casual shorts",
        "in an open casual flannel shirt (red and black plaid) over a plain white t-shirt and ripped black jeans",
        "in a comfortable charcoal knit sweater and dark chino pants",
        "in a stylish black bomber jacket over a grey t-shirt and slim-fit black jeans",
        "in a modern athletic zip-up hoodie (navy blue) and grey jogger pants",
        "in a tailored light grey linen shirt (casually untucked) and white cuffed shorts",
        "in a black turtleneck sweater and smart grey wool trousers",
        "in a denim jacket over a striped t-shirt and black jeans",
        "in a relaxed-fit olive green utility shirt and cargo pants",
        "in a cream-colored cable-knit cardigan over a chambray shirt and brown corduroy pants",
        "in a fitted black leather jacket, white graphic tee, and dark distressed jeans",
        "in a modern navy blue Harrington jacket, a simple white long-sleeve top, and stone-colored chinos",
        "in a light-wash denim shirt (worn open) over a black muscle-fit tank top and black skinny jeans",
        "in a burgundy short-sleeve button-up shirt with a subtle print and tailored navy shorts",
        "in an oversized neutral-toned hoodie, slightly distressed light-wash jeans, and clean white sneakers (implied)"
    ];
    // --- END NEW ---    

    const settingExamples = [
        // Realistic, visually appealing environments with influencer-style clarity
      
        "Seated at a cozy, modern café — sunlight pouring through large windows, sitting at a wooden table with a coffee cup, plants and minimal decor around.",
        "Leaning against a brick wall on a quiet city street during golden hour, with soft lighting and subtle street activity in the background.",
        "Standing inside a bright loft-style studio apartment — large windows, natural shadows, a few plants, and a clean, minimalist setup.",
        "Relaxing in a well-decorated living room — aesthetic furniture, wall art, and a few indoor plants creating a warm, homey vibe.",
        "Sitting on a park bench near a fountain in a public park — trees in the background, casual people walking by, a peaceful urban setting.",
        "Standing in front of a clean, white indoor backdrop — neutral tones to keep the focus on the subject, ideal for a minimal profile shot.",
        "Browsing inside a cozy local bookstore — surrounded by warm lighting and tall bookshelves filled with colorful covers.",
        "Walking through a university campus — classic architecture in the background, paved walkways, and scattered groups of students nearby.",
        "Standing at the entrance of a small art gallery — framed artworks visible behind glass doors, warm indoor lighting spilling outside.",
        "Waiting at a tram stop or bus station in the city — realistic urban elements like maps, benches, and subtle motion in the background.",
        "Sitting on a bench in a park — trees in the background, casual people walking by, a peaceful urban setting."
      ];

    const facialFeatureKeywords = [
        // Keep these as they relate to conventional attractiveness
        "symmetrical face", "sharp features", "clear skin", "smooth complexion", 
        "large bright eyes", "almond-shaped eyes", "defined eyelashes", 
        "defined nose bridge", "full lips", "defined jawline", "high cheekbones"
    ];
    const facialExpressionKeywords = [
        // More varied expressions - REVISED LIST
        "subtle confident smile", 
        "serene neutral expression", 
        "bright engaging smile", 
        "neutral expression", // Added again for more chance
        "closed-mouth smile", // Added
        "gentle smile",       // Added
        "calm expression"     // Added
        // Removed: "playful smirk", "thoughtful gaze", "slightly moody pout", "surprised (subtle)"
    ];

    // --- Body Shape & Bust Keywords (Keep existing variety) --- 
    const bodyShapeKeywords = ["athletic build", "slim build", "average build", "curvy figure", "hourglass figure", "pear-shaped figure", "tall and lean"];
    const bustSizeKeywords = ["small bust", "medium bust", "large bust", "fuller chest", "average bust"];
    // ------------------------------------------------------------

    // Determine subject term ('woman'/'man') - Moved earlier for clothing selection
    let subjectTerm = 'person'; 
    if (gender) {
        subjectTerm = gender.toLowerCase() === 'man' ? 'man' : 'woman';
    } else {
        // Basic inference from subject description if gender not explicitly provided
        // --- ADD CHECK HERE --- 
        if (subject_description && typeof subject_description === 'string') { 
            if (subject_description.toLowerCase().includes(' man') || subject_description.toLowerCase().startsWith('man')) subjectTerm = 'man';
            else if (subject_description.toLowerCase().includes(' boy') || subject_description.toLowerCase().startsWith('boy')) subjectTerm = 'man';
            else if (subject_description.toLowerCase().includes(' woman') || subject_description.toLowerCase().startsWith('woman')) subjectTerm = 'woman';
            else if (subject_description.toLowerCase().includes(' girl') || subject_description.toLowerCase().startsWith('girl')) subjectTerm = 'woman';
        } else {
            logger.warn("generateDetailedUgcPrompt: subject_description is missing or not a string, cannot infer gender from it.");
        }
        // --- END CHECK --- 
    }
    // Adjust boy/girl to man/woman if age implies adulthood
    if (age && parseInt(age, 10) >= 18) {
        if (subjectTerm === 'boy') subjectTerm = 'man';
        if (subjectTerm === 'girl') subjectTerm = 'woman';
    }

    // Select clothing based on gender
    let finalClothing;
    if (clothing) { // User provided clothing takes precedence
        finalClothing = clothing;
    } else if (subjectTerm === 'man') {
        finalClothing = maleClothingExamples[Math.floor(Math.random() * maleClothingExamples.length)];
    } else { // Default to female or person if unspecified
        // MODIFIED: Select from femaleClothingExamples directly
        finalClothing = femaleClothingExamples[Math.floor(Math.random() * femaleClothingExamples.length)];
    }

    const finalSetting = setting || settingExamples[Math.floor(Math.random() * settingExamples.length)];
    // Update default style for influencer aesthetic
    const finalStyle = style || 'modern influencer aesthetic, high quality realistic photo, dynamic composition, natural lighting, fashion focus'; 
    const finalGaze = "looking directly at the camera lens"; // Force gaze
    const finalExpression = facialExpressionKeywords[Math.floor(Math.random() * facialExpressionKeywords.length)];

    // Select facial features (logic remains the same)
    const selectedFeatures = [];
    const numFeaturesToSelect = Math.floor(Math.random() * 3) + 2; 
    const shuffledFeatures = [...facialFeatureKeywords].sort(() => 0.5 - Math.random());
    for (let i = 0; i < numFeaturesToSelect; i++) {
        selectedFeatures.push(shuffledFeatures[i]);
    }
    const featureEmphasisString = selectedFeatures.join(', ');

    // --- Determine Body Shape Description for Prompt --- 
    let bodyShapePromptSegment;
    const maleBodyShapeKeywords = ["athletic build", "lean physique", "muscular build", "average male build", "defined torso", "broad shoulders"];

    if (subjectTerm === 'woman') {
        // Use the user-provided default description for women
        bodyShapePromptSegment = `Describe the body shape as follows: Bust is moderately full and naturally shaped (soft bust). Waist is clearly narrower than bust/hips (defined waist or snatched waist). Hips are gently rounded and not overly wide (petite curves or rounded hips). The overall shape is a balanced slim hourglass with gentle curves. Emphasize natural and realistic proportions consistent with this description and the subject's ethnicity.`;
    } else if (subjectTerm === 'man') {
        // Define specific body shape description for men
        const finalBodyShape = bodyShapeKeywords[Math.floor(Math.random() * bodyShapeKeywords.length)];
        const selectedMaleKeyword = maleBodyShapeKeywords[Math.floor(Math.random() * maleBodyShapeKeywords.length)];
        bodyShapePromptSegment = `Describe the body shape using realistic adult male proportions consistent with the described ethnicity and body type. Specifically incorporate terms like: '${finalBodyShape}' AND '${selectedMaleKeyword}'. Ensure a natural and masculine physique. Avoid overly exaggerated features.`;
    } else { // Fallback for 'person' or unspecified
        bodyShapePromptSegment = `Describe the body shape using realistic and varied adult proportions consistent with the described ethnicity.`;
    }

    // --- Construct Updated Instruction Prompt for GPT-4o ---
    // --- Determine Makeup Instruction based on Gender ---
    let makeupInstruction;
    if (subjectTerm === 'woman') {
        makeupInstruction = "Apply natural-looking, appropriate makeup (e.g., everyday makeup, light glam) suitable for the subject and overall style.";
    } else if (subjectTerm === 'man') {
        makeupInstruction = "The subject must have clear, natural skin with NO visible makeup.";
    } else { // Neutral default
        makeupInstruction = "Ensure natural-looking skin.";
    }

    // --- NEW: Realism Enhancements for Subject ---
    const realismDetails = "Incorporate high detail skin texture, visible pores, and realistic imperfections. Emphasize natural skin texture, slight vellus hair on face/arms if appropriate. Ensure realistic and varied eye reflections.";
    // --- END: Realism Enhancements ---

    // --- NEW: Background Detailing Logic ---
    let backgroundEnhancement = "";
    let plausiblePlaceName = ""; // Variable to hold generated name
    // Simple check for keywords suggesting specific locations
    if (finalSetting.toLowerCase().includes("cafe")) {
        plausiblePlaceName = ["The Daily Grind", "Maple Leaf Cafe", "Corner Perk", "Urban Bean"][Math.floor(Math.random() * 4)];
        backgroundEnhancement = ` Add details like other patrons blurred in the background, coffee cups on tables, maybe plants. Include the cafe name '${plausiblePlaceName}' subtly, perhaps visible reversed on a window or on a small menu board.`;
    } else if (finalSetting.toLowerCase().includes("university") || finalSetting.toLowerCase().includes("campus")) {
        plausiblePlaceName = ["Northwood University Commons", "Central City College", "Oakridge Institute Plaza"][Math.floor(Math.random() * 3)];
        backgroundEnhancement = ` Include architectural details, maybe other students walking in the distance (blurred). Add the name '${plausiblePlaceName}' subtly, perhaps engraved on a stone sign near an entrance or on a banner.`;
    } else if (finalSetting.toLowerCase().includes("bookstore")) {
        plausiblePlaceName = ["The Reading Nook", "Chapters & Verse", "Old Town Books"][Math.floor(Math.random() * 3)];
        backgroundEnhancement = ` Fill the background with bookshelves, books, maybe a comfortable reading chair. Include the name '${plausiblePlaceName}' subtly on a sign near the entrance or a bookmark display.`;
    } else if (finalSetting.toLowerCase().includes("gallery")) {
        plausiblePlaceName = ["Avant Garde Gallery", "City Art Space", "The Modern Frame"][Math.floor(Math.random() * 3)];
        backgroundEnhancement = ` Show abstract or modern paintings on the walls, track lighting, perhaps another visitor blurred in the background. Include the name '${plausiblePlaceName}' subtly on a plaque near the entrance or on a brochure stand.`;
    } // Add more cases for other settings as needed
    // --- END: Background Detailing Logic ---

    // --- Define missing prompt variables ---
    const backgroundInstructions = "Ensure the background is detailed, makes sense for the scene, and is in sharp focus."; // Example default
    const hairDetails = "Hair should be realistic, with natural flow and texture, fitting the described subject."; // Example default
    // --- END Define missing prompt variables ---

    const instructionPrompt = `
    Generate a highly detailed, concise, and effective prompt for an AI image generator (e.g., DALL-E 3) to create a specific type of image.

    Objective: Create a photorealistic, high-quality image emulating a **natural, spontaneous selfie taken with a modern smartphone (e.g., iPhone, Android)**.
    The shot should be a **closer, more intimate perspective** (phone not visible, arm relaxed as if holding a phone closer).
    The ENTIRE image, including the background and all its elements, MUST be in **sharp focus**. Strictly avoid any depth of field effects, bokeh, or artificial background blur.

    Core Subject (DO NOT CHANGE THESE ASPECTS):
    - Base the person entirely on this description: "${subject_description}".
    - Ensure the subject clearly appears as a ${subjectTerm}.
    - ${age && parseInt(age, 10) >= 18 ? `The subject should appear to be approximately ${parseInt(age, 10)} years old.` : ''}
    - Create a conventionally attractive face. Enhance the base description by naturally incorporating details like: ${featureEmphasisString}.
    - ${realismDetails} // Skin and realism details for the person.
    - ${makeupInstruction} // Makeup instruction based on gender.
    - Body Shape: ${bodyShapePromptSegment} // Body shape description. Ensure the overall description is SFW.
    - Accessories: Minimal and subtle accessories are acceptable if they complement the style (e.g., simple necklace, delicate bracelet, understated rings). Avoid large, distracting jewelry, sunglasses, or hats unless explicitly part of subject/clothing descriptions.

    Required Elements (These aspects SHOULD BE DETAILED and VARIED by you, the AI, based on user inputs and realism goals):
    1.  Clothing (Person Aspect - Keep current logic, describe fit/fabric/color/style): The subject is wearing: "${finalClothing}". Describe fit (e.g., 'well-fitting', 'slightly oversized'), fabric, color, and subtle details. Clothing should align with a modern, trendy style appropriate for the setting: "${finalSetting}". Describe cleavage appropriately if relevant to neckline.

    2.  Setting (ENVIRONMENT - Detail this extensively):
        *   The user-specified setting is: "${finalSetting}". This is PARAMOUNT.
        *   Describe this specific setting with rich, naturalistic details. ${backgroundInstructions}
        *   The setting must complement the subject and overall aesthetic.
        *   CRITICAL: The entire scene, especially the background, MUST be rendered in sharp, crisp focus, showing distinct textures and edge sharpness.
        *   The background should feel authentic, "lived-in," and not overly pristine or staged. Include subtle signs of normal use or slight, natural disarray appropriate for the setting (e.g., a slightly creased cushion, a few stray leaves, minor scuffs on a wall).

    3.  Lighting (ENVIRONMENT - Detail this extensively and make it DYNAMIC):
        *   Describe lighting that is **highly specific, natural, and dynamic to the provided setting ("${finalSetting}")**.
        *   For example:
            *   If outdoors with foliage: "Face partially illuminated through broken shadows cast by foliage above. Sunlight filters through leaves, creating sharp, irregular dappled shadow patterns across face and hair."
            *   If indoors near window: "Soft, directional window light illuminating one side of the face, with gentle falloff into shadow on the other."
            *   If urban at night: "Mixed lighting from street lamps and shop windows, creating areas of warm and cool light with visible highlights and reflections."
        *   The lighting MUST realistically illuminate both subject and background, creating a cohesive scene.
        *   Detail the direction, quality (e.g., soft, harsh, diffused, dappled), and color temperature of light sources appropriate for "${finalSetting}".
        *   The lighting should visibly affect the subject: skin (natural highlights/shadows, e.g., rembrandt lighting if applicable) and clothing (revealing texture).

    4.  Smartphone Camera & Lens Emulation (TECHNICAL DETAILS - Incorporate these):
        *   The image should exhibit characteristics of a high-quality modern smartphone photo (e.g., iPhone, Android).
        *   Include "soft lens characteristics": slight chromatic aberration around high-contrast edges (especially in the background).
        *   Specify a "natural, often warm color balance" typical of smartphone processing.
        *   Describe "natural contrast roll-off" in both shadows and highlights, avoiding overly crushed blacks or blown-out whites.
        *   Incorporate "minor, subtle digital compression artifacts" and "a very slight, fine-grained sensor noise pattern" in darker areas to give an organic digital texture. These should be almost imperceptible but add to realism.

    5.  Color & Grading (AESTHETIC):
        *   Aim for cinematic color grading, potentially warm tones, soft natural contrast, and a very subtle film grain if it enhances the "real photo" feel without looking like an explicit filter. Colors should appear natural and not overly saturated.

    6.  Composition & Pose (SELFIE DETAILS - Make this feel spontaneous):
        *   Portrait orientation.
        *   Composition and framing should be natural, contextually appropriate for "${finalSetting}", and embody a **spontaneous selfie feel**.
        *   Encourage "imperfect framing" and "subtle signs of handheld stability" (e.g., a very slight, natural tilt or off-center composition).
        *   Camera angle can vary: "slightly below eye level," "eye-level," or "slightly above," typical of how one might naturally take a selfie.
        *   If in a confined space like a **car**: framing MUST be chest-up or close-up on face/upper torso. NO lap/legs/shorts/pants. Use a slightly lower camera angle. Arm holding (unseen) phone should be relaxed and close.
        *   If **seated/standing**: waist-up or head-and-shoulders frame from a natural selfie angle.
        *   Prioritize a natural, unforced pose. Subject's gaze: "${finalGaze}". Expression: "${finalExpression}".
        *   Ensure head doesn't appear disproportionately large due to an overly close/wide-angle effect unless it's a specific artistic choice for a typical selfie. Framing should feel intentional yet casual.

    7.  Overall Style (AESTHETIC - Combine all elements):
        *   The image MUST have the style: "${finalStyle}".
        *   Emphasize photorealistic details, natural and dynamic lighting specific to the scene.
        *   **Reiterate: Sharp focus throughout the entire image (subject and background).**
        *   The final image should resemble a spontaneous, high-quality, real-life selfie taken on a modern smartphone during a casual moment, rich in environmental and lighting detail.

    Safety Compliance: PRIORITIZE SFW content adhering to OpenAI's safety policies. Avoid suggestive or borderline content.

    Output Requirements:
    - Combine ALL elements into a single, coherent paragraph for the image generator.
    - Output MUST be ONLY the generated prompt string (no intros, labels).
    - Focus on descriptive keywords, photorealistic details.
    - Ensure prompt is SFW.

    Example of a Desired Output Structure (This is to guide YOUR structure, the AI generating the prompt. Content will vary based on inputs):
    "Photorealistic close-up selfie, modern smartphone photo emulation: A [age, ${subjectTerm}, ethnicity, attractive face with ${featureEmphasisString}, realistic skin with natural imperfections & pores, ${subjectTerm === 'man' ? 'no makeup' : 'natural everyday makeup'}, ${hairDetails}] with a [body description from ${bodyShapePromptSegment}], striking a natural, unforced pose. The framing is [e.g., 'slightly off-center, chest-up, with a subtle handheld tilt, from a slightly low camera angle typical of a relaxed car selfie' or 'eye-level, waist-up, with imperfect but intentional framing']. Gaze is ${finalGaze} with a ${finalExpression}. They are wearing a trendy [detailed clothing description: ${finalClothing}] appropriate for the setting and gender. The background is exactly [extremely detailed setting description based on ${finalSetting} and ${backgroundInstructions}, e.g., 'sun-dappled green foliage filling the frame, every leaf in sharp focus showing distinct texture and highlights from filtered sunlight'], rendered in crisp focus throughout, showing authentic, lived-in details. The scene is illuminated by [highly specific and dynamic lighting description, e.g., 'bright, natural sunlight filtering through leaves, casting sharp, irregular dappled shadow patterns across her face, hair, and parts of the background, creating strong contrasts and highlights']. The image exhibits soft lens characteristics of a smartphone: slight chromatic aberration on high-contrast background edges, a warm color balance, natural contrast roll-off. Subtle digital textures like minor compression artifacts and very faint sensor noise are present in shadows. Overall style: ${finalStyle}, spontaneous real-life selfie look."

    Generate the prompt now based on the provided details.
`;

    logger.info("Generating detailed prompt for influencer style with GPT-4o (V2 - Enhanced Selfie Realism):", instructionPrompt); // Added V2 to log

    try {
        const completion = await openaiInstance.chat.completions.create({
            model: "gpt-4o-mini", 
            messages: [{ role: "user", content: instructionPrompt }],
            temperature: 0.5, // Allow a bit more creativity
            max_tokens: 300, // Allow slightly longer prompt for detail
        });
        const detailedPrompt = completion.choices[0]?.message?.content?.trim();

        if (!detailedPrompt) {
            logger.error("GPT-4o failed to generate a detailed image prompt.");
            throw new Error("Failed to generate detailed prompt via text AI.");
        }

        logger.info("Generated detailed prompt:", detailedPrompt);
        // MODIFIED: Return an object with prompt and subjectTerm
        return { detailedPrompt: detailedPrompt, subjectTerm: subjectTerm };

    } catch (error) {
        logger.error("Error calling GPT-4o for detailed prompt generation:", error);
        throw new HttpsError('internal', 'Failed to generate detailed image prompt using helper AI.', error.message);
    }
}

// NEW HELPER FUNCTION FOR ENVIRONMENT DETAILS
async function generateEnvironmentDetailsPrompt(baseSettingDescription, requestedStyle, baseClothingDescription, openaiInstance) {
    const settingExamples = [
        // Realistic, visually appealing environments with influencer-style clarity (Copy from generateDetailedUgcPrompt or refine)
        "Seated at a cozy, modern café — sunlight pouring through large windows, sitting at a wooden table with a coffee cup, plants and minimal decor around.",
        "Leaning against a brick wall on a quiet city street during golden hour, with soft lighting and subtle street activity in the background.",
        "Standing inside a bright loft-style studio apartment — large windows, natural shadows, a few plants, and a clean, minimalist setup.",
        // ... (ensure these are diverse and high-quality examples)
    ];

    const finalSetting = baseSettingDescription || settingExamples[Math.floor(Math.random() * settingExamples.length)];
    const finalStyle = requestedStyle || 'modern influencer aesthetic, high quality realistic photo, dynamic composition, natural lighting, fashion focus';
    const finalClothing = baseClothingDescription;
    
    // --- Background Detailing Logic (Copied from generateDetailedUgcPrompt for consistency) ---
    let backgroundEnhancement = "";
    let plausiblePlaceName = ""; 
    if (finalSetting.toLowerCase().includes("cafe")) {
        plausiblePlaceName = ["The Daily Grind", "Maple Leaf Cafe", "Corner Perk", "Urban Bean"][Math.floor(Math.random() * 4)];
        backgroundEnhancement = ` Add details like other patrons blurred in the background, coffee cups on tables, maybe plants. Include the cafe name '${plausiblePlaceName}' subtly, perhaps visible reversed on a window or on a small menu board.`;
    } else if (finalSetting.toLowerCase().includes("university") || finalSetting.toLowerCase().includes("campus")) {
        plausiblePlaceName = ["Northwood University Commons", "Central City College", "Oakridge Institute Plaza"][Math.floor(Math.random() * 3)];
        backgroundEnhancement = ` Include architectural details, maybe other students walking in the distance (blurred). Add the name '${plausiblePlaceName}' subtly, perhaps engraved on a stone sign near an entrance or on a banner.`;
    } else if (finalSetting.toLowerCase().includes("bookstore")) {
        plausiblePlaceName = ["The Reading Nook", "Chapters & Verse", "Old Town Books"][Math.floor(Math.random() * 3)];
        backgroundEnhancement = ` Fill the background with bookshelves, books, maybe a comfortable reading chair. Include the name '${plausiblePlaceName}' subtly on a sign near the entrance or a bookmark display.`;
    } else if (finalSetting.toLowerCase().includes("gallery")) {
        plausiblePlaceName = ["Avant Garde Gallery", "City Art Space", "The Modern Frame"][Math.floor(Math.random() * 3)];
        backgroundEnhancement = ` Show abstract or modern paintings on the walls, track lighting, perhaps another visitor blurred in the background. Include the name '${plausiblePlaceName}' subtly on a plaque near the entrance or on a brochure stand.`;
    } // Add more cases as needed from generateDetailedUgcPrompt if they were good
    // --- END: Background Detailing Logic ---

    const backgroundInstructions = "Ensure the background is detailed, makes sense for the scene, and is in sharp focus.";

    // REVISED environmentInstructionPrompt to be more aligned with generateDetailedUgcPrompt for environment parts
    const environmentInstructionPrompt = `
    You are an AI assistant tasked with generating a highly detailed and evocative description for the **environment and visual properties** of an image, based on a core setting and style. This description will be part of a larger prompt for an AI image generator.
    Do NOT describe any people, characters, or figures.

    Objective: Create a photorealistic, high-quality image emulating a **natural, spontaneous selfie taken with a modern smartphone (e.g., iPhone, Android)**.
    The shot should be a **closer, more intimate perspective** (phone not visible, arm relaxed as if holding a phone closer).
    The ENTIRE image, including the background and all its elements, MUST be in **sharp focus**. Strictly avoid any depth of field effects, bokeh, or artificial background blur.

    
    Required Elements (These aspects SHOULD BE DETAILED and VARIED by you, the AI, based on user inputs and realism goals):
    1.  Clothing (Person Aspect - Keep current logic, describe fit/fabric/color/style): The subject is wearing: "${finalClothing}". Describe fit (e.g., 'well-fitting', 'slightly oversized'), fabric, color, and subtle details. Clothing should align with a modern, trendy style appropriate for the setting: "${finalSetting}". Describe cleavage appropriately if relevant to neckline.

    2.  Setting (ENVIRONMENT - Detail this extensively):
        *   The user-specified setting is: "${finalSetting}". This is PARAMOUNT.
        *   Describe this specific setting with rich, naturalistic details. ${backgroundInstructions}
        *   The setting must complement the subject and overall aesthetic.
        *   CRITICAL: The entire scene, especially the background, MUST be rendered in sharp, crisp focus, showing distinct textures and edge sharpness.
        *   The background should feel authentic, "lived-in," and not overly pristine or staged. Include subtle signs of normal use or slight, natural disarray appropriate for the setting (e.g., a slightly creased cushion, a few stray leaves, minor scuffs on a wall).

    3.  Lighting (ENVIRONMENT - Detail this extensively and make it DYNAMIC):
        *   Describe lighting that is **highly specific, natural, and dynamic to the provided setting ("${finalSetting}")**.
        *   For example:
            *   If outdoors with foliage: "Face partially illuminated through broken shadows cast by foliage above. Sunlight filters through leaves, creating sharp, irregular dappled shadow patterns across face and hair."
            *   If indoors near window: "Soft, directional window light illuminating one side of the face, with gentle falloff into shadow on the other."
            *   If urban at night: "Mixed lighting from street lamps and shop windows, creating areas of warm and cool light with visible highlights and reflections."
        *   The lighting MUST realistically illuminate both subject and background, creating a cohesive scene.
        *   Detail the direction, quality (e.g., soft, harsh, diffused, dappled), and color temperature of light sources appropriate for "${finalSetting}".
        *   The lighting should visibly affect the subject: skin (natural highlights/shadows, e.g., rembrandt lighting if applicable) and clothing (revealing texture).

    4.  Smartphone Camera & Lens Emulation (TECHNICAL DETAILS - Incorporate these):
        *   The image should exhibit characteristics of a high-quality modern smartphone photo (e.g., iPhone, Android).
        *   Include "soft lens characteristics": slight chromatic aberration around high-contrast edges (especially in the background).
        *   Specify a "natural, often warm color balance" typical of smartphone processing.
        *   Describe "natural contrast roll-off" in both shadows and highlights, avoiding overly crushed blacks or blown-out whites.
        *   Incorporate "minor, subtle digital compression artifacts" and "a very slight, fine-grained sensor noise pattern" in darker areas to give an organic digital texture. These should be almost imperceptible but add to realism.

    5.  Color & Grading (AESTHETIC):
        *   Aim for cinematic color grading, potentially warm tones, soft natural contrast, and a very subtle film grain if it enhances the "real photo" feel without looking like an explicit filter. Colors should appear natural and not overly saturated.

    6.  Composition & Pose (SELFIE DETAILS - Make this feel spontaneous):
        *   Portrait orientation.
        *   Composition and framing should be natural, contextually appropriate for "${finalSetting}", and embody a **spontaneous selfie feel**.
        *   Encourage "imperfect framing" and "subtle signs of handheld stability" (e.g., a very slight, natural tilt or off-center composition).
        *   Camera angle can vary: "slightly below eye level," "eye-level," or "slightly above," typical of how one might naturally take a selfie.
        *   If in a confined space like a **car**: framing MUST be chest-up or close-up on face/upper torso. NO lap/legs/shorts/pants. Use a slightly lower camera angle. Arm holding (unseen) phone should be relaxed and close.
        *   If **seated/standing**: waist-up or head-and-shoulders frame from a natural selfie angle.
        *   Prioritize a natural, unforced pose. Subject's gaze: "${finalGaze}". Expression: "${finalExpression}".
        *   Ensure head doesn't appear disproportionately large due to an overly close/wide-angle effect unless it's a specific artistic choice for a typical selfie. Framing should feel intentional yet casual.

    7.  Overall Style (AESTHETIC - Combine all elements):
        *   The image MUST have the style: "${finalStyle}".
        *   Emphasize photorealistic details, natural and dynamic lighting specific to the scene.
        *   **Reiterate: Sharp focus throughout the entire image (subject and background).**
        *   The final image should resemble a spontaneous, high-quality, real-life selfie taken on a modern smartphone during a casual moment, rich in environmental and lighting detail.

    Safety Compliance: PRIORITIZE SFW content adhering to OpenAI's safety policies. Avoid suggestive or borderline content.

    Output Requirements:
    - Combine ALL elements into a single, coherent paragraph for the image generator.
    - Output MUST be ONLY the generated prompt string (no intros, labels).
    - Focus on descriptive keywords, photorealistic details.
    - Ensure prompt is SFW.

    Generate the environment description paragraph now.
    `;

    logger.info("Generating environment details prompt with GPT-4o-mini (Revised for Quality):", environmentInstructionPrompt);

    try {
        const completion = await openaiInstance.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: environmentInstructionPrompt }],
            temperature: 0.5,
            max_tokens: 300, // INCREASED max_tokens to 300
        });
        const environmentDetails = completion.choices[0]?.message?.content?.trim();

        if (!environmentDetails) {
            logger.error("GPT-4o-mini failed to generate environment details (Revised for Quality).");
            throw new Error("Failed to generate environment details via text AI (Revised).");
        }

        logger.info("Generated environment details (Revised for Quality):", environmentDetails);
        return environmentDetails;

    } catch (error) {
        logger.error("Error calling GPT-4o-mini for environment details generation (Revised for Quality):", error);
        throw new HttpsError('internal', 'Failed to generate environment details using helper AI (Revised).', error.message);
    }
}

// --- generateImage Function (Reverted to Synchronous Direct Call) ---
exports.generateImage = onCall({region: 'us-central1', timeoutSeconds: 540}, async (request) => {
    logger.info("[generateImage ENTRY] Received request. Auth:", JSON.stringify(request.auth), "Data:", JSON.stringify(request.data)); // DETAILED ENTRY LOG
    const userId = request.auth?.uid;
    if (!userId) {
        logger.error("[generateImage] Called without authentication.");
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    // --- NEW: Credit Check ---
    const userRef = db.collection('users').doc(userId);
    try {
        logger.info(`[generateImage User: ${userId}] Performing credit check.`);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            logger.error(`[generateImage User: ${userId}] User profile not found for credit check.`);
            throw new HttpsError('not-found', 'User profile not found for credit check.');
        }
        const currentCredits = parseInt(userDoc.data()?.general_credits, 10) || 0;
        if (currentCredits < 90) {
            logger.warn(`[generateImage User: ${userId}] Insufficient general_credits (${currentCredits}) for image generation (needs 90).`);
            throw new HttpsError('resource-exhausted', `Insufficient general credits for image generation. You need at least 90 credits. You have ${currentCredits}.`);
        }
        logger.info(`[generateImage User: ${userId}] Credit check passed. Credits: ${currentCredits}.`);
    } catch (error) {
        logger.error(`[generateImage User: ${userId}] Error during credit check:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', 'Failed to perform credit check.');
    }
    // --- END NEW: Credit Check ---

    const data = request.data;
    if (!data || !data.commandCode) {
        logger.error(`[generateImage User: ${userId}] Missing commandCode in request data.`);
        throw new HttpsError('invalid-argument', 'Missing commandCode in request.');
    }

    logger.info(`[generateImage User: ${userId}] Initialized. Command code: ${data.commandCode}.`);

    let openai;
    try {
        const apiKey = process.env.OPENAI_KEY;
        if (!apiKey) {
            logger.error("[generateImage] OpenAI API Key not found (OPENAI_KEY).");
            throw new HttpsError('internal', 'OpenAI service configuration error.');
        }
        openai = new OpenAI({ apiKey: apiKey });
        logger.info(`[generateImage User: ${userId}] OpenAI client initialized. typeof openai: ${typeof openai}. openai is null: ${openai === null}`);
        if (!openai || !openai.images || !openai.images.generate) {
            logger.error(`[generateImage User: ${userId}] OpenAI client or images.generate method is not properly initialized!`, openai);
            throw new HttpsError('internal', 'OpenAI client critical component missing post-initialization.');
        }
    } catch (error) {
        logger.error(`[generateImage User: ${userId}] Failed to initialize OpenAI service:`, error);
        throw new HttpsError('internal', 'Failed to initialize OpenAI service.');
    }

    try {
        const commandCode = data.commandCode;
        let finalPromptToUse;
        let imageStyle = data.style;
        let detectedGender = null;

        logger.info(`[generateImage User: ${userId}] Processing command code: ${commandCode}, Params:`, data);

        if (commandCode === 202) {
            logger.info(`[generateImage User: ${userId}] Command 202 (UGC Image). Calling generateDetailedUgcPrompt...`);
            if (!data.subject_description) {
                logger.error(`[generateImage User: ${userId}] Missing subject_description for command 202.`);
                throw new HttpsError('invalid-argument', "Please provide a description for the subject of the UGC image.");
            }
            const promptResult = await generateDetailedUgcPrompt({
                subject_description: data.subject_description,
                clothing: data.clothing_description,
                setting: data.setting_description,
                style: data.image_style,
                age: data.age,
                gender: data.gender
            }, openai);
            logger.info(`[generateImage User: ${userId}] generateDetailedUgcPrompt returned. promptResult is null: ${promptResult === null}`);
            if (!promptResult || !promptResult.detailedPrompt) {
                logger.error(`[generateImage User: ${userId}] generateDetailedUgcPrompt failed to return a detailed prompt. Result:`, promptResult);
                throw new HttpsError('internal', 'Failed to generate detailed prompt for UGC image.');
            }
            finalPromptToUse = promptResult.detailedPrompt;
            detectedGender = promptResult.subjectTerm;
            imageStyle = imageStyle || 'ultra-realistic photograph, UGC style';
            logger.info(`[generateImage User: ${userId}] Detailed prompt generated for command 202. Length: ${finalPromptToUse?.length}`);
        } else if (commandCode === 201) {
             if (!data.scene_description) {
                throw new HttpsError('invalid-argument', "Please describe the scene for the background image.");
             }
             finalPromptToUse = data.scene_description;
             imageStyle = imageStyle || 'photorealistic'; 
            logger.info(`[generateImage User: ${userId}] Using direct prompt for command 201: "${finalPromptToUse}"`);
        } else if (commandCode === 203) {
             if (!data.image_subject) {
                throw new HttpsError('invalid-argument', "Please provide a subject for the image.");
             }
             finalPromptToUse = data.image_subject;
             imageStyle = imageStyle || 'photorealistic';
            logger.info(`[generateImage User: ${userId}] Using direct prompt for command 203: "${finalPromptToUse}"`);
        } else {
            logger.error(`[generateImage User: ${userId}] Unsupported command code: ${commandCode}`);
            throw new HttpsError('invalid-argument', `Unsupported command code (${commandCode}) for direct image generation.`);
        }
        
        logger.info(`[generateImage User: ${userId}] Preparing to call openai.images.generate. Prompt length: ${finalPromptToUse?.length}, Style: ${imageStyle}`);
        if (!openai || !openai.images || typeof openai.images.generate !== 'function') {
            logger.error(`[generateImage User: ${userId}] CRITICAL: openai.images.generate is not a function before calling! typeof openai.images.generate: ${typeof openai.images?.generate}`);
            throw new HttpsError('internal', 'OpenAI images.generate is not available.');
        }

        const imageGenResponse = await openai.images.generate({
            model: "gpt-image-1", 
            prompt: finalPromptToUse,
            n: 1,
            size: "1024x1536",
            quality: "high",
        });
        logger.info(`[generateImage User: ${userId}] openai.images.generate call completed. Response received.`);
        // logger.debug(`[generateImage User: ${userId}] Full imageGenResponse:`, JSON.stringify(imageGenResponse)); // Potentially very verbose

        const base64Data = imageGenResponse.data && imageGenResponse.data.length > 0 ? imageGenResponse.data[0]?.b64_json : null;
        if (!base64Data) {
            logger.error(`[generateImage User: ${userId}] AI response did not contain base64 image data. imageGenResponse.data:`, imageGenResponse.data);
            throw new HttpsError('internal', "AI did not return base64 image data.");
        }
        logger.info(`[generateImage User: ${userId}] Base64 data extracted. Length: ${base64Data.length}`);

        const imageBuffer = Buffer.from(base64Data, 'base64');
        logger.info(`[generateImage User: ${userId}] Image buffer created. Length: ${imageBuffer.length}`);

        const fileName = `direct_generations/${userId}/${Date.now()}_${commandCode}.png`; 
        const file = bucket.file(fileName);
        logger.info(`[generateImage User: ${userId}] Firebase Storage file object created for: ${fileName}. typeof file: ${typeof file}. file is null: ${file === null}`);
        if (!file || typeof file.save !== 'function') {
            logger.error(`[generateImage User: ${userId}] CRITICAL: Firebase Storage file.save is not a function! typeof file.save: ${typeof file?.save}`);
            throw new HttpsError('internal', 'Storage file.save method not available.');
        }

        logger.info(`[generateImage User: ${userId}] Uploading image to Storage: ${fileName}`);
        await file.save(imageBuffer, { metadata: { contentType: 'image/png' }, public: true });
        logger.info(`[generateImage User: ${userId}] file.save call completed for ${fileName}.`);

        const publicUrl = file.publicUrl();
        logger.info(`[generateImage User: ${userId}] Image uploaded successfully. Public URL: ${publicUrl}`);

        // Firestore generations koleksiyonuna kaydet
        try {
            logger.info(`[generateImage User: ${userId}] Attempting to save generation metadata to Firestore.`);
            const generationDocRef = db.collection('users').doc(userId).collection('generations').doc();
            let typeString = 'image';
            if (commandCode === 202) typeString = 'image'; // Note: Command code for UGC was 202 in your definitions
            else if (commandCode === 201) typeString = 'image'; // Note: Command code for Background was 201

            const generationData = {
                userId: userId,
                type: typeString,
                prompt: finalPromptToUse,
                imageStyle: imageStyle,
                imageUrl: publicUrl,
                originalParameters: data,
                commandCode: commandCode,
                quality: "high",
                source: 'direct_generateImage_call',
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                gender: commandCode === 202 ? detectedGender : null
            };
            
            await db.runTransaction(async (transaction) => {
                logger.info(`[generateImage User: ${userId}] Starting Firestore transaction for doc ${generationDocRef.id}.`);
                const userSnapshot = await transaction.get(userRef);
                const creditsInTransaction = parseInt(userSnapshot.data()?.general_credits, 10) || 0;
                if (creditsInTransaction < 90) {
                    logger.warn(`[generateImage User: ${userId}] Insufficient credits in transaction (${creditsInTransaction}). Needed 90.`);
                    throw new HttpsError('resource-exhausted', `Insufficient general credits at time of transaction (needs 90). You have ${creditsInTransaction}.`);
                }
                transaction.update(userRef, { general_credits: admin.firestore.FieldValue.increment(-90) });
                transaction.set(generationDocRef, generationData);
                logger.info(`[generateImage User: ${userId}] Firestore transaction committed for doc ${generationDocRef.id}.`);
            });

            logger.info(`[generateImage User: ${userId}] Successfully wrote to generations collection (ID: ${generationDocRef.id}) and decremented general_credits by 90.`);
            return {
                success: true,
                message: "Image generated and uploaded successfully.",
                imageUrl: publicUrl,
                firestoreDocId: generationDocRef.id,
                finalPrompt: finalPromptToUse,
                originalParameters: data
            };

        } catch (firestoreError) {
            logger.error(`[generateImage User: ${userId}] Failed to write to generations collection or run transaction:`, firestoreError);
            return {
                success: true,
                message: "Image generated, but failed to save metadata to Firestore.",
                imageUrl: publicUrl,
                firestoreDocId: null,
                finalPrompt: finalPromptToUse,
                originalParameters: data,
                errorSavingMetadata: true
            };
        }

    } catch (error) {
        logger.error(`[generateImage User: ${userId}] Error in main try block of generateImage:`, error);
        if (error instanceof OpenAI.APIError) {
            logger.error(`[generateImage User: ${userId} OpenAI API Error]:`, error.status, error.name, error.message, error.headers);
            // Attempt to refund credit if OpenAI API call fails (ensure this logic is sound or remove if problematic)
            // try {
            //     await userRef.update({ image_credit: admin.firestore.FieldValue.increment(1) });
            //     logger.info(`[generateImage User: ${userId}] Image credit potentially refunded due to OpenAI API error.`);
            // } catch (refundError) {
            //     logger.error(`[generateImage User: ${userId}] Failed to refund image credit after OpenAI API error:`, refundError);
            // }
            throw new HttpsError('internal', `OpenAI API Error: ${error.name} - ${error.message}`);
        }
        throw new HttpsError('internal', `Failed to generate image directly: ${error.message}`);
    }
});

// --- NEW: performDirectImageGenerationTask Function (HTTP Triggered by Cloud Task) ---
// exports.performDirectImageGenerationTask = onRequest(...); 
// [Bu fonksiyonun tüm içeriği silinecek]

// --- Video Generation Hooks (Gen Z Style) ---
const videoHooksList = [
  "I'm crying, my little bro asked me to get this when I moved out :')",
  "told my bestie i missed her and she started doing this everyday-",
  "i found the PERFECT app for long distances besties",
  "pov: you found the best way to stay in touch for spring semester",
  "HOWWW did i not know about this >>>",
  "app of the summerrrr >>>",
  "i'm crying my bf is so cute look what he asked to start doing 😭",
  "Life after deleting snap",
  "When your friend group gets a shared calendar app so you actually make plans",
  "pov: you finally delete snap",
  "yo explicándoles a mis amigos que solo tenemos 4 DIAS para descargarnos Yope para a partir del 1 de enero mandarmoa fotos diarias asi al final de año tenemos un recap de todo nuestro 2025",
  "yo diciendole a mis amigos que si nos descargamos Yope, el 1 de enero y mandamos fotos diarias hasta fin de año, vamos a tener una película con la recopilación de nuestro año",
  "yo diciendole a mis amigos que si nos descargamos yope y el 1 de enero armamos un album secreto donde todos los dias agregamos una foto, a fin de año vamos a tener una película con todos nuestros recuerdos del 2025!! <3'",
  "pov: u don't use snap anymore",
  "what's it like without snapchat??",
  "HELP i made out with someone last night and now they just sent me a partiful invite titled \"what are we\"",
  "howww did i not know about this >>>",
  "Pov: you move away from home and ur brother asks to do this together 😅😆",
  "Leaving for college and my mom made the whole family get this :')",
  "normalize sending dramatic invites to your friends for literally anything",
  "You're telling me I've done long distance for two years and I never knew about this???",
  "yall. i think my friend group just started a trend",
  "y si nos descargamos una app para mandar fotos de nuestro día y tenemos una racha juntos? enviar'",
  "Wait STOP bc my friends and I started doing the cutest thing together",
  "madurar es POR FIN borrar Snapchat e instalar esta app en su lugar >>>>",
  "como que puedo mandarle notitas a mi novio directo a su pantalla de bloqueo? 😝❤️'",
  "when you start a new hobby with your bestie>>>",
  "Crying because my mom asked the whole fam to get this together>>😭",
  "When you realise you can put how long you've been together on your Lock Screen!!",
  "hay widgets para contar hace cuantos días estamos juntos, cuantos días faltan para vernos y nuestra distancia 😝",
  "when you don't use snap anymore>>",
  "My long distance boyfriend and I deleted snap and started doing this instead>>",
  "low effort way I stay close with my friend group",
  "pov: your bestfriend made you download this and now it's all you use",
  "me explaining to my friends that we only have 4 DAYS to download Yope and create a group album so that on January 1st we will have a recap of photos from the entire year of 2025 to watch like a movie",
  "HELP, my best friend won't stop sending me invites to talk about her situationship'",
  "Cutest lock screen widget 😍❤️'",
  "la forma más divertida de mantener al día a tus amigos a distancia :)",
  "como que puedo mandarle notitas a la pantalla de bloqueo a mi novio? 😚'",
  "yo cuando me llega la notificación de que estamos por perder la racha pero mi amiga no aparece por ningún lado'",
  "La mejor forma de mantenerte al día con tus amigos :)",
  "i found the PERFECT app for long distance!!!",
  "life without snap >>>",
  "3 señales de que vas a sobrevivir a una relación a distancia <3",
  "y si nos descargamos una app para mandarnos fotos de nuestro día y mantener una racha?'",
  "SHUT UP MY LONG DISTANCE BOYFRIEND IS THE CUTEST EVER😍❤️",
  "remembering how my gf used to send me lockets then seeing them now",
  "luego voy y lo arruino todo diciendo algo tonto como...",
  "Why did nobody tell me my long distance boyfriend could send messages to my lockscreen???'",
  "how life looks when all the girls finally delete snap",
  "You're telling me I didn't know we could put the number of days we've been together on my lockscreen ??'",
  "In literal tears bc my mom and dad asked if we could do this as a family :')",
  "POV: you and your boyfriend delete snap",
  "LITERally EVERYONE needs this with their bffs before college starts 🧠",
  "Life after you delete snap",
  "Ideas de citas a distancia 💕🌍'",
  "... YALL I can't believe my parents wanted to do this with me🤔🙏",
  "f*ck spotify, show me your travel wrapped",
  "pov: you delete snap but still wanna see faces",
  "i'm crying look at what my best friend does every single day 😭",
  "como se ve mi pantalla de bloqueo desde que convencí a mis amigos de descargarnos yope para mantenernos al día:",
  "Over shared about my Situationship to my co workers and he's picking me up from work core'",
  "Pov: you and your bffs make distance so much easier 😢",
  "pov: ur best friend gets you hooked>",
  "Lo que me envía mi novio vs lo que yo le envío'",
  "I'm crying....just moved out and my mom asked if we could do this together😢",
  "End of year raises will be based on performance",
  "captured a wholesome nyc moment today",
  "....okay CRYing bc my mom and dad asked us if we could do this as a family😢",
  "yo con esa amiga con la que tenemos la racha mas alta y nunca la perdimos",
  "Wait STOP bc my long distance boyfriend just asked me to do the cutest thing with him😭🥰❤️",
  "Us thinking long distance would be too hard...",
  "pov: you finally delete snap",
  "pov you have a friend group that constantly updates each other on what we're doing",
  "You and your parents found the cutest way to stay in close 😢😢",
  "why do you always take pictures of everything?",
  "mi novio a distancia me hizo descargar esta app para dejarnos notitas en la pantalla de bloqueo 😳❤️'",
  "i wish i had friends to Interrail Europe with",
  "luego voy y lo arruino todo diciendo algo estupido como...'",
  "long distance is hard but..",
  "la forma más divertida de mantener al día a tus amigos a distancia :)",
  "pov: you're updating your long distance friends in this cute app'",
  "I can't believe my mom had us get this as a family :')",
  "my best friend and i just found the most wholesome app >>>",
  "when you make the dinner reservation'",
  "just found out you can put the number of days you've been together on your lockscreen?!",
  "every day apart is another day closer to reuniting!",
  "POV: your long distance bf made you download this to stay closer",
  "DELETING SNAPCHAT SAVEDDDDD MY RELATIONSHIP 😏",
  "I just got my bf to do this with me for Vday and it was actually so sweet ;",
  "my best friend and i do this everyday>>",
  "My boyfriend figured out how to send messages to my lockscreen whenever we're apart during long distance 😢'",
  "Long distance is hard but not everyone can say that they loved someone deeply enough to be spend lots of days alone in exchange for a few days together. 😢",
  "My long distance boyfriend and I deleted snap and started doing this instead>>",
  "When ur dad doesn't like texting so you tell him to do this instead 😂😂",
  "Dime si te gustaría...'",
  "found the perfect way to stay in touch this summer>>",
  "how life feels when the app you quit your job to build is on the charts at #13 on launch day (above BeReal too!!)",
  "chemistry so good the universe had to make us long distance 😢",
  "2025 ins/outs (social media)",
];

// --- NEW: Runway Video Prompts (Positive, focus on facial expressions, avoid hands) ---
const runwayVideoPrompts = [
    "The person tilts their head slightly to the side with a curious expression, maintaining eye contact with the camera.",
    "The person blinks slowly, then looks down briefly before returning their gaze to the camera.",
    "The person gently nods once in acknowledgment, lips closed in a calm expression.",
    "The person furrows their brows subtly, as if puzzled, then relaxes their face into a neutral expression.",
    "The person closes their eyes for a moment, takes a silent breath, and opens them again with a serene look.",
    "The person tilts their head back slightly and smiles with just their eyes.",
    "The person shifts their weight slightly from one leg to the other while maintaining a steady facial expression.",
    "The person leans forward ever so slightly, as if interested, with a focused look in their eyes.",
    "The person gives a short, subtle shrug with their shoulders while keeping a neutral face.",
    "The person raises their eyebrows slowly, as if in realization, then softens their expression."
  ];;
// --- END: Runway Video Prompts ---

// --- NEW: generateImageForVideo Function --- // RENAMED TO requestImageGeneration
exports.requestImageGeneration = onCall({ region: 'us-central1', timeoutSeconds: 60 }, async (request) => { // Shorter timeout
    // Get user ID via context for callables
    const userId = request.auth?.uid;
    if (!userId) {
        logger.error("requestImageGeneration: Authentication Error.");
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    let generationParams = { ...request.data }; // Make a mutable copy
    let baseImageUrlFromCreator = null;

    // --- NEW: Fetch creator image URL if mentionedCreatorId is present ---
    if (generationParams.mentionedCreatorId) {
        try {
            const creatorRef = db.collection('users').doc(userId).collection('creators').doc(generationParams.mentionedCreatorId);
            const creatorDoc = await creatorRef.get();
            if (creatorDoc.exists && creatorDoc.data().imageUrl) {
                baseImageUrlFromCreator = creatorDoc.data().imageUrl;
                logger.info(`requestImageGeneration: Found creator ${generationParams.mentionedCreatorId} with imageUrl: ${baseImageUrlFromCreator}`);
                // Add this to generationParams so it's passed to the task payload
                generationParams.baseImageUrl = baseImageUrlFromCreator;
            } else {
                logger.warn(`requestImageGeneration: Creator ${generationParams.mentionedCreatorId} not found or has no imageUrl. Proceeding without base image.`);
            }
        } catch (error) {
            logger.error(`requestImageGeneration: Error fetching creator ${generationParams.mentionedCreatorId}:`, error);
            // Proceed without base image if fetch fails
        }
    }
    // --- END NEW ---

    // --- Handle missing subject_description with a random default if NO creator was specified/found ---
    // If a creator was specified (and baseImageUrlFromCreator is set), subject_description might be less critical or constructed differently later.
    if (!baseImageUrlFromCreator && !generationParams.subject_description) {
        const randomSubjectDescriptions = [
             "a redheadwoman 22 y.o, in university, wearing a t-shirt and jeans",
             "a brunette man, muscular, in a car",
             "a young brunette woman, 20s, in a park",
             "a man, 30s, in a home office",
             "a woman blonde, late 20s, in a kitchen, preparing food",
             "a man, around 25, walking on a city street, listening to music",
             "a young woman, 18 y.o, at a beach, smiling at the camera"
        ];
        const randomIndex = Math.floor(Math.random() * randomSubjectDescriptions.length);
        generationParams.subject_description = randomSubjectDescriptions[randomIndex];
        logger.info(`requestImageGeneration: subject_description was missing (and no creator image). Using random default: "${generationParams.subject_description}"`);
    } else if (baseImageUrlFromCreator && !generationParams.subject_description) {
        // If we have a creator image, but no explicit subject_description (e.g. user just said "@creator make video with blue shirt"),
        // we can set a generic one, or rely on the edit prompt to be sufficient.
        // For now, let's ensure it exists for consistency in performImageGenerationTask, even if less used.
        generationParams.subject_description = "person from base image"; 
        logger.info(`requestImageGeneration: Using creator image. Set placeholder subject_description: "${generationParams.subject_description}"`);
    }
  // --- END NEW ---

    // Original check is now implicitly handled by the default assignment above,
    // but we can keep it for explicitness if needed, or remove it.
    // For now, the logic above ensures subject_description will always exist.
    // if (!generationParams || !generationParams.subject_description) {
    //     logger.error("requestImageGeneration: Missing required generation parameters."); // This should not be hit now
    //     throw new HttpsError('invalid-argument', 'Missing required generation parameters.');
    // }

    logger.info(`requestImageGeneration called by user: ${userId} with params:`, generationParams);

    try {
        // --- 1. Create Initial Firestore Record ---
        const postData = {
            userId: userId,
            status: 'image_generation_pending', // Initial status
            initialImageUrl: null, // URL will be added by the task
            generatedImagePrompt: null,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            originalParameters: generationParams // Save original params for the task
        };
        const docRef = await db.collection('users').doc(userId).collection('tiktok-posts').add(postData);
        const firestoreDocId = docRef.id;
        logger.info(`Initial tiktok-post record created with ID: ${firestoreDocId}. Status: image_generation_pending`);

        // --- 2. Enqueue the Image Generation Task ---
        const taskPayload = {
            userId: userId,
            firestoreDocId: firestoreDocId,
            generationParams: generationParams // Pass all received parameters
        };

        const task = {
            httpRequest: {
                httpMethod: 'POST',
                url: imageGenTaskHandlerUrl, // Use the new handler URL
                headers: { 'Content-Type': 'application/json' },
                body: Buffer.from(JSON.stringify(taskPayload)).toString('base64'),
            },
            // Schedule immediately (or with a small delay)
            scheduleTime: {
                seconds: Math.floor(Date.now() / 1000) + 2 // Schedule a few seconds out
            },
        };

        const parent = tasksClient.queuePath(tasksProjectId, tasksLocation, imageGenTasksQueueName); // Use the new queue name
        await tasksClient.createTask({ parent: parent, task: task });
        logger.info(`Image generation task enqueued for doc ${firestoreDocId} to queue ${imageGenTasksQueueName}.`);

        // --- 3. Return Firestore Doc ID Immediately ---
        return {
            success: true,
            message: "Image generation request received.",
            data: {
                firestoreDocId: firestoreDocId
                // DO NOT return imageUrl here, it's not ready yet
            }
        };

    } catch (error) {
        logger.error(`Error in requestImageGeneration for user ${userId}:`, error);
        // Attempt to update Firestore doc if created?
        // For simplicity, just log and throw.
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', `We couldn\'t request the image generation due to an internal error: ${error.message}. Please try again. If the issue persists, our team is working on it.`);
    }
});


// --- handleVideoPollingTask Function (MODIFIED) ---
// --- handleVideoPollingTask Function (MODIFIED) ---
exports.handleVideoPollingTask = onRequest(
    { region: 'us-central1', timeoutSeconds: 300, memory: '1GiB' }, 
    async (request, response) => {
        // Basic security check for Cloud Tasks: Verify the User-Agent header.
        // This is a common way to ensure requests are from Cloud Tasks.
        // You might want to add more robust checks if needed (e.g., OIDC tokens for Gen 2 targets).
        if (!request.headers['user-agent'] || !request.headers['user-agent'].includes('Google-Cloud-Tasks')) {
            logger.warn('handleVideoPollingTask received request not from Google-Cloud-Tasks');
            // response.status(403).send('Forbidden'); // Be cautious with 403 as tasks might retry indefinitely
            // return;
        }

        let payload;
        try {
            if (typeof request.body === 'string') {
                 payload = JSON.parse(request.body);
            } else {
                 payload = request.body;
            }
        } catch (e) {
            logger.error('Failed to parse request body in handleVideoPollingTask:', e, { body: request.body });
            response.status(400).send('Invalid request body.');
            return;
        }

        const { userId, firestoreDocId, runwayTaskId, startTime, attempt = 1 } = payload;
        const MAX_ATTEMPTS = 5; // Max polling attempts for a task if it keeps processing

        if (!userId || !firestoreDocId || !runwayTaskId || !startTime) {
            logger.error('handleVideoPollingTask: Missing required parameters in payload.', payload);
            response.status(400).send('Bad Request: Missing parameters.');
            return;
        }

        const postDocRef = db.collection('users').doc(userId).collection('tiktok-posts').doc(firestoreDocId);

        // Check if polling duration exceeded
        const elapsedTimeSeconds = (Date.now() - startTime) / 1000;
        if (elapsedTimeSeconds > MAX_POLLING_DURATION_SECONDS) {
            logger.warn(`Polling for Runway task ${runwayTaskId} (Doc: ${firestoreDocId}) exceeded max duration. Setting status to timeout.`);
            try {
             await postDocRef.update({
                    status: 'runway_timeout',
                    error: `Polling exceeded ${MAX_POLLING_DURATION_SECONDS / 60} minutes.`,
                 updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (dbError) {
                logger.error(`DB error updating to runway_timeout for ${firestoreDocId}:`, dbError);
            }
            response.status(200).send('Polling timed out, status updated.'); // Ack to prevent task retry
            return;
        }

        try {
            const runwayApiKey = process.env.RUNWAY_API_KEY; // Ensure this is set
            if (!runwayApiKey) {
                logger.error("Runway API key (RUNWAY_API_KEY) is not configured.");
                throw new Error("Runway API key not configured.");
            }

            logger.info(`Polling Runway task ${runwayTaskId} (Doc: ${firestoreDocId}), Attempt: ${attempt}`);
            const runwayResponse = await axios.get(`https://api.dev.runwayml.com/v1/tasks/${runwayTaskId}`, { // URL is already api.dev.runwayml.com
                headers: { 
                    'Authorization': `Bearer ${runwayApiKey}`,
                    'Accept': 'application/json',
                    'X-Runway-Version': '2024-11-06' // RE-ADDED X-Runway-Version header
                }
            });

            const runwayData = runwayResponse.data;
             const runwayStatus = runwayData?.status;

             if (runwayStatus === 'SUCCEEDED') {
                 logger.info(`Runway task ${runwayTaskId} SUCCEEDED (Polled).`);
                const runwayGeneratedVideoUrl = Array.isArray(runwayData.output) && runwayData.output.length > 0 && typeof runwayData.output[0] === 'string' ? runwayData.output[0] : null;
                if (!runwayGeneratedVideoUrl) {
                    logger.error(`Runway task ${runwayTaskId} succeeded but output video URL was missing or invalid.`, { output: runwayData.output });
                    throw new Error('Runway succeeded but output video URL was missing.');
                }
                logger.info(`Found Runway output URL: ${runwayGeneratedVideoUrl} for doc ${firestoreDocId}`);

                const postSnapshot = await postDocRef.get();
                const postData = postSnapshot.data();
                const productUrlToAppend = postData?.productToAppendUrl;
                const productTypeToAppend = postData?.productToAppendType;

                await postDocRef.update({
                    status: 'pending_concatenation', // Still set this, will be processing_concatenation soon
                    runwayVideoUrl: runwayGeneratedVideoUrl,
                    error: null,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                logger.info(`Firestore document ${firestoreDocId} updated with Runway video URL: ${runwayGeneratedVideoUrl}.`); // Modified log

                if (productUrlToAppend && productTypeToAppend) {
                    // MODIFIED: Do not enqueue concatenation. Instead, mark as completed.
                    logger.info(`Product media found for doc ${firestoreDocId}, but concatenation is now bypassed. Marking as complete with Runway video.`);
                    await postDocRef.update({
                        status: 'ready-to-edit',
                        videoUrl: runwayGeneratedVideoUrl, // Final URL is the Runway URL
                        error: null, // Clear any previous error
                        // Optionally, you might want to clear productToAppendUrl/Type here if they are no longer relevant
                        // productToAppendUrl: admin.firestore.FieldValue.delete(),
                        // productToAppendType: admin.firestore.FieldValue.delete(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    response.status(200).send('Runway video ready and marked as complete. Concatenation bypassed.');
                } else {
                    logger.warn(`Runway video generated for doc ${firestoreDocId}, but no product media was specified for appending. Marking as complete.`);
                 await postDocRef.update({
                        status: 'completed', // Directly completed as no concatenation needed
                        videoUrl: runwayGeneratedVideoUrl, // Final URL is the Runway URL
                     error: null,
                     updatedAt: admin.firestore.FieldValue.serverTimestamp()
                 });
                    response.status(200).send('Runway video ready and no product to append. Marked as complete.');
                }
                return; // Important: return after handling SUCCEEDED

             } else if (runwayStatus === 'FAILED') {
                logger.error(`Runway task ${runwayTaskId} FAILED (Polled). Error: ${runwayData?.error || 'Unknown Runway error'}`);
                 await postDocRef.update({
                     status: 'runway_failed',
                    error: runwayData?.error || 'Runway task failed.',
                     updatedAt: admin.firestore.FieldValue.serverTimestamp()
                 });
                response.status(200).send('Runway task failed, status updated.');
                return;
            } else { // Still processing (e.g., 'PROCESSING', 'PENDING')
                if (attempt >= MAX_ATTEMPTS) {
                    logger.warn(`Runway task ${runwayTaskId} (Doc: ${firestoreDocId}) reached max polling attempts (${MAX_ATTEMPTS}) without completion. Setting to timeout.`);
                    await postDocRef.update({
                        status: 'runway_timeout',
                        error: `Reached max polling attempts (${MAX_ATTEMPTS}) without completion.`,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    response.status(200).send('Max polling attempts reached, status updated.');
                    return;
                }

                logger.info(`Runway task ${runwayTaskId} is still ${runwayStatus}. Rescheduling poll.`);
                const nextAttempt = attempt + 1;
                const pollTaskPayload = { userId, firestoreDocId, runwayTaskId, startTime, attempt: nextAttempt }; // Include nextAttempt
                const pollTask = {
                     httpRequest: {
                         httpMethod: 'POST',
                        url: runwayTaskHandlerUrl, // Use the polling handler URL
                         headers: { 'Content-Type': 'application/json' },
                        body: Buffer.from(JSON.stringify(pollTaskPayload)).toString('base64')
                     },
                     scheduleTime: {
                         seconds: Math.floor(Date.now() / 1000) + POLLING_INTERVAL_SECONDS
                     }
                 };
                const parent = tasksClient.queuePath(tasksProjectId, tasksLocation, runwayTasksQueueName); // Use runway polling queue
                await tasksClient.createTask({ parent: parent, task: pollTask });
                response.status(200).send('Task still processing, poll rescheduled.');
                return;
             }
    } catch (error) {
            logger.error(`Error in handleVideoPollingTask for ${firestoreDocId} (Runway Task: ${runwayTaskId}):`, error);
            try {
             await postDocRef.update({
                 status: 'internal_error',
                    error: `Polling task error: ${error.message}`,
                 updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (dbUpdateError) {
                logger.error(`DB error updating to internal_error for ${firestoreDocId}:`, dbUpdateError);
            }
            // It's important to send a 200 OK to Cloud Tasks to prevent retries for non-transient errors.
            // The error is logged, and Firestore is updated.
            response.status(200).send(`Polling task encountered an error: ${error.message}`);
        }
    }
);

exports.generateImageSlideshow = onCall({region: 'us-central1', timeoutSeconds: 540}, async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    // Destructure ALL parameters, including the new language parameter and slideshow type
    const { topic, slide_1_text, slide_2_text, slide_3_text, slide_4_text, background_name, image_style, language, _slideshow_type_context } = request.data;
    const targetLanguage = language || 'en'; // Default to English if not provided
    const slideshowType = _slideshow_type_context || 'learn_grow'; // Default to learn_grow if not provided
    const generationId = Date.now().toString(); // <--- ADDED THIS LINE

    // --- Define Slideshow Type Instructions ---
    const getSlideshowTypeInstruction = (type) => {
        switch (type) {
            case 'safe_secure':
                return `
                SLIDESHOW TYPE: Safe & Secure
                GOAL: Create content that builds trust, comfort, and emotional safety.
        
                STRUCTURE (4 slides total):
                1. Slide 1 : Gentle Hook: A calming or reassuring statement that draws the viewer in (e.g., "Feeling overwhelmed? You're not alone.")
                2. Slide 2 : Empathy or Support: A relatable thought or supportive message (e.g., "Some days are hard. That's okay.")
                3. Slide 3 : Reassuring Insight: Offer a calming perspective, truth, or helpful affirmation (e.g., "You're doing better than you think.")
                4. Slide 4 : Positive Close: End with a peaceful, hopeful note or gentle call to breathe/reflect/feel safe.
        
                TONE: Soft, warm, nurturing, emotionally safe. Avoid fast pacing or intense visuals.
                `;
        
            case 'learn_grow':
                return `
                SLIDESHOW TYPE: Learn & Grow
                GOAL: Deliver bite-sized educational or self-growth content that informs and empowers.
        
                STRUCTURE (4 slides total):
                1. Slide 1 : Knowledge Hook: A question or bold fact to grab attention (e.g., "3 Questions to Ask Before You Sleep")
                2. Slide 2 : Insight #1: Share a clear, concise point or fact
                3. Slide 3 : Insight #2: Continue with another relevant fact, tip, or insight
                4. Slide 4 : Insight #3: Wrap up with the final tip or a short reflective summary
        
                TONE: Clear, informative, motivating. Keep visuals clean and readable. Avoid cluttered slides.
                `;
        
            case 'viral_fun':
                return `
                SLIDESHOW TYPE: Viral & Fun
                GOAL: Entertain and engage with lighthearted, trendy, or humorous content.
        
                STRUCTURE (4 slides total):
                1. Slide 1 : Viral Hook: Something that instantly grabs attention, usually funny, weird, or relatable (e.g., "POV: You finally check your bank account after a night out")
                2. Slide 2 : Escalate: Take the joke or moment a step further (e.g., show the reaction or drama)
                3. Slide 3 : Twist or Punchline: Hit the funniest or most unexpected part
                4. Slide 4 : Meme-y Finish: Add a final comment, reaction, or ending punch (e.g., "I'm never going outside again 💀")
        
                TONE: Playful, relatable, energetic. Visuals should be expressive or use meme culture/style.
                `;
        
            case 'personal_stories':
                return `
                SLIDESHOW TYPE: Personal Stories
                GOAL: Share a real or relatable story that creates emotional resonance.
        
                STRUCTURE (4 slides total):
                1. Slide 1 : Setup: Introduce a situation or emotion to hook the viewer (e.g., "I didn't realize I was burned out until this happened…")
                2. Slide 2 : Build: Give more context or backstory (what was going on, how you felt)
                3. Slide 3 : Turning Point or Realization: Share the key moment, shift, or lesson
                4. Slide 4 : Reflection: Close with an emotional takeaway or thought others can relate to
        
                TONE: Honest, human, emotional. Use first-person voice and authentic imagery or tone.
                `;
        
            default:
                return `
                SLIDESHOW TYPE: Learn & Grow (default)
                Use a 4-slide structure:
                1. Hook with a question or bold idea
                2-4. Deliver 3 short, valuable takeaways or facts
                Aim to educate or inspire curiosity in a simple, direct way.
                `;
        }
    };

    const slideshowTypeInstruction = getSlideshowTypeInstruction(slideshowType);
    logger.info(`[${generationId}] Using slideshow type: ${slideshowType}`);

    // --- Initialize OpenAI Client (as before) ---
    let openai;
    try {
        const apiKey = process.env.OPENAI_KEY;
        if (!apiKey) {
            logger.error("generateImageSlideshow: OpenAI API Key not found.");
            throw new HttpsError('internal', 'OpenAI service configuration error.');
        }
        openai = new OpenAI({ apiKey: apiKey });
    } catch (error) {
        logger.error("generateImageSlideshow: Error initializing OpenAI:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', 'Failed to initialize OpenAI service.');
    }
    // --- End OpenAI Client Initialization ---

    // --- Check User Credits ---
    const userRef = db.collection('users').doc(userId);
    try {
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            throw new HttpsError('not-found', 'User profile not found.');
        }
        const currentCredits = parseInt(userDoc.data()?.general_credits, 10) || 0;
        if (currentCredits <= 0) {
            throw new HttpsError('resource-exhausted', 'Insufficient general credits to generate slideshow.');
        }
    } catch (error) {
        logger.error(`Error fetching user credits for slideshow (user ${userId}):`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', 'Could not verify user credits for slideshow.');
    }
    // --- End Credit Check ---

    let slideTexts = [slide_1_text, slide_2_text, slide_3_text, slide_4_text];
    const providedTextCount = slideTexts.filter(text => text && text.trim() !== '').length;

    try {
        // --- Fetch User Products for Context ---
        let productForTopic = null;
        let productContext = '';
        try {
            const productsSnapshot = await db.collection('users').doc(userId).collection('products').limit(3).get();
                if (!productsSnapshot.empty) {
                    const firstProductDoc = productsSnapshot.docs[0];
                productForTopic = {
                    name: firstProductDoc.data().name || firstProductDoc.data().product_name,
                    description: firstProductDoc.data().description || firstProductDoc.data().product_description
                };
                productContext += "\n\nUser's products for context (use if relevant to the topic):";
                productsSnapshot.forEach(doc => {
                    const p = doc.data();
                    productContext += `\n- ${p.name || p.product_name}: ${p.description || p.product_description}`.substring(0, 150) + "...";
                });
            }
        } catch (productError) {
            logger.warn(`Could not fetch user products for slideshow context for user ${userId}:`, productError);
        }

        // --- Determine the effective topic ---
        let effectiveTopic = topic;
        if (!effectiveTopic) {
            if (productForTopic && productForTopic.name) {
                effectiveTopic = "Create engaging, poetic, or relatable slideshow content that resonates with users and invites comments.";
                logger.info(`No topic provided. Using conceptual topic inspired by product '${productForTopic.name}'.`);
            } else {
                logger.error(`Slideshow generation for user ${userId} failed: No topic and no products found.`);
                throw new HttpsError('failed-precondition', 'Please add a product in Settings or specify a topic for the slideshow.');
            }
        }

        // --- Background Selection Logic ---
        let selectedBackgroundUrl = null;
        let selectedBackgroundImageName = 'none';
        let aiSelectedBackgroundId = null;
        let actualBackgroundUsedForContext = null; // This will hold the chosen BG object (name, desc, id, imageUrl)

            const userBackgroundsSnapshot = await db.collection('users').doc(userId).collection('backgrounds').get();
            const availableBackgrounds = [];
            if (!userBackgroundsSnapshot.empty) {
            userBackgroundsSnapshot.forEach(doc => {
                availableBackgrounds.push({
                    id: doc.id,
                    name: doc.data().name,
                    description: doc.data().description,
                    imageUrl: doc.data().imageUrl
                });
            });
        }

        if (background_name) {
            const foundBg = availableBackgrounds.find(bg => bg.name === background_name);
            if (foundBg) {
                actualBackgroundUsedForContext = foundBg;
                selectedBackgroundUrl = foundBg.imageUrl;
                selectedBackgroundImageName = foundBg.name;
                logger.info(`User specified background: "${background_name}". Found and will be used. URL: ${selectedBackgroundUrl}`);
            } else {
                logger.warn(`User specified background "${background_name}" not found. AI will select from available if any.`);
                // actualBackgroundUsedForContext remains null, AI will select if availableBackgrounds.length > 0
            }
        }

        // --- AI Call for Text Generation and/or Background Selection ---
        const needAiForText = providedTextCount < 4;
        const needAiForBackgroundSelection = !actualBackgroundUsedForContext && availableBackgrounds.length > 0;

        if (needAiForText || needAiForBackgroundSelection) {
            let textGenPrompt;
            let expectedJsonResponseFormat = {
                slide1_text: "string", slide2_text: "string", slide3_text: "string", slide4_text: "string"
            };

            // --- CORE INSTRUCTION BLOCK (REVISED) ---
            const coreTextInstruction = `
                ${slideshowTypeInstruction}

                ${productContext ? 
                `IMPORTANT PRODUCT CONTEXT: ${productContext}
                Your first task is to deeply understand this product context. From this, you MUST derive a general THEME or TOPIC (e.g., if the product is about astrology, the theme is 'astrology'; if it's about Notion templates for students, the theme could be 'student productivity' or 'academic organization').
                DO NOT use the product's specific name, brand, or its exact features in the slide text. Instead, all slide text MUST be about the general THEME you derived.` 
                : 
                `The primary theme for this 4-slide slideshow is: "${effectiveTopic}".`}
                
                Generate text for each of the 4 slides IN ${targetLanguage.toUpperCase()}.
                Each slide's text MUST be short, engaging, and directly reflect the THEME (derived from product context if provided, otherwise from the "${effectiveTopic}").
                The content MUST follow the slideshow type guidelines specified above.
                The tone should be natural, relatable, poetic, or intriguing.
                
                CRITICAL RULES FOR SLIDE TEXT:
                1. MUST NOT be a question of any kind. Do not end with a question mark.
                2. MUST NOT include generic calls to action or conversational phrases (e.g., avoid "Join the conversation", "How do you...", "Find your...", "Discover the...", "Check this out", "Stay tuned").
                3. MUST NOT mention any specific product names, brand names, or detailed product features from the context provided.
                4. MUST be a statement, a short piece of a narrative, an evocative description, or a relatable feeling connected to the derived THEME.
                5. MUST align with the slideshow type guidelines to create the appropriate mood and messaging.

                Focus on making statements, telling a mini-story, or evoking an emotion related to the THEME while following the slideshow type requirements.

                If specific text for some slides is provided below, use that text for those slides and generate text ONLY for the empty/missing slides, ensuring thematic consistency with the DERIVED THEME and adherence to ALL critical rules.
                Provided texts: Slide 1: "${slide_1_text || ''}", Slide 2: "${slide_2_text || ''}", Slide 3: "${slide_3_text || ''}", Slide 4: "${slide_4_text || ''}"
            `;
            // --- END CORE INSTRUCTION BLOCK ---

            if (actualBackgroundUsedForContext) { // Case 1: Background already chosen by user (valid)
                const bgDescForAI = `The chosen background is named \"${actualBackgroundUsedForContext.name}\" (ID: ${actualBackgroundUsedForContext.id}) and described as: \"${actualBackgroundUsedForContext.description || 'No description available'}\". While generating text, ensure it thematically aligns with this background, but DO NOT make the text *about* the background itself. The core theme and product context are paramount.`;
                textGenPrompt = `
                    ${coreTextInstruction}
                    ${bgDescForAI}
                    Return a JSON object like: ${JSON.stringify(expectedJsonResponseFormat)}. Ensure each key has a non-empty string value.`;
            } else if (availableBackgrounds.length > 0) { // Case 2: AI needs to select a background
                logger.info(`AI will select a background from ${availableBackgrounds.length} options.`);
                const backgroundOptionsForAI = availableBackgrounds.map(bg =>
                    `ID: "${bg.id}", Name: "${bg.name}", Description: "${bg.description || 'No description'}"`
                ).join('\n');
                expectedJsonResponseFormat.selected_background_id = "string"; // AI must return this
            
            textGenPrompt = `
                ${coreTextInstruction}

                    Available backgrounds for you to choose from:
                    ${backgroundOptionsForAI}

                    Your tasks:
                    1. From the list above, select the ONE background ID that you think is most thematically suitable for the slideshow's core theme ("${effectiveTopic}") and product context.
                    2. Generate the 4 slide texts according to all instructions above, ensuring they fit your chosen background thematically, but are primarily about the core theme/product.
                    
                    Return a JSON object like: ${JSON.stringify(expectedJsonResponseFormat)}.
                    The "selected_background_id" MUST be one of the IDs from the provided list. Ensure all text keys have non-empty string values.`;
            } else { // Case 3: No specific background chosen by user, and none available for AI to choose.
                logger.warn(`No specific background context for AI, and no backgrounds available for user ${userId}. Generating generic text.`);
                textGenPrompt = `
                    ${coreTextInstruction}
                    No specific background image will be used. Generate text that fits the theme.
                Return a JSON object like: ${JSON.stringify(expectedJsonResponseFormat)}. Ensure each key has a non-empty string value.`;
            }
            
            logger.info(`Invoking AI. NeedText: ${needAiForText}, NeedBGSelect: ${needAiForBackgroundSelection}. Topic: "${effectiveTopic}", Lang: ${targetLanguage}`);
            const completion = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: textGenPrompt }],
                temperature: 0.7,
                response_format: { type: "json_object" },
            });
            const aiResponse = JSON.parse(completion.choices[0].message.content);

            slideTexts = [
                slide_1_text || aiResponse.slide1_text,
                slide_2_text || aiResponse.slide2_text,
                slide_3_text || aiResponse.slide3_text,
                slide_4_text || aiResponse.slide4_text
            ].map(text => text ? text.trim() : 'Generated text placeholder');
            logger.info("Finalized slide texts from AI/user:", slideTexts);

            if (aiResponse.selected_background_id && !actualBackgroundUsedForContext) {
                const chosenBgByAI = availableBackgrounds.find(bg => bg.id === aiResponse.selected_background_id);
                if (chosenBgByAI) {
                    aiSelectedBackgroundId = chosenBgByAI.id; // Store the ID chosen by AI
                    selectedBackgroundUrl = chosenBgByAI.imageUrl;
                    selectedBackgroundImageName = chosenBgByAI.name;
                    actualBackgroundUsedForContext = chosenBgByAI; // Update the context object
                    logger.info(`AI selected background ID: "${aiSelectedBackgroundId}", Name: "${selectedBackgroundImageName}", URL: ${selectedBackgroundUrl}`);
        } else {
                    logger.warn(`AI selected background ID "${aiResponse.selected_background_id}" which was not found in available list. Attempting fallback.`);
                    if (availableBackgrounds.length > 0) {
                        actualBackgroundUsedForContext = availableBackgrounds[0]; // Fallback to first
                        aiSelectedBackgroundId = actualBackgroundUsedForContext.id;
                        selectedBackgroundUrl = actualBackgroundUsedForContext.imageUrl;
                        selectedBackgroundImageName = actualBackgroundUsedForContext.name;
                        logger.info(`Fell back to first available background: ID: "${aiSelectedBackgroundId}", Name: "${selectedBackgroundImageName}"`);
                    } else {
                        logger.warn("No backgrounds available for AI fallback.");
                        // selectedBackgroundUrl remains null, selectedBackgroundImageName 'none'
                    }
                }
            }
        } else {
            logger.info("All texts provided by user, and background (if any) was already determined or none exist. No AI call needed.");
            slideTexts = slideTexts.map(text => text.trim());
            // selectedBackgroundUrl and selectedBackgroundImageName are already set if a valid user choice was made.
            // If user choice was invalid and no BGs, they remain null/'none'.
        }

        if (!selectedBackgroundUrl && availableBackgrounds.length > 0 && !actualBackgroundUsedForContext && !aiSelectedBackgroundId) {
             logger.warn("Final check: No background selected, but backgrounds are available. Using the first one as a last resort.");
             actualBackgroundUsedForContext = availableBackgrounds[0];
             selectedBackgroundUrl = actualBackgroundUsedForContext.imageUrl;
             selectedBackgroundImageName = actualBackgroundUsedForContext.name;
             // Not setting aiSelectedBackgroundId here as it's a true fallback, not an AI choice.
        }


        // --- Render Texts onto Background Images ---
        const processedImageUrls = [];
        if (selectedBackgroundUrl && slideTexts.every(text => text && text.trim() !== '')) {
            logger.info(`[${generationId}] Starting to render ${slideTexts.length} slides onto background: ${selectedBackgroundUrl}`);
            const tempDir = os.tmpdir();
            const backgroundFileName = `background_${generationId}.png`;
            const backgroundFilePath = path.join(tempDir, backgroundFileName);

            try {
                await downloadFile(selectedBackgroundUrl, backgroundFilePath);
                logger.info(`[${generationId}] Background image downloaded to: ${backgroundFilePath}`);

                for (let i = 0; i < slideTexts.length; i++) {
                    const slideText = slideTexts[i];
                    if (!slideText || slideText.trim() === '') {
                        logger.warn(`[${generationId}] Skipping slide ${i + 1} due to empty text.`);
                        processedImageUrls.push(null);
                        continue;
                    }
                    const outputSlideFileName = `slide_${i + 1}_${generationId}.jpg`; // CHANGED to .jpg
                    const outputSlideFilePath = path.join(tempDir, outputSlideFileName);

                    // --- NEW: Smartly split text into lines without breaking words (approx 30 chars) ---
                    let processedSlideText = '';
                    if (slideText) {
                        const words = slideText.split(' ');
                        let currentLine = '';
                        for (const word of words) {
                            if (currentLine === '') {
                                currentLine = word;
                            } else if ((currentLine + ' ' + word).length <= 30) {
                                currentLine += ' ' + word;
            } else {
                                processedSlideText += currentLine + '\n';
                                currentLine = word;
                            }
                        }
                        processedSlideText += currentLine; // Add the last line
                        if (processedSlideText.endsWith('\n')) { // Remove trailing newline if any
                           processedSlideText = processedSlideText.slice(0, -2);
                        }
                    }
                    // --- END NEW ---

                    // Corrected escaping for text that now includes \n:
                    const escapedText = processedSlideText
                        .replace(/\\/g, '\\\\') // Escape actual backslashes first
                        .replace(/%/g, '%%')
                        .replace(/'/g, "\\'")
                        .replace(/:/g, '\\:');
                        // REMOVED: .replace(/\n/g, '\\\\N');

                    // --- REVERTED: fontfile path to a common system path ---
                    const drawTextFilter = `drawtext=text='${escapedText}':fontfile='/usr/share/fonts/truetype/msttcorefonts/Arial.ttf':fontcolor=white:fontsize=50:borderw=2:bordercolor=black@0.7:x=(w-text_w)/2:y=(h-text_h)/2`;

                    await new Promise((resolve, reject) => {
                        ffmpeg(backgroundFilePath)
                            .outputOptions('-y')
                            .videoFilter(drawTextFilter)
                            // .toFormat('jpg') // REMOVED .toFormat('jpg')
                            .outputOptions('-c:v mjpeg') // ADDED explicit MJPEG codec for JPG output
                            .save(outputSlideFilePath) // outputSlideFilePath still ends in .jpg
                            .on('end', () => {
                                logger.info(`[${generationId}] Successfully rendered text for slide ${i + 1} to ${outputSlideFilePath}`);
                                resolve();
                            })
                            .on('error', (err) => {
                                logger.error(`[${generationId}] FFmpeg error rendering slide ${i + 1}:`, err.message, err.stderr);
                                reject(new Error(`FFmpeg error for slide ${i + 1}: ${err.message}`));
                            });
                    });

                    const storagePath = `generations/${userId}/${generationId}/slide_${i + 1}.png`;
                    const [file] = await bucket.upload(outputSlideFilePath, {
                        destination: storagePath,
                        metadata: { contentType: 'image/png' },
                        public: true,
                    });
                    processedImageUrls.push(file.publicUrl());
                    logger.info(`[${generationId}] Uploaded rendered slide ${i + 1} to ${storagePath}. URL: ${file.publicUrl()}`);
                    await fs.unlink(outputSlideFilePath);
                }
            } catch (imgProcessingError) {
                logger.error(`[${generationId}] Error during image processing/upload for slideshow:`, imgProcessingError);
            } finally {
                try {
                    if (await fs.stat(backgroundFilePath).catch(() => false)) { // Check if file exists before unlinking
                       await fs.unlink(backgroundFilePath);
                    }
                } catch (unlinkError) {
                    logger.warn(`[${generationId}] Could not delete temp background file: ${backgroundFilePath}`, unlinkError);
                }
            }
        } else {
            logger.warn(`[${generationId}] Skipping image rendering: Missing background URL or some slide texts are empty.`);
        }
        // --- END Render Texts onto Background Images ---

        // Firestore saving logic
        const generationDocRef = db.collection('users').doc(userId).collection('generations').doc();
        const generationData = {
            userId: userId,
            type: 'slideshow',
            topic: effectiveTopic,
            slideTexts: slideTexts,
            selectedBackgroundUrl: selectedBackgroundUrl || null,
            backgroundImageName: selectedBackgroundImageName, // This now reflects the final chosen name
            userProvidedBackgroundName: background_name || null, // What user originally typed
            aiSelectedBackgroundId: aiSelectedBackgroundId || null, // ID if AI selected it
            imageStyle: image_style || null,
            language: targetLanguage,
            processedImageUrls: processedImageUrls.length > 0 ? processedImageUrls : null,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        };

        // Transaction for saving generation and decrementing credits
        await db.runTransaction(async (transaction) => {
            const userSnapshot = await transaction.get(userRef);
            const currentCredits = parseInt(userSnapshot.data()?.general_credits, 10) || 0;
            if (currentCredits < 50) { // CHECK if enough credits for slideshow
                throw new HttpsError('resource-exhausted', 'Insufficient general credits for slideshow (needs 50).');
            }
            transaction.update(userRef, { general_credits: admin.firestore.FieldValue.increment(-50) }); // DECREMENT by 50
            transaction.set(generationDocRef, generationData);
        });

        logger.info(`Slideshow generation record saved (ID: ${generationDocRef.id}) and general_credits decremented by 50 for user ${userId}.`); // UPDATED LOG
        return { success: true, message: "Slideshow content and images generated successfully.", data: { generationId: generationDocRef.id, slideTexts, selectedBackgroundUrl, processedImageUrls } };

    } catch (error) {
        logger.error(`Error in generateImageSlideshow for user ${userId}:`, error);
        if (error instanceof OpenAI.APIError) {
            logger.error('OpenAI API Error in slideshow:', error.status, error.name, error.message);
            throw new HttpsError('internal', `OpenAI API Error: ${error.name}`);
        }
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', `Failed to generate slideshow: ${error.message}`);
    }
});

exports.editImage = onCall({region: 'us-central1', timeoutSeconds: 540}, async (request) => { // Added timeout
    // ... (editImage function remains the same - Placeholder) ...
    logger.warn("editImage function is not fully implemented.");
    await new Promise(resolve => setTimeout(resolve, 1000));
     return { success: false, message: "Image editing not implemented yet.", data: null };
}); // <-- Ensure semicolon if needed

exports.saveCreatorFromGeneration = onCall({ region: 'us-central1', timeoutSeconds: 180 }, async (request) => { // Increased timeout slightly
    const userId = request.auth?.uid;
    if (!userId) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }
    const { creator_name, imageUrl, original_generation_data } = request.data;
    if (!creator_name || !imageUrl) {
        throw new HttpsError('invalid-argument', 'Missing creator_name or imageUrl.');
    }
    try {
        const creatorData = {
            name: creator_name,
            imageUrl: imageUrl,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            sourceGeneration: original_generation_data || null 
        };
        await db.collection('users').doc(userId).collection('creators').add(creatorData);
        logger.info(`Creator "${creator_name}" saved for user ${userId} from generation.`);
        return { success: true, message: 'Creator saved successfully.' };
    } catch (error) {
        logger.error(`Error saving creator from generation for user ${userId}:`, error);
        throw new HttpsError('internal', 'Failed to save creator.');
    }
});

exports.saveBackgroundFromGeneration = onCall({ region: 'us-central1', timeoutSeconds: 240 }, async (request) => { // Increased timeout for description gen
    const userId = request.auth?.uid;
    if (!userId) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }
    const { background_name, imageUrl, original_generation_data } = request.data;
    if (!background_name || !imageUrl) {
        throw new HttpsError('invalid-argument', 'Missing background_name or imageUrl.');
    }

    let description = 'No description generated.'; // Default description
    try {
        logger.info(`Attempting to generate description for background image: ${imageUrl} for user ${userId}`);
        // Call the generateImageDescription function internally (not as a direct callable from here, but invoke its logic or a helper)
        // For simplicity here, assuming direct OpenAI call or a helper that encapsulates it.
        // This part needs to be robust based on how generateImageDescription is structured if it were a helper.
        // For a direct call if it were a helper:
        // description = await internalGenerateDescriptionHelper(imageUrl);

        // Since generateImageDescription IS a callable, we can't directly await it here without making an HTTP call to itself.
        // Let's simulate calling the core logic of generateImageDescription here.
        let openai_desc_gen;
        try {
            const apiKey = process.env.OPENAI_KEY;
            if (!apiKey) throw new Error('OpenAI key not found for internal description gen.');
            openai_desc_gen = new OpenAI({ apiKey: apiKey });
        } catch (initError) {
            logger.error('Failed to init OpenAI for internal background description:', initError);
            // Proceed without description, or throw if critical
        }

        if (openai_desc_gen) {
            const desc_completion = await openai_desc_gen.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Provide a concise, factual description of this image in 5-10 words. Description:" },
                            { type: "image_url", image_url: { "url": imageUrl, "detail": "low" } }
                        ]
                    }
                ],
                temperature: 0.2,
                max_tokens: 60
            });
            const aiDesc = desc_completion.choices[0]?.message?.content?.trim();
            if (aiDesc) {
                description = aiDesc;
                logger.info(`Internally generated description for background: "${description}"`);
                } else {
                logger.warn(`Internal description generation yielded no content for ${imageUrl}.`);
            }
        }

    } catch (descError) {
        logger.error(`Error generating description internally for background ${imageUrl} for user ${userId}:`, descError);
        // Not throwing an error here, will save background with default description
    }

    try {
        const backgroundData = {
            name: background_name,
            imageUrl: imageUrl,
            description: description, // Add the generated or default description
            isFromLibrary: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            sourceGeneration: original_generation_data || null
        };
        await db.collection('users').doc(userId).collection('backgrounds').add(backgroundData);
        logger.info(`Background "${background_name}" (with description) saved for user ${userId} from generation.`);
        return { success: true, message: 'Background saved successfully with description.' };
    } catch (error) {
        logger.error(`Error saving background from generation for user ${userId}:`, error);
        throw new HttpsError('internal', 'Failed to save background.');
    }
});

// --- NEW: Function to Create Stripe Checkout Session ---
exports.createStripeCheckoutSession = onCall(async (request) => { // Removed secrets option
  const { priceId, userId, userEmail } = request.data;
  let stripe;
  try {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    let stripeCustomerId = userDoc.data()?.stripeCustomerId;

    // Create Stripe customer if not exists
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { firebaseUID: userId }
      });
      stripeCustomerId = customer.id;
      await userRef.set({ stripeCustomerId: stripeCustomerId }, { merge: true });
      logger.info(`Created Stripe customer ${stripeCustomerId} for Firebase user ${userId}`);
    }

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [
        { price: priceId, quantity: 1 },
      ],
      discounts: [{ 
        promotion_code: 'lungolnch25',
      }],
      success_url: process.env.STRIPE_SUCCESS_URL, // Use configured success URL
      cancel_url: process.env.STRIPE_CANCEL_URL,   // Use configured cancel URL
    });

    logger.info(`Created Stripe Checkout session ${session.id} for user ${userId}, customer ${stripeCustomerId} with discount 'lungolnch25'.`); // MODIFIED log message
    // Return the Session ID or URL
    // Using session.id is standard for redirecting with stripe.js
    // If you want to redirect directly from server, use session.url
    return { sessionId: session.id }; 
  } catch (error) {
    logger.error(`Error creating Stripe Checkout session for user ${userId}:`, error);
    throw new HttpsError('internal', `Failed to create checkout session: ${error.message}`);
  }
});


// --- NEW: Function to Create Stripe Billing Portal Session ---
exports.createStripePortalSession = onCall(async (request) => { // Removed secrets option
  const userId = request.auth?.uid; // <-- CORRECTED: Get userId from auth context

  // --- NEW: Check for authenticated user ---
  if (!userId) {
    logger.error("createStripePortalSession: Unauthenticated user attempted to access billing portal.");
    throw new HttpsError('unauthenticated', 'You must be logged in to manage your billing information.');
  }
  // --- END NEW ---

  let stripe;
  try {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const stripeCustomerId = userDoc.data()?.stripeCustomerId;

    if (!stripeCustomerId) {
      logger.warn(`User ${userId} attempted to access billing portal without a Stripe customer ID.`);
      // You could potentially create a customer here if you want non-subscribed users to access the portal,
      // but typically it's for existing subscribers.
      throw new HttpsError('failed-precondition', 'No billing information found for this account.');
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: process.env.STRIPE_PORTAL_RETURN_URL, // Use configured return URL
    });

    logger.info(`Created Stripe Billing Portal session for user ${userId}, customer ${stripeCustomerId}`);
    return { url: portalSession.url }; // Return the portal URL
  } catch (error) {
    logger.error(`Error creating Stripe Portal session for user ${userId}:`, error);
    throw new HttpsError('internal', `Failed to create billing portal session: ${error.message}`);
  }
});

// --- NEW: generateImageDescription Function ---
exports.generateImageDescription = onCall({ region: 'us-central1', timeoutSeconds: 120 }, async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'Authentication required to generate image description.');
  }

  const imageUrl = request.data.imageUrl;
  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing or invalid imageUrl parameter.');
  }

  let openai;
  try {
    const apiKey = process.env.OPENAI_KEY;
    if (!apiKey) {
      logger.error("generateImageDescription: OpenAI API Key not found.");
      throw new HttpsError('internal', 'OpenAI service configuration error for description generation.');
    }
    openai = new OpenAI({ apiKey: apiKey });
  } catch (error) {
    logger.error("generateImageDescription: Error initializing OpenAI:", error);
    throw new HttpsError('internal', 'Failed to initialize OpenAI service for description generation.');
  }

  const prompt = `Provide a concise, factual description of this image in 5-10 words (e.g., 'serene beach at sunset with palm trees', 'modern office desk with laptop and plant'). Focus on key objects and the overall scene. Image URL: ${imageUrl} Description:`;
  
  logger.info(`Generating description for image URL: ${imageUrl} by user ${userId}`);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // or "gpt-4-turbo" if vision capabilities via URL are confirmed for your setup
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Provide a concise, factual description of this image in 5-10 words (e.g., 'serene beach at sunset with palm trees', 'modern office desk with laptop and plant'). Focus on key objects and the overall scene. Description:" },
            { type: "image_url", image_url: { "url": imageUrl, "detail": "low" } }
          ]
        }
      ],
      temperature: 0.2,
      max_tokens: 60
    });

    const description = completion.choices[0]?.message?.content?.trim();

    if (!description) {
      logger.error("AI failed to generate a description for the image.", { imageUrl });
      throw new HttpsError('internal', 'AI could not generate a description for the image.');
    }

    logger.info(`Generated description: "${description}" for image: ${imageUrl}`);
    return { success: true, description: description };

  } catch (error) {
    logger.error(`Error calling OpenAI for image description for ${imageUrl}:`, error);
    if (error instanceof OpenAI.APIError) {
      logger.error('OpenAI API Error for description:', error.status, error.name, error.message);
      throw new HttpsError('internal', `OpenAI API Error generating description: ${error.name}`);
    }
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', `Failed to generate image description: ${error.message}`);
  }
});
// --- End generateImageDescription Function ---

// --- RE-ADD Stripe Webhook Handler ---
exports.stripeWebhookHandler = onRequest(
    { region: 'us-central1', timeoutSeconds: 120, memory: '256MiB' }, // Standard settings
    async (request, response) => {
    // Verify STRIPE_WEBHOOK_SECRET is loaded
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
     if (!webhookSecret) {
        logger.error("Stripe webhook secret not configured (STRIPE_WEBHOOK_SECRET).");
        response.status(500).send("Stripe configuration error (webhook secret).");
        return;
    }

    const sig = request.headers['stripe-signature'];
    let event;
    let stripeInstance; // Define stripeInstance here

    try {
        // Initialize Stripe once here for verification and potential API calls
        const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
        if (!stripeSecretKey) {
            logger.error("Stripe secret key not configured (STRIPE_SECRET_KEY).");
            throw new Error("Stripe secret key configuration error.");
        }
        stripeInstance = require('stripe')(stripeSecretKey);
        
        // Use rawBody for verification
        event = stripeInstance.webhooks.constructEvent(request.rawBody, sig, webhookSecret);
    } catch (error) {
        logger.error("Webhook signature verification or Stripe init failed.", error);
        response.status(400).send(`Webhook Error: ${error.message}`);
        return;
    }

    // Handle the event
    const dataObject = event.data.object; // The Stripe object related to the event
    logger.info(`Received Stripe event: ${event.type}`, { stripeEventId: event.id });

    try {
        switch (event.type) {
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
                // ... (Logic as previously implemented to handle subscription updates and credit grants) ...
                 const subscription = dataObject;
                 const customerId = subscription.customer;
                 const status = subscription.status; // e.g., 'active', 'trialing', 'past_due', 'canceled'
                 const priceId = subscription.items.data[0]?.price.id;
                 const subscriptionId = subscription.id;
                 const endsAtTimestamp = subscription.cancel_at ? admin.firestore.Timestamp.fromDate(new Date(subscription.cancel_at * 1000)) : null;
                 const currentPeriodEndTimestamp = subscription.current_period_end ? admin.firestore.Timestamp.fromDate(new Date(subscription.current_period_end * 1000)) : null;
                 const canceledAtTimestamp = subscription.canceled_at ? admin.firestore.Timestamp.fromDate(new Date(subscription.canceled_at * 1000)) : null;

                 logger.info(`Processing subscription event: ${event.type} for customer: ${customerId}, status: ${status}, priceId: ${priceId}`);
                 const userQuery = await db.collection('users').where('stripeCustomerId', '==', customerId).limit(1).get();

                 if (!userQuery.empty) {
                     const userDocRef = userQuery.docs[0].ref;
                     const updateData = {
                         stripeSubscriptionId: subscriptionId,
                         stripePriceId: priceId,
                         subscriptionStatus: status,
                         subscriptionEndsAt: endsAtTimestamp,
                         subscriptionCurrentPeriodEnd: currentPeriodEndTimestamp,
                         subscriptionCanceledAt: canceledAtTimestamp,
                         subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
                     };

                     // Determine subscription length
                     if (priceId) {
                         try {
                             const priceData = await stripeInstance.prices.retrieve(priceId);
                             updateData.subscriptionLength = priceData?.recurring?.interval === 'year' ? 'yearly' : 'monthly';
                         } catch(priceError) {
                            logger.error(`Error retrieving price ${priceId} for subscription length:`, priceError);
                            updateData.subscriptionLength = null;
                         }
                     } else {
                        updateData.subscriptionLength = null;
                     }

                     // Update Credits Based on Plan 
                     // Only grant/refresh credits if the subscription is truly active and not pending cancellation at period end.
                     if ((status === 'active' || status === 'trialing') && priceId && !dataObject.cancel_at_period_end) {
                         const allocation = planCreditAllocations[priceId] || { general_credits: 0 }; // MODIFIED FALLBACK to general_credits
                         updateData.general_credits = allocation.general_credits; // CHANGED to general_credits
                         updateData.general_credits_limit = allocation.general_credits; // CHANGED to general_credits_limit
                         // REMOVE old specific credit types
                         // updateData.image_credit = allocation.images;
                         // updateData.video_credit = allocation.videos;
                         // updateData.slideshow_credit = allocation.slideshows; 
                         // updateData.image_credit_limit = allocation.images;
                         // updateData.video_credit_limit = allocation.videos;
                         // updateData.slideshow_credit_limit = allocation.slideshows; 
                         logger.info(`Granting/updating general_credits for user ${userDocRef.id} (plan: ${priceId}) because subscription is active and not pending cancellation at period end. Credits: ${allocation.general_credits}`); // UPDATED LOG
                     } else {
                         logger.info(`Subscription for user ${userDocRef.id} (plan: ${priceId}, status: ${status}, cancel_at_period_end: ${dataObject.cancel_at_period_end}) is not eligible for general_credits refresh at this time.`); // UPDATED LOG
                     }
                     // Optional: Add logic here for 'canceled', 'past_due' if needed

                     await userDocRef.set(updateData, { merge: true });
                     logger.info(`Updated Firestore for user ${userDocRef.id} with subscription details. Status: ${status}, Length: ${updateData.subscriptionLength}`);
                 } else {
                     logger.warn(`No user found with Stripe Customer ID: ${customerId} for subscription event.`);
                 }
                break;

            case 'invoice.paid':
                // ... (Logic as previously implemented to handle successful payments) ...
                 const invoice = dataObject;
                 const invoiceCustomerId = invoice.customer;
                 if (invoice.paid && invoiceCustomerId) {
                     logger.info(`Processing successful invoice payment for customer: ${invoiceCustomerId}, invoice ID: ${invoice.id}`);
                     const invoiceUserQuery = await db.collection('users').where('stripeCustomerId', '==', invoiceCustomerId).limit(1).get();
                     if (!invoiceUserQuery.empty) {
                         const userDocRef = invoiceUserQuery.docs[0].ref;
                         const amountPaid = invoice.amount_paid;
                         const currency = invoice.currency;
                         let paymentInterval = null;
                         const subscriptionLineItem = invoice.lines.data.find(item => item.type === 'subscription' && item.price?.recurring?.interval);
                         if (subscriptionLineItem?.price?.recurring?.interval) {
                              paymentInterval = subscriptionLineItem.price.recurring.interval;
                         } else {
                              // Fallback logic if needed (as before)
                         }
                         const zeroDecimalCurrencies = ['jpy', 'vnd', 'krw', 'clp', 'pyg', 'ugx'];
                         const divisor = zeroDecimalCurrencies.includes(currency.toLowerCase()) ? 1 : 100;
                         const convertedAmount = amountPaid / divisor;
                         const paymentUpdateData = {
                             lastPaymentAmount: convertedAmount,
                             lastPaymentCurrency: currency.toUpperCase(),
                             lastPaymentTimestamp: admin.firestore.FieldValue.serverTimestamp(),
                             subscriptionStatus: 'active', // Assume active on payment
                             subscriptionLength: paymentInterval === 'year' ? 'yearly' : (paymentInterval === 'month' ? 'monthly' : null),
                             lastPaymentInterval: paymentInterval
                         };
                         await userDocRef.set(paymentUpdateData, { merge: true });
                         logger.info(`Updated Firestore for user ${userDocRef.id} with payment details: Amount=${convertedAmount} ${paymentUpdateData.lastPaymentCurrency}, Interval=${paymentInterval || 'N/A'}`);
                     } else {
                         logger.warn(`Invoice paid event received, but no user found with Stripe Customer ID: ${invoiceCustomerId}`);
                     }
                 } else {
                      logger.info(`Received invoice event (ID: ${invoice.id}, Paid: ${invoice.paid}) that was not a successful payment or lacked customer ID.`);
                 }
                break;

            // --- NEW CASE FOR DELETED SUBSCRIPTIONS ---    
            case 'customer.subscription.deleted':
                const deletedSubscription = dataObject;
                const deletedCustomerId = deletedSubscription.customer;
                logger.info(`Processing subscription deleted event for customer: ${deletedCustomerId}, subscription: ${deletedSubscription.id}`);

                const deletedUserQuery = await db.collection('users').where('stripeCustomerId', '==', deletedCustomerId).limit(1).get();

                if (!deletedUserQuery.empty) {
                    const userDocRef = deletedUserQuery.docs[0].ref;
                    const deletedUpdateData = {
                        stripeSubscriptionId: null, // Or keep for history?
                        stripePriceId: null,
                        subscriptionStatus: 'deleted', // Set status to deleted
                        subscriptionEndsAt: null, 
                        subscriptionCurrentPeriodEnd: null,
                        subscriptionCanceledAt: deletedSubscription.canceled_at ? admin.firestore.Timestamp.fromDate(new Date(deletedSubscription.canceled_at * 1000)) : null, // Use canceled_at if available
                        subscriptionDeletedAt: admin.firestore.FieldValue.serverTimestamp(), // Add deletion timestamp
                        subscriptionLength: null,
                        general_credits: 0, // Reset credits
                        general_credits_limit: 0, // Reset limits
                        subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
                    };

                    await userDocRef.set(deletedUpdateData, { merge: true });
                    logger.info(`Updated Firestore for user ${userDocRef.id}: Subscription deleted, status set to 'deleted', credits reset.`);
                } else {
                    logger.warn(`Received subscription deleted event, but no user found with Stripe Customer ID: ${deletedCustomerId}`);
                }
                break;
            // --- END NEW CASE ---    

            case 'checkout.session.completed':
                const session = dataObject;
                const sessionCustomerId = session.customer;
                const sessionMetadata = session.metadata;
                
                logger.info(`Processing checkout session completed for customer: ${sessionCustomerId}, session: ${session.id}`);
                
                // Check if this is a one-time credit purchase
                if (sessionMetadata && sessionMetadata.purchaseType === 'one_time_credits') {
                    const userId = sessionMetadata.userId;
                    const creditQuantity = parseInt(sessionMetadata.creditQuantity);
                    
                    if (userId && creditQuantity > 0) {
                        try {
                            const userRef = db.collection('users').doc(userId);
                            const userDoc = await userRef.get();
                            
                            if (userDoc.exists) {
                                const currentCredits = userDoc.data().general_credits || 0;
                                const newCredits = currentCredits + creditQuantity;
                                
                                await userRef.update({
                                    general_credits: newCredits,
                                    lastCreditPurchase: {
                                        amount: creditQuantity,
                                        sessionId: session.id,
                                        timestamp: admin.firestore.FieldValue.serverTimestamp()
                                    }
                                });
                                
                                logger.info(`Added ${creditQuantity} credits to user ${userId}. New total: ${newCredits}`);
                            } else {
                                logger.error(`User ${userId} not found for credit purchase`);
                            }
                        } catch (error) {
                            logger.error(`Error processing credit purchase for user ${userId}:`, error);
                        }
                    } else {
                        logger.error(`Invalid credit purchase data: userId=${userId}, creditQuantity=${creditQuantity}`);
                    }
                } else {
                    logger.info(`Checkout session completed but not a one-time credit purchase: ${session.id}`);
                }
                break;

            default:
                logger.info(`Unhandled Stripe event type: ${event.type}`);
        }
    } catch (error) {
         logger.error('Error processing Stripe webhook event:', { error: error.message, stack: error.stack, eventType: event?.type, eventId: event?.id });
         response.status(500).send('Webhook handler failed');
         return; // Stop execution
    }

    // Return a 200 response to acknowledge receipt of the event
    response.status(200).send('Received');
});
// --- END Stripe Webhook Handler --- 

// --- NEW: Scheduled Function for Monthly Credit Refresh ---
exports.refreshMonthlyCredits = onSchedule(
    { 
        schedule: "every day 00:00", // Runs daily at midnight UTC
        timeZone: "UTC",
        timeoutSeconds: 540, // Allow up to 9 minutes 
        memory: "512MiB" // Moderate memory 
    },
    async (event) => {
        logger.info("Running monthly credit refresh check (v2 logic)...");
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0); // Normalized to start of day UTC

        const usersRef = db.collection('users');
        const activeStatuses = ['active', 'trialing'];
        const querySnapshot = await usersRef
            .where('subscriptionStatus', 'in', activeStatuses)
            .get();

        if (querySnapshot.empty) {
            logger.info("No active/trialing users found to check for credit refresh.");
            return null;
        }

        const batch = db.batch();
        let usersToRefreshCount = 0;

        querySnapshot.forEach(doc => {
            const userData = doc.data();
            const userId = doc.id;
            const priceId = userData.stripePriceId;
            const subscriptionLength = userData.subscriptionLength; // 'monthly' or 'yearly'
            const periodEndTimestamp = userData.subscriptionCurrentPeriodEnd; // End of current period (month or year)
            const lastRefreshTimestamp = userData.lastCreditRefresh; // Timestamp of last refresh

            let needsRefresh = false;
            let logReason = "";

            if (!priceId) {
                logger.warn(`User ${userId} has active status but no priceId. Skipping credit refresh.`);
                return; // continue to next user in forEach
            }
            if (!subscriptionLength) {
                logger.warn(`User ${userId} (PriceID: ${priceId}) has active status but no subscriptionLength. Skipping credit refresh.`);
                return; // continue to next user in forEach
            }

            const allocation = planCreditAllocations[priceId] || { general_credits: 0 };
            if (allocation.general_credits === 0 && priceId) {
                 logger.warn(`User ${userId} (PriceID: ${priceId}) has a plan with 0 credit allocation. Skipping actual credit update, but will update lastRefreshTimestamp if due.`);
            }

            const lastRefreshDate = lastRefreshTimestamp ? lastRefreshTimestamp.toDate() : null;
            if (lastRefreshDate) {
                lastRefreshDate.setUTCHours(0,0,0,0); // Normalize for comparison
            }

            if (subscriptionLength === 'monthly') {
                if (periodEndTimestamp && periodEndTimestamp.toDate) {
                    const monthlyPeriodEndDate = periodEndTimestamp.toDate();
                    monthlyPeriodEndDate.setUTCHours(0, 0, 0, 0);

                    // If period ended today or in the past, they are due for new period's credits.
                    // Also, ensure we haven't already refreshed them today.
                    if (monthlyPeriodEndDate <= today && (!lastRefreshDate || lastRefreshDate.getTime() < today.getTime())) {
                        needsRefresh = true;
                        logReason = `Monthly sub, period ended (${monthlyPeriodEndDate.toISOString().split('T')[0]}) and not refreshed today.`;
                    }
                } else {
                    logger.warn(`User ${userId} (Monthly) missing or invalid subscriptionCurrentPeriodEnd. Cannot determine refresh eligibility.`);
                }
            } else if (subscriptionLength === 'yearly') {
                // For yearly, refresh on the same day of the month as their yearly period end day.
                if (periodEndTimestamp && periodEndTimestamp.toDate) {
                    const yearlyPeriodEndDate = periodEndTimestamp.toDate(); // This is the end of the *yearly* period
                    const refreshDayOfMonth = yearlyPeriodEndDate.getUTCDate(); // Day of the month (1-31) UTC

                    if (today.getUTCDate() === refreshDayOfMonth) {
                        // It's their refresh day of the month.
                        // Now, check if they've already been refreshed this calendar month.
                        const startOfThisUTCMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 0, 0, 0, 0));
                        
                        if (!lastRefreshDate || lastRefreshDate.getTime() < startOfThisUTCMonth.getTime()) {
                            needsRefresh = true;
                            logReason = `Yearly sub, refresh day of month (${refreshDayOfMonth}), and not yet refreshed in month ${today.getUTCMonth() + 1}/${today.getUTCFullYear()}.`;
                        }
                    }
                } else {
                    logger.warn(`User ${userId} (Yearly) missing or invalid subscriptionCurrentPeriodEnd (needed for anchor day). Cannot determine refresh eligibility.`);
                }
            }

            if (needsRefresh) {
                logger.info(`User ${userId} (Plan: ${priceId}, Length: ${subscriptionLength}) marked for credit refresh. Reason: ${logReason}`);
                batch.update(doc.ref, {
                    general_credits: allocation.general_credits,
                    lastCreditRefresh: admin.firestore.Timestamp.now() // Update with server timestamp
                });
                usersToRefreshCount++;
            }
        });

        if (usersToRefreshCount > 0) {
            try {
                await batch.commit();
                logger.info(`Successfully refreshed credits for ${usersToRefreshCount} users.`);
            } catch (error) {
                logger.error("Error committing batch credit refresh updates:", error);
            }
        } else {
            logger.info("No users required credit refresh today based on the updated logic.");
        }

        return null; // Required return for scheduled functions
    }
);
// --- END Scheduled Function ---

// --- NEW: Video Concatenation Function (HTTP Triggered by Cloud Task) ---
exports.performVideoConcatenation = onCall( // MODIFIED from onRequest
    { region: 'us-central1', timeoutSeconds: VIDEO_CONCAT_TIMEOUT_SECONDS, memory: '2GiB' }, 
    async (request) => { // MODIFIED: (request, response) -> (request)
        const ffmpeg = require('fluent-ffmpeg');
        const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
        ffmpeg.setFfmpegPath(ffmpegPath);
        const fsPromises = require('fs').promises; 

        // MODIFIED: Get userId from auth context
        const callingUserId = request.auth?.uid;
        if (!callingUserId) {
            logger.error("performVideoConcatenation: Authentication Error. User not authenticated.");
            throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
        }

        // MODIFIED: Get data from request.data
        const {
            userId, // Keep userId from data for now, but verify against callingUserId
            firestoreDocId,
            runwayVideoUrl,
            productToAppendUrl, 
            productToAppendType, 
        } = request.data;

        // Verification: Ensure the authenticated user matches the userId in the data
        if (callingUserId !== userId) {
            logger.error(`performVideoConcatenation: Authenticated user (${callingUserId}) does not match userId in data (${userId}).`);
            throw new HttpsError('permission-denied', 'Authenticated user does not match the user ID for this operation.');
        }
        
        logger.info("performVideoConcatenation onCall request received for user:", userId, "Data:", request.data);


        if (!userId || !firestoreDocId || !runwayVideoUrl) {
            logger.error("Missing required parameters for video concatenation.", request.data);
            // MODIFIED: Throw HttpsError instead of response.send
            throw new HttpsError('invalid-argument', "Bad Request: Missing userId, firestoreDocId, or runwayVideoUrl.");
        }

        const postDocRef = db.collection('users').doc(userId).collection('tiktok-posts').doc(firestoreDocId);
        const tempDir = path.join('/tmp', `concat_${firestoreDocId}_${Date.now()}`);
        
        let currentVideoPath; 
        let finalVideoToUploadPath; 
        let filesToCleanup = [];
        let postDataForLogging = {};

        try {
            logger.info(`Starting video processing for doc ${firestoreDocId}. Runway Video URL: ${runwayVideoUrl}`);
            await postDocRef.update({
                status: 'processing_concatenation',
                concatenationDetails: 'Starting concatenation process...',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            await fsPromises.mkdir(tempDir, { recursive: true });
            logger.info(`Created temp directory: ${tempDir}`);

            const postSnapshot = await postDocRef.get();
            if (!postSnapshot.exists) {
                throw new Error(`Firestore document ${firestoreDocId} not found.`);
            }
            postDataForLogging = postSnapshot.data();
            const hookText = postDataForLogging?.hookText;

            if (!hookText) {
                logger.warn(`No hookText found for doc ${firestoreDocId}. Proceeding without text overlay.`);
            } else {
                logger.info(`Hook text for doc ${firestoreDocId}: "${hookText}"`);
            }

            const originalRunwayVideoPath = path.join(tempDir, 'runway_video_original.mp4');
            filesToCleanup.push(originalRunwayVideoPath);
            logger.info(`Downloading Runway video from ${runwayVideoUrl} to ${originalRunwayVideoPath}`);
            await downloadFile(runwayVideoUrl, originalRunwayVideoPath);
            logger.info("Runway video downloaded successfully.");
            currentVideoPath = originalRunwayVideoPath;

            if (hookText && hookText.trim() !== '') {
                const runwayVideoWithTextPath = path.join(tempDir, `runway_with_text.mp4`);
                filesToCleanup.push(runwayVideoWithTextPath);
                logger.info(`Attempting to add hook text: "${hookText}" to ${currentVideoPath}`);
                
                let processedHookTextForDrawtext = '';
                    const words = hookText.split(' ');
                    let currentLine = '';
                    for (const word of words) {
                        if (currentLine === '') {
                            currentLine = word;
                        } else if ((currentLine + ' ' + word).length <= 30) {
                            currentLine += ' ' + word;
                        } else {
                        processedHookTextForDrawtext += currentLine + '\n'; 
                            currentLine = word;
                        }
                    }
                processedHookTextForDrawtext += currentLine;
                
                const escapedHookText = processedHookTextForDrawtext
                                        .replace(/\\/g, '\\\\')
                                        .replace(/'/g, "\\\'\\\'")
                                        .replace(/%/g, '\\%')
                                        .replace(/:/g, '\\:')
                                        .replace(/\n/g, '\\\\N');

                try {
                    await new Promise((resolve, reject) => {
                        ffmpeg(currentVideoPath)
                    .videoFilter(
                                `drawtext=text='${escapedHookText}':fontfile=/usr/share/fonts/truetype/msttcorefonts/Arial.ttf:fontcolor=white:fontsize=45:borderw=2:bordercolor=black@0.8:x=(w-text_w)/2:y=(h*0.75-text_h/2)`
                    )
                    .outputOptions([
                                '-c:v', 'libx264',
                                '-preset', 'medium',
                                '-crf', '23',
                                '-c:a', 'aac',
                                '-b:a', '192k',
                                '-ar', '48000'
                            ])
                            .on('start', commandLine => logger.info('FFmpeg drawtext started:', commandLine))
                    .on("error", (err, stdout, stderr) => {
                                logger.error("Error adding hook text:", err.message, {stdout, stderr});
                                reject(new Error(`FFmpeg hook text error: ${err.message}`));
                    })
                    .on("end", () => {
                                logger.info("Hook text added successfully to video.");
                                currentVideoPath = runwayVideoWithTextPath;
                      resolve();
                    })
                            .save(runwayVideoWithTextPath);
                });
                    await postDocRef.update({ concatenationDetails: 'Hook text added.'});
              } catch (textError) {
                    logger.error("Failed to add hook text, proceeding with video as is.", textError);
                    await postDocRef.update({ concatenationDetails: 'Hook text addition failed, proceeding without it.'});
              }
            } else {
                logger.info("No hook text found or hook text is empty, skipping text overlay.");
                await postDocRef.update({ concatenationDetails: 'No hook text provided.'});
            }

            const standardizedRunwayVideoPath = path.join(tempDir, 'runway_standardized.mp4');
            filesToCleanup.push(standardizedRunwayVideoPath);
            logger.info(`Standardizing Runway video from ${currentVideoPath} to ${standardizedRunwayVideoPath}`);
            
            await new Promise((resolve, reject) => {
                ffmpeg(currentVideoPath)
                    .outputOptions([
                        '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1',
                        '-r', '30',
                        '-c:v', 'libx264',
                        '-preset', 'medium',
                        '-crf', '23',
                        '-c:a', 'aac',
                        '-b:a', '192k',
                        '-ar', '48000',
                        '-pix_fmt', 'yuv420p'
                    ])
                    .on('start', commandLine => logger.info('FFmpeg standardization (Runway) started:', commandLine))
                    .on('end', () => { logger.info('Runway video standardized successfully.'); resolve(); })
                    .on('error', (err, stdout, stderr) => {
                        logger.error('Error standardizing Runway video:', err.message, {stdout, stderr});
                        reject(new Error(`Failed to standardize Runway video: ${err.message}`));
                    })
                    .save(standardizedRunwayVideoPath);
            });
            currentVideoPath = standardizedRunwayVideoPath;
            finalVideoToUploadPath = currentVideoPath;
            await postDocRef.update({ concatenationDetails: 'Runway video standardized.'});

            if (productToAppendUrl && productToAppendType === 'video') {
                logger.info(`Product media is a video: ${productToAppendUrl}. Attempting standardization and concatenation.`);
                const originalProductVideoPath = path.join(tempDir, `product_original.${productToAppendUrl.split('.').pop().split('?')[0] || 'mp4'}`);
                const standardizedProductVideoPath = path.join(tempDir, 'product_standardized.mp4');
                const concatenatedVideoPath = path.join(tempDir, 'final_concatenated.mp4');
                filesToCleanup.push(originalProductVideoPath, standardizedProductVideoPath, concatenatedVideoPath);

                try {
                    logger.info(`Downloading product video from ${productToAppendUrl} to ${originalProductVideoPath}`);
                    await downloadFile(productToAppendUrl, originalProductVideoPath);
                    logger.info("Product video downloaded.");
                    await postDocRef.update({ concatenationDetails: 'Runway video standardized. Product video downloaded.'});

                    logger.info(`Standardizing product video: ${originalProductVideoPath} to ${standardizedProductVideoPath}`);
                await new Promise((resolve, reject) => {
                        ffmpeg(originalProductVideoPath)
                            .outputOptions([
                                '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1',
                                '-r', '30',
                                '-c:v', 'libx264',
                                '-preset', 'medium',
                                '-crf', '23',
                                '-c:a', 'aac',
                                '-b:a', '192k',
                                '-ar', '48000',
                                '-pix_fmt', 'yuv420p'
                            ])
                            .on('start', commandLine => logger.info('FFmpeg standardization (Product) started:', commandLine))
                            .on('end', () => { logger.info('Product video standardized successfully.'); resolve(); })
                            .on('error', (err, stdout, stderr) => {
                                logger.error('Error standardizing product video:', err.message, {stdout, stderr});
                                reject(new Error(`Failed to standardize product video: ${err.message}`));
                            })
                            .save(standardizedProductVideoPath);
                    });
                    await postDocRef.update({ concatenationDetails: 'Runway & Product videos standardized.'});

                    logger.info(`Concatenating ${standardizedRunwayVideoPath} and ${standardizedProductVideoPath} into ${concatenatedVideoPath}`);
                    const concatListPath = path.join(tempDir, 'concat_list.txt');
                    filesToCleanup.push(concatListPath);
                    const contentForListFile = `file '${standardizedRunwayVideoPath.replace(/\\/g, '/')}'\nfile '${standardizedProductVideoPath.replace(/\\/g, '/')}'`;
                    await fsPromises.writeFile(concatListPath, contentForListFile);
                    
                    await new Promise((resolve, reject) => {
                        ffmpeg()
                            .input(concatListPath)
                            .inputOptions(['-f', 'concat', '-safe', '0'])
                            .outputOptions(['-c', 'copy'])
                            .on('start', commandLine => logger.info('FFmpeg concatenation (-c copy) started:', commandLine))
                            .on('end', () => { logger.info('Videos concatenated successfully with -c copy.'); resolve(); })
                            .on('error', (err, stdout, stderr) => {
                                logger.error('Error during video concatenation (-c copy):', err.message, {stdout, stderr});
                                logger.info('Retrying concatenation with full re-encode...');
                                ffmpeg()
                                    .input(standardizedRunwayVideoPath)
                                    .input(standardizedProductVideoPath)
                                    .complexFilter('[0:v:0][0:a:0][1:v:0][1:a:0]concat=n=2:v=1:a=1[outv][outa]')
                                    .outputOptions([
                                        '-map', '[outv]', 
                                        '-map', '[outa]',
                                        '-r', '30',
                                        '-c:v', 'libx264',
                                        '-preset', 'medium',
                                        '-crf', '23',
                                        '-c:a', 'aac',
                                        '-b:a', '192k',
                                        '-ar', '48000',
                                        '-pix_fmt', 'yuv420p'
                                    ])
                                    .on('start', cmd => logger.info('FFmpeg re-encode concatenation started:', cmd))
                                    .on('end', () => { logger.info('Videos concatenated successfully with re-encode.'); resolve(); })
                                    .on('error', (reEncodeErr, reEncodeStdout, reEncodeStderr) => {
                                        logger.error('Error during video concatenation (re-encode):', reEncodeErr.message, {reEncodeStdout, reEncodeStderr});
                                        reject(new Error(`Failed to concatenate videos even with re-encode: ${reEncodeErr.message}`));
                                    })
                                    .save(concatenatedVideoPath);
                            })
                            .save(concatenatedVideoPath);
                    });
                    finalVideoToUploadPath = concatenatedVideoPath;
                    await postDocRef.update({ concatenationDetails: 'Runway & Product videos standardized and concatenated.'});

                } catch (productProcessingError) {
                    logger.error(`Error processing product video or during concatenation for doc ${firestoreDocId}:`, productProcessingError);
                    await postDocRef.update({
                        concatenationDetails: `Product video processing/concatenation failed: ${productProcessingError.message}. Using Runway video only.`,
                        concatenationError: `Product video error: ${productProcessingError.message}`
                    });
                    logger.warn(`Falling back to using only the standardized Runway video for doc ${firestoreDocId}.`);
                }
            } else if (productToAppendUrl && productToAppendType === 'image') {
                logger.warn(`Product media for doc ${firestoreDocId} is an image. Image overlay not yet implemented. Using (hooked) standardized Runway video as final.`);
                await postDocRef.update({ concatenationDetails: 'Product is image, using Runway video.'});
            } else {
                logger.info(`No product video to append for doc ${firestoreDocId}. Using (hooked) standardized Runway video as final.`);
                await postDocRef.update({ concatenationDetails: 'No product video, using Runway video.'});
            }

            const finalVideoStoragePath = `users/${userId}/generated_videos/${firestoreDocId}_final_${Date.now()}.mp4`;
            logger.info(`Uploading final video from ${finalVideoToUploadPath} to Storage: ${finalVideoStoragePath}`);
            
            if (!finalVideoToUploadPath || !(await fsPromises.stat(finalVideoToUploadPath).catch(() => false))) {
                 logger.error(`Final output video path is invalid or file does not exist: ${finalVideoToUploadPath}. Current video path was: ${currentVideoPath}`);
                 throw new Error(`Final video file is missing before upload: ${finalVideoToUploadPath}`);
            }

            const [uploadedFile] = await bucket.upload(finalVideoToUploadPath, {
                destination: finalVideoStoragePath,
                metadata: { contentType: 'video/mp4' },
                public: true,
            });
            const finalPublicUrl = uploadedFile.publicUrl();
            logger.info(`Final video uploaded successfully. URL: ${finalPublicUrl}`);

            await postDocRef.update({
                status: 'completed',
                finalVideoUrl: finalPublicUrl,
                concatenationDetails: 'Video processing completed successfully.',
                error: null,
                concatenationError: null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            logger.info(`Firestore document ${firestoreDocId} updated to status 'completed' with finalVideoUrl.`);
            // MODIFIED: Return success object
            return { success: true, message: "Video processing completed successfully.", finalVideoUrl: finalPublicUrl };

        } catch (error) {
            logger.error(`Critical error in performVideoConcatenation for doc ${firestoreDocId}:`, error.message, error.stack);
            try {
                await postDocRef.update({
                    status: 'concatenation_failed',
                    error: `Concatenation process error: ${error.message}`,
                    concatenationDetails: `Failed at: ${postDataForLogging?.concatenationDetails || 'unknown step'}. Error: ${error.message}`,
                    finalVideoUrl: null,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (dbUpdateError) {
                logger.error(`Failed to update Firestore with critical failed status for doc ${firestoreDocId}:`, dbUpdateError);
            }
            // MODIFIED: Throw HttpsError
            throw new HttpsError('internal', `Internal Server Error during video processing: ${error.message}`);
        } finally {
            if (tempDir) {
                logger.info(`Cleaning up temporary files in: ${tempDir}`);
                for (const filePath of filesToCleanup) {
                    await fsPromises.rm(filePath, { force: true, recursive: false }).catch(err => logger.warn(`Error cleaning up temp file ${filePath}:`, err.message));
                }
                await fsPromises.rm(tempDir, { recursive: true, force: true }).catch(err => logger.error(`Error cleaning up temp dir ${tempDir}:`, err.message));
                logger.info("Temp directory cleanup finished.");
            }
        }
    }
);
// --- NEW: performImageGenerationTask Function (HTTP Triggered by Cloud Task) ---
exports.performImageGenerationTask = onRequest(
    { region: 'us-central1', timeoutSeconds: IMAGE_GEN_TIMEOUT_SECONDS, memory: '2GiB' }, // Use new timeout
    async (request, response) => {
        logger.info("performImageGenerationTask request received:", request.body);

        const {
            userId,
            firestoreDocId,
            generationParams // Parameters needed for generation (prompt, style, etc.)
        } = request.body;

        if (!userId || !firestoreDocId || !generationParams) {
            logger.error("performImageGenerationTask: Missing required parameters.", request.body);
            response.status(400).send("Bad Request: Missing parameters.");
            return;
        }

        const postDocRef = db.collection('users').doc(userId).collection('tiktok-posts').doc(firestoreDocId);

        // --- Initialize OpenAI Client ---
        let openai;
        try {
            const apiKey = process.env.OPENAI_KEY;
            if (!apiKey) throw new Error('OpenAI service configuration error.');
            openai = new OpenAI({ apiKey: apiKey });
        } catch (error) {
            logger.error("performImageGenerationTask: Failed to initialize OpenAI service:", error);
            try {
                await postDocRef.update({ status: 'image_gen_failed', error: `OpenAI Init Error: ${error.message}` });
            } catch (dbErr) { logger.error("DB update error on OpenAI init fail:", dbErr); }
            response.status(200).send("OpenAI Init Error"); // Ack task, prevent retry for init error
            return;
        }
        // --- End OpenAI Client Initialization ---

        let initialImageUrl = null; // Storage URL
        let generatedImagePrompt = null;
        let base64DataForUpload = null;
        let generatedFileName = null;
        let detectedSubjectTerm = null; // Initialize detectedSubjectTerm here

        try {
            // Update status to generating
            await postDocRef.update({ status: 'image_generating', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            logger.info(`Status updated to 'image_generating' for doc ${firestoreDocId}`);

            const {
                subject_description, // May be "person from base image" if baseImageUrl is used
                action_description, // General action, less critical if editing specific things
                setting_description, // Crucial for new background if baseImageUrl is used
                character_reaction, // Less critical if editing specific things
                baseImageUrl,       // <<< THIS IS THE KEY PARAMETER FROM CREATOR
                clothing_description, // Crucial for new clothes if baseImageUrl is used
                image_style,        // Can be applied/mentioned in edit prompt
                age,                // Less critical if editing existing person, but can be in prompt
                gender              // Less critical if editing existing person, but can be in prompt
            } = generationParams;

            if (baseImageUrl) {
                // **** Scenario B: baseImageUrl provided - Use openai.images.edit ****
                logger.info(`[Task ${firestoreDocId}] BaseImageUrl: ${baseImageUrl}. Attempting image edit for clothes/background.`);

                // --- NEW: Define arrays needed for random selection during edit ---
                const maleClothingExamples = [
                    "in a well-fitting plain white crew-neck t-shirt and dark wash jeans",
                    "in a classic black v-neck t-shirt and chino pants",
                    "in a light blue button-down shirt (top button undone) and beige shorts",
                    "in a grey Henley shirt with sleeves rolled up and dark jeans",
                    "in a fitted dark grey polo shirt and comfortable trousers",
                    "in a simple black tank top (showing athletic arms) and casual shorts",
                    "in an open casual flannel shirt (red and black plaid) over a plain white t-shirt and ripped black jeans",
                    "in a comfortable charcoal knit sweater and dark chino pants",
                    "in a stylish black bomber jacket over a grey t-shirt and slim-fit black jeans",
                    "in a modern athletic zip-up hoodie (navy blue) and grey jogger pants",
                    "in a tailored light grey linen shirt (casually untucked) and white cuffed shorts",
                    "in a black turtleneck sweater and smart grey wool trousers",
                    "in a denim jacket over a striped t-shirt and black jeans",
                    "in a relaxed-fit olive green utility shirt and cargo pants",
                    "in a cream-colored cable-knit cardigan over a chambray shirt and brown corduroy pants",
                    "in a fitted black leather jacket, white graphic tee, and dark distressed jeans",
                    "in a modern navy blue Harrington jacket, a simple white long-sleeve top, and stone-colored chinos",
                    "in a light-wash denim shirt (worn open) over a black muscle-fit tank top and black skinny jeans",
                    "in a burgundy short-sleeve button-up shirt with a subtle print and tailored navy shorts",
                    "in an oversized neutral-toned hoodie, slightly distressed light-wash jeans, and clean white sneakers (implied)"
                ];
                const femaleClothingExamples = [
                    "in a black backless crop top highlighting cleavage",
                    "in a white halter neck top showing shoulders and subtle cleavage",
                    "in a red asymmetric one-shoulder top with a plunging neckline",
                    "in a sheer black mesh top over a visible bralette showing cleavage",
                    "in a structured navy blue corset top with bust-enhancing design, paired with jeans",
                    "in a charcoal twist-front crop top that subtly reveals cleavage",
                    "in a grey long sleeve top with bust-level cut-out details",
                    "in a white tie-front blouse revealing a hint of cleavage",
                    "in a black tube top (bandeau style) with chest exposure",
                    "in an oversized sleeveless knitted top in off-black with visible neckline",
                    "in a satin cowl neck top in pearl grey, softly draping around the chest",
                    "in a fitted 90s-style baby tee in off-white, slightly low-cut",
                    "in a bralette top with matching mini shrug in graphite grey, showing cleavage",
                    "in a layered sheer mesh long sleeve top in black over a low-cut bra",
                    "in a puff sleeve off-the-shoulder top in soft white with romantic cleavage reveal",
                    "in a wrap crop top tied at the side in deep red, exposing bust line",
                    "in a ribbed tank top in charcoal with modest chest exposure"
                    // ... Add more diverse and SFW examples as needed, aligning with generateDetailedUgcPrompt list
                ];
                const settingExamples = [
                    "Seated at a cozy, modern café — sunlight pouring through large windows, sitting at a wooden table with a coffee cup, plants and minimal decor around.",
                    "Leaning against a brick wall on a quiet city street during golden hour, with soft lighting and subtle street activity in the background.",
                    "Standing inside a bright loft-style studio apartment — large windows, natural shadows, a few plants, and a clean, minimalist setup.",
                    "Relaxing in a well-decorated living room — aesthetic furniture, wall art, and a few indoor plants creating a warm, homey vibe.",
                    "Sitting on a park bench near a fountain in a public park — trees in the background, casual people walking by, a peaceful urban setting.",
                    "Standing in front of a clean, white indoor backdrop — neutral tones to keep the focus on the subject, ideal for a minimal profile shot.",
                    "Browsing inside a cozy local bookstore — surrounded by warm lighting and tall bookshelves filled with colorful covers.",
                    "Walking through a university campus — classic architecture in the background, paved walkways, and scattered groups of students nearby.",
                    "Standing at the entrance of a small art gallery — framed artworks visible behind glass doors, warm indoor lighting spilling outside.",
                    "Waiting at a tram stop or bus station in the city — realistic urban elements like maps, benches, and subtle motion in the background.",
                    "Sitting on a bench in a park — trees in the background, casual people walking by, a peaceful urban setting."
                ];
                // --- END NEW ---

                let imageBufferFromUrl;
                try {
                    const downloadResponse = await axios.get(baseImageUrl, { responseType: 'arraybuffer' });
                    imageBufferFromUrl = Buffer.from(downloadResponse.data);
                    logger.info(`[Task ${firestoreDocId}] Downloaded baseImageUrl (${baseImageUrl}). Size: ${imageBufferFromUrl.length} bytes.`);
                } catch (downloadError) {
                    logger.error(`[Task ${firestoreDocId}] Failed to download baseImageUrl (${baseImageUrl}):`, downloadError.message);
                    throw new Error(`Failed to download baseImage for editing: ${downloadError.message}`);
                }

                const imageForEdit = await toFile(
                    imageBufferFromUrl, 
                    'source_image.png',
                    { type: 'image/png' }
                );
                logger.info('Prepared downloaded image for SDK, explicitly setting type to image/png.');

                // Determine clothing and setting, using user inputs or random selections
                const genderForClothing = generationParams.gender ? generationParams.gender.toLowerCase() : 'woman'; // Default to woman if not specified
                let clothingToUse = generationParams.clothing_description;
                if (!clothingToUse) {
                    if (genderForClothing === 'man') {
                        clothingToUse = maleClothingExamples[Math.floor(Math.random() * maleClothingExamples.length)];
                    } else {
                        clothingToUse = femaleClothingExamples[Math.floor(Math.random() * femaleClothingExamples.length)];
                    }
                    logger.info(`[Task ${firestoreDocId}] User did not provide clothing_description. Randomly selected (gender: ${genderForClothing}): "${clothingToUse}"`);
                }

                let settingToUse = generationParams.setting_description;
                if (!settingToUse) {
                    settingToUse = settingExamples[Math.floor(Math.random() * settingExamples.length)];
                    logger.info(`[Task ${firestoreDocId}] User did not provide setting_description. Randomly selected: "${settingToUse}"`);
                }
                
                const finalImageStyle = generationParams.image_style || 'ultra-realistic photograph, modern influencer aesthetic, sharp focus, natural lighting';

                let pronoun = 'their';
                let possessivePronoun = 'their';
                if (generationParams.gender) {
                    if (generationParams.gender.toLowerCase() === 'woman') {
                        pronoun = 'her';
                        possessivePronoun = 'her';
                    } else if (generationParams.gender.toLowerCase() === 'man') {
                        pronoun = 'him';
                        possessivePronoun = 'his';
                    }
                }

                // Construct the new detailed prompt for images.edit
                generatedImagePrompt = `This image depicts a highly detailed, AI-generated person. This is not a real individual.
Please change ${possessivePronoun} clothing to: "${clothingToUse}".
And place ${pronoun} in the following background setting: "${settingToUse}".

It is important to maintain ${possessivePronoun} original facial features, hairstyle, body shape, and general pose as seen in the input image. Only the outfit and background should be adjusted. The core appearance of the subject should remain consistent.

The visual style of the final image should be: "${finalImageStyle}".
- The full image, including the subject and background, should be rendered in sharp focus. Please avoid depth-of-field blur, artificial bokeh, or low-detail areas.
- Lighting should appear natural and dynamic, matching the characteristics of '${settingToUse}'. Please reflect realistic light direction, softness or hardness, and an appropriate color temperature.
- The final image should resemble a high-quality modern smartphone photo, with balanced natural colors, soft digital texture, and subtle detail in both highlights and shadows.
- Apply cinematic-style color grading with moderate contrast and realistic tones.

Please ensure the subject's identity — including their face, hair, expression, and pose — is preserved clearly and accurately.`;
                
                logger.info(`[Task ${firestoreDocId}] Using new detailed prompt for images.edit: "${generatedImagePrompt}"`);

                try {
                    const editResponse = await openai.images.edit({
                        model: "gpt-image-1", // DALL-E 3 for edits
                        image: imageForEdit,
                        prompt: generatedImagePrompt,
                        n: 1,
                        size: "1024x1536", 
                    });
                    base64DataForUpload = editResponse.data?.[0]?.b64_json;
                    if (!base64DataForUpload) {
                        logger.error(`[Task ${firestoreDocId}] images.edit no b64 data. Prompt: "${generatedImagePrompt}"`);
                        throw new Error("Image edit operation (images.edit) did not return base64 data.");
                    }
                    logger.info(`[Task ${firestoreDocId}] Image edit successful using images.edit.`);
                    generatedFileName = `video_inputs/${userId}/${firestoreDocId}_edited_creator.png`;
                } catch (editError) {
                    let errMsg = editError.message;
                    if (editError.response?.data?.error?.message) {
                        errMsg = `OpenAI API Error (images.edit): ${editError.response.data.error.message}`;
                        logger.error(`[Task ${firestoreDocId}] OpenAI API Error (images.edit):`, JSON.stringify(editError.response.data.error));
                    } else {
                        logger.error(`[Task ${firestoreDocId}] Error calling images.edit:`, editError);
                    }
                    throw new Error(errMsg);
                }
            } else {
                // **** Scenario A: No baseImageUrl - Generate new image using detailed prompt ****
                logger.info(`[Task ${firestoreDocId}] No baseImageUrl. Generating new image with detailed prompt.`);
                // Ensure subject_description is present for new image generation
                if (!subject_description) {
                    logger.error(`[Task ${firestoreDocId}] subject_description is missing for new image generation (no baseImage).`);
                    throw new Error("Cannot generate new image without subject_description when no base image is provided.");
                }
                
                // Call generateDetailedUgcPrompt and destructure its result
                const promptResult = await generateDetailedUgcPrompt(
                    {
                        subject_description,
                        clothing: clothing_description, // Pass clothing_description here as well
                        setting: setting_description,   // Pass setting_description here as well
                        style: image_style, age, gender,
                        commandCode: generationParams.commandCode // Pass commandCode for context if needed by prompt gen
                    },
                    openai
                );
                generatedImagePrompt = promptResult.detailedPrompt; // Get the string prompt
                detectedSubjectTerm = promptResult.subjectTerm; // Assign value in Scenario A

                logger.info(`[Task ${firestoreDocId}] Generating image with detailed prompt: "${generatedImagePrompt}" (Subject Term: ${detectedSubjectTerm})`);
                
                const imageResponseA = await openai.images.generate({
                    model: "gpt-image-1", prompt: generatedImagePrompt, n: 1,
                    size: "1024x1536", quality: "high",
                });
                base64DataForUpload = imageResponseA.data?.[0]?.b64_json;
                if (!base64DataForUpload) {
                    logger.error(`[Task ${firestoreDocId}] gpt-image-1 (detailed) no b64 data. Prompt: "${generatedImagePrompt}"`);
                    throw new Error("gpt-image-1 (detailed prompt) did not return base64 image data.");
                }
                generatedFileName = `video_inputs/${userId}/${firestoreDocId}_initial_new.png`;
            }

            const imageBufferToUpload = Buffer.from(base64DataForUpload, 'base64');
            const file = bucket.file(generatedFileName);
            logger.info(`[Task ${firestoreDocId}] Uploading to Storage: ${generatedFileName}`);
            await file.save(imageBufferToUpload, { metadata: { contentType: 'image/png' }, public: true });
            initialImageUrl = file.publicUrl();
            logger.info(`[Task ${firestoreDocId}] Uploaded. URL: ${initialImageUrl}`);

            await postDocRef.update({
                status: 'image_generated', initialImageUrl, 
                generatedImagePrompt: generatedImagePrompt, // Ensure this is the string prompt
                subjectTerm: detectedSubjectTerm, // Store the detected subject term
                updatedAt: admin.firestore.FieldValue.serverTimestamp(), error: null
            });
            logger.info(`[Task ${firestoreDocId}] Firestore updated: 'image_generated'.`);

            const pipelineTaskPayload = { userId, firestoreDocId };
            const task = {
                httpRequest: {
                    httpMethod: 'POST', url: videoPipelineTaskHandlerUrl,
                    headers: { 'Content-Type': 'application/json' },
                    body: Buffer.from(JSON.stringify(pipelineTaskPayload)).toString('base64'),
                },
                scheduleTime: { seconds: Math.floor(Date.now() / 1000) + 5 },
            };
            const parent = tasksClient.queuePath(tasksProjectId, tasksLocation, videoPipelineTasksQueueName);
            await tasksClient.createTask({ parent, task });
            logger.info(`[Task ${firestoreDocId}] Video pipeline task enqueued to ${videoPipelineTasksQueueName}.`);

            response.status(200).send("Image generation successful. Video pipeline task enqueued.");

        } catch (error) {
            const errorMessage = error.message || 'Unknown image gen error';
            logger.error(`[Task ${firestoreDocId}] Overall error in performImageGenerationTask: ${errorMessage}`, error);
            try {
                await postDocRef.update({
                    status: 'image_gen_failed', error: errorMessage,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (dbUpdateError) {
                logger.error(`[Task ${firestoreDocId}] DB update error on overall fail:`, dbUpdateError);
            }
            response.status(200).send(`Image Generation Error: ${errorMessage}`);
        }
    }
);

// --- NEW: startVideoPipeline Function (HTTP Triggered by Cloud Task) ---
exports.startVideoPipeline = onRequest(
    { region: 'us-central1', timeoutSeconds: VIDEO_PIPELINE_TIMEOUT_SECONDS, memory: '1GiB' }, 
    async (request, response) => {
        logger.info("startVideoPipeline request received:", request.body);

        const { userId, firestoreDocId } = request.body;

        if (!userId || !firestoreDocId) {
            logger.error('startVideoPipeline: Missing userId or firestoreDocId in task payload.', request.body);
            response.status(400).send('Bad Request: Missing userId or firestoreDocId.');
            return;
        }

        const userRef = db.collection('users').doc(userId);
        const postDocRef = userRef.collection('tiktok-posts').doc(firestoreDocId);

        try { // Main try block for the entire function logic
            const docSnapshot = await postDocRef.get();
            if (!docSnapshot.exists) {
                logger.error(`[${firestoreDocId}] Firestore document not found in startVideoPipeline.`);
                response.status(200).send(`Document ${firestoreDocId} not found.`); // Ack task, no retry
                return;
            }
            const postData = docSnapshot.data();
            const initialImageUrl = postData.initialImageUrl;
            const originalParameters = postData.originalParameters || {}; // hook_text, language, descriptions are here

            if (!initialImageUrl) {
                logger.error(`[${firestoreDocId}] initialImageUrl is missing in startVideoPipeline. This indicates an issue upstream.`);
                await postDocRef.update({ status: 'pipeline_error_no_image', error: 'Initial image URL was missing when video pipeline was triggered.'});
                response.status(200).send('Critical Error: Initial image URL missing.'); // Ack task, no retry
                return;
            }

            logger.info(`Starting video pipeline for user: ${userId}, doc: ${firestoreDocId}. Image: ${initialImageUrl}`);

            // --- 1. Fetch User Products (Logic from original triggerVideoGenerationAndHook) ---
            let selectedProduct = null;
            let productToUseForAppending = { // NEW: Object to hold product details for appending
                url: null,
                type: null,
                isStandardized: false,
                originalUrl: null
            };
            try {
                const productsRef = db.collection('users').doc(userId).collection('products');
                const productsSnapshot = await productsRef.limit(1).get(); // Get only the first one
                if (!productsSnapshot.empty) {
                    const productDoc = productsSnapshot.docs[0];
                    const productData = productDoc.data();
                    selectedProduct = { // Keep selectedProduct for hook text generation context for now
                        id: productDoc.id,
                        name: productData.name || productData.product_name,
                        description: productData.description || productData.product_description,
                        // mediaUrl, mediaType, standardizedVideoUrl, isVideoStandardized are now in productData
                    };

                    const originalMediaUrl = productData.mediaUrl;
                    productToUseForAppending.originalUrl = originalMediaUrl; // Store original URL

                    if (productData.isVideoStandardized && productData.standardizedVideoUrl) {
                        productToUseForAppending.url = productData.standardizedVideoUrl;
                        productToUseForAppending.isStandardized = true;
                        logger.info(`Using standardized product video for appending: ${productData.standardizedVideoUrl}`);
                    } else if (originalMediaUrl) {
                        productToUseForAppending.url = originalMediaUrl; // Fallback to original if not standardized
                        productToUseForAppending.isStandardized = false;
                        logger.warn(`Product video for ${productDoc.id} is not standardized or standardized URL is missing. Falling back to original: ${originalMediaUrl}`);
                    } else {
                        logger.warn(`Selected product ${productDoc.id} for user ${userId} is missing any mediaUrl. Cannot append.`);
                        // productToUseForAppending.url will remain null
                    }
                    // Determine type based on the URL that will be used (standardized or original)
                    if (productToUseForAppending.url) {
                         productToUseForAppending.type = productData.mediaType || (productToUseForAppending.url.includes('.mp4') || productToUseForAppending.url.includes('.mov') ? 'video' : 'image');
                    }

                    logger.info(`Selected product ${selectedProduct?.id} for appending to video ${firestoreDocId}. URL to use: ${productToUseForAppending.url}, Type: ${productToUseForAppending.type}, Standardized: ${productToUseForAppending.isStandardized}`);
                } else {
                    logger.warn(`User ${userId} has no products defined. Cannot append product media to video ${firestoreDocId}.`);
                    // Proceed without appending
                }
            } catch (error) {
                logger.error(`Error fetching products for user ${userId} in startVideoPipeline:`, error);
                // Proceed without appending, don't throw error for this
                // productToUseForAppending remains with null url
            }
            // --- End Fetch User Products --- 

            // --- 2. Generate Hook Text (Logic from original triggerVideoGenerationAndHook) ---
            let openai;
            try {
                const apiKey = process.env.OPENAI_KEY;
                if (!apiKey) {
                    throw new HttpsError('internal', 'OpenAI API Key not configured for hook generation.');
                }
                openai = new OpenAI({ apiKey: apiKey });
            } catch (initError) { // Catch OpenAI initialization error specifically
                logger.error("Error initializing OpenAI for hook text in startVideoPipeline:", initError);
                await postDocRef.update({ status: 'pipeline_error_openai_init', error: `OpenAI Init Error for hook: ${initError.message}` });
                response.status(200).send('OpenAI initialization failed for hook text.'); // Ack task
                return; 
            }

            let finalHookText = originalParameters.hook_text; // Get from original params stored in Firestore
            const language = originalParameters.language || 'en';

            if (!finalHookText) {
                try {
                    let productContext = '';
                    if (selectedProduct && selectedProduct.name && selectedProduct.description) {
                        productContext = `\n\nConsider this product: ${selectedProduct.name}: ${selectedProduct.description.substring(0,150)}...\n`;
                    }
                    
                    // Format the entire list of examples
                    const exampleHooks = videoHooksList.map(hook => `- "${hook}"`).join("\n");

                    const hookPrompt = `Generate ONE very short, catchy hook text (under 10 words) suitable for a TikTok video intro, in ${language}.
product context is that, don't mention it in the hook, write hook like example hooks:
${productContext}

Style Reference (Use these ONLY for understanding the desired tone and style. DO NOT copy them directly. Your output must be relevant to the video description above):
${exampleHooks}

Generate the hook text now. Output ONLY the text itself, no quotes or labels.`;

                    const completion = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: hookPrompt }], temperature: 0.8, max_tokens: 30 });
                    finalHookText = completion.choices[0]?.message?.content?.trim().replace(/"/g, '');
                    if (!finalHookText) { 
                        logger.warn("GPT-4o-mini failed to generate hook, using default."); 
                        finalHookText = "Check this out!"; 
                    }
                } catch (hookError) { 
                    logger.error("Error generating hook text in startVideoPipeline:", hookError); 
                    finalHookText = "Check this out!"; // Default on error
                }
            }

            // --- 3. Call RunwayML (Logic from original triggerVideoGenerationAndHook) ---
            let runwayTaskId;
            try {
                const runwayApiKey = process.env.RUNWAY_KEY;
                if (!runwayApiKey) { throw new HttpsError('internal', 'Runway API key not configured.'); }
                
                const videoPrompt = runwayVideoPrompts[Math.floor(Math.random() * runwayVideoPrompts.length)];
                const runwayApiEndpoint = "https://api.dev.runwayml.com/v1/image_to_video";
                const requestBody = {
                    model: "gen4_turbo", promptImage: initialImageUrl, promptText: videoPrompt, 
                    seed: Math.floor(Math.random() * 1000000), duration: 5, ratio: "720:1280", motion: 4
                };
                const runwayResponse = await axios.post(runwayApiEndpoint, requestBody, {
                    headers: { 'Authorization': `Bearer ${runwayApiKey}`, 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Runway-Version': '2024-11-06' }
                });
                runwayTaskId = runwayResponse.data?.uuid || runwayResponse.data?.task_id || runwayResponse.data?.id;
                if (!runwayTaskId) { throw new HttpsError('internal', 'RunwayML API response did not contain a recognizable task ID.'); }
                logger.info(`RunwayML task submitted. Task ID: ${runwayTaskId} for doc ${firestoreDocId}`);
            } catch (runwayError) {
                const errorMessage = runwayError.response?.data?.error || (runwayError instanceof HttpsError ? runwayError.message : 'Failed to submit to RunwayML.');
                logger.error(`Error calling RunwayML API for doc ${firestoreDocId} in startVideoPipeline: ${errorMessage}`, runwayError.response?.data);
                await postDocRef.update({ status: 'runway_submission_failed', error: `RunwayML Error: ${errorMessage}`, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                response.status(200).send(`Runway submission failed: ${errorMessage}`); // Ack task
                return;
            }

            // --- 4. Update Firestore (Video Credit Check + Polling Info) & Schedule Poll (Logic from original triggerVideoGenerationAndHook) ---
            const startTime = Date.now();
            const updatePayload = {
                status: 'processing', // Video is now processing with Runway
                hookText: finalHookText, 
                runwayTaskId: runwayTaskId, 
                pollingStartTime: startTime,
                // MODIFIED: Use details from productToUseForAppending
                productToAppendUrl: productToUseForAppending.url, 
                productToAppendType: productToUseForAppending.type,
                isProductToAppendStandardized: productToUseForAppending.isStandardized,
                originalProductMediaUrl: productToUseForAppending.originalUrl, // Store original for reference/fallback
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            
            await db.runTransaction(async (transaction) => {
                const userSnapshot = await transaction.get(userRef);
                const currentCredits = parseInt(userSnapshot.data()?.general_credits, 10) || 0; // MODIFIED to general_credits
                if (currentCredits < 175) { // MODIFIED to 175
                    // This specific HttpsError will be caught by the main try-catch block
                    throw new HttpsError('resource-exhausted', 'Insufficient general credits for video generation (needs 175).'); // MODIFIED message
                }
                transaction.update(postDocRef, updatePayload);
                transaction.update(userRef, { general_credits: admin.firestore.FieldValue.increment(-175) }); // MODIFIED to general_credits and -175
            });
            logger.info(`Transaction successful: Updated tiktok-post ${firestoreDocId} (status, hook, runwayId, product) & decremented general_credits by 175.`); // MODIFIED log

            const pollTaskPayload = { userId, firestoreDocId, runwayTaskId, startTime, attempt: 1 };
            const task = {
                httpRequest: { httpMethod: 'POST', url: runwayTaskHandlerUrl, headers: { 'Content-Type': 'application/json' }, body: Buffer.from(JSON.stringify(pollTaskPayload)).toString('base64') },
                scheduleTime: { seconds: Math.floor(Date.now() / 1000) + POLLING_INTERVAL_SECONDS },
            };
            const parent = tasksClient.queuePath(tasksProjectId, tasksLocation, runwayTasksQueueName);
            await tasksClient.createTask({ parent: parent, task: task });
            logger.info(`Runway polling task enqueued for doc ${firestoreDocId} (Runway Task ID: ${runwayTaskId}).`);

            response.status(200).send('Video pipeline initiated and Runway polling task scheduled.');

        } catch (error) { // Main catch for the entire function logic
            logger.error(`Error in startVideoPipeline for doc ${firestoreDocId}:`, error);
            // Attempt to update Firestore with a generic error if not already handled by more specific catches
            try {
                const currentDoc = await postDocRef.get(); // Check current status before overwriting
                if (currentDoc.exists() && !['runway_submission_failed', 'pipeline_error_openai_init', 'pipeline_error_no_image'].includes(currentDoc.data().status)) {
                    let errorToStore = (error instanceof HttpsError && error.code === 'resource-exhausted') ? error.message : `Video pipeline internal error: ${error.message}`;
                    await postDocRef.update({
                        status: (error instanceof HttpsError && error.code === 'resource-exhausted') ? 'pipeline_error_credits' : 'pipeline_internal_error',
                        error: errorToStore, // errorToStore will contain "Insufficient general credits..."
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
            } catch (dbUpdateError) {
                logger.error(`DB error attempting to update pipeline_internal_error for ${firestoreDocId}:`, dbUpdateError);
            }
            // Ensure a response is sent to the task if not already handled by specific error cases above
            if (!response.headersSent) {
                 // For credit exhaustion, it's good to return a distinct message if possible, but task queue might not care.
                response.status(200).send(`Internal Server Error or unhandled condition in video pipeline: ${error.message}`); // Ack task
            }
        }
    }
);

async function downloadFile(url, destPath) {
    const fs = require('fs'); // Make sure fs is available
    const writer = fs.createWriteStream(destPath);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
    });

    return new Promise((resolve, reject) => {
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', (err) => {
            writer.close(() => { // Ensure writer is closed
                fs.unlink(destPath, (unlinkErr) => { // Attempt to delete partial file
                    if (unlinkErr && unlinkErr.code !== 'ENOENT') { // Ignore if file already gone
                        logger.error(`Error unlinking partial file ${destPath} after download write error:`, unlinkErr);
                    }
                });
                reject(new Error(`Failed to write ${url} to ${destPath}: ${err.message}`));
            });
        });
        response.data.on('error', (err) => { // Handle errors on the response stream itself
             writer.close(() => {
                fs.unlink(destPath, (unlinkErr) => {
                    if (unlinkErr && unlinkErr.code !== 'ENOENT') {
                        logger.error(`Error unlinking partial file ${destPath} after response stream error:`, unlinkErr);
                    }
                });
                reject(new Error(`Stream error during download of ${url}: ${err.message}`));
            });
        });
    });
}

// --- NEW: Cloud Function to Standardize Product Video (onCall) ---
exports.manuallyStandardizeProductVideo = onCall({
    cpu: 2,
    memory: '2GiB',
    timeoutSeconds: 540,
    region: 'us-central1', // Keep region for the function itself
}, async (request) => { // MODIFIED: (data, context) -> (request)
    const ffmpeg = require('fluent-ffmpeg');
    const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
    ffmpeg.setFfmpegPath(ffmpegPath);
    const os = require('os');
    const fsPromises = require('fs').promises;
    const path = require('path');

    // Validate auth context
    if (!request.auth) { // MODIFIED: context.auth -> request.auth
        logger.error('Authentication required for manuallyStandardizeProductVideo.');
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const callingUserId = request.auth.uid; // MODIFIED: context.auth.uid -> request.auth.uid

    // Validate input data
    const { userId, productId, originalVideoPathInStorage, originalFileExtension } = request.data; // MODIFIED: data -> request.data
    if (!userId || !productId || !originalVideoPathInStorage || !originalFileExtension) {
        logger.error('Missing required data for manuallyStandardizeProductVideo:', { userId, productId, originalVideoPathInStorage, originalFileExtension });
        throw new HttpsError('invalid-argument', 'Required data (userId, productId, originalVideoPathInStorage, originalFileExtension) is missing.');
    }
    
    // Security check: Ensure the calling user matches the userId in the data, or implement admin override if needed.
    // For now, we'll assume the calling user IS the target user.
    if (callingUserId !== userId) {
        logger.error(`User ID mismatch: Caller ${callingUserId} attempting to process video for ${userId}.`);
        throw new HttpsError('permission-denied', 'You do not have permission to process this video.');
    }
    
    const filePath = originalVideoPathInStorage; // Use the path from data

    logger.info(`manuallyStandardizeProductVideo: Request for UserID=${userId}, ProductID=${productId}, File=${filePath}`);

    // No resourceState or metageneration checks needed for onCall

    // No need to match with regex, path is provided directly
    // No need to check contentType here, assume it's a video if this function is called

    const tempDir = path.join(os.tmpdir(), `standardize_${userId}_${productId}_${Date.now()}`);
    const originalVideoTempPath = path.join(tempDir, `original.${originalFileExtension}`); // Use provided extension
    const standardizedVideoTempPath = path.join(tempDir, 'standardized.mp4');
    const productDocRef = db.collection('users').doc(userId).collection('products').doc(productId);

    try {
        await fsPromises.mkdir(tempDir, { recursive: true });
        const sourceFile = bucket.file(filePath); // bucket is admin.storage().bucket()
        
        // Check if file exists before attempting download
        const [exists] = await sourceFile.exists();
        if (!exists) {
            logger.error(`Original video file does not exist at path: ${filePath} for product ${productId}`);
            await productDocRef.set({
                isVideoStandardized: false,
                standardizationError: `Original video not found at ${filePath}.`,
                standardizationAttemptTimestamp: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            throw new HttpsError('not-found', `Original video file not found: ${filePath}`);
        }
        
        await sourceFile.download({ destination: originalVideoTempPath });
        logger.info(`Downloaded ${filePath} to ${originalVideoTempPath}.`);

        await new Promise((resolve, reject) => {
            ffmpeg(originalVideoTempPath)
                .fps(25)
                .videoFilters('scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black')
                .outputOptions(['-pix_fmt yuv420p', '-an']) // Mute
                .on('start', cmd => logger.info(`FFmpeg (product ${productId}) started: ${cmd}`))
                .on('end', resolve)
                .on('error', (err, stdout, stderr) => {
                    logger.error(`FFmpeg error (product ${productId}):`, { msg: err.message, stdout, stderr });
                    reject(err);
                })
                .save(standardizedVideoTempPath);
        });
        logger.info(`Product video ${productId} standardized to ${standardizedVideoTempPath}.`);

        const standardizedStoragePath = `users/${userId}/products/${productId}/standardized_video.mp4`;
        const [uploadedFile] = await bucket.upload(standardizedVideoTempPath, {
            destination: standardizedStoragePath,
            metadata: { contentType: 'video/mp4', customMetadata: { originalPath: filePath } },
            public: true
        });
        const standardizedPublicUrl = uploadedFile.publicUrl();
        logger.info(`Uploaded standardized ${productId} to ${standardizedStoragePath}. URL: ${standardizedPublicUrl}`);

        await productDocRef.set({
            standardizedVideoUrl: standardizedPublicUrl,
            isVideoStandardized: true,
            standardizationTimestamp: admin.firestore.FieldValue.serverTimestamp(),
            standardizationError: null,
            originalVideoPath: filePath // Store original path for reference
        }, { merge: true });
        logger.info(`Firestore updated for product ${productId} with standardized URL.`);
        return null;

    } catch (error) {
        logger.error(`Error in manuallyStandardizeProductVideo for ${filePath}:`, error);
        try {
            await productDocRef.set({
                isVideoStandardized: false,
                standardizationError: String(error.message || error),
                standardizationAttemptTimestamp: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch (dbError) {
            logger.error(`Failed to log error to Firestore for product ${productId}:`, dbError);
        }
        return null;
    } finally {
        try {
            if (await fsPromises.stat(tempDir).catch(() => false)) {
                await fsPromises.rm(tempDir, { recursive: true, force: true });
                logger.info(`Cleaned up temp dir: ${tempDir}`);
            }
        } catch (cleanupError) {
            logger.error(`Error cleaning up temp dir ${tempDir}:`, cleanupError);
        }
    }
});
// --- END NEW Cloud Function ---

// --- NEW: TikTok OAuth Integration Functions ---

// NEW: Function to generate the TikTok OAuth Authorization URL
exports.getTikTokAuthUrl = onCall({ region: 'us-central1' }, async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
        logger.error("getTikTokAuthUrl: Authentication Error.");
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    if (!request.data) {
        logger.error("getTikTokAuthUrl: request.data is null or undefined. Client must send 'redirectUri' and 'state'.");
        throw new HttpsError('invalid-argument', 'Request data is missing. Please ensure "redirectUri" and "state" are provided in the call.');
    }

    const { redirectUri, state } = request.data;

    if (!redirectUri) {
        throw new HttpsError('invalid-argument', 'Missing "redirectUri" in the request. This must match your TikTok app configuration.');
    }
    if (!state) {
        throw new HttpsError('invalid-argument', 'Missing "state" parameter for security.');
    }

    const tiktokClientKey = process.env.TIKTOK_CLIENT_KEY;
    if (!tiktokClientKey) {
        logger.error("TikTok API client key not configured (TIKTOK_CLIENT_KEY).");
        throw new HttpsError('internal', 'TikTok API integration is not configured correctly on the server.');
    }

    const TIKTOK_AUTH_BASE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
    
    const scopes = [
        'user.info.basic',
        'user.info.profile',
        'user.info.stats',
        'video.list',
        'video.publish',
        'video.upload'
    ];

    const params = new URLSearchParams({
        client_key: tiktokClientKey,
        scope: scopes.join(','),
        response_type: 'code',
        redirect_uri: redirectUri,
        state: state,
        disable_auto_auth: '1' // <<< ADDED THIS PARAMETER
    });

    const authorizationUrl = `${TIKTOK_AUTH_BASE_URL}?${params.toString()}`;

    logger.info(`Generated TikTok Auth URL for user ${userId}. State: ${state}, DisableAutoAuth: 1`);
    return { authorizationUrl, state };
});

async function fetchTikTokUserInfo(accessToken, openId) { // Internal helper, not exported
    const TIKTOK_USER_INFO_ENDPOINT = 'https://open.tiktokapis.com/v2/user/info/';
    const requestedFields = ["open_id", "union_id", "avatar_url", "display_name", "is_verified", "follower_count", "following_count", "likes_count", "video_count"];

    try {
        logger.info(`Fetching TikTok user info for open_id: ${openId} with fields: ${requestedFields.join(',')}`);
        // OLD POST REQUEST:
        // const response = await axios.post(TIKTOK_USER_INFO_ENDPOINT,
        //     { fields: requestedFields }, 
        //     {
        //         headers: {
        //             'Authorization': `Bearer ${accessToken}`,
        //             'Content-Type': 'application/json', 
        //         }
        //     }
        // );

        // NEW GET REQUEST:
        const response = await axios.get(TIKTOK_USER_INFO_ENDPOINT, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                // 'Content-Type': 'application/json', // Not needed for GET typically
            },
            params: {
                fields: requestedFields.join(',') // Pass fields as a comma-separated string in query params
            }
        });

        const userDataContainer = response.data; 

        if (userDataContainer.error && userDataContainer.error.code !== "ok") { // TikTok uses "ok" for success code in user info
            logger.error(`Error fetching TikTok user info. Code: ${userDataContainer.error.code}, Msg: ${userDataContainer.error.message}`, userDataContainer.error);
            throw new Error(`TikTok API error fetching user info: ${userDataContainer.error.message} (Code: ${userDataContainer.error.code})`);
        }

        if (!userDataContainer.data || !userDataContainer.data.user) {
            logger.error('TikTok user info response missing data.user field.', userDataContainer);
            throw new Error('Received incomplete user info data from TikTok.');
        }

        logger.info('Successfully fetched TikTok user info:', userDataContainer.data.user);
        return userDataContainer.data.user;

    } catch (error) {
        logger.error(`Error in fetchTikTokUserInfo for open_id ${openId}:`, error.response ? JSON.stringify(error.response.data) : error.message, error.stack);
        if (axios.isAxiosError(error) && error.response && error.response.data) {
            const tiktokErrorContainer = error.response.data;
            const tiktokError = tiktokErrorContainer.error || tiktokErrorContainer;
            let errMsg = tiktokError.message || tiktokError.description || tiktokError.error_description || JSON.stringify(tiktokError);
            if (tiktokError.code || tiktokError.error_code) errMsg = `(Code: ${tiktokError.code || tiktokError.error_code}) ${errMsg}`;
            throw new Error(`TikTok API error (user info): ${errMsg}`);
        }
        throw error;
    }
}

exports.exchangeTikTokAuthCode = onCall({region: 'us-central1'}, async (request) => {
  const { authorizationCode, redirectUri } = request.data;
  const userId = request.auth?.uid;

  // <<< ADDED EXTENSIVE LOGGING from previous step - kept for safety >>>
  logger.info(`exchangeTikTokAuthCode INVOCATION DETAILS:\\n    User ID: ${userId},\\n    Authorization Code (first 10 chars): ${authorizationCode ? authorizationCode.substring(0,10) : 'N/A'}...\\n    Received Redirect URI: ${redirectUri}\\n    TIKTOK_CLIENT_KEY is set: ${process.env.TIKTOK_CLIENT_KEY ? 'Yes' : 'No - THIS IS A PROBLEM!'}\\n    TIKTOK_CLIENT_SECRET is set: ${process.env.TIKTOK_CLIENT_SECRET ? 'Yes' : 'No - THIS IS A PROBLEM!'}\\n  `);

  if (!userId) {
    logger.error("exchangeTikTokAuthCode: Authentication Error.");
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  if (!authorizationCode || !redirectUri) {
    logger.error("exchangeTikTokAuthCode: Missing authorizationCode or redirectUri.");
    throw new HttpsError('invalid-argument', 'Missing authorizationCode or redirectUri.');
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

  if (!clientKey || !clientSecret) {
    logger.error("TikTok API client key or secret is not configured in environment variables (TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET).");
    throw new HttpsError('internal', 'TikTok API configuration error.');
  }

  try {
    const requestBody = new URLSearchParams();
    requestBody.append('client_key', clientKey);
    requestBody.append('client_secret', clientSecret);
    requestBody.append('code', authorizationCode);
    requestBody.append('grant_type', 'authorization_code');
    requestBody.append('redirect_uri', redirectUri);

    const tokenResponse = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', requestBody, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    logger.info("TikTok token exchange successful. Response data:", tokenResponse.data);

    const accessToken = tokenResponse.data.access_token;
    const openId = tokenResponse.data.open_id;
    const expiresIn = tokenResponse.data.expires_in;
    const refreshToken = tokenResponse.data.refresh_token;
    const refreshExpiresIn = tokenResponse.data.refresh_expires_in;
    const scope = tokenResponse.data.scope;
    const tokenType = tokenResponse.data.token_type || "Bearer";

    if (!accessToken || !openId) {
        logger.error("TikTok token response missing access_token or open_id.", tokenResponse.data);
        throw new HttpsError('internal', 'Failed to retrieve essential tokens from TikTok.');
    }

    const tiktokIntegrationData = {
      accessToken: accessToken,
      openId: openId,
      expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + expiresIn * 1000)),
      refreshToken: refreshToken,
      refreshExpiresInSeconds: refreshExpiresIn,
      refreshExpiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + refreshExpiresIn * 1000)),
      scope: scope,
      tokenType: tokenType,
      provider: "tiktok",
      type: "tiktok", // <<< ADDED TYPE FIELD
      retrievedAt: admin.firestore.FieldValue.serverTimestamp(),
      user_info: null // Initialize user_info as null
    };

    // <<< MODIFIED: Create a new document with an auto-generated ID >>>
    const integrationRef = db.collection("users").doc(userId).collection("integrations").doc(); // Auto-generate ID
    await integrationRef.set(tiktokIntegrationData);
    const newIntegrationId = integrationRef.id; // Get the new ID

    logger.info(`New TikTok integration (ID: ${newIntegrationId}) data for user ${userId} (openId: ${openId}) successfully saved.`);
    return {
       success: true,
       message: "New TikTok account tokens linked successfully. Fetching user details...",
       integrationId: newIntegrationId, // <<< RETURN NEW INTEGRATION ID
       // For client-side, if needed immediately (though updateUserDetails will fetch fresh)
       // openId: openId 
    };

  } catch (error) {
    logger.error("Error during TikTok token exchange or Firestore save:", error.response ? error.response.data : error.message, error.stack);
    if (error.isAxiosError && error.response) {
      logger.error("TikTok API Error Details:", error.response.status, error.response.data);
      throw new HttpsError('internal', `Failed to exchange TikTok code: ${error.response.data.error_description || error.response.data.error || 'TikTok API Error'}`);
    }
    throw new HttpsError('internal', `Failed to exchange TikTok code: ${error.message}`);
  }
});

// ... fetchTikTokUserInfo function should remain as is ...
// ... updateTikTokUserDetails function should remain as is ...
// ... existing code ...

exports.updateTikTokUserDetails = onCall({ region: 'us-central1' }, async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
        logger.error("updateTikTokUserDetails: Authentication Error.");
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const { integrationId } = request.data;
    if (!integrationId) {
        logger.error("updateTikTokUserDetails: Missing integrationId in request data.");
        throw new HttpsError('invalid-argument', 'Missing "integrationId" in the request data.');
    }

    logger.info(`updateTikTokUserDetails called for user ${userId}, integrationId: ${integrationId}`);

    try {
        const integrationDocRef = db.collection('users').doc(userId).collection('integrations').doc(integrationId);
        const integrationDocSnap = await integrationDocRef.get();

        if (!integrationDocSnap.exists) {
            logger.error(`Integration document ${integrationId} not found for user ${userId}.`);
            throw new HttpsError('not-found', `TikTok integration with ID ${integrationId} not found.`);
        }

        const integrationData = integrationDocSnap.data();
        if (integrationData.type !== 'tiktok') {
             logger.error(`Integration document ${integrationId} for user ${userId} is not of type 'tiktok'. Type is: ${integrationData.type}`);
             throw new HttpsError('failed-precondition', `Integration ${integrationId} is not a TikTok integration.`);
        }

        const { accessToken, openId } = integrationData;

        if (!accessToken || !openId) {
            logger.error(`Missing accessToken or openId in integration document ${integrationId} for user ${userId}.`);
            throw new HttpsError('internal', 'TikTok integration data is incomplete. Cannot fetch user details.');
        }

        logger.info(`Fetching TikTok user info for openId: ${openId} using integration ${integrationId}.`);
        const tikTokUserInfo = await fetchTikTokUserInfo(accessToken, openId); // Reuses the existing internal helper

        if (!tikTokUserInfo) {
            logger.error(`fetchTikTokUserInfo returned no data for openId ${openId}, integration ${integrationId}.`);
            throw new HttpsError('internal', 'Failed to retrieve user details from TikTok API.');
        }
        
        // Construct the user_info object with desired fields
        // The fetchTikTokUserInfo helper returns: open_id, union_id, avatar_url, display_name, is_verified, follower_count, following_count, likes_count, video_count
        const userInfoToUpdate = {
            open_id: tikTokUserInfo.open_id,
            union_id: tikTokUserInfo.union_id,
            avatar_url: tikTokUserInfo.avatar_url,
            display_name: tikTokUserInfo.display_name,
            username: tikTokUserInfo.username || tikTokUserInfo.display_name, // TikTok might not always have a distinct username; fallback to display_name
            is_verified: tikTokUserInfo.is_verified,
            follower_count: tikTokUserInfo.follower_count,
            following_count: tikTokUserInfo.following_count,
            likes_count: tikTokUserInfo.likes_count,
            video_count: tikTokUserInfo.video_count,
            // Construct profile_deep_link if possible (TikTok's v2 User Info API doesn't directly provide it)
            // Example for web: `https://www.tiktok.com/@${username_or_unique_id}` - requires a stable username or unique ID field from API.
            // For now, we'll omit it unless display_name can be reliably used.
            // profile_deep_link: tikTokUserInfo.display_name ? `https://www.tiktok.com/@${tikTokUserInfo.display_name}` : null, 
            last_synced_at: admin.firestore.FieldValue.serverTimestamp()
        };

        await integrationDocRef.update({ user_info: userInfoToUpdate });

        logger.info(`Successfully updated TikTok user_info for integration ${integrationId}, user ${userId}.`);
        return { success: true, message: 'TikTok user details updated successfully.', user_info: userInfoToUpdate };

    } catch (error) {
        logger.error(`Error in updateTikTokUserDetails for user ${userId}, integration ${integrationId}:`, error.message, error.stack);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', `An unexpected error occurred while updating TikTok user details: ${error.message}`);
    }
});

// ... fetchTikTokUserInfo function should remain as is ...
// ... updateTikTokUserDetails function should remain as is ...
// ... existing code ...

// --- NEW: TikTok Direct Posting API Functions ---

// 1. Query Creator Info
exports.queryTikTokCreatorInfo = onCall({ region: 'us-central1' }, async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
        logger.error("queryTikTokCreatorInfo: Authentication Error.");
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const { accessToken } = request.data;
    if (!accessToken) {
        logger.error(`queryTikTokCreatorInfo: User ${userId} called without accessToken.`);
        throw new HttpsError('invalid-argument', 'Missing "accessToken" in the request.');
    }

    const TIKTOK_CREATOR_INFO_ENDPOINT = 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/';
    logger.info(`User ${userId} querying TikTok creator info.`);

    try {
        const response = await axios.post(TIKTOK_CREATOR_INFO_ENDPOINT,
            {}, // Empty body as per TikTok API cURL example
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json; charset=UTF-8',
                }
            }
        );

        const responseData = response.data;
        if (responseData.error && responseData.error.code !== "ok") {
            logger.error(`queryTikTokCreatorInfo: TikTok API error for user ${userId}. Code: ${responseData.error.code}, Msg: ${responseData.error.message}`, responseData.error);
            throw new HttpsError('aborted', `TikTok API error: ${responseData.error.message} (Code: ${responseData.error.code})`);
        }

        logger.info(`queryTikTokCreatorInfo: Successfully fetched creator info for user ${userId}.`, responseData.data);
        return { success: true, data: responseData.data };

    } catch (error) {
        logger.error(`queryTikTokCreatorInfo: Error for user ${userId}:`, error.response ? JSON.stringify(error.response.data) : error.message, error.stack);
        if (axios.isAxiosError(error) && error.response && error.response.data && error.response.data.error) {
            const tiktokError = error.response.data.error;
            throw new HttpsError('aborted', `TikTok API error: ${tiktokError.message} (Code: ${tiktokError.code})`);
        }
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', `Failed to query TikTok creator info: ${error.message}`);
    }
});

// 2. Initiate Video Post
exports.initiateTikTokVideoPost = onCall({ region: 'us-central1' }, async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
        logger.error("initiateTikTokVideoPost: Authentication Error.");
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    // MODIFIED: Only accessToken and sourceInfo are expected for inbox/draft uploads.
    // const { accessToken, postInfo, sourceInfo } = request.data; // OLD
    const { accessToken, sourceInfo } = request.data; // NEW

    if (!accessToken || !sourceInfo) { // MODIFIED: Check only for accessToken and sourceInfo
        logger.error(`initiateTikTokVideoPost: User ${userId} called with missing parameters.`, { hasToken: !!accessToken, hasSourceInfo: !!sourceInfo });
        // MODIFIED: Updated error message
        throw new HttpsError('invalid-argument', 'Missing "accessToken" or "sourceInfo" in the request for draft video upload.');
    }
    // MODIFIED: Simplified sourceInfo check as postInfo is removed for this endpoint
    if (!sourceInfo.source || (sourceInfo.source === "PULL_FROM_URL" && !sourceInfo.video_url) || (sourceInfo.source === "FILE_UPLOAD" && (!sourceInfo.video_size || !sourceInfo.chunk_size || !sourceInfo.total_chunk_count))) {
        logger.error(`initiateTikTokVideoPost: User ${userId} provided invalid sourceInfo.`, sourceInfo);
        throw new HttpsError('invalid-argument', 'Invalid "sourceInfo" provided for draft video upload. Check required fields for your source type.');
    }

    // MODIFIED: Changed endpoint to send to inbox/draft
    const TIKTOK_VIDEO_INIT_ENDPOINT = 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/';
    // MODIFIED: Updated log message
    logger.info(`User ${userId} initiating TikTok video upload to inbox (draft). Source: ${sourceInfo.source}`);

    try {
        // MODIFIED: Removed post_info from the request body
        const response = await axios.post(TIKTOK_VIDEO_INIT_ENDPOINT,
            {
                // post_info: postInfo, // REMOVED for inbox/draft
                source_info: sourceInfo
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json; charset=UTF-8',
                }
            }
        );

        const responseData = response.data;
        if (responseData.error && responseData.error.code !== "ok") {
            logger.error(`initiateTikTokVideoPost (draft): TikTok API error for user ${userId}. Code: ${responseData.error.code}, Msg: ${responseData.error.message}`, responseData.error);
            throw new HttpsError('aborted', `TikTok API error (draft video): ${responseData.error.message} (Code: ${responseData.error.code})`);
        }

        logger.info(`initiateTikTokVideoPost (draft): Successfully initiated video upload to inbox for user ${userId}. Publish ID: ${responseData.data.publish_id}`);
        return { success: true, data: responseData.data };

    } catch (error) {
        logger.error(`initiateTikTokVideoPost (draft): Error for user ${userId}:`, error.response ? JSON.stringify(error.response.data) : error.message, error.stack);
        if (axios.isAxiosError(error) && error.response && error.response.data && error.response.data.error) {
            const tiktokError = error.response.data.error;
            throw new HttpsError('aborted', `TikTok API error (draft video): ${tiktokError.message} (Code: ${tiktokError.code})`);
        }
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', `Failed to initiate TikTok video upload to inbox (draft): ${error.message}`);
    }
});

// 3. Initiate Photo Post
exports.initiateTikTokPhotoPost = onCall({ region: 'us-central1' }, async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
        logger.error("initiateTikTokPhotoPost: Authentication Error.");
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    // MODIFIED: Added post_mode to destructuring
    const { accessToken, postInfo, sourceInfo, post_mode } = request.data;

    // MODIFIED: post_mode is now essential for determining behavior
    if (!accessToken || !postInfo || !sourceInfo || !post_mode) {
        logger.error(`initiateTikTokPhotoPost: User ${userId} called with missing parameters.`, { hasToken: !!accessToken, hasPostInfo: !!postInfo, hasSourceInfo: !!sourceInfo, hasPostMode: !!post_mode });
        throw new HttpsError('invalid-argument', 'Missing "accessToken", "postInfo", "sourceInfo", or "post_mode" in the request.');
    }
    if (post_mode !== "DIRECT_POST" && post_mode !== "MEDIA_UPLOAD") {
        logger.error(`initiateTikTokPhotoPost: User ${userId} provided invalid post_mode: ${post_mode}`);
        throw new HttpsError('invalid-argument', 'Invalid "post_mode" provided. Must be "DIRECT_POST" or "MEDIA_UPLOAD".');
    }

    if (!sourceInfo.source || (sourceInfo.source === "PULL_FROM_URL" && !sourceInfo.photo_url && (!sourceInfo.photo_images || sourceInfo.photo_images.length === 0) ) || (sourceInfo.source === "FILE_UPLOAD" && !sourceInfo.photo_size)) {
        logger.error(`initiateTikTokPhotoPost: User ${userId} provided invalid sourceInfo.`, sourceInfo);
        throw new HttpsError('invalid-argument', 'Invalid "sourceInfo" provided. For FILE_UPLOAD, ensure "photo_size" is present. For PULL_FROM_URL, ensure "photo_url" or "photo_images" list is present.');
    }


    const TIKTOK_PHOTO_INIT_ENDPOINT = 'https://open.tiktokapis.com/v2/post/publish/content/init/';
    logger.info(`User ${userId} initiating TikTok photo post. Mode: ${post_mode}, Title: ${postInfo.title}, Source: ${sourceInfo.source}`);

    // MODIFIED: Construct payload based on post_mode
    let requestPayload = {
        media_type: "PHOTO", // This is fixed for this endpoint as per docs for photos
        post_mode: post_mode,
        source_info: sourceInfo,
        // post_info will be constructed based on mode
    };

    let finalPostInfo = {};
    if (post_mode === "DIRECT_POST") {
        // For direct post, include all relevant details from the client's postInfo
        finalPostInfo = { ...postInfo }; // e.g., title, description, privacy_level, disable_comment, auto_add_music etc.
        if (!finalPostInfo.privacy_level) {
            // TikTok API for photo direct post *requires* privacy_level if post_mode is DIRECT_POST
            // This should be validated or handled client-side, or we can default/error here.
            // For now, let's assume client sends it or a query to creator_info was made to get options.
             logger.warn(`initiateTikTokPhotoPost: DIRECT_POST mode for user ${userId} but privacy_level is missing in postInfo. TikTok might reject this.`);
        }
    } else if (post_mode === "MEDIA_UPLOAD") {
        // For media upload (draft), only title and description are typically used from post_info.
        // Other details like privacy, music are set by the user in TikTok app.
        if (postInfo.title) finalPostInfo.title = postInfo.title;
        if (postInfo.description) finalPostInfo.description = postInfo.description;
        // auto_add_music is not shown in MEDIA_UPLOAD examples, so we omit it.
    }
    requestPayload.post_info = finalPostInfo;


    try {
        const response = await axios.post(TIKTOK_PHOTO_INIT_ENDPOINT,
            requestPayload, // Use the dynamically constructed payload
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json; charset=UTF-8', // TikTok docs sometimes show 'application/json'
                }
            }
        );

        const responseData = response.data;
        if (responseData.error && responseData.error.code !== "ok") {
            logger.error(`initiateTikTokPhotoPost (${post_mode}): TikTok API error for user ${userId}. Code: ${responseData.error.code}, Msg: ${responseData.error.message}`, responseData.error);
            throw new HttpsError('aborted', `TikTok API error (${post_mode} photo): ${responseData.error.message} (Code: ${responseData.error.code})`);
        }

        logger.info(`initiateTikTokPhotoPost (${post_mode}): Successfully initiated photo post for user ${userId}. Publish ID: ${responseData.data.publish_id}`);
        return { success: true, data: responseData.data };

    } catch (error) {
        logger.error(`initiateTikTokPhotoPost (${post_mode}): Error for user ${userId}:`, error.response ? JSON.stringify(error.response.data) : error.message, error.stack);
         if (axios.isAxiosError(error) && error.response && error.response.data && error.response.data.error) {
            const tiktokError = error.response.data.error;
            throw new HttpsError('aborted', `TikTok API error (${post_mode} photo): ${tiktokError.message} (Code: ${tiktokError.code})`);
        }
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', `Failed to initiate TikTok photo post (${post_mode}): ${error.message}`);
    }
});

// 4. Get Post Status
exports.getTikTokPostStatus = onCall({ region: 'us-central1' }, async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
        logger.error("getTikTokPostStatus: Authentication Error.");
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const { accessToken, publishId } = request.data;
    if (!accessToken || !publishId) {
        logger.error(`getTikTokPostStatus: User ${userId} called with missing accessToken or publishId.`);
        throw new HttpsError('invalid-argument', 'Missing "accessToken" or "publishId" in the request.');
    }

    const TIKTOK_STATUS_FETCH_ENDPOINT = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/';
    logger.info(`User ${userId} fetching status for TikTok publish ID: ${publishId}`);

    try {
        const response = await axios.post(TIKTOK_STATUS_FETCH_ENDPOINT,
            { publish_id: publishId },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json; charset=UTF-8',
                }
            }
        );

        const responseData = response.data;
        if (responseData.error && responseData.error.code !== "ok") {
            logger.error(`getTikTokPostStatus: TikTok API error for user ${userId}, publishId ${publishId}. Code: ${responseData.error.code}, Msg: ${responseData.error.message}`, responseData.error);
            throw new HttpsError('aborted', `TikTok API error: ${responseData.error.message} (Code: ${responseData.error.code})`);
        }

        logger.info(`getTikTokPostStatus: Successfully fetched status for user ${userId}, publishId ${publishId}. Status: ${responseData.data.status}`);
        return { success: true, data: responseData.data };

    } catch (error) {
        logger.error(`getTikTokPostStatus: Error for user ${userId}, publishId ${publishId}:`, error.response ? JSON.stringify(error.response.data) : error.message, error.stack);
        if (axios.isAxiosError(error) && error.response && error.response.data && error.response.data.error) {
            const tiktokError = error.response.data.error;
            throw new HttpsError('aborted', `TikTok API error: ${tiktokError.message} (Code: ${tiktokError.code})`);
        }
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', `Failed to fetch TikTok post status: ${error.message}`);
    }
});

// --- NEW FUNCTION: Render text on an image and update a specific generation document ---
exports.renderAndReplaceGenerationImage = onCall({ region: 'us-central1', timeoutSeconds: 300, memory: '1GB' }, async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
        logger.error('renderAndReplaceGenerationImage: Authentication required.');
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const { backgroundUrl, textToRender, targetGenerationId } = request.data;

    if (!backgroundUrl || typeof textToRender === 'undefined' || !targetGenerationId) {
        logger.error(`renderAndReplaceGenerationImage: Missing required parameters for user ${userId}.`, 
            { 
                backgroundUrlProvided: !!backgroundUrl, 
                textToRenderProvided: typeof textToRender !== 'undefined', 
                targetGenerationIdProvided: !!targetGenerationId 
            }
        );
        throw new HttpsError('invalid-argument', 'Missing required parameters: backgroundUrl, textToRender, and targetGenerationId.');
    }

    logger.info(`[${targetGenerationId}] User ${userId} initiated renderAndReplaceGenerationImage. Background: ${backgroundUrl}`);

    // Assuming os, path, fs (fs.promises), downloadFile, ffmpeg, admin, db, logger, HttpsError are available in the global scope
    const tempDir = os.tmpdir();
    const operationSuffix = `replaced_${targetGenerationId}_${Date.now()}`;
    const backgroundFileName = `background_${operationSuffix}.png`; // Output of downloadFile should be controllable or checked
    const backgroundFilePath = path.join(tempDir, backgroundFileName);
    const outputSlideFileName = `rendered_output_${operationSuffix}.png`;
    const outputSlideFilePath = path.join(tempDir, outputSlideFileName);

    try {
        // 1. Download the background image
        logger.info(`[${targetGenerationId}] Downloading background image: ${backgroundUrl} to ${backgroundFilePath}`);
        await downloadFile(backgroundUrl, backgroundFilePath); 
        logger.info(`[${targetGenerationId}] Background image downloaded successfully to ${backgroundFilePath}`);

        // 2. Process text (split into lines)
        let processedSlideText = '';
        if (textToRender) {
            const words = textToRender.split(' ');
            let currentLine = '';
            for (const word of words) {
                if (currentLine === '') {
                    currentLine = word;
                } else if ((currentLine + ' ' + word).length <= 35) { // Approx 35 chars per line
                    currentLine += ' ' + word;
                } else {
                    processedSlideText += currentLine + '\n';
                    currentLine = word;
                }
            }
            processedSlideText += currentLine;
            if (processedSlideText.endsWith('\n')) {
                processedSlideText = processedSlideText.slice(0, -1); // Remove trailing newline
            }
        }
        logger.info(`[${targetGenerationId}] Processed text for rendering: "${processedSlideText}"`);

        // 3. Escape text for FFmpeg command
        const escapedText = processedSlideText
                        .replace(/\\/g, '\\\\') // Escape actual backslashes first
                        .replace(/%/g, '%%')
                        .replace(/'/g, "\\'")
                        .replace(/:/g, '\\:'); 

        // 4. Define FFmpeg drawtext filter
        const fontPath = '/usr/share/fonts/truetype/msttcorefonts/Arial.ttf'; // Ensure this font exists in the environment
        const drawTextFilter = `drawtext=text='${escapedText}':fontfile='${fontPath}':fontcolor=white:fontsize=50:borderw=2:bordercolor=black@0.7:x=(w-text_w)/2:y=(h-text_h)/2`;

        // 5. Execute FFmpeg to render text on image
        logger.info(`[${targetGenerationId}] Starting FFmpeg rendering. Input: ${backgroundFilePath}, Output: ${outputSlideFilePath}`);
        await new Promise((resolve, reject) => {
            ffmpeg(backgroundFilePath)
                .outputOptions('-y') 
                .videoFilter(drawTextFilter)
                .save(outputSlideFilePath) 
                .on('end', () => {
                    logger.info(`[${targetGenerationId}] FFmpeg successfully rendered image to ${outputSlideFilePath}`);
                    resolve();
                })
                .on('error', (err, stdout, stderr) => {
                    logger.error(`[${targetGenerationId}] FFmpeg error during rendering: ${err.message}`);
                    if (stdout) logger.error(`[${targetGenerationId}] FFmpeg stdout: ${stdout}`);
                    if (stderr) logger.error(`[${targetGenerationId}] FFmpeg stderr: ${stderr}`);
                    reject(new Error(`FFmpeg error: ${err.message}`));
                });
        });

        // 6. Upload the rendered image to Firebase Storage
        const storagePath = `generations/${userId}/${targetGenerationId}/replaced_image_${Date.now()}.png`;
        const currentBucket = admin.storage().bucket(); 
        const [file] = await currentBucket.upload(outputSlideFilePath, {
            destination: storagePath,
            metadata: { contentType: 'image/png' }, // Explicitly set content type
            public: true,
        });
        const newImageUrl = file.publicUrl();
        logger.info(`[${targetGenerationId}] Uploaded new image to ${storagePath}. URL: ${newImageUrl}`);

        // 7. Update Firestore document
        const generationDocRef = db.collection('users').doc(userId).collection('generations').doc(targetGenerationId);
        await generationDocRef.update({
            processedImageUrls: [newImageUrl], 
            lastModified: admin.firestore.FieldValue.serverTimestamp(),
            status: 'updated_with_new_render' // Optional: a status field indicating this change
        });
        logger.info(`[${targetGenerationId}] Firestore document ${generationDocRef.path} updated with new image URL.`);

        return { success: true, message: "Image rendered and generation document updated successfully.", imageUrl: newImageUrl };

    } catch (error) {
        logger.error(`[${targetGenerationId}] Error in renderAndReplaceGenerationImage for user ${userId}: ${error.message}`, { stack: error.stack, details: error });
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', `Failed to render and replace image: ${error.message}`);
    } finally {
        // 8. Cleanup temporary files
        try {
            if (await fs.stat(backgroundFilePath).catch(() => false)) {
                await fs.unlink(backgroundFilePath);
                logger.info(`[${targetGenerationId}] Deleted temp background file: ${backgroundFilePath}`);
            }
            if (await fs.stat(outputSlideFilePath).catch(() => false)) {
                await fs.unlink(outputSlideFilePath);
                logger.info(`[${targetGenerationId}] Deleted temp output file: ${outputSlideFilePath}`);
            }
        } catch (unlinkError) {
            logger.warn(`[${targetGenerationId}] Warning: Could not delete one or more temporary files: ${unlinkError.message}`);
        }
    }
});
