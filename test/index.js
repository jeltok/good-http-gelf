// Load modules

var EventEmitter = require('events').EventEmitter;
var Code = require('code');   // assertion library
var Lab = require('lab');
var lab = exports.lab = Lab.script();
var GoodHttpGelf = require('..');
var Hapi = require('hapi');

// Declare internals

var internals = {};

internals.isSorted = function (elements) {

    var i = 0;
    var il = elements.length;

    while (i < il && elements[i+1]) {

        if (elements[i].timestamp > elements[i+1].timestamp) {
            return false;
        }
        ++i;
    }
    return true;
};

internals.makeServer = function (handler) {

    var server = new Hapi.Server('127.0.0.1', 0);

    server.route({
        method: 'POST',
        path: '/',
        handler: handler
    });

    return server;
};

// Test shortcuts

var describe = lab.describe;
var it = lab.it;



it('throws an error without using new', function(done) {

    Code.expect(function () {

        var reporter = GoodHttpGelf('www.github.com');
    }).to.throw('GoodHttpGelf must be created with new');

    done();
});

it('throws an error if missing endpoint', function (done) {

    Code.expect(function () {

        var reporter = new GoodHttpGelf(null);
    }).to.throw('endpoint must be a string');

    done();
});

it('does not report if the event que is empty', function (done) {

    var reporter = new GoodHttpGelf('http://localhost:31337', { log: '*'}, { threshold: 5 });

    var result = reporter._sendMessages();
    Code.expect(result).to.not.exist;
    done();
});

describe('_report()', function () {

    it('honors the threshold setting and sends the events in a batch', function (done) {

        var hitCount = 0;
        var ee = new EventEmitter();
        var server = internals.makeServer(function (request, reply) {

            hitCount++;
            var payload = request.payload;
            var events = payload.events.log;

            Code.expect(request.headers['x-api-key']).to.equal('12345');
            Code.expect(payload.schema).to.equal('good-http');
            Code.expect(events.length).to.equal(5);

            if (hitCount === 1) {
                Code.expect(events[4].id).to.equal(4);
                Code.expect(events[4].event).to.equal('log');
                Code.reply();
            }

            if (hitCount === 2) {
                Code.expect(events[4].id).to.equal(9);
                Code.expect(events[4].event).to.equal('log');

                reply();
                done();
            }
        });

        server.start(function () {

            var reporter = new GoodHttpGelf(server.info.uri, { log: '*' }, {threshold: 5});

            reporter.start(ee, function (err) {

                Code.expect(err).to.not.exist;

                for (var i = 0; i < 10; ++i) {
                   ee.emit('report', 'log', {
                       id: i,
                       value: 'this is data for item ' + 1,
                       event: 'log'
                   });
                }
            });
        });
    });

    it('sends each event individually if threshold is 0', function (done) {

        var hitCount = 0;
        var ee = new EventEmitter();
        var server = internals.makeServer(function (request, reply) {

            hitCount++;
            var payload = request.payload;

            Code.expect(payload.events).to.exist;
            Code.expect(payload.events.log).to.exist;
            Code.expect(payload.events.log.length).to.equal(1);
            Code.expect(payload.events.log[0].id).to.equal(hitCount - 1);

            if (hitCount === 10) {
                done();
            }
            reply();
        });

        server.start(function () {

            var reporter = new GoodHttpGelf(server.info.uri, { log: '*' }, {
                threshold: 0
            });

            reporter.start(ee, function (err) {

                Code.expect(err).to.not.exist;

                for (var i = 0; i < 10; ++i) {
                    ee.emit('report', 'log', {
                        id: i,
                        value: 'this is data for item ' + 1,
                        event: 'log'
                    });
                }
            });
        });
    });

    it('sends the events in an envelop grouped by type and ordered by timestamp', function(done) {

        var hitCount = 0;
        var ee = new EventEmitter();
        var server = internals.makeServer(function (request, reply) {

            hitCount++;
            var payload = request.payload;
            var events = payload.events;

            Code.expect(request.headers['x-api-key']).to.equal('12345');
            Code.expect(payload.schema).to.equal('good-http');

            Code.expect(events.log).to.exist;
            Code.expect(events.request).to.exist;

            Code.expect(internals.isSorted(events.log)).to.equal(true);
            Code.expect(internals.isSorted(events.request)).to.equal(true);

            if (hitCount === 1) {
                Code.expect(events.log.length).to.equal(3);
                Code.expect(events.request.length).to.equal(2);
            }
            else if (hitCount === 2) {
                Code.expect(events.log.length).to.equal(2);
                Code.expect(events.request.length).to.equal(3);
                done();
            }
        });

        server.start(function () {

            var reporter = new GoodHttpGelf(server.info.uri, {
                log: '*',
                request: '*'
            }, {
                threshold: 5,
                wreck: {
                    headers: {
                        'x-api-key': 12345
                    }
                }
            });

            reporter.start(ee, function (err) {

                Code.expect(err).to.not.exist;

                for (var i = 0; i < 10; ++i) {

                    var eventType = i % 2 === 0 ? 'log' : 'request';

                    ee.emit('report', eventType, {
                        id: i,
                        value: 'this is data for item ' + 1,
                        timestamp: Math.floor(Date.now() + (Math.random() * 10000000000)),
                        event: eventType
                    });
                }
            });
        });
    });

    it('handles circular object references correctly', function (done) {

        var hitCount = 0;
        var ee = new EventEmitter();
        var server = internals.makeServer(function (request, reply) {

            hitCount++;
            var events = request.payload.events;

            Code.expect(events).to.exist;
            Code.expect(events.log).to.exist;
            Code.expect(events.log.length).to.equal(5);
            Code.expect(events.log[0]._data).to.equal('[Circular ~.events.log.0]');


            Code.expect(hitCount).to.equal(1);
            done();
        });

        server.start(function () {

            var reporter = new GoodHttpGelf(server.info.uri, { log: '*' }, {
                threshold: 5
            });

            reporter.start(ee, function (err) {

                Code.expect(err).to.not.exist;

                for (var i = 0; i < 5; ++i) {

                    var data = {
                        event: 'log',
                        timestamp: Date.now(),
                        id: i
                    };

                    data._data = data;

                    ee.emit('report', 'log', data);
                }
            });
        });
    });
});

describe('stop()', function () {

    it('makes a last attempt to send any remaining log entries', function (done) {

        var hitCount = 0;
        var ee = new EventEmitter();
        var server = internals.makeServer(function (request, reply) {

            hitCount++;
            var payload = request.payload;
            var events = payload.events;

            Code.expect(events.log).to.exist;
            Code.expect(events.log.length).to.equal(2);

            reply();
            done();
        });

        server.start(function () {

            var reporter = new GoodHttpGelf(server.info.uri, { log: '*' }, {
                threshold: 3,
                wreck: {
                    headers: {
                        'x-api-key': 12345
                    }
                }
            });

            reporter.start(ee, function (err) {

                Code.expect(err).to.not.exist;

                ee.emit('report', 'log', {
                    event: 'log',
                    timestamp: Date.now(),
                    id: 1
                });
                ee.emit('report', 'log', {
                    event: 'log',
                    timestamp: Date.now(),
                    id: 2
                });
            });

            reporter.stop();
        });
    });
});