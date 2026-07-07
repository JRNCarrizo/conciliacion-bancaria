-- Comentarios por par conciliado (un solo hilo por fila).
CREATE TABLE reconciliation_pair_comment (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT NOT NULL,
    pair_id BIGINT NOT NULL,
    body VARCHAR(4000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rpc_session FOREIGN KEY (session_id) REFERENCES reconciliation_session (id),
    CONSTRAINT fk_rpc_pair FOREIGN KEY (pair_id) REFERENCES reconciliation_pair (id)
);

CREATE INDEX idx_rpc_session_pair ON reconciliation_pair_comment (session_id, pair_id);
