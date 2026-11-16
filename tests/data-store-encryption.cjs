const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const dataStore = require('../src/dataStore');

test('corporate key encrypts legacy data and missing key cannot overwrite ciphertext', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'go-data-encryption-'));
  const dataPath = path.join(folder, 'gestao_operacional.json');
  const keyPath = path.join(folder, 'corporate.key');
  const originalKeySetting = process.env.GO_ENTERPRISE_DATA_KEY_FILE;
  const sampleData = { employees: [{ id: 'e1', name: 'Confidential marker' }], finance: [{ value: 4321 }] };
  try {
    fs.writeFileSync(dataPath, JSON.stringify({ formatVersion: 1, savedAt: 'before', data: sampleData }), 'utf8');
    dataStore.setFilePath(dataPath);
    assert.deepEqual(dataStore.readData().data, sampleData);

    fs.writeFileSync(keyPath, crypto.randomBytes(32).toString('base64'), 'utf8');
    process.env.GO_ENTERPRISE_DATA_KEY_FILE = keyPath;
    dataStore.writeData(sampleData);
    const encryptedBytes = fs.readFileSync(dataPath, 'utf8');
    const encryptedEnvelope = JSON.parse(encryptedBytes);
    assert.equal(encryptedEnvelope.formatVersion, 2);
    assert.equal(encryptedBytes.includes('Confidential marker'), false);
    assert.deepEqual(dataStore.readData().data, sampleData);

    delete process.env.GO_ENTERPRISE_DATA_KEY_FILE;
    assert.throws(() => dataStore.readData(), /chave corporativa/);
    assert.throws(() => dataStore.writeData({ employees: [] }), /chave corporativa/);
    assert.equal(fs.readFileSync(dataPath, 'utf8'), encryptedBytes);
  } finally {
    dataStore.stopWatch();
    if (originalKeySetting === undefined) delete process.env.GO_ENTERPRISE_DATA_KEY_FILE;
    else process.env.GO_ENTERPRISE_DATA_KEY_FILE = originalKeySetting;
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
