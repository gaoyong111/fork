# 应用图标

此目录用于存放应用图标文件，Tauri 打包时需要以下格式的图标：

## 所需图标文件

| 文件名 | 尺寸 | 用途 |
|--------|------|------|
| `32x32.png` | 32x32 | Linux 小图标 |
| `128x128.png` | 128x128 | Linux 中图标 |
| `128x128@2x.png` | 256x256 | Linux 高清图标 |
| `icon.icns` | 多尺寸 | macOS 应用图标 |
| `icon.ico` | 多尺寸 | Windows 应用图标 |
| `icon.png` | 512x512 | 系统托盘图标 |

## 生成方式

可以使用 Tauri 官方提供的图标生成工具：

```bash
# 使用 tauri icon 命令从一张源图生成所有尺寸
pnpm tauri icon path/to/source-icon.png
```

源图标建议使用 1024x1024 或更大的 PNG 图片，工具会自动生成所有平台所需的格式。
