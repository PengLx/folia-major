<!-- docs/apple-music-musickit-investigation.md -->

# Cider 的 MusicKit 与 Folia 独立接入

2026-09-08 检查本机 Cider 3.1.8 的发布包。本文记录观察结果与待验证项；调查时 Folia 仅有 Cider 桥接版；后续独立后端的实现与验收进度见 [独立 MusicKit 说明](apple-music-standalone.md)。

## 本机实现证据

主要来源：`/usr/lib/cider/resources/spa/assets/MusicKit-D6bhzX7M.js`，以及 `app.asar` 内的 `.vite/build/main-BoT49GQN.js`。没有将 Cider 源码或凭证复制到仓库。

1. **加载 MusicKit**：默认加载方式为 `v3-rp`。它从 Cider Rise 服务的 `/api/v1/musickit/v3?latest=true` 获取脚本，提供本地脚本缓存与 Apple 托管版本回退路径，也保留不打补丁的 v2/v3 加载选项。
2. **兼容处理**：默认路径会修改获取到的脚本，涉及全局 fetch、脚本元素定位、播放支持判断与 Widevine 能力字段。这表明 Cider 不是只配置一个 token；但不能据此断言当前官方 SDK 在 Folia 必须应用全部相同修改。尤其将能力字段设为真不会安装 CDM，也不能代替实际的 DRM 授权。
3. **开发者令牌**：初始化时先读取 `localStorage.lastKnownToken`；缺失时请求 `https://rise.cider.sh/api/v1/token/current`，读取响应的 `token_string` 并缓存。遇到无效或过期 token 的初始化错误，会重新请求。观察到的是获取已签发 token 的流程，不是客户端签发 JWT 的流程，也没有从该流程获得签名私钥。
4. **初始化**：将该值传入 `MusicKit.configure` 的 `developerToken`，配置 bitrate 为 256。观察到 Cider 使用 Apple Music 的 app 名称和额外的内部参数；Folia 独立实现应使用自身应用身份，先验证官方配置接口。
5. **用户授权**：MusicKit 实例另有 `musicUserToken` 和 `isAuthorized`。授权状态变更后，Cider 更新本地登录状态，并将开发者 token 与用户 token 传给自己的本地 Izanami 服务。开发者 token 并不等于订阅用户身份。
6. **Linux DRM**：包声明使用 `github:castlabs/electron-releases#v39.1.0+wvcus`，主进程启动流程等待 `components.whenReady()`，随后初始化窗口等模块。Folia 调查开始时依赖普通 Electron；现已改用 CastLabs Electron 43.5.0，并在本机验证 Widevine。

直接请求 Rise token 地址得到 HTTP 403；后续使用本机已有的 Cider 缓存继续验证，结果见下文。

## 能否先内置 Cider 的凭证

需要区分三种不同的值：

| 值 | 用途 | 独立 Folia 如何处理 |
| --- | --- | --- |
| MusicKit developer token（已签名 JWT） | 初始化 MusicKit、标识开发者 | 客户端本来就需要接收此值；可以支持本地配置用于验证，但第三方 token 能否用于 Folia 仍需验证适用范围和使用授权。不能把固定 token 当成永久依赖。 |
| Music user token | 访问某个订阅用户的个人内容 | 由用户在 Folia 的 MusicKit 登录流程授权；不作为应用内置共享凭证。 |
| Cider 本地 API 的 apptoken | 授权控制本机 Cider | 只适用于桥接模式，不能用于直接初始化 MusicKit。 |

Apple 的[开发者 token 文档](https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens)规定 ES256 签名、最长约六个月有效期，并支持可选 origin 限制。token 被分发给客户端与签名私钥被分发是两件事：私钥应留在签发环境，不能放入 Folia 安装包。

本机已用 Cider 缓存的开发者 token 完成 Folia 独立授权和曲库读取，但需要额外的来源兼容处理。续期依赖第三方服务不能作为长期方案；公开发行需要 Folia 自己的开发者身份与 token 更新来源。

## 独立接入的实现边界与验收

可复用已有 Apple Music 数据归一化、Omni 路由和非 URL 播放接口，将 Cider transport 替换为由 Folia 持有的 MusicKit 实例。需要完成：

- 在独立的播放器环境中加载 Apple 托管 MusicKit，并接入可更新的开发者 token；配置失败、过期与刷新均需明确反馈。
- 使用 MusicKit 的 `authorize()` 完成 Folia 自身的用户登录，验证授权窗口、登录恢复和退出；官方[实例文档](https://js-cdn.music.apple.com/musickit/v3/docs/iframe.html?path=/story/reference-javascript-musickit-instance--page)说明有效订阅和用户授权是完整播放的条件。
- 选择与 Folia Electron 版本兼容的 Widevine 运行时，等待 CDM 就绪后初始化播放器，并验证打包后的表现。[CastLabs 文档](https://github.com/castlabs/electron-releases)说明其 Electron 分支自动安装 Widevine，Linux 为部分支持；具体发行限制仍需按目标平台验证。
- 通过 MusicKit API 读取数据，以 `setQueue`、`play`、`pause`、`seekToTime` 等控制播放，让现有 Folia 队列和歌词时钟消费状态。先验证官方 SDK，再根据实际失败证据决定兼容处理，不能照搬 Cider 的内部参数作为既定要求。
- 在 Cider 未运行的情况下，验证独立登录、搜索、个人曲库、完整曲目播放与跨试听时长持续播放、定位、切歌、退出和重启。浏览器 mock、成功搜索或取得 preview 都不能作为完整播放通过的证据。

上述验收状态以独立后端说明为准。

## 后续本机验证

Cider 的 `.vite/build/events-ZUCFcg9v.js` 在 Apple 请求上改写 Origin/Referer；登录主机使用 `idmsa.apple.com`，其他 Apple 服务使用 `music.apple.com`。本机缓存 JWT 的 `root_https_origin` 包含 `apple.com`：Folia 普通 localhost 来源请求 `/v1/test` 返回 401，采用上述兼容后返回 200。此前仅凭 401 判断它不能用于本机测试的结论不完整。

Cider 的 `mksystem-CS2Z2YWK.js` 还会在 Apple 授权完成窗口跳到 `/error` 时触发其关闭按钮。Folia 实际登录中同样观察到该页面，点击后 SDK 返回 `isAuthorized: true`、授权状态 3。随后订阅检查和个人曲库请求成功。

播放接口返回的 CORS 来源仍是 `https://music.apple.com`，导致 localhost 页面预检失败。Folia 的本机兼容开关仅对隔离会话内指定 Apple 主机调整相应 CORS 响应；没有沿用 Cider 关闭 webSecurity 或启用 Node 集成的做法。完整播放状态见 [独立后端说明](apple-music-standalone.md)。
