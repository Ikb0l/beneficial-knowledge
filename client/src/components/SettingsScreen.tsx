import { useId, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '../lib/i18n';
import { cn } from '../lib/utils/cn';
import { Card, Button, Avatar } from './ui';
import { ArrowLeftIcon } from './ui/Icons';
import { containerVariants, itemVariants } from '../lib/animations/variants';
import { useDialog } from '../hooks/useDialog';

type RankTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master' | 'grandmaster';

interface SettingsScreenProps {
  onBack: () => void;
}

function Toggle({
  enabled,
  onChange,
  disabled = false,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
        enabled ? 'bg-accent-teal' : 'bg-white/20',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <motion.span
        animate={{ x: enabled ? 20 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="inline-block h-5 w-5 rounded-full bg-white shadow-md"
      />
    </button>
  );
}

function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  return (
    <div className="relative flex w-full items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className={cn(
          'slider-thumb h-1.5 flex-1 appearance-none rounded-full bg-white/20',
          disabled && 'cursor-not-allowed opacity-50'
        )}
        style={{
          background: `linear-gradient(to right, #FFC107 0%, #FFC107 ${value}%, rgba(255,255,255,0.2) ${value}%, rgba(255,255,255,0.2) 100%)`,
        }}
      />
      <span className="w-10 text-right font-mono text-sm text-text-secondary">{value}%</span>
    </div>
  );
}

function SettingsRow({
  icon,
  label,
  description,
  children,
}: {
  icon: string;
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div variants={itemVariants} className="flex items-center justify-between gap-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 px-2 text-xs font-semibold text-white/80">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <span className="block font-medium text-white">{label}</span>
          {description && <span className="block truncate text-xs text-text-tertiary">{description}</span>}
        </div>
      </div>
      {children}
    </motion.div>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div variants={containerVariants} initial="initial" animate="animate">
      <h3 className="mb-2 font-heading text-sm font-semibold uppercase tracking-wide text-text-secondary">{title}</h3>
      <Card variant="glass" className="divide-y divide-white/10">
        {children}
      </Card>
    </motion.div>
  );
}

export function SettingsScreen({ onBack }: SettingsScreenProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const {
    settings,
    updateSetting,
    resetSettings,
    isEditingProfile,
    profileDraft,
    isSavingProfile,
    startEditingProfile,
    updateProfileDraft,
    saveProfile,
    cancelEditingProfile,
    logout,
  } = useSettingsStore();

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const resetTitleId = useId();
  const resetDialogRef = useRef<HTMLDivElement>(null);
  const resetCancelButtonRef = useRef<HTMLButtonElement>(null);

  const logoutTitleId = useId();
  const logoutDialogRef = useRef<HTMLDivElement>(null);
  const logoutCancelButtonRef = useRef<HTMLButtonElement>(null);

  useDialog({
    open: showResetConfirm,
    onClose: () => setShowResetConfirm(false),
    dialogRef: resetDialogRef,
    initialFocusRef: resetCancelButtonRef,
  });

  useDialog({
    open: showLogoutConfirm,
    onClose: () => setShowLogoutConfirm(false),
    dialogRef: logoutDialogRef,
    initialFocusRef: logoutCancelButtonRef,
  });

  const displayName = user?.displayName || user?.username || t('profile.defaultPlayerName');
  const avatarUrl = user?.photoUrl || '';
  const rankTier = user?.profile?.rankTier as RankTier | undefined;
  const telegramBotUsername = String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim();
  const telegramBotUrl = telegramBotUsername ? `https://t.me/${telegramBotUsername}` : '';

  const handleLanguageChange = (langCode: LanguageCode) => {
    updateSetting('language', langCode);
  };

  const handleStartEditProfile = () => {
    if (user) {
      startEditingProfile({
        displayName,
        avatarUrl,
      });
    }
  };

  const handleSaveProfile = async () => {
    try {
      await saveProfile();
    } catch (error) {
      console.error('Failed to save profile:', error);
    }
  };

  const handleLogout = async () => {
    await logout();
    setShowLogoutConfirm(false);
  };

  const handleResetSettings = () => {
    resetSettings();
    setShowResetConfirm(false);
  };

  const handleOpenTelegramBot = () => {
    if (!telegramBotUrl) return;
    window.open(telegramBotUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="content-scrollable bg-gradient-main">
      <div className="sticky top-0 z-10 border-b border-white/10 bg-bg-primary/80 p-4 backdrop-blur-lg">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
            aria-label={t('common.back')}
          >
            <ArrowLeftIcon size={20} />
          </button>
          <h1 className="font-display text-xl font-bold text-white">{t('settings.title')}</h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="space-y-6 px-4 py-6">
        <div>
          <h3 className="mb-2 font-heading text-sm font-semibold uppercase tracking-wide text-text-secondary">
            {t('profile.title')}
          </h3>
          <Card variant="glass">
            {isEditingProfile && profileDraft ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Avatar src={profileDraft.avatarUrl} name={profileDraft.displayName || t('profile.defaultPlayerName')} size="xl" />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => updateProfileDraft('avatarUrl', '')}
                    disabled={!profileDraft.avatarUrl}
                  >
                    {t('settings.clearPhoto')}
                  </Button>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-text-secondary">{t('profile.displayName')}</label>
                  <input
                    type="text"
                    value={profileDraft.displayName}
                    onChange={(e) => updateProfileDraft('displayName', e.target.value)}
                    className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white focus:border-accent-teal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-text-secondary">{t('settings.avatarUrl')}</label>
                  <input
                    type="url"
                    value={profileDraft.avatarUrl}
                    onChange={(e) => updateProfileDraft('avatarUrl', e.target.value)}
                    placeholder={t('settings.avatarUrlPlaceholder')}
                    className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white placeholder:text-white/40 focus:border-accent-teal focus:outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" onClick={handleSaveProfile} disabled={isSavingProfile} className="flex-1">
                    {isSavingProfile ? t('settings.saving') : t('common.save')}
                  </Button>
                  <Button variant="ghost" onClick={cancelEditingProfile}>
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <Avatar src={avatarUrl} name={displayName} size="xl" rank={rankTier} showRankBorder />
                <div className="name-slot">
                  <span className="name-text font-semibold text-white">{displayName}</span>
                  <span className="text-sm text-text-secondary">{t('settings.editProfile')}</span>
                </div>
                <Button variant="secondary" size="sm" onClick={handleStartEditProfile}>
                  {t('settings.edit')}
                </Button>
              </div>
            )}
          </Card>
        </div>

        <SettingsSection title={t('settings.sound')}>
          <SettingsRow icon="SFX" label={t('settings.soundEffects')}>
            <Toggle enabled={settings.soundEffectsEnabled} onChange={(v) => updateSetting('soundEffectsEnabled', v)} />
          </SettingsRow>
          {settings.soundEffectsEnabled && (
            <div className="py-3 pl-10">
              <Slider value={settings.soundEffectsVolume} onChange={(v) => updateSetting('soundEffectsVolume', v)} />
            </div>
          )}
          <SettingsRow icon="MUS" label={t('settings.music')}>
            <Toggle enabled={settings.musicEnabled} onChange={(v) => updateSetting('musicEnabled', v)} />
          </SettingsRow>
          {settings.musicEnabled && (
            <div className="py-3 pl-10">
              <Slider value={settings.musicVolume} onChange={(v) => updateSetting('musicVolume', v)} />
            </div>
          )}
          <SettingsRow icon="HPT" label={t('settings.hapticFeedback')} description={t('settings.hapticDescription')}>
            <Toggle enabled={settings.hapticsEnabled} onChange={(v) => updateSetting('hapticsEnabled', v)} />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title={t('settings.notifications')}>
          <SettingsRow icon="MM" label={t('settings.matchFound')} description={t('settings.matchFoundDescription')}>
            <Toggle enabled={settings.matchFoundNotification} onChange={(v) => updateSetting('matchFoundNotification', v)} />
          </SettingsRow>
          <SettingsRow icon="TRN" label={t('settings.tournamentAlerts')} description={t('settings.tournamentAlertsDescription')}>
            <Toggle enabled={settings.tournamentNotification} onChange={(v) => updateSetting('tournamentNotification', v)} />
          </SettingsRow>
          <SettingsRow icon="FR" label={t('settings.friendRequests')} description={t('settings.friendRequestsDescription')}>
            <Toggle enabled={settings.friendRequestNotification} onChange={(v) => updateSetting('friendRequestNotification', v)} />
          </SettingsRow>
          <SettingsRow icon="CH" label={t('settings.challenges')} description={t('settings.challengesDescription')}>
            <Toggle enabled={settings.challengeNotification} onChange={(v) => updateSetting('challengeNotification', v)} />
          </SettingsRow>
          <SettingsRow icon="CAT" label={t('settings.categoryAlerts')} description={t('settings.categoryAlertsDescription')}>
            <Toggle enabled={settings.categoryNotification} onChange={(v) => updateSetting('categoryNotification', v)} />
          </SettingsRow>
          <SettingsRow icon="ONL" label={t('settings.onlineAlerts')} description={t('settings.onlineAlertsDescription')}>
            <Toggle enabled={settings.onlineThresholdNotification} onChange={(v) => updateSetting('onlineThresholdNotification', v)} />
          </SettingsRow>
          <SettingsRow icon="TGM" label={t('settings.telegramConnect')} description={t('settings.telegramConnectDescription')}>
            {telegramBotUrl ? (
              <Button variant="ghost" size="sm" onClick={handleOpenTelegramBot}>
                {t('settings.openTelegramBot')}
              </Button>
            ) : (
              <span className="text-xs text-text-tertiary">{t('settings.unavailable')}</span>
            )}
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title={t('settings.gameplay')}>
          <SettingsRow icon="TIM" label={t('settings.showTimer')} description={t('settings.showTimerDescription')}>
            <Toggle enabled={settings.showTimer} onChange={(v) => updateSetting('showTimer', v)} />
          </SettingsRow>
          <SettingsRow
            icon="OPP"
            label={t('settings.showOpponentProgress')}
            description={t('settings.showOpponentProgressDescription')}
          >
            <Toggle enabled={settings.showOpponentProgress} onChange={(v) => updateSetting('showOpponentProgress', v)} />
          </SettingsRow>
          <SettingsRow icon="AQ" label={t('settings.autoQueue')} description={t('settings.autoQueueDescription')}>
            <Toggle enabled={settings.autoQueue} onChange={(v) => updateSetting('autoQueue', v)} />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title={t('settings.display')}>
          <SettingsRow icon="ANI" label={t('settings.reducedMotion')} description={t('settings.reducedMotionDescription')}>
            <Toggle enabled={settings.reducedMotion} onChange={(v) => updateSetting('reducedMotion', v)} />
          </SettingsRow>
          <SettingsRow icon="CON" label={t('settings.highContrast')} description={t('settings.highContrastDescription')}>
            <Toggle enabled={settings.highContrast} onChange={(v) => updateSetting('highContrast', v)} />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title={t('settings.language')}>
          <div className="p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleLanguageChange(lang.code)}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl px-4 py-3 transition-all',
                    settings.language === lang.code
                      ? 'bg-accent-teal text-white ring-2 ring-accent-teal'
                      : 'bg-white/10 text-text-secondary hover:bg-white/20'
                  )}
                >
                  <span className="text-xs font-semibold uppercase">{lang.code}</span>
                  <span className="font-medium">{lang.nativeName}</span>
                </button>
              ))}
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title={t('settings.account')}>
          <SettingsRow icon="RST" label={t('settings.resetToDefault')} description={t('settings.resetDescription')}>
            <Button variant="ghost" size="sm" onClick={() => setShowResetConfirm(true)}>
              {t('settings.reset')}
            </Button>
          </SettingsRow>
          <SettingsRow icon="OUT" label={t('settings.logout')} description={t('settings.logoutDescription')}>
            <Button variant="danger" size="sm" onClick={() => setShowLogoutConfirm(true)}>
              {t('settings.logout')}
            </Button>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title={t('settings.about')}>
          <SettingsRow icon="VER" label={t('settings.version')}>
            <span className="font-mono text-sm text-text-secondary">1.0.0</span>
          </SettingsRow>
          <SettingsRow icon="TOS" label={t('settings.termsOfService')}>
            <span className="text-xs text-text-tertiary">{t('settings.unavailable')}</span>
          </SettingsRow>
          <SettingsRow icon="PRI" label={t('settings.privacyPolicy')}>
            <span className="text-xs text-text-tertiary">{t('settings.unavailable')}</span>
          </SettingsRow>
        </SettingsSection>
      </div>

      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowResetConfirm(false)} role="presentation">
          <motion.div
            ref={resetDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={resetTitleId}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm"
            onClick={(event) => event.stopPropagation()}
          >
            <Card variant="elevated" className="text-center">
              <span className="mb-3 block text-4xl">!</span>
              <h3 id={resetTitleId} className="mb-2 font-display text-xl font-bold text-white">
                {t('settings.resetConfirmTitle')}
              </h3>
              <p className="mb-6 text-sm text-text-secondary">{t('settings.resetConfirmMessage')}</p>
              <div className="flex gap-3">
                <Button ref={resetCancelButtonRef} variant="ghost" fullWidth type="button" onClick={() => setShowResetConfirm(false)}>
                  {t('common.cancel')}
                </Button>
                <Button variant="danger" fullWidth type="button" onClick={handleResetSettings}>
                  {t('settings.reset')}
                </Button>
              </div>
            </Card>
          </motion.div>
        </div>
      )}

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowLogoutConfirm(false)} role="presentation">
          <motion.div
            ref={logoutDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={logoutTitleId}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm"
            onClick={(event) => event.stopPropagation()}
          >
            <Card variant="elevated" className="text-center">
              <span className="mb-3 block text-4xl">?</span>
              <h3 id={logoutTitleId} className="mb-2 font-display text-xl font-bold text-white">
                {t('settings.logoutConfirmTitle')}
              </h3>
              <p className="mb-6 text-sm text-text-secondary">{t('settings.logoutConfirmMessage')}</p>
              <div className="flex gap-3">
                <Button ref={logoutCancelButtonRef} variant="ghost" fullWidth type="button" onClick={() => setShowLogoutConfirm(false)}>
                  {t('common.cancel')}
                </Button>
                <Button variant="danger" fullWidth type="button" onClick={handleLogout}>
                  {t('settings.logout')}
                </Button>
              </div>
            </Card>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

export default SettingsScreen;
