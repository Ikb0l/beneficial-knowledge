# Tournament Pro-Ready Specification

## Overview

This document is the complete specification to transform the tournament system from its current state into a production-ready, QuizUp/Trivia Royale-quality experience. Every change is described with exact file paths, current behavior, target behavior, and implementation guidance.

---

## PART 1: BUG FIXES (Already Applied Locally)

### 1.1 Bracket Seeding Algorithm Was Broken
- **File:** `server/src/features/tournaments.ts` — function `getSeededPairings()`
- **Bug:** Seeds 1 and 2 were placed on the same half of the bracket for all sizes ≥ 8. They met in round 2 instead of the finals.
- **Fix:** Replaced with recursive "perfect bracket" algorithm (`seedOrder` function). Seeds 1 and 2 now always land on opposite halves.
- **Status:** ✅ Fixed locally, deployed to production at `/opt/your-app/`

### 1.2 Grand Final Reset Prematurely Completed Tournament
- **File:** `server/src/main/tournament-advance.ts` — function `runInitialTournamentProgressionPass()`
- **Bug:** Recovery check found first grand final 'completed' and called `completeTournament()`, ignoring pending reset match (match_number=2).
- **Fix:** Added `pendingResetResult` query that checks for grand final matches with `match_number >= 2` and status `pending/ready/in_progress` before allowing completion.
- **Status:** ✅ Fixed locally, deployed to production.

### 1.3 Tournament Details API Missing winnerId and completedAt
- **File:** `server/src/features/tournaments.ts` — function `rpcGetTournamentDetails()`
- **Fix:** Added `winnerId` and `completedAt` fields to the tournament object in the API response.
- **Status:** ✅ Fixed locally, deployed to production.

### 1.4 Production Docker Compose CPU Limit Too High
- **File:** `docker/docker-compose.dev.yml`
- **Bug:** `cpus: '8'` failed on 4-core machines.
- **Fix:** Reduced to `cpus: '4'` and `memory: 4G`.
- **Status:** ✅ Fixed locally. Production compose was already at `cpus: '2'`.

---

## PART 2: TOURNAMENT LIST UX — Modeled After QuizUp/Trivia Royale

### 2.1 Tournament List Ordering (SERVER-SIDE)
**Current behavior:** Tournaments ordered by `t.tournament_start DESC` — newest first. Completed/cancelled tournaments dominate the first page. New users see dead tournaments before anything they can join.

**Target behavior:** Order by relevance to the user:
1. Tournaments the user can join NOW (`registration`, closest to closing first)
2. Tournaments starting soon (`upcoming`, closest to start first)
3. Tournaments in progress (`in_progress`, newest first)
4. Paused tournaments
5. Completed tournaments (user's tournaments first, then by most recently completed)
6. Cancelled tournaments (last)

**Implementation:**
- **File:** `server/src/features/tournaments.ts` — `rpcGetTournaments()` (line ~329)
- Change the `ORDER BY` clause to:
```sql
ORDER BY
  CASE
    WHEN t.status = 'registration' THEN 1
    WHEN t.status = 'upcoming' THEN 2
    WHEN t.status = 'in_progress' THEN 3
    WHEN t.status = 'paused' THEN 4
    WHEN t.status = 'completed' THEN 5
    WHEN t.status = 'cancelled' THEN 6
    ELSE 7
  END,
  CASE
    WHEN t.status = 'registration' THEN EXTRACT(EPOCH FROM t.registration_end)
    WHEN t.status = 'upcoming' THEN EXTRACT(EPOCH FROM t.tournament_start)
    WHEN t.status IN ('completed', 'cancelled') THEN EXTRACT(EPOCH FROM t.tournament_start) * -1
    ELSE EXTRACT(EPOCH FROM t.tournament_start) * -1
  END
```
- Same change for `rpcGetMyTournaments()` (line ~914)

### 2.2 Default Filter Should Be "Open + Upcoming" (CLIENT-SIDE)
**Current behavior:** Default filter is `''` (All). New users see everything mixed together.

**Target behavior:** Default tab/filter shows only joinable tournaments (registration + upcoming). User must explicitly click "Past" to see completed.

**Implementation:**
- **File:** `client/src/components/TournamentsScreen.tsx`
- Change `useState<TournamentFilterId>('')` to a new tab system:
```
Tabs: [Joinable] [Live] [My Tournaments] [Past]
```
- "Joinable" tab: filters to `registration` + `upcoming` statuses
- "Live" tab: `in_progress` + `paused`
- "My Tournaments": existing `showMyTournaments` toggle
- "Past": `completed` + `cancelled`
- Remove the horizontal scroll filter chips or move them to a secondary row under "Past"

### 2.3 Tournament Card Must Show Time Urgency
**Current behavior:** Shows start time and relative time text.

**Target behavior:** For `registration` tournaments, show "Registration closes in 45m" with a progress bar. For `upcoming`, show "Starts in 2h 15m". For `in_progress`, show "Round 3 of 7 — Live". Use color coding:
- Registration closing soon (< 1 hour): amber/warning color
- Starting soon (< 30 min): pulsing animation
- Live: green pulse dot

**Implementation:**
- **File:** `client/src/components/TournamentsScreen.tsx` — `TournamentListCard` component
- Add urgency banner based on status and time remaining
- Use `formatTournamentRelativeTime()` which already exists

### 2.4 Empty State Must Have Call-To-Action
**Current behavior:** Shows trophy emoji and "Turnirlar topilmadi" (No tournaments found) with generic subtitle.

**Target behavior:**
- If no joinable tournaments: "No open tournaments right now. The next one starts in 4 hours. Want us to notify you?"
- If no live tournaments: "No live matches right now. Check back when a tournament is in progress!"
- If no past tournaments: "You haven't played in any tournaments yet. Join one to get started!"
- Always include a button: [Browse All Tournaments] or [Get Notified]

**Implementation:**
- **File:** `client/src/components/TournamentsScreen.tsx` (lines ~556-568)
- Replace the single empty state with context-aware variants using the current filter

---

## PART 3: ERROR MESSAGES — Make Them Human-Readable

### 3.1 Registration Errors
**Current → Target:**

| Current Error | Target Error |
|---|---|
| `MMR (850) is outside the allowed range (1000-2000)` | `Your rank (Silver • 850) doesn't qualify for this tournament. Required: Gold (1000) to Diamond (2000). Keep playing to rank up!` |
| `Registration is not open` | `Registration for this tournament is closed. It opened on Jan 5 and closed on Jan 10.` OR `Registration hasn't started yet. Opens in 3 days.` |
| `Already registered for this tournament` | `You're already registered! Go to My Tournaments to see your status. Tournament starts in 2 hours.` |
| `Tournament is full` | `All 128 spots have been filled. 23 players are on the waitlist. The next tournament opens in 4 hours.` |
| `Tournament is not accepting registrations` | `This tournament has already started. You can watch live matches or join the next one.` |

**Implementation:**
- **File:** `server/src/features/tournaments.ts` — `rpcRegisterForTournament()` (lines ~654-832)
- Include contextual data in error messages: user's MMR, MMR range, rank names, time until registration opens/closes, time until tournament starts
- Add a helper function `formatMmrError(userMmr, minMmr, maxMmr)` that includes rank tier names
- **File:** `client/src/stores/tournamentStore.ts` — `registerForTournament()` (line ~392)
- Enhance the `actionError` to parse structured error info from the server

### 3.2 Join/Rejoin Errors
**Current behavior:** Technical errors like "Match is not ready to start", "Both players must be ready", "status is: eliminated"

**Target behavior:**
- "Match not ready" → "Your opponent hasn't confirmed yet. Waiting for them to ready up..."
- "Both players must be ready" → "Ready check in progress — both players need to confirm. You have 45 seconds remaining."
- "status is: eliminated" → "You were eliminated in Round 3. Final placement: #47 of 128. You can still watch live matches."
- "status is: forfeited" → "You forfeited this match because the ready check timed out. Next time, click Ready within 60 seconds."
- "status is: disqualified" → "You've been disqualified from this tournament. Reason: [admin reason]"

**Implementation:**
- **File:** `client/src/components/tournament/joinErrors.ts` — already has the `getTournamentJoinErrorMessage()` function
- Extend it to handle `eliminated`, `forfeited`, `disqualified` status messages
- Add context from `currentTournamentAction` (round number, placement, opponent name)
- **File:** `server/src/features/tournament-experience.ts` — `rpcGetCurrentTournamentAction()`
- Already returns `participantStatus`, `finalPlacement`, `matchId`. Ensure `eliminated`/`forfeited` participants get `kind: 'view_results'` with a descriptive label like "Eliminated — Round 3" instead of just "View results".

---

## PART 4: TOURNAMENT LIFECYCLE EXPLAINER

### 4.1 First-Time User Onboarding
**Current behavior:** User lands on tournament list with zero context about how tournaments work.

**Target behavior:** Show a dismissible 3-step explainer card at the top of the tournament list (only for users who have never registered for a tournament):

```
┌─────────────────────────────────────────┐
│  🏆 How Tournaments Work                │
│                                         │
│  1️⃣  Register for an open tournament    │
│  2️⃣  Ready up when your match is ready  │
│  3️⃣  Win matches to climb the bracket   │
│                                         │
│  Top players win coins, badges & rank!  │
│                                         │
│  [Got it!]                               │
└─────────────────────────────────────────┘
```

**Implementation:**
- **File:** `client/src/components/TournamentsScreen.tsx`
- Add a `useState` check: if user has 0 tournaments in `myTournaments` AND has never dismissed the card, show it
- Persist dismissal in localStorage: `tournament_onboarding_dismissed`
- Card is a `motion.div` with glass styling, auto-dismisses after user registers for first tournament

### 4.2 Tournament Detail — Status Timeline
**Current behavior:** Tournament detail page shows bracket, matches, participants. No flow visualization.

**Target behavior:** Add a status timeline at the top of the tournament detail page showing where the user is:

```
Registration → [YOU ARE HERE] Waiting for Start → Round 1 → Round 2 → ... → Finals → Results
```

For completed tournaments:
```
Registration → Round 1 → Round 2 ✓ → Round 3 ✓ (ELIMINATED — #47) → ... → Winner: Alex
```

**Implementation:**
- **File:** `client/src/components/TournamentDetailScreen.tsx`
- Add a `TournamentProgressTimeline` component
- Shows dots for each phase, highlights current phase
- If user is eliminated, shows elimination point with placement

---

## PART 5: REJOIN & ACTIVE MATCH FLOW

### 5.1 Home Screen — Tournament Action Button
**Current behavior:** Shows `currentTournamentAction.label` (e.g., "Rejoin match", "Ready up", "Waiting for opponent"). Clicking opens tournament detail or initiates ready check.

**Target behavior:** The action button should be a prominent, colored card on the home screen showing:
- **Rejoin:** 🟢 "Your match is live! vs. Alex — Round 4" with pulsing border. Clicking goes directly to the game.
- **Ready up:** 🟡 "Ready check — vs. Maria" with countdown. Clicking opens ready check.
- **Waiting:** ⚪ "Waiting for opponent — Round 3" with estimated time. Clicking opens bracket view.
- **Registered:** 🔵 "Tournament starts in 2 hours" with countdown. Clicking opens tournament detail.
- **View results:** ⚫ "You placed #47 in Tournament Name" with trophy. Clicking opens results.

**Implementation:**
- **File:** `client/src/screens/HomeScreen.tsx` (lines ~93-108)
- Replace the simple text label with a full card component that changes based on `currentTournamentAction.kind`
- **File:** `server/src/features/tournament-experience.ts` — `rpcGetCurrentTournamentAction()`
- Already returns all needed data. Add `roundNumber` and `totalRounds` to the response for better labels.

### 5.2 Rejoin Flow
**Current behavior:** Client polls `check_active_tournament_match` up to 18 times when match start races. Works technically but user sees nothing during this wait.

**Target behavior:**
1. User taps "Rejoin match" button
2. Client calls `check_active_tournament_match`
3. If `hasActiveMatch: true` → immediately joins the Nakama match socket
4. If `initializing: true` → shows "Match is being prepared..." with spinner (2-5 seconds)
5. If `hasActiveMatch: false` → match already ended. Shows result: "Your match ended. You [won/lost]. [View bracket]"
6. If joining fails → see error messages in Part 3.2

**Implementation:**
- **File:** `client/src/stores/tournamentStore.ts` — `startTournamentMatch()` and `recoverActiveTournamentMatchId()`
- The recovery logic already exists. Just improve the UI feedback during the wait.
- **File:** `client/src/screens/HomeScreen.tsx` — when tapping tournament action of kind `rejoin_match`, show a loading modal with contextual message

### 5.3 Match End — Auto-Transition
**Current behavior:** When a match ends, the client receives `matchEnd` message. It shows results, then user must manually navigate back.

**Target behavior:**
1. Match ends → show result screen with clear next step:
   - WIN: "You won! Advancing to Round 4. Next match in ~5 minutes." → [View Bracket] button
   - LOSE (not eliminated): "You lost. Moving to Losers Bracket — Round 5." → [View Bracket] button
   - LOSE (eliminated): "Eliminated in Round 3. Final placement: #47 of 128." → [View Results] button
   - WIN (tournament winner): "🏆 YOU WON! 1st place — Champion!" → [Claim Rewards] button

**Implementation:**
- **File:** `client/src/screens/game/` — match end handler
- Read `state.tournamentMatchId` after match ends
- Fetch tournament details to get updated bracket status
- Show contextual post-match screen based on what happened next in the bracket

---

## PART 6: LIVE MATCHES & SPECTATING

### 6.1 Live Matches Panel
**Current behavior:** `TournamentLivePanel` shows spectator matches. Works fine technically.

**Target behavior:** Add to the live panel:
- Total live matches count badge
- Filter by tournament (if multiple tournaments are live)
- "Watch" button with clear affordance
- Show round number and player names prominently

**Implementation:**
- **File:** `client/src/components/tournament/TournamentLivePanel.tsx`
- Add round info to `SpectatorMatch` interface
- Add count badge in the panel header
- **File:** `server/src/features/spectator.ts` — already returns spectator matches. Ensure round number and tournament name are included (they already are per the `SpectatorMatch` interface).

---

## PART 7: TOURNAMENT DETAIL — BRACKET VIEW

### 7.1 Bracket Navigation
**Current behavior:** Bracket shows all rounds. User scrolls to find their match.

**Target behavior:**
- Auto-scroll to the user's current/last match when opening the bracket
- Highlight the user's path through the bracket (colored line through matches they played)
- Show "YOU" badge on their match nodes
- Winners bracket on left, losers bracket on right, grand final at top center
- Collapse completed rounds by default, expand current/live round

**Implementation:**
- **File:** `client/src/components/tournament/BracketView.tsx` and `BracketListView.tsx`
- Add `scrollToUserMatch` logic using the user's participant ID
- Add path highlighting: trace from round 1 to current position
- The bracket rendering components already exist; enhance them with path tracing

---

## PART 8: NOTIFICATIONS

### 8.1 Push Notification for Match Ready
**Current behavior:** In-app notifications via Nakama. Tournament match ready notification exists but is basic.

**Target behavior:**
- "⚔️ Your Round 4 match is ready! vs. Alex — Tournament: Weekend Warriors"
- "⏰ Ready check expires in 45 seconds!"
- "🏆 Tournament complete! You placed #47 of 128 in Weekend Warriors"
- "📢 New tournament: Weekend Warriors — Registration open!"

**Implementation:**
- **File:** `server/src/features/tournament-experience.ts` — notification creation functions
- Already sends notifications via `createTournamentNotification()`. Enhance message content.
- **File:** `client/src/stores/notificationStore.ts` — handle notification click to navigate to the right screen

---

## PART 9: RANK TIERS & MMR

### 9.1 Show Rank Names Instead of Numbers
**Current behavior:** MMR shown as raw number (e.g., "850"). Users don't know what it means.

**Target behavior:** Show rank tier name + MMR: "Silver • 850". Tournament requirements show tier names: "Requires Gold (1000+) to Diamond (2000)".

**Implementation:**
- **File:** `client/src/lib/mmr.ts` or rank utility
- Already has `getRankByMmr()`, `getNextRank()`, `getRankProgress()` functions
- Use them in tournament eligibility display
- **File:** `server/src/features/tournaments.ts` — eligibility checks
- Include rank tier names in error messages by reading the rank tiers config

---

## PART 10: SUMMARY OF ALL FILES TO CHANGE

### Server-side files:
| File | Changes |
|---|---|
| `server/src/features/tournaments.ts` | Tournament ordering (2.1), better registration errors (3.1), eligibility error context |
| `server/src/main/tournament-advance.ts` | Grand final reset fix (1.2 — already done) |
| `server/src/features/tournament-experience.ts` | Enhanced action labels with round/placement info (5.1, 5.2) |
| `server/src/features/helpers.ts` | `syncTournamentStatuses` — already calls progression pass |
| `server/src/features/notifications.ts` | Better notification message content (8.1) |

### Client-side files:
| File | Changes |
|---|---|
| `client/src/components/TournamentsScreen.tsx` | Tab system instead of filters (2.2), empty states (2.4), onboarding card (4.1), urgency display (2.3) |
| `client/src/components/TournamentDetailScreen.tsx` | Status timeline (4.2) |
| `client/src/components/tournament/joinErrors.ts` | Extended error messages (3.2) |
| `client/src/components/tournament/TournamentLivePanel.tsx` | Enhanced live panel (6.1) |
| `client/src/components/tournament/BracketView.tsx` | Auto-scroll to user, path highlighting (7.1) |
| `client/src/screens/HomeScreen.tsx` | Enhanced tournament action card (5.1) |
| `client/src/stores/tournamentStore.ts` | Better error handling, rejoin UX (5.2) |
| `client/src/screens/game/` | Post-match contextual screen (5.3) |

---

## PRIORITY ORDER

1. **CRITICAL:** Tournament list ordering (2.1) — users can't find open tournaments
2. **CRITICAL:** Default filter tabs (2.2) — new user experience is broken
3. **HIGH:** Better error messages (3.1, 3.2) — users get stuck without guidance
4. **HIGH:** Home screen tournament action card (5.1) — rejoin/ready up flow confusing
5. **MEDIUM:** Empty states with CTAs (2.4) — dead ends in the app
6. **MEDIUM:** Tournament lifecycle explainer (4.1) — onboarding
7. **MEDIUM:** Post-match contextual screen (5.3) — user doesn't know what happened
8. **LOW:** Live panel enhancements (6.1)
9. **LOW:** Bracket auto-scroll (7.1)
10. **LOW:** Notification message improvements (8.1)
