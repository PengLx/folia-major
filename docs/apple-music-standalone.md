<!-- docs/apple-music-standalone.md -->

# Apple Music 独立播放

Folia 新增独立 MusicKit 后端，桌面端使用 CastLabs Electron 43.5.0 和 Widevine。Apple 授权由官方登录窗口处理，音频播放由 Folia 始终隐藏的隔离 MusicKit 窗口处理，不调用 Cider 的本地 API。账号入口固定使用 Folia 独立播放，直接打开 Apple 官方授权页，不提供播放方式选择或 Folia 二次确认弹窗。

## 连接

1. 打开首页右下角的账号切换菜单，与网易云等账号一样选择「Apple Music」登录。
2. 在直接打开的 Apple 官方窗口中完成登录和授权。完整播放需要有效订阅，用户无需准备或填写开发者令牌。
3. 返回 Folia，即可使用搜索、歌单与播放控制。

## 发布者配置

MusicKit 开发者身份由 Folia 发布维护者提供，不能要求普通用户申请开发者账号。发布前在 `electron/appleMusic/config.cjs` 设置维护者的 HTTPS `developerTokenEndpoint`；该服务返回 `{ "token": "已签名的 MusicKit JWT" }`。主进程在初始化时获取并校验 token，有效期不足五分钟时再次请求。Apple 签名私钥只留在维护者服务端，不能进入仓库或安装包。服务地址不包含 Apple 用户凭证，请求也不发送用户会话。

开发者可使用 `FOLIA_APPLE_MUSIC_TOKEN_URL` 覆盖服务地址。未配置服务地址时，继续支持本机 `FOLIA_APPLE_MUSIC_DEVELOPER_TOKEN` 或已有的系统加密 token，供开发联调使用；正式公开发行应配置维护者的令牌服务。仓库不内置 Cider 的令牌或服务地址。目前尚未部署 Folia 专用的签发服务，因此公开发行的开发者身份仍需维护者准备。

连接失败会区分令牌缺失、无效、过期、Widevine 不可用、登录取消和端口被占用。重新登录前会先停止 Folia 正在控制的 Apple Music 播放。

## 运行时和存储

- `package.json` 将 Electron 指向 `castlabs/electron-releases#v43.5.0+wvcus`；打包的 `electronDist` 指向已下载的同一运行时，避免 electron-builder 换回普通 Electron。
- `electron/appleMusic/host.cjs` 负责固定本机地址 `127.0.0.1:10768`、播放器窗口和受限操作协议。HTTP 服务只返回播放器静态文件，不返回令牌或账号数据。
- MusicKit 运行在 `persist:folia-apple-music` 会话中，无 Node 集成、无 Folia preload；Apple 登录弹窗同样启用上下文隔离和沙箱。主进程只接受 Folia 主窗口主 frame 的 IPC。
- 官方 MusicKit 从 Apple CDN 加载。当前实现没有复制 Cider 的脚本补丁，也没有在安装包中内置其开发者 token。
- 首次需要下载 Widevine，主进程会等待 `components.whenReady()`。本机验证因组件下载失败，使用本机已经安装的 Widevine 组件副本；副本不含 Apple 用户凭证。独立安装在新机器上的组件下载仍需网络可用。
- `FOLIA_APPLE_MUSIC_DEVELOPER_TOKEN` 可用于本机开发验证。环境变量仅在当前进程读取，不自动持久化。正式分发应接入应用自己的令牌更新来源。
- Apple 授权会话由 Chromium/MusicKit 保存。退出登录调用 `unauthorize()`，开发者 token 作为应用配置保留，便于再次连接。

## 接入范围

数据仍通过 Omni 进入 provider；曲目和歌单沿用原有统一数据格式。`musicKitTransport.ts` 根据选定模式调用独立主进程接口，原有 Cider transport 可选。独立播放器提供订阅检查、catalog/library 选曲、暂停、继续、音量、定位和播放状态；播放器异常会传播回 Folia。

这是 DRM 播放后端，没有可下载的音频 URL。Folia 音频缓存、下载、均衡器、音频分析/转发和 Automix 暂不适用于 Apple Music。

独立模式下 `api` 动作允许 `method`（GET/POST/PUT/DELETE）与 JSON `body`，路径限定在 catalog、`/v1/me/library`、`/v1/me/ratings`、`/v1/me/recommendations`、`/v1/me/recent/played` 与 `/v1/me/history/heavy-rotation`。据此已开放：

- 专辑与歌手页：搜索结果按需解析 `songs/{id}?include=albums,artists`，专辑曲目、歌手热门曲目（`view/top-songs`，每页 20 条）与歌手专辑均按 storefront 路由，资料库专辑（`l.`）走 `/v1/me/library/albums`。
- 喜欢：映射为 Apple 个人评分（favorite，value 1）。列表通过扫描最近加入资料库的歌曲（最多 1000 首）并批量读取 `ratings/library-songs` 得到，同时记录 library id 与 catalog id。未加入资料库的 favorite 不会出现在扫描结果里。
- 歌单写入：只能向自己 `canEdit` 的库内歌单追加曲目；Apple 公开 API 不提供移除，因此编辑模式不对 Apple 歌单开放。
- 首页推荐：`/v1/me/recommendations` 的歌单/专辑加 heavy rotation；个人 mix（`pl.pm-`）充当每日推荐，没有 mix 时回落到最近播放；FM 卡片播放随机推荐歌单的打乱片段，因为 Folia 无法拉取电台音频。
- 系统媒体会话：远程播放时由 `remotePlayback` 的时钟订阅发布标题、封面与进度，媒体键与 Linux MPRIS 可用。
- 订阅：catalog 歌单/专辑可通过 `POST /v1/me/library?ids[playlists|albums]=` 加入资料库，状态读取 catalog 资源的 `library` 关系（未加入时 404）。Apple 公开 API 不提供移出资料库，取消订阅报 `unsupported`。
- 资料库歌曲：账号集合里追加一个 `cloud` 类型的「资料库歌曲」，曲目分页走 `/v1/me/library/songs`。
- 首页推荐额外并入 storefront `charts?types=playlists` 的榜单歌单，排在个人推荐与 heavy rotation 之后。
- 本地曲库匹配：扫描时保留音频标签里的 ISRC（`importedMetadata.isrc`）。Apple 账号已登录时，自动匹配先用 `songs?filter[isrc]=` 精确查找，时长不符才回落到网易/QQ/酷狗的按名搜索；命中的元数据来源记为 `applemusic`，歌词匹配仍只用网易/QQ/酷狗的身份加速。
- 歌词翻译：Apple 逐字歌词没有翻译行。自动匹配到其他 provider 的歌词时不再整体替换，而是按起始时间（1 秒内）把对方的翻译合并到 Apple 的行上；对方没有翻译则保持 Apple 原文，不写入 override。Apple 只有逐行歌词时仍沿用原来的整体替换。

播放链路（2026-09-09）：

- 音质：Folia 的音质偏好映射到 MusicKit `bitrate`，`standard` 为 64，其余为 256（MusicKit 只有这两档）。Cider 模式由 Cider 自行决定。
- 连播：距离曲尾 8 秒时，Folia 按当前循环模式与队列算出下一首（单曲循环回自己，FM 末尾和队列尽头不循环时不排），经 `queueNext` 用 MusicKit `playLater`（Cider 为 `play-later`）排到当前曲目之后，由播放器自行无缝接续。轮询看到 now-playing 变成排好的那首时视为上一首结束，Folia 正常推进队列；随后的 `start` 带 `continueIfCurrent`，播放器发现已在播同一首就不重载。仍靠 500 ms 轮询对账，没有改成 MusicKit 事件：播放器窗口没有 preload 和 IPC，事件只能借 console 转发，暂不值得。
- 遥控窗口与 Discord presence 的进度改读远程时钟；遥控窗口的定位改发远程 seek。

仍未接入：新建歌单（Omni 没有对应合同）、推荐历史日期（`getHistoryEntries` 的语义是网易的按日历史）、MusicKit 电台队列（Folia 的远程播放模型按单曲下发，电台自行换歌会脱离队列）。

Cider 模式的 `run-v3` 只转发 GET，因此写入类能力（喜欢、歌单追加）在该模式下关闭，只保留读取。上述接口的分页上限、`sort=-dateAdded` 与 `ratings` 批量 ids 上限均按 Cider 客户端的实际调用对齐，尚未在本机真实账号上逐一验收。

## 验证状态（2026-09-08）

已在本机安装包中验证独立 MusicKit 用户授权、有效订阅与真实个人曲库读取。使用官方未修改的 MusicKit v3 SDK；独立窗口能取得 Widevine，授权和数据请求不经过 Cider 本地 API。类型检查及相关协议、路由和界面回归已通过。

本机测试临时使用 Cider 缓存中的开发者 JWT，保存在系统加密配置中，过期时间为 2026-10-12 20:01:32 UTC。没有复制 Cider 的用户 token，也没有将开发者 token 放入仓库或安装包。`FOLIA_APPLE_MUSIC_CIDER_TOKEN_TEST=1` 仅为本机联调启用来源兼容：对隔离 MusicKit 会话内的指定 Apple HTTPS 主机设置 Origin/Referer，并把对应 Apple CORS 响应限定到播放器固定来源。默认关闭，保留浏览器沙箱与 webSecurity。公开发行应使用维护者自己的开发者身份。

登录回调关闭不再被强制解释为取消。Apple `/error` 完成页使用官方页面自身的关闭按钮交回 SDK，最终仍以 SDK 授权结果为准，真正的拒绝仍报错。令牌在打开登录窗口前通过官方 `/v1/test` 校验。

真实播放联调发现并修正：来源兼容缺失使播放接口的 CORS 预检失败；SDK 的 `play()` 又可能静默返回。现增加对应响应处理，并显式选择队列首项以传播加载失败。

本机实际验收：catalog 曲目（总长 258 秒）连续播放 43 秒并跳到 120 秒；从 Folia 歌单按钮启动 library 曲目《Fireflies》（总长 228 秒），持续超过 46 秒，界面歌词与进度同步。Folia 空格键暂停/恢复及进度条定位到 150 秒成功，隔离窗口的真实音频元素正常推进；主界面的两个音频元素均无 src 且暂停。重启后用户授权保留。播放到《Fireflies》末尾后，Folia 自动切到《Good Time》并继续播放。已验证完整音轨访问、跨试听时长播放和队列续播；退出后重新授权及全新机器安装仍需回归。

## 本机安装

当前安装目录为 `musickit-lyrics-fix-20260908`；桌面入口设置本机兼容环境变量，重开应用仍生效。桌面入口为 `/home/simple/.local/share/applications/folia-major.desktop`，指向 `/home/simple/.local/opt/folia-major/current/folia-major`。旧测试目录和 `/opt/folia-major` 系统安装保留；直接运行 `/usr/bin/folia-major` 仍会启动旧版。原配置备份位于 `/home/simple/.local/state/folia-backups/musickit-20260908/Folia`，仅保存在本机。

如需回退桌面入口，移除本次创建的用户级 desktop 文件即可恢复系统入口。

Cider 实现调查见 [调查记录](apple-music-musickit-investigation.md)；开发阶段保留的桥接后端见 [桥接说明](apple-music-cider.md)。

本次修复的 37 项相关单测、4 项 Apple Music UI 测试及类型检查通过。安装包与构建产物的 app.asar SHA-256 一致。验收结束后以无调试参数方式重启本机版本。

## Apple 歌词（2026-09-08）

《Shape of You》在 catalog 中的 `hasLyrics` 为 true，但普通 `api.music.apple.com` 的歌曲歌词路径返回 400；Cider 实际调用的 `amp-api.music.apple.com` 同路径返回 200。已将独立播放器中严格匹配 catalog 数字歌曲 ID 的 `lyrics` / `syllable-lyrics` 请求路由到后者，其他数据继续通过 MusicKit。凭证只在隔离播放器内用于固定 Apple HTTPS 主机，禁用重定向，返回 TTML 后沿用 Omni 和项目解析器。

真实返回包含 97 行、731 个逐字时间片段。404 允许逐字歌词回退到逐行歌词；网络和服务拒绝不再当成无歌词。这个网页接口并非本文已确认的公开 MusicKit API 合同，上游 PR 应明确其稳定性和自有开发者身份下的验收范围。

已在本机目录包中从 Lican 歌单重播《Shape of You》，确认 Apple TTML 经过现有解析器后显示逐字动画；拖动至 45 秒后歌词继续随播放推进。相关 23 项单测及类型检查通过，安装包 hash 与构建产物一致。
