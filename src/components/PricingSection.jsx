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
    originalPrice: 20.00,
    unitPrice: 0.10,
    subscriberUnitPrice: 0.08,
    popular: false
  },
  {
    id: 500,
    name: 'Medium',
    credits: 500,
    price: 45.00,
    subscriberPrice: 35.00,
    originalPrice: 45.00,
    unitPrice: 0.09,
    subscriberUnitPrice: 0.07,
    popular: true
  },
  {
    id: 1000,
    name: 'Large',
    credits: 1000,
    price: 80.00,
    subscriberPrice: 60.00,
    originalPrice: 80.00,
    unitPrice: 0.08,
    subscriberUnitPrice: 0.06,
    popular: false
  },
  {
    id: 2000,
    name: 'Ultimate',
    credits: 2000,
    price: 140.00,
    subscriberPrice: 100.00,
    originalPrice: 140.00,
    unitPrice: 0.07,
    subscriberUnitPrice: 0.05,
    popular: false
  }
];
// --- End Credit Packages ---

// --- Plan Data with Stripe Price IDs ---
const plans = [
  {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 14.00,
    yearlyMonthlyPrice: Math.round(14.00 * 9 / 12),
    monthlyPriceId: "price_1RMqEZDf8kAOBAT3ltD6n2lX", // Update with new Stripe price ID
    yearlyPriceId: "price_1RMqGbDf8kAOBAT3vgwkWLr6", // Update with new Stripe price ID
    credits: 200,
    unitPrice: 0.07,
    features: [
      'AI UGC Video Generation',
      'AI Image Generation (High Quality)', 
      'Slideshow Content Generation',
      'AI-Powered Scripts + Visuals',
      'Watermark-Free Downloads',
      'E-mail Support',
    ],
    buttonText: 'Get Started',
    mostPopular: false,
  },
  {
    id: 'creator',
    name: 'Creator',
    monthlyPrice: 30.00,
    yearlyMonthlyPrice: Math.round(30.00 * 9 / 12),
    monthlyPriceId: "price_1RRJ8tDf8kAOBAT3qBwC6qpM", // Update with new Stripe price ID
    yearlyPriceId: "price_1RRJ9SDf8kAOBAT3bA8Xbriq", // Update with new Stripe price ID
    credits: 500,
    unitPrice: 0.06,
    features: [
      'AI UGC Video Generation',
      'AI Image Generation (High Quality)',
      'Slideshow Content Generation',
      'AI-Powered Scripts + Visuals',
      'Watermark-Free Downloads',
      'Priority Support',
      'Advanced Templates',
    ],
    buttonText: 'Get Started',
    mostPopular: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 150.00,
    yearlyMonthlyPrice: Math.round(150.00 * 9 / 12),
    monthlyPriceId: "price_1RMqHgDf8kAOBAT3m6kthIND", // Update with new Stripe price ID
    yearlyPriceId: "price_1RMqI1Df8kAOBAT3Xoy3M7Ho", // Update with new Stripe price ID
    credits: 3000,
    unitPrice: 0.05,
    features: [
      'AI UGC Video Generation',
      'AI Image Generation (High Quality)',
      'Slideshow Content Generation', 
      'AI-Powered Scripts + Visuals',
      'Watermark-Free Downloads',
      'Priority Support',
      'Advanced Templates',
      'API Access',
      'White-label Options',
    ],
    buttonText: 'Get Started',
    mostPopular: false,
  },
];

// Counter animation hook (Corrected dependencies and final value)
function useCounterAnimation(endValue, duration = 1000, startValue = 0) {
  const [count, setCount] = useState(startValue);
  const countRef = useRef(startValue);
  const prevEndValue = useRef(endValue);
  
  useEffect(() => {
    // If the endValue changes, start animation from the current displayed value
    if (prevEndValue.current !== endValue) {
      countRef.current = count; // Start from the last rendered count
      prevEndValue.current = endValue; // Update the target value ref
    } // No else needed if component remounts due to key

    const effectiveStartValue = countRef.current; // Use the value from the ref
    const startTime = performance.now();
    let animationFrameId;
    
    const updateCount = (currentTime) => {
      const elapsedTime = currentTime - startTime;
      const progress = Math.min(elapsedTime / duration, 1);
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const nextCount = effectiveStartValue + (endValue - effectiveStartValue) * easeOutQuart;
      setCount(nextCount);
      
      if (progress < 1) {
        animationFrameId = requestAnimationFrame(updateCount);
      } else {
        setCount(endValue); // Ensure it ends exactly at the endValue
      }
    };
    
    animationFrameId = requestAnimationFrame(updateCount);
    
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  // Dependencies should only be things that trigger a re-calculation/re-run
  }, [endValue, duration]); 
  
  return count;
}

// Animated price component with dark mode support
function AnimatedPrice({ price, duration = 800 }) {
  const animatedPrice = useCounterAnimation(price, duration);
  
  return (
    <span className="text-3xl font-bold tracking-tight text-stone-900 dark:text-white">
      ${animatedPrice.toFixed(2)}
    </span>
  );
}

// --- NEW: Animated Credits Component ---
function AnimatedCredits({ credits, duration = 800 }) {
  const animatedCredits = useCounterAnimation(credits, duration);
  return (
    <span className="text-2xl font-semibold text-stone-700 dark:text-stone-200">
      {Math.round(animatedCredits).toLocaleString()} Credits
    </span>
  );
}
// --- End Animated Credits Component ---

// Animated feature value component with dark mode support
function AnimatedValue({ contentBefore, value, contentAfter = "", duration = 600 }) {
  const [prevValue, setPrevValue] = useState(value);
  const [animate, setAnimate] = useState(false);
  
  useEffect(() => {
    if (value !== prevValue) {
      setAnimate(true);
      const timer = setTimeout(() => {
        setPrevValue(value);
        setAnimate(false);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [value, prevValue, duration]);
  
  const numericValue = parseInt(value, 10);
  const prevNumericValue = parseInt(prevValue, 10);
  const animatedValue = useCounterAnimation(numericValue, duration, prevNumericValue);
  const isNumeric = !isNaN(numericValue);
  
  return (
    <span className="inline text-stone-600 dark:text-stone-300">
      {isNumeric ? (
        <>
          {contentBefore}
          <span className="font-medium transition-all">
            {Math.round(animatedValue)}
          </span>
          {contentAfter}
        </>
      ) : (
        <span className={`transition-all duration-300 ${animate ? 'opacity-0 transform translate-y-1' : 'opacity-100'}`}>
          {value}
        </span>
      )}
    </span>
  );
}

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

  // Credit packages component for reuse
  const renderCreditPackages = () => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      {creditPackages.map((pkg, index) => {
        const isLoadingThisPackage = isLoadingCheckout === `credit-${pkg.id}`;
        
        return (
          <div
            key={pkg.id}
            className={`relative rounded-xl p-6 border ${
              pkg.popular 
                ? 'border-lime-300 dark:border-lime-600 bg-lime-50/50 dark:bg-lime-900/10' 
                : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-neutral-900'
            } hover:border-stone-300 dark:hover:border-stone-700 transition-colors shadow-sm hover:shadow`}
          >
            {pkg.popular && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <span className="bg-lime-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
                  Most Popular
                </span>
              </div>
            )}
            
            <div className="text-center">
              <div className="mb-4">
                <div className="text-3xl font-bold text-stone-900 dark:text-white mb-1">
                  {pkg.credits.toLocaleString()}
                </div>
                <div className="text-sm text-stone-500 dark:text-stone-400 mb-3">
                  Credits
                </div>
                
                <div className="space-y-1">
                  {hasActiveOverallSubscription ? (
                    <>
                      <div className="text-2xl font-bold text-stone-900 dark:text-white">
                        ${pkg.subscriberPrice.toFixed(2)}
                      </div>
                      <div className="text-xs text-stone-500 dark:text-stone-400">
                        ${(pkg.subscriberUnitPrice * 100).toFixed(1)}¢ per credit
                      </div>
                      <div className="text-xs text-lime-600 dark:text-lime-400 mt-1">
                        Subscriber pricing active
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-2xl font-bold text-stone-900 dark:text-white">
                        ${pkg.price.toFixed(2)}
                      </div>
                      <div className="text-xs text-stone-500 dark:text-stone-400">
                        ${(pkg.unitPrice * 100).toFixed(1)}¢ per credit
                      </div>
                      <div className="text-xs text-lime-600 dark:text-lime-400 mt-1">
                        Subscribe and save ${(pkg.price - pkg.subscriberPrice).toFixed(2)}!
                      </div>
                    </>
                  )}
                </div>
              </div>
              
              <button
                onClick={() => handleCreditPurchase(pkg.id)}
                disabled={isLoadingThisPackage || isLoadingCheckout}
                className={`w-full flex items-center justify-center px-6 py-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  isLoadingThisPackage
                    ? 'bg-neutral-100 dark:bg-neutral-800 text-stone-400 dark:text-stone-500 cursor-wait'
                    : pkg.popular 
                      ? 'bg-lime-500 hover:bg-lime-600 text-white shadow-lg hover:shadow-xl' 
                      : 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200'
                } ${
                  isLoadingCheckout && !isLoadingThisPackage ? 'opacity-60 cursor-not-allowed' : ''
                }`}
              >
                {isLoadingThisPackage ? (
                  <>
                    <CircleNotch size={16} className="animate-spin mr-2" /> 
                    Processing...
                  </>
                ) : (
                  'Purchase Credits'
                )}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

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
              {plans.map((plan, index) => {
                const displayPrice = billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyMonthlyPrice;
                const currentPriceId = billingCycle === 'yearly' ? plan.yearlyPriceId : plan.monthlyPriceId;
                const isLoadingThisButton = isLoadingCheckout === (plan.id + '-' + billingCycle);
                const isCurrentPlan = isActiveSubscription(currentPriceId);

                return (
                  <div
                    key={`${plan.id}-${billingCycle}`}
                    className={`relative rounded-xl p-6 border ${
                      plan.mostPopular 
                        ? 'border-stone-800 dark:border-white' 
                        : 'border-stone-200 dark:border-stone-800'
                    } hover:border-stone-300 dark:hover:border-stone-700 transition-colors bg-white dark:bg-neutral-900 shadow-sm hover:shadow`}
                  >
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-stone-900 dark:text-white">{plan.name}</h3>
                        {plan.mostPopular && (
                          <span className="relative overflow-hidden inline-flex items-center rounded-full bg-neutral-800/10 dark:bg-white/10 px-2.5 py-0.5 text-xs font-semibold leading-5 text-stone-800 dark:text-white
                                         before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-white/40 dark:before:via-white/20 before:to-transparent">
                            Popular
                          </span>
                        )}
                      </div>
                      
                      <div className="flex flex-col">
                        <div className="flex items-baseline gap-2">
                          <AnimatedPrice price={displayPrice} duration={800 + index * 100} key={billingCycle + '-price'} />
                        </div>
                        <span className="text-xs text-stone-500 dark:text-stone-400 mt-1 mb-2">
                          {billingCycle === 'monthly' ? '/mo' : '/mo (billed annually)'}
                        </span>
                        <AnimatedCredits credits={plan.credits} duration={800 + index * 100} key={billingCycle + '-credits'} />
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleCheckout(plan.id, billingCycle)}
                      disabled={isCurrentPlan || isLoadingThisButton || isLoadingCheckout}
                      className={`w-full flex items-center justify-center px-6 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 shadow-sm hover:shadow ${
                        isCurrentPlan
                          ? 'bg-neutral-100 dark:bg-neutral-800 text-stone-500 dark:text-stone-400 cursor-default'
                          : isLoadingThisButton
                            ? 'bg-neutral-100 dark:bg-neutral-800 text-stone-400 dark:text-stone-500 cursor-wait'
                            : plan.mostPopular 
                              ? 'bg-neutral-800 dark:bg-white text-white dark:text-stone-800 hover:bg-neutral-800 dark:hover:bg-neutral-200' 
                              : 'bg-white dark:bg-neutral-900 text-stone-800 dark:text-white ring-1 ring-inset ring-stone-200 dark:ring-stone-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                      } ${
                        isLoadingCheckout && !isLoadingThisButton && !isCurrentPlan ? 'opacity-60 cursor-not-allowed' : ''
                      }`}
                    >
                      {isCurrentPlan ? (
                         <>Current Plan</>
                      ) : isLoadingThisButton ? (
                        <>
                          <CircleNotch size={16} className="animate-spin mr-2" /> Processing...
                        </>
                      ) : (
                        <>{plan.buttonText}</>
                      )}
                    </button>
                    
                    <p className="text-xs uppercase tracking-wider text-stone-500 dark:text-stone-500 mt-8 mb-3">Features</p>
                    <ul role="list" className="space-y-2.5 text-xs leading-6 text-stone-600 dark:text-stone-300">
                      {plan.features.map((feature, idx) => {
                        let baseFeature = feature;
                        let suffix = null;
                        const soonMatch = feature.match(/\((very soon|soon)\)$/i);
                        
                        if (soonMatch) {
                            suffix = soonMatch[0];
                            baseFeature = feature.replace(suffix, '').trim();
                        }
                        
                        return (
                          <li key={idx} className="flex gap-x-2.5 items-start">
                            <CheckCircle className="h-4 w-4 flex-none text-stone-400 dark:text-stone-500 mt-0.5" weight="fill" aria-hidden="true" />
                            <span className="text-stone-600 dark:text-stone-300">
                                {baseFeature}
                                {suffix && <span className="ml-1 text-xs text-stone-400 dark:text-stone-500">{suffix}</span>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
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
                Tiered pricing • Buy more, save more
              </div>
            </div>
            {renderCreditPackages()}
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