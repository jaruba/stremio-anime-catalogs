module.exports = {
	verbose: false, // for debugging
	ignoreMappingLogs: true,
	ignoreDubbedLogs: true,
	scanOnStart: false,
	listUpdateInterval: 12 * 60 * 60 * 1000, // 12h
	saveMapInterval: 3 * 60 * 60 * 1000, // 3h
	cacheMaxAge: 6 * 60 * 60, // 6h
	staleRevalidate: 12 * 60 * 60, // 12h
	staleError: 24 * 60 * 60, // 24h
	malCooldown: 2 * 1000, // 2s
	anidbCooldown: 2 * 1000, // 2s
	anilistCooldown: 15 * 1000, // 15s
	kitsuCooldown: 2 * 1000, // 2s
	aniseachCooldown: 5 * 1000, // 5s
	animeplanetCooldown: 5 * 1000, // 5s
	livechartCooldown: 5 * 1000, // 5s
	kitsuPosterCooldown: 7.3 * 24 * 60 * 60 * 1000, // 7.3 days
	updateMappingsFromSource: 6 * 60 * 60 * 1000, // 6h
}
