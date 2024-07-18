const
	{ default: axios } = require('axios'),
	logger = require('./logger'),
	{ shuffleArray } = require('./functions');

module.exports = async () => {
	const proxySites = {
		http: [
			'https://api.proxyscrape.com/?request=displayproxies&status=alive&proxytype=http',
			'https://api.proxyscrape.com/?request=displayproxies&status=alive&proxytype=https',
			'https://openproxylist.xyz/http.txt',
			'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
			'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
			'https://raw.githubusercontent.com/proxiesmaster/Free-Proxy-List/main/proxies.txt',
			'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/https.txt',
			'https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/http_proxies.txt',
		],
		socks4: [
			'https://api.proxyscrape.com/?request=displayproxies&status=alive&proxytype=socks4',
			'https://openproxylist.xyz/socks4.txt',
			'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks4.txt',
			'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt',
			'https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/socks4_proxies.txt',
		],
		socks5: [
			'https://api.proxyscrape.com/?request=displayproxies&status=alive&proxytype=socks5',
			'https://openproxylist.xyz/socks5.txt',
			'https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt',
			'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks5.txt',
			'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt',
			'https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/socks5_proxies.txt',
		],
	};

	const types = Object.keys(proxySites);
	const scrapped = types.map(async t => {
		const r = proxySites[t].map(async url => {
			const res = await axios(url, { timeout: 10000, validateStatus: null })
				.catch(e => logger.error(`Could not scrape proxies from ${url} : ${e}`));

			if (!res.data || typeof res.data !== 'string') return [];
			return res.data.split(/\r|\n|<br>/)
				.filter(p => p !== '')
				.map(p => t + '://' + p);
		});
		return await Promise.all(r).catch(e => logger.error(e));
	});

	const proxies = await Promise.all(scrapped)
		.then(values => values.reduce((a, b) => a.concat(b.reduce((c, d) => c.concat(d), [])), []))
		.catch(e => logger.error(e));

	return shuffleArray([...new Set(proxies)]);
};
