package com.SistemaConciliacion.Consiliacion.modules.auth.service;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class UserPasswordService {

	private final PasswordEncoder passwordEncoder;

	public UserPasswordService(PasswordEncoder passwordEncoder) {
		this.passwordEncoder = passwordEncoder;
	}

	public String encode(String raw) {
		return passwordEncoder.encode(raw);
	}
}
