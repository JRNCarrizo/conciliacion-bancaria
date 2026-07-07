CREATE TABLE chat_read_state (
  conversation_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  last_read_message_id BIGINT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id, user_id),
  CONSTRAINT fk_crs_conv FOREIGN KEY (conversation_id) REFERENCES chat_conversation (id) ON DELETE CASCADE,
  CONSTRAINT fk_crs_user FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE
);

CREATE INDEX idx_crs_user ON chat_read_state (user_id);
