import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { MessageCustomizationDialog } from "../../components/moderation/MessageCustomizationDialog";
import { ModerationEmbedTemplateEditor } from "../../components/moderation/ModerationEmbedTemplateEditor";
import { EmojiField } from "../../components/moderation/EmojiField";
import { useActiveGuild, useBotControl, useModerationConfig, useModerationMetadata, useSession, type BotControlConfig } from "../../hooks/use-moderation-api";
import { renderMemberLogPreview } from "./ConfigEditor";

const EmojiContext = createContext<Pick<ComponentProps<typeof EmojiField>, "guildId" | "csrfToken" | "emojis" | "onEmojiCreated">>({ guildId: null });

const MODERATION_DEFAULT = { titleTemplate: "Moderation action", descriptionTemplate: "{action}: {reason}" };
const DAILY_DEFAULT = {
  title: "📊 Statistici Zilnice · {guild}",
  description: "O privire asupra comunității pentru **{date}**.\n\nDatele sunt colectate de Oracolul Cenușii și sunt aceleași cu raportul de pe site.",
  footer: "Oracolul Cenușii · Community Insights",
  activityTitle: "📈 Activitate · ultimele 7 zile",
  channelsTitle: "🔥 Top 5 canale active",
  emptyChannelsText: "Încă nu există mesaje înregistrate pentru această zi.",
  metricLabels: { messages: "💬 Mesaje", uniqueUsers: "👥 Utilizatori unici", boosts: "🚀 Boost-uri", joins: "🟢 Intrări", leaves: "🔴 Ieșiri", peakVoice: "🔊 Vârf vocal" },
};
const ALLIANCE_DEFAULT = [
  "🤝 PACTUL CELOR DOUĂ REGATE", "══════════════════════════", "",
  "🏰 Comunitatea parteneră: {server_name}", "", "📝 Descrierea serverului:", "{description}", "",
  "👥 Membri: {members_total} total · {members_online} online", "🔗 Link: {invite}", "",
  "👤 Contract completat de: {applicant_mention}", "", "Pact pecetluit · Regatul Cenușii",
].join("\n");
const MEMBER_VARIABLES = "{member} · {member_name} · {username} · {account_created_at} · {account_created_at_relative} · {account_age} · {account_age_years} · {account_age_days} · {server_joined_at} · {server_joined_at_relative} · {timestamp} · {timestamp_relative}";

function Card({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="space-y-4 rounded-xl border border-border bg-card p-5">
    <div><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{description}</p></div>
    {children}
  </section>;
}

function Field({ label, value, onChange, multiline = false, maxLength = 256 }: {
  label: string; value: string; onChange: (value: string) => void; multiline?: boolean; maxLength?: number;
}) {
  const emojiProps = useContext(EmojiContext);
  return <label className="block space-y-2 text-sm">
    <span className="font-medium">{label}</span>
    <EmojiField {...emojiProps} multiline={multiline} rows={5} value={value} maxLength={maxLength} onChange={onChange} aria-label={label} />
  </label>;
}

export function MessageTemplatesPage() {
  const { guildId } = useActiveGuild();
  const moderation = useModerationConfig(guildId);
  const bot = useBotControl(guildId);
  const { data: metadata, refetch: refetchMetadata } = useModerationMetadata(guildId);
  const { session } = useSession();
  const config = moderation.data;
  const saveBotMessages = async (patch: {
    dailyStats?: Partial<BotControlConfig["dailyStats"]>; allianceAnnouncementTemplate?: string;
  }) => {
    const latest = await bot.refetch();
    if (!latest) throw new Error("Nu am putut încărca setările actuale. Mesajul nu a fost salvat.");
    return bot.update({
      ...latest,
      dailyStats: { ...latest.dailyStats, ...patch.dailyStats },
      tickets: {
        ...latest.tickets,
        ...(patch.allianceAnnouncementTemplate !== undefined ? { allianceAnnouncementTemplate: patch.allianceAnnouncementTemplate } : {}),
      },
    });
  };

  return <EmojiContext.Provider value={{ guildId, csrfToken: session?.csrfToken, emojis: metadata?.emojis, onEmojiCreated: refetchMetadata }}><div className="max-w-5xl space-y-6 animate-stagger-1" key={guildId}>
    <header>
      <h1 className="text-3xl font-bold mod-heading">Personalizare mesaje</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">Editează aici textele și variabilele mesajelor. Activarea funcțiilor și alegerea canalelor rămân în paginile lor de configurare.</p>
    </header>
    {!config ? <p role={moderation.error ? "alert" : undefined}>{moderation.error?.message || <Loader2 className="h-6 w-6 animate-spin" />}</p> : <div className="grid gap-4 md:grid-cols-2">
      {(["join", "leave"] as const).map((kind) => {
        const prefix = kind === "join" ? "memberJoin" : "memberLeave";
        const title = kind === "join" ? "Mesaj la intrarea unui membru" : "Mesaj la plecarea unui membru";
        return <Card key={kind} title={title} description="Textul publicat în jurnalul membrilor; poate fi pregătit și când jurnalizarea este oprită.">
          <MessageCustomizationDialog
            triggerId={`member-${kind}-template`} title={title}
            description="Personalizează titlul și descrierea, apoi salvează direct mesajul."
            value={{ title: config.activityLog[`${prefix}TitleTemplate`] || "", description: config.activityLog[`${prefix}DescriptionTemplate`] || "" }}
            defaultValue={{ title: "", description: "" }}
            isDefault={(value) => !value.title.trim() && !value.description.trim()}
            saveOnApply
            onApply={(value) => moderation.updateSection(
              [`activityLog.${prefix}TitleTemplate`, `activityLog.${prefix}DescriptionTemplate`],
              { activityLog: { [`${prefix}TitleTemplate`]: value.title, [`${prefix}DescriptionTemplate`]: value.description } },
            )}
            defaultMessage="Botul va folosi titlul și descrierea standard."
            renderEditor={(value, change) => <>
              <p className="break-words text-xs text-muted-foreground">{MEMBER_VARIABLES}{kind === "leave" && " · {server_left_at} · {server_left_at_relative} · {server_duration}"}</p>
              <Field label="Titlu mesaj" value={value.title} onChange={(title) => change({ ...value, title })} />
              <Field label="Descriere mesaj" multiline maxLength={2000} value={value.description} onChange={(description) => change({ ...value, description })} />
              <div className="rounded-md bg-muted/50 p-3 text-xs">
                <p className="font-medium">{renderMemberLogPreview(value.title, kind, kind === "join" ? "👋 Membru nou · a intrat pe server" : "🚪 Membru a părăsit serverul")}</p>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{renderMemberLogPreview(value.description, kind, kind === "join" ? "Un membru nou s-a alăturat serverului." : "Membrul a părăsit serverul.")}</p>
              </div>
            </>}
          />
        </Card>;
      })}
      <Card title="Mesaje de moderare" description="Titlul și descrierea notificărilor de moderare, cu variabile combinabile.">
        <MessageCustomizationDialog
          triggerId="moderation-embed-template" title="Mesajele embed de moderare"
          description="Personalizează textul fără să schimbi activarea, aspectul sau canalele."
          value={{ titleTemplate: config.embeds.titleTemplate, descriptionTemplate: config.embeds.descriptionTemplate }}
          defaultValue={MODERATION_DEFAULT}
          isDefault={(value) => value.titleTemplate === MODERATION_DEFAULT.titleTemplate && value.descriptionTemplate === MODERATION_DEFAULT.descriptionTemplate}
          saveOnApply
          onApply={(value) => moderation.updateSection(["embeds.titleTemplate", "embeds.descriptionTemplate"], { embeds: value })}
          defaultMessage="Botul va folosi titlul și descrierea standard pentru mesajele de moderare."
          renderEditor={(template, onChange) => <ModerationEmbedTemplateEditor template={template} onChange={onChange} />}
        />
      </Card>
    </div>}
    {!bot.data ? <p role={bot.error ? "alert" : undefined}>{bot.error?.message || <Loader2 className="h-6 w-6 animate-spin" />}</p> : <div className="grid gap-4 md:grid-cols-2">
      <Card title="Raport zilnic" description="Textele și etichetele raportului; canalul de publicare se configurează separat.">
        <MessageCustomizationDialog
          triggerId="daily-stats-template" title="Mesajul raportului zilnic"
          description="Editează doar textele raportului, fără să modifici canalul, culoarea sau imaginile."
          value={{
            title: bot.data.dailyStats.title, description: bot.data.dailyStats.description,
            footer: bot.data.dailyStats.footer, activityTitle: bot.data.dailyStats.activityTitle,
            channelsTitle: bot.data.dailyStats.channelsTitle, emptyChannelsText: bot.data.dailyStats.emptyChannelsText,
            metricLabels: { ...bot.data.dailyStats.metricLabels },
          }}
          defaultValue={DAILY_DEFAULT} isDefault={(value) => JSON.stringify(value) === JSON.stringify(DAILY_DEFAULT)}
          saveOnApply onApply={(value) => saveBotMessages({ dailyStats: value })}
          defaultMessage="Se vor folosi textele standard ale raportului zilnic."
          renderEditor={(value, change) => <>
            <p className="break-words text-xs text-muted-foreground">{"{guild} · {date} · {year} · {month} · {day} · {timestamp} · {timestamp_relative} · {messages} · {uniqueUsers} · {boosts} · {joins} · {leaves} · {peakVoice}"}</p>
            <Field label="Titlul raportului" value={value.title} onChange={(title) => change({ ...value, title })} />
            <Field label="Descrierea raportului" multiline maxLength={4000} value={value.description} onChange={(description) => change({ ...value, description })} />
            {([
              ["footer", "Footer"], ["activityTitle", "Titlul activității"],
              ["channelsTitle", "Titlul canalelor active"], ["emptyChannelsText", "Text când nu există canale active"],
            ] as const).map(([key, label]) => <Field key={key} label={label} maxLength={key === "footer" ? 2048 : key === "emptyChannelsText" ? 1024 : 256} value={value[key]} onChange={(text) => change({ ...value, [key]: text })} />)}
            {Object.entries(value.metricLabels).map(([key, text]) => <Field key={key} label={`Etichetă ${key}`} value={text} onChange={(next) => change({ ...value, metricLabels: { ...value.metricLabels, [key]: next } })} />)}
          </>}
        />
      </Card>
      <Card title="Anunțul parteneriatului" description="Mesajul publicat când stafful aprobă un parteneriat.">
        <MessageCustomizationDialog
          triggerId="alliance-announcement-template" title="Anunțul public al parteneriatului"
          description="Personalizează textul anunțului; canalul și regulile de aprobare nu se modifică."
          value={bot.data.tickets.allianceAnnouncementTemplate}
          defaultValue={ALLIANCE_DEFAULT} isDefault={(value) => value === ALLIANCE_DEFAULT}
          saveOnApply onApply={(value) => saveBotMessages({ allianceAnnouncementTemplate: value })}
          defaultMessage="Se va folosi anunțul standard al alianței."
          renderEditor={(value, change) => <>
            <p className="break-words text-xs text-muted-foreground">{"{server_name} · {description} · {invite} · {representative} · {members_total} · {members_online} · {members} · {motivation} · {offer} · {terms} · {applicant} · {applicant_mention} · {timestamp} · {timestamp_relative} · {date} · {time} · {year}"}</p>
            <Field label="Textul anunțului" multiline maxLength={2000} value={value} onChange={change} />
          </>}
        />
      </Card>
    </div>}
  </div></EmojiContext.Provider>;
}
