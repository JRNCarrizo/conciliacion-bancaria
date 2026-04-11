CREATE TABLE reconciliation_pair (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT NOT NULL,
    bank_transaction_id BIGINT NOT NULL,
    company_transaction_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pair_session FOREIGN KEY (session_id) REFERENCES reconciliation_session (id),
    CONSTRAINT fk_pair_bank FOREIGN KEY (bank_transaction_id) REFERENCES bank_transaction (id),
    CONSTRAINT fk_pair_company FOREIGN KEY (company_transaction_id) REFERENCES company_transaction (id),
    CONSTRAINT uk_pair_bank UNIQUE (bank_transaction_id),
    CONSTRAINT uk_pair_company UNIQUE (company_transaction_id)
);

CREATE INDEX idx_pair_session ON reconciliation_pair (session_id);
