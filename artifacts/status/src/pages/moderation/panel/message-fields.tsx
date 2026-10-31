/**
 * Câmpurile pentru mesajele pe care botul le trimite în Discord: text cu emoji
 * (din listă sau de pe server) și imagine (link HTTPS sau încărcată în
 * panou). Folosite de paginile Verificare și Tichete.
 */
import React, { useId, useState } from "react";
import { EmojiField } from "../../../components/moderation/EmojiField";
import { uploadMessageImage } from "../../../components/moderation/ImageField";
import { useBotDraft } from "./bot-draft";
import { Fld, Ico, Spinner, cx } from "./fields";
import { isMessageImageUrl } from "./verification-model";

export function EmojiTextField({ label, hint, value, onChange, max, multiline, rows, replacement, optional, testId }: {
  label: string; hint?: React.ReactNode; value: string; onChange: (next: string) => void; max: number;
  multiline?: boolean; rows?: number; replacement?: boolean; optional?: boolean; testId?: string;
}) {
  const draft = useBotDraft();
  const id = useId();
  return (
    <Fld wide label={label} hint={hint} labelId={`${id}-l`} testId={testId}>
      <div className="pn-emoji">
        <EmojiField
          value={value} onChange={onChange} multiline={multiline} rows={rows} maxLength={max} replacement={replacement}
          aria-label={label} className="pn-inp" guildId={draft.guildId} csrfToken={draft.csrfToken} emojis={draft.metadata?.emojis}
          onEmojiCreated={async () => { await draft.refetchMetadata(); }}
        />
      </div>
      <span className="pn-count">{value.length}/{max}</span>
      {!optional && !value.trim() ? <p className="pn-err" role="alert">{label} nu poate fi gol.</p> : null}
    </Fld>
  );
}

export function ImageUrlField({ label, hint, value, onChange, testId }: {
  label: string; hint?: React.ReactNode; value: string; onChange: (next: string) => void; testId?: string;
}) {
  const draft = useBotDraft();
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();
  const invalid = !isMessageImageUrl(value.trim());
  const upload = async (file: File) => {
    if (!draft.guildId) return;
    setUploading(true);
    setProblem(null);
    try {
      onChange(await uploadMessageImage(file, draft.guildId, draft.csrfToken));
    } catch (failure) {
      setProblem(failure instanceof Error ? failure.message : "Imaginea nu a putut fi încărcată.");
    } finally {
      setUploading(false);
    }
  };
  return (
    <Fld wide label={label} hint={hint} htmlFor={id} testId={testId}>
      <div className="pn-img">
        {value && !invalid ? <img src={value} alt="" className="pn-img-th" /> : <span className="pn-img-th is-empty" aria-hidden="true"><Ico name="image" /></span>}
        <input
          id={id} className="pn-inp" value={value} placeholder="https://… sau încarcă o imagine" autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
        />
        <label className={cx("pn-btn-ghost pn-btn-sm", (uploading || !draft.guildId) && "is-disabled")}>
          {uploading ? <><Spinner />Se încarcă</> : <><Ico name="image" />Încarcă</>}
          <input
            type="file" className="pn-sr" accept="image/png,image/jpeg,image/gif,image/webp" disabled={uploading || !draft.guildId}
            aria-label={`Încarcă ${label.toLocaleLowerCase("ro")}`}
            onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) void upload(file); }}
          />
        </label>
        {value ? <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => onChange("")}>Scoate</button> : null}
      </div>
      {invalid ? <p className="pn-err" role="alert">Folosește un link HTTPS sau încarcă o imagine.</p> : null}
      {problem ? <p className="pn-err" role="alert">{problem}</p> : null}
    </Fld>
  );
}
