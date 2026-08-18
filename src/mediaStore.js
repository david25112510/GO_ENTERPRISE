// mediaStore.js — armazena as imagens do SELBNEWS como ARQUIVOS de verdade dentro da mesma pasta
// compartilhada já usada pelo dataStore (OneDrive/Google Drive/Dropbox), em vez de embutir como
// base64 dentro do JSON. Assim o mecanismo de sincronização por nuvem que já propaga
// gestao_operacional.json entre os PCs propaga os arquivos de mídia do mesmo jeito, sem precisar de
// servidor novo, e sem inflar o único arquivo de dados com fotos de notícia grandes.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const settingsStore = require('./settingsStore');

const MEDIA_SUBFOLDER = 'selbnews-media';
// o renderer já redimensiona/comprime a imagem via canvas (compressImageFile) antes de mandar aqui,
// então este limite é só uma rede de segurança contra uploads que fujam desse caminho.
const MAX_BYTES = 4 * 1024 * 1024;

// valida pelo conteúdo real do arquivo (magic numbers), não pela extensão/Content-Type declarado —
// mais confiável e não exige nenhuma biblioteca nova.
const SIGNATURES = [
  { mime: 'image/jpeg', ext: 'jpg', check: b => b.length > 2 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  { mime: 'image/png', ext: 'png', check: b => b.length > 3 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
  { mime: 'image/webp', ext: 'webp', check: b => b.length > 11 && b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP' }
];

function mediaRoot() {
  const s = settingsStore.get();
  return s.sharedFolder ? path.join(s.sharedFolder, MEDIA_SUBFOLDER) : null;
}

function parseDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new Error('Formato de imagem inválido.');
  return Buffer.from(m[2], 'base64');
}

function detectType(buffer) {
  return SIGNATURES.find(s => s.check(buffer));
}

// dataUrl já vem redimensionado/comprimido do renderer. Nunca usa o nome original do arquivo —
// gera um nome único (uuid). Retorna o caminho RELATIVO à pasta compartilhada (o que fica salvo em
// db.selbNews[].imagePath / db.selbAlerts[].imagePath), nunca o caminho absoluto do disco.
function saveImage(dataUrl, subfolder) {
  const root = mediaRoot();
  if (!root) throw new Error('Nenhuma pasta compartilhada configurada ainda. Configure em Configurações > Sincronização antes de anexar imagens.');
  const buffer = parseDataUrl(dataUrl);
  if (buffer.length > MAX_BYTES) throw new Error('Imagem muito grande (máx. 4MB após compressão).');
  const type = detectType(buffer);
  if (!type) throw new Error('Formato de imagem não suportado (use JPG, PNG ou WEBP).');
  const safeSubfolder = String(subfolder || 'misc').replace(/[^a-z0-9_-]/gi, '') || 'misc';
  const dir = path.join(root, safeSubfolder);
  fs.mkdirSync(dir, { recursive: true });
  const filename = crypto.randomUUID() + '.' + type.ext;
  fs.writeFileSync(path.join(dir, filename), buffer);
  return path.join(MEDIA_SUBFOLDER, safeSubfolder, filename).split(path.sep).join('/');
}

// resolve caminho relativo -> absoluto, impedindo path traversal (ex: relativePath contendo "..")
function resolveAbsolute(relativePath) {
  const s = settingsStore.get();
  if (!s.sharedFolder || !relativePath) return null;
  const rootAbs = path.normalize(path.join(s.sharedFolder, MEDIA_SUBFOLDER));
  const abs = path.normalize(path.join(s.sharedFolder, relativePath));
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) return null;
  return abs;
}

function resolveFileUrl(relativePath) {
  const abs = resolveAbsolute(relativePath);
  return abs && fs.existsSync(abs) ? pathToFileURL(abs).href : null;
}

function deleteImage(relativePath) {
  try {
    const abs = resolveAbsolute(relativePath);
    if (abs && fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch (e) {
    console.warn('[mediaStore] Falha ao apagar imagem:', e.message);
  }
}

module.exports = { saveImage, deleteImage, resolveFileUrl };
