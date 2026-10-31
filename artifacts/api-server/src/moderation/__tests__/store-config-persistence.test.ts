import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { describe, expect, it, vi } from "vitest";
import { parseModerationConfig } from "../config";
import { PostgresModerationStore } from "../store";

describe.skipIf(!process.env.DATABASE_URL)("moderation configuration PostgreSQL persistence", () => {
  it("reloads action and staff-alert settings from an isolated schema", async () => {
    const schema = `moderation_config_test_${randomUUID().replace(/-/g, "")}`;
    const setupClient = await pool.connect();
    const testClient = await pool.connect();
    const originalTestClientRelease = testClient.release.bind(testClient);
    const originalConnect = pool.connect.bind(pool);
    const connectSpy = vi.spyOn(pool, "connect").mockImplementation(async () => ({
      query: testClient.query.bind(testClient),
      release: () => {},
    }) as never);
    const querySpy = vi.spyOn(pool, "query").mockImplementation(((...args: unknown[]) =>
      testClient.query(...args as Parameters<typeof testClient.query>)) as never);
    const writeStore = new PostgresModerationStore();
    const readStore = new PostgresModerationStore();
    const writeSchemaSpy = vi.spyOn(writeStore, "ensureSchema").mockResolvedValue();
    const readSchemaSpy = vi.spyOn(readStore, "ensureSchema").mockResolvedValue();
    const pruneSpy = vi.spyOn(writeStore, "pruneCases").mockResolvedValue(0);

    try {
      await setupClient.query(`CREATE SCHEMA "${schema}"`);
      await setupClient.query(`
        CREATE TABLE "${schema}".moderation_configs (
          guild_id text PRIMARY KEY, config jsonb NOT NULL, version integer NOT NULL DEFAULT 1,
          updated_by text, updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE "${schema}".moderation_audit_logs (
          id uuid PRIMARY KEY, guild_id text NOT NULL, actor_id text, event_type text NOT NULL,
          target_type text, target_id text, detail jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        );
      `);
      await testClient.query(`SET search_path TO "${schema}"`);

      const guildId = "123456789012345678";
      const config = parseModerationConfig({
        autoMod: {
          enabled: true,
          logChannelId: "234567890123456789",
          wordFilter: { enabled: true, action: "warn", deleteMessage: true },
          linkBlock: { enabled: true, action: "mute", deleteMessage: false },
        },
        antiRaid: {
          enabled: true,
          alertChannelId: "345678901234567890",
          rule: { enabled: true, action: "kick", deleteMessage: true },
        },
        antiSpam: {
          enabled: true,
          logChannelId: "456789012345678901",
          message: { enabled: true, action: "ban", deleteMessage: false },
        },
        antiFlood: {
          enabled: true,
          logChannelId: "567890123456789012",
          longMessage: { enabled: true, action: "mute", deleteMessage: true },
        },
        suspiciousBehavior: {
          enabled: true,
          action: "warn",
          alertChannelId: "678901234567890123",
          massDeletes: { enabled: true, action: "mute", deleteMessage: false },
        },
        ai: {
          enabled: true,
          action: "mute",
          deleteMessage: true,
          logChannelId: "789012345678901234",
          categorySettings: {
            threats: { action: "warn", deleteMessage: false },
          },
        },
      });

      await writeStore.putConfig(guildId, config, "isolated-test-operator", 0);

      // A new store instance reads the committed database row, just as a
      // restarted service does when it hydrates configuration from PostgreSQL.
      const loaded = await readStore.getConfig(guildId);
      expect(loaded.version).toBe(1);
      expect(loaded.config).toEqual(config);
      expect(loaded.config.autoMod.wordFilter).toMatchObject({
        action: "warn",
        deleteMessage: true,
      });
      expect(loaded.config.autoMod.linkBlock).toMatchObject({
        action: "mute",
        deleteMessage: false,
      });
      expect(loaded.config.autoMod.logChannelId).toBe("234567890123456789");
      expect(loaded.config.antiRaid.alertChannelId).toBe("345678901234567890");
      expect(loaded.config.antiSpam.message).toMatchObject({
        action: "ban",
        deleteMessage: false,
      });
      expect(loaded.config.antiFlood.longMessage).toMatchObject({
        action: "mute",
        deleteMessage: true,
      });
      expect(loaded.config.suspiciousBehavior).toMatchObject({
        action: "warn",
        alertChannelId: "678901234567890123",
        massDeletes: { action: "mute", deleteMessage: false },
      });
      expect(loaded.config.ai).toMatchObject({
        action: "mute",
        deleteMessage: true,
        logChannelId: "789012345678901234",
        categorySettings: { threats: { action: "warn", deleteMessage: false } },
      });
    } finally {
      connectSpy.mockRestore();
      querySpy.mockRestore();
      writeSchemaSpy.mockRestore();
      readSchemaSpy.mockRestore();
      pruneSpy.mockRestore();
      originalTestClientRelease(true);
      await setupClient.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      setupClient.release();
    }
  });
});
