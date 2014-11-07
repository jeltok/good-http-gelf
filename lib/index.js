// Load modules

var Util = require('util');
var Os = require('os');
var GoodReporter = require('good-reporter');
var Hoek = require('hoek');
var Stringify = require('json-stringify-safe');
var Wreck = require('wreck');
var Moment = require('moment');

// Declare internals

var internals = {
    defaults: {
        threshold: 20,
        schema: 'good-http-gelf',
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
    internals.defaults.endpoint = endpoint;

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
    if (this._eventQueue.length >= internals.defaults.threshold) {
        this._sendMessages();
        this._eventQueue.length = 0;
    }
};


internals.GoodHttpGelf.prototype._sendMessages = function () {

    if (!this._eventQueue.length) { return; }

    this._eventQueue.forEach(function(event) {

        var message = {
            version: '1.1',
            host: event.instance,
            level: event.event === 'error' ? 3 : 6,
            short_message: internals.formatEvent(event),
            timestamp: event.timestamp / 1000,
            _environment: process.env.NODE_ENV || 'dev',
            _event: event.event
        };

        var request = {};

        Hoek.merge(request, internals.defaults.wreck, false);

        request.payload = Stringify(message);

        // Prevent this from user tampering
        request.headers['content-type'] = 'application/json';

        //console.log("***************: "+request.payload);

        Wreck.post(internals.defaults.endpoint, request, function (err, res, payload) {
            if (err) {
                console.error(err);
            }
        });

    });

};

internals.formatEvent = function (eventData) {

    if (eventData.event === 'ops') {
        return internals.printEvent({
            timestamp: eventData.timestamp,
            tags: ['ops'],
            data: 'memory: ' + Math.round(eventData.proc.mem.rss / (1024 * 1024)) +
            'Mb, uptime (seconds): ' + eventData.proc.uptime +
            ', load: ' + eventData.os.load
        });
    }

    if (eventData.event === 'request') {
        var query = eventData.query ? Stringify(eventData.query) : '';
        //instance, method, path, query, statusCode, responseTime
        var data = Util.format('%s: %s %s %s %s (%sms)', eventData.instance, eventData.method, eventData.path, query, eventData.statusCode, eventData.responseTime);

        return internals.printEvent({
            timestamp: eventData.timestamp,
            tags: ['request'],
            data: data
        });

    }

    if (eventData.event === 'error') {
        return internals.printEvent({
            timestamp: eventData.timestamp,
            tags: ['error'],
            data: 'message: ' + eventData.message + ' stack: ' + eventData.stack
        });
    }

    return internals.printEvent({
        timestamp: eventData.timestamp,
        tags: ['log'],
        data: eventData
    });
};

internals.printEvent = function (event) {

    var data = event.data;
    if (typeof event.data === 'object' && event.data) {
        data = Stringify(event.data);
    }

    return event.tags[0] + ', ' + data;
};
