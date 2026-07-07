-- Saldos de período (opcionales, ingresados por el usuario) y clasificación de pendientes.
ALTER TABLE reconciliation_session ADD COLUMN opening_bank_balance DECIMAL(19, 4);
ALTER TABLE reconciliation_session ADD COLUMN closing_bank_balance DECIMAL(19, 4);
ALTER TABLE reconciliation_session ADD COLUMN opening_company_balance DECIMAL(19, 4);
ALTER TABLE reconciliation_session ADD COLUMN closing_company_balance DECIMAL(19, 4);

ALTER TABLE bank_transaction ADD COLUMN pending_classification VARCHAR(32);
ALTER TABLE company_transaction ADD COLUMN pending_classification VARCHAR(32);
