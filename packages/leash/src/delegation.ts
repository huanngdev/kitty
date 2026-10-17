import type { DelegationDetailCode } from "./reasons";
import type { Leash, Usage } from "./types";
import { isCategoryAllowed, isCategoryWildcard, isPayeeAllowed } from "./utils";

/** One reason a sub-leash would be broader than its parent (docs/05 §9). */
export interface DelegationViolation {
  code: "DELEGATION_EXCEEDS_PARENT";
  detail: DelegationDetailCode;
  details: string;
}

/** Result of {@link validateDelegation}. */
export type DelegationResult =
  { ok: true; reasons: readonly [] } | { ok: false; reasons: DelegationViolation[] };

/**
 * Validate that a sub-leash is never broader than its parent (docs/05 §9).
 *
 * Collects **all** violations instead of stopping at the first, each under the
 * `DELEGATION_EXCEEDS_PARENT` code with a `detail` sub-code. The parent must
 * itself be a root leash: delegation is at most two levels deep.
 */
export function validateDelegation(
  parent: Leash,
  child: Leash,
  parentUsage: Usage,
): DelegationResult {
  const violations: DelegationViolation[] = [];
  const add = (detail: DelegationDetailCode, details: string): void => {
    violations.push({ code: "DELEGATION_EXCEEDS_PARENT", detail, details });
  };

  if (child.allocationCents > parentUsage.availableCents) {
    add(
      "ALLOCATION",
      `child allocationCents ${child.allocationCents} > parent availableCents ${parentUsage.availableCents}`,
    );
  }

  if (child.limits.perTxMaxCents > parent.limits.perTxMaxCents) {
    add(
      "PER_TX",
      `child perTxMaxCents ${child.limits.perTxMaxCents} > parent perTxMaxCents ${parent.limits.perTxMaxCents}`,
    );
  }

  if (child.limits.dailyMaxCents > parent.limits.dailyMaxCents) {
    add(
      "DAILY",
      `child dailyMaxCents ${child.limits.dailyMaxCents} > parent dailyMaxCents ${parent.limits.dailyMaxCents}`,
    );
  }

  if (child.limits.maxTxPerHour > parent.limits.maxTxPerHour) {
    add(
      "RATE",
      `child maxTxPerHour ${child.limits.maxTxPerHour} > parent maxTxPerHour ${parent.limits.maxTxPerHour}`,
    );
  }

  const extraActions = child.allowedActions.filter(
    (action) => !parent.allowedActions.includes(action),
  );
  if (extraActions.length > 0) {
    add(
      "ACTIONS",
      `child allowedActions adds [${extraActions.join(", ")}] beyond parent [${parent.allowedActions.join(", ")}]`,
    );
  }
  if (child.allowedActions.includes("delegate")) {
    add(
      "DELEGATE_NOT_ALLOWED",
      'child allowedActions must not contain "delegate" in the MVP (max depth 2)',
    );
  }

  const extraPayees = child.allowedPayees.filter(
    (payee) => !isPayeeAllowed(payee, parent.allowedPayees),
  );
  if (extraPayees.length > 0) {
    add(
      "PAYEES",
      `child allowedPayees adds [${extraPayees.join(", ")}] beyond parent [${parent.allowedPayees.join(", ")}]`,
    );
  }

  if (isCategoryWildcard(child.allowedCategories)) {
    if (!isCategoryWildcard(parent.allowedCategories)) {
      add(
        "CATEGORIES",
        `child allowedCategories is ["*"] but parent is restricted to [${parent.allowedCategories.join(", ")}]`,
      );
    }
  } else {
    const extraCategories = child.allowedCategories.filter(
      (category) => !isCategoryAllowed(category, parent.allowedCategories),
    );
    if (extraCategories.length > 0) {
      add(
        "CATEGORIES",
        `child allowedCategories adds [${extraCategories.join(", ")}] beyond parent [${parent.allowedCategories.join(", ")}]`,
      );
    }
  }

  const childExpiry = Date.parse(child.expiresAt);
  const parentExpiry = Date.parse(parent.expiresAt);
  if (Number.isNaN(childExpiry) || Number.isNaN(parentExpiry)) {
    add(
      "EXPIRY",
      `invalid date: child expiresAt "${child.expiresAt}", parent expiresAt "${parent.expiresAt}"`,
    );
  } else if (childExpiry > parentExpiry) {
    add("EXPIRY", `child expiresAt ${child.expiresAt} > parent expiresAt ${parent.expiresAt}`);
  }

  if (parent.stepUpAboveCents !== null) {
    const childThreshold = child.stepUpAboveCents;
    if (childThreshold === null || childThreshold > parent.stepUpAboveCents) {
      add(
        "STEP_UP",
        `parent stepUpAboveCents ${parent.stepUpAboveCents} requires child stepUpAboveCents <= ${parent.stepUpAboveCents}, got ${childThreshold === null ? "null" : childThreshold}`,
      );
    }
  }

  if (parent.parentId !== null) {
    add(
      "DEPTH",
      `parent ${parent.id} is not a root leash (parentId ${parent.parentId}); max depth is 2`,
    );
  }

  if (violations.length === 0) {
    return { ok: true, reasons: [] };
  }
  return { ok: false, reasons: violations };
}
