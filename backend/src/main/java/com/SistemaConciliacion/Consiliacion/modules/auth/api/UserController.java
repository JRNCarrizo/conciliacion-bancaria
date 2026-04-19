package com.SistemaConciliacion.Consiliacion.modules.auth.api;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.SistemaConciliacion.Consiliacion.modules.auth.api.dto.CreateUserRequest;
import com.SistemaConciliacion.Consiliacion.modules.auth.api.dto.UpdateUserRequest;
import com.SistemaConciliacion.Consiliacion.modules.auth.api.dto.UserResponseDto;
import com.SistemaConciliacion.Consiliacion.modules.auth.service.UserManagementService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/users")
@Validated
public class UserController {

	private final UserManagementService userManagementService;

	public UserController(UserManagementService userManagementService) {
		this.userManagementService = userManagementService;
	}

	@GetMapping
	public List<UserResponseDto> list() {
		return userManagementService.listAll();
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public UserResponseDto create(@Valid @RequestBody CreateUserRequest body) {
		return userManagementService.create(body);
	}

	@PatchMapping("/{id}")
	public UserResponseDto update(@PathVariable long id, @RequestBody UpdateUserRequest body) {
		return userManagementService.update(id, body);
	}
}
