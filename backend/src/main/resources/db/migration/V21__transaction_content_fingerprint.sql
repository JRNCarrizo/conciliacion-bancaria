ALTER TABLE bank_transaction
    ADD COLUMN content_fingerprint VARCHAR(64);

ALTER TABLE company_transaction
    ADD COLUMN content_fingerprint VARCHAR(64);

CREATE INDEX idx_bank_tx_session_fp ON bank_transaction (session_id, content_fingerprint);
CREATE INDEX idx_company_tx_session_fp ON company_transaction (session_id, content_fingerprint);
