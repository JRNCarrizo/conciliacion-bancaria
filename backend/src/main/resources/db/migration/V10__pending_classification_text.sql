-- Clasificación libre (texto) en pendientes; ampliar columna respecto al enum VARCHAR(32).
ALTER TABLE bank_transaction MODIFY COLUMN pending_classification VARCHAR(128);
ALTER TABLE company_transaction MODIFY COLUMN pending_classification VARCHAR(128);
