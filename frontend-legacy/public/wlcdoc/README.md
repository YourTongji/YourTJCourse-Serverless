# 乌龙茶课程评价文档 - 部署说明

## 📁 文件夹说明

这个 `wlcdoc` 文件夹包含了构建后的静态网站文件，可以直接部署到任何 Web 服务器上。

## 📂 文件结构

```
wlcdoc/
├── index.html              # 首页
├── 404.html                # 404 页面
├── custom-styles.css       # 自定义样式
├── home-search.css         # 首页搜索样式
├── home-search.js          # 首页搜索脚本
├── favicon.svg             # 网站图标
├── hashmap.json            # 搜索索引
├── vp-icons.css           # 图标样式
├── assets/                 # 静态资源（JS、CSS 等）
├── courses/               # 课程页面
│   ├── index.html
│   ├── introduction.html
│   ├── required/          # 必修课
│   │   ├── index.html
│   │   └── all-courses.html
│   └── elective/          # 选修课
│       ├── index.html
│       └── all-courses.html
├── appendix/              # 附录
├── guide/                 # 指南
├── thanks/                # 致谢
└── images/                # 图片资源
```

## 🚀 部署方式

### 方式一：直接复制到现有站点

将整个 `wlcdoc` 文件夹的内容复制到您的网站根目录或子目录：

```bash
# 复制到网站根目录
cp -r wlcdoc/* /path/to/your/website/

# 或复制到子目录（例如 /docs/）
cp -r wlcdoc/* /path/to/your/website/docs/
```

### 方式二：使用 iframe 嵌入

如果您想在现有页面中嵌入文档，可以使用 iframe：

```html
<iframe
  src="/docs/index.html"
  width="100%"
  height="800px"
  frameborder="0">
</iframe>
```

### 方式三：作为独立子域名部署

将文件部署到子域名，例如：`docs.yoursite.com`

## 🌐 常见 Web 服务器配置

### Nginx

```nginx
server {
    listen 80;
    server_name docs.yoursite.com;
    root /path/to/wlcdoc;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Apache

在 `wlcdoc` 目录创建 `.htaccess` 文件：

```apache
RewriteEngine On
RewriteBase /
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

### 静态托管平台

- **Vercel**: 直接拖拽 `wlcdoc` 文件夹到 Vercel
- **Netlify**: 直接拖拽 `wlcdoc` 文件夹到 Netlify
- **GitHub Pages**: 推送到 gh-pages 分支
- **阿里云 OSS**: 上传整个文件夹

## ⚙️ 配置说明

### 作为子路径部署

如果要将文档部署到 `https://yoursite.com/docs/`，需要修改 `.vitepress/config.ts` 中的 `base` 配置：

```typescript
export default defineConfig({
  base: '/docs/',
  // ...
})
```

然后重新构建：

```bash
cd wlc
npm run build
cp -r .vitepress/dist/* ../wlcdoc/
```

## 📝 注意事项

1. **所有链接都是相对路径**，可以放在任何目录下使用
2. **搜索功能完全本地化**，不需要外部服务
3. **无需服务器端渲染**，纯静态文件
4. **支持所有现代浏览器**
5. **图片资源已包含**在 `images/` 目录中

## 🔍 本地预览

可以使用任何静态服务器预览：

```bash
# Python
python -m http.server 8000 -d wlcdoc

# Node.js (需要安装 http-server)
npx http-server wlcdoc

# PHP
php -S localhost:8000 -t wlcdoc
```

然后访问 http://localhost:8000

## 📦 文件大小

- 总文件大小：约 2-3 MB（压缩后）
- 首页加载：约 500 KB
- 包含所有课程评价内容

## 🎨 自定义

如需修改样式或内容，请编辑源文件：

- 源码位置：`wlc/` 文件夹
- 配置文件：`wlc/.vitepress/config.ts`
- 首页：`wlc/index.md`
- 样式：`wlc/public/custom-styles.css`

修改后重新构建即可。

## 📧 技术支持

如有问题，请联系开发团队。
