-- Usuario que creó el comentario o subió el adjunto (JWT / Spring Security principal).
ALTER TABLE movement_attachment ADD COLUMN created_by_username VARCHAR(128) NULL;
ALTER TABLE pair_attachment ADD COLUMN created_by_username VARCHAR(128) NULL;
ALTER TABLE pending_movement_comment ADD COLUMN created_by_username VARCHAR(128) NULL;
ALTER TABLE reconciliation_pair_comment ADD COLUMN created_by_username VARCHAR(128) NULL;
