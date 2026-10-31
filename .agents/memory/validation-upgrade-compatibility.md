---
name: Validation upgrade compatibility
description: Why moderation configuration must preserve pre-parse defaults and sparse overrides across validator upgrades.
---

Missing moderation objects must still populate and validate every nested default, including legacy threshold transformations. Enum-keyed command grants and AI overrides are intentionally sparse, not exhaustive.

**Why:** Stored guild settings predate many newer fields. Changing missing-object behavior or requiring all enum keys can silently disable protection defaults or reject valid existing configurations.

**How to apply:** With Zod 4, use object `prefault` when the supplied default must be parsed, and `partialRecord` for sparse enum maps. Exercise empty and partially populated configurations, legacy threshold aliases, and round trips when upgrading validation dependencies.

Validation adapters must also support the upgraded validator; a successful TypeScript check does not prove they handle runtime validation failures.

**Why:** Older React Hook Form resolvers checked Zod's removed `errors` property, so invalid submissions threw instead of displaying field messages.

**How to apply:** Upgrade the form resolver alongside Zod and test invalid submissions through the installed resolver against the actual form schemas, including nested errors and input/output coercion.
