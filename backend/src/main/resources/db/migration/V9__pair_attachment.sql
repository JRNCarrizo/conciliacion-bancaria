-- Adjuntos de la operación conciliada (un solo conjunto por par, no por movimiento).
CREATE TABLE pair_attachment (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT NOT NULL,
    pair_id BIGINT NOT NULL,
    stored_path VARCHAR(512) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(128),
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pa_session FOREIGN KEY (session_id) REFERENCES reconciliation_session (id) ON DELETE CASCADE,
    CONSTRAINT fk_pa_pair FOREIGN KEY (pair_id) REFERENCES reconciliation_pair (id) ON DELETE CASCADE
);

CREATE INDEX idx_pa_session_pair ON pair_attachment (session_id, pair_id);
