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
const VERTEX_AI_PROJECT = process.env.GCLOUD_PROJECT || 'ugcai-f429e';
const VERTEX_AI_LOCATION = 'us-central1';
const IMAGEN_MODEL = 'imagen-4.0-generate-preview-06-06';
// --- NEW: Plan Credit Allocations (Backend) ---
const planCreditAllocations = {
  // Basic Plan
  "price_1RMqEZDf8kAOBAT3ltD6n2lX": { general_credits: 2500 }, // Monthly Basic
  "price_1RMqGbDf8kAOBAT3vgwkWLr6": { general_credits: 2500 }, // Yearly Basic
  // Pro Plan
  "price_1RY4EwDf8kAOBAT3qMaIMcdO": { general_credits: 10000 }, // Monthly Pro
  "price_1RY4F6Df8kAOBAT34O2CKeCM": { general_credits: 10000 }, // Yearly Pro
  // Business Plan
  "price_1RY4JdDf8kAOBAT3AWlBbEx3": { general_credits: 30000 }, // Monthly Business
  "price_1RY4JuDf8kAOBAT3lrADc9fO": { general_credits: 30000 }  // Yearly Business
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
        "in an oversized varsity zip jacket in black over a lace-trimmed bralette, revealing cleavage, paired with denim cutoffs",
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
        'background': {
            name: 'Background Scene',
            rules: {
                composition_and_perspective: {
                    camera_type: "Professional DSLR, mirrorless, or high-end camera",
                    focal_length_mm: "24mm to 85mm equivalent (wide to medium telephoto for versatile backgrounds)",
                    aperture_range: "f/1.4 - f/8 (variable depth control)",
                    focus_mode: "Manual or autofocus on key background elements",
                    framing: "Wide establishing shot or medium environmental shot, showcasing the setting",
                    orientation: "Horizontal (landscape) or vertical (portrait) based on scene",
                    camera_position: "Positioned to capture the most compelling view of the environment"
                },
                location_and_background: {
                    setting: "Atmospheric environments: urban streets, nature scenes, architectural spaces, interiors",
                    background_elements: "Rich environmental details that tell a story or create mood",
                    background_blur: "Variable - sharp details where needed, subtle blur for depth",
                    depth_of_field: "Optimized for the scene - deep for landscapes, shallow for focus"
                },
                lighting: {
                    lighting_type: "Natural or ambient lighting that enhances the mood and atmosphere",
                    white_balance: "Appropriate for the environment and time of day",
                    exposure_compensation: "Optimized for the scene's dynamic range",
                    ISO_setting: "Low ISO for maximum quality and detail",
                    shutter_speed: "Appropriate for the scene - fast for sharp details, slow for motion blur if desired"
                },
                mood_and_atmosphere: {
                    overall_feel: "Cinematic, atmospheric, and visually compelling",
                    color_palette: "Rich and harmonious colors that enhance the environment",
                    contrast: "Good contrast to create visual interest and depth"
                }
            }
        },
        'car_selfie_glow': {
            name: 'Car Selfie Glow',
            rules: {
                composition_and_perspective: {
                    camera_type: "Smartphone front (selfie) camera, rare cases digital compact or mirrorless with flip screen",
                    focal_length_mm: "23mm to 28mm equivalent (smartphone front camera standard; slight wide angle)",
                    aperture_range: "f/2.0 - f/2.4 (typical of modern smartphone front cameras)",
                    focus_mode: "Autofocus or fixed focus; primary focus on face and upper torso",
                    framing: "Loose close-up to chest-up framing (selfie). Single subject centered or slightly off-center within the car seat area. Minimal cropping of facial features.",
                    orientation: "Vertical portrait orientation preferred; occasional casual landscape orientation selfie",
                    camera_position: "Camera held in hand at arm's length or just above face level; sometimes angled downward for flattering perspective"
                },
                location_and_background: {
                    setting: "Inside a car during daytime. Visible seats, seatbelts, windows, sunroofs, and sometimes dashboard details.",
                    background_elements: "Car interiors are sharp and distinct: headrests, full or partial windows, sun visors, leather/fabric textures.",
                    background_blur: "Very minimal; deep depth of field typical of smartphones. Environment and background are in focus.",
                    depth_of_field: "Very wide (face, hair, and car interior all clearly visible)"
                },
                lighting: {
                    lighting_type: "Natural daylight (direct or indirect sun) entering car from windows or sunroof. May cast clear shadows or bright highlights across face and upper body.",
                    white_balance: "Auto, calibrated for natural sunlight (approx. 5000-6500K)",
                    exposure_compensation: "Autoexposure, sometimes with intentional face brightening. Mild highlight clipping in direct sun is acceptable.",
                    ISO_setting: "50-200 (smartphone base ISO in daylight)",
                    shutter_speed: "1/100 to 1/2000s, fast enough to capture sharp details even with some movement"
                },
                subject_pose_and_expression: {
                    poses: "Single subject, seated in car seat, relaxed or casually posed. Head slightly tilted, subtle angles for flattering silhouette.",
                    facial_expression: "Soft smile, neutral face, duck face, or playful pout. Expressions are calm or confident (not overly dramatic).",
                    gaze_direction: "Directly into the camera or slightly gaze away; classic selfie engagement"
                },
                fashion_and_style: {
                    clothing: "Trendy casual wear—tank tops, sunglasses, puffer jackets, minimal jewelry. Simple, solid colors or subtle patterns.",
                    accessories: "Sunglasses, earrings, subtle necklaces. Accessories chosen for personal style rather than for statement effect.",
                    hair: "Smooth, styled or gently tousled. May include small braids, center or side parting, or loose and flowing."
                }
            }
        },
                 'city_street_style': {
             name: 'City Street Style',
             rules: {
                 composition_and_perspective: {
                     camera_type: "Modern smartphone main camera or compact/mirrorless digital camera",
                     focal_length_mm: "24mm to 35mm equivalent (true-to-life perspective with a slight wide field for urban context)",
                     aperture_range: "f/1.8 - f/2.8 (smartphone default or prime lens; provides natural depth)",
                     focus_mode: "Autofocus, always focused on subject (usually full body or half body); no artificial blur",
                     framing: "Mid-shot (knees up) to full-body; subjects often placed off-center, leaving space for urban background elements. Some shots taken slightly from below for extra attitude.",
                     orientation: "Vertical or portrait orientation for social sharing and emphasizing outfit. Occasional slight tilt for dynamism.",
                     camera_position: "Handheld at waist to chest level, 1.5–3 meters from subject; mix of candid and modeled stances."
                 },
                 location_and_background: {
                     setting: "Urban streets, building facades, gas stations, sidewalk corners, crosswalks, storefronts",
                     background_elements: "Urban architecture, road textures, signage (like STOP), cars, greenery, metal, glass, street furniture. May include street reflections, shop windows, and city props.",
                     background_blur: "Minimal. Street and city details remain recognizable and part of scene.",
                     depth_of_field: "Moderate to deep; subject pops, but environment is contextually present."
                 },
                 lighting: {
                     lighting_type: "Natural daylight, usually direct sun or open shade; shadows for depth and realness, no flash",
                     white_balance: "Auto daylight (5000-6500K), slight warmth from sun or hint of coolness in shadow",
                     exposure_compensation: "0EV to +0.7EV; aiming for bright, snappy street exposure, moderate dynamic range",
                     ISO_setting: "ISO 50–200 (daylight, clean look)",
                     shutter_speed: "1/400s–1/2000s for crisp capture and slight movement"
                 },
                 subject_pose_and_expression: {
                     poses: "Candid, leaning, sitting, walking, or interacting with props/signs; often hands in pockets, crossed arms, looking away, slouched, or relaxed",
                     facial_expression: "Neutral, confident, chill, nonchalant, or 'effortless cool'. Sometimes obscured by sunglasses, hats, or cigarettes.",
                     gaze_direction: "Looking away from camera, down, or at their phone; rarely direct eye contact"
                 },
                 fashion_and_style: {
                     clothing: "Streetwear, loose fits, statement layers, graphic tees, oversized pants, vests, open shirts, retro sneakers, chains, bold accessories. Genderless or vintage-inspired details encouraged.",
                     accessories: "Baseball caps, sunglasses, visible jewelry, belts, beanies, cigarettes, drinks, statement socks",
                     hair: "Natural, slightly messy, under hats/caps, effortless"
                 }
             }
         },


      'fish_eye_selfie_urban': {
  name: 'Urban Fisheye Selfie Drama',
  rules: {
    composition_and_perspective: {
      camera_type: "Professional digital camera or analog body with a genuine circular fisheye lens (8mm–12mm full-frame equivalent) OR action camera (GoPro, etc.) in strict selfie mode. No post-crop or digital emulation – authentic optical barrel distortion only.",
      focal_length_mm: "Exactly 8–12mm focal length on full-frame sensor, generating extreme barrel distortion; subject’s facial features and limbs must expand and warp aggressively towards lens edges.",
      aperture_range: "Wide open to moderately stopped (f/2.8–f/4), maximizing depth of field; every foreground and background element absolutely tack sharp across frame.",
      focus_mode: "Manual or reliable autofocus locked at very close range (subject’s face/hand almost touching the lens). There must be no blur; both central and edge elements rendered in full clarity.",
      framing: "Ultra-tight bust or chest-up composition, with face overpoweringly dominating center; one arm stretched out to top/side corner, hand enlarged/distorted by proximity. Strongly forced perspective: face and hand exaggeratedly prominent, corners heavily curved.",
      orientation: "Portrait (vertical) format is mandatory. Camera must be slightly canted/tilted, imparting dynamic, handheld immediacy. Viewer should viscerally sense the arm extension and aggressive spatial engagement.",
      camera_position: "Camera at maximum arm’s reach, slightly above eye-line, angled down towards subject for confrontational, immersive perspective; lens directly faces subject, but is offset just enough to amplify the distortion."
    },
    location_and_background: {
      setting: "Harsh city exterior: rough concrete, cracked ground, metallic roll-down doors as primary backdrop.",
      background_elements: "Explosively vivid graffiti in hyper-saturated tones (red, blue, yellow). All metallic and painted textures crisp, with sidewalk grit and cracks visible. Graffiti and urban lines kaleidoscopically warped at frame edges, bending around subject.",
      background_blur: "None allowed. Optical fisheye guarantees complete edge-to-edge sharpness, with pronounced curvature. No artificial bokeh.",
      depth_of_field: "Absolute; all planes–hand, face, background–in simultaneous, flawless focus."
    },
    lighting: {
      lighting_type: "Intense, overhead midday sun; extremely hard light, with sculpted, darkest shadows and blown-out highlight zones on skin. Every contour (brow, nose, jaw, lips, hair strands) sharply delineated.",
      white_balance: "Daylight (5000–6000K). Color profile must maximize separation: skin glows, graffiti hues explode, and the overall palette is cranked to high contrast. Warm bias for skin, but full spectrum in background.",
      exposure_compensation: "Slightly positive (+0.2EV); highlights permitted to clip just on the face and arm, especially where sunlight hits directly. Shadows remain deep but not underexposed; overall DR is unforgiving.",
      ISO_setting: "Low (ISO 100–200); ultra-clean, every skin pore or wall imperfection should register crisply.",
      shutter_speed: "Very fast (1/1000s and above). No motion blur anywhere - subject, accessories, and even dust or ground textures perfectly frozen."
    },
    subject_pose_and_expression: {
      poses: "Subject close enough to lens to exaggerate facial features; head dropped slightly and tilted towards the lens, for a hyper-assertive feel. Arm thrust up into the frame, hand occupying the top-left or top-right corner, fingers splayed/wrist bent to further dramatize proximity distortion.",
      facial_expression: "Gaze is direct, piercingly intense, lips subtly parted, brow fractionally furrowed. Expression should convey confrontation, self-assurance, even defiance.",
      gaze_direction: "Subject's eyes must lock laser-like with the lens–audience feels stared down, challenged, drawn in visually and emotionally."
    },
    fashion_and_style: {
      clothing: "Thin, fitted, white tank top (slightly translucent in harsh sun). Jewelry: stacked gold/metal bangles high on forearm, shining in sunlight.",
      accessories: "Minimal to no makeup, skin shown as is. Hair loose, wild, and voluminous; waves catching and scattering light, some strands casting shadows on face.",
      hair: "Long, prominent natural curls/waves, sunlit copper/gold highlights vivid against darker roots. Overall look: spontaneous, raw, unfiltered urban energy and authenticity."
    }
  }
},

    'y2k_flash_pop': {
    name: 'Y2K Flash Pop Street Portrait',
    rules: {
        composition_and_perspective: {
            camera_type: "Authentic early 2000s compact digital (e.g., Canon IXUS/PowerShot, Nikon Coolpix, Sony Cyber-shot) or entry-level DSLR of that era, with visible built-in pop-up flash. Strictly no modern bodies/lens corrections.",
            focal_length_mm: "38mm to 50mm equivalent (standard to slightly wide; moderate field of view, distinctly NOT ultra-wide); optical zoom at default or 1–2×, never digital.",
            aperture_range: "f/2.8–f/4.5, as typical for these compact built-in lenses; maintains moderate depth of field and supports sharp flash-lit subject rendering.",
            focus_mode: "Single shot autofocus, with classic early-2000s margin of error—focus must land on the subject’s eyes or upper face, but slight softness or missed focus on surroundings is acceptable and even preferred for authenticity.",
            framing: "Waist-up (torso-dominant), tight vertical/portrait orientation, subject centered with crowd partially cropped at edges for that snapshot, slightly rushed feel. Minimal empty space; presence is immediate and immersive.",
            orientation: "Strictly upright/vertical (portrait), hand-held, possibly with subtle camera shake or tilt indicating candid, fast execution amidst crowd.",
            camera_position: "Lens at or slightly above subject's eye level, camera angled down just slightly, extremely close to subject (within 1–1.5 meters), as if shot rapidly while navigating a dense street scene."
        },
        location_and_background: {
            setting: "Congested city crosswalk or intersection at dusk—scene is unmistakably urban, flooding with pedestrians and city signage.",
            background_elements: "Dense, blurred crowd in motion; city signage glowing, traffic lights (e.g. noticeably illuminated green circle), reflective windows, storefront facades. Background figures partially streaked with motion blur and flash-shadow interaction.",
            background_blur: "Distinctive background blur from subject movement and slow sync flash, not optical bokeh. People in background are ghosted, moving, sometimes smeared, yet identifiable in silhouette.",
            depth_of_field: "Moderate—sharpest focus on main subject’s face/shoulders, background detail lost to crowd movement and mild digital noise, NOT lens blur."
        },
        lighting: {
            lighting_type: "On-camera, direct built-in pop-up flash. Flash is harsh, revealing every pore and detail of the subject’s illuminated face, with evident overexposed highlights (e.g., on skin or any reflective accessory like cell phone screens). Background remains in moody, natural ambient light with significant contrast between subject and environment.",
            white_balance: "Auto or default daylight (often with faint blue/green tinge and obvious digital color noise), producing colder highlights and a nostalgic, slightly plastic Y2K skin tone.",
            exposure_compensation: "Zero (0EV); accept overblown highlights and sharp-edged flash shadows, especially under chin and behind subject. Hotspots on metallic or glass surfaces are explicit and unfiltered.",
            ISO_setting: "ISO 100–400 typical for compacts; mild visible digital grain or color noise in shaded background areas and on darker clothing. Never waxy-smooth or noise-reduced.",
            shutter_speed: "1/60s–1/125s with slow-sync flash enabled. Subject is perfectly frozen by flash; crowd movement renders as dynamic blur/ghosts, especially around edges."
        },
        subject_pose_and_expression: {
            poses: "Subject standing upright, almost stationary or just finishing a stride. Shoulders squared, casual posture, hands visible (one often holding a phone reflecting flash). Main figure should punch out from the crowd as a crisp, static focal point.",
            facial_expression: "Neutral, relaxed, or subtly dreamy; eyes open, gaze soft or just off-camera. Face partially touched by stray hair, with an understated, authentic, slightly glazed expression.",
            gaze_direction: "Looking softly or blankly just past or into the lens—never forced, always naturalistic and a little aloof. Candid, not theatrical."
        },
        fashion_and_style: {
            clothing: "Strict early-2000s/Y2K: oversized black or dark leather jacket with pronounced shoulder structure; layered with metallic or gray scarf, muted top. All textures (leather, satin/scarf) must be unmistakably crisp under flash.",
            accessories: "Minimalist but bold: large geometric or metallic earrings (must reflect some flash), visible smartphone with on-screen flash glare, barely-there natural makeup (ivory/frosted highlights allowed).",
            hair: "Short to shoulder-length, natural texture, parted in the center or off-center. Slightly windblown, a few loose strands crossing face, with both softness and volume highlighted by harsh flash."
        }
    }
},

    'elevator_mirror_selfie': {
name: 'Elevator Mirror Flex',
rules: {
composition_and_perspective: {
camera_type: "Modern smartphone with high-resolution front or rear camera, used for mirror capture",
focal_length_mm: "24mm–28mm equivalent (wide smartphone lens, slight barrel distortion at edges possible)",
aperture_range: "f/1.6–f/2.4 (typical of smartphone main lenses, allows for sharp foreground and some depth)",
focus_mode: "Auto-focus on mirror image, ensuring subject is in crisp detail with potential for soft background reflections",
framing: "Three-quarter to full-body portrait, subject centered or slightly off-center, headroom visible, entire body/pose reflected in mirror",
orientation: "Vertical (portrait orientation), hand-held; shot naturally with arm extended holding phone visible or partly visible",
camera_position: "Phone held at chest, chin or eye level, angled slightly to avoid flash bounce, self-composed in real-time"
},
location_and_background: {
setting: "Enclosed elevator with metallic or mirrored walls, industrial and minimal vibe",
background_elements: "Scratched, brushed metal surfaces, visible lines/seams of elevator panels, safety labels/signs, overhead fluorescent or LED lighting",
background_blur: "Minimal—mirror and metallic background remain sharp, with occasional soft flaring from reflective surfaces",
depth_of_field: "Wide; everything from subject and mirror to background in focus due to smartphone sensor and environment"
},
lighting: {
lighting_type: "Overhead fluorescent or cool LED lights typical of elevators; creates strong vertical highlights and reflections",
white_balance: "Cool white (~4000–5000K), neutral to slightly blue/cold tint from metallic surroundings",
exposure_compensation: "0EV; subject well-lit, possible hotspots on metallic surfaces, shadows under jaw and brows natural",
ISO_setting: "Automatic, low to moderate ISO for clarity with some digital noise in low-lit elevators",
shutter_speed: "Fast enough for sharp subject and visible reflections; handheld stability"
},
subject_pose_and_expression: {
poses: "Casual but bold, one leg bent or up on wall/bench, confident posture; one hand holding phone, other adjusting clothing/accessory or posed naturally",
facial_expression: "Relaxed, focused or cool; often partially obscured by phone, shades or slightly averted gaze",
gaze_direction: "Looking at phone's screen in the mirror, not always directly at the camera lens"
},
fashion_and_style: {
clothing: "Fashion-forward coordinated set or suit (e.g. matching jacket and pants), elevated streetwear, neutral or monochrome tones",
accessories: "Chunky shoes or boots, rings, earrings, statement sunglasses, modern phone as functional accessory",
hair: "Trimmed, sharp, and neatly styled to project confidence and self-awareness"
}
}
},


'yum_moment_diaries': {
    name: 'Yum Moment Diaries',
    rules: {
        composition_and_perspective: {
            camera_type: "Modern top-tier smartphone (iPhone 13 Pro/Pixel 7/Galaxy S series etc.) or high-end compact digital (Sony RX100 etc.), shot *only* with native camera app, utilizing Portrait or Standard Photo mode. Strictly handheld, never tripod.",
            focal_length_mm: "24mm–28mm equivalent for the majority (standard wide lens; no tele crop, no ultrawide); provides slight natural facial flattering, authentic field-of-view feel for dining context.",
            aperture_range: "Smartphone-native f/1.8–f/2.4, or compact’s f/1.8–f/2.8, to ensure high subject/background separation when possible: crisp food and face, subtle but *never artificial* computational blur.",
            focus_mode: "High-speed face/eye/smile/subject-detection autofocus. Both face and food (in-hand or being eaten) must be razor sharp. Any background softness comes only from physical or direct digital bokeh, not focus miss.",
            framing: "Perfectly centered or just off-center for lively candor, with bust-up to mid-waist portrait framing. Food is always clearly visible, never obscured—typically held within 15cm of mouth, hand or chopsticks present, eating gesture *mid-action* (lifting, slurping, prepping for bite, mouth mid-open). No static, awkward or paused poses.",
            orientation: "Almost always vertical (portrait) format, echoing Instagram/TikTok Reels; occasional true square is permitted if clearly composed for social snapshot (1:1 aspect ratio visible).",
            camera_position: "Camera leveled precisely with or just above subject’s eyes; never too high. Shot across table, arm’s length (selfie), or by companion shooting from direct, intimate eating distance. Point of view must communicate shared moment—never distanced, voyeuristic, or posed for perfection."
        },
        location_and_background: {
            setting: "Lively, visually layered real-world dining: neon-lit open-air markets, cozy bistro interiors, warm-lit home tables with visible city view, bustling restaurants, or late-night curbside street food stands. Outdoor shots clearly telegraph night or magic hour ambiance.",
            background_elements: "Backgrounds must show context: string/fairy lights, plate stacks, glowing street signs, cozy indoor lighting (lamps, candles), visible dusk/city skyline through glass, fellow diners. Visual information is rich, *never staged-empty or generic*.",
            background_blur: "Soft and organic; shallow DOF from wide aperture, or subtle computational portrait blur typical of premium phone cameras. Depth haze is gentle, never excessive, with face/food always pin-sharp.",
            depth_of_field: "Moderate—foreground (subject and food) *absolutely sharp*; background softened just enough to ensure intimacy and visual separation while maintaining environmental detail."
        },
        lighting: {
            lighting_type: "100% practical and environmental lighting: table lamps, restaurant pendant bulbs, neon/building signs, string/fairy lights, or bright picture windows. On-camera smartphone flash used *very* subtly for subtle fill *only* at night—never as direct harsh source.",
            white_balance: "Strict 3000–4000K indoors (soft, golden, natural skin/food tones), 5000–6000K outdoor daylight or high-rise night scenes (neutral, slightly blue city glow). Indoor scenes often exhibit cozy yellow highlight burn.",
            exposure_compensation: "0EV or +0.3EV. Skin and food may gently clip highlights near practical bulbs or neon but must never look harsh. Natural shadows are preserved, imparting warm, lived-in, appetizing mood.",
            ISO_setting: "Automatic, typically < ISO 1200 indoors at night or ISO 100–400 daylight/café. Gentle, refined sensor noise/grain in dim settings is embraced for atmosphere, *never strongly denoised or plastic*.",
            shutter_speed: "1/60s–1/200s, always fast enough to *freeze* eating gestures but permitting extremely slight motion blur on noodles or utensils, reflecting real-life movement."
        },
        subject_pose_and_expression: {
            poses: "Mid-action only: fork twirling, chopsticks to lips, noodles just about to slurp, full bite in progress, taco or sushi poised for taste. Arm and hand position is relaxed, never posed—elbows close to body, shoulders natural.",
            facial_expression: "Unselfconscious enjoyment or anticipation: closed eyes with savor, lips partly open, cheeks slightly puffed, toothy or closed-mouth smile, or gentle ‘eating in progress’ focus. Always authentic and candid—no forced grins, staged duckfaces, or exaggerated commercial tropes.",
            gaze_direction: "Often downward toward food in hand, bowl/plate, or gaze softly off-camera at companions, with only the occasional, spontaneous look toward camera for a captured-in-moment, vibrant, unposed energy."
        },
        fashion_and_style: {
            clothing: "Effortless daily elegance: cozy knits, neutral blouses/shirts, subtle prints, oversized blazers or tailored jackets, casual chic tanks or long-sleeve tops. Main color tones muted, earth-inspired, or naturally patterned—absolutely no flashy logos or mismatched brights.",
            accessories: "Minimal—simple metallic earrings, delicate chains, *very occasional* sunglasses (on head/outdoors only), subtle AirPods or headphones (for a home, ‘winding down’ scene only), and everyday rings. Jewelry is never the focus.",
            hair: "Naturally styled to match the vibe: loose and tousled, tied back for practicality, sometimes accessorized with a subtle clip or bun. Zero hard gel, helmet-hair, or overdone looks—must *read* as fresh, relaxed, and conducive to eating."
        }
    }
},

'selfcare_bliss_aesthetic': {
    name: 'Selfcare Bliss Aesthetic',
    rules: {
        composition_and_perspective: {
            camera_type: "Smartphone front camera or mirrorless with flip screen; preference for sensors that capture vivid sunlight and skin texture",
            focal_length_mm: "22mm to 26mm equivalent (slight distortion for beach openness, ideal for wide but flattering facial focus)",
            aperture_range: "f/1.8 - f/2.2 (shallow depth of field, sunlight diffusion on subject)",
            focus_mode: "Face-priority autofocus; ensures facial clarity with gentle highlight transitions on hair and background sand dunes",
            framing: "Medium crop, subject centered or rule-of-thirds aligned; includes upper body or seated pose, balanced to feature environment and person equally",
            orientation: "Portrait orientation (vertical), slight upward tilt to capture sky and landscape; natural selfie perspective",
            camera_position: "Handheld or surface-propped; arm’s length, ~60–80 cm; angled to capture beachscape layers (sand, sky, props) in parallel with facial glow"
        },
        location_and_background: {
            setting: "Beachside in daylight; open skies, sandy textures, minimal clutter; natural slopes or dunes adding organic structure",
            background_elements: "Bright skies with scattered clouds, sloping sandbanks, occasional surfboard or towel, natural gradients from sand to sky; soft shadows or none at all",
            background_blur: "Mild computational blur or default lens falloff; environment still readable but not sharp",
            depth_of_field: "Moderate; clear subject focus, soft gradient background with subtle sunlight haze for dreamy vibe"
        },
        lighting: {
            lighting_type: "Full-spectrum natural sunlight (late morning to mid-afternoon), ideal for casting warm glow on skin and sand",
            white_balance: "Auto, nudged toward warm (5200–5800K); golden undertones that enhance skin and hair vibrancy",
            exposure_compensation: "+0.3EV to +1EV; high-key aesthetic with glowy skin, visible but softened highlights on cheeks and forehead",
            ISO_setting: "Low ISO 50–200 to retain clarity and preserve sand texture and sky gradients",
            shutter_speed: "1/250s to 1/800s (freeze subtle movements like hair strands or breezy clothing)"
        },
        subject_pose_and_expression: {
            poses: "Casual and sunkissed; seated, one knee up or cross-legged; leaning slightly, hair swept naturally; hand resting on leg or touching hair",
            facial_expression: "Subtle half-smile or soft grin, relaxed jawline; expression reads warm, breezy, approachable",
            gaze_direction: "Mostly toward camera or gently angled; eye contact should feel candid, not posed"
        },
        fashion_and_style: {
            clothing: "Relaxed beachwear: oversized graphic tee (e.g., Polo logo visible), natural shorts or bikini bottom barely peeking; neutral tones or navy for contrast",
            accessories: "Minimal jewelry like a bead necklace or simple bracelet; no heavy makeup—sun-kissed natural skin, visible freckles welcome",
            hair: "Wind-ruffled, tousled layers; parted loosely or falling forward; no visible styling product—texture should reflect breeze and humidity"
        }
    }
},

         'late_night_lofi': {
             name: 'Late Night Lo-Fi Vibes',
             rules: {
                 composition_and_perspective: {
                     camera_type: "35mm film camera with direct flash, or digital compact camera with pop-up/onboard flash",
                     focal_length_mm: "28mm to 38mm equivalent (slight wide angle, classic point-and-shoot aesthetic)",
                     aperture_range: "f/2.8 - f/4.0 (fixed or semi-fixed)",
                     focus_mode: "Autofocus or fixed focus, with a focus point on the subject's face; edge blur or mild softness from flash acceptable",
                     framing: "Casual waist-up or chest-up, some shots even wider for context (full body or half body). Slightly off-center, spontaneous cropping likely (limbs or objects getting cropped).",
                     orientation: "Mostly vertical (portrait) or horizontal (landscape), images may include slight tilt or off-axis framing",
                     camera_position: "Eye-level or slightly above, close range (50-120cm from subject); handheld, point-and-shoot style"
                 },
                 location_and_background: {
                     setting: "Ordinary indoor/nighttime settings—kitchen, laundry, living room, and informal gathering places",
                     background_elements: "Typical home or shared-space elements (fridge, oven, cabinets, appliances, tables, laundry machines) are clearly visible; natural disorder is left intact",
                     background_blur: "Minimal; most details in the background captured sharply due to flash and small sensor/fixed aperture",
                     depth_of_field: "Very wide (everything reasonably sharp—classic compact camera look)"
                 },
                 lighting: {
                     lighting_type: "Direct on-camera flash (harsh, creates sharp-edged shadows and light fall-off); room ambient light is present but dominated by flash",
                     white_balance: "Auto or flash preset; color temperature 5000-6500K (neutral to slightly cool). Skin tones can appear pale or desaturated under flash.",
                     exposure_compensation: "0EV; mild occasional overexposure on faces and highlights due to flash is normal",
                     ISO_setting: "200–400 for film, ISO 100–400 for digital (supports clear details and flash)",
                     shutter_speed: "1/60 to 1/125s; typical flash sync speeds, prevents motion blur"
                 },
                 subject_pose_and_expression: {
                     poses: "Relaxed, casual, sometimes exaggerated or humorous (drinking, eating, showing attitude, playing with food, lounging in odd locations like laundry baskets)",
                     facial_expression: "Unfiltered, playful, or nonchalant; subjects may be smiling, making faces, pouting, laughing, or displaying irreverent gestures (e.g. flipping the finger)",
                     gaze_direction: "Facing the camera directly, glancing away, or interacting with someone/something offscreen; engagement with the flash/camera is a key part of the snapshot look"
                 },
                 fashion_and_style: {
                     clothing: "Simple, everyday, casual wear: t-shirts, sweatshirts, pajamas, denim, possibly oversized or relaxed fits",
                     accessories: "Minimal: earrings, bracelets, or everyday items (food, utensils, soda bottles) used as props",
                     hair: "Loose, natural, sometimes slightly messy or 'unstyled', in line with the spontaneous, candid vibe"
                 }
             }
         },
         'forced_perspective_play': {
             name: 'Forced Perspective Play',
             rules: {
                 composition_and_perspective: {
                     camera_type: "Modern smartphone main camera (wide lens) or digital mirrorless/compact with wide lens",
                     focal_length_mm: "16mm to 24mm equivalent (ultra-wide to wide angle lens, enables strong forced perspective)",
                     aperture_range: "f/1.8 - f/2.8 (smartphone wide lens default or compact wide prime)",
                     focus_mode: "Autofocus, focused on foreground object or hand; background person/subject remains within depth of field due to wide lens",
                     framing: "Full body or knee-up; subject is placed in background while hand/props/objects (cups, hands, fingers) are held very close to the lens, appearing oversized and prominent. The perspective exaggerates the size difference.",
                     orientation: "Vertical (portrait) orientation nearly always used for impact on social media feeds; camera faces slightly downward and at angle to create playful sense of scale.",
                     camera_position: "Handheld at arm's length above/between chest and eye level, or facing downward towards standing or sitting subject. Camera 40–90cm from foreground hand/object, 2–4 meters from subject."
                 },
                 location_and_background: {
                     setting: "Urban or street outdoor (sidewalks, in front of cafes/shops, tiled walls); spacious for depth between hand and subject",
                     background_elements: "Urban details: tiles, shop windows, signage, bikes, sidewalk cracks, plant pots, etc. Environment largely in focus and unobstructed.",
                     background_blur: "Minimal; ultra-wide lens and high f-number keeps both hand/object and person sharp. Slight loss of detail in background edges is natural.",
                     depth_of_field: "Very deep; both foreground and background sharply rendered."
                 },
                 lighting: {
                     lighting_type: "Natural daylight, generally bright and even (open shade or direct sun). Strong, clean daylight required for edge-to-edge sharpness.",
                     white_balance: "Auto (typically ~5000-6500K), adapted for daylight",
                     exposure_compensation: "Autoexposure or slight -0.3EV bias to prevent highlights from blowing out on hands/objects",
                     ISO_setting: "ISO 50–200 (smartphone daylight base); minimal noise",
                     shutter_speed: "1/200s–1/800s to freeze movement, especially for close-up hands"
                 },
                 subject_pose_and_expression: {
                     poses: "Subject stands or sits facing camera, holding objects (cups, drinks) or hands fully extended toward lens; foreground hand(s) or held objects are very large in frame; subject casually posed in background, sometimes interacting with foreground (e.g. looking at drink, reacting to hand gesture, playful expressions)",
                     facial_expression: "Playful, expressive, or nonchalant—pout, pursed lips, sunglasses, peace signs, or small smiles; not serious or posed",
                     gaze_direction: "Occasionally looking at the camera, at the hand/object, or away; interactive vibe"
                 },
                 fashion_and_style: {
                     clothing: "Trendy or casual urbanwear: oversized sweaters/jackets, loose jeans/trousers, visible accessories (nails, sunglasses, bags)",
                     accessories: "Nail art, sunglasses, small jewelry, statement bags/props",
                     hair: "Loose, styled or naturally flowing; not staged"
                 }
             }
         },
         'solo_snap_vibe': {
    name: 'Solo Snap Vibe',
    rules: {
        composition_and_perspective: {
            camera_type: "Front-facing smartphone camera (flagship tier) or digital compact camera with real-time LCD framing",
            focal_length_mm: "24mm eq. (smartphone wide lens standard), no digital zoom",
            aperture_range: "f/2.2 – f/2.4, fixed smartphone lens; enough depth for face detail, subtle rolloff behind",
            focus_mode: "Continuous autofocus with face priority; must maintain micro-sharpness on eyes under natural motion",
            framing: "Medium-loose close-up; subject fills 60–70% of vertical frame. Head near top third, arms visible, posture relaxed but central",
            orientation: "Portrait mode only; camera slightly above eyeline, angled down 5–10 degrees to preserve natural chin-to-eye ratio",
            camera_position: "Arm's-length handheld, resting elbow on thigh or ground if seated; subject-lens distance between 50–65cm precisely"
        },
        location_and_background: {
            setting: "Outdoor natural light setting—beach, dunes, light-toned sand with blue sky overhead. No crowds, open space",
            background_elements: "Recognizable real-world textures: soft dune gradients, beach towel, distant sky horizon, maybe an object like a kayak but blurred",
            background_blur: "No artificial portrait blur; use native optical or computational depth (faux-bokeh not allowed)",
            depth_of_field: "Slight, smartphone-emulated DoF—subject in full focus, background readable but soft-edged"
        },
        lighting: {
            lighting_type: "Diffuse daylight with soft shadows—no direct midday sun. Natural light from sun at high angle, no backlighting or harsh glare",
            white_balance: "Auto or daylight preset (~5500K), tuned for vivid blues, sand tone accuracy, and neutral skin",
            exposure_compensation: "+0.3EV to +0.7EV: intentional overexposure on skin to retain warmth and clarity in midtones",
            ISO_setting: "ISO 35–100 in daylight, must retain shadow detail on face and arms without visible noise",
            shutter_speed: "1/100s minimum to freeze movement, subject must appear tack-sharp despite any minor hand tremors"
        },
        subject_pose_and_expression: {
            poses: "Seated on sand, one leg bent; natural lean toward camera. Shoulders relaxed, back not rigid. Arm casually touching leg or resting on towel",
            facial_expression: "Subtle, friendly half-smile; mouth gently closed or slightly parted. No forced grin or model gaze—must feel like a candid moment",
            gaze_direction: "Directly into camera lens or slightly off to the side as if distracted by something nearby; no fixed stare"
        },
        fashion_and_style: {
            clothing: "Dark navy graphic tee (e.g., Ralph Lauren logo), soft cotton texture. No stylized outfit—basic, everyday wear",
            accessories: "Simple bead necklace and pearl stud earrings; minimal makeup, skin glow from lighting not cosmetics",
            hair: "Natural blonde tones, parted center or off-center; wind-touched texture with flyaways visible, no heavy smoothing or product"
        }
    }
},
         'warm_moments': {
             name: 'Warm Moments',
             rules: {
                 composition_and_perspective: {
                     camera_type: "35mm film camera, digital point-and-shoot, or smartphone front/rear camera",
                     focal_length_mm: "28mm to 38mm equivalent (wide to slightly standard angle)",
                     aperture_range: "f/2.8 - f/4.5 for casual depth of field",
                     focus_mode: "Autofocus or manual, focusing on the couple's faces; minor front/rear blur or softness acceptable",
                     framing: "Mid-shot to tight crop (waist-up or closer), both subjects comfortably within frame, at least partial face visibility for each subject",
                     orientation: "Vertical (portrait) or slightly off-vertical handheld, unpolished",
                     camera_position: "Eye-level or slightly above, distance 40-80cm from subjects, often handheld by one of the couple or captured via a mirror"
                 },
                 location_and_background: {
                     setting: "Interior everyday settings: bathroom, car, casual store, or simple domestic room",
                     background_elements: "Recognizable real-life details (mirrors, towels, shelves, doors, car seats) left undisturbed",
                     background_blur: "Minimal to moderate, consistent with ~28-38mm at f/2.8-f/4.5 on crop/APS-C/full-frame; clear enough to recognize environment",
                     depth_of_field: "Moderately wide; both subjects and background visible, not fully isolated"
                 },
                 lighting: {
                     lighting_type: "Soft ambient interior lighting or on-camera flash typical for point-and-shoots/film; no studio light",
                     white_balance: "Auto white balance, slightly warm — color temp 3500-4200K",
                     exposure_compensation: "0EV to +1EV; not underexposed, accept mild flash hotspots",
                     ISO_setting: "400-800 for digital, color-negative or ISO 400-800 film emulation for analog/lo-fi vibe",
                     shutter_speed: "1/30 to 1/100s — sufficient to prevent major motion blur, but slight shake/blur is authentic"
                 },
                 subject_pose_and_expression: {
                     poses: "Casual, natural, unposed; includes hugging, cheek kissing, teeth brushing, or playful expressions; captured in the middle of candid interaction",
                     facial_expression: "Smiling, laughing, squinting or relaxed; genuine and non-posed",
                     gaze_direction: "Looking at the camera, at each other, or playfully away"
                 },
                 fashion_and_style: {
                     clothing: "Contemporary casual; sweatshirts, T-shirts, hoodies, striped or solid colors, minimal branding",
                     accessories: "Large retro sunglasses, everyday objects (toothbrush, point-and-shoot camera), simple jewelry",
                     hair: "Unstyled or loosely styled; natural-looking without significant product"
                 }
             }
         },
         'urban_motion_girl': {
             name: 'Urban Motion Girl',
             rules: {
                 composition_and_perspective: {
                     camera_type: "Mirrorless or DSLR with standard to slight wide lens; high-end smartphones with Pro/RAW mode",
                     focal_length_mm: "28mm to 35mm equivalent (wide for context, minimal distortion)",
                     aperture_range: "f/2.2 - f/4 (moderate depth, subject sharp, background defined)",
                     focus_mode: "Autofocus with face/eye detection on subject, single-shot or continuous for walking scenes",
                     framing: "Full-body or thigh-up framing; subject centered or slightly off-center with significant urban street in background. Headroom left above subject for air and context",
                     orientation: "Vertical (portrait preferred), camera held at thigh to chest level",
                     camera_position: "Standing 3–5 meters away (enough for environmental context and full figure); shot at or just below eye level"
                 },
                 location_and_background: {
                     setting: "City crosswalks, busy streets, urban intersections or lanes; crosswalk stripes, signage, curbs, blurred vehicles, city wall textures",
                     background_elements: "Active street scenes, moving cars or scooters (blurred with slower shutter), traffic signs, street trees, painted lines; urban details visible and prominent",
                     background_blur: "Static background is sharp; motion blur deliberately added to moving cars or people for sense of bustle. No portrait-mode bokeh.",
                     depth_of_field: "Medium-deep; subject clearly distinguished, but not isolated—city life recognizable"
                 },
                 lighting: {
                     lighting_type: "Natural daylight, open shade or overcast preferred; may include hard sunlight but without harsh shadow on face",
                     white_balance: "Auto or Daylight (5000–6000K); realistic skin tones and cool/true street colors",
                     exposure_compensation: "0EV to +0.7EV; balanced to retain ambient detail and subject clarity",
                     ISO_setting: "ISO 100–400 (day/overcast); no visible noise",
                     shutter_speed: "1/40s to 1/160s—fast for sharp walking/freeze, or slow (1/20s–1/80s) for purposeful motion blur of background vehicles"
                 },
                 subject_pose_and_expression: {
                     poses: "Standing confidently or walking with purposeful stride; arms natural (at side, holding bag); straight-on or 3/4 angle to camera",
                     facial_expression: "Serious, thoughtful or lightly confident; not exaggerated or artificially joyful",
                     gaze_direction: "Looking forward, slightly past the camera, into the street context"
                 },
                 fashion_and_style: {
                     clothing: "Iconic street fashion: oversized jersey or sweater, pleated mini or school skirt, unique socks, statement sneakers, subtle or playful layering",
                     accessories: "Headbands, layered necklaces, fashion-forward glasses, casual backpacks/shoulder bags",
                     hair: "Voluminous, braids, ponytails, or naturally free-flowing—styled to move naturally in wind"
                 }
             }
         },
         '90s_vintage_buddy': {
             name: '90s Vintage Buddy Vibes',
             rules: {
                 composition_and_perspective: {
                     camera_type: "Point-and-shoot 35mm film camera, disposable camera, or authentic digital compact with '90s CCD sensor",
                     focal_length_mm: "32mm to 38mm equivalent (classic compact film focal range, uncompressed perspective)",
                     aperture_range: "f/2.8 - f/4.5 (fixed on most vintage point-and-shoots)",
                     focus_mode: "Single autofocus or fixed focus typical of film compacts; minor blur, soft edges from missed focus are authentic and allowed",
                     framing: "Bust-up to half-body framing, both single and paired/couple compositions. Candid angles, eye-level or slightly above, often with a 'snapshot' imprecise crop (head/arms partly cut off).",
                     orientation: "Horizontal (landscape) or vertical (portrait), preferably handheld and spontaneous",
                     camera_position: "Handheld, short distance (50-120cm), possibly selfie arm's length or shot by a third person. No tripod/stabilizer."
                 },
                 location_and_background: {
                     setting: "Indoor rooms (apartments, bedrooms, kitchens, restaurants, casual nightlife, or student dorms), soft tungsten lighting, or simple outdoor with flash",
                     background_elements: "Unstaged: furniture, curtains, wall art, frames, plates/food, neon or signage, window blinds, objects scattered naturally",
                     background_blur: "Minimal; most background details readable, except for natural film softness",
                     depth_of_field: "Wide; most of the frame is in focus due to small sensors and wide lens"
                 },
                 lighting: {
                     lighting_type: "Direct on-camera flash (harsh, distinctive), or overhead tungsten/ambient room light. No professional lighting.",
                     white_balance: "Tungsten-balanced or auto, with light yellow or green tinge typical of daylight film indoors (~3500–4200K)",
                     exposure_compensation: "0EV; overexposed highlights and flash hotspots accepted, strong flash reflections on skin common",
                     ISO_setting: "ISO 200 to 800 (common consumer film speeds); visible grain at ISO 400+ is authentic and desirable",
                     shutter_speed: "1/40s to 1/100s—enough for handshake or subject motion to blur slightly, especially in low light"
                 },
                 subject_pose_and_expression: {
                     poses: "Natural, candid, relaxed, playful or goofy (e.g. sticking tongue out, exaggerated expressions, playful gestures, arm draped, shared food); close friendships or couple intimacy",
                     facial_expression: "Genuine, fun, slightly dorky or offbeat (winking, squinting, pulling faces, poking fun); never staged or fashion serious",
                     gaze_direction: "Looking at camera or at each other; direct and casual"
                 },
                 fashion_and_style: {
                     clothing: "Casual: leather jackets, denim, oversized shirts/sweaters, sport or varsity jackets, simple tees—primary colors, iconic 90s cuts and details",
                     accessories: "Minimal jewelry, subtle necklaces, hair clips or bands, 90s layering, little visible branding",
                     hair: "Natural, air-dried, loose, minimal product—center or side parting common"
                 }
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

STYLE RULES TO INCORPORATE:

Camera & Composition:
- Camera: ${rules.composition_and_perspective?.camera_type}
- Focal length: ${rules.composition_and_perspective?.focal_length_mm}
- Framing: ${rules.composition_and_perspective?.framing}
- Position: ${rules.composition_and_perspective?.camera_position}

Setting & Environment:
- Location: ${rules.location_and_background?.setting}
- Background: ${rules.location_and_background?.background_elements}
- Depth: ${rules.location_and_background?.depth_of_field}

Lighting:
- Type: ${rules.lighting?.lighting_type}
- White balance: ${rules.lighting?.white_balance}
- Exposure: ${rules.lighting?.exposure_compensation}

Pose & Expression:
- Poses: ${rules.subject_pose_and_expression?.poses}
- Expression: ${rules.subject_pose_and_expression?.facial_expression}
- Gaze: ${rules.subject_pose_and_expression?.gaze_direction}

Fashion & Style:
- Clothing: ${rules.fashion_and_style?.clothing}
- Accessories: ${rules.fashion_and_style?.accessories}
- Hair: ${rules.fashion_and_style?.hair}

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

STYLE RULES TO INCORPORATE:

Camera & Composition:
- Camera: ${rules.composition_and_perspective?.camera_type}
- Focal length: ${rules.composition_and_perspective?.focal_length_mm}
- Framing: ${rules.composition_and_perspective?.framing}
- Position: ${rules.composition_and_perspective?.camera_position}

Setting & Environment:
- Location: ${rules.location_and_background?.setting}
- Background: ${rules.location_and_background?.background_elements}
- Depth: ${rules.location_and_background?.depth_of_field}

Lighting & Atmosphere:
- Type: ${rules.lighting?.lighting_type}
- White balance: ${rules.lighting?.white_balance}
- Exposure: ${rules.lighting?.exposure_compensation}
- ISO: ${rules.lighting?.ISO_setting}

Mood & Atmosphere:
- Overall feel: ${rules.mood_and_atmosphere?.overall_feel}
- Color palette: ${rules.mood_and_atmosphere?.color_palette}
- Contrast: ${rules.mood_and_atmosphere?.contrast}

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

// NEW HELPER FUNCTION FOR ENVIRONMENT DETAILS
// =============================================
// SLIDESHOW IMAGE GENERATION FUNCTIONS
// =============================================

async function generateSlideshowBackgroundPrompt(slideText, style, openaiInstance) {
    // Get background rules from frameMapping
    const backgroundRules = getImageSetRulesByFrameId('background');
    
    const prompt = `
Create a concise, high-quality image prompt for a slideshow background based on this slide content: "${slideText}"

Background Requirements:
- Style: ${style || 'cinematic, atmospheric'}
- Composition: Wide establishing shot showcasing the setting
- Lighting: Natural or ambient lighting that enhances mood
- Mood: Cinematic, atmospheric, and visually compelling
- Colors: Rich and harmonious colors
- Details: Environmental details that tell a story

Generate a focused prompt (max 50 words) that creates an engaging background for this slide content.
Focus on mood, atmosphere, and visual elements that complement the text.

Prompt:`;

    try {
        const completion = await openaiInstance.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{
                role: "user",
                content: prompt
            }],
            max_tokens: 100,
            temperature: 0.7,
        });

        return completion.choices[0].message.content.trim();
    } catch (error) {
        logger.error("[generateSlideshowBackgroundPrompt] Error:", error);
        // Fallback simple prompt
        return `Cinematic background scene, atmospheric lighting, rich colors, environmental storytelling, ${style || 'professional photography'}`;
    }
}

async function generateSlideshowImagesAI(slideTexts, imageGenerationMode, style, openaiInstance) {
    logger.info(`[generateSlideshowImagesAI] Generating ${imageGenerationMode} for ${slideTexts.length} slides`);
    
    try {
        if (imageGenerationMode === 'single_ai_shared') {
            // Generate one image for all slides
            const combinedText = slideTexts.join(', ');
            const enhancedPrompt = await generateSlideshowBackgroundPrompt(combinedText, style, openaiInstance);
            
            logger.info(`[generateSlideshowImagesAI] Single AI prompt: ${enhancedPrompt}`);
            
            // Use existing generateImage logic
            const imageResult = await generateSingleImage(enhancedPrompt, 'background');
            
            // Return same image for all slides
            return slideTexts.map(() => imageResult.imageUrl);
            
        } else if (imageGenerationMode === 'ai_per_slide') {
            // Generate separate image for each slide
            const imagePromises = slideTexts.map(async (slideText, index) => {
                const enhancedPrompt = await generateSlideshowBackgroundPrompt(slideText, style, openaiInstance);
                logger.info(`[generateSlideshowImagesAI] Slide ${index + 1} prompt: ${enhancedPrompt}`);
                
                const imageResult = await generateSingleImage(enhancedPrompt, 'background');
                return imageResult.imageUrl;
            });
            
            // Generate all images in parallel
            const imageUrls = await Promise.all(imagePromises);
            logger.info(`[generateSlideshowImagesAI] Generated ${imageUrls.length} images`);
            
            return imageUrls;
        }
        
        return [];
    } catch (error) {
        logger.error("[generateSlideshowImagesAI] Error generating images:", error);
        throw error;
    }
}

async function generateSingleImage(prompt, subtype) {
    logger.info(`[generateSingleImage] Generating image for prompt: ${prompt}`);
    
    try {
        // Initialize Replicate directly
        const replicateToken = process.env.REPLICATE_API_TOKEN;
        if (!replicateToken) {
            throw new Error('Replicate API token not found');
        }
        
        const Replicate = require('replicate');
        const replicate = new Replicate({ auth: replicateToken });
        
        // Use Imagen-4 for slideshow images
        const input = {
            prompt: prompt,
            aspect_ratio: "9:16",
            output_format: "png", 
            safety_tolerance: 2
        };
        
        logger.info(`[generateSingleImage] Generating with Imagen-4: ${prompt.substring(0, 100)}...`);
        
        const output = await replicate.run("google/imagen-4", { input });
        
        let imageUrl;
        if (typeof output === 'string' && output.startsWith('http')) {
            imageUrl = output;
        } else if (Array.isArray(output) && output.length > 0) {
            imageUrl = output[0];
        } else {
            throw new Error('Invalid output format from Replicate');
        }
        
        logger.info(`[generateSingleImage] Successfully generated image: ${imageUrl}`);
        return { imageUrl: imageUrl };
        
    } catch (error) {
        logger.error("[generateSingleImage] Error generating image:", error);
        throw error;
    }
}

async function generateSlideshowImages(params) {
    const { slideTexts, connectedImages, imageGenerationMode, style } = params;
    
    logger.info(`[generateSlideshowImages] Mode: ${imageGenerationMode}, Slides: ${slideTexts.length}, Connected: ${connectedImages?.length || 0}`);
    
    // Initialize OpenAI
    const openaiInstance = new OpenAI({ apiKey: process.env.OPENAI_KEY });
    
    try {
        // Priority 1: Use connected images if available
        if (connectedImages && connectedImages.length > 0) {
            logger.info(`[generateSlideshowImages] Using ${connectedImages.length} connected images`);
            
            // Use connected images, repeat if needed
            const imageUrls = slideTexts.map((_, index) => {
                const imageIndex = index % connectedImages.length;
                return connectedImages[imageIndex].imageUrl;
            });
            
            return {
                success: true,
                imageUrls: imageUrls,
                mode: 'connected_images',
                cost: 30 // Connected images cost
            };
        }
        
        // Priority 2: Generate AI images based on mode
        if (imageGenerationMode === 'single_ai_shared' || imageGenerationMode === 'ai_per_slide') {
            // Generate AI images
            const imageUrls = await generateSlideshowImagesAI(slideTexts, imageGenerationMode, style, openaiInstance);
            const cost = imageGenerationMode === 'single_ai_shared' ? 60 : 150;
            
            return {
                success: true,
                imageUrls: imageUrls,
                mode: imageGenerationMode,
                cost: cost
            };
        }
        
        throw new Error(`Unknown image generation mode: ${imageGenerationMode}`);
        
    } catch (error) {
        logger.error("[generateSlideshowImages] Error:", error);
        throw error;
    }
}

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
    
    // --- Dynamic Credit Check Based on Quality ---
    const userRef = db.collection('users').doc(userId);
    let requiredCredits = 90; // Default high quality
    if (data.quality === 'low') {
        requiredCredits = 30;
    } else if (data.quality === 'medium') {
        requiredCredits = 60;
    } else {
        requiredCredits = 90; // high quality
    }
    
    try {
        logger.info(`[generateImage User: ${userId}] Performing credit check for ${data.quality || 'high'} quality (${requiredCredits} credits).`);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            logger.error(`[generateImage User: ${userId}] User profile not found for credit check.`);
            throw new HttpsError('not-found', 'User profile not found for credit check.');
        }
        const currentCredits = parseInt(userDoc.data()?.general_credits, 10) || 0;
        if (currentCredits < requiredCredits) {
            logger.warn(`[generateImage User: ${userId}] Insufficient general_credits (${currentCredits}) for ${data.quality || 'high'} quality image generation (needs ${requiredCredits}).`);
            throw new HttpsError('resource-exhausted', `Insufficient general credits for ${data.quality || 'high'} quality image generation. You need at least ${requiredCredits} credits. You have ${currentCredits}.`);
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

        if (selectedModel === 'ideogram-ai/ideogram-v3-quality') {
            modelName = 'ideogram-ai/ideogram-v3-quality';
            modelInput = {
                prompt: finalPromptToUse,
                aspect_ratio: data.aspectRatio === "1:1" ? "1:1" : data.aspectRatio === "16:9" ? "16:9" : "9:16",
                model: "V_3_QUALITY",
                magic_prompt_option: "AUTO"
            };
        } else {
            // Default to Imagen 4
            modelName = 'google/imagen-4';
            modelInput = {
                prompt: finalPromptToUse,
                aspect_ratio: data.aspectRatio === "1:1" ? "1:1" : data.aspectRatio === "16:9" ? "16:9" : "9:16",
                output_format: "png",
                safety_tolerance: 2
            };
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

exports.generateImageSlideshow = onCall({region: 'us-central1', timeoutSeconds: 540}, async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    // Destructure ALL parameters, including the new image generation parameters
    const { 
        topic, 
        slide_1_text, 
        slide_2_text, 
        slide_3_text, 
        slide_4_text, 
        background_name, 
        image_style, 
        language, 
        _slideshow_type_context,
        connectedImages,           // NEW: Connected images from canvas
        imageGenerationMode,      // NEW: connected_images, from_assets, single_ai_shared, ai_per_slide  
        style                     // NEW: Style for AI generation
    } = request.data;
    
    const targetLanguage = language || 'en'; // Default to English if not provided
    const slideshowType = _slideshow_type_context || 'learn_grow'; // Default to learn_grow if not provided
    const generationId = Date.now().toString();

    // --- Define Slideshow Type Instructions ---
    const getSlideshowTypeInstruction = (type) => {
        switch (type) {
            case 'top_3_lists':
                return `
                SLIDESHOW TYPE: Top 3 Lists
                GOAL: Present information in an easy-to-digest ranking format that educates and engages.
        
                STRUCTURE (4 slides total):
                1. Slide 1: Title + Hook: Present the list topic as a question or bold statement (e.g., "Top 3 Ways to...")
                2. Slide 2: "#1 - [First Item]": Present the top item with brief explanation
                3. Slide 3: "#2 - [Second Item]": Present the second item with brief explanation  
                4. Slide 4: "#3 - [Third Item]": Present the third item with brief explanation
        
                TONE: Clear, informative, authoritative. Use numbered format consistently.
                `;
        
            case 'before_after':
                return `
                SLIDESHOW TYPE: Before & After
                GOAL: Show transformation, progress, or dramatic change to inspire and engage.
        
                STRUCTURE (4 slides total):
                1. Slide 1: "Before" Setup: Show the starting point or problem state
                2. Slide 2: The Challenge: Explain what was wrong or what needed to change
                3. Slide 3: The Change: Show the transformation process or key moment
                4. Slide 4: "After" Result: Reveal the final outcome or current state
        
                TONE: Inspiring, relatable, encouraging. Focus on the transformation journey.
                `;
        
            case 'step_by_step':
                return `
                SLIDESHOW TYPE: Step-by-Step Guide
                GOAL: Provide clear, actionable instructions that viewers can follow.
        
                STRUCTURE (4 slides total):
                1. Slide 1: Introduction: Present what will be taught (e.g., "Perfect Morning Routine")
                2. Slide 2: "STEP 1": First action with brief explanation
                3. Slide 3: "STEP 2": Second action with brief explanation
                4. Slide 4: "STEP 3": Final action with brief explanation
        
                TONE: Instructional, clear, actionable. Use "STEP" prefix and keep instructions simple.
                `;
        
            case 'question_reveal':
                return `
                SLIDESHOW TYPE: Question & Reveal
                GOAL: Create curiosity with a question, then provide a surprising or educational answer.
        
                STRUCTURE (4 slides total):
                1. Slide 1: The Question: Pose an intriguing question to hook viewers
                2. Slide 2: Options/Build-up: Present possible answers or build suspense
                3. Slide 3: The Reveal: Give the surprising answer or reveal
                4. Slide 4: Explanation: Explain why this answer is correct or significant
        
                TONE: Curious, engaging, educational. Build suspense then deliver the payoff.
                `;
        
            case 'personal_story':
                return `
                SLIDESHOW TYPE: Personal Story
                GOAL: Share a relatable personal experience that creates emotional connection.
        
                STRUCTURE (4 slides total):
                1. Slide 1: Setup: Introduce a situation or emotion (e.g., "Yesterday this happened...")
                2. Slide 2: Build: Give context and describe the experience
                3. Slide 3: Turning Point: Share the key realization or moment
                4. Slide 4: Reflection: End with a relatable takeaway or lesson learned
        
                TONE: Personal, authentic, relatable. Use first-person voice and honest emotion.
                `;
        
            case 'problem_solution':
                return `
                SLIDESHOW TYPE: Problem & Solution
                GOAL: Identify a common problem and present a clear solution.
        
                STRUCTURE (4 slides total):
                1. Slide 1: Problem Hook: Present a relatable problem or pain point
                2. Slide 2: Problem Impact: Show how this problem affects people
                3. Slide 3: Solution Introduction: Present the solution or method
                4. Slide 4: Solution Result: Show the positive outcome or benefit
        
                TONE: Solution-focused, helpful, empowering. Focus on solving real problems.
                `;
        
            default:
                return `
                SLIDESHOW TYPE: Top 3 Lists (default)
                Use a 4-slide structure:
                1. Hook with a list topic
                2-4. Present 3 numbered items with brief explanations
                Aim to educate or inform in a simple, structured way.
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
                model: "gpt-4.1-nano",
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


        // --- NEW: Image Generation Logic ---
        let finalImageUrls = [];
        let generationCost = 50; // Base slideshow cost
        
        logger.info(`[${generationId}] Image generation mode: ${imageGenerationMode || 'legacy'}`);
        
        if (imageGenerationMode && imageGenerationMode !== 'legacy') {
            // Handle special cases first
            if (imageGenerationMode === 'from_assets') {
                // Use existing user background images
                if (availableBackgrounds.length > 0) {
                    logger.info(`[${generationId}] Using ${availableBackgrounds.length} available background assets`);
                    
                    // Cycle through available backgrounds for each slide
                    finalImageUrls = slideTexts.map((_, index) => {
                        const backgroundIndex = index % availableBackgrounds.length;
                        return availableBackgrounds[backgroundIndex].imageUrl;
                    });
                    
                    generationCost += 30; // from_assets cost
                    logger.info(`[${generationId}] Used ${finalImageUrls.length} background assets, cost: 30`);
                } else {
                    logger.warn(`[${generationId}] No background assets available for from_assets mode`);
                    throw new Error('No background assets available');
                }
            } else {
                // Use AI generation system for other modes
                try {
                    const imageGenResult = await generateSlideshowImages({
                        slideTexts: slideTexts,
                        connectedImages: connectedImages,
                        imageGenerationMode: imageGenerationMode,
                        style: style
                    });
                    
                    if (imageGenResult.success) {
                        finalImageUrls = imageGenResult.imageUrls;
                        generationCost += imageGenResult.cost;
                        logger.info(`[${generationId}] Generated ${finalImageUrls.length} images with mode: ${imageGenResult.mode}, additional cost: ${imageGenResult.cost}`);
                    } else {
                        throw new Error('Image generation failed');
                    }
                    
                } catch (imageGenError) {
                    logger.error(`[${generationId}] Image generation failed:`, imageGenError);
                    // Fall back to legacy background system
                    logger.info(`[${generationId}] Falling back to legacy background system`);
                }
            }
        }
        
        // --- Legacy: Render Texts onto Background Images ---
        const processedImageUrls = [];
        if (!finalImageUrls.length && selectedBackgroundUrl && slideTexts.every(text => text && text.trim() !== '')) {
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

        // --- Final Image URLs Selection ---
        const finalUsedImageUrls = finalImageUrls.length > 0 ? finalImageUrls : (processedImageUrls.length > 0 ? processedImageUrls : null);
        
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
            processedImageUrls: finalUsedImageUrls, // NEW: Use finalUsedImageUrls instead
            imageGenerationMode: imageGenerationMode || 'legacy', // NEW: Store generation mode
            generationCost: generationCost, // NEW: Store total cost
            timestamp: FieldValue.serverTimestamp(),
        };

        // Transaction for saving generation and decrementing credits
        await db.runTransaction(async (transaction) => {
            const userSnapshot = await transaction.get(userRef);
            const currentCredits = parseInt(userSnapshot.data()?.general_credits, 10) || 0;
            if (currentCredits < generationCost) { // CHECK if enough credits for slideshow
                throw new HttpsError('resource-exhausted', `Insufficient general credits for slideshow (needs ${generationCost}).`);
            }
            transaction.update(userRef, { general_credits: FieldValue.increment(-generationCost) }); // DECREMENT by dynamic cost
            transaction.set(generationDocRef, generationData);
        });

        logger.info(`Slideshow generation record saved (ID: ${generationDocRef.id}) and general_credits decremented by ${generationCost} for user ${userId}.`); // UPDATED LOG
        return { 
            success: true, 
            message: "Slideshow content and images generated successfully.", 
            data: { 
                generationId: generationDocRef.id, 
                slideTexts, 
                selectedBackgroundUrl, 
                processedImageUrls: finalUsedImageUrls, // NEW: Return final image URLs
                imageGenerationMode: imageGenerationMode || 'legacy',
                cost: generationCost
            } 
        };

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


// --- NEW: Generate Product Topics Function ---
exports.generateProductTopics = onCall({ region: 'us-central1', timeoutSeconds: 540 }, async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
        logger.error("generateProductTopics: Authentication required.");
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const { productId, productName, productDescription } = request.data;
    if (!productId || !productName || !productDescription) {
        logger.error(`generateProductTopics: Missing required parameters for user ${userId}.`);
        throw new HttpsError('invalid-argument', 'Missing required parameters: productId, productName, productDescription.');
    }

    logger.info(`generateProductTopics: Generating topics for product ${productId} (${productName}) for user ${userId}`);

    try {
        // Initialize OpenAI
        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (!openaiApiKey) {
            logger.error("generateProductTopics: OpenAI API key not found in environment variables.");
            throw new HttpsError('failed-precondition', 'OpenAI API key not configured.');
        }
        const openai = new OpenAI({ apiKey: openaiApiKey });

        // Generate topics prompt
        const prompt = `Based on this product, generate 3-5 specific marketing topics for TikTok content. Each topic should be a single word or very short phrase (max 2 words) that represents a key selling point, benefit, or angle for the product.

Product Name: ${productName}
Product Description: ${productDescription}

Generate topics that would work well for TikTok marketing, such as:
- Key benefits (e.g., "convenience", "savings", "beauty")  
- Target audience interests (e.g., "fitness", "lifestyle", "tech")
- Use cases (e.g., "travel", "work", "home")
- Emotional appeals (e.g., "confidence", "comfort", "success")

Return ONLY the topics, one per line, nothing else. Each topic must be 1-2 words maximum.`;

        // Call OpenAI API
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "You are a marketing expert specializing in TikTok content strategy. Generate concise, impactful topics for product marketing."
                },
                {
                    role: "user", 
                    content: prompt
                }
            ],
            max_tokens: 100,
            temperature: 0.7
        });

        const generatedText = response.choices[0]?.message?.content?.trim();
        if (!generatedText) {
            throw new Error("Empty response from OpenAI");
        }

        // Parse topics (split by lines and clean up)
        const topics = generatedText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => line.replace(/^[-•*]\s*/, '')) // Remove bullet points
            .filter(topic => topic.length <= 20) // Max 20 chars for safety
            .slice(0, 5); // Max 5 topics

        logger.info(`generateProductTopics: Generated ${topics.length} topics for product ${productId}: ${topics.join(', ')}`);

        // Save topics to Firestore
        const productRef = db.collection('users').doc(userId).collection('products').doc(productId);
        await productRef.update({
            topics: topics,
            topicsGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        logger.info(`generateProductTopics: Successfully saved topics to Firestore for product ${productId}`);
        
                         return {
            success: true,
            topics: topics,
            message: `Generated ${topics.length} marketing topics for ${productName}` 
        };

    } catch (error) {
        logger.error(`generateProductTopics: Error for user ${userId}, product ${productId}:`, error.message, error.stack);
        
        // Try to save error to product document
        try {
            const productRef = db.collection('users').doc(userId).collection('products').doc(productId);
            await productRef.update({
                topicsGenerationError: error.message,
                topicsGenerationErrorAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (firestoreError) {
            logger.error(`generateProductTopics: Failed to save error to Firestore:`, firestoreError.message);
        }

        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', `Failed to generate product topics: ${error.message}`);
    }
});
