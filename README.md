
<a href="https://worldguessr.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/codergautam/worldguessr/master/public/logo-readme-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/codergautam/worldguessr/master/public/logo-readme-light.png">
    <img alt="WorldGuessr" src="https://raw.githubusercontent.com/codergautam/worldguessr/master/public/logo-readme-light.png">
  </picture>
</a>


一款受 GeoGuessr 启发、免费游玩、源码可获取的地理猜谜游戏。这个基于 React 的项目希望能通过谷歌街景画面，带你在探索世界的同时学点地理，既好玩又涨知识。

### 立即开玩 [点这里](https://worldguessr.com)！
#### [加入 Discord 社区](https://discord.gg/yenVspFmkB)

## 游戏特色

- **随机街景：** 每局都会把你投放到世界各地的一个全新地点。
- **多人模式：** 实时挑战好友，或与随机对手对战。
- **国家连对：** 考验你的知识储备，看看你能连续猜对多少个国家。
- **免费运行：** 源码公开，可用于非商业用途的自托管（见 [许可协议](#license)）。街景画面走的是 [谷歌地图街景嵌入 API](https://developers.google.com/streetview/web)，完全免费，不像 GeoGuessr 那套昂贵的 SDK。

## 致谢

- [Leaflet](https://leafletjs.com/) 提供了小地图展示。
- mutsuyuki 的 [Leaflet.SmoothWheelZoom](https://github.com/mutsuyuki/Leaflet.SmoothWheelZoom)，我们的流畅滚轮缩放（`lib/leafletFluidZoom.js`）正是改编自它。
- [谷歌地图 API](https://developers.google.com/maps) 慷慨的免费额度支撑了街景画面。
- [Vali](https://github.com/slashP/Vali)（作者 @SlashP），为所有国家生成了均衡的地点分布。
- [Next.js](https://nextjs.org/) 支撑起了整个 Web 应用。
- 还有所有让这个项目走到今天的贡献者们！

## 本地运行

### 环境要求

开始之前，请先装好下面这些：
- [Node.js](https://nodejs.org/en/)（v18.18 或更高）
- [npm](https://www.npmjs.com/)（v6.x 或更高）
- [pnpm](https://pnpm.io/)（v9.x 或更高）

### 安装步骤

1. 克隆仓库：
   ```bash
   git clone https://github.com/codergautam/worldguessr.git
   cd worldguessr
   ```

2. 安装依赖：
   ```bash
   pnpm install
   ```

3. 启动开发服务器：
   ```bash
   pnpm run dev
   ```

   浏览器打开 [http://localhost:3000](http://localhost:3000) 即可查看效果。

## 部署到 VPS / 外部服务器

如果要把 WorldGuessr 部署到 VPS 或任何有公网 IP 的服务器上（而不是 localhost），**务必**在 `.env` 文件中配置下面这些环境变量：

```bash
# 把 YOUR_IP 换成你服务器的 IP 或域名
NEXT_PUBLIC_API_URL=YOUR_IP:3001
NEXT_PUBLIC_WS_HOST=YOUR_IP:3002
```

**使用 IP 的示例：**
```bash
NEXT_PUBLIC_API_URL=123.45.67.89:3001
NEXT_PUBLIC_WS_HOST=123.45.67.89:3002
```

**使用域名（配好 nginx 之后）的示例：**
```bash
NEXT_PUBLIC_API_URL=api.yourdomain.com
NEXT_PUBLIC_WS_HOST=ws.yourdomain.com
```

### 快速配置清单

1. **MongoDB** —— 在 [MongoDB Atlas](https://www.mongodb.com/atlas) 建一个集群（有免费套餐），把连接串填进去：
   ```bash
   MONGODB=mongodb+srv://username:password@cluster.mongodb.net/worldguessr
   ```

2. **Google OAuth** —— 在 [Google Cloud 控制台](https://console.cloud.google.com/) 创建凭据：
   ```bash
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your_client_secret
   ```

3. **API/WS 地址** —— 填你的公网 IP 或域名（见上文）

环境变量的完整文档见 [docs/environment-variables.md](docs/environment-variables.md)。

## 参与贡献

贡献让这个社区变得更好，也让大家有机会一起学习、互相启发。你的任何贡献都**非常宝贵**。

如果你有让项目更棒的想法，请 fork 仓库并提交 pull request，也可以直接开一个带 "enhancement" 标签的 issue。别忘了给项目点个 star！谢谢啦！

1. Fork 这个项目
2. 创建你的功能分支（`git checkout -b feature/AmazingFeature`）
3. 提交你的改动（`git commit -m 'Add some AmazingFeature'`）
4. 推送到分支（`git push origin feature/AmazingFeature`）
5. 发起一个 Pull Request

## 许可协议

基于 PolyForm Noncommercial License 1.0.0 发布。你可以将该项目用于非商业用途的修改与分发。更多信息见 [LICENSE.md](LICENSE.md)。

## 社区

加入 Discord 社区 [点这里](https://discord.gg/yenVspFmkB)，一起聊聊新功能、反馈 bug、找开发者交流，或者认识其他玩家。

也可以给我发邮件：gautam@worldguessr.com
