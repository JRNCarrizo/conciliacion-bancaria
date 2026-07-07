package com.SistemaConciliacion.Consiliacion.modules.chat.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.SistemaConciliacion.Consiliacion.modules.chat.domain.ChatReadState;
import com.SistemaConciliacion.Consiliacion.modules.chat.domain.ChatReadStatePk;

public interface ChatReadStateRepository extends JpaRepository<ChatReadState, ChatReadStatePk> {
}
