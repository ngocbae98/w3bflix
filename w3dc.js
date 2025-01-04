const fs = require('fs');
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const schedule = require('node-schedule');
const CryptoJS = require('crypto-js');
const { HttpsProxyAgent } = require('https-proxy-agent');

colors.setTheme({
    red: 'brightRed',
    yellow: 'brightYellow',
    green: 'brightGreen',
    black: 'brightBlack',
    blue: 'brightBlue',
    white: 'brightWhite'
});

class W3BFLIX {
    constructor() {
        this.line = '~'.repeat(50).white;
        this.stopRequested = false;
        this.maxGamePlays = 5;
        this.proxyList = [];
        this.loadProxies();
    }

    loadProxies() {
        try {
            const scriptDir = path.dirname(require.main.filename);
            const proxyFile = path.join(scriptDir, 'proxy.txt');
            this.proxyList = fs.readFileSync(proxyFile, 'utf8').split('\n').filter(line => line.trim());
        } catch (error) {
            this.log(`${'Lỗi đọc file proxy: '.red}${error.message}`);
            this.proxyList = [];
        }
    }

    async checkProxyIP(proxy) {
        try {
            const proxyAgent = new HttpsProxyAgent(proxy);
            const response = await axios.get('https://api.ipify.org?format=json', {
                httpsAgent: proxyAgent,
                timeout: 10000
            });
            if (response.status === 200) {
                return response.data.ip;
            } else {
                throw new Error(`Không thể kiểm tra IP của proxy. Status code: ${response.status}`);
            }
        } catch (error) {
            throw new Error(`Error khi kiểm tra IP của proxy: ${error.message}`);
        }
    }

    clearTerminal() {
        process.stdout.write(process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H');
    }

    getHeaders() {
        return {
            "Accept": "application/json, text/plain, */*",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "en-US,en;q=0.9",
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
            "Origin": "https://w3bflix.world",
            "Pragma": "no-cache",
            "Priority": "u=1, i",
            "Referer": "https://w3bflix.world/",
            "Sec-Ch-Ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "X-Api-Key": "vL7wcDNndYZOA5fLxtab33wUAAill6Kk",
        };
    }

    getAxiosConfig(proxyIndex) {
        const config = {
            headers: this.getHeaders(),
            timeout: 30000
        };
        
        if (this.proxyList.length > 0 && proxyIndex < this.proxyList.length) {
            config.httpsAgent = new HttpsProxyAgent(this.proxyList[proxyIndex]);
        }
        
        return config;
    }

    async luckyDraw(teleId, proxyIndex) {
        const url = `https://api.w3bflix.world/v1/users/${teleId}/luckydraw`;
        const response = await axios.post(url, { type: "ton" }, this.getAxiosConfig(proxyIndex));
        return response.data;
    }

    async getVideos(proxyIndex) {
        const url = 'https://api.w3bflix.world/v1/videos';
        const response = await axios.get(url, this.getAxiosConfig(proxyIndex));
        return response.data;
    }

    async watch(teleId, vidId, proxyIndex) {
        const url = `https://api.w3bflix.world/v1/video/${vidId}/user/${teleId}/watch`;
        const response = await axios.post(url, {}, this.getAxiosConfig(proxyIndex));
        return response.data;
    }

    async claim(teleId, vidId, claimData, queryId, proxyIndex) {
        const url = `https://api.w3bflix.world/v1/video/${vidId}/user/${teleId}/earn/${claimData}`;
        const payload = { initDataRaw: queryId };
        const config = this.getAxiosConfig(proxyIndex);
        config.headers['Content-Type'] = 'application/json';
        const response = await axios.post(url, payload, config);
        return response.data;
    }

    generateSalt() {
        return Date.now().toString();
    }

    generateHash(salt, reward) {
        const key = "HermitCrabStudio";
        const messageToHash = salt + reward;
        return CryptoJS.HmacSHA256(messageToHash, key).toString(CryptoJS.enc.Hex);
    }

    async playGame(teleId, queryString, proxyIndex) {
        try {
            const params = new URLSearchParams(queryString);
            const initDataRaw = {
                query_id: params.get('query_id'),
                user: JSON.parse(decodeURIComponent(params.get('user'))),
                auth_date: params.get('auth_date'),
                signature: params.get('signature'),
                hash: params.get('hash')
            };

            const salt = this.generateSalt();
            const reward = Math.floor(Math.random() * (90 - 50 + 1)) + 50;
            const hash = this.generateHash(salt, reward);

            const payload = {
                initDataRaw,
                salt,
                reward,
                hash
            };

            const url = `https://api.w3bflix.world/v1/users/${teleId}/points/reward`;
            const response = await axios.post(url, payload, this.getAxiosConfig(proxyIndex));

            if (response.data.status === "success") {
                this.log(`${'Chơi game thành công'.green} | ${'Balance: '.white}${response.data.data.Balance.toString().green}`);
            }

            return response.data;
        } catch (error) {
            this.log(`${'Lỗi chơi game: '.red}${error.message}`);
            return null;
        }
    }

    log(msg) {
        const now = new Date().toISOString().split('.')[0];
        console.log(`[${now}]`.black + ` ${msg}`);
    }

    extractUserInfo(queryString) {
        try {
            const params = new URLSearchParams(queryString);
            const userInfo = params.get('user');
            if (userInfo) {
                const userData = JSON.parse(decodeURIComponent(userInfo));
                return [userData.id, userData.first_name];
            }
        } catch (error) {
            this.log(`${'Lỗi trích xuất thông tin người dùng: '.red}${error.message}`);
        }
        return [null, null];
    }

    async delay(seconds) {
        return new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }

    async startGameForAccount(teleId, queryString, proxyIndex) {
        for (let play = 1; play <= this.maxGamePlays; play++) {
            if (this.stopRequested) break;

            this.log(`${'Lượt chơi '.blue}${play}/${this.maxGamePlays}`);
            await this.playGame(teleId, queryString, proxyIndex);

            if (play < this.maxGamePlays) {
                this.log('Chờ 30 giây để chơi game tiếp...'.yellow);
                await this.delay(30);
            }
        }
    }

    async main() {
        try {
            const scriptDir = path.dirname(require.main.filename);
            const dataFile = path.join(scriptDir, 'data.txt');
            const data = fs.readFileSync(dataFile, 'utf8').split('\n').filter(line => line.trim());
            const numAcc = data.length;

            this.log(this.line);
            this.log(`${'Số lượng tài khoản: '.green}${String(numAcc).white}`);

            for (let i = 0; i < data.length; i++) {
                if (this.stopRequested) {
                    this.log('Đã nhận được tín hiệu dừng...'.yellow);
                    break;
                }

                const [teleId, firstName] = this.extractUserInfo(data[i]);
                if (!teleId) {
                    this.log(`${'Không thể trích xuất Telegram ID từ dòng: '.red}${data[i]}`);
                    continue;
                }

                this.log(this.line);
                this.log(`${'Tài khoản: '.green}${`${i + 1}/${numAcc}`.white} - ${'Bắt đầu xử lý tài khoản'.yellow}`);
                
                let proxyIP = "No proxy";
                if (this.proxyList.length > 0 && i < this.proxyList.length) {
                    try {
                        proxyIP = await this.checkProxyIP(this.proxyList[i]);
                    } catch (error) {
                        this.log(`${'Lỗi proxy: '.red}${error.message}`);
                        proxyIP = "Proxy error";
                    }
                }
                
                this.log(`${'Name: '.green}${firstName.white} - ${'Telegram ID: '.green}${String(teleId).white} - ${'IP: '.green}${proxyIP.white}`);

                this.log('Đang rút thăm may mắn hàng ngày...'.yellow);
                try {
                    const drawData = await this.luckyDraw(teleId, i);
                    if (drawData.data) {
                        if (drawData.data.rewards) {
                            this.log(`${'Rút thăm may mắn hàng ngày: '.white}${'Thành công nhận '.green}${drawData.data.rewards}${' points'.green}`);
                        } else if (drawData.data.wait) {
                            this.log(`${'Rút thăm may mắn hàng ngày: '.white}${'Chưa đến lúc yêu cầu (Chờ '.red}${drawData.data.wait}${' giây)'.red}`);
                        }
                    }
                } catch (error) {
                    this.log(`${'Rút thăm may mắn hàng ngày: '.white}${'Error: '.red}${error.message}`);
                }

                if (!this.stopRequested) {
                    this.log('Bắt đầu xem video...'.yellow);
                    try {
                        const videosData = await this.getVideos(i);
                        const videos = videosData.data;

                        for (const video of videos) {
                            if (this.stopRequested) break;

                            const vidTitle = video.Title;
                            const vidId = video.Vid;

                            try {
                                const watch = await this.watch(teleId, vidId, i);
                                if (!watch.data) {
                                    this.log(`${vidTitle.white}: ${'Invalid watch response'.red}`);
                                    continue;
                                }

                                const claimData = watch.data.watch;
                                const claimStatus = watch.data.claimedAt;
                                this.log(`${vidTitle.white}: ${claimData}`);

                                if (claimStatus === null) {
                                    this.log('Chờ 30 giây xem video...'.yellow);
                                    await this.delay(30);

                                    if (!this.stopRequested) {
                                        const claimResponse = await this.claim(teleId, vidId, claimData, data[i], i);
                                        if (claimResponse.data?.claimCode) {
                                            this.log(`${vidTitle.white}: ${'Yêu cầu thành công'.green}`);
                                            this.log(`${vidTitle.white}: ${`/watch ${claimResponse.data.claimCode}:${claimData}`.green}`);
                                        }
                                    }
                                } else {
                                    this.log(`${vidTitle.white}: ${'Đã claim'.yellow}`);
                                }
                            } catch (error) {
                                this.log(`${'Lỗi xử lý video '.red}${vidTitle}${': '.red}${error.message}`);
                            }
                        }
                    } catch (error) {
                        this.log(`${'Lỗi lấy thông tin video: '.red}${error.message}`);
                    }
                }

                if (!this.stopRequested) {
                    this.log('Bắt đầu chơi 5 game...'.yellow);
                    await this.startGameForAccount(teleId, data[i], i);
                }
            }

            this.log(`${'Tất cả tài khoản đã được xử lý.\nNếu Auto Claim Bot chưa gửi tin nhắn tự động thì bạn nên copy tin nhắn "/watch ...." và gửi tới bot W3BFLIX theo cách thủ công'.yellow}`);
        } catch (error) {
            this.log(`${'Main process error: '.red}${error.message}`);
        }
    }

    async runScheduledTask() {
        try {
            this.clearTerminal();
            this.log(`${'Bắt đầu khởi chạy lúc '.yellow}${new Date().toLocaleString()}`);
            await this.main();
            const nextRun = new Date(Date.now() + 12 * 60 * 60 * 1000);
            this.log(`${'Thời gian chạy vòng lặp tiếp theo: '.yellow}${nextRun.toLocaleString()}`);
        } catch (error) {
            this.log(`${'Lỗi rồi: '.red}${error.message}`);
        }
    }

    async start() {
        try {
            this.clearTerminal();
            
            this.loadProxies();
            this.log(`${'Đã tải '.green}${this.proxyList.length}${' proxy'.green}`);
            
            await this.runScheduledTask();

            schedule.scheduleJob('0 */12 * * *', () => this.runScheduledTask());
    
            process.on('SIGINT', () => {
                this.stopRequested = true;
                this.log('\nĐã nhận được tín hiệu dừng...'.yellow);
                setTimeout(() => {
                    this.log('Đang thoát chương trình...'.yellow);
                    process.exit(0);
                }, 1000);
            });

            process.on('uncaughtException', (error) => {
                this.log(`${'Lỗi không xử lý được: '.red}${error.message}`);
                this.log('Đang khởi động lại...'.yellow);
                this.start();
            });

            process.on('unhandledRejection', (reason, promise) => {
                this.log(`${'Promise bị từ chối không xử lý: '.red}${reason}`);
                this.log('Đang khởi động lại...'.yellow);
                this.start();
            });

        } catch (error) {
            this.log(`${'Lỗi khởi động: '.red}${error.message}`);
            process.exit(1);
        }
    }
}

if (require.main === module) {
    const w3bflix = new W3BFLIX();
    w3bflix.start();
}

module.exports = W3BFLIX;