---
name: GitHub bulk snapshot uploads
description: Upload large workspace snapshots through the Replit GitHub connector when Git CLI authentication is unavailable.
---

When Git CLI push cannot authenticate but the GitHub connector is authorized and has repository write permission, the Git Database API can import a tracked workspace snapshot without exposing credentials.

**Why:** A roughly 680 MiB, 961-file snapshot uploaded successfully as Git blobs, but one large tree request returned HTTP 502. Creating trees sequentially in batches of 50, using each returned tree SHA as the next `base_tree`, succeeded.

**How to apply:** Confirm repository ownership, visibility, and write permission first. Upload exact tracked blobs, create tree batches sequentially, create a commit, update the branch ref, and verify the final file count. This imports the current snapshot; it does not preserve local commit history.

The workspace Git remote can still be authorized through Replit's Git proxy when the GitHub REST integration is unavailable or reports no push permission. Confirm the sanitized `origin` points to the selected repository, run a non-forced dry run to the intended branch, then push normally and verify the remote ref matches local HEAD.

**Why:** The API connection and Git proxy can use different authorization contexts; in this workspace the API connection was unavailable, but the configured Git remote safely updated the selected branch.

**How to apply:** Prefer the existing `origin` over creating another credential path. Never force-push; verify the repository, destination branch, and resulting tree before reporting completion.