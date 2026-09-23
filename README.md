# Weibo FollowFlow (`weibo-follow-flow`)

<p align="center">
  <strong>Minimalist, native-style browser userscript for Sina Weibo (weibo.com) to Follow / Unfollow creators directly inside timelines with 2-step confirmation and instant state sync.</strong>
</p>

<p align="center">
  <a href="https://github.com/haorui-lab/weibo-follow-flow/releases"><img src="https://img.shields.io/badge/version-0.1.0-orange.svg?style=flat-square" alt="Version"></a>
  <a href="./package.json"><img src="https://img.shields.io/badge/license-MIT-green.svg?style=flat-square" alt="License"></a>
  <a href="https://www.tampermonkey.net/"><img src="https://img.shields.io/badge/Tampermonkey-Supported-black?style=flat-square&logo=tampermonkey" alt="Tampermonkey"></a>
  <a href="https://violentmonkey.github.io/"><img src="https://img.shields.io/badge/Violentmonkey-Supported-orange?style=flat-square" alt="Violentmonkey"></a>
  <a href="https://github.com/haorui-lab/weibo-follow-flow/pulls"><img src="https://img.shields.io/badge/PRs-Welcome-brightgreen.svg?style=flat-square" alt="PRs Welcome"></a>
</p>

<p align="center">
  <a href="./README.md"><b>English</b></a> | <a href="./README_CN.md"><b>简体中文</b></a>
</p>

---

## 💡 Why Weibo FollowFlow?

Browsing Weibo's **Hot Feed** or **Home Timeline** is the best way to discover content creators. However, the default interaction for following and unfollowing is cumbersome:
1. **No unfollow button in timeline cards**: To unfollow a creator, you must navigate to their profile page, hover over the "Following" dropdown, click unfollow, and confirm in a modal.
2. **Inconsistent follow button placement**: Unfollowed creators sometimes have a follow button in the header, sometimes none, with inconsistent UX.

**Weibo FollowFlow** brings the streamlined design of `x-follow-flow` to Weibo: an unobtrusive, borderless native icon button embedded directly in the post's bottom action bar (right next to the Like button).

---

## ✨ Key Features

- 🎯 **Native Design Integration**: Seamlessly embeds into the bottom action bar (`Repost` · `Comment` · `Like` · **`FollowFlow`**).
- ⚡ **Zero-Latency State Detection**:
  - Full-protocol network interception (`fetch` + `XMLHttpRequest`) at `@run-at document-start`;
  - Inspects Weibo internal AJAX endpoints (`/ajax/feed/*`, `/ajax/statuses/*`) for relationship metadata;
  - Deep traversal of Weibo Vue 3 component tree (`__vueParentComponent`) to extract author UID and follow state.
- 🛡️ **2-Step Anti-Misclick Confirmation**:
  - Clicking on a followed creator (`✓`) switches to a warning red minus (`−`) with a 3-second breathing countdown;
  - Reverts automatically if not clicked again within 3 seconds;
  - Only unfollows on explicit second click.
- 🔄 **Multi-Card Real-Time Synchronization**: When interacting with any card from a creator, all other cards by that creator on screen update simultaneously.
- 👤 **Self & Profile Page Smart Filtering**: Automatically detects logged-in account (`window.$CONFIG.uid`) and disables the button on own posts and user profile pages (`/u/...`).
- 🚀 **Infinite Scroll Optimization**: Debounced MutationObserver designed for high performance with zero layout shift or memory leaks.
- 🔒 **100% Privacy & Security**: Operates entirely in your browser without telemetry, analytics, or third-party servers.

---

## 🎨 Visual States

| State | Icon | Appearance | Interaction |
| :--- | :---: | :--- | :--- |
| **Not Following** | `+` | Neutral gray plus, Weibo orange (`#ff8200`) hover circle | Click to **Follow** immediately |
| **Following** | `✓` | Neutral gray checkmark, red hover `−` indicator | Click to initiate **Unfollow confirmation** |
| **Confirming** | `−` | Warning red (`#f4212e`) minus with subtle pulsing animation | Click again within 3s to **Unfollow**; reverts on timeout |
| **Loading** | ⟳ | Smooth native-style rotating spinner | Prevents duplicate clicks |

---

## 📦 Supported Pages

- ✅ `https://weibo.com/` (Home / Following Feeds)
- ✅ `https://weibo.com/hot` (Hot Timeline)
- ✅ `https://weibo.com/newhot` (Modern Hot Timeline)
- ✅ `https://weibo.com/friends` (Friends Circle)
- ✅ `https://weibo.com/status/[id]` / `https://weibo.com/detail/[id]` (Post Detail)
- ✅ `https://s.weibo.com/*` (Search Timelines)
- ⚪ `https://weibo.com/u/[uid]` (Excluded by design: profile page already has large native follow button)

---

## 🚀 Quick Install

### Prerequisites

Install a userscript manager in your browser:
- [**Tampermonkey**](https://www.tampermonkey.net/) (Recommended: Chrome, Edge, Safari, Firefox)
- [**Violentmonkey**](https://violentmonkey.github.io/) (Chrome, Firefox)

### One-Click Installation

Click the direct installation link:

👉 **[Install weibo-follow-flow.user.js](https://raw.githubusercontent.com/haorui-lab/weibo-follow-flow/main/weibo-follow-flow.user.js)**

---

## ⚙️ Configuration

A simple `CONFIG` object is exposed at the top of the script for tuning timings:

```javascript
const CONFIG = {
  confirmTimeoutMs: 3000,   // Unfollow confirmation timeout (ms)
  scanDebounceMs: 50,       // Scroll debounce interval (ms)
  maxActionWaitMs: 800      // Wait timeout for native fallback (ms)
};
```

---

## 🧪 Unit Tests

Run the built-in Node.js native test suite:

```bash
# Clone the repository
git clone https://github.com/haorui-lab/weibo-follow-flow.git
cd weibo-follow-flow

# Run tests
npm test
```

Test coverage includes:
- `XSRF-TOKEN` / `SUB` cookie parsing
- Weibo feed JSON responses and recursive retweet parsing
- Vue 3 component tree author and follow status inspection
- Profile page detection (`isProfilePage`)
- `FollowStateManager` subscription and broadcast
- `ButtonStateMachine` follow, 2-step unfollow, and timeout rollback

---

## 🛡️ Privacy & Compliance

- **No Remote Telemetry**: Zero external tracking or telemetry scripts.
- **No Stored Credentials**: Never accesses, saves, or transmits passwords, tokens, or personal data.
- **Explicit Manual Action**: All actions require explicit user interaction in compliance with platform rules.

---

## 📄 License

Open-sourced under the [MIT License](./package.json).
