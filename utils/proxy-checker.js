const
	{ default: axios } = require('axios'),
	chalk = require('chalk'),
	{ validateProxies, getAgentFromURI, getIP } = require('./functions'),
	logger = require('./logger'),
	ms = require('ms');

module.exports = async (proxies, threads, keep_transparent, silent = false) => {
	const maxRetries = 0;
	if (!silent) logger.info(`Checking ${chalk.yellow(proxies.length)} proxies... This might take up to ${ms(Math.ceil((proxies.length * (maxRetries + 1) * 10000) / threads), { long: true })}.`);

	const og_ip = keep_transparent ? null : await getIP();

	let last = +new Date();
	proxies = await new Promise(complete => {
		const checked = [];

		const checkProxy = async (p, ret = 0) => {
			if (!p) return;

			const agent = getAgentFromURI(p, 10000);
			const res = await axios({
				method: 'get',
				url: 'https://discordapp.com/api/v9/experiments',
				httpAgent: agent,
				httpsAgent: agent,
				timeout: 10000,
				validateStatus: null,
			}).catch(err => ({ err }));

			const is_valid = typeof res?.data?.fingerprint === 'string';
			if (is_valid) {
				if (keep_transparent) {
					checked.push(p);
				}
				else {
					const proxy_ip = await getIP(agent);
					if (proxy_ip !== og_ip) checked.push(p);
				}
			}

			if ((!res?.err && !is_valid) || is_valid || ret >= maxRetries) {
				p = proxies.shift();
				ret = 0;
			}
			else { ret++; }

			if (!p) return --threads;

			if (ret == 0) last = +new Date();
			return checkProxy(p, ret);
		};

		const log = () => {
			let eta = (((proxies.length + threads) * (maxRetries + 1) * 10000) / threads) - (+new Date() - last);
			if (!eta || eta < 10000) eta = '< 10 seconds';
			else eta = '~' + ms(eta, { long: true });

			const time = [new Date().getHours(), new Date().getMinutes(), new Date().getSeconds()].map(t => { if (t < 10) { t = '0' + t; } return t; });
			process.stdout.write(`${chalk.magenta(time.join(':'))} ${chalk.greenBright('[INFO]')} » Proxies left: ${proxies.length + threads} | Working: ${checked.length} | Time left: ${eta}      \r`);
			process.title = `Checking proxies... | Proxies left: ${proxies.length + threads} | Working: ${checked.length} | Time left: ${eta}`;
			return;
		};

		for (let i = 0; i < Math.min(threads, proxies.length); i++) {
			checkProxy(proxies.shift(), 0);
		}

		const done = setInterval(() => {
			if (threads <= 0 || new Date() - last > 45 * 1000) {
				clearInterval(done);
				complete(checked);
			}
			else if (!silent) { log(); }
		}, 500);
	});

	validateProxies(proxies);
	return proxies;
};
