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
// const ffmpeg = require('fluent-ffmpeg'); // TAŞINACAK
// const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path; // TAŞINACAK
// ffmpeg.setFfmpegPath(ffmpegPath); // TAŞINACAK
// const stripe = require('stripe')(process.env.STRIPE_SECRET); // <-- REMOVE Global Stripe import and initialize

// Initialize Firebase Admin SDK (once)
admin.initializeApp();
const db = admin.firestore(); // Firestore instance
const bucket = getStorage().bucket(); // Default Firebase Storage bucket
const tasksClient = new CloudTasksClient(); // <-- Initialize Tasks Client

// --- NEW: Plan Credit Allocations (Backend) ---
const planCreditAllocations = {
  // Basic Plan
  "price_1RMqEZDf8kAOBAT3ltD6n2lX": { images: 15, videos: 10, slideshows: 30 }, // Monthly
  "price_1RMqGbDf8kAOBAT3vgwkWLr6": { images: 15, videos: 10, slideshows: 30 }, // Yearly
  // Pro Plan
  "price_1RMqH7Df8kAOBAT30BGfHv66": { images: 50, videos: 40, slideshows: 100 }, // Monthly
  "price_1RMqHMDf8kAOBAT3bCTcdNwq": { images: 50, videos: 40, slideshows: 100 }, // Yearly
  // Business Plan
  "price_1RMqHgDf8kAOBAT3m6kthIND": { images: 120, videos: 90, slideshows: 250 }, // Monthly
  "price_1RMqI1Df8kAOBAT3Xoy3M7Ho": { images: 120, videos: 90, slideshows: 250 } // Yearly

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

// --- NEW: Cloud Tasks Configuration for Image Generation ---
const imageGenTasksQueueName = 'image-generation-queue'; // New queue for image generation tasks
const imageGenTaskHandlerUrl = `https://${tasksLocation}-${tasksProjectId}.cloudfunctions.net/performImageGenerationTask`; // URL for the new image generation handler
const IMAGE_GEN_TIMEOUT_SECONDS = 8 * 60; // 8 minutes for image generation, adjust as needed

// --- NEW: Cloud Tasks Configuration for Video Concatenation ---
const concatTasksQueueName = 'video-concatenation-queue'; // New queue for concatenation tasks
const concatTaskHandlerUrl = `https://${tasksLocation}-${tasksProjectId}.cloudfunctions.net/performVideoConcatenation`; // URL for the new concatenation handler
const VIDEO_CONCAT_TIMEOUT_SECONDS = 15 * 60; // 15 minutes for concatenation, adjust as needed

// --- NEW: Cloud Tasks Configuration for Video Pipeline Initiation ---
const videoPipelineTasksQueueName = 'video-pipeline-queue'; // New queue for starting video pipeline
const videoPipelineTaskHandlerUrl = `https://${tasksLocation}-${tasksProjectId}.cloudfunctions.net/startVideoPipeline`;
const VIDEO_PIPELINE_TIMEOUT_SECONDS = 540; // Timeout for the pipeline initiation function

// --- NEW: Cloud Tasks Configuration for Direct Image Generation (Polling) ---
// const directImageGenTasksQueueName = 'direct-image-generation-queue'; 
// const directImageGenTaskHandlerUrl = `https://${tasksLocation}-${tasksProjectId}.cloudfunctions.net/performDirectImageGenerationTask`;
// const DIRECT_IMAGE_GEN_TIMEOUT_SECONDS = IMAGE_GEN_TIMEOUT_SECONDS; // Can reuse existing timeout or define a new one

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
    "description": "Generates text content for a 4-image TikTok-style slideshow using a chosen background.",
     "parameters": [
       { "name": "topic", "type": "string", "description": "The central theme or subject for the slideshow text if specific slide text is not provided.", "required": false },
       { "name": "slide_1_text", "type": "string", "description": "Optional. Specific text for the first slide.", "required": false },
       { "name": "slide_2_text", "type": "string", "description": "Optional. Specific text for the second slide.", "required": false },
       { "name": "slide_3_text", "type": "string", "description": "Optional. Specific text for the third slide.", "required": false },
       { "name": "slide_4_text", "type": "string", "description": "Optional. Specific text for the fourth slide.", "required": false },
       { "name": "background_name", "type": "string", "description": "Optional. The name of a background image from user settings. If omitted, a suitable one is chosen.", "required": false },
       { "name": "image_style", "type": "string", "description": "Optional. Consistent artistic style for text overlays or minor visual elements.", "required": false },
       // --- ADDED LANGUAGE PARAMETER ---
       { "name": "language", "type": "string", "description": "Optional. The language for the generated slide text (e.g., 'en', 'es', 'tr'). Default: 'en'.", "required": false }
    ]
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

  // --- AUTHENTICATION COMMANDS (700-799) ---
  {
    "code": 701,
    "name": "LOG_OUT",
    "description": "Logs the user out of the application.",
    "parameters": [] // No parameters needed for logout
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

exports.parseUserCommand = onCall({region: 'us-central1', timeoutSeconds: 540}, async (request) => {
  // For v2 onCall, data is in request.data
  const data = request.data;
  // Authentication info is in request.auth
  // const auth = request.auth;

  // --- Initialize OpenAI Client within the handler ---
let openai;
try {
    // const functionsConfig = functions.config(); // Eski yöntem
    // const apiKey = functionsConfig.openai?.key; // Eski yöntem
    const apiKey = process.env.OPENAI_KEY; // YENİ YÖNTEM: process.env kullan

  if (!apiKey) {
      logger.error("OpenAI API Key not found in environment variables (OPENAI_KEY). Set using `firebase functions:config:set openai.key=...` or directly in environment.");
      throw new HttpsError('internal', 'OpenAI service is not available due to missing configuration.');
    }
      openai = new OpenAI({ apiKey: apiKey });
    logger.info("OpenAI SDK initialized successfully using process.env for this invocation.");

  } catch (error) {
    logger.error("Error initializing OpenAI within handler using process.env:", error);
    throw new HttpsError('internal', 'Failed to initialize OpenAI service.');
  }
  // --- End OpenAI Client Initialization ---

  // --- Güvenlik ve Girdi Kontrolü ---
  // Kimlik doğrulaması yapılmış kullanıcı mı kontrolü (opsiyonel ama önerilir)
  // if (!context.auth) {
  //   throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
  // }

  // OpenAI SDK başlatılamadıysa hata döndür - Bu kontrol artık yukarıdaki try/catch ile gereksizleşti, ama zararı yok.
  if (!openai) {
      logger.error("OpenAI SDK not initialized. Check configuration and logs.");
      throw new HttpsError('internal', 'OpenAI service is not available. Have you configured the API key?');
  }

  const userText = data.text;
  if (!userText || typeof userText !== 'string' || userText.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'The function must be called with a non-empty "text" argument.');
  }
  // --- NEW: Extract chatHistory ---
  const chatHistory = data.chatHistory || []; // Default to empty array if not provided
  logger.info("Received user text:", userText, "Chat History:", chatHistory);


  // --- Prompt Hazırlama ---
  // Komutları ve açıklamalarını içeren bir metin bloğu oluştur
  const commandDescriptions = commandDefinitions.map(cmd =>
    `Code: ${cmd.code}\nName: ${cmd.name}\nDescription: ${cmd.description}\nParameters: ${JSON.stringify(cmd.parameters)}\n---`
  ).join('\n');

  const formattedHistory = chatHistory.map(line => `${line}`).join('\n'); // Format history for prompt

  const prompt = `
    Analyze the user's request below. Your goal is to identify the single most appropriate command from the provided list that matches the user's primary intent. Extract values for ALL parameters (required and optional) defined for that command if they are present or clearly implied in the request.
    Consider the chat history provided for better context.

    Available Commands:
    ${commandDescriptions}

    Chat History (Last 5 exchanges):
    ${formattedHistory}

    Current User Request: "${userText}"

    **Matching Guidelines:**
    *   Focus on the core action the user wants (e.g., "generate video", "generate image", "add product", "log out").
    *   If the request clearly indicates video generation (e.g., contains "video", "tiktok video", "make a video"), strongly prefer command 101 (GENERATE_UGC_TIKTOK_VIDEO). Extract details like subject, action, setting etc., into its parameters.
    *   Similarly, prioritize image generation commands (201, 202, 203) if the intent is clearly about creating an image.
    *   If the user's request is ambiguous or doesn't align well with the intent of any command, return commandCode: 0.

    **Special Instructions for GENERATE_UGC_IMAGE (Code 202):** If you identify command 202, prioritize extracting the core descriptive text about the person into the 'subject_description' parameter. Then, attempt to separately extract specific optional parameters like 'age', 'gender', 'clothing_description', etc., from the user text if they are explicitly mentioned or clearly inferable *in addition* to the core description. The 'subject_description' should contain the main identifying information.

    Your response MUST be a JSON object containing:
    1.  "commandCode": The integer code of the matched command.
    2.  "parameters": An object containing values for **ALL parameters (both required and optional)** defined for the matched command, IF they are mentioned or can be reasonably inferred from the user text. If a parameter (required or optional) is not mentioned/found, use null for its value. If no parameters are defined for the command, provide an empty object {}.

    Example Response Format 1 (Required & Optional Params Found - Command 202):
    {
      "commandCode": 202,
      "parameters": {
        "subject_description": "25 year old blonde woman in a park wearing a red dress", // Core description
        "clothing_description": "wearing a red dress", // Extracted separately if possible
        "setting_description": "in a park", // Extracted separately
        "image_style": null,
        "age": 25, // Extracted separately
        "gender": "woman" // Extracted separately
      }
    }
    Example Response Format 2 (Only Subject Description Found - Command 202):
    {
        "commandCode": 202,
        "parameters": {
            "subject_description": "sad man looking out window",
            "clothing_description": null,
            "setting_description": null,
            "image_style": null,
            "age": null,
            "gender": "man" // Inferred
        }
    }
    Example Response Format 3 (Other Command Type):
    {
      "commandCode": 201,
      "parameters": {
         "scene_description": "futuristic city",
         "image_style": null
      }
    }
    Example Response Format 4 (No Parameters Needed):
    {
        "commandCode": 701,
        "parameters": {}
    }

    Analyze the user request: "${userText}" and provide the JSON output:
  `;

  // --- OpenAI Çağrısı ---
  try {
    logger.info("Sending prompt to OpenAI...");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // Model seçimini yapabilirsin
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1, // Daha deterministik sonuçlar için düşük sıcaklık
      response_format: { type: "json_object" }, // JSON çıktısı istediğimizi belirtelim
    });

    logger.info("Raw response from OpenAI:", completion.choices[0].message.content);

    // OpenAI'den gelen JSON yanıtını parse et
    const resultJsonString = completion.choices[0].message.content;
    let result;
    try {
        result = JSON.parse(resultJsonString);
    } catch (parseError) {
        logger.error("Error parsing JSON response from OpenAI:", parseError, "Raw response:", resultJsonString);
        throw new HttpsError('internal', 'Failed to parse response from AI service.');
    }


    // --- Yanıt Doğrulama ve İşleme ---
    if (!result || typeof result.commandCode !== 'number' || typeof result.parameters !== 'object') {
         logger.error("Invalid JSON structure received from OpenAI:", result);
         throw new HttpsError('internal', 'Received invalid structure from AI service.');
    }

    // Dönen commandCode'un tanımlı olup olmadığını kontrol et
    const commandDef = commandDefinitions.find(cmd => cmd.code === result.commandCode);
    // Check for code 0 specifically OR if the returned code isn't in our active list
    if (result.commandCode === 0 || !commandDef) {
        // Handle code 0 slightly differently in log if AI returned it directly
        if (result.commandCode === 0) {
             logger.info(`OpenAI determined no clear command match for: \"${userText}\". Returning code 0.`);
        } else { // Code wasn't 0, but not found in our list (should be less likely now)
             logger.error(`OpenAI returned an invalid or removed command code: ${result.commandCode}. User text: \"${userText}\"`);
        }
        return { commandCode: 0, parameters: {} }; 
    }

     // --- Parameter Extraction Logic (Revised) ---
     // Artık hem zorunlu hem isteğe bağlı parametreleri işlememiz lazım.
     const finalParameters = {};
     // Önce tüm tanımlı parametreleri null ile başlatalım
     commandDef.parameters.forEach(p => {
         finalParameters[p.name] = null;
     });
     // Sonra OpenAI'nin döndürdüğü ve null olmayan parametrelerle üzerine yazalım
     if (result.parameters) { // Check if parameters object exists
         Object.keys(result.parameters).forEach(paramName => {
             // Ensure the parameter name exists in our definition for the command
             if (commandDef.parameters.some(p => p.name === paramName)) {
                 // Assign the value if it's not explicitly null from OpenAI
                 if (result.parameters[paramName] !== null) {
                     finalParameters[paramName] = result.parameters[paramName];
                 }
                 // If OpenAI returned null, it stays null (as initialized)
        } else {
                 // Log if OpenAI returned a parameter not defined for this command
                 logger.warn(`OpenAI returned parameter '${paramName}' which is not defined for command ${result.commandCode}. Ignoring.`);
             }
         });
     }

     // Gerekli parametrelerin hala null olup olmadığını kontrol et (opsiyonel loglama)
     commandDef.parameters.forEach(p => {
         if (p.required && finalParameters[p.name] === null) {
              logger.warn(`Required parameter '${p.name}' for command ${result.commandCode} could not be extracted or was null.`);
              // We don't throw an error here, maybe subsequent functions handle missing required params
         }
     });
     // --- End Parameter Extraction Logic ---

    logger.info("Returning final result:", { commandCode: result.commandCode, parameters: finalParameters });
    // Sonucu istemciye gönder
    return { commandCode: result.commandCode, parameters: finalParameters };

  } catch (error) {
    logger.error("Error calling OpenAI or processing response:", error);
     // OpenAI'den gelen API hatalarını daha iyi loglamak için
     if (error instanceof OpenAI.APIError) {
       logger.error('OpenAI API Error:', error.status, error.name, error.headers, error.error);
       throw new HttpsError('internal', `OpenAI API Error: ${error.name}`);
     }
     // Diğer HttpsError'ları tekrar fırlat
     if (error instanceof HttpsError) {
       throw error;
     }
     // Diğer genel hatalar
    throw new HttpsError('internal', 'Failed to process command with AI service.', error.message);
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

    const maleTops = [
        "well-fitting plain white crew-neck t-shirt", "classic black v-neck t-shirt",
        "light blue button-down shirt (unbuttoned top button)", "grey Henley shirt with sleeves rolled up",
        "fitted dark grey polo shirt", "simple black tank top (showing athletic arms)",
        "open casual flannel shirt over a plain t-shirt", "comfortable knit sweater",
        "stylish bomber jacket over a t-shirt", "modern athletic zip-up hoodie"
    ];
    const maleBottoms = [
        "dark wash jeans", "chino pants", "beige shorts", "dark jeans",
        "comfortable trousers", "casual shorts (appropriate for setting)", "jeans",
        "dark pants", "jogger pants"
    ];
    // --- END REVISED CLOTHING LISTS ---

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
        finalClothing = maleTops[Math.floor(Math.random() * maleTops.length)] + " and " + maleBottoms[Math.floor(Math.random() * maleBottoms.length)];
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

    const instructionPrompt = `
    Generate a highly detailed, concise, and effective prompt for an AI image generator (gpt-image-1) to create a specific type of image.

    Objective: Create a high-quality, realistic photograph capturing a modern influencer aesthetic, shot from a **closer, more intimate natural selfie perspective** (phone not visible, arm should appear relaxed and not fully extended, suggesting the phone is held comfortably closer to the body). The entire image, including the background and all its elements, MUST be in sharp focus. Strictly avoid any depth of field effects, bokeh, or background blur.

    Core Subject: Base the image entirely on this description: "${subject_description}". 
    Ensure the subject clearly appears as a ${subjectTerm}. 
    ${age && parseInt(age, 10) >= 18 ? `The subject should appear to be approximately ${parseInt(age, 10)} years old.` : ''}
    Create a conventionally attractive face. Enhance the base description by naturally incorporating details like: ${featureEmphasisString}.
    Incorporate highly detailed and realistic skin texture, including visible pores, fine lines, slight asymmetries, and natural imperfections like occasional minor blemishes or moles (if appropriate for the character and not distracting). Emphasize natural skin oils/sheen rather than a matte finish. Ensure realistic and varied eye reflections, avoiding perfectly symmetrical or unnatural catchlights. // Realism details (updated from realismDetails variable)
    ${makeupInstruction} // Apply makeup instruction based on gender
    Hair should appear healthy, well-styled (could be slightly tousled or styled), and realistic, with natural flyaways and texture.
    Enhance with subtle realistic details like natural skin texture, hair strands, eye reflections, unless specified otherwise.
    
    Body Shape: ${bodyShapePromptSegment} Ensure the overall description is SFW.

    Accessories: **Minimal and subtle accessories like a simple necklace, a delicate bracelet, or a few understated rings are acceptable if they complement the overall modern and natural style. Avoid large, distracting, or excessive jewelry. Also avoid sunglasses and hats unless they are explicitly part of the \`subject_description\` or \`clothing_description\` parameters.** Focus on the core subject and clothing.
    
    Required Elements (Use provided values):
    1.  Clothing: The subject is wearing: "${finalClothing}". Describe the fit (e.g., 'well-fitting', 'slightly oversized'), fabric, color (dont make same thing for top and bottom), and subtle details. Clothing should align with a modern, trendy style. Ensure clothing is appropriate for the setting: "${finalSetting}". Describe any subtle cleavage appropriately if relevant to the neckline.
    2.  Setting: The user-specified setting (provided as \`finalSetting\`) is paramount and MUST NOT be changed or ignored in favor of other examples or common settings. The scene MUST be exactly: "${finalSetting}". Describe this specific setting effectively. ${backgroundEnhancement} The setting should complement the subject and overall aesthetic. It is CRITICAL that the entire scene, especially the background, is rendered in sharp, crisp focus. Absolutely NO background blur (bokeh) or depth of field effects are permitted. The background should feel authentic and lived-in, not overly pristine, staged, or artificially perfect. Include subtle signs of normal use or slight, natural disarray if appropriate for the setting (e.g., a slightly creased cushion on a cafe chair, a few stray leaves on a park bench, minor scuffs on a wall). Avoid unnaturally clean or empty spaces unless specifically part of the setting\'s description.
    3.  Camera & Lens: The shot is taken with a high-quality digital camera system known for sharp, detailed images across the entire frame. // REMOVED Canon EOS R5, 85mm lens, f/1.4 aperture
    4.  Lighting: Describe lighting that is **highly specific and natural to the provided setting ("${finalSetting}")**. For instance, if the setting is a car during the day, describe sunlight streaming through windows, casting distinct highlights and shadows on the interior and subject. If it's a cozy room at night, describe warm lamplight or soft ambient light from specific sources. The lighting MUST realistically illuminate both the subject and the background, creating a cohesive and believable scene. Detail the direction, quality (e.g., soft, harsh, diffused), and color temperature of the main light sources appropriate for "${finalSetting}". Avoid generic studio lighting unless the setting itself IS a photo studio. The chosen lighting should visibly affect the subject, including their clothing (revealing texture) and skin (e.g., creating natural highlights and shadows).
    5.  Color & Grading: cinematic color grading, warm tones, soft contrast, subtle film grain. Colors should appear natural and not overly saturated.
    6.  Composition & Pose: Portrait orientation. The composition and framing should be natural and contextually appropriate for the setting ("${finalSetting}") and the selfie perspective.
        *   If the subject is in a confined space like a **car**, the framing MUST be a **chest-up or close-up portrait focusing on the face and upper torso only**. Use a slightly lower camera angle typical of a relaxed car selfie. **Crucially, DO NOT attempt to show the subject's lap, legs, shorts, or pants.** The composition should feel tight and intimate, as if taken naturally by someone holding a phone in a seated car position. The arm holding the (unseen) phone should appear relaxed and close to the body.
        *   If the subject is **seated at a table or standing**, a composition from the waist up or a head and shoulders frame shot from roughly eye-level or slightly above could be natural.
        *   Prioritize a natural and unforced pose. The subject should have the gaze "${finalGaze}" and expression "${finalExpression}". Ensure the head does not appear disproportionately large due to an overly close or wide-angle effect unless that's a specific artistic choice for a typical selfie. The framing should feel intentional and aesthetically pleasing for an influencer-style shot.
    7.  Overall Style: The image MUST have the style: \"${finalStyle}\". Emphasize realistic details, natural or complementary lighting. **Ensure sharp focus throughout the entire image, explicitly including the background.** Strictly avoid *any* artificial background blur, bokeh, or shallow depth-of-field effects, unless the user's 'style' parameter explicitly requests it (e.g., 'style: portrait with blurred background'). Aim for a high-quality camera look (like a high-end smartphone used for the implied selfie perspective).

    Safety Compliance: PRIORITIZE generating Safe-For-Work (SFW) content that strictly adheres to OpenAI's safety policies. Avoid any suggestive, overly revealing, or borderline content. Ensure the final prompt is clearly SFW.

    Output Requirements:
    - Combine all elements into a single, coherent paragraph.
    - The output MUST be ONLY the generated prompt string, with no introductory text, explanations, or labels.
    - Focus on descriptive keywords and photorealistic details suitable for gpt-image-1.
    - Ensure the prompt is safe for work.

    Example Output Format (Illustrative - Body description varies):
    "Photo, selfie perspective (phone not visible): A [age, ${subjectTerm}, ethnicity, attractive face with ${featureEmphasisString}, realistic skin texture with natural imperfections, styled yet natural hair, ${subjectTerm === 'man' ? 'no makeup' : 'natural glam makeup'}, minimal subtle jewelry like a simple necklace or rings may be present if natural for the style] with a [body description based on logic above], striking a natural and unforced pose. The framing is [AI-described composition, e.g., 'a slightly low-angle car selfie from the chest up, focusing tightly on her face and upper torso' or 'a waist-up shot as she stands near the window'], ensuring a natural head-to-body ratio. Gaze is ${finalGaze} with a ${finalExpression}. They are wearing a trendy [detailed clothing description: ${finalClothing}] appropriate for the setting and gender. The background is exactly [detailed setting description: ${finalSetting}] rendered in sharp, crisp focus throughout, showing authentic, lived-in details. The scene is illuminated by [AI-described lighting specific to the setting, e.g., 'bright, slightly hazy afternoon sunlight filtering through the cafe window, creating soft highlights on her face and the table'], creating a cohesive and natural ambiance. Dynamic composition, high-quality realistic photograph, fashion focus, with a \'found photo\' feel."

    // Note: The example output above still uses the variable ${finalGaze}, which is now hardcoded to 'looking directly at the camera lens'.

    Generate the prompt now based on the provided details.
`;

    logger.info("Generating detailed prompt for influencer style with GPT-4o:", instructionPrompt);

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
        return detailedPrompt;

    } catch (error) {
        logger.error("Error calling GPT-4o for detailed prompt generation:", error);
        throw new HttpsError('internal', 'Failed to generate detailed image prompt using helper AI.', error.message);
    }
}

// --- generateImage Function (Reverted to Synchronous Direct Call) ---
exports.generateImage = onCall({region: 'us-central1', timeoutSeconds: 540}, async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
        logger.error("generateImage called without authentication.");
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const data = request.data; // Contains commandCode and parameters like subject_description, scene_description, image_subject, style etc.
    if (!data || !data.commandCode) {
        throw new HttpsError('invalid-argument', 'Missing commandCode in request.');
    }

    // Kredi kontrolü isteğiniz üzerine buradan kaldırıldı. Ön yüzde yapılacağı varsayılıyor.
    // logger.info(`User ${userId} attempting direct image generation. Credit check handled by frontend.`);

    // --- NEW: Firestore Transaction for Credit Check and Decrement ---
    const userRef = db.collection('users').doc(userId);
    try {
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new HttpsError('not-found', 'User profile not found for credit check.');
            }
            const currentCredits = parseInt(userDoc.data()?.image_credit, 10) || 0;
            if (currentCredits <= 0) {
                throw new HttpsError('resource-exhausted', 'Insufficient image credits.');
            }
            // Decrement image_credit
            transaction.update(userRef, { image_credit: admin.firestore.FieldValue.increment(-1) });
            logger.info(`Image credit decremented for user ${userId}. New count (approx): ${currentCredits - 1}`);
        });
    } catch (error) {
        logger.error(`Error during image credit transaction for user ${userId}:`, error);
        if (error instanceof HttpsError) throw error; // Re-throw HttpsError
        throw new HttpsError('internal', 'Failed to process image credits.'); // Generic error for others
    }
    // --- END NEW: Firestore Transaction ---

    let openai;
    try {
        const apiKey = process.env.OPENAI_KEY;
        if (!apiKey) {
            logger.error("generateImage: OpenAI API Key not found (OPENAI_KEY).");
            throw new HttpsError('internal', 'OpenAI service configuration error.');
        }
        openai = new OpenAI({ apiKey: apiKey });
    } catch (error) {
        logger.error("generateImage: Failed to initialize OpenAI service:", error);
        throw new HttpsError('internal', 'Failed to initialize OpenAI service.');
    }

    try {
        const commandCode = data.commandCode;
        let finalPromptToUse;
        let imageStyle = data.style; // Common parameter

        logger.info(`[DirectGenerate ${userId}] Received command code: ${commandCode}, Params:`, data);

        if (commandCode === 202) { // GENERATE_UGC_IMAGE
            logger.info(`[DirectGenerate ${userId}] Command code 202 (UGC Image). Generating detailed prompt...`);
            if (!data.subject_description) {
                // throw new HttpsError('invalid-argument', 'Missing required parameter for UGC Image: subject_description');
                throw new HttpsError('invalid-argument', "Please provide a description for the subject of the UGC image. For example, 'a woman smiling' or 'a man holding a product'.");
            }
            // generateDetailedUgcPrompt'u çağıralım (bu fonksiyonun dosyanızda olduğunu varsayıyorum)
            finalPromptToUse = await generateDetailedUgcPrompt({
                subject_description: data.subject_description,
                clothing: data.clothing_description,
                setting: data.setting_description,
                style: data.image_style, // Parametre adını eşleştir
                age: data.age,
                gender: data.gender
            }, openai); // openai instance'ını paslıyoruz
            imageStyle = imageStyle || 'ultra-realistic photograph, UGC style'; 
        } else if (commandCode === 201) { // GENERATE_BACKGROUND_IMAGE
             if (!data.scene_description) {
                // throw new HttpsError('invalid-argument', 'Missing required parameter for Background Image: scene_description');
                throw new HttpsError('invalid-argument', "Please describe the scene for the background image. For example, 'a bright and modern office' or 'a serene beach at sunset'.");
             }
             finalPromptToUse = data.scene_description;
             imageStyle = imageStyle || 'photorealistic'; 
             logger.info(`[DirectGenerate ${userId}] Command code 201. Using direct prompt: "${finalPromptToUse}"`);
        } else if (commandCode === 203) { // GENERATE_RANDOM_IMAGE
             if (!data.image_subject) {
                 // throw new HttpsError('invalid-argument', 'Missing required parameter for Random Image: image_subject');
                 throw new HttpsError('invalid-argument', "Please provide a subject for the image. For example, you can say 'generate an image of a futuristic city' or 'a cat wearing a hat'.");
             }
             finalPromptToUse = data.image_subject;
             imageStyle = imageStyle || 'photorealistic';
             logger.info(`[DirectGenerate ${userId}] Command code 203. Using direct prompt: "${finalPromptToUse}"`);
        } else {
            throw new HttpsError('invalid-argument', `Unsupported command code (${commandCode}) for direct image generation.`);
        }
        
        logger.info(`[DirectGenerate ${userId}] Generating image with final prompt: "${finalPromptToUse}", Style: ${imageStyle}, Quality: hd`);

        const imageGenResponse = await openai.images.generate({
            model: "gpt-image-1", 
            prompt: finalPromptToUse,
            n: 1,
            size: "1024x1536",
            quality: "high", // Use 'high' as requested
        });

        const base64Data = imageGenResponse.data && imageGenResponse.data.length > 0 ? imageGenResponse.data[0]?.b64_json : null;

        if (!base64Data) {
            logger.error(`[DirectGenerate ${userId}] AI response did not contain base64 image data (b64_json).`, { data: imageGenResponse.data });
            throw new HttpsError('internal', "AI did not return base64 image data.");
        }

        const imageBuffer = Buffer.from(base64Data, 'base64');
        const fileName = `direct_generations/${userId}/${Date.now()}_${commandCode}.png`; 
        const file = bucket.file(fileName);

        logger.info(`[DirectGenerate ${userId}] Uploading image to Storage: ${fileName}`);
        await file.save(imageBuffer, {
            metadata: { contentType: 'image/png' },
            public: true
        });
        const publicUrl = file.publicUrl();
        logger.info(`[DirectGenerate ${userId}] Image uploaded successfully. Public URL: ${publicUrl}`);

        // Firestore generations koleksiyonuna kaydet
        try {
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
            };
            await generationDocRef.set(generationData);
            logger.info(`[DirectGenerate ${userId}] Successfully wrote to generations collection for image: ${generationDocRef.id}`);

            // *** ADD firestoreDocId to the return object ***
            return {
                success: true,
                message: "Image generated and uploaded successfully.",
                imageUrl: publicUrl,
                firestoreDocId: generationDocRef.id, // <-- ADDED THIS LINE
                finalPrompt: finalPromptToUse,
                originalParameters: data // İstemci tarafında gerekebilecek orijinal parametreleri geri döndür
            };

        } catch (firestoreError) {
            logger.error(`[DirectGenerate ${userId}] Failed to write to generations collection:`, firestoreError);
            // We don't re-throw here to ensure the image URL is still returned to the client
            // The image was successfully generated and stored, logging is a secondary concern.
            // *** Ensure we still return the image URL even if Firestore write fails, but now also try to include a null firestoreDocId or indicate failure ***
            return {
                success: true, // Image itself was generated
                message: "Image generated, but failed to save metadata to Firestore.",
                imageUrl: publicUrl,
                firestoreDocId: null, // Indicate Firestore save failed
                finalPrompt: finalPromptToUse,
                originalParameters: data,
                errorSavingMetadata: true // Add a flag
            };
        }

    } catch (error) {
        logger.error(`Error in direct generateImage for user ${userId}:`, error);
        if (error instanceof HttpsError) throw error;
        if (error instanceof OpenAI.APIError) {
            logger.error('[DirectGenerate OpenAI API Error]:', error.status, error.name, error.message, error.headers);
            // --- NEW: Attempt to refund credit if OpenAI API call fails ---
            try {
                await userRef.update({ image_credit: admin.firestore.FieldValue.increment(1) });
                logger.info(`Image credit refunded for user ${userId} due to OpenAI API error.`);
            } catch (refundError) {
                logger.error(`Failed to refund image credit for user ${userId} after OpenAI API error:`, refundError);
            }
            // --- END NEW ---
            throw new HttpsError('internal', `OpenAI API Error: ${error.name} - ${error.message}`);
        }
        // --- NEW: Attempt to refund credit if other internal error occurs ---
        try {
            await userRef.update({ image_credit: admin.firestore.FieldValue.increment(1) });
            logger.info(`Image credit refunded for user ${userId} due to internal error: ${error.message}`);
        } catch (refundError) {
            logger.error(`Failed to refund image credit for user ${userId} after internal error:`, refundError);
        }
        // --- END NEW ---
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
    "The person raises their eyebrows in brief surprise, then smiles softly while looking into the camera."
];
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

// --- OLD generateImageForVideo is now replaced by the two functions above ---
// exports.generateImageForVideo = onCall(...)

// --- triggerVideoGenerationAndHook Function (MODIFIED TO WAIT FOR IMAGE URL) ---
exports.triggerVideoGenerationAndHook = onCall({ region: 'us-central1', timeoutSeconds: 540 }, async (request, context) => { 
    const { userId, firestoreDocId, hook_text, language } = request.data; // Extract userId and other params from request.data

    // Manuel userId kontrolü
    if (!userId) {
        logger.error("triggerVideoGenerationAndHook: Manuel userId gönderilmedi veya request.data içinde bulunamadı.");
        throw new HttpsError('invalid-argument', 'userId parametresi eksik veya hatalı gönderildi.');
    }
    logger.info(`triggerVideoGenerationAndHook fonksiyonu manuel userId ile çağrıldı: ${userId}, docId: ${firestoreDocId}`);

    // Validate essential parameters
    if (!firestoreDocId) {
        logger.error("Validation Error: firestoreDocId is missing in the request.");
        throw new HttpsError('invalid-argument', 'The function must be called with a "firestoreDocId".');
    }
    // language validation (optional based on requirements)

    const userRef = db.collection('users').doc(userId);
    const postDocRef = userRef.collection('tiktok-posts').doc(firestoreDocId);

    // --- Wait for Initial Image URL --- 
    const MAX_WAIT_SECONDS = 75; // Max time to wait for image URL (adjust as needed)
    const POLLING_INTERVAL_MS = 3000; // Check every 3 seconds
    let initialImageUrl = null;
    let postData = null;
    let waitTime = 0;

    logger.info(`[${firestoreDocId}] Waiting for initialImageUrl...`);
    while (waitTime < MAX_WAIT_SECONDS * 1000) {
        const docSnapshot = await postDocRef.get();
        if (!docSnapshot.exists) {
            logger.error(`[${firestoreDocId}] Firestore document disappeared while waiting for image URL.`);
            throw new HttpsError('not-found', `Document ${firestoreDocId} not found during wait.`);
        }
        postData = docSnapshot.data();
        initialImageUrl = postData.initialImageUrl;
        const imageStatus = postData.status;

        if (initialImageUrl) {
            logger.info(`[${firestoreDocId}] initialImageUrl found: ${initialImageUrl}`);
            break; // URL found, exit loop
        } else if (imageStatus === 'image_gen_failed') {
            logger.error(`[${firestoreDocId}] Image generation failed (status: 'image_gen_failed') while waiting.`);
            throw new HttpsError('failed-precondition', `Image generation failed: ${postData.error || 'Unknown image generation error'}`);
        }

        // Not ready yet, wait and check again
        logger.info(`[${firestoreDocId}] Image URL not ready yet (Status: ${imageStatus}). Waiting ${POLLING_INTERVAL_MS / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL_MS));
        waitTime += POLLING_INTERVAL_MS;
    }

    if (!initialImageUrl) {
        logger.error(`[${firestoreDocId}] Timed out after ${MAX_WAIT_SECONDS}s waiting for initialImageUrl.`);
        await postDocRef.update({ status: 'image_gen_timeout', error: `Timed out waiting for initial image URL after ${MAX_WAIT_SECONDS}s.` });
        throw new HttpsError('deadline-exceeded', `Timed out waiting for the initial image to be generated.`);
    }
    // --- End Wait for Initial Image URL ---


    logger.info(`Starting main logic of triggerVideoGenerationAndHook for user: ${userId}, doc: ${firestoreDocId}`);
    
    // --- 1. Fetch Firestore Document (Data is already in postData from the wait loop) ---
    // No need to fetch again, use postData obtained during the wait
    logger.info(`Using fetched postData for doc ${firestoreDocId}. Initial image URL: ${initialImageUrl}`);

    // --- 1.5 Fetch User Products and Select First --- 
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
        logger.error(`Error fetching products for user ${userId} in triggerVideoGenerationAndHook:`, error);
        // Proceed without appending, don't throw error for this
        // productToUseForAppending remains with null url
    }
    // --- End Fetch User Products --- 

    // --- 2. Generate Hook Text (if needed) --- 
    let openai; // Initialize OpenAI client
    try {
        const apiKey = process.env.OPENAI_KEY;
        if (!apiKey) {
            logger.error("OpenAI API Key for hook text generation not found in environment variables (OPENAI_KEY).");
            throw new HttpsError('internal', 'OpenAI service configuration error for hook generation.');
        }
        openai = new OpenAI({ apiKey: apiKey });
    } catch (error) { 
        logger.error("Error initializing OpenAI for hook text generation:", error);
        if (error instanceof HttpsError) { // Re-throw HttpsError if it's already one
            throw error;
        }
        // Wrap other errors as HttpsError for consistent error handling by the caller
        throw new HttpsError('internal', `Failed to initialize OpenAI service for hook text: ${error.message}`); 
    }

    let finalHookText = hook_text;
    if (!finalHookText) {
        try {
            // ... (logic to get product context string `productContext` if selectedProduct exists)
            let productContext = '';
             if (selectedProduct && selectedProduct.name && selectedProduct.description) {
                productContext = `\n\nConsider this product: ${selectedProduct.name}: ${selectedProduct.description.substring(0,150)}...\n`;
             }
            const originalParams = postData.originalParameters || {};
             const hookPrompt = `Generate a very short, catchy hook text suitable for a TikTok video intro, in ${language || 'en'}. The video involves: ${originalParams.subject_description || 'a person'} ${originalParams.action_description || 'smiling'} in ${originalParams.setting_description || 'a studio'}. Keep it under 10 words. Hook text only.${productContext}`; // Append product context
             // ... (Call OpenAI, set finalHookText, handle errors as before) ...
            const completion = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: hookPrompt }], temperature: 0.8, max_tokens: 30 });
             finalHookText = completion.choices[0]?.message?.content?.trim().replace(/"/g, '');
            if (!finalHookText) { logger.warn("GPT-4o-mini failed hook, using default."); finalHookText = "Check this out!"; }
              else { logger.info(`Generated hook: "${finalHookText}"`); }
        } catch (error) { logger.error("Error generating hook text:", error); finalHookText = "Check this out!"; }
    } else {
        logger.info(`Using user-provided hook: "${finalHookText}"`);
    }

    // --- 3. Call RunwayML Image-to-Video --- 
    let runwayTaskId; // Declare runwayTaskId here, will be set by the API call
    try {
        const runwayApiKey = process.env.RUNWAY_KEY;
        if (!runwayApiKey) {
            logger.error("Runway API key (RUNWAY_KEY) is not configured.");
            throw new HttpsError('internal', 'RunwayML API key not configured.');
        }

        // Re-check initialImageUrl just in case (although the wait loop should guarantee it)
        if (!initialImageUrl) {
            logger.error("Cannot call Runway without initialImageUrl (check after wait loop).");
            throw new HttpsError('failed-precondition', 'Initial image URL is missing, cannot trigger video generation.');
        }

        // Select a random video prompt/hook from the new list
        const videoPrompt = runwayVideoPrompts[Math.floor(Math.random() * runwayVideoPrompts.length)];

        // ADDED: Define the API endpoint for RunwayML image-to-video
        const runwayApiEndpoint = "https://api.dev.runwayml.com/v1/image_to_video"; 

        const requestBody = {
            model: "gen4_turbo", 
            promptImage: initialImageUrl, // MODIFIED: Changed from imageUrl to promptImage
            promptText: videoPrompt, 
            seed: Math.floor(Math.random() * 1000000),
            duration: 5, // seconds
            ratio: "720:1280",
            motion: 4 // Example motion value, adjust as needed
        };

        logger.info(`Calling RunwayML API (${runwayApiEndpoint}) with body:`, requestBody);

        const response = await axios.post(runwayApiEndpoint, requestBody, {
            headers: {
                'Authorization': `Bearer ${runwayApiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json', // ADDED Accept header
                'X-Runway-Version': '2024-11-06'
            }
        });

        logger.info("Full response from RunwayML API:", response.data); // ADDED: Log the full API response

        if (response.data && response.data.uuid) { // Runway often uses 'uuid' for task ID
            runwayTaskId = response.data.uuid;
            logger.info(`RunwayML task submitted successfully. Task ID (uuid): ${runwayTaskId}`);
        } else if (response.data && response.data.task_id) { // Fallback to 'task_id'
            runwayTaskId = response.data.task_id;
            logger.info(`RunwayML task submitted successfully. Task ID (task_id): ${runwayTaskId}`);
        } else if (response.data && response.data.id) { // ADDED: Fallback to 'id' as per user's old helper
            runwayTaskId = response.data.id;
            logger.info(`RunwayML task submitted successfully. Task ID (id): ${runwayTaskId}`);
        } else {
            logger.error("RunwayML API response did not contain a recognizable task ID (uuid, task_id, or id).", response.data);
            throw new HttpsError('internal', 'Failed to get a valid task ID from RunwayML.');
        }

    } catch (runwayError) {
        logger.error(`Error calling RunwayML API for document ${firestoreDocId}:`, runwayError.response ? runwayError.response.data : runwayError.message);
        let errorMessage = 'Failed to submit to RunwayML.';
        if (runwayError.response && runwayError.response.data && runwayError.response.data.error) {
            errorMessage = `RunwayML Error: ${runwayError.response.data.error}`;
        }
        await postDocRef.update({ status: 'runway_submission_failed', error: errorMessage, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        throw new HttpsError('internal', `Failed to trigger video generation with RunwayML: ${errorMessage}`);
    }
    // --- End Call RunwayML Image-to-Video ---

    // --- 4. Update Firestore & Schedule Poll (MODIFIED) ---
    try {
        const startTime = Date.now(); // Record start time for polling deadline
        const updatePayload = {
            status: 'processing', 
            hookText: finalHookText, // Save the final hook
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
            const currentCredits = parseInt(userSnapshot.data()?.video_credit, 10) || 0;
            if (currentCredits <= 0) {
                // This specific HttpsError will be caught by the main try-catch block
                throw new HttpsError('resource-exhausted', 'Insufficient video credits during transaction in startVideoPipeline.');
            }
            transaction.update(postDocRef, updatePayload);
            transaction.update(userRef, { video_credit: admin.firestore.FieldValue.increment(-1) });
        });
        logger.info(`Transaction successful: Updated tiktok-post ${firestoreDocId} (status, hook, runwayId, product) & decremented video_credit.`);

        // --- Schedule the first polling task ---
        const pollTaskPayload = {
            userId: userId, // Pass userId
            firestoreDocId: firestoreDocId,
            runwayTaskId: runwayTaskId,
            startTime: startTime, // Pass the initial startTime for polling duration checks
            attempt: 1 // Initial attempt
        };

        const task = {
            httpRequest: {
                httpMethod: 'POST',
                url: runwayTaskHandlerUrl, // Defined at the top of the file
                headers: { 'Content-Type': 'application/json' },
                body: Buffer.from(JSON.stringify(pollTaskPayload)).toString('base64'),
            },
            scheduleTime: {
                seconds: Math.floor(Date.now() / 1000) + POLLING_INTERVAL_SECONDS // Schedule for a bit later
            },
        };

        const parent = tasksClient.queuePath(tasksProjectId, tasksLocation, runwayTasksQueueName); // Defined at the top
        await tasksClient.createTask({ parent: parent, task: task });
        logger.info(`Runway polling task enqueued for doc ${firestoreDocId} to queue ${runwayTasksQueueName}. First poll in ${POLLING_INTERVAL_SECONDS}s.`);

    } catch (error) {
        logger.error(`Error during Firestore transaction or scheduling poll for ${firestoreDocId}:`, error);
        // Update Firestore with an error status if transaction/scheduling fails
        await postDocRef.update({
            status: 'scheduling_failed',
            error: `Failed to schedule polling: ${error.message}`,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // Rethrow error to ensure the client knows something went wrong if this part fails critically
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', `Failed to schedule video processing task: ${error.message}`);
    }

    // --- 5. Return Success Response (as before) --- 
    return {
        success: true,
        message: `Video generation started (Task ID: ${runwayTaskId}). Backend will process completion.`,
        data: { runwayTaskId: runwayTaskId } 
    };
});

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
                logger.info(`Firestore document ${firestoreDocId} updated to status 'pending_concatenation'. Runway video: ${runwayGeneratedVideoUrl}`);

                if (productUrlToAppend && productTypeToAppend) {
                    logger.info(`Product media found for doc ${firestoreDocId}. Enqueuing concatenation task.`);
                    const taskPayload = {
                        userId: userId,
                        firestoreDocId: firestoreDocId,
                        runwayVideoUrl: runwayGeneratedVideoUrl,
                        productMediaUrl: productUrlToAppend,
                        productMediaType: productTypeToAppend
                    };

                    const task = {
                        httpRequest: {
                            httpMethod: 'POST',
                            url: concatTaskHandlerUrl, // Use the new handler URL
                            headers: { 'Content-Type': 'application/json' },
                            body: Buffer.from(JSON.stringify(taskPayload)).toString('base64')
                        },
                        scheduleTime: {
                            seconds: Math.floor(Date.now() / 1000) + 5 // Schedule a few seconds in the future
                        }
                    };

                    const parent = tasksClient.queuePath(tasksProjectId, tasksLocation, concatTasksQueueName); // Use the new queue name
                    await tasksClient.createTask({ parent: parent, task: task });
                    logger.info(`Concatenation task enqueued for doc ${firestoreDocId} to queue ${concatTasksQueueName}.`);
                    response.status(200).send('Runway video ready. Concatenation task enqueued.');
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

    // --- FFMPEG Initialization for this function scope ---
    const ffmpeg = require('fluent-ffmpeg');
    const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
    ffmpeg.setFfmpegPath(ffmpegPath);
    const os = require('os'); // For temp directory
    // --- END FFMPEG Initialization ---

    // Destructure ALL parameters, including the new language parameter
    const { topic, slide_1_text, slide_2_text, slide_3_text, slide_4_text, background_name, image_style, language } = request.data;
    const targetLanguage = language || 'en'; // Default to English if not provided

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
        const currentCredits = parseInt(userDoc.data()?.slideshow_credit, 10) || 0;
        if (currentCredits <= 0) {
            throw new HttpsError('resource-exhausted', 'Insufficient slideshow credits to generate slideshow.');
        }
    } catch (error) {
        logger.error(`Error fetching user credits for slideshow (user ${userId}):`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', 'Could not verify user credits for slideshow.');
    }
    // --- End Credit Check ---

    let slideTexts = [slide_1_text, slide_2_text, slide_3_text, slide_4_text];
    const providedTextCount = slideTexts.filter(text => text && text.trim() !== '').length;
    const generationId = Date.now().toString();

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
                ${productContext ? 
                `IMPORTANT PRODUCT CONTEXT: ${productContext}
                Your first task is to deeply understand this product context. From this, you MUST derive a general THEME or TOPIC (e.g., if the product is about astrology, the theme is 'astrology'; if it's about Notion templates for students, the theme could be 'student productivity' or 'academic organization').
                DO NOT use the product's specific name, brand, or its exact features in the slide text. Instead, all slide text MUST be about the general THEME you derived.` 
                : 
                `The primary theme for this 4-slide slideshow is: "${effectiveTopic}".`}
                
                Generate text for each of the 4 slides IN ${targetLanguage.toUpperCase()}.
                Each slide's text MUST be short, engaging, and directly reflect the THEME (derived from product context if provided, otherwise from the "${effectiveTopic}").
                The tone should be natural, relatable, poetic, or intriguing.
                
                CRITICAL RULES FOR SLIDE TEXT:
                1. MUST NOT be a question of any kind. Do not end with a question mark.
                2. MUST NOT include generic calls to action or conversational phrases (e.g., avoid "Join the conversation", "How do you...", "Find your...", "Discover the...", "Check this out", "Stay tuned").
                3. MUST NOT mention any specific product names, brand names, or detailed product features from the context provided.
                4. MUST be a statement, a short piece of a narrative, an evocative description, or a relatable feeling connected to the derived THEME.

                Focus on making statements, telling a mini-story, or evoking an emotion related to the THEME.

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
            const currentCredits = parseInt(userSnapshot.data()?.slideshow_credit, 10) || 0;
            if (currentCredits <= 0) {
                throw new HttpsError('resource-exhausted', 'Insufficient slideshow credits during transaction for slideshow.');
            }
            transaction.update(userRef, { slideshow_credit: admin.firestore.FieldValue.increment(-1) });
            transaction.set(generationDocRef, generationData);
        });

        logger.info(`Slideshow generation record saved (ID: ${generationDocRef.id}) and credits decremented for user ${userId}. BG: ${selectedBackgroundImageName}, AI Selected ID: ${aiSelectedBackgroundId}`);
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
      allow_promotion_codes: true, // Allow discount codes
      success_url: process.env.STRIPE_SUCCESS_URL, // Use configured success URL
      cancel_url: process.env.STRIPE_CANCEL_URL,   // Use configured cancel URL
    });

    logger.info(`Created Stripe Checkout session ${session.id} for user ${userId}, customer ${stripeCustomerId}`);
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
                         const allocation = planCreditAllocations[priceId] || { images: 0, videos: 0, slideshows: 0 }; // MODIFIED FALLBACK
                         updateData.image_credit = allocation.images;
                         updateData.video_credit = allocation.videos;
                         updateData.slideshow_credit = allocation.slideshows; 
                         updateData.image_credit_limit = allocation.images;
                         updateData.video_credit_limit = allocation.videos;
                         updateData.slideshow_credit_limit = allocation.slideshows; 
                         logger.info(`Granting/updating credits for user ${userDocRef.id} (plan: ${priceId}) because subscription is active and not pending cancellation at period end.`);
                     } else {
                         logger.info(`Subscription for user ${userDocRef.id} (plan: ${priceId}, status: ${status}, cancel_at_period_end: ${dataObject.cancel_at_period_end}) is not eligible for credit refresh at this time.`);
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
                        image_credit: 0, // Reset credits
                        video_credit: 0,
                        slideshow_credit: 0,
                        image_credit_limit: 0, // Reset limits
                        video_credit_limit: 0,
                        slideshow_credit_limit: 0,
                        subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
                    };

                    await userDocRef.set(deletedUpdateData, { merge: true });
                    logger.info(`Updated Firestore for user ${userDocRef.id}: Subscription deleted, status set to 'deleted', credits reset.`);
                } else {
                    logger.warn(`Received subscription deleted event, but no user found with Stripe Customer ID: ${deletedCustomerId}`);
                }
                break;
            // --- END NEW CASE ---    

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

            const allocation = planCreditAllocations[priceId] || { images: 0, videos: 0, slideshows: 0 };
            if (allocation.images === 0 && allocation.videos === 0 && allocation.slideshows === 0 && priceId) {
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
                    image_credit: allocation.images,
                    video_credit: allocation.videos,
                    slideshow_credit: allocation.slideshows,
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
exports.performVideoConcatenation = onRequest(
    { region: 'us-central1', timeoutSeconds: VIDEO_CONCAT_TIMEOUT_SECONDS, memory: '2GiB' }, 
    async (request, response) => {
        const ffmpeg = require('fluent-ffmpeg');
        const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
        ffmpeg.setFfmpegPath(ffmpegPath);
        const fsPromises = require('fs').promises; 

        logger.info("performVideoConcatenation request received:", request.body);

        const {
            userId,
            firestoreDocId,
            runwayVideoUrl,
            productToAppendUrl, 
            productToAppendType, 
        } = request.body;

        if (!userId || !firestoreDocId || !runwayVideoUrl) {
            logger.error("Missing required parameters for video concatenation.", request.body);
            response.status(400).send("Bad Request: Missing userId, firestoreDocId, or runwayVideoUrl.");
            return;
        }

        const postDocRef = db.collection('users').doc(userId).collection('tiktok-posts').doc(firestoreDocId);
        const tempDir = path.join('/tmp', `concat_${firestoreDocId}_${Date.now()}`);
        
        let currentVideoPath; 
        let finalVideoToUploadPath; 
        let filesToCleanup = [];
        let postDataForLogging = {}; // Defined to be accessible in catch/finally

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
            postDataForLogging = postSnapshot.data(); // Assign data for potential use in catch block
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
                
                // More robust escaping for FFmpeg drawtext filter
                const escapedHookText = processedHookTextForDrawtext
                                        .replace(/\\/g, '\\\\')      // 1. Escape backslashes first
                                        .replace(/'/g, "\\'\\\'")    // 2. Escape single quotes (e.g., text='isn\'\'t it')
                                        .replace(/%/g, '\\%')        // 3. Escape percent signs
                                        .replace(/:/g, '\\:')        // 4. Escape colons
                                        .replace(/\n/g, '\\\\N');    // 5. Convert \n to FFmpeg\'s \\N for newlines in drawtext

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
            response.status(200).send("Video processing completed successfully.");

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
            response.status(500).send(`Internal Server Error during video processing: ${error.message}`);
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

                let imageBufferFromUrl;
                try {
                    const downloadResponse = await axios.get(baseImageUrl, { responseType: 'arraybuffer' });
                    imageBufferFromUrl = Buffer.from(downloadResponse.data);
                    logger.info(`[Task ${firestoreDocId}] Downloaded baseImageUrl (${baseImageUrl}). Size: ${imageBufferFromUrl.length} bytes.`);
                } catch (downloadError) {
                    logger.error(`[Task ${firestoreDocId}] Failed to download baseImageUrl (${baseImageUrl}):`, downloadError.message);
                    throw new Error(`Failed to download baseImage for editing: ${downloadError.message}`);
                }

                // Use the original imageBufferFromUrl and explicitly set the type for OpenAI
                const imageForEdit = await toFile(
                    imageBufferFromUrl, 
                    'source_image.png', // Filename can still be useful for OpenAI
                    { type: 'image/png' }  // <<< EXPLICITLY SETTING CONTENT TYPE
                );
                logger.info('Prepared downloaded image for SDK, explicitly setting type to image/png.');

                // Construct the prompt for images.edit
                let editPrompt = "The person in this image. ";

                const genderForClothing = generationParams.gender ? generationParams.gender.toLowerCase() : 'woman';

                // ---- COPIED LISTS ----
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
                const maleTops = [
                    "well-fitting plain white crew-neck t-shirt", "classic black v-neck t-shirt",
                    "light blue button-down shirt (unbuttoned top button)", "grey Henley shirt with sleeves rolled up",
                    "fitted dark grey polo shirt", "simple black tank top (showing athletic arms)",
                    "open casual flannel shirt over a plain t-shirt", "comfortable knit sweater",
                    "stylish bomber jacket over a t-shirt", "modern athletic zip-up hoodie"
                ];
                const maleBottoms = [
                    "dark wash jeans", "chino pants", "beige shorts", "dark jeans",
                    "comfortable trousers", "casual shorts (appropriate for setting)", "jeans",
                    "dark pants", "jogger pants"
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
                // ---- END COPIED LISTS ----

                if (clothing_description) {
                    editPrompt += `Change their clothing to: ${clothing_description}. `;
                } else {
                    let randomClothing;
                    if (genderForClothing === 'man') {
                        const randomTop = maleTops[Math.floor(Math.random() * maleTops.length)];
                        const randomBottom = maleBottoms[Math.floor(Math.random() * maleBottoms.length)];
                        randomClothing = `${randomTop} and ${randomBottom}`;
                    } else { // Default to female clothing
                        randomClothing = femaleClothingExamples[Math.floor(Math.random() * femaleClothingExamples.length)];
                    }
                    editPrompt += `Change their clothing to: ${randomClothing}. `;
                    logger.info(`User did not provide clothing_description. Randomly selected (gender: ${genderForClothing}): "${randomClothing}"`);
                }

                if (setting_description) {
                    editPrompt += `Change the background to: ${setting_description}. `;
                } else {
                    const randomSetting = settingExamples[Math.floor(Math.random() * settingExamples.length)];
                    editPrompt += `Change the background to: ${randomSetting}. `;
                    logger.info(`User did not provide setting_description. Randomly selected: "${randomSetting}"`);
                }
                
                editPrompt += "Hey gpt! I want to try different outfits and backgrounds. Can you please not change my face and body features, or general appearance. Please only modify specified clothing and/or background.";
                if (image_style) {
                    editPrompt += ` Apply an overall style of: ${image_style}.`;
                }

                generatedImagePrompt = editPrompt; // Store the prompt used for editing
                logger.info(`[Task ${firestoreDocId}] Prompt for images.edit: "${generatedImagePrompt}"`);

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
                generatedImagePrompt = await generateDetailedUgcPrompt(
                    {
                        subject_description,
                        clothing: clothing_description, // Pass clothing_description here as well
                        setting: setting_description,   // Pass setting_description here as well
                        style: image_style, age, gender
                    },
                    openai
                );
                logger.info(`[Task ${firestoreDocId}] Generating image with detailed prompt: "${generatedImagePrompt}"`);
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
                status: 'image_generated', initialImageUrl, generatedImagePrompt,
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
                const currentCredits = parseInt(userSnapshot.data()?.video_credit, 10) || 0;
                if (currentCredits <= 0) {
                    // This specific HttpsError will be caught by the main try-catch block
                    throw new HttpsError('resource-exhausted', 'Insufficient video credits during transaction in startVideoPipeline.');
                }
                transaction.update(postDocRef, updatePayload);
                transaction.update(userRef, { video_credit: admin.firestore.FieldValue.increment(-1) });
            });
            logger.info(`Transaction successful: Updated tiktok-post ${firestoreDocId} (status, hook, runwayId, product) & decremented video_credit.`);

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
                        error: errorToStore,
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

