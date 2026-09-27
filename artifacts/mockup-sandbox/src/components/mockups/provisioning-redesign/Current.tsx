import { useState } from "react";
import { ChevronDown, Folder } from "lucide-react";
import "./_group.css";

const categories = [
  {
    key: "gameplay",
    label: "Joc și evenimente",
    description: "Cufere, lupte, boss, negustor și clasamente.",
    items: ["Cufere", "Ora Umbrelor", "Dragonul Stins", "Negustorul", "Clasamente"],
  },
  {
    key: "reports",
    label: "Rapoarte",
    description: "Canal separat pentru raportul zilnic, vizibil tuturor și doar cu scrierea botului.",
    items: ["Categorie Rapoarte", "#statistici-zilnice"],
  },
  {
    key: "admin",
    label: "Administrator",
    description: "Consiliu, Frăție, audit și categoriile de tichete.",
    items: ["Consiliul Umbrelor", "Chivotul Frăției", "Tichete", "Audit"],
  },
  {
    key: "filtered",
    label: "Mesaje filtrate",
    description: "Jurnale pentru anti-spam și moderarea AI.",
    items: ["Jurnal anti-spam", "Jurnal moderare AI"],
  },
  {
    key: "links",
    label: "Linkuri",
    description: "Categorie pregătită pentru canalele de filtrare linkuri.",
    items: ["Categorie Linkuri"],
  },
  {
    key: "security",
    label: "Securitate",
    description: "Alerte anti-raid și comportament suspect.",
    items: ["Alerte anti-raid", "Alerte comportament suspect"],
  },
  {
    key: "verification",
    label: "Verificare",
    description: "Canalul pentru verificarea membrilor.",
    items: ["Canal verificare"],
  },
];

export function Current() {
  const [selected, setSelected] = useState(() => new Set(categories.slice(1).map((category) => category.key)));
  const [expanded, setExpanded] = useState<string | null>("gameplay");
  const [active, setActive] = useState(true);

  const toggleSelected = (key: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <main className="provision-current">
      <div className="current-shell">
        <section className="current-provision-panel" aria-label="Categorii de pregătire">
          <header className="current-panel-heading">
            <div>
              <span className="current-eyebrow">PROVISIONING</span>
              <h1>Ce se creează</h1>
            </div>
            <span className="current-count">{selected.size}/{categories.length}</span>
          </header>
          <p className="current-intro">
            Selectează doar categoriile pe care botul are voie să le pregătească. Celelalte nu sunt atinse.
          </p>

          <div className="current-category-list">
            {categories.map((category) => {
              const isSelected = selected.has(category.key);
              const isOpen = expanded === category.key;
              return (
                <div className={`current-category-row ${isSelected ? "is-selected" : ""}`} key={category.key}>
                  <div className="current-category-top">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      aria-label={`Selectează ${category.label}`}
                      onChange={() => toggleSelected(category.key)}
                    />
                    <button
                      type="button"
                      className="current-category-trigger"
                      aria-expanded={isOpen}
                      onClick={() => setExpanded(isOpen ? null : category.key)}
                    >
                      <Folder size={13} aria-hidden="true" />
                      <strong>{category.label}</strong>
                      <small>{category.items.length} destinații · {category.description}</small>
                    </button>
                    <ChevronDown
                      size={13}
                      className={`current-chevron ${isOpen ? "is-open" : ""}`}
                      aria-hidden="true"
                    />
                  </div>
                  {isOpen && isSelected && (
                    <div className="current-category-details">
                      {category.items.map((item) => <span key={item}>{item}</span>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="current-active-row">
            <label className="current-active-toggle">
              <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
              Activ
            </label>
          </div>
          <footer className="current-panel-actions">
            <button type="button" onClick={() => setSelected(new Set(categories.map((category) => category.key)))}>Toate</button>
            <button type="button" onClick={() => setSelected(new Set())}>Niciuna</button>
          </footer>
        </section>
      </div>
    </main>
  );
}