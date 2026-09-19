/**
 * Build step: emits `theme.css` (a single `:root { --token: value; }` block)
 * from theme.ts, so admin-web and employee-web consume generated CSS custom
 * properties rather than re-declaring tokens (spec §26.6).
 *
 * Usage: ts-node generate-css.ts > theme.css   (wired into each web app's
 * build script once those apps exist, Phase 8).
 */
import { buildCssVariables } from "./theme";

function main(): void {
  const vars = buildCssVariables();
  const lines = Object.entries(vars).map(([name, value]) => `  ${name}: ${value};`);
  const css = [":root {", ...lines, "}", ""].join("\n");
  process.stdout.write(css);
}

main();
