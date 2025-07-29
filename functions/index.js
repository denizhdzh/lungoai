const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const { OpenAI } = require("openai");
const Replicate = require("replicate");
const admin = require("firebase-admin");
const { getStorage } = require('firebase-admin/storage');
const axios = require('axios');

// Initialize Firebase Admin SDK (once)
admin.initializeApp();
const db = admin.firestore(); // Firestore instance
const bucket = getStorage().bucket(); // Default Firebase Storage bucket
// --- NEW: Plan Credit Allocations (Backend) ---
const planCreditAllocations = {
  // Basic Plan ($9)
  "price_1RMqEZDf8kAOBAT3ltD6n2lX": { general_credits: 100 }, // Monthly Basic
  "price_1RMqGbDf8kAOBAT3vgwkWLr6": { general_credits: 100 }, // Yearly Basic
  // Pro Plan ($29)
  "price_1RY4EwDf8kAOBAT3qMaIMcdO": { general_credits: 600 }, // Monthly Pro
  "price_1RY4F6Df8kAOBAT34O2CKeCM": { general_credits: 600 }, // Yearly Pro
  // Business Plan ($49)
  "price_1RY4JdDf8kAOBAT3AWlBbEx3": { general_credits: 1200 }, // Monthly Business
  "price_1RY4JuDf8kAOBAT3lrADc9fO": { general_credits: 1200 }  // Yearly Business
};


// Helper function to save files to Firebase Storage
async function saveToFirebaseStorage(fileUrl, userId, model, type) {
    try {
        logger.info(`Saving ${type} to Firebase Storage from: ${fileUrl}`);
        
        // Download the file from the URL
        const response = await axios.get(fileUrl, { responseType: 'stream' });
        
        // Generate a unique filename
        const timestamp = Date.now();
        const sanitizedModel = model.replace(/[^a-zA-Z0-9-_]/g, '_');
        const fileName = `${timestamp}_${sanitizedModel}.${type === 'video' ? 'mp4' : 'jpg'}`;
        const filePath = `generations/${userId}/${fileName}`;
        
        // Create a file reference in Firebase Storage
        const file = bucket.file(filePath);
        const stream = file.createWriteStream({
            metadata: {
                contentType: type === 'video' ? 'video/mp4' : 'image/jpeg',
                metadata: {
                    userId: userId,
                    model: model,
                    generatedAt: new Date().toISOString()
                }
            }
        });
        
        // Pipe the downloaded file to Firebase Storage
        const uploadPromise = new Promise((resolve, reject) => {
            stream.on('error', reject);
            stream.on('finish', async () => {
                try {
                    // Make the file publicly accessible
                    await file.makePublic();
                    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
                    logger.info(`Successfully saved ${type} to Firebase Storage: ${publicUrl}`);
                    resolve(publicUrl);
                } catch (error) {
                    reject(error);
                }
            });
        });
        
        response.data.pipe(stream);
        return await uploadPromise;
        
    } catch (error) {
        logger.error(`Error saving ${type} to Firebase Storage:`, error);
        // Fallback to original URL if Firebase Storage fails
        return fileUrl;
    }
}

// --- generateImage Function (Updated for Replicate API) ---
exports.generateImage = onCall(async (request) => {
    const userId = request.auth?.uid;
    
    if (!userId) {
        throw new HttpsError('unauthenticated', 'You must be logged in to generate images.');
    }

    const { model, ...parameters } = request.data;
    
    if (!model) {
        throw new HttpsError('invalid-argument', 'Model is required.');
    }

    if (!parameters.prompt) {
        throw new HttpsError('invalid-argument', 'Prompt is required.');
    }

    try {
        // Initialize Replicate
        const replicate = new Replicate({
            auth: process.env.REPLICATE_API_TOKEN,
        });

        logger.info(`Starting image generation for user ${userId} with model ${model}`, { parameters });

        // Check user credits first
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        
        if (!userDoc.exists) {
            throw new HttpsError('not-found', 'User not found.');
        }

        const userData = userDoc.data();
        const currentCredits = userData.general_credits || 0;
        
        // Calculate credits needed based on model
        const creditsNeeded = getImageModelCredits(model);
        
        if (currentCredits < creditsNeeded) {
            throw new HttpsError('resource-exhausted', 'Insufficient credits for image generation.');
        }

        // Prepare input for Replicate
        const input = {
            prompt: parameters.prompt
        };

        // Add all other parameters dynamically
        Object.keys(parameters).forEach(key => {
            if (key !== 'prompt' && parameters[key] !== undefined && parameters[key] !== null) {
                input[key] = parameters[key];
            }
        });

        logger.info(`=== REPLICATE API CALL ===`);
        logger.info(`Model: ${model}`);
        logger.info(`Full input object:`, JSON.stringify(input, null, 2));
        logger.info(`Full parameters received:`, JSON.stringify(parameters, null, 2));
        
        // Special processing for image parameters - convert base64 to proper format for Replicate
        const imageParams = ['image', 'input_image', 'start_image', 'first_frame_image', 'subject_reference'];
        for (const param of imageParams) {
            if (input[param]) {
                logger.info(`🖼️ FOUND IMAGE PARAM: ${param}`);
                logger.info(`🖼️ Image data type: ${typeof input[param]}`);
                
                if (typeof input[param] === 'string') {
                    if (input[param].startsWith('data:image/')) {
                        logger.info(`✅ Base64 data URI detected - sending directly to Replicate`);
                        // Replicate accepts data URIs directly, no need to convert to Buffer
                        logger.info(`✅ Data URI length: ${input[param].length}`);
                    } else if (input[param].startsWith('http')) {
                        logger.info(`✅ URL format detected - sending directly to Replicate`);
                        // URLs can be sent directly to Replicate
                    } else {
                        logger.warn(`❌ UNKNOWN image format - not data URL or HTTP URL`);
                        logger.info(`🖼️ Image data preview: ${input[param]?.substring ? input[param].substring(0, 100) : 'N/A'}...`);
                    }
                } else {
                    logger.info(`🖼️ Image parameter is not a string: ${typeof input[param]}`);
                }
            }
        }
        
        logger.info(`========================`);

        // Try both sync (run) and async (predictions.create) approaches
        let output;
        let isAsync = false;
        let predictionId = null;
        
        try {
            // First try: synchronous run - fastest for quick models
            logger.info(`Trying synchronous run approach...`);
            output = await replicate.run(model, { input: input });
        } catch (syncError) {
            logger.warn(`Synchronous run failed: ${syncError.message}`);
            logger.warn(`Sync error details:`, syncError);
            try {
                // Second try: async predictions - better for slow models
                logger.info(`Trying async predictions.create approach...`);
                const prediction = await replicate.predictions.create({
                    model: model,
                    input: input
                });
                
                predictionId = prediction.id;
                isAsync = true;
                logger.info(`Created prediction ${predictionId} with status: ${prediction.status}`);
                
                // For async, we return immediately and let client poll
                output = null; // Will be handled differently below
                
            } catch (asyncError) {
                logger.error(`Both sync and async approaches failed:`, {
                    syncError: syncError.message,
                    asyncError: asyncError.message
                });
                throw asyncError;
            }
        }

        logger.info(`Image generation result for user ${userId}`, { 
            model, 
            isAsync: isAsync,
            predictionId: predictionId,
            output: output ? 'success' : (isAsync ? 'pending' : 'failed'),
            outputType: typeof output,
            outputValue: output
        });

        // Always deduct credits (even for async)
        await userRef.update({
            general_credits: currentCredits - creditsNeeded
        });

        if (isAsync && predictionId) {
            // Store async prediction info for polling
            await db.collection('predictions').doc(predictionId).set({
                userId: userId,
                type: 'image',
                model: model,
                status: 'starting',
                input: input,
                creditsUsed: creditsNeeded,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            logger.info(`Stored async prediction ${predictionId} for polling`);

            return {
                success: true,
                predictionId: predictionId,
                status: 'starting',
                creditsUsed: creditsNeeded,
                remainingCredits: currentCredits - creditsNeeded,
                isAsync: true
            };
        } else if (output) {
            // Handle different output formats
            let imageUrl;
            if (typeof output === 'string') {
                imageUrl = output;
            } else if (Array.isArray(output)) {
                imageUrl = output[0];
            } else if (output && typeof output.url === 'function') {
                imageUrl = output.url();
            } else if (output && output.url) {
                imageUrl = output.url;
            } else {
                imageUrl = output;
            }

            // Save to Firebase Storage for permanent storage
            const savedImageUrl = await saveToFirebaseStorage(imageUrl, userId, model, 'image');
            
            // Store generation result in user's generations subcollection
            const generationId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await db.collection('users').doc(userId).collection('generations').doc(generationId).set({
                type: 'image',
                model: model,
                prompt: input.prompt,
                imageUrl: savedImageUrl, // Use Firebase Storage URL
                settings: input,
                creditsUsed: creditsNeeded,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            logger.info(`Deducted ${creditsNeeded} credits from user ${userId}. Remaining: ${currentCredits - creditsNeeded}`);
            logger.info(`Final image URL: ${savedImageUrl}`);

            // Return success with Firebase Storage URL
            return {
                success: true,
                imageUrl: savedImageUrl,
                creditsUsed: creditsNeeded,
                remainingCredits: currentCredits - creditsNeeded
            };
        } else {
            throw new HttpsError('internal', 'Image generation failed - no output received');
        }

    } catch (error) {
        logger.error(`Image generation failed for user ${userId}:`, error);
        
        if (error instanceof HttpsError) {
            throw error;
        }
        
        throw new HttpsError('internal', `Image generation failed: ${error.message}`);
    }
});


// --- NEW: generateImageForVideo Function --- // RENAMED TO requestImageGeneration


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


// --- NEW: Video Generation Function ---
exports.generateVideo = onCall(async (request) => {
    const userId = request.auth?.uid;
    
    if (!userId) {
        throw new HttpsError('unauthenticated', 'You must be logged in to generate videos.');
    }

    const { model, duration = 5, ...parameters } = request.data;
    
    if (!model) {
        throw new HttpsError('invalid-argument', 'Model is required.');
    }

    if (!parameters.prompt) {
        throw new HttpsError('invalid-argument', 'Prompt is required.');
    }

    try {
        // Initialize Replicate
        const replicate = new Replicate({
            auth: process.env.REPLICATE_API_TOKEN,
        });

        logger.info(`Starting video generation for user ${userId} with model ${model}`, { parameters, duration });

        // Check user credits first
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        
        if (!userDoc.exists) {
            throw new HttpsError('not-found', 'User not found.');
        }

        const userData = userDoc.data();
        const currentCredits = userData.general_credits || 0;
        
        // Calculate credits needed based on duration and model
        // Video models typically cost credits per second
        const creditsPerSecond = getVideoModelCreditsPerSecond(model);
        const creditsNeeded = Math.ceil(creditsPerSecond * duration);
        
        if (currentCredits < creditsNeeded) {
            throw new HttpsError('resource-exhausted', `Insufficient credits for video generation. Need ${creditsNeeded}, have ${currentCredits}.`);
        }

        // Prepare input for Replicate
        const input = {
            prompt: parameters.prompt
        };

        // Add duration if provided
        if (duration !== undefined) {
            input.duration = duration;
        }

        // Add all other parameters dynamically
        Object.keys(parameters).forEach(key => {
            if (key !== 'prompt' && parameters[key] !== undefined && parameters[key] !== null) {
                input[key] = parameters[key];
            }
        });

        logger.info(`=== VIDEO REPLICATE API CALL ===`);
        logger.info(`Model: ${model}`);
        logger.info(`Full input object:`, JSON.stringify(input, null, 2));
        logger.info(`Full parameters received:`, JSON.stringify(parameters, null, 2));
        logger.info(`Duration: ${duration}`);
        logger.info(`============================`);

        // Try different Replicate API approaches for video
        let output;
        try {
            // First try: direct input
            logger.info(`Trying direct input approach for video...`);
            output = await replicate.run(model, input);
        } catch (directError) {
            logger.warn(`Direct input failed: ${directError.message}`);
            try {
                // Second try: nested input object
                logger.info(`Trying nested input approach for video...`);
                output = await replicate.run(model, { input: input });
            } catch (nestedError) {
                logger.warn(`Nested input failed: ${nestedError.message}`);
                // Third try: simplified input with just prompt
                logger.info(`Trying simplified prompt-only approach for video...`);
                output = await replicate.run(model, { 
                    input: { 
                        prompt: parameters.prompt,
                        duration: duration 
                    }
                });
            }
        }

        logger.info(`Video generated for user ${userId}`, { 
            model, 
            output: output ? 'success' : 'failed',
            outputType: typeof output,
            outputValue: output,
            duration 
        });

        // If output is successful, deduct credits
        if (output) {
            await userRef.update({
                general_credits: currentCredits - creditsNeeded
            });

            // Handle different output formats for video
            let videoUrl;
            if (typeof output === 'string') {
                videoUrl = output;
            } else if (Array.isArray(output)) {
                videoUrl = output[0];
            } else if (output && typeof output.url === 'function') {
                videoUrl = output.url();
            } else if (output && output.url) {
                videoUrl = output.url;
            } else {
                videoUrl = output;
            }

            // Save to Firebase Storage for permanent storage
            const savedVideoUrl = await saveToFirebaseStorage(videoUrl, userId, model, 'video');
            
            // Store generation result in user's generations subcollection
            const generationId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await db.collection('users').doc(userId).collection('generations').doc(generationId).set({
                type: 'video',
                model: model,
                prompt: input.prompt,
                videoUrl: savedVideoUrl, // Use Firebase Storage URL
                settings: input,
                duration: duration,
                creditsUsed: creditsNeeded,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            logger.info(`Deducted ${creditsNeeded} credits from user ${userId}. Remaining: ${currentCredits - creditsNeeded}`);
            logger.info(`Final video URL: ${savedVideoUrl}`);

            // Return success with Firebase Storage URL
            return {
                success: true,
                videoUrl: savedVideoUrl,
                creditsUsed: creditsNeeded,
                remainingCredits: currentCredits - creditsNeeded,
                duration: duration
            };
        } else {
            throw new HttpsError('internal', 'Video generation failed - no output received');
        }

    } catch (error) {
        logger.error(`Video generation failed for user ${userId}:`, error);
        
        if (error instanceof HttpsError) {
            throw error;
        }
        
        throw new HttpsError('internal', `Video generation failed: ${error.message}`);
    }
});


// Helper function to get credits for image models
function getImageModelCredits(model) {
    // Model-specific credit costs
    const modelCosts = {
        'google/imagen-4': 1,
        'google/imagen-4-ultra': 2,
        'imagen/imagen-4-fast': 1,
        'ideogram-ai/ideogram-v3-balanced': 2,
        'minimax/image-01': 0.25,
        'black-forest-labs/flux-1.1-pro': 1,
        'black-forest-labs/flux-kontext-max': 2
    };
    
    return modelCosts[model] || 1; // Default fallback
}

// Helper function to get credits per second for video models
function getVideoModelCreditsPerSecond(model) {
    // Model-specific credit costs (credits per second)
    const modelCosts = {
        'google/veo-3-fast': 10,
        'google/veo-3': 20,
        'bytedance/seedance-1-pro': 2, // Average between 480p (1) and 1080p (4)
        'kwaivgi/kling-v2.1': 2.5, // Average between standard (2) and pro (3)
        'minimax/hailuo-02': 1.5, // Average between 768p (1) and 1080p (2)
        'leonardoai/motion-2.0': 3, // Fixed cost for Leonardo
        'runwayml/gen4-turbo': 15
    };
    
    return modelCosts[model] || 5; // Default fallback
}

// Polling function to check prediction status and update Firestore
exports.pollPredictions = onCall(async (request) => {
    const userId = request.auth?.uid;
    
    if (!userId) {
        throw new HttpsError('unauthenticated', 'You must be logged in.');
    }

    const { predictionId } = request.data;
    
    if (!predictionId) {
        throw new HttpsError('invalid-argument', 'Prediction ID is required.');
    }

    try {
        // Initialize Replicate
        const replicate = new Replicate({
            auth: process.env.REPLICATE_API_TOKEN,
        });

        // Get prediction from Replicate
        const prediction = await replicate.predictions.get(predictionId);
        
        // Get prediction doc from Firestore
        const predictionRef = db.collection('predictions').doc(predictionId);
        const predictionDoc = await predictionRef.get();
        
        if (!predictionDoc.exists) {
            throw new HttpsError('not-found', 'Prediction not found in database.');
        }

        const predictionData = predictionDoc.data();
        
        // Verify user owns this prediction
        if (predictionData.userId !== userId) {
            throw new HttpsError('permission-denied', 'You can only check your own predictions.');
        }

        // Update Firestore with current status
        const updateData = {
            status: prediction.status,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        // If prediction is completed, add output
        if (prediction.status === 'succeeded' && prediction.output) {
            updateData.output = prediction.output;
            updateData.completedAt = admin.firestore.FieldValue.serverTimestamp();
        }

        // If prediction failed, add error info
        if (prediction.status === 'failed' && prediction.error) {
            updateData.error = prediction.error;
            updateData.failedAt = admin.firestore.FieldValue.serverTimestamp();
            
            // Refund credits on failure
            const userRef = db.collection('users').doc(userId);
            const userDoc = await userRef.get();
            const currentCredits = userDoc.data()?.general_credits || 0;
            const creditsToRefund = predictionData.creditsUsed || 0;
            
            await userRef.update({
                general_credits: currentCredits + creditsToRefund
            });
            
            updateData.creditsRefunded = creditsToRefund;
            logger.info(`Refunded ${creditsToRefund} credits to user ${userId} for failed prediction ${predictionId}`);
        }

        await predictionRef.update(updateData);

        logger.info(`Updated prediction ${predictionId} status: ${prediction.status} for user ${userId}`);

        return {
            success: true,
            predictionId: predictionId,
            status: prediction.status,
            output: prediction.output || null,
            error: prediction.error || null
        };

    } catch (error) {
        logger.error(`Failed to poll prediction ${predictionId} for user ${userId}:`, error);
        
        if (error instanceof HttpsError) {
            throw error;
        }
        
        throw new HttpsError('internal', `Failed to check prediction status: ${error.message}`);
    }
});

// Scheduled function to auto-poll active predictions
exports.autoPollPredictions = onSchedule(
    { 
        schedule: "every 1 minutes",
        timeZone: "UTC",
        timeoutSeconds: 540,
        memory: "512MiB"
    },
    async (event) => {
        logger.info("Running auto prediction polling...");
        
        try {
            const replicate = new Replicate({
                auth: process.env.REPLICATE_API_TOKEN,
            });

            // Get active predictions (not completed/failed)
            const activeStatuses = ['starting', 'processing'];
            const predictionsRef = db.collection('predictions');
            const activeQuery = await predictionsRef
                .where('status', 'in', activeStatuses)
                .where('createdAt', '>', admin.firestore.Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000))) // Only last 24 hours
                .limit(50) // Process max 50 at a time to avoid timeouts
                .get();

            if (activeQuery.empty) {
                logger.info("No active predictions to poll.");
                return null;
            }

            const batch = db.batch();
            let updatedCount = 0;

            for (const doc of activeQuery.docs) {
                const predictionData = doc.data();
                const predictionId = doc.id;

                try {
                    // Get current status from Replicate
                    const prediction = await replicate.predictions.get(predictionId);
                    
                    // Only update if status changed
                    if (prediction.status !== predictionData.status) {
                        const updateData = {
                            status: prediction.status,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        };

                        if (prediction.status === 'succeeded' && prediction.output) {
                            updateData.output = prediction.output;
                            updateData.completedAt = admin.firestore.FieldValue.serverTimestamp();
                        }

                        if (prediction.status === 'failed' && prediction.error) {
                            updateData.error = prediction.error;
                            updateData.failedAt = admin.firestore.FieldValue.serverTimestamp();
                            
                            // Refund credits on failure - but do this outside batch
                            setTimeout(async () => {
                                try {
                                    const userRef = db.collection('users').doc(predictionData.userId);
                                    const userDoc = await userRef.get();
                                    const currentCredits = userDoc.data()?.general_credits || 0;
                                    const creditsToRefund = predictionData.creditsUsed || 0;
                                    
                                    await userRef.update({
                                        general_credits: currentCredits + creditsToRefund
                                    });
                                    
                                    logger.info(`Auto-refunded ${creditsToRefund} credits to user ${predictionData.userId} for failed prediction ${predictionId}`);
                                } catch (refundError) {
                                    logger.error(`Failed to refund credits for prediction ${predictionId}:`, refundError);
                                }
                            }, 100);
                        }

                        batch.update(doc.ref, updateData);
                        updatedCount++;
                        
                        logger.info(`Auto-updated prediction ${predictionId}: ${predictionData.status} -> ${prediction.status}`);
                    }
                } catch (predictionError) {
                    logger.error(`Failed to poll individual prediction ${predictionId}:`, predictionError);
                }
            }

            if (updatedCount > 0) {
                await batch.commit();
                logger.info(`Auto-polling completed: Updated ${updatedCount} predictions`);
            } else {
                logger.info("Auto-polling completed: No predictions needed updates");
            }

            return null;
        } catch (error) {
            logger.error("Auto-polling failed:", error);
            return null;
        }
    }
);


// --- NEW: Function to Create One-Time Credit Purchase Session ---
exports.createOneTimeCheckoutSession = onCall(async (request) => {
  const { creditPackage, userId, userEmail } = request.data;
  
  // Credit packages with new pricing: $6 per 100 credits
  const creditPackages = {
    200: { credits: 200, price: 1200 }, // $12.00 for 200 credits (in cents)
    300: { credits: 300, price: 1800 }, // $18.00 for 300 credits (in cents)  
    500: { credits: 500, price: 3000 }, // $30.00 for 500 credits (in cents)
    1000: { credits: 1000, price: 6000 } // $60.00 for 1000 credits (in cents)
  };

  if (!creditPackages[creditPackage]) {
    throw new HttpsError('invalid-argument', 'Invalid credit package selected.');
  }

  const selectedPackage = creditPackages[creditPackage];
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

    // Create one-time payment session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment', // One-time payment instead of subscription
      customer: stripeCustomerId,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${selectedPackage.credits} Credits`,
            description: `Purchase ${selectedPackage.credits} credits for your Lungo AI account`
          },
          unit_amount: selectedPackage.price // Price in cents
        },
        quantity: 1
      }],
      metadata: {
        purchaseType: 'one_time_credits',
        userId: userId,
        creditQuantity: selectedPackage.credits.toString()
      },
      success_url: process.env.STRIPE_SUCCESS_URL,
      cancel_url: process.env.STRIPE_CANCEL_URL,
    });

    logger.info(`Created one-time credit checkout session ${session.id} for user ${userId}: ${selectedPackage.credits} credits for $${(selectedPackage.price / 100).toFixed(2)}`);
    
    return { sessionId: session.id };
    
  } catch (error) {
    logger.error(`Error creating one-time credit checkout session for user ${userId}:`, error);
    throw new HttpsError('internal', `Failed to create credit purchase session: ${error.message}`);
  }
});
