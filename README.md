# 🤖 Site Monitor Bot

## 📋 Features

- ✅ Check sites every 5 minutes
- ✅ Batch processing (~35 seconds for all sites)
- ✅ HTTPS/HTTP fallback
- ✅ Telegram notifications for downtime/recovery
- ✅ Bot commands: `/check`, `/list`, `/help`
- ✅ Automatic cleanup of recovered sites

## 🛠 Tech Stack

- Node.js 18+
- PostgreSQL
- Telegram Bot API
- PM2 (process manager)

## 📂 Project Structure
```
src/
├── bot/              # Telegram bot
├── services/         # Monitoring logic
├── config/           # Database config
├── db/               # SQL schema & queries
└── index.js          # Entry point
```

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment

Create `.env` file:
```env
# API
API_URL=https://your-api.com/sites
API_TOKEN=your_token

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=site_monitor
DB_USER=your_user
DB_PASSWORD=your_password

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Settings
NODE_ENV=production
```

### 3. Setup Database
```bash
psql -U your_user -d site_monitor -f src/db/schema.sql
```

### 4. Run with PM2
```bash
pm2 start src/index.js --name site-monitor
pm2 save
pm2 startup
```

## 📊 PM2 Commands
```bash
pm2 list                  # List processes
pm2 logs site-monitor     # View logs
pm2 restart site-monitor  # Restart
pm2 stop site-monitor     # Stop
pm2 monit                 # Monitor
```

## 📞 Telegram Commands

- `/start` - Start bot
- `/help` - Show help
- `/check` - Run check now
- `/list` - Show down sites

## ⚙️ Configuration

### Change check interval

In `src/index.js`:
```javascript
startScheduler(10); // 10 minutes instead of 5
```

### Change batch size

In `.env`:
```env
BATCH_SIZE=150
```

## 🔄 Update
```bash
git pull
npm install --production
pm2 restart site-monitor
```

## 📄 License

MIT