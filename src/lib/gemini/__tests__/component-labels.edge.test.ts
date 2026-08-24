import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CURRENT_PSC_MOCK_COMPONENTS } from "../../psc/mock-exam-contract";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const APP_CLIENT_PATH = resolve(REPO_ROOT, "src/lib/gemini/client.ts");
const EDGE_CLIENT_PATH = resolve(REPO_ROOT, "supabase/functions/_shared/ai-client.ts");

/**
 * COMPONENT_LABELS is duplicated between the Next.js AI client and its Deno
 * port (same duplication class as the mock-exam contract guarded by
 * mock-exam-contract.edge.test.ts). Unlike that shared module, ai-client.ts
 * cannot be imported from Vitest: its `./env.ts`-style import needs
 * allowImportingTsExtensions and env.ts references the Deno global, both of
 * which break `tsc --noEmit`. So the maps are compared as extracted source.
 */
function extractComponentLabels(filePath: string): Record<number, string> {
  const source = readFileSync(filePath, "utf8");
  const block = source.match(/const COMPONENT_LABELS[^=]*=\s*\{([\s\S]*?)\};/);
  if (!block) {
    throw new Error(`COMPONENT_LABELS map not found in ${filePath}`);
  }
  const entries = [...block[1].matchAll(/(\d+)\s*:\s*"((?:[^"\\]|\\.)*)"/g)];
  return Object.fromEntries(entries.map((m) => [Number(m[1]), m[2]]));
}

const CONTRACT_CHINESE_NAMES = new Map<number, string>(
  CURRENT_PSC_MOCK_COMPONENTS.map((component) => [component.number, component.chineseName]),
);

describe("Supabase AI client curriculum label contract", () => {
  const appLabels = extractComponentLabels(APP_CLIENT_PATH);
  const edgeLabels = extractComponentLabels(EDGE_CLIENT_PATH);

  it("covers exactly components 1-7 and matches each label to its component identity", () => {
    // The key-coverage check also guards the extractor itself: an empty match
    // fails here rather than letting the parity assertion pass vacuously.
    // Anchoring the C1-C5 Chinese descriptions to the mock-exam contract
    // catches a mis-described label even if both copies drift together — the
    // pre-4bd97bd Edge copy shipped with the C3 and C4 descriptions swapped
    // while every label still carried the C-number matching its key.
    for (const labels of [appLabels, edgeLabels]) {
      const components = Object.keys(labels)
        .map(Number)
        .sort((a, b) => a - b);
      expect(components).toEqual([1, 2, 3, 4, 5, 6, 7]);
      for (const [component, label] of Object.entries(labels)) {
        const parsed = label.match(/^(?:Supplementary )?C(\d+) (\S+) \(/);
        expect(parsed, `unparseable label for component ${component}: ${label}`).not.toBeNull();
        expect(Number(parsed![1])).toBe(Number(component));
        const contractChineseName = CONTRACT_CHINESE_NAMES.get(Number(component));
        if (contractChineseName) {
          expect(
            contractChineseName.includes(parsed![2]),
            `component ${component} label "${parsed![2]}" does not match contract "${contractChineseName}"`,
          ).toBe(true);
        }
      }
    }
  });

  it("keeps the Edge copy identical to the app copy", () => {
    expect(edgeLabels).toEqual(appLabels);
  });
});
