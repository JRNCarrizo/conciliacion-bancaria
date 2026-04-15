-- Last reconcile tolerances (EXACT vs AMOUNT_GAP in UI)
ALTER TABLE reconciliation_session ADD COLUMN amount_tolerance DECIMAL(19, 4) NULL;
ALTER TABLE reconciliation_session ADD COLUMN date_tolerance_days INT NULL;
