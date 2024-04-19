const addonConfig = require('./config')

module.exports = {
	serialize: text => {
		return text.toLowerCase().split(' ').join('-')
	},
	log: (from, text) => {
		if (addonConfig.ignoreMappingLogs && from === 'mapping') return;
		if (addonConfig.ignoreDubbedLogs && from === 'dubbed') return;
		if (addonConfig.verbose)
			console.log('[' + from + '] ' + text)
	},
	needleDefaults: { open_timeout: 20000, read_timeout: 20000, response_timeout: 20000, follow_max: 2 },
	
}
