// Friends Store - Social features for Beneficial Knowledge
import { create } from 'zustand';
import nakama, { type PresenceUpdate, type ChallengeNotification } from '../shared/lib/nakama';
import { notifyIfAllowed } from '../lib/notifications';
import { useSettingsStore } from './settingsStore';
import { useGameStore } from './gameStore';
import { useCategoryStore } from './categoryStore';
import { useNotificationStore } from './notificationStore';
import type { ChallengeFriendResult } from '../shared/types/challenge';

export interface Friend {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  online: boolean;
  lastActiveAt?: number;
  mmr: number;
  rankTier: string;
}

export interface BlockedUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  blockedAt: number;
}

export interface FriendRequest {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  sentAt: number;
  type: 'incoming' | 'outgoing';
}

export interface ActivityItem {
  id: string;
  userId: string;
  username: string;
  avatarUrl?: string;
  type: 'match_win' | 'rank_up' | 'streak';
  description: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

type FriendsTab = 'friends' | 'requests' | 'add' | 'blocked';

interface FriendsState {
  // State
  currentTab: FriendsTab;
  friends: Friend[];
  blockedUsers: BlockedUser[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  activityFeed: ActivityItem[];
  searchResults: Friend[];
  searchQuery: string;
  isLoading: boolean;
  isSearching: boolean;
  isSendingFriendRequest: boolean;
  sendingFriendRequestTo: string | null;
  searchRequestId: number;
  error: string | null;

  // Challenge state (incoming)
  pendingChallenge: ChallengeNotification | null;
  challengeTimeout: ReturnType<typeof setTimeout> | null;
  isAcceptingChallenge: boolean;

  // Challenge state (outgoing) - for button disable safety
  hasPendingOutgoingChallenge: boolean;
  outgoingChallengeTargetId: string | null;
  outgoingChallengeTimeout: ReturnType<typeof setTimeout> | null;

  // Cooldown state - for rematch cooldown display
  cooldownEndTime: number | null;
  cooldownTargetId: string | null;
  cooldownInterval: ReturnType<typeof setInterval> | null;
  cooldownRemainingSeconds: number | null;

  // Presence subscription status
  isPresenceSubscribed: boolean;

  // Actions
  setTab: (tab: FriendsTab) => void;
  fetchFriends: () => Promise<void>;
  fetchRequests: () => Promise<void>;
  fetchActivityFeed: () => Promise<void>;
  fetchBlockedUsers: () => Promise<void>;
  searchUsers: (query: string) => Promise<void>;
  sendFriendRequest: (userId: string) => Promise<void>;
  acceptRequest: (userId: string) => Promise<void>;
  rejectRequest: (userId: string) => Promise<void>;
  removeFriend: (userId: string) => Promise<void>;
  challengeFriend: (userId: string, category?: string) => Promise<ChallengeFriendResult>;
  blockUser: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;

  // Presence
  subscribeToPresence: () => void;
  unsubscribeFromPresence: () => void;
  handlePresenceUpdate: (updates: PresenceUpdate[]) => void;

  // Challenges
  handleIncomingChallenge: (challenge: ChallengeNotification) => void;
  acceptChallenge: () => Promise<string | null>;
  declineChallenge: () => Promise<void>;
  clearPendingChallenge: () => void;

  clearSearch: () => void;
  clearError: () => void;
  cleanup: () => void;
}

export const useFriendsStore = create<FriendsState>((set, get) => ({
  // Initial state
  currentTab: 'friends',
  friends: [],
  blockedUsers: [],
  incomingRequests: [],
  outgoingRequests: [],
  activityFeed: [],
  searchResults: [],
  searchQuery: '',
  isLoading: false,
  isSearching: false,
  isSendingFriendRequest: false,
  sendingFriendRequestTo: null,
  searchRequestId: 0,
  error: null,
  pendingChallenge: null,
  challengeTimeout: null,
  isAcceptingChallenge: false,
  hasPendingOutgoingChallenge: false,
  outgoingChallengeTargetId: null,
  outgoingChallengeTimeout: null,
  cooldownEndTime: null,
  cooldownTargetId: null,
  cooldownInterval: null,
  cooldownRemainingSeconds: null,
  isPresenceSubscribed: false,

  // Actions
  setTab: (tab: FriendsTab) => {
    set({ currentTab: tab });
    if (tab === 'friends') {
      get().fetchFriends();
    }
  },

  fetchFriends: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await nakama.rpc<{
        friends: Array<{
          userId: string;
          username: string;
          displayName: string;
          avatarUrl?: string;
          online: boolean;
          lastActiveAt?: number;
          mmr: number;
          rankTier: string;
        }>;
      }>('get_friends', {});

      const previousFriends = get().friends;
      const friends: Friend[] = (data.friends || []).map(f => ({
        id: f.userId,
        username: f.username,
        displayName: f.displayName || f.username,
        avatarUrl: f.avatarUrl,
        online: f.online,
        lastActiveAt: f.lastActiveAt,
        mmr: f.mmr || 1000,
        rankTier: f.rankTier || 'bronze',
      }));

      // Sort: online first, then by MMR
      friends.sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        return b.mmr - a.mmr;
      });

      set({ friends, isLoading: false });

      const { isPresenceSubscribed } = get();
      if (isPresenceSubscribed) {
        const previousIds = new Set(previousFriends.map(f => f.id));
        const nextIds = new Set(friends.map(f => f.id));
        const toFollow: string[] = [];
        const toUnfollow: string[] = [];

        nextIds.forEach((id) => {
          if (!previousIds.has(id)) toFollow.push(id);
        });
        previousIds.forEach((id) => {
          if (!nextIds.has(id)) toUnfollow.push(id);
        });

        if (toFollow.length > 0) {
          nakama.followUsers(toFollow).catch(console.error);
        }
        if (toUnfollow.length > 0) {
          nakama.unfollowUsers(toUnfollow).catch(console.error);
        }
      }
    } catch (error) {
      console.error('Error fetching friends:', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch friends',
      });
    }
  },

  fetchRequests: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await nakama.rpc<{
        incoming: Array<{
          userId: string;
          username: string;
          displayName: string;
          avatarUrl?: string;
          sentAt: number;
        }>;
        outgoing: Array<{
          userId: string;
          username: string;
          displayName: string;
          avatarUrl?: string;
          sentAt: number;
        }>;
      }>('get_friend_requests', {});

      const incomingRequests: FriendRequest[] = (data.incoming || []).map(r => ({
        id: `in_${r.userId}`,
        userId: r.userId,
        username: r.username,
        displayName: r.displayName || r.username,
        avatarUrl: r.avatarUrl,
        sentAt: r.sentAt,
        type: 'incoming',
      }));

      const outgoingRequests: FriendRequest[] = (data.outgoing || []).map(r => ({
        id: `out_${r.userId}`,
        userId: r.userId,
        username: r.username,
        displayName: r.displayName || r.username,
        avatarUrl: r.avatarUrl,
        sentAt: r.sentAt,
        type: 'outgoing',
      }));

      set({ incomingRequests, outgoingRequests, isLoading: false });
    } catch (error) {
      console.error('Error fetching friend requests:', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch requests',
      });
    }
  },

  fetchActivityFeed: async () => {
    try {
      const data = await nakama.rpc<{
        activities: Array<{
          id: string;
          userId: string;
          username: string;
          avatarUrl?: string;
          type: 'match_win' | 'rank_up' | 'streak';
          description: string;
          timestamp: number;
          metadata?: Record<string, unknown>;
        }>;
      }>('get_friend_activity', {});

      const activityFeed: ActivityItem[] = (data.activities || []).map(a => ({
        id: a.id,
        userId: a.userId,
        username: a.username,
        avatarUrl: a.avatarUrl,
        type: a.type,
        description: a.description,
        timestamp: a.timestamp,
        metadata: a.metadata,
      }));

      set({ activityFeed });
    } catch (error) {
      console.error('Error fetching activity feed:', error);
    }
  },

  searchUsers: async (query: string) => {
    if (query.length < 2) {
      set({ searchResults: [], searchQuery: query, isSearching: false });
      return;
    }

    const requestId = get().searchRequestId + 1;
    set({ isSearching: true, searchQuery: query, searchRequestId: requestId });
    try {
      const data = await nakama.rpc<{
        users: Array<{
          id?: string;
          userId?: string;
          username: string;
          displayName: string;
          avatarUrl?: string;
          mmr: number;
          rankTier: string;
        }>;
      }>('search_users', { query });

      const searchResults: Friend[] = (data.users || []).flatMap((u) => {
        const resolvedId = u.userId || u.id;
        if (!resolvedId) return [];
        const result: Friend = {
          id: resolvedId,
          username: u.username,
          displayName: u.displayName || u.username,
          online: false,
          mmr: u.mmr || 1000,
          rankTier: u.rankTier || 'bronze',
          ...(u.avatarUrl ? { avatarUrl: u.avatarUrl } : {}),
        };
        return [result];
      });

      if (get().searchRequestId !== requestId) {
        return;
      }

      set({ searchResults, isSearching: false });
    } catch (error) {
      console.error('Error searching users:', error);
      if (get().searchRequestId !== requestId) {
        return;
      }
      const errorMessage = error instanceof Error ? error.message : 'Failed to search users';
      set({ isSearching: false, searchResults: [], error: errorMessage });
    }
  },

  sendFriendRequest: async (userId: string) => {
    const { friends, incomingRequests, outgoingRequests, isSendingFriendRequest } = get();

    // Prevent duplicate requests if already sending
    if (isSendingFriendRequest) return;

    const isFriend = friends.some(f => f.id === userId);
    const isPending = incomingRequests.some(r => r.userId === userId) ||
      outgoingRequests.some(r => r.userId === userId);
    if (isFriend || isPending) return;

    set({ isSendingFriendRequest: true, sendingFriendRequestTo: userId });

    try {
      await nakama.rpc('send_friend_request', { userId });
      const { searchResults } = get();
      const matched = searchResults.find(u => u.id === userId);
      if (matched) {
        const newRequest: FriendRequest = {
          id: `out_${userId}`,
          userId,
          username: matched.username,
          displayName: matched.displayName || matched.username,
          avatarUrl: matched.avatarUrl,
          sentAt: Date.now(),
          type: 'outgoing',
        };
        set((state) => ({
          outgoingRequests: [
            newRequest,
            ...state.outgoingRequests.filter(r => r.userId !== userId),
          ],
          isSendingFriendRequest: false,
          sendingFriendRequestTo: null,
        }));
      } else {
        set({ isSendingFriendRequest: false, sendingFriendRequestTo: null });
        get().fetchRequests();
      }
    } catch (error) {
      console.error('Error sending friend request:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to send request';
      // Provide user-friendly error messages based on server response
      let friendlyMessage = errorMessage;
      if (errorMessage.toLowerCase().includes('block')) {
        friendlyMessage = 'Cannot send request - you may be blocked by this user';
      } else if (errorMessage.toLowerCase().includes('yourself')) {
        friendlyMessage = 'You cannot add yourself as a friend';
      } else if (errorMessage.toLowerCase().includes('not found')) {
        friendlyMessage = 'User not found';
      }
      set({ error: friendlyMessage, isSendingFriendRequest: false, sendingFriendRequestTo: null });
    }
  },

  acceptRequest: async (userId: string) => {
    try {
      // Get request info BEFORE the RPC call for optimistic update
      const { incomingRequests } = get();
      const request = incomingRequests.find(r => r.userId === userId);

      await nakama.rpc('accept_friend_request', { userId });

      // Optimistically add to friends list immediately so user sees feedback
      if (request) {
        const newFriend: Friend = {
          id: request.userId,
          username: request.username,
          displayName: request.displayName,
          avatarUrl: request.avatarUrl,
          online: false,  // Will be updated by presence subscription
          mmr: 1000,      // Default, will be updated by fetchFriends
          rankTier: 'bronze',
        };
        set((state) => ({
          friends: [...state.friends, newFriend].sort((a, b) => {
            if (a.online !== b.online) return a.online ? -1 : 1;
            return b.mmr - a.mmr;
          }),
          incomingRequests: state.incomingRequests.filter(r => r.userId !== userId),
        }));

        // Follow new friend for presence updates if subscribed
        const { isPresenceSubscribed } = get();
        if (isPresenceSubscribed) {
          nakama.followUsers([userId]).catch(console.error);
        }
      } else {
        // Fallback: just remove from incoming requests
        set({
          incomingRequests: get().incomingRequests.filter(r => r.userId !== userId),
        });
      }

      // Background refresh to get accurate MMR/rank data (non-blocking)
      get().fetchFriends();
    } catch (error) {
      console.error('Error accepting friend request:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to accept request';
      let friendlyMessage = errorMessage;
      if (errorMessage.toLowerCase().includes('block')) {
        friendlyMessage = 'Cannot accept - you may be blocked by this user';
      } else if (errorMessage.toLowerCase().includes('no pending')) {
        friendlyMessage = 'Friend request no longer exists';
      }
      set({ error: friendlyMessage });
    }
  },

  rejectRequest: async (userId: string) => {
    try {
      await nakama.rpc('reject_friend_request', { userId });
      set({
        incomingRequests: get().incomingRequests.filter(r => r.userId !== userId),
        outgoingRequests: get().outgoingRequests.filter(r => r.userId !== userId),
      });
    } catch (error) {
      console.error('Error rejecting friend request:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to reject request',
      });
    }
  },

  removeFriend: async (userId: string) => {
    try {
      await nakama.rpc('remove_friend', { userId });
      set({
        friends: get().friends.filter(f => f.id !== userId),
      });
      try {
        await nakama.unfollowUsers([userId]);
      } catch {
        // Ignore unfollow errors
      }
    } catch (error) {
      console.error('Error removing friend:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to remove friend',
      });
    }
  },

  challengeFriend: async (userId: string, category?: string) => {
    const state = get();

    // Safety: Block if already have pending outgoing challenge
    if (state.hasPendingOutgoingChallenge) {
      const message = 'You already have a pending challenge. Please wait for response or timeout.';
      set({ error: message });
      return { ok: false, message };
    }

    // Safety: Block if in cooldown for this user
    if (state.cooldownEndTime && state.cooldownTargetId === userId && Date.now() < state.cooldownEndTime) {
      const remainingSeconds = Math.ceil((state.cooldownEndTime - Date.now()) / 1000);
      const message = `Please wait ${remainingSeconds}s before challenging again`;
      set({ error: message });
      return { ok: false, message };
    }

    // Clear any existing timeout
    if (state.outgoingChallengeTimeout) {
      clearTimeout(state.outgoingChallengeTimeout);
    }

    // Set pending state immediately to block button
    set({
      hasPendingOutgoingChallenge: true,
      outgoingChallengeTargetId: userId,
      error: null,
    });

    try {
      const gameState = useGameStore.getState();
      const queuedCategory = gameState.queueAllInCategory ? '' : (gameState.queueSubcategories[0] || '');
      const gameCategory = queuedCategory || gameState.matchCategory;
      const requestedCategory = typeof category === 'string' && category.trim()
        ? category.trim()
        : (gameCategory || '');
      const payload = requestedCategory ? { userId, category: requestedCategory } : { userId };

      await nakama.rpc('challenge_friend', payload);

      // Set timeout to auto-clear after 60 seconds (challenge expiry)
      const timeout = setTimeout(() => {
        set({
          hasPendingOutgoingChallenge: false,
          outgoingChallengeTargetId: null,
          outgoingChallengeTimeout: null,
        });
      }, 60000);

      set({ outgoingChallengeTimeout: timeout });
      return { ok: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send challenge';
      console.error('Error challenging friend:', error);

      // Check if it's a cooldown error (format: "Error: COOLDOWN:XX" or "COOLDOWN:XX" where XX is seconds)
      const cooldownMatch = errorMessage.match(/COOLDOWN:(\d+)/);
      if (cooldownMatch) {
        const remainingSeconds = parseInt(cooldownMatch[1], 10) || 30;
        const cooldownEndTime = Date.now() + remainingSeconds * 1000;

        // Clear any existing cooldown interval
        if (state.cooldownInterval) {
          clearInterval(state.cooldownInterval);
        }

        set({
          hasPendingOutgoingChallenge: false,
          outgoingChallengeTargetId: null,
          outgoingChallengeTimeout: null,
          cooldownEndTime: cooldownEndTime,
          cooldownTargetId: userId,
          cooldownRemainingSeconds: remainingSeconds,
          error: null, // Don't show error - the button will show countdown
        });

        const updateCooldown = () => {
          if (Date.now() >= cooldownEndTime) {
            clearInterval(interval);
            set({
              cooldownEndTime: null,
              cooldownTargetId: null,
              cooldownInterval: null,
              cooldownRemainingSeconds: null,
            });
            return;
          }
          const nextRemaining = Math.max(0, Math.ceil((cooldownEndTime - Date.now()) / 1000));
          set({ cooldownRemainingSeconds: nextRemaining });
        };

        const interval = setInterval(updateCooldown, 1000);
        updateCooldown();
        set({ cooldownInterval: interval });
        return {
          ok: false,
          message: `Please wait ${remainingSeconds}s before challenging again`,
        };
      } else {
        // Regular error
        set({
          hasPendingOutgoingChallenge: false,
          outgoingChallengeTargetId: null,
          outgoingChallengeTimeout: null,
          error: errorMessage,
        });
        return { ok: false, message: errorMessage };
      }
    }
  },

  // Block/Unblock users
  fetchBlockedUsers: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await nakama.rpc<{
        blockedUsers: Array<{
          userId: string;
          username: string;
          displayName: string;
          blockedAt: number;
        }>;
      }>('get_blocked_users', {});

      const blockedUsers: BlockedUser[] = (data.blockedUsers || []).map(u => ({
        id: u.userId,
        username: u.username,
        displayName: u.displayName || u.username,
        blockedAt: u.blockedAt,
      }));

      set({ blockedUsers, isLoading: false });
    } catch (error) {
      console.error('Error fetching blocked users:', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch blocked users',
      });
    }
  },

  blockUser: async (userId: string) => {
    try {
      await nakama.rpc('block_user', { userId });
      const { friends, searchResults } = get();
      const knownUser = friends.find(f => f.id === userId) ||
        searchResults.find(u => u.id === userId);
      const blockedEntry = knownUser ? {
        id: userId,
        username: knownUser.username,
        displayName: knownUser.displayName || knownUser.username,
        avatarUrl: knownUser.avatarUrl,
        blockedAt: Date.now(),
      } : null;

      set((state) => ({
        friends: state.friends.filter(f => f.id !== userId),
        incomingRequests: state.incomingRequests.filter(r => r.userId !== userId),
        outgoingRequests: state.outgoingRequests.filter(r => r.userId !== userId),
        blockedUsers: blockedEntry
          ? [
              blockedEntry,
              ...state.blockedUsers.filter(u => u.id !== userId),
            ]
          : state.blockedUsers,
      }));
      // Unfollow for presence
      try {
        await nakama.unfollowUsers([userId]);
      } catch {
        // Ignore unfollow errors
      }
    } catch (error) {
      console.error('Error blocking user:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to block user';
      let friendlyMessage = errorMessage;
      if (errorMessage.toLowerCase().includes('yourself')) {
        friendlyMessage = 'You cannot block yourself';
      } else if (errorMessage.toLowerCase().includes('not found')) {
        friendlyMessage = 'User not found';
      }
      set({ error: friendlyMessage });
    }
  },

  unblockUser: async (userId: string) => {
    try {
      await nakama.rpc('unblock_user', { userId });
      set({
        blockedUsers: get().blockedUsers.filter(u => u.id !== userId),
      });
    } catch (error) {
      console.error('Error unblocking user:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to unblock user',
      });
    }
  },

  // Presence management
  subscribeToPresence: () => {
    const { friends, isPresenceSubscribed } = get();
    if (isPresenceSubscribed) return;

    // Set flag IMMEDIATELY to prevent race condition with concurrent calls
    set({ isPresenceSubscribed: true });

    // Set up social callbacks
    nakama.setSocialEventCallbacks({
      onPresenceUpdate: (updates) => {
        get().handlePresenceUpdate(updates);
      },
      onChallenge: (challenge) => {
        get().handleIncomingChallenge(challenge);
      },
      onChallengeAccepted: async (data) => {
        // When our challenge is accepted by the other player, join the match
        // Clear pending outgoing challenge state
        const state = get();
        if (state.outgoingChallengeTimeout) {
          clearTimeout(state.outgoingChallengeTimeout);
        }
        set({
          hasPendingOutgoingChallenge: false,
          outgoingChallengeTargetId: null,
          outgoingChallengeTimeout: null,
        });

        if (!data.matchId) {
          return;
        }

        const gameStore = useGameStore.getState();

        // Prevent duplicate joins
        if (gameStore.matchId === data.matchId) {
          return;
        }

        // Check game state - don't join if already in a game
        if (!['idle', 'selecting'].includes(gameStore.phase)) {
          return;
        }

        try {
          await gameStore.joinDirectMatch(data.matchId);
        } catch {
          useGameStore.setState({
            phase: 'error',
            error: 'Failed to join challenge match',
            matchJoinInProgress: false,
          });
        }
      },
      onChallengeDeclined: (data) => {
        void data;
        // When our challenge is declined by the other player
        // Clear pending outgoing challenge state
        const state = get();
        if (state.outgoingChallengeTimeout) {
          clearTimeout(state.outgoingChallengeTimeout);
        }
        set({
          hasPendingOutgoingChallenge: false,
          outgoingChallengeTargetId: null,
          outgoingChallengeTimeout: null,
        });
      },
      onChallengeExpired: (data) => {
        void data;
        // When our challenge expired (timeout)
        // Clear pending outgoing challenge state
        const state = get();
        if (state.outgoingChallengeTimeout) {
          clearTimeout(state.outgoingChallengeTimeout);
        }
        set({
          hasPendingOutgoingChallenge: false,
          outgoingChallengeTargetId: null,
          outgoingChallengeTimeout: null,
        });
      },
    });

    // Follow all friends for presence updates
    const friendIds = friends.map(f => f.id);
    if (friendIds.length > 0) {
      nakama.followUsers(friendIds).catch(console.error);
    }
    // Note: isPresenceSubscribed already set at start to prevent race conditions
  },

  unsubscribeFromPresence: () => {
    const { friends, isPresenceSubscribed } = get();
    if (!isPresenceSubscribed) return;

    // Clear only friends/presence callbacks without affecting other listeners (e.g. notifications).
    nakama.setSocialEventCallbacks({
      onPresenceUpdate: undefined,
      onChallenge: undefined,
      onChallengeAccepted: undefined,
      onChallengeDeclined: undefined,
      onChallengeExpired: undefined,
    });

    // Unfollow all friends
    const friendIds = friends.map(f => f.id);
    if (friendIds.length > 0) {
      nakama.unfollowUsers(friendIds).catch(console.error);
    }

    set({ isPresenceSubscribed: false });
  },

  handlePresenceUpdate: (updates: PresenceUpdate[]) => {
    set((state) => {
      const updatedFriends = [...state.friends];

      for (const update of updates) {
        const friendIndex = updatedFriends.findIndex(f => f.id === update.userId);
        if (friendIndex !== -1) {
          updatedFriends[friendIndex] = {
            ...updatedFriends[friendIndex],
            online: update.online,
            // Update lastActiveAt when going offline (that's when they were last active)
            // Keep current time for online users too for consistency
            lastActiveAt: Date.now(),
          };
        }
      }

      // Re-sort: online first, then by MMR
      updatedFriends.sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        return b.mmr - a.mmr;
      });

      return { friends: updatedFriends };
    });
  },

  // Challenge handling
  handleIncomingChallenge: (challenge: ChallengeNotification) => {
    const { settings } = useSettingsStore.getState();
    if (!settings.challengeNotification) return;
    // Safety: Auto-decline if user is busy (in a game)
    const gamePhase = useGameStore.getState().phase;
    // Safety: Check if already have a pending incoming challenge (queue - ignore new)
    const { pendingChallenge, challengeTimeout } = get();
    const canShowModal = ['idle', 'selecting', 'ended'].includes(gamePhase) && !pendingChallenge;

    const categoryLabel = challenge.category
      ? (useCategoryStore.getState().categories.find((cat) => cat.id === challenge.category)?.name || challenge.category)
      : '';

    // Always try OS notification when hidden
    notifyIfAllowed('New challenge', {
      body: categoryLabel ? `Category: ${categoryLabel}` : 'Open the app to respond.',
      tag: `challenge-${challenge.challengeId}`,
      onlyWhenHidden: true,
    });

    if (!canShowModal) {
      if (typeof document !== 'undefined' && !document.hidden) {
        useNotificationStore.getState().addToast({
          type: 'friend_challenge',
          title: 'New challenge',
          body: categoryLabel ? `Category: ${categoryLabel}` : 'Open the app to respond.',
          icon: String.fromCodePoint(0x1F3AF),
          duration: 5000,
        });
      }
      return;
    }

    // Clear any existing timeout (shouldn't happen with above check, but be safe)
    if (challengeTimeout) {
      clearTimeout(challengeTimeout);
    }

    // Set timeout for challenge expiry with bounds checking for clock drift
    const timeUntilExpiry = challenge.expiresAt - Date.now();
    // Clamp between 1 second and 2 minutes (reasonable bounds for challenge expiry)
    const MIN_TIMEOUT_MS = 1000;
    const MAX_TIMEOUT_MS = 120000;
    const clampedTimeout = Math.max(MIN_TIMEOUT_MS, Math.min(timeUntilExpiry, MAX_TIMEOUT_MS));

    const timeout = setTimeout(() => {
      get().clearPendingChallenge();
    }, clampedTimeout);

    set({
      pendingChallenge: challenge,
      challengeTimeout: timeout,
    });
  },

  acceptChallenge: async () => {
    const { pendingChallenge, challengeTimeout, isAcceptingChallenge } = get();
    // Prevent double-acceptance race condition
    if (!pendingChallenge || isAcceptingChallenge) return null;

    // Set flag immediately to prevent concurrent calls
    set({ isAcceptingChallenge: true });

    try {
      const result = await nakama.acceptChallenge(pendingChallenge.challengeId);

      if (result.success === false) {
        const reasonMessage = result.reason === 'auto_declined_busy'
          ? 'You are already in a match. Finish it before accepting challenges.'
          : 'Challenge could not be accepted. Please try again.';
        throw new Error(reasonMessage);
      }

      if (!result.matchId) {
        throw new Error('Failed to accept challenge');
      }

      // Clear timeout and challenge
      if (challengeTimeout) {
        clearTimeout(challengeTimeout);
      }
      set({ pendingChallenge: null, challengeTimeout: null, isAcceptingChallenge: false });

      return result.matchId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to accept challenge';
      console.error('Error accepting challenge:', error);
      const shouldClear =
        message.toLowerCase().includes('challenge not found') ||
        message.toLowerCase().includes('no longer pending') ||
        message.toLowerCase().includes('expired') ||
        message.toLowerCase().includes('declined');
      if (shouldClear) {
        if (challengeTimeout) {
          clearTimeout(challengeTimeout);
        }
        const lowered = message.toLowerCase();
        const toastMessage = lowered.includes('declined')
          ? 'This challenge was declined.'
          : lowered.includes('expired')
            ? 'This challenge expired.'
            : 'This challenge is no longer available.';
        useNotificationStore.getState().addToast({
          type: 'friend_challenge',
          title: 'Challenge ended',
          body: toastMessage,
          duration: 4000,
        });
        set({
          pendingChallenge: null,
          challengeTimeout: null,
          error: null,
          isAcceptingChallenge: false,
        });
        return null;
      }
      set({
        error: message,
        isAcceptingChallenge: false,
      });
      return null;
    }
  },

  declineChallenge: async () => {
    const { pendingChallenge, challengeTimeout } = get();
    if (!pendingChallenge) return;

    try {
      await nakama.declineChallenge(pendingChallenge.challengeId);
    } catch (error) {
      console.error('Error declining challenge:', error);
    } finally {
      // Clear timeout and challenge
      if (challengeTimeout) {
        clearTimeout(challengeTimeout);
      }
      set({ pendingChallenge: null, challengeTimeout: null });
    }
  },

  clearPendingChallenge: () => {
    const { challengeTimeout } = get();
    if (challengeTimeout) {
      clearTimeout(challengeTimeout);
    }
    set({ pendingChallenge: null, challengeTimeout: null });
  },

  clearSearch: () => {
    set({ searchResults: [], searchQuery: '', isSearching: false });
  },

  clearError: () => {
    set({ error: null });
  },

  cleanup: () => {
    const state = get();

    // Clear challenge timeout
    if (state.challengeTimeout) {
      clearTimeout(state.challengeTimeout);
    }

    // Clear outgoing challenge timeout
    if (state.outgoingChallengeTimeout) {
      clearTimeout(state.outgoingChallengeTimeout);
    }

    // Clear cooldown interval
    if (state.cooldownInterval) {
      clearInterval(state.cooldownInterval);
    }

    // Reset all timeout/interval state
    set({
      challengeTimeout: null,
      outgoingChallengeTimeout: null,
      cooldownInterval: null,
      pendingChallenge: null,
      hasPendingOutgoingChallenge: false,
      outgoingChallengeTargetId: null,
      cooldownEndTime: null,
      cooldownTargetId: null,
      cooldownRemainingSeconds: null,
    });
  },
}));

export default useFriendsStore;
