const logger = require('./logger'),
	needle = require('needle');

module.exports = async () => {
	const proxySites = {
		http: [
			'https://api.proxyscrape.com/?request=displayproxies&status=alive&proxytype=http',
			'https://api.proxyscrape.com/?request=displayproxies&status=alive&proxytype=https',
			'https://openproxylist.xyz/http.txt',
			'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
			'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/https.txt',
			'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
			'https://raw.githubusercontent.com/chipsed/proxies/main/proxies.txt',
			'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt',
			'https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt',
			'https://raw.githubusercontent.com/proxiesmaster/Free-Proxy-List/main/proxies.txt',
			'https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.txt',
			'https://www.proxyscan.io/download?type=http',
			'https://www.proxyscan.io/download?type=https',
		],
		socks: [
			'https://api.proxyscrape.com/?request=displayproxies&status=alive&proxytype=socks4',
			'https://api.proxyscrape.com/?request=displayproxies&status=alive&proxytype=socks5',
			'https://openproxylist.xyz/socks4.txt',
			'https://openproxylist.xyz/socks5.txt',
			'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks4.txt',
			'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks5.txt',
			'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt',
			'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt',
			'https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.txt',
			'https://www.proxyscan.io/download?type=socks4',
			'https://www.proxyscan.io/download?type=socks5',
		],
	};

	const types = Object.keys(proxySites);
	const scrapped = types.map(async t => {
		const r = proxySites[t].map(async s => {
			const res = await needle('get', s, { response_timeout: 10000, follow_max: 5, rejectUnauthorized: false })
				.catch(e => logger.error(`Could not scrape proxies from ${s} : ${e}`));

			if (!res.body || typeof res.body !== 'string') return [];
			return res.body.split(/\r|\n|<br>/)
				.filter(p => p !== '')
				.map(p => t + '://' + p);
		});
		return await Promise.all(r).catch(e => logger.error(e));
	});

	const proxies = await Promise.all(scrapped)
		.then(values => values.reduce((a, b) => a.concat(b.reduce((c, d) => c.concat(d), [])), []))
		.catch(e => logger.error(e));

	return [...new Set(proxies)];
};
