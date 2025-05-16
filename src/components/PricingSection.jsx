import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, Lock, HandTap, CircleNotch, Info } from '@phosphor-icons/react';
import { getFunctions, httpsCallable } from "firebase/functions";

// Get Firebase Functions instance
const functions = getFunctions();
const createStripeCheckoutSession = httpsCallable(functions, 'createStripeCheckoutSession');

// --- Plan Price Map (Copied from Dashboard.jsx for displaying active plan name) ---
const planPriceMap = {
  "price_1RMqEZDf8kAOBAT3ltD6n2lX": "Basic (Monthly)",
  "price_1RMqGbDf8kAOBAT3vgwkWLr6": "Basic (Yearly)",
  "price_1RMqH7Df8kAOBAT30BGfHv66": "Pro (Monthly)",
  "price_1RMqHMDf8kAOBAT3bCTcdNwq": "Pro (Yearly)",
  "price_1RMqHgDf8kAOBAT3m6kthIND": "Business (Monthly)",
  "price_1RMqI1Df8kAOBAT3Xoy3M7Ho": "Business (Yearly)",
};
// --- End Plan Price Map ---

// --- Plan Data with Stripe Price IDs ---
const plans = [
  {
    id: 'basic',
    name: 'Basic Plan',
    monthlyPrice: 59.00,
    yearlyMonthlyPrice: parseFloat((59.00 * 8 / 12).toFixed(2)),
    monthlyPriceId: "price_1RMqEZDf8kAOBAT3ltD6n2lX",
    yearlyPriceId: "price_1RMqGbDf8kAOBAT3vgwkWLr6",
    features: [
      '1 Product',
      '10 Videos',
      '15 Images',
      '30 Slideshows',
      'E-mail support',
    ],
    buttonText: 'Get Started',
    mostPopular: false,
  },
  {
    id: 'pro',
    name: 'Pro plan',
    monthlyPrice: 119.00,
    yearlyMonthlyPrice: parseFloat((119.00 * 8 / 12).toFixed(2)),
    monthlyPriceId: "price_1RMqH7Df8kAOBAT30BGfHv66",
    yearlyPriceId: "price_1RMqHMDf8kAOBAT3bCTcdNwq",
    features: [
      'Up to 5 Product',
      '40 Videos',
      '50 Images',
      '90 Slideshows',
      'E-mail support',
      'Automation (very soon)',
      'Tiktok Publishing (soon)',
    ],
    buttonText: 'Get Started',
    mostPopular: true,
  },
  {
    id: 'business',
    name: 'Business plan',
    monthlyPrice: 299.00,
    yearlyMonthlyPrice: parseFloat((299.00 * 8 / 12).toFixed(2)),
    monthlyPriceId: "price_1RMqHgDf8kAOBAT3m6kthIND",
    yearlyPriceId: "price_1RMqI1Df8kAOBAT3Xoy3M7Ho",
    features: [
      'Up to 10 Product',
      '90 Videos',
      '120 Images',
      '250 Slideshows',
      'E-mail support',
      'Automation (very soon)',
      'Tiktok Publishing (soon)',
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
    <span className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
      ${animatedPrice.toFixed(2)}
    </span>
  );
}

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
    <span className="inline text-gray-600 dark:text-zinc-300">
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

function PricingSection({ id, subscriptionData, user }) {
  const [billingCycle, setBillingCycle] = useState('yearly');
  const [isLoadingCheckout, setIsLoadingCheckout] = useState(null);
  const [checkoutError, setCheckoutError] = useState(null);

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
        userEmail: user.email // Pass userEmail
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

  if (hasActiveOverallSubscription) {
    return (
      <div id={id} className="w-full">
        <div className="px-6 lg:px-0">
          <div className="py-10 px-6 rounded-xl text-left">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              You Have an Active Subscription
            </h3>
            <p className="text-gray-600 dark:text-zinc-300 mb-1">
              You are currently subscribed to the <strong className="text-gray-800 dark:text-zinc-100">{planPriceMap[subscriptionData.stripePriceId] || 'Selected Plan'}</strong>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id={id} className="w-full"> 
      <div className="px-6 lg:px-0"> 
        {/* REMOVED HEADER BLOCK
        <div className="text-left">
          <div className="flex items-center mb-4">
            <span className="text-sm font-medium text-gray-800 dark:text-zinc-200">
              Plans & Pricing
            </span>
            <span className="mx-2 h-1 w-1 rounded-full bg-gray-400 dark:bg-zinc-500"></span>
            <span className="text-sm text-gray-500 dark:text-zinc-400">
              Choose a plan that's right for you
            </span>
          </div>
          
          <p className="mb-8 text-base text-gray-600 dark:text-zinc-400 max-w-2xl">
            All plans include core features like content generation, TikTok format support, and scheduling.
             Annual billing gives you 4 months free.
          </p>
        </div> 
        */}

        {/* Billing Cycle Toggle */}
        <div className="mb-10 flex">
          <div className="inline-flex rounded-lg p-0.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800">
            <button 
              className={`relative inline-flex items-center rounded-md px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                billingCycle === 'monthly' 
                  ? 'bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow-sm' 
                  : 'bg-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300'
              }`}
              onClick={() => setBillingCycle('monthly')}
            >
              Monthly
            </button>
            <button 
              className={`relative inline-flex items-center rounded-md px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                billingCycle === 'yearly' 
                  ? 'bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow-sm' 
                  : 'bg-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300'
              }`}
              onClick={() => setBillingCycle('yearly')}
            >
              Yearly 
              <span className="ml-2 text-xs font-medium text-green-600 dark:text-green-500">Save 33%</span>
            </button>
          </div>
        </div>

        {checkoutError && (
             <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700/50 rounded-md text-sm text-red-700 dark:text-red-300">
                 {checkoutError}
             </div>
         )}

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
                    ? 'border-black dark:border-white' 
                    : 'border-gray-200 dark:border-zinc-800'
                } hover:border-gray-300 dark:hover:border-zinc-700 transition-colors bg-white dark:bg-zinc-900 shadow-sm hover:shadow`}
              >
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{plan.name}</h3>
                    {plan.mostPopular && (
                      <span className="relative overflow-hidden inline-flex items-center rounded-full bg-black/10 dark:bg-white/10 px-2.5 py-0.5 text-xs font-semibold leading-5 text-black dark:text-white
                                     before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-white/40 dark:before:via-white/20 before:to-transparent">
                        Popular
                      </span>
                    )}
                  </div>
                  
                  <div className="flex flex-col">
                    <AnimatedPrice price={displayPrice} duration={800 + index * 100} key={billingCycle} />
                    <span className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
                      {billingCycle === 'monthly' ? '/mo' : '/mo (billed annually)'}
                    </span>
                  </div>
                </div>
                
                <button
                  onClick={() => handleCheckout(plan.id, billingCycle)}
                  disabled={isCurrentPlan || isLoadingThisButton || isLoadingCheckout}
                  className={`w-full flex items-center justify-center px-6 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 shadow-sm hover:shadow ${
                    isCurrentPlan
                      ? 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 cursor-default'
                      : isLoadingThisButton
                        ? 'bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-zinc-500 cursor-wait'
                        : plan.mostPopular 
                          ? 'bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-zinc-200' 
                          : 'bg-white dark:bg-zinc-900 text-black dark:text-white ring-1 ring-inset ring-gray-200 dark:ring-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800/50'
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
                
                <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-zinc-500 mt-8 mb-3">Features</p>
                <ul role="list" className="space-y-2.5 text-xs leading-6 text-gray-600 dark:text-zinc-300">
                  {plan.features.map((feature, idx) => {
                    const numMatch = feature.match(/(\d+)/);
                    const hasNumber = numMatch !== null;
                    
                    if (hasNumber) {
                      const numValue = numMatch[1];
                      const parts = feature.split(numValue);
                      
                      return (
                        <li key={idx} className="flex gap-x-2.5 items-start">
                          <CheckCircle className="h-4 w-4 flex-none text-gray-400 dark:text-zinc-500 mt-0.5" weight="fill" aria-hidden="true" />
                          <AnimatedValue 
                            contentBefore={parts[0]} 
                            value={numValue} 
                            contentAfter={parts[1]} 
                            duration={600 + idx * 100}
                          />
                        </li>
                      );
                    }
                    
                    let baseFeature = feature;
                    let suffix = null;
                    const soonMatch = feature.match(/\((very soon|soon)\)$/i);
                    
                    if (soonMatch) {
                        suffix = soonMatch[0];
                        baseFeature = feature.replace(suffix, '').trim();
                    }
                    
                    return (
                      <li key={idx} className="flex gap-x-2.5 items-start">
                        <CheckCircle className="h-4 w-4 flex-none text-gray-400 dark:text-zinc-500 mt-0.5" weight="fill" aria-hidden="true" />
                        <span className="text-gray-600 dark:text-zinc-300">
                            {baseFeature}
                            {suffix && <span className="ml-1 text-xs text-gray-400 dark:text-zinc-500">{suffix}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="mt-10 text-left text-xs space-y-2 text-gray-500 dark:text-zinc-500 border-t border-gray-100 dark:border-zinc-800 pt-5">
          <p className="flex items-center gap-x-1">
            <Lock size={12} className="text-gray-400 dark:text-zinc-600" aria-hidden="true" />
            Payments secured with industry-standard encryption
          </p>
        </div>
      </div>
    </div>
  );
}

export default PricingSection; 