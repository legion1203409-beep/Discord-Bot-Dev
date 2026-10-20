import { useState } from "react";
import {
  AlertTriangle, ChevronRight, CircleHelp, Hash, Send, ShieldAlert,
  ShieldCheck, UserRound,
} from "lucide-react";
import "./_group.css";

const commandGroups = [
  {
    key: "sanctions",
    label: "Sancțiuni",
    commands: [
      { key: "warn", label: "Avertisment (Warn)", target: "user", extra: "" },
      { key: "mute", label: "Restricționare (Mute)", target: "user", extra: "durationMinutes" },
      { key: "unmute", label: "Ridicare restricție (Unmute)", target: "user", extra: "" },
      { key: "kick", label: "Eliminare (Kick)", target: "user", extra: "" },
      { key: "ban", label: "Blocare (Ban)", target: "user", extra: "" },
    ],
  },
  {
    key: "members",
    label: "Administrare membri",
    commands: [
      { key: "nick", label: "Schimbă porecla", target: "user", extra: "nickname" },
      { key: "role", label: "Acordă rol", target: "user", extra: "roleId" },
    ],
  },
  {
    key: "channels",
    label: "Canale și mesaje",
    commands: [
      { key: "purge", label: "Șterge mesaje (Purge)", target: "channel", extra: "purgeAmount" },
      { key: "slowmode", label: "Setează Slowmode", target: "channel", extra: "slowmodeAmount" },
      { key: "lock", label: "Închide canal (Lock)", target: "channel", extra: "" },
      { key: "unlock", label: "Deschide canal (Unlock)", target: "channel", extra: "" },
    ],
  },
] as const;

type CommandKey = (typeof commandGroups)[number]["commands"][number]["key"];
type CommandDefinition = { key: CommandKey; label: string; target: "user" | "channel"; extra: string };
const commandList: CommandDefinition[] = commandGroups.reduce<CommandDefinition[]>(
  (all, group) => [...all, ...group.commands],
  [],
);
const getCommand = (key: CommandKey) => commandList.find((command) => command.key === key)!;

export function StaffTools() {
  const [selected, setSelected] = useState<CommandKey>("warn");
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("");
  const [nickname, setNickname] = useState("");
  const [roleId, setRoleId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("Previzualizare locală · nicio acțiune nu va fi trimisă.");
  const command = getCommand(selected);
  const destructive = ["kick", "ban", "purge", "lock"].includes(selected);
  const selectCommand = (key: CommandKey) => {
    setSelected(key);
    setNote("Previzualizare locală · nicio acțiune nu va fi trimisă.");
  };

  return <div className="staff-preview">
    <main className="staff-shell">
      <div className="staff-breadcrumb"><span>Centru de comandă</span><ChevronRight size={12} /><b>Acțiuni manuale</b></div>
      <header className="staff-heading">
        <div><div className="staff-kicker">Intervenție operator · server selectat</div><h1>Acțiuni manuale</h1><p>Execută comenzi de moderare direct din consolă, ocolind Discord-ul.</p></div>
        <div className="staff-server-chip"><ShieldCheck /> Serverul lui LEGION</div>
      </header>
      <div className="staff-warning"><AlertTriangle /><div><strong>Atenție!</strong> Orice acțiune executată aici va fi aplicată instantaneu pe serverul Discord selectat. Toate comenzile sunt înregistrate în sistemul de audit.</div></div>

      <section className="staff-panel">
        <div className="staff-panel-title"><h2>Tipul acțiunii</h2><span>11 COMENZI DISPONIBILE</span></div>
        <div className="staff-fields">
          <div className="staff-field">
            <label>Tipul Acțiunii</label>
            <div className="staff-control" aria-live="polite"><span className="cc-mono">/{selected}</span><span>·</span><span>{command.label}</span></div>
            <div className="staff-field-help">Comanda selectată: <span className="cc-mono">/{selected}</span></div>
          </div>
          {command.target === "user" ? <div className="staff-field">
            <label htmlFor="target-user">ID Utilizator (Țintă) <em>*</em></label>
            <div style={{ position: "relative" }}><UserRound size={14} style={{ position: "absolute", left: 10, top: 11, color: "#86928a" }} /><input id="target-user" className="staff-control" style={{ paddingLeft: 31 }} placeholder="Discord User ID (ex: 123456789...)" value={targetId} onChange={(event) => setTargetId(event.target.value)} /></div>
            <div className="staff-field-help">ID-ul țintei este necesar pentru această comandă.</div>
          </div> : <div className="staff-field">
            <label htmlFor="target-channel">Canal <em>*</em></label>
            <div style={{ position: "relative" }}><Hash size={14} style={{ position: "absolute", left: 10, top: 11, color: "#86928a" }} /><input id="target-channel" className="staff-control" style={{ paddingLeft: 31 }} placeholder="ID canal Discord" value={channelId} onChange={(event) => setChannelId(event.target.value)} /></div>
            <div className="staff-field-help">Poți introduce manual ID-ul dacă nu este disponibil în metadate.</div>
          </div>}
          {command.extra === "durationMinutes" && <div className="staff-field"><label htmlFor="duration">Durată (Minute) <em>*</em></label><input id="duration" type="number" className="staff-control" placeholder="60" value={duration} onChange={(event) => setDuration(event.target.value)} /><div className="staff-field-help">Între 1 și 40.320 minute.</div></div>}
          {command.extra === "nickname" && <div className="staff-field"><label htmlFor="nickname">Nou Nickname <em>*</em></label><input id="nickname" className="staff-control" placeholder="Nume nou (max 32 char)" value={nickname} onChange={(event) => setNickname(event.target.value)} /><div className="staff-field-help">Maximum 32 de caractere.</div></div>}
          {command.extra === "roleId" && <div className="staff-field"><label htmlFor="role">Rol <em>*</em></label><input id="role" className="staff-control" placeholder="ID rol Discord" value={roleId} onChange={(event) => setRoleId(event.target.value)} /><div className="staff-field-help">ID-ul rolului care va fi acordat.</div></div>}
          {command.extra === "purgeAmount" && <div className="staff-field"><label htmlFor="purge-amount">Număr de mesaje de șters <em>*</em></label><input id="purge-amount" type="number" min={1} max={100} className="staff-control" placeholder="Ex: 50 (Max: 100)" value={amount} onChange={(event) => setAmount(event.target.value)} /><div className="staff-field-help">De la 1 la 100 de mesaje.</div></div>}
          {command.extra === "slowmodeAmount" && <div className="staff-field"><label htmlFor="slowmode">Slowmode (secunde, 0 = oprit) <em>*</em></label><input id="slowmode" type="number" min={0} max={21600} className="staff-control" placeholder="5" value={amount} onChange={(event) => setAmount(event.target.value)} /><div className="staff-field-help">0 dezactivează slowmode.</div></div>}
        </div>
        <div className="staff-field" style={{ marginTop: 13 }}>
          <label htmlFor="reason">Motivul Acțiunii (opțional)</label>
          <textarea id="reason" className="staff-control" style={{ height: 65, padding: "9px 10px", resize: "none" }} placeholder="Motivul va fi înregistrat în loguri și trimis utilizatorului (după caz)..." value={reason} onChange={(event) => setReason(event.target.value)} />
          <div className="staff-field-help">Motivul este inclus în audit și comunicat utilizatorului, după caz.</div>
        </div>
      </section>

      <section className="staff-panel">
        <div className="staff-panel-title"><h2>Alege rapid o comandă</h2><span>GRUPATE CA ÎN CATALOGUL BOTULUI</span></div>
        <div className="staff-group-grid">
          {commandGroups.map((group) => <section className="staff-group" key={group.key}>
            <div className="staff-group-head"><h3>{group.label}</h3><span>{String(group.commands.length).padStart(2,"0")}</span></div>
            <div className="staff-command-list">
              {group.commands.map((item) => <button type="button" key={item.key} onClick={() => selectCommand(item.key)} className={`staff-command ${selected === item.key ? "selected" : ""}`}>
                <code>/{item.key}</code><span>{item.label}</span>{selected === item.key && <ChevronRight />}
              </button>)}
            </div>
          </section>)}
        </div>
      </section>

      <div className="staff-danger"><ShieldAlert /><div><strong>{destructive ? "Confirmare explicită înainte de execuție." : "Verifică ținta și motivul înainte de execuție."}</strong> {selected === "ban" ? "Blocarea (Ban) afectează accesul membrului la serverul Discord selectat." : selected === "kick" ? "Eliminarea (Kick) scoate membrul de pe serverul Discord selectat." : selected === "purge" ? "Ștergerea mesajelor este ireversibilă pentru mesajele vizate." : "În aplicație, înainte de trimitere apare o confirmare pentru acțiunea aleasă."} Previzualizarea nu execută și nu trimite nicio cerere.</div></div>
      <div className="staff-submit-row">
        <span className="staff-submit-hint"><CircleHelp size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />{note}</span>
        <button type="button" className="staff-submit" onClick={() => setNote("Butonul este inactiv în previzualizare. Nicio acțiune nu a fost executată.")}><Send /> Execută Comanda</button>
      </div>
    </main>
  </div>;
}
