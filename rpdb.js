const needle = require('needle')
const helpers = require('./helpers')
const fs = require('fs')
const path = require('path')
const addonConfig = require('./config')
needle.defaults(helpers.needleDefaults)

let toImdb = {}

try {
    toImdb = JSON.parse(fs.readFileSync(path.join(__dirname, 'db', 'to_imdb.json')))
} catch(e) {
    toImdb = {}
}

// second source for conversion
const toImdb2 = {}

const isObject = obj => { return typeof obj === 'object' && !Array.isArray(obj) }

const populate = () => {
	needle.get('https://raw.githubusercontent.com/TheBeastLT/stremio-kitsu-anime/master/static/data/imdb_mapping.json', (err, resp, body) => {
        if (typeof body === 'string') {
            try {
                body = JSON.parse(body)
            } catch(e) {}
        }
		if (!err && body && isObject(body) && Object.keys(body).length) {
			toImdb = body
			fs.writeFileSync(path.join(__dirname, 'db', 'to_imdb.json'), JSON.stringify(toImdb))
		}
	})
	setTimeout(() => {
		populate()
	}, addonConfig.listUpdateInterval)
}

if (addonConfig.scanOnStart)
    populate()

const kitsuToImdb = (kitsuId) => {
	if (!kitsuId) return false
	return toImdb2[kitsuId] || (toImdb[kitsuId] || {}).imdb_id || false
}

module.exports = {
	convert: (meta, rpdbKey, kitsuPoster, kitsuEng) => {
		const kitsuId = (meta.id || '').replace('kitsu:', '')
		const imdbId = kitsuToImdb(kitsuId)
		// clone object first
		const newMeta = JSON.parse(JSON.stringify(meta))
		if (imdbId && rpdbKey)
			newMeta.poster = 'https://api.ratingposterdb.com/' + rpdbKey + '/imdb/poster-default/' + imdbId + '.jpg?fallback=true'
		else if (kitsuPoster)
			newMeta.poster = kitsuPoster
		if (kitsuEng)
			newMeta.name = kitsuEng
		return newMeta
		return meta
	},
	setKitsuToImdbId: (kitsuId, imdbId) => {
		toImdb2[kitsuId] = imdbId
	},
}