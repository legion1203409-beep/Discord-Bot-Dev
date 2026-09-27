import { useState } from "react";
import { Check, ChevronDown, Folder } from "lucide-react";
import "./_group.css";
import "./Refined.css";

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

export function Refined() {
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
    <main className="provision-refined">
      <div className="refined-shell">
        <section className="refined-panel" aria-label="Pregătirea serverului">
          <header className="refined-header">
            <div className="refined-topline">
              <span className="refined-eyebrow">Pregătirea serverului</span>
              <span className="refined-count"><strong>{selected.size}</strong> / {categories.length} selectate</span>
            </div>
            <div className="refined-title-row">
              <div>
                <h1>Alege ce pregătim</h1>
                <p>Doar categoriile selectate vor fi create. Restul setărilor rămân neschimbate.</p>
              </div>
            </div>
            <div className="refined-progress" aria-label={`${selected.size} din ${categories.length} selectate`}>
              <span style={{ width: `${(selected.size / categories.length) * 100}%` }} />
            </div>
          </header>

          <div className="refined-category-list">
            {categories.map((category) => {
              const isSelected = selected.has(category.key);
              const isOpen = expanded === category.key;
              return (
                <article className={`refined-category ${isSelected ? "is-selected" : ""}`} key={category.key}>
                  <label className="refined-checkbox">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      aria-label={`Selectează ${category.label}`}
                      onChange={() => toggleSelected(category.key)}
                    />
                    <span><Check size={12} strokeWidth={3} aria-hidden="true" /></span>
                  </label>
                  <span className="refined-icon"><Folder size={16} strokeWidth={1.8} aria-hidden="true" /></span>
                  <button
                    type="button"
                    className="refined-category-copy"
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? null : category.key)}
                  >
                    <strong>{category.label}</strong>
                    <span className="refined-meta">{category.items.length} destinații</span>
                    <span className="refined-description">{category.description}</span>
                  </button>
                  <button
                    type="button"
                    className={`refined-expand ${isOpen ? "is-open" : ""}`}
                    aria-label={`${isOpen ? "Restrânge" : "Extinde"} ${category.label}`}
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? null : category.key)}
                  >
                    <ChevronDown size={15} aria-hidden="true" />
                  </button>
                  {isOpen && isSelected && (
                    <div className="refined-details">
                      {category.items.map((item) => <span key={item}>{item}</span>)}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <footer className="refined-footer">
            <div className="refined-bulk-actions">
              <button type="button" onClick={() => setSelected(new Set(categories.map((category) => category.key)))}>Toate</button>
              <button type="button" onClick={() => setSelected(new Set())}>Niciuna</button>
            </div>
            <label className="refined-active-control">
              <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
              <span className="refined-switch" aria-hidden="true" />
              <span className="refined-status">{active ? "Activ" : "Oprit"}</span>
            </label>
          </footer>
        </section>
      </div>
    </main>
  );
}