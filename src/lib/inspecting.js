const { normalizeUrl } = require('./request-utils');
const FetchMock = {};
const compileRoute = require('./compile-route');

FetchMock.filterCallsByName = function(name) {
	if (name === true) {
		return this._allCalls.filter(call => !call.unmatched);
	}
	if (name === false) {
		return this._allCalls.filter(call => call.unmatched);
	}

	if (typeof name === 'undefined') {
		return this._allCalls;
	}

	return this._allCalls.filter(call => call.name === name);
};


FetchMock.filterCallsByMatcher = function(matcher) {
	matcher = normalizeUrl(matcher);
	const calls = this._allCalls.filter(call => call.matcher === matcher);
	if (!calls.length) {
		return
	}
	return calls;
};

FetchMock.filterCallsWithRoute = function(name, options = {}, calls) {
	const matcher = compileRoute(
		Object.assign({ matcher: name, response: 'ok' }, options)
	).matcher;
	return (calls || this._allCalls).filter(([url, opts]) =>
		// HACK: add dummy response so that we can generate a matcher without
		// copileRoute's expectation that each route has a response defined
		matcher(normalizeUrl(url), opts)
	);
};

FetchMock.filterCalls = function(nameOrMatcher, options) {
	let calls;
	let hasName;
	if (
		typeof nameOrMatcher === 'boolean' ||
		typeof nameOrMatcher === 'undefined' ||
		(typeof nameOrMatcher === 'string' && /^[\da-z\-]+$/.test(nameOrMatcher))) {
		calls = this.filterCallsByName(nameOrMatcher);
		hasName = true;
	} else {
		calls = this.filterCallsByMatcher(nameOrMatcher);
	}

	if (options) {
		if (typeof options === 'string') {
			options = { method: options };
		}
		calls = this.filterCallsWithRoute(hasName ? '*' : nameOrMatcher, options, calls);
	}
	return calls || []
};

FetchMock.calls = function(name, options) {
	return this.filterCalls(name, options);
};

FetchMock.lastCall = function(name, options) {
	return [...this.filterCalls(name, options)].pop();
};

FetchMock.lastUrl = function(name, options) {
	return (this.lastCall(name, options) || [])[0];
};

FetchMock.lastOptions = function(name, options) {
	return (this.lastCall(name, options) || [])[1];
};

FetchMock.called = function(name, options) {
	return !!this.filterCalls(name, options).length;
};

FetchMock.flush = function(waitForResponseMethods) {
	const queuedPromises = this._holdingPromises;
	this._holdingPromises = [];

	return Promise.all(queuedPromises).then(() => {
		if (waitForResponseMethods && this._holdingPromises.length) {
			return this.flush(waitForResponseMethods);
		}
	});
};

FetchMock.done = function(name, options) {
	const names = name && typeof name !== 'boolean' ? [{ name }] : this.routes;

	// Can't use array.every because
	// a) not widely supported
	// b) would exit after first failure, which would break the logging
	return (
		names
			.map(({ name, method }) => {
				// HACK - this is horrible. When the api is eventually updated to update other
				// filters other than a method string it will break... but for now it's ok-ish
				method = options || method;

				if (!this.called(name, method)) {
					console.warn(`Warning: ${name} not called`); // eslint-disable-line
					return false;
				}

				// would use array.find... but again not so widely supported
				const expectedTimes = (this.routes.filter(
					r => r.name === name && r.method === method
				) || [{}])[0].repeat;
				if (!expectedTimes) {
					return true;
				}

				const actualTimes = this.filterCalls(name, method).length;
				if (expectedTimes > actualTimes) {
					console.warn(
						`Warning: ${name} only called ${actualTimes} times, but ${expectedTimes} expected`
					); // eslint-disable-line
					return false;
				} else {
					return true;
				}
			})
			.filter(bool => !bool).length === 0
	);
};

module.exports = FetchMock;
