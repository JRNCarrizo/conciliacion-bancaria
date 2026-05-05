CREATE TABLE chat_conversation (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_low_id BIGINT NOT NULL,
  user_high_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_chat_conversation_pair UNIQUE (user_low_id, user_high_id),
  CONSTRAINT chk_chat_pair_order CHECK (user_low_id < user_high_id),
  CONSTRAINT fk_chat_conv_low FOREIGN KEY (user_low_id) REFERENCES app_user (id),
  CONSTRAINT fk_chat_conv_high FOREIGN KEY (user_high_id) REFERENCES app_user (id)
);

CREATE INDEX idx_chat_conv_low ON chat_conversation (user_low_id);
CREATE INDEX idx_chat_conv_high ON chat_conversation (user_high_id);
CREATE INDEX idx_chat_conv_updated ON chat_conversation (updated_at);

CREATE TABLE chat_message (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT NOT NULL,
  sender_id BIGINT NOT NULL,
  body VARCHAR(4000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_chat_msg_conv FOREIGN KEY (conversation_id) REFERENCES chat_conversation (id),
  CONSTRAINT fk_chat_msg_sender FOREIGN KEY (sender_id) REFERENCES app_user (id)
);

CREATE INDEX idx_chat_msg_conv_created ON chat_message (conversation_id, created_at);
