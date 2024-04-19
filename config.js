module.exports = {
	verbose: false, // for debugging
	scanOnStart: true,
	listUpdateInterval: 12 * 60 * 60 * 1000, // 12h
	saveMapInterval: 3 * 60 * 60 * 1000, // 3h
	cacheMaxAge: 6 * 60 * 60, // 6h
	staleRevalidate: 12 * 60 * 60, // 12h
	staleError: 24 * 60 * 60, // 24h
	malCooldown: 2 * 1000, // 2s
	anidbCooldown: 2 * 1000, // 2s
	anilistCooldown: 4 * 1000, // 4s
	kitsuCooldown: 2 * 1000, // 2s
}