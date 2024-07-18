const
	{ default: axios } = require('axios'),
	chalk = require('chalk'),
	{ existsSync, readFileSync } = require('fs'),
	logger = require('./logger'),
	ms = require('ms'),
	{ HttpProxyAgent } = require('http-proxy-agent'),
	{ SocksProxyAgent } = require('socks-proxy-agent');

module.exports = {
	checkToken: (token) => {
		axios({
			method: 'get',
			url: 'https://discordapp.com/api/v9/users/@me',
			timeout: 10000,
			headers: {
				'Authorization': token,
				'Content-Type': 'application/json',
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:84.0) Gecko/20100101 Firefox/84.0',
			},
			validateStatus: null,
		})
			.catch(err => logger.error(`Could not login using the provided ${chalk.bold('redeemToken')} : ${err}`))
			.then(res => {
				if (res.status === 401) logger.error(chalk.red.bold(`Invalid redeemToken: ${chalk.reset.bold(`"${token}"`)}`));
				else logger.debug(`Successfully logged in as ${chalk.bold(chalk.blue(res.data.username))}.`);
			});
	},

	updateAvailable: false,
	checkForUpdates: (silent = false) => {
		if (module.exports.updateAvailable) {
			if (silent) return;
			return logger.info(chalk.bold(`An update is available on GitHub (v${module.exports.updateAvailable}) ! ${chalk.blue('https://github.com/Tenclea/ReYANG')}`));
		}

		(async () => {
			const res = await axios('https://raw.githubusercontent.com/Tenclea/ReYANG/main/package.json')
				.catch(e => { logger.error(`Could not check for updates: ${e}`); return null; });

			if (!res?.data) return;
			const update = res.data.version;
			const { version } = require('../package.json');

			if (version !== update) {
				module.exports.updateAvailable = update;
				if (!silent) return logger.info(chalk.bold(`An update is available on GitHub (v${module.exports.updateAvailable}) ! ${chalk.blue('https://github.com/Tenclea/ReYANG')}`));
			}
		})();
	},

	getAgentFromURI: (uri, timeout = 5000) => {
		switch (uri.split('://')[0]) {
			case 'http':
			case 'https':
				return new HttpProxyAgent(uri, { timeout });
			case 'socks':
			case 'socks4':
			case 'socks5':
				return new SocksProxyAgent(uri, { timeout });
			default:
				console.error(uri);
				return null;
		}
	},

	getIP: (agent = null) => {
		return axios(
			'https://api.ipify.org',
			{ httpsAgent: agent, timeout: 10000, validateStatus: null },
		)
			// eslint-disable-next-line no-unused-vars
			.catch(_ => ({ data: null }))
			.then(res => res?.data?.ip || res?.data);
	},

	loadProxies: (path, type = null) => {
		if (!existsSync(path)) return [];
		return readFileSync(path, 'utf-8')
			.split(/\r?\n/)
			.filter(p => p)
			.map(p => {
				const parts = p.split(':');
				if (parts.length > 3 && !p.includes('://')) p = parts.slice(2).join(':') + '@' + parts.slice(0, 2).join(':');

				return (type ? `${type}://` : '') + p;
			});
	},

	sendWebhook: (url, message) => {
		const date = new Date().getTime();
		const data = JSON.stringify({ 'username': 'ReYANG', 'avatar_url': 'https://cdn.discordapp.com/attachments/794307799965368340/794356433806032936/20210101_010801.jpg', 'content': message });

		axios({ method: 'post', url, data, headers: { 'Content-Type': 'application/json' } })
			.then(() => logger.debug(`Successfully delivered webhook message in ${ms(+new Date() - date, { long: true })}.`))
			.catch(e => logger.error(`Could not deliver webhook message : ${e}`));
	},

	shuffleArray: (array) => {
		for (let i = array.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[array[i], array[j]] = [array[j], array[i]];
		}

		return array;
	},

	redeemNitro: (code, config) => {
		if (!config.auto_redeem.enabled) return;

		axios({
			method: 'post',
			url: `https://discordapp.com/api/v9/entitlements/gift-codes/${code}/redeem`,
			data: '',
			headers: { 'Authorization': config.auto_redeem.token },
			validateStatus: null,
		})
			.then(res => {
				const body = res.data;
				if (!body) return;

				if (body.message === 'You are being rate limited.') {
					logger.warn(chalk.red(`You are being rate limited, trying to claim again in ${chalk.yellow(body.retry_after)} seconds.`));
					return setTimeout(() => module.exports.redeemNitro(code, config), body.retry_after * 1000 + 50);
				}
				else if (body.message === 'Unknown Gift Code') {
					return logger.warn(`${chalk.bold(code)} was an invalid gift code or had already been claimed.`);
				}
				else if (body.message === 'This gift has been redeemed already.') {
					if (config.webhook.enabled) module.exports.sendWebhook(config.webhook.url, `This gift code (${code}) has already been redeemed...`);
					return logger.warn(`${code} has already been redeemed...`);
				}
				else {
					if (config.webhook.enabled) module.exports.sendWebhook(config.webhook.url, 'Successfully claimed a gift code!');
					return logger.info(chalk.green(`Successfully redeemed the nitro gift code : ${code} !`));
				}
			})
			.catch(err => logger.info(chalk.red(`Failed to redeem a nitro gift code : ${code} > ${err}.`)));
	},

	validateProxies: async () => {
		return []; // TODO: fix proxy validator

		/* const res = await axios({
			method: 'post',
			url: 'https://yangdb.tenclea.repl.co/proxies',
			data: { proxies: p },
			timeout: 10000,
		}).catch(() => { });

		return res?.data?.proxies || []; */
	},
};
