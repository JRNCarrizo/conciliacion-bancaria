-- Esquema base del módulo de conciliación (formato Excel fijo: columnas a mapear en código).
CREATE TABLE reconciliation_session (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source_bank_file_name VARCHAR(255),
    source_company_file_name VARCHAR(255),
    status VARCHAR(32) NOT NULL DEFAULT 'IMPORTED'
);

CREATE TABLE bank_transaction (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT NOT NULL,
    tx_date DATE NOT NULL,
    amount DECIMAL(19, 4) NOT NULL,
    description VARCHAR(1024),
    reference VARCHAR(255),
    CONSTRAINT fk_bank_tx_session FOREIGN KEY (session_id) REFERENCES reconciliation_session (id)
);

CREATE TABLE company_transaction (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT NOT NULL,
    tx_date DATE NOT NULL,
    amount DECIMAL(19, 4) NOT NULL,
    description VARCHAR(1024),
    reference VARCHAR(255),
    CONSTRAINT fk_company_tx_session FOREIGN KEY (session_id) REFERENCES reconciliation_session (id)
);

CREATE INDEX idx_bank_tx_session ON bank_transaction (session_id);
CREATE INDEX idx_company_tx_session ON company_transaction (session_id);
