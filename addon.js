const express = require('express')
const cors = require('cors')
const qs = require('querystring')
const addon = express()
const path = require('path')
const addonConfig = require('./config')
const rpdb = require('./rpdb')

const helpers = require('./helpers')

addon.use(cors())

addon.use(express.static('public'))

addon.use(express.static('db'))

const services = {
    myanimelist: require('./sources/mal'),
    anidb: require('./sources/anidb'),
    anilist: require('./sources/anilist'),
    kitsu: require('./sources/kitsu'),
    anisearch: require('./sources/anisearch'),
//    animeplanet: require('./sources/animeplanet'),
    livechart: require('./sources/livechart'),
    notifymoe: require('./sources/notifymoe'),
}

const userOptions = Object.keys(services).map(key => {
    return {
        name: services[key].name,
        catalogs: services[key].catalogs,
        key,
    }
})

const catalogs = []

const genres = ['Action','Adventure','Comedy','Drama','Sci-Fi','Space','Mystery','Magic','Supernatural','Police','Fantasy','Sports','Romance','Cars','Slice of Life','Racing','Horror','Psychological','Thriller','Martial Arts','Super Power','School','Ecchi','Vampire','Historical','Military','Dementia','Mecha','Demons','Samurai','Harem','Music','Parody','Shoujo Ai','Game','Shounen Ai','Kids','Hentai','Yuri','Yaoi','Anime Influenced','Gender Bender','Doujinshi','Mahou Shoujo','Mahou Shounen','Gore','Law','Cooking','Mature','Medical','Political','Tokusatsu','Youth','Workplace','Crime','Zombies','Documentary','Family','Food','Friendship','Tragedy']

userOptions.forEach(el => {
    if ((el.catalogs || []).length) {
        el.catalogs.forEach(catalog => {
            catalogs.push({
                id: el.key + '_' + helpers.serialize(catalog),
                type: 'anime',
                name: catalog + ' ' + services[el.key].name,
                extra:[
                    {
                        name: 'genre',
                        options: genres,
                    },
                    {
                        name:'skip',
                    }
                ],
            })
        })
    }
})

const manifest = { 
    id: 'org.stremio.animecatalogs',
    version: '1.0.3',

    name: 'Anime Catalogs',
    description: 'Stremio catalogs for anime from: ' + userOptions.map(el => el.name).join(', ') + '. Also supports filtering by dubbed and optional setting to use Rating Posters from RPDB.',
    background: 'https://1fe84bc728af-stremio-anime-catalogs.baby-beamup.club/addon-background.jpg',
    logo: 'https://1fe84bc728af-stremio-anime-catalogs.baby-beamup.club/addon-logo.png',

    resources: [ 'catalog', 'meta' ],

    types: [ 'anime', 'movie', 'series' ],

    catalogs: [],

    idPrefixes: [ 'kitsu:' ],

    behaviorHints: {
        configurable: true,
        configurationRequired: true
    },

};

addon.get('/manifest.json', function (req, res) {
    res.send(manifest)
})

addon.get('/:catalogChoices/manifest.json', function (req, res) {
    let catalogChoices
    if (req.params.catalogChoices) {
        try {
            catalogChoices = JSON.parse(req.params.catalogChoices)
        } catch(e) {
            catalogChoices = {}
        }
    }
    const manifestClone = JSON.parse(JSON.stringify(manifest))
    Object.keys(catalogChoices).forEach(key => {
        if (key === 'dubbed') return
        const catalogChoice = catalogChoices[key]
        if (catalogChoice == 'on') {
            const catalog = catalogs.find(el => {
                return el.id === key
            })
            if (catalog) {
                manifestClone.catalogs.push(Object.assign({}, catalog))
            }
        }
    })
    if (catalogChoices['dubbed']) {
        manifestClone.name = 'Dubbed ' + manifestClone.name
        manifestClone.catalogs = manifestClone.catalogs.map(el => {
            el.name = 'Dubbed ' + el.name
            return el
        })
    }
    if (catalogChoices['search']) {
        manifestClone.catalogs.push({
            id: 'anime-catalogs-search',
            name: 'Search',
            type: 'anime',
            extra: [
                {
                    name: 'search',
                    isRequired: true,
                }
            ]
        })
    }
    if ((manifestClone.behaviorHints || {}).configurationRequired)
        delete manifestClone.behaviorHints.configurationRequired
    if ((manifestClone.behaviorHints || {}).configurable)
        delete manifestClone.behaviorHints.configurable
    res.send(manifestClone)
})

addon.get('/configure', (req, res) => {
    res.sendFile(path.join(__dirname, 'configure.html'))
})

addon.get('/:catalogChoices/catalog/:type/:id/:extra?.json', (req, res) => {
    if (req.params.id === 'anime-catalogs-search') {
        const extra = req.params.extra ? qs.parse(req.url.split('/').pop().slice(0, -5)) : {}
        const search = extra.search
        res.redirect(307, 'https://anime-kitsu.strem.fun/catalog/anime/kitsu-anime-list/search=' + encodeURIComponent(search) + '.json')
        return
    }
    let catalogChoices
    if (req.params.catalogChoices) {
        try {
            catalogChoices = JSON.parse(req.params.catalogChoices)
        } catch(e) {
            catalogChoices = {}
        }
    }
    const onlyDub = !!catalogChoices['dubbed']
    const idParts = req.params.id.split('_')
    const lstType = idParts[0]
    const catType = idParts[1]
    const extra = req.params.extra ? qs.parse(req.url.split('/').pop().slice(0, -5)) : {}
    const skip = parseInt(extra.skip || 0)
    const genre = extra.genre
    if (services[lstType]) {
        resp = services[lstType].handle(catType, skip, genre, onlyDub)
        if (!resp) {
            res.writeHead(500)
            res.end(JSON.stringify({ err: 'catalog invalid response' }))
            return
        }
        if ((resp || {}).redirect) {
            res.redirect(307, resp.redirect)
            return
        }
        if (!resp.metas) {
            res.writeHead(500)
            res.end(JSON.stringify({ err: 'catalog empty response' }))
            return
        }

        // we use metahub otherwise as kitsu posters can break in time
        resp.metas = resp.metas.map(el => rpdb.convert(el, catalogChoices['rpdbkey']))

        let cacheHeaders = {
            cacheMaxAge: 'max-age',
            staleRevalidate: 'stale-while-revalidate',
            staleError: 'stale-if-error'
        }

        const cacheControl = Object.keys(cacheHeaders).map(prop => {
            const value = addonConfig[prop]
            if (!value) return false
            return cacheHeaders[prop] + '=' + value
        }).filter(val => !!val).join(', ')
        res.setHeader('Cache-control', `${cacheControl}, public`)
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(resp))
    } else {
        res.writeHead(500)
        res.end(JSON.stringify({ err: 'unknown list type' }))
    }
})

addon.get('/:catalogChoices/meta/:type/:id.json', (req, res) => {
    const metaType = req.params.type
    const metaId = req.params.id
    if ((metaId || '').startsWith('kitsu:')) {
        res.redirect(307, 'https://anime-kitsu.strem.fun/meta/' + metaType + '/' + encodeURIComponent(metaId) + '.json')
    } else {
        res.writeHead(500)
        res.end(JSON.stringify({ err: 'invalid meta id' }))
    }
})

const port = process.env.PORT || 7090

addon.listen(port, function() {
  console.log('Addon running on port ' + port)
})
