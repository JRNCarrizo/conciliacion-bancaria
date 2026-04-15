-- Una sola clasificación por par conciliado (no duplicada en cada movimiento).
ALTER TABLE reconciliation_pair ADD COLUMN classification VARCHAR(128);

-- Copiar valor existente desde los movimientos (si había; preferir banco si ambos).
UPDATE reconciliation_pair rp
SET classification = COALESCE(
  (SELECT NULLIF(TRIM(b.pending_classification), '') FROM bank_transaction b WHERE b.id = rp.bank_transaction_id),
  (SELECT NULLIF(TRIM(c.pending_classification), '') FROM company_transaction c WHERE c.id = rp.company_transaction_id)
);

UPDATE bank_transaction SET pending_classification = NULL
WHERE id IN (SELECT bank_transaction_id FROM reconciliation_pair);

UPDATE company_transaction SET pending_classification = NULL
WHERE id IN (SELECT company_transaction_id FROM reconciliation_pair);
