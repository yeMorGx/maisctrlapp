import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = "yeMorGx/maisctrlapp";
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const mobileDirectory = path.resolve(scriptDirectory, "..");
const args = process.argv.slice(2);
const siteDirectoryArgument = args.indexOf("--site-dir");
const siteDirectory = path.resolve(
  siteDirectoryArgument >= 0 ? args[siteDirectoryArgument + 1] : path.join(mobileDirectory, "..", "mais-ctrl"),
);
const dryRun = args.includes("--dry-run");

if (siteDirectoryArgument >= 0 && !args[siteDirectoryArgument + 1]) {
  throw new Error("Use --site-dir com o caminho do repositório do site.");
}

if (!existsSync(siteDirectory)) {
  throw new Error(`Diretório do site não encontrado: ${siteDirectory}`);
}

async function github(pathname) {
  const response = await fetch(`https://api.github.com/repos/${repository}${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "maisctrl-android-site-sync",
    },
  });
  if (!response.ok) throw new Error(`GitHub respondeu ${response.status} para ${pathname}.`);
  return response;
}

const [releaseResponse, runsResponse] = await Promise.all([
  github("/releases/tags/android-latest"),
  github("/actions/workflows/android-apk.yml/runs?branch=main&status=success&per_page=1"),
]);
const release = await releaseResponse.json();
const runs = await runsResponse.json();
const latestRun = runs.workflow_runs?.[0];
const apkAsset = release.assets?.find((asset) => asset.name === "maisctrl.apk");
const checksumAsset = release.assets?.find((asset) => asset.name === "maisctrl.apk.sha256");

if (!apkAsset || !checksumAsset || !latestRun?.run_number) {
  throw new Error("A release Android não possui APK, checksum ou workflow bem-sucedido disponível.");
}

const [apkResponse, checksumResponse] = await Promise.all([
  fetch(apkAsset.browser_download_url, { headers: { "User-Agent": "maisctrl-android-site-sync" } }),
  fetch(checksumAsset.browser_download_url, { headers: { "User-Agent": "maisctrl-android-site-sync" } }),
]);
if (!apkResponse.ok || !checksumResponse.ok) throw new Error("Não foi possível baixar os assets da release Android.");

const apk = Buffer.from(await apkResponse.arrayBuffer());
const checksumText = await checksumResponse.text();
const expectedHash = checksumText.trim().split(/\s+/)[0]?.toLowerCase();
const actualHash = createHash("sha256").update(apk).digest("hex");
if (!expectedHash || expectedHash !== actualHash) {
  throw new Error(`Checksum inválido. Esperado: ${expectedHash ?? "ausente"}; recebido: ${actualHash}.`);
}

const build = Number(latestRun.run_number);
const version = `0.1.${build}`;
const releasedAt = String(latestRun.created_at ?? release.created_at).slice(0, 10);
const apkPath = path.join(siteDirectory, "public", "downloads", "maisctrl.apk");
const releaseInfoPath = path.join(siteDirectory, "src", "content", "androidRelease.ts");
const releaseInfo = readFileSync(releaseInfoPath, "utf8")
  .replace(/version: "[^"]+"/, `version: "${version}"`)
  .replace(/build: \d+/, `build: ${build}`)
  .replace(/releasedAt: "[^"]+"/, `releasedAt: "${releasedAt}"`);

if (dryRun) {
  console.log(`Dry run: ${version} build ${build}, ${apk.length} bytes, SHA-256 ${actualHash}.`);
} else {
  writeFileSync(apkPath, apk);
  writeFileSync(releaseInfoPath, releaseInfo);
  console.log(`APK sincronizado: ${version} build ${build}, ${apk.length} bytes, SHA-256 ${actualHash}.`);
}
