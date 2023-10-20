const
	chalk = require('chalk'),
	logger = require('./utils/logger'),
	ms = require('ms'),
	needle = require('needle'),
	{ checkToken, checkForUpdates, loadProxies, redeemNitro, sendWebhook } = require('./utils/functions'),
	{ existsSync, readFileSync, watchFile, writeFileSync } = require('fs'),
	ProxyAgent = require('proxy-agent'),
	yaml = require('js-yaml');

const stats = { downloaded_codes: [], threads: 0, startTime: 0, used_codes: [], version: require('./package.json').version, working: 0 };

console.clear();
console.log(chalk.blue(`\u001B[?25l
██╗   ██╗ █████╗ ███╗   ██╗ ██████╗
╚██╗ ██╔╝██╔══██╗████╗  ██║██╔════╝
 ╚████╔╝ ███████║██╔██╗ ██║██║  ███╗
  ╚██╔╝  ██╔══██║██║╚██╗██║██║   ██║
   ██║   ██║  ██║██║ ╚████║╚██████╔╝
   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝
               ${chalk.italic.gray(`v${stats.version} - by Tenclea`)}
`));

let config = yaml.load(readFileSync('./config.yml'));
watchFile('./config.yml', () => {
	config = yaml.load(readFileSync('./config.yml'));

	// Updates logger
	logger.level = config.debug_mode ? 'debug' : 'info';
	logger.info('Updated the config variables.');

	if (config.auto_redeem.enabled) checkToken(config.auto_redeem.token);
	return;
});

/* Load proxies, working proxies and removes duplicates */
const http_proxies = loadProxies('./required/http-proxies.txt', 'http');
const socks_proxies = loadProxies('./required/socks-proxies.txt', 'socks');
const oldWorking = loadProxies('./working_proxies.txt');

let proxies = [...new Set(http_proxies.concat(socks_proxies, oldWorking))];

process.on('uncaughtException', () => { });
process.on('unhandledRejection', (e) => { console.error(e); stats.threads > 0 ? stats.threads-- : 0; });
process.on('SIGINT', () => { process.exit(0); });
process.on('exit', () => { logger.info('Closing YANG... If you liked this project, make sure to leave it a star on github: https://github.com/Tenclea/ReYANG ! <3'); checkForUpdates(); });

(async () => {
	checkForUpdates();
	if (config.proxies.enable_scrapper) {
		logger.info('Downloading fresh proxies...');

		let downloaded = await require('./utils/proxy-scrapper')();
		downloaded = downloaded.slice(0, +config.proxies.max_proxies_download || downloaded.length);
		proxies = [...new Set(proxies.concat(downloaded))];

		logger.info(`Downloaded ${chalk.yellow(downloaded.length)} proxies.`);
	}
	if (!proxies[0]) { logger.error('Could not find any valid proxies. Please make sure to add some in the \'required\' folder.'); process.exit(1); }

	if (config.proxies.enable_checker) proxies = await require('./utils/proxy-checker')(proxies, config.threads);
	if (!proxies[0]) { logger.error('All of your proxies were filtered out by the proxy checker. Please add some fresh ones in the \'required\' folder.'); process.exit(1); }

	logger.info(`Loaded ${chalk.yellow(proxies.length)} proxies.`);

	const generateCode = () => {
		const code_length = { 'short': 16, 'long': 24, 'both': Math.random() > 0.5 ? 16 : 24 }[config.code_length] || 16;
		const code = Array.apply(0, Array(code_length)).map(() => {
			return ((charset) => {
				return charset.charAt(Math.floor(Math.random() * charset.length));
			})('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
		}).join('');
		return !stats.used_codes.includes(code) || stats.downloaded_codes.indexOf(code) == -1 ? code : generateCode();
	};

	const checkCode = async (code, proxy, retries = 0) => {
		logStats();
		if (!proxy) { stats.threads > 0 ? stats.threads-- : 0; return; }

		const agent = new ProxyAgent(proxy); agent.timeout = 5000;
		needle.get(
			`https://discord.com/api/v9/entitlements/gift-codes/${code}?with_application=false&with_subscription_plan=true`,
			{
				agent: agent,
				follow: 10,
				response_timeout: 10000,
				read_timeout: 10000,
				rejectUnauthorized: false,
			},
			(err, res, body) => {
				if (!body?.message && !body?.subscription_plan) {
					let timeout = 0;
					if (retries < 100) {
						retries++; timeout = 2500;
						logger.debug(`Connection to ${chalk.grey(proxy)} failed : ${chalk.red(res?.statusCode || err.message || 'INVALID RESPONSE')}.`);
					}
					else {
						// proxies.push(proxy); // don't remove proxy
						logger.debug(`Removed ${chalk.gray(proxy)} : ${chalk.red(res?.statusCode || err.message || 'INVALID RESPONSE')}`);
						proxy = proxies.shift();
					}

					logStats();
					return setTimeout(() => { checkCode(generateCode(), proxy, retries); }, timeout);
				}

				retries = 0; let p = proxy;
				stats.used_codes.push(code);
				if (!working_proxies.includes(proxy)) working_proxies.push(proxy);

				if (body.subscription_plan) {
					logger.info(`Found a valid gift code : https://discord.gift/${code} !`);

					// Try to redeem the code if possible
					redeemNitro(code, config);

					if (config.webhook.enabled && config.webhook.notifications.valid_code) {
						sendWebhook(config.webhook.url, `@everyone Found a \`${body.subscription_plan.name}\` gift code in \`${ms(+new Date() - stats.startTime, { long: true })}\` : https://discord.gift/${code}.`);
					}

					// Write working code to file
					let codes = existsSync('./valid_codes.txt') ? readFileSync('./valid_codes.txt', 'utf-8') : '';
					codes += `${new Date().toLocaleString()}: ${body?.subscription_plan || '???'} - https://discord.gift/${code}\n`;
					writeFileSync('./valid_codes.txt', codes, 'utf-8');

					stats.working++;
				}
				else if (res.statusCode == 429) {
					// timeouts equal to 600000 are frozen. Most likely a ban from Discord's side.
					const timeout = body.retry_after;
					if (timeout != 600000) {
						proxies.push(proxy);
						logger.warn(`${chalk.gray(proxy)} is being rate limited (${(timeout).toFixed(2)}s), ${proxies[0] === proxy ? 'waiting' : 'skipping proxy'}...`);
					}
					else {
						logger.warn(`${chalk.gray(proxy)} was most likely banned by Discord. Removing proxy...`);
					}
					p = proxies.shift();
				}
				else if (body.message === 'Unknown Gift Code') {
					logger.warn(`${code} was an invalid gift code.`);
				}
				else { console.log(body?.message + ' - please report this on GitHub.'); }
				logStats();
				return setTimeout(() => { checkCode(generateCode(), p); }, p === proxy ? (body.retry_after * 1000 || 1000) : 0);
			});
	};

	const logStats = () => {
		// Update title and write stats to stdout
		const attempts = stats.used_codes.length;
		const aps = attempts / ((+new Date() - stats.startTime) / 1000) * 60 || 0;
		process.stdout.write(`Proxies: ${chalk.yellow(proxies.length + stats.threads)} | Attempts: ${chalk.yellow(attempts)} (~${chalk.gray(aps.toFixed(0))}/min) | Working Codes: ${chalk.green(stats.working)}  \r`);
		process.title = `YANG - by Tenclea | Proxies: ${proxies.length + stats.threads} | Attempts: ${attempts} (~${aps.toFixed(0)}/min) | Working Codes: ${stats.working}`;
		return;
	};

	const threads = config.threads > proxies.length ? proxies.length : config.threads;
	logger.info(`Checking for codes using ${chalk.yellow(threads)} threads.`);

	const working_proxies = [];
	stats.startTime = +new Date();
	if (config.webhook.enabled && config.webhook.notifications.boot) sendWebhook(config.webhook.url, 'Started **YANG**.');

	const startThreads = (t) => {
		for (let i = 0; i < t; i++) {
			checkCode(generateCode(), proxies.shift());
			stats.threads++;
			continue;
		}

		logger.debug(`Successfully started ${chalk.yellow(t)} threads.`);
	};

	startThreads(threads);

	setInterval(async () => {
		// Close / restart program if all proxies used
		if (stats.threads === 0) {
			logger.info('Restarting using working_proxies.txt list.');
			proxies = loadProxies('./working_proxies.txt');
			if (!proxies[0]) {
				logger.error('Ran out of proxies.');
				if (config.webhook.enabled) await sendWebhook(config.webhook.url, 'Ran out of proxies.');
				return process.exit(0);
			}
			config.proxies.save_working = false;
			return startThreads(config.threads > proxies.length ? proxies.length : config.threads);
		}

		/* Save working proxies */
		if (config.proxies.save_working) { writeFileSync('./working_proxies.txt', working_proxies.sort(p => p.indexOf('socks')).join('\n')); }
	}, 10_000);

	let addingProxies = false;
	setInterval(async () => {
		checkForUpdates(true);
		if (addingProxies || !config.proxies.enable_scrapper) return;
		addingProxies = true;

		logger.info('Downloading updated proxies.');

		const new_http_proxies = loadProxies('./required/http-proxies.txt', 'http');
		const new_socks_proxies = loadProxies('./required/socks-proxies.txt', 'socks');
		const newProxies = [...new Set(new_http_proxies.concat(new_socks_proxies, await require('./utils/proxy-scrapper')()))];

		const checked = await require('./utils/proxy-checker')(newProxies, config.threads, true);

		proxies = proxies.concat(checked);

		logger.info(`Added ${checked.length} proxies.`);
		startThreads(config.threads - stats.threads);
		addingProxies = false;
	}, 60 * 60 * 1000);

	// Webhook status update
	if (+config.webhook.notifications.status_update_interval != 0) {
		setInterval(async () => {
			const attempts = stats.used_codes.length;
			const aps = attempts / ((+new Date() - stats.startTime) / 1000) * 60 || 0;
			sendWebhook(config.webhook.url, `Proxies: \`${proxies.length + stats.threads}\` | Attempts: \`${attempts}\` (~\`${aps.toFixed(1)}\`/min) | Working Codes: \`${stats.working}\``);
			return;
		}, config.webhook.notifications.status_update_interval * 1000);
	}
})();
