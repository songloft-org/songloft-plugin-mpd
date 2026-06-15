# songloft-plugin-mpd

Songloft MPD 播放控制插件 -- 通过 Web 界面控制本地 MPD（Music Player Daemon），支持将有线音箱或蓝牙音箱作为音频输出设备。

## 功能

- 播放控制：播放/暂停、上一首/下一首、音量调节、进度拖拽
- 队列管理：添加/删除歌曲、清空队列、随机播放
- 媒体库浏览：按歌曲、艺术家、专辑浏览，支持搜索
- 多音频输出：支持有线和蓝牙音箱播放
- 智能轮询：根据播放状态动态调整轮询频率
- 批量操作优化：批量播放性能提升 89%

## 环境准备

### 安装 Songloft（Docker）

```bash
sudo docker run -d \
  --name songloft \
  -p 58091:58091 \
  -v /vol1/1000/音乐:/app/music \
  -v /vol1/1000/docker/songloft/data:/app/data \
  --device /dev/snd:/dev/snd \
  --group-add 29 \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=admin \
  -e XDG_RUNTIME_DIR=/run/user/1000 \
  -e PULSE_SERVER=unix:/run/user/1000/pulse/native \
  -e PULSE_COOKIE=/root/.config/pulse/cookie \
  -v /run/user/1000/pulse:/run/user/1000/pulse \
  -v /home/admin/.config/pulse/cookie:/root/.config/pulse/cookie:ro \
  songloft/songloft:latest
```

参数说明：
- `-v /vol1/1000/音乐:/app/music` -- 音乐文件目录，按实际路径修改
- `-v /vol1/1000/docker/songloft/data:/app/data` -- 数据持久化目录
- `--device /dev/snd:/dev/snd` -- 映射声卡设备，有线音箱需要
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` -- 管理员账号密码
-v /run/user/1000/pulse:/run/user/1000/pulse \ -- 蓝牙音箱需要
-v /home/admin/.config/pulse/cookie:/root/.config/pulse/cookie:ro \ -- 这里的admin是宿主机登录名
### 配置蓝牙自动连接

如果使用蓝牙音箱，可以配置开机自动连接，确保每次重启后音箱自动配对。

#### 1. 创建自启动服务文件

```bash
sudo nano /etc/systemd/system/bt-auto-connect.service
```

粘贴以下内容，将 `30:21:2E:74:8A:CC` 替换为你的蓝牙音箱 MAC 地址：

```ini
[Unit]
Description=Auto connect Bluetooth device
After=bluetooth.target network-online.target
Wants=bluetooth.service

[Service]
Type=simple
ExecStart=/usr/bin/bluetoothctl connect 30:21:2E:74:8A:CC
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

#### 2. 启用服务

```bash
# 重载 systemd 配置
sudo systemctl daemon-reload

# 启用开机自启
sudo systemctl enable bt-auto-connect.service

# 启用蓝牙服务开机自启
sudo systemctl enable --now bluetooth
```

#### 3. 测试运行

```bash
# 手动启动测试
sudo systemctl start bt-auto-connect.service

# 查看连接状态
systemctl status bt-auto-connect.service
```

### 获取蓝牙音箱 MAC 地址

```bash
# 进入蓝牙控制台
bluetoothctl

# 扫描附近设备
scan on

# 记下你的音箱 MAC 地址（格式如 30:21:2E:74:8A:CC）

# 配对并信任（首次）
pair 30:21:2E:74:8A:CC
trust 30:21:2E:74:8A:CC
```

## 要求

- Songloft 宿主版本 >= 2.8.2
- 权限：`storage`、`songs.read`、`playlists.read`、`command`
- 本地需要安装并运行 MPD
- 有线音箱：确保 `/dev/snd` 设备可用
- 蓝牙音箱：确保蓝牙服务已启动并已配对

## 安装插件

1. 从 [Releases](https://github.com/<YOUR_USER>/songloft-plugin-mpd/releases) 下载 `mpd-player.jsplugin.zip`
2. 在 Songloft 中上传并安装插件
3. 在插件设置中配置 MPD 连接参数（主机地址、端口）

## 开发

```bash
npm install
npm run dev       # 联调本地 Songloft 实例
npm run build     # 生成 dist/mpd-player.jsplugin.zip
npm run validate  # 验证构建产物
```

## 许可证

Apache-2.0
