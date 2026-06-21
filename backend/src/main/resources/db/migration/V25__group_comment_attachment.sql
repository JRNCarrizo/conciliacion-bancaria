-- Comentarios y adjuntos por grupo de conciliación N:M (un hilo y un conjunto por fila de grupo).
CREATE TABLE reconciliation_group_comment (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT NOT NULL,
    group_id BIGINT NOT NULL,
    body VARCHAR(4000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by_username VARCHAR(128) NULL,
    CONSTRAINT fk_rgc_session FOREIGN KEY (session_id) REFERENCES reconciliation_session (id) ON DELETE CASCADE,
    CONSTRAINT fk_rgc_group FOREIGN KEY (group_id) REFERENCES reconciliation_group (id) ON DELETE CASCADE
);

CREATE INDEX idx_rgc_session_group ON reconciliation_group_comment (session_id, group_id);

CREATE TABLE group_attachment (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT NOT NULL,
    group_id BIGINT NOT NULL,
    stored_path VARCHAR(512) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(128),
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by_username VARCHAR(128) NULL,
    CONSTRAINT fk_ga_session FOREIGN KEY (session_id) REFERENCES reconciliation_session (id) ON DELETE CASCADE,
    CONSTRAINT fk_ga_group FOREIGN KEY (group_id) REFERENCES reconciliation_group (id) ON DELETE CASCADE
);

CREATE INDEX idx_ga_session_group ON group_attachment (session_id, group_id);
