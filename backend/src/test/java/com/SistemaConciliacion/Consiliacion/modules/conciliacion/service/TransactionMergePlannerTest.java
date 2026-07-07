package com.SistemaConciliacion.Consiliacion.modules.conciliacion.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.service.TransactionMergePlanner.ExistingRow;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.service.TransactionMergePlanner.MergePlan;

class TransactionMergePlannerTest {

	private static final LocalDate D = LocalDate.of(2025, 3, 10);

	@Test
	void unchangedRowsMatchByFingerprint() {
		ImportRowSnapshot file = ImportRowSnapshot.bank(D, new BigDecimal("100.50"), "REF-1", "Pago");
		ExistingRow existing = new ExistingRow(1L, file.contentFingerprint(), file.correctionKey());
		MergePlan plan = TransactionMergePlanner.plan(List.of(existing), List.of(file));
		assertEquals(1, plan.unchangedCount());
		assertTrue(plan.updates().isEmpty());
		assertTrue(plan.inserts().isEmpty());
		assertTrue(plan.deleteIds().isEmpty());
	}

	@Test
	void newRowIsInsert() {
		ImportRowSnapshot file = ImportRowSnapshot.bank(D, new BigDecimal("50"), "NUEVO", "Alta");
		MergePlan plan = TransactionMergePlanner.plan(List.of(), List.of(file));
		assertEquals(1, plan.addedCount());
		assertTrue(plan.deleteIds().isEmpty());
	}

	@Test
	void missingInFileIsDelete() {
		ImportRowSnapshot existingSnap = ImportRowSnapshot.bank(D, new BigDecimal("10"), "X", "viejo");
		ExistingRow existing = new ExistingRow(7L, existingSnap.contentFingerprint(), existingSnap.correctionKey());
		MergePlan plan = TransactionMergePlanner.plan(List.of(existing), List.of());
		assertEquals(1, plan.removedCount());
		assertEquals(List.of(7L), plan.deleteIds());
	}

	@Test
	void correctionUpdatesSameKeyDifferentAmount() {
		ImportRowSnapshot old = ImportRowSnapshot.bank(D, new BigDecimal("100"), "REF-A", "desc");
		ImportRowSnapshot corrected = ImportRowSnapshot.bank(D, new BigDecimal("120"), "REF-A", "desc");
		ExistingRow existing = new ExistingRow(3L, old.contentFingerprint(), old.correctionKey());
		MergePlan plan = TransactionMergePlanner.plan(List.of(existing), List.of(corrected));
		assertEquals(1, plan.updatedCount());
		assertEquals(3L, plan.updates().get(0).existingId());
		assertTrue(plan.deleteIds().isEmpty());
	}

	@Test
	void duplicateFingerprintsConsumeOldestFirst() {
		ImportRowSnapshot snap = ImportRowSnapshot.bank(D, new BigDecimal("1"), "DUP", "");
		ExistingRow e1 = new ExistingRow(1L, snap.contentFingerprint(), snap.correctionKey());
		ExistingRow e2 = new ExistingRow(2L, snap.contentFingerprint(), snap.correctionKey());
		MergePlan plan = TransactionMergePlanner.plan(List.of(e1, e2), List.of(snap));
		assertEquals(1, plan.unchangedCount());
		assertEquals(1, plan.removedCount());
		assertEquals(List.of(2L), plan.deleteIds());
	}
}
