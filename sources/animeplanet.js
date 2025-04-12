// this one does not work because of cf protection

const needle = require('needle')
const async = require('async')
const cheerio = require('cheerio')
const helpers = require('../helpers')
const mapping = require('../mapping')
const fs = require('fs')
const path = require('path')
const addonConfig = require('../config')
needle.defaults(helpers.needleDefaults)
const isDubbed = require('./dubbed')

const config = {
//	linkPattern: 'https:\\/\\/www\\.anime-planet\\.com\\/anime\\/(.*)',
	linkPattern: '\\/anime\\/(.*)',
    skipSize: 1,
    maxSkip: 300,
    lists: {
        'Top All Time': 'https://www.anime-planet.com/anime/all?page={skip}', // max: 696
        'Top This Week': 'https://www.anime-planet.com/anime/top-anime/week', // max: 1
        'Top Today': 'https://www.anime-planet.com/anime/top-anime/today', // max: 1
    }
}

const maxSkip = {
    'Top This Week': 1,
    'Top Today': 1,
}

const pageSize = 100

const staticLists = {}

Object.keys(config.lists).forEach(key => {
	try {
		staticLists[helpers.serialize(key)] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'db', 'animeplanet_' + helpers.serialize(key) + '.json')))
	} catch(e) {
		staticLists[helpers.serialize(key)] = []
	}
})

module.exports = {
	name: 'Anime-Planet',
	catalogs: Object.keys(config.lists),
	handle: (listKey, skip, genre, onlyDubs) => {
		const fullList = staticLists[listKey] || []
		let filteredList = fullList
		if (genre) {
			filteredList = filteredList.filter(el => (el.genres || []).includes(genre))
		}
        if (onlyDubs) {
            filteredList = filteredList.filter(el => isDubbed(parseInt((el.id || '').replace('kitsu:',''))))
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
        fs.writeFileSync(path.join(__dirname, '..', 'db', 'animeplanet_' + task.key + '.json'), JSON.stringify(staticLists[task.key]))
		setTimeout(() => { cb() }, addonConfig.malCooldown)
        const allLists = Object.keys(config.lists)
        const lastListKey = helpers.serialize(allLists[allLists.length -1])
        if (task.key === lastListKey)
            helpers.log('animeplanet', '---> Finished all lists for animeplanet')
    }
	const pageGet = (url, skip) => {
		const pageUrl = url.replace('{skip}', skip + '')
		helpers.log('animeplanet', 'getting page url: ' + pageUrl)
		needle.get(pageUrl, (err, resp, body) => {
			if (!err && body) {
				const $ = cheerio.load(body)
				let lastAnimePlanetId = 0
				console.log(body)
				process.exit()
				if ($("#siteContainer ul.cardDeck.cardGrid li.card > a").length) {
					// grid type
					$("#siteContainer ul.cardDeck.cardGrid li.card > a").each((ij, el) => {
						const href = $(el)
						const title = href.find("h3.cardName").text().trim()
						const titleUrl = href.attr('href')
						const pattern = new RegExp(config.linkPattern, 'gi')
						const matches = pattern.exec(titleUrl)
						if ((matches || []).length) {
							const animePlanetId = matches[1]
							lastAnimePlanetId = animePlanetId
							mapping.mapper({ query: title, opts: { animeplanet: animePlanetId } }, (kitsuId, kitsuMeta, animePlanetId) => {
								if (kitsuId && kitsuMeta) {
									tempList.push(kitsuMeta);
								}
								if (animePlanetId === lastAnimePlanetId) {
									// finished page
									helpers.log('animeplanet', '---')
									helpers.log('animeplanet', 'finished page')
									if (skip < (task.maxSkip || config.maxSkip) && url.includes('{skip}')) {
										setTimeout(() => {
											pageGet(task.url, skip + config.skipSize)
										}, addonConfig.malCooldown)
									} else {
										// finished list
										helpers.log('animeplanet', '---')
										helpers.log('animeplanet', '---')
										helpers.log('animeplanet', 'finished list by reaching max skip allowed (or list does not support skip): ' + (task.maxSkip || config.maxSkip))
										finishedList()
									}
								}
							})
						}
					})
				} else if ($("#siteContainer section.pure-g table.pure-table tr td.tableTitle > a").length) {
					// list type
					$("#siteContainer section.pure-g table.pure-table tr td.tableTitle > a").each((ij, el) => {
						const href = $(el)
						const title = href.text().trim()
						const titleUrl = href.attr('href')
						const pattern = new RegExp(config.linkPattern, 'gi')
						const matches = pattern.exec(titleUrl)
						if ((matches || []).length) {
							const animePlanetId = matches[1]
							lastAnimePlanetId = animePlanetId
							mapping.mapper({ query: title, opts: { animeplanet: animePlanetId } }, (kitsuId, kitsuMeta, animePlanetId) => {
								if (kitsuId && kitsuMeta) {
									tempList.push(kitsuMeta);
								}
								if (animePlanetId === lastAnimePlanetId) {
									// finished page
									helpers.log('animeplanet', '---')
									helpers.log('animeplanet', 'finished page')
									if (skip < (task.maxSkip || config.maxSkip) && url.includes('{skip}')) {
										setTimeout(() => {
											pageGet(task.url, skip + config.skipSize)
										}, addonConfig.animeplanetCooldown)
									} else {
										// finished list
										helpers.log('animeplanet', '---')
										helpers.log('animeplanet', '---')
										helpers.log('animeplanet', 'finished list by reaching max skip allowed (or list does not support skip): ' + (task.maxSkip || config.maxSkip))
										finishedList()
									}
								}
							})
						}
					})
				} else {
					// no items on page, presume pagination ended
					helpers.log('animeplanet', '---')
					helpers.log('animeplanet', '---')
					helpers.log('animeplanet', 'no items on page, presume pagination ended')
					finishedList()
				}
			} else {
				helpers.log('animeplanet', '---')
				helpers.log('animeplanet', '---')
				console.log('err or empty body in animeplanet')
				console.log(err)
				helpers.log('animeplanet', 'warning: could not get page: ' + pageUrl)
				helpers.log('animeplanet', 'waiting 2s and skipping current list')
				finishedList()
			}
		})
	}
	const firstSkip = 1
	pageGet(task.url, firstSkip)
}, 1)

const populate = () => {
	Object.keys(config.lists).forEach(key => {
		const url = config.lists[key]
		populateQueue.push({ key: helpers.serialize(key), url, maxSkip: maxSkip[key] })
	})
	setTimeout(() => {
		populate()
	}, addonConfig.listUpdateInterval)
}

if (addonConfig.scanOnStart) {
	setTimeout(() => {
		populate()
	}, 20 * 1000) // wait 20s for the id lists to update
} else {
	setTimeout(() => {
		populate()
	}, addonConfig.listUpdateInterval)
}
