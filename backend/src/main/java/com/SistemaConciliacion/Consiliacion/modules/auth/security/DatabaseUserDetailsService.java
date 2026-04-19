package com.SistemaConciliacion.Consiliacion.modules.auth.security;

import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import com.SistemaConciliacion.Consiliacion.modules.auth.repository.AppUserRepository;

@Service
public class DatabaseUserDetailsService implements UserDetailsService {

	private final AppUserRepository appUserRepository;

	public DatabaseUserDetailsService(AppUserRepository appUserRepository) {
		this.appUserRepository = appUserRepository;
	}

	@Override
	public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
		var u = appUserRepository.findByUsernameIgnoreCase(username)
				.orElseThrow(() -> new UsernameNotFoundException(username));
		return User.builder()
				.username(u.getUsername())
				.password(u.getPasswordHash())
				.disabled(!u.isEnabled())
				.authorities("ROLE_" + u.getRole().name())
				.build();
	}
}
