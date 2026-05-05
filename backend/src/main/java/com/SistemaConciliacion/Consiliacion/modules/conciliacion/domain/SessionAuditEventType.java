package com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain;

public enum SessionAuditEventType {
	IMPORT,
	RECONCILE,
	SAVE_BALANCES,
	CLOSE_SESSION,
	/** Solo administrador: vuelve a habilitar edición tras un cierre. */
	REOPEN_SESSION,
	/** Apertura explícita del detalle (GET con recordAccess); no incluye refrescos silenciosos en UI. */
	VIEW_DETAIL
}
