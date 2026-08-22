-- Tournament status lifecycle checks

-- Tournaments that should be in registration but are not
SELECT id, name, status, registration_start, registration_end
FROM tournaments
WHERE registration_start <= NOW()
  AND registration_end > NOW()
  AND status <> 'registration';

-- Tournaments that should be upcoming (registration closed, not started) but are not
SELECT id, name, status, registration_start, registration_end, tournament_start
FROM tournaments
WHERE registration_end <= NOW()
  AND tournament_start > NOW()
  AND status <> 'upcoming';

-- Tournaments that should have started but are still upcoming/registration
SELECT id, name, status, tournament_start
FROM tournaments
WHERE tournament_start <= NOW()
  AND status IN ('upcoming', 'registration');

-- Matches stuck in ready state longer than no-show timeout (5 minutes)
SELECT tm.id, tm.tournament_id, tm.ready_at, tm.ready_player1, tm.ready_player2
FROM tournament_matches tm
JOIN tournaments t ON t.id = tm.tournament_id
WHERE tm.status = 'ready'
  AND tm.ready_at IS NOT NULL
  AND tm.ready_at < NOW() - INTERVAL '5 minutes'
  AND t.status = 'in_progress';

-- Matches in progress without a Nakama match id
SELECT tm.id, tm.tournament_id
FROM tournament_matches tm
WHERE tm.status = 'in_progress'
  AND tm.nakama_match_id IS NULL;