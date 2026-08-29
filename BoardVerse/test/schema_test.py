import sqlite3, pathlib
root=pathlib.Path(__file__).resolve().parents[1]
raw=(root/'src/db/schema.js').read_text(encoding='utf-8')
start=raw.index('String.raw`')+len('String.raw`')
end=raw.rindex('`;')
sql=raw[start:end]
file_sql=(root/'schema/boardverse.sql').read_text(encoding='utf-8')
assert file_sql.strip()==sql.strip(), 'schema/boardverse.sql must match embedded DB_SCHEMA'
con=sqlite3.connect(':memory:'); con.executescript(sql)
tables={x[0] for x in con.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%'")}
required={'users','user_sessions','email_tokens','daily_user_stats','opponent_daily_gp','room_presets','replays','replay_events','announcements','reports','risk_flags','disciplinary_actions','audit_logs','system_settings','admin_login_attempts','user_login_attempts','chat_mutes','active_rooms'}
assert required <= tables, required-tables
print(f"schema_test: PASS ({len(tables)} tables)")
