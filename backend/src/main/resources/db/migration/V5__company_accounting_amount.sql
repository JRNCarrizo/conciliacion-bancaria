-- Neto contable por línea (haber − debe), distinto del importe de conciliación (debe − haber, alineado al extracto).
ALTER TABLE company_transaction ADD COLUMN accounting_amount DECIMAL(19, 4);
-- Datos previos: importe guardado era conciliación; neto contable es el opuesto.
UPDATE company_transaction SET accounting_amount = -amount WHERE accounting_amount IS NULL;
