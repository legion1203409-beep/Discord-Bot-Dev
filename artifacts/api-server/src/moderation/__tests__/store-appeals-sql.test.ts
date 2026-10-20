import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { describe, expect, it, vi } from "vitest";
import { PostgresModerationStore } from "../store";

describe.skipIf(!process.env.DATABASE_URL)("moderation appeals PostgreSQL concurrency", () => {
  it("serializes appeal updates and permits a retry after clarification delivery fails", async () => {
    const schema = `appeal_test_${randomUUID().replace(/-/g, "")}`;
    const setupClient = await pool.connect();
    const originalConnect = pool.connect.bind(pool);
    const pendingReleases: Promise<void>[] = [];
    const connectSpy = vi.spyOn(pool, "connect").mockImplementation(async () => {
      const client = await originalConnect();
      await client.query(`SET search_path TO "${schema}"`);
      return {
        query: client.query.bind(client),
        release: (error?: Error | boolean) => {
          const reset = client.query("RESET search_path")
            .then(() => client.release(error))
            .catch(() => client.release(error));
          pendingReleases.push(reset);
        },
      } as never;
    });
    const store = new PostgresModerationStore();
    const ensureSchemaSpy = vi.spyOn(store, "ensureSchema").mockResolvedValue();

    try {
      await setupClient.query(`CREATE SCHEMA "${schema}"`);
      await setupClient.query(`CREATE TABLE "${schema}".moderation_cases (
        id uuid PRIMARY KEY, guild_id text NOT NULL, subject_id text NOT NULL,
        action_type text NOT NULL DEFAULT 'timeout', status text NOT NULL DEFAULT 'open'
      )`);
      await setupClient.query(`CREATE TABLE "${schema}".moderation_appeals (
        id uuid PRIMARY KEY, guild_id text NOT NULL, case_id uuid NOT NULL,
        appellant_id text NOT NULL, channel_id text NOT NULL,
        status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now(),
        decided_at timestamptz, decided_by text, decision_note text,
        pending_clarification_id uuid, pending_clarification_question text, pending_clarification_by text,
        UNIQUE (guild_id, channel_id)
      )`);
      await setupClient.query(`CREATE UNIQUE INDEX moderation_appeals_one_pending_idx
        ON "${schema}".moderation_appeals (guild_id, case_id) WHERE status = 'pending'`);
      await setupClient.query(`CREATE TABLE "${schema}".moderation_case_notes (
        id uuid PRIMARY KEY, case_id uuid NOT NULL, guild_id text NOT NULL,
        author_id text NOT NULL, body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      )`);
      await setupClient.query(`CREATE TABLE "${schema}".moderation_audit_logs (
        id uuid PRIMARY KEY, guild_id text NOT NULL, actor_id text,
        event_type text NOT NULL, target_type text, target_id text,
        detail jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
      )`);

      const guildId = "123456789012345678";
      const appellantId = "234567890123456789";
      const submitCaseId = randomUUID();
      const decideCaseId = randomUUID();
      const clarificationCaseId = randomUUID();
      await setupClient.query(
        `INSERT INTO "${schema}".moderation_cases (id, guild_id, subject_id)
         VALUES ($1, $2, $3), ($4, $2, $3), ($5, $2, $3)`,
        [submitCaseId, guildId, appellantId, decideCaseId, clarificationCaseId],
      );

      const submissions = await Promise.all([
        store.createAppeal({
          guildId, caseId: submitCaseId, appellantId, channelId: "appeal-submit-a", reason: "First request",
        }),
        store.createAppeal({
          guildId, caseId: submitCaseId, appellantId, channelId: "appeal-submit-b", reason: "Concurrent request",
        }),
      ]);
      expect(submissions.filter(Boolean)).toHaveLength(1);

      const submissionRows = await setupClient.query(
        `SELECT channel_id, status FROM "${schema}".moderation_appeals
         WHERE guild_id = $1 AND case_id = $2`,
        [guildId, submitCaseId],
      );
      expect(submissionRows.rows).toHaveLength(1);
      expect(submissionRows.rows[0].status).toBe("pending");
      const submissionNotes = await setupClient.query(
        `SELECT body FROM "${schema}".moderation_case_notes WHERE guild_id = $1 AND case_id = $2`,
        [guildId, submitCaseId],
      );
      expect(submissionNotes.rows).toHaveLength(1);
      expect(submissionNotes.rows[0].body).toContain("Contestație depusă");
      const submissionAudit = await setupClient.query(
        `SELECT event_type FROM "${schema}".moderation_audit_logs
         WHERE guild_id = $1 AND target_id = $2`,
        [guildId, submitCaseId],
      );
      expect(submissionAudit.rows).toEqual([{ event_type: "case.appeal_submitted" }]);

      expect(await store.createAppeal({
        guildId, caseId: decideCaseId, appellantId, channelId: "appeal-decide", reason: "Please review",
      })).toBe(true);
      const decisions = await Promise.all([
        store.decideAppeal({
          guildId, caseId: decideCaseId, channelId: "appeal-decide", actorId: "staff-accepted",
          decision: "accepted", note: "Accepted note",
        }),
        store.decideAppeal({
          guildId, caseId: decideCaseId, channelId: "appeal-decide", actorId: "staff-rejected",
          decision: "rejected", note: "Rejected note",
        }),
      ]);
      expect(decisions.filter(Boolean)).toHaveLength(1);

      // Read through a fresh PostgreSQL connection after all transaction clients
      // have returned to the pool; these rows are database-backed, not process state.
      const observer = await pool.connect();
      try {
        const persisted = await observer.query(
          `SELECT case_id, channel_id, status, decided_by, decision_note
           FROM "${schema}".moderation_appeals WHERE guild_id = $1 ORDER BY case_id`,
          [guildId],
        );
        expect(persisted.rows).toHaveLength(2);
        expect(persisted.rows.find((row) => row.case_id === submitCaseId)).toMatchObject({
          channel_id: submissionRows.rows[0].channel_id,
          status: "pending",
          decided_by: null,
          decision_note: null,
        });
        const decided = persisted.rows.find((row) => row.case_id === decideCaseId);
        expect(decided).toMatchObject({ status: "accepted" });
        expect(["staff-accepted", "staff-rejected"]).toContain(decided?.decided_by);
        expect(["Accepted note", "Rejected note"]).toContain(decided?.decision_note);

        const decisionNotes = await observer.query(
          `SELECT author_id, body FROM "${schema}".moderation_case_notes
           WHERE guild_id = $1 AND case_id = $2 AND body LIKE 'Contestație % de %'`,
          [guildId, decideCaseId],
        );
        expect(decisionNotes.rows).toHaveLength(1);
        expect(decisionNotes.rows[0].author_id).toBe(decided?.decided_by);
        expect(decisionNotes.rows[0].body).toContain(decided?.decision_note);

        const decisionAudit = await observer.query(
          `SELECT actor_id, event_type FROM "${schema}".moderation_audit_logs
           WHERE guild_id = $1 AND target_id = $2 AND event_type <> 'case.appeal_submitted'`,
          [guildId, decideCaseId],
        );
        expect(decisionAudit.rows).toHaveLength(1);
        expect(decisionAudit.rows[0].actor_id).toBe(decided?.decided_by);
        expect(decisionAudit.rows[0].event_type).toBe(`case.appeal_${decided?.status}`);

      expect(await store.createAppeal({
        guildId, caseId: clarificationCaseId, appellantId,
        channelId: "appeal-clarification", reason: "Please review this case",
      })).toBe(true);
      const clarificationIds = [randomUUID(), randomUUID()];
      const requests = await Promise.all(clarificationIds.map((clarificationId, index) =>
        store.requestAppealClarification({
          guildId, caseId: clarificationCaseId, channelId: "appeal-clarification",
          actorId: `staff-${index}`, clarificationId, question: `Question ${index}`,
        }),
      ));
      expect(requests.filter(Boolean)).toHaveLength(1);
      const winnerIndex = requests[0] ? 0 : 1;
      const activeClarificationId = clarificationIds[winnerIndex]!;
      expect(await store.getPendingAppealClarification({
        guildId, caseId: clarificationCaseId, channelId: "appeal-clarification",
        clarificationId: activeClarificationId,
      })).toMatchObject({ appellantId, question: `Question ${requests[0] ? 0 : 1}` });
      expect(await store.getPendingAppealClarification({
        guildId: "different-guild", caseId: clarificationCaseId, channelId: "appeal-clarification",
        clarificationId: activeClarificationId,
      })).toBeNull();

      expect(await store.respondAppealClarification({
        guildId, caseId: clarificationCaseId, channelId: "appeal-clarification",
        appellantId: "wrong-member", clarificationId: activeClarificationId, answer: "not allowed",
      })).toBeNull();
      const responses = await Promise.all([1, 2].map(() => store.respondAppealClarification({
        guildId, caseId: clarificationCaseId, channelId: "appeal-clarification",
        appellantId, clarificationId: activeClarificationId, answer: "Here is the detail.",
      })));
      expect(responses.filter(Boolean)).toHaveLength(1);
      expect(await store.getPendingAppealClarification({
        guildId, caseId: clarificationCaseId, channelId: "appeal-clarification",
        clarificationId: activeClarificationId,
      })).toBeNull();

      const clarificationHistory = await setupClient.query(
        `SELECT author_id, body FROM "${schema}".moderation_case_notes
         WHERE guild_id = $1 AND case_id = $2 ORDER BY created_at`,
        [guildId, clarificationCaseId],
      );
      expect(clarificationHistory.rows).toHaveLength(3);
      expect(clarificationHistory.rows[1]?.body).toContain("a solicitat clarificări");
      expect(clarificationHistory.rows[1]?.author_id).toBe(`staff-${winnerIndex}`);
      expect(clarificationHistory.rows[1]?.body).toContain(`Question ${winnerIndex}`);
      expect(clarificationHistory.rows[2]).toMatchObject({
        author_id: appellantId, body: expect.stringContaining("Here is the detail."),
      });
      const clarificationAudit = await setupClient.query(
        `SELECT actor_id, event_type FROM "${schema}".moderation_audit_logs
         WHERE guild_id = $1 AND target_id = $2 ORDER BY created_at`,
        [guildId, clarificationCaseId],
      );
      expect(clarificationAudit.rows.map((row) => row.event_type)).toEqual([
        "case.appeal_submitted",
        "case.appeal_clarification_requested",
        "case.appeal_clarification_answered",
      ]);
      expect(clarificationAudit.rows.map((row) => row.actor_id)).toEqual([
        appellantId, `staff-${winnerIndex}`, appellantId,
      ]);
      const unchanged = await setupClient.query(
        `SELECT status, decided_by, decision_note FROM "${schema}".moderation_appeals
         WHERE guild_id = $1 AND case_id = $2`,
        [guildId, clarificationCaseId],
      );
      expect(unchanged.rows[0]).toEqual({ status: "pending", decided_by: null, decision_note: null });

      const failedClarificationId = randomUUID();
      expect(await store.requestAppealClarification({
        guildId, caseId: clarificationCaseId, channelId: "appeal-clarification",
        actorId: "staff-delivery-failed", clarificationId: failedClarificationId,
        question: "Question whose delivery fails",
      })).toEqual({ appellantId });

      // A stale button from another ticket or request must not clear the active request.
      await store.cancelAppealClarification({
        guildId: "different-guild", caseId: clarificationCaseId, channelId: "appeal-clarification",
        actorId: "staff-delivery-failed", clarificationId: failedClarificationId,
      });
      await store.cancelAppealClarification({
        guildId, caseId: clarificationCaseId, channelId: "different-ticket",
        actorId: "staff-delivery-failed", clarificationId: failedClarificationId,
      });
      await store.cancelAppealClarification({
        guildId, caseId: clarificationCaseId, channelId: "appeal-clarification",
        actorId: "staff-delivery-failed", clarificationId: randomUUID(),
      });
      expect(await store.getPendingAppealClarification({
        guildId, caseId: clarificationCaseId, channelId: "appeal-clarification",
        clarificationId: failedClarificationId,
      })).toMatchObject({ appellantId, question: "Question whose delivery fails" });

      await store.cancelAppealClarification({
        guildId, caseId: clarificationCaseId, channelId: "appeal-clarification",
        actorId: "staff-delivery-failed", clarificationId: failedClarificationId,
      });
      expect(await store.getPendingAppealClarification({
        guildId, caseId: clarificationCaseId, channelId: "appeal-clarification",
        clarificationId: failedClarificationId,
      })).toBeNull();

      const retryClarificationId = randomUUID();
      expect(await store.requestAppealClarification({
        guildId, caseId: clarificationCaseId, channelId: "appeal-clarification",
        actorId: "staff-retry", clarificationId: retryClarificationId,
        question: "Question delivered on retry",
      })).toEqual({ appellantId });
      expect(await store.getPendingAppealClarification({
        guildId, caseId: clarificationCaseId, channelId: "appeal-clarification",
        clarificationId: retryClarificationId,
      })).toMatchObject({ appellantId, question: "Question delivered on retry" });

      const failedDeliveryHistory = await setupClient.query(
        `SELECT author_id, body FROM "${schema}".moderation_case_notes
         WHERE guild_id = $1 AND case_id = $2
           AND body LIKE 'Solicitarea de clarificări nu a putut fi publicată%'`,
        [guildId, clarificationCaseId],
      );
      expect(failedDeliveryHistory.rows).toEqual([{
        author_id: "staff-delivery-failed",
        body: expect.stringContaining("ticketul <#appeal-clarification>"),
      }]);
      const failedDeliveryAudit = await setupClient.query(
        `SELECT actor_id, event_type, detail FROM "${schema}".moderation_audit_logs
         WHERE guild_id = $1 AND target_id = $2
           AND event_type = 'case.appeal_clarification_delivery_failed'`,
        [guildId, clarificationCaseId],
      );
      expect(failedDeliveryAudit.rows).toEqual([{
        actor_id: "staff-delivery-failed",
        event_type: "case.appeal_clarification_delivery_failed",
        detail: { channelId: "appeal-clarification", clarificationId: failedClarificationId },
      }]);
      const retryState = await setupClient.query(
        `SELECT status, decided_at, decided_by, decision_note,
                pending_clarification_id, pending_clarification_question, pending_clarification_by
           FROM "${schema}".moderation_appeals
          WHERE guild_id = $1 AND case_id = $2`,
        [guildId, clarificationCaseId],
      );
      expect(retryState.rows[0]).toEqual({
        status: "pending",
        decided_at: null,
        decided_by: null,
        decision_note: null,
        pending_clarification_id: retryClarificationId,
        pending_clarification_question: "Question delivered on retry",
        pending_clarification_by: "staff-retry",
      });
      const caseState = await setupClient.query(
        `SELECT status, action_type FROM "${schema}".moderation_cases
          WHERE guild_id = $1 AND id = $2`,
        [guildId, clarificationCaseId],
      );
      expect(caseState.rows[0]).toEqual({ status: "open", action_type: "timeout" });
      } finally {
        observer.release();
      }
    } finally {
      connectSpy.mockRestore();
      ensureSchemaSpy.mockRestore();
      await Promise.all(pendingReleases);
      await setupClient.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      setupClient.release();
    }
  });
});
