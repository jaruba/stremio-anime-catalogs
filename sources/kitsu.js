const helpers = require('../helpers')

const config = {
    lists: {
        'Top Airing': 'https://anime-kitsu.strem.fun/catalog/anime/kitsu-anime-airing',
        'Most Popular': 'https://anime-kitsu.strem.fun/catalog/anime/kitsu-anime-popular',
        'Highest Rated': 'https://anime-kitsu.strem.fun/catalog/anime/kitsu-anime-rating',
        'Newest': 'https://anime-kitsu.strem.fun/catalog/anime/kitsu-anime-newest',
    }
}

module.exports = {
    name: 'Kitsu',
	catalogs: Object.keys(config.lists),
    handle: (listKey, skip, genre) => {
        let catalogUrl
        Object.keys(config.lists).some(key => {
            if (helpers.serialize(key) === listKey) {
                catalogUrl = config.lists[key]
            }
        })
        if (!catalogUrl) {
            return false
        }
        const queries = []
        if (genre)
            queries.push('genre=' + genre)
        if (skip)
            queries.push('skip=' + skip)
        return { redirect: catalogUrl + (queries.length ? '/' + queries.join('&') : '') + '.json' }
    }
}