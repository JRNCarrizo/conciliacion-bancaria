package com.SistemaConciliacion.Consiliacion.modules.auth.domain;

/**
 * ADMIN · gestión de usuarios y conciliación. OPERADOR · conciliación sin usuarios.
 * CONSULTA · solo lectura (GET) en conciliación.
 */
public enum AppRole {
	ADMIN,
	OPERADOR,
	CONSULTA
}
