const needle = require('needle')
const helpers = require('./helpers')
const async = require('async')
const fs = require('fs')
const path = require('path')
const addonConfig = require('./config')
needle.defaults(helpers.needleDefaults)

let map

try {
	map = JSON.parse(fs.readFileSync(path.join(__dirname, 'db', 'map.json')))
} catch(e) {
	map = { mal: {}, anilist: {}, anidb: {}, }
}

let guessed

try {
	guessed = JSON.parse(fs.readFileSync(path.join(__dirname, 'db', 'guessed.json')))
} catch(e) {
	guessed = { mal: [], anilist: [], anidb: [], }
}

let missing

try {
	missing = JSON.parse(fs.readFileSync(path.join(__dirname, 'db', 'missing.json')))
} catch(e) {
	missing = { mal: [], anilist: [], anidb: [], }
}

let kitsuCache = {}

try {
	kitsuCache = JSON.parse(fs.readFileSync(path.join(__dirname, 'db', 'kitsuCache.json')))
} catch(e) {
	kitsuCache = {}
}

const saveCacheToFile = (cb) => {
	helpers.log('mapping', '--- saving cache to file ---')
	fs.writeFileSync(path.join(__dirname, 'db', 'map.json'), JSON.stringify(map))
	fs.writeFileSync(path.join(__dirname, 'db', 'missing.json'), JSON.stringify(missing))
	fs.writeFileSync(path.join(__dirname, 'db', 'guessed.json'), JSON.stringify(guessed))
	fs.writeFileSync(path.join(__dirname, 'db', 'kitsuCache.json'), JSON.stringify(kitsuCache))
	setTimeout(() => {
		saveCacheToFile()
	}, addonConfig.saveMapInterval)
}

setTimeout(() => {
	saveCacheToFile()
}, addonConfig.saveMapInterval)

const mapper = (query, opts, cb) => {
	const idType = (Object.keys(opts) || [])[0]
	const cachedId = (map[idType] || {})[opts[idType]]
	if (idType && cachedId && kitsuCache[foundId]) {
		helpers.log('mapping', 'served ' + idType + ' ' + opts[idType] + ' from cache')
		const foundId = cachedId
		cb(foundId, kitsuCache[foundId], true, opts[idType])
		return
	}
	helpers.log('mapping', 'Searching for "' + query + '" with options: ' + JSON.stringify(opts))
	const kitsuSearchUrl = 'https://anime-kitsu.strem.fun/catalog/anime/kitsu-anime-list/search=' + encodeURIComponent(query) + '.json'
	helpers.log('link', kitsuSearchUrl)
	needle.get(kitsuSearchUrl, (err, resp, body) => {
		if (((body || {}).metas || []).length) {
			let ids = body.metas.map(el => (el.id || '').replace('kitsu:', '')).filter(el => !!el).slice(0, 5)
			const searchResults = body.metas
			if (!ids) {
				helpers.log('mapping', '--- warning: no search results from kitsu, unable to continue matching')
				missing[idType].push(opts[idType])
				cb(false, false, false, opts[idType])
				return
			}
			const firstId = ids[0]
			const checkYunaMappings = (after) => {
				const yunaType = idType === 'mal' ? 'myanimelist' : idType
				helpers.log('link', 'https://relations.yuna.moe/api/ids?source=' + yunaType + '&id=' + opts[idType])
				needle.get('https://relations.yuna.moe/api/ids?source=' + yunaType + '&id=' + opts[idType], (err, resp, body) => {
					if ((body || {}).kitsu) {
						const foundItem = searchResults.find(el => { return el.id === 'kitsu:' + body.kitsu })
						if (foundItem) {
							// TODO: maybe consider the other IDs from the Yuna API as correct and add them to the map?
							helpers.log('mapping', '--- matched "' + query + '" through Yuna API')
							map[idType][opts[idType]] = body.kitsu
							kitsuCache[body.kitsu] = foundItem
							cb(body.kitsu, kitsuCache[body.kitsu], false, opts[idType])
							return
						}
					}
					after()
				})
			}
			const checkMappings = () => {
				if (ids.length) {
					const id = ids[0]
					ids.shift()
					const kitsuMappingsUrl = 'https://kitsu.io/api/edge/anime/' + id + '?include=mappings'
					helpers.log('link', kitsuMappingsUrl)
					needle.get(kitsuMappingsUrl, (err, resp, body) => {
						if (((body || {}).included || []).length) {
							let foundId = false
							body.included.forEach(el => {
								if (el.type === 'mappings') {
									if ((el.attributes || {}).externalSite && el.attributes.externalId) {
										const saveId = (idType, externalId, kitsuId) => {
											map[idType][externalId] = kitsuId
											if (missing[idType].includes(externalId)) {
												missing[idType].splice(missing[idType].indexOf(externalId), 1)
											}
											if (guessed[idType].includes(externalId)) {
												guessed[idType].splice(guessed[idType].indexOf(externalId), 1)
											}
											if (opts[idType] && opts[idType] + '' === el.attributes.externalId + '') {
												foundId = id
											}
										}
										if (el.attributes.externalSite === 'myanimelist/anime') {
											saveId('mal', el.attributes.externalId, id)
										} else if (el.attributes.externalSite === 'anidb') {
											saveId('anidb', el.attributes.externalId, id)
										} else if (el.attributes.externalSite === 'anilist/anime') {
											saveId('anilist', el.attributes.externalId, id)
										}
									}
								}
							})
							if (!foundId) {
								setTimeout(() => {
									checkMappings()
								}, 250)
							} else {
								kitsuCache[foundId] = searchResults.find(el => { return el.id === 'kitsu:' + foundId })
								cb(foundId, kitsuCache[foundId], false, opts[idType])
							}
						} else {
							helpers.log('mapping', '--- warning: invalid response from ' + kitsuMappingsUrl)
							guessed[idType].push(opts[idType])
							map[idType][opts[idType]] = firstId
							kitsuCache[firstId] = searchResults[0]
							cb(firstId, searchResults[0], false, opts[idType])
						}
					})
				} else {
					let idByExactName = false
					searchResults.some(el => {
						if (el.name === query) {
							idByExactName = parseInt(el.id.replace('kitsu:', ''))
							return true
						}
					})
					if (idByExactName) {
						helpers.log('mapping', '--- matched kitsu id by meta.name for "' + query + '"')
						map[idType][opts[idType]] = idByExactName
						kitsuCache[idByExactName] = searchResults.find(el => { return el.id === 'kitsu:' + idByExactName })
						cb(idByExactName, kitsuCache[idByExactName], false, opts[idType])
						return
					} else {
						let idByAlias = false
						searchResults.some(el => {
							if ((el.aliases || []).includes(query)) {
								idByAlias = parseInt(el.id.replace('kitsu:', ''))
								return true
							}
						})
						if (idByAlias) {
							helpers.log('mapping', '--- matched kitsu id by meta.alias for "' + query + '"')
							map[idType][opts[idType]] = idByAlias
							kitsuCache[idByAlias] = searchResults.find(el => { return el.id === 'kitsu:' + idByAlias })
							cb(idByAlias, kitsuCache[idByAlias], false, opts[idType])
							return
						}
					}
					helpers.log('mapping', '--- warning: guessed id for ' + JSON.stringify(opts))
					guessed[idType].push(opts[idType])
					map[idType][opts[idType]] = firstId
					kitsuCache[firstId] = searchResults[0]
					cb(firstId, searchResults[0], false, opts[idType])
				}
			}
			checkYunaMappings(() => {
				checkMappings()
			})
		} else {
			helpers.log('mapping', '--- warning: invalid response from ' + kitsuSearchUrl)
			missing[idType].push(opts[idType])
			cb(false, false, false, opts[idType])
		}
	})
}

const mapperQueue = async.queue((task, cb) => {
	mapper(task.query, task.opts, (id, meta, quickResponse, initId) => {
		setTimeout(() => {
			cb(false, { id, meta, initId })
		}, quickResponse ? 0 : 1000)
	})
}, 1)

module.exports = {
	mapper: (task, cb) => {
		mapperQueue.push(task, (err, resp) => {
			if (resp.id) {
				helpers.log('mapping', 'successfully matched "' + task.query + '" to ' + resp.id)
			} else {
				helpers.log('mapping', 'FAILED to match "' + task.query + '"')
			}
			cb(resp.id, resp.meta, resp.initId)
		})
	},
	toKitsuId: (opts) => {
		return new Promise((resolve, reject) => {
			const idType = Object.keys(opts)[0]
			const cachedId = (map[idType] || {})[opts[idType]]
			if (cachedId) {
				return resolve({ kitsuId: cachedId, fromCache: true })
			}
			const yunaType = idType === 'mal' ? 'myanimelist' : idType
			helpers.log('link', 'https://relations.yuna.moe/api/ids?source=' + yunaType + '&id=' + opts[idType])
			needle.get('https://relations.yuna.moe/api/ids?source=' + yunaType + '&id=' + opts[idType], (err, resp, body) => {
				if ((body || {}).kitsu) {
					if (map[idType] && !map[idType][opts[idType]])
						map[idType][opts[idType]] = body.kitsu
					return resolve({ kitsuId: body.kitsu })
				}
				const kitsuType = idType === 'mal' ? 'myanimelist/anime' : (idType === 'anilist' ? 'anilist/anime' : idType)
				helpers.log('link', 'https://kitsu.io/api/edge/mappings?filter[externalSite]=' + kitsuType + '&filter[externalId]=' + opts[idType] + '&include=item')
				needle.get('https://kitsu.io/api/edge/mappings?filter[externalSite]=' + kitsuType + '&filter[externalId]=' + opts[idType] + '&include=item', (err, resp, body) => {
					if ((((body || {}).included || [])[0] || {}).id) {
						if (map[idType] && !map[idType][opts[idType]])
							map[idType][opts[idType]] = body.included[0].id
						return resolve({ kitsuId: body.included[0].id })
					}
					resolve({ kitsuId: false })
				})
			})

		})
	},
	map: () => map,
	guessed: () => guessed,
	missing: () => missing,
	kitsuCache: () => kitsuCache,
}
