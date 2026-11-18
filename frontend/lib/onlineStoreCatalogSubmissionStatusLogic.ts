import type { CatalogChangeType, CatalogSubmissionItemDecision } from "./onlineStoreCatalogTypes";

export interface RawSubmissionStatusRow {
  approvedCatalogStyleId: number;
  colorName: string;
  changeType: CatalogChangeType;
  decision: CatalogSubmissionItemDecision;
  decisionNotes: string | null;
  decidedAt: string | null;
  submissionId: number;
  submittedAt: string;
  styleCode: string;
  displayName: string;
}

// "Handle multiple historical submissions correctly, including cases
// where a newer decision supersedes an older one": the same (style,
// color) pair can appear in more than one submission over a store's
// history -- e.g. a color is added and approved, later removed and
// resubmitted, or rejected and later re-requested. Only the most
// recent submission's row should ever be shown as the CURRENT status
// for that pair; an older, superseded row is historical noise, not a
// second, conflicting "current" status.
//
// Deliberately keyed by (style, color) ALONE, not also by changeType:
// computeCatalogDiff() (onlineStoreCatalogDiffLogic.ts) guarantees a
// given pair is at most one of 'added'/'removed' within a single
// submission, but an 'added' row from an older submission and a
// 'removed' row from a newer one both describe the SAME pair's
// history over time, and must compete for "latest" against each
// other -- keying by changeType too would let both show up at once
// (e.g. "Approved" from the old add alongside "Pending" from the new
// removal), which is exactly the wrong, confusing status display this
// function exists to prevent.
// Pure and DB-free so it's directly unit-testable.
export function pickLatestSubmissionStatus(rows: RawSubmissionStatusRow[]): RawSubmissionStatusRow[] {
  const latestByKey = new Map<string, RawSubmissionStatusRow>();
  for (const row of rows) {
    const key = `${row.approvedCatalogStyleId}:${row.colorName}`;
    const current = latestByKey.get(key);
    if (!current) {
      latestByKey.set(key, row);
      continue;
    }
    const isNewer =
      row.submittedAt > current.submittedAt ||
      (row.submittedAt === current.submittedAt && row.submissionId > current.submissionId);
    if (isNewer) latestByKey.set(key, row);
  }
  return Array.from(latestByKey.values());
}
