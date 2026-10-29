/**
 * Controalele panoului de protecție. Sunt elemente native (buton, input, select),
 * stilizate din panel.css, ca să funcționeze la fel în orice browser și să poată fi
 * folosite cu tastatura și cu cititoare de ecran.
 */
import React, { useId, useLayoutEffect, useRef, useState } from "react";
import {
  ACTION_HINT, ACTION_LABEL, MAX_MUTE_MINUTES, MIN_MUTE_MINUTES, MUTE_PRESETS, availableActions, describeMuteLength, describeTicks,
  hasUnavailableDelete, isDiscordId, isValidInteger, isValidMuteMinutes, lockedActions, readMuteMinutes, readTicks, setMuteMinutes, toggleTick,
  type ActionKey, type RuleKind, type RuleLike,
} from "./model";

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ */
/* Pictograme (căile sunt cele din designul „Oracolul Cenușii")        */
/* ------------------------------------------------------------------ */

const ICON_PATHS = {
  trash: "M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13",
  alert: "M12 3.5L21.5 20h-19zM12 10v4.5M12 17.2v.3",
  mute: "M11 5L6 9H3v6h3l5 4V5zM16 9.5l5 5M21 9.5l-5 5",
  leave: "M14 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 2 17.5V19M8 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 8 11zM16 11h6",
  ban: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8",
  mega: "M4 10v4a1 1 0 0 0 1 1h2.2L12 19V5L7.2 9H5a1 1 0 0 0-1 1zM15.5 9a4 4 0 0 1 0 6M18.3 6.5a7.5 7.5 0 0 1 0 11",
  check: "M5 12.5l4.5 4.5L19 7.5",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
  down: "M6 9l6 6 6-6",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.6v.4",
  power: "M12 3.5v8M7 6.3a7.5 7.5 0 1 0 10 0",
  lock: "M6.5 10.5h11a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3",
  shield: "M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z",
  filter: "M4 5h16l-6 7.5V19l-4-2v-4.5z",
  msgx: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12zM9.8 9.8l4.4 4.4M14.2 9.8l-4.4 4.4",
  waves: "M3 8c2 0 2-1.6 4.5-1.6S9.5 8 12 8s2-1.6 4.5-1.6S18.5 8 21 8M3 13c2 0 2-1.6 4.5-1.6S9.5 13 12 13s2-1.6 4.5-1.6S18.5 13 21 13M3 18c2 0 2-1.6 4.5-1.6S9.5 18 12 18s2-1.6 4.5-1.6S18.5 18 21 18",
  raid: "M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19.5v-.8A3.7 3.7 0 0 1 6.7 15h3.6a3.7 3.7 0 0 1 3.7 3.7v.8M18 20V9M15 12l3-3 3 3",
  gavel: "M13 4l7 7-3 3-7-7zM13.5 10.5l-9 9M3 21h9",
  scan: "M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M7 12s2-3.2 5-3.2 5 3.2 5 3.2-2 3.2-5 3.2S7 12 7 12zM12 13.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z",
} as const;
export type IconName = keyof typeof ICON_PATHS;

export function Ico({ name }: { name: IconName }) {
  return (
    <svg className="pn-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

export function Spinner() {
  return <span className="pn-spinner" aria-hidden="true" />;
}

/* ------------------------------------------------------------------ */
/* Rânduri și carduri                                                  */
/* ------------------------------------------------------------------ */

export function SectionCard({ title, small, children, testId }: { title: string; small?: React.ReactNode; children: React.ReactNode; testId?: string }) {
  const id = useId();
  return (
    <section className="pn-card" aria-labelledby={id} data-testid={testId}>
      <h3 className="pn-card-t" id={id}>{title}{small ? <small>{small}</small> : null}</h3>
      {children}
    </section>
  );
}

export function Fields({ children }: { children: React.ReactNode }) {
  return <div className="pn-fields">{children}</div>;
}

export function Fld({ label, hint, wide, htmlFor, labelId, children, testId }: {
  label?: string; hint?: React.ReactNode; wide?: boolean; htmlFor?: string; labelId?: string; children?: React.ReactNode; testId?: string;
}) {
  return (
    <div className={cx("pn-fld", wide && "pn-wide")} data-testid={testId}>
      {(label || hint) && (
        <div className="pn-fl">
          {label ? (htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span className="pn-lbl" id={labelId}>{label}</span>) : null}
          {hint ? <p className="pn-fh">{hint}</p> : null}
        </div>
      )}
      {children !== undefined && children !== null ? <div className="pn-fc">{children}</div> : null}
    </div>
  );
}

export function Note({ tone = "info", children, testId, role }: { tone?: "info" | "warn" | "bad" | "plain"; children: React.ReactNode; testId?: string; role?: "status" | "alert" }) {
  return (
    <div className={cx("pn-note", tone !== "info" && `is-${tone}`)} data-testid={testId} role={role}>
      <Ico name={tone === "warn" || tone === "bad" ? "alert" : "info"} />
      <div>{children}</div>
    </div>
  );
}

/** O notă pe un rând întreg, în locul unui câmp. */
export function NoteRow(props: React.ComponentProps<typeof Note>) {
  return <div className="pn-fld pn-wide"><Note {...props} /></div>;
}

/* ------------------------------------------------------------------ */
/* Comutator                                                            */
/* ------------------------------------------------------------------ */

export function Switch({ checked, onChange, label, labelledBy, large, disabled, testId, id }: {
  checked: boolean; onChange: (next: boolean) => void; label?: string; labelledBy?: string; large?: boolean; disabled?: boolean; testId?: string; id?: string;
}) {
  return (
    <button
      type="button" role="switch" id={id} aria-checked={checked} aria-label={label} aria-labelledby={label ? undefined : labelledBy}
      data-testid={testId} disabled={disabled} className={cx("pn-sw", large && "pn-sw-lg")} onClick={() => onChange(!checked)}
    />
  );
}

export function SwitchField({ label, hint, checked, onChange, testId, disabled }: {
  label: string; hint?: React.ReactNode; checked: boolean; onChange: (next: boolean) => void; testId?: string; disabled?: boolean;
}) {
  const id = useId();
  return (
    <Fld label={label} hint={hint} labelId={`${id}-l`}>
      <Switch checked={checked} onChange={onChange} labelledBy={`${id}-l`} testId={testId} disabled={disabled} />
    </Fld>
  );
}

/* ------------------------------------------------------------------ */
/* Număr întreg cu pași                                                 */
/* ------------------------------------------------------------------ */

function NumberBox({ id, value, onChange, min, max, invalid, placeholder, label, testId }: {
  id: string; value: number | undefined; onChange: (next: number | undefined) => void; min: number; max: number;
  invalid: boolean; placeholder?: string; label?: string; testId?: string;
}) {
  const bump = (delta: number) => {
    const base = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : placeholder !== undefined ? Number(placeholder) : min;
    onChange(Math.min(max, Math.max(min, base + delta)));
  };
  return (
    <div className={cx("pn-num", invalid && "is-bad")}>
      <button type="button" className="pn-nb" tabIndex={-1} aria-hidden="true" onClick={() => bump(-1)}>−</button>
      <input
        id={id} type="number" inputMode="numeric" min={min} max={max} step={1} aria-invalid={invalid} aria-label={label}
        data-testid={testId} placeholder={placeholder}
        value={typeof value === "number" && Number.isFinite(value) ? value : ""}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(raw === "" ? undefined : Number(raw));
        }}
      />
      <button type="button" className="pn-nb" tabIndex={-1} aria-hidden="true" onClick={() => bump(1)}>+</button>
    </div>
  );
}

export function NumField({ label, hint, value, onChange, min, max, unit, validate, testId }: {
  label: string; hint?: string; value: number | undefined; onChange: (next: number | undefined) => void; min: number; max: number;
  unit?: string; validate?: Array<number | undefined>; testId?: string;
}) {
  const id = useId();
  const values = validate ?? [value];
  const invalid = values.some((candidate) => candidate !== undefined && !isValidInteger(candidate, min, max));
  return (
    <Fld label={label} hint={hint} htmlFor={id} testId={testId ? `${testId}-field` : undefined}>
      <NumberBox id={id} value={value} onChange={onChange} min={min} max={max} invalid={invalid} testId={testId} />
      {unit ? <span className="pn-unit">{unit}</span> : null}
      {invalid ? <p className="pn-err" role="alert">Introdu un număr întreg între {min} și {max}.</p> : null}
    </Fld>
  );
}

/* ------------------------------------------------------------------ */
/* Segmente (o singură alegere dintr-un șir scurt)                      */
/* ------------------------------------------------------------------ */

export function Seg({ label, hint, value, options, onChange, testId }: {
  label: string; hint?: string; value: string; options: ReadonlyArray<readonly [string, string]>; onChange: (next: string) => void; testId?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const place = () => {
      const active = root.querySelector<HTMLElement>('[aria-checked="true"]');
      if (!active || active.offsetWidth === 0) return;
      root.style.setProperty("--x", `${active.offsetLeft}px`);
      root.style.setProperty("--w", `${active.offsetWidth}px`);
      setReady(true);
    };
    place();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(place);
    observer.observe(root);
    return () => observer.disconnect();
  }, [value, options]);
  const selected = options.findIndex(([key]) => key === value);
  const onKey = (event: React.KeyboardEvent, index: number) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next]![0]);
    requestAnimationFrame(() => ref.current?.querySelectorAll<HTMLElement>("button")[next]?.focus());
  };
  return (
    <Fld label={label} hint={hint} labelId={`${id}-l`}>
      <div
        ref={ref} className={cx("pn-seg", ready && "is-ready")} role="radiogroup" aria-labelledby={`${id}-l`} data-testid={testId}
        style={{ "--seg-cols": options.length > 3 ? 2 : options.length } as React.CSSProperties}
      >
        {options.map(([key, text], index) => {
          const checked = key === value;
          return (
            <button
              key={key} type="button" role="radio" aria-checked={checked} tabIndex={checked || (selected < 0 && index === 0) ? 0 : -1}
              onClick={() => onChange(key)} onKeyDown={(event) => onKey(event, index)}
            >{text}</button>
          );
        })}
      </div>
    </Fld>
  );
}

/* ------------------------------------------------------------------ */
/* Pastile bifabile                                                     */
/* ------------------------------------------------------------------ */

export function Pill({ checked, onChange, children, testId, label }: {
  checked: boolean; onChange: (next: boolean) => void; children: React.ReactNode; testId?: string; label?: string;
}) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} data-testid={testId} className="pn-pill" onClick={() => onChange(!checked)}>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Liste de cuvinte (chips)                                             */
/* ------------------------------------------------------------------ */

export function ChipsField({ label, hint, values, onChange, placeholder = "Scrie și apasă Enter", max = 500, maxLength = 200, testId }: {
  label: string; hint?: string; values: string[] | undefined; onChange: (next: string[]) => void; placeholder?: string; max?: number; maxLength?: number; testId?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState("");
  const [limitReached, setLimitReached] = useState(false);
  const list = Array.isArray(values) ? values : [];

  /** Adaugă ce a scris omul (un element pe rând). Întoarce true dacă a fost ceva de adăugat. */
  const commit = (raw: string): boolean => {
    const items = raw.split(/\r?\n/).map((item) => item.trim().slice(0, maxLength)).filter(Boolean);
    if (items.length === 0) return false;
    const seen = new Set(list.map((item) => item.toLocaleLowerCase("ro")));
    const next = [...list];
    let refused = false;
    for (const item of items) {
      const key = item.toLocaleLowerCase("ro");
      if (seen.has(key)) continue;
      if (next.length >= max) { refused = true; continue; }
      seen.add(key);
      next.push(item);
    }
    setLimitReached(refused);
    if (next.length !== list.length) onChange(next);
    return true;
  };

  return (
    <Fld label={label} hint={hint} htmlFor={id} wide>
      <div className="pn-areaf">
        <div className="pn-chips" onClick={() => inputRef.current?.focus()}>
          {list.map((item, index) => (
            <span className="pn-chip" key={`${item}:${index}`}>
              <span title={item}>{item}</span>
              <button type="button" aria-label={`Șterge ${item}`} onClick={(event) => { event.stopPropagation(); onChange(list.filter((_, position) => position !== index)); inputRef.current?.focus(); }}>
                <Ico name="x" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef} id={id} data-testid={testId} value={pending} placeholder={placeholder} maxLength={maxLength} autoComplete="off" spellCheck={false}
            onChange={(event) => setPending(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              event.preventDefault();
              if (commit(pending)) setPending("");
            }}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text");
              if (!/\r?\n/.test(text)) return;
              event.preventDefault();
              commit(`${pending}\n${text}`);
              setPending("");
            }}
            onBlur={() => { if (pending.trim() && commit(pending)) setPending(""); }}
          />
        </div>
        {list.length > 0 || limitReached ? (
          <span className="pn-count" role={limitReached ? "alert" : undefined}>
            {limitReached ? `Lista are limita de ${max} de elemente. ` : ""}{list.length}/{max}
          </span>
        ) : null}
      </div>
    </Fld>
  );
}

/* ------------------------------------------------------------------ */
/* Canale Discord                                                       */
/* ------------------------------------------------------------------ */

export type ChannelOption = { id: string; name: string; type: number | string; parentId?: string | null };
export type RoleOption = { id: string; name: string; managed?: boolean; position?: number };

const TEXT_CHANNEL_TYPES: ReadonlyArray<number | string> = [0, 5, "text", "announcement", "GuildText", "GuildAnnouncement", "GuildNews"];
const MESSAGE_CHANNEL_TYPES = new Set([
  "0", "5", "10", "11", "12", "15", "16",
  "GuildText", "GuildAnnouncement", "AnnouncementThread", "PublicThread", "PrivateThread", "GuildForum", "GuildMedia",
]);

export function ChannelField({ label, hint, value, channels, onChange, onCreate, creating, createDisabled }: {
  label: string; hint?: string; value: string | null | undefined; channels: ChannelOption[] | undefined; onChange: (next: string | null) => void;
  onCreate?: () => void; creating?: boolean; createDisabled?: boolean;
}) {
  const id = useId();
  const selectable = (channels ?? []).filter((channel) => TEXT_CHANNEL_TYPES.includes(channel.type));
  const channelId = value ?? "";
  const available = selectable.some((channel) => channel.id === channelId);
  const unavailable = Boolean(channelId) && channels !== undefined && !available;
  return (
    <Fld label={label} hint={hint} labelId={`${id}-l`}>
      <div className="pn-chan">
        <select className="pn-inp" aria-label={`Canal pentru ${label}`} value={channelId} onChange={(event) => onChange(event.target.value || null)}>
          <option value="">Neconfigurat</option>
          {channelId && !available ? <option value={channelId}>Canal salvat, indisponibil ({channelId})</option> : null}
          {selectable.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
        </select>
        <input
          className="pn-inp pn-inp-mono" aria-label={`Canal ${label} ID fallback`} value={channelId} placeholder="ID canal Discord" inputMode="numeric" autoComplete="off"
          onChange={(event) => onChange(event.target.value.trim() || null)}
        />
        {onCreate ? (
          <button type="button" className="pn-btn-ghost pn-btn-sm" aria-label={`Creează canal pentru ${label}`} disabled={createDisabled || creating} onClick={onCreate}>
            {creating ? <><Spinner />Se creează</> : <><Ico name="plus" />Creează</>}
          </button>
        ) : null}
        {channels === undefined ? <p className="pn-fh" style={{ width: "100%" }}>Lista canalelor Discord nu este disponibilă momentan; poți scrie ID-ul canalului.</p> : null}
        {unavailable ? (
          <p role="alert" className="pn-err">
            Canalul salvat nu este disponibil ca text în serverul selectat sau botul nu îl poate vedea. Alege un canal din listă ori șterge ID-ul.
          </p>
        ) : null}
      </div>
    </Fld>
  );
}

export function ChannelScope({ channels, selected, onChange }: { channels: ChannelOption[] | undefined; selected: string[]; onChange: (next: string[]) => void }) {
  const id = useId();
  const messageChannels = (channels ?? []).filter((channel) => MESSAGE_CHANNEL_TYPES.has(String(channel.type))).sort((a, b) => a.name.localeCompare(b.name));
  const chosen = new Set(selected);
  const everywhere = chosen.size === 0;
  const missing = selected.filter((channelId) => !messageChannels.some((channel) => channel.id === channelId));
  return (
    <Fld
      label="Canalele pentru blocarea linkurilor" labelId={`${id}-l`} wide
      hint="Fără canale selectate, blocarea se aplică peste tot. Alege unul sau mai multe canale pentru a o limita."
    >
      <div className="pn-areaf" role="group" aria-labelledby={`${id}-l`}>
        <div className="pn-multi">
          <button type="button" className="pn-pill" role="checkbox" aria-checked={everywhere} data-testid="link-channels-all" onClick={() => onChange([])}>
            Toate canalele
            <small>{everywhere ? "implicit" : "resetează"}</small>
          </button>
        </div>
        {messageChannels.length > 0 ? (
          <div className="pn-multi pn-scroll">
            {messageChannels.map((channel) => (
              <Pill key={channel.id} checked={chosen.has(channel.id)} testId={`link-channel-${channel.id}`}
                onChange={(next) => onChange(next ? [...new Set([...selected, channel.id])] : selected.filter((item) => item !== channel.id))}>
                #{channel.name}
              </Pill>
            ))}
          </div>
        ) : (
          <p className="pn-fh" role="status">
            {channels === undefined ? "Lista canalelor Discord nu este disponibilă momentan." : "Nu au fost găsite canale care acceptă mesaje."}
          </p>
        )}
        {missing.length > 0 ? <p className="pn-fh" role="status">{missing.length} canal(e) salvate nu apar în lista disponibilă; selecția se păstrează până o modifici.</p> : null}
      </div>
    </Fld>
  );
}

/* ------------------------------------------------------------------ */
/* Alegerea unor canale sau roluri (cu ID-uri scrise de mână)           */
/* ------------------------------------------------------------------ */

export function IdPicker({ label, hint, kind, options, selected, onChange, max = 100, testId }: {
  label: string; hint?: string; kind: "channel" | "role"; options: Array<{ id: string; name: string }> | undefined;
  selected: string[]; onChange: (next: string[]) => void; max?: number; testId: string;
}) {
  const id = useId();
  const [manual, setManual] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const chosen = new Set(selected);
  const known = new Set((options ?? []).map((option) => option.id));
  const unknown = selected.filter((value) => !known.has(value));
  const prefix = kind === "channel" ? "#" : "@";
  const what = kind === "channel" ? "canalelor" : "rolurilor";
  const toggle = (value: string, on: boolean) => {
    if (!on) { onChange(selected.filter((item) => item !== value)); setProblem(null); return; }
    if (chosen.has(value)) return;
    if (selected.length >= max) { setProblem(`Poți alege cel mult ${max}.`); return; }
    onChange([...selected, value]);
    setProblem(null);
  };
  const addManual = () => {
    const value = manual.trim();
    if (!value) return;
    if (!isDiscordId(value)) { setProblem("Un ID Discord are între 5 și 25 de cifre."); return; }
    toggle(value, true);
    setManual("");
  };
  return (
    <Fld label={label} labelId={`${id}-l`} wide hint={hint} testId={testId}>
      <div className="pn-areaf" role="group" aria-labelledby={`${id}-l`}>
        {options && options.length > 0 ? (
          <div className="pn-multi pn-scroll">
            {options.map((option) => (
              <Pill key={option.id} checked={chosen.has(option.id)} onChange={(next) => toggle(option.id, next)}>{prefix}{option.name}</Pill>
            ))}
          </div>
        ) : (
          <p className="pn-fh" role="status">
            {options === undefined ? `Lista ${what} Discord nu este disponibilă momentan; le poți adăuga după ID.` : `Nu am găsit ${kind === "channel" ? "canale" : "roluri"} pe server.`}
          </p>
        )}
        {unknown.length > 0 ? (
          <div className="pn-multi">
            {unknown.map((value) => (
              <Pill key={value} checked label={`ID ${value}, nu apare în listă`} onChange={() => toggle(value, false)}>ID {value}<small>nu apare în listă</small></Pill>
            ))}
          </div>
        ) : null}
        <div className="pn-chan">
          <input
            className="pn-inp pn-inp-mono" aria-label={`Adaugă după ID: ${label}`} value={manual} placeholder="ID Discord" inputMode="numeric" autoComplete="off"
            onChange={(event) => setManual(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addManual(); } }}
          />
          <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={addManual}><Ico name="plus" />Adaugă</button>
          <span className="pn-unit">{selected.length}/{max}</span>
        </div>
        {problem ? <p className="pn-err" role="alert">{problem}</p> : null}
      </div>
    </Fld>
  );
}

/* ------------------------------------------------------------------ */
/* Ce face botul: acțiuni bifate                                        */
/* ------------------------------------------------------------------ */

const ACTION_VISUAL: Record<ActionKey, { icon: IconName; color: string }> = {
  delete: { icon: "trash", color: "#FF8A6B" },
  warn: { icon: "alert", color: "#F5C451" },
  mute: { icon: "mute", color: "#4FB6FF" },
  kick: { icon: "leave", color: "#FF9F4A" },
  ban: { icon: "ban", color: "#FF5F6B" },
  alert: { icon: "mega", color: "#B28CFF" },
};

export function ActionTicks({ label = "Ce face botul", hint, rule, kind, only, onChange, testId, notes, summary }: {
  label?: string; hint?: string; rule: RuleLike; kind: RuleKind; only?: readonly ActionKey[]; onChange: (next: RuleLike) => void; testId: string;
  notes?: React.ReactNode;
  /** Replaces the list of ticked actions in the summary (a rule that follows its module says so). */
  summary?: string;
}) {
  const id = useId();
  const ticks = readTicks(rule, kind);
  const offered = availableActions(kind, only);
  const locked = lockedActions(kind);
  const minutes = readMuteMinutes(rule);
  const muteInvalid = rule.muteMinutes !== undefined && !isValidMuteMinutes(rule.muteMinutes);
  const parts = describeTicks(rule, kind, only);
  return (
    <Fld
      label={label} labelId={`${id}-l`} wide testId={testId}
      hint={hint ?? "Bifează tot ce vrei să se întâmple. Mute, kick și ban nu merg împreună: alegerea uneia o scoate pe cealaltă."}
    >
      <div className="pn-acts" role="group" aria-labelledby={`${id}-l`}>
        {offered.map((key) => {
          const visual = ACTION_VISUAL[key];
          const fixed = locked.includes(key);
          return (
            <button
              key={key} type="button" role="checkbox" aria-checked={ticks[key]} aria-label={ACTION_LABEL[key]} disabled={fixed} title={ACTION_HINT[key]}
              data-testid={`${testId}-${key}`} className="pn-act" style={{ "--ac": visual.color } as React.CSSProperties}
              onClick={() => onChange(toggleTick(rule, key, !ticks[key], kind, only))}
            >
              <span className="pn-act-ic"><Ico name={visual.icon} /></span>
              <span className="pn-act-t">{ACTION_LABEL[key]}{fixed ? <small>mereu</small> : null}</span>
              <span className="pn-act-ck" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-6.5" /></svg></span>
            </button>
          );
        })}
      </div>
      {ticks.mute ? (
        <div className="pn-mute">
          <label htmlFor={`${id}-mute`}>Durata mute-ului (minute)</label>
          <NumberBox
            id={`${id}-mute`} value={rule.muteMinutes} placeholder="10"
            min={MIN_MUTE_MINUTES} max={MAX_MUTE_MINUTES} invalid={muteInvalid} testId={`${testId}-mute-minutes`}
            onChange={(next) => onChange(setMuteMinutes(rule, next))}
          />
          <span className="pn-unit">{muteInvalid ? "" : describeMuteLength(minutes)}{rule.muteMinutes === undefined ? " (implicit)" : ""}</span>
          <div className="pn-presets" role="group" aria-label="Durate uzuale">
            {MUTE_PRESETS.map(([value, text]) => (
              <button key={value} type="button" className="pn-preset" aria-pressed={!muteInvalid && minutes === value} onClick={() => onChange(setMuteMinutes(rule, value))}>{text}</button>
            ))}
          </div>
          {muteInvalid ? <p className="pn-err" role="alert">Introdu un număr întreg între {MIN_MUTE_MINUTES} și {MAX_MUTE_MINUTES}.</p> : null}
        </div>
      ) : null}
      {hasUnavailableDelete(rule, kind) ? (
        <Note tone="warn">
          Această regulă are salvată vechea acțiune „Șterge mesajul”, care nu se poate aplica aici (evenimentul nu este un mesaj), așa că nu face nimic.
          Bifează altă acțiune ca s-o înlocuiești.
        </Note>
      ) : null}
      {notes}
      <p className="pn-summary" aria-live="polite" data-testid={`${testId}-summary`}>
        Selectat: <strong>{summary ?? (parts.length ? parts.join(" + ") : "Doar înregistrare, fără acțiuni")}</strong>
      </p>
    </Fld>
  );
}
