module.exports = {
	verbose: true, // for debugging
	scanOnStart: true,
	listUpdateInterval: 12 * 60 * 60 * 1000, // 12h
	saveMapInterval: 3 * 60 * 60 * 1000, // 3h
	cacheMaxAge: 6 * 60 * 60, // 6h
	staleRevalidate: 12 * 60 * 60, // 12h
	staleError: 24 * 60 * 60, // 24h
	malCooldown: 2 * 1000, // 2s
	anidbCooldown: 2 * 1000, // 2s
	anilistCooldown: 8 * 1000, // 3s
	kitsuCooldown: 2 * 1000, // 2s
}