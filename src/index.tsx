import { PanelSection, PanelSectionRow, ToggleField, findInReactTree, staticClasses } from "@decky/ui";
import { definePlugin, routerHook } from "@decky/api";
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

// Off after unload, so a wrapper still mounted in the library passes everything through
let active = true;
const ours = new WeakSet<object>();
const wrapped = new WeakMap<object, unknown>();

// The same component with `after` applied to what it renders. Cached per component, so React keeps
// its instances, and skipped for our own wrappers so a reused element is never wrapped twice.
const wrap = (type: any, after: (out: any) => any): any => {
  if (!type || typeof type !== "object" && typeof type !== "function" || ours.has(type) || type.prototype?.isReactComponent) return type;
  const cached = wrapped.get(type);
  if (cached) return cached;
  let next: any;
  if (typeof type === "function") {
    next = function (this: unknown, ...args: unknown[]) {
      const out = type.apply(this, args);
      return active ? after(out) : out;
    };
  } else if (type.type) next = { ...type, type: wrap(type.type, after) };
  else if (type.render) next = { ...type, render: wrap(type.render, after) };
  else return type;
  ours.add(next);
  wrapped.set(type, next);
  return next;
};

// The grouping component renders the grid with one entry per section; merge them into one
const mergeSections = (out: any) => {
  const grid = findInReactTree(out, (e) => Array.isArray(e?.props?.childSections));
  const sections: Section[] | undefined = grid?.props.childSections;
  if (sections && sections.length > 1 && isEnabled(grid.props.eSortBy)) {
    grid.props.childSections = [{ ...sections[0], subSectionName: "", children: sections.flatMap((s) => s.children) }];
  }
  return out;
};

// A tab's grid renders the grouping component
const patchTabGrid = (out: any) => {
  const grouping = findInReactTree(out, (e) => e?.props?.appOverviews && "eSortBy" in e.props);
  if (grouping) grouping.type = wrap(grouping.type, mergeSections);
  return out;
};

// Steam's tabs and TabMaster's both hold the same tab grid, alone or inside a context provider
const isTabGrid = (e: any) => e?.props?.collection && "eSortBy" in e.props;
const withGrid = (grid: any) => ({ ...grid, type: wrap(grid.type, patchTabGrid) });

// The library page's tab list; patched on copies so Steam's memoized tabs stay untouched
const patchTabs = (out: any) => {
  const holder = findInReactTree(out, (e) => Array.isArray(e?.props?.tabs));
  if (!holder) return out;
  holder.props.tabs = holder.props.tabs.map((tab: any) => {
    const content = tab?.content;
    if (isTabGrid(content)) return { ...tab, content: withGrid(content) };
    const inner = content?.props?.children;
    if (isTabGrid(inner)) return { ...tab, content: { ...content, props: { ...content.props, children: withGrid(inner) } } };
    return tab;
  });
  return out;
};

// /library renders the page, which renders the memoized tab list (the same two levels TabMaster patches)
const libraryPatch = (props: any) => {
  if (!props?.children?.type) return props;
  props.children.type = wrap(props.children.type, (page) => {
    if (page?.type) page.type = wrap(page.type, (list) => {
      if (list?.type) list.type = wrap(list.type, patchTabs);
      return list;
    });
    return page;
  });
  return props;
};

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
  const patch = routerHook.addPatch("/library", libraryPatch);
  return {
    name: "No Library Groups",
    titleView: <div className={staticClasses.Title}>No Library Groups</div>,
    content: <Content />,
    icon: <FaThLarge />,
    onDismount() {
      active = false;
      routerHook.removePatch("/library", patch);
    },
  };
});
