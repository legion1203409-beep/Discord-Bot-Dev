import { useState } from "react";
import { apiFetchWithMeta } from "../../hooks/use-moderation-api";
import { Input } from "../ui/input";

/**
 * Uploads a picture for a Discord message to the app's storage and returns the
 * path the bot accepts ("/api/storage/objects/…"). Throws with a message to show.
 */
export async function uploadMessageImage(
  file: File,
  guildId: string,
  csrfToken: string | undefined,
  uploadEndpoint = "/storage/uploads/request-url",
): Promise<string> {
  if (!file.type.match(/^image\/(jpeg|png|gif|webp)$/) || file.size > 10 * 1024 * 1024) {
    throw new Error("Alege PNG, JPG, GIF sau WEBP, maximum 10 MB.");
  }
  const { data: payload } = await apiFetchWithMeta<{ uploadURL?: string; objectPath?: string }>(uploadEndpoint, {
    method: "POST",
    headers: csrfToken ? { "x-csrf-token": csrfToken } : undefined,
    body: JSON.stringify({ guildId, name: file.name, size: file.size, contentType: file.type }),
  });
  if (!payload.uploadURL || !payload.objectPath) throw new Error("Uploadul a eșuat.");
  const uploaded = await fetch(payload.uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!uploaded.ok) throw new Error("Imaginea nu a putut fi încărcată în storage.");
  return `/api/storage${payload.objectPath}`;
}

export function ImageField({
  label,
  value,
  guildId,
  csrfToken,
  uploadEndpoint = "/storage/uploads/request-url",
  onChange,
}: {
  label: string;
  value?: string;
  guildId: string | null;
  csrfToken?: string;
  uploadEndpoint?: string;
  onChange: (value: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const upload = async (file: File) => {
    if (!guildId) return;
    setUploading(true);
    setError("");
    try {
      onChange(await uploadMessageImage(file, guildId, csrfToken, uploadEndpoint));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Uploadul a eșuat.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2 md:col-span-2">
      <label className="text-xs font-medium">{label}</label>
      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
        <Input
          value={value ?? ""}
          placeholder="URL imagine sau folosește Upload"
          onChange={(event) => onChange(event.target.value)}
        />
        <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-border px-3 text-sm hover:bg-muted">
          {uploading ? "Se încarcă…" : "Încarcă imagine"}
          <input
            type="file"
            className="sr-only"
            accept="image/png,image/jpeg,image/gif,image/webp"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <button
          type="button"
          className="rounded-md border border-border px-3 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!value || uploading}
          onClick={() => {
            setError("");
            onChange("");
          }}
        >
          Elimină
        </button>
      </div>
      {value && <img src={value} alt="Previzualizarea imaginii selectate" className="max-h-32 rounded-md border border-border object-contain" />}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">Emoji-urile se pot introduce direct în orice text. Sunt acceptate linkuri HTTPS și imagini încărcate aici.</p>
    </div>
  );
}