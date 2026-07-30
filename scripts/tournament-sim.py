#!/usr/bin/env python3
"""32-player Bo3 Double Elimination Tournament Simulator.
   22 humans + 10 bots. Uses Nakama REST API."""
import subprocess, json, base64, time, uuid, random, sys

SK = "PDeG-HSRvkzoodqqKMQNgPuBEPMM2GOStlNrB6-4X56Vyplt"
HK = "4LzCX4l7ArIQ0ZWWTY3ypYsgTaNo-BjUDqoihY9xWyqdJt0x"
AUTH = base64.b64encode((SK + ":").encode()).decode()
NAKAMA = "http://localhost:7350"
SIM_ID = str(int(time.time()))[-5:]
Q = "'"

def sql(c):
    a = ["docker", "exec", "beneficial-knowledge-postgres-prod", "psql", "-U", "postgres", "-d", "nakama", "-c", c]
    return subprocess.run(a, capture_output=True, text=True, timeout=15).stdout.strip()

def rpc_public(name, payload_dict=None):
    """RPC without user context (uses http_key)"""
    inner = json.dumps(payload_dict) if payload_dict else ""
    body = json.dumps(inner)
    a = ["curl", "-sS", "--max-time", "15", "-X", "POST", "-H", "Content-Type: application/json",
         "-d", body, NAKAMA + "/v2/rpc/" + name + "?http_key=" + HK]
    r = subprocess.run(a, capture_output=True, text=True, timeout=20)
    o = r.stdout.strip()
    if not o: return None
    try:
        d = json.loads(o)
        if "payload" in d and isinstance(d["payload"], str):
            try: return json.loads(d["payload"])
            except: return d
        return d
    except: return {"_raw": o[:200]}

def rpc_auth(name, payload_dict, token):
    """RPC with user auth (Bearer token, NO http_key)"""
    inner = json.dumps(payload_dict) if payload_dict else ""
    body = json.dumps(inner)
    a = ["curl", "-sS", "--max-time", "15", "-X", "POST", "-H", "Content-Type: application/json",
         "-H", "Authorization: Bearer " + token,
         "-d", body, NAKAMA + "/v2/rpc/" + name]
    r = subprocess.run(a, capture_output=True, text=True, timeout=20)
    o = r.stdout.strip()
    if not o: return None
    try:
        d = json.loads(o)
        if "payload" in d and isinstance(d["payload"], str):
            try: return json.loads(d["payload"])
            except: return d
        return d
    except: return {"_raw": o[:200]}

def create_user(did):
    a = ["curl", "-sS", "--max-time", "10", "-X", "POST", "-H", "Content-Type: application/json",
         "-H", "Authorization: Basic " + AUTH, "-d", json.dumps({"id": did}),
         NAKAMA + "/v2/account/authenticate/device"]
    r = subprocess.run(a, capture_output=True, text=True, timeout=15)
    o = r.stdout.strip()
    if o:
        d = json.loads(o)
        t = d.get("token", "")
        if t:
            parts = t.split(".")
            p = parts[1] + "=" * (4 - len(parts[1]) % 4)
            j = json.loads(base64.b64decode(p).decode())
            return {"token": t, "userId": j.get("uid", "")}
    return None

def write_storage(token, collection, key, value_dict):
    """Write Nakama storage via API"""
    data = json.dumps({"objects": [{"collection": collection, "key": key,
        "value": json.dumps(value_dict), "permissionRead": 2, "permissionWrite": 0}]})
    a = ["curl", "-sS", "--max-time", "10", "-X", "PUT", NAKAMA + "/v2/storage",
         "-H", "Content-Type: application/json", "-H", "Authorization: Bearer " + token, "-d", data]
    r = subprocess.run(a, capture_output=True, text=True, timeout=15)
    return r.stdout.strip()

print("SIM_ID=" + SIM_ID, flush=True)

# ===== PHASE 1: Create 22 users =====
print("PHASE 1: Creating 22 users...", flush=True)
users = []
for i in range(1, 23):
    u = create_user("sim" + SIM_ID + "-p" + str(i).zfill(2))
    if u: users.append(u)
print("  Created " + str(len(users)) + " users", flush=True)
assert len(users) == 22

# ===== PHASE 2: Create tournament =====
print("PHASE 2: Creating admin & tournament...", flush=True)

# Create admin user
admin_u = create_user("sim" + SIM_ID + "-admin")
assert admin_u, "Failed to create admin user"
print("  Admin uid=" + admin_u["userId"][:16] + "...", flush=True)

# Write admin storage via Nakama API
write_storage(admin_u["token"], "player_data", "global_mmr", {"mmr": 2000, "telegramId": 8215773847})
write_storage(admin_u["token"], "player_data", "telegram", {"id": 8215773847, "telegramId": 8215773847, "username": "admin_sim"})
print("  Admin storage written", flush=True)

# Create tournament via admin RPC
now = time.time()
tourney = {
    "name": "SIM-" + SIM_ID,
    "description": "32p Bo3 Double Elimination Simulation",
    "format": "double_elimination",
    "bracketSize": 32,
    "seedingMode": "random_opening_round",
    "grandFinalReset": True,
    "minMmr": 0, "maxMmr": 10000,
    "questionCount": 5, "timePerQuestionMs": 10000,
    "registrationStart": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now-60)),
    "registrationEnd": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now+300)),
    "tournamentStart": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now+600)),
    "allowSpectators": True,
    "bestOfByRound": {"opening": 3, "winners": [3,3,3,3,3], "losers": [3,3,3,3,3,3,3,3], "grand_final": 3},
    "botPolicy": {"enabled": True, "fillOnStart": True, "replaceMissingBeforeMatch": True}
}
r = rpc_auth("admin_create_tournament", tourney, admin_u["token"])
if not r or not r.get("success"):
    print("  FAILED to create tournament: " + str(r)[:300], flush=True)
    sys.exit(1)
tid = r["tournamentId"]
print("  Created: " + tid[:20] + "...", flush=True)

# ===== PHASE 3: Register users =====
print("PHASE 3: Registering 22 users...", flush=True)
registered = 0
for i, u in enumerate(users):
    r = rpc_auth("register_for_tournament", {"tournamentId": tid}, u["token"])
    if r and r.get("success"):
        registered += 1
    elif i < 3:
        print("  User " + str(i) + " reg: " + str(r)[:100], flush=True)
print("  Registered: " + str(registered) + "/22", flush=True)

if registered < 2:
    print("  Not enough registrations!", flush=True)
    rpc_auth("admin_cancel_tournament", {"tournamentId": tid}, admin_u["token"])
    sys.exit(1)

# ===== PHASE 4: Start tournament =====
print("PHASE 4: Starting tournament...", flush=True)
r = rpc_auth("admin_start_tournament", {"tournamentId": tid}, admin_u["token"])
print("  Start: " + (str(r)[:200] if r else "no response"), flush=True)

time.sleep(2)

# ===== PHASE 5: Bracket state =====
r = rpc_public("get_tournament_details", {"tournamentId": tid})
if not r or "matches" not in r:
    print("  ERROR: No bracket generated. Checking status...", flush=True)
    tour_status = sql("SELECT status, registered_count FROM tournaments WHERE id = " + Q + tid + Q)
    print("  DB status: " + tour_status, flush=True)
    rpc_auth("admin_cancel_tournament", {"tournamentId": tid}, admin_u["token"])
    sys.exit(1)

matches = r["matches"]
participants = r["participants"]
bots = [p for p in participants if p.get("isBot")]
humans = [p for p in participants if not p.get("isBot")]

by_s = {}
for m in matches:
    by_s[m.get("status", "?")] = by_s.get(m.get("status", "?"), 0) + 1
print("PHASE 5: " + str(len(humans)) + "H+" + str(len(bots)) + "B, " + str(len(matches)) + " matches, " + str(by_s), flush=True)

r1 = [m for m in matches if m.get("roundNumber") == 1 and m.get("bracketType") == "winners"]
hh = sum(1 for m in r1 if not m.get("player1IsBot") and not m.get("player2IsBot"))
hb = sum(1 for m in r1 if (m.get("player1IsBot") or m.get("player2IsBot")) and not (m.get("player1IsBot") and m.get("player2IsBot")))
bb = sum(1 for m in r1 if m.get("player1IsBot") and m.get("player2IsBot"))
print("  R1: " + str(hh) + " HvH, " + str(hb) + " HvB, " + str(bb) + " BvB", flush=True)

# Show first few matchups
for m in sorted(r1, key=lambda m: (m.get("matchNumber", 0)))[:6]:
    p1 = "BOT" if m.get("player1IsBot") else "HUM"
    p2 = "BOT" if m.get("player2IsBot") else "HUM"
    print("    M" + str(m.get("matchNumber")).zfill(2) + ": " + p1 + " vs " + p2 + " [" + m.get("status") + "] Bo" + str(m.get("bestOf", 1)), flush=True)

# ===== PHASE 6: Simulate ALL matches =====
print("\nPHASE 6: Simulating matches...", flush=True)
total = 0
errors = []

for it in range(80):
    r = rpc_public("get_tournament_details", {"tournamentId": tid})
    if not r: break
    tour = r.get("tournament", {})
    if tour.get("status") in ("completed", "cancelled"):
        print("  DONE it" + str(it) + " - " + tour.get("status"), flush=True)
        break

    matches = r.get("matches", [])
    ready = [m for m in matches if m.get("status") == "ready"]
    completed = [m for m in matches if m.get("status") in ("completed", "bye")]

    if not ready:
        pending = [m for m in matches if m.get("status") == "pending"]
        if not pending:
            print("  End it" + str(it) + ": " + str(len(completed)) + " done, no pending", flush=True)
            if tour.get("status") != "completed":
                for _ in range(5):
                    rpc_public("_cron_tournament_noshow_check")
                    time.sleep(1)
            break
        for _ in range(3):
            rpc_public("_cron_tournament_noshow_check")
            time.sleep(1)
        continue

    # Process human matches (bot-bot handled by cron)
    bot_ready = [m for m in ready if m.get("player1IsBot") and m.get("player2IsBot")]
    human_ready = [m for m in ready if not (m.get("player1IsBot") and m.get("player2IsBot"))]

    if bot_ready and not human_ready:
        for _ in range(3):
            rpc_public("_cron_tournament_noshow_check")
            time.sleep(0.5)
        continue

    sim_n = 0
    for m in human_ready[:10]:
        p1b = m.get("player1IsBot", False)
        p2b = m.get("player2IsBot", False)
        p1uid = m.get("player1UserId", "")
        p2uid = m.get("player2UserId", "")

        winner = p2uid if p1b else (p1uid if p2b else random.choice([p1uid, p2uid]))
        if not winner: continue

        for g in range((m.get("bestOf", 1) + 1) // 2):
            p1s = random.randint(50, 200)
            p2s = random.randint(50, 200)
            if winner == p1uid: p1s = max(p1s, p2s + random.randint(5, 30))
            else: p2s = max(p2s, p1s + random.randint(5, 30))

            rpt = rpc_auth("report_tournament_match_result", {
                "tournamentMatchId": m["id"], "winnerId": winner,
                "player1Score": p1s, "player2Score": p2s
            }, admin_u["token"])
            if rpt and rpt.get("success"): total += 1
            else: errors.append(str(m.get("bracketType")) + "R" + str(m.get("roundNumber")) + "M" + str(m.get("matchNumber")) + ": " + str(rpt)[:100])
            time.sleep(0.1)

        sim_n += 1
        if total <= 10 or total % 15 == 0:
            bt = str(m.get("bracketType", "?"))[:2]
            ws = "BOT" if (p1b and winner == p1uid) or (p2b and winner == p2uid) else "HUM"
            print("    [" + str(total) + "] " + bt + "R" + str(m.get("roundNumber")) + "M" + str(m.get("matchNumber")) + ": " + ws + " Bo" + str(m.get("bestOf", 1)), flush=True)

    if sim_n == 0:
        for _ in range(3):
            rpc_public("_cron_tournament_noshow_check")
            time.sleep(1)

    rpc_public("_cron_tournament_noshow_check")
    time.sleep(0.3)

# ===== FINAL REPORT =====
print("\n" + "=" * 60, flush=True)
print("FINAL REPORT", flush=True)
print("=" * 60, flush=True)

r = rpc_public("get_tournament_details", {"tournamentId": tid})
if r:
    tour = r.get("tournament", {})
    matches = r.get("matches", [])
    participants = r.get("participants", [])

    by_s = {}
    for m in matches:
        by_s[m.get("status", "?")] = by_s.get(m.get("status", "?"), 0) + 1
    stuck = [m for m in matches if m.get("status") in ("ready", "in_progress")]

    print("Status: " + str(tour.get("status")), flush=True)
    print("Winner: " + str(tour.get("winnerId", "none")), flush=True)
    print("Matches: " + str(by_s), flush=True)
    print("Stuck: " + str(len(stuck)) + " | Simulated: " + str(total) + " | Errors: " + str(len(errors)), flush=True)

    placed = sorted([p for p in participants if p.get("finalPlacement")], key=lambda p: p.get("finalPlacement", 999))
    print("\nTop 5:", flush=True)
    for p in placed[:5]:
        b = "BOT" if p.get("isBot") else "HUM"
        print("  #" + str(p.get("finalPlacement")) + ": " + b + " " + str(p.get("displayName", "?"))[:30] + " w=" + str(p.get("matchesWon")), flush=True)

    if stuck:
        print("\nSTUCK:", flush=True)
        for m in stuck[:8]:
            print("  " + str(m.get("bracketType")) + "R" + str(m.get("roundNumber")) + "M" + str(m.get("matchNumber")) + ": " + str(m.get("status")) + " P1b=" + str(m.get("player1IsBot")) + " P2b=" + str(m.get("player2IsBot")), flush=True)

    if errors:
        print("\nErrors (" + str(len(errors)) + "):", flush=True)
        for e in errors[:15]:
            print("  " + e, flush=True)

# Cleanup
rpc_auth("admin_cancel_tournament", {"tournamentId": tid}, admin_u["token"])
print("\nCleaned up. DONE.", flush=True)
