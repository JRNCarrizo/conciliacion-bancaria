ALTER TABLE reconciliation_session
    ADD COLUMN display_name VARCHAR(120) NULL AFTER source_company_file_name;
