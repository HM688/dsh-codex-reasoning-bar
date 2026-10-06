# dsh-codex-reasoning-bar

> **CodeX 一样的推理等级调整条** —— 在 DeepSeek Harness 的模型选择面板里，用一条可拖动的粒子滑条调整推理强度。

DeepSeek Harness 自带的模型菜单把"推理强度"藏在二级菜单里，是一列需要点击的单选项。
这个插件接管了那个模型选择座位，把它换成一条 CodeX 风格的滑动条：**拖动、吸附、粒子流动**。

```
┌──────────────────────────────────────┐
│ 模型           deepseek-flash      › │   ← 点开是模型列表（按提供方分组）
├──────────────────────────────────────┤
│ 推理强度                        Max  │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ⬤ │   ← 拖动调整，松手吸附
└──────────────────────────────────────┘
```

## 效果

- **一条条**：轨道 24px 高的胶囊，蓝→紫渐变 `#2f7cf6 → #5b6cf0 → #8e5fe0`，26px 纯白圆钮，两端贴边。
- **拖动**：按住任意位置，圆钮 1:1 跟手；松手用带轻微回弹的曲线（`cubic-bezier(.34,1.32,.64,1)`，260ms）吸附到最近档位。
- **粒子**：整条轨道里有 16 颗粒子沿水平方向向右流动，**每颗速度、大小、泳道都不同**，但位置和泳道用低差异序列铺开，所以分布均匀、不会结块也不会留空档。
- **等级由粒子的"劲头"表达**：档位越高，整体流速越快（4.20s → 1.57s 跑完全程）、亮度越高（0.60 → 1.00）。
- **粒子密度恒定**：跑道的宽度永远是整条轨道，所以任何档位下间距都一样；一条裁切窗口跟着圆钮走，让粒子只出现在已点亮的区域里，**圆钮就是粒子流的终点**。
- **拖动期间粒子完全静止**：跑道宽度、动画时长、随机参数全部锁定在"当前真实生效的等级"上——只有等宿主确认等级真的变了，粒子才会整体换挡。
- **毛玻璃面板**：直接用宿主自己的菜单材质（`--dsw-specific-menu` + `blur(40px) saturate(150%)`），再把填充按比例调薄（`color-mix(… 65%, transparent)`），跟随明暗主题。
- **模型列表照旧**：提供方分组、超过 4 个模型时出现搜索框、当前模型打勾、`↑`/`↓` + `Enter` 选择；选中模型会套用它自己的默认推理强度。
- **无障碍**：滑条是 `role="slider"`，`←`/`→`/`↑`/`↓`/`Home`/`End`/`PageUp`/`PageDown` 都能用，`aria-valuetext` 报出当前等级，悬停提示里带上适配器对该等级的说明。
- **降级**：模型没有推理元数据时不显示滑条；`prefers-reduced-motion` 下粒子隐藏、过渡关闭。

## 安装

前提：DSH 的 profile 里已挂载 `@deepseek-ai/dsh-client-ui-model-selection` 与 `@deepseek-ai/dsh-client-ui-conversation`（默认的 `@deepseek-ai/dsh-web-app` bundle 已经包含）。

用 DSH 自带的插件管理器安装（GUI 侧边栏的**插件**页，或让 Agent 调用 `plugin_manager` 工具的 `install_bundle`）。`target` 可以是以下任意一种：

| 方式 | `target` 传什么 |
|---|---|
| **Git 仓库（推荐）** | 仓库地址，例如 `https://gitee.com/<用户名>/dsh-codex-reasoning-bar.git` |
| 本地目录 | 克隆 / 解压出来的**仓库根目录**绝对路径（本仓库根就是 npm 包根） |
| 压缩包 | `dsh-codex-reasoning-bar-1.0.0.tgz` 的绝对路径 |
| npm registry | 发布之后直接传包名 `dsh-codex-reasoning-bar` |

安装会把本包以 `link:`/依赖的形式写进 profile 的 `package.json`，并把 `cordis.patch.yml` 里的那一行插入 Loader 树，**立即对所有会话生效**。

> **从 GitHub 源安装的额外前提**：DSH 只会对 **GitHub** 地址做一次 `git ls-remote` 预检，
> 所以本机必须装好 `git` 且能连上 `github.com`。Gitee 等其他 Git 托管会跳过该预检；
> 用本地目录或压缩包则完全不需要 git。

**卸载**：插件管理器里停用或移除 `codex-reasoning-bar` 这一行即可；`priority: -1` 的注册消失后，DSH 自带的模型选择器会自动恢复。

## 文件

| 文件 | 作用 |
|---|---|
| `package.json` | 包清单：`dsh.bundle.patch` 声明 Loader patch，`dsh.client` 声明浏览器半边 |
| `cordis.patch.yml` | 往 profile 插入 `codex-reasoning-bar` 这一行 |
| `index.js` | Host 半边。纯 UI 插件，`apply()` 是空的，只为让这一行能激活 |
| `client.js` | 浏览器半边：面板、模型列表、滑条、粒子，约 900 行手写 JS，无构建步骤 |
| `LICENSE` | MIT |

## 实现要点

- **不自己存状态**：读写的都是插件背后那个 per-session `ModelDirectory`（Client 服务 `ctx.modelDirectories`），也就是 `/model` 弹窗用的同一份目录。所以在这里改的值，`/model` 下次打开就是它；两边永远不会不一致。
- **接管的是 `conversation.input.model` 这个 single 槽**，槽位目录本身标着 `replaceRisk: shadows-shipped-ui`，意思是允许被覆盖。本插件用 `priority: -1` 覆盖自带的 `priority: 0` —— 自带那个并没有被卸载，只是被遮蔽，随时可以还原。
- **只用主题 token**：颜色走 `--dsw-alias-*` / `--dsw-specific-menu`，都带兜底值，所以在宿主重命名 token 时最坏只是外观退化，不会渲染不出来。
- **不 import 任何 Harness 前端包**：图标、控件、定位都是自己写的，避免跟着宿主内部 API 一起坏掉。

## 已知取舍

- **接管了自带的模型选择器**：模型列表、搜索、键盘导航都由本插件重新实现，面板材质是"同样的 token + 同样的模糊"，但没有自带菜单那层 macOS 原生 vibrancy backing，分组标题也不是吸顶的。
- **只有档位名称**：星级/说明来自适配器公布的元数据，不同提供方可能只有名字没有说明。
- 仅在 **Web / Desktop 的 Web GUI** 内生效，不影响 CLI。
