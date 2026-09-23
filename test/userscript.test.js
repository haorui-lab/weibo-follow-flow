import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Cookie parsing utility
 */
export function getCookie(cookieString, name) {
  const match = cookieString.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : null;
}

export const RESERVED_ROUTES = new Set([
  'home',
  'hot',
  'newhot',
  'friends',
  'fav',
  'search',
  'status',
  'detail',
  'tv',
  'video',
  'chat',
  'message',
  'setting',
  'logout',
  'login',
  'signup',
  'help',
  'all',
  'special',
  'top',
  'category',
  'feed',
  'unread',
  'trending'
]);

/**
 * Determines whether a URL or path represents a user profile page
 */
export function isProfilePage(urlOrPath) {
  const path = (urlOrPath || (typeof window !== 'undefined' ? window.location.pathname : ''))
    .replace(/^https?:\/\/[^\/]+/, '')
    .split('?')[0]
    .split('#')[0];

  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return false;

  const firstSegment = segments[0].toLowerCase();
  if (RESERVED_ROUTES.has(firstSegment)) return false;

  // Direct /u/UID format: e.g. /u/1642634100
  if (firstSegment === 'u' && segments.length >= 2 && /^\d+$/.test(segments[1])) {
    return true;
  }

  // Direct /n/Nickname format: e.g. /n/haorui
  if (firstSegment === 'n' && segments.length >= 2) {
    return true;
  }

  // Custom vanity domain: e.g. /kaifulee
  if (segments.length === 1 && /^[a-zA-Z0-9_-]{1,30}$/.test(firstSegment)) {
    return true;
  }

  return false;
}

/**
 * Extracts UID from /u/UID profile links
 */
export function extractUidFromProfileUrl(urlOrHref) {
  if (!urlOrHref) return null;
  const match = String(urlOrHref).match(/\/u\/(\d+)/);
  if (match) return match[1];
  return null;
}

/**
 * Extracts user relationship data recursively from Weibo AJAX responses
 */
export function extractUsersFromWeiboData(data, results = new Map()) {
  if (!data || typeof data !== 'object') return results;

  // Direct user object
  if (data.idstr || data.id) {
    const uid = String(data.idstr || data.id);
    const hasFollowing = data.following !== undefined || data.is_following !== undefined;
    if (hasFollowing && (data.screen_name || data.name || data.avatar_hd || data.profile_url)) {
      const following = Boolean(data.following ?? data.is_following);
      results.set(uid, {
        uid,
        screen_name: data.screen_name || data.name || '',
        following,
        follow_me: Boolean(data.follow_me)
      });
    }
  }

  // Status user
  if (data.user && typeof data.user === 'object') {
    extractUsersFromWeiboData(data.user, results);
  }

  // Retweeted status user
  if (data.retweeted_status && typeof data.retweeted_status === 'object') {
    extractUsersFromWeiboData(data.retweeted_status, results);
  }

  // Array of statuses or cards
  if (Array.isArray(data)) {
    for (const item of data) {
      extractUsersFromWeiboData(item, results);
    }
  } else {
    for (const key of Object.keys(data)) {
      if (typeof data[key] === 'object' && data[key] !== null) {
        extractUsersFromWeiboData(data[key], results);
      }
    }
  }

  return results;
}

/**
 * Vue 3 Component tree inspector
 */
export function searchVueComponentForAuthor(comp) {
  if (!comp) return null;

  let current = comp;
  let depth = 0;
  while (current && depth < 15) {
    const props = current.props || {};
    const setup = current.setupState || {};
    const candidates = [
      props.article,
      props.status,
      props.mblog,
      props.item,
      props.card,
      setup.article,
      setup.status,
      setup.mblog,
      setup.item
    ];

    for (const item of candidates) {
      if (item && typeof item === 'object') {
        const user = item.user || (item.idstr && item.screen_name ? item : null);
        if (user) {
          const uid = String(user.idstr || user.id || '');
          if (uid) {
            return {
              uid,
              screen_name: user.screen_name || '',
              following: user.following !== undefined ? Boolean(user.following) : undefined
            };
          }
        }
      }
    }

    current = current.parent;
    depth++;
  }

  return null;
}

/**
 * FollowStateManager manages global follow states and notifications
 */
export class FollowStateManager {
  constructor() {
    this.cache = new Map();
    this.nameToUid = new Map();
    this.listeners = new Set();
  }

  get(uidOrName) {
    if (!uidOrName) return null;
    const key = String(uidOrName).toLowerCase();
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    const mappedUid = this.nameToUid.get(key);
    if (mappedUid && this.cache.has(mappedUid)) {
      return this.cache.get(mappedUid);
    }
    return null;
  }

  set(uid, state) {
    if (!uid) return;
    const strUid = String(uid);
    const prev = this.cache.get(strUid) || {};
    const updated = {
      ...prev,
      ...state,
      uid: strUid,
      updatedAt: Date.now()
    };
    this.cache.set(strUid, updated);

    if (updated.screen_name) {
      this.nameToUid.set(updated.screen_name.toLowerCase(), strUid);
    }

    this.notify(strUid, updated);
    return updated;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(uid, state) {
    for (const listener of this.listeners) {
      try {
        listener(uid, state);
      } catch (err) {
        console.error('Error in state listener:', err);
      }
    }
  }
}

/**
 * ButtonStateMachine simulates the button state transitions with 2-step confirmation
 */
export class ButtonStateMachine {
  constructor({ uid, initialFollowing = false, onAction, onStateChange, twoStepUnfollow = false }) {
    this.uid = uid;
    this.state = initialFollowing ? 'FOLLOWING' : 'NOT_FOLLOWING';
    this.onAction = onAction;
    this.onStateChange = onStateChange;
    this.confirmTimer = null;
    this.confirmTimeoutMs = 3000;
    this.twoStepUnfollow = twoStepUnfollow;
  }

  setState(newState) {
    this.state = newState;
    if (this.onStateChange) {
      this.onStateChange(newState);
    }
  }

  async handleClick() {
    if (this.state === 'NOT_FOLLOWING') {
      this.setState('FOLLOWING_IN_PROGRESS');
      const success = await this.onAction('FOLLOW');
      if (success) {
        this.setState('FOLLOWING');
      } else {
        this.setState('FAILED');
        setTimeout(() => this.setState('NOT_FOLLOWING'), 1500);
      }
    } else if (this.state === 'FOLLOWING') {
      if (this.twoStepUnfollow) {
        this.setState('CONFIRMING_UNFOLLOW');
        if (this.confirmTimer) clearTimeout(this.confirmTimer);
        this.confirmTimer = setTimeout(() => {
          if (this.state === 'CONFIRMING_UNFOLLOW') {
            this.setState('FOLLOWING');
          }
        }, this.confirmTimeoutMs);
      } else {
        this.setState('UNFOLLOWING_IN_PROGRESS');
        const success = await this.onAction('UNFOLLOW');
        if (success) {
          this.setState('NOT_FOLLOWING');
        } else {
          this.setState('FAILED');
          setTimeout(() => this.setState('FOLLOWING'), 1500);
        }
      }
    } else if (this.state === 'CONFIRMING_UNFOLLOW') {
      if (this.confirmTimer) clearTimeout(this.confirmTimer);
      this.setState('UNFOLLOWING_IN_PROGRESS');
      const success = await this.onAction('UNFOLLOW');
      if (success) {
        this.setState('NOT_FOLLOWING');
      } else {
        this.setState('FAILED');
        setTimeout(() => this.setState('FOLLOWING'), 1500);
      }
    }
  }

  handleExternalStateChange(following) {
    if (this.state === 'FOLLOWING_IN_PROGRESS' || this.state === 'UNFOLLOWING_IN_PROGRESS') {
      return;
    }
    if (this.confirmTimer) {
      clearTimeout(this.confirmTimer);
      this.confirmTimer = null;
    }
    this.setState(following ? 'FOLLOWING' : 'NOT_FOLLOWING');
  }

  destroy() {
    if (this.confirmTimer) {
      clearTimeout(this.confirmTimer);
      this.confirmTimer = null;
    }
  }
}

// ==================== Unit Tests ====================

test('getCookie extracts XSRF-TOKEN and other cookies accurately', () => {
  const cookieStr = 'SUB=_2A25...; XSRF-TOKEN=test-token-12345; login_sid_t=987654321';
  assert.equal(getCookie(cookieStr, 'XSRF-TOKEN'), 'test-token-12345');
  assert.equal(getCookie(cookieStr, 'login_sid_t'), '987654321');
  assert.equal(getCookie(cookieStr, 'SUB'), '_2A25...');
  assert.equal(getCookie(cookieStr, 'nonexistent'), null);
});

test('extractUidFromProfileUrl parses user IDs from Weibo URLs', () => {
  assert.equal(extractUidFromProfileUrl('/u/1642634100'), '1642634100');
  assert.equal(extractUidFromProfileUrl('https://weibo.com/u/1642634100'), '1642634100');
  assert.equal(extractUidFromProfileUrl('https://weibo.com/u/1642634100?tabtype=feed'), '1642634100');
  assert.equal(extractUidFromProfileUrl('/hot'), null);
  assert.equal(extractUidFromProfileUrl(null), null);
});

test('extractUsersFromWeiboData parses feed JSON responses accurately', () => {
  const sampleFeed = {
    statuses: [
      {
        id: 501234567890,
        idstr: '501234567890',
        text: '这是一条微博内容',
        user: {
          id: 1642634100,
          idstr: '1642634100',
          screen_name: '测试大V',
          following: true,
          follow_me: false
        }
      },
      {
        id: 501234567891,
        idstr: '501234567891',
        text: '转发了一条微博',
        user: {
          id: 2839401928,
          idstr: '2839401928',
          screen_name: '普通博主',
          following: false
        },
        retweeted_status: {
          idstr: '4999999999',
          user: {
            idstr: '3141592653',
            screen_name: '原始作者',
            following: true
          }
        }
      }
    ]
  };

  const users = extractUsersFromWeiboData(sampleFeed);
  assert.equal(users.size, 3);

  const u1 = users.get('1642634100');
  assert.ok(u1);
  assert.equal(u1.screen_name, '测试大V');
  assert.equal(u1.following, true);

  const u2 = users.get('2839401928');
  assert.ok(u2);
  assert.equal(u2.screen_name, '普通博主');
  assert.equal(u2.following, false);

  const u3 = users.get('3141592653');
  assert.ok(u3);
  assert.equal(u3.screen_name, '原始作者');
  assert.equal(u3.following, true);
});

test('searchVueComponentForAuthor extracts author from Vue 3 component tree', () => {
  const mockVueTree = {
    props: {},
    parent: {
      props: {
        status: {
          user: {
            idstr: '1642634100',
            screen_name: '科技先锋',
            following: true
          }
        }
      },
      parent: null
    }
  };

  const author = searchVueComponentForAuthor(mockVueTree);
  assert.ok(author);
  assert.equal(author.uid, '1642634100');
  assert.equal(author.screen_name, '科技先锋');
  assert.equal(author.following, true);
});

test('isProfilePage correctly identifies user profile pages and excludes feeds', () => {
  // 1. Profile URLs (should return true)
  assert.equal(isProfilePage('/u/1642634100'), true);
  assert.equal(isProfilePage('/u/1642634100?tabtype=feed'), true);
  assert.equal(isProfilePage('https://weibo.com/u/1642634100'), true);
  assert.equal(isProfilePage('/n/测试用户'), true);
  assert.equal(isProfilePage('/kaifulee'), true);
  assert.equal(isProfilePage('https://weibo.com/kaifulee'), true);

  // 2. Status & Detail pages (should return false, buttons should appear on tweets/posts)
  assert.equal(isProfilePage('/status/501234567890'), false);
  assert.equal(isProfilePage('/detail/501234567890'), false);
  assert.equal(isProfilePage('https://weibo.com/status/501234567890'), false);

  // 3. System & Feed timelines (should return false)
  assert.equal(isProfilePage('/home'), false);
  assert.equal(isProfilePage('/hot'), false);
  assert.equal(isProfilePage('/newhot'), false);
  assert.equal(isProfilePage('/friends'), false);
  assert.equal(isProfilePage('/search?q=AI'), false);
  assert.equal(isProfilePage('/'), false);
  assert.equal(isProfilePage(''), false);
  assert.equal(isProfilePage(null), false);
});

test('FollowStateManager syncs updates and resolves by UID and screen_name', () => {
  const manager = new FollowStateManager();
  const updates = [];

  const unsub = manager.subscribe((uid, state) => {
    updates.push({ uid, state });
  });

  manager.set('1642634100', { screen_name: 'kaifulee', following: true });
  manager.set('9876543210', { screen_name: 'test_user', following: false });

  assert.equal(updates.length, 2);
  assert.equal(updates[0].uid, '1642634100');
  assert.equal(updates[0].state.following, true);

  // Resolve by UID
  assert.equal(manager.get('1642634100').following, true);
  // Resolve by screen_name
  assert.equal(manager.get('kaifulee').following, true);
  assert.equal(manager.get('test_user').following, false);

  unsub();
});

test('ButtonStateMachine handles direct 1-click unfollow by default', async () => {
  let executedAction = null;

  const machine = new ButtonStateMachine({
    uid: '1642634100',
    initialFollowing: true,
    onAction: async (action) => {
      executedAction = action;
      return true;
    }
  });

  assert.equal(machine.state, 'FOLLOWING');

  // Click once while FOLLOWING -> directly execute UNFOLLOW
  await machine.handleClick();
  assert.equal(executedAction, 'UNFOLLOW');
  assert.equal(machine.state, 'NOT_FOLLOWING');

  // Click while NOT_FOLLOWING -> execute FOLLOW
  await machine.handleClick();
  assert.equal(executedAction, 'FOLLOW');
  assert.equal(machine.state, 'FOLLOWING');

  machine.destroy();
});

test('ButtonStateMachine handles optional 2-step unfollow when configured', async () => {
  let executedAction = null;

  const machine = new ButtonStateMachine({
    uid: '1642634100',
    initialFollowing: true,
    twoStepUnfollow: true,
    onAction: async (action) => {
      executedAction = action;
      return true;
    }
  });
  machine.confirmTimeoutMs = 60;

  assert.equal(machine.state, 'FOLLOWING');

  // Step 1: Click while FOLLOWING -> enter CONFIRMING_UNFOLLOW
  await machine.handleClick();
  assert.equal(machine.state, 'CONFIRMING_UNFOLLOW');

  // Step 2: Click while CONFIRMING_UNFOLLOW -> execute UNFOLLOW
  await machine.handleClick();
  assert.equal(executedAction, 'UNFOLLOW');
  assert.equal(machine.state, 'NOT_FOLLOWING');

  machine.destroy();
});
