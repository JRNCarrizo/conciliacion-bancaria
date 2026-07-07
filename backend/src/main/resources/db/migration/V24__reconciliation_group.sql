CREATE TABLE reconciliation_group (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT NOT NULL,
    match_source VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
    classification VARCHAR(128),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rgroup_session FOREIGN KEY (session_id) REFERENCES reconciliation_session (id)
);

CREATE INDEX idx_rgroup_session ON reconciliation_group (session_id);

CREATE TABLE reconciliation_group_bank_member (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    group_id BIGINT NOT NULL,
    bank_transaction_id BIGINT NOT NULL,
    CONSTRAINT fk_rgbm_group FOREIGN KEY (group_id) REFERENCES reconciliation_group (id) ON DELETE CASCADE,
    CONSTRAINT fk_rgbm_bank FOREIGN KEY (bank_transaction_id) REFERENCES bank_transaction (id),
    CONSTRAINT uk_rgbm_bank UNIQUE (bank_transaction_id)
);

CREATE INDEX idx_rgbm_group ON reconciliation_group_bank_member (group_id);

CREATE TABLE reconciliation_group_company_member (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    group_id BIGINT NOT NULL,
    company_transaction_id BIGINT NOT NULL,
    CONSTRAINT fk_rgcm_group FOREIGN KEY (group_id) REFERENCES reconciliation_group (id) ON DELETE CASCADE,
    CONSTRAINT fk_rgcm_company FOREIGN KEY (company_transaction_id) REFERENCES company_transaction (id),
    CONSTRAINT uk_rgcm_company UNIQUE (company_transaction_id)
);

CREATE INDEX idx_rgcm_group ON reconciliation_group_company_member (group_id);
