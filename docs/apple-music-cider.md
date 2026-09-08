<!-- docs/apple-music-cider.md -->

# Apple Music 与本机 Cider

本文记录早期 Cider 桥接实现，仅供开发联调参考；正式登录界面不再提供此模式。无需 Cider 的新后端见 [独立 MusicKit 说明](apple-music-standalone.md)。

Folia 桌面端可通过正在运行的 Cider 接入 Apple Music。Folia 提供歌曲搜索、歌单浏览、队列、播放控制和歌词界面；Cider 负责 Apple 登录、订阅授权和音频播放。这是依赖 Cider 的接入方式，尚不是 Folia 独立的 MusicKit 播放器。

## 使用

1. 在同一台电脑运行 Cider，登录有有效订阅的 Apple Music 账号。
2. 在 Cider 的 Connectivity 中启用本地 API，使用默认端口 `10767`。若开启 Require API Tokens，在 Manage External Application Access 中创建供 Folia 使用的应用令牌。
3. 开发联调可通过 Omni 的 `configureProviderConnection('applemusic', { playbackMode: 'cider', applicationToken })` 配置旧桥接。用户登录界面固定使用 Folia 独立播放，不提供 Cider 选择或令牌输入。
4. 桥接连接后，在首页音乐平台选择器中切换到 Apple Music，即可搜索歌曲和浏览账号歌单。
5. 播放期间保持 Cider 运行。音质与实际音频输出由 Cider 管理。Folia 的音量、静音、暂停、继续、定位和队列切换会发给 Cider。

本地开发运行 `npm ci` 后使用 `npm run dev:electron`；仅启动 `npm run dev` 的浏览器页面没有主进程 bridge，不能控制本机 Apple Music。

## 当前范围

- 支持按账号地区搜索歌曲、读取个人歌单及歌单曲目，保留 Apple Music catalog ID 和 `i.*` library ID。
- 支持通过 Cider 播放完整曲目，以及读取播放进度。播放命令是异步接收，Folia 会等待后续状态确认；若 Cider 未能开始播放或断开，会提示检查连接和订阅。
- 从 Apple Music API 获取 TTML，复用 Folia 的 TTML 解析和歌词显示。并非每首歌都提供逐字歌词；缺失时沿用现有歌词匹配/导入能力。
- 不提供音频 URL、离线下载、音频缓存、Folia 均衡器或 Automix。音频分析、音频转发及重启后自动恢复播放不属于此次接入范围。
- 未开放专辑/歌手详情页、推荐、收藏和歌单写入。对应 provider capabilities 为关闭状态。
- 浏览器/Docker 版没有本机 IPC bridge，平台显示不可用。
- 主动在 Cider 切换到另一首歌曲时，Folia 会停止跟踪原歌曲并报错；从 Folia 重新选曲即可继续。Folia 发起选曲会替换 Cider 当前播放队列，完整队列由 Folia 管理。

## 本机调查结论

2026-09-08 检查本机 `/usr/lib/cider/resources/app.asar` 和 `resources/spa` 的已安装程序，仅分析运行方式和互操作接口，没有复制 Cider 实现到仓库：

- Cider 版本为 **3.1.8**，包名 `@ciderapp/genten-client`。
- 其 Electron 依赖为 `github:castlabs/electron-releases#v39.1.0+wvcus`。
- 本地 REST API 监听 `10767`；本机已启用，可以实际读取播放状态、查询曲库、获取个人歌单和 TTML。
- `/api/v1/amapi/run-v3` 的请求为 `{ path }`，响应有一层 MusicKit `{ data: ... }` 包装。不是直接返回 Apple resource array。
- `GET /api/v1/lyrics/:id` 在本机探测超时，因此适配器直接通过 MusicKit API 获取 `syllable-lyrics`，不可用时再尝试 `lyrics`。

已对齐的接口：

| Cider 接口 | 用途 |
| --- | --- |
| `POST /api/v1/amapi/run-v3` | 账号地区、歌曲搜索、个人歌单/专辑、曲目、专辑/歌手、推荐与播放历史、TTML；只接受 `{ path }`，即只能读 |
| `POST /api/v1/playback/play-item` | `{ id, type: 'songs' \| 'library-songs' }` |
| `GET /api/v1/playback/now-playing` | `info.playParams`、`currentPlaybackTime`（秒）、`durationInMillis` |
| `GET /api/v1/playback/is-playing` | `is_playing` |
| `POST /api/v1/playback/play`、`pause` | 播放与暂停 |
| `POST /api/v1/playback/seek` | `{ position }`，单位秒 |
| `POST /api/v1/playback/volume` | `{ volume }`，范围 0–1 |

Cider 的公开 [API 参考](https://github.com/ciderapp/Cider-2/blob/main/docs/Cider%202.5.0%20Preview%20API.md)已标记旧版，因此此次以本机 3.1.8 的路由实现和响应为准。

## 为什么不能只增加一个音频 URL provider

[MusicKit on the Web](https://developer.apple.com/musickit/)提供浏览器内的授权播放；曲库中的 preview 地址是试听片段，不能代替订阅曲目的完整播放。Folia 原有 provider 返回 URL，再交给普通媒体元素的模式不覆盖这类后端。

Cider 选用的 [CastLabs Electron](https://github.com/castlabs/electron-releases)包含 Widevine CDM 支持，文档要求等待 `components.whenReady()`。若要实现无需 Cider 的 Linux 版本，还需单独完成 MusicKit 开发者凭据和用户授权接入、Widevine 运行时的初始化与打包，以及对 Folia 音频链路的兼容验证。此次没有取用 Cider 内置的开发者令牌或 Apple 用户令牌，也没有改动 Folia 的 Electron 发行版本。

## 实现与验证

独立 MusicKit 运行方式、开发者令牌来源和 Linux 运行时调查见 [Cider MusicKit 调查](apple-music-musickit-investigation.md)。下列实现仍是 Cider 桥接版。

- `src/services/onlineMusic/appleMusicProvider.ts`：Omni provider，能力声明与统一数据。
- `src/services/onlineMusic/appleMusic/`：Cider transport、Apple 数据归一化、远程播放协议。
- `electron/ciderBridge.cjs`：固定 `127.0.0.1:10767`、请求白名单、超时和应用令牌存储；拒绝重定向。主进程 IPC 只接受 Folia 主窗口。
- `src/services/remotePlayback.ts`：串行化播放命令与播放所有权，拒绝连续切歌后的旧请求。
- `src/hooks/useRemotePlayback.ts`：非重叠低频状态查询；连续歌词时间走现有 MotionValue，不逐帧更新 React state。
- 旧桥接的应用令牌通过 Electron safeStorage 保存，配置快照不会将其返回前端；Apple 的登录凭据始终留在 Cider。当前用户入口 `src/hooks/useAppleMusicLogin.ts` 已固定为独立 MusicKit 授权。

相关验证命令：

```sh
npm run typecheck
npm run test:unit -- test/unit/onlineMusic/appleMusicProvider.test.ts test/unit/onlineMusic/remotePlayback.test.ts test/unit/electron/ciderBridge.test.ts test/unit/onlineMusic/omni.test.ts test/unit/onlineMusic/omniArchitecture.test.ts test/unit/command-palette/commandRegistryContract.test.ts
npm run test:ui -- test/ui/appleMusic.spec.ts
```

单测使用协议样例；浏览器用例使用模拟 IPC，不连接用户服务。真实 Cider 联调属于手工验证，不加入自动测试。
