import { PanelSection, PanelSectionRow, ToggleField, staticClasses } from "@decky/ui";
import { definePlugin } from "@decky/api";
import { useState } from "react";
import { FaThLarge } from "react-icons/fa";

// Steam's library sort ids; the sorts not listed here never group
const SORTS: [number, string][] = [
  [5, "Last Played"],
  [4, "Hours Played"],
  [6, "Release Date"],
  [8, "Size on Disk"],
  [9, "Metacritic Score"],
  [11, "Steam Review"],
];
const STORAGE_KEY = "no-library-groups";

type Settings = Record<number, boolean>;
type Section = { subSectionName: string; children: unknown[] };

const load = (): Settings => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
};

let settings = load();
const isEnabled = (sort: number) => settings[sort] ?? true;

type Jsx = (type: unknown, props: any, key?: unknown) => unknown;

const runtime = (window as any).SP_JSX;
const NAMES = ["jsx", "jsxs"] as const;
const original = Object.fromEntries(NAMES.map((name) => [name, runtime[name]])) as Record<string, Jsx>;
// Off after unload when another plugin wrapped on top of us and we cannot unhook
let active = true;

// Merge the library grid's sections into one
const merge = (props: any) => {
  const sections: Section[] | undefined = props?.childSections;
  if (!active || !Array.isArray(sections) || sections.length < 2 || !isEnabled(props.eSortBy)) return props;
  return {
    ...props,
    childSections: [{ ...sections[0], subSectionName: "", children: sections.flatMap((s) => s.children) }],
  };
};

const patched = Object.fromEntries(
  NAMES.map((name) => [name, ((type, props, key) => original[name](type, merge(props), key)) as Jsx]),
);

const Content = () => {
  const [current, setCurrent] = useState(settings);
  const toggle = (sort: number, enabled: boolean) => {
    settings = { ...settings, [sort]: enabled };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setCurrent(settings);
  };
  return (
    <PanelSection title="Remove groups when sorting by">
      {SORTS.map(([sort, label]) => (
        <PanelSectionRow key={sort}>
          <ToggleField label={label} checked={current[sort] ?? true} onChange={(enabled) => toggle(sort, enabled)} />
        </PanelSectionRow>
      ))}
    </PanelSection>
  );
};

export default definePlugin(() => {
  active = true;
  Object.assign(runtime, patched);
  return {
    name: "No Library Groups",
    titleView: <div className={staticClasses.Title}>No Library Groups</div>,
    content: <Content />,
    icon: <FaThLarge />,
    onDismount() {
      // Restore only what is still ours; a later wrapper keeps calling us, so go inert instead
      const ours = NAMES.every((name) => runtime[name] === patched[name]);
      if (ours) Object.assign(runtime, original);
      active = false;
    },
  };
});
