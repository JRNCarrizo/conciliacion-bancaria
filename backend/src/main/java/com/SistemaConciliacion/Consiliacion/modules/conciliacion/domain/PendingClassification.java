package com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain;

/**
 * Clasificación opcional de un movimiento pendiente (solo informativa para el reporte).
 */
public enum PendingClassification {
	COMISION,
	TRANSFERENCIA,
	DEPOSITO_TRANSITO,
	ERROR,
	OTRO
}
