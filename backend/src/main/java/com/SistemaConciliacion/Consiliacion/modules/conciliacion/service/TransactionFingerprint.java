package com.SistemaConciliacion.Consiliacion.modules.conciliacion.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.HexFormat;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.BankTransaction;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.CompanyTransaction;

/** Huella estable de una fila importada para reimportación incremental. */
public final class TransactionFingerprint {

	private TransactionFingerprint() {
	}

	public static String forBank(LocalDate txDate, BigDecimal amount, String reference, String description) {
		return digest(join(txDate, scale(amount), norm(reference), norm(description)));
	}

	public static String forBank(BankTransaction tx) {
		return forBank(tx.getTxDate(), tx.getAmount(), tx.getReference(), tx.getDescription());
	}

	public static String forCompany(LocalDate txDate, BigDecimal amount, BigDecimal accountingAmount, String reference,
			String description) {
		return digest(join(txDate, scale(amount), scale(accountingAmount), norm(reference), norm(description)));
	}

	public static String forCompany(CompanyTransaction tx) {
		return forCompany(tx.getTxDate(), tx.getAmount(), tx.getAccountingAmount(), tx.getReference(),
				tx.getDescription());
	}

	/** Clave para detectar correcciones (misma línea de negocio, importe u otros campos distintos). */
	public static String correctionKey(LocalDate txDate, String reference, String description) {
		String ref = norm(reference);
		if (ref.isEmpty()) {
			ref = norm(description);
		}
		return txDate + "|" + ref;
	}

	private static String scale(BigDecimal value) {
		if (value == null) {
			return "";
		}
		return value.setScale(4, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString();
	}

	private static String norm(String value) {
		if (value == null) {
			return "";
		}
		return value.trim().replaceAll("\\s+", " ").toLowerCase();
	}

	private static String join(Object... parts) {
		StringBuilder sb = new StringBuilder();
		for (int i = 0; i < parts.length; i++) {
			if (i > 0) {
				sb.append('\u001f');
			}
			sb.append(parts[i] != null ? parts[i].toString() : "");
		}
		return sb.toString();
	}

	private static String digest(String canonical) {
		try {
			MessageDigest md = MessageDigest.getInstance("SHA-256");
			byte[] hash = md.digest(canonical.getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(hash);
		} catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException("SHA-256 no disponible", e);
		}
	}
}
