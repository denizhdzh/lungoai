const functions = require('firebase-functions'); // <-- ADD THIS LINE
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onRequest } = require("firebase-functions/v2/https"); // Keep for the new task handler
const { onSchedule } = require("firebase-functions/v2/scheduler"); // <-- Import onSchedule
const { onObjectFinalized } = require("firebase-functions/v2/storage"); // <<< ADDED THIS LINE
const { logger } = require("firebase-functions");
const { OpenAI, toFile } = require("openai");
const Replicate = require("replicate");
// const { GoogleGenerativeAI } = require("@google/generative-ai"); // Removed - using Vertex AI instead
// Using direct API calls instead of VertexAI constructor
const admin = require("firebase-admin");
const { getStorage } = require('firebase-admin/storage');
const { FieldValue } = require('firebase-admin/firestore');
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

// --- OpenAI and Google AI Initialization ---
// Vertex AI API configuration
const VERTEX_AI_PROJECT = process.env.GCLOUD_PROJECT || 'lungoai-39982';
const VERTEX_AI_LOCATION = 'us-central1';
const IMAGEN_MODEL = 'imagen-4.0-generate-preview-06-06';
// --- NEW: Plan Credit Allocations (Backend) ---
const planCreditAllocations = {
  // Basic Plan ($9)
  "price_1RMqEZDf8kAOBAT3ltD6n2lX": { general_credits: 50 }, // Monthly Basic
  "price_1RMqGbDf8kAOBAT3vgwkWLr6": { general_credits: 50 }, // Yearly Basic
  // Pro Plan ($29)
  "price_1RY4EwDf8kAOBAT3qMaIMcdO": { general_credits: 300 }, // Monthly Pro
  "price_1RY4F6Df8kAOBAT34O2CKeCM": { general_credits: 300 }, // Yearly Pro
  // Business Plan ($49)
  "price_1RY4JdDf8kAOBAT3AWlBbEx3": { general_credits: 600 }, // Monthly Business
  "price_1RY4JuDf8kAOBAT3lrADc9fO": { general_credits: 600 }  // Yearly Business
};
// --- End Plan Credit Allocations ---

// --- Cloud Tasks Configuration ---
// TODO: Replace with your actual project ID, location, and queue name if different
const tasksProjectId = process.env.GCLOUD_PROJECT || 'lungoai-39982'; // Use environment variable or verify hardcoded ID
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

// --- NEW: Enhanced Prompt Generation Using Image Rules ---
async function enhancePromptWithRules(originalPrompt, subtype, selectedFrame, openaiInstance) {
    try {
        logger.info(`[enhancePromptWithRules] Processing: "${originalPrompt}" for subtype=${subtype}, frame=${selectedFrame}`);
        
        // Get the image rules from imageRules.json
        const imageRules = getImageSetRulesByFrameId(selectedFrame);
        if (!imageRules) {
            logger.warn(`[enhancePromptWithRules] No rules found for frame: ${selectedFrame}, using original prompt`);
            return originalPrompt;
        }
        
        // Apply general rules for UGC images
        const generalRules = getGeneralRulesForUGC();
        
        let enhancedPrompt;
        
        if (subtype === 'ugc_character') {
            // Use AI to enhance the prompt based on the selected frame rules
            enhancedPrompt = await generateEnhancedUGCPrompt(originalPrompt, imageRules, generalRules, openaiInstance);
        } else if (subtype === 'background') {
            // For background images, apply background-specific rules
            enhancedPrompt = await generateEnhancedBackgroundPrompt(originalPrompt, imageRules, openaiInstance);
        } else {
            // For general images, basic enhancement
            enhancedPrompt = await generateEnhancedGeneralPrompt(originalPrompt, imageRules, openaiInstance);
        }
        
        logger.info(`[enhancePromptWithRules] Enhanced prompt generated. Length: ${enhancedPrompt?.length}`);
        return enhancedPrompt;
        
    } catch (error) {
        logger.error(`[enhancePromptWithRules] Error enhancing prompt:`, error);
        return originalPrompt; // Fallback to original prompt
    }
}

function getImageSetRulesByFrameId(frameId) {
    logger.info(`[getImageSetRulesByFrameId] Looking for frameId: "${frameId}", type: ${typeof frameId}`);
    
    // Your detailed image rules from imageRules.json
    const frameMapping = {

         'late_night_lofi': {
             name: 'Late Night Lo-Fi Vibes',
             rules: {
                 must_have: [
                     "35mm film camera with direct flash or digital compact camera aesthetic",
                     "Nighttime or late evening setting with artificial lighting",
                     "Lo-fi, grainy texture and slightly soft focus",
                     "Direct flash creating harsh shadows and bright foreground",
                     "Casual, everyday clothing: t-shirts, sweatshirts, pajamas",
                     "Indoor settings: bedrooms, living rooms, kitchens",
                     "Spontaneous, candid poses and expressions",
                     "Vintage early 2000s camera quality with visible grain"
                 ],
                 must_not_have: [
                     "Professional DSLR quality or modern smartphone clarity",
                     "Bright daytime lighting or natural outdoor light",
                     "Formal clothing or overly styled outfits",
                     "Professional studio lighting or soft ambient lighting",
                     "High-resolution or pristine image quality",
                     "Posed or overly artistic compositions",
                     "Outdoor or professional settings"
                 ]
             }
         },
         
         'japanese_night_drive': {
             name: 'Japanese Night Drive',
             rules: {
                 must_have: [
                     "Focus on Japanese cars",
                     "Vibrant color filters (especially yellow and blue tones)",
                     "Nighttime setting with artificial lighting",
                     "Urban street backdrop with neon signs and store signs in Japanese/Kanji",
                     "Streetwear style clothing with edgy, casual vibe",
                     "Vehicles with sporty, customized designs",
                     "Elements that emphasize an energetic, youthful vibe"
                 ],
                 must_not_have: [
                     "Non-Japanese cars",
                     "Bright, daytime lighting",
                     "Minimal or natural lighting without neon or artificial effects",
                     "Relaxed or formal clothing styles",
                     "Rural or non-urban backgrounds",
                     "Classic or vintage cars that don't align with the sporty, customized aesthetic"
                 ]
             }
         }
    };
    
    const result = frameMapping[frameId] || null;
    logger.info(`[getImageSetRulesByFrameId] Available frames: ${Object.keys(frameMapping).join(', ')}`);
    logger.info(`[getImageSetRulesByFrameId] Result for "${frameId}": ${result ? 'FOUND' : 'NOT FOUND'}`);
    
    return result;
}

function getGeneralRulesForUGC() {
    return {
        color_palette: "Natural, muted tones dominate. Soft pastels, beige, cream, olive, muted blue used for both backgrounds and clothing. Only minimal pops of color for accessories (e.g. sunglasses, hairclips). Never use neon or highly saturated colors as main focus.",
        skin_tones: "True-to-life, realistic.",
        white_balance: "Neutral or slightly warm. No unnatural color casts.",
        contrast: "Moderate to low. Details must be visible in both shadows and highlights. No harsh lights or exaggerated contrast.",
        lighting: "Soft, ambient, diffuse. Use daylight, window light, or indirect interior lighting. No heavy flash or dramatic shadows. Natural daylight, gentle household bulbs, sometimes neon, but never theatrical lighting.",
        camera: "Casual digital (compact camera or smartphone look). No high-end DSLR or cinematic sharpness. Slight grain in low light is acceptable. Everything in frame must be sharp and in focus - no background blur allowed. Never extreme bokeh or any depth of field effects.",
        composition: "Subject is often centered or slightly off. Allow natural cropping (edges cut, not fully within frame). Frame fills with subject, avoid excessive negative space. Eye-level or slightly above. Mix of close-up and full-body shots. Occasional dynamic tilt, but should always feel candid.",
        background: "Authentic urban streets, cafes, rooms, elevators, cars, natural locations. Visual information is present but never cluttered. Background must be completely sharp and in focus - no blur allowed whatsoever. Everything in the scene should be crisp and clear.",
        style_and_pose: "Candid, relaxed, never overly staged. Subjects may look directly at camera or away. Authentic and natural, not 'model-like'. Sitting, leaning, casual movements preferred. Genuine, cool, relaxed moods. Expressions can be pensive, neutral, slightly playful—never exaggerated smiling or forced.",
        clothing: "Modern, trendy, urban streetwear, relaxed chic. Layers, oversized fits, minimal or subtle logos. Accessories include sunglasses, rings, hair clips. No retro, formal or costume styles.",
        post_processing: "Light, natural edits only. No heavy filters. Natural grain allowed. No obvious retouch, skin smoothing, or artificial effects. No studio look, glamour retouch, over-brightened skin, high dynamic range, cartoonish colors or contrasts.",
        overall_aesthetic: "Effortlessly cool, youthful, documentary-inspired, modern and realistic. Always avoid commercial, stylized, or studio portrait vibe."
    };
}

async function generateEnhancedUGCPrompt(originalPrompt, frameRules, generalRules, openaiInstance) {
    try {
        // Extract all rules into a comprehensive prompt
        const rules = frameRules.rules;
        
        const systemPrompt = `You are an expert at creating detailed image prompts for UGC (User Generated Content) style photographs. 

You will enhance the user's basic prompt with detailed visual specifications while keeping the original subject.

Original prompt: "${originalPrompt}"

INSTRUCTIONS:
1. Keep the original subject/person exactly as described
2. Add detailed visual specifications based on the style rules below
3. Create a comprehensive, single-paragraph prompt that includes camera, lighting, pose, clothing, and setting details
4. Make it sound natural and specific, not like a technical manual
5. IMPORTANT: Never include the camera itself in the image - no visible cameras, phones, or recording equipment should appear in the scene

CRITICAL STYLE RULES - THESE ARE ABSOLUTE AND NON-NEGOTIABLE:

MUST HAVE (These elements are absolutely required and cannot be changed or ignored):
${rules.must_have?.map(rule => `- ${rule}`).join('\n')}

MUST NOT HAVE (These elements are absolutely forbidden and impossible to include):
${rules.must_not_have?.map(rule => `- ${rule}`).join('\n')}

IMPORTANT ENFORCEMENT RULES:
- The MUST HAVE and MUST NOT HAVE rules are ABSOLUTE and cannot be modified, softened, or ignored
- If the user's original prompt conflicts with these rules, prioritize the MUST HAVE/MUST NOT HAVE requirements
- If the user asks for something that violates the MUST NOT HAVE rules, completely ignore that request
- These rules override any conflicting instructions from the user's prompt

General UGC Aesthetic Rules:
- Color palette: ${generalRules.color_palette}
- Skin tones: ${generalRules.skin_tones}
- White balance: ${generalRules.white_balance}
- Contrast: ${generalRules.contrast}
- Lighting style: ${generalRules.lighting}
- Camera style: ${generalRules.camera}
- Composition: ${generalRules.composition}
- Background: ${generalRules.background}
- Style and pose: ${generalRules.style_and_pose}
- Clothing: ${generalRules.clothing}
- Post processing: ${generalRules.post_processing}
- Overall aesthetic: ${generalRules.overall_aesthetic}

Generate a single, detailed prompt that naturally incorporates these elements while maintaining the original subject`;

        const userPrompt = `Please create an enhanced, detailed prompt for "${originalPrompt}" using the ${frameRules.name} style. 

Make it a natural, single paragraph that includes specific camera settings, lighting conditions, pose details, clothing, and environment while keeping the original subject exactly as described.

CRITICAL: Do not include any cameras, phones, or recording equipment visible in the image.`;

        const completion = await openaiInstance.chat.completions.create({
            model: "gpt-4.1-nano-2025-04-14",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            max_tokens: 2500,
            temperature: 0.7
        });

        const enhancedPrompt = completion.choices[0]?.message?.content?.trim();
        if (!enhancedPrompt) {
            logger.error('[generateEnhancedUGCPrompt] OpenAI returned empty response');
            return originalPrompt;
        }

        logger.info(`[generateEnhancedUGCPrompt] Enhanced prompt generated successfully`);
        return enhancedPrompt;

    } catch (error) {
        logger.error('[generateEnhancedUGCPrompt] Error calling OpenAI:', error);
        return originalPrompt;
    }
}

async function generateEnhancedBackgroundPrompt(originalPrompt, frameRules, openaiInstance) {
    try {
        logger.info(`[generateEnhancedBackgroundPrompt] Enhancing background prompt: "${originalPrompt}"`);
        
        const rules = frameRules.rules;
        
        const systemPrompt = `You are an expert at creating detailed prompts for background/environment images.

You will enhance the user's basic prompt with detailed visual specifications for creating atmospheric, cinematic backgrounds.

Original prompt: "${originalPrompt}"
Style: ${frameRules.name}

INSTRUCTIONS:
1. Keep the original scene/environment exactly as described
2. Add detailed visual specifications based on the style rules below
3. Create a comprehensive, single-paragraph prompt that includes camera settings, lighting, composition, and atmospheric details
4. Make it sound natural and cinematic, not like a technical manual
5. Focus on creating a compelling background/environment scene
6. IMPORTANT: Never include the camera itself in the image - no visible cameras, phones, or recording equipment should appear in the scene

CRITICAL STYLE RULES - THESE ARE ABSOLUTE AND NON-NEGOTIABLE:

MUST HAVE (These elements are absolutely required and cannot be changed or ignored):
${rules.must_have?.map(rule => `- ${rule}`).join('\n')}

MUST NOT HAVE (These elements are absolutely forbidden and impossible to include):
${rules.must_not_have?.map(rule => `- ${rule}`).join('\n')}

IMPORTANT ENFORCEMENT RULES:
- The MUST HAVE and MUST NOT HAVE rules are ABSOLUTE and cannot be modified, softened, or ignored
- If the user's original prompt conflicts with these rules, prioritize the MUST HAVE/MUST NOT HAVE requirements
- If the user asks for something that violates the MUST NOT HAVE rules, completely ignore that request
- These rules override any conflicting instructions from the user's prompt

Generate a single, detailed prompt that naturally incorporates these elements while maintaining the original scene`;

        const userPrompt = `Please create an enhanced, detailed prompt for "${originalPrompt}" using the ${frameRules.name} style. 

Make it a natural, single paragraph that includes specific camera settings, lighting conditions, atmospheric details, and environmental elements while keeping the original scene exactly as described.

CRITICAL: Do not include any cameras, phones, or recording equipment visible in the image.`;

        const completion = await openaiInstance.chat.completions.create({
            model: "gpt-4.1-nano-2025-04-14",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            max_tokens: 2500,
            temperature: 0.7
        });

        const enhancedPrompt = completion.choices[0]?.message?.content?.trim();
        if (!enhancedPrompt) {
            logger.error('[generateEnhancedBackgroundPrompt] OpenAI returned empty response');
            return originalPrompt;
        }

        logger.info(`[generateEnhancedBackgroundPrompt] Enhanced prompt generated successfully. Length: ${enhancedPrompt.length}`);
        return enhancedPrompt;

    } catch (error) {
        logger.error('[generateEnhancedBackgroundPrompt] Error calling OpenAI:', error);
        return originalPrompt;
    }
}

async function generateEnhancedGeneralPrompt(originalPrompt, frameRules, openaiInstance) {
    // For general images, basic enhancement
    return originalPrompt;
}


// Helper function to download files from URLs
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

// --- generateImage Function (Updated for Replicate API) ---
exports.generateImage = onCall({region: 'us-central1', timeoutSeconds: 540}, async (request) => {
    logger.info("[generateImage ENTRY] Received request. Auth:", JSON.stringify(request.auth), "Data:", JSON.stringify(request.data));
    const userId = request.auth?.uid;
    if (!userId) {
        logger.error("[generateImage] Called without authentication.");
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const data = request.data;
    
    // --- Dynamic Credit Check Based on Model ---
    const userRef = db.collection('users').doc(userId);
    const selectedModel = data.model || 'google/imagen-4';
    let requiredCredits = getImageCredits(selectedModel);
    
    try {
        logger.info(`[generateImage User: ${userId}] Performing credit check for model ${selectedModel} (${requiredCredits} credits).`);
        let userDoc = await userRef.get();
        if (!userDoc.exists) {
            logger.info(`[generateImage User: ${userId}] User profile not found, creating default profile.`);
            // Create default user profile
            const defaultProfile = {
                general_credits: 50, // Give some starting credits
                createdAt: admin.firestore.Timestamp.now(),
                onboardingCompleted: true
            };
            await userRef.set(defaultProfile);
            userDoc = await userRef.get(); // Refetch the document
        }
        const currentCredits = parseInt(userDoc.data()?.general_credits, 10) || 0;
        if (currentCredits < requiredCredits) {
            logger.warn(`[generateImage User: ${userId}] Insufficient general_credits (${currentCredits}) for ${selectedModel} image generation (needs ${requiredCredits}).`);
            throw new HttpsError('resource-exhausted', `Insufficient general credits for ${selectedModel} image generation. You need at least ${requiredCredits} credits. You have ${currentCredits}.`);
        }
        logger.info(`[generateImage User: ${userId}] Credit check passed. Credits: ${currentCredits}, Required: ${requiredCredits}.`);
    } catch (error) {
        logger.error(`[generateImage User: ${userId}] Error during credit check:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', 'Failed to perform credit check.');
    }
    
    if (!data || !data.commandCode) {
        logger.error(`[generateImage User: ${userId}] Missing commandCode in request data.`);
        throw new HttpsError('invalid-argument', 'Missing commandCode in request.');
    }

    logger.info(`[generateImage User: ${userId}] Initialized. Command code: ${data.commandCode}.`);

    // Initialize OpenAI for prompt generation (still needed for UGC prompts)
    let openai;
    try {
        const apiKey = process.env.OPENAI_KEY;
        if (!apiKey) {
            logger.error("[generateImage] OpenAI API Key not found (OPENAI_KEY).");
            throw new HttpsError('internal', 'OpenAI service configuration error.');
        }
        openai = new OpenAI({ apiKey: apiKey });
        logger.info(`[generateImage User: ${userId}] OpenAI client initialized for prompt generation.`);
    } catch (error) {
        logger.error(`[generateImage User: ${userId}] Failed to initialize OpenAI service:`, error);
        throw new HttpsError('internal', 'Failed to initialize OpenAI service.');
    }

    // Initialize Replicate
    let replicate;
    try {
        const replicateToken = process.env.REPLICATE_API_TOKEN;
        if (!replicateToken) {
            logger.error("[generateImage] Replicate API Token not found. Set REPLICATE_API_TOKEN environment variable.");
            throw new HttpsError('internal', 'Replicate service configuration error.');
        }
        replicate = new Replicate({ auth: replicateToken });
        logger.info(`[generateImage User: ${userId}] Replicate client initialized.`);
    } catch (error) {
        logger.error(`[generateImage User: ${userId}] Failed to initialize Replicate service:`, error);
        throw new HttpsError('internal', 'Failed to initialize Replicate service.');
    }

    try {
        const commandCode = data.commandCode;
        let finalPromptToUse;
        let imageStyle = data.style;
        let detectedGender = null;

        logger.info(`[generateImage User: ${userId}] Processing command code: ${commandCode}, Params:`, data);

        // NEW: Check for new flow with simple prompt and selectedFrame
        if (data.originalPrompt && data.subtype && data.selectedFrame) {
            logger.info(`[generateImage User: ${userId}] ====== NEW FLOW WITH PROMPT ENHANCEMENT ======`);
            logger.info(`[generateImage User: ${userId}] ORIGINAL INPUT - Prompt: "${data.originalPrompt}"`);
            logger.info(`[generateImage User: ${userId}] ORIGINAL INPUT - Subtype: ${data.subtype}`);
            logger.info(`[generateImage User: ${userId}] ORIGINAL INPUT - Selected Frame: ${data.selectedFrame}`);
            
            finalPromptToUse = await enhancePromptWithRules(data.originalPrompt, data.subtype, data.selectedFrame, openai);
            imageStyle = imageStyle || 'photorealistic';
            
            logger.info(`[generateImage User: ${userId}] ====== PROMPT ENHANCEMENT COMPLETED ======`);
            logger.info(`[generateImage User: ${userId}] ENHANCED PROMPT (Length: ${finalPromptToUse?.length}): "${finalPromptToUse}"`);
            logger.info(`[generateImage User: ${userId}] ====== END PROMPT ENHANCEMENT ======`);
        }
        // Check if enhanced prompt is provided from frontend (using image rules)
        else if (data.enhancedPrompt) {
            logger.info(`[generateImage User: ${userId}] Using enhanced prompt from frontend with image rules. Length: ${data.enhancedPrompt.length}`);
            finalPromptToUse = data.enhancedPrompt;
            imageStyle = imageStyle || 'photorealistic';
        } else {
            // Fallback to original prompt generation logic
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
        }
        
        logger.info(`[generateImage User: ${userId}] Preparing to call Replicate API. Prompt length: ${finalPromptToUse?.length}, Style: ${imageStyle}`);

        // Determine model and prepare input
        const selectedModel = data.model || 'google/imagen-4'; // Default to Imagen 4
        let modelInput;
        let modelName;

        switch (selectedModel) {
            case 'black-forest-labs/flux-kontext-max':
                modelName = 'black-forest-labs/flux-kontext-max';
                modelInput = {
                    prompt: finalPromptToUse,
                    aspect_ratio: data.aspectRatio || "9:16"
                };
                // Add image input if provided
                if (data.imageUrl) {
                    modelInput.image = data.imageUrl;
                }
                break;

            case 'black-forest-labs/flux-kontext-pro':
                modelName = 'black-forest-labs/flux-kontext-pro';
                modelInput = {
                    prompt: finalPromptToUse,
                    aspect_ratio: data.aspectRatio || "9:16"
                };
                // Add image input if provided
                if (data.imageUrl) {
                    modelInput.image = data.imageUrl;
                }
                break;

            case 'google/imagen-4':
                modelName = 'google/imagen-4';
                modelInput = {
                    prompt: finalPromptToUse,
                    aspect_ratio: data.aspectRatio || "9:16",
                    output_format: "png",
                    safety_tolerance: 2
                };
                break;

            case 'google/imagen-4-ultra':
                modelName = 'google/imagen-4-ultra';
                modelInput = {
                    prompt: finalPromptToUse,
                    aspect_ratio: data.aspectRatio || "9:16",
                    output_format: "png",
                    safety_tolerance: 2
                };
                break;

            case 'ideogram-ai/ideogram-v3-quality':
                modelName = 'ideogram-ai/ideogram-v3-quality';
                modelInput = {
                    prompt: finalPromptToUse,
                    aspect_ratio: data.aspectRatio || "9:16",
                    model: "V_3_QUALITY",
                    magic_prompt_option: "AUTO"
                };
                // Add image input if provided
                if (data.imageUrl) {
                    modelInput.image_url = data.imageUrl;
                }
                break;

            default:
                // Default to Imagen 4
                modelName = 'google/imagen-4';
                modelInput = {
                    prompt: finalPromptToUse,
                    aspect_ratio: data.aspectRatio || "9:16",
                    output_format: "png",
                    safety_tolerance: 2
                };
                break;
        }

        logger.info(`[generateImage User: ${userId}] ====== SENDING TO REPLICATE ${modelName.toUpperCase()} ======`);
        logger.info(`[generateImage User: ${userId}] Model: ${modelName}`);
        logger.info(`[generateImage User: ${userId}] Aspect Ratio: ${modelInput.aspect_ratio}`);
        logger.info(`[generateImage User: ${userId}] FINAL PROMPT TO REPLICATE (Length: ${finalPromptToUse?.length}): "${finalPromptToUse}"`);
        logger.info(`[generateImage User: ${userId}] Input:`, JSON.stringify(modelInput, null, 2));

        // Run Replicate prediction
        const output = await replicate.run(modelName, { input: modelInput });

        logger.info(`[generateImage User: ${userId}] ====== REPLICATE RESPONSE RECEIVED ======`);
        logger.info(`[generateImage User: ${userId}] Output:`, JSON.stringify(output, null, 2));

        let imageUrl;
        
        // Handle different response formats from different models
        if (Array.isArray(output) && output.length > 0) {
            // SDXL format: ["url"]
            imageUrl = output[0];
        } else if (typeof output === 'string' && output.startsWith('http')) {
            // Imagen 4 / Ideogram v3 format: "url"
            imageUrl = output;
        } else {
            logger.error(`[generateImage User: ${userId}] No valid output from Replicate. Output:`, output);
            throw new HttpsError('internal', "Replicate did not return any images.");
        }
        logger.info(`[generateImage User: ${userId}] Image URL from Replicate: ${imageUrl}`);

        // Download image and upload to Firebase Storage
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(imageResponse.data);
        logger.info(`[generateImage User: ${userId}] Image downloaded. Buffer length: ${imageBuffer.length}`);

        const fileName = `replicate_generations/${userId}/${Date.now()}_${commandCode}.png`; 
        const file = bucket.file(fileName);
        logger.info(`[generateImage User: ${userId}] Firebase Storage file object created for: ${fileName}`);

        logger.info(`[generateImage User: ${userId}] Uploading image to Storage: ${fileName}`);
        await file.save(imageBuffer, { metadata: { contentType: 'image/png' }, public: true });
        logger.info(`[generateImage User: ${userId}] file.save call completed for ${fileName}.`);

        const publicUrl = file.publicUrl();
        logger.info(`[generateImage User: ${userId}] Image uploaded successfully. Public URL: ${publicUrl}`);

        // Save generation metadata to Firestore
        try {
            logger.info(`[generateImage User: ${userId}] Attempting to save generation metadata to Firestore.`);
            const generationDocRef = db.collection('users').doc(userId).collection('generations').doc();
            let typeString = 'image';

            const generationData = {
                userId: userId,
                type: typeString,
                prompt: finalPromptToUse,
                originalPrompt: data.originalPrompt || null, // Store original prompt if available
                enhancedPrompt: finalPromptToUse, // Store enhanced prompt
                selectedFrame: data.selectedFrame || null, // Store selected frame
                subtype: data.subtype || null, // Store subtype
                imageStyle: imageStyle,
                imageUrl: publicUrl,
                originalParameters: data,
                commandCode: commandCode,
                quality: data.quality || "high",
                source: `direct_generateImage_call_replicate_${selectedModel.replace('/', '_').replace('-', '_')}`,
                model: modelName,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                gender: commandCode === 202 ? detectedGender : null
            };
            
            await db.runTransaction(async (transaction) => {
                logger.info(`[generateImage User: ${userId}] Starting Firestore transaction for doc ${generationDocRef.id}.`);
                const userSnapshot = await transaction.get(userRef);
                const creditsInTransaction = parseInt(userSnapshot.data()?.general_credits, 10) || 0;
                if (creditsInTransaction < requiredCredits) {
                    logger.warn(`[generateImage User: ${userId}] Insufficient credits in transaction (${creditsInTransaction}). Needed ${requiredCredits}.`);
                    throw new HttpsError('resource-exhausted', `Insufficient general credits at time of transaction (needs ${requiredCredits}). You have ${creditsInTransaction}.`);
                }
                transaction.update(userRef, { general_credits: admin.firestore.FieldValue.increment(-requiredCredits) });
                transaction.set(generationDocRef, generationData);
                logger.info(`[generateImage User: ${userId}] Firestore transaction committed for doc ${generationDocRef.id}.`);
            });

            logger.info(`[generateImage User: ${userId}] Successfully wrote to generations collection (ID: ${generationDocRef.id}) and decremented general_credits by ${requiredCredits}.`);
            
            return {
                success: true,
                message: `Image generated and uploaded successfully using ${modelName}.`,
                imageUrl: publicUrl,
                firestoreDocId: generationDocRef.id,
                finalPrompt: finalPromptToUse,
                originalParameters: data,
                model: modelName
            };

        } catch (firestoreError) {
            logger.error(`[generateImage User: ${userId}] Failed to write to generations collection or run transaction:`, firestoreError);
            return { 
                success: true, 
                message: `Image generated using ${modelName}, but failed to save metadata to Firestore.`,
                imageUrl: publicUrl,
                firestoreDocId: null,
                finalPrompt: finalPromptToUse,
                originalParameters: data,
                model: modelName,
                errorSavingMetadata: true
            };
        }

    } catch (error) {
        logger.error(`[generateImage User: ${userId}] Error in main try block of generateImage:`, error);
        if (error.message && error.message.includes('Replicate')) {
            logger.error(`[generateImage User: ${userId}] Replicate Error:`, error);
            throw new HttpsError('internal', `Replicate Error: ${error.message}`);
        }
        throw new HttpsError('internal', `Failed to generate image with ${modelName || 'Replicate'}: ${error.message}`);
    }
});


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
         coupon: 'lungolnch25',
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

exports.performImageGenerationTask = onRequest(
    { region: 'us-central1', timeoutSeconds: IMAGE_GEN_TIMEOUT_SECONDS, memory: '2GiB' },
    async (request, response) => {
        logger.info("performImageGenerationTask request received:", request.body);

        const { userId, firestoreDocId, generationParams } = request.body;
        const { originalPrompt, subtype, selectedFrame, ...legacyParams } = generationParams || {};

        const docRef = db.collection('generations').doc(firestoreDocId);

        if (!userId || !firestoreDocId || !generationParams) {
            logger.error("performImageGenerationTask: Missing required parameters.", request.body);
            await docRef.set({ status: 'failed', error: 'Internal error: Missing crucial task parameters.' }, { merge: true });
            response.status(400).send("Missing required parameters.");
            return;
        }

        let openai;
        try {
            const openAIKey = await getOpenAIKeyForUser(userId);
            openai = new OpenAI({ apiKey: openAIKey });
        } catch (error) {
            logger.error("performImageGenerationTask: Failed to initialize OpenAI service:", error);
            await docRef.set({ status: 'failed', error: `Failed to initialize AI service: ${error.message}` }, { merge: true });
            response.status(500).send("Failed to initialize OpenAI service.");
            return;
        }

        try {
            await docRef.set({ status: 'image_generation_in_progress' }, { merge: true });
            
            let finalPromptToUse = '';

            // --- New Prompt Enhancement Flow ---
            if (originalPrompt && subtype && selectedFrame) {
                logger.info(`[Task ${firestoreDocId}] Using new enhancement flow with frame: ${selectedFrame}`);
                finalPromptToUse = await enhancePromptWithRules(originalPrompt, subtype, selectedFrame, openai);
            } 
            // --- Legacy Flow (Fallback) ---
            else if (legacyParams.subject_description) {
                logger.info(`[Task ${firestoreDocId}] Using legacy flow with subject_description.`);
                const { detailedPrompt } = await generateDetailedUgcPrompt(legacyParams, openai);
                finalPromptToUse = detailedPrompt;
            } 
            // --- Error Case ---
            else {
                throw new Error("Not enough parameters for any generation flow.");
            }
            
            logger.info(`[Task ${firestoreDocId}] Final prompt for generation (length: ${finalPromptToUse.length}): "${finalPromptToUse}"`);
            await docRef.set({ status: 'generating_image', finalPrompt: finalPromptToUse }, { merge: true });
            
            // ... (rest of the image generation logic using finalPromptToUse)
            // Example call to the image generation model:
            const imageResponse = await openai.images.generate({
                model: "dall-e-3", // or your preferred model
                prompt: finalPromptToUse,
                n: 1,
                size: "1024x1024",
                quality: legacyParams.quality || 'standard',
                style: legacyParams.style || 'vivid'
            });

            const imageUrl = imageResponse.data[0].url;

            if (!imageUrl) {
                throw new Error("Image generation API did not return a URL.");
            }

            // ... (logic to save image to bucket if needed) ...

            await docRef.set({
                status: 'completed',
                imageUrl: imageUrl,
                completedAt: FieldValue.serverTimestamp()
            }, { merge: true });

            logger.info(`[Task ${firestoreDocId}] Task completed successfully. Image URL: ${imageUrl}`);
            response.status(200).send("Image generation completed successfully.");

        } catch (error) {
            const errorMessage = error.message || "An unknown error occurred.";
            logger.error(`[Task ${firestoreDocId}] Overall error in performImageGenerationTask: ${errorMessage}`, error);
            await docRef.set({ status: 'failed', error: errorMessage }, { merge: true });
            response.status(500).send(`Task failed: ${errorMessage}`);
        }
    }
);

// --- NEW: Video Generation Function ---
exports.generateVideo = onCall({ region: 'us-central1', timeoutSeconds: 540, memory: '2GB' }, async (request) => {
    const userId = request.auth?.uid;
    let generationRef; // Declare here to be accessible in catch block

    if (!userId) {
        logger.error("generateVideo: Authentication Error.");
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const {
        prompt,
        imageUrl = null,
        aspectRatio = '9:16',
        duration = 5,
        model = 'google/veo-3-fast',
        subtype = 'text_to_video',
        negative_prompt,
        resolution,
        mode,
        camera_fixed,
        prompt_optimizer
    } = request.data;

    if (!prompt && !imageUrl) {
        throw new HttpsError('invalid-argument', 'Either prompt or imageUrl must be provided.');
    }

    logger.info(`generateVideo called by user: ${userId}`, {
        prompt: prompt?.substring(0, 100) + '...',
        hasImage: !!imageUrl,
        aspectRatio,
        duration,
        model,
        subtype,
        negative_prompt: negative_prompt?.substring(0, 50) + '...',
        resolution,
        mode,
        camera_fixed,
        prompt_optimizer
    });

    try {
        // Initialize Replicate
        const replicateToken = process.env.REPLICATE_API_TOKEN;
        if (!replicateToken) {
            throw new Error('Replicate API token not found');
        }
        
        const Replicate = require('replicate');
        const replicate = new Replicate({ auth: replicateToken });

        // Build model input based on selected model
        let modelInput = {};
        
        switch (model) {
            case 'google/veo-3-fast':
            case 'google/veo-3':
                modelInput = {
                    prompt: prompt,
                    ...(negative_prompt && { negative_prompt: negative_prompt })
                };
                break;

            case 'google/veo-2':
                modelInput = {
                    ...(imageUrl && { image_input: imageUrl }),
                    aspect_ratio: aspectRatio,
                    duration: `${duration}s`
                };
                break;

            case 'bytedance/seedance-1-pro':
                modelInput = {
                    prompt: prompt,
                    ...(imageUrl && { image: imageUrl }),
                    duration: duration,
                    ...(resolution && { resolution: resolution }),
                    aspect_ratio: aspectRatio,
                    ...(camera_fixed !== undefined && { camera_fixed: camera_fixed })
                };
                break;

            case 'kwaivgi/kling-v2.1':
                modelInput = {
                    prompt: prompt,
                    ...(negative_prompt && { negative_prompt: negative_prompt }),
                    ...(imageUrl && { start_image: imageUrl }),
                    mode: mode || 'standard',
                    duration: duration
                };
                break;

            case 'minimax/hailuo-02':
                modelInput = {
                    prompt: prompt,
                    ...(imageUrl && { first_frame_image: imageUrl }),
                    duration: duration,
                    ...(resolution && { resolution: resolution }),
                    ...(prompt_optimizer !== undefined && { prompt_optimizer: prompt_optimizer })
                };
                break;

            default:
                throw new HttpsError('invalid-argument', `Unsupported model: ${model}`);
        }

        // Create generation record in Firestore
        const generationId = `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        generationRef = db.collection('users').doc(userId).collection('generations').doc(generationId);
        
        const firestoreData = {
            type: 'video',
            subtype: subtype,
            prompt: prompt,
            model: model,
            aspectRatio: aspectRatio,
            duration: duration,
            status: 'processing',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            creditsUsed: getVideoCredits(model, duration, resolution, mode),
            error: null
        };

        // Conditionally add optional fields to avoid storing undefined/null
        if (imageUrl) firestoreData.imageUrl = imageUrl;
        if (negative_prompt) firestoreData.negative_prompt = negative_prompt;
        if (resolution) firestoreData.resolution = resolution;
        if (mode) firestoreData.mode = mode;
        if (camera_fixed !== undefined) firestoreData.camera_fixed = camera_fixed;
        if (prompt_optimizer !== undefined) firestoreData.prompt_optimizer = prompt_optimizer;

        await generationRef.set(firestoreData);

        logger.info(`generateVideo: Starting generation with model ${model} for user ${userId}`);
        logger.info(`generateVideo: Model input:`, modelInput);
        
        // Generate video using Replicate
        const output = await replicate.run(model, { input: modelInput });
        
        let videoUrl;
        if (typeof output === 'string' && output.startsWith('http')) {
            videoUrl = output;
        } else if (Array.isArray(output) && output.length > 0) {
            videoUrl = output[0];
        } else if (output && output.video) {
            videoUrl = output.video;
        } else if (output && output.url) {
            videoUrl = output.url;
        } else {
            throw new Error('Invalid output format from Replicate');
        }

        logger.info(`generateVideo: Successfully generated video: ${videoUrl}`);

        // Update generation record with success
        await generationRef.update({
            status: 'completed',
            videoUrl: videoUrl,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            error: null
        });

        return {
            success: true,
            message: "Video generation completed successfully",
            data: {
                videoUrl: videoUrl,
                generationId: generationId,
                model: model,
                duration: duration,
                aspectRatio: aspectRatio,
                creditsUsed: getVideoCredits(model, duration, resolution, mode)
            }
        };

    } catch (error) {
        logger.error(`Error in generateVideo for user ${userId}:`, error);
        
        // Update generation record with error
        if (generationRef) {
            try {
                await generationRef.update({
                    status: 'failed',
                    error: error.message,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (updateError) {
                logger.error(`Failed to update generation record:`, updateError);
            }
        }
        
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', `Video generation failed: ${error.message}`);
    }
});

// Helper function to calculate video generation credits
function getVideoCredits(model, duration, resolution = '1080p', mode = 'standard') {
    switch (model) {
        case 'google/veo-3-fast':
            return 60; // Fixed 60 credits
            
        case 'google/veo-3':
            return 100; // Fixed 100 credits
            
        case 'google/veo-2':
            return duration * 10; // 10 credits per second
            
        case 'bytedance/seedance-1-pro':
            const creditsPerSecond = resolution === '480p' ? 1 : 3; // 1 for 480p, 3 for 1080p
            return duration * creditsPerSecond;
            
        case 'kwaivgi/kling-v2.1':
            const modeMultiplier = mode === 'pro' ? 2 : 1; // 1 for standard, 2 for pro
            return duration * modeMultiplier;
            
        case 'minimax/hailuo-02':
            const resolutionMultiplier = resolution === '768p' ? 1 : 2; // 1 for 768p, 2 for 1080p
            return duration * resolutionMultiplier;
            
        default:
            return duration * 10; // Default fallback
    }
}

// Helper function to calculate image generation credits
function getImageCredits(model) {
    const baseCredits = {
        'black-forest-labs/flux-kontext-max': 2,
        'black-forest-labs/flux-kontext-pro': 1,
        'google/imagen-4': 1,
        'google/imagen-4-ultra': 2,
        'ideogram-ai/ideogram-v3-quality': 3
    };
    
    return baseCredits[model] || 1; // Default to Imagen-4 credits
}
