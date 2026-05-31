CREATE TABLE session_checkpoint (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by_username VARCHAR(128) NOT NULL,
    note VARCHAR(512),
    session_status VARCHAR(32) NOT NULL,
    matched_pairs BIGINT NOT NULL,
    unmatched_bank_count BIGINT NOT NULL,
    unmatched_company_count BIGINT NOT NULL,
    reconciliation_status VARCHAR(64) NOT NULL,
    stats_json MEDIUMTEXT NOT NULL,
    pdf_stored_path VARCHAR(512) NOT NULL,
    pdf_size_bytes BIGINT NOT NULL,
    CONSTRAINT fk_session_checkpoint_session FOREIGN KEY (session_id) REFERENCES reconciliation_session (id) ON DELETE CASCADE
);

CREATE INDEX idx_session_checkpoint_session_time ON session_checkpoint (session_id, created_at);
