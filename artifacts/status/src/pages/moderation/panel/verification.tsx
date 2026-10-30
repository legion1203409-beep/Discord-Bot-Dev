/**
 * Modulele paginii Verificare: Setări (comutatorul, canalul, rolurile primite
 * și panoul din Discord), Mesaje (textele panoului, cu previzualizare) și
 * Membri (lista care se actualizează singură și verificarea manuală). Logica
 * e în verification-model.ts; ciorna și salvarea în bot-draft.tsx.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getGetVerificationMembersQueryKey, useGetVerificationMembers } from "@workspace/api-client-react";
import { DiscordEmojiText } from "../../../components/moderation/DiscordEmojiText";
import { apiFetchWithMeta, verifyGuildMembers, type BotControlConfig } from "../../../hooks/use-moderation-api";
import { useToast } from "../../../hooks/use-toast";
import { useBotDraft } from "./bot-draft";
import { EmojiTextField, ImageUrlField } from "./message-fields";
import { usePanel } from "./context";
import { ChannelField, Fields, Fld, IdPicker, Ico, Note, NoteRow, Pill, SectionCard, Seg, Spinner, cx, type PickerOption } from "./fields";
import { countLabel, deepEqual } from "./model";
import { ModuleNotes, ModuleView } from "./rules";
import {
  DEFAULT_VERIFICATION_TEXT, MAX_EXTRA_ROLES, MEMBERS_PER_REQUEST, VERIFICATION_MODULES, VERIFICATION_TEXTS, categoryRoleLabel, chunk,
  describeGrantTotals, extraRoleCandidates, extraRoleIdsOf, filterMembers, grantButtonLabel, isCategoryRoleName, isMessageImageUrl, liveRefreshMs,
  memberCounts, missingRoleIds, profileRoles, roleProblem, verificationRoleIds, type GrantTotals, type MemberFilter, type MemberRecord,
  type VerificationModuleId, type VerificationRole,
} from "./verification-model";

const MODULE: Record<VerificationModuleId, (typeof VERIFICATION_MODULES)[number]> = Object.fromEntries(
  VERIFICATION_MODULES.map((module) => [module.id, module]),
) as Record<VerificationModuleId, (typeof VERIFICATION_MODULES)[number]>;

const useVerificationDraft = useBotDraft;

function useRoles() {
  const { roles } = usePanel();
  return useMemo(() => {
    const list = roles as VerificationRole[] | undefined;
    const byId = new Map((list ?? []).map((role) => [role.id, role]));
    return { list, byId, known: list !== undefined, name: (id: string) => byId.get(id)?.name ?? `rolul ${id}` };
  }, [roles]);
}

/* ------------------------------------------------------------------ */
/* Setări                                                              */
/* ------------------------------------------------------------------ */

/** The member's profile after verification, with the roles in Discord's order and category roles as separators. */
function ProfilePreview({ standardId, extraIds }: { standardId: string; extraIds: readonly string[] }) {
  const roles = useRoles();
  const list = profileRoles(roles.list, standardId, extraIds);
  return (
    <div className="pn-vprof" data-testid="verification-profile-preview">
      <div className="pn-vprof-top">
        <span className="pn-vprof-av" aria-hidden="true">M</span>
        <span className="pn-vprof-who"><b>Membru nou</b><small>după verificare</small></span>
        <span className="pn-vprof-ok"><Ico name="verified" />Verificat</span>
      </div>
      <p className="pn-vprof-h">Roluri · {list.length}</p>
      {list.length ? (
        <ul className="pn-vprof-roles">
          {list.map((role) => role.category ? (
            <li key={role.id} className="pn-vcat" title={role.name}><span>{categoryRoleLabel(role.name)}</span></li>
          ) : (
            <li key={role.id} className={cx("pn-vrole", !role.known && "is-unknown")} style={{ "--rc": role.color ?? "#9aa1ab" } as React.CSSProperties}>
              <i aria-hidden="true" />{role.name}{role.standard ? <small>standard</small> : null}
            </li>
          ))}
        </ul>
      ) : <p className="pn-fh">Alege rolul standard ca să vezi cum arată.</p>}
    </div>
  );
}

function PanelCard() {
  const draft = useVerificationDraft();
  const { config, saved, set, channels } = usePanel();
  const verification = config.verification as BotControlConfig["verification"];
  const savedVerification = (saved?.verification ?? {}) as Partial<BotControlConfig["verification"]>;
  const published = Boolean(savedVerification.panelMessageId);
  const savedChannel = channels?.find((channel) => channel.id === savedVerification.channelId);
  const offline = saved?.discordLive === false;
  const reason = !verification.enabled
    ? "Pornește verificarea ca să publici panoul."
    : !verification.channelId ? "Alege canalul în care apare panoul."
      : !verification.roleId ? "Alege rolul standard."
        : offline ? "Botul Discord e offline; panoul se poate publica după ce revine."
          : draft.panelRecovery?.requiresManualReconciliation ? "Reconciliază întâi panoul publicat fără ID (mai sus)." : null;
  return (
    <SectionCard title="Panoul din Discord" small={published ? "publicat" : "nepublicat"} testId="verification-panel">
      <Fields>
        <ChannelField
          label="Canalul panoului" selectLabel="Canalul panoului" value={verification.channelId || null} channels={channels}
          hint="Unde văd membrii noi butonul de verificare. Trebuie să-l vadă și cei încă neverificați."
          onChange={(next) => set(["verification", "channelId"], next ?? "")}
        />
        <Fld
          label={published ? "Panoul e publicat" : "Panoul nu e publicat încă"}
          hint={published
            ? `În ${savedChannel ? `#${savedChannel.name}` : "canalul salvat"}. Când salvezi cu verificarea pornită, botul actualizează același mesaj.`
            : "Se publică la prima salvare cu verificarea pornită, sau de aici."}
        >
          <button
            type="button" className="pn-btn pn-btn-sm" data-testid="button-publish-verification"
            disabled={Boolean(reason) || draft.saving} onClick={() => void draft.publish()}
          >
            {draft.publishing ? <><Spinner />Se publică…</> : <><Ico name="send" />{published ? "Actualizează panoul" : "Publică panoul"}</>}
          </button>
        </Fld>
        {reason ? <NoteRow tone="plain">{reason}</NoteRow> : null}
      </Fields>
    </SectionCard>
  );
}

function RolesCard() {
  const { config, set } = usePanel();
  const roles = useRoles();
  const standardId: string = config.verification.roleId || "";
  const extraIds = extraRoleIdsOf(config).filter((id) => id !== standardId);
  const standardProblem = standardId ? roleProblem(roles.byId.get(standardId), "standard", roles.known) : null;
  const standardOptions = (roles.list ?? [])
    .filter((role) => !role.managed)
    .sort((a, b) => (b.position ?? 0) - (a.position ?? 0) || a.name.localeCompare(b.name, "ro"));
  const extraOptions: PickerOption[] | undefined = extraRoleCandidates(roles.list, standardId)?.map((role) => ({
    id: role.id, name: role.name,
    note: role.assignable === false ? "deasupra botului" : isCategoryRoleName(role.name) ? "categorie" : undefined,
  }));
  const extraProblems = extraIds
    .map((id) => ({ id, problem: roleProblem(roles.byId.get(id), "extra", roles.known) }))
    .filter((item) => item.problem);
  const id = useId();
  return (
    <SectionCard title="Roluri primite" small="la buton și la verificarea manuală" testId="verification-roles">
      <Fields>
        <Fld label="Rolul standard" labelId={`${id}-l`} hint="Rolul care înseamnă „verificat”: după el știe botul cine e verificat.">
          <select
            className="pn-inp" aria-labelledby={`${id}-l`} value={standardId} data-testid="verification-role"
            onChange={(event) => {
              const next = event.target.value;
              set(["verification", "roleId"], next);
              if (extraRoleIdsOf(config).includes(next)) set(["verification", "extraRoleIds"], extraRoleIdsOf(config).filter((item) => item !== next));
            }}
          >
            <option value="">Alege rolul</option>
            {standardId && !roles.byId.has(standardId) ? <option value={standardId}>Rol salvat, indisponibil ({standardId})</option> : null}
            {standardOptions.map((role) => (
              <option key={role.id} value={role.id}>@{role.name}{role.assignable === false ? " · deasupra botului" : ""}</option>
            ))}
          </select>
          {standardProblem ? <p className={standardProblem.blocking ? "pn-err" : "pn-fh"} role="alert">{standardProblem.text}</p> : null}
        </Fld>
        <IdPicker
          label="Roluri în plus" kind="role" options={extraOptions} selected={extraIds} max={MAX_EXTRA_ROLES} testId="verification-extra-roles"
          hint="De exemplu un rol de categorie, separatorul „━━ MEMBRI ━━”, sau un rol de început. Le primește oricine se verifică, împreună cu rolul standard."
          onChange={(next) => set(["verification", "extraRoleIds"], next)}
        >
          {extraProblems.map(({ id: roleId, problem }) => (
            <p key={roleId} className="pn-err" role="alert">@{roles.name(roleId)}: {problem!.text}</p>
          ))}
        </IdPicker>
        <Fld wide label="Pe profilul membrului" hint="Rolurile, în ordinea din Discord. Rolurile de categorie apar ca separator.">
          <ProfilePreview standardId={standardId} extraIds={extraIds} />
        </Fld>
        <NoteRow tone="plain">
          Cine e deja verificat primește rolurile noi când mai apasă o dată butonul, sau pe loc, din <Link href={MODULE.members.route}>Membri</Link>.
        </NoteRow>
      </Fields>
    </SectionCard>
  );
}

function AdminCard() {
  const draft = useVerificationDraft();
  const { capabilities } = usePanel();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const openInvite = async () => {
    if (!draft.guildId || loading) return;
    setLoading(true);
    try {
      const { data } = await apiFetchWithMeta<{ inviteUrl?: string }>(`/guilds/${draft.guildId}/verification/invite`);
      if (!data?.inviteUrl) throw new Error("Linkul de autorizare nu este disponibil.");
      window.open(data.inviteUrl, "_blank", "noopener,noreferrer");
    } catch (failure) {
      toast({ variant: "destructive", title: "Autorizarea botului a eșuat", description: failure instanceof Error ? failure.message : "Încearcă din nou." });
    } finally {
      setLoading(false);
    }
  };
  return (
    <SectionCard title="Botul pe server">
      <Fields>
        <Fld label="Permisiunile botului" hint="Botul are nevoie de Manage Roles, iar rolul lui trebuie să fie deasupra tuturor rolurilor date la verificare.">
          <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => void openInvite()} disabled={loading} data-testid="button-verification-invite">
            {loading ? <Spinner /> : <Ico name="bot" />}Autorizează / invită botul
          </button>
        </Fld>
        {capabilities?.canManageRoles === false ? (
          <NoteRow tone="warn">Botul nu are permisiunea Manage Roles, deci nu poate da rolurile. Dă-i-o din setările serverului.</NoteRow>
        ) : null}
      </Fields>
    </SectionCard>
  );
}

/** A panel published while its settings could not be saved, or a save the server applied only in part. */
function RecoveryNotes() {
  const draft = useVerificationDraft();
  const recovery = draft.panelRecovery;
  if (!recovery && !draft.partialError) return null;
  return (
    <Note tone="bad" role="alert" testId="verification-recovery">
      <p><b>{recovery ? "Panoul a fost publicat, dar setările s-au salvat doar în parte." : "Serverul a aplicat salvarea doar în parte; efectele din Discord nu sunt confirmate."}</b></p>
      <p>{recovery?.message || draft.partialError}</p>
      {recovery?.panelMessageId ? (
        <p>
          {recovery.storageUnavailable
            ? `ID-ul panoului (${recovery.panelMessageId}) e ținut doar în pagina asta; nu o reîncărca înainte să salvezi din nou.`
            : `ID-ul panoului publicat (${recovery.panelMessageId}) e păstrat: la următoarea salvare botul editează același mesaj, fără un panou dublu.`}
        </p>
      ) : null}
      {recovery?.requiresManualReconciliation ? (
        <>
          <p>
            {recovery.storageUnavailable
              ? "Pagina nu poate păstra ID-ul după reîncărcare. Verifică panoul din Discord înainte de o nouă salvare, ca să nu apară unul dublu."
              : "ID-ul panoului nu s-a întors. Șterge sau verifică panoul din Discord înainte de o nouă salvare, ca să nu apară unul dublu."}
          </p>
          <button
            type="button" className="pn-btn-ghost pn-btn-sm"
            onClick={() => { if (window.confirm("Ai verificat panoul din Discord și se poate salva din nou?")) draft.confirmPanelReconciliation(); }}
          >Am verificat panoul din Discord</button>
        </>
      ) : null}
      {recovery?.manualReconciliationComplete ? <p>Ai confirmat verificarea panoului; poți salva din nou.</p> : null}
    </Note>
  );
}

export function SettingsModule() {
  const { saved } = usePanel();
  return (
    <ModuleView module={MODULE.settings} icon="verified" independent>
      <ModuleNotes>
        <RecoveryNotes />
        {saved?.discordLive === false ? (
          <Note tone="warn">Botul Discord e offline. Cât timp verificarea e pornită, salvarea așteaptă botul, pentru că el publică panoul.</Note>
        ) : null}
      </ModuleNotes>
      <PanelCard />
      <RolesCard />
      <AdminCard />
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Mesaje                                                              */
/* ------------------------------------------------------------------ */

type TextKey = (typeof VERIFICATION_TEXTS)[number]["key"];

function TextInput({ textKey, hint, multiline, rows, replacement }: { textKey: TextKey; hint?: string; multiline?: boolean; rows?: number; replacement?: boolean }) {
  const { config, set } = usePanel();
  const spec = VERIFICATION_TEXTS.find((text) => text.key === textKey)!;
  return (
    <EmojiTextField
      label={spec.label} hint={hint} value={String(config.verification[textKey] ?? "")} onChange={(next) => set(["verification", textKey], next)}
      max={spec.max} multiline={multiline} rows={rows} replacement={replacement} optional={spec.optional} testId={`verification-text-${textKey}`}
    />
  );
}

function ImageInput({ field, label, hint }: { field: "imageUrl" | "thumbnailUrl"; label: string; hint: string }) {
  const { config, set } = usePanel();
  return (
    <ImageUrlField
      label={label} hint={hint} value={String(config.verification[field] ?? "")} onChange={(next) => set(["verification", field], next)}
      testId={`verification-image-${field}`}
    />
  );
}

/** The panel as Discord shows it, and the bot's answer to someone already verified. */
function DiscordPreview() {
  const draft = useVerificationDraft();
  const { config } = usePanel();
  const verification = config.verification as BotControlConfig["verification"];
  const emojis = draft.metadata?.emojis;
  const image = isMessageImageUrl(verification.imageUrl.trim()) ? verification.imageUrl.trim() : "";
  const thumbnail = isMessageImageUrl(verification.thumbnailUrl.trim()) ? verification.thumbnailUrl.trim() : "";
  return (
    <div className="pn-dc" data-testid="verification-discord-preview">
      <p className="pn-dc-k">Așa apare în Discord</p>
      <div className="pn-dc-msg">
        <span className="pn-dc-av" aria-hidden="true"><Ico name="bot" /></span>
        <div className="pn-dc-body">
          <p className="pn-dc-name"><b>Oracolul Cenușii</b><span>BOT</span></p>
          <div className="pn-dc-embed">
            {thumbnail ? <img src={thumbnail} alt="" className="pn-dc-thumb" /> : null}
            <p className="pn-dc-title"><DiscordEmojiText emojis={emojis}>{verification.title || "Titlul panoului"}</DiscordEmojiText></p>
            <p className="pn-dc-text"><DiscordEmojiText emojis={emojis}>{verification.message || "Textul panoului"}</DiscordEmojiText></p>
            {image ? <img src={image} alt="" className="pn-dc-image" /> : null}
          </div>
          <span className="pn-dc-btn">
            <DiscordEmojiText emojis={emojis}>{`${verification.buttonEmoji ? `${verification.buttonEmoji} ` : ""}${verification.buttonLabel || "Verifică-mă"}`}</DiscordEmojiText>
            <Ico name="arrow" />
          </span>
        </div>
      </div>
      <p className="pn-dc-k">Răspunsul pentru cine e deja verificat</p>
      <div className="pn-dc-reply">
        <DiscordEmojiText emojis={emojis}>{verification.alreadyVerifiedMessage || "…"}</DiscordEmojiText>
        <small>Doar tu poți vedea acest mesaj</small>
      </div>
    </div>
  );
}

export function MessagesModule() {
  const { config, set } = usePanel();
  const atDefaults = (Object.keys(DEFAULT_VERIFICATION_TEXT) as Array<keyof typeof DEFAULT_VERIFICATION_TEXT>)
    .every((key) => config.verification[key] === DEFAULT_VERIFICATION_TEXT[key]);
  return (
    <ModuleView module={MODULE.messages} icon="message" aside={(
      <button
        type="button" className="pn-btn-ghost pn-btn-sm" disabled={atDefaults} data-testid="button-verification-defaults"
        onClick={() => set(["verification"], { ...config.verification, ...DEFAULT_VERIFICATION_TEXT })}
      ><Ico name="refresh" />Textele de bază</button>
    )}>
      <div className="pn-vsplit">
        <div className="pn-vsplit-main">
          <SectionCard title="Panoul" testId="verification-texts">
            <Fields>
              <TextInput textKey="title" />
              <TextInput textKey="message" multiline rows={5} />
              <TextInput textKey="buttonLabel" hint="Butonul deschide autentificarea Discord, apoi pagina de verificare de pe site." />
              <TextInput textKey="buttonEmoji" replacement hint="Un singur emoji, din listă sau de pe server. Poate rămâne gol." />
              <ImageInput field="imageUrl" label="Imaginea mare" hint="Apare sub text, pe toată lățimea panoului." />
              <ImageInput field="thumbnailUrl" label="Imaginea mică" hint="Apare în colțul din dreapta sus." />
            </Fields>
          </SectionCard>
          <SectionCard title="Pentru cine e deja verificat">
            <Fields>
              <TextInput textKey="alreadyVerifiedMessage" multiline rows={3} hint="Răspunsul botului, vizibil doar pentru membrul care apasă butonul." />
            </Fields>
          </SectionCard>
        </div>
        <aside className="pn-vsplit-side" aria-label="Previzualizare"><DiscordPreview /></aside>
      </div>
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Membri                                                              */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 60;

function ago(at: number | null, now: number): string {
  if (at === null) return "se încarcă";
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 10) return "chiar acum";
  if (seconds < 60) return `acum ${seconds} s`;
  return `acum ${Math.round(seconds / 60)} min`;
}

type MembersQuery = ReturnType<typeof useGetVerificationMembers>;

/** Reloads the list every few seconds while the page is visible and nothing is being changed. */
function useLiveList(query: MembersQuery, paused: boolean) {
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const latest = useRef(query);
  latest.current = query;
  const wasFetching = useRef(false);
  useEffect(() => {
    if (wasFetching.current && !query.isFetching && !query.isError) setUpdatedAt(Date.now());
    if (!query.isFetching && query.data && updatedAt === null) setUpdatedAt(Date.now());
    wasFetching.current = query.isFetching;
  }, [query.isFetching, query.isError, query.data, updatedAt]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);
  const every = liveRefreshMs(query.data?.total);
  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !latest.current.isFetching) void latest.current.refetch();
    }, every);
    return () => window.clearInterval(timer);
  }, [paused, every]);
  return { updatedAt, now };
}

type Outcome = { totals: GrantTotals; failures: Array<{ name: string; error: string }>; unavailable: Array<{ roleId: string; reason: string }>; error?: string };

function GrantRoles({ standardId, extras, onChange, savedExtras }: {
  standardId: string; extras: string[]; onChange: (next: string[]) => void; savedExtras: string[];
}) {
  const roles = useRoles();
  const listed = [...new Set([...savedExtras, ...extras])].filter((id) => id !== standardId);
  const others = (extraRoleCandidates(roles.list, standardId) ?? []).filter((role) => role.assignable !== false && !listed.includes(role.id));
  const id = useId();
  return (
    <SectionCard title="Rolurile date" small="de butoanele de verificare de mai jos" testId="members-grant-roles">
      <Fields>
        <Fld wide label="Cine e bifat primește" labelId={`${id}-l`} hint="Rolul standard îl primește mereu. Cine îl are deja primește doar rolurile bifate care îi lipsesc.">
          <div className="pn-areaf" role="group" aria-labelledby={`${id}-l`}>
            <div className="pn-multi">
              <span className="pn-pill pn-pill-lock" aria-label={`@${roles.name(standardId)}, rolul standard, mereu`}>
                <Ico name="lock" />@{roles.name(standardId)}<small>standard</small>
              </span>
              {listed.map((roleId) => {
                const problem = roleProblem(roles.byId.get(roleId), "extra", roles.known);
                return (
                  <Pill
                    key={roleId} checked={extras.includes(roleId)} label={`@${roles.name(roleId)}`} testId={`grant-role-${roleId}`}
                    onChange={(next) => onChange(next ? [...extras, roleId].slice(0, MAX_EXTRA_ROLES) : extras.filter((item) => item !== roleId))}
                  >
                    @{roles.name(roleId)}{problem ? <small>{problem.blocking ? "nu se poate da" : "drepturi de staff"}</small> : null}
                  </Pill>
                );
              })}
            </div>
            {others.length ? (
              <select
                className="pn-inp" aria-label="Adaugă alt rol" value="" data-testid="grant-role-add"
                onChange={(event) => { if (event.target.value) onChange([...extras, event.target.value].slice(0, MAX_EXTRA_ROLES)); }}
              >
                <option value="">Adaugă alt rol…</option>
                {others.map((role) => <option key={role.id} value={role.id}>@{role.name}</option>)}
              </select>
            ) : null}
          </div>
        </Fld>
      </Fields>
    </SectionCard>
  );
}

export function MembersModule() {
  const draft = useVerificationDraft();
  const { config, saved } = usePanel();
  const roles = useRoles();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const guildId = draft.guildId ?? "";
  const standardId: string = saved?.verification?.roleId ?? "";
  const savedExtras = extraRoleIdsOf(saved).filter((id) => id !== standardId);
  const required = verificationRoleIds(saved);
  const query = useGetVerificationMembers(guildId, {
    query: { enabled: Boolean(guildId && standardId), queryKey: getGetVerificationMembersQueryKey(guildId) },
  });
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const live = useLiveList(query, Boolean(running) || !standardId);
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [chosenExtras, setChosenExtras] = useState<string[] | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const currentGuild = useRef(guildId);
  currentGuild.current = guildId;
  const selectAllRef = useRef<HTMLInputElement>(null);

  // A role the bot cannot give stays out of the default choice; the server would skip it anyway.
  const defaultExtras = savedExtras.filter((roleId) => !roleProblem(roles.byId.get(roleId), "extra", roles.known)?.blocking);
  const extras = chosenExtras ?? defaultExtras;
  useEffect(() => { setChosenExtras(null); }, [savedExtras.join(",")]);
  useEffect(() => { setLimit(PAGE_SIZE); }, [filter, search]);

  const members = (query.data?.members ?? []) as MemberRecord[];
  const counts = memberCounts(members, required);
  const filtered = filterMembers(members, filter, search, required);
  const shown = filtered.slice(0, limit);
  const selectedMembers = members.filter((member) => selected.has(member.id));
  const allSelected = filtered.length > 0 && filtered.every((member) => selected.has(member.id));
  const someSelected = filtered.some((member) => selected.has(member.id));
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);
  const filterOptions: Array<readonly [MemberFilter, string]> = [
    ["all", `Toți · ${counts.all}`],
    ["verified", `Verificați · ${counts.verified}`],
    ["unverified", `Neverificați · ${counts.unverified}`],
  ];
  if (required.length > 1) filterOptions.push(["missing", `Le lipsesc roluri · ${counts.missing}`]);
  const rolesUnsaved = !deepEqual(config.verification?.roleId, saved?.verification?.roleId)
    || !deepEqual(extraRoleIdsOf(config), extraRoleIdsOf(saved));

  const toggle = (memberId: string, on: boolean) => setSelected((current) => {
    const next = new Set(current);
    if (on) next.add(memberId); else next.delete(memberId);
    return next;
  });
  const toggleAll = () => setSelected((current) => {
    const next = new Set(current);
    for (const member of filtered) {
      if (allSelected) next.delete(member.id); else next.add(member.id);
    }
    return next;
  });

  const grant = async (targets: MemberRecord[]) => {
    if (running || !guildId || !targets.length) return;
    const startGuild = guildId;
    const roleIds = extras;
    const names = new Map(targets.map((member) => [member.id, member.displayName]));
    const totals: GrantTotals = { verified: 0, updated: 0, unchanged: 0, failed: 0 };
    const failures: Outcome["failures"] = [];
    const done = new Set<string>();
    let unavailable: Outcome["unavailable"] = [];
    let error: string | undefined;
    setOutcome(null);
    setRunning({ done: 0, total: targets.length });
    try {
      for (const part of chunk(targets.map((member) => member.id), MEMBERS_PER_REQUEST)) {
        if (currentGuild.current !== startGuild) break;
        const response = await verifyGuildMembers(startGuild, part, roleIds);
        totals.verified += response.verified;
        totals.updated += response.updated;
        totals.unchanged += response.unchanged;
        totals.failed += response.failed;
        unavailable = response.unavailableRoles ?? [];
        for (const result of response.results) {
          if (result.result === "failed") failures.push({ name: result.displayName ?? names.get(result.userId) ?? result.userId, error: result.error ?? "Nu a mers." });
          else done.add(result.userId);
        }
        setRunning((current) => current && { ...current, done: Math.min(current.total, current.done + part.length) });
      }
    } catch (failure) {
      error = failure instanceof Error ? failure.message : "Verificarea nu a mers.";
    } finally {
      if (currentGuild.current === startGuild) {
        setRunning(null);
        setOutcome({ totals, failures, unavailable, error });
        setSelected((current) => new Set([...current].filter((memberId) => !done.has(memberId))));
        void queryClient.invalidateQueries({ queryKey: getGetVerificationMembersQueryKey(startGuild) });
        void query.refetch();
        toast(error && !done.size
          ? { variant: "destructive", title: "Verificarea manuală a eșuat", description: error }
          : { title: "Verificare manuală", description: describeGrantTotals(totals) });
      }
    }
  };

  const aside = standardId ? (
    <div className="pn-live" data-testid="members-live">
      <span className={cx("pn-live-dot", query.isError && "is-bad", query.isFetching && "is-busy")} aria-hidden="true" />
      <span role="status">{query.isError && query.data ? "Nu s-a putut actualiza" : `Actualizat ${ago(live.updatedAt, live.now)}`}</span>
      <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => void query.refetch()} disabled={query.isFetching} data-testid="button-refresh-members">
        <Ico name="refresh" />Reîncarcă
      </button>
    </div>
  ) : null;

  return (
    <ModuleView module={MODULE.members} icon="userCheck" aside={aside}>
      <ModuleNotes>
        {!standardId ? (
          <Note tone="warn" testId="members-no-role">
            Alege rolul standard la <Link href={MODULE.settings.route}>Setări</Link> și salvează; apoi aici vezi cine e verificat și îi poți verifica tu.
          </Note>
        ) : null}
        {standardId && rolesUnsaved ? (
          <Note tone="warn" testId="members-roles-unsaved">Ai schimbat rolurile la Setări fără să salvezi. Lista și verificarea folosesc rolurile salvate.</Note>
        ) : null}
        {outcome ? <OutcomeNote outcome={outcome} roleName={roles.name} onClose={() => setOutcome(null)} /> : null}
      </ModuleNotes>
      {standardId ? (
        <>
          <GrantRoles standardId={standardId} extras={extras} savedExtras={savedExtras} onChange={setChosenExtras} />
          <SectionCard title="Membri" small={query.data ? `${countLabel(counts.all, "membru", "membri")} pe server` : undefined} testId="members-list-card">
            <Fields>
              <Seg label="Arată" value={filter} onChange={(next) => setFilter(next as MemberFilter)} testId="members-filter" options={filterOptions} />
              <Fld wide>
                <div className="pn-search">
                  <Ico name="search" />
                  <input
                    className="pn-inp" value={search} onChange={(event) => setSearch(event.target.value)} type="search"
                    placeholder="Caută după nume, username sau ID" aria-label="Caută membri" data-testid="input-members-search"
                  />
                </div>
              </Fld>
            </Fields>
            <div className="pn-mbar" data-testid="members-toolbar">
              <label className="pn-mbar-all">
                <input ref={selectAllRef} type="checkbox" className="pn-ck" checked={allSelected} onChange={toggleAll} disabled={!filtered.length || Boolean(running)} />
                <span>{allSelected ? "Debifează" : "Bifează"} toți cei {filtered.length} din listă</span>
              </label>
              <span className="pn-mbar-n" role="status">{selected.size ? `${countLabel(selected.size, "bifat", "bifați")}` : "Niciunul bifat"}</span>
              {selected.size ? <button type="button" className="pn-lnk" onClick={() => setSelected(new Set())} disabled={Boolean(running)}>Golește</button> : null}
              <button
                type="button" className="pn-btn pn-btn-sm" disabled={!selectedMembers.length || Boolean(running)} data-testid="button-verify-selected"
                onClick={() => void grant(selectedMembers)}
              >
                {running ? <><Spinner />Se verifică {running.done}/{running.total}…</> : <><Ico name="userCheck" />{grantButtonLabel(selectedMembers)}</>}
              </button>
            </div>
            <MemberList
              query={query} shown={shown} filteredCount={filtered.length} required={required} selected={selected} busy={Boolean(running)}
              onToggle={toggle} onGrant={(member) => void grant([member])} search={search} filter={filter}
            />
            {filtered.length > shown.length ? (
              <button type="button" className="pn-btn-ghost pn-btn-sm pn-more" onClick={() => setLimit((current) => current + PAGE_SIZE)}>
                Arată încă {Math.min(PAGE_SIZE, filtered.length - shown.length)} din {filtered.length - shown.length}
              </button>
            ) : null}
          </SectionCard>
        </>
      ) : null}
    </ModuleView>
  );
}

function OutcomeNote({ outcome, roleName, onClose }: { outcome: Outcome; roleName: (id: string) => string; onClose: () => void }) {
  const failed = outcome.failures.length > 0 || Boolean(outcome.error);
  return (
    <Note tone={failed ? "warn" : "info"} role="status" testId="members-outcome">
      <p><b>{describeGrantTotals(outcome.totals)}</b></p>
      {outcome.error ? <p>{outcome.error}</p> : null}
      {outcome.failures.slice(0, 5).map((failure, index) => <p key={index}>{failure.name}: {failure.error}</p>)}
      {outcome.failures.length > 5 ? <p>Și încă {outcome.failures.length - 5}; au rămas bifați ca să încerci din nou.</p> : null}
      {outcome.unavailable.map((item) => <p key={item.roleId}>@{roleName(item.roleId)} nu s-a dat: {item.reason}</p>)}
      <button type="button" className="pn-lnk" onClick={onClose}>Închide</button>
    </Note>
  );
}

function MemberList({ query, shown, filteredCount, required, selected, busy, onToggle, onGrant, search, filter }: {
  query: MembersQuery; shown: MemberRecord[]; filteredCount: number; required: string[]; selected: Set<string>; busy: boolean;
  onToggle: (memberId: string, on: boolean) => void; onGrant: (member: MemberRecord) => void; search: string; filter: MemberFilter;
}) {
  const roles = useRoles();
  if (query.isLoading && !query.data) {
    return <div className="pn-state" role="status"><Spinner /><span className="pn-sr">Se încarcă membrii…</span></div>;
  }
  if (query.isError && !query.data) {
    return (
      <div className="pn-fail" role="alert">
        <p>{query.error instanceof Error ? query.error.message : "Lista membrilor nu a putut fi încărcată."}</p>
        <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => void query.refetch()}>Încearcă din nou</button>
      </div>
    );
  }
  if (!filteredCount) {
    return (
      <p className="pn-mempty" role="status">
        {search.trim() ? "Niciun membru nu se potrivește căutării."
          : filter === "verified" ? "Niciun membru verificat încă."
            : filter === "unverified" ? "Toți membrii sunt verificați."
              : filter === "missing" ? "Toți cei verificați au toate rolurile." : "Nu am găsit membri pe server."}
      </p>
    );
  }
  return (
    <ul className="pn-mlist" aria-label="Membrii serverului" data-testid="members-list">
      {shown.map((member) => {
        const missing = member.verified ? missingRoleIds(member, required) : [];
        const joined = member.joinedAt ? new Date(member.joinedAt).toLocaleDateString("ro-RO") : null;
        const isSelected = selected.has(member.id);
        return (
          <li key={member.id} className={cx("pn-mrow", isSelected && "is-sel")} data-testid={`member-row-${member.id}`}>
            <input
              type="checkbox" className="pn-ck" checked={isSelected} disabled={busy} aria-label={`Bifează ${member.displayName}`}
              onChange={(event) => onToggle(member.id, event.target.checked)}
            />
            <img className="pn-mav" src={member.avatarUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
            <span className="pn-mname">
              <b>{member.displayName}</b>
              <small>@{member.username}{joined ? ` · pe server din ${joined}` : ""}</small>
            </span>
            <span className="pn-mstate">
              <span className={cx("pn-badge", member.verified ? "is-good" : "is-wait")} data-testid={`member-state-${member.id}`}>
                {member.verified ? "Verificat" : "Neverificat"}
              </span>
              {missing.map((roleId) => <span key={roleId} className="pn-miss">lipsește @{roles.name(roleId)}</span>)}
            </span>
            <span className="pn-mact">
              {!member.verified ? (
                <button type="button" className="pn-btn-ghost pn-btn-sm" disabled={busy} onClick={() => onGrant(member)} aria-label={`Verifică ${member.displayName}`}>
                  Verifică
                </button>
              ) : missing.length ? (
                <button type="button" className="pn-btn-ghost pn-btn-sm" disabled={busy} onClick={() => onGrant(member)} aria-label={`Dă rolurile lipsă lui ${member.displayName}`}>
                  Dă rolurile
                </button>
              ) : <span className="pn-mok" aria-label="Are toate rolurile"><Ico name="check" /></span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export const VERIFICATION_VIEWS: Record<VerificationModuleId, () => React.JSX.Element> = {
  settings: SettingsModule,
  messages: MessagesModule,
  members: MembersModule,
};
