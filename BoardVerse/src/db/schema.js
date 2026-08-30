export const BOARDVERSE_SCHEMA_SQL = String.raw`CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, username_normalized TEXT NOT NULL UNIQUE, username_display TEXT NOT NULL,
 email_normalized TEXT NOT NULL UNIQUE, email_verified_at INTEGER,
 password_algorithm TEXT NOT NULL, password_iterations INTEGER NOT NULL, password_salt TEXT, password_hash TEXT,
 status TEXT NOT NULL DEFAULT 'active', suspended_until INTEGER, gp INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 1,
 reputation INTEGER NOT NULL DEFAULT 100 CHECK(reputation BETWEEN 0 AND 100), unlimited_custom_room_id INTEGER NOT NULL DEFAULT 0,
 custom_room_suspended_until INTEGER, global_muted_until INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_sessions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id,revoked_at,expires_at);
CREATE TABLE IF NOT EXISTS email_tokens (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, type TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
 expires_at INTEGER NOT NULL, used_at INTEGER, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_tokens_user_type ON email_tokens(user_id,type,used_at,expires_at);
CREATE TABLE IF NOT EXISTS email_rate_limits (
 rate_key TEXT NOT NULL, kind TEXT NOT NULL, window_key TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, last_sent_at INTEGER NOT NULL,
 PRIMARY KEY(rate_key,kind)
);
CREATE TABLE IF NOT EXISTS daily_user_stats (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, date_key TEXT NOT NULL, checkin_done INTEGER NOT NULL DEFAULT 0,
 active_seconds INTEGER NOT NULL DEFAULT 0, active_gp_awarded INTEGER NOT NULL DEFAULT 0, valid_games_count INTEGER NOT NULL DEFAULT 0,
 custom_room_count INTEGER NOT NULL DEFAULT 0, last_activity_at INTEGER, PRIMARY KEY(user_id,date_key)
);
CREATE TABLE IF NOT EXISTS user_checkin_state (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, last_checkin_date TEXT, streak_days INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS opponent_daily_gp (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, opponent_user_id TEXT NOT NULL, date_key TEXT NOT NULL,
 gp_eligible_games INTEGER NOT NULL DEFAULT 0, total_games INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id,opponent_user_id,date_key)
);
CREATE TABLE IF NOT EXISTS gp_events (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, amount INTEGER NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gp_events_user ON gp_events(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS room_presets (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, config_json TEXT NOT NULL,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_room_presets_user ON room_presets(user_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS replays (
 id TEXT PRIMARY KEY, room_id TEXT NOT NULL, game_instance_id TEXT NOT NULL, public_token_hash TEXT NOT NULL UNIQUE,
 game_type TEXT NOT NULL, variant TEXT, players_json TEXT NOT NULL, result_json TEXT, time_control_json TEXT,
 finished_at INTEGER NOT NULL, public_until INTEGER NOT NULL, delete_after INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_replays_game_finished ON replays(game_type,finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_replays_delete ON replays(delete_after);
CREATE TABLE IF NOT EXISTS replay_events (
 replay_id TEXT NOT NULL REFERENCES replays(id) ON DELETE CASCADE, seq INTEGER NOT NULL, revision INTEGER NOT NULL,
 event_type TEXT NOT NULL, actor TEXT, payload_json TEXT, server_timestamp INTEGER NOT NULL, PRIMARY KEY(replay_id,seq)
);
CREATE INDEX IF NOT EXISTS idx_replay_events_revision ON replay_events(replay_id,revision);

CREATE TABLE IF NOT EXISTS active_rooms (
 room_id TEXT PRIMARY KEY, room_name TEXT NOT NULL, game_type TEXT NOT NULL, status TEXT NOT NULL, private_room INTEGER NOT NULL DEFAULT 0,
 voice_enabled INTEGER NOT NULL DEFAULT 0, owner_user_id TEXT, players_json TEXT NOT NULL DEFAULT '[]', spectator_count INTEGER NOT NULL DEFAULT 0,
 last_activity_at INTEGER NOT NULL, closed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_active_rooms_status ON active_rooms(status,last_activity_at DESC);

CREATE TABLE IF NOT EXISTS announcements (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'general', enabled INTEGER NOT NULL DEFAULT 1,
 published_at INTEGER NOT NULL, expires_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(enabled,published_at DESC,expires_at);
CREATE TABLE IF NOT EXISTS reports (
 id TEXT PRIMARY KEY, reporter_user_id TEXT, reporter_guest_key TEXT, reporter_risk_key TEXT, type TEXT NOT NULL, description TEXT NOT NULL,
 room_id TEXT, game_id TEXT, replay_id TEXT, target_user_id TEXT, current_url TEXT, status TEXT NOT NULL DEFAULT 'pending',
 admin_note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status,type,created_at DESC);
CREATE TABLE IF NOT EXISTS risk_flags (
 id TEXT PRIMARY KEY, user_id TEXT, type TEXT NOT NULL, severity_hint TEXT, evidence_json TEXT NOT NULL DEFAULT '{}',
 status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, reviewed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_risk_flags_user ON risk_flags(user_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS disciplinary_actions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action_type TEXT NOT NULL, reason TEXT NOT NULL, before_json TEXT, after_json TEXT,
 starts_at INTEGER NOT NULL, ends_at INTEGER, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_discipline_user ON disciplinary_actions(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS audit_logs (
 id TEXT PRIMARY KEY, admin_actor TEXT NOT NULL, action_type TEXT NOT NULL, target_type TEXT, target_id TEXT, reason TEXT,
 before_json TEXT, after_json TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE TABLE IF NOT EXISTS system_settings (
 key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_login_attempts (
 login_key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, failure_count INTEGER NOT NULL DEFAULT 0, blocked_until INTEGER, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_login_attempts (
 ip_hash TEXT PRIMARY KEY, window_start INTEGER NOT NULL, failure_count INTEGER NOT NULL DEFAULT 0, blocked_until INTEGER, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_mutes (
 subject_type TEXT NOT NULL, subject_id TEXT NOT NULL, channel TEXT NOT NULL, muted_until INTEGER, reason TEXT, created_at INTEGER NOT NULL,
 PRIMARY KEY(subject_type,subject_id,channel)
);
CREATE TABLE IF NOT EXISTS chat_archive (
 id TEXT PRIMARY KEY, channel TEXT NOT NULL, room_id TEXT, sender_kind TEXT NOT NULL, sender_id TEXT,
 sender_name TEXT NOT NULL, message_text TEXT NOT NULL, created_at INTEGER NOT NULL, delete_after INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_archive_created ON chat_archive(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_archive_room ON chat_archive(room_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_archive_delete ON chat_archive(delete_after);
`;
export default BOARDVERSE_SCHEMA_SQL;
