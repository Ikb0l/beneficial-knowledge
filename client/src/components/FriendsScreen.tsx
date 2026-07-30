
import { useEffect, useMemo, useRef, useState, type ReactNode, type SVGProps } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import { useFriendsStore, type Friend, type FriendRequest, type BlockedUser } from '../stores/friendsStore';
import { useGameStore } from '../stores/gameStore';
import { useCategoryStore } from '../stores/categoryStore';
import { useRankStore } from '../stores/rankStore';
import { useAuthStore } from '../stores/authStore';
import { Avatar, Badge } from './ui';
import { cn } from '../lib/utils/cn';
import { useDialog } from '../hooks/useDialog';
import { ChallengeFriendDialog } from './ChallengeFriendDialog';
import type { ChallengeFriendResult } from '../shared/types/challenge';
import {
  ArrowLeftIcon,
  BellIcon,
  GamepadIcon,
  SearchIcon,
  ShieldIcon,
  SparklesIcon,
  UsersIcon,
} from './ui/Icons';

type RankTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master' | 'grandmaster';
type RequestView = 'received' | 'sent';

interface FriendsScreenProps {
  onBack: () => void;
}

type InlineIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

const InlineIcon = ({ size = 20, children, ...props }: InlineIconProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
    >
      {children}
    </svg>
);

const UserPlusIcon = (props: InlineIconProps) => (
    <InlineIcon {...props}>
      <path d="M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M19 9v6M22 12h-6" />
    </InlineIcon>
);

const InboxIcon = (props: InlineIconProps) => (
    <InlineIcon {...props}>
      <path d="M4 7h16v10H4z" />
      <path d="M4 7l8 6 8-6" />
    </InlineIcon>
);

const DotsIcon = (props: InlineIconProps) => (
    <InlineIcon {...props}>
      <circle cx="12" cy="6" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="18" r="1.6" />
    </InlineIcon>
);
const CloseIcon = (props: InlineIconProps) => (
    <InlineIcon {...props}>
      <path d="M6 6l12 12M18 6l-12 12" />
    </InlineIcon>
);

const ShieldCheckIcon = (props: InlineIconProps) => (
    <InlineIcon {...props}>
      <path d="M12 3l7 3v6c0 4.2-3 7.2-7 9-4-1.8-7-4.8-7-9V6l7-3z" />
      <path d="M8 13l2 2 5-5" />
    </InlineIcon>
);
const listVariants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const cardVariants = {
  initial: { opacity: 0, x: 18 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 24 },
};

const glowVariants = {
  initial: { opacity: 0.35 },
  animate: { opacity: [0.35, 0.7, 0.35] },
};

const getTimeAgo = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
};

const SkeletonBlock = ({ className, reducedMotion }: { className: string; reducedMotion?: boolean }) => (
    <div className={cn('relative overflow-hidden rounded-2xl bg-[#1b2f58]/70', className)}>
      {!reducedMotion && (
          <motion.span
              className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
          />
      )}
    </div>
);

const SectionHeader = ({ label, accent }: { label: string; accent: string }) => (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={cn('h-2 w-2 rounded-full', accent)} />
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
          {label}
        </h3>
      </div>
    </div>
);

const EmptyState = ({
                      icon,
                      title,
                      description,
                      actionLabel,
                      onAction,
                      reducedMotion,
                    }: {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  reducedMotion?: boolean;
}) => (
    <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-14 px-6 text-center"
    >
      <motion.div
          animate={reducedMotion ? undefined : { y: [0, -8, 0] }}
          transition={reducedMotion ? undefined : { repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
          className="mb-4"
      >
        {icon}
      </motion.div>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-[#7484a1]">{description}</p>
      {actionLabel && onAction && (
          <button
              onClick={onAction}
              className="mt-5 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#20c5ff] to-[#15a7e0] px-5 py-2.5 text-sm font-semibold text-[#0b1020] shadow-[0_10px_25px_rgba(0,217,255,0.3)] transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20c5ff]/70"
          >
            {actionLabel}
          </button>
      )}
    </motion.div>
);

const statusPalette = {
  online: {
    ring: 'from-[#4ADE80] to-[#20c5ff]',
    dot: 'bg-[#4ADE80]',
    label: 'Online',
    text: 'text-[#4ADE80]',
  },
  ingame: {
    ring: 'from-[#8B5CF6] to-[#6D28D9]',
    dot: 'bg-[#8B5CF6]',
    label: 'In Game',
    text: 'text-[#8B5CF6]',
  },
  offline: {
    ring: 'from-[#374151] to-[#1f2937]',
    dot: 'bg-[#7484a1]',
    label: 'Offline',
    text: 'text-[#7484a1]',
  },
};

const getStatusType = (friend: Friend): 'online' | 'ingame' | 'offline' => {
  if (!friend.online) return 'offline';
  if (['diamond', 'master', 'grandmaster'].includes(friend.rankTier)) return 'ingame';
  return 'online';
};
const FriendCard = ({
                      friend,
                      variants,
                      onOpenProfile,
                      onOpenOptions,
                      onChallenge,
                      hasPendingChallenge,
                      pendingChallengeTargetId,
                      isUserBusy,
                      cooldownEndTime,
                      cooldownTargetId,
                      cooldownRemainingSeconds,
                    }: {
  friend: Friend;
  variants?: Variants;
  onOpenProfile: (friend: Friend) => void;
  onOpenOptions: (friend: Friend) => void;
  onChallenge: (friend: Friend) => void;
  hasPendingChallenge: boolean;
  pendingChallengeTargetId: string | null;
  isUserBusy: boolean;
  cooldownEndTime: number | null;
  cooldownTargetId: string | null;
  cooldownRemainingSeconds: number | null;
}) => {
  const statusType = getStatusType(friend);
  const statusInfo = statusPalette[statusType];
  const hasCooldown = cooldownEndTime !== null && cooldownTargetId === friend.id;
  const cooldownSeconds = hasCooldown && cooldownRemainingSeconds !== null
      ? Math.max(0, cooldownRemainingSeconds)
      : 0;
  const isInCooldown = hasCooldown && cooldownSeconds > 0;
  const isThisTargetPending = hasPendingChallenge && pendingChallengeTargetId === friend.id;
  const canChallenge = friend.online && !hasPendingChallenge && !isUserBusy && !isInCooldown;

  const getButtonText = () => {
    if (!friend.online) return 'Offline';
    if (isInCooldown) return `Wait ${cooldownSeconds}s`;
    if (isThisTargetPending) return 'Waiting';
    if (hasPendingChallenge) return 'Pending';
    if (isUserBusy) return 'In Game';
    return 'Challenge';
  };

  return (
      <motion.div
          variants={variants}
          className="group relative overflow-hidden rounded-[clamp(16px,3vw,24px)] border border-white/5 bg-[#16223f]/90 p-[clamp(12px,2.8vw,16px)] shadow-[0_10px_24px_rgba(0,0,0,0.28)] transition-transform"
          whileTap={{ scale: 0.98 }}
          onClick={() => onOpenProfile(friend)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onOpenProfile(friend);
            }
          }}
      >
        <div className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100">
          <motion.div
              variants={glowVariants}
              initial="initial"
              animate="animate"
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -top-10 right-0 h-24 w-24 rounded-full bg-[#20c5ff]/10 blur-2xl"
          />
        </div>

        <div className="relative flex items-center gap-4">
          <div className="relative">
            <div className={cn('rounded-full bg-gradient-to-br p-[2px]', statusInfo.ring)}>
              <Avatar
                  src={friend.avatarUrl}
                  name={friend.displayName}
                  size="lg"
                  rank={friend.rankTier as RankTier}
                  showRankBorder={false}
              />
            </div>
            <motion.span
                className={cn(
                    'absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#0b1020]',
                    statusInfo.dot
                )}
                animate={variants && friend.online ? { scale: [1, 1.15, 1] } : undefined}
                transition={variants && friend.online ? { repeat: Infinity, duration: 1.5 } : undefined}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="name-text text-lg font-semibold text-white truncate">
                {friend.displayName}
              </span>
            </div>
          </div>

          <button
              onClick={(event) => {
                event.stopPropagation();
                if (canChallenge) onChallenge(friend);
              }}
              disabled={!canChallenge}
              className={cn(
                  'inline-flex h-10 items-center gap-2 rounded-full px-3 text-xs font-semibold transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20c5ff]/70',
                  canChallenge
                      ? 'bg-gradient-to-r from-[#20c5ff] to-[#15a7e0] text-[#0b1020] shadow-[0_8px_18px_rgba(0,217,255,0.35)]'
                      : 'bg-white/10 text-[#7484a1]'
              )}
              aria-label={`Challenge ${friend.displayName}`}
          >
            <GamepadIcon size={18} />
            {getButtonText()}
          </button>

          <button
              onClick={(event) => {
                event.stopPropagation();
                onOpenOptions(friend);
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20c5ff]/70"
              aria-label="More options"
          >
            <DotsIcon size={20} />
          </button>
        </div>
      </motion.div>
  );
};
const RequestCard = ({
                       request,
                       variants,
                       onAccept,
                       onReject,
                       onCancel,
                     }: {
  request: FriendRequest;
  variants?: Variants;
  onAccept?: (userId: string) => void;
  onReject?: (userId: string) => void;
  onCancel?: (userId: string) => void;
}) => {
  const timeAgo = getTimeAgo(request.sentAt);
  const isIncoming = request.type === 'incoming';

  return (
      <motion.div
          variants={variants}
          className={cn(
              'relative overflow-hidden rounded-[clamp(16px,3vw,24px)] border bg-[#16223f]/95 p-[clamp(12px,2.8vw,16px)] shadow-[0_10px_24px_rgba(0,0,0,0.24)]',
              isIncoming ? 'border-[#F59E0B]/40' : 'border-[#20c5ff]/20'
          )}
      >
        <div className={cn(
            'absolute left-0 top-0 h-full w-1',
            isIncoming ? 'bg-[#F59E0B]' : 'bg-[#20c5ff]'
        )} />

        <div className="flex items-center gap-4">
          <Avatar
              src={request.avatarUrl}
              name={request.displayName}
              size="lg"
          />
          <div className="flex-1 min-w-0">
            <p className="name-text text-lg font-semibold text-white truncate">
              {request.displayName}
            </p>
            <p className="text-xs text-[#7484a1]">
              {isIncoming ? 'Wants to be your friend' : 'Request sent'} - {timeAgo}
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          {isIncoming ? (
              <>
                <button
                    onClick={() => {
                      void onAccept?.(request.userId);
                    }}
                    className="flex-1 rounded-full bg-[#4ADE80] px-4 py-2 text-xs font-semibold text-[#0b1020] shadow-[0_8px_16px_rgba(74,222,128,0.35)] transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ADE80]/70"
                >
                  Accept
                </button>
                <button
                    onClick={() => {
                      void onReject?.(request.userId);
                    }}
                    className="flex-1 rounded-full border border-[#EF4444]/60 px-4 py-2 text-xs font-semibold text-[#EF4444] transition-colors hover:bg-[#EF4444]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EF4444]/70"
                >
                  Decline
                </button>
              </>
          ) : (
              <button
                  onClick={() => {
                    void onCancel?.(request.userId);
                  }}
                  className="flex-1 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20c5ff]/70"
              >
                Cancel request
              </button>
          )}
        </div>
      </motion.div>
  );
};
const SearchResultCard = ({
                            user,
                            variants,
                            onAddFriend,
                            isFriend,
                            isPending,
                            isSendingRequest,
                            sendingToUserId,
                          }: {
  user: Friend;
  variants?: Variants;
  onAddFriend: (userId: string) => void;
  isFriend: boolean;
  isPending: boolean;
  isSendingRequest: boolean;
  sendingToUserId: string | null;
}) => {
  const isThisUserBeingAdded = isSendingRequest && sendingToUserId === user.id;

  return (
      <motion.div
          variants={variants}
          className="flex items-center gap-4 rounded-[clamp(16px,3vw,24px)] border border-white/5 bg-[#16223f]/90 p-[clamp(12px,2.8vw,16px)] shadow-[0_8px_20px_rgba(0,0,0,0.22)]"
      >
        <Avatar
            src={user.avatarUrl}
            name={user.displayName}
            size="lg"
            rank={user.rankTier as RankTier}
            showRankBorder
        />
        <div className="flex-1 min-w-0">
          <p className="name-text text-base font-semibold text-white truncate">{user.displayName}</p>
          <p className="text-xs text-[#20c5ff]">{user.mmr} MMR</p>
        </div>
        {isFriend ? (
            <Badge variant="success" size="sm">Friends</Badge>
        ) : isPending ? (
            <Badge variant="default" size="sm">Pending</Badge>
        ) : (
            <button
                onClick={() => {
                  void onAddFriend(user.id);
                }}
                disabled={isSendingRequest}
                className={cn(
                    'rounded-full px-4 py-2 text-xs font-semibold transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20c5ff]/70',
                    isSendingRequest
                        ? 'bg-white/10 text-white/60'
                        : 'bg-gradient-to-r from-[#20c5ff] to-[#15a7e0] text-[#0b1020] shadow-[0_8px_18px_rgba(0,217,255,0.3)]'
                )}
            >
              {isThisUserBeingAdded ? 'Sending' : 'Add'}
            </button>
        )}
      </motion.div>
  );
};

const SuggestedCard = ({
                         user,
                         variants,
                         onAdd,
                       }: {
  user: {
    id: string;
    displayName: string;
    avatarUrl?: string;
    reason: string;
    rankName: string;
    rankColor: string;
  };
  variants?: Variants;
  onAdd: (id: string) => void;
}) => (
    <motion.div
        variants={variants}
        className="flex items-center gap-4 rounded-[clamp(16px,3vw,24px)] border border-white/5 bg-[#16223f]/90 p-[clamp(12px,2.8vw,16px)] shadow-[0_8px_20px_rgba(0,0,0,0.22)]"
    >
      <Avatar
          src={user.avatarUrl}
          name={user.displayName}
          size="lg"
          showRankBorder={false}
      />
      <div className="flex-1 min-w-0">
        <p className="name-text text-base font-semibold text-white truncate">{user.displayName}</p>
        <p className="text-xs text-[#7484a1]">{user.reason}</p>
      </div>
      <div className="flex items-center gap-2">
      <span
          className="rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
          style={{
            borderColor: `${user.rankColor}55`,
            color: user.rankColor,
            backgroundColor: `${user.rankColor}1a`,
          }}
      >
        {user.rankName}
      </span>
        <button
            onClick={() => {
              void onAdd(user.id);
            }}
            className="rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-white/80 transition-colors hover:bg-[#20c5ff]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20c5ff]/70"
        >
          Add
        </button>
      </div>
    </motion.div>
);

const BlockedCard = ({
                       user,
                       variants,
                       onUnblock,
                     }: {
  user: BlockedUser;
  variants?: Variants;
  onUnblock: (user: BlockedUser) => void;
}) => {
  const blockedDate = user.blockedAt ? new Date(user.blockedAt).toLocaleDateString() : '';

  return (
      <motion.div
          variants={variants}
          className="flex items-center gap-4 rounded-[clamp(16px,3vw,24px)] border border-white/10 bg-[#1b1f3b]/80 p-[clamp(12px,2.8vw,16px)] text-white/70"
      >
        <div className="relative opacity-70">
          <Avatar src={user.avatarUrl} name={user.displayName} size="lg" />
          <div className="absolute inset-0 flex items-center justify-center">
            <ShieldIcon className="text-[#EF4444]" size={22} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="name-text text-base font-semibold text-white/80 truncate">{user.displayName}</p>
          <p className="text-xs text-[#7484a1]">Blocked {blockedDate}</p>
        </div>
        <button
            onClick={() => onUnblock(user)}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20c5ff]/70"
        >
          Unblock
        </button>
      </motion.div>
  );
};
export function FriendsScreen({ onBack }: FriendsScreenProps) {
  const reducedMotion = useReducedMotion();
  const {
    currentTab,
    setTab,
    friends,
    incomingRequests,
    outgoingRequests,
    activityFeed,
    searchResults,
    searchQuery,
    isLoading,
    isSearching,
    isSendingFriendRequest,
    sendingFriendRequestTo,
    error,
    blockedUsers,
    hasPendingOutgoingChallenge,
    outgoingChallengeTargetId,
    cooldownEndTime,
    cooldownTargetId,
    cooldownRemainingSeconds,
    fetchFriends,
    fetchRequests,
    fetchActivityFeed,
    fetchBlockedUsers,
    searchUsers,
    sendFriendRequest,
    acceptRequest,
    rejectRequest,
    removeFriend,
    challengeFriend,
    blockUser,
    unblockUser,
    clearSearch,
    clearError,
  } = useFriendsStore();

  const gamePhase = useGameStore((state) => state.phase);
  const queueSubcategories = useGameStore((state) => state.queueSubcategories);
  const queueAllInCategory = useGameStore((state) => state.queueAllInCategory);
  const matchCategory = useGameStore((state) => state.matchCategory);
  const isUserBusy = !['idle', 'selecting'].includes(gamePhase);

  const categories = useCategoryStore((state) => state.categories);
  const fetchCategories = useCategoryStore((state) => state.fetchCategories);
  const categoriesLoading = useCategoryStore((state) => state.isLoading);
  const { fetchRankTiers, getRankByMmr } = useRankStore();
  const { user, myReferralCode, fetchMyReferralCode } = useAuthStore();

  const [localSearch, setLocalSearch] = useState('');
  const [headerSearchOpen, setHeaderSearchOpen] = useState(false);
  const [requestView, setRequestView] = useState<RequestView>('received');
  const [optionsFriend, setOptionsFriend] = useState<Friend | null>(null);
  const [challengeTarget, setChallengeTarget] = useState<Friend | null>(null);
  const [unblockTarget, setUnblockTarget] = useState<BlockedUser | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  const optionsDialogRef = useRef<HTMLDivElement>(null);
  const optionsCloseButtonRef = useRef<HTMLButtonElement>(null);
  const unblockDialogRef = useRef<HTMLDivElement>(null);
  const unblockCancelButtonRef = useRef<HTMLButtonElement>(null);

  useDialog({
    open: !!optionsFriend,
    onClose: () => setOptionsFriend(null),
    dialogRef: optionsDialogRef,
    initialFocusRef: optionsCloseButtonRef,
  });

  useDialog({
    open: !!unblockTarget,
    onClose: () => setUnblockTarget(null),
    dialogRef: unblockDialogRef,
    initialFocusRef: unblockCancelButtonRef,
  });
  const prefersReducedMotion = !!reducedMotion;
  const cardMotion = prefersReducedMotion ? undefined : cardVariants;
  const listMotion = prefersReducedMotion ? undefined : listVariants;

  useEffect(() => {
    void fetchFriends();
    void fetchActivityFeed();
    void fetchRankTiers();
  }, [fetchFriends, fetchActivityFeed, fetchRankTiers]);

  useEffect(() => {
    if (categories.length === 0 && !categoriesLoading) {
      void fetchCategories();
    }
  }, [categories.length, categoriesLoading, fetchCategories]);

  useEffect(() => {
    if (!myReferralCode) {
      void fetchMyReferralCode();
    }
  }, [myReferralCode, fetchMyReferralCode]);

  useEffect(() => {
    return () => {
      useFriendsStore.getState().cleanup();
    };
  }, []);

  useEffect(() => {
    if (currentTab === 'requests' || currentTab === 'add') {
      void fetchRequests();
    } else if (currentTab === 'blocked') {
      void fetchBlockedUsers();
    }
  }, [currentTab, fetchRequests, fetchBlockedUsers]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentTab === 'add' && localSearch.length >= 2) {
        void searchUsers(localSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, currentTab, searchUsers]);

  const handleSearch = (value: string) => {
    setLocalSearch(value);
    if (value.length < 2) {
      clearSearch();
    }
  };

  const handleTabChange = (tabId: 'friends' | 'requests' | 'add' | 'blocked') => {
    if (currentTab === 'add' && tabId !== 'add') {
      clearSearch();
      setLocalSearch('');
    }
    setTab(tabId);
  };

  const handleHeaderSearch = () => {
    setHeaderSearchOpen(true);
    if (currentTab !== 'add') {
      handleTabChange('add');
    }
  };

  const handleBack = () => {
    setHeaderSearchOpen(false);
    setOptionsFriend(null);
    setChallengeTarget(null);
    setUnblockTarget(null);
    if (currentTab === 'add') {
      clearSearch();
      setLocalSearch('');
    }
    onBack();
  };

  const handleChallenge = (friend: Friend) => {
    clearError();
    setChallengeTarget(friend);
  };

  const handleSendChallenge = async (categoryId: string): Promise<ChallengeFriendResult> => {
    if (!challengeTarget) {
      return { ok: false, message: 'The selected player is no longer available.' };
    }
    const result = await challengeFriend(challengeTarget.id, categoryId);
    if (result.ok) setChallengeTarget(null);
    return result;
  };

  const preferredChallengeTopicId = !queueAllInCategory
    ? queueSubcategories[0] || matchCategory || null
    : matchCategory || null;

  const handleCopyInvite = async () => {
    const code = myReferralCode?.code || user?.userId || 'BeneficialKnowledge';
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(code);
        setInviteCopied(true);
        setTimeout(() => setInviteCopied(false), 1500);
        return;
      } catch {
        setInviteCopied(false);
      }
    }
  };

  const tabs = [
    { id: 'friends' as const, label: 'Friends', icon: UsersIcon, badge: friends.length },
    { id: 'requests' as const, label: 'Requests', icon: InboxIcon, badge: incomingRequests.length },
    { id: 'add' as const, label: 'Add', icon: UserPlusIcon },
    { id: 'blocked' as const, label: 'Blocked', icon: ShieldIcon, badge: blockedUsers.length || undefined },
  ];

  const onlineFriends = friends.filter((friend) => friend.online);
  const offlineFriends = friends.filter((friend) => !friend.online);
  const friendIds = useMemo(() => new Set(friends.map((friend) => friend.id)), [friends]);
  const pendingIds = useMemo(() => new Set([
    ...incomingRequests.map((request) => request.userId),
    ...outgoingRequests.map((request) => request.userId),
  ]), [incomingRequests, outgoingRequests]);

  const suggestedFriends = useMemo(() => {
    const seen = new Set<string>();
    const suggestions: Array<{
      id: string;
      displayName: string;
      avatarUrl?: string;
      reason: string;
      rankName: string;
      rankColor: string;
    }> = [];

    for (const activity of activityFeed) {
      if (friendIds.has(activity.userId) || pendingIds.has(activity.userId)) continue;
      if (seen.has(activity.userId)) continue;
      seen.add(activity.userId);
      const activityMmr = typeof activity.metadata?.mmr === 'number'
          ? Number(activity.metadata.mmr)
          : 1000 + suggestions.length * 55;
      const rank = getRankByMmr(activityMmr);
      suggestions.push({
        id: activity.userId,
        displayName: activity.username,
        avatarUrl: activity.avatarUrl,
        reason: activity.description || 'Suggested based on recent activity',
        rankName: rank.name,
        rankColor: rank.color,
      });
      if (suggestions.length >= 5) break;
    }

    return suggestions;
  }, [activityFeed, friendIds, pendingIds, getRankByMmr]);

  const requestTabs = [
    { id: 'received' as const, label: 'Received', count: incomingRequests.length },
    { id: 'sent' as const, label: 'Sent', count: outgoingRequests.length },
  ];

  const inviteCode = myReferralCode?.code || user?.userId || 'BeneficialKnowledge';

  const renderFriendSection = (
      label: string,
      accent: string,
      list: Friend[]
  ) => (
      list.length > 0 ? (
          <div className="space-y-3">
            <SectionHeader label={`${label} (${list.length})`} accent={accent} />
            {list.map((friend) => (
                <FriendCard
                    key={friend.id}
                    friend={friend}
                    variants={cardMotion}
                    onOpenProfile={setOptionsFriend}
                    onOpenOptions={setOptionsFriend}
                    onChallenge={handleChallenge}
                    hasPendingChallenge={hasPendingOutgoingChallenge}
                    pendingChallengeTargetId={outgoingChallengeTargetId}
                    isUserBusy={isUserBusy}
                    cooldownEndTime={cooldownEndTime}
                    cooldownTargetId={cooldownTargetId}
                    cooldownRemainingSeconds={cooldownRemainingSeconds}
                />
            ))}
          </div>
      ) : null
  );

  return (
      <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="content-scrollable bg-gradient-main"
      >
        <div className="sticky top-0 z-20 border-b border-white/5 bg-[#0b1020]/80 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 pt-4 pb-3 safe-area-top">
            <button
                onClick={handleBack}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20c5ff]/70"
                aria-label="Back"
            >
              <ArrowLeftIcon size={22} />
            </button>

            <div className="flex-1">
              <AnimatePresence mode="wait">
                {headerSearchOpen ? (
                    <motion.div
                        key="search"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        className="relative"
                    >
                      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60" size={20} />
                      <input
                          value={localSearch}
                          onChange={(event) => handleSearch(event.target.value)}
                          placeholder=""
                          className="w-full rounded-full border border-white/10 bg-[#16223f]/80 py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-[#7484a1] focus:outline-none focus:ring-2 focus:ring-[#20c5ff]/60"
                      />
                    </motion.div>
                ) : (
                    <motion.div
                        key="title"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                    >
                      <h1 className="text-lg font-semibold text-white">Friends</h1>
                    </motion.div>
                )}
              </AnimatePresence>
            </div>

            {headerSearchOpen ? (
                <button
                    onClick={() => setHeaderSearchOpen(false)}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20c5ff]/70"
                    aria-label="Close search"
                >
                  <CloseIcon size={20} />
                </button>
            ) : (
                <button
                    onClick={handleHeaderSearch}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20c5ff]/70"
                    aria-label="Search"
                >
                  <SearchIcon size={20} />
                </button>
            )}
          </div>

          <div className="px-4 pb-4">
            <div className="rounded-2xl border border-white/5 bg-[#16223f]/70 p-1 shadow-[0_10px_24px_rgba(0,0,0,0.25)]">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
                {tabs.map((tab) => {
                  const isActive = currentTab === tab.id;
                  const TabIcon = tab.icon;
                  return (
                      <button
                          key={tab.id}
                          onClick={() => handleTabChange(tab.id)}
                          className={cn(
                              'relative flex h-16 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold transition-colors',
                              isActive ? 'text-white' : 'text-[#7484a1]'
                          )}
                      >
                        {isActive && (
                            <motion.span
                                layoutId="friends-tab-pill"
                                className="absolute inset-0 rounded-xl bg-gradient-to-br from-[#20c5ff] to-[#15a7e0] shadow-[0_8px_18px_rgba(0,217,255,0.35)]"
                                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                            />
                        )}
                        <span className="relative z-10 flex items-center gap-1">
                      <TabIcon size={20} />
                          {tab.badge !== undefined && tab.badge > 0 && (
                              <span className="ml-1 rounded-full bg-[#EF4444] px-1.5 py-0.5 text-[9px] font-semibold text-white">
                          {tab.badge > 99 ? '99+' : tab.badge}
                        </span>
                          )}
                    </span>
                        <span className="relative z-10">{tab.label}</span>
                      </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-6">
          <AnimatePresence>
            {error && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mb-4 rounded-2xl border border-[#EF4444]/40 bg-[#EF4444]/15 p-4 text-sm text-[#EF4444]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>{error}</span>
                    <button
                        onClick={clearError}
                        className="text-xs font-semibold text-white/70 hover:text-white"
                    >
                      Dismiss
                    </button>
                  </div>
                </motion.div>
            )}
          </AnimatePresence>
          {currentTab === 'friends' && (
              <>
                {isLoading ? (
                    <div className="space-y-3">
                      <SkeletonBlock className="h-24" reducedMotion={prefersReducedMotion} />
                      <SkeletonBlock className="h-24" reducedMotion={prefersReducedMotion} />
                      <SkeletonBlock className="h-24" reducedMotion={prefersReducedMotion} />
                    </div>
                ) : friends.length > 0 ? (
                    <motion.div
                        variants={listMotion}
                        initial="initial"
                        animate="animate"
                        className="space-y-6"
                    >
                      {renderFriendSection('Online Now', 'bg-[#4ADE80]', onlineFriends)}
                      {renderFriendSection('Offline', 'bg-[#7484a1]', offlineFriends)}
                    </motion.div>
                ) : (
                    <EmptyState
                        icon={<UsersIcon size={64} className="text-white/30" />}
                        title="No friends yet"
                        description="Add friends to challenge them and see their activity."
                        actionLabel="Find Friends"
                        onAction={() => handleTabChange('add')}
                        reducedMotion={prefersReducedMotion}
                    />
                )}
              </>
          )}

          {currentTab === 'requests' && (
              <>
                {isLoading ? (
                    <div className="space-y-3">
                      <SkeletonBlock className="h-24" reducedMotion={prefersReducedMotion} />
                      <SkeletonBlock className="h-24" reducedMotion={prefersReducedMotion} />
                    </div>
                ) : (
                    <div className="space-y-5">
                      <div className="rounded-2xl border border-white/10 bg-[#16223f]/70 p-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                          {requestTabs.map((tab) => {
                            const isActive = requestView === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setRequestView(tab.id)}
                                    className={cn(
                                        'relative flex h-10 items-center justify-center gap-2 rounded-xl text-xs font-semibold',
                                        isActive ? 'text-white' : 'text-[#7484a1]'
                                    )}
                                >
                                  {isActive && (
                                      <motion.span
                                          layoutId="request-pill"
                                          className="absolute inset-0 rounded-xl bg-[#20c5ff]/20"
                                          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                                      />
                                  )}
                                  <span className="relative z-10">{tab.label}</span>
                                  {tab.count > 0 && (
                                      <span className="relative z-10 rounded-full bg-[#EF4444] px-2 py-0.5 text-[10px] text-white">
                              {tab.count}
                            </span>
                                  )}
                                </button>
                            );
                          })}
                        </div>
                      </div>

                      <motion.div
                          variants={listMotion}
                          initial="initial"
                          animate="animate"
                          className="space-y-3"
                      >
                        <AnimatePresence mode="popLayout">
                          {requestView === 'received' ? (
                              incomingRequests.length > 0 ? (
                                  incomingRequests.map((request) => (
                                      <RequestCard
                                          key={request.id}
                                          request={request}
                                          variants={cardMotion}
                                          onAccept={acceptRequest}
                                          onReject={rejectRequest}
                                      />
                                  ))
                              ) : (
                                  <EmptyState
                                      icon={<BellIcon size={56} className="text-white/30" />}
                                      title="No pending requests"
                                      description="When someone sends you a request, it will show up here."
                                      reducedMotion={prefersReducedMotion}
                                  />
                              )
                          ) : outgoingRequests.length > 0 ? (
                              outgoingRequests.map((request) => (
                                  <RequestCard
                                      key={request.id}
                                      request={request}
                                      variants={cardMotion}
                                      onCancel={rejectRequest}
                                  />
                              ))
                          ) : (
                              <EmptyState
                                  icon={<InboxIcon size={56} className="text-white/30" />}
                                  title="No sent requests"
                                  description="Send a request to start competing."
                                  reducedMotion={prefersReducedMotion}
                              />
                          )}
                        </AnimatePresence>
                      </motion.div>
                    </div>
                )}
              </>
          )}
          {currentTab === 'add' && (
              <div className="space-y-6">
                <div className="relative">
                  <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-white/60" size={20} />
                  <input
                      value={localSearch}
                      onChange={(event) => handleSearch(event.target.value)}
                      placeholder=""
                      className="w-full rounded-2xl border border-white/10 bg-[#16223f]/80 py-3 pl-11 pr-4 text-sm text-white placeholder:text-[#7484a1] focus:outline-none focus:ring-2 focus:ring-[#20c5ff]/60"
                  />
                  {isSearching && (
                      <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                          className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 border-[#20c5ff] border-t-transparent"
                      />
                  )}
                </div>

                {searchResults.length > 0 ? (
                    <motion.div
                        variants={listMotion}
                        initial="initial"
                        animate="animate"
                        className="space-y-3"
                    >
                      <p className="text-xs text-[#7484a1]">{searchResults.length} users found</p>
                      {searchResults.map((user) => (
                          <SearchResultCard
                              key={user.id}
                              user={user}
                              variants={cardMotion}
                              onAddFriend={sendFriendRequest}
                              isFriend={friendIds.has(user.id)}
                              isPending={pendingIds.has(user.id)}
                              isSendingRequest={isSendingFriendRequest}
                              sendingToUserId={sendingFriendRequestTo}
                          />
                      ))}
                    </motion.div>
                ) : searchQuery.length >= 2 && !isSearching ? (
                    <EmptyState
                        icon={<SearchIcon size={56} className="text-white/30" />}
                        title="No users found"
                        description="Try a different username or check the spelling."
                        reducedMotion={prefersReducedMotion}
                    />
                ) : (
                    <div className="space-y-6">
                      <div>
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-white">People you may know</h3>
                          <span className="text-xs text-[#7484a1]">Based on recent activity</span>
                        </div>
                        {suggestedFriends.length > 0 ? (
                            <motion.div
                                variants={listMotion}
                                initial="initial"
                                animate="animate"
                                className="space-y-3"
                            >
                              {suggestedFriends.map((user) => (
                                  <SuggestedCard
                                      key={user.id}
                                      user={user}
                                      variants={cardMotion}
                                      onAdd={sendFriendRequest}
                                  />
                              ))}
                            </motion.div>
                        ) : (
                            <EmptyState
                                icon={<SparklesIcon size={56} className="text-white/30" />}
                                title="No suggestions yet"
                                description="Play more matches to unlock friend suggestions."
                                reducedMotion={prefersReducedMotion}
                            />
                        )}
                      </div>

                      <div className="rounded-2xl border border-[#20c5ff]/30 bg-gradient-to-r from-[#20c5ff]/15 to-[#8B5CF6]/10 p-4 shadow-[0_10px_24px_rgba(0,217,255,0.2)]">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-[#20c5ff]/80">Invite code</p>
                            <p className="mt-1 text-lg font-semibold text-white">{inviteCode}</p>
                          </div>
                          <button
                              onClick={handleCopyInvite}
                              className="rounded-full bg-[#20c5ff] px-4 py-2 text-xs font-semibold text-[#0b1020] shadow-[0_8px_16px_rgba(0,217,255,0.35)] transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20c5ff]/70"
                          >
                            {inviteCopied ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    </div>
                )}
              </div>
          )}

          {currentTab === 'blocked' && (
              <div className="space-y-4">
                {isLoading ? (
                    <div className="space-y-3">
                      <SkeletonBlock className="h-20" reducedMotion={prefersReducedMotion} />
                      <SkeletonBlock className="h-20" reducedMotion={prefersReducedMotion} />
                    </div>
                ) : blockedUsers.length > 0 ? (
                    <motion.div
                        variants={listMotion}
                        initial="initial"
                        animate="animate"
                        className="space-y-3"
                    >
                      {blockedUsers.map((user) => (
                          <BlockedCard
                              key={user.id}
                              user={user}
                              variants={cardMotion}
                              onUnblock={setUnblockTarget}
                          />
                      ))}
                    </motion.div>
                ) : (
                    <EmptyState
                        icon={<ShieldCheckIcon size={56} className="text-white/30" />}
                        title="No blocked users"
                        description="Your block list is empty."
                        reducedMotion={prefersReducedMotion}
                    />
                )}
              </div>
          )}
        </div>
        <AnimatePresence>
          {optionsFriend && (
              <motion.div
                  className="fixed inset-0 z-40 flex items-center justify-center px-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  role="presentation"
              >
                <motion.div
                    className="absolute inset-0 bg-black/60"
                    onClick={() => setOptionsFriend(null)}
                    aria-hidden="true"
                />
                <motion.div
                    ref={optionsDialogRef}
                    tabIndex={-1}
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Actions for ${optionsFriend.displayName}`}
                    initial={{ scale: 0.96, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.96, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                    className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-[#14182e] px-6 pb-8 pt-5 shadow-[0_20px_40px_rgba(0,0,0,0.45)]"
                >
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Avatar
                          src={optionsFriend.avatarUrl}
                          name={optionsFriend.displayName}
                          size="lg"
                      />
                      <div>
                        <p className="name-text max-w-[220px] text-base font-semibold text-white">{optionsFriend.displayName}</p>
                        <p className="text-xs text-[#7484a1]">{optionsFriend.mmr} MMR</p>
                      </div>
                    </div>
                    <button
                      ref={optionsCloseButtonRef}
                      type="button"
                      onClick={() => setOptionsFriend(null)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                      aria-label="Close"
                    >
                      <CloseIcon size={18} />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <button
                        type="button"
                        onClick={() => {
                          void removeFriend(optionsFriend.id);
                          setOptionsFriend(null);
                        }}
                        className={cn(
                            'group flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3',
                            'text-left text-sm font-semibold text-white/90 shadow-[0_12px_24px_rgba(0,0,0,0.25)]',
                            'transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/10'
                        )}
                    >
                      <span>Remove friend</span>
                      <span className="text-xs text-white/50 transition-colors group-hover:text-white/70">
                        Stops seeing each other
                      </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                          void blockUser(optionsFriend.id);
                          setOptionsFriend(null);
                        }}
                        className={cn(
                            'group flex w-full items-center justify-between rounded-2xl border border-[#EF4444]/30',
                            'bg-gradient-to-r from-[#2a1111] via-[#2a1111] to-[#3a1414]',
                            'px-4 py-3 text-left text-sm font-semibold text-[#FF6B6B]',
                            'shadow-[0_12px_24px_rgba(239,68,68,0.15)] transition-all',
                            'hover:-translate-y-0.5 hover:border-[#EF4444]/50 hover:brightness-110'
                        )}
                    >
                      <span>Block user</span>
                      <span className="text-xs text-[#FFB3B3]/70 transition-colors group-hover:text-[#FFD6D6]">
                        Prevents contact
                      </span>
                    </button>
                  </div>
                </motion.div>
              </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {challengeTarget && (
            <ChallengeFriendDialog
              key={challengeTarget.id}
              target={challengeTarget}
              categories={categories}
              isLoadingCategories={categoriesLoading}
              preferredTopicId={preferredChallengeTopicId}
              onClose={() => setChallengeTarget(null)}
              onSubmit={handleSendChallenge}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {unblockTarget && (
              <motion.div
                  className="fixed inset-0 z-50 flex items-center justify-center px-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  role="presentation"
              >
                <motion.div
                    className="absolute inset-0 bg-black/60"
                    onClick={() => setUnblockTarget(null)}
                    aria-hidden="true"
                />
                <motion.div
                    ref={unblockDialogRef}
                    tabIndex={-1}
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Unblock ${unblockTarget.displayName}`}
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                    className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-[#14182e] p-6 text-center shadow-[0_20px_40px_rgba(0,0,0,0.45)]"
                >
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#EF4444]/15 text-[#EF4444]">
                    <ShieldIcon size={22} />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-white">Unblock user</h3>
                  <p className="mt-2 text-sm text-[#7484a1]">
                    {unblockTarget.displayName} will be able to interact with you again.
                  </p>
                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                        ref={unblockCancelButtonRef}
                        type="button"
                        onClick={() => setUnblockTarget(null)}
                        className="rounded-full border border-white/10 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/10"
                    >
                      Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                          void unblockUser(unblockTarget.id);
                          setUnblockTarget(null);
                        }}
                        className="rounded-full bg-[#EF4444] py-2 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(239,68,68,0.3)]"
                    >
                      Unblock
                    </button>
                  </div>
                </motion.div>
              </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
  );
}
