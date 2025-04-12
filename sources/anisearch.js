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
//	linkPattern: 'https:\\/\\/www\\.anisearch\\.com\\/anime\\/([0-9]+)\\,(.*)',
	linkPattern: 'anime\\/([0-9]+)\\,(.*)',
    skipSize: 1,
    maxSkip: 300,
    lists: {
        'Top All Time': 'https://www.anisearch.com/anime/toplist/page-{skip}', // max: 326
        'Trending': 'https://www.anisearch.com/anime/trending/page-{skip}', // max: 3
        'Popular': 'https://www.anisearch.com/anime/popular/page-{skip}', // max: 3
    }
}

// anisearch needs more flexible page limits
const maxSkip = {
    'Trending': 3,
    'Popular': 3,
}

const pageSize = 100

const staticLists = {}

Object.keys(config.lists).forEach(key => {
	try {
		staticLists[helpers.serialize(key)] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'db', 'anisearch_' + helpers.serialize(key) + '.json')))
	} catch(e) {
		staticLists[helpers.serialize(key)] = []
	}
})

module.exports = {
	name: 'aniSearch',
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
        fs.writeFileSync(path.join(__dirname, '..', 'db', 'anisearch_' + task.key + '.json'), JSON.stringify(staticLists[task.key]))
		setTimeout(() => { cb() }, addonConfig.malCooldown)
        const allLists = Object.keys(config.lists)
        const lastListKey = helpers.serialize(allLists[allLists.length -1])
        if (task.key === lastListKey)
            helpers.log('anisearch', '---> Finished all lists for anisearch')
    }
	const pageGet = (url, skip) => {
		const pageUrl = url.replace('{skip}', skip + '')
		helpers.log('anisearch', 'getting page url: ' + pageUrl)
		needle.get(pageUrl, (err, resp, body) => {
			if (!err && body) {
				const $ = cheerio.load(body)
				let lastAnisearchId = 0
				if ($("#content-outer #content-inner .covers.fullsizeA .btype0 > a").length) {
					$("#content-outer #content-inner .covers.fullsizeA .btype0 > a").each((ij,el) => {
						const href = $(el)
						const title = href.find(".details").find(".title").text().trim()
						const titleUrl = href.attr('href')
						const pattern = new RegExp(config.linkPattern, 'gi')
						const matches = pattern.exec(titleUrl)
						if ((matches || []).length) {
							const anisearchId = matches[1]
							lastAnisearchId = anisearchId
							mapping.mapper({ query: title, opts: { anisearch: anisearchId } }, (kitsuId, kitsuMeta, anisearchId) => {
								if (kitsuId && kitsuMeta) {
									tempList.push(kitsuMeta);
								}
								if (anisearchId === lastAnisearchId) {
									// finished page
									helpers.log('anisearch', '---')
									helpers.log('anisearch', 'finished page')
									if (skip < (task.maxSkip || config.maxSkip) && url.includes('{skip}')) {
										setTimeout(() => {
											pageGet(task.url, skip + config.skipSize)
										}, addonConfig.aniseachCooldown)
									} else {
										// finished list
										helpers.log('anisearch', '---')
										helpers.log('anisearch', '---')
										helpers.log('anisearch', 'finished list by reaching max skip allowed (or list does not support skip): ' + (task.maxSkip || config.maxSkip))
										finishedList()
									}
								}
							})
						}
					})
				} else {
					// no items on page, presume pagination ended
					helpers.log('anisearch', '---')
					helpers.log('anisearch', '---')
					helpers.log('anisearch', 'no items on page, presume pagination ended')
					finishedList()
				}
			} else {
				helpers.log('anisearch', '---')
				helpers.log('anisearch', '---')
				console.log('err or empty body in anisearch')
				console.log(err)
				helpers.log('anisearch', 'warning: could not get page: ' + pageUrl)
				helpers.log('anisearch', 'waiting 2s and skipping current list')
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
