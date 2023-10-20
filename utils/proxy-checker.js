const
	chalk = require('chalk'),
	{ validateProxies } = require('./functions'),
	logger = require('./logger'),
	ms = require('ms'),
	needle = require('needle'),
	ProxyAgent = require('proxy-agent');

module.exports = async (proxies, threads, silent = false) => {
	const maxRetries = 2;
	if (threads > proxies.length) threads = proxies.length;
	if (!silent) logger.info(`Checking ${chalk.yellow(proxies.length)} proxies... This might take up to ${ms((proxies.length * maxRetries * 10000) / threads, { long: true })}.`);

	let last = +new Date();
	proxies = await new Promise(complete => {
		const checkProxy = (p, ret = 0) => {
			const agent = new ProxyAgent(p); agent.timeout = 5000;
			needle.get('https://discordapp.com/api/v9/experiments', {
				agent: agent,
				follow: 10,
				response_timeout: 10000,
				read_timeout: 5000,
				rejectUnauthorized: false,
			}, (err, res, body) => {
				if (body?.fingerprint) checked.push(p);

				if (checked.indexOf(p) === -1 && ret < maxRetries) { ret++; }
				else { p = proxies.shift(); ret = 0; }

				if (p) { checkProxy(p, ret); if (!ret) last = +new Date(); }
				else { return threads--; }
			});
		};

		const log = () => {
			if (silent) return;
			let eta = (((proxies.length + threads) * maxRetries * 10000) / threads) - (+new Date() - last);
			if (!eta || eta < 10000) eta = '< 10 seconds';
			else eta = '~' + ms(eta, { long: true });

			const time = [new Date().getHours(), new Date().getMinutes(), new Date().getSeconds()].map(t => { if (t < 10) { t = '0' + t; } return t; });
			process.stdout.write(`${chalk.magenta(time.join(':'))} ${chalk.greenBright('[INFO]')} » Proxies left: ${proxies.length + threads} | Working: ${checked.length} | Time left: ${eta}      \r`);
			process.title = `Checking proxies... | Proxies left: ${proxies.length + threads} | Working: ${checked.length} | Time left: ${eta}`;
			return;
		};

		const checked = [];
		for (let i = 0; i < threads; i++) {
			checkProxy(proxies.shift(), 0);
		}

		const done = setInterval(() => {
			if (threads <= 0) {
				clearInterval(done);
				complete(checked);
			}
			log();
		}, 100);
	});

	validateProxies(proxies);
	return proxies;
};
