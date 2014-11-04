// Load modules

var Os = require('os');
var GoodReporter = require('good-reporter');
var Hoek = require('hoek');
var Stringify = require('json-stringify-safe');
var Wreck = require('wreck');

// Declare internals

var internals = {
    defaults: {
        threshold: 20,
        schema: 'good-http',
        wreck: {
            timeout: 60000,
            headers: {}
        }
    },
    host: Os.hostname()
};


internals.createEventMap = function (events) {

    var eventTypes = ['error', 'ops', 'request', 'log'];
    var result = {};

    eventTypes.forEach(function (event) {

        var filter = events.filter(function (item) {
            return item.event === event;
        });

        // Sort the events oldest > newest
        filter.sort(function (a, b) {

            return a.timestamp - b.timestamp;
        });

        if (filter.length) {
            result[event] = filter;
        }
    });

    return result;
};


module.exports = internals.GoodHttpGelf = function (endpoint, events, options) {

    Hoek.assert(this.constructor === internals.GoodHttpGelf, 'GoodHttpGelf must be created with new');
    Hoek.assert(typeof endpoint === 'string', 'endpoint must be a string');

    var settings = Hoek.applyToDefaults(internals.defaults, options);
    settings.endpoint = endpoint;

    GoodReporter.call(this, events, settings);
    this._eventQueue = [];
};


Hoek.inherits(internals.GoodHttpGelf, GoodReporter);


internals.GoodHttpGelf.prototype.start = function (emitter, callback) {

    emitter.on('report', this._handleEvent.bind(this));
    return callback(null);
};


internals.GoodHttpGelf.prototype.stop = function () {

    this._sendMessages();
};


internals.GoodHttpGelf.prototype._report = function (event, eventData) {

    this._eventQueue.push(eventData);
    if (this._eventQueue.length >= this._settings.threshold) {
        this._sendMessages();
        this._eventQueue.length = 0;
    }
};


internals.GoodHttpGelf.prototype._sendMessages = function () {

    if (!this._eventQueue.length) { return; }

    this._eventQueue.forEach(event) {

        var message = {
            version: '1.1',
            host: internals.host,
            short_message: event.event,
            full_message: event,
            timestamp: Date.now(),
            level: 1
        };

        var wreckOptions = {
            payload: Stringify(message)
        };

        Hoek.merge(wreckOptions, this._settings.wreck, false);

        // Prevent this from user tampering
        wreckOptions.headers['content-type'] = 'application/json';

        Wreck.request('post', this._settings.endpoint, wreckOptions);
    }


};