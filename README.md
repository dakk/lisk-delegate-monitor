# Lisk Delegate Monitor

## Installation

```
git clone https://github.com/dakk/lisk-delegate-monitor/
cd lisk-delegate-monitor
npm install
cp config.example.json config.json 
nano config.json #edit with your configuration
npm install -g pm2
```

## Start

```
pm2 start server.js 
```