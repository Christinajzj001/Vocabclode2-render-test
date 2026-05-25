# 📚 VocabCloud — 词汇学习平台

教师上传 HTML 词汇软件，学生通过专属链接在线使用，到期自动停止，无法下载源文件。

---

## 功能特性

- ✅ 教师上传任意 HTML 词汇软件
- ✅ 生成学生访问链接，设定开始/到期日期
- ✅ 到期后学生自动看到"已过期"页面，无法访问内容
- ✅ 支持可选访问密码（班级隔离）
- ✅ 学生无法下载源文件（内容通过服务器代理，禁用右键/Ctrl+S）
- ✅ 教师后台查看访问统计

---

## 本地运行（测试）

```bash
# 1. 安装依赖
npm install

# 2. 启动服务器
npm start

# 3. 打开浏览器访问
# 教师后台: http://localhost:3000/admin
# 默认密码: teacher123
```

---

## 部署到 Railway（推荐，永久免费额度）

### 第一步：注册 Railway

1. 打开 https://railway.app
2. 点击 "Sign Up"，用 GitHub 账号注册（免费）

### 第二步：上传代码到 GitHub

1. 打开 https://github.com，登录后点击右上角 "+" → "New repository"
2. 仓库名填 `vocab-platform`，选 Private（私密）
3. 点击 "Create repository"
4. 按照页面上的说明，将本项目文件夹上传：
   ```bash
   # 在项目文件夹中打开终端，执行：
   git init
   git add .
   git commit -m "初始化"
   git branch -M main
   git remote add origin https://github.com/你的用户名/vocab-platform.git
   git push -u origin main
   ```

### 第三步：在 Railway 部署

1. 登录 Railway → 点击 "New Project"
2. 选择 "Deploy from GitHub repo"
3. 找到并选择 `vocab-platform`
4. Railway 会自动检测 Node.js 项目并部署

### 第四步：设置环境变量（重要！）

在 Railway 项目页面：
1. 点击你的服务 → 点击 "Variables" 选项卡
2. 添加以下环境变量：

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `ADMIN_PASSWORD` | 教师登录密码 | `MySecretPwd2024` |
| `SESSION_SECRET` | 加密密钥（随机字符串） | `abc123xyz456def789` |
| `NODE_ENV` | 环境标识 | `production` |

3. 添加完毕后 Railway 会自动重新部署

### 第五步：获取你的域名

部署完成后，Railway 会给你一个域名，格式如：
```
https://vocab-platform-production-xxxx.up.railway.app
```

把这个域名发给学生，教师后台地址为：
```
https://你的域名/admin
```

---

## 部署到 Vercel（备选方案）

⚠️ Vercel 的免费版是"无服务器"架构，文件上传和 SQLite 数据库**不支持持久化**。
建议使用 Railway 而不是 Vercel 部署此项目。

---

## 使用说明

### 教师操作流程

1. 打开 `你的域名/admin`，输入管理员密码登录
2. 在"上传词汇 HTML 文件"区域，拖拽或点击上传你的 HTML 文件
3. 点击"新建链接"，填写：
   - **链接名称**：如"高一2班 第3单元"
   - **关联文档**：选择刚上传的文件
   - **班级**：备注用途
   - **到期日期**：如学期结束日
   - **访问密码**：可选，用于隔离班级
4. 复制生成的链接，发给对应班级的学生
5. 到期后无需任何操作，学生自动无法访问

### 学生使用体验

- 打开老师发的链接，即可直接使用词汇软件
- 右键菜单、Ctrl+S、Ctrl+U 等快捷键均被禁用
- 页面顶部显示剩余天数
- 到期后看到"已过期"提示，无法再访问

---

## 常见问题

**Q: 学生能破解进去吗？**
A: 期限检查在服务器端进行，学生无法通过修改浏览器来绕过。HTML 文件的真实路径也不会暴露给学生。

**Q: 如何修改管理员密码？**
A: 在 Railway 的环境变量中修改 `ADMIN_PASSWORD` 的值，保存后自动重新部署生效。

**Q: 数据会丢失吗？**
A: Railway 的磁盘是持久化的，数据不会因重启丢失。建议定期在后台截图备份链接列表。

**Q: 能上传多大的文件？**
A: 默认限制 20MB，足够大多数 HTML 词汇软件。如需修改，在 `server.js` 的 `multer` 配置中调整 `fileSize`。
