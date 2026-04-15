package com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain;

public enum SessionStatus {
	IMPORTED,
	RECONCILED,
	/** Sesión cerrada por el usuario: saldos, clasificación de pendientes y conciliación estructural bloqueados. */
	CLOSED
}
