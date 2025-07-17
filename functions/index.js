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

        'empty_highway_fashion': {
    name: 'Highway Fashion Shoot',
    rules: {
        composition_and_perspective: {
            camera_type: "Full-frame DSLR or mirrorless, or high-end 35mm film SLR (for analog look)",
            focal_length_mm: "24mm to 35mm (wide angle for dramatic perspective and sense of space)",
            aperture_range: "f/3.5 - f/5.6 (ensuring subject is sharp, background slightly softened but still readable)",
            focus_mode: "Single autofocus on subject, with focus tracking if walking shots are included",
            framing: "Full-body or three-quarters, subject centered or slightly off-center for dynamic composition. Use leading lines of the highway for depth.",
            orientation: "Horizontal (landscape) preferred to emphasize the road’s expanse; vertical for editorial close-ups",
            camera_position: "Low angle (waist to knee-level), 3–8 meters from subject for strong foreground and receding lines. Handheld or tripod, depending on desired stability and low-light needs."
        },
        location_and_background: {
            setting: "Deserted highway—visibly empty in both directions, no cars or people. Ideally dawn, sunset, or overcast noon for light quality.",
            background_elements: "Empty asphalt, distant horizon, road markings (lines, arrows), road signs if present; NO urban clutter, no traffic.",
            background_blur: "Mild to moderate—background details like distant signage or horizons are visible but not distracting.",
            depth_of_field: "Moderate; subject crisply in focus, with road texture and vanishing point softly receding."
        },
        lighting: {
            lighting_type: "Natural light—soft golden hour or overcast daylight preferred. Use reflectors for subtle fill on face if necessary.",
            white_balance: "Daylight (5200K–6000K), slightly cool for crispness or warm for editorial vibe; avoid excessive warmth.",
            exposure_compensation: "+0.3EV to ensure subject’s features and clothing are detailed, retain sky/horizon highlights.",
            ISO_setting: "ISO 100–400, keeping grain minimal, allowing high detail in subject and texture in road.",
            shutter_speed: "1/250s to 1/640s, freezing any subtle movement (walking, fabric flow), avoid motion blur."
        },
        subject_pose_and_expression: {
            poses: "Confident, editorial stances: standing upright, weight shifted, hands in pockets or jacket, slow purposeful walk, strong gait. Singular, statuesque poses to convey attitude.",
            facial_expression: "Neutral to subtly fierce—a fashion gaze. Minimal smile, controlled expression, slight squint against light or direct, piercing look at camera.",
            gaze_direction: "Primarily directed at camera; optionally gazing off to horizon for cinematic effect."
        },
        fashion_and_style: {
            clothing: "High-fashion or streetstyle garments—contrasting bold colors or monochrome, tailored coats, statement boots, layered textures. Clean, stylish silhouettes that stand out against the asphalt.",
            accessories: "Sunglasses, minimalist jewelry, belts or scarves sparingly; statement pieces that do not compete with the subject.",
            hair: "Styled: windblown, slicked back, or intentionally tousled for cinematic feel. Avoid overly polished looks; natural movement is key."
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
      focal_length_mm: "Exactly 8–12mm focal length on full-frame sensor, generating extreme barrel distortion; subject's facial features and limbs must expand and warp aggressively towards lens edges.",
      aperture_range: "Wide open to moderately stopped (f/2.8–f/4), maximizing depth of field; every foreground and background element absolutely tack sharp across frame.",
      focus_mode: "Manual or reliable autofocus locked at very close range (subject's face/hand almost touching the lens). There must be no blur; both central and edge elements rendered in full clarity.",
      framing: "Ultra-tight bust or chest-up composition, with face overpoweringly dominating center; one arm stretched out to top/side corner, hand enlarged/distorted by proximity. Strongly forced perspective: face and hand exaggeratedly prominent, corners heavily curved.",
      orientation: "Portrait (vertical) format is mandatory. Camera must be slightly canted/tilted, imparting dynamic, handheld immediacy. Viewer should viscerally sense the arm extension and aggressive spatial engagement.",
      camera_position: "Camera at maximum arm's reach, slightly above eye-line, angled down towards subject for confrontational, immersive perspective; lens directly faces subject, but is offset just enough to amplify the distortion."
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
            focus_mode: "Single shot autofocus, with classic early-2000s margin of error—focus must land on the subject's eyes or upper face, but slight softness or missed focus on surroundings is acceptable and even preferred for authenticity.",
            framing: "Waist-up (torso-dominant), tight vertical/portrait orientation, subject centered with crowd partially cropped at edges for that snapshot, slightly rushed feel. Minimal empty space; presence is immediate and immersive.",
            orientation: "Strictly upright/vertical (portrait), hand-held, possibly with subtle camera shake or tilt indicating candid, fast execution amidst crowd.",
            camera_position: "Lens at or slightly above subject's eye level, camera angled down just slightly, extremely close to subject (within 1–1.5 meters), as if shot rapidly while navigating a dense street scene."
        },
        location_and_background: {
            setting: "Congested city crosswalk or intersection at dusk—scene is unmistakably urban, flooding with pedestrians and city signage.",
            background_elements: "Dense, blurred crowd in motion; city signage glowing, traffic lights (e.g. noticeably illuminated green circle), reflective windows, storefront facades. Background figures partially streaked with motion blur and flash-shadow interaction.",
            background_blur: "Distinctive background blur from subject movement and slow sync flash, not optical bokeh. People in background are ghosted, moving, sometimes smeared, yet identifiable in silhouette.",
            depth_of_field: "Moderate—sharpest focus on main subject's face/shoulders, background detail lost to crowd movement and mild digital noise, NOT lens blur."
        },
        lighting: {
            lighting_type: "On-camera, direct built-in pop-up flash. Flash is harsh, revealing every pore and detail of the subject's illuminated face, with evident overexposed highlights (e.g., on skin or any reflective accessory like cell phone screens). Background remains in moody, natural ambient light with significant contrast between subject and environment.",
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
            aperture_range: "Smartphone-native f/1.8–f/2.4, or compact's f/1.8–f/2.8, to ensure high subject/background separation when possible: crisp food and face, subtle but *never artificial* computational blur.",
            focus_mode: "High-speed face/eye/smile/subject-detection autofocus. Both face and food (in-hand or being eaten) must be razor sharp. Any background softness comes only from physical or direct digital bokeh, not focus miss.",
            framing: "Perfectly centered or just off-center for lively candor, with bust-up to mid-waist portrait framing. Food is always clearly visible, never obscured—typically held within 15cm of mouth, hand or chopsticks present, eating gesture *mid-action* (lifting, slurping, prepping for bite, mouth mid-open). No static, awkward or paused poses.",
            orientation: "Almost always vertical (portrait) format, echoing Instagram/TikTok Reels; occasional true square is permitted if clearly composed for social snapshot (1:1 aspect ratio visible).",
            camera_position: "Camera leveled precisely with or just above subject's eyes; never too high. Shot across table, arm's length (selfie), or by companion shooting from direct, intimate eating distance. Point of view must communicate shared moment—never distanced, voyeuristic, or posed for perfection."
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
            facial_expression: "Unselfconscious enjoyment or anticipation: closed eyes with savor, lips partly open, cheeks slightly puffed, toothy or closed-mouth smile, or gentle 'eating in progress' focus. Always authentic and candid—no forced grins, staged duckfaces, or exaggerated commercial tropes.",
            gaze_direction: "Often downward toward food in hand, bowl/plate, or gaze softly off-camera at companions, with only the occasional, spontaneous look toward camera for a captured-in-moment, vibrant, unposed energy."
        },
        fashion_and_style: {
            clothing: "Effortless daily elegance: cozy knits, neutral blouses/shirts, subtle prints, oversized blazers or tailored jackets, casual chic tanks or long-sleeve tops. Main color tones muted, earth-inspired, or naturally patterned—absolutely no flashy logos or mismatched brights.",
            accessories: "Minimal—simple metallic earrings, delicate chains, *very occasional* sunglasses (on head/outdoors only), subtle AirPods or headphones (for a home, 'winding down' scene only), and everyday rings. Jewelry is never the focus.",
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
            camera_position: "Handheld or surface-propped; arm's length, ~60–80 cm; angled to capture beachscape layers (sand, sky, props) in parallel with facial glow"
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
