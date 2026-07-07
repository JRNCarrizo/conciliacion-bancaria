-- Comentarios tipo hilo por movimiento pendiente (banco o empresa), archivados en la sesión.
CREATE TABLE pending_movement_comment (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT NOT NULL,
    movement_side VARCHAR(16) NOT NULL,
    movement_id BIGINT NOT NULL,
    body VARCHAR(4000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pmc_session FOREIGN KEY (session_id) REFERENCES reconciliation_session (id)
);

CREATE INDEX idx_pmc_session_movement ON pending_movement_comment (session_id, movement_side, movement_id);
