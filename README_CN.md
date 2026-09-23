# Weibo FollowFlow (`weibo-follow-flow`)

<p align="center">
  <strong>面向新浪微博 (Weibo.com) 的极简轻量级浏览器用户脚本，在微博信息流中直接内联 Follow / Unfollow，无缝原生、丝滑防误触。</strong>
</p>

<p align="center">
  <a href="https://github.com/haorui-lab/weibo-follow-flow/releases"><img src="https://img.shields.io/badge/version-0.1.0-orange.svg?style=flat-square" alt="Version"></a>
  <a href="./package.json"><img src="https://img.shields.io/badge/license-MIT-green.svg?style=flat-square" alt="License"></a>
  <a href="https://www.tampermonkey.net/"><img src="https://img.shields.io/badge/Tampermonkey-支持-black?style=flat-square&logo=tampermonkey" alt="Tampermonkey"></a>
  <a href="https://violentmonkey.github.io/"><img src="https://img.shields.io/badge/Violentmonkey-支持-orange?style=flat-square" alt="Violentmonkey"></a>
  <a href="https://github.com/haorui-lab/weibo-follow-flow/pulls"><img src="https://img.shields.io/badge/PRs-欢迎提交-brightgreen.svg?style=flat-square" alt="PRs Welcome"></a>
</p>

<p align="center">
  <a href="./README.md"><b>English</b></a> | <a href="./README_CN.md"><b>简体中文</b></a>
</p>

---

## 💡 为什么需要 Weibo FollowFlow？

浏览新浪微博的 **热门信息流** 或 **关注流** 是发掘新博主与热点讨论最核心的途径。然而原生的关注/取关交互极其繁琐：
1. **已关注博主在流中没有取消关注按钮**：想取关必须点进博主主页，鼠标移到右上角“已关注”浮层，再点击取消关注并确认，打断原本的刷博节奏。
2. **未关注博主原生关注按钮位置割裂**：原生关注按钮仅在部分流顶部显示，容易误触，且缺乏统一的操作手感。

**Weibo FollowFlow** 延续了 `x-follow-flow` 的设计哲学，专注于以极致克制和原生的方式解决这一痛点：在每条微博卡片的底部操作栏（紧邻“赞”按钮）无缝嵌入原生图标按钮。

---

## ✨ 核心特性

- 🎯 **与微博现代 UI 浑然一体**：采用无边框微交互设计，精准安放于微博卡片底部操作条（`转发` · `评论` · `赞` · **`FollowFlow`**）。
- ⚡ **毫秒级网络穿透识别**：
  - 在 `@run-at document-start` 阶段同时拦截 `fetch` 与 `XMLHttpRequest`；
  - 自动解析微博 `/ajax/feed/*`、`/ajax/statuses/*` 的用户关系状态；
  - 深度遍历微博 Vue 3 组件实例（`__vueParentComponent`）与卡片作者 UID。
- 🛡️ **防误触两步取关确认**：
  - 点击已关注博主（`✓`）后，图标变为警示红色减号（`−`），启动 3 秒安全倒计时伴随呼吸动效；
  - 3 秒内未再次点击自动恢复；
  - 再次点击方才执行取关操作，彻底杜绝误触取关。
- 🔄 **全屏多卡片实时联动**：信息流中同一博主若有多条微博，在任一卡片上操作，全屏所有该博主的卡片状态瞬间同步。
- 👤 **本人与主页微博智能过滤**：自动识别当前登录账号（通过 `window.$CONFIG.uid`，本人微博不显示按钮），并在博主个人主页自动屏蔽按钮（主页自带原生大按钮）。
- 🚀 **极致性能与虚拟滚动优化**：防抖 MutationObserver 监听，完美支持微博无限滚动，零抖动、零内存泄漏。
- 🔒 **100% 本地隐私安全**：纯客户端运行，绝无任何第三方远程统计、上报或额外 API Key。

---

## 🎨 视觉状态一览

| 状态 | 图标符号 | 视觉表现 | 交互行为 |
| :--- | :---: | :--- | :--- |
| **未关注** | `+` | 中性灰色加号，悬浮显示微博经典橙（`#ff8200`）圆圈 | 点击立即 **关注** |
| **已关注** | `✓` | 中性灰色对勾，悬浮变为告警红色 `−` 提示 | 点击启动 **防误触二次确认** |
| **确认中** | `−` | 告警红色（`#f4212e`）减号，伴随微呼吸动画 | 3秒内再次点击 **取关**；超时自动复原 |
| **处理中** | ⟳ | 原生平滑旋转 Spinner | 禁用连击防并发 |

---

## 📦 支持页面

- ✅ `https://weibo.com/` (首页信息流 / 关注流)
- ✅ `https://weibo.com/hot` (热门流)
- ✅ `https://weibo.com/newhot` (新版热门流)
- ✅ `https://weibo.com/friends` (好友圈)
- ✅ `https://weibo.com/status/[id]` / `https://weibo.com/detail/[id]` (微博正文详情页)
- ✅ `https://s.weibo.com/*` (微博搜索结果页)
- ⚪ `https://weibo.com/u/[uid]` (按设计已排除：个人主页自带原生关注大按钮)

---

## 🚀 快速安装

### 前置条件

确保浏览器中安装了用户脚本管理器：
- [**Tampermonkey (篡改猴)**](https://www.tampermonkey.net/)（推荐：Chrome、Edge、Safari、Firefox）
- [**Violentmonkey (暴力猴)**](https://violentmonkey.github.io/)（Chrome、Firefox）

### 一键安装

点击下方链接即可调出脚本管理器的一键安装窗口：

👉 **[点击一键在线安装 weibo-follow-flow.user.js](https://raw.githubusercontent.com/haorui-lab/weibo-follow-flow/main/weibo-follow-flow.user.js)**

---

## ⚙️ 个性化配置

脚本顶部提供了直观的配置对象 `CONFIG`，可自由微调超时与防抖：

```javascript
const CONFIG = {
  confirmTimeoutMs: 3000,   // 取关二次确认倒计时（毫秒）
  scanDebounceMs: 50,       // 时间线滚动防抖扫描间隔（毫秒）
  maxActionWaitMs: 800      // 原生操作等待超时（毫秒）
};
```

---

## 🛠️ 技术原理与架构

```
┌─────────────────────────────────────────────────────────────────┐
│                   Weibo.com 现代 Web 运行环境                   │
│                                                                 │
│   ┌──────────────────────┐             ┌─────────────────────┐  │
│   │ 全协议网络拦截器     │             │  MutationObserver   │  │
│   │ (Fetch + XHR 劫持)   │             │  (无限虚拟滚动流)   │  │
│   └──────────┬───────────┘             └──────────┬──────────┘  │
│              │ 解析关注关系                       │ 捕获新卡片  │
│              ▼                                    ▼             │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │       FollowStateManager (全局状态缓存与发布订阅中枢)    │  │
│   └──────────────────────────┬───────────────────────────────┘  │
│                              │ 广播状态变更                     │
│                              ▼                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │           UI Component (微博底部操作栏原生图标注入)     │  │
│   │       [ + (未关注) ] ⇄ [ ✓ (已关注) ] ⇄ [ − (3秒确认) ]  │  │
│   └──────────────────────────┬───────────────────────────────┘  │
│                              │ 用户点击触发                     │
│                              ▼                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │                  Action Executor 执行器                  │  │
│   │   首选: POST /ajax/friendships/create 与 destory         │  │
│   │   备选: 卡片原生 +关注 按钮程序化模拟点击                │  │
│   └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

1. **全协议网络拦截**：在 `@run-at document-start` 阶段同时拦截 `fetch` 与 `XMLHttpRequest`，零额外开销获取微博关系数据。
2. **Vue 3 组件树探查**：智能解析卡片 `__vueParentComponent` 与 DOM `/u/[uid]` 属性，精准绑定博主 UID。
3. **原生 AJAX 联动**：携带当前会话 `XSRF-TOKEN` 发送至微博底层交互接口，稳定高频。

---

## 🧪 自动化单元测试

项目内置 Node.js 原生自动化单元测试套件：

```bash
# 克隆仓库
git clone https://github.com/haorui-lab/weibo-follow-flow.git
cd weibo-follow-flow

# 运行测试
npm test
```

测试覆盖：
- `XSRF-TOKEN` / `SUB` Cookie 提取
- 微博 Feed JSON 数据与转发微博嵌套递归解析
- Vue 3 组件树博主状态探查
- 博主个人主页与信息流路由判断（`isProfilePage`）
- `FollowStateManager` 全局订阅与实时广播
- `ButtonStateMachine` 关注、两步取关与超时回滚

---

## 🛡️ 安全与隐私规范

- **零数据外流**：绝不连接第三方服务器，零 Telemetry / Analytics。
- **凭据零泄露**：不保存、不上报您的密码、Cookie 或 Token。
- **纯手动合规**：所有操作均由用户显式点击触发，严格遵守平台使用规范。

---

## 📄 开源许可证

本项目基于 [MIT License](./package.json) 开源。
