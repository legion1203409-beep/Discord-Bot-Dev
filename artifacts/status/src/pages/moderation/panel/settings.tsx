/**
 * Modulele paginii Setări bot: Acces staff, Notificările de moderare, Mesaje
 * în privat (la o sancțiune) și Bun venit și plecare. Logica e în
 * settings-model.ts; ciornele și salvarea în SettingsGroup.tsx.
 */
import React, { useId, useState } from "react";
import { Link } from "wouter";
import { usePanel } from "./context";
import {
  ChannelField, Fields, Fld, IdPicker, Ico, NoteRow, Pill, SectionCard, Seg, Switch, SwitchField, cx, roleOptions, type IconName,
} from "./fields";
import { ModuleView } from "./rules";
import {
  COLOR_PRESETS, DEFAULT_APPEAL_TEXT, DEFAULT_EMBEDS, DEFAULT_REMOVED_APPEAL_TEXT, EMBED_STYLES, MAX_CUSTOM_STYLE, MEMBER_STYLES, SANCTIONS,
  SETTINGS_MODULES, TEMPLATE_TOKENS, dmOf, dmPreview, embedsOf, isHexColor, memberMessagesOf, permissionsOf, renderTemplate,
  type DmSettings, type EmbedSettings, type MemberMessages, type SanctionKind, type SettingsModuleId,
} from "./settings-model";
import { isPublicGifUrl, isPublicHttpsUrl } from "../../../lib/embed-url-validation";

const MODULE: Record<SettingsModuleId, (typeof SETTINGS_MODULES)[number]> = Object.fromEntries(
  SETTINGS_MODULES.map((module) => [module.id, module]),
) as Record<SettingsModuleId, (typeof SETTINGS_MODULES)[number]>;

export const SETTINGS_ICONS: Record<SettingsModuleId, IconName> = { access: "key", notices: "mega", dm: "send", welcome: "users" };

/** The guild's name, for the previews. */
export const GuildNameContext = React.createContext("Serverul tău");

/* ------------------------------------------------------------------ */
/* Acces staff                                                         */
/* ------------------------------------------------------------------ */

function AccessLadder() {
  const { config, update } = usePanel();
  const { staffRoleIds, allowManageGuild } = permissionsOf(config);
  const setManage = (next: boolean) => update(["permissions"], (current: any) => ({ ...permissionsOf({ permissions: current }), ...current, allowManageGuild: next }));
  const id = useId();
  return (
    <SectionCard title="Cine intră în panou" testId="settings-ladder">
      <ol className="pn-set-ladder">
        <li className="is-on">
          <span className="pn-set-step" aria-hidden="true"><Ico name="star" /></span>
          <span className="pn-set-t"><b>Proprietarul și administratorii</b><small>Tot panoul: setările, auditul, cazurile și acțiunile manuale.</small></span>
          <span className="pn-orc-state on">mereu</span>
        </li>
        <li className={cx(allowManageGuild && "is-on")}>
          <span className="pn-set-step" aria-hidden="true"><Ico name="shield" /></span>
          <span className="pn-set-t" id={`${id}-m`}><b>Cine are „Manage Server”</b><small>Cazurile și acțiunile manuale din panou, fără setări.</small></span>
          <Switch checked={allowManageGuild} onChange={setManage} labelledBy={`${id}-m`} testId="settings-manage-guild" />
        </li>
        <li className={cx(staffRoleIds.length > 0 && "is-on")}>
          <span className="pn-set-step" aria-hidden="true"><Ico name="users" /></span>
          <span className="pn-set-t"><b>Rolurile staff</b><small>Aceleași drepturi: cazuri și acțiuni manuale. Le alegi mai jos.</small></span>
          <span className={cx("pn-orc-state", staffRoleIds.length > 0 && "on")}>{staffRoleIds.length ? `${staffRoleIds.length} ${staffRoleIds.length === 1 ? "rol" : "roluri"}` : "niciunul"}</span>
        </li>
      </ol>
    </SectionCard>
  );
}

function StaffRolesCard() {
  const { config, update, roles } = usePanel();
  const { staffRoleIds } = permissionsOf(config);
  return (
    <SectionCard title="Rolurile staff" testId="settings-staff-roles">
      <Fields>
        <IdPicker
          label="Roluri" kind="role" options={roleOptions(roles)} selected={staffRoleIds} max={100} testId="settings-staff-roles-picker"
          hint="Membrii cu aceste roluri intră în panou pentru cazuri și acțiuni manuale. Tot ele sunt menționate când o regulă are „Anunță staff-ul”."
          onChange={(next) => update(["permissions"], (current: any) => ({ ...permissionsOf({ permissions: current }), ...current, staffRoleIds: next }))}
        />
        <NoteRow tone="plain">
          Comenzile din Discord (/warn, /mute și celelalte) le dai separat, pe roluri, din <Link href="/sanctiuni/comenzi">Sancțiuni → Comenzi staff</Link>.
        </NoteRow>
      </Fields>
    </SectionCard>
  );
}

function AccessModule() {
  return (
    <ModuleView module={MODULE.access} icon={SETTINGS_ICONS.access}>
      <AccessLadder />
      <StaffRolesCard />
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Notificări                                                          */
/* ------------------------------------------------------------------ */

function useEmbeds() {
  const { config, update } = usePanel();
  const embeds = embedsOf(config);
  const setEmbeds = (change: Partial<EmbedSettings>) => update(["embeds"], (current: any) => ({ ...embedsOf({ embeds: current }), ...change }));
  return { embeds, setEmbeds };
}

function FormCard() {
  const { embeds, setEmbeds } = useEmbeds();
  const id = useId();
  const color = isHexColor(embeds.color) ? embeds.color : DEFAULT_EMBEDS.color;
  return (
    <SectionCard title="Forma" small={embeds.enabled ? "embed" : "text simplu"} testId="settings-form">
      <Fields>
        <SwitchField
          label="Trimite ca embed" testId="settings-embeds-switch" checked={embeds.enabled}
          hint="Oprit, botul scrie titlul îngroșat și motivul, ca text simplu. Restul setărilor de aici se folosesc doar pentru embed."
          onChange={(next) => setEmbeds({ enabled: next })}
        />
        <Seg
          label="Stilul" value={embeds.style} testId="settings-embed-style"
          hint={EMBED_STYLES.find(([style]) => style === embeds.style)?.[2]}
          options={EMBED_STYLES.map(([style, label]) => [style, label] as const)}
          onChange={(next) => setEmbeds({ style: next as EmbedSettings["style"] })}
        />
        <Fld wide label="Culoarea" labelId={`${id}-c`} hint="Banda din stânga embed-ului. Aceeași culoare o au și mesajele în privat.">
          <div className="pn-set-colors" role="group" aria-labelledby={`${id}-c`}>
            {COLOR_PRESETS.map(([value, label]) => (
              <button
                key={value} type="button" className="pn-set-swatch" aria-label={label} aria-pressed={embeds.color.toLowerCase() === value.toLowerCase()}
                style={{ "--sw": value } as React.CSSProperties} onClick={() => setEmbeds({ color: value })}
              />
            ))}
            <label className="pn-set-picker" aria-label="Altă culoare">
              <input type="color" value={color.toLowerCase()} onChange={(event) => setEmbeds({ color: event.target.value.toUpperCase() })} />
            </label>
            <input
              className="pn-inp pn-inp-mono pn-set-hex" aria-label="Culoarea, în format #RRGGBB" value={embeds.color} maxLength={7} data-testid="settings-embed-color"
              onChange={(event) => setEmbeds({ color: event.target.value.trim() })}
            />
          </div>
          {!isHexColor(embeds.color) ? <p className="pn-err" role="alert">Scrie culoarea ca #RRGGBB, de exemplu #FF6B3D.</p> : null}
        </Fld>
        <Fld wide label="Iconul" hint="Imaginea mică din colțul embed-ului. Un link HTTPS public; gol, fără icon.">
          <input
            className="pn-inp" value={embeds.iconUrl ?? ""} placeholder="https://…/icon.png" autoComplete="off" aria-label="Linkul iconului" data-testid="settings-embed-icon"
            onChange={(event) => setEmbeds({ iconUrl: event.target.value.trim() || null })}
          />
          {embeds.iconUrl && !isPublicHttpsUrl(embeds.iconUrl) ? <p className="pn-err" role="alert">Iconul trebuie să fie un link HTTPS public.</p> : null}
        </Fld>
        <SwitchField
          label="Animație" testId="settings-embed-animation" checked={embeds.animations}
          hint="Un GIF mare sub text, la fiecare notificare."
          onChange={(next) => setEmbeds({ animations: next })}
        />
        {embeds.animations ? (
          <Fld wide label="Linkul GIF-ului" hint="Un link HTTPS public care se termină în .gif.">
            <input
              className="pn-inp" value={embeds.animationUrl ?? ""} placeholder="https://…/animatie.gif" autoComplete="off" aria-label="Linkul GIF-ului" data-testid="settings-embed-gif"
              onChange={(event) => setEmbeds({ animationUrl: event.target.value.trim() || null })}
            />
            {!embeds.animationUrl
              ? <p className="pn-err" role="alert">Adaugă linkul GIF-ului sau oprește animația.</p>
              : !isPublicGifUrl(embeds.animationUrl) ? <p className="pn-err" role="alert">Linkul trebuie să fie HTTPS public și să se termine în .gif.</p> : null}
          </Fld>
        ) : null}
      </Fields>
    </SectionCard>
  );
}

const RECOMMENDED_TEMPLATE = { titleTemplate: "🛡️ {action}", descriptionTemplate: "**Membru:** {member}\n**Motiv:** {reason}" };

function TemplateCard() {
  const { embeds, setEmbeds } = useEmbeds();
  const [field, setField] = useState<"titleTemplate" | "descriptionTemplate">("descriptionTemplate");
  const insert = (token: string) => setEmbeds({ [field]: `${embeds[field]}${embeds[field] && !embeds[field].endsWith(" ") && !embeds[field].endsWith("\n") ? " " : ""}{${token}}` });
  const atDefault = embeds.titleTemplate === DEFAULT_EMBEDS.titleTemplate && embeds.descriptionTemplate === DEFAULT_EMBEDS.descriptionTemplate;
  return (
    <SectionCard title="Textul" small="pentru embed" testId="settings-template">
      <Fields>
        <Fld wide label="Titlul" hint="Cel mult 200 de caractere.">
          <input
            className="pn-inp" value={embeds.titleTemplate} maxLength={200} aria-label="Titlul notificării" data-testid="settings-template-title"
            onFocus={() => setField("titleTemplate")} onChange={(event) => setEmbeds({ titleTemplate: event.target.value })}
          />
        </Fld>
        <Fld wide label="Textul" hint="Dacă nu conține {reason}, botul pune motivul într-un câmp „Detalii”.">
          <textarea
            className="pn-inp" rows={4} value={embeds.descriptionTemplate} maxLength={2_000} aria-label="Textul notificării" data-testid="settings-template-text"
            onFocus={() => setField("descriptionTemplate")} onChange={(event) => setEmbeds({ descriptionTemplate: event.target.value })}
          />
        </Fld>
        <Fld wide label="Valori" hint={`Se adaugă la ${field === "titleTemplate" ? "titlu" : "text"}, unde ai dat clic ultima dată.`}>
          <div className="pn-multi">
            {TEMPLATE_TOKENS.map(([token, label]) => (
              <button key={token} type="button" className="pn-set-token" onClick={() => insert(token)} data-testid={`settings-token-${token}`}>
                <code>{`{${token}}`}</code><small>{label}</small>
              </button>
            ))}
          </div>
        </Fld>
        <Fld label="Texte gata făcute" hint="Textul de bază al botului e în engleză.">
          <div className="pn-fc">
            <button type="button" className="pn-btn-ghost pn-btn-sm" data-testid="settings-template-recommended" onClick={() => setEmbeds(RECOMMENDED_TEMPLATE)}>
              <Ico name="star" />În română
            </button>
            <button
              type="button" className="pn-btn-ghost pn-btn-sm" disabled={atDefault}
              onClick={() => setEmbeds({ titleTemplate: DEFAULT_EMBEDS.titleTemplate, descriptionTemplate: DEFAULT_EMBEDS.descriptionTemplate })}
            ><Ico name="refresh" />Textul de bază</button>
          </div>
        </Fld>
      </Fields>
    </SectionCard>
  );
}

/** Bold and inline code, the way Discord shows them, for the previews. */
function DiscordText({ children }: { children: string }) {
  return (
    <>
      {children.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part, index) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) return <b key={index}>{part.slice(2, -2)}</b>;
        if (/^`[^`]+`$/.test(part)) return <code key={index} className="pn-set-code">{part.slice(1, -1)}</code>;
        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </>
  );
}

function NoticePreview() {
  const { embeds } = useEmbeds();
  const color = isHexColor(embeds.color) ? embeds.color : DEFAULT_EMBEDS.color;
  const description = renderTemplate(embeds.descriptionTemplate);
  return (
    <div className="pn-dc" data-testid="settings-notice-preview">
      <p className="pn-dc-k">Așa apare în canalul de jurnal</p>
      <div className="pn-dc-msg">
        <span className="pn-dc-av pn-orc-av" aria-hidden="true"><Ico name="eye" /></span>
        <div className="pn-dc-body">
          <p className="pn-dc-name"><b>Oracolul Cenușii</b><span>BOT</span></p>
          {embeds.enabled ? (
            <div className="pn-dc-embed" style={{ borderLeftColor: color }}>
              {embeds.iconUrl && isPublicHttpsUrl(embeds.iconUrl) ? <img src={embeds.iconUrl} alt="" className="pn-dc-thumb" /> : null}
              <p className="pn-dc-title">{renderTemplate(embeds.titleTemplate) || "…"}</p>
              <p className="pn-dc-text"><DiscordText>{description}</DiscordText></p>
              {!embeds.descriptionTemplate.includes("{reason}") ? (
                <p className="pn-dc-field"><b>Detalii</b>{renderTemplate("{reason}")}</p>
              ) : null}
              {embeds.animations && embeds.animationUrl && isPublicGifUrl(embeds.animationUrl) ? <img src={embeds.animationUrl} alt="" className="pn-dc-image" /> : null}
              {embeds.style === "compact" ? <p className="pn-set-foot">Moderare</p> : null}
              {embeds.style === "detailed" ? <p className="pn-set-foot">azi la 21:30</p> : null}
            </div>
          ) : (
            <p className="pn-dc-text pn-orc-plain"><b>Timeout aplicat</b>{"\n"}Spam: 6 mesaje în 5 secunde</p>
          )}
        </div>
      </div>
      <p className="pn-orc-fine">Exemplul folosește valori inventate. Notificările merg în canalul de jurnal al fiecărui modul sau în canalul de audit.</p>
    </div>
  );
}

function NoticesModule() {
  return (
    <ModuleView module={MODULE.notices} icon={SETTINGS_ICONS.notices}>
      <div className="pn-vsplit">
        <div className="pn-vsplit-main">
          <FormCard />
          <TemplateCard />
        </div>
        <aside className="pn-vsplit-side" aria-label="Previzualizare"><NoticePreview /></aside>
      </div>
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Mesaje în privat                                                    */
/* ------------------------------------------------------------------ */

function useDm() {
  const { config, update } = usePanel();
  const dm = dmOf(config);
  const setDm = (change: Partial<DmSettings>) => update(["sanctionDm"], (current: any) => ({ ...dmOf({ sanctionDm: current }), ...change }));
  return { dm, setDm };
}

function WhenCard() {
  const { dm, setDm } = useDm();
  const id = useId();
  const toggle = (kind: SanctionKind, on: boolean) => {
    const next = on ? [...new Set([...dm.actions, kind])] : dm.actions.filter((item) => item !== kind);
    setDm({ actions: SANCTIONS.map(([value]) => value).filter((value) => next.includes(value)) });
  };
  return (
    <SectionCard title="Când pleacă" testId="settings-dm-when">
      <Fields>
        <Fld wide label="La ce sancțiuni" labelId={`${id}-l`} hint="La avertisment și timeout, după sancțiune. La kick și ban, înainte, ca membrul să-l mai poată primi.">
          <div className="pn-multi" role="group" aria-labelledby={`${id}-l`}>
            {SANCTIONS.map(([kind, label]) => (
              <Pill key={kind} checked={dm.actions.includes(kind)} onChange={(next) => toggle(kind, next)} testId={`settings-dm-action-${kind}`}>{label}</Pill>
            ))}
          </div>
          {dm.enabled && !dm.actions.length ? <p className="pn-err" role="alert">Alege cel puțin o sancțiune sau oprește mesajele.</p> : null}
        </Fld>
        <SwitchField
          label="Și la sancțiunile automate" testId="settings-dm-automatic" checked={dm.automatic}
          hint="Cele date de bot singur: AutoMod, anti-spam, anti-flood și Judecătorul AI. Anti-raid nu trimite niciodată."
          onChange={(next) => setDm({ automatic: next })}
        />
      </Fields>
    </SectionCard>
  );
}

function ContentCard() {
  const { dm, setDm } = useDm();
  return (
    <SectionCard title="Ce scrie" testId="settings-dm-content">
      <Fields>
        <SwitchField label="Motivul" testId="settings-dm-reason" checked={dm.showReason} hint="Motivul trecut în caz." onChange={(next) => setDm({ showReason: next })} />
        <SwitchField
          label="Cine a dat-o" testId="settings-dm-moderator" checked={dm.showModerator}
          hint="Numele moderatorului; la cele automate scrie „Moderarea automată”." onChange={(next) => setDm({ showModerator: next })}
        />
        <Fld wide label="ID-ul cazului" hint="Apare mereu. Membrul îl scrie la contestație, iar tichetul de contestație îl verifică.">
          <span className="pn-orc-state on">mereu</span>
        </Fld>
        <Fld wide label="Contestația, la avertisment și timeout" hint="Membrul e încă pe server. Poți folosi {guild} și {case}.">
          <textarea
            className="pn-inp" rows={3} maxLength={1_000} value={dm.appealText} aria-label="Contestația, la avertisment și timeout" data-testid="settings-dm-appeal"
            onChange={(event) => setDm({ appealText: event.target.value })}
          />
          {dm.appealText !== DEFAULT_APPEAL_TEXT ? (
            <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => setDm({ appealText: DEFAULT_APPEAL_TEXT })}><Ico name="refresh" />Textul de bază</button>
          ) : null}
        </Fld>
        <Fld wide label="Contestația, la kick și ban" hint="Membrul nu mai e pe server, deci nu poate deschide un tichet. Spune-i unde scrie.">
          <textarea
            className="pn-inp" rows={3} maxLength={1_000} value={dm.removedAppealText} aria-label="Contestația, la kick și ban" data-testid="settings-dm-removed-appeal"
            onChange={(event) => setDm({ removedAppealText: event.target.value })}
          />
          {dm.removedAppealText !== DEFAULT_REMOVED_APPEAL_TEXT ? (
            <button type="button" className="pn-btn-ghost pn-btn-sm" onClick={() => setDm({ removedAppealText: DEFAULT_REMOVED_APPEAL_TEXT })}><Ico name="refresh" />Textul de bază</button>
          ) : null}
        </Fld>
        <Fld wide label="Linkul de contestație" hint="Opțional: un formular sau un server pentru contestații. Apare ca buton „Contestă” sub mesaj.">
          <input
            className="pn-inp" value={dm.appealUrl ?? ""} placeholder="https://…" autoComplete="off" aria-label="Linkul de contestație" data-testid="settings-dm-url"
            onChange={(event) => setDm({ appealUrl: event.target.value.trim() || null })}
          />
          {dm.appealUrl && !isPublicHttpsUrl(dm.appealUrl) ? <p className="pn-err" role="alert">Linkul trebuie să fie HTTPS public.</p> : null}
        </Fld>
      </Fields>
    </SectionCard>
  );
}

function DmPreview() {
  const { config } = usePanel();
  const guildName = React.useContext(GuildNameContext);
  const { dm } = useDm();
  const [kind, setKind] = useState<SanctionKind>("mute");
  const preview = dmPreview(config, kind, guildName);
  const color = embedsOf(config).color;
  return (
    <div className="pn-dc" data-testid="settings-dm-preview">
      <p className="pn-dc-k">Așa apare în privat</p>
      <div className="pn-set-kinds" role="group" aria-label="Exemplul pentru">
        {SANCTIONS.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)} data-testid={`settings-dm-preview-${value}`}>{label}</button>
        ))}
      </div>
      <div className={cx("pn-dc-msg", !dm.enabled && "pn-set-dim")}>
        <span className="pn-dc-av pn-orc-av" aria-hidden="true"><Ico name="eye" /></span>
        <div className="pn-dc-body">
          <p className="pn-dc-name"><b>Oracolul Cenușii</b><span>BOT</span></p>
          <div className="pn-dc-embed" style={{ borderLeftColor: isHexColor(color) ? color : DEFAULT_EMBEDS.color }}>
            <p className="pn-dc-title">{preview.title}</p>
            <p className="pn-dc-text">{preview.description}</p>
            {preview.fields.map((field) => (
              <p key={field.name} className="pn-dc-field"><b>{field.name}</b>{field.name === "ID-ul cazului" ? <code>{field.value}</code> : field.value}</p>
            ))}
          </div>
          {preview.appealUrl ? <span className="pn-dc-btn">Contestă <Ico name="arrow" /></span> : null}
        </div>
      </div>
      <p className="pn-orc-fine">
        {dm.enabled ? "Cine are mesajele private închise nu îl primește; rezumatul acțiunii spune dacă a ajuns." : "Mesajele în privat sunt oprite: exemplul arată ce ar primi membrul."}
      </p>
    </div>
  );
}

function DmModule() {
  const { dm, setDm } = useDm();
  return (
    <ModuleView module={MODULE.dm} icon={SETTINGS_ICONS.dm} aside={(
      <div className="pn-mod-pw">
        <span aria-hidden="true">{dm.enabled ? "Pornit" : "Oprit"}</span>
        <Switch large checked={dm.enabled} label="Trimite mesaj în privat la sancțiune" testId="settings-dm-switch" onChange={(next) => setDm({ enabled: next })} />
      </div>
    )}>
      {!dm.enabled ? (
        <div className="pn-mod-off" data-testid="settings-dm-off">
          <Ico name="power" />
          <span>Oprit: botul nu scrie membrilor în privat. Setările de mai jos rămân pentru când îl pornești.</span>
          <button type="button" className="pn-btn pn-btn-sm" onClick={() => setDm({ enabled: true })}>Pornește mesajele</button>
        </div>
      ) : null}
      <div className="pn-vsplit">
        <div className="pn-vsplit-main">
          <WhenCard />
          <ContentCard />
        </div>
        <aside className="pn-vsplit-side" aria-label="Previzualizare"><DmPreview /></aside>
      </div>
    </ModuleView>
  );
}

/* ------------------------------------------------------------------ */
/* Bun venit și plecare                                                */
/* ------------------------------------------------------------------ */

function useMemberMessages() {
  const { config, update } = usePanel();
  const messages = memberMessagesOf(config);
  const setMessages = (change: Partial<MemberMessages>) => update(
    ["gameplayConfig", "memberMessages"],
    (current: any) => ({ ...memberMessagesOf({ gameplayConfig: { memberMessages: current } }), ...change }),
  );
  return { messages, setMessages };
}

function WelcomeCard() {
  const { messages, setMessages } = useMemberMessages();
  const { channels } = usePanel();
  const on = messages.welcomeEnabled || messages.leaveEnabled;
  return (
    <SectionCard title="Când și unde" testId="settings-welcome-when">
      <Fields>
        <SwitchField label="La intrare" testId="settings-welcome-switch" checked={messages.welcomeEnabled} hint="Un mesaj de bun venit când intră cineva pe server." onChange={(next) => setMessages({ welcomeEnabled: next })} />
        <SwitchField label="La plecare" testId="settings-leave-switch" checked={messages.leaveEnabled} hint="Un rămas-bun când pleacă cineva." onChange={(next) => setMessages({ leaveEnabled: next })} />
        <ChannelField
          label="Canalul" selectLabel="Canalul mesajelor de bun venit și plecare" value={messages.channelId || null} channels={channels}
          hint="Botul are nevoie aici de View Channel, Send Messages și Embed Links." wide
          onChange={(next) => setMessages({ channelId: next ?? "" })}
        />
        {on && !messages.channelId ? <NoteRow tone="bad" role="alert">Alege canalul; fără el mesajele nu se pot salva pornite.</NoteRow> : null}
      </Fields>
    </SectionCard>
  );
}

function StyleCard() {
  const { messages, setMessages } = useMemberMessages();
  const id = useId();
  return (
    <SectionCard title="Tonul" testId="settings-welcome-style">
      <Fields>
        <Fld wide label="Cum scrie" labelId={`${id}-l`} hint="AI-ul scrie un mesaj nou de fiecare dată, în română, de una-două propoziții. În octombrie adaugă o notă de Halloween, iar de la 1 decembrie la 6 ianuarie una de Crăciun.">
          <div className="pn-orc-tones" role="radiogroup" aria-labelledby={`${id}-l`}>
            {MEMBER_STYLES.map((style) => (
              <button
                key={style.id} type="button" role="radio" aria-checked={messages.style === style.id} className="pn-orc-tone"
                data-testid={`settings-welcome-style-${style.id}`} onClick={() => setMessages({ style: style.id })}
              ><b>{style.label}</b><small>{style.text}</small></button>
            ))}
          </div>
        </Fld>
        {messages.style === "custom" ? (
          <Fld wide label="Tonul tău" hint={`Cel mult ${MAX_CUSTOM_STYLE} de caractere. Gol, botul folosește tonul normal.`}>
            <textarea
              className="pn-inp" rows={2} maxLength={MAX_CUSTOM_STYLE} value={messages.customStyle} placeholder="De exemplu: ton de basm românesc, cald și poetic"
              aria-label="Tonul tău" data-testid="settings-welcome-custom" onChange={(event) => setMessages({ customStyle: event.target.value })}
            />
            <span className="pn-count">{messages.customStyle.length}/{MAX_CUSTOM_STYLE}</span>
          </Fld>
        ) : null}
      </Fields>
    </SectionCard>
  );
}

function WelcomePreview() {
  const { messages } = useMemberMessages();
  const style = MEMBER_STYLES.find((item) => item.id === messages.style) ?? MEMBER_STYLES[0]!;
  const custom = messages.style === "custom";
  return (
    <div className="pn-dc" data-testid="settings-welcome-preview">
      <p className="pn-dc-k">Exemplu</p>
      {(["welcome", "leave"] as const).map((event) => (
        <div key={event} className={cx("pn-dc-msg pn-set-wmsg", !(event === "welcome" ? messages.welcomeEnabled : messages.leaveEnabled) && "pn-set-dim")}>
          <span className="pn-dc-av pn-orc-av" aria-hidden="true"><Ico name="eye" /></span>
          <div className="pn-dc-body">
            <p className="pn-dc-name"><b>Oracolul Cenușii</b><span>BOT</span><small className="pn-set-when">{event === "welcome" ? "la intrare" : "la plecare"}</small></p>
            <p className="pn-dc-text">
              <span className="pn-orc-mention">@Bogdan</span>{" "}
              {custom ? <i className="pn-orc-ghost">AI-ul scrie în tonul descris de tine{messages.customStyle.trim() ? `: „${messages.customStyle.trim()}”` : ""}.</i> : style[event]}
            </p>
          </div>
        </div>
      ))}
      <p className="pn-orc-fine">Exemplele sunt scrise de mână, ca să vezi tonul. Mesajele adevărate le scrie AI-ul.</p>
    </div>
  );
}

function WelcomeModule() {
  return (
    <ModuleView module={MODULE.welcome} icon={SETTINGS_ICONS.welcome}>
      <div className="pn-vsplit">
        <div className="pn-vsplit-main">
          <WelcomeCard />
          <StyleCard />
        </div>
        <aside className="pn-vsplit-side" aria-label="Previzualizare"><WelcomePreview /></aside>
      </div>
    </ModuleView>
  );
}

export const SETTINGS_VIEWS: Record<SettingsModuleId, () => React.JSX.Element> = {
  access: AccessModule,
  notices: NoticesModule,
  dm: DmModule,
  welcome: WelcomeModule,
};

