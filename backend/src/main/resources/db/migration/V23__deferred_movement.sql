CREATE TABLE deferred_movement (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    movement_side VARCHAR(16) NOT NULL,
    tx_date DATE NOT NULL,
    amount DECIMAL(19, 4) NOT NULL,
    accounting_amount DECIMAL(19, 4) NULL,
    reference VARCHAR(255) NULL,
    description VARCHAR(1024) NULL,
    pending_classification VARCHAR(128) NULL,
    content_fingerprint VARCHAR(64) NULL,
    source_session_id BIGINT NOT NULL,
    source_transaction_id BIGINT NULL,
    excluded_at TIMESTAMP NOT NULL,
    excluded_by VARCHAR(128) NULL,
    note VARCHAR(512) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'AVAILABLE',
    consumed_session_id BIGINT NULL,
    consumed_at TIMESTAMP NULL,
    created_transaction_id BIGINT NULL,
    CONSTRAINT fk_deferred_source_session FOREIGN KEY (source_session_id) REFERENCES reconciliation_session (id),
    CONSTRAINT fk_deferred_consumed_session FOREIGN KEY (consumed_session_id) REFERENCES reconciliation_session (id)
);

CREATE INDEX idx_deferred_status ON deferred_movement (status);
CREATE INDEX idx_deferred_source_session ON deferred_movement (source_session_id);
