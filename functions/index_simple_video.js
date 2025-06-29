const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize Firebase
admin.initializeApp();
const db = admin.firestore();

// Simple video generation function for testing
exports.generateVideo = onCall({ region: 'us-central1', timeoutSeconds: 300, memory: '1GB' }, async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
        logger.error("generateVideo: Authentication Error.");
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const {
        prompt,
        imageUrl = null,
        aspectRatio = '9:16',
        duration = 5,
        model = 'minimax'
    } = request.data;

    if (!prompt && !imageUrl) {
        throw new HttpsError('invalid-argument', 'Either prompt or imageUrl must be provided.');
    }

    logger.info(`generateVideo called by user: ${userId}`, {
        prompt: prompt?.substring(0, 100) + '...',
        hasImage: !!imageUrl,
        aspectRatio,
        duration,
        model
    });

    try {
        // For now, return a mock response
        const mockVideoUrl = "https://example.com/mock-video.mp4";

        // Save generation record to Firestore
        await db.collection('users').doc(userId).collection('video-generations').add({
            prompt: prompt,
            imageUrl: imageUrl,
            videoUrl: mockVideoUrl,
            aspectRatio: aspectRatio,
            duration: duration,
            model: model,
            creditsUsed: 100,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: 'mock'
        });

        return {
            success: true,
            message: "Video generation started (mock)",
            data: {
                videoUrl: mockVideoUrl,
                aspectRatio: aspectRatio,
                duration: duration,
                creditsUsed: 100
            }
        };

    } catch (error) {
        logger.error(`Error in generateVideo for user ${userId}:`, error);
        
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', `Video generation failed: ${error.message}`);
    }
}); 