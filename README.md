# 意瑞旅行网页 · 发布目录

此目录只包含可发布的网页和 Cloudflare Pages Function。原始工作簿、航班订单截图与设计参考图不在此目录。

## 本地预览

双击 `public/index.html` 即可查看页面。此时勾选状态仅保存在当前浏览器。

## GitHub + Cloudflare Pages

1. 将此目录单独建成 GitHub 仓库并推送。不要把上层文件夹一起上传。
2. Cloudflare 控制台 → Workers & Pages → Create application → Pages → Connect to Git，选择此仓库。
3. 选择无框架预设，Build command 填 `exit 0`；Build output directory 填 `public`。Cloudflare 的静态 HTML 指南建议使用 `exit 0` 以启用 Pages Functions。
4. 创建 D1 数据库，例如 `italy-swiss-trip`。在 D1 Console 执行 `schema.sql` 中的建表语句。
5. Pages 项目 → Settings → Bindings → Add → D1 database，变量名填 `DB`，选刚创建的数据库。
6. Pages 项目 → Settings → Variables and Secrets → Add，名称填 `TRIP_ACCESS_CODE`，值设为三人共用的强访问码并选择 Encrypt。
7. 重新部署 Pages 项目。打开网页，点一个待办项时输入访问码。其他同行者打开同一链接便会看到共享状态，页面停留期间约每 15 秒刷新。

交通、住宿及景点内容会随网页公开给持有链接的人；访问码只保护勾选修改。请将访问码与网页链接分别发给同行者。

每日当地地图使用 Leaflet 和 OpenStreetMap 在线底图，地点坐标按需通过 Nominatim 查询并缓存。Google 地图导航按钮需要能访问 Google 地图。
