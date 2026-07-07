CREATE TABLE session_audit_event (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT NOT NULL,
    event_type VARCHAR(32) NOT NULL,
    username VARCHAR(128),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    detail VARCHAR(512),
    CONSTRAINT fk_session_audit_session FOREIGN KEY (session_id) REFERENCES reconciliation_session (id) ON DELETE CASCADE
);

CREATE INDEX idx_session_audit_session_time ON session_audit_event (session_id, created_at);
