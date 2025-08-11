import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, Lock, HandTap, CircleNotch, Info } from '@phosphor-icons/react';
import { getFunctions, httpsCallable } from "firebase/functions";

// Get Firebase Functions instance
const functions = getFunctions();
const createStripeCheckoutSession = httpsCallable(functions, 'createStripeCheckoutSession');
const createOneTimeCheckoutSession = httpsCallable(functions, 'createOneTimeCheckoutSession');

// --- Plan Price Map (Copied from Dashboard.jsx for displaying active plan name) ---
const planPriceMap = {
  "price_1RMqEZDf8kAOBAT3ltD6n2lX": "Starter (Monthly)",
  "price_1RMqGbDf8kAOBAT3vgwkWLr6": "Starter (Yearly)",
  "price_1RRJ8tDf8kAOBAT3qBwC6qpM": "Creator (Monthly)",
  "price_1RRJ9SDf8kAOBAT3bA8Xbriq": "Creator (Yearly)",
  "price_1RMqHgDf8kAOBAT3m6kthIND": "Pro (Monthly)",
  "price_1RMqI1Df8kAOBAT3Xoy3M7Ho": "Pro (Yearly)",
};
// --- End Plan Price Map ---

// --- Credit Packages for One-Time Purchases ---
const creditPackages = [
  {
    id: 200,
    name: 'Small',
    credits: 200,
    price: 20.00,
    subscriberPrice: 16.00,
    originalPrice: 25.00,
    unitPrice: 0.10,
    subscriberUnitPrice: 0.08,
    imageCount: Math.floor(200 / 1), // 200 images
    videoCount: Math.floor(200 / 5), // 40 videos
    popular: false
  },
  {
    id: 500,
    name: 'Medium',
    credits: 500,
    price: 45.00,
    subscriberPrice: 35.00,
    originalPrice: 56.25,
    unitPrice: 0.09,
    subscriberUnitPrice: 0.07,
    imageCount: Math.floor(500 / 1), // 500 images
    videoCount: Math.floor(500 / 5), // 100 videos
    popular: false
  },
  {
    id: 1000,
    name: 'Large',
    credits: 1000,
    price: 80.00,
    subscriberPrice: 60.00,
    originalPrice: 100.00,
    unitPrice: 0.08,
    subscriberUnitPrice: 0.06,
    imageCount: Math.floor(1000 / 1), // 1000 images
    videoCount: Math.floor(1000 / 5), // 200 videos
    popular: false
  },
  {
    id: 2000,
    name: 'Ultimate',
    credits: 2000,
    price: 140.00,
    subscriberPrice: 100.00,
    originalPrice: 175.00,
    unitPrice: 0.07,
    subscriberUnitPrice: 0.05,
    imageCount: Math.floor(2000 / 1), // 2000 images
    videoCount: Math.floor(2000 / 5), // 400 videos
    popular: true
  }
];
// --- End Credit Packages ---

// --- Plan Data with Stripe Price IDs ---
const plans = [
  {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 14.00,
    originalMonthlyPrice: 17.50,
    yearlyMonthlyPrice: Math.round(14.00 * 9 / 12),
    originalYearlyMonthlyPrice: Math.round(17.50 * 9 / 12),
    monthlyPriceId: "price_1RqYZsBcrIf8H8FJgOq3dOFn", // Update with new Stripe price ID
    yearlyPriceId: "price_1RqYZsBcrIf8H8FJkaolnXfV", // Update with new Stripe price ID
    credits: 200,
    unitPrice: 0.07,
    imageCount: Math.floor(200 / 1), // 200 images with cheapest model
    videoCount: Math.floor(200 / 5), // 40 videos with cheapest model
    features: [
      'Access to Basic AI Models',
      'Image Generation (Flux, Basic Models)',
      'Text-to-Image Generation',
      'Standard Quality Output',
      'Email Support',
    ],
    buttonText: 'Get Started',
    mostPopular: false,
  },
  {
    id: 'creator',
    name: 'Creator',
    monthlyPrice: 30.00,
    originalMonthlyPrice: 37.50,
    yearlyMonthlyPrice: Math.round(30.00 * 9 / 12),
    originalYearlyMonthlyPrice: Math.round(37.50 * 9 / 12),
    monthlyPriceId: "price_1RqYbBBcrIf8H8FJcwx4ubhh", // Update with new Stripe price ID
    yearlyPriceId: "price_1RqYbBBcrIf8H8FJHwvT8NcQ", // Update with new Stripe price ID
    credits: 500,
    unitPrice: 0.06,
    imageCount: Math.floor(500 / 1), // 500 images with cheapest model
    videoCount: Math.floor(500 / 5), // 100 videos with cheapest model
    features: [
      'Access to Premium AI Models',
      'Image Generation (Google Imagen, Flux, Ideogram)',
      'Video Generation (Kling, Hailuo)',
      'Text-to-Image & Image-to-Video',
      'High Quality Output (4K Images, 1080p Videos)',
      'Priority Support',
    ],
    buttonText: 'Get Started',
    mostPopular: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 150.00,
    originalMonthlyPrice: 187.50,
    yearlyMonthlyPrice: Math.round(150.00 * 9 / 12),
    originalYearlyMonthlyPrice: Math.round(187.50 * 9 / 12),
    monthlyPriceId: "price_1RqYbrBcrIf8H8FJEyvN5vkw", // Update with new Stripe price ID
    yearlyPriceId: "price_1RqYbrBcrIf8H8FJQLDrUWC5", // Update with new Stripe price ID
    credits: 3000,
    unitPrice: 0.05,
    imageCount: Math.floor(3000 / 1), // 3000 images with cheapest model
    videoCount: Math.floor(3000 / 5), // 600 videos with cheapest model
    features: [
      'Access to All AI Models',
      'Image Generation (Google Imagen, Flux, Ideogram)',
      'Video Generation (Veo, Kling, Hailuo)',
      'Text-to-Image & Image-to-Video',
      'High Quality Output (4K Images, 1080p Videos)',
      'Priority Support',
      'Higher Credit Allowance',
    ],
    buttonText: 'Get Started',
    mostPopular: false,
  },
];


function PricingSection({ id, subscriptionData, user, onSubscriptionSuccess }) {
  const [billingCycle, setBillingCycle] = useState('yearly');
  const [isLoadingCheckout, setIsLoadingCheckout] = useState(null);
  const [checkoutError, setCheckoutError] = useState(null);
  const [pricingMode, setPricingMode] = useState('subscription'); // 'subscription' or 'credits'

  // Determine active subscription details from props
  const isActiveSubscription = (planPriceId) => {
    if (!subscriptionData) return false;
    const activeStatuses = ['active', 'trialing']; // Define active statuses
    return subscriptionData.stripePriceId === planPriceId && 
           subscriptionData.subscriptionStatus &&
           activeStatuses.includes(subscriptionData.subscriptionStatus.toLowerCase());
  };

  // Check if there is any active or trialing subscription from the props
  const hasActiveOverallSubscription = 
    subscriptionData && 
    subscriptionData.subscriptionStatus && 
    ['active', 'trialing'].includes(subscriptionData.subscriptionStatus.toLowerCase());

  const handleCreditPurchase = async (creditPackage) => {
    setIsLoadingCheckout(`credit-${creditPackage}`);
    setCheckoutError(null);

    try {
      if (!user || !user.uid || !user.email) {
        console.error("User data is missing for checkout.");
        setCheckoutError("User information is missing. Please try logging in again.");
        setIsLoadingCheckout(null);
        return;
      }

      const result = await createOneTimeCheckoutSession({ 
        creditPackage: creditPackage,
        userId: user.uid,
        userEmail: user.email
      });

      const sessionId = result.data.sessionId;
      if (!sessionId) {
        throw new Error('Session ID not received from server.');
      }
      
      console.log(`Received Stripe session ID: ${sessionId}. Redirecting to Checkout...`);
      
      // Dynamically import Stripe only when needed
      const { loadStripe } = await import('@stripe/stripe-js');
      const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
      const stripe = await stripePromise;
      
      if (!stripe) {
        throw new Error('Stripe.js failed to load.');
      }

      const { error } = await stripe.redirectToCheckout({ sessionId });

      if (error) {
        console.error('Stripe redirectToCheckout error:', error);
        setCheckoutError(error.message || 'Failed to redirect to payment.');
        setIsLoadingCheckout(null);
      }

    } catch (error) {
      console.error('Error during credit purchase:', error);
      if (error.code && error.message) {
        setCheckoutError(`Error: ${error.message} (Code: ${error.code})`);
      } else {
        setCheckoutError(error.message || 'An unexpected error occurred. Please try again.');
      }
      setIsLoadingCheckout(null);
    }
  };

  const handleCheckout = async (planId, cycle) => {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;

    const priceId = cycle === 'yearly' ? plan.yearlyPriceId : plan.monthlyPriceId;
    if (!priceId) {
      console.error("Price ID not found for", planId, cycle);
      setCheckoutError(`Configuration error for ${plan.name}.`);
      return;
    }

    // Check if this is the currently active plan - prevent checkout
    if (isActiveSubscription(priceId)) {
      console.log("Attempted checkout for already active plan:", priceId);
      return; // Do nothing if it's the current plan
    }

    setIsLoadingCheckout(planId + '-' + cycle);
    setCheckoutError(null);

    try {
      console.log(`Calling createStripeCheckoutSession with priceId: ${priceId}`);
      // Add user check before calling the function
      if (!user || !user.uid || !user.email) {
        console.error("User data is missing for checkout.");
        setCheckoutError("User information is missing. Please try logging in again.");
        setIsLoadingCheckout(null);
        return;
      }
      const result = await createStripeCheckoutSession({ 
        priceId: priceId,
        userId: user.uid, // Pass userId
        userEmail: user.email, // Pass userEmail
        metadata: { fromOnboarding: 'true' } 
      });

      // Assuming the function returns { sessionId: '...' }
      const sessionId = result.data.sessionId;
      if (!sessionId) {
         throw new Error('Session ID not received from server.');
      }
      
      console.log(`Received Stripe session ID: ${sessionId}. Redirecting to Checkout...`);
      
      // Dynamically import Stripe only when needed
      const { loadStripe } = await import('@stripe/stripe-js');
      // Use environment variable for publishable key
      console.log('Using Stripe Publishable Key:', import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
      const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
      const stripe = await stripePromise;
      
      if (!stripe) {
         throw new Error('Stripe.js failed to load.');
      }

      const { error } = await stripe.redirectToCheckout({ sessionId });

      if (error) {
        console.error('Stripe redirectToCheckout error:', error);
        setCheckoutError(error.message || 'Failed to redirect to payment.');
        setIsLoadingCheckout(null); // Clear loading on redirect error
      }
      // If redirect is successful, the user navigates away, no need to set loading false.

      // For onboarding, after successful checkout, we need to call the callback
      if (window.location.pathname.includes('/onboarding') && typeof onSubscriptionSuccess === 'function') {
        // We can't easily confirm payment success directly on client-side after redirect to Stripe.
        // Stripe webhooks should update Firestore. The onSubscriptionSuccess callback
        // here is more of an indicator that the user *initiated* a subscription from onboarding.
        // The actual marking of onboarding as complete should ideally happen after webhook confirmation,
        // or we optimistically complete it now.
        // For simplicity, let's assume initiation is enough for this callback for now.
        // The redirect to Stripe will happen, and if they complete, the webhook handles subscription status.
        // The core onboarding data is ALREADY saved.
        
        // IMPORTANT: Stripe redirects the user. The onSubscriptionSuccess callback as implemented
        // below won't be called in the typical async flow after Stripe processes the payment.
        // Instead, the user will be redirected. We need a different mechanism or understanding here.
        // For now, this callback might be better named e.g. onCheckoutInitiated.
        // Let's proceed with the idea that the webhook handles marking `onboardingCompleted: true`
        // in Firestore after successful payment, and this prop is for any *immediate* UI changes
        // IF the checkout was not a redirect.
        // GIVEN a redirect *always* happens for Stripe checkout, this onSubscriptionSuccess called HERE
        // will not execute after payment.
        // 
        // A better approach: 
        // 1. User clicks subscribe in Onboarding's PricingSection.
        // 2. `handleCheckout` is called, redirects to Stripe.
        // 3. User pays on Stripe, gets redirected BACK to our app (e.g., dashboard or a success page).
        // 4. A webhook from Stripe updates user's `subscriptionStatus` and potentially `onboardingCompleted` in Firestore.
        // 5. The `setOnboardingComplete()` call in `Onboarding.jsx` should be triggered when the app detects
        //    that the user has an active subscription AND onboarding was previously in progress.
        // 
        // For *this specific request* to make `onSubscriptionSuccess` work as intended *after* payment,
        // it implies that `finalizeOnboarding` (or parts of it) should be called upon the user's RETURN from Stripe.
        // This would typically be handled in a useEffect on a page they are redirected to, checking their subscription status.

        // For the current structure, let's assume `onSubscriptionSuccess` is more about *initiating* checkout successfully
        // from the onboarding flow, and the actual finalization of onboarding (marking true, navigating) will happen.
        // The critical part is that `_saveOnboardingDetails` has *already run*.
        
        // If `onSubscriptionSuccess` is passed, call it, then redirect.
        // This means `onSubscriptionSuccess` will execute *before* Stripe payment is confirmed.
        if (typeof onSubscriptionSuccess === 'function') {
          onSubscriptionSuccess(); // Call it to mark onboarding as complete from React state perspective.
        }
      }

    } catch (error) {
      console.error('Error during checkout process:', error);
      // Check for specific Firebase function errors (like unauthenticated, internal)
      if (error.code && error.message) {
         setCheckoutError(`Error: ${error.message} (Code: ${error.code})`);
      } else {
         setCheckoutError(error.message || 'An unexpected error occurred. Please try again.');
      }
      setIsLoadingCheckout(null); // Clear loading state on error
    }
  };

  // Simplified credit boxes component (4 boxes)
  const renderCreditBoxes = () => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {creditPackages.map((pkg) => {
          const isLoadingThisPackage = isLoadingCheckout === `credit-${pkg.id}`;
          const finalPrice = hasActiveOverallSubscription ? pkg.subscriberPrice : pkg.price;
          
          return (
            <div key={pkg.id} className={`relative bg-neutral-950/40 backdrop-blur-xl p-4 rounded-2xl border border-neutral-700/50 transition-all duration-300 hover:bg-neutral-950/60 hover:border-neutral-600/70 ${pkg.popular ? 'ring-1 ring-lime-400/50' : ''}`}>
              {pkg.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-lime-400 text-black text-xs px-3 py-1 rounded-md font-medium">
                  BEST DEAL
                </div>
              )}
              {/* Header */}
              <div className="text-center mb-4">
                <h3 className="text-lg font-normal text-white mb-1">{pkg.name}</h3>
                <div className="text-xs text-neutral-400 mb-3">{pkg.credits.toLocaleString()} Credits</div>
              </div>

              {/* Pricing */}
              <div className="text-center mb-4">
                <div className="text-2xl font-bold text-white mb-1">
                  ${finalPrice.toFixed(0)}
                </div>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="text-sm text-neutral-500 line-through">
                    ${pkg.originalPrice.toFixed(0)}
                  </span>
                  <span className="text-xs text-lime-400 font-medium bg-lime-400/10 px-2 py-0.5 rounded-full">25% OFF</span>
                </div>
                <div className="text-xs text-neutral-500">
                  ${(finalPrice / pkg.credits).toFixed(3)} per credit
                </div>
              </div>

              {/* Capacity */}
              <div className="text-center mb-4 space-y-1">
                <div className="text-xs text-neutral-300">~{pkg.imageCount} images</div>
                <div className="text-xs text-neutral-300">~{pkg.videoCount} videos</div>
              </div>

              {/* Button */}
              <button
                onClick={() => {
                  if (!user) {
                    window.location.href = '/signup';
                  } else {
                    handleCreditPurchase(pkg.id);
                  }
                }}
                disabled={isLoadingThisPackage || isLoadingCheckout}
                className={`w-full flex items-center justify-center px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                  isLoadingThisPackage
                    ? 'bg-neutral-800 text-neutral-500 cursor-wait'
                    : pkg.popular
                      ? 'bg-lime-400 text-black hover:bg-lime-300'
                      : 'bg-neutral-800/60 text-white hover:bg-neutral-700/60'
                } ${
                  isLoadingCheckout && !isLoadingThisPackage ? 'opacity-60 cursor-not-allowed' : ''
                }`}
              >
                {isLoadingThisPackage ? (
                  <>
                    <CircleNotch size={16} className="animate-spin mr-2" /> Loading...
                  </>
                ) : (
                  user ? 'Buy Now' : 'Get Started'
                )}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div id={id} className="w-full"> 
      <div className="px-6 lg:px-0"> 
        {/* Header */}
        <div className="text-left mb-10">
          <h3 className="text-2xl font-bold text-stone-900 dark:text-white mb-2">
            Choose Your Plan
          </h3>
          <p className="text-stone-600 dark:text-stone-300 mb-6">
            {hasActiveOverallSubscription 
              ? `You're subscribed to ${planPriceMap[subscriptionData.stripePriceId] || 'Selected Plan'}. Buy extra credits or upgrade your plan.`
              : 'Select a subscription plan or buy credits as you need them.'
            }
          </p>
        </div>

        {/* Pricing Mode Toggle */}
        <div className="mb-10 flex items-center justify-center">
          <div className="inline-flex rounded-lg p-0.5 bg-neutral-50 dark:bg-neutral-900 border border-stone-200 dark:border-stone-800">
            <button 
              className={`relative inline-flex items-center rounded-md px-6 py-2 text-sm font-medium transition-all duration-200 ${
                pricingMode === 'subscription' 
                  ? 'bg-white dark:bg-neutral-800 text-stone-900 dark:text-white shadow-sm' 
                  : 'bg-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
              }`}
              onClick={() => setPricingMode('subscription')}
            >
              Subscriptions
              <span className="ml-2 text-xs text-lime-500 rounded-full font-semibold">
                | Best Value
              </span>
            </button>
            <button 
              className={`relative inline-flex items-center rounded-md px-6 py-2 text-sm font-medium transition-all duration-200 ${
                pricingMode === 'credits' 
                  ? 'bg-white dark:bg-neutral-800 text-stone-900 dark:text-white shadow-sm' 
                  : 'bg-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
              }`}
              onClick={() => setPricingMode('credits')}
            >
              One-Time Credits
            </button>
          </div>
        </div>

        {checkoutError && (
          <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700/50 rounded-md text-sm text-red-700 dark:text-red-300">
            {checkoutError}
          </div>
        )}

        {/* Subscription Plans */}
        {pricingMode === 'subscription' && (
          <>
            {/* Billing Cycle Toggle for subscriptions */}
            <div className="mb-8 flex items-center justify-center">
              <div className="inline-flex rounded-lg p-0.5 bg-neutral-50 dark:bg-neutral-900 border border-stone-200 dark:border-stone-800">
                <button 
                  className={`relative inline-flex items-center rounded-md px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                    billingCycle === 'monthly' 
                      ? 'bg-white dark:bg-neutral-800 text-stone-900 dark:text-white shadow-sm' 
                      : 'bg-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
                  }`}
                  onClick={() => setBillingCycle('monthly')}
                >
                  Monthly
                </button>
                <button 
                  className={`relative inline-flex items-center rounded-md px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                    billingCycle === 'yearly' 
                      ? 'bg-white dark:bg-neutral-800 text-stone-900 dark:text-white shadow-sm' 
                      : 'bg-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
                  }`}
                  onClick={() => setBillingCycle('yearly')}
                >
                  Yearly 
                  <span className="ml-2 text-xs font-medium text-lime-600 dark:text-lime-500">3 months free</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {plans.map((plan) => {
                const displayPrice = billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyMonthlyPrice;
                const currentPriceId = billingCycle === 'yearly' ? plan.yearlyPriceId : plan.monthlyPriceId;
                const isLoadingThisButton = isLoadingCheckout === (plan.id + '-' + billingCycle);
                const isCurrentPlan = isActiveSubscription(currentPriceId);

                return (
                  <div
                    key={`${plan.id}-${billingCycle}`}
                    className={`relative bg-neutral-950/40 backdrop-blur-xl p-5 rounded-2xl border border-neutral-700/50 transition-all duration-300 hover:bg-neutral-950/60 hover:border-neutral-600/70 ${
                      plan.mostPopular ? 'ring-1 ring-lime-400/50' : ''
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs text-neutral-400 uppercase tracking-wider font-light">
                        {plan.name.toUpperCase()}_PLAN
                      </span>
                      {plan.mostPopular && (
                        <span className="text-xs text-lime-400 uppercase tracking-wider font-light">
                          MOST_POPULAR
                        </span>
                      )}
                    </div>

                    {/* Title and Price */}
                    <div className="mb-5">
                      <h2 className="text-xl font-normal text-white mb-1">
                        {plan.name}
                      </h2>
                      <div className="w-16 h-px bg-gradient-to-r from-lime-400 to-transparent mb-3"></div>
                      
                      <div className="flex items-baseline gap-2 mb-2">
                        <div className="flex flex-col">
                          <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-normal text-white">${displayPrice.toFixed(2)}</span>
                            <span className="text-xs text-neutral-400">/mo</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-neutral-500 line-through">
                              ${(billingCycle === 'monthly' ? plan.originalMonthlyPrice : plan.originalYearlyMonthlyPrice).toFixed(2)}
                            </span>
                            <span className="text-xs text-lime-400 font-medium bg-lime-400/10 px-2 py-0.5 rounded-full">25% OFF</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-base text-white">
                        {plan.credits.toLocaleString()} <span className="text-lime-400 font-light">Credits</span>
                      </div>
                      <div className="text-xs text-neutral-400 mt-1">
                        ~{plan.imageCount} images • ~{plan.videoCount} videos
                      </div>
                    </div>
                    
                    {/* Features */}
                    <div className="mb-5">
                      <ul role="list" className="space-y-1.5 text-xs text-neutral-300">
                        {plan.features.slice(0, 4).map((feature, idx) => {
                          let baseFeature = feature;
                          let suffix = null;
                          const soonMatch = feature.match(/\((very soon|soon|coming soon)\)$/i);
                          
                          if (soonMatch) {
                              suffix = soonMatch[0];
                              baseFeature = feature.replace(suffix, '').trim();
                          }
                          
                          return (
                            <li key={idx} className="flex gap-x-2 items-start">
                              <div className="w-1 h-1 bg-lime-400 rounded-full mt-1.5 flex-shrink-0"></div>
                              <span className="text-neutral-300 leading-tight">
                                  {baseFeature}
                                  {suffix && <span className="ml-1 text-neutral-500">{suffix}</span>}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    <button
                      onClick={() => {
                        if (!user) {
                          // Redirect to signup if not logged in
                          window.location.href = '/signup';
                        } else {
                          // Continue with normal checkout flow
                          handleCheckout(plan.id, billingCycle);
                        }
                      }}
                      disabled={isCurrentPlan || isLoadingThisButton || isLoadingCheckout}
                      className={`w-full flex items-center justify-center px-6 py-3 rounded-2xl text-sm font-normal tracking-wide transition-all duration-300 hover:scale-105 shadow-lg ${
                        isCurrentPlan
                          ? 'bg-neutral-800 text-neutral-400 cursor-default'
                          : isLoadingThisButton
                            ? 'bg-neutral-800 text-neutral-500 cursor-wait'
                            : plan.mostPopular 
                              ? 'bg-white text-black hover:bg-neutral-100' 
                              : 'bg-neutral-800/60 text-white hover:bg-neutral-700/60'
                      } ${
                        isLoadingCheckout && !isLoadingThisButton && !isCurrentPlan ? 'opacity-60 cursor-not-allowed' : ''
                      }`}
                    >
                      {isCurrentPlan ? (
                         <>CURRENT PLAN</>
                      ) : isLoadingThisButton ? (
                        <>
                          <CircleNotch size={16} className="animate-spin mr-2" /> PROCESSING...
                        </>
                      ) : (
                        <>START CREATING</>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Credit Packages */}
        {pricingMode === 'credits' && (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-lime-100 dark:bg-lime-900/30 text-lime-800 dark:text-lime-200 text-sm font-medium">
                <span className="w-2 h-2 bg-lime-500 rounded-full mr-2"></span>
                Credits never expire • Buy more, save more
              </div>
            </div>
            {renderCreditBoxes()}
          </>
        )}

        <div className="mt-10 text-center text-xs space-y-2 text-stone-500 dark:text-stone-500 border-t border-stone-100 dark:border-stone-800 pt-6">
          <p className="flex items-center justify-center gap-x-1">
            <Lock size={12} className="text-stone-400 dark:text-stone-600" aria-hidden="true" />
            {pricingMode === 'credits' ? 'Credits never expire' : 'Cancel anytime'} • Payments secured with industry-standard encryption
          </p>
        </div>
      </div>
    </div>
  );
}

export default PricingSection; 