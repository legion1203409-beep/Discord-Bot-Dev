import { lazy, type ComponentType } from 'react';
import {
  BrandPage,
  ColorsPage,
  FontsPage,
  GuidelinesPage,
  LayoutPage,
  OverviewPage,
} from './foundations';

function lazyPage(load: () => Promise<ComponentType>) {
  return lazy(async () => ({ default: await load() }));
}

const ButtonDemo = lazyPage(() =>
  import('./demos/button').then(({ ButtonDemo }) => ButtonDemo),
);
const InputDemo = lazyPage(() =>
  import('./demos/input').then(({ InputDemo }) => InputDemo),
);
const SelectDemo = lazyPage(() =>
  import('./demos/select').then(({ SelectDemo }) => SelectDemo),
);
const SwitchDemo = lazyPage(() =>
  import('./demos/switch').then(({ SwitchDemo }) => SwitchDemo),
);
const TextareaDemo = lazyPage(() =>
  import('./demos/textarea').then(({ TextareaDemo }) => TextareaDemo),
);

export type PreviewEntry = {
  id: string;
  name: string;
  description: string;
  Page: ComponentType;
};

export type NavGroup = {
  name: string;
  entries: PreviewEntry[];
};

export const DESIGN_SYSTEM = {
  title: 'Oracolul Cenușii',
  description:
    'Sistem vizual extras din Status: suprafețe de cenușă și noapte, accente de jar și aur, tipografie editorială și componente accesibile.',
} as const;

export const OVERVIEW_ENTRY: PreviewEntry = {
  id: 'overview',
  name: 'Prezentare',
  description: 'Fundamentele vizuale și componentele de bază.',
  Page: OverviewPage,
};

export const NAV_GROUPS: NavGroup[] = [
  {
    name: 'Brand',
    entries: [
      {
        id: 'brand-identity',
        name: 'Identitate',
        description: 'Wordmark, paletă și direcția vizuală extrasă din Status.',
        Page: BrandPage,
      },
      {
        id: 'brand-guidelines',
        name: 'Ghid de compoziție',
        description: 'Reguli vizuale observate în aplicația sursă.',
        Page: GuidelinesPage,
      },
    ],
  },
  {
    name: 'Culori',
    entries: [
      {
        id: 'color-roles',
        name: 'Roluri cromatice',
        description: 'Paleta de jar, aur, cenușă și culori semantice.',
        Page: ColorsPage,
      },
    ],
  },
  {
    name: 'Fonturi',
    entries: [
      {
        id: 'type-scale',
        name: 'Tipografie',
        description: 'Familiile de fonturi folosite de Status.',
        Page: FontsPage,
      },
    ],
  },
  {
    name: 'Layout',
    entries: [
      {
        id: 'spacing-radius',
        name: 'Spațiere și raze',
        description: 'Ritmul de spațiere și colțurile componentelor.',
        Page: LayoutPage,
      },
    ],
  },
  {
    name: 'Acțiuni',
    entries: [
      {
        id: 'button',
        name: 'Butoane',
        description: 'Variante, dimensiuni și stări pentru butoane.',
        Page: ButtonDemo,
      },
    ],
  },
  {
    name: 'Formulare',
    entries: [
      {
        id: 'input',
        name: 'Câmp text',
        description: 'Câmpuri text, placeholder, focus și disabled.',
        Page: InputDemo,
      },
      {
        id: 'select',
        name: 'Select',
        description: 'Selecție accesibilă cu tastatură și pointer.',
        Page: SelectDemo,
      },
      {
        id: 'textarea',
        name: 'Textarea',
        description: 'Câmpuri pentru text pe mai multe rânduri.',
        Page: TextareaDemo,
      },
      {
        id: 'switch',
        name: 'Comutator',
        description: 'Control binar accesibil pentru setări.',
        Page: SwitchDemo,
      },
    ],
  },
];

export const ALL_ENTRIES: PreviewEntry[] = [
  OVERVIEW_ENTRY,
  ...NAV_GROUPS.flatMap((group) => group.entries),
];

const duplicateIds = ALL_ENTRIES.map((entry) => entry.id).filter(
  (id, index, ids) => ids.indexOf(id) !== index,
);
if (duplicateIds.length > 0) {
  throw new Error(
    `Duplicate preview page id(s): ${[...new Set(duplicateIds)].join(', ')}`,
  );
}
