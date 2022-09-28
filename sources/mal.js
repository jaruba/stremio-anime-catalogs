const needle = require('needle')
const async = require('async')
const cheerio = require('cheerio')
const helpers = require('../helpers')
const mapping = require('../mapping')
const fs = require('fs')
const path = require('path')
const addonConfig = require('../config')
needle.defaults(helpers.needleDefaults)

const config = {
    linkPattern: 'https:\\/\\/myanimelist\\.net\\/anime\\/([0-9]+)\\/(.*)',
    skipSize: 50,
    maxSkip: 1800,
    lists: {
        'Top All Time': 'https://myanimelist.net/topanime.php?limit={skip}',
        'Top Airing': 'https://myanimelist.net/topanime.php?type=airing&limit={skip}',
        'Top Series': 'https://myanimelist.net/topanime.php?type=tv&limit={skip}',
        'Top Movies': 'https://myanimelist.net/topanime.php?type=movie&limit={skip}',
        'Popular': 'https://myanimelist.net/topanime.php?type=bypopularity&limit={skip}',
        'Most Favorited': 'https://myanimelist.net/topanime.php?type=favorite&limit={skip}',
    }
}

const pageSize = 100

const staticLists = {}

Object.keys(config.lists).forEach(key => {
	try {
		staticLists[helpers.serialize(key)] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'mal_' + helpers.serialize(key) + '.json')))
	} catch(e) {
		staticLists[helpers.serialize(key)] = []
	}
})

module.exports = {
	name: 'MyAnimeList',
	catalogs: Object.keys(config.lists),
	handle: (listKey, skip, genre) => {
		const fullList = staticLists[listKey] || []
		let filteredList = fullList
		if (genre) {
			filteredList = filteredList.filter(el => (el.genres || []).includes(genre))
		}
		if (skip) {
			filteredList = filteredList.slice(skip, skip + pageSize)
		} else {
			filteredList = filteredList.slice(0, pageSize)
		}
		return { metas: filteredList }
	}
}

const populateQueue = async.queue((task, cb) => {
	const tempList = []
    const finishedList = () => {
		staticLists[task.key] = tempList
        fs.writeFileSync(path.join(__dirname, '..', 'public', 'mal_' + task.key + '.json'), JSON.stringify(staticLists[task.key]))
		setTimeout(() => { cb() }, addonConfig.malCooldown)
        const allLists = Object.keys(config.lists)
        const lastListKey = helpers.serialize(allLists[allLists.length -1])
        if (task.key === lastListKey)
            helpers.log('mal', '---> Finished all lists for mal')
    }
	const pageGet = (url, skip) => {
		const pageUrl = url.replace('{skip}', skip + '')
		helpers.log('mal', 'getting page url: ' + pageUrl)
		needle.get(pageUrl, (err, resp, body) => {
			if (!err && body) {
				const $ = cheerio.load(body)
				let lastMalId = 0
				if ($('div.detail').length) {
					$('div.detail').each((ij, el) => {
						const href = $(el).find('a')
						const title = href.text().split('\n')[0].trim()
						const titleUrl = href.attr('href')
						const details = $(el).find('.information.di-ib.mt4')
						if (details.length && details.text().includes('Music')) {
							// skip "music" type
							helpers.log('mal', '--- detected "music" type, skipping item "' + title + '"')
							return
						}
						const pattern = new RegExp(config.linkPattern, 'gi')
						const matches = pattern.exec(titleUrl)
						if ((matches || []).length) {
							const malId = matches[1]
							lastMalId = malId
							mapping.mapper({ query: title, opts: { mal: malId } }, (kitsuId, kitsuMeta, malId) => {
								if (kitsuId && kitsuMeta) {
									tempList.push(kitsuMeta);
								}
								if (malId === lastMalId) {
									// finished page
									helpers.log('mal', '---')
									helpers.log('mal', 'finished page')
									if (skip < config.maxSkip && url.includes('{skip}')) {
										setTimeout(() => {
											pageGet(task.url, skip + config.skipSize)
										}, addonConfig.malCooldown)
									} else {
										// finished list
										helpers.log('mal', '---')
										helpers.log('mal', '---')
										helpers.log('mal', 'finished list by reaching max skip allowed (or list does not support skip): ' + config.maxSkip)
										finishedList()
									}
								}
							})
						}
					})
				} else {
					// no items on page, presume pagination ended
					helpers.log('mal', '---')
					helpers.log('mal', '---')
					helpers.log('mal', 'no items on page, presume pagination ended')
					finishedList()
				}
			} else {
				helpers.log('mal', '---')
				helpers.log('mal', '---')
				console.log(err)
				helpers.log('mal', 'warning: could not get page: ' + pageUrl)
				helpers.log('mal', 'waiting 2s and skipping current list')
				finishedList()
			}
		})
	}
	const firstSkip = 0
	pageGet(task.url, firstSkip)
}, 1)

const populate = () => {
	Object.keys(config.lists).forEach(key => {
		const url = config.lists[key]
		populateQueue.push({ key: helpers.serialize(key), url })
	})
	setTimeout(() => {
		populate()
	}, addonConfig.listUpdateInterval)
}

populate()
