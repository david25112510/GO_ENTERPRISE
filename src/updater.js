// updater.js — verificação e instalação de novas versões usando a MESMA pasta compartilhada dos dados,
// numa subpasta "atualizacoes". Não depende de nenhum servidor próprio: quando o gestor quiser publicar
// uma versão nova, basta gerar o instalador (npm run dist) e colocar o .exe + um version.json nessa
// subpasta — todo PC instalado detecta sozinho e oferece a atualização.
//
// Formato esperado de <pasta compartilhada>/atualizacoes/version.json:
// {
//   "version": "8.2.0",
//   "installer": "GO-Enterprise-Setup-8.2.0.exe",
//   "notes": "Texto curto sobre o que mudou nesta versão.",
//   "publishedAt": "2026-08-10T12:00:00.000Z"
// }
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { shell } = require('electron');

function parseVersion(v) {
  return String(v || '0.0.0').split('.').map(n => parseInt(n, 10) || 0);
}

// retorna 1 se a>b, -1 se a<b, 0 se igual
function compareVersions(a, b) {
  const pa = parseVersion(a), pb = parseVersion(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0, db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

function checkForUpdate(updatesFolder, currentVersion) {
  if (!updatesFolder) return { available: false, reason: 'sem-pasta-configurada' };
  const manifestPath = path.join(updatesFolder, 'version.json');
  if (!fs.existsSync(manifestPath)) return { available: false, reason: 'sem-manifesto' };
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (e) {
    return { available: false, reason: 'manifesto-invalido', error: e.message };
  }
  if (!manifest.version || !manifest.installer) return { available: false, reason: 'manifesto-incompleto' };
  const installerPath = path.join(updatesFolder, manifest.installer);
  const installerExists = fs.existsSync(installerPath);
  const isNewer = compareVersions(manifest.version, currentVersion) > 0;
  return {
    available: isNewer && installerExists,
    isNewer,
    installerExists,
    currentVersion,
    latestVersion: manifest.version,
    notes: manifest.notes || '',
    publishedAt: manifest.publishedAt || null,
    installerPath: installerExists ? installerPath : null
  };
}

// copia o instalador para uma pasta temporária local (evita rodar o .exe direto de dentro da pasta
// sincronizada, o que pode falhar se o cliente de nuvem ainda estiver "puxando" o arquivo) e o abre.
async function downloadAndLaunchInstaller(installerPath) {
  if (!installerPath || !fs.existsSync(installerPath)) {
    throw new Error('Instalador não encontrado na pasta de atualizações.');
  }
  const tmpDir = path.join(os.tmpdir(), 'go-enterprise-update');
  fs.mkdirSync(tmpDir, { recursive: true });
  const dest = path.join(tmpDir, path.basename(installerPath));
  await fs.promises.copyFile(installerPath, dest);
  const result = await shell.openPath(dest);
  if (result) throw new Error('Não foi possível abrir o instalador: ' + result);
  return dest;
}

module.exports = { checkForUpdate, downloadAndLaunchInstaller, compareVersions };
