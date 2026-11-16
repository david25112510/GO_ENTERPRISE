const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');

function loadUpdater() {
  const source = fs.readFileSync(path.join(__dirname, '../src/updater.js'), 'utf8');
  const loaded = { exports: {} };
  const shell = { openPath: async () => '' };
  const localRequire = name => name === 'electron' ? { shell } : require(name);
  vm.runInNewContext(source, { require: localRequire, module: loaded, exports: loaded.exports }, {
    filename: 'src/updater.js'
  });
  return loaded.exports;
}

test('update manifest accepts a direct installer and rejects path escapes', async () => {
  const updater = loadUpdater();
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'go-updater-security-'));
  try {
    const installer = 'GO-Enterprise-Setup-9.0.0.exe';
    fs.writeFileSync(path.join(folder, installer), 'fixture');
    const manifestPath = path.join(folder, 'version.json');
    fs.writeFileSync(manifestPath, JSON.stringify({ version: '9.0.0', installer }));

    const valid = updater.checkForUpdate(folder, '8.14.1');
    assert.equal(valid.available, true);
    assert.equal(valid.installerPath, path.join(folder, installer));

    for (const unsafeName of ['../outside.exe', '..\\outside.exe', 'C:\\outside.exe', 'nested\\installer.exe', 'notes.txt']) {
      assert.equal(updater.resolveInstallerPath(folder, unsafeName), null, unsafeName);
      fs.writeFileSync(manifestPath, JSON.stringify({ version: '9.0.0', installer: unsafeName }));
      assert.equal(updater.checkForUpdate(folder, '8.14.1').available, false, unsafeName);
    }

    const outside = path.join(os.tmpdir(), `go-updater-outside-${path.basename(folder)}.exe`);
    fs.writeFileSync(outside, 'outside fixture');
    const link = path.join(folder, 'linked-installer.exe');
    try {
      fs.symlinkSync(outside, link, 'file');
      fs.writeFileSync(manifestPath, JSON.stringify({ version: '9.0.0', installer: path.basename(link) }));
      assert.equal(updater.checkForUpdate(folder, '8.14.1').available, false);
    } catch (error) {
      if (!['EPERM', 'EACCES', 'UNKNOWN', 'EINVAL'].includes(error.code)) throw error;
    }

    await assert.rejects(() => updater.downloadAndLaunchInstaller(folder, outside),
      /Instalador/);
  } finally {
    try { fs.unlinkSync(path.join(folder, 'linked-installer.exe')); } catch (_) {}
    try { fs.unlinkSync(path.join(os.tmpdir(), `go-updater-outside-${path.basename(folder)}.exe`)); } catch (_) {}
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
