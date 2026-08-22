// Donate Screen - Support the game with Telegram Stars
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils/cn';
import { Button, Card } from './ui';
import { screenVariants, containerVariants, itemVariants, slideUpVariants } from '../lib/animations/variants';
import nakama from '../shared/lib/nakama';
import telegram from '../shared/lib/telegram';

interface DonateScreenProps {
  onBack: () => void;
}

interface DonationTier {
  id: string;
  stars: number; // Telegram Stars amount
  name: string;
  description: string;
  badge: string;
  perks: string[];
  popular?: boolean;
}

// Telegram Stars pricing (1 Star ≈ $0.02)
const donationTiers: DonationTier[] = [
  {
    id: 'supporter',
    stars: 250, // ~$5
    name: 'Supporter',
    description: 'Every bit helps!',
    badge: '💚',
    perks: ['Supports server costs', 'Keeps the app ad-free', 'Our eternal gratitude'],
  },
  {
    id: 'patron',
    stars: 500, // ~$10
    name: 'Patron',
    description: 'A generous contribution',
    badge: '💙',
    perks: ['Stronger support for development', 'Helps fund new content', 'Community appreciation'],
    popular: true,
  },
  {
    id: 'champion',
    stars: 1250, // ~$25
    name: 'Champion',
    description: 'True dedication',
    badge: '💜',
    perks: ['Major contribution to growth', 'Supports feature delivery', 'Huge thank you from the team'],
  },
  {
    id: 'legend',
    stars: 2500, // ~$50
    name: 'Legend',
    description: 'Legendary support!',
    badge: '💛',
    perks: ['Maximum support tier', 'Helps long-term stability', 'Deep gratitude and recognition'],
  },
];

function DonationTierCard({
  tier,
  selected,
  onSelect,
}: {
  tier: DonationTier;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.div
      variants={itemVariants}
      className={cn(
        'relative rounded-[clamp(12px,2.6vw,18px)] border-2 transition-all cursor-pointer overflow-hidden',
        selected
          ? 'border-accent-teal bg-accent-teal/10 shadow-glow-teal'
          : 'border-white/10 bg-white/5 hover:border-white/20'
      )}
      onClick={onSelect}
    >
      {tier.popular && (
        <div className="absolute top-0 right-0 bg-accent-purple text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
          POPULAR
        </div>
      )}

      <div className="p-[clamp(12px,2.8vw,18px)]">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-4xl">{tier.badge}</span>
          <div>
            <h3 className="font-heading font-bold text-lg text-white">{tier.name}</h3>
            <p className="text-2xl font-display font-black text-accent-teal flex items-center gap-1">
              <span className="text-yellow-400">⭐</span>
              {tier.stars.toLocaleString()}
            </p>
          </div>
        </div>

        <p className="text-sm text-text-secondary mb-3">{tier.description}</p>

        <ul className="space-y-1">
          {tier.perks.map((perk, index) => (
            <li key={index} className="flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span className="text-text-secondary">{perk}</span>
            </li>
          ))}
        </ul>
      </div>

      {selected && (
        <div className="absolute top-3 left-3 w-6 h-6 rounded-full bg-accent-teal flex items-center justify-center">
          <svg className="w-4 h-4 text-bg-primary" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </div>
      )}
    </motion.div>
  );
}

export function DonateScreen({ onBack }: DonateScreenProps) {
  const { t } = useTranslation();
  void t; // Reserved for future localization
  const [selectedTier, setSelectedTier] = useState<string>('patron');
  const [customStars, setCustomStars] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualAmount, setManualAmount] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualMessage, setManualMessage] = useState('');
  const [manualAnonymous, setManualAnonymous] = useState(false);
  const [manualDonationId, setManualDonationId] = useState<string | null>(null);
  const [manualProcessing, setManualProcessing] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const selectedTierData = donationTiers.find(t => t.id === selectedTier);
  const finalStars = customStars ? parseInt(customStars, 10) : selectedTierData?.stars || 0;

  const handleDonate = async () => {
    if (finalStars < 50) {
      setError('Minimum donation is 50 Stars');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Step 1: Create invoice on server
      const response = await nakama.rpc<{ invoiceUrl?: string; donationId?: string }>('create_stars_invoice', {
        stars: finalStars,
        tier: selectedTier || 'custom',
        title: selectedTierData?.name || 'Custom Donation',
        description: `Support Islamic Quiz - ${selectedTierData?.name || 'Thank you!'}`,
      });

      if (!response.invoiceUrl) {
        throw new Error('Failed to create payment invoice');
      }

      // Step 2: Open Telegram Stars payment
      const paymentStatus = await telegram.openInvoice(response.invoiceUrl);

      if (paymentStatus === 'paid') {
        // Step 3: Confirm payment on server (server validates via webhook)
        await nakama.rpc('confirm_stars_payment', {
          donationId: response.donationId,
        });

        // Show success
        telegram.notificationOccurred('success');
        setShowSuccess(true);
      } else if (paymentStatus === 'cancelled') {
        setError('Payment was cancelled');
      } else {
        setError('Payment failed. Please try again.');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process donation';
      setError(errorMessage);
      telegram.notificationOccurred('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualDonation = async () => {
    const amountValue = Number(manualAmount);
    if (!amountValue || amountValue < 1) {
      setManualError('Minimum donation is $1');
      return;
    }

    setManualProcessing(true);
    setManualError(null);
    setManualDonationId(null);

    try {
      const response = await nakama.rpc<{ donationId?: string }>('initiate_donation', {
        amountCents: Math.round(amountValue * 100),
        currency: 'USD',
        donorName: manualAnonymous ? null : manualName || null,
        donorMessage: manualMessage || null,
        isAnonymous: manualAnonymous,
      });

      setManualDonationId(response.donationId || null);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create donation';
      setManualError(errorMessage);
    } finally {
      setManualProcessing(false);
    }
  };

  if (showSuccess) {
    return (
      <motion.div
        variants={screenVariants}
        initial="initial"
        animate="animate"
        className="min-h-viewport bg-gradient-main flex items-center justify-center px-4"
      >
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="text-center"
        >
          <motion.span
            className="text-8xl block mb-6"
            animate={{ y: [0, -20, 0], rotate: [0, 10, -10, 0] }}
            transition={{ duration: 1, delay: 0.3 }}
          >
            💝
          </motion.span>
          <h2 className="font-display text-3xl font-black text-white mb-2">
            Thank You!
          </h2>
          <p className="text-text-secondary mb-6">
            Your support means the world to us!
          </p>
          <Button variant="gaming" onClick={onBack}>
            Back to App
          </Button>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={screenVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="content-scrollable bg-gradient-main"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-bg-primary/80 backdrop-blur-lg border-b border-white/10">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="font-display text-xl font-bold text-white">Support Us</h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="px-4 py-4">
        {/* Hero */}
        <motion.div variants={slideUpVariants} className="text-center mb-6">
          <span className="text-6xl block mb-3">💝</span>
          <h2 className="font-display text-2xl font-black text-white mb-2">
            Support Islamic Quiz
          </h2>
          <p className="text-text-secondary">
            Help us keep the game free and ad-free for everyone.
            Your support keeps development moving and content growing.
          </p>
        </motion.div>

        {/* Error */}
        {error && (
          <Card variant="glass" className="bg-error/20 border-error/30 mb-4">
            <p className="text-error text-sm text-center">{error}</p>
          </Card>
        )}

        {/* Donation Tiers */}
        <motion.div
          variants={containerVariants}
          initial="initial"
          animate="animate"
          className="grid grid-cols-1 gap-4 mb-6"
        >
          {donationTiers.map((tier) => (
            <DonationTierCard
              key={tier.id}
              tier={tier}
              selected={selectedTier === tier.id}
              onSelect={() => {
                setSelectedTier(tier.id);
                setCustomStars('');
              }}
            />
          ))}
        </motion.div>

        {/* Custom Amount */}
        <motion.div variants={slideUpVariants}>
          <Card variant="glass" className="mb-6">
            <div className="p-4">
              <h3 className="font-heading font-semibold text-white mb-3">
                Or enter custom Stars amount
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-2xl text-yellow-400">⭐</span>
                <input
                  type="number"
                  value={customStars}
                  onChange={(e) => {
                    setCustomStars(e.target.value);
                    setSelectedTier('');
                  }}
                  placeholder="0"
                  className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white text-lg font-mono placeholder:text-text-secondary focus:border-accent-teal focus:outline-none"
                  min="50"
                  step="1"
                />
              </div>
              <p className="text-xs text-text-secondary mt-2">
                Minimum: 50 Stars
              </p>
            </div>
          </Card>
        </motion.div>

        {/* Manual Donation */}
        <motion.div variants={slideUpVariants}>
          <Card variant="glass" className="mb-6">
            <div className="p-4 space-y-3">
              <h3 className="font-heading font-semibold text-white">
                Donate via card or bank transfer
              </h3>
              <p className="text-xs text-text-secondary">
                Generate a donation ID and complete payment offline. An admin will confirm your donation.
              </p>

              {manualError && (
                <p className="text-error text-sm">{manualError}</p>
              )}

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Amount (USD)</label>
                  <input
                    type="number"
                    value={manualAmount}
                    onChange={(e) => {
                      setManualAmount(e.target.value);
                      setManualError(null);
                      setManualDonationId(null);
                    }}
                    placeholder="10"
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder:text-text-secondary focus:border-accent-teal focus:outline-none"
                    min="1"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Name (optional)</label>
                  <input
                    type="text"
                    value={manualName}
                    onChange={(e) => {
                      setManualName(e.target.value);
                      setManualError(null);
                      setManualDonationId(null);
                    }}
                    placeholder="Your name"
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder:text-text-secondary focus:border-accent-teal focus:outline-none"
                    disabled={manualAnonymous}
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Message (optional)</label>
                  <textarea
                    value={manualMessage}
                    onChange={(e) => {
                      setManualMessage(e.target.value);
                      setManualError(null);
                      setManualDonationId(null);
                    }}
                    rows={2}
                    placeholder="Leave a note"
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder:text-text-secondary focus:border-accent-teal focus:outline-none"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={manualAnonymous}
                    onChange={(e) => {
                      setManualAnonymous(e.target.checked);
                      setManualError(null);
                      setManualDonationId(null);
                    }}
                    className="rounded border-white/20 bg-white/10"
                  />
                  Donate anonymously
                </label>
              </div>

              <Button
                variant="secondary"
                fullWidth
                onClick={handleManualDonation}
                disabled={manualProcessing}
              >
                {manualProcessing ? 'Creating ID...' : 'Generate Donation ID'}
              </Button>

              {manualDonationId && (
                <div className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xs text-text-secondary">
                  Donation ID: <span className="text-white font-mono">{manualDonationId}</span>
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Payment availability notice */}
        {!telegram.isPaymentAvailable && (
          <motion.div variants={slideUpVariants}>
            <Card variant="glass" className="bg-yellow-500/10 border-yellow-500/30 mb-4">
              <p className="text-yellow-400 text-sm text-center p-3">
                Telegram Stars payments are only available in the Telegram app
              </p>
            </Card>
          </motion.div>
        )}

        {/* Donate Button */}
        <motion.div variants={slideUpVariants}>
          <Button
            variant="gaming"
            size="xl"
            fullWidth
            onClick={handleDonate}
            disabled={isProcessing || finalStars < 50 || !telegram.isPaymentAvailable}
            pulsing={finalStars >= 50 && telegram.isPaymentAvailable}
          >
            {isProcessing ? (
              <span className="flex items-center gap-2">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                />
                Processing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="text-yellow-400">⭐</span>
                Donate {finalStars.toLocaleString()} Stars
              </span>
            )}
          </Button>
        </motion.div>

        {/* Security Note */}
        <motion.div variants={slideUpVariants} className="mt-4 text-center">
          <p className="text-xs text-text-secondary flex items-center justify-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Secure payment processing
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}

export default DonateScreen;
