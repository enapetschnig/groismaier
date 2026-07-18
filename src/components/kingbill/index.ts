/**
 * KingBill-Komponentenbibliothek — zentraler Export.
 *
 * import { KBToolbar, KBToolbarButton, KBButton, KBSectionHeader, KBSearchRow }
 *   from "@/components/kingbill";
 *
 * Dazu passende CSS-Utilities (src/index.css): .kb-page, .kb-panel, .kb-toolbar,
 * .kb-btn, .kb-btn-lg, .kb-btn-primary-green, .kb-btn-blue, .kb-tab,
 * .kb-tab-active, .kb-badge, .kb-input, .kb-section-title
 * und Tailwind-Farben kb-blue, kb-blue-dark, kb-blue-light, kb-green,
 * kb-green-dark, kb-yellow, kb-badge, kb-icon-gray.
 */
export { KBButton, type KBButtonProps } from "./KBButton";
export { KBToolbarButton, type KBToolbarButtonProps } from "./KBToolbarButton";
export { KBToolbar, type KBToolbarProps } from "./KBToolbar";
export { KBSectionHeader, type KBSectionHeaderProps } from "./KBSectionHeader";
export { KBSearchRow, type KBSearchRowProps } from "./KBSearchRow";
