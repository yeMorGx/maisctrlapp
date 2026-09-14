#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const changelogPath = path.join(root, "changelog.md");
const outputPath = path.join(root, "android-update.json");
const build = Number(process.env.GITHUB_RUN_NUMBER ?? 0);

if (!build) throw new Error("GITHUB_RUN_NUMBER é obrigatório para criar o manifesto Android.");

function readPendingChanges() {
  if (!existsSync(changelogPath)) return [];

  const changelog = readFileSync(changelogPath, "utf8");
  const sectionStart = changelog.indexOf("## Não publicado");
  if (sectionStart < 0) return [];

  const sectionContent = changelog.slice(sectionStart + "## Não publicado".length);
  const nextVersionStart = sectionContent.search(/\r?\n##\s+/);
  const pendingSection = nextVersionStart >= 0 ? sectionContent.slice(0, nextVersionStart) : sectionContent;
  return pendingSection
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s+(.+?)\s*$/)?.[1])
    .filter(Boolean);
}

const manifest = {
  schemaVersion: 1,
  product: "MaisCtrl",
  platform: "android",
  version: `0.1.${build}`,
  build,
  releasedAt: new Date().toISOString(),
  downloadUrl: "https://github.com/yeMorGx/maisctrlapp/releases/download/android-latest/maisctrl.apk",
  downloadPageUrl: "https://mais-ctrl.vercel.app/download",
  changes: readPendingChanges(),
};

writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Manifesto Android criado: ${manifest.version} (${manifest.changes.length} mudança(s)).`);
