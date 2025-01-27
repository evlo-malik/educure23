import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Skull, Star, Check, Loader2, MessageSquare, FileUp, Brain, Mic, Volume2, Info } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { createCheckoutSession, getSubscriptionStatus, createCustomerPortalSession, type SubscriptionData } from '../lib/stripe';
import { useSubscription } from '../contexts/SubscriptionContext';
import SubscriptionStatusMessage from './SubscriptionStatusMessage';

const plans = [
  {
    name: 'Cooked',
    price: 0,
    yearlyPrice: 0,
    icon: Skull,
    features: [
      {
        icon: FileUp,
        title: 'Document Processing',
        items: [
          '2 PDFs/YouTube videos per week',
          '20MB max file size',
          '1 lecture recording per month'
        ]
      },
      {
        icon: Brain,
        title: 'AI Features',
        items: [
          'Smart summaries, flashcards, notes & tests'
        ]
      },
      {
        icon: MessageSquare,
        title: 'Chat & Analysis',
        items: [
          '3 messages/day (£0.02/extra)',
          '1 area selection/week (£0.05/extra)',
          '1 standard voice generation/month'
        ]
      }
    ],
    gradient: 'from-blue-500 to-cyan-500',
    popular: false,
    priceIds: {
      monthly: null,
      yearly: null
    }
  },
  {
    name: 'Committed',
    price: 4.99,
    yearlyPrice: 3,
    icon: Star,
    features: [
      {
        icon: FileUp,
        title: 'Document Processing',
        items: [
          '10 PDFs/YouTube videos per week',
          '30MB max file size',
          '10 lecture recordings per month'
        ]
      },
      {
        icon: Brain,
        title: 'AI Features',
        items: [
          'Everything from Cooked + Pro voice styles'
        ]
      },
      {
        icon: MessageSquare,
        title: 'Chat & Analysis',
        items: [
          '30 messages/day (£0.02/extra)',
          '15 area selections/week (£0.05/extra)',
          '5 standard + 2 pro voice generations/month'
        ]
      }
    ],
    gradient: 'from-violet-500 to-purple-500',
    popular: true,
    priceIds: {
      monthly: 'price_1Qk2CoE4Vh8gPWWwGjnzPbGS',
      yearly: 'price_1Qk2eeE4Vh8gPWWwjfNAnatz'
    }
  },
  {
    name: 'Locked In',
    price: 9.99,
    yearlyPrice: 7.5,
    renderIcon: () => (
      <img 
        src="https://evlo-malik.github.io/uni-logos/goat.png" 
        alt="GOAT"
        className="w-full h-full object-contain"
      />
    ),
    features: [
      {
        icon: FileUp,
        title: 'Document Processing',
        items: [
          'Unlimited PDFs/YouTube videos',
          '40MB max file size',
          '45 lecture recordings per month'
        ]
      },
      {
        icon: Brain,
        title: 'AI Features',
        items: [
          'Everything from Committed + priority access'
        ]
      },
      {
        icon: MessageSquare,
        title: 'Chat & Analysis',
        items: [
          'Unlimited messages',
          '50 area selections/week (£0.05/extra)',
          '15 standard + 7 pro voice generations/month'
        ]
      }
    ],
    gradient: 'from-amber-500 to-orange-500',
    popular: false,
    priceIds: {
      monthly: 'price_1Qk2HsE4Vh8gPWWwE2n8MSRn',
      yearly: 'price_1Qk2McE4Vh8gPWWwdvem3SgQ'
    }
  }
];

export default function Pricing() {
  const navigate = useNavigate();
  const [isYearly, setIsYearly] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStatusMessage, setShowStatusMessage] = useState(false);
  const [statusMessageType, setStatusMessageType] = useState<'cancel' | 'upgrade' | 'downgrade'>('cancel');
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState<number | undefined>();
  const { plan: currentPlan } = useSubscription();
  const userId = localStorage.getItem('userId');
  const [hoveredFeature, setHoveredFeature] = useState<string | null>(null);

  // Determine if a plan is the current plan
  const isCurrentPlan = (planName: string): boolean => {
    return planName.toLowerCase().replace(' ', '-') === currentPlan;
  };

  // Determine if a plan can be selected
  const isPlanSelectable = (planName: string): boolean => {
    const normalizedPlanName = planName.toLowerCase().replace(' ', '-');
    
    // Current plan is NEVER selectable
    if (isCurrentPlan(planName)) {
      return false;
    }

    // When on locked-in, no other plans are selectable
    if (currentPlan === 'locked-in') {
      return false;
    }

    // When on committed, only allow upgrading to locked-in
    if (currentPlan === 'commited') {
      // Allow upgrading to locked-in, block downgrading to cooked
      return normalizedPlanName === 'locked-in';
    }

    // When on cooked, all paid plans are selectable
    if (currentPlan === 'cooked') {
      return normalizedPlanName !== 'cooked';
    }

    return false; // Default case: not selectable
  };

  const getButtonText = (planName: string) => {
    if (isCurrentPlan(planName)) {
      return 'Current Plan';
    }
    if (planName.toLowerCase() === 'cooked') {
      return currentPlan === 'cooked' ? 'Free Plan' : 'Free Tier';
    }
    return currentPlan === 'cooked' ? 'Upgrade Now' : 'Switch Plan';
  };

  const handlePlanChange = async (plan: typeof plans[0]) => {
    // Immediately return if this is the current plan
    if (isCurrentPlan(plan.name)) {
      return;
    }

    // Return if the plan isn't selectable
    if (!isPlanSelectable(plan.name)) {
      return;
    }

    if (!userId) {
      navigate('/signup');
      return;
    }

    if (!plan.priceIds.monthly && !plan.priceIds.yearly) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const priceId = isYearly ? plan.priceIds.yearly : plan.priceIds.monthly;
      if (!priceId) {
        throw new Error('Invalid plan selected');
      }

      const result = await createCheckoutSession(priceId, userId, true);
      if (!result.success) {
        throw new Error(result.error || 'Failed to create checkout session');
      }
    } catch (error) {
      console.error('Error handling plan change:', error);
      setError(error instanceof Error ? error.message : 'Failed to process plan change');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-6"
          >
            Choose Your Learning Journey
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-gray-600 mb-12"
          >
            Unlock the full potential of AI-powered learning with our flexible plans
          </motion.p>

          <div className="inline-flex items-center justify-center bg-white/50 backdrop-blur-sm rounded-full p-1.5 border border-gray-200 shadow-sm">
            <button
              onClick={() => setIsYearly(false)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                !isYearly ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setIsYearly(true)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                isYearly ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Yearly
              <span className="ml-1.5 text-xs text-green-500 font-medium">Save 40%</span>
            </button>
          </div>
        </div>

        {/* Message Purchase Link */}
        <div className="text-center mb-12">
          <Link
            to="/purchase-messages"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700 rounded-full border border-indigo-100 hover:border-indigo-200 transition-all duration-200 group"
          >
            <MessageSquare className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition-transform" />
            <span className="font-medium">Need more messages?</span>
            <span className="text-indigo-600 group-hover:underline">
              Purchase additional message credits
            </span>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan, index) => (
            <motion.div
            key={plan.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`relative group ${plan.popular ? 'md:scale-110 z-10' : ''}`}
          >
            {plan.popular && (
              <div className="absolute -top-9 left-0 right-0 flex justify-center">
                <div className="bg-gradient-to-r from-violet-600 to-purple-600 text-white px-6 py-1.5 rounded-full text-sm font-medium shadow-lg">
                  Most Popular
                </div>
              </div>
            )}

              <div className={`bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-6 md:p-8 border border-gray-100 h-full flex flex-col relative overflow-hidden group hover:shadow-2xl transition-all duration-300`}>
                <div className={`absolute inset-0 bg-gradient-to-r ${plan.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />

                {/* Plan Header */}
                <div className="mb-8">
                  <div className={`w-16 h-16 rounded-xl bg-gradient-to-r ${plan.gradient} p-3 mb-6`}>
                    {plan.renderIcon ? (
                      <plan.renderIcon />
                    ) : (
                      <plan.icon className="w-full h-full text-white" />
                    )}
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                  <div className="mb-4">
                    <span className="text-4xl font-bold text-gray-900">
                      £{isYearly ? plan.yearlyPrice : plan.price}
                    </span>
                    <span className="text-gray-600">/month</span>
                    {isYearly && plan.price > 0 && (
                      <p className="text-sm text-green-500 mt-1">
                        Save £{((plan.price - plan.yearlyPrice) * 12).toFixed(2)} yearly
                      </p>
                    )}
                  </div>
                </div>

                {/* Features List */}
                <div className="flex-grow space-y-6">
                  {plan.features.map((category) => (
                    <div key={category.title} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <category.icon className="h-5 w-5 text-gray-600" />
                        <h4 className="font-semibold text-gray-900">{category.title}</h4>
                      </div>
                      <ul className="space-y-2 pl-7">
                        {category.items.map((feature, featureIndex) => (
                          <motion.li
                            key={featureIndex}
                            className="flex items-start gap-2 group/feature"
                            onMouseEnter={() => setHoveredFeature(`${plan.name}-${category.title}-${featureIndex}`)}
                            onMouseLeave={() => setHoveredFeature(null)}
                            whileHover={{ x: 4 }}
                          >
                            <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                            <span className="text-gray-600 text-sm group-hover/feature:text-gray-900 transition-colors">
                              {feature}
                            </span>
                          </motion.li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                {/* Action Button */}
                <button
                  onClick={() => handlePlanChange(plan)}
                  disabled={!isPlanSelectable(plan.name) || isLoading}
                  aria-disabled={!isPlanSelectable(plan.name) || isLoading}
                  tabIndex={isCurrentPlan(plan.name) ? -1 : undefined}
                  className={`w-full px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-r ${
                    plan.gradient
                  } transform transition-all duration-200 ${
                    isPlanSelectable(plan.name) && !isLoading ? 'hover:scale-[1.02]' : ''
                  } ${
                    plan.popular ? 'shadow-lg' : ''
                  } ${
                    isCurrentPlan(plan.name) ? 'opacity-50 cursor-not-allowed' : ''
                  } disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:hover:scale-100 mt-8`}
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 mx-auto animate-spin" />
                  ) : (
                    getButtonText(plan.name)
                  )}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
        {error && (
          <div className="mt-8 max-w-md mx-auto">
            <div className="bg-red-50 border border-red-100 rounded-lg p-4 text-sm text-red-600">
              {error}
            </div>
          </div>
        )}

        {/* Subscription Status Message */}
        {showStatusMessage && (
          <SubscriptionStatusMessage
            action={statusMessageType}
            currentPeriodEnd={currentPeriodEnd}
            onClose={() => setShowStatusMessage(false)}
          />
        )}
      </div>
    </div>
  );
}