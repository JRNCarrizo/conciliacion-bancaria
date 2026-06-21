package com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain;

public enum SessionAuditEventType {
	IMPORT,
	RECONCILE,
	SAVE_BALANCES,
	CLOSE_SESSION,
	/** Solo administrador: vuelve a habilitar edición tras un cierre. */
	REOPEN_SESSION,
	/** Apertura explícita del detalle (GET con recordAccess); no incluye refrescos silenciosos en UI. */
	VIEW_DETAIL,
	/** Quitar un vínculo manual o automático; los movimientos vuelven a pendientes. */
	UNLINK_PAIR,
	/** Actualización incremental de archivo banco o empresa en sesión abierta. */
	REIMPORT,
	/** Corte de jornada: snapshot PDF + resumen KPIs sin cerrar la sesión. */
	SAVE_CHECKPOINT,
	/** Cambio del nombre legible de la sesión. */
	RENAME_SESSION,
	/** Pendiente enviado a la bolsa de diferidos (próxima conciliación). */
	DEFER_MOVEMENT,
	/** Diferidos incorporados desde períodos anteriores. */
	INCORPORATE_DEFERRED,
	/** Diferido devuelto a pendientes de la sesión origen. */
	RESTORE_DEFERRED,
	/** Vínculo N:M manual entre movimientos de banco y empresa. */
	CREATE_GROUP,
	/** Se deshace un grupo N:M; los movimientos vuelven a pendientes. */
	UNLINK_GROUP
}
