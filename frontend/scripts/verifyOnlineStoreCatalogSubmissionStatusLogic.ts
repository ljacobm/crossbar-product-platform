import assert from "node:assert/strict";
import { pickLatestSubmissionStatus, type RawSubmissionStatusRow } from "../lib/onlineStoreCatalogSubmissionStatusLogic";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    console.error(`FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function row(overrides: Partial<RawSubmissionStatusRow>): RawSubmissionStatusRow {
  return {
    approvedCatalogStyleId: 1,
    colorName: "Black",
    changeType: "added",
    decision: "pending",
    decisionNotes: null,
    decidedAt: null,
    submissionId: 1,
    submittedAt: "2026-01-01T00:00:00.000Z",
    styleCode: "ST430",
    displayName: "Test Style",
    ...overrides,
  };
}

run(
  "requirement -- newer decision supersedes an older one for the same (style, color)",
  () => {
    const older = row({ submissionId: 1, submittedAt: "2026-01-01T00:00:00.000Z", decision: "rejected", decisionNotes: "too similar to another color" });
    const newer = row({ submissionId: 2, submittedAt: "2026-02-01T00:00:00.000Z", decision: "pending", decisionNotes: null });
    const result = pickLatestSubmissionStatus([older, newer]);
    assert.equal(result.length, 1);
    assert.equal(result[0].submissionId, 2);
    assert.equal(result[0].decision, "pending");
  }
);

run("input order does not affect which row wins -- always the latest submittedAt", () => {
  const older = row({ submissionId: 1, submittedAt: "2026-01-01T00:00:00.000Z" });
  const newer = row({ submissionId: 2, submittedAt: "2026-02-01T00:00:00.000Z" });
  const result = pickLatestSubmissionStatus([newer, older]);
  assert.equal(result.length, 1);
  assert.equal(result[0].submissionId, 2);
});

run("same submittedAt ties are broken by the higher submissionId (inserted later)", () => {
  const a = row({ submissionId: 5, submittedAt: "2026-01-01T00:00:00.000Z" });
  const b = row({ submissionId: 6, submittedAt: "2026-01-01T00:00:00.000Z" });
  const result = pickLatestSubmissionStatus([a, b]);
  assert.equal(result.length, 1);
  assert.equal(result[0].submissionId, 6);
});

run("different (style, color) pairs never collapse into each other", () => {
  const black = row({ approvedCatalogStyleId: 1, colorName: "Black", changeType: "added" });
  const red = row({ approvedCatalogStyleId: 1, colorName: "Red", changeType: "added" });
  const otherStyleBlack = row({ approvedCatalogStyleId: 2, colorName: "Black", changeType: "added" });
  const result = pickLatestSubmissionStatus([black, red, otherStyleBlack]);
  assert.equal(result.length, 3);
});

run(
  "same (style, color) pair DOES collapse across changeType -- an older 'added' row and a newer 'removed' row for the same pair are one history, not two statuses",
  () => {
    const addedApproved = row({
      submissionId: 1,
      submittedAt: "2026-01-01T00:00:00.000Z",
      changeType: "added",
      decision: "approved",
    });
    const removedPending = row({
      submissionId: 2,
      submittedAt: "2026-02-01T00:00:00.000Z",
      changeType: "removed",
      decision: "pending",
    });
    const result = pickLatestSubmissionStatus([addedApproved, removedPending]);
    assert.equal(result.length, 1);
    assert.equal(result[0].submissionId, 2);
    assert.equal(result[0].changeType, "removed");
    assert.equal(result[0].decision, "pending");
  }
);

run("add -> approve -> remove: the removal (newer) wins over the earlier approval", () => {
  const added = row({
    submissionId: 1,
    submittedAt: "2026-01-01T00:00:00.000Z",
    changeType: "added",
    decision: "approved",
  });
  const removed = row({
    submissionId: 2,
    submittedAt: "2026-03-01T00:00:00.000Z",
    changeType: "removed",
    decision: "approved",
  });
  const result = pickLatestSubmissionStatus([added, removed]);
  assert.equal(result.length, 1);
  assert.equal(result[0].submissionId, 2);
  assert.equal(result[0].changeType, "removed");
});

run(
  "add -> reject -> revise -> approve: the later approved resubmission wins over the earlier rejection, notes included",
  () => {
    const rejected = row({
      submissionId: 1,
      submittedAt: "2026-01-01T00:00:00.000Z",
      changeType: "added",
      decision: "rejected",
      decisionNotes: "not approved for this store yet",
    });
    const approved = row({
      submissionId: 2,
      submittedAt: "2026-02-01T00:00:00.000Z",
      changeType: "added",
      decision: "approved",
      decisionNotes: null,
    });
    const result = pickLatestSubmissionStatus([rejected, approved]);
    assert.equal(result.length, 1);
    assert.equal(result[0].submissionId, 2);
    assert.equal(result[0].decision, "approved");
    assert.equal(result[0].decisionNotes, null);
  }
);

run("an empty input returns an empty result", () => {
  assert.deepEqual(pickLatestSubmissionStatus([]), []);
});
