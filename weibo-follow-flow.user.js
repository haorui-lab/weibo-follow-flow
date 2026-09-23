// ==UserScript==
// @name         Weibo FollowFlow
// @name:zh-CN   Weibo FollowFlow - 微博信息流关注/取关助手
// @namespace    https://github.com/haorui-lab/weibo-follow-flow
// @version      0.1.0
// @description  Add minimalist native-style Follow / Unfollow icon button directly to the action bar on Weibo timelines with 2-step confirmation and instant state sync.
// @description:zh-CN 在微博信息流操作栏增加无缝原生风格关注/取关 (+ / ✓) 按钮，支持防误触二次确认与多卡同步。
// @author       haorui
// @homepageURL  https://github.com/haorui-lab/weibo-follow-flow
// @supportURL   https://github.com/haorui-lab/weibo-follow-flow/issues
// @downloadURL  https://raw.githubusercontent.com/haorui-lab/weibo-follow-flow/main/weibo-follow-flow.user.js
// @updateURL    https://raw.githubusercontent.com/haorui-lab/weibo-follow-flow/main/weibo-follow-flow.user.js
// @match        https://weibo.com/*
// @match        https://www.weibo.com/*
// @match        https://d.weibo.com/*
// @match        https://s.weibo.com/*
// @icon         https://weibo.com/favicon.ico
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ==========================================
  // Configuration
  // ==========================================
  const CONFIG = {
    confirmTimeoutMs: 3000,
    scanDebounceMs: 50,
    maxActionWaitMs: 800
  };

  const RESERVED_ROUTES = new Set([
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

  function isProfilePage(urlOrPath) {
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

    // Custom domain: e.g. /kaifulee or /kaifulee/home
    // Single segment or with profile tabs (not /status/ or /detail/)
    if (segments.length === 1 && /^[a-zA-Z0-9_-]{1,30}$/.test(firstSegment)) {
      return true;
    }

    return false;
  }

  function extractUidFromProfileUrl(urlOrHref) {
    if (!urlOrHref) return null;
    const match = String(urlOrHref).match(/\/u\/(\d+)/);
    if (match) return match[1];
    return null;
  }

  function removeAllFollowIcons() {
    const containers = document.querySelectorAll('.weibo-followflow-container');
    for (const container of containers) {
      if (container._unsubscribe) {
        try {
          container._unsubscribe();
        } catch (e) {}
      }
      container.remove();
    }
  }

  // High-Recognition Crisp SVG Icons (+ / ✓ / −) in Weibo Native Palette
  const ICONS = {
    // Pure, sleek Plus (+) for Follow
    follow: `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    `,
    // Pure, sleek Checkmark (✓) for Following
    following: `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 7.5 9 18.5 4 13.5"></polyline>
      </svg>
    `,
    // Pure, sleek Minus (−) for Confirming Unfollow
    unfollowConfirm: `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    `,
    // Native-like Spinner
    loading: `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" class="weibo-follow-spinner">
        <circle cx="12" cy="12" r="9" stroke-opacity="0.25"/>
        <path d="M12 3a9 9 0 0 1 9 9" stroke-linecap="round"/>
      </svg>
    `,
    // Error indicator
    failed: `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `
  };

  // ==========================================
  // 1. Follow State Manager (Single Source of Truth)
  // ==========================================
  class FollowStateManager {
    constructor() {
      // Map<uid, state>
      this.cache = new Map();
      // Map<screen_name_lower, uid>
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
          console.warn('[Weibo-FollowFlow] Error in listener:', err);
        }
      }
    }
  }

  const stateManager = new FollowStateManager();

  // ==========================================
  // 2. Comprehensive Network Interceptor (Fetch + XHR)
  // ==========================================
  function extractUsersFromWeiboData(data) {
    if (!data || typeof data !== 'object') return;

    // Case 1: Direct user object with idstr or id and following
    if (data.idstr || data.id) {
      const uid = String(data.idstr || data.id);
      const hasFollowing = data.following !== undefined || data.is_following !== undefined;
      if (hasFollowing && (data.screen_name || data.name || data.avatar_hd || data.profile_url)) {
        const following = Boolean(data.following ?? data.is_following);
        stateManager.set(uid, {
          uid,
          screen_name: data.screen_name || data.name || '',
          following,
          follow_me: Boolean(data.follow_me)
        });
      }
    }

    // Case 2: Status with user object
    if (data.user && typeof data.user === 'object') {
      extractUsersFromWeiboData(data.user);
    }

    // Case 3: Retweeted status
    if (data.retweeted_status && typeof data.retweeted_status === 'object') {
      extractUsersFromWeiboData(data.retweeted_status);
    }

    // Case 4: Array of statuses or items
    if (Array.isArray(data)) {
      for (const item of data) {
        extractUsersFromWeiboData(item);
      }
    } else {
      // Recurse into common nested wrappers: statuses, data, cards, items
      for (const key of Object.keys(data)) {
        if (typeof data[key] === 'object' && data[key] !== null) {
          extractUsersFromWeiboData(data[key]);
        }
      }
    }
  }

  function initNetworkInterceptor() {
    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    if (!win || win.__weibo_follow_network_hooked) return;
    win.__weibo_follow_network_hooked = true;

    // 1. Hook Fetch
    const originalFetch = win.fetch;
    if (originalFetch) {
      win.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);
        try {
          const url = String(args[0]?.url || args[0] || '');
          if (url.includes('/ajax/') || url.includes('/statuses/') || url.includes('/feed/') || url.includes('/friendships/')) {
            const clone = response.clone();
            clone.json().then(data => {
              if (data) extractUsersFromWeiboData(data);
            }).catch(() => {});
          }
        } catch (err) {}
        return response;
      };
    }

    // 2. Hook XMLHttpRequest
    const originalOpen = win.XMLHttpRequest?.prototype?.open;
    const originalSend = win.XMLHttpRequest?.prototype?.send;
    if (originalOpen && originalSend) {
      win.XMLHttpRequest.prototype.open = function (...args) {
        this._weibo_url = String(args[1] || '');
        return originalOpen.apply(this, args);
      };

      win.XMLHttpRequest.prototype.send = function (...args) {
        this.addEventListener('load', function () {
          try {
            if (this._weibo_url && (this._weibo_url.includes('/ajax/') || this._weibo_url.includes('/statuses/') || this._weibo_url.includes('/feed/') || this._weibo_url.includes('/friendships/'))) {
              const data = JSON.parse(this.responseText);
              if (data) extractUsersFromWeiboData(data);
            }
          } catch (e) {}
        });
        return originalSend.apply(this, args);
      };
    }
  }

  // ==========================================
  // 3. Current User & Vue Component Inspection
  // ==========================================
  let cachedCurrentUserUid = null;

  function getCurrentUserUid() {
    if (cachedCurrentUserUid) return cachedCurrentUserUid;

    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    if (win.$CONFIG && win.$CONFIG.uid) {
      cachedCurrentUserUid = String(win.$CONFIG.uid);
      return cachedCurrentUserUid;
    }

    // Check top navigation avatar or profile link
    const profileLink = document.querySelector('header a[href*="/u/"], nav a[href*="/u/"], a[class*="woo-avatar"][href*="/u/"]');
    if (profileLink) {
      const uid = extractUidFromProfileUrl(profileLink.getAttribute('href'));
      if (uid) {
        cachedCurrentUserUid = uid;
        return uid;
      }
    }

    return null;
  }

  function searchVueComponentForAuthor(element) {
    if (!element) return null;

    let comp = element.__vueParentComponent;
    let depth = 0;
    while (comp && depth < 15) {
      const props = comp.props || {};
      const setup = comp.setupState || {};
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

      comp = comp.parent;
      depth++;
    }

    return null;
  }

  function extractAuthorFromWeiboCard(cardElement) {
    if (!cardElement) return null;

    // 1. Check Vue component hierarchy
    const fromVue = searchVueComponentForAuthor(cardElement);
    if (fromVue && fromVue.uid) {
      return fromVue;
    }

    // 2. Check author links in header / head-info / avatar
    const links = cardElement.querySelectorAll('header a[href*="/u/"], a[class*="name"][href*="/u/"], a[class*="head-info"][href*="/u/"], a[class*="woo-avatar"][href*="/u/"], a[href*="/u/"]');
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      const uid = extractUidFromProfileUrl(href);
      if (uid) {
        const text = link.textContent?.trim() || '';
        return {
          uid,
          screen_name: text,
          following: undefined
        };
      }
    }

    return null;
  }

  // ==========================================
  // 4. Action Executor (Weibo Native AJAX API)
  // ==========================================
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
    return match ? decodeURIComponent(match[3]) : null;
  }

  async function executeFollowViaAPI(uid) {
    const xsrf = getCookie('XSRF-TOKEN');
    const endpoint = 'https://weibo.com/ajax/friendships/create';
    const params = new URLSearchParams();
    params.append('uid', uid);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'x-xsrf-token': xsrf || '',
          'x-requested-with': 'XMLHttpRequest'
        },
        body: params.toString(),
        credentials: 'include'
      });

      if (!response.ok) return false;
      const data = await response.json().catch(() => null);
      if (data && (data.ok === 1 || data.ok === true || data.id || data.user)) {
        return true;
      }
      return response.ok;
    } catch (e) {
      return false;
    }
  }

  async function executeUnfollowViaAPI(uid) {
    const xsrf = getCookie('XSRF-TOKEN');
    // Weibo internal API uses intentionally misspelled "destory"
    const endpoint = 'https://weibo.com/ajax/friendships/destory';
    const params = new URLSearchParams();
    params.append('uid', uid);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'x-xsrf-token': xsrf || '',
          'x-requested-with': 'XMLHttpRequest'
        },
        body: params.toString(),
        credentials: 'include'
      });

      if (!response.ok) return false;
      const data = await response.json().catch(() => null);
      if (data && (data.ok === 1 || data.ok === true)) {
        return true;
      }
      return response.ok;
    } catch (e) {
      return false;
    }
  }

  async function executeFollowToggle(cardElement, uid, targetFollowState) {
    const isFollow = targetFollowState === true;

    // Fallback 1: If target is follow and card already has native follow button, click it
    if (isFollow) {
      const nativeFollowBtn = cardElement.querySelector('button[class*="woo-button"][class*="primary"], div[action-type="follow"], [class*="head-info"] button');
      if (nativeFollowBtn && nativeFollowBtn.textContent && nativeFollowBtn.textContent.includes('关注') && !nativeFollowBtn.textContent.includes('已关注')) {
        nativeFollowBtn.click();
        await sleep(300);
        stateManager.set(uid, { following: true });
        return true;
      }
    }

    const success = isFollow
      ? await executeFollowViaAPI(uid)
      : await executeUnfollowViaAPI(uid);

    if (success) {
      stateManager.set(uid, { following: isFollow });
      return true;
    }

    return false;
  }

  // ==========================================
  // 5. UI Component & Styling
  // ==========================================
  function injectStyles() {
    if (document.getElementById('weibo-followflow-styles')) return;

    const style = document.createElement('style');
    style.id = 'weibo-followflow-styles';
    style.textContent = `
      /* Container inside Weibo action bar / footer */
      .weibo-followflow-container {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        user-select: none;
        margin: 0 4px;
      }

      /* Base Icon Button */
      .weibo-followflow-icon-btn {
        background: transparent;
        border: none;
        padding: 0;
        margin: 0;
        cursor: pointer;
        outline: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #808080;
        transition: color 0.15s ease;
        position: relative;
      }

      /* Circular hover background */
      .weibo-followflow-icon-wrapper {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 9999px;
        background: transparent;
        border: none;
        transition: background-color 0.15s ease, color 0.15s ease, transform 0.15s ease;
      }
      .weibo-followflow-icon-wrapper svg {
        display: block;
      }

      /* NOT_FOLLOWING (+): Neutral gray icon, Weibo Orange hover circle */
      .weibo-followflow-icon-btn.wb-state-follow {
        color: #808080;
      }
      .weibo-followflow-icon-btn.wb-state-follow:hover .weibo-followflow-icon-wrapper {
        background-color: rgba(255, 130, 0, 0.12);
        color: #ff8200;
      }
      .weibo-followflow-icon-btn.wb-state-follow:hover {
        color: #ff8200;
      }

      /* FOLLOWING (✓): Neutral gray, turns Red on hover when (−) appears */
      .weibo-followflow-icon-btn.wb-state-following {
        color: #808080;
      }
      .weibo-followflow-icon-btn.wb-state-following .wb-icon-normal {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 0;
      }
      .weibo-followflow-icon-btn.wb-state-following .wb-icon-hover {
        display: none;
        align-items: center;
        justify-content: center;
        line-height: 0;
      }
      .weibo-followflow-icon-btn.wb-state-following:hover .wb-icon-normal {
        display: none;
      }
      .weibo-followflow-icon-btn.wb-state-following:hover .wb-icon-hover {
        display: inline-flex;
      }
      .weibo-followflow-icon-btn.wb-state-following:hover .weibo-followflow-icon-wrapper {
        background-color: rgba(244, 33, 46, 0.12);
        color: #f4212e;
      }
      .weibo-followflow-icon-btn.wb-state-following:hover {
        color: #f4212e;
      }

      /* CONFIRMING UNFOLLOW (−): Red warning with pulsing animation */
      .weibo-followflow-icon-btn.wb-state-confirm {
        color: #f4212e;
      }
      .weibo-followflow-icon-btn.wb-state-confirm .weibo-followflow-icon-wrapper {
        background-color: rgba(244, 33, 46, 0.15);
        color: #f4212e;
        animation: weibo-follow-pulse 1s infinite alternate;
      }
      @keyframes weibo-follow-pulse {
        from { transform: scale(1); }
        to { transform: scale(1.08); }
      }

      /* LOADING SPINNER */
      .weibo-followflow-icon-btn.wb-state-loading {
        cursor: wait;
        opacity: 0.7;
        pointer-events: none;
      }
      .weibo-follow-spinner {
        animation: weibo-spin 0.85s linear infinite;
      }
      @keyframes weibo-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      /* FAILED */
      .weibo-followflow-icon-btn.wb-state-failed {
        color: #f4212e;
      }
      .weibo-followflow-icon-btn.wb-state-failed .weibo-followflow-icon-wrapper {
        background-color: rgba(244, 33, 46, 0.15);
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function createFollowIconButton(cardElement, uid, initialFollowing) {
    const container = document.createElement('div');
    container.className = 'weibo-followflow-container';
    container.setAttribute('data-wb-author-uid', uid);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'weibo-followflow-icon-btn';

    const wrapper = document.createElement('div');
    wrapper.className = 'weibo-followflow-icon-wrapper';
    btn.appendChild(wrapper);
    container.appendChild(btn);

    let currentState = initialFollowing ? 'FOLLOWING' : 'NOT_FOLLOWING';
    let confirmTimer = null;

    function renderUI() {
      btn.className = 'weibo-followflow-icon-btn';
      wrapper.innerHTML = '';

      if (currentState === 'NOT_FOLLOWING') {
        btn.classList.add('wb-state-follow');
        wrapper.innerHTML = ICONS.follow;
        btn.title = '+ 关注博主';
      } else if (currentState === 'FOLLOWING') {
        btn.classList.add('wb-state-following');
        const normalSpan = document.createElement('span');
        normalSpan.className = 'wb-icon-normal';
        normalSpan.innerHTML = ICONS.following;

        const hoverSpan = document.createElement('span');
        hoverSpan.className = 'wb-icon-hover';
        hoverSpan.innerHTML = ICONS.unfollowConfirm;

        wrapper.appendChild(normalSpan);
        wrapper.appendChild(hoverSpan);
        btn.title = '✓ 已关注 (点击可取消关注)';
      } else if (currentState === 'CONFIRMING_UNFOLLOW') {
        btn.classList.add('wb-state-confirm');
        wrapper.innerHTML = ICONS.unfollowConfirm;
        btn.title = '再次点击确认取消关注';
      } else if (currentState === 'LOADING') {
        btn.classList.add('wb-state-loading');
        wrapper.innerHTML = ICONS.loading;
        btn.title = '处理中...';
      } else if (currentState === 'FAILED') {
        btn.classList.add('wb-state-failed');
        wrapper.innerHTML = ICONS.failed;
        btn.title = '操作失败';
      }
    }

    renderUI();

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (currentState === 'NOT_FOLLOWING') {
        currentState = 'LOADING';
        renderUI();
        const success = await executeFollowToggle(cardElement, uid, true);
        if (success) {
          currentState = 'FOLLOWING';
        } else {
          currentState = 'FAILED';
          renderUI();
          setTimeout(() => {
            if (currentState === 'FAILED') {
              currentState = 'NOT_FOLLOWING';
              renderUI();
            }
          }, 1500);
          return;
        }
        renderUI();
      } else if (currentState === 'FOLLOWING') {
        currentState = 'CONFIRMING_UNFOLLOW';
        renderUI();
        if (confirmTimer) clearTimeout(confirmTimer);
        confirmTimer = setTimeout(() => {
          if (currentState === 'CONFIRMING_UNFOLLOW') {
            currentState = 'FOLLOWING';
            renderUI();
          }
        }, CONFIG.confirmTimeoutMs);
      } else if (currentState === 'CONFIRMING_UNFOLLOW') {
        if (confirmTimer) clearTimeout(confirmTimer);
        currentState = 'LOADING';
        renderUI();
        const success = await executeFollowToggle(cardElement, uid, false);
        if (success) {
          currentState = 'NOT_FOLLOWING';
        } else {
          currentState = 'FAILED';
          renderUI();
          setTimeout(() => {
            if (currentState === 'FAILED') {
              currentState = 'FOLLOWING';
              renderUI();
            }
          }, 1500);
          return;
        }
        renderUI();
      }
    });

    btn.addEventListener('mousedown', (e) => e.stopPropagation());
    btn.addEventListener('mouseup', (e) => e.stopPropagation());

    const unsubscribe = stateManager.subscribe((changedUid, state) => {
      if (changedUid !== uid) return;
      if (currentState === 'LOADING') return;

      if (confirmTimer) {
        clearTimeout(confirmTimer);
        confirmTimer = null;
      }

      if (state.following) {
        currentState = 'FOLLOWING';
      } else {
        currentState = 'NOT_FOLLOWING';
      }
      renderUI();
    });

    container._unsubscribe = unsubscribe;
    container._updateState = (following) => {
      if (currentState === 'LOADING') return;
      currentState = following ? 'FOLLOWING' : 'NOT_FOLLOWING';
      renderUI();
    };

    return container;
  }

  // ==========================================
  // 6. Placement (Weibo Action Bar / Footer)
  // ==========================================
  function insertFollowIcon(cardElement, buttonContainer) {
    // 1. Primary target: Card footer / Toolbar
    const footer = cardElement.querySelector('footer, div[class*="wbpro-feed-footer"], div[class*="Feed_footer"]');
    if (footer) {
      // Find Like button (woo-like-main)
      const likeBtn = footer.querySelector('div[class*="woo-like-main"], div[class*="toolbar_item"]:last-child, [action-type="fl_like"]');
      if (likeBtn) {
        let lWrapper = likeBtn;
        while (lWrapper.parentElement && lWrapper.parentElement !== footer) {
          lWrapper = lWrapper.parentElement;
        }
        if (lWrapper.parentElement === footer) {
          if (lWrapper.nextSibling) {
            footer.insertBefore(buttonContainer, lWrapper.nextSibling);
          } else {
            footer.appendChild(buttonContainer);
          }
          return;
        }
      }

      footer.appendChild(buttonContainer);
      return;
    }

    // 2. Fallback: Card header (near user info / more dropdown)
    const header = cardElement.querySelector('header, div[class*="Feed_header"], div[class*="head-info"]');
    if (header) {
      header.appendChild(buttonContainer);
    }
  }

  async function processCard(cardElement) {
    if (!cardElement || !cardElement.isConnected) return;

    if (isProfilePage()) {
      const existing = cardElement.querySelector('.weibo-followflow-container');
      if (existing) {
        if (existing._unsubscribe) {
          try { existing._unsubscribe(); } catch (e) {}
        }
        existing.remove();
      }
      return;
    }

    const author = extractAuthorFromWeiboCard(cardElement);
    if (!author || !author.uid) return;

    const currentUid = getCurrentUserUid();
    if (currentUid && author.uid === currentUid) {
      const existing = cardElement.querySelector('.weibo-followflow-container');
      if (existing) existing.remove();
      return;
    }

    const existingContainer = cardElement.querySelector('.weibo-followflow-container');
    if (existingContainer) {
      if (existingContainer.getAttribute('data-wb-author-uid') === author.uid) {
        return;
      }
      if (existingContainer._unsubscribe) existingContainer._unsubscribe();
      existingContainer.remove();
    }

    // Determine initial follow state
    let following = false;
    let resolved = false;

    // A. Check State Manager cache
    const cached = stateManager.get(author.uid);
    if (cached && cached.following !== undefined) {
      following = cached.following;
      resolved = true;
    }

    // B. Check Vue component state
    if (!resolved && author.following !== undefined) {
      following = author.following;
      resolved = true;
      stateManager.set(author.uid, { following, screen_name: author.screen_name });
    }

    // C. Check native card UI (if native +关注 button is present, author is not followed)
    if (!resolved) {
      const nativeFollowBtn = cardElement.querySelector('button[class*="woo-button"][class*="primary"], div[action-type="follow"]');
      if (nativeFollowBtn && nativeFollowBtn.textContent && nativeFollowBtn.textContent.includes('关注') && !nativeFollowBtn.textContent.includes('已关注')) {
        following = false;
        resolved = true;
        stateManager.set(author.uid, { following: false, screen_name: author.screen_name });
      }
    }

    const buttonContainer = createFollowIconButton(cardElement, author.uid, following);
    insertFollowIcon(cardElement, buttonContainer);
  }

  let scanScheduled = false;

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    setTimeout(() => {
      scanScheduled = false;
      if (isProfilePage()) {
        removeAllFollowIcons();
        return;
      }

      // Query Weibo feed cards
      const cards = document.querySelectorAll('article, div[class*="Feed_wrap"], div[class*="wbpro-feed-content"], div[action-type="feed_list_item"]');
      for (const card of cards) {
        // Find top card element if wbpro-feed-content was selected
        let targetCard = card;
        if (card.classList.contains('wbpro-feed-content') && card.closest('article, div[class*="Feed_wrap"]')) {
          targetCard = card.closest('article, div[class*="Feed_wrap"]');
        }
        processCard(targetCard);
      }
    }, CONFIG.scanDebounceMs);
  }

  function initObserver() {
    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.matches && (node.matches('article, div[class*="Feed_wrap"], div[class*="wbpro-feed-content"]') || node.querySelector('article, div[class*="Feed_wrap"]'))) {
                shouldScan = true;
                break;
              }
            }
          }
        }
        if (shouldScan) break;
      }

      if (shouldScan) {
        scheduleScan();
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // ==========================================
  // 7. SPA Navigation Support
  // ==========================================
  function initSPAHandler() {
    const handleUrlChange = () => {
      cachedCurrentUserUid = null;
      if (isProfilePage()) {
        removeAllFollowIcons();
      }
      scheduleScan();
    };

    const originalPushState = history.pushState;
    history.pushState = function (...args) {
      const res = originalPushState.apply(this, args);
      handleUrlChange();
      return res;
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function (...args) {
      const res = originalReplaceState.apply(this, args);
      handleUrlChange();
      return res;
    };

    window.addEventListener('popstate', handleUrlChange);
  }

  // ==========================================
  // 8. Bootstrap
  // ==========================================
  function bootstrap() {
    initNetworkInterceptor();
    initSPAHandler();

    const startDOM = () => {
      injectStyles();
      initObserver();
      scheduleScan();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startDOM);
    } else {
      startDOM();
    }
  }

  bootstrap();
})();
