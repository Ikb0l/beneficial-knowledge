const test = require('node:test');
const assert = require('node:assert/strict');

const {
  rpcAdminDeleteSavedView,
  rpcAdminGetPreferences,
  rpcAdminUpdatePreferences,
  rpcAdminUpsertSavedView,
} = require('../../build/main/admin.js');

function createLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class AdminPreferencesMockNakama {
  constructor() {
    this.adminUserId = 'admin-user';
    this.adminTelegramId = 42;
    this.uuidCounter = 0;
    this.auditEntries = [];
    this.preferencesByUser = new Map();
  }

  uuidv4() {
    this.uuidCounter += 1;
    return `saved-view-${this.uuidCounter}`;
  }

  storageRead(reads) {
    const results = [];
    for (const read of reads || []) {
      if (!read || !read.collection || !read.key || !read.userId) continue;

      if (read.collection === 'player_data' && read.key === 'global_mmr' && read.userId === this.adminUserId) {
        results.push({
          collection: read.collection,
          key: read.key,
          userId: read.userId,
          value: { telegramId: this.adminTelegramId, mmr: 1500 },
        });
        continue;
      }

      if (read.collection === 'player_data' && read.key === 'telegram' && read.userId === this.adminUserId) {
        results.push({
          collection: read.collection,
          key: read.key,
          userId: read.userId,
          value: { telegramId: this.adminTelegramId, firstName: 'Admin', lastName: 'User' },
        });
        continue;
      }

      if (read.collection === 'admin_preferences' && read.key === 'console' && this.preferencesByUser.has(read.userId)) {
        results.push({
          collection: read.collection,
          key: read.key,
          userId: read.userId,
          value: clone(this.preferencesByUser.get(read.userId)),
        });
      }
    }
    return results;
  }

  storageWrite(writes) {
    for (const write of writes || []) {
      if (!write || write.collection !== 'admin_preferences' || write.key !== 'console' || !write.userId) {
        continue;
      }
      this.preferencesByUser.set(write.userId, clone(write.value || {}));
    }
    return [];
  }

  sqlQuery(sql, params = []) {
    const normalized = String(sql || '');

    if (normalized.includes('SELECT admin_level FROM admin_users')) {
      return [{ admin_level: 'super_admin' }];
    }

    if (normalized.includes('FROM user_bans')) {
      return [];
    }

    return [];
  }

  sqlExec(sql, params = []) {
    if (String(sql || '').includes('INSERT INTO admin_audit_log')) {
      this.auditEntries.push(params.slice());
    }
    return { rowsAffected: 1 };
  }
}

function createContext() {
  return {
    userId: 'admin-user',
    env: {},
  };
}

test('rpcAdminGetPreferences returns empty defaults for a new admin', () => {
  const nk = new AdminPreferencesMockNakama();
  const response = JSON.parse(rpcAdminGetPreferences(createContext(), createLogger(), nk, '{}'));

  assert.deepEqual(response.preferences, {
    savedViews: {},
    pagePreferences: {},
  });
});

test('saved views are persisted, capped, and replaced by label', () => {
  const nk = new AdminPreferencesMockNakama();
  const ctx = createContext();
  const logger = createLogger();

  for (let index = 0; index < 10; index += 1) {
    rpcAdminUpsertSavedView(
      ctx,
      logger,
      nk,
      JSON.stringify({
        storageKey: 'questions',
        label: `View ${index}`,
        query: `category=cat-${index}`,
      }),
    );
  }

  const replaced = JSON.parse(rpcAdminUpsertSavedView(
    ctx,
    logger,
    nk,
    JSON.stringify({
      storageKey: 'questions',
      label: 'View 5',
      query: 'category=replaced',
    }),
  ));

  assert.equal(replaced.views.length, 8);
  assert.equal(replaced.views[0].label, 'View 5');
  assert.equal(replaced.views[0].query, 'category=replaced');
  assert.equal(replaced.views.filter((view) => view.label === 'View 5').length, 1);
  assert.equal(nk.auditEntries.length >= 1, true);
});

test('preferences update and saved view deletion persist through storage', () => {
  const nk = new AdminPreferencesMockNakama();
  const ctx = createContext();
  const logger = createLogger();

  const created = JSON.parse(rpcAdminUpsertSavedView(
    ctx,
    logger,
    nk,
    JSON.stringify({
      storageKey: 'audit-log',
      label: 'Recent warnings',
      query: 'targetType=warning',
    }),
  ));

  const updated = JSON.parse(rpcAdminUpdatePreferences(
    ctx,
    logger,
    nk,
    JSON.stringify({
      pagePreferences: {
        commandPalette: { lastQuery: 'jobs' },
        dashboard: { collapsed: false },
      },
    }),
  ));

  assert.deepEqual(updated.preferences.pagePreferences, {
    commandPalette: { lastQuery: 'jobs' },
    dashboard: { collapsed: false },
  });

  const deleted = JSON.parse(rpcAdminDeleteSavedView(
    ctx,
    logger,
    nk,
    JSON.stringify({
      storageKey: 'audit-log',
      viewId: created.views[0].id,
    }),
  ));

  assert.deepEqual(deleted.views, []);

  const finalState = JSON.parse(rpcAdminGetPreferences(ctx, logger, nk, '{}'));
  assert.equal(finalState.preferences.savedViews['audit-log'], undefined);
  assert.deepEqual(finalState.preferences.pagePreferences, updated.preferences.pagePreferences);
});
