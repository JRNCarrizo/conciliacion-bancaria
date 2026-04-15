-- Adjuntos por movimiento pendiente (misma clave que comentarios: sesión + lado + id movimiento).
CREATE TABLE movement_attachment (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT NOT NULL,
    movement_side VARCHAR(16) NOT NULL,
    movement_id BIGINT NOT NULL,
    stored_path VARCHAR(512) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(128),
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ma_session FOREIGN KEY (session_id) REFERENCES reconciliation_session (id) ON DELETE CASCADE
);

CREATE INDEX idx_ma_session_movement ON movement_attachment (session_id, movement_side, movement_id);
