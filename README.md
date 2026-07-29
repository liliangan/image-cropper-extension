# 图片裁切工具

一个基于 Manifest V3 的 Edge / Chrome 图片裁切扩展。图片读取、裁切和导出均在浏览器本地完成，无需上传到服务器。

当前版本：`1.0.0`

## 功能

- 支持 JPG、PNG、WebP 图片
- 支持自由裁切、`1:1`、`4:3`、`16:9` 和自定义固定比例
- 内置小一寸、一寸、大一寸、小二寸、二寸和大二寸证件照像素规格
- 支持向左/向右旋转、水平翻转和垂直翻转
- 按输入图片格式导出，JPG 自动使用白色背景
- 不申请扩展权限，不包含广告、统计或远程代码

> 证件照预设尺寸按 300 DPI 换算为像素。浏览器 Canvas 导出只保证像素尺寸，不写入 300 DPI 元数据；提交到具体平台前仍需核对平台要求。

## 使用方法

1. 点击浏览器工具栏中的扩展图标。
2. 点击右上角“上传”，选择 JPG、PNG 或 WebP 图片。
3. 调整裁切区域，按需选择比例、证件照规格、旋转或翻转。
4. 点击“下载”，保存裁切后的图片。

## 本地安装

### Microsoft Edge

1. 打开 `edge://extensions/`。
2. 开启“开发人员模式”。
3. 点击“加载解压缩的扩展”，选择本项目目录。

### Google Chrome

1. 打开 `chrome://extensions/`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择本项目目录。

## 项目结构

```text
manifest.json              扩展清单
_locales/zh_CN/            简体中文清单本地化文案
popup.html                 弹窗结构
popup.css                  弹窗样式
popup.js                   裁切和导出逻辑
vendor/                    本地打包的 Cropper.js 依赖
icon-*.png                 扩展图标
PRIVACY.md                 隐私政策
STORE_LISTING.md           商店文案和发布检查清单
THIRD_PARTY_NOTICES.md     第三方许可声明
package_extension.sh       生成商店上传包
```

扩展运行不需要安装依赖或执行构建。修改代码后，回到扩展管理页面重新加载即可测试。

## 打包

打包环境需要 Node.js 和 `zip` 命令。运行：

```bash
./package_extension.sh
```

脚本会读取 `manifest.json` 中的版本号，校验 JavaScript 和清单格式，并生成：

```text
dist/image-cropper-extension-v1.0.0.zip
```

压缩包根目录直接包含 `manifest.json`，可用于 Microsoft Edge Add-ons 和 Chrome Web Store。每次商店更新都必须先把 `manifest.json` 的版本号调高；商店不允许覆盖同版本或降级发布。

## 隐私

本扩展只处理用户主动选择的本地图片：

- 图片不会离开浏览器，也不会上传到任何服务器。
- 不收集、存储、出售或共享个人信息和使用数据。
- 不使用 Cookie、分析工具、广告或用户追踪。
- 不申请 `permissions` 或 `host_permissions`。

完整说明见 [PRIVACY.md](PRIVACY.md)。正式上架前，应把该文件发布到无需登录即可访问的 HTTPS 页面，并将页面地址填写到商店后台。

## 商店发布

可直接使用的简短介绍、详细描述、单一用途说明、权限说明和审核备注见 [STORE_LISTING.md](STORE_LISTING.md)。

仓库已经具备：

- Manifest V3 清单
- `16`、`32`、`48`、`128` 像素扩展图标
- 零权限配置
- 所有运行代码本地打包，无 CDN 或远程脚本
- 隐私政策和第三方许可声明
- 可重复生成的 ZIP 发布包

上架前仍需在商店后台准备或确认：

- 开发者账号及身份/付款资料（以平台后台当前要求为准）
- 无需登录即可访问的隐私政策、支持页面和联系信息
- 至少一张清晰展示实际裁切界面的商店截图
- Edge 所需的商店徽标/推广图，以及 Chrome 所需的商店图片素材
- 分类、语言、适用市场、可见性和定价
- 数据使用声明、单一用途说明及审核人员测试步骤

图片尺寸和字段限制可能调整，提交时以 Edge Partner Center 与 Chrome Web Store 开发者后台显示的最新要求为准。不要在宣传图中使用 Edge、Chrome 或其他第三方商标来暗示官方背书。

## 第三方依赖

界面使用本地打包的 [Cropper.js 1.6.1](https://github.com/fengyuanchen/cropperjs)，采用 MIT License。完整许可文本见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
