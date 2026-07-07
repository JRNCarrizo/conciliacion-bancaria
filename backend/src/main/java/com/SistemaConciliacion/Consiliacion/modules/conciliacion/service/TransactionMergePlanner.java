package com.SistemaConciliacion.Consiliacion.modules.conciliacion.service;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Planifica reimportación: filas iguales, nuevas, corregidas y eliminadas (multiset + clave de corrección).
 */
public final class TransactionMergePlanner {

	private TransactionMergePlanner() {
	}

	public record ExistingRow(long id, String contentFingerprint, String correctionKey) {
	}

	public record RowUpdate(long existingId, ImportRowSnapshot newData) {
	}

	public record MergePlan(
			int unchangedCount,
			List<Long> unchangedIds,
			List<RowUpdate> updates,
			List<ImportRowSnapshot> inserts,
			List<Long> deleteIds) {

		public int addedCount() {
			return inserts.size();
		}

		public int updatedCount() {
			return updates.size();
		}

		public int removedCount() {
			return deleteIds.size();
		}
	}

	public static MergePlan plan(List<ExistingRow> existingRows, List<ImportRowSnapshot> fileRows) {
		Map<String, Deque<ExistingRow>> byFingerprint = new HashMap<>();
		for (ExistingRow row : existingRows) {
			String fp = row.contentFingerprint();
			if (fp == null || fp.isBlank()) {
				continue;
			}
			byFingerprint.computeIfAbsent(fp, k -> new ArrayDeque<>()).addLast(row);
		}

		List<Long> unchangedIds = new ArrayList<>();
		List<ImportRowSnapshot> unmatchedFile = new ArrayList<>();

		for (ImportRowSnapshot fileRow : fileRows) {
			Deque<ExistingRow> pool = byFingerprint.get(fileRow.contentFingerprint());
			if (pool != null && !pool.isEmpty()) {
				unchangedIds.add(pool.removeFirst().id());
			} else {
				unmatchedFile.add(fileRow);
			}
		}

		List<ExistingRow> remaining = new ArrayList<>();
		for (Deque<ExistingRow> pool : byFingerprint.values()) {
			remaining.addAll(pool);
		}

		List<RowUpdate> updates = new ArrayList<>();
		Iterator<ImportRowSnapshot> fileIt = unmatchedFile.iterator();
		while (fileIt.hasNext()) {
			ImportRowSnapshot candidate = fileIt.next();
			ExistingRow match = takeCorrectionMatch(remaining, candidate);
			if (match != null) {
				updates.add(new RowUpdate(match.id(), candidate));
				fileIt.remove();
			}
		}

		List<ImportRowSnapshot> inserts = List.copyOf(unmatchedFile);
		List<Long> deleteIds = remaining.stream().map(ExistingRow::id).toList();

		return new MergePlan(unchangedIds.size(), unchangedIds, updates, inserts, deleteIds);
	}

	private static ExistingRow takeCorrectionMatch(List<ExistingRow> remaining, ImportRowSnapshot fileRow) {
		for (int i = 0; i < remaining.size(); i++) {
			ExistingRow existing = remaining.get(i);
			if (!Objects.equals(existing.correctionKey(), fileRow.correctionKey())) {
				continue;
			}
			if (Objects.equals(existing.contentFingerprint(), fileRow.contentFingerprint())) {
				continue;
			}
			remaining.remove(i);
			return existing;
		}
		return null;
	}
}
