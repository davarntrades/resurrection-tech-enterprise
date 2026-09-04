"use client";

import { STATUS_LABEL, type Integration } from "./integrations-data";

/* ============================================================
   One tile. A button, not a card: selecting it reveals the
   detail panel, so it has to be reachable and operable by
   keyboard and announce its own selected state.

   Status is carried by a mark and a label as well as by tone —
   nothing here is distinguished by colour alone.
   ============================================================ */

export function IntegrationTile({
  item,
  selected,
  onSelect,
}: {
  item: Integration;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={`im-tile im-tile--${item.status}${selected ? " is-selected" : ""}`}
      onClick={() => onSelect(item.id)}
      onMouseEnter={() => onSelect(item.id)}
      onFocus={() => onSelect(item.id)}
      aria-pressed={selected}
      aria-describedby="im-detail"
    >
      <span className="im-tile-mark" aria-hidden="true" />
      <span className="im-tile-label">{item.label}</span>
      <span className="sr-only"> — {STATUS_LABEL[item.status]}</span>
    </button>
  );
}
